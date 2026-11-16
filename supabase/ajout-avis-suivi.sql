-- =====================================================================
-- KDDF Market : AVIS CLIENTS (photo, ville) + SUIVI DE COMMANDE (4 étapes) + garantie
-- Script AUTONOME et idempotent : à exécuter UNE FOIS dans Supabase > SQL Editor (après schema.sql).
-- Il CRÉE seulement de nouvelles tables / vues / fonctions. Aucune table existante n'est modifiée
-- et la logique des portefeuilles (wallets) n'est pas touchée.
--
-- Note : la table "reviews" existe déjà (avis liés à une commande). Elle est réutilisée telle quelle ;
-- la photo de l'avis est stockée dans la NOUVELLE table review_extras.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. SUIVI DE COMMANDE : nouvelle table order_tracking (dates de chaque étape)
-- ---------------------------------------------------------------------
create table if not exists public.order_tracking (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null check (status in ('confirmed', 'shipped', 'ready_for_pickup', 'out_for_delivery', 'delivered')),
  updated_at timestamptz not null default now(),
  unique (order_id, status)
);
create index if not exists order_tracking_order_idx on public.order_tracking (order_id);

alter table public.order_tracking enable row level security;
drop policy if exists order_tracking_select on public.order_tracking;
create policy order_tracking_select on public.order_tracking for select
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid()))
  );
revoke insert, update, delete, truncate on public.order_tracking from anon, authenticated;
revoke all on public.order_tracking from anon;

-- Journal automatique : chaque changement de statut d'une commande est daté dans order_tracking.
-- Ne modifie jamais la commande et ne peut JAMAIS la bloquer (toute erreur est ignorée).
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status in ('confirmed', 'shipped', 'ready_for_pickup', 'delivered') then
      insert into public.order_tracking (order_id, status) values (new.id, new.status) on conflict (order_id, status) do nothing;
    end if;
  exception when others then
    null;
  end;
  return null;
end $$;
revoke execute on function public.log_order_status() from public, anon, authenticated;

drop trigger if exists orders_log_tracking on public.orders;
create trigger orders_log_tracking after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public.log_order_status();

-- Étape 3 « En cours de livraison » (n'existe pas dans les statuts de commande) : le vendeur la marque.
-- Elle n'a AUCUN effet sur l'argent : les fonds restent bloqués jusqu'à « Livrée ».
create or replace function public.seller_mark_out_for_delivery(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.seller_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.status <> 'shipped' or o.delivery_method not in ('delivery_douala', 'shipping_cameroon') then
    raise exception 'transition_invalide';
  end if;
  insert into public.order_tracking (order_id, status) values (o.id, 'out_for_delivery') on conflict (order_id, status) do nothing;
end $$;
revoke all on function public.seller_mark_out_for_delivery(uuid) from public, anon;
grant execute on function public.seller_mark_out_for_delivery(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- B. AVIS CLIENTS : photo de l'avis (nouvelle table) + vues publiques + répartition des notes
-- ---------------------------------------------------------------------
create table if not exists public.review_extras (
  review_id  uuid primary key references public.reviews(id) on delete cascade,
  photo_url  text check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500)),
  created_at timestamptz not null default now()
);
alter table public.review_extras enable row level security;
revoke all on public.review_extras from anon, authenticated;   -- lecture via la vue, écriture via la fonction

-- Avis affichés sur la page produit : prénom + ville, sans identifiant ni email.
create or replace view public.product_reviews_public as
  select r.id, r.product_id, r.rating, r.comment, r.created_at,
         coalesce(nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''), 'Client') as reviewer_name,
         nullif(trim(coalesce(pr.city, '')), '') as reviewer_city,
         pr.avatar_url as reviewer_avatar,
         x.photo_url
    from public.reviews r
    left join public.profiles pr on pr.id = r.buyer_id
    left join public.review_extras x on x.review_id = r.id;
grant select on public.product_reviews_public to anon, authenticated;

-- Nombre d'avis par note (pour la répartition 5 étoiles 70 %, 4 étoiles 20 %...)
create or replace view public.product_review_stats as
  select product_id, rating::int as rating, count(*)::bigint as n
    from public.reviews group by product_id, rating;
grant select on public.product_review_stats to anon, authenticated;

-- Publier un avis : acheteur du produit, commande payée ET livrée (produit digital : payé = livré).
-- Un client = un seul avis par produit.
create or replace function public.submit_product_review(p_order uuid, p_rating integer, p_comment text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o    public.orders%rowtype;
  v_id uuid;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.buyer_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.payment_status <> 'paid' or (o.delivery_method is not null and o.status <> 'delivered') then
    raise exception 'avis_non_autorise';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'note_invalide'; end if;
  if exists (select 1 from public.reviews where buyer_id = o.buyer_id and product_id = o.product_id) then
    raise exception 'avis_deja_envoye';
  end if;
  if p_photo is not null and (p_photo !~ '^https://' or char_length(p_photo) > 500) then raise exception 'photo_invalide'; end if;

  insert into public.reviews (order_id, product_id, seller_id, buyer_id, rating, comment)
  values (o.id, o.product_id, o.seller_id, o.buyer_id, p_rating, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
  returning id into v_id;

  if p_photo is not null then
    insert into public.review_extras (review_id, photo_url) values (v_id, p_photo);
  end if;

  update public.products p
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.product_id = p.id), 0),
         rating_count = (select count(*) from public.reviews r where r.product_id = p.id)
   where p.id = o.product_id;
end $$;
revoke all on function public.submit_product_review(uuid, integer, text, text) from public, anon;
grant execute on function public.submit_product_review(uuid, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
