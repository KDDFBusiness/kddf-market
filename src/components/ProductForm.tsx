"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AFFILIATE_PERCENTS, DEFAULT_AFFILIATE_PERCENT, MIN_PRICE_FCFA, formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS, DIGITAL_KIND_LABELS } from "@/lib/labels";
import { explainError } from "@/lib/errors";
import { PRODUCT_CATEGORIES } from "@/lib/catalog";
import { isPlausiblePhone, toWhatsappNumber } from "@/lib/phone";
import type { DeliveryMethod, DeliveryOptions, DigitalKind, ProductType } from "@/lib/types";

const DELIVERY_ORDER: DeliveryMethod[] = ["pickup_douala", "delivery_douala", "shipping_cameroon"];
const KINDS = Object.keys(DIGITAL_KIND_LABELS) as DigitalKind[];
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function slugify(title: string): string {
  const base = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `${base || "produit"}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

interface Props {
  sellerId: string;
  bundleCandidates: { id: string; title: string }[];
  defaultWhatsapp: string;
  /** Prix de livraison définis dans le profil du vendeur (FCFA) */
  deliveryDoualaPrice: number;
  deliveryShippingPrice: number;
}

export default function ProductForm({ sellerId, bundleCandidates, defaultWhatsapp, deliveryDoualaPrice, deliveryShippingPrice }: Props) {
  const router = useRouter();
  // Premier choix OBLIGATOIRE : aucun type n'est présélectionné.
  const [type, setType] = useState<ProductType | null>(null);

  // Champs communs
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [publish, setPublish] = useState(true);
  const [affiliateEnabled, setAffiliateEnabled] = useState(true);
  const [affiliatePercent, setAffiliatePercent] = useState<number>(DEFAULT_AFFILIATE_PERCENT);

  // Digital
  const [kind, setKind] = useState<DigitalKind>("file");
  const [cover, setCover] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [licenseKeys, setLicenseKeys] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [bundleIds, setBundleIds] = useState<string[]>([]);

  // Physique
  const [stock, setStock] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [weight, setWeight] = useState("");
  const [variant, setVariant] = useState("");
  const [whatsapp, setWhatsapp] = useState(defaultWhatsapp);
  const [delivery, setDelivery] = useState<Record<DeliveryMethod, { enabled: boolean; price: string }>>({
    pickup_douala: { enabled: true, price: "0" },
    delivery_douala: { enabled: false, price: String(deliveryDoualaPrice) },
    shipping_cameroon: { enabled: false, price: String(deliveryShippingPrice) },
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Aperçus des photos (miniatures)
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addPhotos(list: FileList | null): void {
    if (!list) return;
    const next = [...photos, ...Array.from(list)].slice(0, MAX_PHOTOS);
    setPhotos(next);
  }

  function validate(): string | null {
    if (type === null) return "Choisissez d'abord : produit digital ou produit physique.";
    if (title.trim().length < 2) return "Le titre est obligatoire.";
    if (!PRODUCT_CATEGORIES.includes(category)) return "Choisissez la catégorie du produit.";
    const p = Number(price);
    if (!Number.isInteger(p) || p < MIN_PRICE_FCFA) return `Le prix doit être un nombre entier d'au moins ${MIN_PRICE_FCFA} FCFA.`;
    if (type === "physical") {
      const s = Number(stock);
      if (stock.trim() === "" || !Number.isInteger(s) || s < 0) return "Le stock est obligatoire (nombre entier, 0 ou plus).";
      if (photos.length < 1) return "Ajoutez au moins 1 photo (5 maximum).";
      if (photos.some((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type))) return "Photos : formats JPG, PNG ou WebP uniquement.";
      if (photos.some((f) => f.size > MAX_PHOTO_BYTES)) return "Chaque photo doit faire 5 Mo maximum.";
      const active = DELIVERY_ORDER.filter((m) => delivery[m].enabled);
      if (active.length === 0) return "Activez au moins un mode de livraison.";
      for (const m of active) {
        const dp = Number(delivery[m].price);
        if (!Number.isInteger(dp) || dp < 0 || dp > 9999999) return `Prix de livraison invalide : ${DELIVERY_LABELS[m]}.`;
      }
      if (!isPlausiblePhone(whatsapp)) return "Le numéro WhatsApp du vendeur est obligatoire.";
    } else {
      if (kind === "bundle" && bundleIds.length < 2) return "Une offre groupée contient au moins 2 de vos produits.";
      if (kind === "license" && licenseKeys.split("\n").map((k) => k.trim()).filter(Boolean).length === 0) return "Ajoutez au moins une clé de licence (une par ligne).";
      if ((kind === "coaching" || kind === "service") && bookingUrl.trim() !== "" && !/^https?:\/\//i.test(bookingUrl.trim())) return "Le lien de réservation doit commencer par http:// ou https://";
    }
    return null;
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (type === null) return;
    setError("");
    setBusy(true);
    const supabase = createClient();

    try {
      // 1) Photos / couverture -> bucket public "covers" (dossier = id du vendeur)
      const uploadImage = async (file: File): Promise<string> => {
        const path = `${sellerId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("covers").upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`Envoi de la photo impossible : ${upErr.message}`);
        return supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
      };

      const images: string[] = [];
      for (const f of photos) images.push(await uploadImage(f));
      const coverUrl = type === "physical" ? images[0] ?? null : cover ? await uploadImage(cover) : null;

      // 2) Produit
      const deliveryOptions: DeliveryOptions = {};
      for (const m of DELIVERY_ORDER) {
        deliveryOptions[m] = { enabled: delivery[m].enabled, price: m === "pickup_douala" || !delivery[m].enabled ? 0 : Number(delivery[m].price) };
      }
      const base = {
        seller_id: sellerId,
        product_type: type,
        title: title.trim(),
        slug: slugify(title),
        description: description.trim() || null,
        cover_url: coverUrl,
        price: Number(price),
        category,
        is_published: publish,
        affiliate_enabled: affiliateEnabled,
        affiliate_percent: affiliatePercent,
      };
      // Type explicite : la ligne a deux formes (physique / digital), le client Supabase non typé n'accepte pas l'union.
      const row: Record<string, unknown> =
        type === "physical"
          ? {
              ...base,
              digital_kind: null,
              stock: Number(stock),
              images,
              weight: weight.trim() || null,
              variant: variant.trim() || null,
              delivery_options: deliveryOptions,
              whatsapp_seller: toWhatsappNumber(whatsapp),
            }
          : {
              ...base,
              digital_kind: kind,
              booking_url: bookingUrl.trim() || null,
              duration_minutes: duration.trim() ? Number(duration) : null,
              delivery_notes: notes.trim() || null,
            };

      // Le numéro WhatsApp vit dans le profil : le modifier ici met à jour TOUS les produits du vendeur.
      if (type === "physical" && toWhatsappNumber(whatsapp) !== defaultWhatsapp) {
        const { error: waErr } = await supabase.from("profiles").update({ whatsapp: toWhatsappNumber(whatsapp) }).eq("id", sellerId);
        if (waErr) throw new Error(`Numéro WhatsApp invalide : ${waErr.message}`);
      }

      const { data: created, error: insErr } = await supabase.from("products").insert(row as never).select("id").single();
      if (insErr || !created) throw new Error(insErr?.message ?? "Création du produit impossible.");
      const productId = String((created as { id: unknown }).id);

      // 3) Éléments digitaux : fichiers (bucket privé), clés de licence, contenu de l'offre groupée
      if (type === "digital") {
        let position = 0;
        for (const f of files) {
          const path = `${sellerId}/${productId}/${Date.now()}-${safeName(f.name)}`;
          const { error: upErr } = await supabase.storage.from("deliverables").upload(path, f, { contentType: f.type || "application/octet-stream" });
          if (upErr) throw new Error(`Envoi du fichier « ${f.name} » impossible : ${upErr.message}`);
          const { error: fErr } = await supabase.from("product_files").insert({
            product_id: productId, storage_path: path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size, position: position++,
          });
          if (fErr) throw new Error(fErr.message);
        }
        if (kind === "license") {
          const keys = Array.from(new Set(licenseKeys.split("\n").map((k) => k.trim()).filter(Boolean)));
          const { error: kErr } = await supabase.from("license_keys").insert(keys.map((key) => ({ product_id: productId, key })));
          if (kErr) throw new Error(kErr.message);
        }
        if (kind === "bundle") {
          const { error: bErr } = await supabase.from("bundle_items").insert(bundleIds.map((id) => ({ bundle_id: productId, product_id: id })));
          if (bErr) throw new Error(bErr.message);
        }
      }

      router.push("/dashboard/products?created=1");
      router.refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Une erreur est survenue.";
      setError(explainError(raw));
      setBusy(false);
    }
  }

  const priceNumber = Number(price);

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-bold text-white">Nouveau produit</h1>

      {/* ÉTAPE 1 : type de produit (obligatoire) */}
      <fieldset className="space-y-3">
        <legend className="label">1. Quel type de produit vendez-vous ?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["digital", "💾 Produit digital", "Ebook, formation, licence, coaching, service…"],
            ["physical", "📦 Produit physique", "Objet livré ou retiré : stock, photos, livraison."],
          ] as const).map(([value, name, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={`card-float p-4 text-left ${type === value ? "!border-volt shadow-glow" : ""}`}
            >
              <p className="font-display text-lg font-semibold text-white">{name}</p>
              <p className="text-sm text-zinc-400">{hint}</p>
            </button>
          ))}
        </div>
      </fieldset>

      {type !== null && (
        <>
          <section className="glass space-y-4 p-5">
            <div>
              <label className="label" htmlFor="pf-title">Titre</label>
              <input id="pf-title" className="input" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="pf-desc">Description</label>
              <textarea id="pf-desc" rows={4} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pf-cat">Catégorie (pour la recherche)</label>
              <select id="pf-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="">Choisir…</option>
                {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pf-price">Prix (FCFA)</label>
              <input id="pf-price" type="number" inputMode="numeric" min={MIN_PRICE_FCFA} step={1} className="input" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </section>

          {type === "physical" ? (
            <section className="glass space-y-4 p-5">
              <p className="font-display text-lg font-semibold text-white">Produit physique</p>
              <div>
                <label className="label" htmlFor="pf-stock">Stock disponible (obligatoire)</label>
                <input id="pf-stock" type="number" min={0} step={1} className="input" value={stock} onChange={(e) => setStock(e.target.value)} required />
              </div>

              <div>
                <label className="label" htmlFor="pf-photos">Photos ({photos.length}/{MAX_PHOTOS}) — 1 minimum</label>
                <input id="pf-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="input" disabled={photos.length >= MAX_PHOTOS}
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                {previews.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {previews.map((src, i) => (
                      <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Aperçu ${i + 1}`} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={`Retirer la photo ${i + 1}`}
                          className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-xs text-white">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="pf-weight">Poids (ex : 450 g)</label>
                  <input id="pf-weight" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="pf-variant">Taille / variante (ex : XL, Noir)</label>
                  <input id="pf-variant" className="input" value={variant} onChange={(e) => setVariant(e.target.value)} />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="label">Options de livraison (au moins une)</legend>
                {DELIVERY_ORDER.map((m) => (
                  <div key={m} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                    <label className="flex items-center gap-3 text-sm text-white">
                      <input type="checkbox" className="accent-indigo-500" checked={delivery[m].enabled}
                        onChange={(e) => setDelivery({ ...delivery, [m]: { ...delivery[m], enabled: e.target.checked } })} />
                      {DELIVERY_LABELS[m]}
                    </label>
                    {m === "pickup_douala" ? (
                      <span className="text-sm font-semibold text-jade-soft">Gratuit</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <input type="number" min={0} step={1} aria-label={`Prix : ${DELIVERY_LABELS[m]}`} className="input !w-28 !py-2" disabled={!delivery[m].enabled}
                          value={delivery[m].price} onChange={(e) => setDelivery({ ...delivery, [m]: { ...delivery[m], price: e.target.value } })} />
                        <span className="text-xs text-zinc-500">FCFA</span>
                      </span>
                    )}
                  </div>
                ))}
              </fieldset>

              <div>
                <label className="label" htmlFor="pf-wa">Numéro WhatsApp du vendeur (obligatoire, enregistré dans ton profil)</label>
                <input id="pf-wa" type="tel" placeholder="6XX XX XX XX" className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
              </div>
            </section>
          ) : (
            <section className="glass space-y-4 p-5">
              <p className="font-display text-lg font-semibold text-white">Produit digital</p>
              <div>
                <label className="label" htmlFor="pf-kind">Type de produit digital</label>
                <select id="pf-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as DigitalKind)}>
                  {KINDS.map((k) => <option key={k} value={k}>{DIGITAL_KIND_LABELS[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="pf-cover">Image de couverture (facultative)</label>
                <input id="pf-cover" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
              </div>
              {(kind === "file" || kind === "course" || kind === "bundle" || kind === "license") && (
                <div>
                  <label className="label" htmlFor="pf-files">Fichiers à livrer (PDF, ePub, vidéos, ZIP…)</label>
                  <input id="pf-files" type="file" multiple className="input" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  {files.length > 0 && <p className="mt-1 text-xs text-zinc-500">{files.length} fichier(s) sélectionné(s)</p>}
                </div>
              )}
              {kind === "license" && (
                <div>
                  <label className="label" htmlFor="pf-keys">Clés de licence (une par ligne)</label>
                  <textarea id="pf-keys" rows={4} className="input font-mono" value={licenseKeys} onChange={(e) => setLicenseKeys(e.target.value)} />
                </div>
              )}
              {kind === "bundle" && (
                <fieldset className="space-y-2">
                  <legend className="label">Produits inclus (2 minimum)</legend>
                  {bundleCandidates.length === 0 && <p className="text-sm text-zinc-500">Créez d&apos;abord d&apos;autres produits digitaux.</p>}
                  {bundleCandidates.map((b) => (
                    <label key={b.id} className="flex items-center gap-3 text-sm text-zinc-200">
                      <input type="checkbox" className="accent-indigo-500" checked={bundleIds.includes(b.id)}
                        onChange={(e) => setBundleIds(e.target.checked ? [...bundleIds, b.id] : bundleIds.filter((x) => x !== b.id))} />
                      {b.title}
                    </label>
                  ))}
                </fieldset>
              )}
              {(kind === "coaching" || kind === "service") && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="pf-book">Lien de réservation</label>
                    <input id="pf-book" type="url" className="input" placeholder="https://…" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-dur">Durée (minutes)</label>
                    <input id="pf-dur" type="number" min={1} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="label" htmlFor="pf-notes">Instructions après achat</label>
                <textarea id="pf-notes" rows={3} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </section>
          )}

          <section className="glass space-y-4 p-5">
            <label className="flex items-center gap-3 text-sm text-zinc-200">
              <input type="checkbox" className="accent-indigo-500" checked={affiliateEnabled} onChange={(e) => setAffiliateEnabled(e.target.checked)} />
              Autoriser les affiliés à vendre ce produit
            </label>
            {affiliateEnabled && (
              <div>
                <label className="label" htmlFor="pf-aff">Commission de l&apos;affilié</label>
                <select id="pf-aff" className="input" value={affiliatePercent} onChange={(e) => setAffiliatePercent(Number(e.target.value))}>
                  {AFFILIATE_PERCENTS.map((n) => <option key={n} value={n}>{n} %</option>)}
                </select>
                {Number.isInteger(priceNumber) && priceNumber >= MIN_PRICE_FCFA && (
                  <p className="mt-2 text-xs text-zinc-400">
                    Vente via affilié : l&apos;affilié reçoit {formatFcfa(Math.floor((priceNumber * affiliatePercent) / 100))}, KDDF {formatFcfa(Math.floor((priceNumber * 5) / 100))},
                    vous {formatFcfa(priceNumber - Math.floor((priceNumber * affiliatePercent) / 100) - Math.floor((priceNumber * 5) / 100))}.
                    Sans affilié : KDDF {type === "physical" ? "8 %" : "10 %"} ({formatFcfa(Math.floor((priceNumber * (type === "physical" ? 8 : 10)) / 100))}), vous {formatFcfa(priceNumber - Math.floor((priceNumber * (type === "physical" ? 8 : 10)) / 100))}.
                  </p>
                )}
              </div>
            )}
            <label className="flex items-center gap-3 text-sm text-zinc-200">
              <input type="checkbox" className="accent-indigo-500" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publier tout de suite
            </label>
          </section>

          {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Enregistrement…" : "Créer le produit"}</button>
          <p className="text-center text-xs text-zinc-500">Tout nouveau produit est vérifié par KDDF Market avant d&apos;apparaître dans la boutique.</p>
        </>
      )}
      {type === null && error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
    </form>
  );
}
