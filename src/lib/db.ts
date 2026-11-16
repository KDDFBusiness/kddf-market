// Les requêtes Supabase renvoient des données non typées : ces deux fonctions les convertissent
// proprement vers nos types, sans utiliser "any".

export function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function asRow<T>(data: unknown): T | null {
  return data !== null && typeof data === "object" && !Array.isArray(data) ? (data as T) : null;
}
