"use client";
import { explainError } from "@/lib/errors";
import { useState } from "react";
import { BOOST_PLANS } from "@/lib/boost";
import { formatFcfa } from "@/lib/money";
import type { BoostPlan } from "@/lib/types";

interface Props {
  productId: string;
  plans?: BoostPlan[];
  /** Texte personnalisé (ex : "Booster mon produit - 1 000 FCFA") pour un seul plan */
  label?: string;
}

// Lance le paiement Fapshi du boost puis redirige vers la page de paiement.
export default function BoostButtons({ productId, plans = ["3d", "7d"], label }: Props) {
  const [busy, setBusy] = useState<BoostPlan | null>(null);
  const [error, setError] = useState("");

  async function pay(plan: BoostPlan): Promise<void> {
    setBusy(plan);
    setError("");
    try {
      const res = await fetch("/api/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, plan }),
      });
      const json: unknown = await res.json().catch(() => null);
      const body = json !== null && typeof json === "object" ? (json as { url?: unknown; error?: unknown }) : {};
      if (res.ok && typeof body.url === "string") {
        window.location.href = body.url;
        return;
      }
      setError(typeof body.error === "string" ? body.error : explainError(undefined));
    } catch {
      setError(explainError("failed to fetch"));
    }
    setBusy(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {plans.map((plan) => (
          <button key={plan} type="button" onClick={() => pay(plan)} disabled={busy !== null} className="btn-primary !px-4 !py-2 text-xs">
            {busy === plan ? "Redirection…" : label ?? `${BOOST_PLANS[plan].label} - ${formatFcfa(BOOST_PLANS[plan].price)}`}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="whitespace-pre-line text-xs text-red-300">{error}</p>}
    </div>
  );
}
