// Règles d'alerte "produit invisible" (période : 3 jours).
export interface Activity {
  product_id: string;
  title: string;
  created_at: string;
  is_published: boolean;
  views_total: number;
  views_3d: number;
  sales_3d: number;
  shares_3d: number;
  last_activity: string;
  price: number;
}

const DAY = 86400000;

/** Un produit n'est jugé qu'après 3 jours de vie : avant, il est simplement "nouveau". */
export function isOldEnough(a: Activity): boolean {
  return Date.now() - new Date(a.created_at).getTime() >= 3 * DAY;
}

/** Alerte si : 0 vente ET 0 partage depuis 3 jours, OU moins de 10 vues en 3 jours. */
export function needsAlert(a: Activity): boolean {
  if (!a.is_published || !isOldEnough(a)) return false;
  return (Number(a.sales_3d) === 0 && Number(a.shares_3d) === 0) || Number(a.views_3d) < 10;
}

export type Health = { tone: "green" | "orange" | "red"; label: string };

export function healthOf(a: Activity): Health {
  const v3 = Number(a.views_3d);
  if (!isOldEnough(a)) return { tone: "green", label: `Nouveau - ${Number(a.views_total)} vues` };
  if (v3 === 0) return { tone: "red", label: "Invisible - 0 vue depuis 3 jours" };
  if (v3 < 10) return { tone: "orange", label: "Peu vu - Partage-le" };
  return { tone: "green", label: `Actif - ${v3} vues` };
}

export function toActivity(row: unknown): Activity | null {
  if (row === null || typeof row !== "object") return null;
  return row as Activity;
}
