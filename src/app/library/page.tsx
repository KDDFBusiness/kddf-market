import Link from "next/link";
import BuyerOrderActions from "@/components/BuyerOrderActions";
import SellerContact from "@/components/SellerContact";
import ReviewForm from "@/components/ReviewForm";
import Stars from "@/components/Stars";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS, orderStatusLabel } from "@/lib/labels";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes achats" };

type Row = Pick<Order, "id" | "seller_id" | "product_id" | "status" | "payment_status" | "payment_method" | "delivery_method" | "total_price" | "quantity" | "download_token" | "created_at" | "delivered_at" | "buyer_confirmed_at" | "disputed">;

export default async function Library() {
  const supabase = createClient();
  // RLS : un acheteur ne voit que ses propres commandes (buyer_id = lui)
  const { data } = await supabase
    .from("orders")
    .select("id, seller_id, product_id, status, payment_status, payment_method, delivery_method, total_price, quantity, download_token, created_at, delivered_at, buyer_confirmed_at, disputed")
    .or("payment_status.eq.paid,and(payment_method.eq.cod,status.neq.cancelled)")
    .order("created_at", { ascending: false });
  const orders = asRows<Row>(data);

  // Avis déjà donnés (RLS : l'acheteur ne voit que les siens)
  const reviewed = new Map<string, number>();
  if (orders.length > 0) {
    const { data: rv } = await supabase.from("reviews").select("order_id, rating").in("order_id", orders.map((o) => o.id));
    for (const r of asRows<{ order_id: string; rating: number }>(rv)) reviewed.set(r.order_id, r.rating);
  }
  const ids = Array.from(new Set(orders.map((o) => o.product_id)));
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: ps } = await supabase.from("products").select("id, title").in("id", ids);
    for (const p of asRows<{ id: string; title: string }>(ps)) titles.set(p.id, p.title);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold text-white">Mes achats</h1>
      {orders.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-zinc-400">Aucun achat pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const physical = o.delivery_method !== null;
            return (
              <article key={o.id} className="glass space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">{titles.get(o.product_id) ?? "Produit"}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</h2>
                    <p className="text-xs text-zinc-500">{new Date(o.created_at).toLocaleDateString("fr-FR")} · {formatFcfa(o.total_price)}</p>
                  </div>
                  {physical ? (
                    <span className="rounded-full bg-volt/15 px-3 py-1 text-xs font-medium text-volt-soft">{orderStatusLabel(o)}</span>
                  ) : (
                    <Link href={`/download/${o.download_token}`} className="btn-primary !px-4 !py-2">Télécharger</Link>
                  )}
                </div>
                {physical && o.delivery_method && (
                  <>
                    <p className="text-sm text-zinc-400">{DELIVERY_LABELS[o.delivery_method]}</p>
                    <Link href={`/download/${o.download_token}`} className="text-xs text-volt-soft underline">Voir le suivi détaillé</Link>
                    {o.status !== "cancelled" && <SellerContact sellerId={o.seller_id} productTitle={titles.get(o.product_id) ?? "ma commande"} />}
                    {o.buyer_confirmed_at && (reviewed.has(o.id) ? (
                      <p className="flex items-center gap-2 text-sm text-zinc-300">Votre avis : <Stars value={reviewed.get(o.id) ?? 0} /></p>
                    ) : (
                      <ReviewForm orderId={o.id} />
                    ))}
                    <BuyerOrderActions orderId={o.id} canConfirm={o.payment_status === "paid" && (o.status === "shipped" || o.status === "ready_for_pickup" || o.status === "delivered") && !o.buyer_confirmed_at} disputed={o.disputed} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
