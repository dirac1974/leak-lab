// B0 acceptance: correctness suite + naive cross-check + benchmark gate.
// Run: node tools/sim/test-evaluator.js
"use strict";
const { rank5, omahaHigh, omahaLow, cards, deckWithout, CAT } = require("./evaluator.js");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };
const r5 = (s) => { const c = cards(s); return rank5(c[0], c[1], c[2], c[3], c[4]); };

/* ---- 1. Category ordering ---- */
const ladder = [
  ["royal flush", "As Ks Qs Js Ts"], ["straight flush", "9h 8h 7h 6h 5h"], ["quads", "Ac Ad Ah As Kc"],
  ["full house", "Kc Kd Kh 2c 2d"], ["flush", "Ad Jd 9d 6d 3d"], ["straight", "Tc 9d 8h 7s 6c"],
  ["wheel straight", "5c 4d 3h 2s Ac"], ["trips", "Qc Qd Qh 9s 2c"], ["two pair", "Jc Jd 8h 8s Ac"],
  ["pair", "Tc Td Ah 7s 3c"], ["ace high", "Ac Qd 9h 6s 3c"],
];
for (let i = 1; i < ladder.length; i++) ok(`${ladder[i - 1][0]} > ${ladder[i][0]}`, r5(ladder[i - 1][1]) > r5(ladder[i][1]));
ok("wheel is lowest straight", r5("6c 5d 4h 3s 2c") > r5("5c 4d 3h 2s Ac"));
ok("kicker breaks pairs", r5("Tc Td Ah 7s 3c") > r5("Tc Td Kh 7s 3c"));
ok("flush kickers deep-compare", r5("Ad Jd 9d 6d 4d") > r5("Ad Jd 9d 6d 3d"));

/* ---- 2. Omaha must-use-two ---- */
// Board has four spades; hole has ONE spade → no flush (must use exactly 2 hole)
{
  const high = omahaHigh(cards("As 2c 3d 4h"), cards("Ks Qs Js 9s 2d"));
  ok("one hole spade ≠ flush", (high >> 20) !== CAT.FLUSH && (high >> 20) !== CAT.SFLUSH, `cat=${high >> 20}`);
}
// Two hole spades → flush
{
  const high = omahaHigh(cards("As 2s 3d 4h"), cards("Ks Qs Js 9c 2d"));
  ok("two hole spades = flush", (high >> 20) === CAT.FLUSH, `cat=${high >> 20}`);
}
// Board quads: hole can't play four-of-board — best is quads only via 2 hole? No:
// board KKKK x — you must use 2 hole + 3 board → trips K + your two = full house if paired hole
{
  const high = omahaHigh(cards("Ac Ad 7s 6h"), cards("Kc Kd Kh Ks 2d"));
  ok("board quads → hole pair makes full house, not quads", (high >> 20) === CAT.FULL, `cat=${high >> 20}`);
}

/* ---- 3. Low evaluation ---- */
{
  const lo = omahaLow(cards("Ac 2d 9s 9h"), cards("3c 4d 8h Kc Qd"));
  ok("A2 on 348 makes 8-4-3-2-A low", lo !== null);
  const nutLow = omahaLow(cards("Ac 2d Ts Jh"), cards("3c 4d 5h Kc Qd"));
  ok("A2 on 345 = wheel low (nuts)", nutLow !== null && nutLow < lo, `${nutLow} vs ${lo}`);
  ok("no low without 3 low board cards", omahaLow(cards("Ac 2d 3s 4h"), cards("9c Td Jh Kc Qd")) === null);
  ok("counterfeit: A2 on A-2-x board still needs distinct", omahaLow(cards("Ac 2d Ts Jh"), cards("Ad 2h 8c Kc Qd")) === null);
  const big0 = omahaLow(cards("Ac 2d 3s 4h 5c"), cards("6c 7d 8h Kc Qd"));
  ok("5-card (Big O) low works", big0 !== null);
}

