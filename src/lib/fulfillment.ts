// Validation d'un paiement Fapshi. Utilisé par le webhook, par la page de retour de l'acheteur
// et par la tâche planifiée : les trois passent par la MÊME fonction, donc le même résultat.
//
// Règle d'or : on ne croit JAMAIS ce que dit le webhook. On relit le statut chez Fapshi
// (GET /payment-status), puis la base fait tout en une seule opération atomique
// (fonction SQL confirm_fapshi_payment : commande payée, stock, portefeuilles, répartition).
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatus, type FapshiTransaction } from "@/lib/fapshi";
import { getFlutterwaveStatus } from "@/lib/flutterwave";
import { REF_PREFIX } from "@/lib/payments";
import { sendPurchaseEmail, sendSellerNewOrderEmail } from "@/lib/email";
import { asRow } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { DELIVERY_LABELS } from "@/lib/labels";
import type { DeliveryMethod, ProductType } from "@/lib/types";

export type SyncResult = "paid" | "review" | "failed" | "expired" | "pending" | "ignored" | "throttled" | "error";

interface SyncOptions {
  source: "webhook" | "verification" | "cron";
  /** Délai minimum entre deux vérifications de la même transaction (Fapshi : 6 par minute maximum). */
  minAgeSeconds: number;
  /** Statut déjà relu chez le fournisseur (cas de l'IPN crypto, qui ne peut pas être interrogé à la demande). */
  remote?: FapshiTransaction;
}

/** Relit le statut réel chez le bon fournisseur selon le préfixe de la référence (flw: / np: / sinon Fapshi). */
async function fetchRemote(ref: string, opts: SyncOptions): Promise<FapshiTransaction> {
  if (opts.remote) return opts.remote;
  if (ref.startsWith(REF_PREFIX.flutterwave)) return getFlutterwaveStatus(ref.slice(REF_PREFIX.flutterwave.length));
  if (ref.startsWith(REF_PREFIX.crypto)) {
    // Crypto : confirmation uniquement par l'IPN signé de NOWPayments, pas d'interrogation à la demande.
    return { transId: ref, status: "PENDING", amount: 0, revenue: null, medium: null, externalId: null };
  }
  return getPaymentStatus(ref);
}

interface ConfirmResult {
  status: "paid" | "review" | "already";
  order_id: string;
  reason?: string;
  buyer_email?: string;
  buyer_name?: string | null;
  product_title?: string;
  product_type?: ProductType;
  download_token?: string;
  license_key?: string | null;
  total?: number;
}

export async function syncFapshiTransaction(transId: string, opts: SyncOptions): Promise<SyncResult> {
  const db = createAdminClient();

  // 1. On ne s'occupe que de nos propres transactions encore ouvertes.
  const { data: row } = await db.from("transactions").select("id, status").eq("fapshi_trans_id", transId).maybeSingle();
  const tx = asRow<{ id: string; status: string }>(row);
  // Pas une commande : c'est peut-être le paiement d'un BOOST de produit
  if (!tx) return syncBoostPayment(transId, opts);
  if (tx.status !== "pending" && tx.status !== "failed") return "ignored";

  // 2. Anti-abus : une seule vérification chez Fapshi par fenêtre de temps (réservation atomique).
  const now = new Date();
  const cutoff = new Date(now.getTime() - opts.minAgeSeconds * 1000).toISOString();
  const { data: claimed } = await db
    .from("transactions")
    .update({ last_checked_at: now.toISOString() })
    .eq("id", tx.id)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .select("id");
  if (!Array.isArray(claimed) || claimed.length === 0) return "throttled";

  // 3. Statut réel chez Fapshi
  let remote;
  try {
    remote = await fetchRemote(transId, opts);
  } catch (e) {
    console.error("[paiement] vérification impossible", transId, e instanceof Error ? e.message : e);
    return "error";
  }

  // Journal d'audit (réservé à l'admin)
  await db.from("payment_events").insert({ transaction_id: tx.id, source: opts.source, payload: remote });

  // 4. Réaction selon le statut
  if (remote.status === "SUCCESSFUL") {
    const { data, error } = await db.rpc("confirm_fapshi_payment", {
      p_trans_id: transId,
      p_amount: remote.amount,
      p_medium: remote.medium,
      p_revenue: remote.revenue,
    });
    if (error) {
      console.error("[fapshi] confirmation impossible", transId, error.message);
      return "error";
    }
    const result = asRow<ConfirmResult>(data);
    if (!result) return "error";
    if (result.status === "paid") {
      await afterPayment(result);
      return "paid";
    }
    if (result.status === "review") {
      console.error("[fapshi] paiement reçu mais à traiter à la main :", transId, result.reason);
      return "review";
    }
    return "ignored"; // déjà traité
  }

  if (remote.status === "FAILED" || remote.status === "EXPIRED") {
    await db.rpc("mark_fapshi_failed", { p_trans_id: transId, p_fapshi_status: remote.status });
    return remote.status === "EXPIRED" ? "expired" : "failed";
  }

  // CREATED / PENDING : on note simplement le statut
  await db.from("transactions").update({ fapshi_status: remote.status }).eq("id", tx.id);
  return "pending";
}

