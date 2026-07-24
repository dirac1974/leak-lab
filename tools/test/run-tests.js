// Leak Lab test harness: bundles the app source headlessly (React stubbed out),
// then runs (1) zone-table snapshot checks so strategy changes are deliberate
// diffs, and (2) engine invariants. Run: npm test | regenerate: npm test -- write
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..", "..");
const tmp = path.join(__dirname, ".build");
fs.mkdirSync(tmp, { recursive: true });

// Build a CommonJS probe of the source with engine internals exported.
// Mirror the whole src/ tree so probe.jsx resolves every relative import the app
// has (fonts, data tables, config) without this list needing maintenance.
fs.cpSync(path.join(root, "src"), tmp, { recursive: true });
fs.copyFileSync(path.join(tmp, "leak-lab.jsx"), path.join(tmp, "src.jsx"));
fs.writeFileSync(path.join(tmp, "probe.jsx"),
  fs.readFileSync(path.join(tmp, "src.jsx"), "utf8") +
  "\nexport { zonesFor, grade, gradeSized, gradeRaise, gradeStackoff, adviceFor, leakObs, leakTrend, leakTotals, bucketOf, winPMw, respondToBetStk, effVs, vilStk, mergeHist, applyBackup, PROF, PROFILES, PCT, RANKED, TABLES, defendChart, MIX, GTO_JAMREP, equityKey, boardEquity, bucketKeyOf, mcEquity, jamEquity, EQUITY_MODEL_V, dailyRollup, continuation, genScenario, heroBetOpts, openIds, AGG_STAGES };\n");
esbuild.buildSync({
  entryPoints: [path.join(tmp, "probe.jsx")], bundle: true, format: "cjs",
  jsx: "automatic", loader: { ".jsx": "jsx" }, external: ["react", "react/jsx-runtime"],
  outfile: path.join(tmp, "probe.js"), logLevel: "silent",
});
const M = require(path.join(tmp, "probe.js"));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };

