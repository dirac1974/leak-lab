# Leak Lab — Design & Architecture

This document is the map of how Leak Lab works: the agent/data-model design, the engine layers, and the flow of a single hand from deal to grade. Read it before extending the app — every piece lives in one file (`src/leak-lab.jsx`), organized into the labeled sections described below.

---

## 1. Design goals

1. **Zero backend, zero solver load on the device.** Everything is a precomputed lookup or a cheap heuristic. A phone can run it with no server round-trips. This is the core constraint that shapes every other decision.
2. **Find leaks fast.** The unit of value is *EV lost*, ranked and priced in the user's actual stakes. The whole loop exists to surface and drill leaks.
3. **Opponent-aware.** Real leaks are relative to who you're playing. The profile system is what lets the coaching say "deviate *because of this player*," which is the app's reason to exist.
4. **Live-game realism.** Chip-rounded bets, real stack depths, effective-stack tracking, multiple bet sizes — so the practice transfers to a real table.

---

## 2. The agent model: opponent profiles

The central abstraction is the **profile** — a compact behavioral model of a player archetype. Six ship by default (`PROFILES`):

| Profile | Icon | One-line read | Style |
|---|---|---|---|
| GTO Bot | ⚖️ | Balanced, textbook frequencies | baseline |
| Nit | 🪨 | Ultra-tight, waits for premiums | tight-passive |
| TAG | 🎯 | Tight-aggressive reg, picks spots | tight-aggressive |
| LAG | 🔥 | Loose-aggressive, relentless pressure | loose-aggressive |
| Station | 📞 | Calling station, never folds | loose-passive |
| Maniac | 💣 | Hyper-aggro, raises anything | hyper-aggressive |

Each profile is a plain object of behavioral parameters:

```js
{
  id, name, icon, desc,
  rfi,                       // open-raise width as a multiplier on the GTO baseline (1.0 = GTO)
  cbet,                      // flop c-bet frequency (0–1)
  vsRaise: { f, c, r },      // response to hero's open:    fold / call / 3-bet
  vs3:     { f, c, r },      // response to hero's 3-/4-bet: fold / call / raise
  vsBet:   { f, c, r },      // response to hero's postflop bet: fold / call / raise
}
```

These parameters drive three things:
- **Scenario generation** — how likely this villain is to open, and what they do facing your action.
- **Continuation** — what the villain actually does after you act (via `respond()` / `respondToBet()`, weighted random draws over the fold/call/raise triples).
- **Coaching** — the advice engine reads these numbers to tell you how to deviate (e.g. "Station calls 83% — go value-heavy, bluff less").

The `profDetail()` function renders a profile's assumed ranges into plain words for the in-app detail view, so a user who doesn't know what "LAG" means can tap and see exactly what's being modeled.

**To add an archetype:** append one object to `PROFILES`. Everything else — seat selection, scenario generation, coaching — picks it up automatically.

---

## 3. Engine layers

The engine is a stack of pure functions. Each layer depends only on the ones below it, which is what keeps 950 lines testable without a UI.

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React)  — Setup / Train / Leaks views, action bar       │
├─────────────────────────────────────────────────────────────┤
│  adviceFor()          — the Coach's Note (why + when to alt) │
│  gradeSized / grade   — verdict + EV lost, size-aware        │
│  zonesFor()           — the correct strategy for a spot      │
├─────────────────────────────────────────────────────────────┤
│  continuation()       — villain response + street chaining   │
│  genScenario / genPostDrill — build the next spot            │
├─────────────────────────────────────────────────────────────┤
│  classify()           — hand strength vs a board (0–99)      │
│  textureBucket()      — board archetype                      │
│  handScore/RANKED     — 169-class preflop hand ranking       │
│  chip / pot / stack math                                     │
└─────────────────────────────────────────────────────────────┘
```

### 3a. Preflop hand ranking
`handScore()` scores every one of the 169 starting-hand classes; they're sorted once into `RANKED` with combo-weighted percentiles (0 = best hand, 100 = worst). Every preflop range is expressed as a percentile threshold, so "open the top 15%" is a single comparison.

### 3b. Range tables
`TABLES` holds precomputed opening ranges per seat for 9-max and 6-max; `defendChart()` returns fold/call/raise thresholds for defending, keyed to the opener's seat and table size. These are the "GTO baseline." Profiles scale off them via their `rfi` multiplier.

### 3c. Postflop hand strength
`classify(hole, board)` returns `{ rank, label }` where **rank 1 = nuts, 99 = air**. It detects made hands (quads → pair) and draws (flush/OES/gutshot/overcards), with draw value decaying by street (full on the flop, partial on the turn, zero on the river). `textureBucket(board)` labels the board as one of six archetypes — `ahi`, `bwy`, `paired`, `mono`, `wet`, `low` — which is the key the postflop strategy tables are indexed by.

### 3d. Strategy: `zonesFor()`
The heart of the app. Given a spot, it returns an ordered array of **zones** partitioning the 0–100 strength axis into actions:

```js
[{ a: "bet", sz: "s", sizes: ["s","b"], lbl: "BET 33%", from: 0, to: 44 },
 { a: "check", from: 44, to: 62 },
 { a: "bet", sz: "b", sizes: ["b"], lbl: "BET 75%", from: 62, to: 86 },
 { a: "check", from: 86, to: 100 }]
