import FlashError from "@/components/FlashError";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa, AFFILIATE_PERCENTS } from "@/lib/money";
import { productTypeLabel } from "@/lib/labels";
import { healthOf, type Activity } from "@/lib/activity";
import type { Product } from "@/lib/types";
import { deleteProduct, saveAffiliateSettings, togglePublish, updateStock } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue" };

type Row = Pick<Product, "id" | "title" | "price" | "product_type" | "digital_kind" | "stock" | "is_published" | "affiliate_enabled" | "affiliate_percent" | "moderation_status" | "moderation_note">;

export default async function ProductsPage({ searchParams }: { searchParams: { erreur?: string; created?: string } }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await createClient()
    .from("products")
    .select("id, title, price, product_type, digital_kind, stock, is_published, affiliate_enabled, affiliate_percent, moderation_status, moderation_note")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });
  const products = asRows<Row>(data);
  const { data: actData } = await createClient()
    .from("seller_product_activity")
    .select("product_id, title, created_at, is_published, views_total, views_3d, sales_3d, shares_3d, last_activity, price")
    .eq("seller_id", user.id);
  const activity = new Map(asRows<Activity>(actData).map((a) => [a.product_id, a]));

  return (
    <div className="space-y-5">
      <FlashError code={searchParams.erreur} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold text-white">Catalogue</h1>
        <Link href="/dashboard/products/new" className="btn-primary">+ Nouveau produit</Link>
      </div>

      {searchParams.created === "1" && (
        <p role="status" className="rounded-xl bg-jade/15 px-4 py-3 text-sm text-jade-soft">Produit créé. Il sera visible dans la boutique dès que KDDF Market l&apos;aura validé.</p>
      )}

      {products.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-zinc-400">Aucun produit. Créez le premier !</p>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <article key={p.id} className="glass space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/p/${p.id}`} className="font-display text-lg font-semibold text-white hover:text-volt-soft">{p.title}</Link>
                  <p className="text-sm text-zinc-400">{productTypeLabel(p)} · {formatFcfa(p.price)}</p>
                  {p.moderation_status === "pending" && <span className="mt-1 inline-block rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-300">En attente de validation</span>}
                  {p.moderation_status === "rejected" && (
                    <span className="mt-1 inline-block rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300">Refusé{p.moderation_note ? ` : ${p.moderation_note}` : ""}</span>
                  )}
                  {p.is_published && p.moderation_status === "approved" && activity.get(p.id) && (() => {
                    const h = healthOf(activity.get(p.id) as Activity);
                    const color = h.tone === "green" ? "bg-jade/15 text-jade-soft" : h.tone === "orange" ? "bg-orange-500/20 text-orange-300" : "bg-red-500/20 text-red-300";
                    return <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{h.label}</span>;
                  })()}
                </div>
                <div className="flex gap-2">
                  <form action={togglePublish}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="publish" value={p.is_published ? "0" : "1"} />
                    <button className={p.is_published ? "btn-ghost !px-3 !py-2" : "btn-jade !px-3 !py-2"}>{p.is_published ? "Dépublier" : "Publier"}</button>
                  </form>
                  <form action={deleteProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn-ghost !px-3 !py-2 text-red-300">Supprimer</button>
                  </form>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-6 border-t border-white/5 pt-4">
                <form action={saveAffiliateSettings} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" name="enabled" defaultChecked={p.affiliate_enabled} className="accent-indigo-500" /> Affiliation
                  </label>
                  <div>
                    <label className="label" htmlFor={`pct-${p.id}`}>Commission affilié</label>
                    <select id={`pct-${p.id}`} name="percent" defaultValue={String(p.affiliate_percent)} className="input !w-28 !py-2">
                      {AFFILIATE_PERCENTS.map((n) => <option key={n} value={n}>{n} %</option>)}
                    </select>
                  </div>
                  <button className="btn-ghost !px-3 !py-2">Enregistrer</button>
                </form>

                {p.product_type === "physical" && (
                  <form action={updateStock} className="flex items-end gap-3">
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <label className="label" htmlFor={`stock-${p.id}`}>Stock</label>
                      <input id={`stock-${p.id}`} name="stock" type="number" min={0} defaultValue={p.stock ?? 0} className="input !w-28 !py-2" />
                    </div>
                    <button className="btn-ghost !px-3 !py-2">Mettre à jour</button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
