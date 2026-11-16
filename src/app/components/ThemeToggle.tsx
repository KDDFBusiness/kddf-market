"use client";
import { useEffect, useState } from "react";

type Choice = "dark" | "light" | "system";
const KEY = "kddf-theme";

function resolve(c: Choice): "dark" | "light" {
  if (c === "system") return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return c;
}

function read(): Choice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "dark" || v === "light" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

// Choix du thème d'affichage par le visiteur (sombre / clair / automatique), mémorisé dans son navigateur.
// À la toute première visite, une petite carte propose le choix.
export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("dark");
  const [open, setOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    const saved = read();
    if (saved === null) setFirstVisit(true);
    else setChoice(saved);
  }, []);

  // En mode automatique, suit le réglage de l'appareil en direct
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = (): void => document.documentElement.setAttribute("data-theme", resolve("system"));
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  function pick(c: Choice): void {
    setChoice(c);
    setOpen(false);
    setFirstVisit(false);
    document.documentElement.setAttribute("data-theme", resolve(c));
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      /* navigateur qui bloque le stockage : le choix vaut pour cette page seulement */
    }
  }

  const options: { id: Choice; label: string; icon: string }[] = [
    { id: "dark", label: "Sombre", icon: "🌙" },
    { id: "light", label: "Clair", icon: "☀️" },
    { id: "system", label: "Automatique", icon: "💻" },
  ];

  return (
    <>
      {firstVisit && (
        <div role="dialog" aria-label="Choisir le thème d'affichage" className="theme-pop fixed inset-x-4 bottom-20 z-50 mx-auto max-w-sm rounded-2xl border p-4 shadow-2xl sm:left-4 sm:right-auto sm:mx-0">
          <p className="mb-3 text-sm font-semibold">Comment préférez-vous voir le site ?</p>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => pick(o.id)} className="theme-opt rounded-xl border px-2 py-2 text-xs font-medium">
                <span className="block text-lg">{o.icon}</span>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => pick("dark")} className="mt-3 text-xs underline opacity-70">Plus tard</button>
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-50">
        {open && (
          <ul className="theme-pop mb-2 w-44 space-y-1 rounded-2xl border p-2 text-sm shadow-2xl" role="menu">
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" role="menuitemradio" aria-checked={choice === o.id} onClick={() => pick(o.id)} className={`theme-opt flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${choice === o.id ? "font-semibold" : ""}`}>
                  <span>{o.icon}</span> {o.label} {choice === o.id && <span className="ml-auto">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Changer le thème d'affichage" aria-expanded={open} className="theme-pop flex h-11 w-11 items-center justify-center rounded-full border text-xl shadow-xl transition hover:scale-105">
          {choice === "light" ? "☀️" : choice === "system" ? "💻" : "🌙"}
        </button>
      </div>
    </>
  );
}
