import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/db";
import type { Profile } from "@/lib/types";

/** Utilisateur connecté (ou null). */
export async function getSessionUser(): Promise<User | null> {
  const { data } = await createClient().auth.getUser();
  return data.user ?? null;
}

/** Profil de l'utilisateur connecté (nom, code d'affiliation, rôle...). */
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data } = await createClient()
    .from("profiles")
    .select("id, full_name, store_name, store_slug, avatar_url, phone, country, role, referral_code, whatsapp, city, is_verified, is_blocked, delivery_douala_price, delivery_shipping_price, shop_logo_url, shop_banner_url, shop_description, shop_color, shop_color_custom, shop_theme, shop_sort, shop_show_whatsapp, created_at")
    .eq("id", userId)
    .maybeSingle();
  return asRow<Profile>(data);
}
