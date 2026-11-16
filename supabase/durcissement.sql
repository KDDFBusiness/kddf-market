-- KDDF MARKET : corrige les avertissements de sécurité "faciles" du Conseiller Supabase.
-- Supabase > SQL Editor > New query > collez ce fichier > Run. Peut être relancé sans risque.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.compute_split(bigint, boolean, integer) set search_path = public;
alter function public.compute_split_for(bigint, boolean, integer, boolean) set search_path = public;
alter function public.valid_delivery_options(jsonb) set search_path = public;
