import AutoRefresh from "@/components/AutoRefresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";
import { SUPPORT_CATEGORIES } from "@/lib/supportEmail";
import { setSupportStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Messages", robots: { index: false } };

interface Msg {
  id: string;
  name: string;
  email: string;
  category: string;
  message: string;
  page_url: string | null;
  images: string[];
  status: "open" | "resolved";
  created_at: string;
}

const COLS = "id, name, email, category, message, page_url, images, status, created_at";

export default async function AdminSupport() {
  const supabase = createClient();
  const [{ data: o }, { data: r }] = await Promise.all([
    supabase.from("support_messages").select(COLS).eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("support_messages").select(COLS).eq("status", "resolved").order("created_at", { ascending: false }).limit(20),
  ]);
  const open = asRows<Msg>(o);
  const done = asRows<Msg>(r);

  // Liens temporaires (1 h) vers les captures d'écran privées
  const db = createAdminClient();
  const urls: Record<string, string> = {};
  for (const m of [...open, ...done]) {
    for (const path of m.images) {
      const { data } = await db.storage.from("support").createSignedUrl(path, 3600);
      if (data?.signedUrl) urls[path] = data.signedUrl;
    }
  }

  const card = (m: Msg) => (
    <li key={m.id} className="space-y-2 py-4 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-volt/15 px-2.5 py-0.5 text-xs font-medium text-volt-soft">{SUPPORT_CATEGORIES[m.category] ?? "Autre"}</span>
        <span className="font-semibold text-white">{m.name}</span>
        <a href={`mailto:${m.email}`} className="text-volt-soft underline">{m.email}</a>
        <span className="text-xs text-zinc-500">{new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>
      </p>
      <p className="whitespace-pre-line text-zinc-200">{m.message}</p>
      {m.page_url && <p className="break-all text-xs text-zinc-500">Venait de : {m.page_url}</p>}
      {m.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.images.map((p) =>
            urls[p] ? (
              <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urls[p]} alt="Capture d'écran jointe" className="h-24 w-24 rounded-lg object-cover" loading="lazy" />
              </a>
            ) : null
          )}
        </div>
      )}
      <form action={setSupportStatus}>
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="status" value={m.status === "open" ? "resolved" : "open"} />
        <button className={m.status === "open" ? "btn-jade !py-1.5 !text-xs" : "btn-ghost !py-1.5 !text-xs"}>{m.status === "open" ? "Marquer comme traité" : "Rouvrir"}</button>
      </form>
    </li>
  );

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <h1 className="font-display text-3xl font-bold text-white">Messages des utilisateurs</h1>
      <section className="glass p-5">
        <p className="label">À traiter ({open.length})</p>
        {open.length === 0 ? <p className="text-sm text-zinc-500">Aucun message en attente.</p> : <ul className="divide-y divide-white/5">{open.map(card)}</ul>}
      </section>
      {done.length > 0 && (
        <section className="glass p-5">
          <p className="label">Traités (20 derniers)</p>
          <ul className="divide-y divide-white/5">{done.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
