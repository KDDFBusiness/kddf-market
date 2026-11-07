import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vérifie que la commande est payée, puis redirige vers une URL signée valable 60 secondes
export async function GET(_req: Request, { params }: { params: { token: string; fileId: string } }) {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id, product_id, status")
    .eq("download_token", params.token)
    .maybeSingle();
  if (!order || order.status !== "paid") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { data: file } = await db
    .from("product_files")
    .select("id, product_id, storage_path, file_name")
    .eq("id", params.fileId)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });

  // Le fichier doit appartenir au produit acheté ou à l'un des produits de l'offre groupée
  let allowed = file.product_id === order.product_id;
  if (!allowed) {
    const { data: link } = await db
      .from("bundle_items")
      .select("product_id")
      .eq("bundle_id", order.product_id)
      .eq("product_id", file.product_id)
      .maybeSingle();
    allowed = !!link;
  }
  if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { data: signed, error } = await db.storage
    .from("deliverables")
    .createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !signed) return NextResponse.json({ error: "Lien indisponible" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
