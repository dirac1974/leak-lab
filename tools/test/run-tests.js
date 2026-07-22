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
  "\nexport { zonesFor, grade, gradeSized, gradeRaise, gradeStackoff, adviceFor, leakObs, leakTrend, leakTotals, bucketOf, winPMw, respondToBetStk, effVs, vilStk, mergeHist, applyBackup, PROF, PROFILES, PCT, RANKED, TABLES, defendChart, MIX, GTO_JAMREP };\n");
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
