import { Resend } from "resend";

const appName = () => process.env.NEXT_PUBLIC_APP_NAME || "KDDF Market";

export async function sendPurchaseEmail(args: {
  to: string;
  name?: string | null;
  productTitle: string;
  downloadUrl: string;
  licenseKey?: string | null;
}) {
  if (!process.env.RESEND_API_KEY) return; // email désactivé en dev
  const resend = new Resend(process.env.RESEND_API_KEY);

  const licenseBlock = args.licenseKey
    ? `<p style="margin:16px 0;padding:12px 16px;background:#181822;border-radius:10px;font-family:monospace;color:#34D399">Clé de licence : ${args.licenseKey}</p>`
    : "";

  await resend.emails.send({
    from: process.env.EMAIL_FROM || `${appName()} <no-reply@example.com>`,
    to: args.to,
    subject: `Votre achat : ${args.productTitle}`,
    html: `
      <div style="background:#0B0B10;padding:32px;font-family:Arial,sans-serif;color:#E5E7EB">
        <div style="max-width:520px;margin:auto;background:#111118;border:1px solid #22222F;border-radius:16px;padding:28px">
          <h1 style="margin:0 0 12px;font-size:22px;color:#fff">Merci pour votre achat 🎉</h1>
          <p>Bonjour ${args.name ?? ""},</p>
          <p>Votre paiement pour <strong>${args.productTitle}</strong> est confirmé.</p>
          ${licenseBlock}
          <p style="margin:24px 0">
            <a href="${args.downloadUrl}" style="background:#6366F1;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">
              Accéder à mon téléchargement
            </a>
          </p>
          <p style="font-size:12px;color:#9CA3AF">Conservez cet email : le lien reste valable pour retrouver vos fichiers.</p>
        </div>
      </div>`,
  });
}
