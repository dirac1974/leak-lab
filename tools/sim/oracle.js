// Oracle sweep (Fable audit Layer 4): for each profile × effective stack, take
// the engine's own vsJam call/fold boundary hands and check their EV against
// Monte-Carlo equity vs the villain's shove range. Report-only — surfaces
// level-errors (right-shaped boundary in the wrong place) that pure invariants
// can't. Run: npm run sim:oracle
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..", "..");
const tmp = path.join(__dirname, ".build");
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(root, "src", "leak-lab.jsx"), path.join(tmp, "src.jsx"));
fs.copyFileSync(path.join(root, "src", "fonts-gen.js"), path.join(tmp, "fonts-gen.js"));
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
fs.copyFileSync(path.join(root, "src", "data", "jam-equity.js"), path.join(tmp, "data", "jam-equity.js"));
fs.writeFileSync(path.join(tmp, "probe.jsx"),
  fs.readFileSync(path.join(tmp, "src.jsx"), "utf8") +
  "\nexport { zonesFor, mcEquity, PCT, RANKED, PROF, PROFILES, materialize };\n");
esbuild.buildSync({ entryPoints: [path.join(tmp, "probe.jsx")], bundle: true, format: "cjs",
  jsx: "automatic", loader: { ".jsx": "jsx" }, external: ["react", "react/jsx-runtime"], outfile: path.join(tmp, "probe.js"), logLevel: "silent" });
const M = require(path.join(tmp, "probe.js"));

// Villain range for MC: shoveRange if the profile defines one (their realistic
// shove range), else jamRep (the call-threshold proxy).
const rangeOf = (p) => (p.shoveRange != null ? p.shoveRange : p.jamRep);
// Canonical committed amounts (bb) for the two lines that reach a jam.
const LINES = { squeeze: 20, fourbet: 34 };
const DEAD = 3;
const TRIALS = 18000;

// Deterministic cards for a hand class (best-effort; average a few for suited).
function cardsFor(h) { return M.materialize(h); }
function equityOf(h, rangePct) {
  let s = 0, n = 3;
  for (let i = 0; i < n; i++) { const e = M.mcEquity(cardsFor(h), [], rangePct, TRIALS / n); if (e) s += e.equity; }
  return s / n;
}
const evCall = (eq, E, C) => eq * (E + C + DEAD) - (1 - eq) * (E - C); // hero net bb by calling

const rankedAsc = [...M.RANKED].sort((a, b) => a.pct - b.pct);
const boundaryHands = (c) => {
  const call = [...rankedAsc].reverse().find((h) => h.pct < c) || rankedAsc[0]; // weakest call-side
  const fold = rankedAsc.find((h) => h.pct >= c) || rankedAsc[rankedAsc.length - 1]; // strongest fold-side
  return { call, fold };
};

console.log(`Oracle sweep — vsJam boundaries, ${TRIALS} trials/hand, two committed lines (squeeze/4bet)\n`);
let flags = 0;
for (const p of M.PROFILES) {
  const rng = rangeOf(p);
  for (const E of [40, 60, 100, 200]) {
    const c = M.zonesFor("vsJam", { jamRep: p.jamRep, effAgg: E })[0].to;
    const { call, fold } = boundaryHands(c);
    const eqC = equityOf(call, rng), eqF = equityOf(fold, rng);
    const lines = Object.entries(LINES).filter(([, C]) => E > C + 5);
    const evC = lines.map(([, C]) => evCall(eqC, E, C));
    const evF = lines.map(([, C]) => evCall(eqF, E, C));
    // Flag: worst-case call-side EV clearly negative (too loose) OR best-case
    // fold-side EV clearly positive (too tight). Report both lines.
    const callBad = evC.length && Math.max(...evC) < -8;
    const foldBad = evF.length && Math.min(...evF) > 8;
    const mark = callBad ? " ⚠ call-side -EV" : foldBad ? " ⚠ fold-side +EV" : "";
    if (mark) flags++;
    console.log(`${p.id.padEnd(8)} E=${String(E).padStart(3)}  c=${c.toFixed(2)}  call ${call.label.padEnd(4)} eq ${(eqC*100).toFixed(0)}% EV[${evC.map((v)=>v.toFixed(0)).join("/")}]  |  fold ${fold.label.padEnd(4)} eq ${(eqF*100).toFixed(0)}% EV[${evF.map((v)=>v.toFixed(0)).join("/")}]${mark}`);
  }
}
console.log(`\n${flags} boundary points flagged (|EV| > 8bb on the wrong side).`);
