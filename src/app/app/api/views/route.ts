import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validate";

export const runtime = "nodejs";

// Compte une visite de page produit (sert au taux de conversion du vendeur).
export async function POST(req: Request): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null);
  const productId = body !== null && typeof body === "object" ? (body as Record<string, unknown>).productId : null;
  if (!isUuid(productId)) return NextResponse.json({ ok: false }, { status: 400 });
  await createAdminClient().from("product_views").insert({ product_id: productId });
  return NextResponse.json({ ok: true });
}
