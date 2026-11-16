/** Numéro au format wa.me : chiffres seulement, avec l'indicatif du Cameroun (237) si besoin. */
export function toWhatsappNumber(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("6")) d = `237${d}`;
  return d;
}

export function whatsappLink(raw: string, message: string): string {
  return `https://wa.me/${toWhatsappNumber(raw)}?text=${encodeURIComponent(message)}`;
}

export function isPlausiblePhone(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
}
