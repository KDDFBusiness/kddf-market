"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/labels";
import { formString } from "@/lib/validate";

export interface WithdrawState {
  message: string;
  ok: boolean;
}

// La demande est seulement ENREGISTRÉE (le montant est bloqué) : l'argent est envoyé à la main par l'administrateur.
export async function requestWithdrawal(_prev: WithdrawState, fd: FormData): Promise<WithdrawState> {
  const amount = Number(formString(fd, "amount"));
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, message: "Montant invalide." };
  const method = formString(fd, "method");
  const raw = formString(fd, "phone").trim();
  // Numéros Mobile Money : on retire espaces, points et tirets ; les autres destinations (email, adresse crypto, IBAN) restent telles quelles.
  const isPhone = ["mtn_momo", "orange_money", "wave", "moov_money", "mpesa"].includes(method);
  const { error } = await createClient().rpc("request_withdrawal", {
    p_amount: amount,
    p_method: method,
    p_phone: isPhone ? raw.replace(/[\s.-]/g, "") : raw,
  });
  revalidatePath("/dashboard/wallet");
  if (error) return { ok: false, message: dbErrorMessage(error.message) };
  return { ok: true, message: "Demande enregistrée. Elle sera traitée manuellement." };
}
