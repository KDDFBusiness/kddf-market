-- =====================================================================
-- VENDORA — Schéma Supabase complet
-- À exécuter dans Supabase > SQL Editor
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Types ----------
create type product_type as enum ('file', 'course', 'license', 'bundle', 'coaching', 'service');
create type order_status as enum ('pending', 'paid', 'failed', 'refunded', 'expired');
create type payment_provider as enum ('stripe', 'fedapay', 'crypto');
create type commission_status as enum ('pending', 'approved', 'paid', 'cancelled');

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  store_name text,
  store_slug text unique,
  avatar_url text,
  country text,
  default_currency text not null default 'XAF',
  is_creator boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, store_slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]', '', 'g')) || substr(new.id::text, 1, 4)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Produits ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  type product_type not null,
  title text not null,
  slug text not null,
  description text,
  cover_url text,
  price_amount numeric(14,2) not null check (price_amount >= 0),
  price_currency text not null default 'XAF',
  is_published boolean not null default false,
  affiliate_enabled boolean not null default false,
  affiliate_percent numeric(5,2) not null default 30 check (affiliate_percent between 0 and 90),
  -- données spécifiques au type
  booking_url text,            -- coaching / service (Calendly, Cal.com, WhatsApp...)
  duration_minutes int,        -- coaching
  delivery_notes text,         -- service : instructions de livraison
  created_at timestamptz not null default now(),
  unique (creator_id, slug)
);
create index on public.products (creator_id);
create index on public.products (is_published);

-- Fichiers livrables (PDF, ePub, vidéos, archives) stockés dans le bucket privé "deliverables"
create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  position int not null default 0,   -- ordre des leçons pour les formations
  created_at timestamptz not null default now()
);
create index on public.product_files (product_id);

-- Clés de licence pré-générées
create table public.license_keys (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  key text not null,
  order_id uuid,
  assigned_at timestamptz,
  unique (product_id, key)
);

-- Offres groupées
create table public.bundle_items (
  bundle_id uuid not null references public.products(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (bundle_id, product_id),
  check (bundle_id <> product_id)
);

-- ---------- Affiliation ----------
create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, creator_id)
);

-- ---------- Commandes ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  creator_id uuid not null references public.profiles(id),
  buyer_id uuid references public.profiles(id),
  buyer_email text not null,
  buyer_name text,
  affiliate_id uuid references public.affiliates(id),
  -- montant dans la devise du produit (référence)
  amount numeric(14,2) not null,
  currency text not null,
  -- montant réellement facturé dans la devise choisie par l'acheteur
  charged_amount numeric(18,8) not null,
  charged_currency text not null,
  fx_rate numeric(18,8) not null default 1,
  platform_fee numeric(14,2) not null default 0,
  affiliate_fee numeric(14,2) not null default 0,
  status order_status not null default 'pending',
  download_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.orders (creator_id, created_at desc);
create index on public.orders (buyer_email);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider payment_provider not null,
  method text,                  -- card, orange_money, mtn_momo, wave, moov, mpesa, paypal, applepay, googlepay, btc, eth, usdt_trc20, usdt_erc20
  provider_reference text,      -- id session Stripe / transaction FedaPay / payment NOWPayments
  checkout_url text,
  raw jsonb,
  status order_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index on public.payments (order_id);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade unique,
  amount numeric(14,2) not null,
  currency text not null,
  status commission_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Visites de pages produit (pour le taux de conversion)
create table public.product_views (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.product_views (product_id, created_at);

-- Taux de change mis en cache
create table public.fx_rates (
  base text not null,
  quote text not null,
  rate numeric(18,8) not null,
  updated_at timestamptz not null default now(),
  primary key (base, quote)
);

-- ---------- Vue analytics créateur ----------
create or replace view public.creator_stats as
select
  p.creator_id,
  p.id as product_id,
  p.title,
  coalesce((select count(*) from public.product_views v where v.product_id = p.id), 0) as views,
  coalesce((select count(*) from public.orders o where o.product_id = p.id and o.status = 'paid'), 0) as sales,
  coalesce((select sum(o.amount - o.platform_fee - o.affiliate_fee) from public.orders o where o.product_id = p.id and o.status = 'paid'), 0) as net_revenue
from public.products p;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_files enable row level security;
alter table public.license_keys enable row level security;
alter table public.bundle_items enable row level security;
alter table public.affiliates enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.product_views enable row level security;
alter table public.fx_rates enable row level security;

-- Profils : lecture publique (vitrine), modification par le propriétaire
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Produits : publiés visibles par tous, gestion par le créateur
create policy "products_read" on public.products for select using (is_published or creator_id = auth.uid());
create policy "products_insert" on public.products for insert with check (creator_id = auth.uid());
create policy "products_update" on public.products for update using (creator_id = auth.uid());
create policy "products_delete" on public.products for delete using (creator_id = auth.uid());

-- Fichiers / licences : visibles uniquement du créateur (les clients passent par l'API serveur)
create policy "files_owner" on public.product_files for all
  using (exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()));
create policy "licenses_owner" on public.license_keys for all
  using (exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()));

create policy "bundle_read" on public.bundle_items for select using (true);
create policy "bundle_owner" on public.bundle_items for all
  using (exists (select 1 from public.products p where p.id = bundle_id and p.creator_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = bundle_id and p.creator_id = auth.uid()));

-- Affiliés
create policy "aff_read" on public.affiliates for select using (user_id = auth.uid() or creator_id = auth.uid());
create policy "aff_insert" on public.affiliates for insert with check (user_id = auth.uid());

-- Commandes : créateur, acheteur connecté (les écritures passent par la clé service)
create policy "orders_read" on public.orders for select using (creator_id = auth.uid() or buyer_id = auth.uid());
create policy "payments_read" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.creator_id = auth.uid()));

create policy "commissions_read" on public.commissions for select
  using (exists (select 1 from public.affiliates a where a.id = affiliate_id and (a.user_id = auth.uid() or a.creator_id = auth.uid())));

create policy "views_owner_read" on public.product_views for select
  using (exists (select 1 from public.products p where p.id = product_id and p.creator_id = auth.uid()));

create policy "fx_read" on public.fx_rates for select using (true);

-- =====================================================================
-- STORAGE
-- =====================================================================
-- "deliverables" : privé, fichiers vendus (accès via URL signée côté serveur uniquement)
-- "covers"       : public, images de couverture
insert into storage.buckets (id, name, public) values ('deliverables', 'deliverables', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('covers', 'covers', true)
  on conflict (id) do nothing;

-- Un créateur ne peut écrire que dans son dossier <user_id>/...
create policy "deliverables_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deliverables_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deliverables_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "covers_read" on storage.objects for select using (bucket_id = 'covers');
create policy "covers_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Fonction : attribution atomique d'une clé de licence
-- =====================================================================
create or replace function public.assign_license_key(p_product uuid, p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select key into k from public.license_keys
   where product_id = p_product and order_id is null
   order by id limit 1 for update skip locked;
  if k is null then return null; end if;
  update public.license_keys set order_id = p_order, assigned_at = now()
   where product_id = p_product and key = k;
  return k;
end $$;
revoke all on function public.assign_license_key(uuid, uuid) from public, anon, authenticated;

-- La vue creator_stats applique les droits (RLS) de l'utilisateur qui l'interroge
alter view public.creator_stats set (security_invoker = on);
