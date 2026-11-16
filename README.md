# KDDF Market

Marketplace Next.js 14 + Tailwind + Supabase, paiement Mobile Money via Fapshi. Produits **digitaux** et **physiques**, affiliation, portefeuilles, PWA.

## Mise en route (dans cet ordre)

1. **Base de données** : Supabase → projet `kddf-market` → *SQL Editor* → coller tout `supabase/schema.sql` → *Run*. (Le script peut être relancé sans danger.)
2. **Vous administrateur** : après votre inscription sur le site, dans le SQL Editor :
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'VOTRE_EMAIL');`
3. **Supabase → Authentication → URL Configuration** : Site URL `https://kddf-market.vercel.app` ; Redirect URLs : `https://kddf-market.vercel.app/auth/callback`.
4. **Variables Vercel** (Settings → Environment Variables) : voir `.env.example`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FAPSHI_API_USER`, `FAPSHI_API_KEY`, `FAPSHI_ENV` = `sandbox` puis `live`, `FAPSHI_WEBHOOK_SECRET` (facultatif), `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`).
   La clé `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** être publique.
5. **Fapshi** : dans le dashboard, URL du webhook = `https://kddf-market.vercel.app/api/webhook/fapshi` (+ le même secret que `FAPSHI_WEBHOOK_SECRET` si vous en mettez un).
6. Déployer. Premier test : paiement réel Orange Money, puis regarder les logs Vercel (`[fapshi-webhook] body reçu`).

## Répartition automatique (en FCFA entiers, calculée dans la base)

| Cas | KDDF | Affilié | Vendeur |
|---|---|---|---|
| Avec affilié (X % choisi 10/20/30/40/50) | 5 % | X % | le reste |
| Sans affilié, produit digital | 10 % | 0 | 90 % |
| Sans affilié, produit physique | 8 % | 0 | 92 % |

Calcul sur le prix des articles (hors livraison, qui revient entièrement au vendeur). Arrondi vers le bas, le reste va au vendeur.
Exemple physique : 15 000 FCFA → KDDF 1 200 / vendeur 13 800.
Exemples sur 10 000 FCFA : avec affilié 30 % → 500 / 3 000 / 6 500 ; sans affilié → 1 000 / 0 / 9 000 ; avec affilié 50 % → 500 / 5 000 / 4 500.

Fonds : les ventes digitales sont libérées après 24 h ; les ventes physiques dès que l'acheteur clique « J'ai reçu mon produit » (argent bloqué en « Solde en attente » jusque-là), ou automatiquement 3 jours après « Livrée » sans litige. Les retraits sont seulement enregistrés : vous les validez à la main dans `/admin`.

## Vérifier

`npm install && npm run typecheck && npm run build`. Tests SQL : `supabase/tests/`.

## Nouveautés (partage, boost, boutique)

- **Base déjà créée ?** Relancez simplement tout `supabase/schema.sql` dans le SQL Editor (il est rejouable) : il ajoute les nouvelles colonnes, tables `product_boosts` et `product_shares`, les vues d'activité et les nouveaux droits.
- **Contact vendeur** : le numéro WhatsApp / appel / email n'est jamais envoyé avant paiement (colonnes `products.whatsapp_seller`, `booking_url`, `delivery_notes` et profil non lisibles par le public). Il apparaît après paiement d'un produit **physique** uniquement. Aucun numéro pour le digital.
- **Boost** : 3 jours = 1 000 FCFA (badge « À la une »), 7 jours = 2 500 FCFA (badge « Populaire »), payés via Fapshi (même webhook). Prix modifiables dans `src/lib/boost.ts`.
- **Alertes d'inactivité** : bandeau orange dans le dashboard + email (tâche planifiée quotidienne, 1 email max par produit tous les 7 jours).
- **Boutique** : `/boutique/<adresse>` ; personnalisation dans « Ma boutique » ; profil dans « Mon profil ».

## Version 3 : confiance, recherche, paiement à la livraison, admin

**Important : ré-exécutez `supabase/schema.sql` en entier dans le SQL Editor de Supabase** (il est idempotent). Tous vos produits existants restent visibles (ils sont marqués « approuvés » à la migration). Ensuite, donnez-vous le rôle admin si ce n'est pas déjà fait :
`update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'votre@email');`

