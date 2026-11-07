import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { TYPE_LABELS } from "@/components/ProductCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalogue" };

async function togglePublish(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const next = formData.get("next") === "true";
  // La RLS garantit qu'on ne modifie que ses propres produits
  await createClient().from("products").update({ is_published: next }).eq("id", id);
  revalidatePath("/dashboard/products");
}

async function removeProduct(formData: FormData) {
  "use server";
  await createClient().from("products").delete().eq("id", String(formData.get("id")));
  revalidatePath("/dashboard/products");
}

export default async function Products() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: products } = await supabase
    .from("products")
    .select("id, title, type, price_amount, price_currency, is_published, affiliate_enabled")
    .eq("creator_id", auth.user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-white">Catalogue</h1>
        <Link href="/dashboard/products/new" className="btn-primary">+ Nouveau produit</Link>
      </div>
      <div className="grid gap-3">
        {(products ?? []).map((p: any) => (
          <div key={p.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={`/p/${p.id}`} className="font-medium text-white hover:text-volt-soft">{p.title}</Link>
              <p className="text-xs text-zinc-500">
                {TYPE_LABELS[p.type]} · {formatMoney(Number(p.price_amount), p.price_currency)}
                {p.affiliate_enabled ? " · Affiliation activée" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={togglePublish}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="next" value={String(!p.is_published)} />
                <button className={p.is_published ? "btn-jade !px-3 !py-2" : "btn-ghost !px-3 !py-2"}>
                  {p.is_published ? "Publié" : "Brouillon"}
                </button>
              </form>
              <form action={removeProduct}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn-ghost !px-3 !py-2 hover:!border-red-400 hover:!text-red-300" aria-label={`Supprimer ${p.title}`}>Supprimer</button>
              </form>
            </div>
          </div>
        ))}
        {(!products || products.length === 0) && (
          <div className="glass p-10 text-center text-zinc-400">Aucun produit. Créez le premier !</div>
        )}
      </div>
    </div>
  );
}
