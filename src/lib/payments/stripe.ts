import Stripe from "stripe";
import { toMinor } from "@/lib/money";

let client: Stripe | null = null;
export function stripe() {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/**
 * Crée une session Stripe Checkout.
 * Sans "payment_method_types", Stripe affiche dynamiquement les moyens activés
 * dans votre Dashboard (cartes, Apple Pay, Google Pay, PayPal...).
 */
export async function createStripeSession(args: {
  orderId: string;
  title: string;
  amount: number;
  currency: string;
  email: string;
  appUrl: string;
  successUrl: string;
}) {
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: args.email,
    client_reference_id: args.orderId,
    metadata: { order_id: args.orderId },
    payment_intent_data: { metadata: { order_id: args.orderId } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: toMinor(args.amount, args.currency),
          product_data: { name: args.title },
        },
      },
    ],
    success_url: args.successUrl,
    cancel_url: `${args.appUrl}/checkout/cancelled`,
  });
  return { id: session.id, url: session.url! };
}
