import { Resend } from "resend";
import { appName, appUrl } from "@/lib/env";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const SUPPORT_CATEGORIES: Record<string, string> = {
  paiement: "Paiement",
  commande: "Commande / livraison",
  compte: "Compte / connexion",
  bug: "Bug / erreur sur le site",
  autre: "Autre",
};

/** Prévient le propriétaire d'un nouveau message de support. Sans SUPPORT_EMAIL ou sans clé Resend : rien n'est envoyé (jamais bloquant). */
export async function notifySupport(m: { name: string; email: string; category: string; message: string; pageUrl: string | null; imageCount: number }): Promise<void> {
  const to = process.env.SUPPORT_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) return;
  try {
    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM ?? `${appName()} <no-reply@example.com>`,
      to,
      replyTo: m.email,
      subject: `[Support] ${SUPPORT_CATEGORIES[m.category] ?? "Autre"} · ${m.name}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px">
        <p><strong>${esc(m.name)}</strong> (${esc(m.email)}) · ${esc(SUPPORT_CATEGORIES[m.category] ?? "Autre")}</p>
        <p style="white-space:pre-wrap">${esc(m.message)}</p>
        ${m.pageUrl ? `<p>Page concernée : ${esc(m.pageUrl)}</p>` : ""}
        <p>${m.imageCount} capture(s) jointe(s). <a href="${esc(appUrl())}/admin/support">Ouvrir dans l'admin</a></p>
      </div>`,
    });
    if (error) console.error("[support] email non envoyé :", error.message);
  } catch (e) {
    console.error("[support] email non envoyé :", e instanceof Error ? e.message : e);
  }
}
