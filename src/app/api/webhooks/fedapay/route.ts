import { NextResponse } from "next/server";
import { fetchFedaPayTransaction, verifyFedaPaySignature } from "@/lib/payments/fedapay";
import { markOrderPaid, markOrderFailed } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyFedaPaySignature(raw, req.headers.get("x-fedapay-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  const txId = event?.entity?.id;
  if (!txId) return NextResponse.json({ received: true });

  // Revérification auprès de FedaPay (source de vérité)
  const tx = await fetchFedaPayTransaction(String(txId));
  const orderId = tx.custom_metadata?.order_id;
  if (!orderId) return NextResponse.json({ received: true });

  if (tx.status === "approved") {
    await markOrderPaid(orderId, { provider: "fedapay", reference: String(tx.id) });
  } else if (["declined", "canceled", "refunded"].includes(tx.status)) {
    await markOrderFailed(orderId);
  }
  return NextResponse.json({ received: true });
}