/* ---- 1. Zone snapshots: every stage × representative contexts ---- */
const SPOTS = [
  ["rfi CO 9max", "rfi", { rfiT: 26, bbv: 2, mode: "9max", heroPos: "CO" }],
  ["rfi CO +2 limpers", "rfi", { rfiT: 26, bbv: 2, mode: "9max", heroPos: "CO", limpers: 2 }],
  ["rfi vs station-heavy behind", "rfi", { rfiT: 26, bbv: 2, mode: "9max", heroPos: "CO", behindAgg: { r: 0.06, c: 0.8 } }],
  ["rfi vs aggro behind", "rfi", { rfiT: 26, bbv: 2, mode: "9max", heroPos: "CO", behindAgg: { r: 0.3, c: 0.5 } }],
  ["vsOpen BTN vs CO", "vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5 }],
  ["vsOpen vs nit opener", "vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 0.65 }],
  ["vsOpen vs maniac opener", "vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 1.7 }],
  ["vsOpen squeeze 2 callers", "vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, callers: 2 }],
  ["vsOpen short opener", "vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, effOpp: 30 }],
  ["vs3bet IP aggressor", "vs3bet", { heroPos: "CO", aggPos: "BTN" }],
  ["vs3bet blind aggressor short", "vs3bet", { heroPos: "CO", aggPos: "BB", effAgg: 30 }],
  ["vs4bet deep", "vs4bet", { effAgg: 300 }],
  ["cbet ahi IP", "cbet", { tb: "ahi", ip: true, spr: 6 }],
  ["cbet ahi vs station", "cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: 0.12, c: 0.83 } }],
  ["cbet ahi vs nit", "cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: 0.52, c: 0.4 } }],
  ["cbet wet 3way", "cbet", { tb: "wet", ip: false, spr: 4, mw: 3 }],
  ["barrel bwy", "barrel", { tb: "bwy", ip: true, spr: 3.5 }],
  ["vsCbet wet 66%", "vsCbet", { tb: "wet", spr: 5, frac: 0.66 }],
  ["vsCbet vs high-freq bettor", "vsCbet", { tb: "wet", spr: 5, frac: 0.66, vilCbet: 0.9 }],
  ["vsBarrel paired", "vsBarrel", { tb: "paired", spr: 3, frac: 0.7 }],
  ["riverBet shallow", "riverBet", { tb: "ahi", spr: 1.8 }],
  ["riverBet vs station", "riverBet", { tb: "ahi", spr: 4, vilBet: { f: 0.12, c: 0.83 } }],
  ["riverCall 150%", "riverCall", { tb: "low", spr: 2, frac: 1.5 }],
  ["vsJam", "vsJam", {}],
  ["vsRaise ahi", "vsRaise", { tb: "ahi", spr: 5 }],
  ["vsRaise wet shallow", "vsRaise", { tb: "wet", spr: 2 }],
  ["vsRaise all-in", "vsRaise", { tb: "ahi", spr: 5, allIn: true }],
  ["vsRaise vs maniac raiser", "vsRaise", { tb: "ahi", spr: 5, raiseF: 0.3 }],
];
const round2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);
const snap = {};
for (const [name, stage, ctx] of SPOTS) {
  snap[name] = M.zonesFor(stage, ctx).map((z) => ({ a: z.a, sz: z.sz, from: round2(z.from), to: round2(z.to) }));
}
const snapPath = path.join(__dirname, "zones.snapshot.json");
if (process.argv.includes("write")) {
  fs.writeFileSync(snapPath, JSON.stringify(snap, null, 1));
  console.log(`zones.snapshot.json written (${SPOTS.length} spots)`);
} else {
  const want = JSON.parse(fs.readFileSync(snapPath, "utf8"));
  for (const k of Object.keys(snap)) ok(`snapshot: ${k}`, JSON.stringify(snap[k]) === JSON.stringify(want[k]),
    `changed — if intentional, run: npm test -- write\n  now:  ${JSON.stringify(snap[k])}\n  was:  ${JSON.stringify(want[k])}`);
  for (const k of Object.keys(want)) if (!(k in snap)) ok(`snapshot: ${k}`, false, "spot removed");
}

/* ---- 2. Engine invariants ---- */
// GTO-anchoring: a GTO-Bot lineup reproduces the baseline chart exactly
const g = M.PROF.gto;
ok("gto-anchored rfi", JSON.stringify(M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max", behindAgg: { r: g.vsRaise.r, c: g.vsRaise.c } })) === JSON.stringify(M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max" })));
ok("gto-anchored vsOpen", JSON.stringify(M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: g.rfi })) === JSON.stringify(M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5 })));
ok("gto-anchored cbet", JSON.stringify(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: g.vsBet.f, c: g.vsBet.c } })) === JSON.stringify(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6 })));
// zones partition [0,100] without gaps for every snapshot spot
for (const [name, stage, ctx] of SPOTS) {
  const zs = M.zonesFor(stage, ctx);
  let okPart = Math.abs(zs[0].from) < 1e-9 && Math.abs(zs[zs.length - 1].to - 100) < 1e-9;
  for (let i = 1; i < zs.length; i++) if (Math.abs(zs[i].from - zs[i - 1].to) > 1e-9) okPart = false;
  ok(`partition: ${name}`, okPart);
}
// dynamics move the right direction
ok("station behind widens opens", M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max", behindAgg: { r: 0.06, c: 0.8 } })[0].to > M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max" })[0].to);
ok("aggro behind tightens opens", M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max", behindAgg: { r: 0.3, c: 0.5 } })[0].to < M.zonesFor("rfi", { rfiT: 26, bbv: 2, mode: "9max" })[0].to);
ok("nit opener defended tighter", M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 0.65 })[1].to < M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5 })[1].to);
ok("maniac opener defended wider", M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 1.7 })[1].to > M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5 })[1].to);
const bluffW = (zs) => zs.filter((z) => z.a === "bet").slice(1).reduce((s, z) => s + z.to - z.from, 0);
ok("bluffs die vs station", bluffW(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: 0.12, c: 0.83 } })) < bluffW(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6 })));
ok("thin value widens vs station", M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: 0.12, c: 0.83 } })[0].to > M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6 })[0].to);
ok("bluffs grow vs nit", bluffW(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6, vilBet: { f: 0.52, c: 0.4 } })) > bluffW(M.zonesFor("cbet", { tb: "ahi", ip: true, spr: 6 })));
// helpers
ok("winPMw powers", Math.abs(M.winPMw(0.5, 2) - 0.25) < 1e-9);
ok("effVs min-stack", M.effVs(500, 80, 5) === 75);

