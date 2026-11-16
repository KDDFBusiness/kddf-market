import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { needsAlert, type Activity } from "@/lib/activity";
import { productUrl, shareLinks } from "@/lib/share";
import { BOOST_PLANS } from "@/lib/boost";
import { formatFcfa } from "@/lib/money";
import BoostButtons from "@/components/BoostButtons";

// Bandeaux orange : produits publiés depuis 3 jours ou plus qui n'ont presque pas de visiteurs.
export default async function InactivityAlerts() {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await createClient()
    .from("seller_product_activity")
    .select("product_id, title, created_at, is_published, views_total, views_3d, sales_3d, shares_3d, last_activity, price")
    .eq("seller_id", user.id);
  const alerts = asRows<Activity>(data)
    .filter(needsAlert)
    .sort((a, b) => Number(a.views_3d) - Number(b.views_3d))
    .slice(0, 3);
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3" role="alert">
      {alerts.map((a) => {
        const views = Number(a.views_3d);
        const wa = shareLinks(a.title, a.price, productUrl(a.product_id)).whatsapp;
        return (
          <div key={a.product_id} className="space-y-3 rounded-2xl border border-orange-400/40 bg-orange-500/15 p-4">
            <p className="text-sm font-semibold text-orange-100">
              ⚠️ Ton produit « {a.title} » n&apos;a eu que {views} vue{views > 1 ? "s" : ""} en 3 jours. Il est invisible !
            </p>
            <div className="flex flex-wrap items-start gap-2">
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-jade !px-4 !py-2 text-xs">Partager maintenant sur WhatsApp</a>
              <BoostButtons productId={a.product_id} plans={["3d"]} label={`Booster mon produit - ${formatFcfa(BOOST_PLANS["3d"].price)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
