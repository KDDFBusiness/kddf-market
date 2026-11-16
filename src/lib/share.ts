import { appUrl } from "@/lib/env";
import { formatFcfa } from "@/lib/money";

/** Adresse publique d'une fiche produit. */
export function productUrl(productId: string): string {
  return `${appUrl()}/p/${productId}`;
}

/** Texte partagé : « Découvre ce produit sur KDDF Market : [Nom] - [Prix] 👉 [lien] » */
export function shareText(title: string, price: number, url: string): string {
  return `Découvre ce produit sur KDDF Market : ${title} - ${formatFcfa(price)} 👉 ${url}`;
}

export type ShareChannel = "whatsapp" | "facebook" | "telegram" | "x" | "copy" | "instagram" | "tiktok" | "story";

export function shareLinks(title: string, price: number, url: string): Record<"whatsapp" | "facebook" | "telegram" | "x", string> {
  const text = shareText(title, price, url);
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`,
    telegram: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(`Découvre ce produit sur KDDF Market : ${title} - ${formatFcfa(price)} 👉`)}`,
    x: `https://twitter.com/intent/tweet?text=${t}`,
  };
}

export const SHARE_CHANNELS: readonly string[] = ["whatsapp", "facebook", "telegram", "x", "copy", "instagram", "tiktok", "story"];
