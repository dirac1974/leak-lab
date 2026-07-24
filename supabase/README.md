# Moving Leak Lab to its own Supabase project

Today the app shares a project with unrelated infrastructure. The public-role grants
there are locked down (every non-Leak-Lab table returns 401 to the app's key), but
one project means one key surface: any future misconfiguration has a blast radius
beyond this app. A dedicated project removes that entirely.

**Good news:** `ll_sessions` has **0 rows** and `ll_events` holds only throwaway test
pings, so there is **no data to migrate**. This is a schema-only cutover.

---

## What you do (needs your dashboard login)

**1. Create the project.** https://supabase.com/dashboard → New Project. Note the
project ref, URL, and the **publishable** key (Settings → API). Free tier is fine.

**2. Run the schema.** Paste `supabase/migrations/0001_leak_lab_init.sql` into the new
project's SQL editor and run it. It creates both tables with RLS, the least-privilege
grants, and revokes the app key from anything else in `public`.

**3. Set auth config** (Authentication → URL Configuration):
- **Site URL**: your production URL
- **Redirect URLs**: the same origin plus `/**`

Magic-link login breaks without this — the app derives its redirect from
`window.location`, so the new origin must be allow-listed. Also worth enabling on
the Email provider screen: **Prevent the use of leaked passwords**.

**4. Tell me the URL + publishable key**, or edit `src/supabase-config.json` yourself:

```json
{ "url": "https://YOUR-REF.supabase.co", "publishableKey": "sb_publishable_..." }
```

That one file is the only place the project is named — `src/leak-lab.jsx` imports it
and `build.js` reads it for the CSP `connect-src`, so they can't drift apart. Commit,
and CI redeploys.

**5. Verify** — run `bash supabase/verify.sh <url> <publishable-key>`. It checks the
posture from the outside, as an attacker holding the public key would.

**6. Decommission.** Once verified, drop the old objects from the shared project:

```sql
drop table if exists public.ll_events;
drop table if exists public.ll_sessions;
```

Old auth users stay in the shared project; delete them there if you want a clean slate.

---

## What "correct" looks like after cutover

| Check | Expected |
|---|---|
| `ll_events` insert (anon key) | **201** — telemetry writes |
| `ll_events` select (anon key) | **401** — usage counts are never readable |
| `ll_sessions` select (anon key) | **401** — signed-out users have no access |
| Any other table | **401** / absent from the API schema |
| OpenAPI root | lists only `ll_events`, `ll_sessions` |
| Magic link | round-trips on the new origin |

---

## Equity aggregator (populates `ll_equity_cache`)

`tools/sim/aggregate-equity.js` turns pooled `ll_equity_samples` into confirmed
cache rows at **two levels**. Exact canonical spots almost never repeat across
users (~1M+ per profile per street), so the level where pooling actually converges
is the **bucket**: profile × street × board-texture archetype × hand-strength
decile — the same abstraction the strategy zones grade on, derived by the app's
own `bucketKeyOf` (the aggregator imports it through its build probe, so client
and server can never disagree). Lookup on the client is hierarchical: exact hit →
bucket hit → baked preflop curve.

Trust model (both levels): the crowd's raw tallies decide **which** cells are
worth caching (demand), but the equity published to clients is an **authoritative
server-side Monte-Carlo recompute** — a poisoned or noisy pool can never push a
wrong number into grading. A cell is confirmed only when it clears the demand gate
(`N_MIN` pooled trials across `SID_MIN` distinct devices, each capped by
`PER_SID_CAP`) **and** the pooled estimate agrees with the recompute within `TOL`
(`TOL_BUCKET` for buckets, whose authoritative value is a weighted recompute of up
to `BUCKET_MEMBER_CAP` most-observed member spots — capping is logged, never
silent).

```bash
# needs the service_role key — keep it in CI/cron secrets, never in the repo
SUPABASE_SERVICE_ROLE_KEY=... npm run sim:aggregate
# logic-only, no DB, no secret:
node tools/sim/aggregate-equity.js --self-test
```

It is already scheduled: `.github/workflows/aggregate-equity.yml` runs nightly
(and on manual dispatch), aggregates, bakes, and commits the regenerated
`src/data/equity-cache.js` — which triggers the normal deploy. **To enable it,
add the `SUPABASE_SERVICE_ROLE_KEY` repository secret** (GitHub → Settings →
Secrets and variables → Actions; the key is in the Supabase dashboard under
Settings → API). Until the secret exists the nightly run soft-skips and stays
green.

### Getting confirmed equities to the client

The client reads the **baked** `src/data/equity-cache.js` (like `JAM_EQ`), not the
DB, so confirmed rows reach users only through a bake step:

```bash
npm run bake:equity   # fetch confirmed ll_equity_cache rows -> src/data/equity-cache.js
```

Confirmed rows are anon-readable (RLS), so this uses the publishable key — no
secret. The full **go-live sequence** (each step gated on the previous):

1. Real usage accumulates samples in `ll_equity_samples` (flop+ "run the math").
2. `npm run sim:aggregate` — confirm authoritative equities into `ll_equity_cache`.
3. `npm run bake:equity` — bake confirmed rows into `src/data/equity-cache.js`.
4. **Only then** flip `EQUITY_CACHE_LIVE = true` in `src/leak-lab.jsx`, with a
   walk-forward validation reference + a Stats sign-off note (per project rules).
5. `npm run build`, commit, deploy.

Until step 4, the whole path runs in shadow: samples pool and equities bake, but
`boardEquity()` never touches a grade.

## Notes

- The **publishable key is meant to be public** — it ships in the bundle. RLS is what
  protects the data, which is why the grants and policies above matter.
- The linter will flag `ll_events`'s `WITH CHECK (true)` as permissive. That is
  deliberate: anonymous telemetry must accept any insert, the column CHECKs bound the
  payload, and there is no select policy, so nothing can be read back.
- No UPDATE grant on `ll_sessions` anywhere — banked sessions are immutable history.
