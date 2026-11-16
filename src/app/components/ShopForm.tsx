"use client";
import { explainError } from "@/lib/errors";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SHOP_COLORS, SHOP_SORTS, SHOP_THEMES, isHexColor, isShopSort, isValidSlug, resolveShopColor } from "@/lib/shop";
import { useRealUrl } from "@/lib/realUrl";
import type { ShopColor, ShopSort, ShopTheme } from "@/lib/types";

interface Props {
  userId: string;
  storeName: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string;
  color: ShopColor;
  customColor: string | null;
  theme: ShopTheme;
  sort: ShopSort;
  showWhatsapp: boolean;
  shopLink: string;
}

const MAX_IMAGE = 5 * 1024 * 1024;

async function uploadImage(userId: string, file: File, kind: string): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_IMAGE) {
    throw new Error("Images : JPG, PNG ou WebP, 5 Mo maximum.");
  }
  const supabase = createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/shop-${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("covers").upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Envoi de l'image impossible : ${error.message}`);
  return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
}

export default function ShopForm(p: Props) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(p.storeName);
  const [slug, setSlug] = useState(p.slug);
  const [description, setDescription] = useState(p.description);
  const [color, setColor] = useState<ShopColor>(p.color);
  const [custom, setCustom] = useState<string | null>(p.customColor);
  const [theme, setTheme] = useState<ShopTheme>(p.theme);
  const shopLink = useRealUrl(p.shopLink);
  const [sort, setSort] = useState<ShopSort>(p.sort);
  const [showWhatsapp, setShowWhatsapp] = useState(p.showWhatsapp);
  const [logo, setLogo] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg("");
    setError("");
    const cleanSlug = slug.trim().toLowerCase();
    if (storeName.trim().length < 2) return setError("Donne un nom à ta boutique.");
    if (!isValidSlug(cleanSlug)) return setError("Adresse de la boutique : 3 à 40 caractères, lettres minuscules, chiffres et tirets.");
    if (custom !== null && !isHexColor(custom)) return setError("Couleur personnalisée invalide : utilisez le format #RRGGBB (ex. #FF5733).");
    if (description.length > 500) return setError("Description : 500 caractères maximum.");

    setBusy(true);
    try {
      const logoUrl = logo ? await uploadImage(p.userId, logo, "logo") : p.logoUrl;
      const bannerUrl = banner ? await uploadImage(p.userId, banner, "banner") : p.bannerUrl;
      const { error: upd } = await createClient()
        .from("profiles")
        .update({
          store_name: storeName.trim(),
          store_slug: cleanSlug,
          shop_logo_url: logoUrl,
          shop_banner_url: bannerUrl,
          shop_description: description.trim() || null,
          shop_color: color,
          shop_color_custom: custom,
          shop_theme: theme,
          shop_sort: sort,
          shop_show_whatsapp: showWhatsapp,
        })
        .eq("id", p.userId);
      if (upd) {
        throw new Error(upd.message.includes("duplicate") || upd.message.includes("unique") ? "Cette adresse de boutique est déjà prise : choisis-en une autre." : upd.message);
      }
      setMsg("Modifications enregistrées");
      router.refresh();
    } catch (err) {
      setError(explainError(err instanceof Error ? err.message : undefined));
    }
    setBusy(false);
  }

  const t = SHOP_THEMES[theme];
  const c = resolveShopColor(color, custom);

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="glass space-y-4 p-6">
        <h1 className="font-display text-2xl font-bold text-white">Personnaliser ma boutique</h1>
        <div>
          <label className="label" htmlFor="sh-name">Nom de la boutique</label>
          <input id="sh-name" className="input" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="sh-slug">Adresse de la boutique</label>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="shrink-0">/boutique/</span>
            <input id="sh-slug" className="input" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sh-logo">Logo</label>
            <input id="sh-logo" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="label" htmlFor="sh-banner">Bannière / photo de couverture</label>
            <input id="sh-banner" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setBanner(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sh-desc">Description</label>
          <textarea id="sh-desc" rows={4} maxLength={500} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <fieldset>
          <legend className="label">Couleur principale</legend>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(SHOP_COLORS) as ShopColor[]).map((k) => (
              <label key={k} className="flex cursor-pointer flex-col items-center gap-1 text-xs text-zinc-300">
                <input type="radio" name="color" value={k} checked={color === k} onChange={() => { setColor(k); setCustom(null); }} className="sr-only" />
                <span className={`h-9 w-9 rounded-full border-2 ${custom === null && color === k ? "border-white" : "border-transparent"}`} style={{ backgroundColor: SHOP_COLORS[k].hex }} />
                {SHOP_COLORS[k].label}
              </label>
            ))}
          </div>
          {/* Couleur libre : le sélecteur propose toutes les couleurs existantes */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3">
            <label htmlFor="sh-custom" className="text-xs font-medium text-zinc-300">Autre couleur (toutes les couleurs)</label>
            <input
              id="sh-custom"
              type="color"
              value={custom ?? c.hex}
              onChange={(e) => setCustom(e.target.value.toUpperCase())}
              className="h-10 w-14 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0.5"
              aria-label="Choisir une couleur personnalisée"
            />
            <input
              className="input !w-32 !py-2 font-mono"
              value={custom ?? ""}
              placeholder="#RRGGBB"
              maxLength={7}
              aria-label="Code de la couleur au format #RRGGBB"
              onChange={(e) => setCustom(e.target.value.trim() === "" ? null : e.target.value.trim().toUpperCase())}
            />
            {custom !== null && (
              <button type="button" className="text-xs text-volt-soft underline" onClick={() => setCustom(null)}>Revenir à la liste</button>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Couleur de fond</legend>
          <div className="flex gap-4 text-sm text-zinc-200">
            {(Object.keys(SHOP_THEMES) as ShopTheme[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="theme" value={k} checked={theme === k} onChange={() => setTheme(k)} className="accent-indigo-500" /> {SHOP_THEMES[k].label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="sh-sort">Ordre d&apos;affichage des produits</label>
          <select id="sh-sort" className="input" value={sort} onChange={(e) => { if (isShopSort(e.target.value)) setSort(e.target.value); }}>
            {(Object.keys(SHOP_SORTS) as ShopSort[]).map((k) => <option key={k} value={k}>{SHOP_SORTS[k]}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-3 text-sm text-zinc-200">
          <input type="checkbox" className="accent-indigo-500" checked={showWhatsapp} onChange={(e) => setShowWhatsapp(e.target.checked)} />
          Afficher le bouton WhatsApp « Contacter le vendeur » sur ma boutique (aux clients qui ont déjà payé)
        </label>

        {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
        {msg && <p role="status" className="rounded-xl bg-jade/10 px-4 py-2.5 text-sm text-jade-soft">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button>
      </div>

      <div className="space-y-3">
        <div className="glass space-y-2 p-4 text-sm">
          <p className="label !mb-0">Lien de ma boutique</p>
          <a href={shopLink} target="_blank" rel="noopener noreferrer" className="break-all text-volt-soft underline">{shopLink}</a>
        </div>
        {/* Aperçu en direct */}
        <div className="overflow-hidden rounded-2xl border border-white/10" style={{ backgroundColor: t.bg, color: t.text }}>
          <div className="h-24" style={{ backgroundColor: c.hex }} />
          <div className="space-y-2 p-4">
            <p className="font-display text-lg font-bold">{storeName || "Ma boutique"}</p>
            <p className="text-xs" style={{ color: t.muted }}>{description || "La description de ta boutique apparaît ici."}</p>
            <span className="inline-block rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: c.hex, color: c.text }}>Acheter maintenant</span>
          </div>
        </div>
        <p className="text-xs text-zinc-500">Aperçu simplifié. Le logo et la bannière sont affichés après l&apos;enregistrement.</p>
      </div>
    </form>
  );
}
