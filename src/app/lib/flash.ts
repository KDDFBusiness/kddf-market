import { redirect } from "next/navigation";
import { errorCode } from "@/lib/errors";

/**
 * Pour les boutons (server actions) qui ne peuvent pas afficher de texte : renvoie vers la page
 * avec ?erreur=<code>. La page affiche alors la cause et la solution (composant FlashError).
 * Seul un CODE connu passe dans l'adresse, jamais un texte libre.
 */
export function failWith(path: string, raw: string | undefined): never {
  redirect(`${path}?erreur=${encodeURIComponent(errorCode(raw))}`);
}
