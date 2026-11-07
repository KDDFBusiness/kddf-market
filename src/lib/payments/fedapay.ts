import crypto from "crypto";

const base = () =>
  process.env.FEDAPAY_ENV === "live" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`FedaPay ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function createFedaPayTransaction(args: {
  orderId: string;
  title: string;
  amount: number; // en XOF, entier
  email: string;
  name?: string;
  callbackUrl: string;
}) {
  const [firstname, ...rest] = (args.name || args.email.split("@")[0]).split(" ");
  const created = await call("/transactions", {
    method: "POST",
    body: JSON.stringify({
      description: args.title,
      amount: Math.round(args.amount),
      currency: { iso: "XOF" },
      callback_url: args.callbackUrl,
      custom_metadata: { order_id: args.orderId },
      customer: { firstname, lastname: rest.join(" ") || firstname, email: args.email },
    }),
  });
  const tx = created["v1/transaction"] ?? created.transaction ?? created;
  const tokenRes = await call(`/transactions/${tx.id}/token`, { method: "POST" });
  return { id: String(tx.id), url: tokenRes.url as string };
}

/** Relit la transaction chez FedaPay : on ne fait jamais confiance au corps du webhook seul */
export async function fetchFedaPayTransaction(id: string) {
  const json = await call(`/transactions/${id}`);
  const tx = json["v1/transaction"] ?? json.transaction ?? json;
  return tx as { id: number; status: string; custom_metadata?: { order_id?: string } };
}

/** En-tête X-FEDAPAY-SIGNATURE au format "t=<timestamp>,s=<hmac sha256>" */
export function verifyFedaPaySignature(payload: string, header: string | null) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.t || !parts.s) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