/* ---- 3. Stackoff (vsJam / vs4bet) villain + stack awareness ---- */
// The QQ-vs-nit-jam bug this suite exists to prevent regressing.
const QQ = M.PROF ? undefined : undefined; // percentiles via PCT below
const pct = { QQ: 1.13, KK: 0.68, AA: 0.23, AKs: 2.41, JJ: 1.58 };
const jamAt = (jamRep, eff, p) => { const z = M.zonesFor("vsJam", { jamRep, effAgg: eff }).find((x) => p >= x.from && p < x.to); return z && z.a; };
const NIT = M.PROF.nit.jamRep, MAN = M.PROF.maniac.jamRep;
ok("QQ folds a nit shove deep (100bb)", jamAt(NIT, 100, pct.QQ) === "fold");
ok("QQ folds a nit shove at 75bb", jamAt(NIT, 75, pct.QQ) === "fold");
ok("QQ calls a nit shove when priced in (40bb)", jamAt(NIT, 40, pct.QQ) === "call");
ok("KK calls a nit shove at 100bb", jamAt(NIT, 100, pct.KK) === "call");
// Deep vs a pure nit, folding KK is the correct laydown (MC oracle: calling is ~-47bb).
ok("KK folds a nit shove at 200bb (deep laydown)", jamAt(NIT, 200, pct.KK) === "fold");
ok("only AA calls a nit shove at 200bb", jamAt(NIT, 200, pct.AA) === "call");
ok("AKs folds a nit shove deep", jamAt(NIT, 100, pct.AKs) === "fold");
ok("QQ snap-calls a maniac shove at any depth", jamAt(MAN, 200, pct.QQ) === "call" && jamAt(MAN, 30, pct.QQ) === "call");
// Directional: tighter jammer => tighter call threshold; shorter stack => wider.
const jc = (jr, eff) => M.zonesFor("vsJam", { jamRep: jr, effAgg: eff }).find((z) => z.a === "call").to;
ok("tighter jammer -> tighter calls", jc(M.PROF.nit.jamRep, 100) < jc(M.PROF.tag.jamRep, 100) && jc(M.PROF.tag.jamRep, 100) < jc(MAN, 100));
ok("shorter stack -> wider calls (priced in)", jc(NIT, 30) > jc(NIT, 100) && jc(NIT, 100) > jc(NIT, 200));
// Finding 2: jam-pot mistakes priced at true bb (equity-based), not a percentile proxy.
const scNit100 = { stage: "vsJam", aggP: M.PROF.nit, jamCall: 75, potBB: 128 };
const zNit100 = M.zonesFor("vsJam", { jamRep: M.PROF.nit.jamRep, effAgg: 100 });
ok("QQ-call-vs-nit priced at true EV (25-45bb, was ~7)", (() => { const e = M.gradeStackoff(zNit100, pct.QQ, "call", scNit100).ev; return e > 25 && e < 45; })());
ok("KK-call-vs-nit @100bb grades best (0bb)", M.gradeStackoff(zNit100, pct.KK, "call", scNit100).ev === 0);
ok("air-call-vs-nit priced near the cap", M.gradeStackoff(zNit100, 90, "call", scNit100).ev > 40);

/* ---- 4. Metamorphic / directional invariants (Fable audit, Phase 0) ----
   These catch the motivating bug class: a swap to a tighter/looser villain, or a
   change in a ctx param, must move the boundary the right way. A function that
   ignores a parameter (the original flat-vsJam bug) fails a STRICT swap. */
