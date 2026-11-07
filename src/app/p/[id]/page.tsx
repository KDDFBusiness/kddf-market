import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CheckoutForm from "@/components/CheckoutForm";
import ViewTracker from "@/components/ViewTracker";
import { TYPE_LABELS } from "@/components/ProductCard";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { data } = await createClient().from("products").select("title, description").eq("id", params.id).maybeSingle();
  return { title: data?.title ?? "Produit", description: data?.description?.slice(0, 150) };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: p } = await supabase
    .from("products")
    .select("id, title, description, type, cover_url, price_amount, price_currency, is_published, creator_id, duration_minutes")
    .eq("id", params.id)
    .maybeSingle();
  if (!p || !p.is_published) notFound();

  const { data: creator } = await supabase.from("profiles").select("full_name, store_name").eq("id", p.creator_id).maybeSingle();
  const { data: auth } = await supabase.auth.getUser();

  let bundleTitles: string[] = [];
  if (p.type === "bundle") {
    const { data: items } = await supabase.from("bundle_items").select("products!bundle_items_product_id_fkey(title)").eq("bundle_id", p.id);
    bundleTitles = (items ?? []).map((i: any) => i.products?.title).filter(Boolean);
  }

  return (
    <div className="grid gap-8 pt-4 lg:grid-cols-[1.1fr_1fr]">
      <ViewTracker productId={p.id} />
      <article className="animate-rise space-y-5">
        <div className="glass overflow-hidden">
          <div className="aspect-[16/9] bg-gradient-to-br from-volt/30 via-ink-800 to-jade/20">
            {p.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover_url} alt={p.title} className="h-full w-full object-cover" />
            )}
          </div>
        </div>
        <span className="rounded-full bg-volt/15 px-3 py-1 text-xs font-medium text-volt-soft">{TYPE_LABELS[p.type]}</span>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{p.title}</h1>
        <p className="text-sm text-zinc-400">Par {creator?.store_name || creator?.full_name || "un créateur"}{p.duration_minutes ? ` · ${p.duration_minutes} min` : ""}</p>
        {p.description && <p className="whitespace-pre-line leading-relaxed text-zinc-300">{p.description}</p>}
        {bundleTitles.length > 0 && (
          <div className="glass p-4">
            <p className="label">Inclus dans l'offre</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-zinc-300">
              {bundleTitles.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        )}
      </article>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <CheckoutForm
          product={{ id: p.id, title: p.title, price_amount: Number(p.price_amount), price_currency: p.price_currency }}
          defaultEmail={auth.user?.email ?? ""}
        />
      </aside>
    </div>
  );
}
