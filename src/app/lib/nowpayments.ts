// Client NOWPayments (cryptomonnaies : USDT, BTC, ETH…).
//   POST /v1/invoice        -> page de paiement hébergée (le client choisit sa crypto)
//   GET  /v1/payment/{id}   -> relecture d'un paiement après l'IPN
//   IPN (webhook) : en-tête x-nowpayments-sig = HMAC-SHA512 du corps JSON (clés triées) avec NOWPAYMENTS_IPN_SECRET.
// Le prix catalogue est en FCFA : on le convertit en EUR avec la parité fixe officielle 1 EUR = 655,957 FCFA.
import { createHmac, timingSafeEqual } from "crypto";

export const XAF_PER_EUR = 655.957;

/** Montant en EUR (2 décimales, arrondi au-dessus pour ne jamais encaisser moins). */
export function fcfaToEur(fcfa: number): number {
  return Math.ceil((fcfa / XAF_PER_EUR) * 100) / 100;
}

export class NowPaymentsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "NowPaymentsError";
    this.status = status;
  }
}

function base(): string {
  return process.env.NOWPAYMENTS_ENV === "sandbox" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1";
}

function apiKey(): string {
  const k = process.env.NOWPAYMENTS_API_KEY;
  if (!k) throw new Error("NOWPAYMENTS_API_KEY manquant dans les variables d'environnement");
  return k;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function createCryptoInvoice(args: {
  orderId: string;
  amountFcfa: number;
  title: string;
  successUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}): Promise<{ invoiceId: string; link: string }> {
  const res = await fetch(`${base()}/invoice`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount: fcfaToEur(args.amountFcfa),
      price_currency: "eur",
      order_id: args.orderId,
      order_description: args.title.slice(0, 100),
      ipn_callback_url: args.ipnUrl,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(json) || (typeof json.id !== "string" && typeof json.id !== "number") || typeof json.invoice_url !== "string") {
    const msg = isRecord(json) && typeof json.message === "string" ? json.message : `Erreur HTTP ${res.status}`;
    throw new NowPaymentsError(msg, res.status);
  }
  return { invoiceId: String(json.id), link: json.invoice_url };
}

export interface CryptoPayment {
  paymentId: string;
  status: string; // waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired
  orderId: string | null;
  invoiceId: string | null;
  priceAmount: number;
  payCurrency: string | null;
}

/** Relit un paiement chez NOWPayments (ne jamais croire le corps de l'IPN seul). */
export async function getCryptoPayment(paymentId: string): Promise<CryptoPayment> {
  const res = await fetch(`${base()}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(json)) throw new NowPaymentsError(isRecord(json) && typeof json.message === "string" ? json.message : `Erreur HTTP ${res.status}`, res.status);
  const str = (v: unknown): string | null => (typeof v === "string" || typeof v === "number" ? String(v) : null);
  return {
    paymentId: str(json.payment_id) ?? paymentId,
    status: str(json.payment_status) ?? "",
    orderId: str(json.order_id),
    invoiceId: str(json.invoice_id),
    priceAmount: Number(json.price_amount),
    payCurrency: str(json.pay_currency),
  };
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isRecord(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** Vérifie la signature de l'IPN (HMAC-SHA512 du JSON trié). */
export function isValidIpnSignature(body: unknown, header: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
  const a = Buffer.from(header.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
