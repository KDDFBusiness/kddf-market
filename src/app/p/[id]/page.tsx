import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CheckoutForm from "@/components/CheckoutForm";
import ProductGallery from "@/components/ProductGallery";
import ProductReviews from "@/components/ProductReviews";
import RefTracker from "@/components/RefTracker";
import ViewTracker from "@/components/ViewTracker";
import ShareButtons from "@/components/ShareButtons";
import SellerContact from "@/components/SellerContact";
import Stars from "@/components/Stars";
import SellerTrustLine, { VerifiedBadge } from "@/components/SellerTrustLine";
import { getProductReviews, getSellerTrust } from "@/lib/trust";
import Link from "next/link";
import { hasPaidPhysicalOrder } from "@/lib/contact";
import { productUrl } from "@/lib/share";
import { appName } from "@/lib/env";
import { enabledProviders } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS, productTypeLabel } from "@/lib/labels";
import { isReferralCode, isUuid } from "@/lib/validate";
import type { DeliveryMethod, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS =
  "id, seller_id, product_type, digital_kind, title, slug, description, cover_url, price, is_published, affiliate_enabled, affiliate_percent, duration_minutes, stock, images, weight, variant, delivery_options, category, city, rating_avg, rating_count, moderation_status, created_at";

async function loadProduct(id: string): Promise<Product | null> {
  if (!isUuid(id)) return null;
  const { data } = await createClient().from("products").select(COLUMNS).eq("id", id).maybeSingle();
  return asRow<Product>(data);
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await loadProduct(params.id);
  const title = p?.title ?? "Produit";
  const description = p?.description?.slice(0, 150) ?? `Découvre ce produit sur ${appName()}`;
  const image = p ? (p.product_type === "physical" ? p.images[0] ?? p.cover_url : p.cover_url) : null;
  const url = productUrl(params.id);
  // Aperçu (image + titre + description) quand le lien est partagé sur WhatsApp, Facebook, Telegram, X…
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: appName(), type: "website", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

const DELIVERY_ORDER: DeliveryMethod[] = ["pickup_douala", "delivery_douala", "shipping_cameroon"];

export default async function ProductPage({ params, searchParams }: { params: { id: string }; searchParams: { ref?: string } }) {
  const p = await loadProduct(params.id);
  if (!p || !p.is_published) notFound();

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const physical = p.product_type === "physical";
  const stock = p.stock ?? 0;
  const soldOut = physical && stock <= 0;
  const gallery = physical ? p.images : p.cover_url ? [p.cover_url] : [];
  const ref = isReferralCode(searchParams.ref) ? searchParams.ref : null;

  // Boutique du vendeur (informations publiques uniquement)
  const { data: shopRow } = await supabase.from("public_profiles").select("store_name, store_slug, is_verified").eq("id", p.seller_id).maybeSingle();
  const shop = asRow<{ store_name: string | null; store_slug: string | null; is_verified: boolean }>(shopRow);
  const trust = await getSellerTrust(p.seller_id);
  const reviews = await getProductReviews(p.id);
  // Contact vendeur : SEULEMENT pour un produit physique déjà PAYÉ par l'acheteur connecté (jamais pour le digital)
  const canContact = physical && (await hasPaidPhysicalOrder(p.seller_id, p.id));

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <ViewTracker productId={p.id} />
      {ref && <RefTracker productId={p.id} code={ref} />}

      <section className="space-y-6">
        <ProductGallery images={gallery} title={p.title} />
        <div className="space-y-3">
          <span className="rounded-full bg-volt/15 px-2.5 py-1 text-xs font-medium text-volt-soft">{productTypeLabel(p)}</span>
          <h1 className="font-display text-3xl font-bold text-white">{p.title}</h1>
          {p.rating_count > 0 ? (
            <p className="flex items-center gap-2 text-sm text-zinc-300"><Stars value={Number(p.rating_avg)} /> <span className="font-semibold">{Number(p.rating_avg).toFixed(1)}</span> <span className="text-zinc-400">({p.rating_count} avis)</span></p>
          ) : (
            <p className="text-xs text-zinc-500">Pas encore d&apos;avis sur ce produit</p>
          )}
          {p.description && <p className="whitespace-pre-line text-zinc-300">{p.description}</p>}
          {physical && (p.weight || p.variant) && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {p.weight && <div className="glass p-3"><dt className="label !mb-0.5">Poids</dt><dd className="text-white">{p.weight}</dd></div>}
              {p.variant && <div className="glass p-3"><dt className="label !mb-0.5">Taille / variante</dt><dd className="text-white">{p.variant}</dd></div>}
            </dl>
          )}
        </div>
        <ProductReviews productId={p.id} />
        {reviews.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Avis des acheteurs</h2>
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="glass space-y-1 p-4 text-sm">
                  <p className="flex items-center gap-2"><Stars value={r.rating} /> <span className="font-semibold text-white">{r.reviewer_name}</span></p>
                  {r.comment && <p className="text-zinc-300">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="glass h-fit space-y-5 p-5 sm:p-6 lg:sticky lg:top-24">
        <p className="font-display text-3xl font-bold text-jade-soft">{formatFcfa(p.price)}</p>

        {physical && (
          <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${soldOut ? "bg-red-500/15 text-red-300" : "bg-jade/15 text-jade-soft"}`}>
            <span className={`h-2 w-2 rounded-full ${soldOut ? "bg-red-400" : "bg-jade"}`} />
            {soldOut ? "Rupture de stock" : `En stock : ${stock}`}
          </p>
        )}

        {physical && (
          <ul className="space-y-1.5 text-sm">
            {DELIVERY_ORDER.filter((m) => p.delivery_options?.[m]?.enabled === true).map((m) => {
              const price = p.delivery_options?.[m]?.price ?? 0;
              return (
                <li key={m} className="flex justify-between gap-3 text-zinc-300">
                  <span>{DELIVERY_LABELS[m]}</span>
                  <span className={price === 0 ? "font-semibold text-jade-soft" : "text-white"}>{price === 0 ? "Gratuit" : formatFcfa(price)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <CheckoutForm
          productId={p.id}
          productType={p.product_type}
          price={p.price}
          stock={p.stock}
          deliveryOptions={p.delivery_options}
          defaultEmail={auth.user?.email ?? ""}
          loggedIn={auth.user !== null}
          providers={enabledProviders()}
        />

        {canContact ? (
          <SellerContact sellerId={p.seller_id} productTitle={p.title} />
        ) : physical ? (
          <p className="rounded-xl bg-white/5 px-4 py-3 text-xs text-zinc-400">Le contact du vendeur (WhatsApp, appel, email) est débloqué après votre paiement sur KDDF Market.</p>
        ) : null}

        <div className="space-y-2 border-t border-white/5 pt-4">
          <p className="label !mb-0">Partager ce produit</p>
          <ShareButtons productId={p.id} title={p.title} price={p.price} url={productUrl(p.id)} />
        </div>

        <div className="space-y-2 border-t border-white/5 pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            Vendeur : {shop?.store_name ?? "Boutique"} {shop?.is_verified && <VerifiedBadge />}
          </p>
          <SellerTrustLine trust={trust} />
          {shop?.store_slug && (
            <Link href={`/boutique/${shop.store_slug}`} className="block text-xs text-volt-soft underline">Voir la boutique</Link>
          )}
        </div>
      </aside>
    </div>
  );
}
