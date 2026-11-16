"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/labels";
import { isUuid } from "@/lib/validate";

export interface ReviewResult {
  ok: boolean;
  message: string;
}

/** Publie un avis. La base vérifie : acheteur du produit, commande payée ET livrée, un seul avis par produit. */
export async function submitProductReview(input: { orderId: string; rating: number; comment: string; photoUrl: string | null }): Promise<ReviewResult> {
  if (!isUuid(input.orderId)) return { ok: false, message: "Commande invalide." };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return { ok: false, message: "Choisissez une note de 1 à 5 étoiles." };
  const db = createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: "Vous n'êtes pas connecté.\nConnectez-vous pour publier votre avis." };

  // La photo doit venir de NOTRE stockage, dans le dossier de l'utilisateur
  let photo: string | null = null;
  if (input.photoUrl) {
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/covers/${auth.user.id}/`;
    if (!input.photoUrl.startsWith(prefix)) return { ok: false, message: "Photo non valide.\nChoisissez une image depuis votre appareil et réessayez." };
    photo = input.photoUrl;
  }

  const { error } = await db.rpc("submit_product_review", {
    p_order: input.orderId,
    p_rating: input.rating,
    p_comment: input.comment.trim().slice(0, 1000),
    p_photo: photo,
  });
  if (error) return { ok: false, message: dbErrorMessage(error.message) };
  revalidatePath("/p/[id]", "page");
  return { ok: true, message: "Merci pour votre avis !" };
}