```

- Preflop zones come from the percentile tables.
- Postflop zones come from per-archetype base tables, then shift with **SPR** (shallow widens value/stack-off; deep tightens thin value) and the **size faced** (defense thresholds scale by minimum-defense-frequency math).
- Aggressor zones carry a **preferred size** (`sz`) and the **set of acceptable sizes** (`sizes`) — this is what encodes solver-style mixing. Static boards prefer small with a big mix; polarized boards demand big.

### 3e. Grading: `grade()` and `gradeSized()`
`grade()` finds which zone the hand falls in. Exact match → **GTO**. Within a small margin of the correct region → **MIXED (fine)**, small EV give-up. Otherwise → **LEAK**, with EV lost scaling by distance and capped.

`gradeSized()` extends this for aggressor spots: right region + right size = GTO; a *listed* mix size = fine; the *wrong* size in the right region = a **sizing leak** (pot-scaled). `resolveLeak()` maps any miss to a leak category.

### 3f. Continuation & chaining: `continuation()`
After you act, this returns narration text and — crucially — an optional `nextSc`, a fully-formed next scenario. Preflop calls chain into flops; flop calls chain to turns; turns to rivers. Villain responses are drawn from the acting profile's parameters. All bets are chip-rounded and stack-capped; when a bet would exceed the effective stack it becomes an all-in and the hand resolves to showdown. This is what makes a single "hand" play out over multiple streets in one continuous session.

### 3g. Coaching: `adviceFor()`
Reads the same zones the grader used and produces the **Coach's Note**: a texture/price/SPR-aware explanation of the correct region, plus a profile-specific *alternative-choice criterion* — the condition under which the other action becomes right. This is the layer that turns a grade into a lesson.

---

## 4. Money & stacks

- `STAKES` defines the three live stakes with their big-blind dollar value, small-blind size, and **chip increment** ($1 or $5).
- `chipBB()` rounds any big-blind amount to a clean live-chip dollar amount and converts back — so every displayed bet sits on a real chip grid.
- `STACK_OPTS` = `[40, 60, 100, 150, 200]` big blinds; 200 is the cap.
- Every scenario carries `effBB` (effective stack behind), decremented as chips go in across streets. Bets, raises, and all-ins all respect it.

---

## 5. Leak taxonomy

`LEAKS` maps a stable key → `{ label, drill }`, where `drill` is the focus filter that isolates that leak. Categories span preflop (opening too wide/tight, over-folding, flatting 3-bet hands…) and postflop (missing c-bets, over-folding vs c-bets, stationing, missing raises, sizing too small/big, river over/under-value). `leakKey()` / `resolveLeak()` classify each miss. Sessions aggregate leaks by EV lost; the Leaks view ranks them and offers one-tap drilling.

---

## 6. Data flow of one hand

```
Setup (mode, lineup, stake, stack, focus)
        │
        ▼
genScenario / genPostDrill ──► scenario {stage, hand, board?, potBB, effBB, vil, …}
        │
        ▼
zonesFor(stage, ctx) ──► correct strategy zones
        │
   user taps an action
        │
        ▼
grade / gradeSized ──► verdict + EV lost ──► session leak log
        │
        ├──► adviceFor() ──► Coach's Note
        │
        ▼
continuation(action) ──► narration + optional nextSc
        │
   nextSc? ── yes ──► becomes the next scenario (next street)
        │
        no ──► deal a fresh scenario
```

---

## 7. Build & bundling

There is no framework. `src/entry.jsx` mounts `App` from `src/leak-lab.jsx`. The build is a single `esbuild` bundle+minify pass whose output is inlined into `index.html` (see `package.json`). The result is one self-contained HTML file with React bundled in — no external requests, trivially hostable on GitHub Pages or any static host.

---

## 8. Extension points

- **New opponent archetype** → add to `PROFILES`.
- **Solver-exact postflop** → replace the per-archetype base tables inside `zonesFor()` with values from GTO Wizard / Pio aggregate exports (the structure already matches: value / check / bluff regions per texture, with size sets).
- **Raise-defense drills** → add stages to `POST_STAGES`, extend `zonesFor()` and `continuation()` for facing raises.
- **New stake** → add to `STAKES` with its blind size and chip increment.
- **Persistence / saved lineups** → the config object (`cfg`) and session (`sess`) are the two things to serialize.


---

## 9. Full-hand mode & the coaching stack (v1.1)

**Full-hand mode** (`cfg.play === "hand"`) plays a hand start to finish with a rotating button. A persistent `table = { btn, heroSeat, seats[] }` holds the physical lineup; `genHand(cfg, table)` maps each physical seat to a position via `POS_BY_OFFSET` (button-relative), simulates pre-hero action, and returns a scenario the existing `continuation` chains to showdown. Each new hand advances `btn` by one, so the hero cycles every position in real order. Folded-to-the-BB deals resolve as `stage: "walk"` and are auto-skipped.

**Outcome vs EV.** `continuation` returns a numeric `result` (hero net bb, approximated as ±½ the final pot since a heads-up pot is built from matched contributions) at every terminal. The app accumulates realized result and EV-lost per hand and per session, and contrasts them — teaching the difference between a +EV play and a won pot.

**The three coaching notes**, all generated at render time (rule-based, not stored, not LLM):
- `adviceFor()` — GTO baseline.
- `exploitFor()` — deviation vs the specific villain in the spot (6 profiles × 5 roles).
- `mindsetFor()` + `imageEdge()` — what the opponent is thinking, keyed on whether they're a *thinking* type (TAG/LAG/GTO adjust to your image; Nit/Station/Maniac don't), their role, and the hero's table **image**. `IMAGES` holds the six self-images; `sessionImage()` derives a suggested image from tracked aggression/passivity/fold tendencies.
