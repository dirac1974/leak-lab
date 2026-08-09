-- Leak Lab — live hand logger storage (additive to 0001/0002).
-- One table, same trust posture as ll_sessions in 0001: rows are user-owned,
-- readable/insertable/deletable only by their owner via RLS. The hand itself is
-- raw JSON; all analysis recomputes client-side, so improving the grading engine
-- retroactively re-grades logged history without any server change.
--
-- ORDERING: run AFTER 0001 (its closing revoke loop strips grants on unknown
-- tables — same caveat as 0002: if 0001 is ever re-run, re-run this after it).

create table if not exists public.ll_hands (
  id      uuid        primary key default gen_random_uuid(),
  user_id uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  t       timestamptz not null default now(),
  data    jsonb       not null
);

alter table public.ll_hands enable row level security;

drop policy if exists ll_hands_select_own on public.ll_hands;
create policy ll_hands_select_own on public.ll_hands
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ll_hands_insert_own on public.ll_hands;
create policy ll_hands_insert_own on public.ll_hands
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists ll_hands_delete_own on public.ll_hands;
create policy ll_hands_delete_own on public.ll_hands
  for delete to authenticated using (auth.uid() = user_id);

revoke all on table public.ll_hands from anon, authenticated;
grant select, insert, delete on table public.ll_hands to authenticated;

create index if not exists ll_hands_user_t on public.ll_hands (user_id, t);

notify pgrst, 'reload schema';
