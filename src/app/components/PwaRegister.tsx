"use client";
import { useEffect } from "react";

// Enregistre le service worker (/sw.js) : rend le site installable et affiche une page hors-ligne.
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // pas de cache pendant le développement
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e: unknown) => {
      console.warn("[pwa] service worker non enregistré", e);
    });
  }, []);
  return null;
}
