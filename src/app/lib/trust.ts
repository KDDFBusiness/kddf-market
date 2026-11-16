import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/db";

// Un vendeur est jugé "peu fiable" sous 2 étoiles de moyenne, à partir de 3 avis
// (un seul mauvais avis ne doit pas suffire à salir un vendeur). Modifiable ici.
export const UNRELIABLE_BELOW = 2;
export const UNRELIABLE_MIN_REVIEWS = 3;

export interface SellerTrust {
  avg: number;
  count: number;
  unreliable: boolean;
}

export async function getSellerTrust(sellerId: string): Promise<SellerTrust> {
  const { data } = await createClient().from("seller_ratings").select("avg_rating, review_count").eq("seller_id", sellerId).maybeSingle();
  const r = asRow<{ avg_rating: number | string; review_count: number | string }>(data);
  const avg = r ? Number(r.avg_rating) : 0;
  const count = r ? Number(r.review_count) : 0;
  return { avg, count, unreliable: count >= UNRELIABLE_MIN_REVIEWS && avg < UNRELIABLE_BELOW };
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
}

export async function getProductReviews(productId: string, limit = 10): Promise<PublicReview[]> {
  const { data } = await createClient()
    .from("public_reviews")
    .select("id, rating, comment, created_at, reviewer_name")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return asRows<PublicReview>(data);
}
