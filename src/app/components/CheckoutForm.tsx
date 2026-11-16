"use client";
import { explainError } from "@/lib/errors";
import { useMemo, useState } from "react";
import { formatFcfa } from "@/lib/money";
import { DELIVERY_LABELS } from "@/lib/labels";
import { PROVIDER_LABELS, type PaymentProvider } from "@/lib/payments";
import type { DeliveryMethod, DeliveryOptions, PaymentMethod, ProductType } from "@/lib/types";

interface Props {
  productId: string;
  productType: ProductType;
  price: number;
  stock: number | null;
  deliveryOptions: DeliveryOptions | null;
  defaultEmail: string;
  loggedIn: boolean;
  providers: PaymentProvider[];
}

const ORDER: DeliveryMethod[] = ["pickup_douala", "delivery_douala", "shipping_cameroon"];

export default function CheckoutForm({ productId, productType, price, stock, deliveryOptions, defaultEmail, loggedIn, providers }: Props) {
  const physical = productType === "physical";
  const soldOut = physical && (stock ?? 0) <= 0;
  const available = ORDER.filter((m) => deliveryOptions?.[m]?.enabled === true);

  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<DeliveryMethod | "">("");
  const [payment, setPayment] = useState<PaymentMethod>("online");
  const [provider, setProvider] = useState<PaymentProvider>(providers[0] ?? "fapshi");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const deliveryPrice = useMemo(() => (method ? deliveryOptions?.[method]?.price ?? 0 : 0), [method, deliveryOptions]);
  const total = price * quantity + deliveryPrice; // total = prix x quantité + livraison (la base le recalcule à l'identique)
  const maxQty = physical ? Math.max(1, Math.min(stock ?? 1, 10)) : 1;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    if (physical && !method) {
      setError("Choisissez un mode de livraison.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          email,
          name,
          quantity,
          deliveryMethod: physical ? method : null,
          address: physical && method !== "pickup_douala" ? address : "",
          phone: physical ? phone : "",
          provider,
          paymentMethod: physical ? payment : "online", // le cash à la livraison n'existe que pour les produits physiques
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      const body = json !== null && typeof json === "object" ? (json as { url?: unknown; error?: unknown }) : {};
      if (res.ok && typeof body.url === "string") {
        window.location.href = body.url; // page de paiement Fapshi (Orange Money / MTN MoMo) ou suivi de commande (cash)
        return;
      }
      setError(typeof body.error === "string" ? body.error : explainError(undefined));
    } catch {
      setError(explainError("failed to fetch"));
    }
    setLoading(false);
  }

  if (soldOut) {
    return <button className="btn-primary w-full" disabled>Rupture de stock</button>;
  }

  // Un produit physique exige un compte : la commande doit être suivie dans « Mes achats ».
  if (physical && !loggedIn) {
    return (
      <div className="space-y-2">
        <a href={`/login?next=${encodeURIComponent(`/p/${productId}`)}`} className="btn-primary w-full">Se connecter pour commander</a>
        <p className="text-center text-xs text-zinc-500">Nécessaire pour suivre votre commande (confirmée, expédiée, livrée).</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="co-email">Email (reçu et suivi de commande)</label>
        <input id="co-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="co-name">Nom</label>
        <input id="co-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {physical && (
        <>
          <div>
            <label className="label" htmlFor="co-qty">Quantité</label>
            <input id="co-qty" type="number" min={1} max={maxQty} className="input" value={quantity}
              onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Math.trunc(Number(e.target.value) || 1))))} />
          </div>

          <fieldset className="space-y-2">
            <legend className="label">Mode de livraison</legend>
            {available.map((m) => {
              const p = deliveryOptions?.[m]?.price ?? 0;
              return (
                <label key={m} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${method === m ? "border-volt bg-volt/10" : "border-white/10 hover:border-white/30"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="delivery" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-indigo-500" />
                    <span className="text-white">{DELIVERY_LABELS[m]}</span>
                  </span>
                  <span className={p === 0 ? "font-semibold text-jade-soft" : "text-zinc-300"}>{p === 0 ? "Gratuit" : formatFcfa(p)}</span>
                </label>
              );
            })}
          </fieldset>

          {method !== "" && (
            <>
              <div>
                <label className="label" htmlFor="co-phone">Téléphone (pour la livraison / le retrait)</label>
                <input id="co-phone" type="tel" required className="input" placeholder="6XX XX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {method !== "pickup_douala" && (
                <div>
                  <label className="label" htmlFor="co-addr">Adresse de livraison</label>
                  <textarea id="co-addr" required rows={3} className="input" placeholder="Quartier, rue, repère, ville" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {physical && (
        <fieldset className="space-y-2">
          <legend className="label">Moyen de paiement</legend>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${payment === "online" ? "border-volt bg-volt/10" : "border-white/10 hover:border-white/30"}`}>
            <input type="radio" name="payment" checked={payment === "online"} onChange={() => setPayment("online")} className="mt-1 accent-indigo-500" />
            <span><span className="block text-white">Payer en ligne maintenant</span><span className="text-xs text-zinc-400">Mobile Money, carte ou crypto selon les options disponibles</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${payment === "cod" ? "border-volt bg-volt/10" : "border-white/10 hover:border-white/30"}`}>
            <input type="radio" name="payment" checked={payment === "cod"} onChange={() => setPayment("cod")} className="mt-1 accent-indigo-500" />
            <span><span className="block text-white">Paiement à la livraison</span><span className="text-xs text-zinc-400">Vous ne payez rien en ligne : vous réglez en cash quand vous recevez le produit.</span></span>
          </label>
        </fieldset>
      )}

      {(!physical || payment === "online") && providers.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="label">Payer avec</legend>
          {providers.map((p) => (
            <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${provider === p ? "border-volt bg-volt/10" : "border-white/10 hover:border-white/30"}`}>
              <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} className="mt-1 accent-indigo-500" />
              <span><span className="block text-white">{PROVIDER_LABELS[p].title}</span><span className="text-xs text-zinc-400">{PROVIDER_LABELS[p].detail}</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="rounded-xl bg-white/5 p-4 text-sm">
        <div className="flex justify-between text-zinc-400"><span>Produit{quantity > 1 ? ` × ${quantity}` : ""}</span><span>{formatFcfa(price * quantity)}</span></div>
        {physical && <div className="mt-1 flex justify-between text-zinc-400"><span>Livraison</span><span>{method ? (deliveryPrice === 0 ? "Gratuit" : formatFcfa(deliveryPrice)) : "—"}</span></div>}
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-display text-lg font-bold text-white"><span>Total</span><span>{formatFcfa(total)}</span></div>
      </div>

      {error && <p role="alert" className="whitespace-pre-line rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      <button className="btn-primary w-full" disabled={loading}>{loading ? "Patientez…" : physical && payment === "cod" ? "Commander (payer à la livraison)" : `Payer ${formatFcfa(total)}`}</button>
      <p className="text-center text-xs text-zinc-500">{physical && payment === "cod" ? "Vous payez le vendeur en cash à la réception." : provider === "crypto" ? "Paiement crypto sécurisé : le montant est converti en euros (1 EUR = 655,957 FCFA) puis en crypto au taux du jour." : "Paiement 100 % sécurisé."}</p>
    </form>
  );
}
