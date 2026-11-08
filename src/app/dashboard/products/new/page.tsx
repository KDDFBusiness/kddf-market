"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DISPLAY_CURRENCIES } from "@/lib/money";

const TYPES = [
  ["file", "Ebook / Fichier (PDF, ePub)"],
  ["course", "Formation vidéo"],
  ["license", "Clés de licence"],
  ["bundle", "Offre groupée"],
  ["coaching", "Session de coaching"],
  ["service", "Service"],
] as const;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function NewProduct() {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number][0]>("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [files, setFiles] = useState<File[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [licenses, setLicenses] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [affiliate, setAffiliate] = useState(false);
  const [affPercent, setAffPercent] = useState("30");
  const [mine, setMine] = useState<{ id: string; title: string }[]>([]);
  const [bundle, setBundle] = useState<string[]>([]);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().from("products").select("id, title").neq("type", "bundle").then(({ data }) => setMine(data ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user!.id;

      let cover_url: string | null = null;
      if (cover) {
        const path = `${uid}/${Date.now()}-${slugify(cover.name.replace(/\.[^.]+$/, ""))}.${cover.name.split(".").pop()}`;
        const up = await supabase.storage.from("covers").upload(path, cover);
        if (up.error) throw up.error;
        cover_url = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
      }

      const { data: product, error: pErr } = await supabase
        .from("products")
        .insert({
          creator_id: uid,
          type,
          title,
          slug: `${slugify(title)}-${Date.now().toString(36)}`,
          description,
          cover_url,
          price_amount: Number(price),
          price_currency: currency,
          is_published: publish,
          affiliate_enabled: affiliate,
          affiliate_percent: Number(affPercent) || 30,
          booking_url: type === "coaching" || type === "service" ? bookingUrl || null : null,
          duration_minutes: type === "coaching" && duration ? Number(duration) : null,
          delivery_notes: type === "service" ? notes || null : null,
        })
        .select("id")
        .single();
      if (pErr || !product) throw pErr ?? new Error("Création impossible");

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${uid}/${product.id}/${Date.now()}-${slugify(f.name.replace(/\.[^.]+$/, ""))}.${f.name.split(".").pop()}`;
        const up = await supabase.storage.from("deliverables").upload(path, f);
        if (up.error) throw up.error;
        await supabase.from("product_files").insert({
          product_id: product.id, storage_path: path, file_name: f.name,
          mime_type: f.type, size_bytes: f.size, position: i,
        });
      }

      if (type === "license") {
        const keys = Array.from(new Set(licenses.split("\n").map((k) => k.trim()).filter(Boolean)));
        if (keys.length) await supabase.from("license_keys").insert(keys.map((key) => ({ product_id: product.id, key })));
      }
      if (type === "bundle" && bundle.length) {
        await supabase.from("bundle_items").insert(bundle.map((pid) => ({ bundle_id: product.id, product_id: pid })));
      }

      router.push("/dashboard/products");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Erreur inattendue");
      setBusy(false);
    }
  }

  const needsFiles = type === "file" || type === "course";

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-2xl space-y-5 p-5 sm:p-7">
      <h1 className="font-display text-2xl font-bold text-white">Nouveau produit</h1>

      <div>
        <label className="label" htmlFor="type">Type</label>
        <select id="type" className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="title">Titre</label>
        <input id="title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="desc">Description</label>
        <textarea id="desc" rows={5} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="label" htmlFor="price">Prix</label>
          <input id="price" type="number" min="0" step="any" required className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cur">Devise</label>
          <select id="cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {DISPLAY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="cover">Image de couverture</label>
        <input id="cover" type="file" accept="image/*" className="input" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
      </div>

      {needsFiles && (
        <div>
          <label className="label" htmlFor="files">{type === "course" ? "Vidéos / leçons (dans l'ordre)" : "Fichiers (PDF, ePub, ZIP…)"}</label>
          <input id="files" type="file" multiple className="input" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </div>
      )}
      {type === "license" && (
        <div>
          <label className="label" htmlFor="lic">Clés de licence (une par ligne)</label>
          <textarea id="lic" rows={5} className="input font-mono" value={licenses} onChange={(e) => setLicenses(e.target.value)} />
        </div>
      )}
      {type === "bundle" && (
        <div>
          <p className="label">Produits inclus</p>
          <div className="space-y-2">
            {mine.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={bundle.includes(m.id)} onChange={(e) => setBundle(e.target.checked ? [...bundle, m.id] : bundle.filter((x) => x !== m.id))} />
                {m.title}
              </label>
            ))}
            {mine.length === 0 && <p className="text-sm text-zinc-500">Créez d'abord d'autres produits.</p>}
          </div>
        </div>
      )}
      {(type === "coaching" || type === "service") && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="book">Lien de réservation / contact (Calendly, WhatsApp…)</label>
            <input id="book" type="url" className="input" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} />
          </div>
          {type === "coaching" && (
            <div>
              <label className="label" htmlFor="dur">Durée (minutes)</label>
              <input id="dur" type="number" min="1" className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          )}
          {type === "service" && (
            <div>
              <label className="label" htmlFor="notes">Instructions de livraison</label>
              <textarea id="notes" rows={3} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-white/10 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={affiliate} onChange={(e) => setAffiliate(e.target.checked)} /> Activer l'affiliation
        </label>
        {affiliate && (
          <div>
            <label className="label" htmlFor="aff">Commission affilié (%)</label>
            <input id="aff" type="number" min="1" max="90" className="input" value={affPercent} onChange={(e) => setAffPercent(e.target.value)} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publier immédiatement
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Envoi en cours…" : "Créer le produit"}</button>
    </form>
  );
}
