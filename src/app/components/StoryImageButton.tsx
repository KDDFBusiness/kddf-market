"use client";
import { useState } from "react";
import { formatFcfa } from "@/lib/money";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // nécessaire pour exporter le canvas (les images Supabase l'autorisent)
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    return cut;
  }
  return lines;
}

// Fabrique une image 1080x1920 (format story WhatsApp / TikTok / Facebook) dans le navigateur et la télécharge.
export default function StoryImageButton({ title, price, imageUrl, siteName, url: rawUrl }: { title: string; price: number; imageUrl: string | null; siteName: string; url: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function make(): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Adresse réelle du site (si la variable du serveur manque, on prend celle du navigateur)
      let url = rawUrl;
      try {
        const u = new URL(rawUrl);
        if (u.hostname === "localhost" && window.location.hostname !== "localhost") url = `${window.location.origin}${u.pathname}${u.search}`;
      } catch {
        /* on garde rawUrl */
      }
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");

      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#0B0B10");
      grad.addColorStop(0.55, "#1E1B4B");
      grad.addColorStop(1, "#064E3B");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 56px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(siteName, W / 2, 150);

      // Photo du produit (carré arrondi, recadré au centre)
      const size = 900;
      const x = (W - size) / 2;
      const y = 250;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 48);
      ctx.clip();
      const img = imageUrl ? await loadImage(imageUrl) : null;
      if (img) {
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, size, size);
      } else {
        ctx.fillStyle = "#4F46E5";
        ctx.fillRect(x, y, size, size);
      }
      ctx.restore();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 70px Arial, sans-serif";
      const lines = wrapLines(ctx, title, W - 160, 3);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y + size + 120 + i * 84));

      ctx.fillStyle = "#34D399";
      ctx.font = "bold 96px Arial, sans-serif";
      ctx.fillText(formatFcfa(price), W / 2, y + size + 160 + lines.length * 84 + 60);

      ctx.fillStyle = "#C7D2FE";
      ctx.font = "44px Arial, sans-serif";
      ctx.fillText("Disponible sur KDDF Market", W / 2, H - 170);

      // Lien du produit écrit sur l'image (réduit jusqu'à tenir dans la largeur)
      const shown = url.replace(/^https?:\/\//, "");
      let linkSize = 40;
      ctx.font = `bold ${linkSize}px Arial, sans-serif`;
      while (ctx.measureText(shown).width > W - 100 && linkSize > 18) {
        linkSize -= 2;
        ctx.font = `bold ${linkSize}px Arial, sans-serif`;
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(shown, W / 2, H - 100);

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Export impossible");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "produit"}-story.png`;
      a.click();
      URL.revokeObjectURL(href);
      // Les stories n'affichent pas de lien cliquable dans l'image : on copie le lien pour l'ajouter avec l'autocollant « Lien ».
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Image téléchargée ✓ Lien copié : dans ta story, ajoute l'autocollant « Lien » et colle-le.");
      } catch {
        setNotice("Image téléchargée ✓ Copie aussi le lien ci-dessus pour l'ajouter à ta publication.");
      }
    } catch {
      setError("Impossible de créer l'image. Réessayez.");
    }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={make} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs">
        {busy ? "Création…" : "Télécharger l'image du produit"}
      </button>
      {error && <p role="alert" className="whitespace-pre-line mt-1 text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-1 text-xs text-jade-soft">{notice}</p>}
    </div>
  );
}
