import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { convert, roundMoney } from "@/lib/currency";
import { chargeCurrencyFor, getMethod } from "@/lib/payments/methods";
import { createStripeSession } from "@/lib/payments/stripe";
import { createFedaPayTransaction } from "@/lib/payments/fedapay";
import { createCryptoInvoice } from "@/lib/payments/crypto";

/**
 * POST /api/checkout
 * body: { productId, methodId, currency, email, name }
 * Crée la commande, convertit le prix au taux du jour, puis renvoie l'URL de paiement du prestataire.
 * Le prix est TOUJOURS relu en base : on ne fait jamais confiance au montant envoyé par le navigateur.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.productId || !body?.methodId || !body?.email) {
    return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
  }
  const email = String(body.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const method = getMethod(body.methodId);
  if (!method) return NextResponse.json({ error: "Moyen de paiement inconnu" }, { status: 400 });

  const db = createAdminClient();
  const { data: product } = await db
    .from("products")
    .select("id, creator_id, title, price_amount, price_currency, is_published, affiliate_enabled, affiliate_percent")
    .eq("id", body.productId)
    .maybeSingle();
  if (!product || !product.is_published) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  // Affiliation (cookie posé par le middleware) — un créateur ne peut pas se parrainer lui-même
  let affiliateId: string | null = null;
  let affiliateFee = 0;
  const ref = cookies().get("aff_ref")?.value;
  if (ref && product.affiliate_enabled) {
    const { data: aff } = await db
      .from("affiliates")
      .select("id, user_id")
      .eq("code", ref)
      .eq("creator_id", product.creator_id)
      .maybeSingle();
    if (aff && aff.user_id !== product.creator_id) {
      affiliateId = aff.id;
      affiliateFee = roundMoney((Number(product.price_amount) * Number(product.affiliate_percent)) / 100, product.price_currency);
    }
  }

  const feePct = Number(process.env.PLATFORM_FEE_PERCENT ?? 5);
  const platformFee = roundMoney((Number(product.price_amount) * feePct) / 100, product.price_currency);

  // Conversion en temps réel vers la devise du prestataire
  const buyerCurrency = String(body.currency || product.price_currency).toUpperCase();
  const chargeCurrency = chargeCurrencyFor(method.provider, buyerCurrency);
  let charged: { amount: number; rate: number };
  try {
    charged = await convert(Number(product.price_amount), product.price_currency, chargeCurrency);
  } catch {
    return NextResponse.json({ error: "Taux de change indisponible, réessayez." }, { status: 502 });
  }
  if (charged.amount <= 0) return NextResponse.json({ error: "Montant invalide" }, { status: 400 });

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: order, error } = await db
    .from("orders")
    .insert({
      product_id: product.id,
      creator_id: product.creator_id,
      buyer_id: auth.user?.id ?? null,
      buyer_email: email,
      buyer_name: body.name || null,
      affiliate_id: affiliateId,
      amount: product.price_amount,
      currency: product.price_currency,
      charged_amount: charged.amount,
      charged_currency: chargeCurrency,
      fx_rate: charged.rate,
      platform_fee: platformFee,
      affiliate_fee: affiliateFee,
    })
    .select("id, download_token")
    .single();
  if (error || !order) return NextResponse.json({ error: "Création de commande impossible" }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const successUrl = `${appUrl}/download/${order.download_token}`;

  try {
    let result: { id: string; url: string };
    if (method.provider === "stripe") {
      result = await createStripeSession({
        orderId: order.id, title: product.title, amount: charged.amount,
        currency: chargeCurrency, email, appUrl, successUrl,
      });
    } else if (method.provider === "fedapay") {
      result = await createFedaPayTransaction({
        orderId: order.id, title: product.title, amount: charged.amount,
        email, name: body.name, callbackUrl: successUrl,
      });
    } else {
      result = await createCryptoInvoice({
        orderId: order.id, methodId: method.id, title: product.title,
        amountUsd: charged.amount, appUrl, successUrl,
      });
    }

    await db.from("payments").insert({
      order_id: order.id,
      provider: method.provider,
      method: method.id,
      provider_reference: result.id,
      checkout_url: result.url,
    });

    return NextResponse.json({ url: result.url, orderId: order.id });
  } catch (e: any) {
    console.error("checkout error", e);
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    return NextResponse.json({ error: "Le prestataire de paiement est indisponible." }, { status: 502 });
  }
}
