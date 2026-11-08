"use client";
import { useState } from "react";

export default function JoinAffiliate({ creatorId }: { creatorId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function join() {
    setBusy(true);
    const res = await fetch("/api/affiliate/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId }),
    });
    const j = await res.json();
    if (res.ok) window.location.reload();
    else setMsg(j.error || "Erreur");
    setBusy(false);
  }
  return (
    <div>
      <button onClick={join} disabled={busy} className="btn-primary !px-4 !py-2">{busy ? "…" : "Devenir affilié"}</button>
      {msg && <p className="mt-1 text-xs text-red-300">{msg}</p>}
    </div>
  );
}
