"use server";
import { revalidatePath } from "next/cache";
import { failWith } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { formString, isUuid } from "@/lib/validate";

const ALLOWED = ["confirmed", "shipped", "ready_for_pickup", "delivered"];

// Le vendeur fait avancer la commande. La base vérifie que c'est bien son produit et que l'étape est autorisée.
export async function changeOrderStatus(fd: FormData): Promise<void> {
  const id = formString(fd, "orderId");
  const status = formString(fd, "status");
  if (!isUuid(id) || !ALLOWED.includes(status)) return;
  const { error } = await createClient().rpc("seller_update_order_status", { p_order: id, p_status: status });
  if (error) failWith("/dashboard/orders", error.message);
  revalidatePath("/dashboard/orders");
}

/** Paiement à la livraison : le vendeur confirme avoir encaissé le cash (la commission KDDF de 8 % sera déduite de son prochain retrait). */
export async function confirmCash(fd: FormData): Promise<void> {
  const id = formString(fd, "orderId");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("seller_confirm_cash", { p_order: id });
  if (error) failWith("/dashboard/orders", error.message);
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/wallet");
}

/** Annule une commande « paiement à la livraison » non encaissée (le stock est remis). */
export async function cancelCodOrder(fd: FormData): Promise<void> {
  const id = formString(fd, "orderId");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("seller_cancel_cod", { p_order: id });
  if (error) failWith("/dashboard/orders", error.message);
  revalidatePath("/dashboard/orders");
}
