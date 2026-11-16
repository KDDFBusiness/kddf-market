// Étoiles (lecture seule) : value de 0 à 5, avec demi-remplissage arrondi à la note la plus proche.
export default function Stars({ value, size = "text-base" }: { value: number; size?: string }) {
  const rounded = Math.round(value);
  return (
    <span className={`${size} leading-none tracking-tight`} role="img" aria-label={`${value.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? "text-amber-400" : "text-zinc-600"}>★</span>
      ))}
    </span>
  );
}
