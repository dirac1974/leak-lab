// B0 — Poker hand evaluator: exact 5-card total ordering, Omaha high (exactly
// 2 of N hole cards), and 8-or-better low. Foundation for every Track B sim.
//
// Design note vs PLAN's "7,462 equivalence classes lookup": simulation needs a
// correct total ORDER, not the canonical class table — a category-packed score
// gives identical comparisons with no table build, and clears the ≥1M evals/sec
// benchmark. Revisit only if profiling ever demands it.
//
// Card encoding: 0..51 = rank * 4 + suit, rank 0=deuce .. 12=ace.
"use strict";

const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL: 6, QUADS: 7, SFLUSH: 8 };

/* Exact 5-card score: higher = better. Packs category + tiebreak ranks into one
   integer (base-13 positional), so scores compare as hands compare. */
function rank5(c0, c1, c2, c3, c4) {
  const r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;
  const flush = ((c0 & 3) === (c1 & 3)) && ((c1 & 3) === (c2 & 3)) && ((c2 & 3) === (c3 & 3)) && ((c3 & 3) === (c4 & 3));
  // rank histogram
  const cnt = new Uint8Array(13);
  cnt[r0]++; cnt[r1]++; cnt[r2]++; cnt[r3]++; cnt[r4]++;
  // straight detection on the rank set (wheel: A-2-3-4-5)
  let mask = 0;
  mask |= 1 << r0; mask |= 1 << r1; mask |= 1 << r2; mask |= 1 << r3; mask |= 1 << r4;
  let straightHigh = -1;
  if (mask === 0b1000000001111) straightHigh = 3; // wheel, 5-high
  else for (let h = 12; h >= 4; h--) { const need = 0b11111 << (h - 4); if ((mask & need) === need) { straightHigh = h; break; } }
  if (flush && straightHigh >= 0) return (CAT.SFLUSH << 20) | (straightHigh << 16);
  // multiples: collect ranks by count (descending count, then rank)
  let quad = -1, trip = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    if (cnt[r] === 4) quad = r;
    else if (cnt[r] === 3) trip = r;
    else if (cnt[r] === 2) { if (p1 < 0) p1 = r; else p2 = r; }
  }
  if (quad >= 0) { const k = r0 !== quad ? r0 : r1 !== quad ? r1 : r2 !== quad ? r2 : r3 !== quad ? r3 : r4; return (CAT.QUADS << 20) | (quad << 16) | (k << 12); }
  if (trip >= 0 && p1 >= 0) return (CAT.FULL << 20) | (trip << 16) | (p1 << 12);
  if (flush || straightHigh >= 0) {
    if (straightHigh >= 0) return (CAT.STRAIGHT << 20) | (straightHigh << 16);
    // flush: kickers descending
    const a = [r0, r1, r2, r3, r4].sort((x, y) => y - x);
    return (CAT.FLUSH << 20) | (a[0] << 16) | (a[1] << 12) | (a[2] << 8) | (a[3] << 4) | a[4];
  }
  if (trip >= 0) {
    const ks = [r0, r1, r2, r3, r4].filter((r) => r !== trip).sort((x, y) => y - x);
    return (CAT.TRIPS << 20) | (trip << 16) | (ks[0] << 12) | (ks[1] << 8);
  }
  if (p1 >= 0 && p2 >= 0) {
    const k = [r0, r1, r2, r3, r4].find((r) => r !== p1 && r !== p2);
    return (CAT.TWO_PAIR << 20) | (p1 << 16) | (p2 << 12) | (k << 8);
  }
  if (p1 >= 0) {
    const ks = [r0, r1, r2, r3, r4].filter((r) => r !== p1).sort((x, y) => y - x);
    return (CAT.PAIR << 20) | (p1 << 16) | (ks[0] << 12) | (ks[1] << 8) | (ks[2] << 4);
  }
  const a = [r0, r1, r2, r3, r4].sort((x, y) => y - x);
  return (CAT.HIGH << 20) | (a[0] << 16) | (a[1] << 12) | (a[2] << 8) | (a[3] << 4) | a[4];
}

/* Omaha high: best 5-card hand using EXACTLY 2 of `hole` and 3 of `board`.
   Works for 4-card PLO, 5-card (Big O), 6-card. */
const C2 = (n) => { const out = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]); return out; };
const C3_5 = (() => { const out = []; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) for (let k = j + 1; k < 5; k++) out.push([i, j, k]); return out; })();
const HOLE_PAIRS = { 4: C2(4), 5: C2(5), 6: C2(6) };

function omahaHigh(hole, board) {
  const hp = HOLE_PAIRS[hole.length];
  let best = -1;
  for (let a = 0; a < hp.length; a++) {
    const h0 = hole[hp[a][0]], h1 = hole[hp[a][1]];
    for (let b = 0; b < C3_5.length; b++) {
      const t = C3_5[b];
      const s = rank5(h0, h1, board[t[0]], board[t[1]], board[t[2]]);
      if (s > best) best = s;
    }
  }
  return best;
}

/* Omaha 8-or-better low: exactly 2 hole + 3 board, five DISTINCT ranks all ≤ 8
   (ace plays low). Returns a score where LOWER is better, or null if no low.
   Rank remap for lows: A=1, 2=2 .. 8=8. Score packs the 5 ranks descending —
   comparing scores compares lows correctly (8-7-6-5-4 > 6-4-3-2-A etc.). */
const lowRank = (c) => { const r = c >> 2; return r === 12 ? 1 : r + 2; }; // A→1, deuce(0)→2 … 8(6)→8
function omahaLow(hole, board) {
  const hp = HOLE_PAIRS[hole.length];
  let best = null;
  for (let a = 0; a < hp.length; a++) {
    const l0 = lowRank(hole[hp[a][0]]), l1 = lowRank(hole[hp[a][1]]);
    if (l0 > 8 || l1 > 8 || l0 === l1) continue;
    for (let b = 0; b < C3_5.length; b++) {
      const t = C3_5[b];
      const b0 = lowRank(board[t[0]]), b1 = lowRank(board[t[1]]), b2 = lowRank(board[t[2]]);
      if (b0 > 8 || b1 > 8 || b2 > 8) continue;
      // all five distinct?
      const m = (1 << l0) | (1 << l1) | (1 << b0) | (1 << b1) | (1 << b2);
      if (popcount(m) !== 5) continue;
      // score: ranks descending, packed base-16 — lower packed value = better low
      const arr = [l0, l1, b0, b1, b2].sort((x, y) => y - x);
      const s = (arr[0] << 16) | (arr[1] << 12) | (arr[2] << 8) | (arr[3] << 4) | arr[4];
      if (best === null || s < best) best = s;
    }
  }
  return best;
}
function popcount(x) { x = x - ((x >> 1) & 0x55555555); x = (x & 0x33333333) + ((x >> 2) & 0x33333333); return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24; }

/* Deck + parsing helpers for tests and sims */
const RANKS = "23456789TJQKA", SUITS = "cdhs";
const card = (str) => RANKS.indexOf(str[0]) * 4 + SUITS.indexOf(str[1]);
const cards = (str) => str.trim().split(/\s+/).map(card);
function deckWithout(used) {
  const seen = new Set(used); const d = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) d.push(c);
  return d;
}
function shuffle(d, rand) { for (let i = d.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = d[i]; d[i] = d[j]; d[j] = t; } return d; }

module.exports = { rank5, omahaHigh, omahaLow, card, cards, deckWithout, shuffle, CAT, lowRank };
