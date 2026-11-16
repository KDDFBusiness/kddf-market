# KDDF Market : guide de mise en ligne (Vercel + Supabase)

## A. Supabase (dans cet ordre)
1. **SQL Editor > New query** : collez TOUT `supabase/schema.sql` (il contient déjà les avis, le suivi, les retraits universels, la couleur libre de boutique…) > **Run**. Résultat attendu : « Success. No rows returned ». Le script est relançable sans danger. S'il affiche une erreur rouge, rien n'est créé : copiez l'erreur.
2. (Facultatif) collez `supabase/verifier-installation.sql` > Run : il liste ce qui est bien installé.
3. **Storage** : les buckets `covers` (Public) et `deliverables` (Privé) sont créés par le script. S'ils manquent : Storage > New bucket.
4. **Authentication > URL Configuration** : Site URL = `https://VOTRE-SITE.vercel.app` ; Redirect URLs = `https://VOTRE-SITE.vercel.app/**`.
5. **Compte administrateur** : inscrivez-vous sur le site, puis SQL Editor :
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'VOTRE_EMAIL');`
6. **Project Settings > API** : relevez l'URL, la clé `anon` et la clé `service_role` (secrète) pour Vercel.

## B. Vercel > Settings > Environment Variables (puis Redeploy)
Obligatoires : `NEXT_PUBLIC_APP_URL` (https, sans « / » final), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ces trois en « Config », pas « Secret »), `SUPABASE_SERVICE_ROLE_KEY`, `FAPSHI_ENV`, `FAPSHI_API_USER`, `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET`, `CRON_SECRET`.
Facultatives : `RESEND_API_KEY` + `EMAIL_FROM` (emails), `FLW_SECRET_KEY` + `FLW_SECRET_HASH` (cartes, Mobile Money élargi), `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` (+ `NOWPAYMENTS_ENV`) (crypto). Voir `.env.example`.

## C. Chez les fournisseurs de paiement
- Fapshi : webhook `https://VOTRE-SITE/api/webhook/fapshi` (secret = `FAPSHI_WEBHOOK_SECRET`).
- Flutterwave : webhook `https://VOTRE-SITE/api/webhook/flutterwave` (Secret hash = `FLW_SECRET_HASH`).
- NOWPayments : IPN secret = `NOWPAYMENTS_IPN_SECRET` (l'URL `/api/webhook/crypto` est envoyée automatiquement).

## D. GitHub > Vercel
Remplacez les fichiers du dépôt par ceux de ce projet (ou envoyez le dossier complet), commit, Vercel redéploie. Si le build échoue, ouvrez le journal et comparez le fichier cité avec celui de ce projet : l'erreur vient presque toujours d'un fichier resté à l'ancienne version.

## E. Support (facultatif)
Le script `schema.sql` crée la table `support_messages` et le bucket privé `support` (sinon : Storage > New bucket > `support`, privé). Variables Vercel facultatives : `SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_SUPPORT_EMAIL`. Vous lisez les messages dans /admin/support.
