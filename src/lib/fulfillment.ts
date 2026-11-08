import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseEmail } from "@/lib/email";

/**
 * Finalise une commande payée. Idempotent : un webhook rejoué n'a aucun effet.
 * - passe la commande en "paid"
 * - crée la commission d'affiliation
 * - attribue une clé de licence si besoin
 * - envoie l'email de confirmation avec le lien de téléchargement
 */
export async function markOrderPaid(orderId: string, paymentReference?: { provider: string; reference: string }) {
  const db = createAdminClient();

  const { data: updated } = await db
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .neq("status", "paid")
    .select("*, products(id, title, type)")
    .maybeSingle();

  if (paymentReference) {
    await db
      .from("payments")
      .update({ status: "paid" })
      .eq("provider", paymentReference.provider)
      .eq("provider_reference", paymentReference.reference);
  }

  if (!updated) return { alreadyProcessed: true };

  if (updated.affiliate_id && Number(updated.affiliate_fee) > 0) {
    await db.from("commissions").upsert(
      {
        affiliate_id: updated.affiliate_id,
        order_id: updated.id,
        amount: updated.affiliate_fee,
        currency: updated.currency,
        status: "pending",
      },
      { onConflict: "order_id" }
    );
  }

  let licenseKey: string | null = null;
  if (updated.products?.type === "license") {
    const { data } = await db.rpc("assign_license_key", {
      p_product: updated.product_id,
      p_order: updated.id,
    });
    licenseKey = data ?? null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  try {
    await sendPurchaseEmail({
      to: updated.buyer_email,
      name: updated.buyer_name,
      productTitle: updated.products?.title ?? "Votre produit",
      downloadUrl: `${appUrl}/download/${updated.download_token}`,
      licenseKey,
    });
  } catch (e) {
    console.error("Échec envoi email", e); // ne bloque jamais la livraison
  }

  return { alreadyProcessed: false };
}

export async function markOrderFailed(orderId: string) {
  const db = createAdminClient();
  await db.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
}
