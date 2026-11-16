-- Tests de bout en bout du schéma (répartition, stock, retraits, sécurité RLS...).
-- Affiche PASS / FAIL pour chaque vérification.
\set ON_ERROR_STOP off
\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.fail_count() returns int language sql as
  $$ select coalesce(nullif(current_setting('tests.fails', true), '')::int, 0) $$;

create or replace function tests.eq(name text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is not distinct from expected then
    raise notice 'PASS  %', name;
  else
    raise warning 'FAIL  % -> obtenu [%] attendu [%]', name, actual, expected;
    perform set_config('tests.fails', (tests.fail_count() + 1)::text, false);
  end if;
end $$;

-- Vérifie qu'une instruction échoue avec un message contenant "expected".
create or replace function tests.raises(name text, stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise warning 'FAIL  % -> aucune erreur (attendu: %)', name, expected;
  perform set_config('tests.fails', (tests.fail_count() + 1)::text, false);
exception when others then
  if sqlerrm ilike '%' || expected || '%' then
    raise notice 'PASS  %', name;
  else
    raise warning 'FAIL  % -> erreur [%] attendu [%]', name, sqlerrm, expected;
    perform set_config('tests.fails', (tests.fail_count() + 1)::text, false);
  end if;
end $$;

create or replace function tests.as_db() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create or replace function tests.as_user(u uuid) returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', u::text, false); execute 'set role authenticated'; end $$;
create or replace function tests.as_service() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); execute 'set role service_role'; end $$;
create or replace function tests.as_anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); execute 'set role anon'; end $$;

-- Raccourci : crée une commande et attache un identifiant Fapshi. Retourne la transaction.
create or replace function tests.checkout(p_trans text, p_product uuid, p_buyer uuid, p_email text, p_qty int,
                                          p_method text, p_addr text, p_phone text, p_ref text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.create_checkout_order(p_product, p_buyer, p_email, 'Client', p_qty, p_method, p_addr, p_phone, p_ref);
  update public.transactions set fapshi_trans_id = p_trans, fapshi_link = 'https://pay.test/' || p_trans
   where id = (r->>'transaction_id')::uuid;
  return r;
end $$;

\echo ===== PRÉPARATION =====
select tests.as_db();
truncate auth.users cascade;
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111', 'vendeur@t.cm', '{"full_name":"Vendeur"}'),
 ('22222222-2222-2222-2222-222222222222', 'affilie@t.cm', '{"full_name":"Affilie"}'),
 ('33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', '{"full_name":"Acheteur"}'),
 ('44444444-4444-4444-4444-444444444444', 'admin@t.cm', '{}'),
 ('55555555-5555-5555-5555-555555555555', 'autre@t.cm', '{}');
update public.profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set phone = '699000111' where id = '11111111-1111-1111-1111-111111111111';

select referral_code from public.profiles where id = '22222222-2222-2222-2222-222222222222' \gset aff_
select referral_code from public.profiles where id = '11111111-1111-1111-1111-111111111111' \gset sel_
select referral_code from public.profiles where id = '33333333-3333-3333-3333-333333333333' \gset buy_

select tests.eq('profil + portefeuille créés automatiquement',
  (select count(*) from public.profiles)::text || '/' || (select count(*) from public.wallets)::text, '5/5');

-- Produits créés PAR LE VENDEUR (donc soumis à la RLS)
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into public.products (id, seller_id, product_type, digital_kind, title, slug, price, is_published, affiliate_percent) values
 ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'digital', 'file', 'Guide 30', 'g30', 10000, true, 30),
 ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'digital', 'file', 'Guide 50', 'g50', 10000, true, 50),
 ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'digital', 'license', 'Licence', 'lic', 5000, true, 30);
insert into public.products (id, seller_id, product_type, title, slug, price, is_published, affiliate_percent,
                             stock, images, weight, variant, whatsapp_seller, delivery_options) values
 ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'physical', 'Sac cuir', 'sac', 15000, true, 20,
   3, array['https://img/1.jpg'], '500g', 'Taille M', '699000111',
   '{"pickup_douala":{"enabled":true,"price":0},"delivery_douala":{"enabled":true,"price":1000},"shipping_cameroon":{"enabled":true,"price":2500}}'),
 ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'physical', 'Dernier article', 'dernier', 2000, true, 30,
   1, array['https://img/2.jpg'], null, null, '699000111',
   '{"pickup_douala":{"enabled":true,"price":0},"delivery_douala":{"enabled":false,"price":0},"shipping_cameroon":{"enabled":false,"price":0}}');
