-- Debrief drone ESAM : fiches synchronisées entre appareils (voir docs/SUPABASE.md).
-- Tous les membres voient et modifient toutes les fiches. Un membre est une adresse e-mail de la table membres :
-- n'importe qui peut recevoir un code de connexion, mais seul un membre accède aux fiches.

create table if not exists public.membres (
  email text primary key check (email = lower(email)),
  ajoute_le timestamptz not null default now()
);
alter table public.membres enable row level security;
-- Aucune règle d'accès sur membres : la liste ne se lit et ne se modifie que depuis le tableau de bord Supabase.

create or replace function public.est_membre()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membres m where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.est_membre() from public, anon;
grant execute on function public.est_membre() to authenticated;

create table if not exists public.fiches (
  debrief_id text primary key,
  -- Date de dernière modification de la fiche (champ maj de l'appli) : la plus récente l'emporte
  maj timestamptz not null,
  supprime boolean not null default false,
  -- Fiche complète, telle qu'enregistrée sur l'appareil (null une fois supprimée)
  data jsonb,
  modifie_par uuid default auth.uid(),
  recu_le timestamptz not null default now()
);
create index if not exists fiches_maj_idx on public.fiches (maj desc);

-- Une version plus ancienne n'écrase jamais une version plus récente (deux appareils hors ligne, par exemple)
create or replace function public.fiches_garder_la_plus_recente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.maj < old.maj then
    return null;
  end if;
  new.modifie_par := auth.uid();
  new.recu_le := now();
  return new;
end;
$$;
drop trigger if exists fiches_plus_recente on public.fiches;
create trigger fiches_plus_recente
  before update on public.fiches
  for each row execute function public.fiches_garder_la_plus_recente();

alter table public.fiches enable row level security;
drop policy if exists "membres lisent" on public.fiches;
drop policy if exists "membres ajoutent" on public.fiches;
drop policy if exists "membres modifient" on public.fiches;
create policy "membres lisent" on public.fiches for select to authenticated using ((select public.est_membre()));
create policy "membres ajoutent" on public.fiches for insert to authenticated with check ((select public.est_membre()));
create policy "membres modifient" on public.fiches for update to authenticated
  using ((select public.est_membre())) with check ((select public.est_membre()));
-- Pas de suppression réelle depuis l'appli : une fiche supprimée garde une ligne supprime = true, pour que les
-- autres appareils la retirent aussi.

revoke all on public.fiches from anon;
grant select, insert, update on public.fiches to authenticated;
