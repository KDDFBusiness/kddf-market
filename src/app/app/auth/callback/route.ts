import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Page de retour du lien de confirmation d'email : échange le code contre une session, puis redirige.
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) await createClient().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
