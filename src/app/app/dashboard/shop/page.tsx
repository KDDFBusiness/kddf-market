import ShopForm from "@/components/ShopForm";
import { getMyProfile, getSessionUser } from "@/lib/auth";
import { shopUrl } from "@/lib/shop";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personnaliser ma boutique" };

export default async function ShopSettings() {
  const user = await getSessionUser();
  if (!user) return null;
  const p = await getMyProfile(user.id);
  if (!p) return null;
  const slug = p.store_slug ?? "";
  return (
    <ShopForm
      userId={user.id}
      storeName={p.store_name ?? p.full_name ?? ""}
      slug={slug}
      logoUrl={p.shop_logo_url}
      bannerUrl={p.shop_banner_url}
      description={p.shop_description ?? ""}
      color={p.shop_color}
      customColor={p.shop_color_custom}
      theme={p.shop_theme}
      sort={p.shop_sort}
      showWhatsapp={p.shop_show_whatsapp}
      shopLink={shopUrl(slug)}
    />
  );
}
