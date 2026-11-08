// Catalogue unique des moyens de paiement affichés dans le checkout.
// "provider" indique quel prestataire traite réellement la transaction.

export type Provider = "stripe" | "fedapay" | "crypto";
export type Group = "mobile" | "card" | "wallet" | "crypto";

export interface PaymentMethod {
  id: string;
  label: string;
  group: Group;
  provider: Provider;
  hint?: string;
}

export const GROUP_LABELS: Record<Group, string> = {
  mobile: "Mobile Money",
  card: "Cartes bancaires",
  wallet: "Portefeuilles électroniques",
  crypto: "Cryptomonnaies",
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  // Mobile Money (FedaPay ouvre sa page sécurisée où l'opérateur est sélectionné)
  { id: "orange_money", label: "Orange Money", group: "mobile", provider: "fedapay" },
  { id: "mtn_momo", label: "MTN MoMo", group: "mobile", provider: "fedapay" },
  { id: "wave", label: "Wave", group: "mobile", provider: "fedapay" },
  { id: "moov_money", label: "Moov Money", group: "mobile", provider: "fedapay" },
  { id: "mpesa", label: "M-Pesa", group: "mobile", provider: "fedapay", hint: "Selon couverture de votre compte" },
  // Cartes (Stripe)
  { id: "card", label: "Visa / Mastercard / Amex", group: "card", provider: "stripe" },
  // Portefeuilles (Stripe Checkout les propose automatiquement s'ils sont activés)
  { id: "paypal", label: "PayPal", group: "wallet", provider: "stripe" },
  { id: "apple_pay", label: "Apple Pay", group: "wallet", provider: "stripe" },
  { id: "google_pay", label: "Google Pay", group: "wallet", provider: "stripe" },
  // Crypto (NOWPayments)
  { id: "btc", label: "Bitcoin (BTC)", group: "crypto", provider: "crypto" },
  { id: "eth", label: "Ethereum (ETH)", group: "crypto", provider: "crypto" },
  { id: "usdt_trc20", label: "USDT (TRC-20)", group: "crypto", provider: "crypto" },
  { id: "usdt_erc20", label: "USDT (ERC-20)", group: "crypto", provider: "crypto" },
];

export function getMethod(id: string) {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

// Devises acceptées par chaque prestataire (la conversion est faite avant validation)
export const STRIPE_CURRENCIES = ["EUR", "USD", "GBP"];
export const FEDAPAY_CURRENCY = "XOF"; // XAF et XOF ont une parité fixe (1 XAF = 1 XOF)
export const CRYPTO_PRICE_CURRENCY = "USD";

export function chargeCurrencyFor(provider: Provider, buyerCurrency: string) {
  if (provider === "fedapay") return FEDAPAY_CURRENCY;
  if (provider === "crypto") return CRYPTO_PRICE_CURRENCY;
  return STRIPE_CURRENCIES.includes(buyerCurrency) ? buyerCurrency : "USD";
}
