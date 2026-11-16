const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isEmail(v: string): boolean {
  return v.length <= 254 && EMAIL_RE.test(v);
}

/** Texte nettoyé et tronqué ("" si ce n'est pas un texte). */
export function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Lit un champ texte d'un formulaire. */
export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** Code d'affiliation : 8 caractères (lettres/chiffres), ex 3FA9C21B. */
export function isReferralCode(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{8}$/.test(v);
}
