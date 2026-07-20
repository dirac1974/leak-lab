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
fs.copyFileSync(path.join(root, "src", "leak-lab.jsx"), path.join(tmp, "src.jsx"));
fs.copyFileSync(path.join(root, "src", "fonts-gen.js"), path.join(tmp, "fonts-gen.js"));
fs.writeFileSync(path.join(tmp, "probe.jsx"),
  fs.readFileSync(path.join(tmp, "src.jsx"), "utf8") +
  "\nexport { zonesFor, grade, gradeSized, gradeRaise, leakObs, leakTrend, leakTotals, bucketOf, winPMw, respondToBetStk, effVs, vilStk, mergeHist, applyBackup, PROF, PROFILES };\n");
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
