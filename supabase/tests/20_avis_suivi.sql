-- Tests des nouveautés (avis + suivi). À lancer APRÈS 10_scenarios.sql et supabase/ajout-avis-suivi.sql.
\set ON_ERROR_STOP off
\set QUIET on
\pset tuples_only on
\pset format unaligned
select tests.as_db();
delete from public.reviews where product_id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.products set stock = 10, is_published = true, moderation_status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select tests.checkout('FP-NEW1', 'aaaaaaaa-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'acheteur@t.cm', 1, 'delivery_douala', 'Akwa, Douala', '699111222', null) \gset n_
select public.confirm_fapshi_payment('FP-NEW1', 16800, 'mobile money', 16000) \gset ign_
select (:'n_checkout'::jsonb->>'order_id') as ord \gset
select tests.eq('Nouvelle commande physique payée', (select payment_status || '/' || status from public.orders where id = :'ord'), 'paid/pending');

\echo ===== SUIVI =====
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.raises('Acheteur ne peut pas marquer « en cours de livraison »', format($$select public.seller_mark_out_for_delivery(%L)$$, :'ord'), 'acces_refuse');
select tests.raises('Pas d''avis tant que non livrée', format($$select public.submit_product_review(%L, 5, 'top', null)$$, :'ord'), 'avis_non_autorise');
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.raises('Étape 3 impossible avant l''expédition', format($$select public.seller_mark_out_for_delivery(%L)$$, :'ord'), 'transition_invalide');
select public.seller_update_order_status(:'ord', 'confirmed');
select public.seller_update_order_status(:'ord', 'shipped');
select public.seller_mark_out_for_delivery(:'ord');
select public.seller_mark_out_for_delivery(:'ord');
select tests.as_service();
select tests.eq('Journal : confirmed + shipped + out_for_delivery datés',
  (select string_agg(status, ',' order by status) from public.order_tracking where order_id = :'ord'), 'confirmed,out_for_delivery,shipped');
select balance_available as av0 from public.wallets where user_id = '11111111-1111-1111-1111-111111111111' \gset
select tests.eq('Argent toujours bloqué avant livraison', (select (released_at is null)::text from public.transactions where order_id = :'ord'), 'true');
select tests.as_user('33333333-3333-3333-3333-333333333333');
select public.buyer_confirm_delivery(:'ord');
select tests.as_service();
select tests.eq('Livrée journalisée', (select count(*)::text from public.order_tracking where order_id = :'ord' and status = 'delivered'), '1');

\echo ===== AVIS =====
select tests.as_user('55555555-5555-5555-5555-555555555555');
select tests.raises('Un autre client ne peut pas publier', format($$select public.submit_product_review(%L, 5, 'x', null)$$, :'ord'), 'acces_refuse');
select tests.as_user('33333333-3333-3333-3333-333333333333');
select tests.raises('Note invalide refusée', format($$select public.submit_product_review(%L, 9, 'x', null)$$, :'ord'), 'note_invalide');
select tests.raises('Photo http refusée', format($$select public.submit_product_review(%L, 5, 'x', 'http://x/y.jpg')$$, :'ord'), 'photo_invalide');
select public.submit_product_review(:'ord', 4, 'Très bon produit', 'https://exemple.supabase.co/storage/v1/object/public/covers/u/reviews/a.jpg');
select tests.raises('Un seul avis par produit', format($$select public.submit_product_review(%L, 5, 'bis', null)$$, :'ord'), 'avis_deja_envoye');
select tests.as_anon();
select tests.eq('Vue publique : note + photo + prénom', (select rating || '/' || (photo_url is not null) || '/' || reviewer_name from public.product_reviews_public where product_id = 'aaaaaaaa-0000-0000-0000-000000000003'), '4/true/Acheteur');
select tests.eq('Répartition : 1 avis à 4 étoiles', (select n::text from public.product_review_stats where product_id = 'aaaaaaaa-0000-0000-0000-000000000003' and rating = 4), '1');
select tests.raises('Anonyme ne lit pas review_extras', $$select * from public.review_extras$$, 'permission');
select tests.raises('Anonyme ne peut pas écrire dans order_tracking', $$insert into public.order_tracking (order_id, status) select id, 'delivered' from public.orders limit 1$$, 'permission');
select tests.as_service();
select tests.eq('Note produit mise à jour', (select rating_avg::text || '/' || rating_count from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000003'), '4.00/1');
select 'ÉCHECS: ' || tests.fail_count();
