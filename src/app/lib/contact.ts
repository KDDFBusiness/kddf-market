import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/db";
import { toWhatsappNumber } from "@/lib/phone";

export interface SellerContact {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Coordonnées du vendeur. À n'appeler QU'APRÈS avoir vérifié qu'une commande PAYÉE d'un produit PHYSIQUE existe
 * pour l'acheteur connecté (voir hasPaidPhysicalOrder) : avant paiement, le numéro n'est jamais envoyé au navigateur.
 */
export async function getSellerContact(sellerId: string): Promise<SellerContact> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("whatsapp, phone").eq("id", sellerId).maybeSingle();
  const profile = asRow<{ whatsapp: string | null; phone: string | null }>(data);
  let whatsapp = profile?.whatsapp ?? null;
  if (!whatsapp) {
    // Ancien produit créé avant la fiche profil : on reprend le numéro saisi sur le produit
    const { data: p } = await db.from("products").select("whatsapp_seller").eq("seller_id", sellerId).not("whatsapp_seller", "is", null).limit(1).maybeSingle();
    whatsapp = asRow<{ whatsapp_seller: string | null }>(p)?.whatsapp_seller ?? null;
  }
  const { data: user } = await db.auth.admin.getUserById(sellerId);
  return {
    whatsapp: whatsapp ? toWhatsappNumber(whatsapp) : null,
    phone: profile?.phone ? profile.phone.replace(/[^\d+]/g, "") : null,
    email: user.user?.email ?? null,
  };
}

/** Vrai si l'utilisateur connecté a passé une commande PAYÉE (ou en paiement à la livraison) de produit PHYSIQUE chez ce vendeur (règles RLS : ses propres commandes). */
export async function hasPaidPhysicalOrder(sellerId: string, productId?: string): Promise<boolean> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  let q = supabase
    .from("orders")
    .select("id")
    .eq("buyer_id", auth.user.id)
    .eq("seller_id", sellerId)
    .or("payment_status.eq.paid,payment_method.eq.cod") // payé en ligne, OU commande en paiement à la livraison
    .not("delivery_method", "is", null)
    .neq("status", "cancelled");
  if (productId) q = q.eq("product_id", productId);
  const { data } = await q.limit(1);
  return Array.isArray(data) && data.length > 0;
}
