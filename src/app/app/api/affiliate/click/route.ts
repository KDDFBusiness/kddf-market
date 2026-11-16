import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isReferralCode, isUuid } from "@/lib/validate";

export const runtime = "nodejs";

// Compte un clic sur un lien d'affiliation (?ref=CODE). Les clics du vendeur ou de l'affilié lui-même sont ignorés par la base.
export async function POST(req: Request): Promise<NextResponse> {
  const body: unknown = await req.json().catch(() => null);
  const b = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isUuid(b.productId) || !isReferralCode(b.code)) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: auth } = await createClient().auth.getUser();
  await createAdminClient().rpc("record_affiliate_click", {
    p_code: b.code,
    p_product_id: b.productId,
    p_viewer: auth.user?.id ?? null,
  });
  return NextResponse.json({ ok: true });
}
