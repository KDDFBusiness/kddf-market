import { Resend } from "resend";
import { appName } from "@/lib/env";
import { formatFcfa } from "@/lib/money";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Sans RESEND_API_KEY, aucun email n'est envoyé (pratique en développement).
async function send(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM ?? `${appName()} <no-reply@example.com>`,
    to,
    subject,
    html,
  });
  if (error) console.error("[email] échec d'envoi :", error.message);
}

function shell(title: string, inner: string): string {
  return `
  <div style="background:#0B0B10;padding:32px;font-family:Arial,sans-serif;color:#E5E7EB">
    <div style="max-width:520px;margin:auto;background:#111118;border:1px solid #22222F;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:22px;color:#fff">${title}</h1>
      ${inner}
      <p style="font-size:12px;color:#9CA3AF;margin-top:24px">${escapeHtml(appName())}</p>
    </div>
  </div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#6366F1;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

/** Email de confirmation envoyé à l'acheteur dès que le paiement est validé. */
export async function sendPurchaseEmail(a: {
  to: string;
  name: string | null;
  productTitle: string;
  portalUrl: string;
  licenseKey: string | null;
  isPhysical: boolean;
  totalFcfa: number;
}): Promise<void> {
  const license = a.licenseKey
    ? `<p style="margin:16px 0;padding:12px 16px;background:#181822;border-radius:10px;font-family:monospace;color:#34D399">Clé de licence : ${escapeHtml(a.licenseKey)}</p>`
    : "";
  const intro = a.isPhysical
    ? "Le vendeur prépare votre commande. Suivez son avancement (confirmée, expédiée, livrée) depuis le lien ci-dessous."
    : "Votre achat est prêt : vous pouvez le télécharger dès maintenant.";
  const html = shell(
    "Merci pour votre achat 🎉",
    `<p>Bonjour ${escapeHtml(a.name ?? "")},</p>
     <p>Votre paiement de <strong>${escapeHtml(formatFcfa(a.totalFcfa))}</strong> pour <strong>${escapeHtml(a.productTitle)}</strong> est confirmé.</p>
     <p>${intro}</p>
     ${license}
     ${button(a.portalUrl, a.isPhysical ? "Suivre ma commande" : "Accéder à mon téléchargement")}`
  );
  await send(a.to, `Votre achat : ${a.productTitle}`, html);
}

/** Email envoyé au vendeur quand une commande de produit physique est payée. */
export async function sendSellerNewOrderEmail(a: {
  to: string;
  productTitle: string;
  quantity: number;
  deliveryLabel: string;
  buyerName: string | null;
  buyerPhone: string | null;
  address: string | null;
  dashboardUrl: string;
  cash?: boolean;
}): Promise<void> {
  const html = shell(
    "Nouvelle commande à préparer 📦",
    `<p><strong>${escapeHtml(a.productTitle)}</strong> × ${a.quantity}</p>
     <p>Livraison : ${escapeHtml(a.deliveryLabel)}</p>
     <p>Client : ${escapeHtml(a.buyerName ?? "—")} · ${escapeHtml(a.buyerPhone ?? "—")}</p>
     ${a.address ? `<p>Adresse : ${escapeHtml(a.address)}</p>` : ""}
     ${a.cash ? "<p><strong>Paiement en CASH à la livraison</strong> : le client paie quand il reçoit le produit. La commission de 8 % sera prélevée sur votre prochain retrait.</p>" : ""}
     ${button(a.dashboardUrl, "Voir la commande")}`
  );
  await send(a.to, `Nouvelle commande : ${a.productTitle}`, html);
}


/** Email de relance : un produit n'a ni vente, ni partage, ni visiteurs depuis 3 jours. */
export async function sendInactiveProductEmail(a: { to: string; productTitle: string; productUrl: string }): Promise<void> {
  const html = shell(
    "Ton produit dort 😴",
    `<p>Ton produit <strong>${escapeHtml(a.productTitle)}</strong> dort sur ${escapeHtml(appName())}.</p>
     <p>Partage ton lien sur WhatsApp / TikTok pour avoir tes premières ventes.</p>
     <p style="word-break:break-all">${escapeHtml(a.productUrl)}</p>
     ${button(a.productUrl, "Ouvrir mon produit")}`
  );
  await send(a.to, `Ton produit « ${a.productTitle} » dort sur ${appName()}`, html);
}
