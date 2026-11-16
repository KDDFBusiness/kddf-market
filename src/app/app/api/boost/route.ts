import { explain, explainPaymentError } from "@/lib/errors";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { initiatePay } from "@/lib/fapshi";
import { BOOST_PLANS, isBoostPlan } from "@/lib/boost";
import { appUrl } from "@/lib/env";
import { asRow } from "@/lib/db";
import { isUuid } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/boost  { productId, plan: "3d" | "7d" }
 * Le vendeur paie le boost via Fapshi. Le prix vient de BOOST_PLANS (serveur), jamais du navigateur.
 * Le boost n'est activé que quand Fapshi confirme le paiement (webhook / page de retour / tâche planifiée).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null);
  const b = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isUuid(b.productId) || !isBoostPlan(b.plan)) return NextResponse.json({ error: explain("La demande de boost est incomplète (produit ou formule manquants).", "Rechargez la page et choisissez à nouveau la formule.") }, { status: 400 });

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: explain("Vous n'êtes pas connecté.", "Connectez-vous puis recommencez.") }, { status: 401 });

  // Le produit doit appartenir au vendeur connecté (règle RLS : on ne lit que ses propres produits modifiables)
  const { data: row } = await supabase.from("products").select("id, title, is_published, moderation_status").eq("id", b.productId).eq("seller_id", auth.user.id).maybeSingle();
  const product = asRow<{ id: string; title: string; is_published: boolean; moderation_status: string }>(row);
  if (!product) return NextResponse.json({ error: explain("Ce produit n'existe pas ou ne vous appartient pas.", "Choisissez un de vos produits dans la liste.") }, { status: 404 });
  if (product.moderation_status !== "approved") return NextResponse.json({ error: explain("Ce produit n'a pas encore été validé par KDDF Market.", "Attendez la validation (statut « En attente de validation ») puis boostez-le.") }, { status: 400 });
  if (!product.is_published) return NextResponse.json({ error: explain("Ce produit n'est pas publié.", "Publiez-le depuis Catalogue, puis boostez-le.") }, { status: 400 });

  const plan = BOOST_PLANS[b.plan];
  const db = createAdminClient();
  const { data: created, error } = await db
    .from("product_boosts")
    .insert({ product_id: product.id, seller_id: auth.user.id, plan: b.plan, amount: plan.price })
    .select("id")
    .single();
  const boost = asRow<{ id: string }>(created);
  if (error || !boost) return NextResponse.json({ error: explain("Le boost n'a pas pu être enregistré.", "Réessayez dans un instant. Aucun paiement n'a été effectué.") }, { status: 500 });

  try {
    const pay = await initiatePay({
      amount: plan.price,
      email: auth.user.email ?? "no-reply@kddf-market.app",
      redirectUrl: `${appUrl()}/dashboard/promote?boost=${boost.id}`,
      userId: auth.user.id,
      externalId: boost.id,
      message: `${plan.label} : ${product.title}`,
    });
    const { error: saveError } = await db.from("product_boosts").update({ fapshi_trans_id: pay.transId, fapshi_link: pay.link, fapshi_status: "CREATED" }).eq("id", boost.id);
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ url: pay.link });
  } catch (e) {
    console.error("[boost] Fapshi indisponible", e instanceof Error ? e.message : e);
    await db.from("product_boosts").update({ status: "failed", fapshi_status: "FAILED" }).eq("id", boost.id);
    return NextResponse.json({ error: explainPaymentError(e) }, { status: 502 });
  }
}
