import Link from "next/link";
import { formatFcfa } from "@/lib/money";
import { productTypeLabel } from "@/lib/labels";
import Stars from "@/components/Stars";
import type { Product } from "@/lib/types";

type CardProduct = Pick<Product, "id" | "title" | "price" | "cover_url" | "images" | "product_type" | "digital_kind" | "stock"> & Partial<Pick<Product, "rating_avg" | "rating_count" | "city">>;

export default function ProductCard({ p, badge }: { p: CardProduct; badge?: string }) {
  const image = p.product_type === "physical" ? p.images[0] ?? p.cover_url : p.cover_url;
  const soldOut = p.product_type === "physical" && (p.stock ?? 0) <= 0;
  return (
    <Link href={`/p/${p.id}`} className="card-float group block overflow-hidden">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-volt/30 via-ink-800 to-jade/20">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={p.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        {badge && <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-ink-950">★ {badge}</span>}
        {soldOut && <span className="absolute left-3 top-3 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">Rupture de stock</span>}
      </div>
      <div className="space-y-2 p-4">
        <span className="rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-medium text-volt-soft">{productTypeLabel(p)}</span>
        <h3 className="line-clamp-2 font-display text-base font-semibold text-white">{p.title}</h3>
        {(p.rating_count ?? 0) > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-zinc-400"><Stars value={Number(p.rating_avg ?? 0)} size="text-sm" /> {Number(p.rating_avg ?? 0).toFixed(1)} ({p.rating_count})</p>
        )}
        <p className="font-display text-lg font-bold text-jade-soft">{formatFcfa(p.price)}</p>
        {p.city && <p className="text-xs text-zinc-500">📍 {p.city}</p>}
      </div>
    </Link>
  );
}
