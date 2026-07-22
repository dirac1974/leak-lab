-- Leak Lab — full schema for a dedicated Supabase project.
-- Reproduces the exact hardened state audited on the shared project: least-privilege
-- grants, RLS on both tables, telemetry insert-only (never readable by the app key).
-- Safe to re-run: every statement is idempotent.
--
-- Run against a NEW project, then follow supabase/README.md for the cutover.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ll_sessions — banked drill sessions, one row per session, per user.
--    leaks/opps carry the per-leak trend history so it syncs across devices.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ll_sessions (
  id       uuid        primary key default gen_random_uuid(),
  user_id  uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  t        timestamptz not null default now(),
  player   text,                 -- local profile name, if the user set one
  n        integer     not null, -- decisions in the session
  acc      integer     not null, -- accuracy %
  ev       numeric     not null, -- bb lost
  ev_per   numeric     not null, -- bb lost per decision
  realized numeric,              -- net bb actually won/lost (full-hand mode)
  hands    integer,
  mode     text,                 -- 'drill' | 'hand'
  stake    text,
  leaks    jsonb,                -- { leakKey: { ev, n } }
  opps     jsonb                 -- { stageKey: { n, good } } — makes rates reconstructible
);

alter table public.ll_sessions enable row level security;

-- Each user sees, writes and deletes only their own rows. No UPDATE by design:
-- a banked session is immutable history.
drop policy if exists ll_sessions_select_own on public.ll_sessions;
create policy ll_sessions_select_own on public.ll_sessions
  for select using (auth.uid() = user_id);

drop policy if exists ll_sessions_insert_own on public.ll_sessions;
create policy ll_sessions_insert_own on public.ll_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists ll_sessions_delete_own on public.ll_sessions;
create policy ll_sessions_delete_own on public.ll_sessions
  for delete using (auth.uid() = user_id);

-- Least privilege: strip Supabase's default grants, then hand back only what the
-- app uses. anon gets nothing — signed-out users never touch this table.
revoke all on table public.ll_sessions from anon, authenticated;
grant select, insert, delete on table public.ll_sessions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ll_events — anonymous usage telemetry. Event name + a random install id.
--    No account linkage, no hands, no results, no device info.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ll_events (
  id   bigint      generated always as identity primary key,
  t    timestamptz not null default now(),
  ev   text        not null check (char_length(ev) between 1 and 32),
  sid  text        check (sid is null or char_length(sid) <= 40),
  meta jsonb       check (meta is null or pg_column_size(meta) < 2048)
);

alter table public.ll_events enable row level security;

-- Insert-only: anonymous clients must be able to write a ping, and there is
-- deliberately NO select policy, so the embedded publishable key can count usage
-- but can never read it back. (Supabase's linter flags this WITH CHECK (true) as
-- permissive — it is intentional; the column CHECKs bound what can be written.)
drop policy if exists ll_events_insert_anon on public.ll_events;
create policy ll_events_insert_anon on public.ll_events
  for insert to anon, authenticated with check (true);

revoke all on table public.ll_events from anon, authenticated;
grant insert on table public.ll_events to anon, authenticated;

-- Reading your own telemetry is a dashboard/service-role job, so an index for it.
create index if not exists ll_events_t_idx on public.ll_events (t desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Belt-and-braces: make sure nothing else in this project is exposed to the
--    app's key. Harmless on a fresh project; meaningful if anything else lands here.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename from pg_tables
    where schemaname = 'public' and tablename not in ('ll_sessions','ll_events')
  loop
    execute format('revoke all on table %I.%I from anon, authenticated', r.schemaname, r.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
