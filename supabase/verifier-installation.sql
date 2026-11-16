-- KDDF MARKET : vérifie que l'installation est complète.
-- Supabase > SQL Editor > collez ce fichier > Run. Chaque ligne doit afficher "OK".
select 'table ' || t as controle,
       case when to_regclass('public.' || t) is not null then 'OK' else 'MANQUANT : relancez schema.sql' end as etat
from unnest(array['profiles','products','orders','transactions','wallets','withdrawals','reviews','product_files','product_boosts']) as t
union all
select 'bucket ' || b,
       case when exists (select 1 from storage.buckets where id = b) then 'OK' else 'MANQUANT : créez-le dans Storage' end
from unnest(array['covers','deliverables']) as b;
