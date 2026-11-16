import { explain, explainPaymentError } from "@/lib/errors";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { initiatePay } from "@/lib/fapshi";
import { appUrl } from "@/lib/env";
import { initiateFlutterwave } from "@/lib/flutterwave";
import { createCryptoInvoice } from "@/lib/nowpayments";
import { enabledProviders, isProvider, REF_PREFIX, type PaymentProvider } from "@/lib/payments";
import { asRow } from "@/lib/db";
import { dbErrorMessage } from "@/lib/labels";
import { cleanText, isEmail, isReferralCode, isUuid } from "@/lib/validate";
import { sendSellerNewOrderEmail } from "@/lib/email";
import { DELIVERY_LABELS } from "@/lib/labels";
import type { DeliveryMethod, PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_METHODS: readonly string[] = ["pickup_douala", "delivery_douala", "shipping_cameroon"];

interface CheckoutInput {
  provider: PaymentProvider;
  productId: string;
  email: string;
  name: string;
  quantity: number;
  deliveryMethod: DeliveryMethod | null;
  address: string;
  phone: string;
  paymentMethod: PaymentMethod;
}

interface CreatedOrder {
  order_id: string;
  transaction_id: string;
  download_token: string;
  total: number;
  title: string;
  product_type: string;
}

function parseInput(raw: unknown): CheckoutInput | null {
  if (raw === null || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!isUuid(b.productId)) return null;
  const email = cleanText(b.email, 254).toLowerCase();
  if (!isEmail(email)) return null;
  const quantity = typeof b.quantity === "number" ? b.quantity : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  const deliveryMethod =
    typeof b.deliveryMethod === "string" && DELIVERY_METHODS.includes(b.deliveryMethod)
      ? (b.deliveryMethod as DeliveryMethod)
      : null;
  return {
    productId: b.productId,
    email,
    name: cleanText(b.name, 100),
    quantity,
    deliveryMethod,
    address: cleanText(b.address, 300),
    phone: cleanText(b.phone, 20),
    paymentMethod: b.paymentMethod === "cod" ? "cod" : "online",
    provider: isProvider(b.provider) ? b.provider : "fapshi",
  };
}

/**
 * POST /api/checkout
 * 1) la base crée la commande + la transaction (prix, stock et livraison relus côté serveur, jamais depuis le navigateur)
 * 2) Fapshi crée le lien de paiement
 * 3) on renvoie ce lien : l'acheteur y paie en Mobile Money, puis revient sur /download/[token]
 */
export async function POST(req: Request): Promise<NextResponse> {
  const input = parseInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: explain("Une information du formulaire est manquante ou mal remplie (email, téléphone, adresse ou quantité).", "Relisez chaque champ, corrigez-le et validez à nouveau.") }, { status: 400 });

  const { data: auth } = await createClient().auth.getUser();
  const user = auth.user;

  // Code d'affilié mémorisé 30 jours par le middleware (cookie aff_ref)
  const refCookie = cookies().get("aff_ref")?.value;
  const refCode = isReferralCode(refCookie) ? refCookie : null;

  const db = createAdminClient();
  const { data, error } = await db.rpc("create_checkout_order", {
    p_product_id: input.productId,
    p_buyer_id: user?.id ?? null,
    p_email: input.email,
    p_name: input.name || null,
    p_quantity: input.quantity,
    p_delivery_method: input.deliveryMethod,
    p_address: input.address || null,
    p_phone: input.phone || null,
    p_ref_code: refCode,
    p_payment_method: input.paymentMethod,
  });
  if (error) return NextResponse.json({ error: dbErrorMessage(error.message) }, { status: 400 });

  const order = asRow<CreatedOrder>(data);
  if (!order) return NextResponse.json({ error: explain("La commande n'a pas pu être enregistrée par le serveur.", "Réessayez dans un instant. Aucun paiement n'a été effectué.") }, { status: 500 });

  // Paiement à la livraison (produits physiques seulement, contrôlé par la base) : rien à payer en ligne.
  if (input.paymentMethod === "cod") {
    await notifySellerOfCashOrder(db, input, order.order_id);
    return NextResponse.json({ url: `${appUrl()}/download/${order.download_token}` });
  }

  // Autres moyens de paiement : uniquement s'ils sont activés (clés présentes sur Vercel)
  if (input.provider !== "fapshi" && !enabledProviders().includes(input.provider)) {
    await db.from("transactions").update({ status: "failed", fapshi_status: "FAILED" }).eq("id", order.transaction_id);
    await db.from("orders").update({ payment_status: "failed" }).eq("id", order.order_id);
    return NextResponse.json({ error: explain("Ce moyen de paiement n'est pas encore activé sur le site.", "Choisissez un autre moyen de paiement. Aucun argent n'a été débité.") }, { status: 400 });
  }

  if (input.provider === "flutterwave" || input.provider === "crypto") {
    try {
      const back = `${appUrl()}/download/${order.download_token}`;
      let ref: string;
      let link: string;
      if (input.provider === "flutterwave") {
        const txRef = order.order_id;
        const pay = await initiateFlutterwave({ txRef, amountFcfa: order.total, email: input.email, name: input.name, redirectUrl: back, title: order.title });
        ref = `${REF_PREFIX.flutterwave}${txRef}`;
        link = pay.link;
      } else {
        const inv = await createCryptoInvoice({
          orderId: order.order_id,
          amountFcfa: order.total,
          title: order.title,
          successUrl: back,
          cancelUrl: `${appUrl()}/p/${input.productId}`,
          ipnUrl: `${appUrl()}/api/webhook/crypto`,
        });
        ref = `${REF_PREFIX.crypto}${inv.invoiceId}`;
        link = inv.link;
      }
      const { error: saveError } = await db
        .from("transactions")
        .update({ fapshi_trans_id: ref, fapshi_link: link, fapshi_status: "CREATED" })
        .eq("id", order.transaction_id);
      if (saveError) throw new Error(saveError.message);
      return NextResponse.json({ url: link });
    } catch (e) {
      console.error("[checkout] fournisseur indisponible", input.provider, e instanceof Error ? e.message : e);
      await db.from("transactions").update({ status: "failed", fapshi_status: "FAILED" }).eq("id", order.transaction_id);
      await db.from("orders").update({ payment_status: "failed" }).eq("id", order.order_id);
      return NextResponse.json({ error: explainPaymentError(e) }, { status: 502 });
    }
  }

  try {
    const pay = await initiatePay({
      amount: order.total,
      email: input.email,
      redirectUrl: `${appUrl()}/download/${order.download_token}`,
      userId: user?.id ?? order.order_id,
      externalId: order.order_id,
      message: order.title,
    });
    const { error: saveError } = await db
      .from("transactions")
      .update({ fapshi_trans_id: pay.transId, fapshi_link: pay.link, fapshi_status: "CREATED" })
      .eq("id", order.transaction_id);
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ url: pay.link });
  } catch (e) {
    console.error("[checkout] Fapshi indisponible", e instanceof Error ? e.message : e);
    await db.from("transactions").update({ status: "failed", fapshi_status: "FAILED" }).eq("id", order.transaction_id);
    await db.from("orders").update({ payment_status: "failed" }).eq("id", order.order_id);
    return NextResponse.json({ error: explainPaymentError(e) }, { status: 502 });
  }
}

