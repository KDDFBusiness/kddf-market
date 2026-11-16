import FlashError from "@/components/FlashError";
import AutoRefresh from "@/components/AutoRefresh";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { orderStatusLabel } from "@/lib/labels";
import type { Order, Transaction } from "@/lib/types";
import { refundTransaction, resolveDispute } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Commandes", robots: { index: false } };

type Row = Pick<Order, "id" | "product_id" | "seller_id" | "buyer_name" | "buyer_email" | "total_price" | "status" | "payment_method" | "payment_status" | "disputed" | "dispute_reason" | "created_at">;
type Review = Pick<Transaction, "id" | "total_amount" | "review_reason" | "fapshi_trans_id">;

export default async function AdminOrders({ searchParams }: { searchParams: { erreur?: string } }) {
  const supabase = createClient();
  const [{ data: od }, { data: rv }] = await Promise.all([
    supabase.from("orders").select("id, product_id, seller_id, buyer_name, buyer_email, total_price, status, payment_method, payment_status, disputed, dispute_reason, created_at").order("created_at", { ascending: false }).limit(150),
    supabase.from("transactions").select("id, total_amount, review_reason, fapshi_trans_id").eq("status", "review"),
  ]);
  const orders = asRows<Row>(od);
  const reviews = asRows<Review>(rv);

  const titles = new Map<string, string>();
  const ids = Array.from(new Set(orders.map((o) => o.product_id)));
  if (ids.length > 0) {
    const { data: ps } = await supabase.from("products").select("id, title").in("id", ids);
    for (const p of asRows<{ id: string; title: string }>(ps)) titles.set(p.id, p.title);
  }

  return (
    <div className="space-y-6">
      <FlashError code={searchParams.erreur} />
      <AutoRefresh seconds={30} />
      <h1 className="font-display text-3xl font-bold text-white">Toutes les commandes</h1>

      {(reviews.length > 0 || orders.some((o) => o.disputed)) && (
        <section className="glass space-y-3 p-5">
          <p className="label">À traiter à la main</p>
          {reviews.map((t) => (
            <form key={t.id} action={refundTransaction} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="note" value="Paiement reçu mais commande impossible : remboursement" />
              <span className="text-amber-300">Paiement {formatFcfa(t.total_amount)} à rembourser ({t.review_reason ?? "à vérifier"}) · Fapshi {t.fapshi_trans_id}</span>
              <button className="btn-ghost !px-3 !py-2">Marquer remboursé</button>
            </form>
          ))}
          {orders.filter((o) => o.disputed).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-amber-300">Litige {formatFcfa(d.total_price)} : {d.dispute_reason}</span>
              <form action={resolveDispute}>
                <input type="hidden" name="orderId" value={d.id} />
                <button className="btn-jade !px-3 !py-2">Valider le litige (libérer au vendeur)</button>
              </form>
            </div>
          ))}
        </section>
      )}

      <section className="glass p-5">
        <p className="label">Dernières commandes ({orders.length})</p>
        <ul className="divide-y divide-white/5 text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-zinc-200">
                {titles.get(o.product_id) ?? "Produit"} · {formatFcfa(o.total_price)} · {o.buyer_name ?? o.buyer_email}
                {o.disputed && <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">Litige</span>}
              </span>
              <span className="text-xs text-zinc-400">
                {o.payment_method === "cod" ? "Cash à la livraison" : o.payment_status === "paid" ? "Payé" : "Paiement : " + o.payment_status} · {orderStatusLabel(o)} · {new Date(o.created_at).toLocaleDateString("fr-FR")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
