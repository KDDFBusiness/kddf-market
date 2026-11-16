// Explication des erreurs : chaque message dit la CAUSE exacte puis propose une SOLUTION.
// Fonctionne pour les erreurs de la base (codes métier), de Supabase (auth, stockage, droits) et du réseau.

export interface Explained {
  cause: string;
  fix: string;
}

/** Erreurs métier levées par les fonctions SQL (le code est le texte de l'exception). */
const DB: Record<string, Explained> = {
  produit_introuvable: { cause: "Ce produit n'existe plus, est dépublié ou n'a pas encore été validé.", fix: "Revenez à l'accueil et choisissez un autre produit." },
  email_invalide: { cause: "L'adresse email saisie n'a pas un format valide.", fix: "Vérifiez l'orthographe (ex. nom@gmail.com) et réessayez." },
  connexion_requise: { cause: "Vous n'êtes pas connecté ou votre session a expiré.", fix: "Connectez-vous puis recommencez l'action." },
  quantite_invalide: { cause: "La quantité demandée n'est pas valide.", fix: "Indiquez un nombre entier supérieur ou égal à 1." },
  stock_insuffisant: { cause: "Il n'y a pas assez de stock pour cette quantité.", fix: "Diminuez la quantité ou contactez le vendeur." },
  livraison_invalide: { cause: "Ce mode de livraison n'est pas proposé pour ce produit.", fix: "Choisissez un autre mode de livraison dans la liste." },
  telephone_invalide: { cause: "Le numéro de téléphone n'a pas un format valide.", fix: "Saisissez un numéro camerounais, par exemple 6XXXXXXXX." },
  adresse_invalide: { cause: "L'adresse de livraison est trop courte.", fix: "Indiquez le quartier, la rue et un repère." },
  acces_refuse: { cause: "Votre compte n'a pas le droit d'effectuer cette action.", fix: "Connectez-vous avec le bon compte, ou contactez le support." },
  commande_invalide: { cause: "Cette action n'est pas possible dans l'état actuel de la commande.", fix: "Actualisez la page pour voir le statut à jour." },
  transition_invalide: { cause: "Ce changement de statut n'est pas autorisé à cette étape.", fix: "Actualisez la page et utilisez le bouton proposé pour l'étape suivante." },
  motif_invalide: { cause: "Le motif est trop court.", fix: "Décrivez le problème en au moins 5 caractères." },
  fonds_deja_liberes: { cause: "Les fonds de cette commande ont déjà été versés au vendeur.", fix: "Contactez le support pour un éventuel remboursement." },
  methode_invalide: { cause: "Le moyen de retrait choisi n'est pas valide.", fix: "Choisissez un moyen dans la liste proposée." },
  destination_invalide: { cause: "Le compte de réception saisi n'a pas un format valide pour ce moyen de retrait.", fix: "PayPal : votre email PayPal. Crypto : l'adresse complète de votre portefeuille. Virement : IBAN ou numéro de compte suivi du nom de la banque." },
  montant_minimum: { cause: "Le montant est inférieur au minimum de retrait (1 000 FCFA).", fix: "Saisissez au moins 1 000 FCFA." },
  solde_insuffisant: { cause: "Votre solde disponible est inférieur au montant demandé.", fix: "Demandez un montant plus petit. Les fonds « en attente » ne sont pas encore retirables." },
  retrait_deja_traite: { cause: "Ce retrait a déjà été traité.", fix: "Actualisez la page." },
  resultat_invalide: { cause: "Le résultat choisi n'est pas valide.", fix: "Actualisez la page et recommencez." },
  transaction_invalide: { cause: "Cette transaction ne peut pas être remboursée dans son état actuel.", fix: "Actualisez la page pour voir son statut." },
  cod_interdit_digital: { cause: "Le paiement à la livraison n'existe pas pour les produits digitaux.", fix: "Payez en ligne avec Orange Money ou MTN MoMo." },
  paiement_invalide: { cause: "Le moyen de paiement choisi n'est pas valide.", fix: "Choisissez Orange Money / MTN MoMo, ou le paiement à la livraison pour un produit physique." },
  vendeur_bloque: { cause: "Ce vendeur est suspendu par KDDF Market.", fix: "Choisissez un produit d'un autre vendeur." },
  compte_bloque: { cause: "Votre compte a été bloqué par l'administration.", fix: "Contactez le support de KDDF Market pour connaître la raison." },
  encaissement_requis: { cause: "Une commande payée à la livraison se termine en encaissant le cash.", fix: "Cliquez sur « Cash encaissé (livrée) »." },
  avis_non_autorise: { cause: "Vous ne pouvez noter qu'une commande dont vous avez confirmé la réception.", fix: "Cliquez d'abord sur « J'ai reçu mon produit », puis laissez votre avis." },
  avis_deja_envoye: { cause: "Vous avez déjà donné votre avis sur cette commande.", fix: "Un seul avis par commande est possible." },
  note_invalide: { cause: "La note n'est pas comprise entre 1 et 5.", fix: "Cliquez sur une étoile pour choisir votre note." },
  action_interdite: { cause: "Cette action est réservée à l'administrateur.", fix: "Connectez-vous avec le compte administrateur." },
  decision_invalide: { cause: "La décision envoyée n'est pas valide.", fix: "Actualisez la page et recommencez." },
};

