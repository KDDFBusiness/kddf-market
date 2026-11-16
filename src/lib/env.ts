/** Adresse du site, sans "/" final (ex : https://kddf-market.vercel.app). */
export function appUrl(): string {
  // 1) NEXT_PUBLIC_APP_URL (à régler sur Vercel) ; 2) adresse fournie automatiquement par Vercel ; 3) local.
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const raw = process.env.NEXT_PUBLIC_APP_URL || (fromVercel ? `https://${fromVercel}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export function appName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME ?? "KDDF Market";
}
