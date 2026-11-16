import { useEffect, useState } from "react";

/** Remplace une adresse "localhost" par l'adresse réelle du site ouvert dans le navigateur. */
export function realUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" && window.location.hostname !== "localhost") return `${window.location.origin}${u.pathname}${u.search}`;
  } catch {
    /* adresse illisible : on garde celle reçue */
  }
  return url;
}

/** Version « hook » : affiche d'abord l'adresse reçue puis l'adresse réelle du navigateur. */
export function useRealUrl(url: string): string {
  const [value, setValue] = useState(url);
  useEffect(() => setValue(realUrl(url)), [url]);
  return value;
}