/** Erreurs techniques (Supabase, stockage, réseau), reconnues par leur texte. */
const PATTERNS: { id: string; test: RegExp; e: Explained }[] = [
  { id: "schema", test: /schema cache|could not find the table|relation .* does not exist|could not find the function/i, e: { cause: "La base de données n'est pas (ou pas entièrement) installée dans votre projet Supabase.", fix: "Dans Supabase > SQL Editor, collez TOUT le fichier supabase/schema.sql et cliquez Run, puis réessayez." } },
  { id: "bucket", test: /bucket not found/i, e: { cause: "Le dossier de stockage des images n'existe pas dans Supabase.", fix: "Dans Supabase > Storage, créez un bucket « covers » (public) et un bucket « deliverables » (privé), ou relancez schema.sql." } },
  { id: "invalid_creds", test: /invalid login credentials/i, e: { cause: "L'email ou le mot de passe ne correspond à aucun compte de ce site.", fix: "Vérifiez l'orthographe de l'email, ou cliquez sur « Créer une boutique » si vous n'avez pas encore de compte." } },
  { id: "email_unconfirmed", test: /email not confirmed/i, e: { cause: "Votre adresse email n'a pas encore été confirmée.", fix: "Ouvrez le mail de confirmation (vérifiez les spams) et cliquez sur le lien, puis reconnectez-vous." } },
  { id: "already_registered", test: /already registered|user already exists/i, e: { cause: "Un compte existe déjà avec cet email.", fix: "Cliquez sur « J'ai déjà un compte » et connectez-vous." } },
  { id: "duplicate", test: /duplicate key|already exists|unique constraint/i, e: { cause: "Cette valeur est déjà utilisée (adresse de boutique, nom de produit ou autre élément unique).", fix: "Choisissez une valeur différente." } },
  { id: "weak_password", test: /password should be at least|weak password|password is too short/i, e: { cause: "Le mot de passe est trop court ou trop simple.", fix: "Utilisez au moins 8 caractères, avec des lettres et des chiffres." } },
  { id: "same_password", test: /different from the old password/i, e: { cause: "Le nouveau mot de passe est identique à l'ancien.", fix: "Choisissez un mot de passe différent." } },
  { id: "rate_limit", test: /rate limit|too many requests|over_email_send_rate_limit|security purposes/i, e: { cause: "Trop de tentatives en peu de temps.", fix: "Attendez une minute puis réessayez." } },
  { id: "api_key", test: /invalid api key|no api key|apikey/i, e: { cause: "La clé Supabase configurée sur le site est incorrecte ou absente.", fix: "Sur Vercel > Settings > Environment Variables, vérifiez NEXT_PUBLIC_SUPABASE_ANON_KEY (clé « anon public »), puis Redeploy." } },
  { id: "session", test: /jwt expired|invalid jwt|auth session missing|not authenticated|refresh token/i, e: { cause: "Votre session a expiré.", fix: "Reconnectez-vous puis recommencez." } },
  { id: "rls", test: /row-level security|violates row|permission denied|not allowed|insufficient privilege/i, e: { cause: "Votre compte n'a pas l'autorisation d'effectuer cette action (session expirée, compte bloqué ou donnée qui ne vous appartient pas).", fix: "Reconnectez-vous. Si l'erreur continue, contactez le support." } },
  { id: "too_large", test: /too large|maximum allowed size|exceeded|payload|file size/i, e: { cause: "Le fichier est trop lourd.", fix: "Les images doivent faire 5 Mo maximum : réduisez-la (capture d'écran, compression) puis réessayez." } },
  { id: "mime", test: /mime type|not supported|unsupported|invalid file/i, e: { cause: "Le format du fichier n'est pas accepté.", fix: "Utilisez une image JPG, PNG ou WebP." } },
  { id: "invalid_data", test: /check constraint|invalid input syntax|value too long|null value|not-null/i, e: { cause: "Une des valeurs saisies n'est pas acceptée (trop longue, vide ou mal formatée).", fix: "Vérifiez chaque champ : les prix sont des nombres entiers en FCFA, les textes ne sont pas trop longs." } },
  { id: "network", test: /failed to fetch|fetch failed|networkerror|network request|load failed|timeout|timed out|aborted|econn|enotfound/i, e: { cause: "Impossible de joindre le serveur : connexion internet instable, ou Supabase injoignable (projet en pause ou adresse incorrecte).", fix: "Vérifiez votre connexion et réessayez. Sinon : Vercel > NEXT_PUBLIC_SUPABASE_URL et état du projet Supabase." } },
];

