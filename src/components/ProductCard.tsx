import Link from "next/link";
import { formatMoney } from "@/lib/money";

export const TYPE_LABELS: Record<string, string> = {
  file: "Ebook / Fichier",
  course: "Formation",
  license: "Licence",
  bundle: "Offre groupée",
  coaching: "Coaching",
  service: "Service",
};

export default function ProductCard({ p }: { p: any }) {
  return (
    <Link href={`/p/${p.id}`} className="card-float group block overflow-hidden">
      <div className="aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-volt/30 via-ink-800 to-jade/20">
        {p.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.cover_url} alt={p.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
      </div>
      <div className="space-y-2 p-4">
        <span className="rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-medium text-volt-soft">
          {TYPE_LABELS[p.type] ?? p.type}
        </span>
        <h3 className="font-display text-base font-semibold text-white line-clamp-2">{p.title}</h3>
        <p className="font-display text-lg font-bold text-jade-soft">{formatMoney(Number(p.price_amount), p.price_currency)}</p>
      </div>
    </Link>
  );
}
