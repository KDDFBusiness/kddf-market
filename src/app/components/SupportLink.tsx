import Link from "next/link";

// Petit bouton « Aide » visible partout : mène à la page de contact / signalement de problème.
export default function SupportLink() {
  return (
    <Link
      href="/support"
      aria-label="Aide et contact : signaler un problème"
      className="fixed bottom-4 right-4 z-40 rounded-full border border-white/10 bg-ink-900/90 px-4 py-2 text-xs font-semibold text-zinc-200 shadow-lg backdrop-blur transition hover:border-volt hover:text-white"
    >
      💬 Aide
    </Link>
  );
}
