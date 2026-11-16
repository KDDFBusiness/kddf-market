import AutoRefresh from "@/components/AutoRefresh";
import StatCard from "@/components/StatCard";
import WithdrawForm from "@/components/WithdrawForm";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { WITHDRAWAL_METHOD_LABELS } from "@/lib/labels";
import type { Wallet, Withdrawal } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes gains" };

const STATUS: Record<Withdrawal["status"], string> = { pending: "En attente de validation", paid: "Payé", failed: "Refusé (solde rendu)" };

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createClient();
  await supabase.rpc("release_my_funds");

  const [{ data: w }, { data: wd }] = await Promise.all([
    supabase.from("wallets").select("user_id, balance_pending, balance_available, total_earned, total_withdrawn, commission_due").eq("user_id", user.id).maybeSingle(),
    supabase.from("withdrawals").select("id, user_id, amount, method, phone_number, status, note, created_at, processed_at, commission_deducted").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const wallet = asRow<Wallet>(w);
  const withdrawals = asRows<Withdrawal>(wd);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <h1 className="font-display text-3xl font-bold text-white">Mes gains</h1>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Solde en attente" value={formatFcfa(wallet?.balance_pending ?? 0)} tone="volt" hint="digital : 24 h · physique : dès que l'acheteur confirme la réception (ou 3 jours après livraison)" />
        <StatCard label="Solde disponible" value={formatFcfa(wallet?.balance_available ?? 0)} tone="jade" />
        <StatCard label="Total gagné" value={formatFcfa(wallet?.total_earned ?? 0)} />
        <StatCard label="Total retiré" value={formatFcfa(wallet?.total_withdrawn ?? 0)} />
      </section>
      {(wallet?.commission_due ?? 0) > 0 && (
        <p role="status" className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Commission à régler : {formatFcfa(wallet?.commission_due ?? 0)} (8 % des ventes encaissées en cash). Elle sera déduite automatiquement de votre prochain retrait.
        </p>
      )}
      <WithdrawForm available={wallet?.balance_available ?? 0} />
      <section className="glass p-5">
        <p className="label">Mes demandes de retrait</p>
        {withdrawals.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune demande.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {withdrawals.map((x) => (
              <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-zinc-200">
                <span>{formatFcfa(x.amount)}{x.commission_deducted > 0 ? ` (dont ${formatFcfa(x.commission_deducted)} de commission cash, net ${formatFcfa(x.amount - x.commission_deducted)})` : ""} · {WITHDRAWAL_METHOD_LABELS[x.method]} · {x.phone_number}</span>
                <span className="text-xs text-zinc-400">{STATUS[x.status]} · {new Date(x.created_at).toLocaleDateString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
