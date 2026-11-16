"use client";
import { useState } from "react";
import { useFormState } from "react-dom";
import { submitReview, type ActionState } from "@/app/library/actions";

const INITIAL: ActionState = { message: "" };

export default function ReviewForm({ orderId }: { orderId: string }) {
  const [state, action] = useFormState(submitReview, INITIAL);
  const [rating, setRating] = useState(0);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 p-4">
      <p className="label !mb-0">Donnez votre avis sur le vendeur et le produit</p>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`text-3xl leading-none transition ${n <= rating ? "text-amber-400" : "text-zinc-600 hover:text-amber-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea name="comment" rows={3} maxLength={1000} className="input" placeholder="Votre commentaire (facultatif)" />
      <button className="btn-primary !py-2" disabled={rating === 0}>Envoyer mon avis</button>
      {state.message && <p role="status" className="whitespace-pre-line text-xs text-zinc-300">{state.message}</p>}
    </form>
  );
}
