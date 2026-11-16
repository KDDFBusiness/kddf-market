-- =====================================================================
-- KDDF MARKET — Schéma Supabase COMPLET (pour une base vide)
--
-- COMMENT L'UTILISER :
--   Supabase > SQL Editor > New query > collez TOUT ce fichier > Run.
--
-- RÈGLES :
--   * Tous les montants sont des ENTIERS en FCFA (XAF). Aucun nombre à virgule.
--   * Le script peut être relancé sans erreur et ne supprime aucune donnée.
--   * Le calcul de la répartition (plateforme / affilié / vendeur) est fait ICI,
--     côté base de données, dans la fonction confirm_fapshi_payment().
--     Il ne peut donc jamais être falsifié depuis le navigateur.
--
-- RÉPARTITION (appliquée sur le prix des articles, hors frais de livraison) :
--   AVEC affilié : plateforme 5 %  | affilié = % choisi par produit | vendeur = le reste
--   SANS affilié : plateforme 10 % | affilié 0                      | vendeur = le reste
--   Les frais de livraison reviennent entièrement au vendeur.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Code d'affiliation unique de 8 caractères (ex : 3FA9C21B)
create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end $$;


-- ---------------------------------------------------------------------
-- 1. PROFILES  (vendeurs, acheteurs, affiliés, admin : tout le monde)
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  store_name    text,
  store_slug    text unique,
  avatar_url    text,
  phone         text,
  country       text not null default 'CM',
  role          text not null default 'user' check (role in ('user', 'admin')),
  referral_code text not null unique default public.generate_referral_code(),
  created_at    timestamptz not null default now()
);

