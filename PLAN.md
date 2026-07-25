# Leak Lab — Implementation Plan (cost-minimized)

Operational roadmap. Two parallel tracks: **A** ships the NLHE product to the stores; **B** is the home simulation program that generates Omaha data with zero purchased compute. Every dollar is gated behind evidence. Update the checkboxes and the decision log as we go; future sessions start here.

**Budget principle:** the only *mandatory* cash before launch is $124 (Apple $99/yr + Google $25 once), and it is not spent until Gate A1 passes. Everything else on the classic startup shopping list — solver licenses, cloud compute, analytics, ads, LLC — is deferred, replaced by home compute, or has a named unlock trigger below.

---

## Budget ledger

| Item | Cost | When unlocked |
|---|---|---|
| Web validation (Track A1) | $0 | now |
| Simulation program (all of Track B) | $0 (home compute) | now |
| Apple Developer + Play Console | $124 | Gate A1 passed |
| RevenueCat / Supabase / hosting | $0 (free tiers) | — |
| LLC + registered agent | ~$100–500 | first real revenue, before scale |
| GTO Wizard PLO, 1–2 months (calibration) | $44–88 | B3 zone tables drafted, pre-PLO-launch |
| MonkerGuy preflop packs (calibration) | ~$50–150 | same as above, optional |
| MonkerSolver + high-RAM cloud | ~$1–3k | **only** if Omaha tier revenue justifies it |
| Micro-influencer seeding | $1–2k | Gate A4 metrics passed, optional |

Year-one mandatory total: **$124.**

---

## Track A — NLHE product to the stores

### A0 — Gate zero: unblock the build ✅ prerequisites for everything
- [x] Decide React 19 vs 18 → **React 19** (package.json bumped to ^19.2.0; matches what production already ran)
- [x] Decide deploy source → **GitHub Actions workflow** (Pages build_type=workflow; CI builds from src/, drift impossible; committed index.html is now a convenience artifact). Bonus: build pipeline made portable (`.build/` instead of `/tmp`).
- [x] Commit the leak-tracking feature (2026-07-20, with C0 + C4 schema)
- [x] Bundle fonts locally (2026-07-20: latin woff2 as data URIs via tools/fetch-fonts.js — zero runtime network requests)
- [x] Migrate `store` to hydrate-at-boot with pluggable backend (2026-07-20) — the Capacitor swap is now backend-only. **A0 COMPLETE.**

**Owner:** decisions = David; implementation = Claude sessions. **Cost: $0.**

### A1 — Validate with the live web app (~4 weeks, $0)
- [x] Telemetry live (2026-07-20): ll_events table, anon insert-only under RLS (reads denied, verified); app fires 'open'/'bank' with a random install id; README discloses. Metrics readable via Supabase dashboard/MCP.
- [ ] Seed in 2–3 communities (r/poker, 2+2 live low-stakes, one poker Discord) as participation — spot-of-the-week posts using the app's own coach notes, link to the free web app
- [ ] Watch for the qualitative signal: unprompted "can I pay for this?"

