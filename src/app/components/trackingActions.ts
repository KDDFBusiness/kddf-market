"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/labels";
import { formString, isUuid } from "@/lib/validate";

export interface TrackingState {
  message: string;
}

/**
 * Boutons du suivi de commande. Tout passe par les fonctions SÉCURISÉES déjà en place (seller_update_order_status,
 * buyer_confirm_delivery) ou par seller_mark_out_for_delivery : la base vérifie qui a le droit de faire quoi.
 * La logique d'argent n'est pas touchée : les fonds sont libérés comme avant, à la livraison.
 */
export async function trackingAction(_prev: TrackingState, fd: FormData): Promise<TrackingState> {
  const orderId = formString(fd, "orderId");
  const op = formString(fd, "op");
  if (!isUuid(orderId)) return { message: "Commande invalide." };
  const db = createClient();

  let error: { message: string } | null = null;
  if (op === "ship") {
    const { data: row } = await db.from("orders").select("status, delivery_method").eq("id", orderId).maybeSingle();
    const o = row as { status: string; delivery_method: string | null } | null;
    if (!o) return { message: "Commande introuvable ou accès refusé.\nConnectez-vous avec le compte vendeur de cette commande." };
    if (o.status === "pending") {
      const r = await db.rpc("seller_update_order_status", { p_order: orderId, p_status: "confirmed" });
      error = r.error;
    }
    if (!error) {
      const r = await db.rpc("seller_update_order_status", { p_order: orderId, p_status: o.delivery_method === "pickup_douala" ? "ready_for_pickup" : "shipped" });
      error = r.error;
    }
  } else if (op === "out") {
    error = (await db.rpc("seller_mark_out_for_delivery", { p_order: orderId })).error;
  } else if (op === "receive") {
    error = (await db.rpc("buyer_confirm_delivery", { p_order: orderId })).error;
  } else {
    return { message: "Action inconnue." };
  }

  revalidatePath("/download/[token]", "page");
  revalidatePath("/library");
  return { message: error ? dbErrorMessage(error.message) : "C'est enregistré." };
}
