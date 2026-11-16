export default function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "jade" | "volt" }) {
  const color = tone === "jade" ? "text-jade-soft" : tone === "volt" ? "text-volt-soft" : "text-white";
  return (
    <div className="card-float p-5">
      <p className="label !mb-1">{label}</p>
      <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
