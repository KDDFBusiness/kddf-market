import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Navbar() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const name = process.env.NEXT_PUBLIC_APP_NAME || "KDDF Market";

  // Le lien "Admin" n'apparaît que pour le compte administrateur (profiles.role = 'admin')
  let isAdmin = false;
  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    isAdmin = (profile as { role?: string } | null)?.role === "admin";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Image src="/logo.png" alt={name} width={36} height={36} className="rounded-lg" priority /> <span className="hidden whitespace-nowrap sm:inline">{name}</span>
        </Link>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-sm [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap">
          {data.user ? (
            <>
              {isAdmin && <Link href="/admin" className="btn-ghost !px-3 !py-2">Admin</Link>}
              <Link href="/library" className="btn-ghost !px-3 !py-2">Mes achats</Link>
              <Link href="/dashboard" className="btn-primary !px-3 !py-2">Espace créateur</Link>
              <form action="/auth/signout" method="post">
                <button className="btn-ghost !px-3 !py-2" aria-label="Se déconnecter">Quitter</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !px-3 !py-2">Connexion</Link>
              <Link href="/login?mode=signup" className="btn-primary !px-3 !py-2">Vendre</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
