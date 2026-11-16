import Link from "next/link";
import GuaranteeBadge from "@/components/GuaranteeBadge";
import TrackingButton from "@/components/TrackingButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";

interface OrderRow {
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string | null;
  buyer_id: string | null;
  seller_id: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  buyer_confirmed_at: string | null;
}

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
}

/**
 * Suivi de commande en 4 étapes, à placer EN HAUT de la page commande (produits physiques).
 * Les boutons n'apparaissent que pour la bonne personne (vendeur ou acheteur connecté) : la base revérifie tout.
 * Le paiement reste bloqué par KDDF Market tant que la commande n'est pas « Livrée » (règle existante, inchangée).
 */
export default async function OrderTracking({ orderId }: { orderId: string }) {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("status, payment_status, payment_method, delivery_method, buyer_id, seller_id, created_at, paid_at, delivered_at, buyer_confirmed_at")
    .eq("id", orderId)
    .maybeSingle();
  const o = asRow<OrderRow>(data);
  if (!o || !o.delivery_method) return null; // produits digitaux : pas de suivi

  if (o.status === "cancelled") {
    return <p className="glass p-4 text-center text-sm text-red-300">Cette commande a été annulée.</p>;
  }

  const { data: rows } = await db.from("order_tracking").select("status, updated_at").eq("order_id", orderId);
  const at: Record<string, string> = {};
  for (const r of asRows<{ status: string; updated_at: string }>(rows)) at[r.status] = r.updated_at;

  const pickup = o.delivery_method === "pickup_douala";
  const delivered = o.status === "delivered";
  const shipped = o.status === "shipped" || o.status === "ready_for_pickup" || delivered;
  const out = Boolean(at.out_for_delivery) || delivered;
  const reached = delivered ? 3 : out ? 2 : shipped ? 1 : 0;

  const steps = [
    { label: "Commande confirmée", icon: "✅", date: fmt(at.confirmed ?? o.paid_at ?? o.created_at) },
    { label: pickup ? "Prête pour retrait" : "Expédiée par le vendeur", icon: "📦", date: fmt(at.shipped ?? at.ready_for_pickup) },
    { label: pickup ? "Retrait du produit" : "En cours de livraison", icon: "🚚", date: pickup ? "" : fmt(at.out_for_delivery) },
    { label: "Livrée", icon: "🏠", date: fmt(at.delivered ?? o.delivered_at) },
  ];

  // Qui regarde la page ?
  const { data: auth } = await createClient().auth.getUser();
  const uid = auth.user?.id ?? null;
  const isSeller = uid !== null && uid === o.seller_id;
  const isBuyer = uid !== null && uid === o.buyer_id;
  const sellerCan = o.payment_status === "paid" || o.payment_method === "cod";
  const canShip = isSeller && sellerCan && (o.status === "pending" || o.status === "confirmed");
  const canOut = isSeller && sellerCan && o.status === "shipped" && !pickup && !at.out_for_delivery;
  const canReceive = isBuyer && o.payment_status === "paid" && o.buyer_confirmed_at === null && shipped;

  return (
    <section className="space-y-3">
      <div className="glass p-5">
        <p className="label">Suivi de votre commande</p>
        <ol className="flex items-start">
          {steps.map((s, i) => {
            const done = i < reached || reached === 3;
            const current = i === reached && reached < 3;
            const circle = done ? "bg-jade text-ink-950" : current ? "bg-volt text-white" : "bg-white/10 text-zinc-500";
            return (
              <li key={s.label} className="relative flex-1 text-center">
                {i > 0 && <span aria-hidden className={`absolute right-1/2 top-4 h-0.5 w-full ${i <= reached || reached === 3 ? "bg-jade" : "bg-white/10"}`} />}
                <span className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm ${circle}`}>{s.icon}</span>
                <p className={`mt-2 px-1 text-[11px] leading-tight sm:text-xs ${done ? "text-jade-soft" : current ? "font-semibold text-white" : "text-zinc-500"}`}>{s.label}</p>
                <p className="mt-0.5 min-h-[1rem] text-[10px] text-zinc-500">{s.date}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-center text-xs text-zinc-500">Votre paiement reste sécurisé par KDDF Market jusqu&apos;à la livraison.</p>
      </div>

      {(canShip || canOut || canReceive) && (
        <div className="glass flex flex-wrap gap-3 p-4">
          {canShip && <TrackingButton orderId={orderId} op="ship" tone="primary" label={pickup ? "Marquer comme Prêt pour retrait" : "Marquer comme Expédié"} />}
          {canOut && <TrackingButton orderId={orderId} op="out" tone="primary" label="Marquer comme En cours de livraison" />}
          {canReceive && <TrackingButton orderId={orderId} op="receive" tone="jade" label="Confirmer la réception" />}
        </div>
      )}
      {!isBuyer && !isSeller && shipped && !delivered && (
        <p className="text-center text-xs text-zinc-500">
          Pour confirmer la réception, connectez-vous avec le compte utilisé pour l&apos;achat et ouvrez « <Link href="/library" className="underline">Mes achats</Link> ».
        </p>
      )}
      <GuaranteeBadge />
    </section>
  );
}
