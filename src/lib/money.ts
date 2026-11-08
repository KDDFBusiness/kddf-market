export const DISPLAY_CURRENCIES = ["XAF", "XOF", "EUR", "USD", "GBP", "NGN", "KES", "GHS"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

// Devises sans décimales
const ZERO_DECIMAL = new Set(["XAF", "XOF", "GNF", "RWF", "UGX", "JPY", "KRW"]);

export function decimals(currency: string) {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function roundMoney(amount: number, currency: string) {
  const f = 10 ** decimals(currency);
  return Math.round(amount * f) / f;
}

/** Montant en plus petite unité (centimes) pour Stripe */
export function toMinor(amount: number, currency: string) {
  return Math.round(amount * 10 ** decimals(currency));
}

export function formatMoney(amount: number, currency: string, locale = "fr-FR") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: decimals(currency),
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
