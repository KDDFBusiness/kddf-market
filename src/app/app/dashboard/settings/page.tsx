import ProfileForm from "@/components/ProfileForm";
import { getMyProfile, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon profil" };

export default async function Settings() {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getMyProfile(user.id);
  const { count } = await createClient()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("product_type", "physical");
  return (
    <ProfileForm
      userId={user.id}
      email={user.email ?? ""}
      fullName={profile?.full_name ?? ""}
      avatarUrl={profile?.avatar_url ?? null}
      whatsapp={profile?.whatsapp ?? ""}
      phone={profile?.phone ?? ""}
      city={profile?.city ?? ""}
      referralCode={profile?.referral_code ?? ""}
      deliveryDoualaPrice={profile?.delivery_douala_price ?? 1000}
      deliveryShippingPrice={profile?.delivery_shipping_price ?? 2500}
      hasPhysicalProducts={(count ?? 0) > 0}
    />
  );
}
