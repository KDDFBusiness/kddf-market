import Stars from "@/components/Stars";
import VerifiedBadge from "@/components/VerifiedBadge";
import type { SellerTrust } from "@/lib/trust";

// Étoiles + nombre d'avis + avertissement "Vendeur peu fiable" (pour la page produit et la boutique).
export default function SellerTrustLine({ trust, tone = "dark" }: { trust: SellerTrust; tone?: "dark" | "light" }) {
  const muted = tone === "light" ? "text-slate-500" : "text-zinc-400";
  return (
    <div className="space-y-1.5">
      {trust.count > 0 ? (
        <p className={`flex flex-wrap items-center gap-2 text-sm ${muted}`}>
          <Stars value={trust.avg} />
          <span className="font-semibold">{trust.avg.toFixed(1)}</span>
          <span>({trust.count} avis)</span>
        </p>
      ) : (
        <p className={`text-xs ${muted}`}>Pas encore d&apos;avis</p>
      )}
      {trust.unreliable && (
        <p role="alert" className="inline-block rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-500">⚠️ Vendeur peu fiable</p>
      )}
    </div>
  );
}

export { VerifiedBadge };
