// Catalogue : catégories, villes, tris (recherche et formulaires).
export const PRODUCT_CATEGORIES: readonly string[] = [
  "Chaussures", "Téléphones", "Habits", "Beauté", "Électronique", "Maison", "Accessoires",
  "Ebooks", "Formations", "Licences", "Coaching", "Services", "Autres",
];

export type SortKey = "recent" | "price_asc" | "price_desc" | "rating";

// Libellés demandés : "Moins cher au plus cher" = prix croissant, "Plus cher au moins cher" = prix décroissant.
export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Plus récent",
  price_asc: "Moins cher au plus cher",
  price_desc: "Plus cher au moins cher",
  rating: "Mieux notés",
};

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === "string" && v in SORT_LABELS;
}

/** Nettoie un texte de recherche (caractères spéciaux du filtre PostgREST retirés). */
export function cleanSearch(v: unknown): string {
  return typeof v === "string" ? v.replace(/[%,()*\\"'`;:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export function parsePrice(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 && n <= 100000000 ? n : null;
}
