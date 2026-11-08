import { NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { markOrderPaid, markOrderFailed } from "@/lib/fulfillment";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text(); // corps brut indispensable pour la signature
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const obj: any = event.data.object;
  const orderId = obj.metadata?.order_id || obj.client_reference_id;

  if (orderId) {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (obj.payment_status === "paid") {
        await markOrderPaid(orderId, { provider: "stripe", reference: obj.id });
      }
    } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      await markOrderFailed(orderId);
    }
  }
  return NextResponse.json({ received: true });
}
