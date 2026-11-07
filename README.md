# KDDF Market — Plateforme SaaS de vente de produits digitaux

Next.js 14 (App Router) · Tailwind CSS · Supabase (BDD, Auth, Storage) · Stripe + FedaPay + NOWPayments.

Design original : minimalisme sombre « glassmorphism », violet électrique `#6366F1` + vert émeraude `#10B981`, polices Sora / DM Sans.

## Fonctionnalités

- **Espace créateur** : analytics temps réel (rafraîchissement 15 s), revenu net par devise, visites, conversion, catalogue.
- **Produits** : fichiers PDF/ePub, formations vidéo, clés de licence, offres groupées, coaching, services.
- **Après paiement** : redirection vers un portail de téléchargement sécurisé (URL signée 60 s) + email de confirmation (Resend).
- **Affiliation** : liens `?ref=CODE` (cookie 30 jours), commission par produit, suivi des gains.
- **Checkout unique multi-devises** : conversion au taux du jour avant validation, montant débité affiché à l'acheteur.

## Moyens de paiement et prestataires

| Catégorie | Moyens | Traité par |
|---|---|---|
| Mobile Money | Orange Money, MTN MoMo, Wave, Moov Money, M-Pesa | FedaPay |
| Cartes | Visa, Mastercard, Amex | Stripe |
| Portefeuilles | PayPal, Apple Pay, Google Pay | Stripe Checkout |
| Crypto | BTC, ETH, USDT TRC-20 / ERC-20 | NOWPayments |

### Points à vérifier avant d'ouvrir en production (important)

- **Couverture des prestataires** : la disponibilité de chaque opérateur dépend de votre pays et de votre compte. Vérifiez dans le tableau de bord FedaPay quels opérateurs et pays sont activés pour vous (notamment **M-Pesa** et le **Cameroun**) ; si un opérateur n'est pas couvert, ajoutez un prestataire dans `src/lib/payments/` (l'architecture est prévue pour : un fichier par prestataire + une entrée dans `methods.ts`).
- **Apple Pay / Google Pay / PayPal** passent par Stripe : activez-les dans *Stripe Dashboard → Paramètres → Moyens de paiement* (Apple Pay demande la vérification de votre domaine ; PayPal n'est pas disponible dans tous les pays). Stripe affiche automatiquement les moyens activés sur sa page de paiement.
- **Devises facturées** : Stripe en EUR/USD/GBP, FedaPay en XOF (parité fixe avec le XAF), crypto en USD. La conversion est faite côté serveur à chaque commande.
- Testez d'abord en **sandbox** (FedaPay `FEDAPAY_ENV=sandbox`, clés Stripe `sk_test_…`) avec de petites sommes.
- Vérifiez les conditions légales/fiscales applicables à votre activité et à la collecte de commissions pour des tiers.

## Installation locale

```bash
npm install
cp .env.example .env.local     # remplir les clés
npm run dev
```

## Mise en ligne (Vercel + Supabase)

1. **Supabase** : créez un projet → *SQL Editor* → collez et exécutez `supabase/schema.sql` (tables, RLS, buckets `deliverables` privé et `covers` public).
   *Authentication → URL Configuration* : ajoutez l'URL de votre site (Site URL et Redirect URLs).
2. **Vercel** : importez le dépôt, ajoutez toutes les variables de `.env.example`, `NEXT_PUBLIC_APP_URL` = votre URL finale (https). Déployez.
3. **Webhooks** (remplacez `https://votre-site.com`) :
   - Stripe → `https://votre-site.com/api/webhooks/stripe` — événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` → copiez le secret dans `STRIPE_WEBHOOK_SECRET`.
   - FedaPay → `https://votre-site.com/api/webhooks/fedapay` (événements transaction) → secret dans `FEDAPAY_WEBHOOK_SECRET`.
   - NOWPayments → IPN callback `https://votre-site.com/api/webhooks/crypto` + IPN secret dans `NOWPAYMENTS_IPN_SECRET`.
4. **Resend** : vérifiez votre domaine d'envoi et renseignez `EMAIL_FROM`.
5. Alternatives d'hébergement : tout hébergeur Node.js (Netlify, Railway, Render, VPS) avec `npm run build && npm start`.

## Structure

```
supabase/schema.sql              Tables, RLS, storage, fonction de licences
src/middleware.ts                Session Supabase, protection /dashboard, cookie d'affiliation
src/lib/payments/                methods (catalogue), stripe, fedapay, crypto
src/lib/currency.ts, money.ts    Taux de change (cache 1 h) et formats
src/lib/fulfillment.ts           Finalisation idempotente (commission, licence, email)
src/app/api/checkout             Création commande + conversion + session de paiement
src/app/api/webhooks/*           Stripe / FedaPay / NOWPayments (signatures vérifiées)
src/app/api/download             Téléchargement protégé par URL signée
src/app/dashboard/*              Espace créateur
src/app/download/[token]         Portail client après achat
```

## Sécurité (déjà en place)

- Prix relu en base à chaque commande ; jamais le montant envoyé par le navigateur.
- Signatures de webhooks vérifiées ; FedaPay revérifié par appel API ; crypto validé uniquement au statut `finished`.
- Traitement des paiements idempotent (un webhook rejoué n'a aucun effet).
- Fichiers vendus dans un bucket privé, servis uniquement par URL signée de 60 s après vérification de la commande payée.
- RLS Supabase sur toutes les tables ; clé `service_role` utilisée uniquement côté serveur.

## Limites connues / à faire ensuite

- Le versement des commissions d'affiliation et des revenus aux créateurs est **calculé et suivi** (table `commissions`, frais plateforme) mais **pas encore automatisé** : les paiements sortants restent à faire manuellement ou via les API de payout du prestataire.
- Pas de limitation de débit (rate limiting) sur `/api/views` et `/api/checkout` : à ajouter (ex. Upstash) avant un fort trafic.
- Les vidéos de formation sont téléchargeables (pas de lecteur en streaming protégé).
- Le projet n'a pas été compilé dans l'environnement de génération : lancez `npm install && npm run build` et corrigez d'éventuelles erreurs de typage mineures.
