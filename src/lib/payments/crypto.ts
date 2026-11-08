import crypto from "crypto";

// NOWPayments : BTC, ETH, USDT (TRC-20 / ERC-20)
const PAY_CURRENCY: Record<string, string> = {
  btc: "btc",
  eth: "eth",
  usdt_trc20: "usdttrc20",
  usdt_erc20: "usdterc20",
};

export async function createCryptoInvoice(args: {
  orderId: string;
  methodId: string;
  title: string;
  amountUsd: number;
  appUrl: string;
  successUrl: string;
}) {
  const res = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: {
      "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: args.amountUsd,
      price_currency: "usd",
      pay_currency: PAY_CURRENCY[args.methodId],
      order_id: args.orderId,
      order_description: args.title,
      ipn_callback_url: `${args.appUrl}/api/webhooks/crypto`,
      success_url: args.successUrl,
      cancel_url: `${args.appUrl}/checkout/cancelled`,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`NOWPayments ${res.status}: ${JSON.stringify(json)}`);
  return { id: String(json.id), url: json.invoice_url as string };
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: any, k) => ((acc[k] = sortKeys(value[k])), acc), {});
  }
  return value;
}

/** Signature IPN : HMAC-SHA512 du JSON trié par clés */
export function verifyNowPaymentsSignature(body: unknown, header: string | null) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !header) return false;
  const expected = crypto.createHmac("sha512", secret).update(JSON.stringify(sortKeys(body))).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
