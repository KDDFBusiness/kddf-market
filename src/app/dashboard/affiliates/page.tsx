import CopyButton from "@/components/CopyButton";
import StatCard from "@/components/StatCard";
import { getMyProfile, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { formatFcfa } from "@/lib/money";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliation" };

type Offer = Pick<Product, "id" | "title" | "price" | "affiliate_percent" | "product_type">;
interface LinkRow { product_id: string; clicks: number }
interface SaleRow { product_id: string; affiliate_fee: number | null; status: string }

export default async function AffiliatesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getMyProfile(user.id);
  const supabase = createClient();

  const [{ data: offersData }, { data: linksData }, { data: salesData }] = await Promise.all([
    supabase.from("products").select("id, title, price, affiliate_percent, product_type").eq("is_published", true).eq("moderation_status", "approved").eq("affiliate_enabled", true).neq("seller_id", user.id).order("created_at", { ascending: false }).limit(60),
    supabase.from("affiliate_links").select("product_id, clicks").eq("user_id", user.id),
    supabase.from("affiliate_sales").select("product_id, affiliate_fee, status").eq("affiliate_id", user.id),
  ]);
  const offers = asRows<Offer>(offersData);
  const links = asRows<LinkRow>(linksData);
  const sales = asRows<SaleRow>(salesData).filter((s) => s.status === "paid");

  const clicksOf = (id: string): number => links.find((l) => l.product_id === id)?.clicks ?? 0;
  const salesOf = (id: string): number => sales.filter((s) => s.product_id === id).length;
  const totalClicks = links.reduce((n, l) => n + l.clicks, 0);
  const totalCommission = sales.reduce((n, s) => n + (s.affiliate_fee ?? 0), 0);
  const code = profile?.referral_code ?? "";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-white">Affiliation</h1>
      <p className="text-sm text-zinc-400">
        Partagez un lien : si quelqu&apos;un achète dans les 30 jours, vous touchez la commission du produit. Vous ne pouvez pas utiliser votre propre lien.
      </p>

      <section className="grid grid-cols-3 gap-4">
        <StatCard label="Clics" value={String(totalClicks)} />
        <StatCard label="Ventes" value={String(sales.length)} tone="volt" />
        <StatCard label="Commissions" value={formatFcfa(totalCommission)} tone="jade" />
      </section>

      <section className="space-y-3">
        {offers.length === 0 && <p className="glass p-6 text-center text-sm text-zinc-400">Aucun produit ouvert à l&apos;affiliation pour le moment.</p>}
        {offers.map((o) => {
          const url = `${appUrl()}/p/${o.id}?ref=${code}`;
          return (
            <article key={o.id} className="glass flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-display font-semibold text-white">{o.title}</p>
                <p className="text-xs text-zinc-400">
                  {formatFcfa(o.price)} · commission {o.affiliate_percent} % = {formatFcfa(Math.floor((o.price * o.affiliate_percent) / 100))} · {clicksOf(o.id)} clics · {salesOf(o.id)} ventes
                </p>
                <p className="mt-1 truncate text-xs text-volt-soft">{url}</p>
              </div>
              <CopyButton text={url} label="Copier mon lien" />
            </article>
          );
        })}
      </section>
    </div>
  );
}
