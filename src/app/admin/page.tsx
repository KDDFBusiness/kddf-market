import AutoRefresh from "@/components/AutoRefresh";
import StatCard from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { splitLine } from "@/lib/format";
import { TRANSACTION_STATUS_LABELS } from "@/lib/labels";
import type { Transaction } from "@/lib/types";
import { refundTransaction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration", robots: { index: false } };

interface FeeRow { platform_fee_percent: number | null; sales: number; volume: number; platform_fees: number; affiliate_fees: number; seller_amounts: number; fapshi_received: number }
type Tx = Pick<Transaction, "id" | "order_id" | "total_amount" | "platform_fee" | "affiliate_fee" | "seller_amount" | "affiliate_id" | "status" | "review_reason" | "released_at" | "fapshi_trans_id" | "paid_at" | "created_at">;
interface Stats { total_sellers: number; total_users: number; total_orders: number; commissions_today: number; commissions_month: number; commissions_due: number; products_pending: number; withdrawals_pending: number }

export default async function AdminPage() {
  const supabase = createClient();
  const [{ data: statData }, { data: feeData }, { data: txData }, { data: boostData }] = await Promise.all([
    supabase.from("admin_stats").select("*").maybeSingle(),
    supabase.from("admin_fee_summary").select("platform_fee_percent, sales, volume, platform_fees, affiliate_fees, seller_amounts, fapshi_received"),
    supabase.from("transactions").select("id, order_id, total_amount, platform_fee, affiliate_fee, seller_amount, affiliate_id, status, review_reason, released_at, fapshi_trans_id, paid_at, created_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("product_boosts").select("amount").eq("status", "paid"),
  ]);
  const boostRevenue = asRows<{ amount: number }>(boostData).reduce((n, b) => n + Number(b.amount), 0);
  const fees = asRows<FeeRow>(feeData);
  const txs = asRows<Tx>(txData);
  const stats = asRow<Stats>(statData);

  const feeAt = (pct: number): FeeRow | undefined => fees.find((f) => f.platform_fee_percent === pct);
  const totalFees = fees.reduce((n, f) => n + Number(f.platform_fees), 0);
  const volume = fees.reduce((n, f) => n + Number(f.volume), 0);

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <h1 className="font-display text-3xl font-bold text-white">Administration</h1>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Nombre de vendeurs" value={String(stats?.total_sellers ?? 0)} />
        <StatCard label="Nombre de commandes" value={String(stats?.total_orders ?? 0)} />
        <StatCard label="Commissions aujourd'hui" value={formatFcfa(stats?.commissions_today ?? 0)} tone="jade" />
        <StatCard label="Commissions ce mois-ci" value={formatFcfa(stats?.commissions_month ?? 0)} tone="jade" />
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/admin/products"><StatCard label="Produits à valider" value={String(stats?.products_pending ?? 0)} tone="volt" /></Link>
        <Link href="/admin/withdrawals"><StatCard label="Retraits en attente" value={String(stats?.withdrawals_pending ?? 0)} tone="volt" /></Link>
        <StatCard label="Commissions cash à encaisser" value={formatFcfa(stats?.commissions_due ?? 0)} hint="8 % des ventes à la livraison, déduites des retraits" />
        <StatCard label="Utilisateurs inscrits" value={String(stats?.total_users ?? 0)} />
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Volume total" value={formatFcfa(volume)} />
        <StatCard label="Frais plateforme" value={formatFcfa(totalFees)} tone="jade" />
        <StatCard label="Frais 5 % (avec affilié)" value={formatFcfa(Number(feeAt(5)?.platform_fees ?? 0))} hint={`${Number(feeAt(5)?.sales ?? 0)} ventes`} tone="volt" />
        <StatCard label="Frais 10 % (digital sans affilié)" value={formatFcfa(Number(feeAt(10)?.platform_fees ?? 0))} hint={`${Number(feeAt(10)?.sales ?? 0)} ventes`} tone="volt" />
        <StatCard label="Frais 8 % (physique sans affilié)" value={formatFcfa(Number(feeAt(8)?.platform_fees ?? 0))} hint={`${Number(feeAt(8)?.sales ?? 0)} ventes`} tone="volt" />
        <StatCard label="Revenus des boosts" value={formatFcfa(boostRevenue)} tone="jade" />
      </section>

      <section className="glass p-5">
        <p className="label">Toutes les transactions</p>
        <ul className="divide-y divide-white/5 text-sm">
          {txs.map((t) => (
            <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span className="text-zinc-200">
                {t.status === "paid" ? splitLine(t) : `${formatFcfa(t.total_amount)} — ${TRANSACTION_STATUS_LABELS[t.status]}`}
              </span>
              <span className="flex items-center gap-3 text-xs text-zinc-500">
                {new Date(t.created_at).toLocaleString("fr-FR")}
                {t.status === "paid" && t.released_at === null && (
                  <form action={refundTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-red-300 underline">Rembourser</button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