-- Nouvelles colonnes : contact vendeur (le numéro WhatsApp n'est JAMAIS public) et personnalisation de la boutique.
-- (phone = numéro d'appel)
alter table public.profiles add column if not exists whatsapp            text;
alter table public.profiles add column if not exists city                text;
alter table public.profiles add column if not exists shop_logo_url       text;
alter table public.profiles add column if not exists shop_banner_url     text;
alter table public.profiles add column if not exists shop_description    text;
alter table public.profiles add column if not exists shop_color          text not null default 'violet';
-- Couleur libre choisie par le vendeur (n'importe quelle couleur, au format #RRGGBB). Prioritaire sur shop_color.
alter table public.profiles add column if not exists shop_color_custom   text;
alter table public.profiles add column if not exists shop_theme          text not null default 'dark';
alter table public.profiles add column if not exists shop_sort           text not null default 'newest';
alter table public.profiles add column if not exists shop_show_whatsapp  boolean not null default true;

alter table public.profiles add column if not exists is_verified            boolean not null default false;  -- badge "Vendeur Vérifié" (donné par l'admin après vérification de la CNI)
alter table public.profiles add column if not exists is_blocked             boolean not null default false;  -- vendeur bloqué par l'admin
alter table public.profiles add column if not exists delivery_douala_price  bigint  not null default 1000;   -- prix de livraison à domicile à Douala (défaut de ses produits)
alter table public.profiles add column if not exists delivery_shipping_price bigint not null default 2500;   -- prix d'envoi par bus / expédition

create or replace function public.is_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_blocked from public.profiles where id = p_user), false);
$$;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_delivery_prices_chk') then
    alter table public.profiles add constraint profiles_delivery_prices_chk
      check (delivery_douala_price between 0 and 9999999 and delivery_shipping_price between 0 and 9999999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_color_chk') then
    alter table public.profiles add constraint profiles_shop_color_chk check (shop_color in ('noir', 'bleu', 'rouge', 'vert', 'orange', 'violet'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_color_custom_chk') then
    alter table public.profiles add constraint profiles_shop_color_custom_chk check (shop_color_custom is null or shop_color_custom ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_theme_chk') then
    alter table public.profiles add constraint profiles_shop_theme_chk check (shop_theme in ('light', 'dark'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_sort_chk') then
    alter table public.profiles add constraint profiles_shop_sort_chk check (shop_sort in ('newest', 'oldest', 'price_asc', 'price_desc', 'name'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_whatsapp_chk') then
    alter table public.profiles add constraint profiles_whatsapp_chk check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_shop_description_chk') then
    alter table public.profiles add constraint profiles_shop_description_chk check (shop_description is null or char_length(shop_description) <= 500);
  end if;
end $c$;

-- Vrai si l'utilisateur connecté est administrateur (vous).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


-- ---------------------------------------------------------------------
-- 2. WALLETS  (soldes internes : en attente / disponible)
-- ---------------------------------------------------------------------

create table if not exists public.wallets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.profiles(id) on delete cascade,
  balance_pending   bigint not null default 0 check (balance_pending >= 0),
  balance_available bigint not null default 0 check (balance_available >= 0),
  total_earned      bigint not null default 0,   -- total gagné depuis le début (en attente + disponible + retiré)
  total_withdrawn   bigint not null default 0,   -- total réellement retiré
  updated_at        timestamptz not null default now()
);
-- Commission de KDDF Market due sur les ventes payées en cash à la livraison : elle est prélevée sur le prochain retrait.
alter table public.wallets add column if not exists commission_due bigint not null default 0 check (commission_due >= 0);


-- ---------------------------------------------------------------------
-- 3. NOUVEL UTILISATEUR  => profil + portefeuille créés automatiquement
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_local text := split_part(coalesce(new.email, 'user'), '@', 1);
begin
  insert into public.profiles (id, full_name, store_slug)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), v_local),
    lower(regexp_replace(v_local, '[^a-zA-Z0-9]', '', 'g')) || substr(new.id::text, 1, 4)
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Utilisateurs déjà inscrits avant ce script : on leur crée profil + portefeuille.
insert into public.profiles (id, full_name, store_slug)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(coalesce(u.email, 'user'), '@', 1)),
       lower(regexp_replace(split_part(coalesce(u.email, 'user'), '@', 1), '[^a-zA-Z0-9]', '', 'g')) || substr(u.id::text, 1, 4)
from auth.users u
on conflict (id) do nothing;

insert into public.wallets (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------
-- 4. PRODUCTS  (produits digitaux ET physiques)
-- ---------------------------------------------------------------------

-- Vérifie le JSON des options de livraison d'un produit physique.
-- Format attendu :
-- {"pickup_douala":{"enabled":true,"price":0},
--  "delivery_douala":{"enabled":true,"price":1000},
--  "shipping_cameroon":{"enabled":false,"price":0}}
create or replace function public.valid_delivery_options(o jsonb)
returns boolean language plpgsql immutable as $$
declare
  k text;
  v_any boolean := false;
begin
  if o is null or jsonb_typeof(o) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(o) loop
    if k not in ('pickup_douala', 'delivery_douala', 'shipping_cameroon') then return false; end if;
    if jsonb_typeof(o -> k) <> 'object' then return false; end if;
    if jsonb_typeof(o -> k -> 'enabled') <> 'boolean' then return false; end if;
    if jsonb_typeof(o -> k -> 'price') <> 'number' then return false; end if;
    if (o -> k ->> 'price') !~ '^[0-9]{1,7}$' then return false; end if;           -- entier FCFA, 0 à 9 999 999
    if k = 'pickup_douala' and (o -> k ->> 'price')::int <> 0 then return false; end if;  -- retrait = gratuit
    if (o -> k ->> 'enabled')::boolean then v_any := true; end if;
  end loop;
  return v_any;                                                                       -- au moins une option active
end $$;

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references public.profiles(id) on delete cascade,
  product_type      text not null default 'digital' check (product_type in ('digital', 'physical')),
  -- sous-type d'un produit digital (obligatoire si digital, vide si physique)
  digital_kind      text check (digital_kind in ('file', 'course', 'license', 'bundle', 'coaching', 'service')),
  title             text not null check (char_length(title) between 2 and 150),
  slug              text not null,
  description       text,
  cover_url         text,
  price             bigint not null check (price >= 100),          -- FCFA entier (minimum Fapshi : 100)
  is_published      boolean not null default false,
  -- affiliation
  affiliate_enabled boolean not null default true,
  affiliate_percent integer not null default 30 check (affiliate_percent in (10, 20, 30, 40, 50)),
  -- spécifique digital (coaching / service)
  booking_url       text,
  duration_minutes  integer check (duration_minutes is null or duration_minutes > 0),
  delivery_notes    text,
  -- spécifique physique
  stock             integer check (stock is null or stock >= 0),
  images            text[] not null default '{}',
  weight            text,
  variant           text,
  delivery_options  jsonb,
  whatsapp_seller   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (seller_id, slug),
  constraint digital_needs_kind check (product_type <> 'digital' or digital_kind is not null),
  constraint digital_has_no_stock check (product_type <> 'digital' or stock is null),
  constraint physical_needs_fields check (
    product_type <> 'physical' or (
      stock is not null
      and cardinality(images) between 1 and 5
      and whatsapp_seller is not null
      and public.valid_delivery_options(delivery_options)
    )
  )
);

-- Recherche et confiance
alter table public.products add column if not exists category          text;
alter table public.products add column if not exists city              text;     -- ville du vendeur (copiée de son profil par un trigger)
alter table public.products add column if not exists rating_avg        numeric(3, 2) not null default 0;
alter table public.products add column if not exists rating_count      integer not null default 0;
-- Modération : les produits EXISTANTS sont approuvés ; les NOUVEAUX produits attendent la validation de l'admin.
alter table public.products add column if not exists moderation_status text not null default 'approved'
  check (moderation_status in ('pending', 'approved', 'rejected'));
alter table public.products add column if not exists moderation_note   text;
alter table public.products alter column moderation_status set default 'pending';
create index if not exists products_search_idx on public.products (is_published, moderation_status, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_seller_idx on public.products (seller_id);
create index if not exists products_published_idx on public.products (is_published, created_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Fichiers livrables d'un produit digital (PDF, ePub, vidéos...) — bucket privé "deliverables"
create table if not exists public.product_files (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists product_files_product_idx on public.product_files (product_id);

-- Offres groupées (bundles)
create table if not exists public.bundle_items (
  bundle_id  uuid not null references public.products(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (bundle_id, product_id),
  check (bundle_id <> product_id)
);


-- ---------------------------------------------------------------------
-- 5. ORDERS  (commandes)
-- ---------------------------------------------------------------------

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete restrict,
  seller_id          uuid not null references public.profiles(id) on delete restrict,
  buyer_id           uuid references public.profiles(id) on delete set null,   -- vide = achat digital sans compte
  buyer_email        text not null,
  buyer_name         text,
  affiliate_id       uuid references public.profiles(id) on delete set null,   -- affilié lié à la commande
  affiliate_percent  integer,                                                  -- % figé au moment de la commande
  quantity           integer not null default 1 check (quantity between 1 and 50),
  unit_price         bigint not null check (unit_price >= 100),
  delivery_method    text check (delivery_method in ('pickup_douala', 'delivery_douala', 'shipping_cameroon')),
  delivery_price     bigint not null default 0 check (delivery_price >= 0),
  total_price        bigint not null check (total_price >= 100),
  delivery_address   text,
  phone              text,
  -- Suivi de la commande : pending=En attente, confirmed=Confirmée, shipped=Expédiée,
  -- ready_for_pickup=Prête pour retrait, delivered=Livrée, cancelled=Annulée
  status             text not null default 'pending'
                       check (status in ('pending', 'confirmed', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled')),
  payment_status     text not null default 'pending'
                       check (payment_status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  download_token     uuid not null default gen_random_uuid() unique,
  buyer_confirmed_at timestamptz,
  delivered_at       timestamptz,
  disputed           boolean not null default false,
  dispute_reason     text,
  disputed_at        timestamptz,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  constraint total_is_consistent check (total_price = unit_price * quantity + delivery_price),
  constraint delivery_needs_contact check (
    delivery_method is null
    or (phone is not null and (delivery_method = 'pickup_douala' or delivery_address is not null))
  )
);
create index if not exists orders_seller_idx on public.orders (seller_id, payment_status, created_at desc);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_buyer_email_idx on public.orders (lower(buyer_email));
create index if not exists orders_product_idx on public.orders (product_id);
-- online = payé en ligne via Fapshi (Orange Money / MTN MoMo) ; cod = paiement cash à la livraison (produits physiques seulement)
alter table public.orders add column if not exists payment_method text not null default 'online' check (payment_method in ('online', 'cod'));

-- Clés de licence (produits digitaux de type "license")
create table if not exists public.license_keys (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  key         text not null,
  order_id    uuid references public.orders(id) on delete set null,
  assigned_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (product_id, key)
);
create index if not exists license_keys_free_idx on public.license_keys (product_id) where order_id is null;


-- ---------------------------------------------------------------------
-- 6. TRANSACTIONS  (paiement Fapshi + répartition de chaque vente)
-- ---------------------------------------------------------------------

create table if not exists public.transactions (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references public.orders(id) on delete cascade,
  product_id            uuid not null references public.products(id) on delete restrict,
  buyer_id              uuid references public.profiles(id) on delete set null,
  seller_id             uuid not null references public.profiles(id) on delete restrict,
  affiliate_id          uuid references public.profiles(id) on delete set null,   -- rempli à la confirmation, seulement s'il y a un affilié
  -- Répartition (rempli quand le paiement est confirmé). Total = plateforme + affilié + vendeur.
  total_amount          bigint not null check (total_amount >= 100),
  goods_amount          bigint,                 -- base de calcul des commissions (articles, sans livraison)
  platform_fee          bigint,
  platform_fee_percent  integer,
  affiliate_fee         bigint,
  affiliate_fee_percent integer,
  seller_amount         bigint,
  -- pending=en attente de paiement, paid=payée, failed=échec, expired=lien expiré,
  -- refunded=remboursée, review=payée mais à traiter à la main (stock épuisé, montant différent...)
  status                text not null default 'pending'
                          check (status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'review')),
  review_reason         text,
  -- Fapshi
  fapshi_trans_id       text unique,
  fapshi_link           text,
  fapshi_status         text,                   -- CREATED / PENDING / SUCCESSFUL / FAILED / EXPIRED
  fapshi_medium         text,                   -- mobile money / orange money
  fapshi_revenue        bigint,                 -- montant reçu par vous après les frais Fapshi
  last_checked_at       timestamptz,
  -- Libération des fonds (en attente -> disponible)
  release_at            timestamptz,
  released_at           timestamptz,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  constraint split_is_sane check (
    platform_fee is null
    or (platform_fee >= 0 and affiliate_fee >= 0 and seller_amount >= 0)
  ),
  -- Garantie finale : une transaction payée doit TOUJOURS se répartir exactement sur le total.
  constraint paid_split_is_exact check (
    status <> 'paid'
    or (
      platform_fee is not null and affiliate_fee is not null and seller_amount is not null
      and total_amount = platform_fee + affiliate_fee + seller_amount
    )
  )
);
create index if not exists transactions_seller_idx on public.transactions (seller_id, created_at desc);
create index if not exists transactions_affiliate_idx on public.transactions (affiliate_id) where affiliate_id is not null;
create index if not exists transactions_status_idx on public.transactions (status, created_at);
create index if not exists transactions_release_idx on public.transactions (release_at) where status = 'paid' and released_at is null;

-- Journal brut des réponses Fapshi (audit). Réservé à l'admin : contient des données clients.
create table if not exists public.payment_events (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  source         text not null,                 -- webhook / verification
  payload        jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists payment_events_tx_idx on public.payment_events (transaction_id);


-- ---------------------------------------------------------------------
-- 7. AFFILIATION  (un lien unique par utilisateur : ?ref=CODE)
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  code       text not null,                     -- = profiles.referral_code de l'affilié
  clicks     integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists affiliate_links_product_idx on public.affiliate_links (product_id);


-- ---------------------------------------------------------------------
-- 8. WITHDRAWALS  (demandes de retrait des vendeurs et affiliés)
-- ---------------------------------------------------------------------

create table if not exists public.withdrawals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete restrict,
  amount       bigint not null check (amount > 0),
  method       text not null check (method in ('mtn_momo', 'orange_money', 'fapshi')),
  phone_number text not null,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  note         text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null
);
-- Retraits universels : Mobile Money (MTN, Orange, Wave, Moov, M-Pesa), virement bancaire, crypto (USDT/BTC), PayPal.
-- La colonne phone_number contient la « destination » : numéro, IBAN/compte, adresse crypto ou email PayPal.
alter table public.withdrawals drop constraint if exists withdrawals_method_check;
alter table public.withdrawals add constraint withdrawals_method_check
  check (method in ('mtn_momo', 'orange_money', 'fapshi', 'wave', 'moov_money', 'mpesa', 'bank_transfer', 'crypto_usdt', 'crypto_btc', 'paypal'));
alter table public.withdrawals add column if not exists commission_deducted bigint not null default 0 check (commission_deducted >= 0);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create index if not exists withdrawals_status_idx on public.withdrawals (status, created_at);


-- ---------------------------------------------------------------------
-- 9. STATISTIQUES (visites des pages produit, pour le taux de conversion)
-- ---------------------------------------------------------------------

create table if not exists public.product_views (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists product_views_idx on public.product_views (product_id, created_at);


-- =====================================================================
-- 10. SÉCURITÉ : ROW LEVEL SECURITY (RLS)
--     Règle générale : le navigateur ne peut JAMAIS écrire dans orders,
--     transactions, wallets, withdrawals. Tout passe par les fonctions
--     sécurisées plus bas ou par le serveur (clé service_role).
-- =====================================================================

alter table public.profiles        enable row level security;
alter table public.wallets         enable row level security;
alter table public.products        enable row level security;
alter table public.product_files   enable row level security;
alter table public.bundle_items    enable row level security;
alter table public.orders          enable row level security;
alter table public.license_keys    enable row level security;
alter table public.transactions    enable row level security;
alter table public.payment_events  enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.withdrawals     enable row level security;
alter table public.product_views   enable row level security;

-- Profils : chacun voit le sien (téléphone, code...). L'admin voit tout.
-- Le public voit seulement la vue "public_profiles" (nom de boutique, sans téléphone).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Un utilisateur ne peut modifier QUE ces colonnes (impossible de se donner le rôle admin).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, store_name, store_slug, avatar_url, phone, country, whatsapp, city,
              shop_logo_url, shop_banner_url, shop_description, shop_color, shop_color_custom, shop_theme, shop_sort, shop_show_whatsapp,
              delivery_douala_price, delivery_shipping_price)
  on public.profiles to authenticated;

create or replace view public.public_profiles as
  select id, full_name, store_name, store_slug, avatar_url,
         shop_logo_url, shop_banner_url, shop_description, shop_color, shop_theme, shop_sort, shop_show_whatsapp, city,
         is_verified, shop_color_custom
    from public.profiles
   where not is_blocked;
grant select on public.public_profiles to anon, authenticated;

-- Portefeuilles : lecture de son propre solde uniquement.
drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets for select
  using (user_id = auth.uid() or public.is_admin());

-- Produits
drop policy if exists products_select on public.products;
create policy products_select on public.products for select
  using ((is_published and moderation_status = 'approved') or seller_id = auth.uid() or public.is_admin());
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert
  with check (seller_id = auth.uid() and not public.is_blocked(auth.uid()));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update
  using (seller_id = auth.uid()) with check (seller_id = auth.uid() and not public.is_blocked(auth.uid()));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete
  using (seller_id = auth.uid());

-- Fichiers livrables et clés : visibles uniquement par le vendeur du produit.
-- (L'acheteur y accède via l'API serveur, après vérification du paiement.)
drop policy if exists product_files_owner on public.product_files;
create policy product_files_owner on public.product_files for all
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));

drop policy if exists license_keys_owner on public.license_keys;
create policy license_keys_owner on public.license_keys for all
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));

drop policy if exists bundle_items_select on public.bundle_items;
create policy bundle_items_select on public.bundle_items for select using (true);
drop policy if exists bundle_items_owner on public.bundle_items;
create policy bundle_items_owner on public.bundle_items for all
  using (exists (select 1 from public.products p where p.id = bundle_id and p.seller_id = auth.uid()))
  with check (
    exists (select 1 from public.products p where p.id = bundle_id and p.seller_id = auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
  );

-- Commandes : l'acheteur voit les siennes ; le vendeur voit les commandes PAYÉES qui le concernent.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (
    buyer_id = auth.uid()
    or (seller_id = auth.uid() and (payment_status = 'paid' or (payment_method = 'cod' and status <> 'cancelled')))
    or public.is_admin()
  );

-- Transactions : le vendeur voit les siennes, l'admin voit tout.
-- L'affilié passe par la vue "affiliate_sales" (il ne voit que SA commission).
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select
  using ((seller_id = auth.uid() and status in ('paid', 'refunded', 'review')) or public.is_admin());

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select on public.payment_events for select
  using (public.is_admin());

-- Liens d'affiliation : l'affilié voit les siens ; le vendeur voit ceux de ses produits.
drop policy if exists affiliate_links_select on public.affiliate_links;
create policy affiliate_links_select on public.affiliate_links for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
    or public.is_admin()
  );

-- Retraits : chacun voit les siens ; l'admin voit tout.
drop policy if exists withdrawals_select on public.withdrawals;
create policy withdrawals_select on public.withdrawals for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists product_views_select on public.product_views;
create policy product_views_select on public.product_views for select
  using (
    exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
    or public.is_admin()
  );

-- Défense en plus des règles RLS : aucune écriture directe depuis le navigateur.
revoke insert, update, delete, truncate on
  public.wallets, public.orders, public.transactions, public.payment_events,
  public.affiliate_links, public.withdrawals, public.product_views
  from anon, authenticated;

-- Les visiteurs non connectés ne doivent voir aucune de ces tables.
revoke all on
  public.wallets, public.orders, public.transactions, public.payment_events,
  public.affiliate_links, public.withdrawals, public.product_views,
  public.product_files, public.license_keys
  from anon;


-- =====================================================================
-- 11. RÉPARTITION DES REVENUS (le cœur du système)
-- =====================================================================

-- Calcule la part de la plateforme et de l'affilié. ENTIERS uniquement :
-- la division entière arrondit à l'entier inférieur (en faveur du vendeur, qui reçoit le reste).
--   avec affilié : plateforme 5 %  + affilié p_affiliate_percent %
--   sans affilié : plateforme 10 % + affilié 0
create or replace function public.compute_split(p_goods bigint, p_has_affiliate boolean, p_affiliate_percent integer)
returns table (platform_percent integer, platform_fee bigint, affiliate_percent integer, affiliate_fee bigint)
language sql immutable as $$
  select
    case when p_has_affiliate then 5 else 10 end,
    (p_goods * case when p_has_affiliate then 5 else 10 end) / 100,
    case when p_has_affiliate then p_affiliate_percent else 0 end,
    case when p_has_affiliate then (p_goods * p_affiliate_percent) / 100 else 0 end;
$$;


-- Même calcul, avec le cas "produit physique SANS affilié" : plateforme 8 % (au lieu de 10 %).
--   digital  : avec affilié 5 % + X % / sans affilié 10 %
--   physique : avec affilié 5 % + X % / sans affilié 8 %   (ex : 15 000 -> KDDF 1 200, vendeur 13 800)
create or replace function public.compute_split_for(p_goods bigint, p_has_affiliate boolean, p_affiliate_percent integer, p_physical boolean)
returns table (platform_percent integer, platform_fee bigint, affiliate_percent integer, affiliate_fee bigint)
language sql immutable as $$
  select
    case when p_has_affiliate then 5 when p_physical then 8 else 10 end,
    (p_goods * case when p_has_affiliate then 5 when p_physical then 8 else 10 end) / 100,
    case when p_has_affiliate then p_affiliate_percent else 0 end,
    case when p_has_affiliate then (p_goods * p_affiliate_percent) / 100 else 0 end;
$$;


-- =====================================================================
-- 12. FONCTIONS APPELÉES PAR LE SERVEUR (service_role uniquement)
-- =====================================================================

-- Crée la commande + la transaction (en attente) pour un achat.
-- Le prix, le stock et les frais de livraison sont relus ICI dans la base :
-- on ne fait jamais confiance au navigateur.
drop function if exists public.create_checkout_order(uuid, uuid, text, text, integer, text, text, text, text);
create or replace function public.create_checkout_order(
  p_product_id      uuid,
  p_buyer_id        uuid,
  p_email           text,
  p_name            text,
  p_quantity        integer,
  p_delivery_method text,
  p_address         text,
  p_phone           text,
  p_ref_code        text,
  p_payment_method  text default 'online'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p            public.products%rowtype;
  v_qty        integer := coalesce(p_quantity, 1);
  v_delivery   bigint := 0;
  v_aff_id     uuid;
  v_aff_pct    integer;
  v_total      bigint;
  v_order_id   uuid;
  v_token      uuid;
  v_tx_id      uuid;
begin
  select * into p from public.products where id = p_product_id and is_published and moderation_status = 'approved';
  if not found then raise exception 'produit_introuvable'; end if;
  if public.is_blocked(p.seller_id) then raise exception 'vendeur_bloque'; end if;

  p_payment_method := coalesce(p_payment_method, 'online');
  if p_payment_method not in ('online', 'cod') then raise exception 'paiement_invalide'; end if;
  -- Le paiement à la livraison est INTERDIT pour les produits digitaux (livrés tout de suite).
  if p_payment_method = 'cod' and p.product_type <> 'physical' then raise exception 'cod_interdit_digital'; end if;

  if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalide';
  end if;

  if p.product_type = 'digital' then
    v_qty := 1;
    p_delivery_method := null;
    p_address := null;
    p_phone := null;
  else
    if p_buyer_id is null then raise exception 'connexion_requise'; end if;
    if v_qty < 1 or v_qty > 50 then raise exception 'quantite_invalide'; end if;
    if p.stock is null or p.stock < v_qty then raise exception 'stock_insuffisant'; end if;
    if p_delivery_method is null
       or coalesce((p.delivery_options -> p_delivery_method ->> 'enabled')::boolean, false) is not true then
      raise exception 'livraison_invalide';
    end if;
    v_delivery := (p.delivery_options -> p_delivery_method ->> 'price')::bigint;
    if p_phone is null or char_length(trim(p_phone)) < 8 then raise exception 'telephone_invalide'; end if;
    if p_delivery_method <> 'pickup_douala' and char_length(trim(coalesce(p_address, ''))) < 5 then
      raise exception 'adresse_invalide';
    end if;
  end if;

  -- Affilié : code valide, produit ouvert à l'affiliation, ni le vendeur lui-même, ni l'acheteur lui-même.
  -- (pas d'affiliation sur un paiement à la livraison : la commission est prélevée sur le retrait du vendeur)
  if p_ref_code is not null and p.affiliate_enabled and p_payment_method = 'online' then
    select id into v_aff_id from public.profiles where referral_code = upper(trim(p_ref_code));
    if v_aff_id is not null and (v_aff_id = p.seller_id or v_aff_id is not distinct from p_buyer_id) then
      v_aff_id := null;
    end if;
    if v_aff_id is not null then v_aff_pct := p.affiliate_percent; end if;
  end if;

  v_total := p.price * v_qty + v_delivery;

  insert into public.orders (
    product_id, seller_id, buyer_id, buyer_email, buyer_name, affiliate_id, affiliate_percent,
    quantity, unit_price, delivery_method, delivery_price, total_price, delivery_address, phone, payment_method
  ) values (
    p.id, p.seller_id, p_buyer_id, lower(trim(p_email)), nullif(trim(coalesce(p_name, '')), ''), v_aff_id, v_aff_pct,
    v_qty, p.price, p_delivery_method, v_delivery, v_total, nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), p_payment_method
  ) returning id, download_token into v_order_id, v_token;

  -- Cash à la livraison : le stock est réservé tout de suite (il n'y a pas de confirmation de paiement en ligne).
  if p_payment_method = 'cod' then
    update public.products set stock = stock - v_qty where id = p.id and stock >= v_qty;
    if not found then raise exception 'stock_insuffisant'; end if;
  end if;

  insert into public.transactions (order_id, product_id, buyer_id, seller_id, total_amount)
  values (v_order_id, p.id, p_buyer_id, p.seller_id, v_total)
  returning id into v_tx_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'transaction_id', v_tx_id,
    'download_token', v_token,
    'total', v_total,
    'title', p.title,
    'product_type', p.product_type,
    'payment_method', p_payment_method
  );
end $$;


-- Confirme un paiement Fapshi (appelée par le webhook, APRÈS vérification auprès de Fapshi).
-- Tout se passe dans UNE seule transaction SQL : tout réussit ou rien ne change.
-- Idempotente : si Fapshi rejoue le webhook, rien n'est crédité deux fois.
create or replace function public.confirm_fapshi_payment(
  p_trans_id text,
  p_amount   bigint,
  p_medium   text,
  p_revenue  bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t            public.transactions%rowtype;
  o            public.orders%rowtype;
  p            public.products%rowtype;
  s            record;
  v_review     text;
  v_key        text;
  v_goods      bigint;
  v_has_aff    boolean;
  v_seller_amt bigint;
  v_digital    boolean;
begin
  select * into t from public.transactions where fapshi_trans_id = p_trans_id for update;
  if not found then raise exception 'transaction_inconnue'; end if;

  -- Déjà traitée : on ne fait rien (protection contre les webhooks rejoués).
  if t.status in ('paid', 'review', 'refunded') then
    return jsonb_build_object('status', 'already', 'order_id', t.order_id);
  end if;

  select * into o from public.orders where id = t.order_id for update;
  select * into p from public.products where id = o.product_id for update;
  v_digital := (p.product_type = 'digital');

  -- Contrôle 1 : le montant payé doit être EXACTEMENT celui de la commande.
  if p_amount is distinct from t.total_amount then
    v_review := 'montant_different';
  -- Contrôle 2 : stock (physique) ou clé de licence (digital) encore disponible.
  elsif not v_digital then
    update public.products set stock = stock - o.quantity where id = p.id and stock >= o.quantity;
    if not found then v_review := 'stock_insuffisant'; end if;
  elsif p.digital_kind = 'license' then
    select key into v_key from public.license_keys
      where product_id = p.id and order_id is null
      order by created_at, id limit 1 for update skip locked;
    if v_key is null then
      v_review := 'licence_epuisee';
    else
      update public.license_keys set order_id = o.id, assigned_at = now()
        where product_id = p.id and key = v_key;
    end if;
  end if;

  -- Paiement reçu mais impossible de livrer automatiquement : on garde la trace,
  -- on NE crédite PERSONNE, et l'admin traite le cas (remboursement manuel).
  if v_review is not null then
    update public.transactions
       set status = 'review', review_reason = v_review, fapshi_status = 'SUCCESSFUL',
           fapshi_medium = p_medium, fapshi_revenue = p_revenue, paid_at = now()
     where id = t.id;
    update public.orders set payment_status = 'paid', status = 'cancelled', paid_at = now() where id = o.id;
    return jsonb_build_object('status', 'review', 'reason', v_review, 'order_id', o.id);
  end if;

  -- Répartition (entiers FCFA) sur le prix des articles ; la livraison reste au vendeur.
  v_goods   := o.unit_price * o.quantity;
  v_has_aff := o.affiliate_id is not null and o.affiliate_id <> o.seller_id and o.affiliate_percent is not null;
  select * into s from public.compute_split_for(v_goods, v_has_aff, o.affiliate_percent, not v_digital);
  v_seller_amt := t.total_amount - s.platform_fee - s.affiliate_fee;
  if v_seller_amt < 0 then raise exception 'repartition_invalide'; end if;

  update public.transactions
     set status = 'paid',
         paid_at = now(),
         fapshi_status = 'SUCCESSFUL',
         fapshi_medium = p_medium,
         fapshi_revenue = p_revenue,
         affiliate_id = case when v_has_aff then o.affiliate_id else null end,
         goods_amount = v_goods,
         platform_fee = s.platform_fee,
         platform_fee_percent = s.platform_percent,
         affiliate_fee = s.affiliate_fee,
         affiliate_fee_percent = s.affiliate_percent,
         seller_amount = v_seller_amt,
         -- digital : fonds libérés après 24 h ; physique : libérés à la livraison (voir plus bas)
         release_at = case when v_digital then now() + interval '24 hours' else null end
   where id = t.id;

  update public.orders
     set payment_status = 'paid',
         paid_at = now(),
         status = case when v_digital then 'delivered' else 'pending' end,
         delivered_at = case when v_digital then now() else null end
   where id = o.id;

  -- Soldes "en attente" du vendeur et de l'affilié
  insert into public.wallets (user_id, balance_pending, total_earned)
  values (o.seller_id, v_seller_amt, v_seller_amt)
  on conflict (user_id) do update
    set balance_pending = public.wallets.balance_pending + excluded.balance_pending,
        total_earned    = public.wallets.total_earned + excluded.total_earned,
        updated_at      = now();

  if v_has_aff and s.affiliate_fee > 0 then
    insert into public.wallets (user_id, balance_pending, total_earned)
    values (o.affiliate_id, s.affiliate_fee, s.affiliate_fee)
    on conflict (user_id) do update
      set balance_pending = public.wallets.balance_pending + excluded.balance_pending,
          total_earned    = public.wallets.total_earned + excluded.total_earned,
          updated_at      = now();
  end if;

  return jsonb_build_object(
    'status', 'paid',
    'order_id', o.id,
    'buyer_email', o.buyer_email,
    'buyer_name', o.buyer_name,
    'product_title', p.title,
    'product_type', p.product_type,
    'download_token', o.download_token,
    'license_key', v_key,
    'total', t.total_amount,
    'platform_fee', s.platform_fee,
    'affiliate_fee', s.affiliate_fee,
    'seller_amount', v_seller_amt
  );
end $$;


-- Échec ou expiration d'un paiement Fapshi.
-- FAILED : le client peut réessayer sur le même lien pendant 24 h -> la transaction reste utilisable.
create or replace function public.mark_fapshi_failed(p_trans_id text, p_fapshi_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
begin
  select * into t from public.transactions where fapshi_trans_id = p_trans_id for update;
  if not found or t.status not in ('pending', 'failed') then return; end if;

  if p_fapshi_status = 'EXPIRED' then
    update public.transactions set status = 'expired', fapshi_status = 'EXPIRED' where id = t.id;
    update public.orders set payment_status = 'expired' where id = t.order_id and payment_status <> 'paid';
  else
    update public.transactions set status = 'failed', fapshi_status = coalesce(p_fapshi_status, 'FAILED') where id = t.id;
    update public.orders set payment_status = 'failed' where id = t.order_id and payment_status <> 'paid';
  end if;
end $$;


-- Compte un clic sur un lien d'affiliation (ignore les clics du vendeur ou de l'affilié lui-même).
create or replace function public.record_affiliate_click(p_code text, p_product_id uuid, p_viewer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_aff uuid;
  v_seller uuid;
begin
  select id into v_aff from public.profiles where referral_code = upper(trim(p_code));
  select seller_id into v_seller from public.products where id = p_product_id and is_published and affiliate_enabled;
  if v_aff is null or v_seller is null or v_aff = v_seller or v_aff is not distinct from p_viewer then return; end if;

  insert into public.affiliate_links (user_id, product_id, code, clicks)
  values (v_aff, p_product_id, upper(trim(p_code)), 1)
  on conflict (user_id, product_id) do update set clicks = public.affiliate_links.clicks + 1;
end $$;


-- Libère les fonds arrivés à échéance : "en attente" -> "disponible".
--   digital  : 24 h après le paiement
--   physique : dès que le vendeur a marqué "Livrée" ET que l'acheteur a confirmé,
--              OU 3 jours après "Livrée" sans litige.
--              (dès que l'acheteur clique "J'ai reçu mon produit", les fonds sont libérés immédiatement)
-- Appelée chaque jour par la tâche planifiée, et aussi à l'ouverture des portefeuilles.
create or replace function public.release_due_funds(p_user uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select tr.id, tr.seller_id, tr.seller_amount, tr.affiliate_id, tr.affiliate_fee
      from public.transactions tr
      join public.orders od on od.id = tr.order_id
     where tr.status = 'paid'
       and tr.released_at is null
       and tr.release_at is not null
       and tr.release_at <= now()
       and od.disputed = false
       and (p_user is null or tr.seller_id = p_user or tr.affiliate_id = p_user)
     order by tr.release_at
       for update of tr skip locked
  loop
    update public.wallets
       set balance_pending = balance_pending - t.seller_amount,
           balance_available = balance_available + t.seller_amount,
           updated_at = now()
     where user_id = t.seller_id;

    if t.affiliate_id is not null and t.affiliate_fee > 0 then
      update public.wallets
         set balance_pending = balance_pending - t.affiliate_fee,
             balance_available = balance_available + t.affiliate_fee,
             updated_at = now()
       where user_id = t.affiliate_id;
    end if;

    update public.transactions set released_at = now() where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;


-- =====================================================================
-- 13. FONCTIONS APPELÉES PAR LES UTILISATEURS CONNECTÉS
-- =====================================================================

-- Libère les fonds dus de l'utilisateur connecté (appelée à l'ouverture de son portefeuille).
create or replace function public.release_my_funds()
returns integer language sql security definer set search_path = public as $$
  select public.release_due_funds(auth.uid());
$$;

-- Le vendeur fait avancer sa commande physique :
-- En attente -> Confirmée -> Expédiée (ou Prête pour retrait) -> Livrée
create or replace function public.seller_update_order_status(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.seller_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  -- Commande payée en ligne, OU commande en paiement à la livraison pas encore encaissée.
  if o.delivery_method is null or not (o.payment_status = 'paid' or (o.payment_method = 'cod' and o.payment_status = 'pending' and o.status <> 'cancelled')) then
    raise exception 'commande_invalide';
  end if;
  -- Cash : "Livrée" passe uniquement par seller_confirm_cash (encaissement du cash + commission).
  if o.payment_method = 'cod' and o.payment_status = 'pending' and p_status = 'delivered' then raise exception 'encaissement_requis'; end if;

  if not (
       (o.status = 'pending'   and p_status = 'confirmed')
    or (o.status = 'confirmed' and p_status = 'shipped'          and o.delivery_method in ('delivery_douala', 'shipping_cameroon'))
    or (o.status = 'confirmed' and p_status = 'ready_for_pickup' and o.delivery_method = 'pickup_douala')
    or (o.status in ('shipped', 'ready_for_pickup') and p_status = 'delivered')
  ) then
    raise exception 'transition_invalide';
  end if;

  update public.orders
     set status = p_status,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end
   where id = o.id;

  if p_status = 'delivered' then
    -- Acheteur déjà confirmé => fonds libérés tout de suite ; sinon dans 3 jours (sans litige).
    update public.transactions
       set release_at = case when o.buyer_confirmed_at is not null then now() else now() + interval '3 days' end
     where order_id = o.id and status = 'paid' and released_at is null;
  end if;
end $$;

-- L'acheteur confirme avoir reçu sa commande.
create or replace function public.buyer_confirm_delivery(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.buyer_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.payment_status <> 'paid' or o.delivery_method is null
     or o.status not in ('shipped', 'ready_for_pickup', 'delivered') then
    raise exception 'commande_invalide';
  end if;
  if o.buyer_confirmed_at is not null then return; end if;

  -- "J'ai reçu mon produit" : la commande est livrée et les fonds du vendeur sont libérés tout de suite
  -- (sauf litige ouvert : l'admin tranche d'abord).
  update public.orders
     set buyer_confirmed_at = now(), status = 'delivered', delivered_at = coalesce(delivered_at, now())
   where id = o.id;

  update public.transactions set release_at = now()
   where order_id = o.id and status = 'paid' and released_at is null;
end $$;

-- L'acheteur signale un problème : les fonds restent bloqués jusqu'à décision de l'admin.
create or replace function public.buyer_open_dispute(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  v_released timestamptz;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.buyer_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.payment_status <> 'paid' or o.delivery_method is null then raise exception 'commande_invalide'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 or char_length(p_reason) > 500 then
    raise exception 'motif_invalide';
  end if;
  select released_at into v_released from public.transactions where order_id = o.id;
  if v_released is not null then raise exception 'fonds_deja_liberes'; end if;

  update public.orders
     set disputed = true, disputed_at = now(), dispute_reason = trim(p_reason)
   where id = o.id;
end $$;

-- Demande de retrait : le montant est bloqué immédiatement (impossible de le demander deux fois).
-- L'argent n'est PAS envoyé automatiquement : vous validez et payez à la main depuis votre dashboard admin.
create or replace function public.request_withdrawal(p_amount bigint, p_method text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_deduct bigint := 0;
begin
  if v_uid is null then raise exception 'connexion_requise'; end if;
  if p_method is null or p_method not in ('mtn_momo', 'orange_money', 'wave', 'moov_money', 'mpesa', 'bank_transfer', 'crypto_usdt', 'crypto_btc', 'paypal') then raise exception 'methode_invalide'; end if;
  if public.is_blocked(v_uid) then raise exception 'compte_bloque'; end if;
  if p_amount is null or p_amount < 1000 then raise exception 'montant_minimum'; end if;   -- minimum de retrait : 1 000 FCFA
  -- Destination selon le moyen choisi
  if p_method in ('mtn_momo', 'orange_money', 'wave', 'moov_money', 'mpesa') then
    if p_phone is null or p_phone !~ '^\+?[0-9]{8,15}$' then raise exception 'telephone_invalide'; end if;
  elsif p_method = 'paypal' then
    if p_phone is null or p_phone !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_phone) > 254 then raise exception 'destination_invalide'; end if;
  elsif p_method in ('crypto_usdt', 'crypto_btc') then
    if p_phone is null or p_phone !~ '^[A-Za-z0-9:_-]{20,120}$' then raise exception 'destination_invalide'; end if;
  else  -- bank_transfer : IBAN / numéro de compte + nom de la banque (texte libre court)
    if p_phone is null or length(btrim(p_phone)) < 8 or length(p_phone) > 120 then raise exception 'destination_invalide'; end if;
  end if;

  perform public.release_due_funds(v_uid);

  update public.wallets
     set balance_available = balance_available - p_amount, updated_at = now()
   where user_id = v_uid and balance_available >= p_amount;
  if not found then raise exception 'solde_insuffisant'; end if;

  -- Commission due sur les ventes payées en cash à la livraison : prélevée sur CE retrait.
  select least(commission_due, p_amount) into v_deduct from public.wallets where user_id = v_uid;
  update public.wallets set commission_due = commission_due - v_deduct where user_id = v_uid;

  insert into public.withdrawals (user_id, amount, method, phone_number, commission_deducted)
  values (v_uid, p_amount, p_method, p_phone, v_deduct)
  returning id into v_id;
  return v_id;
end $$;


-- =====================================================================
-- 14. FONCTIONS ADMIN (vérifient que l'appelant est admin)
-- =====================================================================

-- Valide un retrait : 'paid' (vous avez envoyé l'argent) ou 'failed' (refusé : le solde est rendu).
create or replace function public.admin_process_withdrawal(p_id uuid, p_result text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  w public.withdrawals%rowtype;
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  if p_result not in ('paid', 'failed') then raise exception 'resultat_invalide'; end if;

  select * into w from public.withdrawals where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'retrait_deja_traite'; end if;

  if p_result = 'paid' then
    update public.wallets set total_withdrawn = total_withdrawn + w.amount, updated_at = now() where user_id = w.user_id;
  else
    -- Refusé : le solde est rendu, et la commission cash qui devait être prélevée redevient due.
    update public.wallets
       set balance_available = balance_available + w.amount, commission_due = commission_due + w.commission_deducted, updated_at = now()
     where user_id = w.user_id;
  end if;

  update public.withdrawals
     set status = p_result, note = p_note, processed_at = now(), processed_by = auth.uid()
   where id = w.id;
end $$;

-- Rembourse une transaction dont les fonds ne sont pas encore libérés.
-- (Le remboursement réel au client se fait à la main depuis votre compte Fapshi.)
create or replace function public.admin_refund_transaction(p_transaction uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.transactions%rowtype;
  o public.orders%rowtype;
  p public.products%rowtype;
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;

  select * into t from public.transactions where id = p_transaction for update;
  if not found or t.status not in ('paid', 'review') then raise exception 'transaction_invalide'; end if;
  if t.released_at is not null then raise exception 'fonds_deja_liberes'; end if;

  select * into o from public.orders where id = t.order_id for update;
  select * into p from public.products where id = t.product_id for update;

  if t.status = 'paid' then
    -- on retire les montants "en attente" du vendeur et de l'affilié
    update public.wallets
       set balance_pending = balance_pending - t.seller_amount,
           total_earned = total_earned - t.seller_amount, updated_at = now()
     where user_id = t.seller_id;
    if t.affiliate_id is not null and t.affiliate_fee > 0 then
      update public.wallets
         set balance_pending = balance_pending - t.affiliate_fee,
             total_earned = total_earned - t.affiliate_fee, updated_at = now()
       where user_id = t.affiliate_id;
    end if;
    -- on remet le stock / la clé de licence
    if p.product_type = 'physical' then
      update public.products set stock = stock + o.quantity where id = p.id;
    end if;
    update public.license_keys set order_id = null, assigned_at = null where order_id = o.id;
  end if;

  update public.transactions
     set status = 'refunded', review_reason = coalesce(p_note, review_reason)
   where id = t.id;
  update public.orders set payment_status = 'refunded', status = 'cancelled', disputed = false where id = o.id;
end $$;

-- Litige tranché en faveur du vendeur : on lève le blocage (les fonds se libèrent à l'échéance prévue).
create or replace function public.admin_resolve_dispute(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or not o.disputed then raise exception 'commande_invalide'; end if;

  update public.orders set disputed = false where id = o.id;
  if o.status = 'delivered' then
    update public.transactions set release_at = now()
     where order_id = o.id and status = 'paid' and released_at is null;
  end if;
end $$;


-- =====================================================================
-- 15. VUES (tableaux de bord)
-- =====================================================================

-- Pour l'affilié : ses ventes et SA commission uniquement (pas la part du vendeur).
create or replace view public.affiliate_sales as
  select t.id, t.product_id, p.title as product_title, t.total_amount,
         t.affiliate_fee, t.affiliate_fee_percent, t.status, t.paid_at, t.released_at, t.affiliate_id
    from public.transactions t
    join public.products p on p.id = t.product_id
   where t.affiliate_id = auth.uid();
grant select on public.affiliate_sales to authenticated;
revoke all on public.affiliate_sales from anon;

-- Pour l'admin : frais de plateforme gagnés, séparés par taux (5 % avec affilié / 10 % sans affilié).
-- security_invoker : un non-admin ne verrait que ses propres lignes.
create or replace view public.admin_fee_summary with (security_invoker = true) as
  select platform_fee_percent,
         count(*)::bigint                       as sales,
         coalesce(sum(total_amount), 0)::bigint as volume,
         coalesce(sum(platform_fee), 0)::bigint as platform_fees,
         coalesce(sum(affiliate_fee), 0)::bigint as affiliate_fees,
         coalesce(sum(seller_amount), 0)::bigint as seller_amounts,
         coalesce(sum(fapshi_revenue), 0)::bigint as fapshi_received
    from public.transactions
   where status = 'paid'
   group by platform_fee_percent;
grant select on public.admin_fee_summary to authenticated;
revoke all on public.admin_fee_summary from anon;

-- Pour le vendeur : visites, ventes payées et conversion de SES produits (l'admin voit tout).
-- security_invoker : les règles RLS des tables sous-jacentes s'appliquent aussi.
create or replace view public.seller_product_stats with (security_invoker = true) as
  select p.id as product_id, p.seller_id, p.title, p.product_type,
         (select count(*) from public.product_views v where v.product_id = p.id)::bigint as views,
         (select count(*) from public.transactions t where t.product_id = p.id and t.status = 'paid')::bigint as sales
    from public.products p
   where p.seller_id = auth.uid() or public.is_admin();
grant select on public.seller_product_stats to authenticated;
revoke all on public.seller_product_stats from anon;


-- =====================================================================
-- 16. DROITS D'EXÉCUTION DES FONCTIONS
--     Par défaut Supabase autorise tout le monde : on referme tout, puis on ouvre au cas par cas.
-- =====================================================================

revoke all on function public.create_checkout_order(uuid, uuid, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_fapshi_payment(text, bigint, text, bigint)    from public, anon, authenticated;
revoke all on function public.mark_fapshi_failed(text, text)                         from public, anon, authenticated;
revoke all on function public.record_affiliate_click(text, uuid, uuid)               from public, anon, authenticated;
revoke all on function public.release_due_funds(uuid)                                from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid, uuid, text, text, integer, text, text, text, text, text) to service_role;
grant execute on function public.confirm_fapshi_payment(text, bigint, text, bigint)  to service_role;
grant execute on function public.mark_fapshi_failed(text, text)                      to service_role;
grant execute on function public.record_affiliate_click(text, uuid, uuid)            to service_role;
grant execute on function public.release_due_funds(uuid)                             to service_role;

revoke all on function public.release_my_funds()                                     from public, anon;
revoke all on function public.seller_update_order_status(uuid, text)                 from public, anon;
revoke all on function public.buyer_confirm_delivery(uuid)                           from public, anon;
revoke all on function public.buyer_open_dispute(uuid, text)                         from public, anon;
revoke all on function public.request_withdrawal(bigint, text, text)                 from public, anon;
revoke all on function public.admin_process_withdrawal(uuid, text, text)             from public, anon;
revoke all on function public.admin_refund_transaction(uuid, text)                   from public, anon;
revoke all on function public.admin_resolve_dispute(uuid)                            from public, anon;
grant execute on function public.release_my_funds()                                  to authenticated;
grant execute on function public.seller_update_order_status(uuid, text)              to authenticated;
grant execute on function public.buyer_confirm_delivery(uuid)                        to authenticated;
grant execute on function public.buyer_open_dispute(uuid, text)                      to authenticated;
grant execute on function public.request_withdrawal(bigint, text, text)              to authenticated;
grant execute on function public.admin_process_withdrawal(uuid, text, text)          to authenticated;
grant execute on function public.admin_refund_transaction(uuid, text)                to authenticated;
grant execute on function public.admin_resolve_dispute(uuid)                         to authenticated;


-- =====================================================================
-- 17. STOCKAGE DES FICHIERS (Supabase Storage)
--   covers       : PUBLIC  — couvertures et photos des produits (images, 5 Mo max)
--   deliverables : PRIVÉ   — fichiers vendus (jamais publics, servis par lien signé de 60 s)
--   Chaque vendeur écrit uniquement dans son dossier <son_id>/...
-- =====================================================================

-- Ce bloc est protégé : si Supabase refuse une de ces étapes, le reste du script reste valide
-- et un message vous explique quoi créer à la main dans Storage.
do $storage$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  insert into storage.buckets (id, name, public)
  values ('deliverables', 'deliverables', false)
  on conflict (id) do nothing;

  drop policy if exists covers_read on storage.objects;
  create policy covers_read on storage.objects for select using (bucket_id = 'covers');
  drop policy if exists covers_insert on storage.objects;
  create policy covers_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists covers_delete on storage.objects;
  create policy covers_delete on storage.objects for delete to authenticated
    using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists deliverables_insert on storage.objects;
  create policy deliverables_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists deliverables_select on storage.objects;
  create policy deliverables_select on storage.objects for select to authenticated
    using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists deliverables_delete on storage.objects;
  create policy deliverables_delete on storage.objects for delete to authenticated
    using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
exception when others then
  raise notice 'STOCKAGE : configuration automatique impossible (%). Créez à la main, dans Storage : un bucket "covers" (public) et un bucket "deliverables" (privé).', sqlerrm;
end $storage$;


-- =====================================================================
-- 18. VOUS DEVENEZ ADMINISTRATEUR  (à faire UNE FOIS, après votre inscription sur le site)
--     Remplacez l'email ci-dessous par celui de votre compte, puis exécutez cette ligne seule :
--
--   update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'VOTRE_EMAIL@exemple.com');
-- =====================================================================


-- =====================================================================
-- 18. CONTACT VENDEUR PRIVÉ + PARTAGES + BOOST + ACTIVITÉ  (nouveautés)
-- =====================================================================

-- 18.1  Données du produit cachées au public : numéro WhatsApp du vendeur, lien de réservation et instructions
--       (ils ne sont montrés qu'APRÈS paiement, par le serveur). On remplace le droit de lecture "toute la table"
--       par une liste de colonnes autorisées.
alter table public.products add column if not exists last_inactivity_email_at timestamptz;

revoke select, insert, update on public.products from anon, authenticated;
grant select (id, seller_id, product_type, digital_kind, title, slug, description, cover_url, price, is_published,
              affiliate_enabled, affiliate_percent, duration_minutes, stock, images, weight, variant,
              delivery_options, created_at, updated_at, category, city, rating_avg, rating_count, moderation_status)
  on public.products to anon, authenticated;
grant select (moderation_note) on public.products to authenticated;
-- Le vendeur peut créer/modifier ses produits, mais JAMAIS se les approuver lui-même (moderation_status, notes, ville).
grant insert (id, seller_id, product_type, digital_kind, title, slug, description, cover_url, price, is_published,
              affiliate_enabled, affiliate_percent, booking_url, duration_minutes, delivery_notes, stock, images,
              weight, variant, delivery_options, whatsapp_seller, category)
  on public.products to authenticated;
grant update (digital_kind, title, slug, description, cover_url, price, is_published, affiliate_enabled, affiliate_percent,
              booking_url, duration_minutes, delivery_notes, stock, images, weight, variant, delivery_options,
              whatsapp_seller, category)
  on public.products to authenticated;

-- 18.2  Quand le vendeur change son numéro WhatsApp (profil), tous ses produits sont mis à jour automatiquement.
create or replace function public.sync_seller_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.whatsapp is not null and new.whatsapp is distinct from old.whatsapp then
    update public.products set whatsapp_seller = new.whatsapp where seller_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_whatsapp on public.profiles;
create trigger profiles_sync_whatsapp after update of whatsapp on public.profiles
  for each row execute function public.sync_seller_whatsapp();

-- 18.3  Partages (pour détecter un produit "endormi")
create table if not exists public.product_shares (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  channel    text not null,
  created_at timestamptz not null default now()
);
create index if not exists product_shares_idx on public.product_shares (product_id, created_at);
alter table public.product_shares enable row level security;
drop policy if exists product_shares_select on public.product_shares;
create policy product_shares_select on public.product_shares for select
  using (
    exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
    or public.is_admin()
  );
revoke insert, update, delete, truncate on public.product_shares from anon, authenticated;
revoke all on public.product_shares from anon;

-- 18.4  Boost payant (payé via Fapshi)
--       3 jours : 1 000 FCFA -> en haut de sa catégorie, badge "À la une"
--       7 jours : 2 500 FCFA -> en haut de l'accueil,   badge "Populaire"
create table if not exists public.product_boosts (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  plan            text not null check (plan in ('3d', '7d')),
  amount          bigint not null check (amount >= 100),
  status          text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'review')),
  fapshi_trans_id text unique,
  fapshi_link     text,
  fapshi_status   text,
  last_checked_at timestamptz,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists product_boosts_product_idx on public.product_boosts (product_id, status, ends_at);
create index if not exists product_boosts_seller_idx on public.product_boosts (seller_id, created_at desc);
alter table public.product_boosts enable row level security;
drop policy if exists product_boosts_select on public.product_boosts;
create policy product_boosts_select on public.product_boosts for select
  using (seller_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.product_boosts from anon, authenticated;
revoke all on public.product_boosts from anon;

-- Boosts actifs : visibles par tout le monde (sert aux badges et à la section "À la une").
create or replace view public.active_boosts as
  select product_id, plan, ends_at
    from public.product_boosts
   where status = 'paid' and starts_at <= now() and ends_at > now();
grant select on public.active_boosts to anon, authenticated;

-- Confirme le paiement d'un boost (appelée par le serveur APRÈS vérification chez Fapshi).
create or replace function public.confirm_boost_payment(p_trans_id text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b       public.product_boosts%rowtype;
  v_start timestamptz;
  v_days  integer;
begin
  select * into b from public.product_boosts where fapshi_trans_id = p_trans_id for update;
  if not found then raise exception 'boost_inconnu'; end if;
  if b.status in ('paid', 'review') then return jsonb_build_object('status', 'already', 'boost_id', b.id); end if;

  if p_amount is distinct from b.amount then
    update public.product_boosts set status = 'review', fapshi_status = 'SUCCESSFUL', paid_at = now() where id = b.id;
    return jsonb_build_object('status', 'review', 'boost_id', b.id);
  end if;

  v_days := case b.plan when '3d' then 3 else 7 end;
  -- Si le produit est déjà boosté, le nouveau boost commence à la fin du précédent.
  select greatest(now(), coalesce(max(ends_at), now())) into v_start
    from public.product_boosts where product_id = b.product_id and status = 'paid' and ends_at > now();

  update public.product_boosts
     set status = 'paid', fapshi_status = 'SUCCESSFUL', paid_at = now(),
         starts_at = v_start, ends_at = v_start + make_interval(days => v_days)
   where id = b.id;
  return jsonb_build_object('status', 'paid', 'boost_id', b.id);
end $$;

create or replace function public.mark_boost_failed(p_trans_id text, p_fapshi_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.product_boosts
     set status = case when p_fapshi_status = 'EXPIRED' then 'expired' else 'failed' end, fapshi_status = p_fapshi_status
   where fapshi_trans_id = p_trans_id and status = 'pending';
end $$;

-- 18.5  Activité des produits (vues / ventes / partages sur 3 jours) : sert aux alertes "produit invisible".
create or replace view public.seller_product_activity with (security_invoker = true) as
  select p.id as product_id, p.seller_id, p.title, p.created_at, p.is_published,
         (select count(*) from public.product_views v where v.product_id = p.id)::bigint as views_total,
         (select count(*) from public.product_views v where v.product_id = p.id and v.created_at > now() - interval '3 days')::bigint as views_3d,
         (select count(*) from public.transactions t where t.product_id = p.id and t.status = 'paid' and t.paid_at > now() - interval '3 days')::bigint as sales_3d,
         (select count(*) from public.product_shares s where s.product_id = p.id and s.created_at > now() - interval '3 days')::bigint as shares_3d,
         greatest(
           p.created_at,
           (select max(v.created_at) from public.product_views v where v.product_id = p.id),
           (select max(t.paid_at) from public.transactions t where t.product_id = p.id and t.status = 'paid'),
           (select max(s.created_at) from public.product_shares s where s.product_id = p.id)
         ) as last_activity,
         p.price
    from public.products p
   where p.seller_id = auth.uid() or public.is_admin();
grant select on public.seller_product_activity to authenticated;
revoke all on public.seller_product_activity from anon;

-- Produits "endormis" à qui envoyer l'email (0 vente, 0 partage et moins de 10 vues en 3 jours ; 1 email / 7 jours).
create or replace function public.inactive_products_to_notify()
returns table (product_id uuid, seller_id uuid, title text, views_3d bigint)
language sql security definer set search_path = public as $$
  select p.id, p.seller_id, p.title,
         (select count(*) from public.product_views v where v.product_id = p.id and v.created_at > now() - interval '3 days')
    from public.products p
   where p.is_published
     and p.created_at < now() - interval '3 days'
     and (p.last_inactivity_email_at is null or p.last_inactivity_email_at < now() - interval '7 days')
     and not exists (select 1 from public.transactions t where t.product_id = p.id and t.status = 'paid' and t.paid_at > now() - interval '3 days')
     and not exists (select 1 from public.product_shares s where s.product_id = p.id and s.created_at > now() - interval '3 days')
     and (select count(*) from public.product_views v where v.product_id = p.id and v.created_at > now() - interval '3 days') < 10
   limit 50;
$$;

-- 18.6  Droits d'exécution
revoke all on function public.confirm_boost_payment(text, bigint)   from public, anon, authenticated;
revoke all on function public.mark_boost_failed(text, text)         from public, anon, authenticated;
revoke all on function public.inactive_products_to_notify()         from public, anon, authenticated;
revoke all on function public.sync_seller_whatsapp()                from public, anon, authenticated;
grant execute on function public.confirm_boost_payment(text, bigint) to service_role;
grant execute on function public.mark_boost_failed(text, text)       to service_role;
grant execute on function public.inactive_products_to_notify()       to service_role;



-- =====================================================================
-- 19. AVIS, VENDEUR VÉRIFIÉ, RECHERCHE, PAIEMENT À LA LIVRAISON, ADMIN
-- =====================================================================

-- 19.1  Catégories des produits existants (d'après leur type), et ville du vendeur sur chaque produit
update public.products set category = case digital_kind
    when 'file' then 'Ebooks' when 'course' then 'Formations' when 'license' then 'Licences'
    when 'coaching' then 'Coaching' when 'service' then 'Services' else 'Autres' end
 where category is null;

update public.products p set city = pr.city from public.profiles pr where pr.id = p.seller_id and p.city is null and pr.city is not null;

create or replace function public.set_product_city()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.city := (select city from public.profiles where id = new.seller_id);
  return new;
end $$;
drop trigger if exists products_set_city on public.products;
create trigger products_set_city before insert on public.products for each row execute function public.set_product_city();

-- Quand le vendeur change de ville ou de prix de livraison (profil), ses produits suivent automatiquement.
create or replace function public.sync_seller_profile_to_products()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.city is distinct from old.city then
    update public.products set city = new.city where seller_id = new.id;
  end if;
  if new.delivery_douala_price is distinct from old.delivery_douala_price
     or new.delivery_shipping_price is distinct from old.delivery_shipping_price then
    update public.products
       set delivery_options = jsonb_set(jsonb_set(delivery_options,
             '{delivery_douala,price}', to_jsonb(new.delivery_douala_price)),
             '{shipping_cameroon,price}', to_jsonb(new.delivery_shipping_price))
     where seller_id = new.id and product_type = 'physical' and delivery_options is not null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_sync_products on public.profiles;
create trigger profiles_sync_products after update of city, delivery_douala_price, delivery_shipping_price on public.profiles
  for each row execute function public.sync_seller_profile_to_products();

-- 19.2  Avis (1 à 5 étoiles + commentaire), uniquement après "J'ai reçu mon produit"
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id  uuid not null references public.profiles(id) on delete cascade,
  buyer_id   uuid not null references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists reviews_product_idx on public.reviews (product_id, created_at desc);
create index if not exists reviews_seller_idx on public.reviews (seller_id);
alter table public.reviews enable row level security;
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select using (buyer_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.reviews from anon, authenticated;
revoke all on public.reviews from anon;

create or replace function public.submit_review(p_order uuid, p_rating integer, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.buyer_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.delivery_method is null or o.payment_status <> 'paid' or o.buyer_confirmed_at is null then
    raise exception 'avis_non_autorise';           -- il faut d'abord cliquer "J'ai reçu mon produit"
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'note_invalide'; end if;
  if exists (select 1 from public.reviews where order_id = o.id) then raise exception 'avis_deja_envoye'; end if;

  insert into public.reviews (order_id, product_id, seller_id, buyer_id, rating, comment)
  values (o.id, o.product_id, o.seller_id, o.buyer_id, p_rating, nullif(left(trim(coalesce(p_comment, '')), 1000), ''));

  update public.products p
     set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.product_id = p.id), 0),
         rating_count = (select count(*) from public.reviews r where r.product_id = p.id)
   where p.id = o.product_id;
end $$;

-- Notes par vendeur (publiques)
create or replace view public.seller_ratings as
  select seller_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::bigint as review_count
    from public.reviews group by seller_id;
grant select on public.seller_ratings to anon, authenticated;

-- Avis affichés sur les pages (prénom seulement, pas d'identifiant)
create or replace view public.public_reviews as
  select r.id, r.product_id, r.seller_id, r.rating, r.comment, r.created_at,
         coalesce(nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''), 'Client') as reviewer_name
    from public.reviews r
    left join public.profiles pr on pr.id = r.buyer_id;
grant select on public.public_reviews to anon, authenticated;

-- 19.3  Paiement à la livraison : le vendeur encaisse le cash -> commission 8 % due à KDDF Market
create or replace function public.seller_confirm_cash(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o       public.orders%rowtype;
  v_goods bigint;
  s       record;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.seller_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.payment_method <> 'cod' or o.payment_status <> 'pending' or o.status = 'cancelled' or o.delivery_method is null then
    raise exception 'commande_invalide';
  end if;

  v_goods := o.unit_price * o.quantity;                       -- commission sur les articles (hors livraison)
  select * into s from public.compute_split_for(v_goods, false, 0, true);

  update public.orders
     set payment_status = 'paid', paid_at = now(), status = 'delivered', delivered_at = now()
   where id = o.id;

  update public.transactions
     set status = 'paid', paid_at = now(), goods_amount = v_goods,
         platform_fee = s.platform_fee, platform_fee_percent = s.platform_percent,
         affiliate_fee = 0, affiliate_fee_percent = 0, seller_amount = total_amount - s.platform_fee,
         release_at = now(), released_at = now()                -- le cash est déjà chez le vendeur : rien à libérer
   where order_id = o.id;

  update public.wallets set commission_due = commission_due + s.platform_fee, updated_at = now() where user_id = o.seller_id;
end $$;

create or replace function public.seller_cancel_cod(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.seller_id is distinct from auth.uid() then raise exception 'acces_refuse'; end if;
  if o.payment_method <> 'cod' or o.payment_status <> 'pending' or o.status = 'cancelled' then raise exception 'commande_invalide'; end if;

  update public.orders set status = 'cancelled', payment_status = 'failed' where id = o.id;
  update public.transactions set status = 'failed' where order_id = o.id;
  update public.products set stock = stock + o.quantity where id = o.product_id;   -- le stock réservé est rendu
end $$;

-- 19.4  Administration : badge vérifié, blocage, modération des produits
create or replace function public.admin_set_verified(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  update public.profiles set is_verified = coalesce(p_value, false) where id = p_user;
end $$;

create or replace function public.admin_set_blocked(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  if p_user = auth.uid() then raise exception 'action_interdite'; end if;
  update public.profiles set is_blocked = coalesce(p_value, false) where id = p_user;
  if coalesce(p_value, false) then
    update public.products set is_published = false where seller_id = p_user;   -- ses produits disparaissent du site
  end if;
end $$;

create or replace function public.admin_moderate_product(p_product uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'decision_invalide'; end if;
  update public.products
     set moderation_status = p_decision,
         moderation_note = case when p_decision = 'rejected' then nullif(left(trim(coalesce(p_note, '')), 300), '') else null end
   where id = p_product;
  if not found then raise exception 'produit_introuvable'; end if;
end $$;

-- 19.5  Chiffres du tableau de bord admin (une seule ligne ; vide pour un non-admin)
create or replace view public.admin_stats with (security_invoker = true) as
  select
    (select count(distinct seller_id) from public.products)::bigint                                    as total_sellers,
    (select count(*) from public.profiles)::bigint                                                      as total_users,
    (select count(*) from public.orders where payment_status = 'paid' or (payment_method = 'cod' and status <> 'cancelled'))::bigint as total_orders,
    (select coalesce(sum(platform_fee), 0) from public.transactions
      where status = 'paid' and paid_at >= date_trunc('day', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala')::bigint   as commissions_today,
    (select coalesce(sum(platform_fee), 0) from public.transactions
      where status = 'paid' and paid_at >= date_trunc('month', now() at time zone 'Africa/Douala') at time zone 'Africa/Douala')::bigint as commissions_month,
    (select coalesce(sum(commission_due), 0) from public.wallets)::bigint                               as commissions_due,
    (select count(*) from public.products where moderation_status = 'pending')::bigint                  as products_pending,
    (select count(*) from public.withdrawals where status = 'pending')::bigint                          as withdrawals_pending
  where public.is_admin();
grant select on public.admin_stats to authenticated;
revoke all on public.admin_stats from anon;

-- 19.6  Droits d'exécution
revoke all on function public.submit_review(uuid, integer, text)           from public, anon;
revoke all on function public.seller_confirm_cash(uuid)                    from public, anon;
revoke all on function public.seller_cancel_cod(uuid)                      from public, anon;
revoke all on function public.admin_set_verified(uuid, boolean)            from public, anon;
revoke all on function public.admin_set_blocked(uuid, boolean)             from public, anon;
revoke all on function public.admin_moderate_product(uuid, text, text)     from public, anon;
revoke all on function public.set_product_city()                           from public, anon, authenticated;
revoke all on function public.sync_seller_profile_to_products()            from public, anon, authenticated;
grant execute on function public.submit_review(uuid, integer, text)        to authenticated;
grant execute on function public.seller_confirm_cash(uuid)                 to authenticated;
grant execute on function public.seller_cancel_cod(uuid)                   to authenticated;
grant execute on function public.admin_set_verified(uuid, boolean)         to authenticated;
grant execute on function public.admin_set_blocked(uuid, boolean)          to authenticated;
grant execute on function public.admin_moderate_product(uuid, text, text)  to authenticated;


-- =====================================================================
-- 21. DURCISSEMENT (avertissements du Conseiller de sécurité Supabase)
--   * handle_new_user() est un déclencheur : personne n'a besoin de pouvoir l'appeler directement.
--   * search_path figé sur les fonctions de calcul (évite le détournement par un schéma piégé).
-- =====================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.compute_split(bigint, boolean, integer) set search_path = public;
alter function public.compute_split_for(bigint, boolean, integer, boolean) set search_path = public;
alter function public.valid_delivery_options(jsonb) set search_path = public;

-- =====================================================================
-- 20. RECHARGEMENT DU CACHE DE L'API
--     Sans cela, Supabase peut répondre "Could not find the table ... in the schema cache"
--     juste après la création des tables.
-- =====================================================================
notify pgrst, 'reload schema';


-- =====================================================================
-- 22. AVIS (photo, ville) + SUIVI DE COMMANDE + garantie  (identique à supabase/ajout-avis-suivi.sql)
-- =====================================================================
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


-- =====================================================================
-- 23. SUPPORT : messages des utilisateurs + captures d'écran (identique à supabase/ajout-support.sql)
-- =====================================================================
-- =====================================================================
-- KDDF Market : SUPPORT (messages des utilisateurs + captures d'écran)
-- Script autonome et idempotent. Déjà inclus à la fin de schema.sql (section 23) :
-- ne l'exécutez seul que si schema.sql a déjà été exécuté avant cette fonctionnalité.
-- Aucune table existante n'est modifiée.
-- =====================================================================
create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 100),
  email       text not null check (char_length(email) between 5 and 254),
  category    text not null default 'autre' check (category in ('paiement', 'commande', 'compte', 'bug', 'autre')),
  message     text not null check (char_length(message) between 10 and 3000),
  page_url    text check (page_url is null or char_length(page_url) <= 500),
  images      text[] not null default '{}' check (coalesce(array_length(images, 1), 0) <= 3),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_messages_status_idx on public.support_messages (status, created_at desc);
create index if not exists support_messages_email_idx on public.support_messages (email, created_at desc);

alter table public.support_messages enable row level security;
drop policy if exists support_select on public.support_messages;
create policy support_select on public.support_messages for select using (public.is_admin());
drop policy if exists support_update on public.support_messages;
create policy support_update on public.support_messages for update using (public.is_admin()) with check (public.is_admin());
-- L'envoi d'un message passe UNIQUEMENT par le serveur du site (clé service_role) : jamais d'écriture directe depuis le navigateur.
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
grant update (status, resolved_at) on public.support_messages to authenticated;

-- Bucket PRIVÉ pour les captures d'écran (lues par l'admin via des liens signés temporaires)
do $support$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('support', 'support', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
exception when others then
  raise notice 'STOCKAGE : créez à la main, dans Storage, un bucket "support" (privé). Détail : %', sqlerrm;
end $support$;

notify pgrst, 'reload schema';
