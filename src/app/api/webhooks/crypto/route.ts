import { NextResponse } from "next/server";
import { verifyNowPaymentsSignature } from "@/lib/payments/crypto";
import { markOrderPaid, markOrderFailed } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !verifyNowPaymentsSignature(body, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const orderId = body.order_id as string | undefined;
  if (orderId) {
    // "finished" = fonds confirmés et reçus. "confirmed"/"sending" ne suffisent pas.
    if (body.payment_status === "finished") {
      await markOrderPaid(orderId);
    } else if (["failed", "expired", "refunded"].includes(body.payment_status)) {
      await markOrderFailed(orderId);
    }
  }
  return NextResponse.json({ received: true });
}
