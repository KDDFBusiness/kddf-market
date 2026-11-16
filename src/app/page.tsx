import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { BOOST_PLANS } from "@/lib/boost";
import { CITIES } from "@/lib/shop";
import { PRODUCT_CATEGORIES, SORT_LABELS, cleanSearch, isSortKey, parsePrice, type SortKey } from "@/lib/catalog";
import type { BoostPlan } from "@/lib/types";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

type ListedProduct = Pick<Product, "id" | "title" | "price" | "cover_url" | "images" | "product_type" | "digital_kind" | "stock" | "rating_avg" | "rating_count" | "city">;

const COLS = "id, title, price, cover_url, images, product_type, digital_kind, stock, rating_avg, rating_count, city";

interface Params { q?: string; category?: string; city?: string; min?: string; max?: string; type?: string; sort?: string }

export default async function Home({ searchParams }: { searchParams: Params }) {
  const filter = searchParams.type === "digital" || searchParams.type === "physical" ? searchParams.type : null;
  const q = cleanSearch(searchParams.q);
  const category = PRODUCT_CATEGORIES.includes(searchParams.category ?? "") ? (searchParams.category as string) : "";
  const city = CITIES.includes(searchParams.city ?? "") ? (searchParams.city as string) : "";
  const min = parsePrice(searchParams.min);
  const max = parsePrice(searchParams.max);
  const sort: SortKey = isSortKey(searchParams.sort) ? searchParams.sort : "recent";
  const filtering = q !== "" || category !== "" || city !== "" || min !== null || max !== null || filter !== null || sort !== "recent";

  // Recherche + filtres + tri combinés (seuls les produits publiés ET validés par l'admin sont visibles)
  let query = createClient().from("products").select(COLS).eq("is_published", true).eq("moderation_status", "approved");
  if (q) query = query.ilike("title", `%${q}%`);
  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  if (min !== null) query = query.gte("price", min);
  if (max !== null) query = query.lte("price", max);
  if (filter) query = query.eq("product_type", filter);
  switch (sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "rating": query = query.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false }); break;
    default: query = query.order("created_at", { ascending: false });
  }
  const products = asRows<ListedProduct>((await query.limit(48)).data);

  // Produits boostés actifs (7 jours "Populaire" en premier, puis 3 jours "À la une") : seulement sans recherche/filtre
  const supabase = createClient();
  const { data: boostData } = filtering ? { data: [] } : await supabase.from("active_boosts").select("product_id, plan");
  const boosts = asRows<{ product_id: string; plan: BoostPlan }>(boostData);
  const planOf = new Map<string, BoostPlan>();
  for (const b of boosts) if (planOf.get(b.product_id) !== "7d") planOf.set(b.product_id, b.plan);
  let featured: ListedProduct[] = [];
  if (planOf.size > 0) {
    const fq = supabase.from("products").select(COLS).eq("is_published", true).eq("moderation_status", "approved").in("id", Array.from(planOf.keys()));
    featured = asRows<ListedProduct>((await fq).data).sort((a, b) => (planOf.get(b.id) === "7d" ? 1 : 0) - (planOf.get(a.id) === "7d" ? 1 : 0));
  }
  const featuredIds = new Set(featured.map((f) => f.id));
  const rest = products.filter((p) => !featuredIds.has(p.id));
  const badgeOf = (id: string): string | undefined => {
    const plan = planOf.get(id);
    return plan ? BOOST_PLANS[plan].badge : undefined;
  };

  return (
    <div className="space-y-10">
      <section className="py-10 text-center sm:py-16">
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl">
          Vendez vos produits <span className="text-volt-soft">digitaux</span> et <span className="text-jade-soft">physiques</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          Ebooks, formations, licences, coaching et produits livrés chez vous. Paiement Mobile Money, affiliation intégrée.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login?mode=signup" className="btn-primary">Créer ma boutique</Link>
          <a href="#catalogue" className="btn-ghost">Voir le catalogue</a>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-white">Produits à la une</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => <ProductCard key={p.id} p={p} badge={badgeOf(p.id)} />)}
          </div>
        </section>
      )}

      <section id="catalogue" className="space-y-5">
        <form method="get" action="/" className="glass space-y-3 p-4">
          <input name="q" defaultValue={q} placeholder="Rechercher un produit…" aria-label="Rechercher un produit" className="input" maxLength={60} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select name="category" defaultValue={category} aria-label="Catégorie" className="input">
              <option value="">Toutes les catégories</option>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="city" defaultValue={city} aria-label="Ville" className="input">
              <option value="">Toutes les villes</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="type" defaultValue={filter ?? ""} aria-label="Type de produit" className="input">
              <option value="">Physique et digital</option>
              <option value="physical">Physique</option>
              <option value="digital">Digital</option>
            </select>
            <input name="min" type="number" inputMode="numeric" min={0} defaultValue={min ?? ""} placeholder="Prix min (FCFA)" aria-label="Prix minimum" className="input" />
            <input name="max" type="number" inputMode="numeric" min={0} defaultValue={max ?? ""} placeholder="Prix max (FCFA)" aria-label="Prix maximum" className="input" />
            <select name="sort" defaultValue={sort} aria-label="Trier par" className="input">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2">Rechercher</button>
            {filtering && <Link href="/#catalogue" className="btn-ghost !py-2">Réinitialiser</Link>}
          </div>
        </form>
        {rest.length === 0 && featured.length === 0 ? (
          <p className="glass p-8 text-center text-sm text-zinc-400">{filtering ? "Aucun produit ne correspond à votre recherche." : "Aucun produit pour le moment."}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => <ProductCard key={p.id} p={p} badge={badgeOf(p.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}
