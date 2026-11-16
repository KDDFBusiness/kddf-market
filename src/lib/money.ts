// Tous les montants sont des ENTIERS en FCFA : jamais de nombre à virgule pour l'argent.

export const AFFILIATE_PERCENTS = [10, 20, 30, 40, 50] as const;
export const DEFAULT_AFFILIATE_PERCENT = 30;
export const MIN_PRICE_FCFA = 100; // minimum accepté par Fapshi

/** 10000 -> "10 000 FCFA" */
export function formatFcfa(amount: number): string {
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.trunc(amount));
  return `${n.replace(/[  ]/g, " ")} FCFA`;
}

export interface Split {
  platformPercent: number;
  platformFee: number;
  affiliatePercent: number;
  affiliateFee: number;
}

/**
 * Part de la plateforme et de l'affilié sur le prix des articles (hors livraison).
 *   AVEC affilié : plateforme 5 %  + affilié (10 à 50 %)  -> le vendeur reçoit le reste
 *   SANS affilié : plateforme 10 % (digital) ou 8 % (produit physique) -> le vendeur reçoit le reste
 * Divisions entières arrondies vers le bas (le reste va au vendeur).
 *
 * ATTENTION : c'est la copie EXACTE de la fonction SQL compute_split_for() de supabase/schema.sql.
 * Le calcul qui compte (celui qui crédite les portefeuilles) est fait dans la base, jamais ici :
 * cette copie sert seulement à afficher des aperçus.
 */
export function computeSplit(goods: number, hasAffiliate: boolean, affiliatePercent: number, physical = false): Split {
  if (!Number.isSafeInteger(goods) || goods < 0) throw new Error("Montant invalide");
  const platformPercent = hasAffiliate ? 5 : physical ? 8 : 10;
  const affPercent = hasAffiliate ? affiliatePercent : 0;
  return {
    platformPercent,
    platformFee: Math.floor((goods * platformPercent) / 100),
    affiliatePercent: affPercent,
    affiliateFee: Math.floor((goods * affPercent) / 100),
  };
}

/** Ce que reçoit le vendeur sur le prix des articles (avant ajout de la livraison). */
export function sellerShare(goods: number, hasAffiliate: boolean, affiliatePercent: number, physical = false): number {
  const s = computeSplit(goods, hasAffiliate, affiliatePercent, physical);
  return goods - s.platformFee - s.affiliateFee;
}
