// Client Flutterwave (API v3) : cartes (Visa, Mastercard, Amex) + Mobile Money élargi.
//   POST /v3/payments                          -> lien de paiement hébergé
//   GET  /v3/transactions/verify_by_reference  -> statut réel d'un paiement (on ne croit jamais le webhook)
//   Webhook : l'en-tête "verif-hash" doit être égal à FLW_SECRET_HASH (secret choisi par vous dans le dashboard).
import { timingSafeEqual } from "crypto";
import type { FapshiTransaction } from "@/lib/fapshi";

export class FlutterwaveError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FlutterwaveError";
    this.status = status;
  }
}

const BASE = "https://api.flutterwave.com/v3";

function secret(): string {
  const k = process.env.FLW_SECRET_KEY;
  if (!k) throw new Error("FLW_SECRET_KEY manquant dans les variables d'environnement");
  return k;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function call(path: string, init: RequestInit): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json: isRecord(json) ? json : null };
}

export async function initiateFlutterwave(args: {
  txRef: string;
  amountFcfa: number;
  email: string;
  name: string;
  redirectUrl: string;
  title: string;
}): Promise<{ link: string }> {
  const { status, json } = await call("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: args.txRef,
      amount: args.amountFcfa,
      currency: "XAF",
      redirect_url: args.redirectUrl,
      customer: { email: args.email, name: args.name || args.email },
      customizations: { title: args.title.slice(0, 60) },
    }),
  });
  const data = json && isRecord(json.data) ? json.data : null;
  if (status < 200 || status >= 300 || !data || typeof data.link !== "string") {
    const msg = json && typeof json.message === "string" ? json.message : `Erreur HTTP ${status}`;
    throw new FlutterwaveError(msg, status);
  }
  return { link: data.link };
}

/** Statut réel d'un paiement, au format commun avec Fapshi. Un paiement introuvable = pas encore tenté = PENDING. */
export async function getFlutterwaveStatus(txRef: string): Promise<FapshiTransaction> {
  const { status, json } = await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, { method: "GET" });
  const pending: FapshiTransaction = { transId: `flw:${txRef}`, status: "PENDING", amount: 0, revenue: null, medium: null, externalId: txRef };
  if (status === 404) return pending;
  if (status < 200 || status >= 300) throw new FlutterwaveError(json && typeof json.message === "string" ? json.message : `Erreur HTTP ${status}`, status);
  const data = json && isRecord(json.data) ? json.data : null;
  if (!data) return pending;
  const st = typeof data.status === "string" ? data.status.toLowerCase() : "";
  const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : "";
  const amount = typeof data.amount === "number" ? Math.round(data.amount) : Number(data.amount);
  const net = typeof data.amount_settled === "number" ? Math.round(data.amount_settled) : null;
  const medium = typeof data.payment_type === "string" ? `flutterwave ${data.payment_type}` : "flutterwave";
  // Un paiement réussi dans une AUTRE devise que le FCFA n'est jamais validé automatiquement (montant volontairement faux -> "à vérifier")
  const okAmount = currency === "XAF" && Number.isFinite(amount) ? amount : -1;
  if (st === "successful") return { ...pending, status: "SUCCESSFUL", amount: okAmount, revenue: net, medium };
  if (st === "failed" || st === "cancelled") return { ...pending, status: "FAILED", medium };
  return pending;
}

export function isValidFlutterwaveHash(header: string | null): boolean {
  const expected = process.env.FLW_SECRET_HASH;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
