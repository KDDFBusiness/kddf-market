import { notFound } from "next/navigation";
import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import SellerContact from "@/components/SellerContact";
import OrderTracking from "@/components/OrderTracking";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFapshiTransaction } from "@/lib/fulfillment";
import { asRow, asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, orderStatusLabel, orderSteps } from "@/lib/labels";
import { isUuid } from "@/lib/validate";
import type { Order, Product } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre achat", robots: { index: false } };

type OrderView = Pick<Order, "id" | "seller_id" | "product_id" | "status" | "payment_status" | "payment_method" | "delivery_method" | "total_price" | "quantity" | "delivery_address" | "phone">;
type ProductView = Pick<Product, "title" | "product_type" | "digital_kind" | "booking_url" | "delivery_notes" | "duration_minutes">;
interface FileRow { id: string; file_name: string; size_bytes: number | null; product_id: string }

export default async function DownloadPage({ params }: { params: { token: string } }) {
  if (!isUuid(params.token)) notFound();
  const db = createAdminClient();

  const read = async (): Promise<OrderView | null> => {
    const { data } = await db
      .from("orders")
      .select("id, seller_id, product_id, status, payment_status, payment_method, delivery_method, total_price, quantity, delivery_address, phone")
      .eq("download_token", params.token)
      .maybeSingle();
    return asRow<OrderView>(data);
  };

  let order = await read();
  if (!order) notFound();

  // Retour depuis Fapshi : si le webhook n'est pas encore arrivé, on vérifie nous-mêmes le paiement chez Fapshi.
  if (order.payment_method === "online" && (order.payment_status === "pending" || order.payment_status === "failed")) {
    const { data: tx } = await db.from("transactions").select("fapshi_trans_id").eq("order_id", order.id).maybeSingle();
    const transId = asRow<{ fapshi_trans_id: string | null }>(tx)?.fapshi_trans_id;
    if (transId) {
      await syncFapshiTransaction(transId, { source: "verification", minAgeSeconds: 12 });
      order = (await read()) ?? order;
    }
  }

  const cashPending = order.payment_method === "cod" && order.payment_status === "pending" && order.status !== "cancelled";
  if (order.payment_method === "cod" && order.status === "cancelled") {
    return (
      <div className="glass mx-auto mt-16 max-w-lg space-y-3 p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Commande annulée</h1>
        <p className="text-sm text-zinc-400">Cette commande a été annulée. Vous n&apos;avez rien payé.</p>
        <Link href={`/p/${order.product_id}`} className="btn-primary">Revoir le produit</Link>
      </div>
    );
  }
  if (order.payment_status !== "paid" && !cashPending) {
    const waiting = order.payment_status === "pending";
    return (
      <div className="glass mx-auto mt-16 max-w-lg space-y-3 p-8 text-center">
        {waiting && <AutoRefresh seconds={6} />}
        <h1 className="font-display text-2xl font-bold text-white">{waiting ? "Paiement en cours de confirmation…" : "Paiement non abouti"}</h1>
        <p className="text-sm text-zinc-400">
          {waiting
            ? "Cette page se met à jour automatiquement dès que votre paiement est confirmé. Validez la demande sur votre téléphone si elle n'est pas encore apparue."
            : "Votre paiement n'a pas été validé et vous n'avez pas été débité. Vous pouvez réessayer depuis la page du produit."}
        </p>
        {!waiting && <Link href={`/p/${order.product_id}`} className="btn-primary">Réessayer</Link>}
      </div>
    );
  }

  const { data: productRow } = await db
    .from("products")
    .select("title, product_type, digital_kind, booking_url, delivery_notes, duration_minutes")
    .eq("id", order.product_id)
    .maybeSingle();
  const product = asRow<ProductView>(productRow);

  // ---------- Produit PHYSIQUE : suivi de commande (pas de bouton Télécharger) ----------
  if (product?.product_type === "physical" && order.delivery_method) {
    const steps = orderSteps(order.delivery_method);
    const current = order.status === "cancelled" ? -1 : steps.indexOf(order.status);
    return (
      <div className="mx-auto mt-10 max-w-2xl space-y-5">
        <div className="glass animate-rise p-6 text-center">
          <p className="text-4xl">📦</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">Commande confirmée</h1>
          {cashPending && <p className="mt-2 inline-block rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200">{orderStatusLabel(order)}</p>}
          <p className="mt-1 text-sm text-zinc-400">{product.title} × {order.quantity} · {formatFcfa(order.total_price)}</p>
        </div>
        <OrderTracking orderId={order.id} />
        <ol className="glass space-y-3 p-5">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 text-sm ${i <= current ? "text-white" : "text-zinc-500"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i <= current ? "bg-jade text-ink-950" : "bg-white/10"}`}>{i < current ? "✓" : i + 1}</span>
              {ORDER_STATUS_LABELS[s]}
            </li>
          ))}
        </ol>
        <div className="glass space-y-1 p-5 text-sm text-zinc-300">
          <p><span className="text-zinc-500">Livraison :</span> {DELIVERY_LABELS[order.delivery_method]}</p>
          {order.delivery_address && <p><span className="text-zinc-500">Adresse :</span> {order.delivery_address}</p>}
          {order.phone && <p><span className="text-zinc-500">Téléphone :</span> {order.phone}</p>}
        </div>
        {/* Paiement confirmé + produit physique : le contact du vendeur est maintenant débloqué */}
        <SellerContact sellerId={order.seller_id} productTitle={product.title} />
        <p className="text-center text-xs text-zinc-500">
          {cashPending ? "Vous réglez le montant en cash au vendeur à la réception. " : ""}Retrouvez cette commande dans « <Link href="/library" className="underline">Mes achats</Link> » pour confirmer la réception.
        </p>
        <AutoRefresh seconds={30} />
      </div>
    );
  }

  // ---------- Produit DIGITAL : portail de téléchargement ----------
  let productIds: string[] = [order.product_id];
  if (product?.digital_kind === "bundle") {
    const { data: items } = await db.from("bundle_items").select("product_id").eq("bundle_id", order.product_id);
    productIds = [...productIds, ...asRows<{ product_id: string }>(items).map((i) => i.product_id)];
  }
  const { data: filesData } = await db
    .from("product_files")
    .select("id, file_name, size_bytes, product_id")
    .in("product_id", productIds)
    .order("position");
  const files = asRows<FileRow>(filesData);
  const { data: licenseRow } = await db.from("license_keys").select("key").eq("order_id", order.id).maybeSingle();
  const license = asRow<{ key: string }>(licenseRow);

  return (
    <div className="mx-auto mt-10 max-w-2xl space-y-5">
      <div className="glass animate-rise p-6 text-center">
        <p className="text-4xl">🎉</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Merci pour votre achat !</h1>
        <p className="mt-1 text-sm text-zinc-400">{product?.title}</p>
      </div>

      {license && (
        <div className="glass p-5">
          <p className="label">Votre clé de licence</p>
          <p className="select-all break-all rounded-xl bg-ink-900 p-3 font-mono text-jade-soft">{license.key}</p>
        </div>
      )}

      {product?.booking_url && (
        <a href={product.booking_url} target="_blank" rel="noopener noreferrer" className="btn-jade w-full">
          Réserver ma session{product.duration_minutes ? ` (${product.duration_minutes} min)` : ""}
        </a>
      )}
      {product?.delivery_notes && (
        <div className="glass p-5">
          <p className="label">Instructions</p>
          <p className="whitespace-pre-line text-sm text-zinc-300">{product.delivery_notes}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="glass divide-y divide-white/5">
          <p className="label !mb-0 p-5">Vos fichiers</p>
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{f.file_name}</p>
                {f.size_bytes !== null && <p className="text-xs text-zinc-500">{(f.size_bytes / 1048576).toFixed(1)} Mo</p>}
              </div>
              <a href={`/api/download/${params.token}/${f.id}`} className="btn-primary !px-4 !py-2">Télécharger</a>
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-xs text-zinc-500">Un email de confirmation contenant ce lien vous a été envoyé.</p>
    </div>
  );
}
