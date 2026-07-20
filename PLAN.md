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
- [ ] Bundle Barlow Condensed + IBM Plex Mono locally (removes the runtime Google Fonts fetch; makes offline true; store-privacy posture)
- [ ] Migrate `store` (localStorage) to a hydration-at-boot pattern so the Capacitor native-storage swap in A2 is a drop-in

**Owner:** decisions = David; implementation = Claude sessions. **Cost: $0.**

### A1 — Validate with the live web app (~4 weeks, $0)
- [ ] Add privacy-light telemetry (a Supabase `events` table on the existing free project — no analytics vendor): app_open, session_banked, return-visit day
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
- [ ] Supabase: add `leaks jsonb`, `opps jsonb` to `ll_sessions`; extend insert/fetch; account-deletion flow (Apple 5.1.1(v) requirement)
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

### B0 — The evaluator (build first; everything depends on it) — ~2–3 weeks of coding, minutes of compute
- [ ] Exact 5-card ranker (7,462 equivalence classes, lookup-table based)
- [ ] Omaha high: best of C(4,2)×C(5,3) = 60 evals/hand (C(5,2)×10 = 100 for Big O)
- [ ] Low-8 evaluator (2-of-hole + 3-of-board, 8-or-better)
- [ ] Correctness suite vs known hand rankings; cross-check a sample against an online Omaha calculator
- [ ] Benchmark gate: ≥1M 5-card evals/sec/core in Node
- [ ] Same module runs in a web worker in-app (for live coaching math) and in Node (for table generation)

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
- [ ] Provenance comments on every table: which numbers are public-chart consensus vs authored live adjustment (audit found the live tightening half-explicit in `defTighten()`, half-invisible in base numbers)
- [ ] Position-aware 3-bet defense: replace scalar `VS3B`/`VS4B` with opener-seat × 3-bettor-seat aware thresholds
- [ ] Live-population pass on `PROFILES`: GTO Bot 3-bets 15% vs opens — live tables run 4–7%; recalibrate baseline + add a "Live Reg" default lineup
- [ ] Pot-scale postflop EV pricing (flat 0.12bb/pct today regardless of pot; `gradeSized` already pot-scales sizing leaks — extend to distance leaks)
- [ ] Words audit pass: every fixed claim in `adviceFor`/`exploitFor` traced to a param or math note in a comment (the injected-numbers architecture already keeps most of it honest)
- [ ] Snapshot tests on all zone tables so future calibration changes are deliberate diffs, not drift

### C2 — Profile range viewer in setup (~1 session)
- [ ] 13×13 grid per profile × position: cells colored open / limp-band / fold from `PCT` × `TABLES.rfi` × profile `rfi` multiplier (stake-aware via `rfiTighten`)
- [ ] Position chips to flip through; lives inside the existing tap-profile detail panel next to `profDetail()` words
- [ ] Label as "model range — top-X% by hand strength" (percentile-nested ranges approximate real charts; the grid also visually exposes any `handScore` ordering quirks worth hand-tuning)
- [ ] Free-tier feature — it's a teaching hook and store-screenshot material

### C3 — Live range-narrowing view (~2–3 sessions)
- [ ] "RANGE" button during training: villain's current range as a combo grid that narrows street by street
- [ ] Mechanic: preflop range (profile × position threshold) → expand to combos minus board/hero blockers → per action, sort by `classify()` rank and fold the bottom f%, raise the top r%, call the middle — consistent with the profile's aggregate frequencies
- [ ] Show combo count shrinking ("612 → 287") + one injected-numbers line ("Station folds only 12% — the range barely narrows; thin value prints")
- [ ] Cheap compute (≤1,326 combos × classify per street); Pro-tier feature after trial

### C4 — Leak-history completion (~1 session; schema item ships with A0)
- [x] **Shipped with A0 commit:** `oppSnapshot` extended to `{n, good}` per stage (readers accept legacy bare numbers via `oppCount()`); stage-accuracy trends now reconstructible from all future banked history
- [ ] Progress view: "biggest mover" summary (top improving + top worsening leak from `leakTrend`) above the accuracy chart
- [x] JSON backup + merge-restore in Progress (shipped 2026-07-20 after a real user data-eviction report; sessions dedupe on `(t, n)`, nothing clobbered). CSV export for Pro remains open.
- [x] PWA installability shipped early for the same reason (manifest + network-first service worker + generated icons via `tools/make-icons.js`): installed home-screen apps are exempt from iOS Safari's 7-day storage eviction and run offline. This was the A2/PWA roadmap item — pulled forward.
- [ ] Surface `store.set` quota failure instead of silent drop
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
- [ ] Full-hand mode multiway (genHand pre-hero simulation still single-track) — follow-up

### C8 — Asymmetric stacks ✅ shipped 2026-07-20 (user feedback: varied stacks create the tricky live situations)
- [x] Hero options extended to 300/500bb; per-villain profile-flavored stacks (`vilStk`), shown on chips/seats tinted short/deep, decremented street by street
- [x] True effective stacks (`effVs`) at every confrontation; multiway depth governed by the deepest live opponent
- [x] Priced-in short stacks (`respondToBetStk`): fold frequency collapses near all-in; call-all-in-for-less with `aiN` showdown riders
- [x] Depth-aware zones: short opener tightens calls ×0.75, 250bb+ widens ×1.12, deep SPR dp cap 4→6; coach covers "priced in vs who you're really playing" asymmetry + deep-water one-pair warnings
- [ ] Follow-ups: persistent roster stacks across full-hand-mode hands; true side-pot accounting (currently approximated via showdown-count riders)

### C5 — Player-read trainer (backlog, post-launch candidate)
The direct product answer to "how do I determine which style this player really is": a drill that shows betting lines/showdowns and asks the user to name the archetype, plus per-seat observed-tendency notes in full-hand mode that converge on a suggested type (the villain-side mirror of `sessionImage()`). Strong candidate for the first major post-launch Pro feature — it *is* the marketing niche as a feature.

**Sequencing:** C4 schema line + C0 rename land with A0 (both shape what accumulates/what launches) — ✅ done. C1 before store launch. C2 before launch (screenshots). C3 can trail into A3 as the first post-launch Pro feature (or C5 if it tests better).

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
| — | Pro pricing $6.99/$49.99 | proposed | confirm at A2 |
| — | Omaha as add-on vs Everything tier | proposed both | decide at A4 |