**GATE A1:** ~100+ weekly users with D7 retention >15%, or strong qualitative pull. Miss twice → the app stays a free hobby, Track B continues anyway (it's free), and nothing further is spent.

**Owner:** telemetry = Claude; posting = David (community posts from a person land; from a brand they don't).

### A2 — Capacitor shell + paywall (~4 weeks, $124)
- [ ] Pay Apple $99 + Google $25
- [ ] Capacitor wrap per the porting plan (webDir at build output; safe-area insets; icons/splash)
- [ ] Native storage swap behind the hydrated `store`
- [ ] RevenueCat: Free / Pro entitlements — Pro $6.99/mo, $49.99/yr, 14-day trial
- [ ] Free/Pro split as specced (Pro = unlimited leak-trend history, all 6 profiles, full-hand mode, all stakes, sync, CSV export)
- [x] Supabase leaks/opps columns migrated + insert/fetch wired (2026-07-20) — cloud now carries leak-trend history. Remaining from this line: account-deletion flow (A2).
- [ ] Deep-link auth (custom scheme + `appUrlOpen` listener replacing the location.hash read)
- [ ] TestFlight + Play internal beta — friends are beta testers here, not validators

### A3 — Launch + organic playbook (~4 weeks, $0)
- [ ] Store listings (expect 12+/17+ simulated-gambling rating; no real money = allowed both stores)
- [ ] Weekly cadence: one spot-of-the-week post + one 30-second short (scenario → wrong play → dollar cost)
- [ ] ASO: "poker trainer," "GTO poker," "poker practice," "fix poker leaks"

### A4 — Day-90 kill/continue review
Pre-committed criteria: trial starts >8% of downloads · trial→paid >25% · month-2 sub retention >80%.
Pass → double down on content; unlock influencer budget; begin Omaha add-on build-out from Track B outputs. Miss → self-funding hobby, no further spend, Track B optional.

---

## Track B — Home simulation program ($0, runs for months in parallel)

All compute on the home machine (Core 7 150U, 10C/12T, 16GB — measured on this box). MC simulation is parallel and RAM-light; this hardware is genuinely sufficient. The estimates below assume ~8 worker threads sustained (leave 4 threads so the laptop stays usable).

**Home-lab operating rules**
- Every sim **checkpoints incrementally** (NDJSON, resumable) — an interrupted overnight run loses nothing
- Run workers at low OS priority; plugged in; Windows sleep disabled while a run is active (`powercfg /change standby-timeout-ac 0` during runs)
- All tooling lives in `tools/sim/` as plain Node scripts (`npm run sim:*`); generated tables land in `src/data/` and are committed — the app consumes them like it consumes `RANKED` today
- Every table ships with an acceptance test before the app may consume it

### B0 — The evaluator ✅ shipped 2026-07-20 (tools/sim/evaluator.js)
- [x] Exact 5-card ranker — total-order category-packed scorer instead of the 7,462-class lookup (sims need correct ordering, not canonical classes; deviation noted in-file)
- [x] Omaha high, exactly-2-of-hole, 4/5/6-card hole support
- [x] Low-8 evaluator with counterfeit handling
- [x] Correctness suite: category ladder, must-use-two edges, nut/counterfeit lows, 4,000-pair cross-check vs independent naive scorer (npm run sim:test)
- [x] Benchmark: 4.66M rank5/sec, 87k omahaHigh/sec single core — 4.6× the gate; B2's full table projects to ~25 min multicore, not overnight
- [ ] Same module in a web worker in-app (still open — wire when the first Omaha UI lands)

*This is the one piece of Omaha work that ignores the A1 gate — it de-risks everything, costs nothing, and is useful standalone.*

### B1 — Bomb-pot equity library — nights of compute
- Multiway MC on two boards: scoop / split / quarter probabilities, by hand class vs 4–7 opponents (random and profile-filtered ranges)
- ~50k rollouts per spot ≈ minutes; a full texture-bucketed calibration sweep ≈ **2–4 overnights**
- Output: `src/data/dbbp-*.json` + the on-device MC does live grading — first shippable Omaha feature, zero competition

### B2 — PLO preflop percentile table — an evening to overnight
- Enumerate all 16,432 suit-isomorphic 4-card classes; MC equity vs 1/2/3 opponents (~20–30k rollouts/class)
- On this hardware: heads-up config ≈ **2–4 hours**; 3-way ≈ overnight
- Output: `src/data/plo-pct.json` (~100–200KB), consumed exactly like `PCT` today
- Acceptance: AAKKds ranks #1; known trash (e.g. 2333 rainbow) bottom decile; spot-check vs published rankings

### B3 — Zone calibration by self-play — the months live here
- Profile agents play millions of hands against candidate zone tables; local best-response probes find exploitable boundaries; iterate per texture bucket
- ~1M hands/hour on this box → each iteration cycle is days; expect **2–3 months of overnight iterations** to converge PLO4 zones
- Sanity-check drafted zones against free published charts; **unlock the $44 GTO Wizard month here** for final calibration, not before
- Output: PLO `zonesFor()` tables + EV-loss scaling constants

### B4 — PLO8 / Big O surfaces — days to ~2 weeks of compute
- Dual-axis (high × low/scoop) percentile surfaces; Big O's ~134k classes × hi-lo eval ≈ **4–5 days continuous or 2 weeks of overnights**
- Scoop-EV tables drive grading (pot-share EV, not win%)
- No external baseline exists to buy at any price — home generation is not the budget option here, it is the only option

**Sequence: B0 → B1 → B2 → B3 → B4.** Ship bomb-pot drill after B1 (post-A4, as the Omaha add-on's spearhead), PLO4 after B3, PLO8/Big O after B4.

---

## Track C — NLHE practical-strategy hardening & teaching features

Follows the July 2026 accuracy audit. Positioning decision: **market as a practical live-strategy trainer, not a GTO trainer** — the engine's live adjustments (open-size tightening, rake-tight defends, population exploits) are the product, and the "GTO" banner invites a solver comparison the heuristic layers lose. GTO stays as the reference baseline in coach notes, not the identity.

### C0 — Positioning rename ✅ shipped 2026-07-20
- [x] Header → "LIVE STRATEGY · REAL PLAYERS, REAL SPOTS"; title/meta/OG → "Live Poker Strategy Trainer"
- [x] Verdict "✓ GTO PLAY" → "✓ SOLID PLAY"; GTO-baseline phrasing kept inside coach notes as the credibility anchor
- [x] README lead rewritten around the niche: "You aren't playing against a GTO bot. Neither is anyone at your table."
- [x] Bonus (serves "which style is he really"): per-profile **SPOT THEM LIVE** tells in the setup detail view — how to identify each archetype at a real table (Station's raise = the nuts; LAG vs Maniac = spot selection; etc.)

### C1 — Accuracy hardening (~1–2 sessions, $0)
- [x] Provenance comments on pressure charts + profiles (2026-07-20); remaining tables covered by snapshot tests
- [x] Position + stack-aware 3-bet/4-bet defense (2026-07-20): vs3Chart/vs4Chart — IP vs blind 3-bettors, short jam-or-fold, deep flats
- [x] Live-population pass (2026-07-20): GTO Bot 3-bet 15%→11% with provenance; NEW Live Reg 🧢 archetype (honest, under-bluffing) with tells + exploit playbook, seated in the default lineup
- [ ] Pot-scale postflop EV pricing (flat 0.12bb/pct today regardless of pot; `gradeSized` already pot-scales sizing leaks — extend to distance leaks)
- [ ] Words audit pass: every fixed claim in `adviceFor`/`exploitFor` traced to a param or math note in a comment (the injected-numbers architecture already keeps most of it honest)
- [x] Snapshot tests in CI (2026-07-20): npm test = 24 zone snapshots + partition invariants + GTO-anchoring proofs, wired into the Pages workflow — failing tests block deploys

### C2 — Profile range viewer in setup ✅ shipped 2026-07-20
- [x] 13×13 grid per profile × position: cells colored open / limp-band / fold from `PCT` × `TABLES.rfi` × profile `rfi` multiplier (stake-aware via `rfiTighten`)
- [x] Position chips to flip through; lives in the tap-profile detail panel
- [x] Captioned as a model range (top-X% by strength, live-open sized)
- [x] Free-tier feature — teaching hook + store-screenshot material

### C3 — Live range-narrowing view (~2–3 sessions)
- [ ] "RANGE" button during training: villain's current range as a combo grid that narrows street by street
- [ ] Mechanic: preflop range (profile × position threshold) → expand to combos minus board/hero blockers → per action, sort by `classify()` rank and fold the bottom f%, raise the top r%, call the middle — consistent with the profile's aggregate frequencies
- [ ] Show combo count shrinking ("612 → 287") + one injected-numbers line ("Station folds only 12% — the range barely narrows; thin value prints")
- [ ] Cheap compute (≤1,326 combos × classify per street); Pro-tier feature after trial

### C4 — Leak-history completion (~1 session; schema item ships with A0)
- [x] **Shipped with A0 commit:** `oppSnapshot` extended to `{n, good}` per stage (readers accept legacy bare numbers via `oppCount()`); stage-accuracy trends now reconstructible from all future banked history
- [x] Progress view biggest-movers (2026-07-20): most-improved + most-worsening leak with evidence gates; taps through to the trend chart
- [x] JSON backup + merge-restore in Progress (shipped 2026-07-20 after a real user data-eviction report; sessions dedupe on `(t, n)`, nothing clobbered). CSV export for Pro remains open.
- [x] PWA installability shipped early for the same reason (manifest + network-first service worker + generated icons via `tools/make-icons.js`): installed home-screen apps are exempt from iOS Safari's 7-day storage eviction and run offline. This was the A2/PWA roadmap item — pulled forward.
- [x] store.set failures surface a back-up-now warning (2026-07-20)
- [ ] (Already scheduled in A2: cloud `leaks`/`opps` columns)

### C6 — Strategy visual redesign ✅ shipped 2026-07-20 (user feedback: strip too small, sizes indistinguishable)
- [x] RangeStrip: 30px tall, distinct tones for small vs big sizings (adjacent river big/small zones used to render as one brass blob), two-tone stripe for mixed-size zones, labels from 9% width, glowing you-marker with zone name ("▲ you 62% · CHECK")
- [x] Legend chips under the strip: color square → action → share of all hands (the color-matched-boxes idea, applied to range composition)
- [x] OptionCosts menu in feedback: every action-bar option graded exactly as act() grades, priced in bb and $, chosen row highlighted — replaces the old pill row that skipped the 3-bet/4-bet/jam stages and still said "GTO" (C0 miss). Preflop raise sizes both show "best ✓", making family grading visible.
- [x] Chose EV-priced menu over pie chart: the zone model prices options, it doesn't compute mixing frequencies — a pie would imply solver-frequency claims the engine can't back

### C7 — Live multiway pots ✅ shipped 2026-07-20 (user feedback: "our scenarios almost never have more than one caller")
- [x] Limpers ahead of hero (~40% of ring open spots): iso-or-overlimp-or-fold, iso sized +1bb/limper — existing `rfiTighten()` machinery produces the tighter iso range automatically; limpers respond call-heavy (`limperVsRaise`)
- [x] Multiway flops: `continuation()` walks the whole field collecting callers (up to 3); postflop zones take `ctx.mw` — value tightens ~7pts/opponent, bluff bands collapse (×0.45 two-way, ×0.2 three+), showdowns via `winPMw`; `mw=1` verified byte-identical to old behavior
- [x] Squeeze spots: cold-callers between open and hero; call widens, 3-bet → value-lean squeeze sized `3-bet + open per caller`; continuation covers fold-out (dead-money win), opener-continues, sticky-caller-peels
- [x] Defender multiway (`defMw`): family-pot bets tighten continues, raises value-only; after hero calls, rest step aside (documented simplification)
- [x] Coach notes speak all three natively (iso rationale, overlimp rationale, squeeze math, "c-betting your whole range is a heads-up play, not a family-pot play")
- [x] Full-hand multiway (2026-07-20): limpers by type, cold-callers, and the BB check-your-option spot (no fold button; check-covers-all zones)

### C8 — Asymmetric stacks ✅ shipped 2026-07-20 (user feedback: varied stacks create the tricky live situations)
- [x] Hero options extended to 300/500bb; per-villain profile-flavored stacks (`vilStk`), shown on chips/seats tinted short/deep, decremented street by street
- [x] True effective stacks (`effVs`) at every confrontation; multiway depth governed by the deepest live opponent
- [x] Priced-in short stacks (`respondToBetStk`): fold frequency collapses near all-in; call-all-in-for-less with `aiN` showdown riders
- [x] Depth-aware zones: short opener tightens calls ×0.75, 250bb+ widens ×1.12, deep SPR dp cap 4→6; coach covers "priced in vs who you're really playing" asymmetry + deep-water one-pair warnings
- [x] Persistent roster stacks across full-hand hands (2026-07-20; felted seats re-buy). Still open: true side-pot accounting (approximated via showdown-count riders)

### C5 — Player-read trainer (backlog, post-launch candidate)
The direct product answer to "how do I determine which style this player really is": a drill that shows betting lines/showdowns and asks the user to name the archetype, plus per-seat observed-tendency notes in full-hand mode that converge on a suggested type (the villain-side mirror of `sessionImage()`). Strong candidate for the first major post-launch Pro feature — it *is* the marketing niche as a feature.

**Sequencing:** C4 schema line + C0 rename land with A0 (both shape what accumulates/what launches) — ✅ done. C1 before store launch. C2 before launch (screenshots). C3 can trail into A3 as the first post-launch Pro feature (or C5 if it tests better).

---

## Track D — Infrastructure, crowd-solver & hand-completeness (2026-07-22 → 07-24)

Everything in this track is **shipped and live** unless marked otherwise. Live app: https://dirac1974.github.io/leak-lab/

### D0 — Dedicated Supabase project ✅ done 2026-07-24
- [x] App moved off the shared trading-bot project onto its own (`ybjfjezjditidhoocygc`). `src/supabase-config.json` is the single source of truth (client + CSP `connect-src` both read it).
- [x] External posture re-verified holding only the publishable key: `bash supabase/verify.sh <url> <key>` → 9/9 (samples writable/not readable, cache readable/not writable, no unexpected tables exposed).
- [x] Old project's `ll_events`/`ll_sessions` dropped; trading tables verified untouched.
- [x] **Manual, still open:** Auth → URL Configuration on the new project (Site URL `https://dirac1974.github.io/leak-lab/` + redirect `…/**`). **Magic-link login is broken until this is set.** Everything else (anonymous play, telemetry, sampling) works without it.

### D1 — Table sizes 5–10 max ✅ done 2026-07-23
- [x] Positions/RFI generated from seat count + players-behind (`EP_NAMES`, `RFI_BY_BEHIND`); selector offers 10/9/8/7/6/5 plus Heads-up.
- [x] 6-max and 9-max RFI rows kept **byte-identical** to the hand-tuned originals (`RFI_TUNED`) — no calibrated value changed.
- [ ] **Unaudited:** the generated 5/7/8/10-max RFI rows (provenance noted in-code). Internally consistent and snapshot-tested; worth a sanity pass against public charts for those sizes when convenient.

### D2 — Crowd-pooled board equity (SHADOW — does not affect grading) 
The accuracy play: postflop jams are currently priced off a **preflop-only** baked curve (`src/data/jam-equity.js`), which is blind to the actual board. This pipeline fixes that with real board equities, pooled across users.
- [x] Tables live: `ll_equity_samples` (anonymous, insert-only, unreadable by the app key) + `ll_equity_cache` (only `confirmed` rows readable; writes are service-role only). Migration `supabase/migrations/0002_equity_cache.sql`.
- [x] Canonical keys: `equityKey()` collapses suit-isomorphic/card-order duplicates (24 permutations, lexicographically smallest wins). `EQUITY_MODEL_V` versions the range model so stale samples are ignored.
- [x] **Bucket aggregation** — the important design call. Exact spots almost never repeat across users (~1M+ canonical flops per profile), so samples also pool into `profile × street × texture × strength-decile` cells via `bucketKeyOf()` — the same abstraction the strategy zones grade on. `boardEquity()` looks up exact → bucket → null.
- [x] Collection: on-device **Web Worker** (`src/equity-worker.js`, built to `equity-worker.js`; shares `src/mc-engine.js` with the app) samples the postflop spot the user is on. "SHARED SOLVER" toggle in Setup, **ON by default**, persisted as `ll_contribute`, paused whenever the tab isn't visible, ~24k trials/spot, capped per session.
- [x] Aggregation: `.github/workflows/aggregate-equity.yml` (nightly 09:17 UTC + manual dispatch) → `npm run sim:aggregate` → `npm run bake:equity` → commits `src/data/equity-cache.js` → normal deploy. Verified authenticating in CI; soft-skips green without the secret.
- [x] Trust model: the crowd only decides **which** cells are worth caching; the published number is always an **authoritative server-side recompute** (buckets: weighted recompute of up to `BUCKET_MEMBER_CAP` most-observed members, capping logged). Confirm requires `N_MIN` trials across `SID_MIN` distinct devices, per-device capped, and pool-vs-recompute agreement within `TOL`/`TOL_BUCKET`.
- [ ] **Gate to go live:** `EQUITY_CACHE_LIVE = false` in `src/leak-lab.jsx`. Flip once confirmed rows are baked **and** a comparison (bucket equity vs the preflop curve vs a fresh MC on sampled members) looks sane. The reason to look first is concrete, not procedural: banked history is immutable, so grades produced from bad numbers can't be retro-fixed.

### D3 — Session auto-banking ✅ done 2026-07-24
- [x] Auto-banks every **10 completed hands** (full mode) or **30 decisions** (drill), then rolls into a fresh session; leaving the training screen banks the trailing partial. Manual "Bank current session" button removed.
- [x] Trend chart rolls records up to **one decision-weighted point per calendar day** (`dailyRollup`) — "ACCURACY BY DAY" — so frequent banking doesn't clutter it. Stat tiles still count raw sessions/decisions.

### D4 — Hands always play to completion ✅ done 2026-07-24
Three fixes, all driven by user reports, all fenced by permanent invariant tests:
- [x] **vsRaise stage** — the two old "hand logged" dead-ends are gone. Villain raises hero's bet → real fold/call/jam decision (facing banner "RAISES TO / RAISES ALL-IN", to-call from the raise increment). Hero raises and villain continues → call gives hero the lead next street, re-jam becomes all-in vsRaise, called jam settles as a showdown.
- [x] **BB check-option crash** — limped pots where hero holds the BB built a flop with no villain (`sc.vil` undefined), so the next tap threw and React silently dropped it: the hand appeared frozen. Bettor is now resolved by seat, not the literal `"BB"`.
- [x] **donk/probe stage** — OOP hero now gets the real first-action decision (check or lead) instead of being auto-checked into the c-bet; and when the aggressor slows down, the next street becomes hero's probe decision instead of collapsing to an instant showdown. Also covers the in-position stab when the opener checks.
- [ ] **Unaudited:** the `vsRaise` and `donk`/probe bands (authored, provenance in-code). Guarded today by directional invariants in `npm test` and hand review. The MC oracle can't reach them yet — see the blocker in the Handoff section.
- [ ] Known simplifications left: multiway pots still use the compressed flop flow (heads-up is fully expanded); no true side-pot accounting (approximated by showdown-count riders).

### D6 — Commitment / price awareness ✅ done 2026-07-24 (user hand report)
The model had no concept of being **pot-committed**: the strength bands barely moved with stack depth (bet band travelled only 23.6 → 34.1 from SPR 6 down to SPR 0.075), so a forced 5.5bb shove into a 73.5bb pot with AK-high + gutshot was graded a 1.24bb *leak* while "check" was called best. MC on that exact spot: needs 6.5% equity, has 33–50%, jam worth +22 to +36bb. Related complaint from the same session — the engine can recommend a line that commits you and then penalize completing it.
- [x] `priceFloor()`: when a decision **closes the action** (all-in either way) there are no future streets, no raise risk and full equity realization, so pot odds decide it — required equity `a/(p+2a)`, mapped onto the engine's own percentile proxy. Margins (`PRICE_MARGIN_BET` 1.6, `PRICE_MARGIN_CALL` 1.25) demand a multiple of the raw price because the proxy is optimistic for weak hands.
- [x] Applied to **every** postflop path, not just the reported one: aggressor jams (`cbet`/`barrel`/`riverBet`/`donk` → single ALL-IN band), covered defenders (`vsCbet`/`vsBarrel`/`riverCall` → pure call-off price, and the phantom "raise" button is gone when facing an all-in), and `vsRaise` (priced on what hero actually owes via `ctx.callFrac`, so the price *replaces* the heuristic — cheap call-off near-automatic, expensive one near-nuts).
- [x] Same root cause fixed in two more places: `heroBetOpts()` and `betInfo()` reported the *intended* sizing fraction even when the stack capped the bet, so a forced 15%-pot shove was graded (and responded to) as a 125% barrel. They now report the true fraction.
- [x] General invariant tests so this can't reappear on a future path: sweeps every postflop stage × 6 textures × depths asserting committed stacks shove, covered defenders call by price, no phantom raise band, and value bands never widen as stacks get deeper — plus the reported hand pinned end to end.
- [ ] **Unaudited:** the two margins (the pot-odds part is an identity; the margins are the judgement call). Checked against MC on the reported hand. Known limitation, documented in the test: at pathological call prices (>3× pot) the percentile proxy is too optimistic; realistic prices are where it holds up.

### D5 — Test harness state
`npm test` = **178 checks** (was 60 on 07-20) and blocks deploys. Layers: zone snapshots (`npm test -- write` to regenerate — verify the diff is additions-only), partition/GTO-anchoring invariants, metamorphic/directional swaps, coach-note-vs-grader consistency, stackoff pricing, `dailyRollup`, equity-cache keys + hierarchical lookup, and **two walk suites** (400 drill walks + 200 full-hand `genHand` walks per run) asserting every continuation settles or continues, terminates, and never dead-ends. Also: `npm run sim:aggregate -- --self-test` (16 checks, no DB/secret needed) and `npm run sim:oracle` (report-only MC audit).

---

## Handoff — start here in a new session

**Read order:** this file → latest `MEMORY.md` entry → `supabase/README.md` (cutover + aggregator runbook) → `DEPLOY.md`.

**Verify the tree is healthy:** `npm test` (expect 168 passing) and `npm run build`.

**Three switches that are deliberately OFF, and what each needs:**
1. `EQUITY_CACHE_LIVE` (`src/leak-lab.jsx`) — needs confirmed rows baked, then the comparison in D2.
2. Supabase **Auth URL config** — dashboard-only, David; magic-link login stays broken until then. See D0.
3. `SUPABASE_SERVICE_ROLE_KEY` — ✅ now set as an **Actions** repository secret (a first attempt landed in Codespaces secrets, which Actions can't read; if aggregation ever "skips", check the tab). Nightly runs authenticate.

**Next actions, in order:**
1. **Watch the pool fill.** `select count(*), count(distinct k), count(distinct sid) from ll_equity_samples;` — buckets need ≥2 distinct devices, so a second device is what unblocks the first confirmations. Then dispatch the aggregate workflow and read its `buckets:` line.
2. **Compare and decide on `EQUITY_CACHE_LIVE`** once rows confirm (bucket equity vs preflop curve vs fresh MC).
3. **Extend the MC oracle to postflop raise/lead spots.** Right now `npm run sim:oracle` can only audit `vsJam`, because profiles carry postflop raise *frequencies*, not raise *ranges* — there's nothing to deal the raiser's holdings from. Add a postflop range model and the authored bands (D1/D4/D6) become oracle-checkable instead of review-only. This is the single highest-leverage accuracy item.
4. **Then back to Track A/C** — A1 seeding is still the gate on all store spend; C1's pot-scaled postflop EV and C3 range-narrowing are the next product features.

**Conventions that matter here:** feature branches + fast-forward merges to `main` (never force-push); shadow-mode first for anything that touches grading; secrets only ever in GitHub/Supabase secret stores.

**How strategy numbers get validated in THIS project** (there is no Stats sign-off here — that's a trading-bot rule, not a Leak Lab one):
1. A **provenance comment** at the table saying where the numbers came from — hand-tuned, public-consensus adjacent, MC-derived, or authored — so the next reader knows what they're trusting.
2. **`npm test`** — the zone snapshot (a strategy change must show up as a deliberate diff) plus directional/metamorphic invariants that catch a parameter the model silently ignores.
3. **`npm run sim:oracle`** — the MC oracle, where it can reach the spot (`vsJam` today; postflop raise/lead needs the range model above).
4. **David's hand review** — several of the sharpest fixes in this repo came from a screenshot of a spot that looked wrong, including the commitment bug in D6. Treat it as a first-class validation channel.

---

## Calendar (parallel tracks)

| Month | Track A | Track B | Track C |
|---|---|---|---|
| 0–1 | A0 decisions + fixes; A1 telemetry + seeding | B0 evaluator | C0 rename + C4 schema (with A0); C1 hardening |
| 1–2 | A1 gate read → A2 if passed | B1 bomb-pot sims (overnights) | C2 range viewer; C4 rest |
| 2–3 | A2 beta → A3 launch | B2 PLO preflop table | C3 range narrowing |
| 3–6 | A3 cadence; A4 review at day 90 | B3 zone calibration iterations |
| 6–9 | Omaha add-on build-out (if A4 passed) | B4 PLO8 / Big O |
| 9–12 | Omaha tier launch (+$4.99/mo add-on or $9.99 Everything) | Refinement vs real-user data |

---

## Decision log

| Date | Decision | Choice | Notes |
|---|---|---|---|
| 2026-07-20 | React 19 vs 18 | **React 19** | matches production; package.json ^19.2.0 |
| 2026-07-20 | Deploy source | **GitHub Actions workflow** | CI builds from src/; drift impossible |
| 2026-07-20 | Positioning (C0) | **Practical live-strategy** | "real players, real spots" — David's direction; shipped |
| 2026-07-23 | Cloud-session fork vs local `main` | **Port only the 5–10-max tables** | Cloud snapshot branched off the very first commit; its multiway/showdown/vsRaise work was superseded by local. Ported the one genuinely new idea, discarded the rest. |
| 2026-07-24 | Supabase project | **Finish the cutover** | Dedicated project + config repointed; old tables dropped. Shared trading DB was the blast-radius risk. |
| 2026-07-24 | Background sampling default | **ON by default, Web Worker** | David's call over opt-in/idle-chunks. Worker = zero UI jank; visibility-gated so it only runs while the app is foregrounded. |
| 2026-07-24 | Equity pooling granularity | **Exact + texture×strength buckets** | David spotted the combinatorics problem: exact spots never repeat across users, so the confirm gate would starve. Buckets match the zone abstraction and converge. |
| 2026-07-24 | Banking cadence | **Auto-bank ~10 hands, chart daily** | David: bank often for safety, aggregate the trend per day. Manual button removed as redundant. |
| 2026-07-24 | Go live on board equity now? | **No — hold in shadow** | Cache is empty, so flipping gains nothing today, and banked grades are immutable. Walk-forward first, then flip. |
| — | Pro pricing $6.99/$49.99 | proposed | confirm at A2 |
| — | Omaha as add-on vs Everything tier | proposed both | decide at A4 |