/** Emails envoyés une seule fois, au moment où le paiement est validé. Une erreur d'email ne bloque jamais la livraison. */
async function afterPayment(r: ConfirmResult): Promise<void> {
  const isPhysical = r.product_type === "physical";
  try {
    if (r.buyer_email && r.download_token && r.product_title && typeof r.total === "number") {
      await sendPurchaseEmail({
        to: r.buyer_email,
        name: r.buyer_name ?? null,
        productTitle: r.product_title,
        portalUrl: `${appUrl()}/download/${r.download_token}`,
        licenseKey: r.license_key ?? null,
        isPhysical,
        totalFcfa: r.total,
      });
    }
    if (isPhysical) await notifySeller(r);
  } catch (e) {
    console.error("[fapshi] email non envoyé", e instanceof Error ? e.message : e);
  }
}

async function notifySeller(r: ConfirmResult): Promise<void> {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("seller_id, quantity, delivery_method, delivery_address, phone, buyer_name")
    .eq("id", r.order_id)
    .maybeSingle();
  const order = asRow<{
    seller_id: string;
    quantity: number;
    delivery_method: DeliveryMethod | null;
    delivery_address: string | null;
    phone: string | null;
    buyer_name: string | null;
  }>(data);
  if (!order) return;
  const { data: seller } = await db.auth.admin.getUserById(order.seller_id);
  const to = seller.user?.email;
  if (!to) return;
  await sendSellerNewOrderEmail({
    to,
    productTitle: r.product_title ?? "Produit",
    quantity: order.quantity,
    deliveryLabel: order.delivery_method ? DELIVERY_LABELS[order.delivery_method] : "—",
    buyerName: order.buyer_name,
    buyerPhone: order.phone,
    address: order.delivery_address,
    dashboardUrl: `${appUrl()}/dashboard/orders`,
  });
}


/**
 * Même principe que pour une commande, pour le paiement d'un boost :
 * on relit le statut chez Fapshi, puis la base active le boost (fonction SQL confirm_boost_payment).
 */
export async function syncBoostPayment(transId: string, opts: SyncOptions): Promise<SyncResult> {
  const db = createAdminClient();
  const { data: row } = await db.from("product_boosts").select("id, status").eq("fapshi_trans_id", transId).maybeSingle();
  const boost = asRow<{ id: string; status: string }>(row);
  if (!boost || (boost.status !== "pending" && boost.status !== "failed")) return "ignored";

  const now = new Date();
  const cutoff = new Date(now.getTime() - opts.minAgeSeconds * 1000).toISOString();
  const { data: claimed } = await db
    .from("product_boosts")
    .update({ last_checked_at: now.toISOString() })
    .eq("id", boost.id)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .select("id");
  if (!Array.isArray(claimed) || claimed.length === 0) return "throttled";

  let remote;
  try {
    remote = await getPaymentStatus(transId);
  } catch (e) {
    console.error("[fapshi] vérification du boost impossible", transId, e instanceof Error ? e.message : e);
    return "error";
  }

  if (remote.status === "SUCCESSFUL") {
    const { error } = await db.rpc("confirm_boost_payment", { p_trans_id: transId, p_amount: remote.amount });
    if (error) {
      console.error("[fapshi] confirmation du boost impossible", transId, error.message);
      return "error";
    }
    return "paid";
  }
  if (remote.status === "FAILED" || remote.status === "EXPIRED") {
    await db.rpc("mark_boost_failed", { p_trans_id: transId, p_fapshi_status: remote.status });
    return remote.status === "EXPIRED" ? "expired" : "failed";
  }
  await db.from("product_boosts").update({ fapshi_status: remote.status }).eq("id", boost.id);
  return "pending";
}
