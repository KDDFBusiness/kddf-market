"use client";
import { useEffect, useState } from "react";

// Événement non standard (Chrome / Android) : il n'existe pas dans les types TypeScript de base.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "kddf-install-dismissed";

// Petit bandeau "Installer l'application" (Android/Chrome). Sur iPhone : Partager > Sur l'écran d'accueil.
export default function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* stockage indisponible : on affiche quand même */
    }
    const onPrompt = (e: Event): void => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!event) return null;

  function dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignoré */
    }
    setEvent(null);
  }

  async function install(): Promise<void> {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/95 p-3 shadow-glow backdrop-blur-xl animate-rise">
      <p className="flex-1 text-sm text-zinc-200">Installez KDDF Market sur votre écran d&apos;accueil.</p>
      <button onClick={install} className="btn-primary !px-3 !py-2">Installer</button>
      <button onClick={dismiss} className="text-xs text-zinc-400 hover:text-white" aria-label="Fermer">Plus tard</button>
    </div>
  );
}
