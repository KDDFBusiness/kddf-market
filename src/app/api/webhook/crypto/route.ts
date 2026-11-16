// IPN NOWPayments : POST /api/webhook/crypto
// Dashboard NOWPayments > Store Settings > IPN secret = NOWPAYMENTS_IPN_SECRET. L'URL est envoyée à chaque facture.
// Sécurité : 1) signature HMAC-SHA512 vérifiée, 2) paiement relu chez NOWPayments, 3) commande retrouvée par notre order_id,
// 4) le montant en EUR doit être exactement celui calculé à la création. Répond toujours 200.
import { NextResponse } from "next/server";
import { getCryptoPayment, isValidIpnSignature, fcfaToEur } from "@/lib/nowpayments";
import { syncFapshiTransaction } from "@/lib/fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow } from "@/lib/db";
import { REF_PREFIX } from "@/lib/payments";
import { isUuid } from "@/lib/validate";
import type { FapshiStatus } from "@/lib/fapshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OK = (): NextResponse => NextResponse.json({ received: true }, { status: 200 });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!isValidIpnSignature(body, req.headers.get("x-nowpayments-sig"))) {
      console.warn("[crypto-webhook] signature invalide ou absente : requête ignorée");
      return OK();
    }
    const paymentId = body !== null && typeof body === "object" && "payment_id" in body ? String((body as { payment_id: unknown }).payment_id) : "";
    if (!paymentId) return OK();

    const pay = await getCryptoPayment(paymentId); // relecture chez NOWPayments
    if (!isUuid(pay.orderId)) return OK();

    const db = createAdminClient();
    const { data } = await db.from("transactions").select("fapshi_trans_id, total_amount").eq("order_id", pay.orderId).maybeSingle();
    const tx = asRow<{ fapshi_trans_id: string | null; total_amount: number }>(data);
    if (!tx || !tx.fapshi_trans_id || !tx.fapshi_trans_id.startsWith(REF_PREFIX.crypto)) return OK();

    let status: FapshiStatus = "PENDING";
    if (pay.status === "finished") status = "SUCCESSFUL";
    else if (pay.status === "failed" || pay.status === "expired" || pay.status === "refunded") status = "FAILED";

    // Le montant en EUR doit correspondre exactement à celui demandé ; sinon on force un montant faux -> commande "à vérifier"
    const amountOk = Math.abs(pay.priceAmount - fcfaToEur(tx.total_amount)) < 0.005;
    const result = await syncFapshiTransaction(tx.fapshi_trans_id, {
      source: "webhook",
      minAgeSeconds: 0,
      remote: { transId: tx.fapshi_trans_id, status, amount: amountOk ? tx.total_amount : -1, revenue: null, medium: `crypto ${pay.payCurrency ?? ""}`.trim(), externalId: pay.orderId },
    });
    console.log("[crypto-webhook]", paymentId, pay.status, "| résultat :", result);
  } catch (e) {
    console.error("[crypto-webhook] erreur interne :", e instanceof Error ? e.message : e);
  }
  return OK();
}
