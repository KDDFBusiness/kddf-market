import ProductForm from "@/components/ProductForm";
import { getMyProfile, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouveau produit" };

export default async function NewProduct() {
  const user = await getSessionUser();
  if (!user) return null;
  // Produits digitaux du vendeur, proposés pour composer une offre groupée
  const { data } = await createClient()
    .from("products")
    .select("id, title")
    .eq("seller_id", user.id)
    .eq("product_type", "digital")
    .order("created_at", { ascending: false });
  const profile = await getMyProfile(user.id);
  return (
    <ProductForm sellerId={user.id} bundleCandidates={asRows<{ id: string; title: string }>(data)} defaultWhatsapp={profile?.whatsapp ?? ""}
      deliveryDoualaPrice={profile?.delivery_douala_price ?? 1000}
      deliveryShippingPrice={profile?.delivery_shipping_price ?? 2500}
    />
  );
}