insert into public.license_keys (product_id, key) values ('aaaaaaaa-0000-0000-0000-000000000004', 'KEY-AAAA-1111');
-- Les nouveaux produits attendent l'approbation de l'admin : on approuve ceux du test (comme le ferait l'admin)
select tests.as_service();
update public.products set moderation_status = 'approved';
select tests.as_user('11111111-1111-1111-1111-111111111111');

\echo ===== A. LES 3 EXEMPLES DU CLIENT (10 000 FCFA, produit digital) =====
select tests.as_service();
select tests.checkout('FP-SANS', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'client1@t.cm', 1, null, null, null, null) \gset
select public.confirm_fapshi_payment('FP-SANS', 10000, 'mobile money', 9700)->>'status' as st \gset c1_
select tests.eq('SANS affilié : statut', :'c1_st', 'paid');
select tests.eq('SANS affilié : plateforme 10% / affilié 0 / vendeur 90%',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount || ' (' || platform_fee_percent || '%)' from public.transactions where fapshi_trans_id = 'FP-SANS'),
  '1000/0/9000 (10%)');

select tests.checkout('FP-AFF30', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'client2@t.cm', 1, null, null, null, :'aff_referral_code') \gset
select public.confirm_fapshi_payment('FP-AFF30', 10000, 'orange money', 9700)->>'status' as st \gset c2_
select tests.eq('AVEC affilié 30% : plateforme 5% / affilié 30% / vendeur 65%',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount || ' (' || platform_fee_percent || '%+' || affiliate_fee_percent || '%)' from public.transactions where fapshi_trans_id = 'FP-AFF30'),
  '500/3000/6500 (5%+30%)');
select tests.eq('AVEC affilié : affiliate_id enregistré',
  (select (affiliate_id = '22222222-2222-2222-2222-222222222222')::text from public.transactions where fapshi_trans_id = 'FP-AFF30'), 'true');

select tests.checkout('FP-AFF50', 'aaaaaaaa-0000-0000-0000-000000000002', null, 'client3@t.cm', 1, null, null, null, lower(:'aff_referral_code')) \gset
select public.confirm_fapshi_payment('FP-AFF50', 10000, 'mobile money', 9700)->>'status' as st \gset c3_
select tests.eq('AVEC affilié 50% : plateforme 5% / affilié 50% / vendeur 45% (code en minuscules accepté)',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-AFF50'),
  '500/5000/4500');

