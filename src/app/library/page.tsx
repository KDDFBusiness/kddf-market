import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes achats" };

export default async function Library() {
  const { data: auth } = await createClient().auth.getUser();
  const email = auth.user?.email;
  const db = createAdminClient();
  const { data: orders } = await db
    .from("orders")
    .select("id, amount, currency, download_token, created_at, products(title)")
    .eq("status", "paid")
    .or(`buyer_id.eq.${auth.user!.id},buyer_email.eq.${email}`)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-white">Mes achats</h1>
      {orders && orders.length > 0 ? (
        <div className="grid gap-3">
          {orders.map((o: any) => (
            <Link key={o.id} href={`/download/${o.download_token}`} className="card-float flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-white">{o.products?.title}</p>
                <p className="text-xs text-zinc-500">{new Date(o.created_at).toLocaleDateString("fr-FR")} · {formatMoney(Number(o.amount), o.currency)}</p>
              </div>
              <span className="text-sm text-volt-soft">Ouvrir →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass p-8 text-center text-zinc-400">Vous n'avez pas encore d'achat.</div>
      )}
    </div>
  );
}
