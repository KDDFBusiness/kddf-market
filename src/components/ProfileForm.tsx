"use client";
import { explainError } from "@/lib/errors";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isEmail } from "@/lib/validate";
import { isPlausiblePhone, toWhatsappNumber } from "@/lib/phone";
import { CITIES } from "@/lib/shop";

interface Props {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  whatsapp: string;
  phone: string;
  city: string;
  referralCode: string;
  deliveryDoualaPrice: number;
  deliveryShippingPrice: number;
  hasPhysicalProducts: boolean;
}

const MAX_IMAGE = 5 * 1024 * 1024;

export default function ProfileForm(p: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(p.fullName);
  const [whatsapp, setWhatsapp] = useState(p.whatsapp);
  const [phone, setPhone] = useState(p.phone);
  const [email, setEmail] = useState(p.email);
  const [city, setCity] = useState(p.city || "Douala");
  const [dDouala, setDDouala] = useState(String(p.deliveryDoualaPrice));
  const [dShip, setDShip] = useState(String(p.deliveryShippingPrice));
  const [avatar, setAvatar] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg("");
    setError("");

    if (fullName.trim().length < 2) return setError("Indique ton nom et prénom.");
    if (whatsapp.trim() !== "" && !isPlausiblePhone(whatsapp)) return setError("Numéro WhatsApp invalide.");
    if (whatsapp.trim() === "" && p.hasPhysicalProducts) return setError("Ton numéro WhatsApp est obligatoire : tu vends des produits physiques.");
    if (phone.trim() !== "" && !isPlausiblePhone(phone)) return setError("Numéro d'appel invalide.");
    for (const v of [dDouala, dShip]) {
      const n = Number(v);
      if (v.trim() === "" || !Number.isInteger(n) || n < 0 || n > 9999999) return setError("Les prix de livraison doivent être des nombres entiers en FCFA (0 ou plus).");
    }
    if (!isEmail(email.trim())) return setError("Adresse email invalide.");
    if (password !== "" && password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (password !== password2) return setError("Les deux mots de passe ne sont pas identiques.");
    if (avatar && (!["image/jpeg", "image/png", "image/webp"].includes(avatar.type) || avatar.size > MAX_IMAGE)) {
      return setError("Photo de profil : JPG, PNG ou WebP, 5 Mo maximum.");
    }

    setBusy(true);
    const supabase = createClient();
    try {
      let avatarUrl = p.avatarUrl;
      if (avatar) {
        const path = `${p.userId}/avatar-${Date.now()}.${avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg"}`;
        const { error: upErr } = await supabase.storage.from("covers").upload(path, avatar, { contentType: avatar.type });
        if (upErr) throw new Error(`Envoi de la photo impossible : ${upErr.message}`);
        avatarUrl = supabase.storage.from("covers").getPublicUrl(path).data.publicUrl;
      }

      // Le WhatsApp est enregistré dans le profil : la base met à jour tous les produits du vendeur automatiquement.
      const { error: upd } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          whatsapp: whatsapp.trim() === "" ? null : toWhatsappNumber(whatsapp),
          phone: phone.trim() === "" ? null : phone.trim(),
          city,
          delivery_douala_price: Number(dDouala),
          delivery_shipping_price: Number(dShip),
        })
        .eq("id", p.userId);
      if (upd) throw new Error(upd.message);

      let extra = "";
      if (email.trim().toLowerCase() !== p.email.toLowerCase()) {
        const { error: mailErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (mailErr) throw new Error(mailErr.message);
        extra = " Un email de confirmation a été envoyé à ta nouvelle adresse : clique sur le lien pour valider le changement.";
      }
      if (password !== "") {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw new Error(pwErr.message);
        setPassword("");
        setPassword2("");
      }
      setMsg(`Modifications enregistrées.${extra}`);
      router.refresh();
    } catch (err) {
      setError(explainError(err instanceof Error ? err.message : undefined));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-lg space-y-4 p-6">
      <h1 className="font-display text-2xl font-bold text-white">Mon profil</h1>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-ink-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.avatarUrl && <img src={p.avatarUrl} alt="Photo de profil" className="h-full w-full object-cover" />}
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="pr-avatar">Photo de profil</label>
          <input id="pr-avatar" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="pr-name">Nom et prénom</label>
        <input id="pr-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pr-wa">Numéro WhatsApp</label>
          <input id="pr-wa" type="tel" placeholder="6XX XX XX XX" className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pr-phone">Numéro d&apos;appel</label>
          <input id="pr-phone" type="tel" placeholder="6XX XX XX XX" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">Ces numéros ne sont jamais publics : ils ne sont montrés qu&apos;aux clients ayant déjà payé un produit physique.</p>
      <div>
        <label className="label" htmlFor="pr-email">Email</label>
        <input id="pr-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="pr-city">Ville</label>
        <select id="pr-city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
          {(CITIES.includes(city) ? CITIES : [city, ...CITIES]).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <fieldset className="space-y-3 border-t border-white/5 pt-4">
        <legend className="label">Mes prix de livraison (produits physiques)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pr-dd">Livraison à domicile à Douala (FCFA)</label>
            <input id="pr-dd" type="number" min={0} step={1} inputMode="numeric" className="input" value={dDouala} onChange={(e) => setDDouala(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pr-ds">Envoi par bus / expédition (FCFA)</label>
            <input id="pr-ds" type="number" min={0} step={1} inputMode="numeric" className="input" value={dShip} onChange={(e) => setDShip(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-zinc-500">« Je viens récupérer » est toujours gratuit. Ces prix s&apos;appliquent à tous vos produits physiques.</p>
      </fieldset>

      <fieldset className="space-y-3 border-t border-white/5 pt-4">
        <legend className="label">Changer mon mot de passe (facultatif)</legend>
        <input type="password" autoComplete="new-password" aria-label="Nouveau mot de passe" placeholder="Nouveau mot de passe (8 caractères min.)" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" autoComplete="new-password" aria-label="Confirmer le mot de passe" placeholder="Confirmer le mot de passe" className="input" value={password2} onChange={(e) => setPassword2(e.target.value)} />
      </fieldset>

      <p className="rounded-xl bg-white/5 px-4 py-3 text-xs text-zinc-400">
        Ton code d&apos;affiliation : <span className="font-mono text-jade-soft">{p.referralCode}</span>
      </p>

      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      {msg && <p role="status" className="rounded-xl bg-jade/10 px-4 py-2.5 text-sm text-jade-soft">{msg}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button>
    </form>
  );
}
