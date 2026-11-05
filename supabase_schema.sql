-- =====================================================================
-- Tô de Plantão — Supabase Schema
-- Rode este arquivo UMA VEZ no painel do Supabase:
--   Project Dashboard -> SQL Editor -> New Query -> cole o conteúdo -> Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  is_admin      boolean not null default false,
  is_blocked    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- WORKPLACES ----------
create table if not exists public.workplaces (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null,
  color                text not null default '#32827A',
  cycle_pattern        text not null default 'SD_F_SN_F_F',
  cycle_start_date     date not null default current_date,
  cycle_start_shift    text not null default 'SD',
  cycle_repeat_months  int,
  sd_start             text not null default '07:00',
  sd_end               text not null default '19:00',
  sn_start             text not null default '19:00',
  sn_end               text not null default '07:00',
  shift_day_color      text not null default '#007AFF',
  shift_night_color    text not null default '#FF3B30',
  avulso_color         text not null default '#34C759',
  manha_color          text not null default '#FFCC00',
  tarde_color          text not null default '#FF9500',
  is_avulso_only       boolean not null default false,
  vacations            jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists workplaces_user_idx on public.workplaces(user_id);

-- ---------- SHIFT OVERRIDES ----------
-- shift_type: 'SD' | 'SN' | 'FOLGA' | 'AVULSO' | 'FERIAS' | 'MANHA' | 'TARDE'
create table if not exists public.shift_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workplace_id  uuid not null references public.workplaces(id) on delete cascade,
  date          date not null,
  shift_type    text not null,
  start_time    text,
  end_time      text,
  note          text,
  swap_with     text,
  updated_at    timestamptz not null default now(),
  unique(user_id, workplace_id, date)
);
create index if not exists shift_overrides_user_date_idx
  on public.shift_overrides(user_id, date);

-- ---------- HOLIDAYS ----------
create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique(user_id, date)
);
create index if not exists holidays_user_date_idx on public.holidays(user_id, date);

-- ---------- EXTRA EVENTS ----------
create table if not exists public.extra_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  label       text not null,
  color       text not null default '#34C759',
  start_time  text,
  end_time    text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists extra_events_user_date_idx
  on public.extra_events(user_id, date);

-- ---------- PUSH SUBSCRIPTIONS ----------
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null,
  subscription  jsonb not null,
  created_at    timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.workplaces           enable row level security;
alter table public.shift_overrides      enable row level security;
alter table public.holidays             enable row level security;
alter table public.extra_events         enable row level security;
alter table public.push_subscriptions   enable row level security;

do $$ declare r record; begin
  for r in (select schemaname, tablename, policyname from pg_policies
            where schemaname='public' and tablename in
              ('profiles','workplaces','shift_overrides','holidays','extra_events','push_subscriptions'))
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

-- PROFILES
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Restrict profile columns a normal user can change
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- WORKPLACES, SHIFT OVERRIDES, HOLIDAYS, EXTRA EVENTS, PUSH SUBSCRIPTIONS
create policy workplaces_all_own on public.workplaces for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy shift_overrides_all_own on public.shift_overrides for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy holidays_all_own on public.holidays for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy extra_events_all_own on public.extra_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subs_all_own on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- =====================================================================
-- Trigger: cria perfil automaticamente ao criar usuário
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
