import { formatFcfa } from "@/lib/money";
import type { Transaction } from "@/lib/types";

export type SplitTx = Pick<Transaction, "total_amount" | "platform_fee" | "affiliate_fee" | "seller_amount" | "affiliate_id">;

/** Ligne d'historique : "Vente 10 000 FCFA AVEC affilié -> Toi : 6 500 / Affilié : 3 000 / KDDF : 500" */
export function splitLine(t: SplitTx): string {
  const withAff = t.affiliate_id !== null;
  return `Vente ${formatFcfa(t.total_amount)} ${withAff ? "AVEC" : "SANS"} affilié -> Toi : ${formatFcfa(t.seller_amount ?? 0)}${
    withAff ? ` / Affilié : ${formatFcfa(t.affiliate_fee ?? 0)}` : ""
  } / KDDF : ${formatFcfa(t.platform_fee ?? 0)}`;
}
