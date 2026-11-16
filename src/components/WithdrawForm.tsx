"use client";
import { useState } from "react";
import { useFormState } from "react-dom";
import { requestWithdrawal, type WithdrawState } from "@/app/dashboard/wallet/actions";
import { WITHDRAWAL_CHOICES, WITHDRAWAL_METHOD_LABELS } from "@/lib/labels";
import type { WithdrawalMethod } from "@/lib/types";

const INITIAL: WithdrawState = { message: "", ok: false };

const FIELDS = {
  phone: { label: "Numéro", placeholder: "2376XXXXXXXX", type: "tel", help: "Numéro du compte Mobile Money qui recevra l'argent." },
  email: { label: "Email PayPal", placeholder: "vous@exemple.com", type: "email", help: "L'email de votre compte PayPal." },
  wallet: { label: "Adresse du portefeuille", placeholder: "Adresse complète (USDT : réseau TRC-20 recommandé)", type: "text", help: "Vérifiez bien l'adresse et le réseau : un transfert crypto est irréversible." },
  bank: { label: "IBAN / compte + banque", placeholder: "IBAN ou n° de compte, nom de la banque", type: "text", help: "Votre IBAN ou numéro de compte, suivi du nom de la banque." },
} as const;

export default function WithdrawForm({ available }: { available: number }) {
  const [state, action] = useFormState(requestWithdrawal, INITIAL);
  const [method, setMethod] = useState<WithdrawalMethod>("mtn_momo");
  const field = FIELDS[WITHDRAWAL_CHOICES.find((c) => c.value === method)?.field ?? "phone"];
  const groups = Array.from(new Set(WITHDRAWAL_CHOICES.map((c) => c.group)));
  return (
    <form action={action} className="glass space-y-4 p-5">
      <p className="label !mb-0">Demander un retrait</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wd-amount">Montant (FCFA)</label>
          <input id="wd-amount" name="amount" type="number" min={1000} max={available} step={1} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="wd-method">Moyen de réception</label>
          <select id="wd-method" name="method" className="input" value={method} onChange={(e) => setMethod(e.target.value as WithdrawalMethod)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {WITHDRAWAL_CHOICES.filter((c) => c.group === g).map((c) => (
                  <option key={c.value} value={c.value}>{WITHDRAWAL_METHOD_LABELS[c.value]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="wd-phone">{field.label}</label>
          <input id="wd-phone" name="phone" type={field.type} placeholder={field.placeholder} required className="input" key={method} />
          <p className="mt-1 text-xs text-zinc-500">{field.help}</p>
        </div>
      </div>
      {state.message && <p role="status" className={`whitespace-pre-line rounded-xl px-4 py-2.5 text-sm ${state.ok ? "bg-jade/10 text-jade-soft" : "bg-red-500/10 text-red-300"}`}>{state.message}</p>}
      <button className="btn-primary" disabled={available < 1000}>Demander le retrait</button>
      <p className="text-xs text-zinc-500">Minimum 1 000 FCFA. Le montant est bloqué dès la demande ; le paiement est envoyé manuellement par l&apos;administrateur (les frais éventuels du réseau, de la banque ou de la crypto peuvent s&apos;appliquer).</p>
    </form>
  );
}
