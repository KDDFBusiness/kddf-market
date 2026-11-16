import GuaranteeBadge from "@/components/GuaranteeBadge";
import ProductReviewForm from "@/components/ProductReviewForm";
import Stars from "@/components/Stars";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
  reviewer_city: string | null;
  reviewer_avatar: string | null;
  photo_url: string | null;
}

/**
 * Section « Avis clients » de la page produit : note moyenne, répartition, liste des avis,
 * et formulaire visible SEULEMENT pour un acheteur dont la commande est livrée.
 */
export default async function ProductReviews({ productId }: { productId: string }) {
  const db = createClient();

  const { data: statRows } = await db.from("product_review_stats").select("rating, n").eq("product_id", productId);
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of asRows<{ rating: number; n: number | string }>(statRows)) counts[r.rating] = Number(r.n);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const avg = total > 0 ? ([1, 2, 3, 4, 5] as const).reduce((sum, n) => sum + n * counts[n], 0) / total : 0;

  const { data: reviewRows } = await db
    .from("product_reviews_public")
    .select("id, rating, comment, created_at, reviewer_name, reviewer_city, reviewer_avatar, photo_url")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews = asRows<ReviewRow>(reviewRows);

  // Formulaire : acheteur connecté, commande payée ET livrée, pas encore d'avis sur ce produit
  let eligibleOrder: string | null = null;
  const { data: auth } = await db.auth.getUser();
  if (auth.user) {
    const { data: mine } = await db.from("reviews").select("id").eq("buyer_id", auth.user.id).eq("product_id", productId).limit(1);
    if (asRows<{ id: string }>(mine).length === 0) {
      const { data: orders } = await db
        .from("orders")
        .select("id, status, delivery_method, payment_status")
        .eq("buyer_id", auth.user.id)
        .eq("product_id", productId)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false });
      const ok = asRows<{ id: string; status: string; delivery_method: string | null }>(orders).find((o) => o.delivery_method === null || o.status === "delivered");
      eligibleOrder = ok?.id ?? null;
    }
  }

  return (
    <section className="space-y-4" aria-label="Avis clients">
      <GuaranteeBadge />
      <h2 className="font-display text-xl font-bold text-white">Avis clients</h2>

      {total > 0 ? (
        <div className="glass grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center">
            <p className="font-display text-4xl font-bold text-white">{avg.toFixed(1)}<span className="text-lg text-zinc-400">/5</span></p>
            <Stars value={avg} size="text-xl" />
            <p className="mt-1 text-xs text-zinc-400">{total} avis</p>
          </div>
          <ul className="space-y-1.5 text-xs">
            {[5, 4, 3, 2, 1].map((n) => {
              const pct = Math.round((counts[n] / total) * 100);
              return (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-zinc-300">{n} étoile{n > 1 ? "s" : ""}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></span>
                  <span className="w-9 shrink-0 text-right text-zinc-400">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="glass p-4 text-sm text-zinc-400">Aucun avis pour l&apos;instant. Soyez le premier après votre achat !</p>
      )}

      {reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="glass space-y-2 p-4 text-sm">
              <div className="flex items-center gap-3">
                {r.reviewer_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.reviewer_avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-volt/20 font-semibold text-volt-soft">{r.reviewer_name.charAt(0).toUpperCase()}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{r.reviewer_name}{r.reviewer_city ? ` · ${r.reviewer_city}` : ""}</p>
                  <p className="flex items-center gap-2 text-xs text-zinc-400"><Stars value={r.rating} /> {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              </div>
              {r.comment && <p className="text-zinc-300">{r.comment}</p>}
              {r.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="Photo du produit reçu" className="max-h-48 rounded-xl object-cover" loading="lazy" />
              )}
            </li>
          ))}
        </ul>
      )}

      {eligibleOrder && <ProductReviewForm orderId={eligibleOrder} />}
    </section>
  );
}
