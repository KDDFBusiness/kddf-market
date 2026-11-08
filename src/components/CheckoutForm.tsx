"use client";
import { useEffect, useMemo, useState } from "react";
import { GROUP_LABELS, PAYMENT_METHODS, type Group } from "@/lib/payments/methods";
import { DISPLAY_CURRENCIES, formatMoney } from "@/lib/money";

interface Props {
  product: { id: string; title: string; price_amount: number; price_currency: string };
  defaultEmail?: string;
}

export default function CheckoutForm({ product, defaultEmail }: Props) {
  const [currency, setCurrency] = useState<string>(product.price_currency);
  const [methodId, setMethodId] = useState<string>("card");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [name, setName] = useState("");
  const [shown, setShown] = useState<{ amount: number; currency: string } | null>(null);
  const [quote, setQuote] = useState<{ amount: number; currency: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const groups = useMemo(() => {
    const g: Partial<Record<Group, typeof PAYMENT_METHODS>> = {};
    PAYMENT_METHODS.forEach((m) => ((g[m.group] ??= []).push(m)));
    return Object.entries(g) as [Group, typeof PAYMENT_METHODS][];
  }, []);

  // Prix affiché dans la devise choisie (taux en temps réel)
  useEffect(() => {
    let off = false;
    fetch(`/api/fx?amount=${product.price_amount}&from=${product.price_currency}&to=${currency}`)
      .then((r) => r.json())
      .then((j) => !off && j.amount != null && setShown({ amount: j.amount, currency: j.currency }))
      .catch(() => {});
    return () => { off = true; };
  }, [currency, product.price_amount, product.price_currency]);

  // Montant réellement débité pour le moyen choisi (avant validation)
  useEffect(() => {
    let off = false;
    setQuote(null);
    fetch(`/api/fx?amount=${product.price_amount}&from=${product.price_currency}&to=${currency}&method=${methodId}`)
      .then((r) => r.json())
      .then((j) => !off && j.amount != null && setQuote({ amount: j.amount, currency: j.currency }))
      .catch(() => {});
    return () => { off = true; };
  }, [methodId, currency, product.price_amount, product.price_currency]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, methodId, currency, email, name }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Paiement impossible");
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={pay} className="glass space-y-5 p-5 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="label !mb-0">Total</p>
          <p className="font-display text-3xl font-extrabold text-white">
            {formatMoney(shown?.amount ?? product.price_amount, shown?.currency ?? product.price_currency)}
          </p>
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="input !w-auto !py-2"
          aria-label="Devise"
        >
          {Array.from(new Set([product.price_currency, ...DISPLAY_CURRENCIES])).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nom</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email (livraison)</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com" />
        </div>
      </div>

      <div className="space-y-4">
        {groups.map(([g, methods]) => (
          <fieldset key={g}>
            <legend className="label">{GROUP_LABELS[g]}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition ${
                    methodId === m.id
                      ? "border-volt bg-volt/15 text-white shadow-glow"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/30"
                  }`}
                >
                  <input type="radio" name="method" value={m.id} checked={methodId === m.id} onChange={() => setMethodId(m.id)} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {quote && (
        <p className="rounded-xl bg-jade/10 px-4 py-2.5 text-xs text-jade-soft">
          Montant débité avec ce moyen de paiement : <strong>{formatMoney(quote.amount, quote.currency)}</strong> (taux du jour)
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      <button className="btn-primary w-full !py-3.5 text-base" disabled={loading}>
        {loading ? "Redirection sécurisée…" : "Payer maintenant"}
      </button>
      <p className="text-center text-[11px] text-zinc-500">Paiement traité par Stripe, FedaPay ou NOWPayments. Aucune donnée bancaire n'est stockée ici.</p>
    </form>
  );
}
