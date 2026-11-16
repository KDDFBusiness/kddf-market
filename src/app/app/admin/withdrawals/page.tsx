import FlashError from "@/components/FlashError";
import AutoRefresh from "@/components/AutoRefresh";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { WITHDRAWAL_METHOD_LABELS } from "@/lib/labels";
import type { Withdrawal } from "@/lib/types";
import { processWithdrawal } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Retraits", robots: { index: false } };

const COLS = "id, user_id, amount, method, phone_number, status, note, created_at, processed_at, commission_deducted";

export default async function AdminWithdrawals({ searchParams }: { searchParams: { erreur?: string } }) {
  const supabase = createClient();
  const [{ data: p }, { data: h }] = await Promise.all([
    supabase.from("withdrawals").select(COLS).eq("status", "pending").order("created_at"),
    supabase.from("withdrawals").select(COLS).neq("status", "pending").order("processed_at", { ascending: false }).limit(30),
  ]);
  const pending = asRows<Withdrawal>(p);
  const done = asRows<Withdrawal>(h);

  return (
    <div className="space-y-6">
      <FlashError code={searchParams.erreur} />
      <AutoRefresh seconds={30} />
      <h1 className="font-display text-3xl font-bold text-white">Demandes de retrait</h1>
      <section className="glass p-5">
        <p className="label">À traiter ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune demande en attente.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {pending.map((w) => (
              <li key={w.id} className="space-y-2 py-3 text-sm">
                <p className="text-zinc-200">
                  <span className="font-semibold text-white">À payer : {formatFcfa(w.amount - w.commission_deducted)}</span>
                  {w.commission_deducted > 0 && <span className="text-amber-300"> (demandé {formatFcfa(w.amount)} − commission cash {formatFcfa(w.commission_deducted)})</span>}
                  {" · "}{WITHDRAWAL_METHOD_LABELS[w.method]} · <span className="font-mono">{w.phone_number}</span>{" "}
                  <span className="text-xs text-zinc-500">({new Date(w.created_at).toLocaleString("fr-FR")})</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={processWithdrawal} className="flex gap-2">
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="result" value="paid" />
                    <input name="note" placeholder="Note (réf. du transfert)" className="input !w-52 !py-2" />
                    <button className="btn-jade !px-3 !py-2">Approuver (payé)</button>
                  </form>
                  <form action={processWithdrawal}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="result" value="failed" />
                    <button className="btn-ghost !px-3 !py-2 text-red-300">Refuser (solde rendu)</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="glass p-5">
        <p className="label">Derniers retraits traités</p>
        <ul className="divide-y divide-white/5 text-sm">
          {done.map((w) => (
            <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-zinc-300">
              <span>{formatFcfa(w.amount)} · {WITHDRAWAL_METHOD_LABELS[w.method]} · {w.phone_number}</span>
              <span className="text-xs text-zinc-500">{w.status === "paid" ? "Payé" : "Refusé"}{w.note ? ` · ${w.note}` : ""}</span>
            </li>
          ))}
          {done.length === 0 && <li className="py-2 text-zinc-500">Rien pour le moment.</li>}
        </ul>
      </section>
    </div>
  );
}
