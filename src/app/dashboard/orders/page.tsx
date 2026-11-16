import FlashError from "@/components/FlashError";
import AutoRefresh from "@/components/AutoRefresh";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS, nextStatusActions, orderStatusLabel } from "@/lib/labels";
import { whatsappLink } from "@/lib/phone";
import type { Order } from "@/lib/types";
import { cancelCodOrder, changeOrderStatus, confirmCash } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commandes" };

type Row = Pick<Order, "id" | "product_id" | "status" | "delivery_method" | "total_price" | "quantity" | "buyer_name" | "buyer_email" | "phone" | "delivery_address" | "created_at" | "disputed" | "dispute_reason" | "payment_method" | "payment_status">;

export default async function OrdersPage({ searchParams }: { searchParams: { erreur?: string } }) {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createClient();
  // Commandes payées + commandes « paiement à la livraison » non annulées (RLS) ; ici uniquement les produits physiques.
  const { data } = await supabase
    .from("orders")
    .select("id, product_id, status, delivery_method, total_price, quantity, buyer_name, buyer_email, phone, delivery_address, created_at, disputed, dispute_reason, payment_method, payment_status")
    .eq("seller_id", user.id)
    .or("payment_status.eq.paid,and(payment_method.eq.cod,status.neq.cancelled)")
    .not("delivery_method", "is", null)
    .order("created_at", { ascending: false });
  const orders = asRows<Row>(data);

  const titles = new Map<string, string>();
  const ids = Array.from(new Set(orders.map((o) => o.product_id)));
  if (ids.length > 0) {
    const { data: ps } = await supabase.from("products").select("id, title").in("id", ids);
    for (const p of asRows<{ id: string; title: string }>(ps)) titles.set(p.id, p.title);
  }

  return (
    <div className="space-y-5">
      <FlashError code={searchParams.erreur} />
      <AutoRefresh seconds={30} />
      <h1 className="font-display text-3xl font-bold text-white">Commandes (produits physiques)</h1>
      {orders.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-zinc-400">Aucune commande pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const method = o.delivery_method;
            const cashPending = o.payment_method === "cod" && o.payment_status === "pending" && o.status !== "cancelled";
            // Paiement à la livraison : on ne « livre » jamais sans encaisser (bouton « Cash encaissé »)
            const actions = method ? nextStatusActions(o.status, method).filter((a) => !(cashPending && a.status === "delivered")) : [];
            const title = titles.get(o.product_id) ?? "Produit";
            return (
              <article key={o.id} className="glass space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">{title} × {o.quantity}</h2>
                    <p className="text-xs text-zinc-500">{new Date(o.created_at).toLocaleString("fr-FR")} · {formatFcfa(o.total_price)}</p>
                  </div>
                  <span className="rounded-full bg-volt/15 px-3 py-1 text-xs font-medium text-volt-soft">{orderStatusLabel(o)}</span>
                </div>
                <div className="space-y-1 text-sm text-zinc-300">
                  <p>{o.buyer_name ?? o.buyer_email}{o.phone ? ` · ${o.phone}` : ""}</p>
                  {method && <p className="text-zinc-400">{DELIVERY_LABELS[method]}</p>}
                  {o.delivery_address && <p className="text-zinc-400">{o.delivery_address}</p>}
                  {cashPending && <p className="text-amber-300">💵 Paiement cash à la livraison : le client paie {formatFcfa(o.total_price)} en main propre. Commission KDDF 8 % déduite de votre prochain retrait.</p>}
                  {o.disputed && <p className="text-amber-300">Litige ouvert par l&apos;acheteur : {o.dispute_reason}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {cashPending && (o.status === "shipped" || o.status === "ready_for_pickup" || o.status === "confirmed") && (
                    <form action={confirmCash}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="btn-jade !px-4 !py-2">Cash encaissé (livrée)</button>
                    </form>
                  )}
                  {cashPending && (
                    <form action={cancelCodOrder}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="btn-ghost !px-4 !py-2 text-red-300">Annuler la commande</button>
                    </form>
                  )}
                  {actions.map((a) => (
                    <form key={a.status} action={changeOrderStatus}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="status" value={a.status} />
                      <button className="btn-primary !px-4 !py-2">{a.label}</button>
                    </form>
                  ))}
                  {o.phone && (
                    <a className="btn-ghost !px-4 !py-2" target="_blank" rel="noopener noreferrer" href={whatsappLink(o.phone, `Bonjour, concernant votre commande « ${title} » sur KDDF Market…`)}>
                      WhatsApp client
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
