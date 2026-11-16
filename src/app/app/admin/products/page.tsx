import FlashError from "@/components/FlashError";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { formatFcfa } from "@/lib/money";
import { productTypeLabel } from "@/lib/labels";
import type { Product } from "@/lib/types";
import { moderateProduct } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Produits à valider", robots: { index: false } };

type Row = Pick<Product, "id" | "seller_id" | "title" | "price" | "product_type" | "digital_kind" | "category" | "description" | "cover_url" | "images" | "created_at">;

export default async function AdminProducts({ searchParams }: { searchParams: { erreur?: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select("id, seller_id, title, price, product_type, digital_kind, category, description, cover_url, images, created_at")
    .eq("moderation_status", "pending")
    .order("created_at");
  const products = asRows<Row>(data);

  const names = new Map<string, string>();
  const ids = Array.from(new Set(products.map((p) => p.seller_id)));
  if (ids.length > 0) {
    const { data: pr } = await supabase.from("profiles").select("id, store_name, full_name").in("id", ids);
    for (const r of asRows<{ id: string; store_name: string | null; full_name: string | null }>(pr)) names.set(r.id, r.store_name ?? r.full_name ?? "Vendeur");
  }

  return (
    <div className="space-y-5">
      <FlashError code={searchParams.erreur} />
      <h1 className="font-display text-3xl font-bold text-white">Produits à valider ({products.length})</h1>
      {products.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-zinc-400">Aucun produit en attente.</p>
      ) : (
        <ul className="space-y-4">
          {products.map((p) => {
            const image = p.product_type === "physical" ? p.images[0] ?? p.cover_url : p.cover_url;
            return (
              <li key={p.id} className="glass flex flex-col gap-4 p-5 sm:flex-row">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={p.title} className="h-28 w-28 shrink-0 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-display text-lg font-semibold text-white">{p.title}</p>
                  <p className="text-sm text-zinc-400">{productTypeLabel(p)}{p.category ? ` · ${p.category}` : ""} · {formatFcfa(p.price)} · par {names.get(p.seller_id) ?? "Vendeur"}</p>
                  {p.description && <p className="line-clamp-3 text-sm text-zinc-300">{p.description}</p>}
                  <Link href={`/p/${p.id}`} className="text-xs text-volt-soft underline" target="_blank">Voir la page du produit</Link>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <form action={moderateProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="btn-jade !px-3 !py-2">Approuver</button>
                    </form>
                    <form action={moderateProduct} className="flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input name="note" placeholder="Motif du refus (facultatif)" className="input !w-56 !py-2" maxLength={200} />
                      <button className="btn-ghost !px-3 !py-2 text-red-300">Refuser</button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
