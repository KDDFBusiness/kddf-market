import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductCard from "@/components/ProductCard";

export const revalidate = 30;

export default async function Home() {
  const supabase = createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, title, type, cover_url, price_amount, price_currency")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(24);

  return (
    <div className="space-y-16">
      <section className="animate-rise pt-10 text-center sm:pt-20">
        <p className="mx-auto mb-5 w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-300">
          Mobile Money · Cartes · PayPal · Crypto
        </p>
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
          Vendez vos produits digitaux <span className="bg-gradient-to-r from-volt-soft to-jade bg-clip-text text-transparent">partout dans le monde</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-zinc-400">
          Ebooks, formations vidéo, licences, coaching et services. Livraison automatique, affiliation intégrée, encaissement universel.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login?mode=signup" className="btn-primary">Créer ma boutique</Link>
          <a href="#catalogue" className="btn-ghost">Explorer le catalogue</a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Livraison instantanée", "Email de confirmation et portail de téléchargement sécurisé dès le paiement."],
          ["Paiement universel", "Orange Money, MTN MoMo, Wave, cartes, PayPal, Apple/Google Pay, BTC, ETH, USDT."],
          ["Affiliation intégrée", "Recrutez des affiliés et versez des commissions automatiquement calculées."],
        ].map(([t, d]) => (
          <div key={t} className="glass p-5">
            <h3 className="font-display font-semibold text-white">{t}</h3>
            <p className="mt-2 text-sm text-zinc-400">{d}</p>
          </div>
        ))}
      </section>

      <section id="catalogue" className="scroll-mt-24">
        <h2 className="mb-5 font-display text-2xl font-bold text-white">Catalogue</h2>
        {products && products.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p: any) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="glass p-10 text-center text-zinc-400">Aucun produit publié pour le moment.</div>
        )}
      </section>
    </div>
  );
}
