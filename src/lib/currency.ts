import { createAdminClient } from "@/lib/supabase/admin";

import { roundMoney } from "@/lib/money";
export * from "@/lib/money";

const TTL_MS = 60 * 60 * 1000; // taux rafraîchis toutes les heures

/** Taux de change base USD, mis en cache dans Supabase */
async function usdRates(): Promise<Record<string, number>> {
  const db = createAdminClient();
  const { data } = await db.from("fx_rates").select("quote, rate, updated_at").eq("base", "USD");
  const fresh =
    data && data.length > 0 && Date.now() - new Date(data[0].updated_at).getTime() < TTL_MS;
  if (fresh) {
    return Object.fromEntries(data!.map((r: any) => [r.quote, Number(r.rate)]));
  }

  const key = process.env.EXCHANGE_RATE_API_KEY;
  const url = key
    ? `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
    : "https://open.er-api.com/v6/latest/USD";

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    const rates: Record<string, number> = json.conversion_rates ?? json.rates;
    if (!rates) throw new Error("taux indisponibles");
    const rows = Object.entries(rates).map(([quote, rate]) => ({
      base: "USD",
      quote,
      rate,
      updated_at: new Date().toISOString(),
    }));
    await db.from("fx_rates").upsert(rows, { onConflict: "base,quote" });
    return rates;
  } catch (e) {
    // En cas d'échec réseau, on retombe sur les derniers taux connus (même périmés)
    if (data && data.length > 0) {
      return Object.fromEntries(data.map((r: any) => [r.quote, Number(r.rate)]));
    }
    throw e;
  }
}

/** Taux from -> to */
export async function getRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rates = await usdRates();
  const f = from === "USD" ? 1 : rates[from];
  const t = to === "USD" ? 1 : rates[to];
  if (!f || !t) throw new Error(`Devise non supportée : ${from} → ${to}`);
  return t / f;
}

export async function convert(amount: number, from: string, to: string) {
  const rate = await getRate(from, to);
  return { amount: roundMoney(amount * rate, to), rate };
}
