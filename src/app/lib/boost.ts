import type { BoostPlan } from "@/lib/types";

// Tarifs du boost (FCFA entiers). Le prix est fixé ICI, côté serveur : jamais lu depuis le navigateur.
export const BOOST_PLANS: Record<BoostPlan, { days: number; price: number; label: string; badge: string; perk: string }> = {
  "3d": { days: 3, price: 1000, label: "Boost 3 jours", badge: "À la une", perk: "En haut de sa catégorie + badge « À la une »" },
  "7d": { days: 7, price: 2500, label: "Boost 7 jours", badge: "Populaire", perk: "En haut de la page d'accueil + badge « Populaire »" },
};

export function isBoostPlan(v: unknown): v is BoostPlan {
  return v === "3d" || v === "7d";
}
