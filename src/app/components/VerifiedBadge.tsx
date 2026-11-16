// Badge "Vendeur Vérifié" : coche bleue (donné par l'admin après vérification de la CNI).
export default function VerifiedBadge({ size = 18 }: { size?: number }) {
  return (
    <span title="Vendeur Vérifié" className="inline-flex items-center gap-1 align-middle">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#2563EB" />
        <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Vendeur Vérifié</span>
    </span>
  );
}
