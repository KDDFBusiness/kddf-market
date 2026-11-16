import { appUrl } from "@/lib/env";
import type { ShopColor, ShopSort, ShopTheme } from "@/lib/types";

export const SHOP_COLORS: Record<ShopColor, { label: string; hex: string; text: string }> = {
  noir: { label: "Noir", hex: "#1F2937", text: "#FFFFFF" },
  bleu: { label: "Bleu", hex: "#2563EB", text: "#FFFFFF" },
  rouge: { label: "Rouge", hex: "#DC2626", text: "#FFFFFF" },
  vert: { label: "Vert", hex: "#16A34A", text: "#FFFFFF" },
  orange: { label: "Orange", hex: "#EA580C", text: "#FFFFFF" },
  violet: { label: "Violet", hex: "#7C3AED", text: "#FFFFFF" },
};

export const SHOP_THEMES: Record<ShopTheme, { label: string; bg: string; text: string; muted: string; card: string; border: string }> = {
  light: { label: "Clair", bg: "#F8FAFC", text: "#0F172A", muted: "#64748B", card: "#FFFFFF", border: "#E2E8F0" },
  dark: { label: "Sombre", bg: "#0B0B10", text: "#E5E7EB", muted: "#9CA3AF", card: "#111118", border: "#22222F" },
};

export const SHOP_SORTS: Record<ShopSort, string> = {
  newest: "Plus récents d'abord",
  oldest: "Plus anciens d'abord",
  price_asc: "Prix croissant",
  price_desc: "Prix décroissant",
  name: "Ordre alphabétique",
};

export const CITIES: readonly string[] = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Bamenda", "Maroua", "Ngaoundéré", "Bertoua", "Ebolowa", "Kribi", "Limbé", "Buea", "Autre"];

export function isShopColor(v: string): v is ShopColor {
  return v in SHOP_COLORS;
}
export function isShopTheme(v: string): v is ShopTheme {
  return v === "light" || v === "dark";
}
export function isShopSort(v: string): v is ShopSort {
  return v in SHOP_SORTS;
}

/** Adresse de boutique valide : minuscules, chiffres et tirets (3 à 40 caractères). */
export function isValidSlug(v: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) && v.length >= 3 && v.length <= 40;
}

export function shopUrl(slug: string): string {
  return `${appUrl()}/boutique/${slug}`;
}

/** Couleur libre valide : #RRGGBB. */
export function isHexColor(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v);
}

/** Texte lisible (blanc ou noir) sur une couleur de fond donnée. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.45 ? "#0F172A" : "#FFFFFF";
}

/** Couleur principale effective d'une boutique : la couleur libre si elle existe, sinon celle de la liste. */
export function resolveShopColor(preset: ShopColor, custom: string | null | undefined): { hex: string; text: string } {
  if (custom && isHexColor(custom)) return { hex: custom, text: readableOn(custom) };
  const c = SHOP_COLORS[preset] ?? SHOP_COLORS.violet;
  return { hex: c.hex, text: c.text };
}
