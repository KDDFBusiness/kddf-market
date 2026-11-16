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
