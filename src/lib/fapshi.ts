// Client Fapshi, écrit d'après la documentation officielle (docs.fapshi.com) :
//   POST /initiate-pay           -> crée un lien de paiement  { amount, email?, redirectUrl?, userId?, externalId?, message? }
//                                   réponse : { message, link, transId, dateInitiated }
//   GET  /payment-status/{id}    -> statut d'un paiement (6 requêtes/minute maximum par transId)
//   Webhook : POST vers notre URL, corps identique à payment-status, secret optionnel dans l'en-tête x-wh-secret
// Authentification : en-têtes "apiuser" et "apikey". URLs : sandbox.fapshi.com (test) / live.fapshi.com (réel).
import { timingSafeEqual } from "crypto";

export type FapshiStatus = "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";

export interface FapshiPayLink {
  link: string;
  transId: string;
}

export interface FapshiTransaction {
  transId: string;
  status: FapshiStatus;
  amount: number;
  revenue: number | null; // montant reçu après les frais Fapshi (3 %)
  medium: string | null; // "mobile money" | "orange money"
  externalId: string | null;
}

export class FapshiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FapshiError";
    this.status = status;
  }
}

const STATUSES: readonly string[] = ["CREATED", "PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"];

/**
 * Tolérant : la doc parle de SUCCESSFUL, mais on accepte aussi SUCCESS et PAID.
 * Un statut totalement inconnu est traité comme "PENDING" (on ne valide jamais un paiement par erreur).
 */
export function normalizeStatus(raw: string): FapshiStatus {
  const s = raw.trim().toUpperCase();
  if (s === "SUCCESSFUL" || s === "SUCCESS" || s === "PAID") return "SUCCESSFUL";
  if (STATUSES.includes(s)) return s as FapshiStatus;
  console.warn(`[fapshi] statut inconnu "${raw}" : traité comme PENDING`);
  return "PENDING";
}

function baseUrl(): string {
  return process.env.FAPSHI_ENV === "live" ? "https://live.fapshi.com" : "https://sandbox.fapshi.com";
}

function authHeaders(): Record<string, string> {
  const apiuser = process.env.FAPSHI_API_USER;
  const apikey = process.env.FAPSHI_API_KEY;
  if (!apiuser || !apikey) throw new Error("FAPSHI_API_USER ou FAPSHI_API_KEY manquant dans les variables d'environnement");
  return { apiuser, apikey, "Content-Type": "application/json" };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function fapshiRequest(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = isRecord(json) && typeof json.message === "string" ? json.message : `Erreur HTTP ${res.status}`;
    throw new FapshiError(msg, res.status);
  }
  if (!isRecord(json)) throw new FapshiError("Réponse Fapshi illisible", res.status);
  return json;
}

/** Crée un lien de paiement. L'acheteur y choisit MTN MoMo ou Orange Money, puis revient sur redirectUrl. */
export async function initiatePay(args: {
  amount: number; // entier FCFA, minimum 100
  email: string;
  redirectUrl: string;
  userId: string; // lettres, chiffres, - et _ seulement (100 max)
  externalId: string; // idem : on y met l'id de notre commande
  message: string;
}): Promise<FapshiPayLink> {
  if (!Number.isSafeInteger(args.amount) || args.amount < 100) throw new Error("Montant invalide pour Fapshi (entier, minimum 100)");
  const json = await fapshiRequest("/initiate-pay", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      email: args.email,
      redirectUrl: args.redirectUrl,
      userId: args.userId,
      externalId: args.externalId,
      message: args.message.slice(0, 200),
    }),
  });
  if (typeof json.link !== "string" || typeof json.transId !== "string") {
    throw new FapshiError("Réponse Fapshi inattendue (link ou transId manquant)", 200);
  }
  return { link: json.link, transId: json.transId };
}

/** Statut réel d'un paiement, lu directement chez Fapshi (source de vérité). */
export async function getPaymentStatus(transId: string): Promise<FapshiTransaction> {
  const json = await fapshiRequest(`/payment-status/${encodeURIComponent(transId)}`, { method: "GET" });
  if (typeof json.transId !== "string" || typeof json.status !== "string") {
    throw new FapshiError("Réponse de statut Fapshi inattendue", 200);
  }
  if (typeof json.amount !== "number") throw new FapshiError("Montant absent de la réponse Fapshi", 200);
  return {
    transId: json.transId,
    status: normalizeStatus(json.status),
    amount: json.amount,
    revenue: typeof json.revenue === "number" ? json.revenue : null,
    medium: typeof json.medium === "string" ? json.medium : null,
    externalId: typeof json.externalId === "string" ? json.externalId : null,
  };
}

/**
 * Vérifie l'en-tête x-wh-secret (le secret est renvoyé tel quel par Fapshi, ce n'est pas une signature).
 * Si aucun secret n'est configuré, on accepte : de toute façon chaque paiement est revérifié chez Fapshi
 * avant d'être validé (voir fulfillment.ts), donc un faux webhook ne peut rien valider.
 */
export function isValidWebhookSecret(header: string | null): boolean {
  const expected = process.env.FAPSHI_WEBHOOK_SECRET;
  if (!expected) return true;
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
