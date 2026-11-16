import type { DeliveryMethod, PaymentMethod, DigitalKind, OrderStatus, Product, TransactionStatus, WithdrawalMethod } from "@/lib/types";
import { explainError } from "@/lib/errors";

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  pickup_douala: "Je viens récupérer",
  delivery_douala: "Livraison à domicile à Douala",
  shipping_cameroon: "Envoi par bus / expédition",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  ready_for_pickup: "Prête pour retrait",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  failed: "Échec",
  expired: "Expirée",
  refunded: "Remboursée",
  review: "À traiter",
};

export const WITHDRAWAL_METHOD_LABELS: Record<WithdrawalMethod, string> = {
  mtn_momo: "MTN MoMo",
  orange_money: "Orange Money",
  fapshi: "Fapshi",
  wave: "Wave",
  moov_money: "Moov Money",
  mpesa: "M-Pesa",
  bank_transfer: "Virement bancaire",
  crypto_usdt: "Crypto USDT",
  crypto_btc: "Crypto Bitcoin",
  paypal: "PayPal",
};

/** Moyens proposés aux vendeurs pour retirer leur argent, avec le champ à remplir pour chacun. */
export const WITHDRAWAL_CHOICES: { value: WithdrawalMethod; group: string; field: "phone" | "email" | "wallet" | "bank"; }[] = [
  { value: "mtn_momo", group: "Mobile Money", field: "phone" },
  { value: "orange_money", group: "Mobile Money", field: "phone" },
  { value: "wave", group: "Mobile Money", field: "phone" },
  { value: "moov_money", group: "Mobile Money", field: "phone" },
  { value: "mpesa", group: "Mobile Money", field: "phone" },
  { value: "bank_transfer", group: "Banque", field: "bank" },
  { value: "paypal", group: "Portefeuille", field: "email" },
  { value: "crypto_usdt", group: "Crypto", field: "wallet" },
  { value: "crypto_btc", group: "Crypto", field: "wallet" },
];

export const DIGITAL_KIND_LABELS: Record<DigitalKind, string> = {
  file: "Ebook / Fichier",
  course: "Formation",
  license: "Licence",
  bundle: "Offre groupée",
  coaching: "Coaching",
  service: "Service",
};

/** Libellé court d'un produit (ex : "Formation" ou "Produit physique"). */
export function productTypeLabel(p: Pick<Product, "product_type" | "digital_kind">): string {
  if (p.product_type === "physical") return "Produit physique";
  return p.digital_kind ? DIGITAL_KIND_LABELS[p.digital_kind] : "Produit digital";
}

export interface StatusAction {
  status: OrderStatus;
  label: string;
}

/** Étapes suivantes possibles pour le vendeur (identiques aux règles de la base). */
export function nextStatusActions(current: OrderStatus, method: DeliveryMethod): StatusAction[] {
  switch (current) {
    case "pending":
      return [{ status: "confirmed", label: "Confirmer la commande" }];
    case "confirmed":
      return method === "pickup_douala"
        ? [{ status: "ready_for_pickup", label: "Prête pour retrait" }]
        : [{ status: "shipped", label: "Marquer expédiée" }];
    case "shipped":
    case "ready_for_pickup":
      return [{ status: "delivered", label: "Marquer livrée" }];
    default:
      return [];
  }
}

/** Étapes affichées dans le suivi de commande de l'acheteur. */
export function orderSteps(method: DeliveryMethod): OrderStatus[] {
  return method === "pickup_douala"
    ? ["pending", "confirmed", "ready_for_pickup", "delivered"]
    : ["pending", "confirmed", "shipped", "delivered"];
}

/** Transforme l'erreur technique en message « Cause + Solution » (voir lib/errors.ts). */
export function dbErrorMessage(raw: string | undefined): string {
  return explainError(raw);
}

/**
 * Libellé de statut affiché à l'acheteur / au vendeur.
 * Paiement à la livraison non encore encaissé : "En attente de livraison - Paiement cash".
 */
export function orderStatusLabel(o: { status: OrderStatus; payment_method: PaymentMethod; payment_status: string }): string {
  if (o.payment_method === "cod" && o.payment_status === "pending" && o.status !== "cancelled") {
    return "En attente de livraison - Paiement cash";
  }
  return ORDER_STATUS_LABELS[o.status];
}
