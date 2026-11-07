import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Navbar() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Vendora";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          <span className="text-volt-soft">●</span> {name}
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {data.user ? (
            <>
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
