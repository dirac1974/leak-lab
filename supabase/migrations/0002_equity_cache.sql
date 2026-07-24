-- Leak Lab — crowd-pooled board-equity cache (additive to 0001).
-- Two tables, same trust split as the existing schema:
--   ll_equity_samples : anonymous raw tallies, INSERT-ONLY, never readable by the
--                       app key (mirrors ll_events) — clients contribute, can't scrape.
--   ll_equity_cache   : the aggregated result, CONFIRMED rows globally READABLE,
--                       writes reserved to the service-role aggregator.
-- Safe to re-run: every statement is idempotent.
--
-- ORDERING: run AFTER 0001. 0001 ends with a belt-and-braces loop that revokes
-- app-key grants on any table it doesn't know about; do NOT re-run 0001 after this
-- migration or it will strip the grants below. (If you must, re-run 0002 after.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ll_equity_samples — one row per contributed Monte-Carlo run. Raw win/tie/n
--    tallies (not a finished equity) so the pool aggregates by plain summation.
--    Keyed by the canonical, suit-isomorphic spot key computed on the client.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ll_equity_samples (
  id    bigint      generated always as identity primary key,
  t     timestamptz not null default now(),
  k     text        not null check (char_length(k) between 1 and 48),  -- canonical spot key
  rv    smallint    not null,                                          -- equity-model version
  wins  integer     not null check (wins >= 0 and wins <= 2000000),
  ties  integer     not null check (ties >= 0 and ties <= 2000000),
  n     integer     not null check (n between 1 and 2000000),
  sid   text        check (sid is null or char_length(sid) <= 40)      -- random install id; NOT account-linked
);

alter table public.ll_equity_samples enable row level security;

-- Insert-only for everyone, deliberately NO select policy: the embedded key can
-- contribute samples but can never read the raw firehose back (same posture as
-- ll_events). The column CHECKs bound what any client can write.
drop policy if exists ll_equity_samples_insert_anon on public.ll_equity_samples;
create policy ll_equity_samples_insert_anon on public.ll_equity_samples
  for insert to anon, authenticated with check (true);

revoke all on table public.ll_equity_samples from anon, authenticated;
grant insert on table public.ll_equity_samples to anon, authenticated;

-- Aggregation groups by (rv, k); index for the service-role job.
create index if not exists ll_equity_samples_rv_k_idx on public.ll_equity_samples (rv, k);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ll_equity_cache — the published, aggregated equity per canonical spot. Only
--    CONFIRMED rows are visible to clients; the confirmed flag is the kill-switch
--    that keeps an entry out of grading until it passes validation + Stats sign-off.
--    Holds only game abstractions (spot key + equity) — no personal data.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ll_equity_cache (
  k          text        primary key,
  rv         smallint    not null,
  equity     numeric     not null check (equity >= 0 and equity <= 1),
  n          bigint      not null check (n >= 0),   -- total pooled trials behind this estimate
  se         numeric,                               -- standard error, sqrt(p(1-p)/n)
  confirmed  boolean     not null default false,
  updated_at timestamptz not null default now()
);

alter table public.ll_equity_cache enable row level security;

-- Readable by anyone, but ONLY confirmed rows. No insert/update/delete policy for
-- app keys — the aggregator writes via the service role, which bypasses RLS.
drop policy if exists ll_equity_cache_read_confirmed on public.ll_equity_cache;
create policy ll_equity_cache_read_confirmed on public.ll_equity_cache
  for select to anon, authenticated using (confirmed = true);

revoke all on table public.ll_equity_cache from anon, authenticated;
grant select on table public.ll_equity_cache to anon, authenticated;

notify pgrst, 'reload schema';
