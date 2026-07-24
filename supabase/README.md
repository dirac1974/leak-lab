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
cache rows. Trust model: the crowd's raw tallies decide **which** board spots are
worth caching (demand), but the equity published to clients is an **authoritative
server-side Monte-Carlo recompute** of that exact spot — a poisoned or noisy pool
can never push a wrong number into grading. A key is confirmed only when it clears
the demand gate (`N_MIN` pooled trials across `SID_MIN` distinct devices, each
capped by `PER_SID_CAP`) **and** the pooled estimate agrees with the recompute
within `TOL`.

```bash
# needs the service_role key — keep it in CI/cron secrets, never in the repo
SUPABASE_SERVICE_ROLE_KEY=... npm run sim:aggregate
# logic-only, no DB, no secret:
node tools/sim/aggregate-equity.js --self-test
```

Schedule it (GitHub Actions cron or Supabase scheduled job). Going live on grading
is still gated separately: flip `EQUITY_CACHE_LIVE` in `src/leak-lab.jsx` only after
a walk-forward validation reference and a Stats sign-off.

## Notes

- The **publishable key is meant to be public** — it ships in the bundle. RLS is what
  protects the data, which is why the grants and policies above matter.
- The linter will flag `ll_events`'s `WITH CHECK (true)` as permissive. That is
  deliberate: anonymous telemetry must accept any insert, the column CHECKs bound the
  payload, and there is no select policy, so nothing can be read back.
- No UPDATE grant on `ll_sessions` anywhere — banked sessions are immutable history.
