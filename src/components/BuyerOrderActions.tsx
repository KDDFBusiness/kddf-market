"use client";
import { useFormState } from "react-dom";
import { confirmDelivery, openDispute, type ActionState } from "@/app/library/actions";

const INITIAL: ActionState = { message: "" };

export default function BuyerOrderActions({ orderId, canConfirm, disputed }: { orderId: string; canConfirm: boolean; disputed: boolean }) {
  const [confirmState, confirmAction] = useFormState(confirmDelivery, INITIAL);
  const [disputeState, disputeAction] = useFormState(openDispute, INITIAL);
  if (disputed) return <p className="text-xs text-amber-300">Litige en cours : les fonds restent bloqués jusqu&apos;à décision.</p>;
  return (
    <div className="space-y-3">
      {canConfirm && (
        <form action={confirmAction}>
          <input type="hidden" name="orderId" value={orderId} />
          <button className="btn-jade !py-2">J&apos;ai bien reçu ma commande</button>
          {confirmState.message && <p role="status" className="mt-2 whitespace-pre-line text-xs text-zinc-300">{confirmState.message}</p>}
        </form>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-white">Un problème avec cette commande ?</summary>
        <form action={disputeAction} className="mt-2 space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="input" placeholder="Décrivez le problème" />
          <button className="btn-ghost !py-2">Signaler le problème</button>
          {disputeState.message && <p role="status" className="whitespace-pre-line text-xs text-zinc-300">{disputeState.message}</p>}
        </form>
      </details>
    </div>
  );
}
