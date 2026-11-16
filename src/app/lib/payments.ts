// Moyens de paiement en ligne du site. Fapshi est toujours disponible (comportement historique) ;
// Flutterwave (cartes + Mobile Money élargi) et la crypto ne s'affichent QUE si leurs clés sont présentes sur Vercel.
export type PaymentProvider = "fapshi" | "flutterwave" | "crypto";

export const PROVIDERS: readonly PaymentProvider[] = ["fapshi", "flutterwave", "crypto"];

export const PROVIDER_LABELS: Record<PaymentProvider, { title: string; detail: string }> = {
  fapshi: { title: "Mobile Money Cameroun", detail: "MTN MoMo ou Orange Money (via Fapshi)" },
  flutterwave: { title: "Carte bancaire & Mobile Money Afrique", detail: "Visa, Mastercard, Wave, Moov, M-Pesa, Orange, MTN… (via Flutterwave)" },
  crypto: { title: "Cryptomonnaie", detail: "USDT, Bitcoin, Ethereum… (via NOWPayments)" },
};

export function isProvider(v: unknown): v is PaymentProvider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

export function enabledProviders(): PaymentProvider[] {
  const list: PaymentProvider[] = ["fapshi"];
  if (process.env.FLW_SECRET_KEY) list.push("flutterwave");
  if (process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET) list.push("crypto");
  return list;
}

/** Préfixes stockés dans transactions.fapshi_trans_id (la colonne garde son nom historique). */
export const REF_PREFIX = { flutterwave: "flw:", crypto: "np:" } as const;
