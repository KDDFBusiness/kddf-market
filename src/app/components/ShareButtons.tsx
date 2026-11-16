"use client";
import { useEffect, useState } from "react";
import { shareLinks, shareText, type ShareChannel } from "@/lib/share";

interface Props {
  productId: string;
  title: string;
  price: number;
  url: string;
}

const BTN = "btn-ghost !px-3 !py-2 text-xs";

// Boutons de partage : WhatsApp, Facebook, Telegram, X, Copier ; Instagram et TikTok (copie le lien + ouvre l'appli).
export default function ShareButtons({ productId, title, price, url: rawUrl }: Props) {
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState(rawUrl);
  // Si l'adresse du site n'est pas réglée sur le serveur (lien "localhost"), on prend l'adresse réelle du navigateur.
  useEffect(() => {
    try {
      const u = new URL(rawUrl);
      if (u.hostname === "localhost" && window.location.hostname !== "localhost") setUrl(`${window.location.origin}${u.pathname}${u.search}`);
    } catch {
      /* adresse illisible : on garde celle reçue */
    }
  }, [rawUrl]);
  const links = shareLinks(title, price, url);

  function track(channel: ShareChannel): void {
    fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, channel }),
    }).catch(() => undefined);
  }

  function say(msg: string): void {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3500);
  }

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      window.prompt("Copiez ce texte :", text);
      return false;
    }
  }

  async function copyLink(): Promise<void> {
    track("copy");
    if (await copy(url)) say("Lien copié ✓");
  }

  // Instagram / TikTok n'ont pas de bouton de partage web : on copie le texte puis on ouvre l'appli (sinon le site).
  async function openApp(channel: "instagram" | "tiktok"): Promise<void> {
    track(channel);
    await copy(shareText(title, price, url));
    say(`Lien copié ✓ Colle-le dans ${channel === "instagram" ? "Instagram" : "TikTok"}.`);
    const scheme = channel === "instagram" ? "instagram://app" : "snssdk1233://";
    const web = channel === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/";
    window.location.href = scheme;
    setTimeout(() => {
      if (!document.hidden) window.open(web, "_blank", "noopener,noreferrer");
    }, 1500);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a className={BTN} href={links.whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => track("whatsapp")}>WhatsApp</a>
        <a className={BTN} href={links.facebook} target="_blank" rel="noopener noreferrer" onClick={() => track("facebook")}>Facebook</a>
        <a className={BTN} href={links.telegram} target="_blank" rel="noopener noreferrer" onClick={() => track("telegram")}>Telegram</a>
        <a className={BTN} href={links.x} target="_blank" rel="noopener noreferrer" onClick={() => track("x")}>X (Twitter)</a>
        <button type="button" className={BTN} onClick={() => openApp("instagram")}>Instagram</button>
        <button type="button" className={BTN} onClick={() => openApp("tiktok")}>TikTok</button>
        <button type="button" className={BTN} onClick={copyLink}>Copier le lien</button>
      </div>
      {notice && <p role="status" className="text-xs text-jade-soft">{notice}</p>}
    </div>
  );
}
