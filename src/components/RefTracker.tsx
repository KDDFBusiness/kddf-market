"use client";
import { useEffect } from "react";

// Compte un clic sur un lien d'affiliation (?ref=CODE). Le cookie de 30 jours est posé par le middleware.
export default function RefTracker({ productId, code }: { productId: string; code: string }) {
  useEffect(() => {
    const key = `ref-click-${productId}-${code}`;
    try {
      if (sessionStorage.getItem(key)) return; // un seul clic compté par visite
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage indisponible : on compte quand même */
    }
    fetch("/api/affiliate/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, code }),
    }).catch(() => undefined);
  }, [productId, code]);
  return null;
}
