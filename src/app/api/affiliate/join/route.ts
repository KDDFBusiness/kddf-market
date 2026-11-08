import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Un utilisateur connecté rejoint le programme d'affiliation d'un créateur et reçoit son code
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });

  const { creatorId } = await req.json().catch(() => ({}));
  if (!creatorId || creatorId === auth.user.id) {
    return NextResponse.json({ error: "Demande invalide" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: existing } = await db
    .from("affiliates").select("code").eq("user_id", auth.user.id).eq("creator_id", creatorId).maybeSingle();
  if (existing) return NextResponse.json({ code: existing.code });

  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const { error } = await db.from("affiliates").insert({ user_id: auth.user.id, creator_id: creatorId, code });
  if (error) return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  return NextResponse.json({ code });
}