select tests.eq('Portefeuille vendeur en attente = 9000 + 6500 + 4500',
  (select balance_pending::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '20000');
select tests.eq('Portefeuille affilié en attente = 3000 + 5000',
  (select balance_pending::text from public.wallets where user_id = '22222222-2222-2222-2222-222222222222'), '8000');
select tests.eq('Rien de disponible avant 24h',
  (select balance_available::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '0');
select tests.eq('Digital : fonds libérés dans ~24h',
  (select (release_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute')::text from public.transactions where fapshi_trans_id = 'FP-SANS'), 'true');
select tests.eq('Digital : commande livrée automatiquement',
  (select o.status || '/' || o.payment_status from public.orders o join public.transactions t on t.order_id = o.id where t.fapshi_trans_id = 'FP-SANS'), 'delivered/paid');

\echo ===== B. PROTECTIONS DE LAFFILIATION =====
select tests.checkout('FP-SELF', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'c4@t.cm', 1, null, null, null, :'sel_referral_code') \gset
select public.confirm_fapshi_payment('FP-SELF', 10000, 'mobile money', 9700) \gset ign_
select tests.eq('Vendeur NE PEUT PAS être son propre affilié => barème SANS affilié',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-SELF'), '1000/0/9000');
select tests.checkout('FP-BUYSELF', 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 1, null, null, null, :'buy_referral_code') \gset
select public.confirm_fapshi_payment('FP-BUYSELF', 10000, 'mobile money', 9700) \gset ign_
select tests.eq('Acheteur NE PEUT PAS s''auto-parrainer => barème SANS affilié',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-BUYSELF'), '1000/0/9000');
select tests.checkout('FP-BADREF', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'c5@t.cm', 1, null, null, null, 'ZZZZZZZZ') \gset
select public.confirm_fapshi_payment('FP-BADREF', 10000, 'mobile money', 9700) \gset ign_
select tests.eq('Code d''affiliation inconnu => ignoré (barème SANS affilié)',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-BADREF'), '1000/0/9000');

\echo ===== C. WEBHOOK REJOUÉ / MONTANT / ÉCHEC =====
select tests.eq('Webhook rejoué : aucun double crédit',
  (public.confirm_fapshi_payment('FP-AFF30', 10000, 'orange money', 9700))->>'status', 'already');
select tests.eq('Portefeuille affilié inchangé après le rejeu',
  (select balance_pending::text from public.wallets where user_id = '22222222-2222-2222-2222-222222222222'), '8000');

select tests.checkout('FP-MONTANT', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'c6@t.cm', 1, null, null, null, null) \gset
select tests.eq('Montant différent => mis en revue, personne crédité',
  (public.confirm_fapshi_payment('FP-MONTANT', 9999, 'mobile money', 9700))->>'reason', 'montant_different');
select tests.eq('Transaction en revue',
  (select status || '/' || review_reason from public.transactions where fapshi_trans_id = 'FP-MONTANT'), 'review/montant_different');

select tests.checkout('FP-FAIL', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'c7@t.cm', 1, null, null, null, null) \gset
select public.mark_fapshi_failed('FP-FAIL', 'FAILED');
select tests.eq('Échec Fapshi => transaction "failed"', (select status from public.transactions where fapshi_trans_id = 'FP-FAIL'), 'failed');
select tests.eq('Le client peut réessayer sur le même lien : SUCCESSFUL après FAILED est accepté',
  (public.confirm_fapshi_payment('FP-FAIL', 10000, 'mobile money', 9700))->>'status', 'paid');
select tests.checkout('FP-EXP', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'c8@t.cm', 1, null, null, null, null) \gset
select public.mark_fapshi_failed('FP-EXP', 'EXPIRED');
select tests.eq('Lien expiré => "expired"', (select status from public.transactions where fapshi_trans_id = 'FP-EXP'), 'expired');
select tests.raises('Transaction inconnue refusée', $$select public.confirm_fapshi_payment('NOPE', 100, 'x', 0)$$, 'transaction_inconnue');

\echo ===== D. PRODUIT PHYSIQUE =====
select tests.raises('Physique : connexion obligatoire', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000003', null, 'x@t.cm', 'X', 1, 'delivery_douala', 'Bonamoussadi', '699111222', null)$$, 'connexion_requise');
select tests.raises('Physique : livraison non proposée refusée', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'x@t.cm', 'X', 1, 'delivery_douala', 'Bonamoussadi', '699111222', null)$$, 'livraison_invalide');
select tests.raises('Physique : adresse obligatoire hors retrait', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'x@t.cm', 'X', 1, 'delivery_douala', '', '699111222', null)$$, 'adresse_invalide');
select tests.raises('Physique : téléphone obligatoire', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'x@t.cm', 'X', 1, 'pickup_douala', '', '', null)$$, 'telephone_invalide');
select tests.raises('Physique : quantité > stock refusée', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'x@t.cm', 'X', 4, 'pickup_douala', '', '699111222', null)$$, 'stock_insuffisant');

-- 2 sacs, livraison Douala 1000 : total 31 000 ; commission SUR LES ARTICLES (30 000) seulement
select tests.checkout('FP-PHY1', 'aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 2, 'delivery_douala', 'Bonamoussadi, Douala', '699111222', null) \gset p1_
select tests.eq('Total = articles + livraison (le prix vient de la base)',
  (select total_price::text from public.orders where download_token = ((:'p1_checkout')::jsonb->>'download_token')::uuid), '31000');
select public.confirm_fapshi_payment('FP-PHY1', 31000, 'mobile money', 30070) \gset ign_
select tests.eq('Physique SANS affilié : 8% des ARTICLES (2400), vendeur 28600 = 27600 + 1000 de livraison',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-PHY1'), '2400/0/28600');
select tests.eq('Stock décrémenté de la quantité achetée (3 -> 1)',
  (select stock::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000003'), '1');
select tests.eq('Physique : commande "En attente" et fonds non libérables (pas de date)',
  (select o.status || '/' || coalesce(t.release_at::text, 'null') from public.orders o join public.transactions t on t.order_id = o.id where t.fapshi_trans_id = 'FP-PHY1'), 'pending/null');

-- 1 sac, expédition Cameroun 2500, AVEC affilié (20% sur ce produit) : total 17 500
select tests.checkout('FP-PHY2', 'aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 1, 'shipping_cameroon', 'Yaoundé, Mvan', '699111222', :'aff_referral_code') \gset ign_
select public.confirm_fapshi_payment('FP-PHY2', 17500, 'orange money', 16975) \gset ign_
select tests.eq('Physique AVEC affilié 20% : 5% de 15000 = 750 / 20% = 3000 / vendeur 13750',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where fapshi_trans_id = 'FP-PHY2'), '750/3000/13750');
select tests.eq('Stock à 0 => achat impossible (rupture)', (select stock::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000003'), '0');
select tests.raises('Rupture de stock : commande refusée', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'x@t.cm', 'X', 1, 'pickup_douala', '', '699111222', null)$$, 'stock_insuffisant');

\echo ===== E. DERNIER ARTICLE : DEUX ACHETEURS PAYENT EN MÊME TEMPS =====
select tests.checkout('FP-LAST1', 'aaaaaaaa-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 1, 'pickup_douala', '', '699111222', null) \gset ign_
select tests.checkout('FP-LAST2', 'aaaaaaaa-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'autre@t.cm', 1, 'pickup_douala', '', '699333444', null) \gset ign_
select public.confirm_fapshi_payment('FP-LAST1', 2000, 'mobile money', 1940) ->> 'status' as st \gset l1_
select balance_pending as pend_before from public.wallets where user_id = '11111111-1111-1111-1111-111111111111' \gset
select tests.eq('1er payeur : livré', :'l1_st', 'paid');
select tests.eq('2e payeur : stock épuisé => mis en revue, PAS de crédit',
  (public.confirm_fapshi_payment('FP-LAST2', 2000, 'mobile money', 1940)) ->> 'reason', 'stock_insuffisant');
select tests.eq('Le solde du vendeur n''a pas bougé pour la vente en revue',
  (select balance_pending::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), :'pend_before');
select tests.eq('Stock jamais négatif', (select stock::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000005'), '0');

\echo ===== F. CLÉS DE LICENCE =====
select tests.checkout('FP-LIC1', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'l1@t.cm', 1, null, null, null, null) \gset ign_
select tests.eq('Licence attribuée à l''acheteur', (public.confirm_fapshi_payment('FP-LIC1', 5000, 'mobile money', 4850)) ->> 'license_key', 'KEY-AAAA-1111');
select tests.checkout('FP-LIC2', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'l2@t.cm', 1, null, null, null, null) \gset ign_
select tests.eq('Plus de clé libre => mis en revue', (public.confirm_fapshi_payment('FP-LIC2', 5000, 'mobile money', 4850)) ->> 'reason', 'licence_epuisee');

\echo ===== G. SUIVI DE COMMANDE + LIBÉRATION DES FONDS (PHYSIQUE) =====
-- Les commandes sont retrouvées une seule fois, avec les droits de la base : l'acheteur et les inconnus
-- ne voient pas la table transactions (RLS), donc on ne peut pas les chercher en se faisant passer pour eux.
select tests.as_service();
select order_id as phy1_order from public.transactions where fapshi_trans_id = 'FP-PHY1' \gset
select order_id as phy2_order from public.transactions where fapshi_trans_id = 'FP-PHY2' \gset
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Un autre utilisateur ne peut pas changer le statut', format($$select public.seller_update_order_status(%L, 'confirmed')$$, :'phy1_order'), 'acces_refuse');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('En attente -> Livrée directement : interdit', format($$select public.seller_update_order_status(%L, 'delivered')$$, (select order_id from public.transactions where fapshi_trans_id = 'FP-PHY1')), 'transition_invalide');
select public.seller_update_order_status(order_id, 'confirmed') from public.transactions where fapshi_trans_id = 'FP-PHY1';
select tests.raises('Livraison à domicile : "Prête pour retrait" interdit', format($$select public.seller_update_order_status(%L, 'ready_for_pickup')$$, (select order_id from public.transactions where fapshi_trans_id = 'FP-PHY1')), 'transition_invalide');
select public.seller_update_order_status(order_id, 'shipped') from public.transactions where fapshi_trans_id = 'FP-PHY1';
select tests.as_user('33333333-3333-3333-3333-333333333333');
select public.buyer_confirm_delivery(:'phy1_order'::uuid);
select tests.as_service();
select tests.eq('"J''ai reçu mon produit" : commande livrée',
  (select status from public.orders where id = :'phy1_order'::uuid), 'delivered');
select tests.eq('Acheteur a confirmé => libération immédiate des fonds (sans attendre le vendeur)',
  (select (release_at <= now())::text from public.transactions where fapshi_trans_id = 'FP-PHY1'), 'true');
select balance_pending as sp0, balance_available as sa0 from public.wallets where user_id = '11111111-1111-1111-1111-111111111111' \gset
select public.release_due_funds(null) as released \gset
select tests.eq('1 transaction libérée', :'released', '1');
select tests.eq('Vendeur : 28600 passe de "en attente" à "disponible"',
  (select (:sp0 - balance_pending) || '/' || (balance_available - :sa0) from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '28600/28600');
select tests.eq('Relancer la libération ne recrédite rien', (public.release_due_funds(null))::text, '0');

-- Commande PHY2 : vendeur livre, l'acheteur ne confirme pas => 3 jours ; puis litige
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.seller_update_order_status(order_id, 'confirmed') from public.transactions where fapshi_trans_id = 'FP-PHY2';
select public.seller_update_order_status(order_id, 'shipped') from public.transactions where fapshi_trans_id = 'FP-PHY2';
select public.seller_update_order_status(order_id, 'delivered') from public.transactions where fapshi_trans_id = 'FP-PHY2';
select tests.as_service();
select tests.eq('Sans confirmation acheteur : libération dans 3 jours',
  (select (release_at between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour')::text from public.transactions where fapshi_trans_id = 'FP-PHY2'), 'true');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Seul l''acheteur peut ouvrir un litige', format($$select public.buyer_open_dispute(%L, 'Colis non reçu du tout')$$, :'phy2_order'), 'acces_refuse');
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.raises('Motif de litige trop court refusé', format($$select public.buyer_open_dispute(%L, 'ko')$$, :'phy2_order'), 'motif_invalide');
select public.buyer_open_dispute(:'phy2_order'::uuid, 'Le sac est arrivé déchiré');
select tests.as_db();
update public.transactions set release_at = now() - interval '1 minute' where fapshi_trans_id = 'FP-PHY2';   -- on simule les 7 jours écoulés
select tests.as_service();
select tests.eq('Litige ouvert : même après 7 jours, fonds bloqués', (public.release_due_funds(null))::text, '0');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('Un vendeur ne peut pas lever un litige', format($$select public.admin_resolve_dispute(%L)$$, (select order_id from public.transactions where fapshi_trans_id = 'FP-PHY2')), 'acces_refuse');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_resolve_dispute(order_id) from public.transactions where fapshi_trans_id = 'FP-PHY2';
select tests.as_service();
select tests.eq('Litige tranché pour le vendeur => fonds libérés', (public.release_due_funds(null))::text, '1');
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.raises('Litige impossible une fois les fonds libérés', format($$select public.buyer_open_dispute(%L, 'Trop tard pour signaler')$$, :'phy2_order'), 'fonds_deja_liberes');

-- Libération des ventes digitales (24h simulées)
select tests.as_db();
update public.transactions set release_at = now() - interval '1 minute' where fapshi_trans_id in ('FP-SANS', 'FP-AFF50');
select tests.as_service();
select tests.eq('Digital : après 24h, 2 ventes libérées', (public.release_due_funds(null))::text, '2');

\echo ===== H. RETRAITS =====
select balance_available as av from public.wallets where user_id = '11111111-1111-1111-1111-111111111111' \gset
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('Retrait sous le minimum refusé', $$select public.request_withdrawal(500, 'mtn_momo', '699000111')$$, 'montant_minimum');
select tests.raises('Retrait > solde disponible refusé', $$select public.request_withdrawal(99999999, 'mtn_momo', '699000111')$$, 'solde_insuffisant');
select tests.raises('Méthode inconnue refusée', $$select public.request_withdrawal(5000, 'cheque', '699000111')$$, 'methode_invalide');
select tests.raises('Téléphone invalide refusé', $$select public.request_withdrawal(5000, 'mtn_momo', 'abc')$$, 'telephone_invalide');
select tests.raises('PayPal : email invalide refusé', $$select public.request_withdrawal(5000, 'paypal', 'pas-un-email')$$, 'destination_invalide');
select tests.raises('Crypto : adresse trop courte refusée', $$select public.request_withdrawal(5000, 'crypto_usdt', 'TX123')$$, 'destination_invalide');
select tests.raises('Wave : numéro invalide refusé', $$select public.request_withdrawal(5000, 'wave', 'abc')$$, 'telephone_invalide');
select tests.raises('Virement : compte trop court refusé', $$select public.request_withdrawal(5000, 'bank_transfer', '123')$$, 'destination_invalide');
select public.request_withdrawal(10000, 'orange_money', '699000111') as w1 \gset
select tests.as_service();
select tests.eq('Demande enregistrée "pending" et solde bloqué tout de suite',
  (select w.status || '/' || (:av - wl.balance_available) from public.withdrawals w join public.wallets wl on wl.user_id = w.user_id where w.id = :'w1'), 'pending/10000');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Non-admin ne peut pas traiter un retrait', format($$select public.admin_process_withdrawal(%L, 'paid', null)$$, :'w1'), 'acces_refuse');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_process_withdrawal(:'w1', 'failed', 'numéro incorrect');
select tests.as_service();
select tests.eq('Retrait refusé => le solde est rendu', (select balance_available::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), :'av');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.raises('Retrait déjà traité : refus', format($$select public.admin_process_withdrawal(%L, 'paid', null)$$, :'w1'), 'retrait_deja_traite');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.request_withdrawal(5000, 'mtn_momo', '699000111') as w2 \gset
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_process_withdrawal(:'w2', 'paid', 'envoyé par MoMo');
select tests.as_service();
select tests.eq('Retrait payé => total retiré mis à jour',
  (select total_withdrawn::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '5000');
select tests.as_anon();
select tests.raises('Visiteur anonyme ne peut pas demander un retrait', $$select public.request_withdrawal(5000, 'mtn_momo', '699000111')$$, 'permission denied');

\echo ===== I. STATISTIQUES PAR PRODUIT =====
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.eq('Le vendeur voit les statistiques de ses produits (ventes payées comptées)',
  (select (sum(sales) > 0 and count(*) > 0 and bool_and(seller_id = '11111111-1111-1111-1111-111111111111'))::text from public.seller_product_stats), 'true');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.eq('Un inconnu ne voit aucune statistique de produit', (select count(*)::text from public.seller_product_stats), '0');
select tests.as_anon();
select tests.raises('Un visiteur anonyme ne peut pas lire les statistiques', $$select * from public.seller_product_stats$$, 'permission denied');


-- =====================================================================
-- J. NOUVEAUTÉS : 8 % physique, colonnes cachées, boost, activité, boutique
-- =====================================================================
\echo ===== J. NOUVEAUTES =====
select tests.as_service();
select tests.eq('compute_split_for : physique 15 000 sans affilié = 1 200 / 0',
  (select platform_fee || '/' || affiliate_fee from public.compute_split_for(15000, false, 0, true)), '1200/0');
select tests.eq('compute_split_for : digital 15 000 sans affilié = 1 500 / 0',
  (select platform_fee || '/' || affiliate_fee from public.compute_split_for(15000, false, 0, false)), '1500/0');
select tests.eq('compute_split_for : physique AVEC affilié 30 % = 750 / 4 500',
  (select platform_fee || '/' || affiliate_fee from public.compute_split_for(15000, true, 30, true)), '750/4500');

-- Un visiteur anonyme ne peut pas lire le numéro WhatsApp du vendeur ni les instructions
select tests.as_anon();
select tests.raises('Anonyme : lecture de products.whatsapp_seller refusée', $$select whatsapp_seller from public.products limit 1$$, 'permission denied');
select tests.raises('Anonyme : lecture de products.delivery_notes refusée', $$select delivery_notes from public.products limit 1$$, 'permission denied');
select tests.eq('Anonyme : aucun profil (donc aucun WhatsApp) lisible', (select count(*)::text from public.profiles), '0');
select tests.eq('Anonyme : colonnes publiques toujours lisibles', (select (count(*) >= 0)::text from public.products where is_published), 'true');
select tests.as_service();

-- Changer le WhatsApp du profil met à jour les produits
update public.profiles set whatsapp = '237699000111' where id = '11111111-1111-1111-1111-111111111111';
select tests.eq('Trigger : produits du vendeur synchronisés avec son nouveau WhatsApp',
  (select (count(*) filter (where whatsapp_seller = '237699000111') > 0)::text from public.products where seller_id = '11111111-1111-1111-1111-111111111111' and product_type = 'physical'), 'true');

-- Boost : paiement vérifié, montant contrôlé, boosts empilés
insert into public.product_boosts (id, product_id, seller_id, plan, amount, fapshi_trans_id)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '3d', 1000, 'FB-1'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '7d', 2500, 'FB-2'),
       ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '3d', 1000, 'FB-3');
select public.confirm_boost_payment('FB-3', 999) as bad \gset
select tests.eq('Boost : montant différent => à vérifier (jamais activé)', (select status from public.product_boosts where fapshi_trans_id = 'FB-3'), 'review');
select public.confirm_boost_payment('FB-1', 1000) as ok1 \gset
select tests.eq('Boost 3 jours payé => actif', (select (count(*) = 1)::text from public.active_boosts where product_id = 'aaaaaaaa-0000-0000-0000-000000000003' and plan = '3d'), 'true');
select tests.eq('Boost 3 jours : fin dans ~3 jours', (select (ends_at between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour')::text from public.product_boosts where fapshi_trans_id = 'FB-1'), 'true');
select public.confirm_boost_payment('FB-2', 2500) as ok2 \gset
select tests.eq('2e boost : commence à la fin du 1er (fin dans ~10 jours)', (select (ends_at between now() + interval '9 days 23 hours' and now() + interval '10 days 1 hour')::text from public.product_boosts where fapshi_trans_id = 'FB-2'), 'true');
select tests.eq('Rejouer la confirmation ne change rien', (public.confirm_boost_payment('FB-1', 1000))->>'status', 'already');
select tests.as_anon();
select tests.eq('Anonyme : voit les boosts actifs (badges)', (select (count(*) >= 1)::text from public.active_boosts), 'true');
select tests.raises('Anonyme : ne peut pas lire la table des boosts', $$select count(*) from public.product_boosts$$, 'permission denied');
select tests.as_service();

-- Activité : produit publié depuis plus de 3 jours, sans vente/partage/vue => à notifier
update public.products set created_at = now() - interval '5 days', is_published = true where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.transactions set paid_at = now() - interval '5 days' where product_id = 'aaaaaaaa-0000-0000-0000-000000000003' and paid_at is not null;
delete from public.product_views where product_id = 'aaaaaaaa-0000-0000-0000-000000000003';
select tests.eq('Produit endormi détecté pour l''email', (select (count(*) = 1)::text from public.inactive_products_to_notify() where product_id = 'aaaaaaaa-0000-0000-0000-000000000003'), 'true');
update public.products set last_inactivity_email_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select tests.eq('Pas de 2e email avant 7 jours', (select count(*)::text from public.inactive_products_to_notify() where product_id = 'aaaaaaaa-0000-0000-0000-000000000003'), '0');
insert into public.product_shares (product_id, channel) values ('aaaaaaaa-0000-0000-0000-000000000003', 'whatsapp');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.eq('Vue activité : le vendeur voit ses partages sur 3 jours', (select shares_3d::text from public.seller_product_activity where product_id = 'aaaaaaaa-0000-0000-0000-000000000003'), '1');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.eq('Vue activité : un autre utilisateur ne voit rien', (select count(*)::text from public.seller_product_activity), '0');
select tests.as_service();

-- =====================================================================
-- K. AVIS, VÉRIFIÉ, MODÉRATION, PAIEMENT À LA LIVRAISON, BLOCAGE
-- =====================================================================
\echo ===== K. CONFIANCE / COD / ADMIN =====
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('Vendeur : ne peut pas se mettre lui-même "approuvé" à la création',
  $$insert into public.products (seller_id, product_type, title, slug, price, stock, images, whatsapp_seller, delivery_options, moderation_status)
    values ('11111111-1111-1111-1111-111111111111', 'physical', 'Triche', 'triche', 5000, 1, array['x'], '699000111',
    '{"pickup_douala":{"enabled":true,"price":0},"delivery_douala":{"enabled":false,"price":0},"shipping_cameroon":{"enabled":false,"price":0}}', 'approved')$$, 'permission denied');
update public.profiles set city = 'Douala' where id = '11111111-1111-1111-1111-111111111111';
insert into public.products (id, seller_id, product_type, title, slug, price, is_published, stock, images, whatsapp_seller, category, delivery_options) values
 ('aaaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'physical', 'Chaussures cuir', 'chaussures', 20000, true, 5, array['https://img/c.jpg'], '699000111', 'Chaussures',
  '{"pickup_douala":{"enabled":true,"price":0},"delivery_douala":{"enabled":true,"price":1500},"shipping_cameroon":{"enabled":true,"price":2500}}');
select tests.eq('Nouveau produit : en attente de modération', (select moderation_status from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), 'pending');
select tests.eq('Nouveau produit : la ville du vendeur est copiée', (select city from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), 'Douala');
select tests.raises('Vendeur : ne peut pas s''approuver (UPDATE)', $$update public.products set moderation_status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000006'$$, 'permission denied');
select tests.as_anon();
select tests.eq('Produit en attente : invisible pour le public', (select count(*)::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '0');
select tests.as_service();
select tests.raises('Produit en attente : achat impossible', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'a@t.cm', 'A', 1, 'pickup_douala', '', '699111222', null, 'cod')$$, 'produit_introuvable');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Non-admin : modération refusée', $$select public.admin_moderate_product('aaaaaaaa-0000-0000-0000-000000000006', 'approved', null)$$, 'acces_refuse');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_moderate_product('aaaaaaaa-0000-0000-0000-000000000006', 'approved', null);
select tests.as_anon();
select tests.eq('Produit approuvé : visible pour le public', (select count(*)::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '1');

-- Paiement à la livraison
select tests.as_service();
select tests.raises('COD interdit pour un produit DIGITAL', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'a@t.cm', 'A', 1, null, null, null, null, 'cod')$$, 'cod_interdit_digital');
select tests.raises('Moyen de paiement inconnu refusé', $$select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'a@t.cm', 'A', 1, 'pickup_douala', '', '699111222', null, 'cheque')$$, 'paiement_invalide');
select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 'Acheteur', 1, 'delivery_douala', 'Akwa, Douala', '699111222', :'aff_referral_code', 'cod')->>'order_id' as cod1 \gset
select tests.eq('COD : total = prix + livraison (20000 + 1500)', (select total_price::text from public.orders where id = :'cod1'::uuid), '21500');
select tests.eq('COD : stock réservé (5 -> 4)', (select stock::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '4');
select tests.eq('COD : en attente, pas d''affilié', (select payment_method || '/' || payment_status || '/' || status || '/' || coalesce(affiliate_id::text, 'aucun') from public.orders where id = :'cod1'::uuid), 'cod/pending/pending/aucun');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.eq('COD : le vendeur voit la commande avant paiement', (select count(*)::text from public.orders where id = :'cod1'::uuid), '1');
select public.seller_update_order_status(:'cod1'::uuid, 'confirmed');
select public.seller_update_order_status(:'cod1'::uuid, 'shipped');
select tests.raises('COD : "Livrée" sans encaissement refusé', format($$select public.seller_update_order_status(%L, 'delivered')$$, :'cod1'), 'encaissement_requis');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Un autre vendeur ne peut pas encaisser', format($$select public.seller_confirm_cash(%L)$$, :'cod1'), 'acces_refuse');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.seller_confirm_cash(:'cod1'::uuid);
select tests.as_service();
select tests.eq('COD encaissé : commande payée et livrée', (select payment_status || '/' || status from public.orders where id = :'cod1'::uuid), 'paid/delivered');
select tests.eq('COD encaissé : commission 8 % des articles = 1600, vendeur 19900',
  (select platform_fee || '/' || affiliate_fee || '/' || seller_amount from public.transactions where order_id = :'cod1'::uuid), '1600/0/19900');
select tests.eq('COD encaissé : commission due au portefeuille', (select commission_due::text from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '1600');
select tests.eq('COD : rien à libérer (cash déjà chez le vendeur)', (public.release_due_funds(null))::text, '0');

-- Avis : seulement après "J'ai reçu mon produit"
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.raises('Avis refusé avant confirmation de réception', format($$select public.submit_review(%L, 5, 'Top')$$, :'cod1'), 'avis_non_autorise');
select public.buyer_confirm_delivery(:'cod1'::uuid);
select tests.raises('Note invalide refusée', format($$select public.submit_review(%L, 6, 'x')$$, :'cod1'), 'note_invalide');
select public.submit_review(:'cod1'::uuid, 5, 'Très bonnes chaussures');
select tests.raises('Un seul avis par commande', format($$select public.submit_review(%L, 4, 'bis')$$, :'cod1'), 'avis_deja_envoye');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Un autre utilisateur ne peut pas noter', format($$select public.submit_review(%L, 1, 'faux')$$, :'cod1'), 'acces_refuse');
select tests.as_anon();
select tests.eq('Note du produit : 5 étoiles / 1 avis', (select rating_avg || '/' || rating_count from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '5.00/1');
select tests.eq('Note du vendeur publique', (select avg_rating || '/' || review_count from public.seller_ratings where seller_id = '11111111-1111-1111-1111-111111111111'), '5.00/1');
select tests.eq('Avis publics : prénom seulement', (select reviewer_name from public.public_reviews where product_id = 'aaaaaaaa-0000-0000-0000-000000000006'), 'Acheteur');
select tests.raises('Anonyme : table des avis fermée', $$select count(*) from public.reviews$$, 'permission denied');

-- COD annulé : le stock revient
select tests.as_service();
select public.create_checkout_order('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 'Acheteur', 2, 'pickup_douala', '', '699111222', null, 'cod')->>'order_id' as cod2 \gset
select tests.eq('COD 2 : stock réservé (4 -> 2)', (select stock::text from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '2');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.seller_cancel_cod(:'cod2'::uuid);
select tests.as_service();
select tests.eq('COD annulé : stock rendu (2 -> 4) et commande annulée', (select (select stock from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006') || '/' || status || '/' || payment_status from public.orders where id = :'cod2'::uuid), '4/cancelled/failed');

-- Retrait : la commission cash est prélevée
update public.wallets set balance_available = 10000 where user_id = '11111111-1111-1111-1111-111111111111';
select tests.as_user('11111111-1111-1111-1111-111111111111');
select public.request_withdrawal(5000, 'mtn_momo', '699000111') as wd \gset
select tests.as_service();
select tests.eq('Retrait 5000 : 1600 de commission prélevés, plus rien de dû',
  (select w.commission_deducted || '/' || (select commission_due from public.wallets where user_id = w.user_id) from public.withdrawals w where w.id = :'wd'::uuid), '1600/0');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_process_withdrawal(:'wd'::uuid, 'failed', 'test');
select tests.as_service();
select tests.eq('Retrait refusé : solde rendu et commission de nouveau due',
  (select balance_available || '/' || commission_due from public.wallets where user_id = '11111111-1111-1111-1111-111111111111'), '10000/1600');

-- Prix de livraison et ville : suivent le profil
select tests.as_user('11111111-1111-1111-1111-111111111111');
update public.profiles set delivery_douala_price = 1800, delivery_shipping_price = 2800, city = 'Yaoundé' where id = '11111111-1111-1111-1111-111111111111';
select tests.as_service();
select tests.eq('Profil : prix de livraison propagés aux produits physiques',
  (select (delivery_options->'delivery_douala'->>'price') || '/' || (delivery_options->'shipping_cameroon'->>'price') || '/' || city from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '1800/2800/Yaoundé');
select tests.eq('Profil : retrait sur place reste gratuit', (select delivery_options->'pickup_douala'->>'price' from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000006'), '0');

-- Vendeur vérifié et blocage
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Non-admin : ne peut pas vérifier un vendeur', $$select public.admin_set_verified('11111111-1111-1111-1111-111111111111', true)$$, 'acces_refuse');
select tests.raises('Non-admin : ne peut pas bloquer', $$select public.admin_set_blocked('11111111-1111-1111-1111-111111111111', true)$$, 'acces_refuse');
select tests.raises('Un utilisateur ne peut pas se donner le badge (UPDATE direct)', $$update public.profiles set is_verified = true where id = '55555555-5555-5555-5555-555555555555'$$, 'permission denied');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_set_verified('11111111-1111-1111-1111-111111111111', true);
select tests.as_anon();
select tests.eq('Badge "Vendeur Vérifié" visible publiquement', (select is_verified::text from public.public_profiles where id = '11111111-1111-1111-1111-111111111111'), 'true');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select tests.eq('Admin : chiffres du tableau de bord (vendeurs / commissions du mois)',
  (select (total_sellers >= 1)::text || '/' || (commissions_month >= 1600)::text || '/' || (total_orders >= 3)::text from public.admin_stats), 'true/true/true');
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.eq('Non-admin : tableau de bord admin vide', (select count(*)::text from public.admin_stats), '0');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_set_blocked('11111111-1111-1111-1111-111111111111', true);
select tests.as_anon();
select tests.eq('Vendeur bloqué : ses produits ne sont plus publics', (select count(*)::text from public.products where seller_id = '11111111-1111-1111-1111-111111111111'), '0');
select tests.eq('Vendeur bloqué : boutique introuvable', (select count(*)::text from public.public_profiles where id = '11111111-1111-1111-1111-111111111111'), '0');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('Vendeur bloqué : ne peut plus créer de produit', $$insert into public.products (seller_id, product_type, digital_kind, title, slug, price) values ('11111111-1111-1111-1111-111111111111', 'digital', 'file', 'X', 'x-bloque', 1000)$$, 'row-level security');
select tests.raises('Vendeur bloqué : retrait refusé', $$select public.request_withdrawal(2000, 'mtn_momo', '699000111')$$, 'compte_bloque');
select tests.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_set_blocked('11111111-1111-1111-1111-111111111111', false);
select tests.as_service();
