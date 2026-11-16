import FlashError from "@/components/FlashError";
import Link from "next/link";
import VerifiedBadge from "@/components/VerifiedBadge";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import type { Profile } from "@/lib/types";
import { setBlocked, setVerified } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Vendeurs", robots: { index: false } };

type Seller = Pick<Profile, "id" | "full_name" | "store_name" | "store_slug" | "city" | "is_verified" | "is_blocked" | "created_at">;

export default async function AdminSellers({ searchParams }: { searchParams: { erreur?: string } }) {
  const supabase = createClient();
  // Vendeurs = comptes ayant au moins un produit (l'admin voit tout grâce aux règles RLS)
  const { data: pd } = await supabase.from("products").select("seller_id").limit(5000);
  const ids = Array.from(new Set(asRows<{ seller_id: string }>(pd).map((r) => r.seller_id)));
  let sellers: Seller[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, store_name, store_slug, city, is_verified, is_blocked, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    sellers = asRows<Seller>(data);
  }

  return (
    <div className="space-y-5">
      <FlashError code={searchParams.erreur} />
      <h1 className="font-display text-3xl font-bold text-white">Vendeurs ({sellers.length})</h1>
      {sellers.length === 0 ? (
        <p className="glass p-8 text-center text-sm text-zinc-400">Aucun vendeur pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {sellers.map((s) => (
            <li key={s.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="flex items-center gap-2 font-semibold text-white">
                  {s.store_name ?? s.full_name ?? "Sans nom"} {s.is_verified && <VerifiedBadge />}
                  {s.is_blocked && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Bloqué</span>}
                </p>
                <p className="text-xs text-zinc-500">{s.full_name ?? ""}{s.city ? ` · ${s.city}` : ""} · inscrit le {new Date(s.created_at).toLocaleDateString("fr-FR")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.store_slug && <Link href={`/boutique/${s.store_slug}`} className="btn-ghost !px-3 !py-2">Voir</Link>}
                <form action={setVerified}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="value" value={s.is_verified ? "0" : "1"} />
                  <button className="btn-jade !px-3 !py-2">{s.is_verified ? "Retirer le badge" : "Vérifier (badge bleu)"}</button>
                </form>
                <form action={setBlocked}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="value" value={s.is_blocked ? "0" : "1"} />
                  <button className="btn-ghost !px-3 !py-2 text-red-300">{s.is_blocked ? "Débloquer" : "Bloquer (arnaqueur)"}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