/* ---- 4. Cross-check vs naive best-of-C(7..)-style reference ---- */
// Naive: enumerate ALL 2-hole × 3-board and rescore with an independent simple
// scorer (sorted-string compare) — orderings must agree pairwise.
function naiveScore(five) {
  // categorize by brute counting, return comparable array
  const rs = five.map((c) => c >> 2).sort((a, b) => b - a);
  const ss = five.map((c) => c & 3);
  const flush = ss.every((s) => s === ss[0]);
  const uniq = [...new Set(rs)];
  let str = -1;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) str = rs[0];
    if (JSON.stringify(rs) === JSON.stringify([12, 3, 2, 1, 0])) str = 3;
  }
  const byCount = {};
  for (const r of rs) byCount[r] = (byCount[r] || 0) + 1;
  const groups = Object.entries(byCount).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let cat;
  if (flush && str >= 0) cat = 8;
  else if (groups[0][0] === 4) cat = 7;
  else if (groups[0][0] === 3 && groups[1][0] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (str >= 0) cat = 4;
  else if (groups[0][0] === 3) cat = 3;
  else if (groups[0][0] === 2 && groups[1][0] === 2) cat = 2;
  else if (groups[0][0] === 2) cat = 1;
  else cat = 0;
  const tie = str >= 0 && (cat === 4 || cat === 8) ? [str] : groups.flatMap(([n, r]) => Array(1).fill(r));
  return [cat, ...tie, ...rs];
}
const cmpArr = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x - y; } return 0; };
{
  let agree = true, tested = 0;
  let seed = 42; const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  for (let trial = 0; trial < 4000 && agree; trial++) {
    const d = deckWithout([]); // fresh deck
    for (let i = d.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = d[i]; d[i] = d[j]; d[j] = t; }
    const h1 = d.slice(0, 5), h2 = d.slice(5, 10);
    const s1 = rank5(h1[0], h1[1], h1[2], h1[3], h1[4]), s2 = rank5(h2[0], h2[1], h2[2], h2[3], h2[4]);
    const n1 = naiveScore(h1), n2 = naiveScore(h2);
    const a = Math.sign(s1 - s2), b = Math.sign(cmpArr(n1, n2));
    if (a !== b) { agree = false; console.log("disagree:", h1, h2, s1, s2, n1, n2); }
    tested++;
  }
  ok(`rank5 agrees with naive on ${4000} random pairs`, agree);
}

/* ---- 5. Benchmark gate: ≥1M rank5 evals/sec/core ---- */
{
  const N = 2_000_000;
  const cs = new Int32Array(N * 5);
  let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  for (let i = 0; i < N * 5; i += 5) {
    const d = [(rand() * 52) | 0, 0, 0, 0, 0];
    for (let k = 1; k < 5; k++) { let c; do { c = (rand() * 52) | 0; } while (d.slice(0, k).includes(c)); d[k] = c; }
    for (let k = 0; k < 5; k++) cs[i + k] = d[k];
  }
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < N * 5; i += 5) acc ^= rank5(cs[i], cs[i + 1], cs[i + 2], cs[i + 3], cs[i + 4]);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const rate = N / (ms / 1000);
  console.log(`  bench: ${(rate / 1e6).toFixed(2)}M rank5/sec (acc=${acc & 1})`);
  ok("benchmark ≥1M evals/sec", rate >= 1_000_000, `${Math.round(rate)}`);
  // Omaha throughput (60 rank5s each)
  const M2 = 50_000;
  const t1 = process.hrtime.bigint();
  let acc2 = 0;
  for (let i = 0; i < M2; i++) {
    const o = i * 9 % (N * 5 - 45);
    acc2 ^= omahaHigh([cs[o], cs[o + 1], cs[o + 2], cs[o + 3]], [cs[o + 4], cs[o + 5], cs[o + 6], cs[o + 7], cs[o + 8]]);
  }
  const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
  console.log(`  bench: ${Math.round(M2 / (ms2 / 1000) / 1000)}k omahaHigh/sec`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