- **Avis** : après « J'ai reçu mon produit », l'acheteur note de 1 à 5 étoiles + commentaire (page « Mes achats »). Moyenne et nombre d'avis sur chaque produit et chaque boutique.
- **Vendeur Vérifié** (coche bleue) : activé/désactivé par l'admin dans `/admin/sellers`.
- **« Vendeur peu fiable »** : moyenne < 2 étoiles avec au moins 3 avis (réglable dans `src/lib/trust.ts`).
- **Recherche & filtres** (accueil) : nom, catégorie, ville, prix min/max, type, tri (plus récent, prix croissant, prix décroissant, mieux notés), combinables. Aucun filtre actif = section « À la une » affichée.
- **Paiement** : Orange Money et MTN MoMo via Fapshi. **Fapshi ne gère que le Mobile Money (pas les cartes bancaires)** ; pour des cartes il faudrait ajouter une autre passerelle.
- **Paiement à la livraison** (produits physiques uniquement, refusé par la base pour le digital) : statut « En attente de livraison - Paiement cash ». Le vendeur clique « Cash encaissé » ; la commission de 8 % est enregistrée (`wallets.commission_due`) et déduite de son prochain retrait. Pas d'affiliation sur ces commandes ; le stock est réservé à la commande (le vendeur peut annuler).
- **Livraison** : « Je viens récupérer » (gratuit), « Livraison à domicile à Douala », « Envoi par bus / expédition ». Les deux prix se règlent dans Mon profil et s'appliquent à tous les produits physiques du vendeur. Total = prix + livraison.
- **Admin** (`/admin`, 404 pour les autres) : tableau de bord, `/admin/sellers` (voir, vérifier, bloquer), `/admin/orders` (commandes, litiges, remboursements), `/admin/withdrawals` (Approuver / Refuser, montant net après commission cash), `/admin/products` (modération : tout nouveau produit attend l'approbation).

## Dépannage : « Could not find the table 'public.products' » / « Bucket not found »

Ces deux messages signifient que `supabase/schema.sql` n'a pas été exécuté en entier dans VOTRE projet Supabase (le SQL Editor annule tout si une seule ligne échoue).
1. Supabase > SQL Editor > New query > collez TOUT `supabase/schema.sql` > Run. S'il affiche une erreur rouge, copiez-la : rien n'a été créé tant qu'elle n'est pas corrigée.
2. Collez ensuite `supabase/verifier-installation.sql` > Run : toutes les lignes doivent afficher « OK ».
3. Vérifiez que `NEXT_PUBLIC_SUPABASE_URL` sur Vercel est bien l'URL du projet où vous avez exécuté le script (puis Redeploy).
4. Si seul le bucket manque : Supabase > Storage > New bucket : « covers » (Public) et « deliverables » (Privé).

## Messages d'erreur « Cause + Solution »
Toutes les erreurs affichées à l'utilisateur disent la cause exacte puis une solution. Elles sont centralisées dans `src/lib/errors.ts` (ajoutez un cas dans `DB` ou `PATTERNS` pour en expliquer une nouvelle). Les boutons admin/vendeur qui échouent renvoient vers la page avec `?erreur=<code>` (bandeau `FlashError`), et `src/app/error.tsx` couvre les pages qui plantent.


## Paiement universel (cartes, Mobile Money élargi, crypto) et retraits

**Encaisser (acheteurs)** — l'acheteur choisit son moyen au paiement. Fapshi (MTN/Orange Cameroun) reste toujours actif ; les autres n'apparaissent que si leurs clés sont dans Vercel > Environment Variables (puis Redeploy) :

| Option | Variables | Webhook à configurer chez le fournisseur |
|---|---|---|
| Flutterwave (Visa, Mastercard, Amex, Wave, Moov, M-Pesa, Orange, MTN…) | `FLW_SECRET_KEY`, `FLW_SECRET_HASH` | `https://VOTRE-SITE/api/webhook/flutterwave` (Secret hash = `FLW_SECRET_HASH`) |
| Crypto via NOWPayments (USDT, BTC, ETH…) | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_ENV` | IPN secret dans le dashboard ; l'URL `/api/webhook/crypto` est envoyée à chaque facture |

Notes : les prix restent en FCFA. Pour la crypto, le montant est converti en EUR avec la parité fixe 1 EUR = 655,957 FCFA, puis NOWPayments le convertit en crypto. La crypto est confirmée uniquement par l'IPN signé (pas de rattrapage automatique). Apple Pay / Google Pay / PayPal à l'encaissement ne sont pas inclus (Stripe n'accepte pas les marchands camerounais).

**Retirer (vendeurs)** — MTN MoMo, Orange Money, Wave, Moov Money, M-Pesa, virement bancaire, PayPal, crypto USDT/BTC. L'administrateur paie manuellement depuis /admin/withdrawals puis marque « payé ». Relancez `supabase/schema.sql` dans le SQL Editor pour activer les nouveaux moyens.


## Aide & contact (support)
Un bouton « 💬 Aide » est visible sur tout le site : il mène à `/support` (message + jusqu'à 3 captures d'écran, même sans compte). La page d'erreur « Oups » propose aussi « Signaler ce problème » avec la référence de l'erreur. Les messages arrivent dans **/admin/support** (captures visibles, bouton « Marquer comme traité »). Variables facultatives : `SUPPORT_EMAIL` (alerte par email, nécessite Resend), `NEXT_PUBLIC_SUPPORT_WHATSAPP` (ex 237690000000) et `NEXT_PUBLIC_SUPPORT_EMAIL` (affichés sur /support). Côté base : section 23 de `supabase/schema.sql` (table `support_messages` + bucket privé `support`).
