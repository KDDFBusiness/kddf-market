import CopyButton from "@/components/CopyButton";
import ShareButtons from "@/components/ShareButtons";
import StoryImageButton from "@/components/StoryImageButton";
import BoostButtons from "@/components/BoostButtons";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncBoostPayment } from "@/lib/fulfillment";
import { asRow, asRows } from "@/lib/db";
import { appName } from "@/lib/env";
import { BOOST_PLANS } from "@/lib/boost";
import { formatFcfa } from "@/lib/money";
import { productUrl } from "@/lib/share";
import { isUuid } from "@/lib/validate";
import type { BoostPlan, Product } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promouvoir mes produits" };

type Row = Pick<Product, "id" | "title" | "price" | "cover_url" | "images" | "product_type">;
interface Boost { product_id: string; plan: BoostPlan; ends_at: string }

export default async function PromotePage({ searchParams }: { searchParams: { boost?: string } }) {
  const user = await getSessionUser();
  if (!user) return null;

  // Retour du paiement Fapshi d'un boost : on vérifie le paiement tout de suite (sans attendre le webhook)
  let boostMessage = "";
  if (isUuid(searchParams.boost)) {
    const admin = createAdminClient();
    const { data: b } = await admin.from("product_boosts").select("fapshi_trans_id, status, seller_id").eq("id", searchParams.boost).maybeSingle();
    const boost = asRow<{ fapshi_trans_id: string | null; status: string; seller_id: string }>(b);
    if (boost && boost.seller_id === user.id && boost.fapshi_trans_id) {
      if (boost.status === "pending") await syncBoostPayment(boost.fapshi_trans_id, { source: "verification", minAgeSeconds: 10 });
      const { data: after } = await admin.from("product_boosts").select("status").eq("id", searchParams.boost).maybeSingle();
      const status = asRow<{ status: string }>(after)?.status;
      boostMessage =
        status === "paid" ? "✅ Boost activé ! Ton produit est mis en avant."
        : status === "pending" ? "Paiement en cours de confirmation… rafraîchis la page dans un instant."
        : "Le paiement du boost n'a pas abouti. Tu n'as pas été débité.";
    }
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select("id, title, price, cover_url, images, product_type")
    .eq("seller_id", user.id)
    .eq("is_published", true)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false });
  const products = asRows<Row>(data);
  const { data: boostData } = await supabase.from("active_boosts").select("product_id, plan, ends_at");
  const boosts = asRows<Boost>(boostData);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-white">Promouvoir mon produit</h1>
      {boostMessage && <p role="status" className="rounded-xl bg-white/5 px-4 py-3 text-sm text-zinc-200">{boostMessage}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(BOOST_PLANS) as BoostPlan[]).map((plan) => (
          <div key={plan} className="glass p-4 text-sm">
            <p className="font-display font-semibold text-white">{BOOST_PLANS[plan].label} · {formatFcfa(BOOST_PLANS[plan].price)}</p>
            <p className="text-zinc-400">{BOOST_PLANS[plan].perk}</p>
          </div>
        ))}
      </div>

      {products.length === 0 && <p className="glass p-8 text-center text-sm text-zinc-400">Publie un produit pour pouvoir le promouvoir.</p>}

      {products.map((p) => {
        const url = productUrl(p.id);
        const active = boosts.filter((b) => b.product_id === p.id);
        const image = p.product_type === "physical" ? p.images[0] ?? p.cover_url : p.cover_url;
        return (
          <article key={p.id} id={`p-${p.id}`} className="glass space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">{p.title}</h2>
                <p className="text-sm text-zinc-400">{formatFcfa(p.price)}</p>
              </div>
              {active.length > 0 && (
                <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-ink-950">
                  ★ {BOOST_PLANS[active.some((b) => b.plan === "7d") ? "7d" : "3d"].badge} jusqu&apos;au {new Date(active.reduce((m, b) => (b.ends_at > m ? b.ends_at : m), active[0].ends_at)).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>

            <div>
              <p className="label">Lien unique du produit</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-ink-900 px-3 py-2 text-xs text-volt-soft">{url}</code>
                <CopyButton text={url} label="Copier le lien" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="label !mb-0">Partager</p>
              <ShareButtons productId={p.id} title={p.title} price={p.price} url={url} />
              <StoryImageButton title={p.title} price={p.price} imageUrl={image} siteName={appName()} url={url} />
            </div>

            <div className="space-y-2 border-t border-white/5 pt-4">
              <p className="label !mb-0">Booster mon produit</p>
              <BoostButtons productId={p.id} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
