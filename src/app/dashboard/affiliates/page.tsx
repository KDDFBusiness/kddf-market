import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import JoinAffiliate from "@/components/JoinAffiliate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliation" };

export default async function Affiliates() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user!.id;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Mes inscriptions en tant qu'affilié
  const { data: mine } = await supabase.from("affiliates").select("id, code, creator_id").eq("user_id", uid);
  // Affiliés qui vendent MES produits
  const { data: mine2 } = await supabase.from("affiliates").select("id, code, user_id, profiles!affiliates_user_id_fkey(full_name)").eq("creator_id", uid);
  // Mes commissions gagnées / à payer
  const { data: commissions } = await supabase
    .from("commissions")
    .select("id, amount, currency, status, affiliate_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const myAffIds = new Set((mine ?? []).map((a: any) => a.id));
  const earned: Record<string, number> = {};
  (commissions ?? []).filter((c: any) => myAffIds.has(c.affiliate_id)).forEach((c: any) => {
    earned[c.currency] = (earned[c.currency] ?? 0) + Number(c.amount);
  });

  // Programmes ouverts des autres créateurs
  const { data: open } = await supabase
    .from("products")
    .select("id, title, creator_id, affiliate_percent, price_amount, price_currency")
    .eq("is_published", true)
    .eq("affiliate_enabled", true)
    .neq("creator_id", uid);
  const joined = new Set((mine ?? []).map((a: any) => a.creator_id));
  const codeByCreator = Object.fromEntries((mine ?? []).map((a: any) => [a.creator_id, a.code]));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold text-white">Affiliation</h1>

      <section className="space-y-3">
        <h2 className="label">Programmes ouverts</h2>
        {(open ?? []).map((p: any) => (
          <div key={p.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium text-white">{p.title}</p>
              <p className="text-xs text-zinc-500">
                {formatMoney(Number(p.price_amount), p.price_currency)} · {p.affiliate_percent} % de commission
              </p>
              {joined.has(p.creator_id) && (
                <p className="mt-2 select-all break-all rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs text-jade-soft">
                  {appUrl}/p/{p.id}?ref={codeByCreator[p.creator_id]}
                </p>
              )}
            </div>
            {!joined.has(p.creator_id) && <JoinAffiliate creatorId={p.creator_id} />}
          </div>
        ))}
        {(!open || open.length === 0) && <div className="glass p-6 text-sm text-zinc-500">Aucun programme ouvert pour le moment.</div>}
      </section>

      <section className="space-y-3">
        <h2 className="label">Mes gains d'affilié</h2>
        <div className="glass p-5 font-display text-xl font-bold text-white">
          {Object.entries(earned).map(([c, v]) => formatMoney(v, c)).join(" · ") || "0"}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Mes affiliés (sur mes produits)</h2>
        <div className="glass divide-y divide-white/5">
          {(mine2 ?? []).map((a: any) => (
            <div key={a.id} className="flex justify-between p-4 text-sm">
              <span className="text-white">{a.profiles?.full_name ?? "Affilié"}</span>
              <span className="font-mono text-zinc-500">{a.code}</span>
            </div>
          ))}
          {(!mine2 || mine2.length === 0) && <p className="p-6 text-sm text-zinc-500">Aucun affilié. Activez l'affiliation sur vos produits pour en recruter.</p>}
        </div>
      </section>
    </div>
  );
}
