import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { productId } = await req.json().catch(() => ({}));
  if (!productId) return NextResponse.json({ ok: false }, { status: 400 });
  await createAdminClient().from("product_views").insert({ product_id: productId });
  return NextResponse.json({ ok: true });
}
