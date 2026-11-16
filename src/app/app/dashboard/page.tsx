import AutoRefresh from "@/components/AutoRefresh";
import StatCard from "@/components/StatCard";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { splitLine, type SplitTx } from "@/lib/format";
import type { Transaction, Wallet } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vue d'ensemble" };

type Tx = SplitTx & Pick<Transaction, "id" | "status" | "paid_at">;
interface Stat { product_id: string; title: string; views: number; sales: number }

export default async function Overview() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createClient();

  await supabase.rpc("release_my_funds"); // libère les fonds arrivés à échéance avant d'afficher les soldes

  const [{ data: walletData }, { data: txData }, { data: statData }] = await Promise.all([
    supabase.from("wallets").select("user_id, balance_pending, balance_available, total_earned, total_withdrawn").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("transactions")
      .select("id, total_amount, platform_fee, affiliate_fee, seller_amount, affiliate_id, status, paid_at")
      .eq("seller_id", user.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false }),
    supabase.from("seller_product_stats").select("product_id, title, views, sales").eq("seller_id", user.id),
  ]);
  const wallet = asRow<Wallet>(walletData);
  const txs = asRows<Tx>(txData);
  const stats = asRows<Stat>(statData);

  const revenue = txs.reduce((sum, t) => sum + (t.seller_amount ?? 0), 0);
  const gross = txs.reduce((sum, t) => sum + t.total_amount, 0);
  const views = stats.reduce((sum, s) => sum + Number(s.views), 0);
  const conversion = views > 0 ? ((txs.length / views) * 100).toFixed(1) : "0.0";

  // Ventes des 7 derniers jours (barres)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const perDay = days.map((d) => {
    const next = new Date(d.getTime() + 86400000);
    const sum = txs.filter((t) => t.paid_at !== null && new Date(t.paid_at) >= d && new Date(t.paid_at) < next).reduce((s, t) => s + (t.seller_amount ?? 0), 0);
    return { label: d.toLocaleDateString("fr-FR", { weekday: "short" }), sum };
  });
  const maxDay = Math.max(1, ...perDay.map((d) => d.sum));

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={20} />
      <h1 className="font-display text-3xl font-bold text-white">Vue d&apos;ensemble</h1>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ventes totales" value={formatFcfa(gross)} hint={`${txs.length} vente${txs.length > 1 ? "s" : ""}`} />
        <StatCard label="Mes revenus" value={formatFcfa(revenue)} tone="jade" hint="après commissions" />
        <StatCard label="Solde en attente" value={formatFcfa(wallet?.balance_pending ?? 0)} tone="volt" />
        <StatCard label="Solde disponible" value={formatFcfa(wallet?.balance_available ?? 0)} tone="jade" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass p-5">
          <p className="label">Revenus des 7 derniers jours</p>
          <div className="flex h-40 items-end gap-3">
            {perDay.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-volt to-jade" style={{ height: `${Math.max(4, (d.sum / maxDay) * 100)}%` }} title={formatFcfa(d.sum)} />
                <span className="text-[11px] text-zinc-500">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass p-5">
          <p className="label">Conversion par produit</p>
          <p className="mb-3 font-display text-2xl font-bold text-white">{conversion} %</p>
          <ul className="space-y-1.5 text-sm">
            {stats.slice(0, 6).map((s) => (
              <li key={s.product_id} className="flex justify-between gap-3 text-zinc-300">
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-zinc-500">{Number(s.views)} vues · {Number(s.sales)} ventes</span>
              </li>
            ))}
            {stats.length === 0 && <li className="text-zinc-500">Aucun produit pour le moment.</li>}
          </ul>
        </div>
      </section>

      <section className="glass p-5">
        <p className="label">Historique des ventes</p>
        {txs.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune vente pour le moment.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {txs.slice(0, 15).map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="text-zinc-200">{splitLine(t)}</span>
                <span className="text-xs text-zinc-500">{t.paid_at ? new Date(t.paid_at).toLocaleString("fr-FR") : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
