import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_CURRENCIES } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Boutique" };

async function save(formData: FormData) {
  "use server";
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? ""),
      store_name: String(formData.get("store_name") ?? ""),
      country: String(formData.get("country") ?? ""),
      default_currency: String(formData.get("default_currency") ?? "XAF"),
    })
    .eq("id", auth.user.id);
  revalidatePath("/dashboard/settings");
}

export default async function Settings() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", auth.user!.id).single();

  return (
    <form action={save} className="glass mx-auto max-w-lg space-y-4 p-6">
      <h1 className="font-display text-2xl font-bold text-white">Ma boutique</h1>
      <div><label className="label" htmlFor="full_name">Nom complet</label><input id="full_name" name="full_name" className="input" defaultValue={p?.full_name ?? ""} /></div>
      <div><label className="label" htmlFor="store_name">Nom de la boutique</label><input id="store_name" name="store_name" className="input" defaultValue={p?.store_name ?? ""} /></div>
      <div><label className="label" htmlFor="country">Pays</label><input id="country" name="country" className="input" defaultValue={p?.country ?? ""} /></div>
      <div>
        <label className="label" htmlFor="default_currency">Devise par défaut</label>
        <select id="default_currency" name="default_currency" className="input" defaultValue={p?.default_currency ?? "XAF"}>
          {DISPLAY_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <button className="btn-primary w-full">Enregistrer</button>
    </form>
  );
}
