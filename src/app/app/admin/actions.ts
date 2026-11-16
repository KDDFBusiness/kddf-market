"use server";
import { revalidatePath } from "next/cache";
import { failWith } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { cleanText, formString, isUuid } from "@/lib/validate";

// Toutes ces fonctions SQL vérifient elles-mêmes que l'appelant est administrateur (profiles.role = 'admin').

export async function processWithdrawal(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  const result = formString(fd, "result");
  if (!isUuid(id) || (result !== "paid" && result !== "failed")) return;
  const { error } = await createClient().rpc("admin_process_withdrawal", { p_id: id, p_result: result, p_note: cleanText(formString(fd, "note"), 200) || null });
  if (error) failWith("/admin/withdrawals", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/withdrawals");
}

export async function refundTransaction(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("admin_refund_transaction", { p_transaction: id, p_note: cleanText(formString(fd, "note"), 200) || null });
  if (error) failWith("/admin/orders", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
}

export async function resolveDispute(fd: FormData): Promise<void> {
  const id = formString(fd, "orderId");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("admin_resolve_dispute", { p_order: id });
  if (error) failWith("/admin/orders", error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
}

/** Badge « Vendeur Vérifié » (après contrôle de la CNI). */
export async function setVerified(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("admin_set_verified", { p_user: id, p_value: formString(fd, "value") === "1" });
  if (error) failWith("/admin/sellers", error.message);
  revalidatePath("/admin/sellers");
}

/** Bloque (ou débloque) un vendeur : ses produits sont dépubliés et il ne peut plus vendre ni retirer. */
export async function setBlocked(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  if (!isUuid(id)) return;
  const { error } = await createClient().rpc("admin_set_blocked", { p_user: id, p_value: formString(fd, "value") === "1" });
  if (error) failWith("/admin/sellers", error.message);
  revalidatePath("/admin/sellers");
  revalidatePath("/admin/products");
}

/** Modération d'un nouveau produit : « approved » ou « rejected » (avec un motif facultatif). */
export async function moderateProduct(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  const decision = formString(fd, "decision");
  if (!isUuid(id) || (decision !== "approved" && decision !== "rejected")) return;
  const { error } = await createClient().rpc("admin_moderate_product", { p_product: id, p_decision: decision, p_note: cleanText(formString(fd, "note"), 200) || null });
  if (error) failWith("/admin/products", error.message);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}
