import { NextResponse } from "next/server";
import { convert } from "@/lib/currency";
import { chargeCurrencyFor, getMethod } from "@/lib/payments/methods";

// GET /api/fx?amount=20000&from=XAF&to=EUR            -> conversion simple
// GET /api/fx?amount=20000&from=XAF&to=EUR&method=btc  -> montant réellement facturé pour ce moyen de paiement
export async function GET(req: Request) {
  const u = new URL(req.url);
  const amount = Number(u.searchParams.get("amount"));
  const from = (u.searchParams.get("from") || "XAF").toUpperCase();
  const to = (u.searchParams.get("to") || from).toUpperCase();
  const method = getMethod(u.searchParams.get("method") || "");
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "amount invalide" }, { status: 400 });

  try {
    const target = method ? chargeCurrencyFor(method.provider, to) : to;
    const { amount: converted, rate } = await convert(amount, from, target);
    return NextResponse.json({ amount: converted, currency: target, rate, updatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
