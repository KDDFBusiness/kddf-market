import { explainCode } from "@/lib/errors";

// Bandeau d'erreur « Cause + Solution » affiché après une action qui a échoué (?erreur=<code>).
export default function FlashError({ code }: { code?: string }) {
  if (!code || !/^[a-z_]{3,40}$/.test(code)) return null;
  return (
    <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {explainCode(code)}
    </p>
  );
}