/** Prévient le vendeur par email d'une commande en cash (l'échec de l'email ne bloque jamais la commande). */
async function notifySellerOfCashOrder(db: ReturnType<typeof createAdminClient>, input: CheckoutInput, orderId: string): Promise<void> {
  try {
    const { data: o } = await db.from("orders").select("seller_id, product_id, quantity, delivery_method").eq("id", orderId).maybeSingle();
    const order = asRow<{ seller_id: string; product_id: string; quantity: number; delivery_method: DeliveryMethod | null }>(o);
    if (!order || !order.delivery_method) return;
    const { data: p } = await db.from("products").select("title").eq("id", order.product_id).maybeSingle();
    const { data: seller } = await db.auth.admin.getUserById(order.seller_id);
    const to = seller.user?.email;
    if (!to) return;
    await sendSellerNewOrderEmail({
      to,
      productTitle: asRow<{ title: string }>(p)?.title ?? "Produit",
      quantity: order.quantity,
      deliveryLabel: DELIVERY_LABELS[order.delivery_method],
      buyerName: input.name || null,
      buyerPhone: input.phone || null,
      address: input.address || null,
      dashboardUrl: `${appUrl()}/dashboard/orders`,
      cash: true,
    });
  } catch (e) {
    console.error("[checkout] email vendeur (cash) non envoyé", e instanceof Error ? e.message : e);
  }
}
