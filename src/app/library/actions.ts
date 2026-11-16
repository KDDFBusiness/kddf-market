"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/labels";
import { formString, isUuid } from "@/lib/validate";

export interface ActionState {
  message: string;
}

/** L'acheteur confirme avoir reçu sa commande : les fonds du vendeur peuvent être libérés. */
export async function confirmDelivery(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = formString(fd, "orderId");
  if (!isUuid(id)) return { message: "Commande invalide." };
  const { error } = await createClient().rpc("buyer_confirm_delivery", { p_order: id });
  revalidatePath("/library");
  return { message: error ? dbErrorMessage(error.message) : "Merci ! Réception confirmée." };
}

/** L'acheteur signale un problème : le déblocage automatique des fonds est suspendu jusqu'à décision de l'admin. */
export async function openDispute(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = formString(fd, "orderId");
  if (!isUuid(id)) return { message: "Commande invalide." };
  const { error } = await createClient().rpc("buyer_open_dispute", { p_order: id, p_reason: formString(fd, "reason").trim().slice(0, 500) });
  revalidatePath("/library");
  return { message: error ? dbErrorMessage(error.message) : "Litige ouvert. Nous revenons vers vous." };
}

/** Note de 1 à 5 étoiles + commentaire, possible seulement après "J'ai reçu mon produit" (contrôlé par la base). */
export async function submitReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = formString(fd, "orderId");
  const rating = Number(formString(fd, "rating"));
  if (!isUuid(id)) return { message: "Commande invalide." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { message: "Choisissez une note de 1 à 5 étoiles." };
  const { error } = await createClient().rpc("submit_review", { p_order: id, p_rating: rating, p_comment: formString(fd, "comment").trim().slice(0, 1000) });
  revalidatePath("/library");
  return { message: error ? dbErrorMessage(error.message) : "Merci pour votre avis !" };
}
