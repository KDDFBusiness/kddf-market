// Types des tables Supabase (voir supabase/schema.sql). Tous les montants sont des ENTIERS en FCFA.

export type ProductType = "digital" | "physical";
export type DigitalKind = "file" | "course" | "license" | "bundle" | "coaching" | "service";
export type DeliveryMethod = "pickup_douala" | "delivery_douala" | "shipping_cameroon";

export interface DeliveryOption {
  enabled: boolean;
  price: number;
}
export type DeliveryOptions = Partial<Record<DeliveryMethod, DeliveryOption>>;

export type ModerationStatus = "pending" | "approved" | "rejected";
export type PaymentMethod = "online" | "cod";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "ready_for_pickup" | "delivered" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";
export type TransactionStatus = "pending" | "paid" | "failed" | "expired" | "refunded" | "review";
export type WithdrawalStatus = "pending" | "paid" | "failed";
export type ShopColor = "noir" | "bleu" | "rouge" | "vert" | "orange" | "violet";
export type ShopTheme = "light" | "dark";
export type ShopSort = "newest" | "oldest" | "price_asc" | "price_desc" | "name";
export type BoostPlan = "3d" | "7d";
export type WithdrawalMethod = "mtn_momo" | "orange_money" | "fapshi" | "wave" | "moov_money" | "mpesa" | "bank_transfer" | "crypto_usdt" | "crypto_btc" | "paypal";

export interface Profile {
  id: string;
  full_name: string | null;
  store_name: string | null;
  store_slug: string | null;
  avatar_url: string | null;
  phone: string | null;
  country: string;
  role: "user" | "admin";
  referral_code: string;
  whatsapp: string | null;
  city: string | null;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_description: string | null;
  shop_color: ShopColor;
  shop_color_custom: string | null;
  shop_theme: ShopTheme;
  shop_sort: ShopSort;
  shop_show_whatsapp: boolean;
  is_verified: boolean;
  is_blocked: boolean;
  delivery_douala_price: number;
  delivery_shipping_price: number;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  product_type: ProductType;
  digital_kind: DigitalKind | null;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  price: number;
  is_published: boolean;
  affiliate_enabled: boolean;
  affiliate_percent: number;
  booking_url: string | null;
  duration_minutes: number | null;
  delivery_notes: string | null;
  stock: number | null;
  images: string[];
  weight: string | null;
  variant: string | null;
  delivery_options: DeliveryOptions | null;
  category: string | null;
  city: string | null;
  rating_avg: number;
  rating_count: number;
  moderation_status: ModerationStatus;
  moderation_note: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  product_id: string;
  seller_id: string;
  buyer_id: string | null;
  buyer_email: string;
  buyer_name: string | null;
  affiliate_id: string | null;
  affiliate_percent: number | null;
  quantity: number;
  unit_price: number;
  delivery_method: DeliveryMethod | null;
  delivery_price: number;
  total_price: number;
  delivery_address: string | null;
  phone: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  download_token: string;
  buyer_confirmed_at: string | null;
  delivered_at: string | null;
  disputed: boolean;
  dispute_reason: string | null;
  disputed_at: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Transaction {
  id: string;
  order_id: string;
  product_id: string;
  buyer_id: string | null;
  seller_id: string;
  affiliate_id: string | null;
  total_amount: number;
  goods_amount: number | null;
  platform_fee: number | null;
  platform_fee_percent: number | null;
  affiliate_fee: number | null;
  affiliate_fee_percent: number | null;
  seller_amount: number | null;
  status: TransactionStatus;
  review_reason: string | null;
  fapshi_trans_id: string | null;
  fapshi_status: string | null;
  fapshi_medium: string | null;
  fapshi_revenue: number | null;
  release_at: string | null;
  released_at: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Wallet {
  user_id: string;
  balance_pending: number;
  balance_available: number;
  total_earned: number;
  total_withdrawn: number;
  commission_due: number;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  method: WithdrawalMethod;
  phone_number: string;
  status: WithdrawalStatus;
  note: string | null;
  created_at: string;
  processed_at: string | null;
  commission_deducted: number;
}