const PID = ["nit", "station", "reg", "tag", "gto", "lag", "maniac"];
// M2 — strict: a strictly tighter jammer strictly tightens the stack-off boundary.
for (const e of [25, 60, 100, 200]) {
  const seq = ["nit", "tag", "gto", "lag", "maniac"].map((id) => M.zonesFor("vsJam", { jamRep: M.PROF[id].jamRep, effAgg: e })[0].to);
  ok(`M2 vsJam boundary strictly widens by jammer @${e}bb`, seq.every((v, i) => i === 0 || v > seq[i - 1]), seq.map((x) => x.toFixed(1)).join(" < "));
}
// M3 — weak: vsJam call boundary never tightens as stacks shorten.
{ let last = null, bad = 0; for (let e = 10; e <= 400; e += 5) { const v = M.zonesFor("vsJam", { jamRep: 4.5, effAgg: e })[0].to; if (last != null && v > last + 1e-9) bad++; last = v; } ok("M3 vsJam boundary non-increasing in eff", bad === 0, `${bad} inversions`); }
// M4 — vs4bet continue >= vsJam continue (a sized 4-bet lets you see a flop).
for (const e of [40, 100, 200]) for (const id of ["nit", "gto", "maniac"]) {
  const c4 = M.zonesFor("vs4bet", { jamRep: M.PROF[id].jamRep, effAgg: e })[1].to;
  const cj = M.zonesFor("vsJam", { jamRep: M.PROF[id].jamRep, effAgg: e })[0].to;
  ok(`M4 vs4bet continue >= vsJam ${id}@${e}`, c4 >= cj - 1e-9, `${c4.toFixed(1)} vs ${cj.toFixed(1)}`);
}
// M1 — vsOpen: a tighter opener (lower rfi) is defended no wider.
{ const wide = M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 1.7 })[1].to;
  const tight = M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, openerRfi: 0.65 })[1].to;
  ok("M1 tighter opener defended no wider", tight <= wide + 1e-9, `${tight.toFixed(1)} <= ${wide.toFixed(1)}`); }
// M5 — vsOpen: more cold-callers widens the call band.
ok("M5 callers widen the call band", M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5, callers: 2 })[1].to > M.zonesFor("vsOpen", { openerPos: "CO", heroPos: "BTN", mode: "9max", openBB: 5 })[1].to);
// M9 — static-data orderings that must always hold.
const rfiRow = M.TABLES["9max"].rfi;
ok("M9 rfi widens toward BTN", rfiRow.UTG < rfiRow.CO && rfiRow.CO < rfiRow.BTN);
ok("M9 profile rfi ordering", ["nit","reg","tag","gto","station","lag","maniac"].map((id) => M.PROF[id].rfi).every((v, i, a) => i === 0 || v >= a[i - 1]));
ok("M9 profile jamRep ordering", ["nit","station","reg","tag","gto","lag","maniac"].map((id) => M.PROF[id].jamRep).every((v, i, a) => i === 0 || v > a[i - 1]));
ok("M9 response triples sum ~1", M.PROFILES.every((p) => [p.vsRaise, p.vs3, p.vsBet].every((t) => Math.abs(t.f + t.c + t.r - 1) < 0.03)));

/* ---- 5. Coach-note vs grader consistency (Fable audit Layer 3) ----
   The advice TEXT must not name a different action family than grade() returns.
   This is the check that catches the rfi fold-band contradiction (Finding 1). */
