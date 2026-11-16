"use client";
import { useFormState } from "react-dom";
import { trackingAction, type TrackingState } from "@/components/trackingActions";

const INITIAL: TrackingState = { message: "" };

export default function TrackingButton({ orderId, op, label, tone }: { orderId: string; op: "ship" | "out" | "receive"; label: string; tone: "primary" | "jade" }) {
  const [state, action] = useFormState(trackingAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="op" value={op} />
      <button className={`${tone === "jade" ? "btn-jade" : "btn-primary"} !py-2`}>{label}</button>
      {state.message && <p role="status" className="whitespace-pre-line text-xs text-zinc-300">{state.message}</p>}
    </form>
  );
}
