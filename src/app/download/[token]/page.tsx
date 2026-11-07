import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre achat", robots: { index: false } };

export default async function DownloadPage({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) notFound();
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("id, status, product_id, products(title, type, booking_url, delivery_notes, duration_minutes)")
    .eq("download_token", params.token)
    .maybeSingle();
  if (!order) notFound();
  const product: any = order.products;

  if (order.status !== "paid") {
    return (
      <div className="glass mx-auto mt-16 max-w-lg space-y-3 p-8 text-center">
        <AutoRefresh seconds={5} />
        <h1 className="font-display text-2xl font-bold text-white">
          {order.status === "pending" ? "Paiement en cours de confirmation…" : "Paiement non abouti"}
        </h1>
        <p className="text-sm text-zinc-400">
          {order.status === "pending"
            ? "Cette page se met à jour automatiquement dès que votre paiement est confirmé. Les paiements crypto peuvent prendre quelques minutes."
            : "Votre paiement n'a pas été validé. Vous pouvez réessayer depuis la page du produit."}
        </p>
      </div>
    );
  }

  // Fichiers du produit + fichiers des produits d'une offre groupée
  let productIds = [order.product_id];
  if (product?.type === "bundle") {
    const { data: items } = await db.from("bundle_items").select("product_id").eq("bundle_id", order.product_id);
    productIds = [...productIds, ...(items ?? []).map((i: any) => i.product_id)];
  }
  const { data: files } = await db
    .from("product_files")
    .select("id, file_name, size_bytes, position, products(title)")
    .in("product_id", productIds)
    .order("position");

  const { data: license } = await db.from("license_keys").select("key").eq("order_id", order.id).maybeSingle();

  return (
    <div className="mx-auto mt-10 max-w-2xl space-y-5">
      <div className="glass animate-rise p-6 text-center">
        <p className="text-4xl">🎉</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Merci pour votre achat !</h1>
        <p className="mt-1 text-sm text-zinc-400">{product?.title}</p>
      </div>

      {license?.key && (
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

      {files && files.length > 0 && (
        <div className="glass divide-y divide-white/5">
          <p className="label p-5 !mb-0">Vos fichiers</p>
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{f.file_name}</p>
                <p className="text-xs text-zinc-500">
                  {f.products?.title}{f.size_bytes ? ` · ${(f.size_bytes / 1048576).toFixed(1)} Mo` : ""}
                </p>
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
