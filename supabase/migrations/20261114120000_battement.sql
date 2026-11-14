-- Battement : maintient le projet Supabase actif (voir docs/SUPABASE.md, « Éviter la mise en pause »).
-- Un projet gratuit sans activité suffisante pendant environ une semaine est mis en pause. Un atelier GitHub Actions
-- (.github/workflows/battement-supabase.yml) appelle cette fonction chaque jour avec la clé publique : une vraie
-- requête sur la base, qui ne lit et ne modifie aucune donnée. Le script peut être relancé sans risque.

create or replace function public.battement()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;
revoke all on function public.battement() from public;
grant execute on function public.battement() to anon, authenticated;

-- Fait connaître la nouvelle fonction à l'API REST sans attendre
notify pgrst, 'reload schema';
