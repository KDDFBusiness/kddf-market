import { createClient } from "@/lib/supabase/server";
import AutoRefresh from "@/components/AutoRefresh";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau de bord" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-float p-5">
      <p className="label !mb-2">{label}</p>
      <p className="font-display text-2xl font-extrabold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user!.id;

  const { data: orders } = await supabase
    .from("orders")
    .select("id, amount, currency, platform_fee, affiliate_fee, status, buyer_email, created_at, paid_at, products(title)")
    .eq("creator_id", uid)
    .order("created_at", { ascending: false })
    .limit(500);
  const { data: stats } = await supabase.from("creator_stats").select("*").eq("creator_id", uid);

  const paid = (orders ?? []).filter((o: any) => o.status === "paid");

  // Revenu net par devise (on n'additionne jamais des devises différentes)
  const net: Record<string, number> = {};
  paid.forEach((o: any) => {
    net[o.currency] = (net[o.currency] ?? 0) + Number(o.amount) - Number(o.platform_fee) - Number(o.affiliate_fee);
  });
  const netText = Object.entries(net).map(([c, v]) => formatMoney(v, c)).join(" · ") || "0";

  const views = (stats ?? []).reduce((s: number, r: any) => s + Number(r.views), 0);
  const sales = paid.length;
  const conversion = views > 0 ? ((sales / views) * 100).toFixed(1) + " %" : "—";

  // Ventes des 14 derniers jours
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      count: paid.filter((o: any) => (o.paid_at ?? o.created_at).slice(0, 10) === key).length,
    });
  }
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold text-white">Vue d'ensemble</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-jade/15 px-2.5 py-1 text-[11px] text-jade-soft">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-jade" /> Temps réel
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenu net" value={netText} sub="Après commissions" />
        <Stat label="Ventes" value={String(sales)} />
        <Stat label="Visites" value={String(views)} />
        <Stat label="Conversion" value={conversion} />
      </div>

      <section className="glass p-5">
        <h2 className="label">Ventes · 14 derniers jours</h2>
        <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label="Graphique des ventes par jour">
          {days.map((d) => (
            <div key={d.label} className="group flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-zinc-500 opacity-0 transition group-hover:opacity-100">{d.count}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-volt to-volt-soft transition group-hover:from-jade group-hover:to-jade-soft"
                style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }}
              />
              <span className="hidden text-[9px] text-zinc-600 sm:block">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="glass overflow-hidden">
        <h2 className="label p-5 !mb-0">Dernières commandes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="px-5 py-2">Produit</th><th>Acheteur</th><th>Montant</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {(orders ?? []).slice(0, 10).map((o: any) => (
                <tr key={o.id} className="border-t border-white/5">
                  <td className="px-5 py-3 text-white">{o.products?.title}</td>
                  <td className="text-zinc-400">{o.buyer_email}</td>
                  <td>{formatMoney(Number(o.amount), o.currency)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${o.status === "paid" ? "bg-jade/15 text-jade-soft" : o.status === "pending" ? "bg-yellow-500/15 text-yellow-300" : "bg-red-500/15 text-red-300"}`}>
                      {o.status === "paid" ? "Payée" : o.status === "pending" ? "En attente" : "Échouée"}
                    </span>
                  </td>
                </tr>
              ))}
              {(!orders || orders.length === 0) && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-zinc-500">Aucune commande pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass overflow-hidden">
        <h2 className="label p-5 !mb-0">Performance par produit</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="px-5 py-2">Produit</th><th>Visites</th><th>Ventes</th><th>Conversion</th></tr>
            </thead>
            <tbody>
              {(stats ?? []).map((s: any) => (
                <tr key={s.product_id} className="border-t border-white/5">
                  <td className="px-5 py-3 text-white">{s.title}</td>
                  <td>{s.views}</td>
                  <td>{s.sales}</td>
                  <td>{Number(s.views) > 0 ? ((Number(s.sales) / Number(s.views)) * 100).toFixed(1) + " %" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
