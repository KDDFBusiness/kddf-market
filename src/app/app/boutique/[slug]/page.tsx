import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { productTypeLabel } from "@/lib/labels";
import { SHOP_THEMES, resolveShopColor } from "@/lib/shop";
import { hasPaidPhysicalOrder } from "@/lib/contact";
import SellerContact from "@/components/SellerContact";
import SellerTrustLine, { VerifiedBadge } from "@/components/SellerTrustLine";
import { getSellerTrust } from "@/lib/trust";
import type { Product, ShopColor, ShopSort, ShopTheme } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Shop {
  id: string;
  full_name: string | null;
  store_name: string | null;
  store_slug: string;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_description: string | null;
  shop_color: ShopColor;
  shop_color_custom: string | null;
  shop_theme: ShopTheme;
  shop_sort: ShopSort;
  shop_show_whatsapp: boolean;
  city: string | null;
  is_verified: boolean;
}
type Item = Pick<Product, "id" | "title" | "price" | "cover_url" | "images" | "product_type" | "digital_kind" | "stock"> & Partial<Pick<Product, "rating_avg" | "rating_count">>;

async function loadShop(slug: string): Promise<Shop | null> {
  const { data } = await createClient()
    .from("public_profiles")
    .select("id, full_name, store_name, store_slug, shop_logo_url, shop_banner_url, shop_description, shop_color, shop_color_custom, shop_theme, shop_sort, shop_show_whatsapp, city, is_verified")
    .eq("store_slug", slug.toLowerCase())
    .maybeSingle();
  return asRow<Shop>(data);
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const shop = await loadShop(params.slug);
  return { title: shop?.store_name ?? shop?.full_name ?? "Boutique", description: shop?.shop_description?.slice(0, 150) };
}

export default async function ShopPage({ params }: { params: { slug: string } }) {
  const shop = await loadShop(params.slug);
  if (!shop) notFound();

  let q = createClient()
    .from("products")
    .select("id, title, price, cover_url, images, product_type, digital_kind, stock, rating_avg, rating_count")
    .eq("seller_id", shop.id)
    .eq("is_published", true)
    .eq("moderation_status", "approved");
  switch (shop.shop_sort) {
    case "oldest": q = q.order("created_at", { ascending: true }); break;
    case "price_asc": q = q.order("price", { ascending: true }); break;
    case "price_desc": q = q.order("price", { ascending: false }); break;
    case "name": q = q.order("title", { ascending: true }); break;
    default: q = q.order("created_at", { ascending: false });
  }
  const products = asRows<Item>((await q).data);

  const trust = await getSellerTrust(shop.id);
  const color = resolveShopColor(shop.shop_color, shop.shop_color_custom);
  const theme = SHOP_THEMES[shop.shop_theme];
  const name = shop.store_name ?? shop.full_name ?? "Boutique";
  // « Contacter le vendeur » : seulement pour un client connecté ayant déjà PAYÉ un produit physique chez ce vendeur
  const canContact = shop.shop_show_whatsapp && (await hasPaidPhysicalOrder(shop.id));

  return (
    <div className="overflow-hidden rounded-3xl border" style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}>
      {/* Haut de page : bannière (ou couleur de la boutique) */}
      <div className="relative h-40 sm:h-56" style={{ backgroundColor: color.hex }}>
        {shop.shop_banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.shop_banner_url} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="space-y-6 px-4 pb-10 sm:px-8">
        <div className="relative z-10 -mt-12 flex flex-wrap items-end gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4" style={{ borderColor: theme.bg, backgroundColor: color.hex }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shop.shop_logo_url ? <img src={shop.shop_logo_url} alt={`Logo ${name}`} className="h-full w-full object-cover" /> : (
              <span className="flex h-full w-full items-center justify-center font-display text-3xl font-bold" style={{ color: color.text }}>{name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="pb-1">
            <h1 className="flex items-center gap-2 font-display text-3xl font-bold">{name} {shop.is_verified && <VerifiedBadge size={24} />}</h1>
            {shop.city && <p className="text-sm" style={{ color: theme.muted }}>📍 {shop.city}</p>}
            <SellerTrustLine trust={trust} tone={shop.shop_theme === "light" ? "light" : "dark"} />
          </div>
        </div>

        {shop.shop_description && <p className="max-w-2xl whitespace-pre-line text-sm" style={{ color: theme.muted }}>{shop.shop_description}</p>}

        {shop.shop_show_whatsapp && (
          canContact ? (
            <SellerContact sellerId={shop.id} productTitle={`un produit de ${name}`} title="Contacter le vendeur" />
          ) : (
            <p className="text-xs" style={{ color: theme.muted }}>Le bouton « Contacter le vendeur » apparaît après votre premier achat de produit physique dans cette boutique.</p>
          )
        )}

        <section>
          <h2 className="mb-4 font-display text-xl font-bold">Tous les produits ({products.length})</h2>
          {products.length === 0 ? (
            <p className="rounded-2xl border p-8 text-center text-sm" style={{ borderColor: theme.border, color: theme.muted }}>Cette boutique n&apos;a pas encore de produit.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => {
                const image = p.product_type === "physical" ? p.images[0] ?? p.cover_url : p.cover_url;
                const soldOut = p.product_type === "physical" && (p.stock ?? 0) <= 0;
                return (
                  <Link key={p.id} href={`/p/${p.id}`} className="group block overflow-hidden rounded-2xl border transition hover:-translate-y-1" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                    <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ backgroundColor: color.hex }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {image && <img src={image} alt={p.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                      {soldOut && <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white">Rupture de stock</span>}
                    </div>
                    <div className="space-y-2 p-4">
                      <span className="text-[11px] font-medium" style={{ color: theme.muted }}>{productTypeLabel(p)}</span>
                      <h3 className="line-clamp-2 font-display text-base font-semibold">{p.title}</h3>
                      {(p.rating_count ?? 0) > 0 && <p className="text-xs" style={{ color: theme.muted }}>★ {Number(p.rating_avg ?? 0).toFixed(1)} ({p.rating_count} avis)</p>}
                      <p className="font-display text-lg font-bold">{formatFcfa(p.price)}</p>
                      <span className="inline-block rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: color.hex, color: color.text }}>Acheter maintenant</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
