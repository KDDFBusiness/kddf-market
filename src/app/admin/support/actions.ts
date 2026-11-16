"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formString, isUuid } from "@/lib/validate";

/** Marque un message traité (ou le rouvre). La base n'autorise que l'administrateur (RLS). */
export async function setSupportStatus(fd: FormData): Promise<void> {
  const id = formString(fd, "id");
  const resolved = formString(fd, "status") === "resolved";
  if (!isUuid(id)) return;
  await createClient()
    .from("support_messages")
    .update({ status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/admin/support");
}