const GENERIC: Explained = {
  cause: "Une erreur inattendue s'est produite sur le serveur.",
  fix: "Réessayez dans un instant. Si le problème continue, envoyez une capture de ce message au support.",
};

function render(e: Explained, detail?: string): string {
  const tail = detail ? ` (détail technique : ${detail.replace(/\s+/g, " ").slice(0, 160)})` : "";
  return `Cause : ${e.cause}${tail}\nSolution : ${e.fix}`;
}

/** Code court d'une erreur (clé métier ou identifiant de motif) ; "inconnue" sinon. */
export function errorCode(raw: string | undefined): string {
  if (!raw) return "inconnue";
  const key = Object.keys(DB).find((k) => raw.includes(k));
  if (key) return key;
  return PATTERNS.find((p) => p.test.test(raw))?.id ?? "inconnue";
}

/** Message complet pour un code connu (sans texte libre : sûr à afficher depuis une URL). */
export function explainCode(code: string): string {
  const e = DB[code] ?? PATTERNS.find((p) => p.id === code)?.e ?? GENERIC;
  return render(e);
}

/** Message complet « Cause + Solution » pour une erreur brute. */
export function explainError(raw: string | undefined): string {
  const code = errorCode(raw);
  if (code === "inconnue") return render(GENERIC, raw);
  return explainCode(code);
}

/** Erreur lors de l'ouverture du paiement Fapshi (Orange Money / MTN MoMo) : cause précise + solution. */
export function explainPaymentError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const status = typeof e === "object" && e !== null && "status" in e && typeof (e as { status: unknown }).status === "number" ? (e as { status: number }).status : 0;
  if (/FLW_SECRET_KEY|NOWPAYMENTS_API_KEY/i.test(raw)) {
    return render({ cause: "Ce moyen de paiement n'est pas configuré sur le site.", fix: "Choisissez un autre moyen de paiement (Mobile Money Cameroun). Le propriétaire doit ajouter les clés dans Vercel puis Redeploy." });
  }
  if (e instanceof Error && (e.name === "FlutterwaveError" || e.name === "NowPaymentsError")) {
    if (status === 401 || status === 403) return render({ cause: "Le service de paiement a refusé les clés du site.", fix: "Le propriétaire doit vérifier les clés (FLW_SECRET_KEY ou NOWPAYMENTS_API_KEY) sur Vercel, puis Redeploy. Choisissez un autre moyen en attendant." });
    if (status >= 500 || /fetch|network|timeout|econn|enotfound/i.test(raw)) return render({ cause: "Le service de paiement choisi ne répond pas pour le moment.", fix: "Aucun argent n'a été débité. Réessayez dans quelques minutes ou choisissez un autre moyen de paiement." });
    return render({ cause: "Le service de paiement a refusé la demande (montant, devise ou email non accepté).", fix: "Vérifiez votre email, réessayez, ou choisissez un autre moyen de paiement. Aucun argent n'a été débité." });
  }
  if (/FAPSHI_API_USER|FAPSHI_API_KEY|manquant/i.test(raw)) {
    return render({ cause: "Les clés Fapshi ne sont pas configurées sur le site.", fix: "Le propriétaire doit ajouter FAPSHI_API_USER et FAPSHI_API_KEY dans Vercel > Settings > Environment Variables, puis Redeploy. En attendant, achetez en cash si le produit est physique." });
  }
  if (/montant invalide/i.test(raw)) {
    return render({ cause: "Le montant est inférieur au minimum accepté par Fapshi (100 FCFA).", fix: "Choisissez un produit ou une quantité dont le total est d'au moins 100 FCFA." });
  }
  if (status === 401 || status === 403) {
    return render({ cause: "Fapshi a refusé les clés du site (clés fausses, ou mode test/réel qui ne correspond pas).", fix: "Le propriétaire doit vérifier FAPSHI_API_USER, FAPSHI_API_KEY et FAPSHI_ENV (sandbox ou live) sur Vercel, puis Redeploy." });
  }
  if (status === 400 || status === 422) {
    return render({ cause: "Fapshi a refusé la demande : email ou montant non accepté.", fix: "Vérifiez votre adresse email et réessayez avec un autre email si besoin." });
  }
  if (status >= 500 || /fetch|network|timeout|econn|enotfound/i.test(raw)) {
    return render({ cause: "Le service de paiement Fapshi ne répond pas pour le moment.", fix: "Aucun argent n'a été débité. Réessayez dans quelques minutes." });
  }
  return render({ cause: "Le paiement Mobile Money n'a pas pu être lancé.", fix: "Aucun argent n'a été débité. Réessayez ; si cela se répète, contactez le support avec une capture de ce message." });
}

/** Message « Cause + Solution » construit à la main pour les routes API. */
export function explain(cause: string, fix: string): string {
  return render({ cause, fix });
}
