# 🃏 Leak Lab — Live Poker Strategy Trainer

**You aren't playing against a GTO bot. Neither is anyone at your table.**
Leak Lab is a mobile-first No-Limit Hold'em trainer for *real* games: learn to spot which player type you're facing — the Nit, the Station, the LAG, the Maniac — learn what they're actually doing, and drill the adjustments that beat them. Every decision is graded against a solid baseline, every deviation explained, and every mistake priced in the big blinds and dollars of *your* stakes.

### ▶️ Live app

**https://dirac1974.github.io/leak-lab/**

Open it on your phone — it's a single self-contained page that runs entirely in the browser, works offline once loaded, and installs to your home screen as a real app (tap Share → Add to Home Screen).

> No account required, no tracking. Progress saves on your device — and because browsers can clear website data (iPhone Safari deletes it after 7 days away), **install to your home screen** (an installed app's storage is protected), **back up to a file** from the Progress tab, or **sign in with email** to sync sessions to the cloud.

---

## What it does

Leak Lab runs a fast decision loop: **deal → decide → grade → learn.**

- **Two ways to play.** *Drill spots* for fast reps of one decision type, or *Full hands* — play a hand start to finish with a **dealer button that rotates** each hand, so you cycle through every seat (UTG → CO → button → blinds) exactly like a live game. Arrange your lineup so the tricky players sit where they really do, and find your weakest positions faster.
- **Profile the table.** Nine-max, six-max, or heads-up. Seat each opponent as one of six archetypes — GTO Bot, Nit, TAG, LAG, Station, or Maniac — each with its own opening, 3-bet, and postflop tendencies. Tap any player type for **how to spot one live** (the tells that identify them), a plain-language read, *and* the exact ranges assumed for it.
- **Set your own table image.** Tell the app how the table reads you — Unknown, Rock, Solid, LAG, Splashy, or Wild — or let it derive your image from your actual session tendencies. All the advice then tailors to *your* style.
- **Drill any spot.** Opens, defending vs opens, 3-bet pots, c-bets, defending vs c-bets, and river decisions. Focus filters jump you straight to the spot you want to sharpen.
- **Three layers of coaching on every decision.** A **GTO baseline** (the unexploitable play and why), an **Exploit** note (how to deviate against this specific player type, and why it beats GTO here), and a **Their Read** note (what the opponent is likely thinking — factoring in how they perceive *you*).
- **Compare results to EV.** In full-hand mode, every hand shows your actual result against the EV your decisions were worth — so you learn to separate a good play from a lucky one, and a bad beat from a real leak.
- **Play real streets.** Preflop decisions chain into flops, turns, and rivers with a texture-aware hand-strength engine. Board archetype, SPR, and the size you're facing all shift the correct play.
- **Bet like it's a live game.** Multiple bet sizes per street, rounded to real chips ($1 increments at $1/$2 and $1/$3, $5 at $2/$5). Where the solver mixes sizes, mixing is graded as fine; where it doesn't, the wrong size is flagged as a sizing leak.
- **See the money.** Pick your stake ($1/$2, $1/$3, $2/$5) and starting stack (40–200bb). Every pot, bet, and EV number converts to dollars. Effective stacks track every chip that goes in.
- **Get coached.** After each decision, a **Coach's Note** explains *why* the chart says what it says — and the criteria for when the other choice becomes correct (opponent tendencies, price, texture, SPR).
- **Find your leaks.** Every mistake is logged, ranked by EV lost, and priced in dollars. One tap drills that exact leak until it's gone.

---

## Repository layout

```
leak-lab/
├── index.html              ← the built, self-contained app (served by GitHub Pages)
├── src/
│   ├── leak-lab.jsx         ← the entire application (engine + UI, single file)
│   └── entry.jsx            ← React mount point used by the build
├── package.json             ← build scripts
├── DESIGN.md                ← architecture & agent design structure (read this to extend it)
├── .github/workflows/
│   └── pages.yml            ← optional auto-deploy to GitHub Pages on push
├── LICENSE
└── README.md
```

The app is deliberately a **single source file** (`src/leak-lab.jsx`). Everything — the hand-ranking math, the range tables, the postflop classifier, the grader, the advice engine, and the React UI — lives there, in labeled sections. See [DESIGN.md](./DESIGN.md) for the full map.

---

## Run it locally

You only need [Node.js](https://nodejs.org) (18+).

```bash
# install the build tool + React
npm install

# build index.html from source
npm run build

# then open index.html in any browser, or serve it:
npm run serve      # → http://localhost:8080
```

There's no framework and no dev server dependency — the build is a single `esbuild` call that bundles `src/entry.jsx` and inlines it into `index.html`.

---

## Deploy your own copy

`index.html` is already built and committed, so **GitHub Pages needs no build step.**

**Option A — deploy from branch (simplest):**
1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, branch **`main`**, folder **`/ (root)`**, then **Save**.
4. Wait ~1 minute. Your app is live at `https://<your-username>.github.io/leak-lab/`.

**Option B — GitHub Actions (auto-rebuilds on every push):**
1. Under **Settings → Pages → Source**, choose **GitHub Actions**.
2. The included `.github/workflows/pages.yml` builds from source and deploys automatically on every push to `main`.

---

## Honest limitations

- **Ranges are solver-*calibrated*, not solver-*exact*.** Preflop uses precomputed GTO opening/defending charts. Postflop uses strategy tables keyed to board archetype, SPR, and bet size, tuned to published aggregate frequencies — not a live per-hand solve (that needs desktop-class compute and licensed data). If you have GTO Wizard or PioSolver aggregate exports, they can be wired straight into the tables.
- **EV is a distance heuristic,** not a solver EV readout — it scales with how far your choice sits from the correct region and with pot size, which is right directionally but not exact.
- **Villain raises postflop end the hand** with a note; raise-defense drilling is the next spot type on the roadmap.
- **No persistence.** Sessions are in-memory by design and reset on reload.

---

## License

MIT — see [LICENSE](./LICENSE).
