"use client";
import { useState } from "react";
import { realUrl } from "@/lib/realUrl";

export default function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(realUrl(text));
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt("Copiez ce lien :", realUrl(text));
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost !px-3 !py-2">
      {done ? "Copié ✓" : label}
    </button>
  );
}
