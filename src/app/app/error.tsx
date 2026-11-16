"use client";
import Link from "next/link";
import { explain } from "@/lib/errors";

// Page d'erreur générale : affichée quand une page plante côté serveur ou navigateur.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass mx-auto mt-16 max-w-lg space-y-4 p-6 text-center sm:p-8">
      <h1 className="font-display text-2xl font-bold text-white">Oups, un problème est survenu</h1>
      <p className="whitespace-pre-line text-left text-sm text-zinc-300">
        {explain(
          "Cette page n'a pas pu s'afficher (erreur du serveur ou de la base de données, souvent une connexion Supabase absente ou une base non installée).",
          "Rechargez la page. Si cela continue, le propriétaire du site doit vérifier les variables Supabase sur Vercel et que supabase/schema.sql a bien été exécuté."
        )}
      </p>
      {error.digest && <p className="font-mono text-xs text-zinc-500">Référence : {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary !py-2">Réessayer</button>
        <Link href="/" className="btn-ghost !py-2">Accueil</Link>
        <Link href={`/support${error.digest ? `?ref=${encodeURIComponent(error.digest)}` : ""}`} className="btn-ghost !py-2">Signaler ce problème</Link>
      </div>
    </div>
  );
}