const LEX = [
  [/is inside the top|iso-raises over|— 3-bet\.|keep the pressure on with a 4-bet|call it off|jam over the top|Top of the range|Top \d+% vs this open/, "aggr"],
  [/overlimps —|sits just past the raising range|wants a cheap multiway flop/, "limp"],
  [/is a call at this price|That's a call|continues vs the 3-bet|the price is right|see a flop/, "call"],
  [/is outside the top|let it go|That's a fold|folding to the 3-bet|Below the .* defense line|not enough equity to stack off|loses the least/i, "fold"],
];
const famOf = (a) => (typeof a === "string" && (a.indexOf("raise") === 0 || a === "bet")) ? "aggr" : a;
const ADVICE_CTX = [
  ["rfi CO", "rfi", { rfiT: M.TABLES["9max"].rfi.CO, bbv: 2, mode: "9max", heroPos: "CO", hu: false, villains: [] }],
  ["rfi UTG", "rfi", { rfiT: M.TABLES["9max"].rfi.UTG, bbv: 2, mode: "9max", heroPos: "UTG", hu: false, villains: [] }],
  ["rfi CO station-behind", "rfi", { rfiT: M.TABLES["9max"].rfi.CO, bbv: 2, mode: "9max", heroPos: "CO", hu: false, behindAgg: { r: 0.06, c: 0.8 }, villains: [] }],
];
let advChecked = 0;
for (const [name, stage, ctx] of ADVICE_CTX) {
  const zones = M.zonesFor(stage, ctx);
  for (const h of M.RANKED) {
    const sc = { ...ctx, stage, hand: { label: h.label, pct: h.pct }, villains: ctx.villains || [] };
    let txt; try { txt = M.adviceFor(sc, zones, 2); } catch (e) { continue; }
    const hit = LEX.find(([re]) => re.test(txt));
    if (!hit) continue;
    const z = zones.find((zz) => h.pct >= zz.from && h.pct < zz.to) || zones[zones.length - 1];
    const zFam = z.a === "limp" ? "limp" : famOf(z.a);
    advChecked++;
    if (hit[1] !== zFam) { ok(`advice/chart agree: ${name} ${h.label}`, false, `text says "${hit[1]}", chart says "${zFam}" @pct ${h.pct.toFixed(1)}`); }
  }
}
ok(`coach-note consistency scanned ${advChecked} advice strings`, advChecked > 200);

/* ---- 6. Board-equity cache: canonical key + shadow-mode grading no-op ----
   The pool only works if strategically-identical spots collapse to one key, and
   the accuracy plumbing must NOT touch a single grade until it's Stats-signed. */
const C = (r, s) => ({ r, s });
// A concrete spot: hero AsKh, flop Qs Jd 2c.
const hero = [C(14, "s"), C(13, "h")], board = [C(12, "s"), C(11, "d"), C(2, "c")];
const k0 = M.equityKey("nit", hero, board);
// (a) invariant under a consistent suit relabeling of hero + board together
const relabel = (m) => (c) => C(c.r, m[c.s]);
const swap = { s: "h", h: "s", d: "c", c: "d" };
ok("equityKey invariant under suit relabel", M.equityKey("nit", hero.map(relabel(swap)), board.map(relabel(swap))) === k0);
// (b) invariant under reordering within hero and within board
ok("equityKey invariant under hero/board reorder", M.equityKey("nit", [hero[1], hero[0]], [board[2], board[0], board[1]]) === k0);
// (c) a full rotation of all four suits is still the same spot
const rot = { s: "h", h: "d", d: "c", c: "s" };
ok("equityKey invariant under 4-suit rotation", M.equityKey("nit", hero.map(relabel(rot)), board.map(relabel(rot))) === k0);
// (d) genuinely different spots must NOT collapse: suit CONNECTIVITY differs when
//     hero's two cards share the board's flush suit vs not.
const heroFd = [C(14, "s"), C(13, "s")]; // both spades — flush draw with Qs
ok("equityKey separates flush-relevant suit patterns", M.equityKey("nit", heroFd, board) !== M.equityKey("nit", hero, board));
// (e) different profile and different street key apart
ok("equityKey separates profile", M.equityKey("lag", hero, board) !== k0);
ok("equityKey separates street (turn adds a card)", M.equityKey("nit", hero, [...board, C(9, "h")]) !== k0);
// (f) format: version | profile | street(derived) | canonical label
ok("equityKey format + derived street", /^1\|nit\|flop\|/.test(k0), k0);
ok("equityKey derives preflop when board empty", /^1\|nit\|preflop\|/.test(M.equityKey("nit", hero, [])));
ok("EQUITY_MODEL_V is 1", M.EQUITY_MODEL_V === 1);
// boardEquity: empty baked cache always misses
ok("boardEquity miss returns null", M.boardEquity("nit", hero, board) === null);
ok("boardEquity guards short hero", M.boardEquity("nit", [C(14, "s")], board) === null);
// Hierarchical lookup: exact hit beats bucket hit beats miss (injected cache).
{
  const ek = M.equityKey("nit", hero, board), bk = M.bucketKeyOf("nit", hero, board);
  ok("bucketKeyOf format", /^b1\|nit\|flop\|(ahi|bwy|paired|low|wet|mono)\|[0-9]$/.test(bk), bk);
  ok("boardEquity exact beats bucket", M.boardEquity("nit", hero, board, { [ek]: 0.61, [bk]: 0.4 }) === 0.61);
  ok("boardEquity falls back to bucket", M.boardEquity("nit", hero, board, { [bk]: 0.4 }) === 0.4);
  ok("boardEquity misses cleanly", M.boardEquity("nit", hero, board, { unrelated: 0.5 }) === null);
  ok("boardEquity ignores preflop", M.boardEquity("nit", hero, [], { [bk]: 0.4 }) === null);
  // bucket invariance: relabeling all suits consistently keeps the same bucket
  const swapB = { s: "d", d: "s", h: "c", c: "h" };
  const rl = (c) => ({ r: c.r, s: swapB[c.s] });
  ok("bucketKeyOf suit-relabel invariant", M.bucketKeyOf("nit", hero.map(rl), board.map(rl)) === bk);
}
// SHADOW no-op: with the cache off, passing a board must not move any grade.
{ const scNoBd = { stage: "vsJam", aggP: M.PROF.nit, jamCall: 75, potBB: 128 };
  const scBd = { ...scNoBd, hand: { cards: hero }, board };
  const z = M.zonesFor("vsJam", { jamRep: M.PROF.nit.jamRep, effAgg: 100 });
  for (const p of [0.23, 1.13, 40, 90]) {
    ok(`shadow: board does not change grade @pct ${p}`, M.gradeStackoff(z, p, "call", scBd).ev === M.gradeStackoff(z, p, "call", scNoBd).ev);
  }
  ok("shadow: jamEquity(sc) == jamEquity() with cache off", M.jamEquity("nit", 1.13, scBd) === M.jamEquity("nit", 1.13));
}
// mcEquity returns raw tallies consistent with the equity it reports.
{ const e = M.mcEquity(hero, board, M.PROF.nit.jamRep, 800);
  ok("mcEquity returns tallies", e && typeof e.wins === "number" && typeof e.ties === "number" && e.n > 0);
  ok("mcEquity tallies match equity", e && Math.abs((e.wins + e.ties / 2) / e.n - e.equity) < 1e-9);
  ok("mcEquity equity in [0,1]", e && e.equity >= 0 && e.equity <= 1 && e.wins + e.ties <= e.n);
}

/* ---- 7. Daily rollup: banked records collapse to one decision-weighted point per day ---- */
{
  const DAY = 86400000, t0 = 1700000000000;
  const rr = [
    { t: t0, n: 10, acc: 80, ev: 2, evPer: 0.2, hands: 3 },
    { t: t0 + 60000, n: 10, acc: 60, ev: 4, evPer: 0.4, hands: 4 }, // same day as above
    { t: t0 + DAY, n: 20, acc: 50, ev: 10, evPer: 0.5, hands: 6 },  // next day
  ];
  const roll = M.dailyRollup(rr);
  ok("dailyRollup collapses same-day records", roll.length === 2, `got ${roll.length}`);
  ok("dailyRollup weights accuracy by decisions", roll[0].acc === 70, `got ${roll[0] && roll[0].acc}`); // (8+6)/20
  ok("dailyRollup sums n + averages evPer", roll[0].n === 20 && Math.abs(roll[0].evPer - 0.3) < 1e-9, `n=${roll[0].n} evPer=${roll[0].evPer}`);
  ok("dailyRollup keeps distinct days", roll[1].acc === 50 && roll[1].n === 20);
  ok("dailyRollup sorts by time + sums hands", roll[0].t < roll[1].t && roll[0].hands === 7);
  ok("dailyRollup empty passthrough", M.dailyRollup([]).length === 0);
}

/* ---- 8. vsRaise: directional invariants for the new facing-a-raise stage ---- */
{
  const zR = (ctx) => M.zonesFor("vsRaise", ctx);
  const base = zR({ tb: "ahi", spr: 5 });
  ok("vsRaise shape raise/call/fold", base.length === 3 && base[0].a === "raise" && base[1].a === "call" && base[2].a === "fold");
  ok("vsRaise wet continues wider than dry", zR({ tb: "wet", spr: 5 })[1].to > base[1].to);
  ok("vsRaise shallow widens the jam band", zR({ tb: "ahi", spr: 1.5 })[0].to > zR({ tb: "ahi", spr: 8 })[0].to);
  ok("vsRaise frequent raiser paid off wider", zR({ tb: "ahi", spr: 5, raiseF: 0.3 })[1].to > zR({ tb: "ahi", spr: 5, raiseF: 0.08 })[1].to);
  ok("vsRaise gto-anchored raiser = default chart", JSON.stringify(zR({ tb: "ahi", spr: 5, raiseF: M.PROF.gto.vsBet.r })) === JSON.stringify(base));
  ok("vsRaise continue tighter than vsCbet", base[1].to < M.zonesFor("vsCbet", { tb: "ahi", spr: 5 })[1].to);
  const zi = zR({ tb: "ahi", spr: 5, allIn: true });
  ok("vsRaise all-in collapses to call/fold", zi.length === 2 && zi[0].a === "call" && zi[1].a === "fold");
  ok("vsRaise all-in call band sits between jam and call boundaries", zi[0].to >= base[0].to && zi[0].to <= base[1].to + 1e-9);
}

/* ---- 9. Complete-the-hand invariant: no continuation may dead-end ----
   Every action from every reachable stage must either settle the hand (result)
   or hand back a next decision (nextSc) — the "hand logged" stubs are gone. */
{
  const CFG = { mode: "9max", hu: "tag", seats: ["nit", "reg", "lag", "station", "maniac", "tag", "station", "nit", "reg"], stake: 0, stack: 2, image: "unknown", play: "drill" };
  const pickAction = (sc) => {
    if (M.AGG_STAGES.includes(sc.stage)) {
      const opts = M.heroBetOpts(sc).map((o) => o.id);
      // bias toward betting so villain raises (the new vsRaise path) get exercised
      return Math.random() < 0.8 && opts.length ? opts[(Math.random() * opts.length) | 0] : "check";
    }
    if (sc.stage === "rfi") { const pool = [...M.openIds(sc.bbv || 2, sc.hu), "limp", "fold"]; return pool[(Math.random() * pool.length) | 0]; }
    if (sc.stage === "vsOpen") { const pool = ["fold", "call", "raiseS", "raiseB"]; return pool[(Math.random() * pool.length) | 0]; }
    if (sc.stage === "riverCall" || sc.stage === "vsJam") return Math.random() < 0.5 ? "call" : "fold";
    // defender stages incl. vsRaise: bias toward call/raise so hands keep going
    const pool = ["call", "raise", "call", "fold"];
    return pool[(Math.random() * pool.length) | 0];
  };
  let walks = 0, steps = 0, deadEnds = 0, stubText = 0, unterminated = 0, sawVsRaise = 0, vsRaiseResolved = 0;
  for (let w = 0; w < 400; w++) {
    let sc = M.genScenario(CFG, null);
    let done = false;
    for (let s = 0; s < 15; s++) {
      steps++;
      const a = pickAction(sc);
      let cont;
      try { cont = M.continuation(sc, a, 2); } catch (e) { deadEnds++; done = true; break; }
      if (/hand logged|roadmap|lands next/i.test(cont.text || "")) stubText++;
      if (cont.nextSc) {
        if (cont.nextSc.stage === "vsRaise") sawVsRaise++;
        sc = cont.nextSc;
        continue;
      }
      if (cont.result == null) deadEnds++;
      else if (sc.stage === "vsRaise") vsRaiseResolved++;
      done = true;
      break;
    }
    if (!done) unterminated++;
    walks++;
  }
  ok("walks ran", walks === 400);
  ok(`no dead-ends in ${steps} continuation steps`, deadEnds === 0, `${deadEnds} continuations returned neither result nor nextSc (or threw)`);
  ok("no 'hand logged' stub text remains", stubText === 0, `${stubText} stub texts seen`);
  ok("every walk terminates within 15 decisions", unterminated === 0, `${unterminated} walks still going`);
  ok(`vsRaise reached organically (${sawVsRaise}x) and resolves`, sawVsRaise >= 3 && vsRaiseResolved >= 1, `saw ${sawVsRaise}, resolved ${vsRaiseResolved}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
