import { useState, useMemo, useEffect } from "react";
import { FONT_CSS } from "./fonts-gen.js";

/* ============ LEAK LAB — practical live-strategy trainer ============
   Real players, real spots: drill vs opponent archetypes, not a solver.
   All ranges are precomputed lookup tables: zero solver load on device.
   GTO is the internal grading baseline; the product voice is practical.
==================================================================== */

const RC = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };

function handScore(hi, lo, suited) {
  if (hi === lo) return 28 + hi * 5.8;
  let s = hi * 3.2 + lo * 1.4;
  const gap = hi - lo - 1;
  s += gap === 0 ? 6 : gap === 1 ? 3.5 : gap === 2 ? 1.5 : 0;
  if (suited) s += 7;
  if (hi >= 10 && lo >= 10) s += 5;
  if (hi === 14 && lo <= 5) s += suited ? 2.5 : 0.5;
  if (gap >= 4 && hi < 14) s -= 1.5;
  return s;
}

// 169 hand classes, combo-weighted percentiles (0 = strongest)
const RANKED = (() => {
  const arr = [];
  for (let hi = 14; hi >= 2; hi--) {
    for (let lo = hi; lo >= 2; lo--) {
      if (hi === lo) arr.push({ label: RC[hi] + RC[lo], hi, lo, suited: false, pair: true, combos: 6, score: handScore(hi, lo, false) });
      else {
        arr.push({ label: RC[hi] + RC[lo] + "s", hi, lo, suited: true, pair: false, combos: 4, score: handScore(hi, lo, true) });
        arr.push({ label: RC[hi] + RC[lo] + "o", hi, lo, suited: false, pair: false, combos: 12, score: handScore(hi, lo, false) });
      }
    }
  }
  arr.sort((a, b) => b.score - a.score);
  let cum = 0;
  arr.forEach((h) => { h.pct = ((cum + h.combos / 2) / 1326) * 100; cum += h.combos; });
  return arr;
})();
const PCT = Object.fromEntries(RANKED.map((h) => [h.label, h.pct]));

const SUITS = ["s", "h", "d", "c"];
function materialize(h) {
  const s1 = SUITS[(Math.random() * 4) | 0];
  let s2 = s1;
  if (!h.suited) { do { s2 = SUITS[(Math.random() * 4) | 0]; } while (s2 === s1); }
  return [{ r: h.hi, s: s1 }, { r: h.lo, s: s2 }];
}
function deal() {
  const a = (Math.random() * 52) | 0;
  let b; do { b = (Math.random() * 52) | 0; } while (b === a);
  const c1 = { r: (a % 13) + 2, s: SUITS[(a / 13) | 0] }, c2 = { r: (b % 13) + 2, s: SUITS[(b / 13) | 0] };
  const [hiC, loC] = c1.r >= c2.r ? [c1, c2] : [c2, c1];
  const suited = hiC.s === loC.s && hiC.r !== loC.r;
  const label = hiC.r === loC.r ? RC[hiC.r] + RC[loC.r] : RC[hiC.r] + RC[loC.r] + (suited ? "s" : "o");
  return { cards: [hiC, loC], label, pct: PCT[label] };
}
/* ---------------- On-device equity (Monte Carlo) ----------------
   Real equity of the hero's exact hand vs a modeled villain range, so the "run
   the math" button gives ground truth, not the heuristic percentile. Card int:
   (r-2)*4 + suit, so rank = c>>2 (0-12), suit = c&3. Exact 5-card scorer packs
   category + tiebreaks into one integer; eval7 takes the best of C(7,5)=21. */
const SIDX = { s: 0, h: 1, d: 2, c: 3 };
const encCard = (c) => (c.r - 2) * 4 + SIDX[c.s];
function rank5i(c0, c1, c2, c3, c4) {
  const r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;
  const flush = ((c0 & 3) === (c1 & 3)) && ((c1 & 3) === (c2 & 3)) && ((c2 & 3) === (c3 & 3)) && ((c3 & 3) === (c4 & 3));
  const cnt = [0,0,0,0,0,0,0,0,0,0,0,0,0];
  cnt[r0]++; cnt[r1]++; cnt[r2]++; cnt[r3]++; cnt[r4]++;
  let mask = (1<<r0)|(1<<r1)|(1<<r2)|(1<<r3)|(1<<r4);
  let sHigh = -1;
  if (mask === 0b1000000001111) sHigh = 3; // wheel A-5
  else for (let h = 12; h >= 4; h--) { const need = 0b11111 << (h - 4); if ((mask & need) === need) { sHigh = h; break; } }
  if (flush && sHigh >= 0) return (8 << 20) | (sHigh << 16);
  let quad = -1, trip = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) quad = r; else if (cnt[r] === 3) trip = r; else if (cnt[r] === 2) { if (p1 < 0) p1 = r; else p2 = r; } }
  if (quad >= 0) { const k = [r0,r1,r2,r3,r4].find((r) => r !== quad); return (7<<20)|(quad<<16)|(k<<12); }
  if (trip >= 0 && p1 >= 0) return (6<<20)|(trip<<16)|(p1<<12);
  if (flush) { const a=[r0,r1,r2,r3,r4].sort((x,y)=>y-x); return (5<<20)|(a[0]<<16)|(a[1]<<12)|(a[2]<<8)|(a[3]<<4)|a[4]; }
  if (sHigh >= 0) return (4<<20)|(sHigh<<16);
  if (trip >= 0) { const ks=[r0,r1,r2,r3,r4].filter((r)=>r!==trip).sort((x,y)=>y-x); return (3<<20)|(trip<<16)|(ks[0]<<12)|(ks[1]<<8); }
  if (p1 >= 0 && p2 >= 0) { const k=[r0,r1,r2,r3,r4].find((r)=>r!==p1&&r!==p2); return (2<<20)|(p1<<16)|(p2<<12)|(k<<8); }
  if (p1 >= 0) { const ks=[r0,r1,r2,r3,r4].filter((r)=>r!==p1).sort((x,y)=>y-x); return (1<<20)|(p1<<16)|(ks[0]<<12)|(ks[1]<<8)|(ks[2]<<4); }
  const a=[r0,r1,r2,r3,r4].sort((x,y)=>y-x); return (a[0]<<16)|(a[1]<<12)|(a[2]<<8)|(a[3]<<4)|a[4];
}
const C7 = (() => { const o=[]; for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let d=b+1;d<5;d++)for(let e=d+1;e<6;e++)for(let f=e+1;f<7;f++)o.push([a,b,d,e,f]); return o; })();
function eval7(c) { let best = -1; for (let i=0;i<C7.length;i++){ const t=C7[i]; const s=rank5i(c[t[0]],c[t[1]],c[t[2]],c[t[3]],c[t[4]]); if(s>best)best=s; } return best; }
/* Sample one valid combo of a 169-class avoiding `used` (Set of card ints). */
function sampleCombo(cls, used) {
  const hiR = cls.hi - 2, loR = cls.lo - 2;
  for (let t = 0; t < 12; t++) {
    let s1 = (Math.random()*4)|0, s2;
    if (cls.suited) s2 = s1; else { do { s2 = (Math.random()*4)|0; } while (s2 === s1); }
    const c1 = hiR*4+s1, c2 = loR*4+s2;
    if (c1 !== c2 && !used.has(c1) && !used.has(c2)) return [c1, c2];
  }
  return null;
}
/* Equity of heroCards (array of {r,s}) vs the top `rangePct`% preflop range,
   completing from `board` (0–5 cards). Returns {equity, iters} or null. */
function mcEquity(heroCards, board, rangePct, iters) {
  const hero = heroCards.map(encCard);
  const bd = (board || []).map(encCard);
  const classes = RANKED.filter((h) => h.pct <= rangePct);
  if (!classes.length || hero.length < 2) return null;
  const totalCombos = classes.reduce((s, h) => s + h.combos, 0);
  const used0 = new Set([...hero, ...bd]);
  let win = 0, tie = 0, n = 0;
  for (let it = 0; it < iters; it++) {
    let vh = null;
    for (let tr = 0; tr < 8 && !vh; tr++) {
      let r = Math.random() * totalCombos, cls = classes[0];
      for (let i = 0; i < classes.length; i++) { r -= classes[i].combos; if (r <= 0) { cls = classes[i]; break; } }
      vh = sampleCombo(cls, used0);
    }
    if (!vh) continue;
    const used = new Set(used0); used.add(vh[0]); used.add(vh[1]);
    const b5 = bd.slice();
    while (b5.length < 5) { const c = (Math.random()*52)|0; if (!used.has(c)) { used.add(c); b5.push(c); } }
    const hs = eval7([hero[0], hero[1], b5[0], b5[1], b5[2], b5[3], b5[4]]);
    const vs = eval7([vh[0], vh[1], b5[0], b5[1], b5[2], b5[3], b5[4]]);
    if (hs > vs) win++; else if (hs === vs) tie++;
    n++;
  }
  return n ? { equity: (win + tie / 2) / n, iters: n } : null;
}

function sampleFromTop(t) {
  const cand = RANKED.filter((h) => h.pct <= t);
  const total = cand.reduce((s, h) => s + h.combos, 0);
  let r = Math.random() * total;
  let pick = cand[0];
  for (const h of cand) { r -= h.combos; if (r <= 0) { pick = h; break; } }
  return { cards: materialize(pick), label: pick.label, pct: pick.pct };
}
function sampleBetween(lo, hi) {
  const cand = RANKED.filter((h) => h.pct > lo && h.pct <= hi);
  if (!cand.length) return sampleFromTop(hi);
  const total = cand.reduce((s, h) => s + h.combos, 0);
  let r = Math.random() * total;
  let pick = cand[0];
  for (const h of cand) { r -= h.combos; if (r <= 0) { pick = h; break; } }
  return { cards: materialize(pick), label: pick.label, pct: pick.pct };
}
/* Fraction of would-be-fold preflop deals to KEEP as folds (rest become playable).
   0.5 ≈ "cut folds in half" so sessions aren't dominated by muck-and-move-on. */
const FOLD_KEEP = 0.5;
/* Deal a preflop hand, then de-bias toward action: if it's a fold (past foldFrom)
   keep it only FOLD_KEEP of the time; otherwise resample from the playable region.
   Postflop is untouched — reaching a flop already implies you continued preflop. */
function dealBiased(foldFrom) {
  const h = deal();
  if (foldFrom >= 100) return h; // no fold region (e.g. BB option) — leave as is
  if (h.pct >= foldFrom && Math.random() >= FOLD_KEEP) return sampleFromTop(foldFrom);
  return h;
}
// Percentile where folding begins for a preflop spot (from the strategy zones).
function foldBoundary(stage, ctx) {
  const zones = zonesFor(stage, ctx);
  const fz = zones.find((z) => z.a === "fold");
  return fz ? fz.from : 100;
}

/* ---------------- Ranges (approx. GTO, 100bb) ---------------- */
const TABLES = {
  "9max": { pos: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"], rfi: { UTG: 10, "UTG+1": 11, "UTG+2": 13, LJ: 15, HJ: 19, CO: 26, BTN: 44, SB: 40 } },
  "6max": { pos: ["UTG", "HJ", "CO", "BTN", "SB", "BB"], rfi: { UTG: 16, HJ: 21, CO: 27, BTN: 45, SB: 42 } },
};
const ORDER = { UTG: 0, "UTG+1": 1, "UTG+2": 2, LJ: 3, HJ: 4, CO: 5, BTN: 6, SB: 7, BB: 8 };
/* Seat position by clockwise offset from the button (for full-hand mode). */
const POS_BY_OFFSET = {
  "9max": ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
  "6max": ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
};
const HU_OPEN = 82;

function defendChart(openerPos, heroPos, hu, mode) {
  if (hu) return { r: 12, c: 62 };
  if (openerPos === "SB") return { r: 13, c: 55 };
  const tier = mode === "9max" && ORDER[openerPos] <= 2 ? "ep" : openerPos === "CO" ? "co" : openerPos === "BTN" ? "btn" : "mp";
  const C = {
    ep: { BB: { r: 4, c: 20 }, SB: { r: 3.5, c: 7 }, o: { r: 3.5, c: 10 } },
    mp: { BB: { r: 5, c: 24 }, SB: { r: 4.5, c: 8 }, o: { r: 4, c: 12 } },
    co: { BB: { r: 7, c: 30 }, SB: { r: 6, c: 9 }, o: { r: 5, c: 14 } },
    btn: { BB: { r: 10, c: 38 }, SB: { r: 9, c: 12 }, o: { r: 7, c: 16 } },
  }[tier];
  return C[heroPos] || C.o;
}
/* Facing 3-bets/4-bets: thresholds are all-hands percentiles (hero holds a
   top-of-range open, so "continue top 14%" ≈ defending ~70% of a 20% open).
   Provenance: base values are public-consensus adjacent; the position and
   stack shifts below are authored live adjustments.
   - An in-position non-blind 3-bettor (BTN/CO over an early open) has the
     widest range → defend wider. Blind 3-bets vs steals skew value live.
   - Short effective (<35bb): continuing ≈ committing — call less, jam more.
   - Deep (250bb+): flat more in position, 4-bet tighter (deep 4-bet pots are
     aces-heavy in live games). */
function vs3Chart(heroPos, aggPos, eff) {
  let r = 4, c = 14;
  const blind3 = aggPos === "SB" || aggPos === "BB";
  const ip3 = aggPos && heroPos && ORDER[aggPos] > ORDER[heroPos] && !blind3;
  if (ip3) { r = 4.5; c = 16.5; }
  if (blind3) { r = 3.6; c = 12.5; }
  if (eff != null && eff < 35) { c = Math.min(c, 9); r += 0.8; }
  else if (eff != null && eff >= 250) { c *= 1.18; r *= 0.8; }
  return { r, c };
}
function vs4Chart(eff) {
  let r = 2.2, c = 5.5;
  if (eff != null && eff < 35) { c = Math.min(c, 4); r += 0.4; }
  else if (eff != null && eff >= 250) { c *= 1.1; r *= 0.75; }
  return { r, c };
}
const VSJAM = { c: 4.5 };
const GTO_JAMREP = 4.5;
/* Facing an all-in (or a committing 4-bet), the decision is dominated by WHO is
   shoving and the price. A Nit gets it in with ~{KK,AA} (top 0.9%), so QQ (1.13%)
   is behind it and folds deep — but shorter stacks are priced in and call wider.
   Returns continue/re-jam thresholds as all-hands percentiles. */
function stackoffZones(jamRep, eff, isJam) {
  const jr = jamRep == null ? GTO_JAMREP : jamRep;
  const e = eff == null ? 100 : eff;
  // Pot-odds proxy: short = priced in (call wider), deep = need to be well ahead.
  // Deep tightens steeply — at 200bb+ the dead money is tiny next to the stack,
  // so stacking off needs a big edge (MC oracle: calling KK/TT off 200bb vs a
  // tight jam is -40 to -68bb). Short widens (priced in).
  const oddsF = e <= 100 ? Math.min(1.5, 0.88 + (100 - e) * 0.008) : Math.max(0.38, 0.88 - (e - 100) * 0.005);
  const widen = isJam ? 1 : 1.25; // a sized 4-bet lets you see a flop; a jam doesn't
  let c = Math.max(0.4, Math.min(45, jr * oddsF * widen));
  const r = Math.max(0.25, Math.min(6, jr * 0.25)); // re-jam/5-bet only the nuts (wider vs maniacs)
  c = Math.max(c, r + 0.3);
  return { r, c };
}
const MIX = 2.5, EV_PER_PCT = 0.12, EV_CAP = 6;

/* ---- C9: the lineup is strategy input ----
   Live strategy depends on WHO is in the pot, so the zone charts themselves
   shift with the table: opener range width scales defends, the players behind
   scale opens, and the responders' fold/call tendencies scale postflop value
   and bluff regions. Every weight is anchored to the GTO Bot's parameters —
   a table of GTO Bots reproduces the baseline chart exactly, and deviations
   are proportional to how the real lineup differs. All shifts are bounded so
   exploits tilt the chart, never replace it. */
const clampF = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function dynCtx(sc) {
  const out = {};
  if (sc.openerP) out.openerRfi = sc.openerP.rfi;
  if (sc.behindAgg) out.behindAgg = sc.behindAgg;
  const fld = sc.field && sc.field.length ? sc.field : sc.vil ? [sc.vil] : null;
  if (fld) {
    const n = fld.length;
    out.vilBet = { f: fld.reduce((s, v) => s + v.p.vsBet.f, 0) / n, c: fld.reduce((s, v) => s + v.p.vsBet.c, 0) / n };
    out.vilCbet = fld[0].p.cbet; // defense faces a single bettor
  }
  return out;
}

function zonesFor(stage, ctx) {
  if (stage === "rfi") {
    const bbv = ctx.bbv || 2;
    const nL = ctx.limpers || 0;
    const arr = opensBB(bbv, ctx.hu);
    const baseT = ctx.hu ? HU_OPEN : ctx.rfiT;
    // Bigger opens tighten the profitable opening range — and iso-raises over
    // limpers are bigger by construction (+1bb per limper), so the same size
    // machinery produces the tighter iso range with no separate table.
    // Lineup shift: callers behind widen value opens (they pay off); 3-bettors
    // behind tax wide opens. Anchored to GTO-Bot tendencies.
    const ba = ctx.behindAgg;
    const lineupAdj = ba ? clampF(1 + 0.5 * (ba.c - PROF.gto.vsRaise.c) - 1.4 * (ba.r - PROF.gto.vsRaise.r), 0.85, 1.15) : 1;
    const t = Math.max(2, baseT * rfiTighten(refOpenBB(bbv, ctx.hu) + nL) * lineupAdj);
    const limpFrom = t;
    // No limpers: a thin trap band. With limpers: a real overlimp band — pairs,
    // suited, connected hands that want a cheap multiway flop, not a bloated pot.
    const limpTo = ctx.hu ? t : (ctx.heroPos === "BB" && nL) ? 100 : nL ? Math.min(96, t + Math.max(10, t * 0.6)) : Math.max(t, t + Math.min(6, t * 0.35));
    const lo = usd(chipBB(arr[0] + nL, bbv) * bbv), hi = usd(chipBB(arr[arr.length - 1] + nL, bbv) * bbv);
    const word = nL ? "ISO" : "OPEN";
    const lbl = arr.length > 1 ? `${word} ${lo}–${hi}` : `${word} ${lo}`;
    return [
      { a: "raiseS", lbl, from: 0, to: t }, // any listed size is fine; canonical raise-zone id
      { a: "limp", lbl: nL ? "OVERLIMP" : undefined, from: limpFrom, to: limpTo },
      { a: "fold", from: limpTo, to: 100 },
    ];
  }
  if (stage === "vsOpen") {
    const d = defendChart(ctx.openerPos, ctx.heroPos, ctx.hu, ctx.mode);
    // Facing a bigger open, defend tighter (worse price, stronger opener range).
    const tf = defTighten(ctx.openBB || 2.3);
    const nC = ctx.callers || 0;
    // Callers in between: 3-bets become squeezes — value-lean (worse fold equity,
    // someone always calls live) — while calling gets better (price + multiway
    // implied odds, especially the hands that flop big).
    // Stack depth vs the opener reshapes calling: short kills implied odds
    // (speculative flats can't get paid), very deep feeds them.
    const eo = ctx.effOpp;
    const depthF = eo != null && eo < 40 ? 0.75 : eo != null && eo >= 250 ? 1.12 : 1;
    // Who opened matters as much as where: a Nit's 0.65× range is defended far
    // tighter than a Maniac's 1.7×. Anchored so a GTO-width open = baseline.
    const wf = ctx.openerRfi ? clampF(0.55 + 0.45 * ctx.openerRfi, 0.8, 1.3) : 1;
    const rT = d.r * tf * (nC ? 0.8 : 1) * wf;
    const cT = Math.min(85, d.c * tf * (1 + 0.22 * nC) * depthF * wf);
    return [
      { a: "raiseS", lbl: "3-BET", from: 0, to: rT },
      { a: "call", from: rT, to: cT },
      { a: "fold", from: cT, to: 100 },
    ];
  }
  if (stage === "vs3bet") { const d3 = vs3Chart(ctx.heroPos, ctx.aggPos, ctx.effAgg); return [{ a: "raise", from: 0, to: d3.r }, { a: "call", from: d3.r, to: d3.c }, { a: "fold", from: d3.c, to: 100 }]; }
  if (stage === "vs4bet") { const d4 = stackoffZones(ctx.jamRep, ctx.effAgg, false); return [{ a: "raise", from: 0, to: d4.r }, { a: "call", from: d4.r, to: d4.c }, { a: "fold", from: d4.c, to: 100 }]; }
  if (POST_STAGES.includes(stage)) {
    /* Solver-calibrated zone tables per flop archetype (aggregate-frequency informed), shifted by SPR.
       sh > 0 when shallow: value/stack-off widens, defends widen. dp: very deep tightens thin value.
       mw > 1 = multiway: someone always has a piece, so value tightens, bluffs
       mostly vanish, and bluff-catching thins — the live family-pot adjustment. */
    const spr = ctx.spr == null ? 6 : ctx.spr;
    const sh = Math.max(-4, Math.min(8, (2.5 - spr) * 2.2));
    const dp = spr > 6 ? Math.min(6, (spr - 6) * 0.8) : 0;
    const mw = Math.max(1, ctx.mw || 1);
    const mwV = (mw - 1) * 7;                       // value threshold tightens per extra opponent
    const mwBl = mw === 1 ? 1 : mw === 2 ? 0.45 : 0.2; // bluff band survival factor
    const mwC = 1 - 0.12 * (mw - 1);                // continue-vs-bet tightening
    // Lineup weights (GTO-Bot-anchored, bounded): vs callers thin value widens
    // and bluffs die; vs folders bluffs grow. Defense widens vs frequent bettors.
    const vb = ctx.vilBet;
    const vF = vb ? clampF(1 + (vb.c - PROF.gto.vsBet.c) * 0.35, 0.85, 1.25) : 1;   // value-width factor
    const bfF = vb ? clampF(1 + (vb.f - PROF.gto.vsBet.f) * 2.5, 0.4, 1.5) : 1;     // bluff-band factor
    const cbF = ctx.vilCbet != null ? clampF(1 + (ctx.vilCbet - PROF.gto.cbet) * 0.5, 0.88, 1.12) : 1; // vs-bettor-frequency factor
    const B = {
      ahi: { v: 44, mid: 66, bl: 90, r: 13, c: 60 },
      bwy: { v: 42, mid: 63, bl: 87, r: 13, c: 59 },
      paired: { v: 40, mid: 64, bl: 88, r: 14, c: 58 },
      low: { v: 36, mid: 60, bl: 80, r: 15, c: 58 },
      wet: { v: 33, mid: 60, bl: 76, r: 19, c: 55 },
      mono: { v: 30, mid: 62, bl: 72, r: 12, c: 50 },
    }[ctx.tb] || { v: 36, mid: 60, bl: 80, r: 15, c: 58 };
    if (stage === "cbet" || stage === "barrel") {
      const st = stage === "barrel" ? 5 : 0;
      const street = stage === "barrel" ? "turn" : "flop";
      const v = Math.max(6, (B.v - st + (ctx.ip ? 2 : -3) + sh - dp - mwV) * vF);
      const bl = Math.max(B.mid, B.mid + (B.bl - st - (ctx.ip ? 0 : 5) - B.mid) * mwBl * bfF);
      const polar = stage === "barrel" || ctx.tb === "wet" || ctx.tb === "mono";
      const L = (sz) => `BET ${pctLbl(SIZES[street][sz])}`;
      const val = polar
        ? { a: "bet", sz: "b", sizes: stage === "barrel" ? ["b", "s"] : ["b"], lbl: L("b") }
        : { a: "bet", sz: "s", sizes: ["s", "b"], lbl: L("s") };
      const blf = polar ? { a: "bet", sz: "b", sizes: ["b"], lbl: L("b") } : { a: "bet", sz: "s", sizes: ["s"], lbl: L("s") };
      return [{ ...val, from: 0, to: v }, { a: "check", from: v, to: B.mid }, { ...blf, from: B.mid, to: bl }, { a: "check", from: bl, to: 100 }];
    }
    if (stage === "vsCbet" || stage === "vsBarrel") {
      const st = stage === "vsBarrel" ? 1 : 0;
      const baseF = st ? POSTBET.turn : POSTBET.flop;
      const frac = ctx.frac == null ? baseF : ctx.frac;
      const mdf = (1 / (1 + frac)) / (1 / (1 + baseF));
      // Multiway: raises go value-only and bluff-catches thin — MDF is a heads-up
      // concept; with players still in, someone else can have it.
      const r = Math.max(3, (B.r - st * 4 + sh * 0.5) * (1 + (baseF - frac) * 0.5) * (mw > 1 ? 0.8 : 1));
      const c = Math.max(r + 8, Math.min(80, (B.c - st * 10 + sh * 0.8) * mdf * mwC * cbF));
      return [{ a: "raise", from: 0, to: r }, { a: "call", from: r, to: c }, { a: "fold", from: c, to: 100 }];
    }
    if (stage === "riverBet") {
      const v = Math.max(10, (36 + sh * 0.5 - dp - mwV) * vF);
      const nut = Math.max(6, Math.min(13, v - 1));
      const blTo = Math.min(92, 78 + 12 * mwBl * bfF); // river bluffs scale with who's folding
      return [
        { a: "bet", sz: "b", sizes: ["b", "s"], lbl: `BET ${pctLbl(SIZES.river.b)}`, from: 0, to: nut },
        { a: "bet", sz: "s", sizes: ["s"], lbl: `BET ${pctLbl(SIZES.river.s)}`, from: nut, to: v },
        { a: "check", from: v, to: 78 },
        { a: "bet", sz: "b", sizes: ["b", "s"], lbl: `BET ${pctLbl(SIZES.river.b)}`, from: 78, to: blTo },
        { a: "check", from: blTo, to: 100 },
      ];
    }
    const frac = ctx.frac == null ? 0.75 : ctx.frac;
    const c = Math.min(80, (47 + sh * 0.6) * ((1 / (1 + frac)) / (1 / 1.75)) * mwC * cbF);
    return [{ a: "call", from: 0, to: c }, { a: "fold", from: c, to: 100 }];
  }
  const jz = stackoffZones(ctx.jamRep, ctx.effAgg, true);
  return [{ a: "call", from: 0, to: jz.c }, { a: "fold", from: jz.c, to: 100 }];
}

function grade(zones, pct, action, m = MIX) {
  const zone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  if (action === zone.a) return { verdict: "best", ev: 0, best: zone.a, zones };
  const mine = zones.filter((z) => z.a === action);
  let dist = 999;
  for (const z of mine) dist = Math.min(dist, pct < z.from ? z.from - pct : pct - z.to);
  if (dist <= m) return { verdict: "ok", ev: +(dist * 0.04).toFixed(2), best: zone.a, zones };
  return { verdict: "miss", ev: +Math.min(EV_CAP, 0.05 + dist * EV_PER_PCT).toFixed(2), best: zone.a, zones };
}
/* Size-aware grading for aggressor spots: right region + right size = GTO; a listed mix size = fine
   with a small EV give-up; the wrong size in the right region = a pot-scaled sizing leak. */
function gradeSized(zones, pct, action, potBB, m = 6) {
  const zone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  const isBet = action === "betS" || action === "betB";
  const sz = action === "betS" ? "s" : "b";
  const bestId = zone.a === "bet" ? (zone.sz === "s" ? "betS" : "betB") : "check";
  const distTo = (act) => {
    const mine = zones.filter((z) => (act === "check" ? z.a === "check" : z.a === "bet" && z.sizes.includes(act === "betS" ? "s" : "b")));
    let d = 999;
    for (const z of mine) d = Math.min(d, pct < z.from ? z.from - pct : pct - z.to);
    return d;
  };
  if (zone.a === "bet" && isBet) {
    if (zone.sz === sz) return { verdict: "best", ev: 0, best: bestId, zones };
    if (zone.sizes.includes(sz)) return { verdict: "ok", ev: +Math.min(0.5, Math.max(0.05, 0.02 * potBB)).toFixed(2), best: bestId, zones, sized: "mix" };
    return { verdict: "miss", ev: +Math.min(1.5, Math.max(0.2, 0.06 * potBB)).toFixed(2), best: bestId, zones, sized: sz === "s" ? "small" : "big" };
  }
  if (zone.a === "check" && !isBet) return { verdict: "best", ev: 0, best: "check", zones };
  const d = distTo(action);
  if (d <= m) return { verdict: "ok", ev: +(d * 0.04).toFixed(2), best: bestId, zones };
  return { verdict: "miss", ev: +Math.min(EV_CAP, 0.05 + d * EV_PER_PCT).toFixed(2), best: bestId, zones };
}
/* Stack-off pots (all-in / 4-bet) are graded pot-scaled, not percentile-tiny:
   being on the wrong side of the call/fold line in a jam pot costs a big slice
   of the pot, so the MIX forgiveness that makes sense for a min-raise defence is
   wrong here (it was pricing a QQ-vs-nit-shove misclick at ~0.01bb). */
function gradeStackoff(zones, pct, action, potBB) {
  const zone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  const norm = (x) => (typeof x === "string" && x.indexOf("raise") === 0 ? "raise" : x);
  if (norm(action) === norm(zone.a)) return { verdict: "best", ev: 0, best: zone.a, zones };
  const mine = zones.filter((z) => norm(z.a) === norm(action));
  let dist = 0; if (mine.length) { dist = 999; for (const z of mine) dist = Math.min(dist, pct < z.from ? z.from - pct : pct - z.to); if (dist === 999) dist = 0; }
  const frac = Math.max(0.03, Math.min(0.5, 0.03 + dist * 0.02)); // deeper into the wrong region = costlier
  return { verdict: "miss", ev: +((potBB || 20) * frac).toFixed(2), best: zone.a, zones };
}
/* Dollar amount hero must put in to call, for the preflop facing-a-bet stages. */
function toCallBB(sc) {
  const bv = sc.bbv || 2, hu = sc.hu;
  if (sc.stage === "vsJam") return sc.jamCall != null ? sc.jamCall : Math.max(0.5, Math.min(sc.aggStk || sc.S, sc.S));
  if (sc.stage === "vsOpen") return Math.max(0, (sc.openBB || OPEN(hu, bv)) - (blindC(sc.heroPos, bv) || 0));
  if (sc.stage === "vs3bet") { const ob = sc.openBB || OPEN(hu, bv); return Math.max(0, threeBetBB(ob, "s") - ob); }
  if (sc.stage === "vs4bet") { const ob = sc.openBB || OPEN(hu, bv); const tb = threeBetBB(ob, "s"); return Math.max(0, fourBetBB(tb) - tb); }
  return 0;
}

function resolveLeak(stage, g, action) {
  if (g.sized === "small") return stage === "riverBet" ? "rv_undersize" : stage === "rfi" ? "rfi_size" : stage === "vsOpen" ? "def_size" : "pf_undersize";
  if (g.sized === "big") return stage === "riverBet" ? "rv_oversize" : stage === "rfi" ? "rfi_size" : stage === "vsOpen" ? "def_size" : "pf_oversize";
  const b = g.best && g.best.startsWith("bet") ? "bet" : g.best;
  const a = action.startsWith("bet") ? "bet" : action;
  return leakKey(stage, b, a);
}
/* Preflop grader: raise family is size-agnostic (all listed live sizes are standard);
   limp/call/fold graded by distance from their zones. */
function gradeRaise(zones, pct, action, m = MIX) {
  const zone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  const fam = (x) => (typeof x === "string" && x.indexOf("raise") === 0 ? "raise" : x);
  const zoneFam = fam(zone.a), actFam = fam(action);
  const bestId = zone.a;
  if (zoneFam === actFam) return { verdict: "best", ev: 0, best: bestId, zones };
  const mine = zones.filter((z) => fam(z.a) === actFam);
  let dist = 999;
  for (const z of mine) dist = Math.min(dist, pct < z.from ? z.from - pct : pct - z.to);
  if (dist <= m) return { verdict: "ok", ev: +(dist * 0.04).toFixed(2), best: bestId, zones };
  return { verdict: "miss", ev: +Math.min(EV_CAP, 0.05 + dist * EV_PER_PCT).toFixed(2), best: bestId, zones };
}

/* ---------------- Stakes, chips & pot math ---------------- */
const STAKES = [
  { label: "$1/$2", bb: 2, sb: 1, inc: 1 },
  { label: "$1/$3", bb: 3, sb: 1, inc: 1 },
  { label: "$2/$5", bb: 5, sb: 2, inc: 5 },
];
const STACK_OPTS = [40, 60, 100, 150, 200, 300, 500]; // starting stacks in bb — deep live games run 300bb+
const SB_OF = { 2: 0.5, 3: 1 / 3, 5: 0.4 }; // small blind in bb, per $/bb
const INC_OF = { 2: 1, 3: 1, 5: 5 }; // live chip increment in $
const usd = (x) => { const r = Math.round(x * 100) / 100; return "$" + (Number.isInteger(r) ? r : r.toFixed(2)); };
/* Round a bb amount to a clean live-chip dollar amount, return in bb */
const chipBB = (bb, bbv) => {
  const inc = INC_OF[bbv] || 1;
  const d = Math.max(inc, Math.round((bb * bbv) / inc) * inc);
  return d / bbv;
};
/* Live cash-game open sizes in DOLLARS per stake. Live players anchor to dollars,
   not blinds: $1/$3 sizes sit close to $1/$2, and $2/$5 opens are flatter ($15–25).
   All listed sizes are "standard" — any is a fine choice; size is player preference. */
const OPENS_USD = { 2: [10, 15], 3: [12, 15], 5: [15, 20, 25] };
const OPEN_IDS3 = ["raiseS", "raiseM", "raiseB"];
function opensBB(bbv, hu) {
  if (hu) return [2.2, 2.5]; // heads-up isn't live-cash; keep small
  const u = OPENS_USD[bbv] || [Math.round(5 * bbv), Math.round(7.5 * bbv)];
  return u.map((d) => d / bbv);
}
function openIds(bbv, hu) {
  const n = opensBB(bbv, hu).length;
  return n >= 3 ? OPEN_IDS3 : ["raiseS", "raiseB"];
}
function openBBForId(id, bbv, hu) {
  const arr = opensBB(bbv, hu), ids = openIds(bbv, hu);
  const i = ids.indexOf(id);
  return arr[i < 0 ? 0 : i];
}
// Representative "standard" open used to size range-tightening (median-ish of the menu).
function refOpenBB(bbv, hu) {
  const arr = opensBB(bbv, hu);
  return arr[Math.floor((arr.length - 1) / 2)];
}
const OPEN = (hu, bbv) => refOpenBB(bbv || 2, hu); // representative open in bb
const OPEN_SZ = (sz, hu, bbv) => { const a = opensBB(bbv || 2, hu); return sz === "s" ? a[0] : a[a.length - 1]; };
/* 3-bet ≈ 3.1× the open (standard) or 4.2× (large); 4-bet ≈ 2.2× the 3-bet. */
const threeBetBB = (openBB, sz) => openBB * (sz === "b" ? 4.2 : 3.1);
const TBET = (hu, bbv) => threeBetBB(OPEN(hu, bbv), "s");
const fourBetBB = (threeBB) => threeBB * 2.2;
/* How much a given open size (in bb) tightens the opening range vs a 2.3bb baseline.
   Bigger opens risk more to win the same blinds → tighter, more value-dense range. */
function rfiTighten(openBB) {
  return Math.max(0.6, Math.min(1.02, Math.pow(2.3 / Math.max(2, openBB), 0.42)));
}
/* How much a given open size tightens the defender's continue range (worse price,
   stronger opener range → fold more, defend a tighter/more polarized range). */
function defTighten(openBB) {
  return Math.max(0.55, Math.min(1.05, Math.pow(2.5 / Math.max(2.2, openBB), 0.5)));
}
const blindC = (pos, bbv) => (pos === "SB" ? SB_OF[bbv] || 0.5 : pos === "BB" ? 1 : 0);
const srpPot = (open, a, b, bbv) => 2 * open + (1 + (SB_OF[bbv] || 0.5) - blindC(a, bbv) - blindC(b, bbv));
const POSTBET = { flop: 0.66, turn: 0.7, river: 0.75 };
/* Hero's selectable sizings per street: small + big (chip-rounded, stack-capped) */
const SIZES = { flop: { s: 0.33, b: 0.75 }, turn: { s: 0.66, b: 1.25 }, river: { s: 0.75, b: 1.5 } };
const pctLbl = (f) => `${Math.round(f * 100)}%`;
const AGG_STAGES = ["cbet", "barrel", "riverBet"];
/* Villains pick a size too — aggro profiles size up, passive ones stab small */
function pickVSize(p, street) {
  const big = Math.min(0.55, Math.max(0.08, p.cbet - 0.4));
  const small = Math.min(0.5, Math.max(0.1, 0.75 - p.cbet + (street === "flop" ? 0.15 : 0)));
  const r = Math.random();
  if (r < small) return SIZES[street].s;
  if (r < small + big) return SIZES[street].b;
  return POSTBET[street];
}
/* Fold/call/raise response scales with the size faced: small bets get peeled, big bets fold more */
function respondToBet(p, frac) {
  const f = Math.min(0.85, Math.max(0.05, p.vsBet.f * Math.pow(frac / 0.66, 0.8)));
  const r = Math.min(0.4, p.vsBet.r * (frac < 0.5 ? 1.25 : frac > 1 ? 0.8 : 1));
  const x = Math.random();
  return x < f ? "f" : x < f + r ? "r" : "c";
}
const postOrd = (p) => (p === "SB" ? 0 : p === "BB" ? 1 : 2 + ORDER[p]);
const postIP = (hero, vil) => postOrd(hero) > postOrd(vil);
const POST_STAGES = ["cbet", "barrel", "riverBet", "vsCbet", "vsBarrel", "riverCall"];
/* Bet currently faced: villain's chosen size (vFrac), chip-rounded, capped by stack */
function betInfo(sc, frac) {
  const bbv = sc.bbv || 2;
  const f = frac != null ? frac : sc.vFrac != null ? sc.vFrac : POSTBET[sc.street];
  const eff = sc.effBB == null ? 9999 : sc.effBB;
  const b = chipBB(f * sc.potBB, bbv);
  if (b >= eff - 0.01) return { b: eff, allIn: true, frac: f };
  return { b, allIn: false, frac: f };
}
/* Hero's bet menu for aggressor spots; sizes merge into one all-in when the stack collapses them */
function heroBetOpts(sc) {
  const bv = sc.bbv || 2;
  const cap = (f) => Math.min(sc.effBB, chipBB(f * sc.potBB, bv));
  const bs = cap(SIZES[sc.street].s), bb2 = cap(SIZES[sc.street].b);
  if (bb2 - bs < 0.01) return [{ id: "betB", b: bb2, frac: SIZES[sc.street].b, allIn: true }];
  return [
    { id: "betS", b: bs, frac: SIZES[sc.street].s, allIn: bs >= sc.effBB - 0.01 },
    { id: "betB", b: bb2, frac: SIZES[sc.street].b, allIn: bb2 >= sc.effBB - 0.01 },
  ];
}

function dealBoard(n, used) {
  const out = [];
  while (out.length < n) {
    const i = (Math.random() * 52) | 0;
    const c = { r: (i % 13) + 2, s: SUITS[(i / 13) | 0] };
    if ([...used, ...out].some((u) => u.r === c.r && u.s === c.s)) continue;
    out.push(c);
  }
  return out;
}
function texture(board) {
  const sc = {};
  board.forEach((c) => (sc[c.s] = (sc[c.s] || 0) + 1));
  const mx = Math.max(...Object.values(sc));
  let tx = mx >= 4 ? 0.9 : mx === 3 ? 0.6 : mx === 2 && board.length === 3 ? 0.3 : 0.15;
  const rs = [...new Set(board.map((c) => c.r))].sort((x, y) => x - y);
  for (let i = 1; i < rs.length; i++) if (rs[i] - rs[i - 1] <= 2) tx += 0.18;
  if (rs.length < board.length) tx -= 0.15;
  return Math.min(1, Math.max(0, tx));
}
/* Solver-report flop archetypes: A-high dry / broadway / paired / monotone / wet-connected / low */
function textureBucket(board) {
  const sc = {};
  board.forEach((c) => (sc[c.s] = (sc[c.s] || 0) + 1));
  const mx = Math.max(...Object.values(sc));
  if (mx >= 3) return "mono";
  const rs = board.map((c) => c.r);
  if (new Set(rs).size < board.length) return "paired";
  const sorted = [...rs].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] <= 2) conn++;
  const twoTone = mx >= 2;
  if (conn >= board.length - 1 || (twoTone && conn >= 1)) return "wet";
  const hi = Math.max(...rs);
  if (hi === 14) return "ahi";
  if (hi >= 11) return "bwy";
  return "low";
}
function bestStraightHigh(set) {
  let hi = 0;
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true;
    for (let k = lo; k < lo + 5; k++) if (!set.has(k)) { ok = false; break; }
    if (ok) hi = lo + 4;
  }
  return hi;
}
/* Hand strength vs a board: rank 1 (nuts) .. 99 (air), draw-aware, decaying by street */
function classify(hole, board) {
  const [a, b] = hole;
  const br = board.map((c) => c.r);
  const sortedB = [...br].sort((x, y) => y - x);
  const topB = sortedB[0], secondB = sortedB[1] || 0;
  const bCount = {};
  br.forEach((r) => (bCount[r] = (bCount[r] || 0) + 1));
  const boardPaired = Object.values(bCount).some((n) => n >= 2);
  const pocket = a.r === b.r;
  const mA = bCount[a.r] || 0, mB = bCount[b.r] || 0;

  let flush = false, nutFlush = false, flushDraw = false;
  for (const s of SUITS) {
    const nb = board.filter((c) => c.s === s).length;
    const hs = hole.filter((c) => c.s === s);
    if (nb + hs.length >= 5 && hs.length >= 1) { flush = true; if (hs.some((c) => c.r === 14)) nutFlush = true; }
    if (board.length < 5 && nb + hs.length === 4 && hs.length >= 1) flushDraw = true;
  }
  const allSet = new Set([...hole, ...board].map((c) => c.r));
  if (allSet.has(14)) allSet.add(1);
  const bSet = new Set(br);
  if (bSet.has(14)) bSet.add(1);
  const stAll = bestStraightHigh(allSet), stB = bestStraightHigh(bSet);
  const straight = stAll > stB;
  let windows = 0;
  if (board.length < 5 && !straight && !flush) {
    for (let lo = 1; lo <= 10; lo++) {
      let present = 0, heroIn = false;
      for (let k = lo; k < lo + 5; k++) {
        if (allSet.has(k)) present++;
        if (a.r === k || b.r === k || (k === 1 && (a.r === 14 || b.r === 14))) heroIn = true;
      }
      if (present === 4 && heroIn) windows++;
    }
  }
  const oesd = windows >= 2, gutshot = windows === 1;
  const overcards = !pocket && a.r > topB && b.r > topB && board.length === 3;

  let raw = 8, label = "air";
  if (pocket && mA === 2) { raw = 99; label = "quads"; }
  else if (mA === 3 || mB === 3) { raw = 98; label = "full house"; }
  else if ((mA === 2 && mB >= 1) || (mB === 2 && mA >= 1) || (pocket && mA === 1 && boardPaired)) { raw = 96; label = "full house"; }
  else if (flush) { raw = nutFlush ? 95 : 91; label = nutFlush ? "nut flush" : "flush"; }
  else if (straight) { raw = 88; label = "straight"; }
  else if (pocket && mA === 1) { raw = 86; label = "set"; }
  else if (mA === 2 || mB === 2) { raw = 80; label = "trips"; }
  else if (mA === 1 && mB === 1) { raw = 78; label = "two pair"; }
  else if (pocket && a.r > topB) { raw = Math.min(78, 70 + (a.r - topB) * 0.7); label = "overpair"; }
  else if (mA === 1 || mB === 1) {
    const pr = mA === 1 ? a.r : b.r, kick = mA === 1 ? b.r : a.r;
    if (pr === topB) { raw = kick >= 13 ? 68 : kick >= 10 ? 63 : 56; label = kick >= 13 ? "top pair, top kicker" : "top pair"; }
    else if (pr >= secondB) { raw = 46; label = "middle pair"; }
    else { raw = 36; label = "weak pair"; }
  } else if (pocket) { raw = a.r > secondB ? 44 : 32; label = "pocket pair, under top card"; }
  else if (Math.max(a.r, b.r) === 14) { raw = 20; label = "ace high"; }

  const mult = board.length === 3 ? 1 : board.length === 4 ? 0.55 : 0;
  let drawRaw = 0;
  const dl = [];
  if (flushDraw) { drawRaw += 34; dl.push("flush draw"); }
  if (oesd) { drawRaw += 30; dl.push("open-ended draw"); }
  else if (gutshot) { drawRaw += 14; dl.push("gutshot"); }
  if (overcards && !flushDraw) { drawRaw += 6; dl.push("two overcards"); }
  raw = Math.min(97, raw + drawRaw * mult * (raw > 60 ? 0.35 : 1));
  if (dl.length && raw < 90 && mult > 0) label = label === "air" ? dl.join(" + ") : label + " + " + dl[0];

  return { rank: Math.min(99, Math.max(1, 100 - raw)), label };
}
/* Attach/refresh postflop fields on a scenario */
function postSeed(sc, street, potBB) {
  const need = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  const have = sc.board || [];
  const board = have.length >= need ? have.slice(0, need) : [...have, ...dealBoard(need - have.length, [...sc.hand.cards, ...have])];
  const cls = classify(sc.hand.cards, board);
  return { ...sc, street, board, potBB, cls, tx: texture(board), tb: textureBucket(board) };
}


const LEAKS = {
  rfi_tight: { label: "Folding profitable opens", drill: "rfi" },
  rfi_loose: { label: "Opening too wide", drill: "rfi" },
  rfi_limp: { label: "Limping hands that should raise or fold", drill: "rfi" },
  rfi_size: { label: "Off-sizing your opens", drill: "rfi" },
  def_size: { label: "Off-sizing your 3-bets", drill: "vsOpen" },
  def_overfold: { label: "Over-folding vs opens", drill: "vsOpen" },
  def_overcall: { label: "Calling hands that should fold", drill: "vsOpen" },
  def_flat: { label: "Flatting your 3-bet hands", drill: "vsOpen" },
  def_over3bet: { label: "3-betting too loose", drill: "vsOpen" },
  pr_overfold: { label: "Over-folding vs 3-bets+", drill: "vs3bet" },
  pr_loose: { label: "Too loose vs 3-bets+", drill: "vs3bet" },
  pr_passive: { label: "Missing 4-bets / jams", drill: "vs3bet" },
  pf_undercbet: { label: "Missing c-bets & barrels", drill: "cbet" },
  pf_overcbet: { label: "Betting hands that want to check", drill: "cbet" },
  pf_undersize: { label: "Sizing too small on dynamic boards", drill: "cbet" },
  pf_oversize: { label: "Sizing too big on static boards", drill: "cbet" },
  rv_undersize: { label: "Undersizing river value bets", drill: "rivers" },
  rv_oversize: { label: "Overbetting the wrong rivers", drill: "rivers" },
  pf_overfold_cb: { label: "Over-folding vs c-bets", drill: "vsCbet" },
  pf_stationing: { label: "Calling down too light", drill: "vsCbet" },
  pf_missraise: { label: "Missing raises with monsters & draws", drill: "vsCbet" },
  pf_spewraise: { label: "Raising too loose postflop", drill: "vsCbet" },
  rv_thinmiss: { label: "Missing thin river value", drill: "rivers" },
  rv_spew: { label: "Over-bluffing rivers", drill: "rivers" },
  rv_overfold: { label: "Over-folding rivers", drill: "rivers" },
  rv_payoff: { label: "Paying off rivers too light", drill: "rivers" },
};
function leakKey(stage, best, chosen) {
  const norm = (x) => (typeof x === "string" && x.indexOf("raise") === 0 ? "raise" : x);
  best = norm(best); chosen = norm(chosen);
  if (stage === "rfi") {
    if (best === "raise") return chosen === "limp" ? "rfi_limp" : "rfi_tight";
    if (best === "limp") return chosen === "raise" ? "rfi_loose" : "rfi_limp";
    return chosen === "limp" ? "rfi_limp" : "rfi_loose"; // best === fold
  }
  if (stage === "vsOpen") {
    if (best === "raise") return chosen === "call" ? "def_flat" : "def_overfold";
    if (best === "call") return chosen === "fold" ? "def_overfold" : "def_over3bet";
    return chosen === "call" ? "def_overcall" : "def_over3bet";
  }
  if (stage === "cbet" || stage === "barrel") return best === "bet" ? "pf_undercbet" : "pf_overcbet";
  if (stage === "vsCbet" || stage === "vsBarrel") {
    if (best === "raise") return chosen === "fold" ? "pf_overfold_cb" : "pf_missraise";
    if (best === "call") return chosen === "fold" ? "pf_overfold_cb" : "pf_spewraise";
    return chosen === "call" ? "pf_stationing" : "pf_spewraise";
  }
  if (stage === "riverBet") return best === "bet" ? "rv_thinmiss" : "rv_spew";
  if (stage === "riverCall") return best === "call" ? "rv_overfold" : "rv_payoff";
  if (best === "raise") return chosen === "call" ? "pr_passive" : "pr_overfold";
  if (best === "call") return chosen === "fold" ? "pr_overfold" : "pr_loose";
  return "pr_loose";
}

/* ---------------- Opponent profiles ---------------- */
const PROFILES = [
  /* Provenance: gto's response triples were online-calibrated; vsRaise.r 0.15
     was an online 3-bet rate — live tables run ~4-7%, so the baseline bot now
     3-bets 11% (still theory-correct-ish, no longer double the live room).
     C9's lineup weights anchor to this profile, so it defines "neutral". */
  { id: "gto", name: "GTO Bot", icon: "⚖️", desc: "Balanced, textbook frequencies", rfi: 1.0, cbet: 0.68, vsRaise: { f: 0.41, c: 0.48, r: 0.11 }, vs3: { f: 0.54, c: 0.36, r: 0.1 }, vsBet: { f: 0.4, c: 0.48, r: 0.12 }, jamRep: 4.5, jamRange: "a balanced {QQ+, AK} with a few bluffs",
    spot: "Rare in a live room. Treat a quiet, competent unknown this way until they show you otherwise — then re-type them." },
  { id: "reg", name: "Live Reg", icon: "🧢", desc: "Solid live regular — honest lines, under-bluffs", rfi: 0.9, cbet: 0.6, vsRaise: { f: 0.52, c: 0.42, r: 0.06 }, vs3: { f: 0.6, c: 0.32, r: 0.08 }, vsBet: { f: 0.47, c: 0.43, r: 0.1 }, jamRep: 1.6, jamRange: "{KK+, AK} — QQ only sometimes, essentially never a bluff",
    spot: "Knows the dealers by name, racks chips neatly, plays the same solid hands the same way every time. Their bluffs exist but are rare — big aggression means a big hand." },
  { id: "nit", name: "Nit", icon: "🪨", desc: "Ultra-tight — waits for premiums, folds a lot", rfi: 0.65, cbet: 0.55, vsRaise: { f: 0.58, c: 0.34, r: 0.08 }, vs3: { f: 0.7, c: 0.24, r: 0.06 }, vsBet: { f: 0.52, c: 0.4, r: 0.08 }, jamRep: 0.9, jamRange: "{KK, AA}, occasionally QQ or AK — never a bluff",
    spot: "Neat chip stacks, an hour of folding, never rebuys deep. When they finally raise it's the top of the deck — believe them and fold hands that look pretty." },
  { id: "tag", name: "TAG", icon: "🎯", desc: "Tight-aggressive reg — solid ranges, picks spots", rfi: 0.95, cbet: 0.66, vsRaise: { f: 0.45, c: 0.42, r: 0.13 }, vs3: { f: 0.55, c: 0.34, r: 0.11 }, vsBet: { f: 0.44, c: 0.45, r: 0.11 }, jamRep: 2.6, jamRange: "{QQ+, AK}, plus the rare balanced bluff",
    spot: "Plays few hands but plays them with a plan — quick folds, deliberate raises, watches the action even when they're out. Buys in for the max." },
  { id: "lag", name: "LAG", icon: "🔥", desc: "Loose-aggressive — wide ranges, relentless pressure", rfi: 1.35, cbet: 0.8, vsRaise: { f: 0.28, c: 0.46, r: 0.26 }, vs3: { f: 0.42, c: 0.38, r: 0.2 }, vsBet: { f: 0.32, c: 0.5, r: 0.18 }, jamRep: 8, jamRange: "wide — {99+, AJ+, suited Broadways} and plenty of bluffs",
    spot: "In every other pot, isolating limpers, 3-betting light — but it's targeted: position, pressure, the soft seats. The difference from a Maniac is the picking of spots." },
  { id: "station", name: "Station", icon: "📞", desc: "Calling station — calls almost anything, rarely folds or raises", rfi: 1.15, cbet: 0.45, vsRaise: { f: 0.14, c: 0.8, r: 0.06 }, vs3: { f: 0.25, c: 0.68, r: 0.07 }, vsBet: { f: 0.12, c: 0.83, r: 0.05 }, jamRep: 1.2, jamRange: "the nuts — a passive player getting it in has {KK+}, and rarely even that",
    spot: "Calls \"to keep you honest,\" can't fold a pair or a draw, almost never raises. The one time they do raise, it's the nuts — that's the most reliable tell in live poker." },
  { id: "maniac", name: "Maniac", icon: "💣", desc: "Hyper-aggro — raises constantly with anything", rfi: 1.7, cbet: 0.9, vsRaise: { f: 0.12, c: 0.52, r: 0.36 }, vs3: { f: 0.2, c: 0.45, r: 0.35 }, vsBet: { f: 0.2, c: 0.5, r: 0.3 }, jamRep: 16, jamRange: "almost anything — they stack off with air constantly",
    spot: "Straddles, raises dark, splashes chips with junk, stack swinging wildly. No patience and no plan — tighten up, wait for a real hand, and let them pay you off." },
];
/* Plain-words summary of a profile's assumed ranges, for the detail view */
function profDetail(p, mode) {
  const hu = mode === "hu";
  const T2 = hu ? null : TABLES[mode];
  const pc = (x) => `${Math.round(x * 100)}%`;
  const l1 = hu
    ? `Opens ≈ ${Math.min(97, Math.round(HU_OPEN * p.rfi))}% of hands from the SB (${pc(p.rfi)} of GTO width)`
    : `Opens ${pc(p.rfi)} of GTO width — UTG ≈ ${Math.round(T2.rfi[T2.pos[0]] * p.rfi)}%, BTN ≈ ${Math.min(97, Math.round(T2.rfi.BTN * p.rfi))}% of hands`;
  return [
    l1,
    `C-bets the flop ${pc(p.cbet)} of the time`,
    `Facing your open: folds ${pc(p.vsRaise.f)} · calls ${pc(p.vsRaise.c)} · 3-bets ${pc(p.vsRaise.r)}`,
    `Facing your 3-/4-bet: folds ${pc(p.vs3.f)} · calls ${pc(p.vs3.c)} · raises ${pc(p.vs3.r)}`,
    `Facing your postflop bets: folds ${pc(p.vsBet.f)} · calls ${pc(p.vsBet.c)} · raises ${pc(p.vsBet.r)}`,
  ];
}
const PROF = Object.fromEntries(PROFILES.map((p) => [p.id, p]));
function respond(d) { const r = Math.random(); return r < d.f ? "f" : r < d.f + d.c ? "c" : "r"; }
function opensHere(p, base) {
  return Math.random() < Math.min(0.97, Math.max(0.03, (base * p.rfi) / 100));
}
/* ---- Live multiway machinery ----
   Low-stakes live pots are limped and multi-called; heads-up-only scenarios don't
   train the games people actually sit in. Three structures below: limpers ahead
   of hero (iso spots), multiple callers of hero's open (multiway flops), and
   cold-callers between an open and hero (squeeze spots). */
const LIMP_P = { station: 0.55, nit: 0.3, maniac: 0.15, lag: 0.18, tag: 0.12, reg: 0.18, gto: 0.08 }; // per-orbit limp-first tendency
/* A limper facing an iso-raise is call-heavy: they liked their hand enough to
   play, and live limpers hate folding for one more bet. */
function limperVsRaise(p) {
  const f = Math.min(0.7, p.vsRaise.f * 0.55), r = p.vsRaise.r * 0.5;
  return { f, c: Math.max(0, 1 - f - r), r };
}
const isoOpenBB = (id, bbv, hu, limpers) => openBBForId(id, bbv, hu) + (limpers || 0); // live standard: +1bb per limper
const squeezeBB = (openBB, sz, callers) => threeBetBB(openBB, sz) + (callers || 0) * openBB; // 3-bet + one open per caller
/* Hero's showdown equity vs N live opponents: independent-draw approximation. */
const winPMw = (p1, mw) => Math.pow(Math.min(0.97, Math.max(0.03, p1)), Math.max(1, mw || 1));
/* Live stacks are a mosaic, not a row of matched buy-ins. Profile-flavored draw:
   rocks sit near the buy-in, stations bleed or top up, maniacs are busto or
   sitting on a mountain — and sometimes somebody simply has you covered deep. */
function vilStk(p, S, bbv) {
  const r = Math.random(), r2 = Math.random();
  let bb;
  if (p.id === "nit") bb = 80 + r * 70;
  else if (p.id === "station") bb = 35 + r * 115;
  else if (p.id === "maniac") bb = r < 0.45 ? 22 + r2 * 70 : 130 + r2 * 320;
  else if (p.id === "lag") bb = 60 + r * 300;
  else bb = 70 + r * 200;
  if (Math.random() < 0.15) bb = Math.max(bb, S * (1.05 + r2 * 0.9)); // someone has you covered
  return chipBB(Math.max(15, Math.min(600, bb)), bbv);
}
/* Effective stack for a confrontation: you can only win what the shorter stack has. */
const effVs = (S, stk, committed) => Math.max(1, Math.min(S, stk == null ? S : stk) - (committed || 0));
/* Stack-aware response to a bet: a short stack facing most of their chips is
   priced in — they call all-in for less or they're already gone; nobody folds
   for $75 more. Returns the response plus the capped call amount if all-in. */
function respondToBetStk(v, frac, betBB) {
  let r = respondToBet(v.p, frac);
  const stk = v.stk;
  if (stk == null) return { r, cap: null };
  if (betBB >= stk) {
    if (r === "r") r = "c";
    if (r === "f" && Math.random() < 0.5) r = "c"; // the price makes folding rare
    return { r, cap: r === "c" ? stk : null };
  }
  if (betBB >= stk * 0.55 && r === "f" && Math.random() < 0.6) r = "c"; // priced in — sticky
  if (betBB >= stk * 0.8 && r === "r") r = "c";
  return { r, cap: null };
}

/* ---------------- Scenario generation ---------------- */
function genScenario(cfg, filter, tries = 0) {
  if (filter === "cbet" || filter === "vsCbet" || filter === "rivers") return genPostDrill(cfg, filter);
  const hu = cfg.mode === "hu";
  const S = STACK_OPTS[cfg.stack == null ? 2 : cfg.stack];
  const bbv = STAKES[cfg.stake == null ? 0 : cfg.stake].bb;
  const sb = SB_OF[bbv];
  const openC = chipBB(OPEN(hu, bbv), bbv), tbC = chipBB(TBET(hu, bbv), bbv);
  const openBB = OPEN(hu, bbv);
  const D = (x) => usd(x * bbv);
  if (hu) {
    const v = PROF[cfg.hu];
    const vs = () => vilStk(v, S, bbv);
    const rfiSc = () => { const stk = vs(); return { hu, S, bbv, effBB: effVs(S, stk, 1), heroPos: "SB", hand: dealBiased(foldBoundary("rfi", { hu, mode: cfg.mode, rfiT: HU_OPEN, heroPos: "SB", bbv })), stage: "rfi", potBB: (1 + sb), villains: [{ pos: "BB", p: v, stk }] }; };
    const vsOpenSc = () => { const stk = vs(); return { hu, S, bbv, openBB, effBB: effVs(S, stk, openC), effPre: Math.min(S, stk), heroPos: "BB", hand: dealBiased(foldBoundary("vsOpen", { openerPos: "SB", heroPos: "BB", hu, mode: cfg.mode, openBB, bbv })), stage: "vsOpen", openerPos: "SB", openerP: v, openerStk: stk, potBB: (openC + 1), villains: [{ pos: "SB", p: v, stk, act: `opens ${D(openC)}` }] }; };
    if (filter === "vsOpen") return vsOpenSc();
    if (filter === "vs3bet") { const stk = vs(); return { hu, S, bbv, openBB, effBB: effVs(S, stk, tbC), aggStk: stk, heroPos: "SB", hand: sampleFromTop(HU_OPEN), stage: "vs3bet", aggP: v, aggPos: "BB", potBB: (openC + tbC), pre: `You open ${D(openC)}`, villains: [{ pos: "BB", p: v, stk, act: `3-bets ${D(tbC)}` }] }; }
    if (filter === "rfi") return rfiSc();
    if (Math.random() < 0.5) return rfiSc();
    if (opensHere(v, HU_OPEN)) return vsOpenSc();
    return tries < 30 ? genScenario(cfg, filter, tries + 1) : rfiSc();
  }
  // ring game (9-max or 6-max)
  const { pos: POSN, rfi: RFIT } = TABLES[cfg.mode];
  const nSeats = POSN.length;
  let heroIdx;
  if (filter === "rfi" || filter === "vs3bet") heroIdx = (Math.random() * (nSeats - 1)) | 0;
  else if (filter === "vsOpen") heroIdx = 1 + ((Math.random() * (nSeats - 1)) | 0);
  else heroIdx = (Math.random() * nSeats) | 0;
  const heroPos = POSN[heroIdx];
  const others = POSN.filter((p) => p !== heroPos);
  const villains = others.map((pos, i) => { const p = PROF[cfg.seats[i]]; return { pos, p, stk: vilStk(p, S, bbv) }; });
  const before = villains.filter((v) => ORDER[v.pos] < ORDER[heroPos]);
  const after = villains.filter((v) => ORDER[v.pos] > ORDER[heroPos]);
  const base = { hu, S, bbv, openBB, mode: cfg.mode, rfiT: RFIT[heroPos] };

  if (filter === "vs3bet") {
    const hand = sampleFromTop(RFIT[heroPos]);
    const pool = after.length ? after : before;
    const agg = pool.reduce((a, b) => (a.p.vsRaise.r >= b.p.vsRaise.r ? (Math.random() < 0.6 ? a : b) : b));
    before.forEach((v) => (v.act = "folds"));
    agg.act = `3-bets ${D(tbC)}`;
    return { ...base, effBB: effVs(S, agg.stk, tbC), aggStk: agg.stk, heroPos, hand, stage: "vs3bet", aggP: agg.p, aggPos: agg.pos, potBB: (openC + tbC + 1 + sb - blindC(heroPos, bbv) - blindC(agg.pos, bbv)), pre: `You open ${D(openC)} from the ${heroPos}`, villains };
  }
  let opener = null;
  if (filter === "vsOpen" && before.length) {
    const weights = before.map((v) => v.p.rfi);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    opener = before[0];
    for (let i = 0; i < before.length; i++) { r -= weights[i]; if (r <= 0) { opener = before[i]; break; } }
  } else if (!filter || filter === "all") {
    for (const v of before) if (opensHere(v.p, RFIT[v.pos])) { opener = v; break; }
  }
  before.forEach((v) => (v.act = v === opener ? `opens ${D(openC)}` : "folds"));
  if (opener) {
    // Cold-callers between the open and hero — live tables overcall constantly.
    // Hero now closes (or squeezes) a multiway pot instead of a clean HU defend.
    const between = before.filter((v) => v !== opener && ORDER[v.pos] > ORDER[opener.pos]);
    const coldCallers = [];
    for (const v of between) if (coldCallers.length < 2 && Math.random() < Math.min(0.55, v.p.vsRaise.c * 0.55)) { v.act = `calls ${D(openC)}`; coldCallers.push(v); }
    const pot = 1 + sb + openC * (1 + coldCallers.length) - blindC(opener.pos, bbv);
    return { ...base, effBB: effVs(S, opener.stk, openC), effPre: Math.min(S, opener.stk || S), heroPos, hand: dealBiased(foldBoundary("vsOpen", { openerPos: opener.pos, heroPos, hu, mode: cfg.mode, openBB, bbv })), stage: "vsOpen", openerPos: opener.pos, openerP: opener.p, openerStk: opener.stk, coldCallers, potBB: pot, villains };
  }
  if (filter === "rfi" || !filter || filter === "all") {
    if (heroPos === "BB") return tries < 30 ? genScenario(cfg, filter, tries + 1) : genScenario(cfg, "rfi", 31);
    // Limpers ahead of hero — the defining texture of low-stakes live poker.
    // Roughly 40% of ring open spots deal with a limper or two in front.
    const limpersIn = [];
    if (Math.random() < 0.55) {
      for (const v of before) if (limpersIn.length < 3 && ORDER[v.pos] < ORDER[heroPos] && v.pos !== "SB" && v.pos !== "BB" && Math.random() < (LIMP_P[v.p.id] || 0.15)) { v.act = `limps ${D(chipBB(1, bbv))}`; limpersIn.push(v); }
    }
    const nL = limpersIn.length;
    const liveBehind = after;
    const behindAgg = liveBehind.length ? { r: liveBehind.reduce((s, v) => s + v.p.vsRaise.r, 0) / liveBehind.length, c: liveBehind.reduce((s, v) => s + v.p.vsRaise.c, 0) / liveBehind.length } : null;
    return { ...base, effBB: (S - 1), heroPos, limpers: nL, limpersIn, behindAgg, hand: dealBiased(foldBoundary("rfi", { hu, mode: cfg.mode, rfiT: RFIT[heroPos], heroPos, bbv, limpers: nL, behindAgg })), stage: "rfi", potBB: (1 + sb + nL), villains };
  }
  return tries < 30 ? genScenario(cfg, filter, tries + 1) : { ...base, effBB: (S - 1), heroPos: POSN[nSeats - 3], rfiT: RFIT[POSN[nSeats - 3]], hand: dealBiased(foldBoundary("rfi", { hu, mode: cfg.mode, rfiT: RFIT[POSN[nSeats - 3]], heroPos: POSN[nSeats - 3], bbv })), stage: "rfi", potBB: (1 + sb), villains };
}

/* Full-hand mode: build the hero's spot from a fixed table + button position.
   Seats are physical and persistent; the button rotates each hand, so the hero
   cycles through every position in real order. Returns a scenario the existing
   continuation engine chains to showdown. Stage "walk" = folded to hero in the BB. */
function genHand(cfg, table) {
  const hu = cfg.mode === "hu";
  const bbv = STAKES[cfg.stake].bb, S = STACK_OPTS[cfg.stack], sb = SB_OF[bbv];
  const posArr = hu ? ["SB", "BB"] : POS_BY_OFFSET[cfg.mode];
  const N = posArr.length;
  const btn = ((table.btn % N) + N) % N;
  const posOf = (seat) => posArr[((seat - btn) % N + N) % N];
  const heroPos = posOf(table.heroSeat);
  const RFIT = hu ? null : TABLES[cfg.mode].rfi;
  const openBB0 = OPEN(hu, bbv), openC0 = chipBB(openBB0, bbv);
  const D = (x) => usd(x * bbv);
  const villains = [];
  for (let s = 0; s < N; s++) {
    if (s === table.heroSeat) continue;
    const p = PROF[table.seats[s]];
    // Persistent session stacks; a felted seat re-buys fresh.
    const stk = table.stks && table.stks[s] != null && table.stks[s] >= 15 ? table.stks[s] : vilStk(p, S, bbv);
    villains.push({ pos: posOf(s), p, seat: s, stk });
  }
  const roster = [];
  for (let s = 0; s < N; s++) roster.push({ seat: s, pos: posOf(s), hero: s === table.heroSeat, profileId: s === table.heroSeat ? null : table.seats[s] });
  const before = villains.filter((v) => ORDER[v.pos] < ORDER[heroPos]).sort((a, b) => ORDER[a.pos] - ORDER[b.pos]);
  const base = { hu, S, bbv, openBB: openBB0, mode: cfg.mode, rfiT: hu ? null : (RFIT[heroPos] != null ? RFIT[heroPos] : RFIT.SB * 0.9), btn, heroSeat: table.heroSeat, table: true, roster };
  let opener = null;
  for (const v of before) { const w = hu ? HU_OPEN : RFIT[v.pos]; if (opensHere(v.p, w)) { opener = v; break; } }
  villains.forEach((v) => { v.act = opener && v === opener ? `opens ${D(openC0)}` : ORDER[v.pos] < ORDER[heroPos] ? "folds" : undefined; });
  const heroBlind = blindC(heroPos, bbv) || 0;
  if (opener) {
    // Cold-callers between the open and hero, exactly like drill mode.
    const between = before.filter((v) => v !== opener && ORDER[v.pos] > ORDER[opener.pos]);
    const coldCallers = [];
    for (const v of between) if (coldCallers.length < 2 && Math.random() < Math.min(0.55, v.p.vsRaise.c * 0.55)) { v.act = `calls ${D(openC0)}`; coldCallers.push(v); }
    return { ...base, heroPos, hand: dealBiased(foldBoundary("vsOpen", { openerPos: opener.pos, heroPos, hu, mode: cfg.mode, openBB: openBB0, bbv })), stage: "vsOpen", openerPos: opener.pos, openerP: opener.p, openerStk: opener.stk, coldCallers, effBB: effVs(S, opener.stk, openC0), effPre: Math.min(S, opener.stk || S), potBB: (1 + sb + openC0 * (1 + coldCallers.length) - blindC(opener.pos, bbv)), villains };
  }
  // Nobody raised: live tables limp. Non-blind seats before hero limp by type;
  // if hero is the BB behind limpers, that's a check-your-option spot, not a walk.
  const limpersFH = [];
  for (const v of before) if (limpersFH.length < 3 && v.pos !== "SB" && v.pos !== "BB" && Math.random() < (LIMP_P[v.p.id] || 0.15)) { v.act = `limps ${D(chipBB(1, bbv))}`; limpersFH.push(v); }
  const nLF = limpersFH.length;
  if (heroPos === "BB" && !nLF) { // folded around to the BB — a walk, no decision
    return { ...base, heroPos, hand: deal(), stage: "walk", effBB: (S - 1), potBB: (1 + sb), villains };
  }
  const behindFH = villains.filter((v) => ORDER[v.pos] > ORDER[heroPos]);
  const behindAggFH = behindFH.length ? { r: behindFH.reduce((s, v) => s + v.p.vsRaise.r, 0) / behindFH.length, c: behindFH.reduce((s, v) => s + v.p.vsRaise.c, 0) / behindFH.length } : null;
  return { ...base, heroPos, behindAgg: behindAggFH, limpers: nLF, limpersIn: limpersFH, hand: dealBiased(foldBoundary("rfi", { hu, mode: cfg.mode, rfiT: hu ? null : RFIT[heroPos], heroPos, bbv, limpers: nLF, behindAgg: behindAggFH })), stage: "rfi", effBB: (S - heroBlind), potBB: (1 + sb + nLF), villains };
}

/* Standalone postflop drills: c-bet spots, defending vs c-bets, river decisions */
function genPostDrill(cfg, filter) {
  const hu = cfg.mode === "hu";
  const S = STACK_OPTS[cfg.stack == null ? 2 : cfg.stack];
  const bbv = STAKES[cfg.stake == null ? 0 : cfg.stake].bb;
  const Tb = hu ? null : TABLES[cfg.mode];
  const openC = chipBB(OPEN(hu, bbv), bbv);
  const openBB = OPEN(hu, bbv);
  const D = (x) => usd(x * bbv);
  const asAggro = filter === "cbet" || (filter === "rivers" && Math.random() < 0.5);
  let heroPos, vil, villains;
  if (hu) {
    const vp = PROF[cfg.hu];
    heroPos = asAggro ? "SB" : "BB";
    vil = { pos: asAggro ? "BB" : "SB", p: vp, stk: vilStk(vp, S, bbv) };
    villains = [vil];
  } else {
    const POSN = Tb.pos;
    if (asAggro) {
      const openable = POSN.slice(0, -1);
      heroPos = openable[(Math.random() * openable.length) | 0];
      villains = POSN.filter((p) => p !== heroPos).map((pos, i) => { const p = PROF[cfg.seats[i]]; return { pos, p, stk: vilStk(p, S, bbv) }; });
      const later = villains.filter((v) => ORDER[v.pos] > ORDER[heroPos]);
      vil = later[(Math.random() * later.length) | 0];
    } else {
      const heroIdx = 1 + ((Math.random() * (POSN.length - 1)) | 0);
      heroPos = POSN[heroIdx];
      villains = POSN.filter((p) => p !== heroPos).map((pos, i) => { const p = PROF[cfg.seats[i]]; return { pos, p, stk: vilStk(p, S, bbv) }; });
      const bef = villains.filter((v) => ORDER[v.pos] < ORDER[heroPos]);
      vil = bef[(Math.random() * bef.length) | 0];
    }
    villains.forEach((v) => { if (v !== vil) v.act = "folds"; });
  }
  const pot0 = srpPot(openC, heroPos, vil.pos, bbv);
  /* fast-forward flop+turn bets (chip-rounded), capped by the true effective stack */
  const ff = () => {
    let eff = effVs(S, vil.stk, openC), pot = pot0;
    for (const st of ["flop", "turn"]) {
      const b = Math.min(chipBB(POSTBET[st] * pot, bbv), eff);
      eff = (eff - b);
      pot = (pot + 2 * b);
      if (eff <= 0.5) break;
    }
    return { eff: Math.max(0, eff), pot };
  };
  const common = { hu, S, bbv, openBB, mode: cfg.mode, heroPos, villains, vil, ip: postIP(heroPos, vil.pos) };
  if (asAggro) {
    const hand = sampleFromTop(hu ? HU_OPEN : Tb.rfi[heroPos]);
    if (filter === "rivers") {
      const { eff, pot } = ff();
      if (eff <= 0.5) return genPostDrill(cfg, "cbet");
      vil.act = "called twice";
      return postSeed({ ...common, effBB: eff, hand, stage: "riverBet", pre: "You bet flop & turn — both called" }, "river", pot);
    }
    vil.act = `calls ${D(openC)}`;
    return postSeed({ ...common, effBB: effVs(S, vil.stk, openC), hand, stage: "cbet", pre: `You open ${D(openC)} · ${vil.pos} calls` }, "flop", pot0);
  }
  const d = defendChart(vil.pos, heroPos, hu, cfg.mode);
  const hand = sampleBetween(d.r + 0.5, d.c - 0.5);
  if (filter === "rivers") {
    const { eff, pot } = ff();
    if (eff <= 0.5) return genPostDrill(cfg, "vsCbet");
    const sc = postSeed({ ...common, effBB: eff, hand, openerPos: vil.pos, openerP: vil.p, vFrac: pickVSize(vil.p, "river"), stage: "riverCall", pre: `${vil.p.name} bet flop & turn — you called twice` }, "river", pot);
    { const bi = betInfo(sc); vil.act = `bets ${D(bi.b)} (${pctLbl(bi.frac)})`; }
    return sc;
  }
  const sc = postSeed({ ...common, effBB: effVs(S, vil.stk, openC), hand, openerPos: vil.pos, openerP: vil.p, vFrac: pickVSize(vil.p, "flop"), stage: "vsCbet", pre: `${vil.p.name} opens ${D(openC)} · you call in the ${heroPos}` }, "flop", pot0);
  { const bi = betInfo(sc); vil.act = `c-bets ${D(bi.b)} (${pctLbl(bi.frac)})`; }
  return sc;
}

/* After hero acts: what happens next? Returns {text, nextSc?} */
function continuation(sc, action, bbv) {
  const hu = sc.hu;
  const bv = sc.bbv || bbv || 2;
  const money = (x) => `${usd(x * bv)} (${x.toFixed(1)}bb)`;
  // Approx hero net result (bb) at a terminal: a HU pot is built from matched
  // contributions, so the winner nets ~half the final pot; a folder loses their share.
  const res = (won, pot) => (won ? +(pot / 2) : -(pot / 2));
  const isPost = POST_STAGES.includes(sc.stage);
  const { b: bet, allIn } = isPost ? betInfo(sc) : { b: 0, allIn: false };

  if (action === "fold") {
    if (sc.stage === "riverCall") return { text: `You let it go — the ${money(sc.potBB + bet)} pot ships to villain.`, result: -(sc.potBB / 2) };
    const inv = isPost ? sc.potBB / 2 : (blindC(sc.heroPos, bv) || 0);
    return { text: sc.stage === "rfi" ? "You let it go. Next spot." : "You fold. On to the next one.", result: -inv };
  }

  /* aggressor line: cbet → barrel → riverBet — vs one caller or a live field */
  if (sc.stage === "cbet" || sc.stage === "barrel" || sc.stage === "riverBet") {
    const field = sc.field && sc.field.length ? sc.field : [sc.vil];
    const mw = field.length;
    if (action === "check") {
      const winP = winPMw((100 - sc.cls.rank) / 100, mw + (sc.aiN || 0));
      const won = Math.random() < winP;
      const r2 = won ? `your ${sc.cls.label} holds — ${money(sc.potBB)} shipped` : mw + (sc.aiN || 0) > 1 ? "someone in the field edges the showdown" : "villain edges the showdown";
      return { text: `You check — it checks through: ${r2}.`, result: res(won, sc.potBB) };
    }
    const opts = heroBetOpts(sc);
    const chosen = opts.find((o) => o.id === action) || opts[0];
    const bet = chosen.b, betAllIn = chosen.allIn, frac = chosen.frac;
    // Everyone still in responds in order; a raise anywhere ends the drill hand.
    // Short stacks respond stack-aware: priced-in players stick, and a bet that
    // covers someone becomes a call all-in for less. aiN carries earlier-street
    // all-ins into every later showdown count.
    const aiN = sc.aiN || 0;
    const resp = field.map((v) => { const x = respondToBetStk(v, frac, bet); let r = x.r; if (betAllIn && r === "r") r = "c"; return { v, r, cap: x.cap }; });
    const raiser = resp.find((x) => x.r === "r");
    if (raiser) return { text: `You bet ${money(bet)} — ${raiser.v.p.icon} ${raiser.v.pos} raises${mw > 1 ? " (field folds)" : ""}. Raise-defense drills are next on the roadmap; hand logged.`, result: null };
    const cs = resp.filter((x) => x.r === "c");
    if (!cs.length) {
      if (aiN) { // earlier all-ins can't fold — the pot still goes to showdown
        const base = Math.min(0.95, Math.max(0.08, (100 - sc.cls.rank) / 100));
        const won = Math.random() < winPMw(base, aiN);
        return { text: `Everyone with chips folds — showdown vs the all-in player${aiN > 1 ? "s" : ""}: ${won ? `your ${sc.cls.label} holds — ${money(sc.potBB)} shipped` : "they got there"}.`, result: res(won, sc.potBB) };
      }
      const who = mw > 1 ? "the whole field folds" : `${field[0].p.icon} ${field[0].pos} folds`;
      return { text: `You bet ${money(bet)} (${pctLbl(frac)}) — ${who}. ${money(sc.potBB)} your way.`, result: +(sc.potBB / 2) };
    }
    const capped = cs.filter((x) => x.cap != null), live = cs.filter((x) => x.cap == null).map((x) => x.v);
    const potAdd = cs.reduce((s, x) => s + Math.min(bet, x.cap == null ? bet : x.cap), 0);
    const newPot = sc.potBB + bet + potAdd;
    const aiNote = capped.length ? `${capped.map((x) => `${x.v.p.icon} ${x.v.pos} calls all-in for ${money(Math.min(bet, x.cap))}`).join("; ")}${live.length ? "; " : ""}` : "";
    if (betAllIn || sc.street === "river" || !live.length) {
      const base = Math.min(0.95, Math.max(0.08, (100 - sc.cls.rank) / 100 - (sc.street === "river" ? 0.18 : 0) - Math.max(0, frac - 0.66) * 0.12));
      const winP = winPMw(base, cs.length + aiN);
      const liveWho = live.length > 1 ? `${live.length} callers` : live.length ? `${live[0].p.icon} ${live[0].pos}` : "";
      const lead = sc.street !== "river" ? `${aiNote}${liveWho ? `${liveWho} call${live.length > 1 ? "" : "s"} ${money(bet)}` : ""} — board runs out` : `${aiNote}${liveWho ? `${liveWho} call${live.length > 1 ? "" : "s"} ${money(bet)}` : ""}. Showdown`;
      const won = Math.random() < winP;
      const r2 = won ? `your ${sc.cls.label} is good — ${money(newPot)} shipped` : cs.length + aiN > 1 ? "the field shows better" : "villain shows better";
      return { text: `${lead}: ${r2}.`, result: res(won, newPot) };
    }
    const nextStreet = sc.street === "flop" ? "turn" : "river";
    const patched = sc.villains.map((x) => {
      const hit = cs.find((c) => c.v.pos === x.pos);
      if (hit) return { ...x, stk: hit.cap == null ? (x.stk == null ? undefined : x.stk - bet) : 0, act: hit.cap == null ? `calls ${usd(bet * bv)}` : `all-in ${usd(Math.min(bet, hit.cap) * bv)}` };
      if (field.some((f) => f.pos === x.pos)) return { ...x, act: "folds" };
      return x;
    });
    const liveNext = live.map((v) => ({ ...v, stk: v.stk == null ? undefined : v.stk - bet }));
    const who = live.length > 1 ? `${live.map((c) => `${c.p.icon} ${c.pos}`).join(" + ")} call` : `${live[0].p.icon} ${live[0].pos} calls`;
    return {
      text: `${aiNote}${who} ${money(bet)}. ${nextStreet === "turn" ? "Turn" : "River"}…`,
      nextSc: postSeed({ ...sc, effBB: (sc.effBB - bet), aiN: aiN + capped.length, villains: patched, field: liveNext, vil: liveNext[0], stage: nextStreet === "turn" ? "barrel" : "riverBet" }, nextStreet, newPot),
    };
  }

  /* defender line: vsCbet → vsBarrel → riverCall */
  if (sc.stage === "vsCbet" || sc.stage === "vsBarrel" || sc.stage === "riverCall") {
    const v = sc.vil;
    const dMw = Math.max(1, sc.defMw || 1); // others still in the pot beyond the bettor
    const newPot = (sc.potBB + 2 * bet);
    if (action === "raise") {
      const to = Math.min(sc.effBB, chipBB(bet * 3.2, bv));
      const jam = to >= sc.effBB - 0.01;
      const verb = jam ? `jam ${money(to)}` : `raise to ${money(to)}`;
      const r = respond(v.p.vs3);
      if (r === "f") return { text: `You ${verb} — ${v.p.icon} folds. Pot's yours.`, result: +(sc.potBB / 2) };
      if (jam || r === "c") return { text: `You ${verb} — ${v.p.icon} calls. ${jam ? "Stacks in; variance decides. Hand logged." : "Play vs raises lands next; hand logged."}`, result: null };
      return { text: `You ${verb} — ${v.p.icon} jams. Top-of-range territory; hand logged.`, result: null };
    }
    if (allIn || sc.street === "river") {
      const base = sc.street === "river" ? (sc.cls.rank <= 47 ? 0.52 : 0.28) : Math.min(0.9, Math.max(0.1, (100 - sc.cls.rank) / 100));
      const winP = winPMw(base, dMw);
      const lead = allIn && sc.street !== "river" ? `You call the ${money(bet)} shove. Board runs out` : `You call ${money(bet)}. Showdown`;
      const won = Math.random() < winP;
      const r2 = won ? `your ${sc.cls.label} wins — ${money(newPot)} shipped` : dMw > 1 ? "someone tables value" : "villain tables value";
      return { text: `${lead}: ${r2}.`, result: res(won, newPot) };
    }
    const barrelP = v.p.cbet * (sc.street === "flop" ? 0.8 : 0.7);
    if (Math.random() < barrelP) {
      const nextStreet = sc.street === "flop" ? "turn" : "river";
      // Once hero calls, any others in a family pot step aside — later streets are HU.
      const sc2 = postSeed({ ...sc, defMw: 1, effBB: (sc.effBB - bet), vFrac: pickVSize(v.p, nextStreet), stage: nextStreet === "turn" ? "vsBarrel" : "riverCall" }, nextStreet, newPot);
      const bi2 = betInfo(sc2);
      sc2.villains = sc2.villains.map((x) => (x.pos === v.pos ? { ...x, act: `bets ${usd(bi2.b * bv)} (${pctLbl(bi2.frac)})` } : x));
      sc2.vil = sc2.villains.find((x) => x.pos === v.pos);
      return { text: `You call ${money(bet)}${dMw > 1 ? " — the rest step aside" : ""}. ${v.p.icon} keeps betting the ${nextStreet}.`, nextSc: sc2 };
    }
    const winP = winPMw((100 - sc.cls.rank) / 100, dMw);
    const won = Math.random() < winP;
    const r2 = won ? `you take ${money(newPot)}` : dMw > 1 ? "the field wins the showdown" : "villain wins the showdown";
    return { text: `You call ${money(bet)}${dMw > 1 ? " — the rest step aside" : ""}. ${v.p.icon} shuts down — checks to the end: ${r2}.`, result: res(won, newPot) };
  }

  /* preflop — chains into postflop */
  const sbv = SB_OF[bv];
  const nLimp = sc.stage === "rfi" ? (sc.limpers || 0) : 0;
  const openBBc = OPEN(hu, bv), openBBchosen = openBBForId(action, bv, hu) + nLimp; // iso: +1bb per limper
  const openC = chipBB(openBBchosen, bv), tbC = chipBB(TBET(hu, bv), bv), fourC = chipBB(fourBetBB(TBET(hu, bv)), bv);
  if (sc.stage === "rfi") {
    if (action === "limp") {
      // Hero limps: villains behind may iso-raise or check; BB gets a free look
      const behind = hu ? sc.villains : sc.villains.filter((v) => ORDER[v.pos] > ORDER[sc.heroPos]);
      const limpC = chipBB(1, bv);
      for (const v of behind) {
        if (v.pos === "BB") continue;
        if (Math.random() < Math.min(0.6, v.p.rfi * 0.28)) {
          const isoC = chipBB(openBBc + 3, bv); // iso raise: open size + ~3bb for the limp
          const patched = sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: `iso to ${usd(isoC * bv)}` } : x.act ? x : { ...x, act: "folds" }));
          return { text: `${v.p.icon} ${v.pos} raises your limp to ${money(isoC)}.`, nextSc: { ...sc, stage: "vsOpen", openBB: isoC, openerPos: v.pos, openerP: v.p, villains: patched, effBB: effVs(sc.S, v.stk, isoC), openerStk: v.stk, effPre: Math.min(sc.S, v.stk || sc.S), potBB: (limpC + isoC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(v.pos, bv)) } };
        }
      }
      const bb = sc.villains.find((x) => x.pos === "BB") || (sc.limpersIn && sc.limpersIn[0]);
      if (!bb) return { text: "Checked through.", result: 0 };
      const nOthers = (sc.limpersIn || []).length; // limpers ahead see the flop too
      const potLimp = ((2 + nOthers) * limpC + sbv - blindC(sc.heroPos, bv));
      const sc2 = postSeed({ ...sc, vil: bb, defMw: 1 + nOthers, openerPos: "BB", openerP: bb.p, ip: postIP(sc.heroPos, "BB"), effBB: effVs(sc.S, bb.stk, limpC), vFrac: 0.33, stage: "vsCbet", pre: "Limped pot — BB checks, you're in a family pot", villains: sc.villains.map((x) => (x.pos === "BB" ? { ...x, act: "checks" } : x.act && x.act.indexOf("limps") >= 0 ? x : x.act ? x : { ...x, act: "folds" })) }, "flop", potLimp);
      const bi = betInfo(sc2);
      sc2.villains = sc2.villains.map((x) => (x.pos === "BB" ? { ...x, act: `bets ${usd(bi.b * bv)} (${pctLbl(bi.frac)})` } : x));
      sc2.vil = sc2.villains.find((x) => x.pos === "BB");
      return { text: `You limp ${money(limpC)}. It checks around — flop in a limped pot.`, nextSc: sc2 };
    }
    // Walk the whole field: limpers respond call-heavy, players behind respond
    // normally. A raise anywhere short-circuits to a 3-bet pot; callers stack up
    // into a live-style multiway flop instead of stopping at the first one.
    const limperPool = (sc.limpersIn || []).map((v) => ({ v, limped: true }));
    const behindPool = (hu ? sc.villains : sc.villains.filter((x) => ORDER[x.pos] > ORDER[sc.heroPos])).map((v) => ({ v, limped: false }));
    const callers = [];
    let deadCalls = 0; // callers' money that dies if someone 3-bets behind them
    const verb = nLimp ? "iso to" : "open";
    for (const { v, limped } of [...limperPool, ...behindPool]) {
      const r = limped ? respond(limperVsRaise(v.p)) : respond(v.p.vsRaise);
      if (r === "r") {
        const patched = sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: `3-bets ${usd(tbC * bv)}` } : x.act && x.act !== "folds" ? x : { ...x, act: "folds" }));
        return { text: `You ${verb} ${money(openC)}. ${v.p.icon} ${v.pos} 3-bets to ${money(tbC)}.`,
          nextSc: { ...sc, stage: "vs3bet", aggP: v.p, aggPos: v.pos, villains: patched, aggStk: v.stk, effBB: effVs(sc.S, v.stk, tbC), potBB: (openC + tbC + nLimp + deadCalls + 1 + sbv - blindC(sc.heroPos, bv) - blindC(v.pos, bv)) } };
      }
      if (r === "c" && callers.length < 3) {
        callers.push({ pos: v.pos, p: v.p, limped });
        deadCalls += openC - (limped ? 1 : blindC(v.pos, bv));
      }
    }
    if (!callers.length) return { text: `You ${verb} ${money(openC)} — everyone folds. You pick up ${money(sc.potBB)}.`, result: +(sc.potBB / 2) };
    const isCaller = (x) => callers.some((c) => c.pos === x.pos);
    const patched = sc.villains.map((x) =>
      isCaller(x) ? { ...x, act: `calls ${usd(openC * bv)}` }
      : x.act && x.act.indexOf("limps") >= 0 ? { ...x, act: "limps, folds" }
      : x.act ? x : { ...x, act: "folds" });
    const field = callers.map((c) => ({ pos: c.pos, p: c.p }));
    const potFlop = sc.potBB + openC + deadCalls;
    const ip = field.every((v) => postIP(sc.heroPos, v.pos));
    const sc2 = postSeed({ ...sc, villains: patched, field, vil: field[0], ip, effBB: effVs(sc.S, Math.max(...field.map((f) => f.stk || sc.S)), openC), stage: "cbet" }, "flop", potFlop);
    const who = callers.length === 1 ? `${field[0].p.icon} ${field[0].pos} calls` : `${callers.map((c) => `${c.p.icon} ${c.pos}`).join(" + ")} call`;
    return { text: `You ${verb} ${money(openC)}. ${who} — ${callers.length + 1}-way flop…`, nextSc: sc2 };
  }
  if (sc.stage === "vsOpen") {
    const v = { pos: sc.openerPos, p: sc.openerP };
    const cold = sc.coldCallers || [];
    const nC = cold.length;
    const my3 = chipBB(nC ? squeezeBB(sc.openBB || OPEN(hu, bv), action === "raiseB" ? "b" : "s", nC) : threeBetBB(sc.openBB || OPEN(hu, bv), action === "raiseB" ? "b" : "s"), bv);
    const raiseWord = nC ? "squeeze" : "3-bet";
    if (action === "call") {
      // Multiway pot: everyone's money is already in sc.potBB; hero completes.
      const pot0 = nC ? sc.potBB + openC - blindC(sc.heroPos, bv) : srpPot(openC, sc.heroPos, sc.openerPos, bv);
      if (Math.random() < sc.openerP.cbet) {
        const sc2 = postSeed({ ...sc, vil: v, defMw: nC + 1, ip: postIP(sc.heroPos, sc.openerPos), effBB: effVs(sc.S, sc.openerStk, openC), vFrac: pickVSize(sc.openerP, "flop"), stage: "vsCbet" }, "flop", pot0);
        const bi = betInfo(sc2);
        sc2.villains = sc2.villains.map((x) => (x.pos === v.pos ? { ...x, act: `c-bets ${usd(bi.b * bv)} (${pctLbl(bi.frac)})` } : x));
        sc2.vil = sc2.villains.find((x) => x.pos === v.pos);
        return { text: `You call ${money(openC)}${nC ? ` — ${nC + 2}-way flop` : ""}. ${sc.openerP.icon} c-bets into the ${nC ? "field" : "flop"}.`, nextSc: sc2 };
      }
      { const won = Math.random() < winPMw(0.5, nC + 1); return { text: `You call. It checks through — ${won ? "you sneak the showdown" : nC ? "the field edges it" : "villain edges it"}.`, result: res(won, pot0) }; }
    }
    const r = respond(sc.openerP.vs3);
    if (r === "r") {
      const oppStk = sc.openerStk == null ? sc.S : Math.min(sc.S, sc.openerStk);
      const dead = nC * openC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.openerPos, bv);
      // Tight types and committed/short stacks shove rather than play a 4-bet pot —
      // this is the live "nit jams over your squeeze" spot.
      const jams = ["nit", "station", "reg"].includes(sc.openerP.id) || oppStk <= fourC * 1.8 || oppStk < 60;
      if (jams) {
        const patched = sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: `shoves ${usd(oppStk * bv)}` } : x));
        return { text: `You ${raiseWord} ${money(my3)}. ${sc.openerP.icon} ${sc.openerPos} shoves all-in — ${Math.round(oppStk)}bb.`, nextSc: { ...sc, stage: "vsJam", aggP: sc.openerP, aggPos: sc.openerPos, villains: patched, aggStk: sc.openerStk, effBB: 0, jamCall: Math.max(0.5, Math.min(oppStk, sc.S) - my3), potBB: (my3 + oppStk + dead) } };
      }
      const patched = sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: `4-bets ${usd(fourC * bv)}` } : x));
      return { text: `You ${raiseWord} ${money(my3)}. ${sc.openerP.icon} ${sc.openerPos} 4-bets to ${money(fourC)}.`, nextSc: { ...sc, stage: "vs4bet", aggP: sc.openerP, aggPos: sc.openerPos, villains: patched, aggStk: sc.openerStk, effBB: effVs(sc.S, sc.openerStk, fourC), potBB: (my3 + fourC + nC * openC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.openerPos, bv)) } };
    }
    if (r === "c") {
      // Cold-callers rarely continue vs a squeeze — their dead money sweetens the pot.
      const pot3 = (my3 + openC + nC * openC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.openerPos, bv));
      const sc2 = postSeed({ ...sc, vil: v, field: [v], ip: postIP(sc.heroPos, sc.openerPos), effBB: effVs(sc.S, sc.openerStk, my3), stage: "cbet", villains: sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: `calls your ${raiseWord}` } : cold.some((c) => c.pos === x.pos) ? { ...x, act: "folds" } : x)) }, "flop", pot3);
      return { text: `You ${raiseWord} ${money(my3)}. ${sc.openerP.icon} calls${nC ? "; the callers get out" : ""}. Flop, ${money(pot3)} pot…`, nextSc: sc2 };
    }
    if (nC) {
      // Opener folds; a sticky cold-caller can still continue against the squeeze.
      const sticky = cold.find((c) => Math.random() < Math.max(0.2, Math.min(0.45, c.p.vsRaise.c * 0.4)));
      if (sticky) {
        const potS = (my3 * 2 + openC + (nC - 1) * openC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sticky.pos, bv));
        const sc2 = postSeed({ ...sc, vil: { pos: sticky.pos, p: sticky.p }, field: [{ pos: sticky.pos, p: sticky.p }], ip: postIP(sc.heroPos, sticky.pos), effBB: effVs(sc.S, sticky.stk, my3), stage: "cbet", villains: sc.villains.map((x) => (x.pos === sticky.pos ? { ...x, act: "calls your squeeze" } : x.pos === v.pos ? { ...x, act: "folds" } : x)) }, "flop", potS);
        return { text: `You squeeze ${money(my3)}. ${sc.openerP.icon} folds, but ${sticky.p.icon} ${sticky.pos} peels. Flop, ${money(potS)} pot…`, nextSc: sc2 };
      }
    }
    return { text: `You ${raiseWord} ${money(my3)}. ${nC ? "Opener and callers all fold" : `${sc.openerP.icon} folds`} — you pick up ${money(sc.potBB)}.`, result: +(sc.potBB / 2) };
  }
  if (sc.stage === "vs3bet") {
    const v = { pos: sc.aggPos, p: sc.aggP };
    if (action === "call") {
      const pot3 = (2 * tbC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.aggPos, bv));
      const sc2 = postSeed({ ...sc, vil: v, ip: postIP(sc.heroPos, sc.aggPos), effBB: effVs(sc.S, sc.aggStk, tbC), vFrac: pickVSize(sc.aggP, "flop"), stage: "vsCbet" }, "flop", pot3);
      const bi = betInfo(sc2);
      sc2.villains = sc2.villains.map((x) => (x.pos === v.pos ? { ...x, act: `c-bets ${usd(bi.b * bv)} (${pctLbl(bi.frac)})` } : x));
      sc2.vil = sc2.villains.find((x) => x.pos === v.pos);
      return { text: `You call the 3-bet, ${money(pot3)} pot. ${sc.aggP.icon} c-bets the flop.`, nextSc: sc2 };
    }
    const r = respond(sc.aggP.vs3);
    if (r === "r") {
      const patched = sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: "jams" } : x));
      return { text: `${sc.aggP.icon} ${sc.aggPos} jams — ${Math.round(Math.min(sc.S, sc.aggStk || sc.S))}bb effective.`, nextSc: { ...sc, stage: "vsJam", aggP: sc.aggP, aggPos: sc.aggPos, villains: patched, effBB: 0, jamCall: Math.max(0.5, Math.min(sc.aggStk || sc.S, sc.S) - fourC), potBB: (fourC + Math.min(sc.S, sc.aggStk || sc.S) + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.aggPos, bv)) } };
    }
    if (r === "c") {
      const pot4 = (2 * fourC + 1 + sbv - blindC(sc.heroPos, bv) - blindC(sc.aggPos, bv));
      const sc2 = postSeed({ ...sc, vil: v, ip: postIP(sc.heroPos, sc.aggPos), effBB: effVs(sc.S, sc.aggStk, fourC), stage: "cbet", villains: sc.villains.map((x) => (x.pos === v.pos ? { ...x, act: "calls your 4-bet" } : x)) }, "flop", pot4);
      return { text: `${sc.aggP.icon} calls your 4-bet ${money(fourC)}. Flop, ${money(pot4)} pot…`, nextSc: sc2 };
    }
    return { text: `${sc.aggP.icon} folds to your 4-bet — you collect ${money(sc.potBB)}.`, result: +(sc.potBB / 2) };
  }
  if (sc.stage === "vs4bet") {
    const v = { pos: sc.aggPos, p: sc.aggP };
    if (action === "call") {
      const newPot = (sc.potBB + fourC - tbC);
      const sc2 = postSeed({ ...sc, vil: v, ip: postIP(sc.heroPos, sc.aggPos), effBB: effVs(sc.S, sc.aggStk, fourC), vFrac: pickVSize(sc.aggP, "flop"), stage: "vsCbet" }, "flop", newPot);
      const bi = betInfo(sc2);
      sc2.villains = sc2.villains.map((x) => (x.pos === v.pos ? { ...x, act: `c-bets ${usd(bi.b * bv)} (${pctLbl(bi.frac)})` } : x));
      sc2.vil = sc2.villains.find((x) => x.pos === v.pos);
      return { text: `You call the 4-bet, ${money(newPot)} pot. ${sc.aggP.icon} fires the flop.`, nextSc: sc2 };
    }
    const r = respond(sc.aggP.vs3);
    if (r === "f") return { text: `You jam ${Math.round(Math.min(sc.S, sc.aggStk || sc.S))}bb — ${sc.aggP.icon} folds. Huge pot your way.`, result: +(sc.potBB / 2) };
    { const won = Math.random() < 0.5; return { text: `You jam — ${sc.aggP.icon} calls. ${Math.round(Math.min(sc.S, sc.aggStk || sc.S) * 2)}bb in the middle; variance decides.`, result: res(won, sc.potBB + 2 * (Math.min(sc.S, sc.aggStk || sc.S) - fourC)) }; }
  }
  { const won = Math.random() < 0.5; return { text: `Stacks in — ${money(sc.potBB || sc.S * 2)} showdown. Variance decides; hand logged.`, result: res(won, sc.potBB || sc.S * 2) }; }
}

/* ================= UI ================= */
const T = {
  ink: "#101418", panel: "#171E1B", line: "#2A332E", bone: "#EAE6DA", dim: "#8B948C",
  brass: "#D9A441", diamond: "#4C9AE5", club: "#4CAF6E", heart: "#E5484D", foldc: "#39424C",
};
const CSS = `
${FONT_CSS}
@keyframes llDeal { from { opacity:0; transform: translateY(14px) scale(.96);} to { opacity:1; transform:none;} }
@keyframes llRise { from { opacity:0; transform: translateY(10px);} to { opacity:1; transform:none;} }
.ll-btn { transition: transform .08s ease, filter .12s ease; cursor:pointer; }
.ll-btn:active { transform: scale(.97); filter: brightness(1.12); }
.ll-tap { cursor:pointer; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
const DISP = "'Barlow Condensed', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GLYPH = { s: "\u2660", h: "\u2665", d: "\u2666", c: "\u2663" };
const SUITC = { s: "#23272B", h: "#C93A40", d: "#2E6FBF", c: "#2F8B57" };

function PCard({ c, i, small }) {
  const W = small ? 52 : 84, H = small ? 72 : 116, F = small ? 26 : 46, G = small ? 17 : 30;
  return (
    <div style={{ width: W, height: H, borderRadius: small ? 8 : 10, background: "#F2EEE2", border: "1px solid #D8D2C0",
      boxShadow: "0 6px 16px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 2, animation: "llDeal .3s ease both", animationDelay: `${i * 0.07}s` }}>
      <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: F, lineHeight: 1, color: SUITC[c.s] }}>{RC[c.r]}</div>
      <div style={{ fontSize: G, lineHeight: 1, color: SUITC[c.s] }}>{GLYPH[c.s]}</div>
    </div>
  );
}

const ZC = { raise: T.brass, raiseS: T.brass, raiseM: "#D0952F", raiseB: "#C98A2E", call: T.diamond, limp: T.diamond, fold: T.foldc, bet: T.brass, check: "#5A6B60" };
const ZN = { raise: "RAISE", raiseS: "OPEN", raiseM: "OPEN", raiseB: "OPEN", call: "CALL", limp: "LIMP", fold: "FOLD", bet: "BET", check: "CHECK" };
/* Small and big sizings get their own tones so adjacent bet zones read as separate
   regions (rivers are literally big/small/check/big/check — one brass blob hid that).
   A zone where both sizes mix renders as a two-tone stripe, primary size dominant. */
const SZ_SMALL = "#E0B152", SZ_BIG = "#AD7B1D";
function zonePaint(z) {
  if (z.a === "bet") {
    const main = z.sz === "b" ? SZ_BIG : SZ_SMALL, alt = z.sz === "b" ? SZ_SMALL : SZ_BIG;
    if (z.sizes && z.sizes.length > 1) return `repeating-linear-gradient(45deg, ${main} 0 7px, ${alt} 7px 10px)`;
    return main;
  }
  return ZC[z.a];
}
const zoneName = (z) => z.lbl || ZN[z.a];

function RangeStrip({ zones, pct, caption }) {
  const inZone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  // Legend: one chip per distinct action+size, sized by its share of all hands.
  const groups = [];
  for (const z of zones) {
    if (z.to - z.from < 0.5) continue; // multiway can shrink a bluff band to nothing
    const key = zoneName(z);
    const g = groups.find((x) => x.key === key);
    if (g) g.w += z.to - z.from; else groups.push({ key, w: z.to - z.from, paint: zonePaint(z) });
  }
  return (
    <div style={{ margin: "18px 2px 6px" }}>
      <div style={{ position: "relative", height: 30, borderRadius: 9, overflow: "hidden", display: "flex", border: `1px solid ${T.line}` }}>
        {zones.map((z, i) => (
          <div key={i} style={{ width: `${z.to - z.from}%`, background: zonePaint(z), display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: i > 0 ? "inset 1px 0 0 rgba(12,14,16,.45)" : "none" }}>
            {z.to - z.from >= 9 && <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 10, letterSpacing: 0.8, color: "rgba(12,14,16,.8)", whiteSpace: "nowrap" }}>{zoneName(z)}</span>}
          </div>
        ))}
        <div style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 2.5, background: T.bone, transform: "translateX(-1px)", boxShadow: "0 0 5px rgba(234,230,218,.8)" }} />
      </div>
      <div style={{ position: "relative", height: 15, marginTop: 3 }}>
        <span style={{ position: "absolute", left: `${Math.min(56, Math.max(0, pct - 6))}%`, fontFamily: MONO, fontSize: 10, color: T.bone }}>
          ▲ you {Math.round(pct)}% · {zoneName(inZone)}
        </span>
        {zones.slice(1).map((z, i) => (
          <span key={i} style={{ position: "absolute", left: `${z.from}%`, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 9, color: T.dim, top: pct > z.from - 9 && pct < z.from + 9 ? 12 : 0 }}>{Math.round(z.from)}</span>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8 }}>
        {groups.map((g) => (
          <span key={g.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 9.5, color: T.dim }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: g.paint, flexShrink: 0 }} />{g.key} · {Math.round(g.w)}%
          </span>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: T.dim, marginTop: 5 }}>{caption || "strongest 0% → 100% weakest · combo-weighted"} · chip % = share of hands</div>
    </div>
  );
}

/* The strip shows the strategy across ALL hands; this shows the menu for THIS hand:
   every option the action bar offered, graded exactly as act() grades, priced in
   bb and dollars. Multiple rows can be "best" (preflop raise sizes are family-graded
   — that itself is the lesson: any listed live size is standard). */
function OptionCosts({ sc, zones, pct, chosen, bbv }) {
  const post = POST_STAGES.includes(sc.stage);
  const acts = AGG_STAGES.includes(sc.stage) ? ["check", ...heroBetOpts(sc).map((o) => o.id)]
    : sc.stage === "riverCall" || sc.stage === "vsJam" ? ["fold", "call"]
    : sc.stage === "rfi" ? (sc.heroPos === "BB" && sc.limpers ? ["limp", ...openIds(sc.bbv || 2, sc.hu)] : ["fold", "limp", ...openIds(sc.bbv || 2, sc.hu)])
    : sc.stage === "vsOpen" ? ["fold", "call", "raiseS", "raiseB"]
    : ["fold", "call", "raise"];
  const gradeOf = (a) => (sc.stage === "vsJam" || sc.stage === "vs4bet") ? gradeStackoff(zones, pct, a, sc.potBB) : AGG_STAGES.includes(sc.stage) ? gradeSized(zones, pct, a, sc.potBB)
    : (sc.stage === "rfi" || sc.stage === "vsOpen") ? gradeRaise(zones, pct, a)
    : grade(zones, pct, a, post ? 6 : undefined);
  const chipC = (a) => a === "fold" ? T.foldc : a === "check" ? ZC.check : a === "call" || a === "limp" ? T.diamond
    : a === "betS" ? SZ_SMALL : a === "betB" ? SZ_BIG : T.brass;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10.5, letterSpacing: 2, color: T.dim, marginBottom: 2 }}>THIS HAND'S MENU · what each option costs</div>
      {acts.map((a) => {
        const g = gradeOf(a);
        const you = a === chosen;
        const best = g.verdict === "best";
        return (
          <div key={a} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, marginTop: 4,
            background: you ? "rgba(217,164,65,.10)" : T.panel, border: `1px solid ${you ? T.brass : T.line}` }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: chipC(a), flexShrink: 0 }} />
            <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.6, color: T.bone, flex: 1, textTransform: "uppercase" }}>
              {actionLabel(sc.stage, a, sc.hu, sc, bbv)}
            </span>
            {you && <span style={{ fontFamily: MONO, fontSize: 9, color: T.brass, flexShrink: 0 }}>YOUR PICK</span>}
            <span style={{ fontFamily: MONO, fontSize: 11.5, flexShrink: 0, color: best ? T.club : g.verdict === "ok" ? T.diamond : T.heart }}>
              {best ? "best ✓" : g.verdict === "ok" ? `${g.sized === "mix" ? "fine mix" : "fine"} · −${usd(g.ev * bbv)}` : `−${g.ev}bb · −${usd(g.ev * bbv)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VChip({ v }) {
  const hot = v.act && v.act !== "folds";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999,
      border: `1px solid ${hot ? T.brass : T.line}`, background: hot ? "rgba(217,164,65,.08)" : T.panel,
      opacity: v.act === "folds" ? 0.4 : 1 }}>
      <span style={{ fontSize: 14 }}>{v.p.icon}</span>
      <span style={{ fontFamily: DISP, fontWeight: 600, fontSize: 13, letterSpacing: 0.5, color: T.bone }}>{v.pos}</span>
      {v.stk != null && <span style={{ fontFamily: MONO, fontSize: 9, color: v.stk < 45 ? T.heart : v.stk >= 200 ? T.club : T.dim }}>{Math.round(v.stk)}bb</span>}
      {v.act && <span style={{ fontFamily: MONO, fontSize: 10, color: hot ? T.brass : T.dim }}>{v.act}</span>}
    </div>
  );
}

function Btn({ label, kind, onClick, full }) {
  const base = kind === "bet" || kind === "betS" || kind === "betB" || (typeof kind === "string" && kind.indexOf("raise") === 0) ? "raise" : kind === "check" ? "fold" : kind === "limp" ? "call" : kind;
  const styles = {
    raise: { background: T.brass, color: "#171309", border: "none" },
    call: { background: T.diamond, color: "#0B1420", border: "none" },
    fold: { background: "transparent", color: T.bone, border: `1.5px solid ${T.foldc}` },
  }[base];
  return (
    <button className="ll-btn" onClick={onClick} style={{ ...styles, flex: full ? "none" : "1 1 auto", minWidth: full ? 0 : 78, width: full ? "100%" : "auto",
      height: 54, borderRadius: 14, fontFamily: DISP, fontWeight: 700, fontSize: String(label).length > 10 ? 14 : 18, letterSpacing: 0.8, textTransform: "uppercase" }}>
      {label}
    </button>
  );
}

function Stat({ k, v, color }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 16, color: color || T.bone }}>{v}</div>
      <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10, letterSpacing: 1.5, color: T.dim, marginTop: 2 }}>{k}</div>
    </div>
  );
}

/* Full-hand table diagram: seats around an oval, dealer button, positions, live actions.
   Draws from the persistent roster so every seat shows on every street. Tap a seat
   for that player's short description. */
function TableView({ sc, onPeek }) {
  const N = sc.hu ? 2 : POS_BY_OFFSET[sc.mode].length;
  // Full-hand mode carries a persistent roster; drill mode synthesizes one from positions.
  let roster = sc.roster, btn = sc.btn, heroSeat = sc.heroSeat;
  if (!roster) {
    const posArr = sc.hu ? ["SB", "BB"] : TABLES[sc.mode].pos;
    heroSeat = Math.max(0, posArr.indexOf(sc.heroPos));
    btn = Math.max(0, posArr.indexOf(sc.hu ? "SB" : "BTN"));
    roster = posArr.map((pos, i) => ({ seat: i, pos, hero: i === heroSeat, profileId: null }));
  }
  const W = 320, H = 212, cx = W / 2, cy = H / 2, rx = W / 2 - 34, ry = H / 2 - 34;
  const seatXY = (i) => { const ang = Math.PI / 2 + (2 * Math.PI * i) / N; return [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]; };
  // Dealer button rides an inner ring in front of the seats — one persistent
  // element that glides to the next seat each hand (see CSS transition), so the
  // button visibly moves relative to you instead of teleporting.
  const btnXY = (i) => { const ang = Math.PI / 2 + (2 * Math.PI * i) / N; return [cx + rx * 0.58 * Math.cos(ang), cy + ry * 0.58 * Math.sin(ang)]; };
  const [dbx, dby] = btnXY(((btn % N) + N) % N);
  // Live status by seat: the active villain(s) still in the hand vs folded.
  const bySeat = (v) => (v.seat != null ? v.seat : roster.findIndex((r) => r.pos === v.pos));
  const active = {}; (sc.villains || []).forEach((v) => { const s = bySeat(v); if (s >= 0) active[s] = v; });
  if (sc.vil) { const s = bySeat(sc.vil); if (s >= 0) active[s] = sc.vil; }
  const post = POST_STAGES.includes(sc.stage);
  return (
    <div style={{ position: "relative", width: W, height: H, margin: "0 auto 6px" }}>
      <div style={{ position: "absolute", inset: "20px 24px", borderRadius: 96, background: "#12332A", border: `2px solid ${T.line}`, boxShadow: "inset 0 0 24px rgba(0,0,0,.4)" }} />
      {roster.map((seat) => {
        const [x, y] = seatXY(seat.seat);
        const isHero = seat.hero;
        const v = active[seat.seat];
        // Folded: a non-hero seat that acted-folds preflop, or is no longer in the hand postflop.
        const folded = !isHero && ((v && v.act === "folds") || (!v && post));
        const stillIn = isHero || (v && v.act !== "folds");
        const prof = seat.profileId ? PROFILES.find((p) => p.id === seat.profileId) : (v && v.p) || null;
        // The seat the hero is currently deciding against reads brightest.
        const isAgg = !isHero && v && v.act && v.act !== "folds" && (sc.vil ? bySeat(sc.vil) === seat.seat : true);
        return (
          <div key={seat.seat} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", textAlign: "center", width: 66, zIndex: isAgg ? 2 : 1 }}>
            <div className={isHero ? "" : "ll-tap"} onClick={isHero || !prof ? undefined : () => onPeek && onPeek({ name: prof.name, icon: prof.icon, desc: prof.desc })}
              style={{ fontFamily: DISP, fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "5px 3px", borderRadius: 9, opacity: folded ? 0.34 : 1,
                background: isHero ? T.brass : stillIn ? "rgba(217,164,65,.16)" : T.panel,
                color: isHero ? "#171309" : T.bone, border: `1.5px solid ${isHero ? T.brass : isAgg ? T.brass : stillIn ? "rgba(217,164,65,.5)" : T.line}` }}>
              {isHero ? "YOU" : <span style={{ fontSize: 17 }}>{(prof && prof.icon) || "·"}</span>}
              <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.5, marginTop: 1, color: isHero ? "#171309" : T.bone }}>{seat.pos}</div>
              {!isHero && v && v.stk != null && !folded && (
                <div style={{ marginTop: 1, lineHeight: 1.05, color: v.stk < 45 ? T.heart : v.stk >= 200 ? T.club : T.dim }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600 }}>{usd(v.stk * sc.bbv)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 8.5, opacity: 0.75 }}>{Math.round(v.stk)}bb</div>
                </div>
              )}
              {isHero && sc.effBB != null && (
                <div style={{ marginTop: 1, lineHeight: 1.05, color: "#171309" }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{usd(sc.effBB * sc.bbv)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 8.5, opacity: 0.7 }}>{Math.round(sc.effBB)}bb</div>
                </div>
              )}
            </div>
            {v && v.act && v.act !== "folds" && <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: isAgg ? 700 : 400, lineHeight: 1.15, color: isAgg ? T.brass : T.dim, marginTop: 3 }}>{v.act}</div>}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: dbx, top: dby, transform: "translate(-50%,-50%)", transition: "left .24s ease, top .24s ease",
        width: 20, height: 20, borderRadius: 10, background: T.bone, color: "#171309", fontFamily: DISP, fontWeight: 800, fontSize: 12, lineHeight: "20px", textAlign: "center", border: "1.5px solid #0007", boxShadow: "0 1px 4px rgba(0,0,0,.55)", zIndex: 4 }}>D</div>
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, color: T.bone }}>{usd(sc.potBB * sc.bbv)}</div>
        <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 8, letterSpacing: 1.5, color: T.dim }}>POT</div>
      </div>
    </div>
  );
}

const FOCI = [["all", "All spots"], ["rfi", "Opens"], ["vsOpen", "Vs opens"], ["vs3bet", "Vs 3-bets"], ["cbet", "C-bet"], ["vsCbet", "Vs c-bet"], ["rivers", "Rivers"]];
const STAGE_LABEL = { rfi: "OPENS", vsOpen: "VS OPENS", pressure: "VS 3-BETS+", cbet: "C-BET", vsCbet: "VS C-BET", rivers: "RIVERS" };

function actionLabel(stage, a, hu, sc, bbv) {
  const bv = (sc && sc.bbv) || bbv || 2;
  if (sc && POST_STAGES.includes(stage)) {
    if (a === "check") return "Check";
    if (a === "betS" || a === "betB") {
      const o = heroBetOpts(sc).find((x) => x.id === a);
      if (!o) return "Bet";
      return o.allIn ? `All-in ${usd(o.b * bv)}` : `${usd(o.b * bv)} · ${pctLbl(o.frac)}`;
    }
    const { b, allIn } = betInfo(sc);
    if (a === "call") return allIn ? `Call all-in ${usd(b * bv)}` : `Call ${usd(b * bv)}`;
    if (a === "raise") {
      const to = Math.min(sc.effBB, chipBB(b * 3.2, bv));
      return to >= sc.effBB - 0.01 ? `Jam ${usd(to * bv)}` : `Raise ${usd(to * bv)}`;
    }
    return "Fold";
  }
  if (a === "fold") return "Fold";
  if (a === "limp") { if (sc && sc.heroPos === "BB" && sc.limpers) return "Check"; return sc && sc.limpers ? `Overlimp ${usd(chipBB(1, bv) * bv)}` : `Call ${usd(chipBB(1, bv) * bv)}`; }
  if (a === "call") {
    const tc = sc ? toCallBB(sc) : 0;
    const amt = tc > 0 ? ` ${usd(chipBB(tc, bv) * bv)}` : "";
    return stage === "vsJam" ? `Call all-in${amt}` : `Call${amt}`;
  }
  if (a && a.indexOf("raise") === 0) {
    if (stage === "rfi") { const nL = (sc && sc.limpers) || 0; return `${nL ? "Iso" : "Open"} ${usd(chipBB(openBBForId(a, bv, hu) + nL, bv) * bv)}`; }
    if (stage === "vsOpen") { const ob = sc && sc.openBB ? sc.openBB : OPEN(hu, bv); const nC = (sc && sc.coldCallers && sc.coldCallers.length) || 0; const amt = nC ? squeezeBB(ob, a === "raiseB" ? "b" : "s", nC) : threeBetBB(ob, a === "raiseB" ? "b" : "s"); return `3-Bet ${usd(chipBB(amt, bv) * bv)}`; }
  }
  if (stage === "rfi") return `Open ${usd(chipBB(OPEN(hu, bv), bv) * bv)}`;
  if (stage === "vsOpen") return `3-Bet ${usd(chipBB(TBET(hu, bv), bv) * bv)}`;
  if (stage === "vs3bet") return `4-Bet ${usd(chipBB(fourBetBB(TBET(hu, bv)), bv) * bv)}`;
  return "All-in";
}
/* Coach's note: why the chart says what it says, and when to deviate */
function adviceFor(sc, zones, bbv) {
  const post = POST_STAGES.includes(sc.stage);
  const pct = post ? sc.cls.rank : sc.hand.pct;
  const zone = zones.find((z) => pct >= z.from && pct < z.to) || zones[zones.length - 1];
  const pc = (x) => `${Math.round(x * 100)}%`;

  if (sc.stage === "rfi") {
    const bbv2 = sc.bbv || 2;
    const arr = opensBB(bbv2, sc.hu);
    const refBB = refOpenBB(bbv2, sc.hu);
    const baseT = sc.hu ? HU_OPEN : sc.rfiT;
    // Read the ACTUAL raise boundary from the same zones the grader uses, not a
    // recomputed threshold — the recompute dropped the lineup/limper adjustments
    // and pushed raise-zone hands into the fold sentence (coach-note/grader bug).
    const raiseZ = zones.find((z) => typeof z.a === "string" && z.a.indexOf("raise") === 0);
    const t = raiseZ ? raiseZ.to : Math.max(2, baseT * rfiTighten(refBB));
    const limpZ = zones.find((z) => z.a === "limp");
    const inLimp = limpZ && pct >= limpZ.from && pct < limpZ.to && (limpZ.to - limpZ.from) > 0.5;
    const isRaise = typeof zone.a === "string" && zone.a.indexOf("raise") === 0;
    const lo = usd(chipBB(arr[0], bbv2) * bbv2), hi = usd(chipBB(arr[arr.length - 1], bbv2) * bbv2);
    const menu = arr.length > 1 ? `${lo}–${hi}` : lo;
    const nL = sc.limpers || 0;
    const sizeNote = nL
      ? `${nL} limper${nL > 1 ? "s" : ""} in the pot: iso to ${menu} — the base open plus a big blind per limper. Sizing up matters because limpers call the first raise with almost anything; you're raising for value and to get the button, not to fold the field out.`
      : `Live opens run ${menu} here (~${refBB.toFixed(1)}bb) — roughly ${Math.round((1 - rfiTighten(refBB)) * 100)}% tighter opening range than an online 2.3bb open, and a lower-SPR pot, so you commit faster postflop. Any of the listed sizes is standard; pick one and don't size-tell.`;
    const lead = isRaise ? (nL ? `${sc.hand.label} iso-raises over the limper${nL > 1 ? "s" : ""} — it beats what they limp with, so charge them.` : `${sc.hand.label} is inside the top ${Math.round(t)}% ${sc.heroPos} range — a standard open.`)
      : inLimp ? (nL ? `${sc.hand.label} overlimps — it wants a cheap multiway flop (pairs, suited, connected hands cash in when they hit), not a bloated pot with a hand that flops mediocre.` : `${sc.hand.label} sits just past the raising range — a thin limp/trap band, and multiway-prone live. Raise-or-fold is usually cleaner.`)
      : `${sc.hand.label} is outside the top ${Math.round(t)}% from ${sc.heroPos} — fold. ${nL ? "Iso-raising junk into people who never fold for one raise is lighting money on fire." : "Because live opens are big, the profitable opening range is tighter than online; loose opens out of position bleed chips."}`;
    const behind = sc.hu ? sc.villains : sc.villains.filter((v) => ORDER[v.pos] > ORDER[sc.heroPos]);
    const aggro = behind.find((v) => v.p.vsRaise.r >= 0.2);
    const softBlind = behind.find((v) => (v.pos === "SB" || v.pos === "BB") && (v.p.id === "station" || v.p.id === "nit"));
    const alt = aggro ? `Consider: size toward ${hi} to charge ${aggro.p.name}'s calls, and trim the bottom of your opens with a 3-bettor left to act.`
      : softBlind ? `Consider: size up for value — a ${softBlind.p.name} in the blinds pays off big opens. Isolating limpers, add a big blind per limper.`
      : `Consider: bigger sizing means a tighter opening range — a hand that opens online at 2.3bb can be a fold at ${lo} live.`;
    return `${lead} ${sizeNote} ${alt}`;
  }
  if (sc.stage === "vsOpen") {
    const rr = Math.round(zones[0].to), c = Math.round(zones[1].to);
    const ob = sc.openBB || 2.3;
    const nCq = sc.coldCallers ? sc.coldCallers.length : 0;
    const priceNote = nCq ? ` With ${nCq} caller${nCq > 1 ? "s" : ""} already in, calling gets better (price + multiway implied odds — hands that flop big cash in) while 3-bets become squeezes: value-lean and sized up (~3-bet plus one open per caller), because someone always calls live.`
      : ob >= 4 ? ` Facing a big ${ob.toFixed(1)}bb open you defend tighter than vs a min-raise — the price is worse and the opener's range is stronger.` : "";
    const lead = pct < zones[0].to ? `Top ${rr}% vs this open — 3-bet. Standard ${usd(chipBB(threeBetBB(ob, "s"), sc.bbv || 2) * (sc.bbv || 2))} or larger ${usd(chipBB(threeBetBB(ob, "b"), sc.bbv || 2) * (sc.bbv || 2))} to punish a big open and cap the pot.`
      : pct < zones[1].to ? `Inside the defend-to-${c}% band — ${sc.hand.label} is a call at this price.`
      : `Below the ${c}% defense line vs a ${sc.openerPos} open — let it go.`;
    const eo = sc.effPre;
    const stackNote = eo != null && eo < 40 ? ` Only ${Math.round(eo)}bb effective vs this stack — set-mining and speculative flats lose their implied odds; lean 3-bet-or-fold.`
      : eo != null && eo >= 250 ? ` ${Math.round(eo)}bb effective — deep implied odds pay suited and connected calls, but deep money also punishes dominated hands; position is worth double here.` : "";
    const alt = sc.openerP.rfi >= 1.2 ? `Consider: ${sc.openerP.name} opens ${pc(sc.openerP.rfi)} of GTO width — attack wider than the chart.`
      : sc.openerP.rfi <= 0.75 ? `Consider: a ${sc.openerP.name} open is top-of-deck — tighten these defends.`
      : `Consider: widen vs loose openers, tighten vs nits — the seat matters more than the cards.`;
    return `${lead}${priceNote}${stackNote} ${alt}`;
  }
  // Facing an all-in or a 4-bet: the villain's stack-off range and the price
  // decide it — spell out both, and place the hero's exact hand against them.
  if (sc.stage === "vs4bet" || sc.stage === "vsJam") {
    const P = sc.aggP;
    const isJam = sc.stage === "vsJam";
    const rep = P.jamRep == null ? GTO_JAMREP : P.jamRep;
    const effA = sc.aggStk != null ? Math.min(sc.S, sc.aggStk) : sc.effBB;
    const hn = sc.hand.label, hp = sc.hand.pct;
    const place = hp <= rep * 0.5 ? `${hn} is ahead of that range — you want the money in`
      : hp <= rep ? `${hn} sits right at the top of what they have — roughly a flip`
      : hp <= rep * 2.2 ? `${hn} is behind that range — a coin flip at best, and usually dominated`
      : `${hn} is crushed by that range`;
    const verdict = zone.a === "raise" ? `You're ahead: ${isJam ? "call it off" : "jam over the top"}.`
      : zone.a === "call" ? (isJam ? `That's a call — the price is right for your equity.` : `That's a call — see a flop and give up when you whiff.`)
      : `That's a fold — not enough equity to stack off, and hero-calling here is the classic leak.`;
    const depth = effA == null ? ""
      : effA < 40 ? ` At ~${Math.round(effA)}bb you're short enough to be priced in, which widens your calls — that's why this is closer than it feels.`
      : effA >= 150 ? ` At ~${Math.round(effA)}bb deep, stacking off has to be nutted; reverse-implied odds punish the second-best hand, so lean fold.`
      : ` Around ${Math.round(effA)}bb this is the standard read — if they were shorter you'd call wider on price, deeper you'd fold more.`;
    return `A ${P.name} ${isJam ? "shove" : "4-bet"} reps ${P.jamRange} — about the top ${rep}%. ${place}. ${verdict}${depth}`;
  }
  if (sc.stage === "vs3bet") {
    const P = sc.aggP;
    const lead = zone.a === "raise" ? `Top of the range — keep the pressure on with a 4-bet.`
      : zone.a === "call" ? `${sc.hand.label} continues vs the 3-bet — strong enough to see a flop, not enough to stack off.`
      : `Below the continue line — folding to the 3-bet loses the least.`;
    const effA = sc.aggStk != null ? Math.min(sc.S, sc.aggStk) : null;
    const depthNote = effA != null && effA < 35 ? ` Only ${Math.round(effA)}bb effective — calling is basically committing, so it's jam-or-fold.`
      : effA != null && effA >= 250 ? ` ${Math.round(effA)}bb deep — flat more in position, fold pretty hands that play dominated.` : "";
    const alt = (P.vs3.r >= 0.2 || P.vsRaise.r >= 0.25) ? `Consider: ${P.name} 3-bets light — continue wider and let them keep firing.`
      : (P.id === "nit" || P.id === "station" || P.id === "reg") ? `Consider: a ${P.name}'s 3-bet is weighted to the top of the deck — folding pretty hands is discipline, not weakness.`
      : `Consider: most players under-bluff big preflop raises — when unsure, fold.`;
    return `${lead}${depthNote} ${alt}`;
  }
  const v = sc.vil.p;
  const mwA = sc.field && sc.field.length > 1 ? sc.field.length : 0;
  if (AGG_STAGES.includes(sc.stage)) {
    const TXT = { ahi: "A-high and dry favors your range — small bets work with almost everything",
      bwy: "Broadway-heavy leans your way — one small size covers the range",
      paired: "Paired and static — cheap stabs print here",
      low: "Low and disconnected — the caller connects more often, so stay selective",
      wet: "Draw-heavy — polarize: big with value and draws, check the middle",
      mono: "Monotone — big or nothing; medium hands hate this texture" };
    const spr = sc.effBB / sc.potBB;
    let region;
    if (zone.a !== "bet") region = pct < 78 ? `your ${sc.cls.label} is medium showdown value — checking controls the pot and keeps their bluffs in` : `no equity left — save the chips`;
    else if (sc.stage === "riverBet" && zone.sz === "s") region = `thin value — bet small so worse pairs pay you`;
    else if (pct <= zones[0].to) region = sc.stage === "riverBet" && zone.sz === "b" ? `your ${sc.cls.label} wants the overbet — their calling range is capped` : `your ${sc.cls.label} bets for value and protection`;
    else region = `your ${sc.cls.label} is a natural bluff: equity when called, folds out better air`;
    const sizing = zone.a === "bet" ? (zone.sizes.length > 1 ? ` Both sizes mix here (${zone.sz === "s" ? "small" : "big"} primary — the other gives up a sliver).` : zone.sz === "b" ? ` Big only — small lets draws in cheap.` : ` Small only — big folds out everything worse.`) : "";
    const sprTxt = spr < 2.5 && zone.a === "bet" ? ` At SPR ${spr.toFixed(1)} you're near commitment — sizing up stacks them.`
      : spr >= 13 && zone.a === "bet" ? ` SPR ${spr.toFixed(0)} — deep water: one pair is a bluff-catcher here, not a stack-off; big money should mean nutted hands or real equity.` : "";
    const mwTxt = mwA ? ` ${mwA + 1}-way pot: someone always has a piece, so value bets tighten and most bluffs become checks — c-betting your whole range is a heads-up play, not a family-pot play.` : "";
    const stks = (sc.field && sc.field.length ? sc.field : [sc.vil]).map((x) => x.stk).filter((x) => x != null);
    const asymTxt = stks.length > 1 && Math.min(...stks) < 45 && Math.max(...stks) > 140
      ? ` The ${Math.round(Math.min(...stks))}bb stack is priced in — aim your value at them; the ${Math.round(Math.max(...stks))}bb stack is who your big bets are really playing against.` : "";
    const alt = v.vsBet.r >= 0.18 ? ` Consider: check more vs ${v.name} — raises ${pc(v.vsBet.r)} of bets, and you hate facing it.`
      : v.vsBet.c >= 0.7 ? ` Consider: ${v.name} calls ${pc(v.vsBet.c)} — go value-heavy, thin-bet bigger, bluff less.`
      : ` Consider: keep firing brick turns; slow down on cards that smash the caller's range.`;
    return `${TXT[sc.tb] || TXT.low}: ${region}.${sizing}${mwTxt}${asymTxt}${sprTxt}${alt}`;
  }
  const bi = betInfo(sc);
  const bv2 = sc.bbv || bbv;
  const be = Math.round((100 * bi.frac) / (1 + 2 * bi.frac));
  const cz = zones.find((z) => z.a === "call");
  const lead = sc.stage === "riverCall"
    ? `Calling ${usd(bi.b * bv2)} to win ${usd((sc.potBB + bi.b) * bv2)} — you need ~${be}%, and ${sc.cls.label} ${pct <= cz.to ? "clears the bar as a bluff-catcher" : "doesn't get there vs a value-heavy range"}.`
    : zone.a === "raise" ? `Monsters and the best draws attack here — raising folds out equity and builds the pot with the goods.`
    : zone.a === "call" ? `Facing ${pctLbl(bi.frac)} pot you need ~${be}% — ${sc.cls.label} defends; folding it overfolds your range.`
    : `Vs ${pctLbl(bi.frac)} pot, ${sc.cls.label} sits below the defense line — folding loses the least.`;
  const alt = v.cbet >= 0.75 ? ` Consider: ${v.name} fires ${pc(v.cbet)} of flops — bluff-catch lighter than the chart.`
    : v.cbet <= 0.5 ? ` Consider: ${v.name} barely bluffs — when the bet comes, tighten your catchers.`
    : ` Consider: peel wider vs small stabs, release weak catchers vs overbets — the price is the whole game.`;
  return `${lead}${alt}`;
}
/* Exploitative layer: how to deviate from the GTO baseline against a specific
   player type, and WHY it differs. GTO assumes a balanced opponent you can't
   read; exploit play attacks a known imbalance and is itself exploitable back. */
const EXPLOIT = {
  reg: {
    behind: "A Live Reg behind plays honestly — they 3-bet ~6%, all value, so your opens are safe but their pressure is real. Steal normally; fold to their aggression without ego.",
    opener: "Their open is close to the chart. The exploit is postflop: regs give up on turns too often and never bluff big rivers — float flops in position and take pots on later streets.",
    aggressor: "A reg's 3-bet is value-heavy (queens-plus, AK, the odd suited ace). Continue with hands that dominate their value or fold — the GTO bluff-catching mix is wasted here.",
    caller: "They fold flops honestly and chase draws at the right price. C-bet your normal range, but when a reg calls twice, stop bluffing — their river calls are real hands.",
    bettor: "Big bets from a reg are what they look like. Call flop stabs with your pairs, but their turn and river barrels are value — fold your bluff-catchers and don't pay off.",
  },
  nit: {
    behind: "Steal wider — a Nit in the blinds folds far too much, so opens that are breakeven vs GTO print pure profit. GTO defends the blinds near MDF; a Nit defends nowhere near it. But if they wake up with a 3-bet, believe it and fold.",
    opener: "3-bet-bluff more, and stop flat-calling to 'keep them in.' A Nit opens only premiums, so GTO's wide flatting range is dominated here — set-mine cheaply or 3-bet as a pure bluff, but don't stack off marginal value.",
    aggressor: "Over-fold hard. A Nit's 3-bet/4-bet is QQ+/AK; GTO's continue range assumes bluffs that simply aren't in their range, so calling it just donates.",
    caller: "Barrel more, thin-value less. Nits over-fold to c-bets and turn pressure, so your bluffs print — but when they do call, they have it, so cut the thin value GTO would bet.",
    bettor: "Fold your bluff-catchers. GTO calls enough to stay unexploitable (MDF); against a player with no bluffs, MDF is meaningless — call only hands that beat value.",
  },
  station: {
    behind: "Open wider for value and iso limps a size up — a Station pays off, so widen your value opens and charge them. Add a big blind per limper when isolating.",
    opener: "Value-3-bet wider and stop bluffing — a Station calls 3-bets far too light, so thin value gets paid while bluffs get looked up and lose.",
    aggressor: "Respect it — a passive player raising is the near-nuts. GTO continues by frequency; here their aggression is almost never a bluff, so fold marginal hands.",
    caller: "Value-bet thin and BIG, and never bluff. They call ~80%+ and fold ~12%, so bluffing lights money on fire while worse hands pay you — bet hands for value GTO would check, and size up. This is the single biggest exploit in low-stakes live.",
    bettor: "When a Station finally bets big, fold your bluff-catchers — passive players don't turn made hands into bluffs, so their line is value.",
  },
  lag: {
    behind: "Tighten your opens out of position — a LAG behind will 3-bet you relentlessly, so cut the bottom of your range. But trap by flat-calling your strongest hands to induce their aggression rather than 3-betting.",
    opener: "3-bet wider for value and call down lighter — a LAG's opening range is wide and weak, so hands that only flat vs a TAG become value 3-bets, and their post-flop barrels run into your catchers.",
    aggressor: "Continue wider — a LAG 3-bets a bluff-heavy range, so your 4-bet and call thresholds loosen well past GTO.",
    caller: "Check more to induce and pot-control. LAGs stab and raise when checked to, so let them bluff into your medium-strong hands instead of betting yourself — you capture their bluffs GTO would fold out.",
    bettor: "Bluff-catch wider and call down lighter — LAGs over-bluff, so hands GTO folds become profitable calls against their barrels.",
  },
  maniac: {
    behind: "Fold marginal opens into a spewer — but raise your premiums, don't limp to trap them. When a Maniac jams over your open you're way ahead of their air, so raising builds the pot AND keeps fold equity vs everyone else; limping surrenders both and invites the field in.",
    opener: "Re-raise for value with hands GTO would flat — a Maniac's opens are mostly air, so widen your value 3-bets dramatically and let them pile in.",
    aggressor: "Continue very wide — a Maniac's raises are almost all bluffs; fold only your very worst and let them barrel off.",
    caller: "Stop bluffing entirely and check your strong hands to trap — they won't fold to your bluffs and they'll do the bluffing for you. Induce, don't push.",
    bettor: "Call down light and never fold top pair — a Maniac bluffs constantly, so bluff-catchers are gold. GTO folds to balanced aggression; here aggression is near-all air.",
  },
  tag: { any: "A TAG plays close to GTO, so deviate only slightly: shade your bluffs down a touch (they defend well) and avoid spew. Their edge is positional discipline, not exploitable frequency errors — don't invent an exploit that isn't there." },
  gto: { any: "This opponent is balanced — there is no profitable exploit. Any deviation from the GTO baseline just costs EV against unexploitable frequencies, so play the chart straight." },
};
function exploitFor(sc) {
  let P = null, role = null;
  if (sc.stage === "rfi") {
    const behind = sc.hu ? sc.villains : sc.villains.filter((v) => ORDER[v.pos] > ORDER[sc.heroPos]);
    const rank = { maniac: 5, station: 4, nit: 4, lag: 3, reg: 2, tag: 1, gto: 0 };
    let best = -1;
    for (const v of behind) { const s = rank[v.p.id] == null ? 0 : rank[v.p.id]; if (s > best) { best = s; P = v.p; } }
    role = "behind";
  } else if (sc.stage === "vsOpen") { P = sc.openerP; role = "opener"; }
  else if (sc.stage === "vs3bet" || sc.stage === "vs4bet" || sc.stage === "vsJam") { P = sc.aggP; role = "aggressor"; }
  else if (AGG_STAGES.includes(sc.stage)) { P = sc.vil && sc.vil.p; role = "caller"; }
  else if (sc.stage === "vsCbet" || sc.stage === "vsBarrel" || sc.stage === "riverCall") { P = sc.vil && sc.vil.p; role = "bettor"; }
  if (!P) return null;
  const tbl = EXPLOIT[P.id];
  if (!tbl) return null;
  const txt = tbl[role] || tbl.any;
  if (!txt) return null;
  return { name: P.name, icon: P.icon, id: P.id, txt };
}
/* Hero's table image — how opponents perceive the user. Feeds the opponents'
   likely thinking and tailors advice to the user's own style. */
const IMAGES = {
  unknown: { name: "Unknown", icon: "🆕", desc: "Just sat — no reads on you yet" },
  nit: { name: "Rock", icon: "🪨", desc: "You've shown down only premiums" },
  tag: { name: "Solid", icon: "🎯", desc: "Tight-aggressive, respected" },
  lag: { name: "LAG", icon: "🔥", desc: "Seen you raise a lot — tricky/wide" },
  loose: { name: "Splashy", icon: "💦", desc: "Seen you call wide — loose/callable" },
  maniac: { name: "Wild", icon: "💣", desc: "Spewy — you look like you bluff a lot" },
};
const imgRespectHigh = (im) => im === "nit" || im === "tag"; // your bets get credit
const imgWide = (im) => im === "lag" || im === "loose" || im === "maniac"; // seen as playing many hands
/* Derive a suggested image from the user's session decisions (history). */
function sessionImage(sess) {
  const tot = sess.aggr + sess.pass + sess.foldn;
  if (tot < 12) return { id: null, note: "Play ~12+ hands and a session read will appear here." };
  const aFrac = sess.aggr / tot, fFrac = sess.foldn / tot, pFrac = sess.pass / tot;
  let id, label;
  if (aFrac >= 0.42) { id = pFrac > 0.28 ? "maniac" : "lag"; label = `${Math.round(aFrac * 100)}% aggressive`; }
  else if (fFrac >= 0.62) { id = "nit"; label = `${Math.round(fFrac * 100)}% fold`; }
  else if (pFrac >= 0.4) { id = "loose"; label = `${Math.round(pFrac * 100)}% call/limp`; }
  else { id = "tag"; label = "balanced mix"; }
  return { id, note: `This session: ${label} — you're playing like a ${IMAGES[id].name}.` };
}
/* What is the acting opponent likely thinking, given their type AND how they read you? */
function mindsetFor(sc, image) {
  let P = null, role = null;
  if (sc.stage === "rfi") {
    const behind = sc.hu ? sc.villains : sc.villains.filter((v) => ORDER[v.pos] > ORDER[sc.heroPos]);
    const rank = { lag: 5, maniac: 5, tag: 3, reg: 3, station: 2, nit: 2, gto: 1 };
    let best = -1;
    for (const v of behind) { const s = rank[v.p.id] == null ? 0 : rank[v.p.id]; if (s > best) { best = s; P = v.p; } }
    role = "behind";
  } else if (sc.stage === "vsOpen") { P = sc.openerP; role = "opener"; }
  else if (sc.stage === "vs3bet" || sc.stage === "vs4bet" || sc.stage === "vsJam") { P = sc.aggP; role = "aggressor"; }
  else if (AGG_STAGES.includes(sc.stage)) { P = sc.vil && sc.vil.p; role = "caller"; }
  else if (sc.stage === "vsCbet" || sc.stage === "vsBarrel" || sc.stage === "riverCall") { P = sc.vil && sc.vil.p; role = "bettor"; }
  if (!P) return null;
  const thinking = P.id === "tag" || P.id === "lag" || P.id === "gto" || P.id === "reg";
  const respect = imgRespectHigh(image), wide = imgWide(image), unknown = image === "unknown";
  const read = unknown ? "they have no read on you yet" : respect ? "they see you as tight and honest" : wide ? "they see you as loose and capable of bluffing" : "they see you as straightforward";

  if (!thinking) {
    const s = { nit: "A Nit isn't adjusting to your image — they open/continue only with premiums, so read their range from their type, not from how they see you.",
      station: "A Station isn't thinking about your image at all — they call with any piece and rarely raise, so their action reflects their cards, not you.",
      maniac: "A Maniac ignores your image — they apply pressure regardless, so the range behind their aggression is wide and mostly air." }[P.id];
    return s || null;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (role === "behind") {
    return `${P.name} behind is watching your open. ${cap(read)}, so ${respect ? "they'll mostly stay out of your way unless they truly have it — your steals get more folds" : wide ? "they'll 3-bet you light to punish a range they read as weak; tighten your opens or be ready to play back" : "they'll play a standard range against your open"}.`;
  }
  if (role === "opener") {
    return `A ${P.name} open is a real range, and they're aware of the table. ${cap(read)}, so if you play back they'll ${respect ? "give you credit and fold their weaker opens" : wide ? "fight back wider, expecting you to be light" : "proceed carefully"}.`;
  }
  if (role === "aggressor") {
    return respect ? `They're 3-betting into a tight image — a big statement. A thinking ${P.name} knows you open strong, so this is value-weighted; don't over-fold, but don't get it in light either.`
      : wide ? `A ${P.name} reads your range as wide, so they're 3-betting to attack it — expect more bluffs and thin value than a tight player's 3-bet, and continue wider.`
      : `No read on you yet, so this is a ${P.name}'s default polarized 3-bet range.`;
  }
  if (role === "caller") {
    return respect ? `They flatted knowing you're tight — so they hold a real hand or a plan, not junk, and they expect your c-bets to be strong. That means your bluffs earn extra folds here.`
      : wide ? `They called because they think you open wide — they're floating marginal hands to take it away when you show weakness, so your c-bet bluffs get less respect.`
      : `They called with a standard flatting range; no image read is shaping it yet.`;
  }
  // bettor
  return respect ? `A ${P.name} betting into your tight image is mostly telling the truth — they don't expect to bluff a strong range off cheaply, so weight this toward value.`
    : wide ? `A ${P.name} is betting into a range they read as weak — they'll bluff you more here expecting folds, so bluff-catch wider than the pure GTO frequency.`
    : `No read yet — take their bet at face value from their type.`;
}
/* Short "what your image means for YOUR play" clause. */
function imageEdge(sc, image) {
  if (image === "unknown") return "";
  const respect = imgRespectHigh(image), wide = imgWide(image);
  const heroAggr = sc.stage === "rfi" || AGG_STAGES.includes(sc.stage);
  const heroDef = sc.stage === "vsCbet" || sc.stage === "vsBarrel" || sc.stage === "riverCall" || sc.stage === "vsOpen" || sc.stage === "vs3bet";
  if (heroAggr) return respect ? " Your tight image adds fold equity — bluffs and c-bets work better, so you can run a few more; thin value gets less action." : wide ? " Your loose image means less fold equity — bluff less and value-bet thicker, they'll pay you off." : "";
  if (heroDef) return respect ? " Because you look tight, thinking players bluff you less — give their aggression a bit more credit." : wide ? " Because you look loose, they bluff you more — bluff-catch a touch wider." : "";
  return "";
}
function contextLine(sc) {
  const st = sc.street === "flop" ? "Flop" : sc.street === "turn" ? "Turn" : "River";
  const mwN = sc.field && sc.field.length > 1 ? sc.field.length : 0;
  if (sc.stage === "cbet" || sc.stage === "barrel") return `${st}${mwN ? ` ${mwN + 1}-way` : ""} — ${sc.ip ? "checked to you as the raiser" : "you're first to act as the raiser"}. Bet or check?`;
  if (sc.stage === "riverBet") return "River — the betting lead is yours. Thin value, bluff, or shut it down?";
  if (sc.stage === "vsCbet" || sc.stage === "vsBarrel") return `${st} — ${sc.vil.p.name} fires ${pctLbl(betInfo(sc).frac)} pot at you.`;
  if (sc.stage === "riverCall") return `River — ${sc.vil.p.name} bets ${pctLbl(betInfo(sc).frac)} pot. Bluff-catch or let it go?`;
  if (sc.stage === "rfi") {
    if (sc.limpers) return sc.heroPos === "BB" ? `Your big blind — ${sc.limpers} limper${sc.limpers > 1 ? "s" : ""} in. Check your option or raise?` : `${sc.limpers} limper${sc.limpers > 1 ? "s" : ""} to you in the ${sc.heroPos}. Iso, overlimp, or let it go?`;
    return sc.hu ? "Small blind — first in. Your move." : sc.heroPos === "UTG" ? "First to act, under the gun." : `Folds to you in the ${sc.heroPos}.`;
  }
  if (sc.stage === "vsOpen") {
    const nC = sc.coldCallers ? sc.coldCallers.length : 0;
    if (nC) return `${sc.openerP.name} opens the ${sc.openerPos}, ${nC} caller${nC > 1 ? "s" : ""} in — you close from the ${sc.heroPos}.`;
    return `${sc.openerP.name} opens from the ${sc.openerPos} — you defend the ${sc.heroPos}.`;
  }
  if (sc.stage === "vs3bet") return `${sc.aggP.name} 3-bets from the ${sc.aggPos}.`;
  if (sc.stage === "vs4bet") return `${sc.aggP.name} 4-bets your 3-bet.`;
  return `${sc.aggP.name} jams over your 4-bet.`;
}

/* ---------------- Local profiles & progress history ----------------
   Zero-backend: a "profile" is a local player whose session history is saved in
   this browser (localStorage). All access is guarded so the app still runs if
   storage is unavailable (it just won't persist). */
const LS = (() => {
  try { const k = "__ll_t"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return window.localStorage; } catch (e) { return null; }
})();
/* Hydrate-at-boot store: all ll_* keys load into memory once, reads serve from
   the cache, writes go cache-first then through a pluggable backend. This is
   the Capacitor seam — swapping localStorage for native async storage later
   means replacing `backend` only; every caller keeps the same sync API.
   Quota/write failures set store.failed instead of dropping data silently. */
const backend = {
  keys() { const out = []; try { for (let i = 0; i < (LS ? LS.length : 0); i++) { const k = LS.key(i); if (k && k.indexOf("ll_") === 0) out.push(k); } } catch (e) {} return out; },
  read(k) { try { return LS && LS.getItem(k); } catch (e) { return null; } },
  write(k, raw) { try { if (LS) LS.setItem(k, raw); return true; } catch (e) { return false; } },
};
const store = {
  ok: !!LS,
  failed: false,
  cache: new Map(),
  hydrate() { for (const k of backend.keys()) { const raw = backend.read(k); if (raw != null) { try { this.cache.set(k, JSON.parse(raw)); } catch (e) {} } } },
  get(k, fb) { return this.cache.has(k) ? this.cache.get(k) : fb; },
  set(k, v) {
    this.cache.set(k, v);
    if (!backend.write(k, JSON.stringify(v))) this.failed = true;
  },
};
store.hydrate();
const profilesList = () => store.get("ll_profiles", []);
const histKey = (name) => "ll_hist_" + name;
const loadHist = (name) => (name ? store.get(histKey(name), []) : []);
function saveSessionRecord(name, rec) {
  if (!name) return loadHist(name);
  const h = loadHist(name);
  h.push(rec);
  store.set(histKey(name), h);
  return h;
}
function upsertProfile(name) {
  const list = profilesList();
  if (!list.includes(name)) { list.push(name); store.set("ll_profiles", list); }
  store.set("ll_current", name);
}
/* Backup & restore: browsers can evict localStorage (iOS Safari deletes it after
   7 days away unless the app is installed to the home screen), so give users a
   file they own. Restore merges — sessions dedupe on (t, n), never clobbering. */
function buildBackup() {
  const profiles = profilesList();
  const data = { app: "leak-lab", v: 1, t: Date.now(), profiles, current: store.get("ll_current", null), hist: {} };
  for (const p of profiles) data.hist[p] = loadHist(p);
  return data;
}
function mergeHist(a, b) {
  const seen = new Set(), out = [];
  for (const r of [...(a || []), ...(b || [])].sort((x, y) => (x.t || 0) - (y.t || 0))) {
    const k = `${r.t}:${r.n || 0}`;
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}
function applyBackup(d) {
  if (!d || d.app !== "leak-lab" || !Array.isArray(d.profiles)) throw new Error("not a Leak Lab backup");
  const merged = [...new Set([...profilesList(), ...d.profiles])];
  store.set("ll_profiles", merged);
  for (const p of d.profiles) store.set(histKey(p), mergeHist(loadHist(p), d.hist && d.hist[p]));
  const cur = store.get("ll_current", null) || (d.current && merged.includes(d.current) ? d.current : null) || merged[0] || null;
  if (cur) store.set("ll_current", cur);
  return cur;
}

/* ---------------- Leak tracking over time ----------------
   Severity is EV lost per *opportunity* in the stage bucket where the leak can
   happen — not per session and not per decision. A session that never reached a
   river says nothing about river leaks, so it carries no weight for them rather
   than counting as a clean zero. Without this, a session's spot mix reads as
   improvement.

   Sessions are irregular in both length and spacing, so the trend is a kernel
   regression over calendar time with each session weighted by its own exposure:

       f(t) = Σ K((t−tᵢ)/h)·vᵢ  /  Σ K((t−tᵢ)/h)·eᵢ

   vᵢ = bb lost to the leak, eᵢ = opportunities faced, K = Gaussian. Dividing
   weighted EV by weighted exposure (instead of averaging per-session rates) is
   what keeps a 12-spot session from outvoting a 300-spot one — it's a pooled
   rate, the correct way to combine rates of unequal sample size.

   h adapts per point: it widens until KERNEL_SUPPORT opportunities are in
   reach, so dense stretches keep resolution and sparse ones borrow from further
   out instead of drawing noise. Each point is then shrunk toward the all-time
   rate in proportion to how little support it has, so one short bad session
   can't spike the curve. */
const LEAK_BUCKET = { vs3bet: "pressure" }; // LEAKS[].drill → byStage key; the rest are identity
function bucketOf(key) {
  const d = LEAKS[key] && LEAKS[key].drill;
  return d ? LEAK_BUCKET[d] || d : null;
}
/* opps values are {n, good} per stage; the earliest records stored bare numbers. */
const oppCount = (o) => (typeof o === "number" ? o : o && o.n ? o.n : 0);
const KERNEL_SUPPORT = 60; // opportunities a smoothing window reaches for
const SHRINK = 25;         // pseudo-opportunities pulling thin points to the all-time rate
const GRID = 40;           // smoothed points drawn across the span

/* One observation per session that actually faced this leak's spot type. */
function leakObs(recs, key) {
  const b = bucketOf(key);
  if (!b) return [];
  const out = [];
  for (const r of recs || []) {
    if (!r || !r.t || !r.opps) continue; // records banked before leak tracking existed
    const e = oppCount(r.opps[b]);
    if (e <= 0) continue;
    const L = r.leaks && r.leaks[key];
    out.push({ t: r.t, e, v: L ? L.ev : 0, n: L ? L.n : 0, live: !!r.live });
  }
  return out.sort((a, b2) => a.t - b2.t);
}

/* Then-vs-now on equal evidence: split the sessions into two halves holding the
   same number of opportunities (splitting a session across the boundary
   proportionally) and pool each side. Reading the smoothed curve's endpoints
   instead would inherit kernel boundary bias — with one-sided support, a short
   session sitting on either end swings the headline number hard. Equal-exposure
   halves are immune to that and are honest to state: first N spots vs last N. */
function halves(obs, totE, base) {
  const mid = totE / 2;
  let acc = 0, v0 = 0, e0 = 0, v1 = 0, e1 = 0;
  for (const o of obs) {
    const early = Math.min(o.e, Math.max(0, mid - acc));
    const rate = o.e > 0 ? o.v / o.e : 0;
    v0 += rate * early; e0 += early;
    v1 += rate * (o.e - early); e1 += o.e - early;
    acc += o.e;
  }
  return {
    early: (v0 + SHRINK * base) / (e0 + SHRINK),
    late: (v1 + SHRINK * base) / (e1 + SHRINK),
    halfE: Math.round(mid),
  };
}

function leakTrend(recs, key) {
  const obs = leakObs(recs, key);
  if (!obs.length) return null;
  let totV = 0, totE = 0, totN = 0;
  for (const o of obs) { totV += o.v; totE += o.e; totN += o.n; }
  const base = totE > 0 ? totV / totE : 0; // all-time rate, and the shrink target
  const t0 = obs[0].t, t1 = obs[obs.length - 1].t, span = t1 - t0;
  const out = { obs, curve: [], base, totV, totE, totN, span, early: base, late: base, halfE: Math.round(totE / 2), maxSup: 0 };
  if (obs.length < 2 || span <= 0) return out;
  Object.assign(out, halves(obs, totE, base));

  const hMin = Math.max(span / 50, 60000); // guards h→0 when sessions share a timestamp
  const hRef = Math.max(span / 12, hMin);  // fixed window for "is there real data near here?"
  for (let g = 0; g < GRID; g++) {
    const t = t0 + (span * g) / (GRID - 1);
    // Adaptive bandwidth: reach outward until enough exposure is within range.
    const near = obs.map((o) => ({ d: Math.abs(t - o.t), e: o.e })).sort((a, b2) => a.d - b2.d);
    let acc = 0, h = hMin;
    for (const x of near) { h = Math.max(x.d, hMin); acc += x.e; if (acc >= KERNEL_SUPPORT) break; }
    let sv = 0, se = 0, sup = 0;
    for (const o of obs) {
      const k = Math.exp(-0.5 * ((t - o.t) / h) ** 2);
      sv += k * o.v; se += k * o.e;
      // Support is measured at hRef, not h: because h widens until it finds data,
      // se is self-normalizing and would read "confident" in the middle of a gap.
      sup += Math.exp(-0.5 * ((t - o.t) / hRef) ** 2) * o.e;
    }
    out.curve.push({ x: t, y: (sv + SHRINK * base) / (se + SHRINK), sup });
    if (sup > out.maxSup) out.maxSup = sup;
  }
  return out;
}

/* What a banked session contributes to leak history: EV+count per leak, and the
   opportunity count per stage bucket that makes those numbers a rate. */
const leakSnapshot = (s) => Object.fromEntries(Object.entries(s.leaks).map(([k, L]) => [k, { ev: +L.ev.toFixed(2), n: L.count }]));
const oppSnapshot = (s) => Object.fromEntries(Object.entries(s.byStage).map(([k, b]) => [k, { n: b.n, good: b.good }]));

/* Roll every tracked session into one row per leak, for the all-time list. */
function leakTotals(recs) {
  const acc = {};
  for (const key of Object.keys(LEAKS)) {
    const b = bucketOf(key);
    if (!b) continue;
    let v = 0, n = 0, e = 0;
    for (const r of recs || []) {
      if (!r || !r.opps) continue;
      const ex = oppCount(r.opps[b]);
      if (ex <= 0) continue;
      e += ex;
      const L = r.leaks && r.leaks[key];
      if (L) { v += L.ev; n += L.n; }
    }
    if (n > 0) acc[key] = { ev: v, count: n, opps: e };
  }
  return acc;
}

/* ---------------- Cloud accounts (Supabase, optional) ----------------
   Magic-link login + cross-device session history. Uses plain fetch against
   Supabase Auth (GoTrue) and PostgREST — no dependencies. The publishable key
   is safe to embed (data is protected by row-level security). If SB_KEY is
   empty, all cloud features are hidden and the app is fully local. */
const SB_URL = "https://digcgqltrlmhgmzgmvwc.supabase.co";
const SB_KEY = "sb_publishable_c1BymCnX2uWjsjZ03Vck6Q_LWQLOClv"; // publishable client key (safe to embed; RLS protects data)
const CLOUD_ON = !!SB_KEY && typeof fetch === "function";
const sbHeaders = (token) => ({ apikey: SB_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
async function sbSendMagicLink(email) {
  const redirect = (typeof window !== "undefined" && window.location) ? window.location.href.split("#")[0] : "";
  const r = await fetch(`${SB_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: "POST", headers: sbHeaders(), body: JSON.stringify({ email, create_user: true }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).msg || `link failed (${r.status})`);
}
function sbSessionFromHash() {
  try {
    const h = window.location.hash;
    if (!h || h.indexOf("access_token") < 0) return null;
    const p = new URLSearchParams(h.slice(1));
    const at = p.get("access_token"), rt = p.get("refresh_token");
    if (!at) return null;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return { at, rt };
  } catch (e) { return null; }
}
async function sbUser(at) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: sbHeaders(at) });
  if (!r.ok) return null;
  const j = await r.json();
  return j && j.email ? { email: j.email } : null;
}
async function sbRefresh(rt) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ refresh_token: rt }) });
  if (!r.ok) return null;
  const j = await r.json();
  return j.access_token ? { at: j.access_token, rt: j.refresh_token || rt } : null;
}
async function sbFetchHistory(at) {
  const r = await fetch(`${SB_URL}/rest/v1/ll_sessions?select=t,n,acc,ev,ev_per,realized,hands,mode,stake,leaks,opps&order=t.asc`, { headers: sbHeaders(at) });
  if (!r.ok) throw new Error("fetch failed");
  const rows = await r.json();
  return rows.map((x) => ({ t: Date.parse(x.t), n: x.n, acc: x.acc, ev: +x.ev, evPer: +x.ev_per, realized: x.realized == null ? 0 : +x.realized, hands: x.hands || 0, mode: x.mode, stake: x.stake,
    leaks: x.leaks || undefined, opps: x.opps || undefined }));
}
async function sbInsertSession(at, rec, player) {
  const body = { player: player || null, n: rec.n, acc: rec.acc, ev: rec.ev, ev_per: rec.evPer, realized: rec.realized, hands: rec.hands, mode: rec.mode, stake: rec.stake,
    leaks: rec.leaks || null, opps: rec.opps || null };
  const r = await fetch(`${SB_URL}/rest/v1/ll_sessions`, { method: "POST", headers: { ...sbHeaders(at), Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("save failed");
}
/* Anonymous usage ping: event name + a random install id. Nothing else — no
   account linkage, no hands, no device info. Insert-only table (RLS denies
   reads), so the embedded key can count usage but never retrieve it. */
function sbTrack(ev) {
  if (!CLOUD_ON) return;
  try {
    let sid = store.get("ll_sid", null);
    if (!sid) { sid = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12); store.set("ll_sid", sid); }
    fetch(`${SB_URL}/rest/v1/ll_events`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ ev, sid }) }).catch(() => {});
  } catch (e) {}
}

/* Tiny dependency-free SVG line chart for the progress view. */
function LineChart({ series, height = 150, yLabel, fmtY }) {
  const W = 320, H = height, padL = 34, padR = 10, padT = 12, padB = 22;
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  if (!all.length) return null;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const n = Math.max(...series.map((s) => s.points.length));
  const xOf = (i) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} stroke="#2A332E" strokeWidth="1" />
          <text x={padL - 5} y={yOf(t) + 3} textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="#8B948C">{fmtY ? fmtY(t) : Math.round(t)}</text>
        </g>
      ))}
      {series.map((s, si) => {
        if (s.points.length < 2) {
          return s.points.map((p, i) => <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r="3" fill={s.color} />);
        }
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
            {s.points.map((p, i) => <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r="2.5" fill={s.color} />)}
          </g>
        );
      })}
    </svg>
  );
}

/* C2: 13×13 opening-range grid for a profile × position. Derived live from the
   same percentile model the grader uses (PCT × seat threshold × profile rfi
   multiplier × stake sizing), so the grid IS the chart — there is no second
   source of truth to drift. Percentile-nested ranges are a model simplification;
   the caption says so. */
function RangeGrid({ p, mode, bbv, pos }) {
  const hu = mode === "hu";
  const baseT = hu ? HU_OPEN : TABLES[mode].rfi[pos];
  if (baseT == null) return null;
  const t = Math.max(2, baseT * (p.rfi || 1) * rfiTighten(refOpenBB(bbv, hu)));
  const R = "AKQJT98765432";
  const cells = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const hi = Math.min(i, j), lo = Math.max(i, j);
      const label = i === j ? R[i] + R[j] : R[hi] + R[lo] + (j > i ? "s" : "o");
      const pct = PCT[label];
      const open = pct != null && pct <= t;
      cells.push(
        <div key={label} style={{ width: "7.69%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 7.5, color: open ? "#171309" : T.dim, background: open ? T.brass : T.panel,
          border: `0.5px solid ${T.ink}`, opacity: open ? 1 : 0.55 }}>{label}</div>
      );
    }
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.line}` }}>{cells}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: T.dim, marginTop: 5 }}>
        {p.name} opens ~{Math.round(t)}% from the {hu ? "SB" : pos} · model range (top-{Math.round(t)}% by hand strength), sized for live opens
      </div>
    </div>
  );
}

const dayMs = 86400000;
function tLabel(t, span) {
  const d = new Date(t);
  if (span < 2 * dayMs) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
/* Leak trend on a real time axis: raw sessions as dots sized by exposure, the
   smoothed curve faded where its support is thin, all-time rate as a baseline.
   Rate is shown in bb per 100 opportunities. */
function LeakChart({ tr, height = 168 }) {
  const W = 320, H = height, padL = 40, padR = 12, padT = 12, padB = 24;
  if (!tr || !tr.obs.length) return null;
  const rate = (o) => (o.v / o.e) * 100;
  // Scale to where the practice actually is: a 5-spot session can post a wild
  // rate and would otherwise flatten the real curve into the bottom of the chart.
  // The axis covers 90% of total exposure; rarer/higher dots clamp to the top.
  const byRate = tr.obs.map((o) => ({ r: rate(o), e: o.e })).sort((a, b) => a.r - b.r);
  let acc = 0, q = byRate.length ? byRate[byRate.length - 1].r : 1;
  for (const s of byRate) { acc += s.e; if (acc >= 0.9 * tr.totE) { q = s.r; break; } }
  let lo = 0, hi = Math.max(q, tr.base * 100, ...tr.curve.map((p) => p.y * 100));
  if (!(hi > 0)) hi = 1;
  hi *= 1.15;
  const t0 = tr.obs[0].t, span = tr.span;
  const xOf = (t) => (span <= 0 ? padL + (W - padL - padR) / 2 : padL + ((t - t0) / span) * (W - padL - padR));
  const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const maxE = Math.max(...tr.obs.map((o) => o.e));
  const ticks = [lo, hi / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} stroke={T.line} strokeWidth="1" />
          <text x={padL - 5} y={yOf(t) + 3} textAnchor="end" fontFamily={MONO} fontSize="8" fill={T.dim}>{t.toFixed(1)}</text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={yOf(tr.base * 100)} y2={yOf(tr.base * 100)} stroke={T.dim} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
      {tr.curve.slice(1).map((p, i) => {
        const q = tr.curve[i];
        // Per-segment opacity so stretches with little nearby practice read as uncertain.
        const sup = Math.min(q.sup, p.sup);
        return <line key={i} x1={xOf(q.x)} y1={yOf(q.y * 100)} x2={xOf(p.x)} y2={yOf(p.y * 100)}
          stroke={T.heart} strokeWidth="2" strokeLinecap="round" opacity={0.18 + 0.82 * Math.min(1, sup / KERNEL_SUPPORT)} />;
      })}
      {tr.obs.map((o, i) => {
        const r = 2 + 3 * Math.sqrt(o.e / maxE), x = xOf(o.t), v = rate(o);
        // Off-scale sessions become a caret on the top edge rather than silently
        // vanishing or dragging the axis out to meet them.
        if (v > hi) return <path key={i} d={`M${x - r},${padT + r} L${x},${padT} L${x + r},${padT + r}`}
          fill="none" stroke={o.live ? T.brass : T.bone} strokeWidth="1.5" opacity={o.live ? 1 : 0.45} />;
        return <circle key={i} cx={x} cy={yOf(v)} r={r}
          fill={o.live ? "none" : T.bone} stroke={o.live ? T.brass : "none"} strokeWidth="1.5" opacity={o.live ? 1 : 0.5} />;
      })}
      <text x={padL} y={H - 6} fontFamily={MONO} fontSize="8" fill={T.dim}>{tLabel(t0, span)}</text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontFamily={MONO} fontSize="8" fill={T.dim}>{span > 0 ? tLabel(t0 + span, span) : ""}</text>
    </svg>
  );
}

export default function App() {
  const [view, setView] = useState("setup");
  const [cfg, setCfg] = useState({ mode: "9max", hu: "tag", seats: ["nit", "reg", "lag", "station", "maniac", "tag", "station", "nit"], stake: 0, stack: 2, image: "unknown", play: "drill" });
  const [filter, setFilter] = useState("all");
  const [sess, setSess] = useState({ n: 0, good: 0, ev: 0, leaks: {}, byStage: {}, aggr: 0, pass: 0, foldn: 0, realized: 0, hands: 0 });
  const [sc, setSc] = useState(null);
  const [fb, setFb] = useState(null);
  const [openProf, setOpenProf] = useState(null);
  const [gridPos, setGridPos] = useState("CO");
  const [table, setTable] = useState(null);
  const [handEv, setHandEv] = useState(0);
  const [profile, setProfile] = useState(() => store.get("ll_current", null));
  const [history, setHistory] = useState(() => loadHist(store.get("ll_current", null)));
  const [nameInput, setNameInput] = useState("");
  const [peek, setPeek] = useState(null);
  const [openLeak, setOpenLeak] = useState(null);
  const [leakScope, setLeakScope] = useState("session");
  const [bkMsg, setBkMsg] = useState("");
  const [mc, setMc] = useState(null); // Monte-Carlo result for the current all-in spot
  const runMath = () => {
    if (!sc || sc.stage !== "vsJam") return;
    setMc({ busy: true });
    // Defer so the "simulating…" state paints before the (synchronous) sim runs.
    setTimeout(() => {
      const eq = mcEquity(sc.hand.cards, sc.board || [], sc.aggP.jamRep, 12000);
      if (!eq) { setMc(null); return; }
      const call = sc.jamCall != null ? sc.jamCall : toCallBB(sc);
      const potBefore = sc.potBB;
      const needed = call / (potBefore + call);
      const evCall = eq.equity * potBefore - (1 - eq.equity) * call; // hero net bb by calling
      setMc({ equity: eq.equity, needed, evCall });
    }, 30);
  };
  const [cloud, setCloud] = useState(null); // { at, rt, email }
  const [cloudHist, setCloudHist] = useState(null); // cloud session records when signed in
  const [emailInput, setEmailInput] = useState("");
  const [cloudMsg, setCloudMsg] = useState("");

  // Cloud bootstrap: capture magic-link tokens from the URL hash, restore saved
  // sessions, refresh expired tokens, and pull history.
  useEffect(() => { sbTrack("open"); }, []);
  useEffect(() => {
    if (!CLOUD_ON) return;
    (async () => {
      try {
        let s = sbSessionFromHash();
        if (s) store.set("ll_sb", s);
        else s = store.get("ll_sb", null);
        if (!s) return;
        let u = await sbUser(s.at);
        if (!u && s.rt) { const ns = await sbRefresh(s.rt); if (ns) { s = ns; store.set("ll_sb", s); u = await sbUser(s.at); } }
        if (!u) { store.set("ll_sb", null); return; }
        setCloud({ ...s, email: u.email });
        setCloudHist(await sbFetchHistory(s.at).catch(() => null));
      } catch (e) {}
    })();
  }, []);

  const cloudSignOut = () => { store.set("ll_sb", null); setCloud(null); setCloudHist(null); setCloudMsg(""); };
  const bbv = STAKES[cfg.stake].bb;
  const stackBB = STACK_OPTS[cfg.stack];

  const switchProfile = (name) => {
    if (name) upsertProfile(name);
    else store.set("ll_current", null);
    setProfile(name || null);
    setHistory(loadHist(name));
  };
  // Bank the current session into the active profile's history (min 5 decisions).
  const bankSession = () => {
    if (sess.n < 5) return false;
    const acc = Math.round((sess.good / sess.n) * 100);
    const rec = { t: Date.now(), n: sess.n, acc, ev: +sess.ev.toFixed(1), evPer: +(sess.ev / sess.n).toFixed(3), realized: +sess.realized.toFixed(1), hands: sess.hands, mode: cfg.play, stake: STAKES[cfg.stake].label,
      leaks: leakSnapshot(sess), opps: oppSnapshot(sess) };
    sbTrack("bank");
    if (profile) { const h = saveSessionRecord(profile, rec); setHistory(h); }
    if (CLOUD_ON && cloud) {
      sbInsertSession(cloud.at, rec, profile)
        .then(() => sbFetchHistory(cloud.at))
        .then((h) => setCloudHist(h))
        .catch(() => setCloudMsg("cloud save failed — kept locally"));
    }
    return !!profile || !!cloud;
  };

  // Build the persistent table for full-hand mode (hero at seat 0, lineup around).
  // Stacks are assigned once and persist across hands — the table looks the same
  // when you glance around next hand, like a real session.
  const buildTable = () => {
    const N = cfg.mode === "hu" ? 2 : POS_BY_OFFSET[cfg.mode].length;
    const seats = [], stks = [];
    for (let s = 0; s < N; s++) {
      seats[s] = s === 0 ? null : cfg.seats[(s - 1) % cfg.seats.length];
      stks[s] = s === 0 ? null : vilStk(PROF[seats[s]], STACK_OPTS[cfg.stack], STAKES[cfg.stake].bb);
    }
    return { btn: (Math.random() * N) | 0, heroSeat: 0, seats, stks };
  };
  // Deal the next full hand, skipping walks (folded to the BB), advancing the button.
  const dealHand = (tbl) => {
    let t = tbl, s = genHand(cfg, t), guard = 0;
    while (s.stage === "walk" && guard++ < 20) { t = { ...t, btn: t.btn + 1 }; s = genHand(cfg, t); }
    return { t, s };
  };

  const start = (f) => {
    setMc(null);
    if (cfg.play === "hand") {
      const tbl = buildTable();
      const { t, s } = dealHand(tbl);
      setTable(t); setSc(s); setHandEv(0); setFb(null); setPeek(null); setView("train");
      return;
    }
    const ff = f || filter;
    setFilter(ff);
    setSc(genScenario(cfg, ff === "all" ? null : ff));
    setHandEv(0); setFb(null); setPeek(null); setView("train");
  };
  const resetSession = () => { bankSession(); setSess({ n: 0, good: 0, ev: 0, leaks: {}, byStage: {}, aggr: 0, pass: 0, foldn: 0, realized: 0, hands: 0 }); };

  const act = (a) => {
    const post = POST_STAGES.includes(sc.stage);
    const zones = zonesFor(sc.stage, { hu: sc.hu, mode: sc.mode, rfiT: sc.rfiT, heroPos: sc.heroPos, openerPos: sc.openerPos, bbv: sc.bbv, openBB: sc.openBB, tb: sc.tb, ip: sc.ip, frac: sc.vFrac, limpers: sc.limpers, callers: sc.coldCallers ? sc.coldCallers.length : 0, mw: sc.field && sc.field.length ? sc.field.length : (sc.defMw || 1), effOpp: sc.effPre, aggPos: sc.aggPos, effAgg: sc.aggStk != null ? Math.min(sc.S, sc.aggStk) : undefined, jamRep: sc.aggP && sc.aggP.jamRep, ...dynCtx(sc), spr: post && sc.effBB != null ? sc.effBB / sc.potBB : undefined });
    const pct = post ? sc.cls.rank : sc.hand.pct;
    const g = (sc.stage === "vsJam" || sc.stage === "vs4bet") ? gradeStackoff(zones, pct, a, sc.potBB) : AGG_STAGES.includes(sc.stage) ? gradeSized(zones, pct, a, sc.potBB) : (sc.stage === "rfi" || sc.stage === "vsOpen") ? gradeRaise(zones, pct, a) : grade(zones, pct, a, post ? 6 : undefined);
    const cont = continuation(sc, a, bbv);
    const terminal = !cont.nextSc;
    const hEv = +(handEv + g.ev).toFixed(2);
    setHandEv(terminal ? 0 : hEv);
    const skey = sc.stage === "rfi" ? "rfi" : sc.stage === "vsOpen" ? "vsOpen"
      : sc.stage === "cbet" || sc.stage === "barrel" ? "cbet"
      : sc.stage === "vsCbet" || sc.stage === "vsBarrel" ? "vsCbet"
      : sc.stage === "riverBet" || sc.stage === "riverCall" ? "rivers" : "pressure";
    setSess((s) => {
      const by = { ...s.byStage };
      const b = by[skey] || { n: 0, good: 0 };
      by[skey] = { n: b.n + 1, good: b.good + (g.verdict !== "miss" ? 1 : 0) };
      const leaks = { ...s.leaks };
      if (g.verdict === "miss") {
        const lk2 = resolveLeak(sc.stage, g, a);
        const L = leaks[lk2] || { ev: 0, count: 0 };
        leaks[lk2] = { ev: L.ev + g.ev, count: L.count + 1 };
      }
      const isAggr = a === "raise" || a === "bet" || a.indexOf("raise") === 0 || a.indexOf("bet") === 0;
      const isPassive = a === "call" || a === "limp";
      const scored = terminal && cont.result != null;
      return { n: s.n + 1, good: s.good + (g.verdict !== "miss" ? 1 : 0), ev: +(s.ev + g.ev).toFixed(2), leaks, byStage: by,
        aggr: s.aggr + (isAggr ? 1 : 0), pass: s.pass + (isPassive ? 1 : 0), foldn: s.foldn + (a === "fold" ? 1 : 0),
        realized: +(s.realized + (scored ? cont.result : 0)).toFixed(2), hands: s.hands + (scored ? 1 : 0) };
    });
    const lk = g.verdict === "miss" ? resolveLeak(sc.stage, g, a) : null;
    setFb({ g, cont, action: a, lk, terminal, handEv: hEv, result: terminal ? cont.result : null });
  };

  const next = () => {
    setPeek(null); setMc(null);
    if (fb && fb.cont.nextSc) { setSc(fb.cont.nextSc); setFb(null); return; }
    if (cfg.play === "hand" && table) {
      const { t, s } = dealHand({ ...table, btn: table.btn + 1 });
      setTable(t); setSc(s); setHandEv(0); setFb(null); return;
    }
    setSc(genScenario(cfg, filter === "all" ? null : filter));
    setHandEv(0); setFb(null);
  };

  const acc = sess.n ? Math.round((100 * sess.good) / sess.n) : 0;

  // Leak history: cloud records only carry leak data once the backend stores it,
  // so fall back to whichever source actually has tracked sessions. The live
  // session rides along as a provisional point so the trend responds immediately.
  const leakRecs = useMemo(() => {
    const tracked = (a) => (a || []).filter((r) => r && r.opps);
    const loc = tracked(history), cld = tracked(cloudHist);
    const banked = cld.length > loc.length ? cld : loc;
    if (sess.n < 5) return banked;
    return banked.concat([{ t: Date.now(), live: true, leaks: leakSnapshot(sess), opps: oppSnapshot(sess) }]);
  }, [history, cloudHist, sess]);
  const allTime = useMemo(() => leakTotals(leakRecs), [leakRecs]);
  const allTimeTot = useMemo(() => {
    let ev = 0, n = 0, s = 0; const opps = {};
    for (const r of leakRecs) {
      s++;
      if (r.live) { ev += sess.ev; n += sess.n; } else { ev += r.ev || 0; n += r.n || 0; }
      for (const [b, e] of Object.entries(r.opps || {})) opps[b] = (opps[b] || 0) + oppCount(e);
    }
    return { ev, n, s, opps };
  }, [leakRecs, sess]);
  const scope = leakScope === "all" ? allTime : sess.leaks;
  const leakList = Object.entries(scope).sort((a, b) => b[1].ev - a[1].ev);
  const maxEv = leakList.length ? leakList[0][1].ev : 1;
  const openTrend = useMemo(() => (openLeak ? leakTrend(leakRecs, openLeak) : null), [openLeak, leakRecs]);
  const isPost = sc ? POST_STAGES.includes(sc.stage) : false;
  const scPct = sc ? (isPost ? sc.cls.rank : sc.hand.pct) : 0;
  const zones = sc ? zonesFor(sc.stage, { hu: sc.hu, mode: sc.mode, rfiT: sc.rfiT, heroPos: sc.heroPos, openerPos: sc.openerPos, bbv: sc.bbv, openBB: sc.openBB, tb: sc.tb, ip: sc.ip, frac: sc.vFrac, limpers: sc.limpers, callers: sc.coldCallers ? sc.coldCallers.length : 0, mw: sc.field && sc.field.length ? sc.field.length : (sc.defMw || 1), effOpp: sc.effPre, aggPos: sc.aggPos, effAgg: sc.aggStk != null ? Math.min(sc.S, sc.aggStk) : undefined, jamRep: sc.aggP && sc.aggP.jamRep, ...dynCtx(sc), spr: isPost && sc.effBB != null ? sc.effBB / sc.potBB : undefined }) : [];
  const acts = sc
    ? (AGG_STAGES.includes(sc.stage) ? ["check", ...heroBetOpts(sc).map((o) => o.id)]
      : sc.stage === "riverCall" || sc.stage === "vsJam" ? ["fold", "call"]
      : sc.stage === "rfi" ? (sc.heroPos === "BB" && sc.limpers ? ["limp", ...openIds(sc.bbv || 2, sc.hu)] : ["fold", "limp", ...openIds(sc.bbv || 2, sc.hu)])
      : sc.stage === "vsOpen" ? ["fold", "call", "raiseS", "raiseB"]
      : ["fold", "call", "raise"])
    : [];

  const seg = (label, on, onClick, key) => (
    <div key={key} className="ll-tap" onClick={onClick} style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 10,
      fontFamily: DISP, fontWeight: 700, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase",
      color: on ? "#171309" : T.dim, background: on ? T.brass : "transparent" }}>{label}</div>
  );

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(120% 90% at 50% 0%, #16201B 0%, ${T.ink} 55%)`, fontFamily: BODY, color: T.bone }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "16px 14px 130px" }}>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: T.bone }}>LEAK LAB</div>
            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10, letterSpacing: 2.5, color: T.dim }}>LIVE STRATEGY · REAL PLAYERS, REAL SPOTS</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: T.dim }}>{STAKES[cfg.stake].label} · {stackBB}bb · {cfg.mode === "hu" ? "HU" : cfg.mode === "9max" ? "9-MAX" : "6-MAX"}</div>
            <span className="ll-tap" onClick={() => setView("progress")} style={{ fontFamily: MONO, fontSize: 10, color: profile ? T.club : T.dim, border: `1px solid ${profile ? T.club : T.line}`, borderRadius: 999, padding: "2px 9px" }}>
              {CLOUD_ON && cloud ? `● ${cloud.email.split("@")[0]}` : profile ? `● ${profile}` : "○ guest"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 4, margin: "14px 0" }}>
          {seg("Train", view === "train", () => (sc ? setView("train") : start()), "t")}
          {seg("Leaks", view === "leaks", () => setView("leaks"), "l")}
          {seg("Progress", view === "progress", () => setView("progress"), "p")}
          {seg("Setup", view === "setup", () => setView("setup"), "s")}
        </div>

        {view === "train" && sc && (
          <div>
            <div style={{ display: "flex", gap: 10, padding: "10px 0 14px", borderBottom: `1px solid ${T.line}` }}>
              <Stat k={cfg.play === "hand" ? "HANDS" : "SPOTS"} v={cfg.play === "hand" ? sess.hands : sess.n} />
              <Stat k="ACCURACY" v={`${acc}%`} color={acc >= 80 ? T.club : acc >= 60 ? T.brass : T.heart} />
              {cfg.play === "hand"
                ? <Stat k="RESULT vs EV" v={`${sess.realized >= 0 ? "+" : ""}${usd(sess.realized * bbv)}`} color={sess.realized >= 0 ? T.club : T.heart} />
                : <Stat k={`EV LOST · ${sess.ev.toFixed(1)}bb`} v={usd(sess.ev * bbv)} color={sess.ev > 0 ? T.heart : T.dim} />}
            </div>

            <div style={{ margin: "12px 0 4px" }}><TableView sc={sc} onPeek={setPeek} /></div>
            {peek && (
              <div className="ll-tap" onClick={() => setPeek(null)} style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 6px", padding: "8px 11px", borderRadius: 10, background: T.panel, border: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 17 }}>{peek.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 12, letterSpacing: 1, color: T.bone }}>{peek.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}> — {peek.desc}</span>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: T.dim }}>✕</span>
              </div>
            )}

            <div style={{ textAlign: "center", margin: "16px 0 6px" }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginBottom: 8 }}>
                pot {usd(sc.potBB * bbv)} · {Math.round(sc.potBB * 10) / 10}bb — behind {usd((sc.effBB != null ? sc.effBB : sc.S) * bbv)} · {Math.round((sc.effBB != null ? sc.effBB : sc.S) * 10) / 10}bb
              </div>
              {sc.pre && !fb && <div style={{ fontFamily: MONO, fontSize: 11, color: T.brass, marginBottom: 6 }}>{sc.pre}</div>}
              <div style={{ fontSize: 14, color: T.dim, marginBottom: 14 }}>{contextLine(sc)}</div>
              {isPost && (
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14 }}>
                  {sc.board.map((c, i) => <PCard key={`b-${sc.street}-${i}-${c.r}${c.s}`} c={c} i={i} small />)}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {sc.hand.cards.map((c, i) => <PCard key={`${sess.n}-${sc.stage}-${i}`} c={c} i={i} />)}
              </div>
              <div style={{ marginTop: 10, fontFamily: DISP, fontWeight: 700, fontSize: 15, letterSpacing: 2, color: T.dim }}>
                {sc.hand.label} · {sc.heroPos}{isPost ? ` — ${sc.cls.label}` : ""}
              </div>
              {sc.stage === "vsJam" && (
                <div style={{ marginTop: 12 }}>
                  {!mc && <span className="ll-tap" onClick={runMath} style={{ fontFamily: DISP, fontWeight: 700, fontSize: 12, letterSpacing: 1.5, color: T.diamond, border: `1.5px solid ${T.diamond}`, borderRadius: 999, padding: "7px 16px", display: "inline-block" }}>🎲 RUN THE MATH</span>}
                  {mc && mc.busy && <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}>simulating 12,000 runouts…</span>}
                  {mc && !mc.busy && (() => {
                    const call = mc.evCall >= 0;
                    return (
                      <div style={{ background: T.panel, border: `1px solid ${call ? T.club : T.heart}`, borderRadius: 12, padding: "10px 14px", textAlign: "left", maxWidth: 320, margin: "0 auto" }}>
                        <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10, letterSpacing: 1.5, color: T.dim }}>MONTE CARLO · {sc.hand.label} vs {sc.aggP.name}'s shove range</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: T.bone, marginTop: 6 }}>
                          <span style={{ color: T.brass, fontSize: 15 }}>{(mc.equity * 100).toFixed(1)}%</span> equity · need <span style={{ color: T.brass }}>{(mc.needed * 100).toFixed(1)}%</span>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12.5, color: call ? T.club : T.heart, marginTop: 5 }}>
                          Calling = {mc.evCall >= 0 ? "+" : ""}{mc.evCall.toFixed(1)}bb ({usd(mc.evCall * bbv)}) → <b>{call ? "CALL" : "FOLD"}</b>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.dim, marginTop: 5 }}>real equity of your exact hand vs their modeled range — 12k random runouts</div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {fb && (
              <div style={{ marginTop: 16, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, animation: "llRise .25s ease both" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 14, letterSpacing: 1.5, padding: "5px 12px", borderRadius: 999,
                    color: "#10130F",
                    background: fb.g.verdict === "best" ? T.club : fb.g.verdict === "ok" ? T.diamond : T.heart }}>
                    {fb.g.verdict === "best" ? "✓ SOLID PLAY" : fb.g.verdict === "ok" ? "≈ MIXED — FINE" : `LEAK −${fb.g.ev}bb · −${usd(fb.g.ev * bbv)}`}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}>chart: {actionLabel(sc.stage, fb.g.best, sc.hu, sc, bbv)}</span>
                </div>
                {fb.lk && <div style={{ marginTop: 10, fontSize: 13, color: T.heart }}>{LEAKS[fb.lk].label}</div>}
                <div style={{ marginTop: 10, padding: "9px 11px", borderLeft: `2px solid ${T.brass}`, background: "rgba(217,164,65,.05)", borderRadius: "0 8px 8px 0" }}>
                  <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 9, letterSpacing: 2, color: T.dim, marginBottom: 4 }}>COACH'S NOTE · GTO BASELINE</div>
                  <div style={{ fontSize: 12.5, color: T.bone, lineHeight: 1.55 }}>{adviceFor(sc, zones, bbv)}</div>
                </div>
                {(() => { const ex = exploitFor(sc); if (!ex) return null; return (
                  <div style={{ marginTop: 8, padding: "9px 11px", borderLeft: `2px solid ${T.diamond}`, background: "rgba(76,154,229,.06)", borderRadius: "0 8px 8px 0" }}>
                    <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 9, letterSpacing: 2, color: T.diamond, marginBottom: 4 }}>EXPLOIT · vs {ex.icon} {ex.name.toUpperCase()}</div>
                    <div style={{ fontSize: 12.5, color: T.bone, lineHeight: 1.55 }}>{ex.txt}</div>
                  </div>
                ); })()}
                {(() => { const mind = mindsetFor(sc, cfg.image); if (!mind) return null; const edge = imageEdge(sc, cfg.image); return (
                  <div style={{ marginTop: 8, padding: "9px 11px", borderLeft: `2px solid ${T.club}`, background: "rgba(76,175,110,.06)", borderRadius: "0 8px 8px 0" }}>
                    <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 9, letterSpacing: 2, color: T.club, marginBottom: 4 }}>THEIR READ · your image: {IMAGES[cfg.image].icon} {IMAGES[cfg.image].name.toLowerCase()}</div>
                    <div style={{ fontSize: 12.5, color: T.bone, lineHeight: 1.55 }}>{mind}{edge}</div>
                  </div>
                ); })()}
                <RangeStrip zones={fb.g.zones} pct={scPct} caption={isPost ? `nuts 0 → 100 air · you: ${sc.cls.label}` : undefined} />
                <OptionCosts sc={sc} zones={fb.g.zones} pct={scPct} chosen={fb.action} bbv={bbv} />
                <div style={{ fontSize: 13, color: T.bone, margin: "10px 0 14px" }}>{fb.cont.text}</div>
                {fb.terminal && fb.result != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 11px", marginBottom: 12, borderRadius: 10, background: T.panel, border: `1px solid ${T.line}` }}>
                    <span>
                      <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 9, letterSpacing: 2, color: T.dim }}>HAND RESULT</span>
                      <span style={{ fontFamily: MONO, fontSize: 15, marginLeft: 8, color: fb.result >= 0 ? T.club : T.heart }}>{fb.result >= 0 ? "+" : ""}{usd(fb.result * bbv)}</span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 9, letterSpacing: 2, color: T.dim }}>EV LOST</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, marginLeft: 8, color: fb.handEv > 0.3 ? T.heart : T.dim }}>{fb.handEv > 0 ? `−${fb.handEv}bb` : "0 · clean"}</span>
                    </span>
                  </div>
                )}
                {fb.terminal && fb.result != null && (
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginBottom: 12, lineHeight: 1.5 }}>
                    {fb.handEv <= 0.3 && fb.result >= 0 ? "Played it right and won — that's the goal."
                      : fb.handEv <= 0.3 && fb.result < 0 ? "You played it right and still lost — that's variance, not a mistake. EV is what matters long-term."
                      : fb.handEv > 0.3 && fb.result >= 0 ? "You won, but the line leaked EV — you got there despite the mistake, not because of it."
                      : "Lost the pot and leaked EV — the spot to review is above, not the bad beat."}
                  </div>
                )}
                <Btn full kind="raise" label={fb.cont.nextSc ? "Continue →" : cfg.play === "hand" ? "Next hand →" : "Next hand →"} onClick={next} />
              </div>
            )}
          </div>
        )}

        {view === "leaks" && (
          <div>
            <div style={{ display: "flex", gap: 10, padding: "10px 0 14px", borderBottom: `1px solid ${T.line}` }}>
              {leakScope === "all" ? (
                <>
                  <Stat k="SESSIONS" v={allTimeTot.s} />
                  <Stat k="DECISIONS" v={allTimeTot.n} />
                  <Stat k={`EV LOST · ${allTimeTot.ev.toFixed(1)}bb`} v={usd(allTimeTot.ev * bbv)} color={T.heart} />
                </>
              ) : (
                <>
                  <Stat k="DECISIONS" v={sess.n} />
                  <Stat k="ACCURACY" v={`${acc}%`} color={acc >= 80 ? T.club : T.brass} />
                  <Stat k={`EV LOST · ${sess.ev.toFixed(1)}bb`} v={usd(sess.ev * bbv)} color={T.heart} />
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, margin: "12px 0 18px", flexWrap: "wrap" }}>
              {leakScope === "all"
                ? Object.entries(allTimeTot.opps).map(([k, e]) => (
                  <span key={k} style={{ fontFamily: MONO, fontSize: 11, color: T.dim, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 999, padding: "5px 10px" }}>
                    {STAGE_LABEL[k]} {e} spots
                  </span>
                ))
                : Object.entries(sess.byStage).map(([k, b]) => (
                  <span key={k} style={{ fontFamily: MONO, fontSize: 11, color: T.dim, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 999, padding: "5px 10px" }}>
                    {STAGE_LABEL[k]} {Math.round((100 * b.good) / b.n)}%
                  </span>
                ))}
            </div>
            <div style={{ display: "flex", gap: 4, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 4, marginBottom: 14 }}>
              {seg("This session", leakScope === "session", () => setLeakScope("session"), "ls")}
              {seg("All time", leakScope === "all", () => setLeakScope("all"), "la")}
            </div>
            {leakList.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: T.dim }}>
                <div style={{ fontSize: 15, marginBottom: 16 }}>
                  {leakScope === "all"
                    ? "No banked sessions yet. Bank a session and your leaks start building a trend here."
                    : "No leaks logged yet. Every miss lands here, priced in big blinds."}
                </div>
                <Btn full kind="raise" label="Start drilling" onClick={() => start()} />
              </div>
            )}
            {leakList.map(([k, L]) => {
              const open = openLeak === k;
              const tr = open ? openTrend : null;
              const per100 = L.opps ? (100 * L.ev) / L.opps : null;
              return (
                <div key={k} style={{ background: T.panel, border: `1px solid ${open ? T.brass : T.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div className="ll-tap" onClick={() => setOpenLeak(open ? null : k)} style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, color: T.bone }}>{LEAKS[k].label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: T.dim, marginTop: 3 }}>
                        {L.count}× · −{L.ev.toFixed(1)}bb · −{usd(L.ev * bbv)}
                        {per100 != null && ` · ${per100.toFixed(2)}bb/100`}
                        <span style={{ color: T.brass, marginLeft: 6 }}>{open ? "▾" : "▸"}</span>
                      </div>
                    </div>
                    <button className="ll-btn" onClick={() => start(LEAKS[k].drill)} style={{ background: "transparent", border: `1.5px solid ${T.brass}`,
                      color: T.brass, borderRadius: 10, padding: "8px 14px", fontFamily: DISP, fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
                      DRILL
                    </button>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "#202723", marginTop: 10 }}>
                    <div style={{ height: 5, borderRadius: 3, width: `${(100 * L.ev) / maxEv}%`, background: T.heart }} />
                  </div>
                  {open && (
                    <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 12 }}>
                      {!tr || tr.obs.length < 2 ? (
                        <div style={{ fontFamily: MONO, fontSize: 11, color: T.dim, lineHeight: 1.6 }}>
                          {!tr || !tr.obs.length
                            ? `No tracked sessions with ${STAGE_LABEL[bucketOf(k)]} spots yet.`
                            : `Only one session so far has faced ${STAGE_LABEL[bucketOf(k)]} spots.`}
                          {" "}Bank a few sessions{profile || (CLOUD_ON && cloud) ? "" : " (pick a player in Progress first)"} and the trend line appears here.
                        </div>
                      ) : (() => {
                        const d = tr.late - tr.early, rel = tr.early > 0 ? d / tr.early : 0;
                        const better = d < 0;
                        const flat = Math.abs(rel) < 0.1;
                        const thin = tr.maxSup < KERNEL_SUPPORT;
                        return (
                          <>
                            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 11, letterSpacing: 2, color: T.dim, marginBottom: 4 }}>
                              BB LOST PER 100 {STAGE_LABEL[bucketOf(k)]} SPOTS · lower is better
                            </div>
                            <LeakChart tr={tr} />
                            <div style={{ display: "flex", gap: 10, padding: "10px 0 2px" }}>
                              <Stat k="SESSIONS" v={tr.obs.length} />
                              <Stat k="SPOTS FACED" v={tr.totE} />
                              <Stat k="ALL-TIME" v={`${(tr.base * 100).toFixed(2)}`} color={T.brass} />
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 11.5, color: flat ? T.dim : better ? T.club : T.heart, marginTop: 8, lineHeight: 1.6 }}>
                              {flat ? "→" : better ? "▼" : "▲"} {(tr.early * 100).toFixed(2)} → {(tr.late * 100).toFixed(2)} bb/100
                              {" — "}
                              {flat ? "holding steady; this one isn't moving yet."
                                : better ? `down ${Math.abs(Math.round(rel * 100))}% — first ${tr.halfE} spots vs last ${tr.halfE}.`
                                : `up ${Math.abs(Math.round(rel * 100))}% — first ${tr.halfE} spots vs last ${tr.halfE}. Worth drilling.`}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
                              Dots are sessions, sized by how many {STAGE_LABEL[bucketOf(k)]} spots they held; the hollow one is this session, unbanked.
                              A caret on the top edge is a session too short to scale to. The line weights each session by its length and by how
                              close in time it sits, so a short session can't swing it.
                              {thin && " Faint stretches are thin on data — treat them as a hint, not a verdict."}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            {sess.n > 0 && (
              <div className="ll-tap" onClick={resetSession} style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: T.dim, marginTop: 16, textDecoration: "underline" }}>
                reset session
              </div>
            )}
          </div>
        )}

        {view === "progress" && (() => {
          const plist = profilesList();
          const recs = (CLOUD_ON && cloud && cloudHist) ? cloudHist : history;
          const nRec = recs.length;
          const accSeries = recs.map((r, i) => ({ x: i, y: r.acc }));
          const evSeries = recs.map((r, i) => ({ x: i, y: r.evPer }));
          const firstAcc = nRec ? recs[0].acc : 0, lastAcc = nRec ? recs[nRec - 1].acc : 0;
          const delta = lastAcc - firstAcc;
          const totalDec = recs.reduce((s, r) => s + r.n, 0);
          const bestAcc = nRec ? Math.max(...recs.map((r) => r.acc)) : 0;
          return (
            <div>
              {CLOUD_ON && (
                <>
                  <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "6px 0 8px" }}>ACCOUNT · syncs across devices</div>
                  {cloud ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: T.club, padding: "6px 12px", borderRadius: 999, background: T.panel, border: `1px solid ${T.club}` }}>✓ {cloud.email}</span>
                      <span className="ll-tap" onClick={cloudSignOut} style={{ fontFamily: MONO, fontSize: 11, color: T.dim, textDecoration: "underline" }}>sign out</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="email for magic link" type="email"
                          style={{ flex: 1, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 11px", color: T.bone, fontFamily: MONO, fontSize: 13, outline: "none" }} />
                        <span className="ll-tap" onClick={async () => {
                          const em = emailInput.trim(); if (!em) return;
                          setCloudMsg("sending…");
                          try { await sbSendMagicLink(em); setCloudMsg("Link sent — check your email and open it on this device."); }
                          catch (e) { setCloudMsg(`Couldn't send: ${e.message}`); }
                        }} style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13, letterSpacing: 1, padding: "9px 14px", borderRadius: 10, background: T.diamond, color: "#0B1420" }}>SEND LINK</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 6 }}>No password — tap the emailed link and you're in. Your sessions then follow you to any device.</div>
                    </>
                  )}
                  {cloudMsg && <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.brass, marginTop: 6 }}>{cloudMsg}</div>}
                  <div style={{ height: 14 }} />
                </>
              )}
              <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "6px 0 8px" }}>PLAYER</div>
              {!store.ok && <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.heart, marginBottom: 8 }}>This browser is blocking local storage — progress won't persist here.</div>}
              {store.ok && store.failed && <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.heart, marginBottom: 8 }}>A save just failed (storage may be full) — back up your data below and free some space.</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {plist.map((p) => (
                  <span key={p} className="ll-tap" onClick={() => switchProfile(p)}
                    style={{ fontFamily: MONO, fontSize: 12, padding: "6px 12px", borderRadius: 999, color: profile === p ? "#0B1420" : T.bone, background: profile === p ? T.club : T.panel, border: `1px solid ${profile === p ? T.club : T.line}` }}>
                    ● {p}
                  </span>
                ))}
                <span className="ll-tap" onClick={() => switchProfile(null)} style={{ fontFamily: MONO, fontSize: 12, padding: "6px 12px", borderRadius: 999, color: profile ? T.dim : "#0B1420", background: profile ? T.panel : T.brass, border: `1px solid ${profile ? T.line : T.brass}` }}>guest</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input value={nameInput} onChange={(e) => setNameInput(e.target.value.slice(0, 16))} placeholder="new player name"
                  style={{ flex: 1, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 11px", color: T.bone, fontFamily: MONO, fontSize: 13, outline: "none" }} />
                <span className="ll-tap" onClick={() => { const nm = nameInput.trim(); if (nm) { switchProfile(nm); setNameInput(""); } }}
                  style={{ fontFamily: DISP, fontWeight: 700, fontSize: 13, letterSpacing: 1, padding: "9px 16px", borderRadius: 10, background: T.brass, color: "#171309" }}>ADD</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 8 }}>
                {CLOUD_ON && cloud ? `Signed in — sessions sync to your account${profile ? ` (and to “${profile}” locally)` : ""}.` : profile ? `Sessions save to “${profile}” on this device when you reset or bank a session.` : "Playing as guest — pick or add a player above to track progress over time."}
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <span className="ll-tap" onClick={() => {
                  try {
                    const blob = new Blob([JSON.stringify(buildBackup())], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `leak-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                    setBkMsg("Backup downloaded — keep it anywhere (Files, Drive, email to yourself).");
                  } catch (e) { setBkMsg("Couldn't build the backup."); }
                }} style={{ fontFamily: MONO, fontSize: 11, color: T.diamond, textDecoration: "underline" }}>⬇ back up my data</span>
                <label className="ll-tap" style={{ fontFamily: MONO, fontSize: 11, color: T.diamond, textDecoration: "underline" }}>
                  ⬆ restore a backup
                  <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    e.target.value = "";
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => {
                      try {
                        const cur = applyBackup(JSON.parse(r.result));
                        setProfile(cur); setHistory(loadHist(cur));
                        setBkMsg("Backup restored — sessions merged, nothing overwritten.");
                      } catch (err) { setBkMsg("That file isn't a Leak Lab backup."); }
                    };
                    r.readAsText(f);
                  }} />
                </label>
              </div>
              {bkMsg && <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.brass, marginTop: 6 }}>{bkMsg}</div>}
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 6 }}>
                Browsers can clear website data (iPhone Safari deletes it after 7 days away). Two ways to make your progress permanent: add Leak Lab to your home screen — an installed app's data is protected — or back it up above. Signing in with email keeps sessions in the cloud too.
              </div>

              <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "22px 0 4px" }}>ACCURACY OVER SESSIONS</div>
              {nRec < 2 ? (
                <div style={{ fontFamily: MONO, fontSize: 11, color: T.dim, padding: "18px 0" }}>
                  {profile ? `Play and bank at least 2 sessions to see your trend.${nRec === 1 ? " 1 saved so far." : ""}` : "Add a player to start tracking."}
                </div>
              ) : (
                <>
                  <LineChart series={[{ points: accSeries, color: T.club }]} fmtY={(t) => Math.round(t) + "%"} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: T.dim, marginTop: 2 }}>
                    <span>session 1</span><span>session {nRec}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: delta >= 0 ? T.club : T.heart, marginTop: 8 }}>
                    {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta}% accuracy since your first session — {delta > 3 ? "clear improvement." : delta >= -3 ? "holding steady." : "slipping; review your top leaks."}
                  </div>

                  <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "22px 0 4px" }}>EV LOST PER DECISION · lower is better</div>
                  <LineChart series={[{ points: evSeries, color: T.brass }]} fmtY={(t) => t.toFixed(2)} />

                  {(() => {
                    // Biggest movers: scan every leak's trend, surface the most
                    // improved and the most worsening with enough evidence.
                    const moves = [];
                    for (const k of Object.keys(LEAKS)) {
                      const tr = leakTrend(leakRecs, k);
                      if (!tr || tr.obs.length < 3 || tr.totE < 60 || tr.early <= 0) continue;
                      moves.push({ k, rel: (tr.late - tr.early) / tr.early, tr });
                    }
                    if (!moves.length) return null;
                    moves.sort((a, b) => a.rel - b.rel);
                    const best = moves[0], worst = moves[moves.length - 1];
                    const row = (m, good) => (
                      <div key={m.k} className="ll-tap" onClick={() => { setLeakScope("all"); setOpenLeak(m.k); setView("leaks"); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px", marginTop: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: good ? T.club : T.heart }}>{good ? "▼" : "▲"}</span>
                        <span style={{ fontSize: 12.5, color: T.bone, flex: 1 }}>{LEAKS[m.k].label}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: good ? T.club : T.heart }}>
                          {good ? "" : "+"}{Math.round(m.rel * 100)}% · {(m.tr.early * 100).toFixed(1)}→{(m.tr.late * 100).toFixed(1)} bb/100
                        </span>
                      </div>
                    );
                    return (
                      <>
                        <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "22px 0 4px" }}>BIGGEST MOVERS · tap for the trend</div>
                        {best.rel < -0.08 && row(best, true)}
                        {worst.rel > 0.08 && row(worst, false)}
                        {best.rel >= -0.08 && worst.rel <= 0.08 && <div style={{ fontFamily: MONO, fontSize: 11, color: T.dim, marginTop: 4 }}>No leak is moving much yet — trends firm up as sessions bank.</div>}
                      </>
                    );
                  })()}
                </>
              )}

              <div style={{ display: "flex", gap: 10, padding: "16px 0", borderTop: `1px solid ${T.line}`, marginTop: 18 }}>
                <Stat k="SESSIONS" v={nRec} />
                <Stat k="DECISIONS" v={totalDec} />
                <Stat k="BEST ACC" v={nRec ? `${bestAcc}%` : "—"} color={T.club} />
              </div>

              {sess.n >= 5 && (profile || (CLOUD_ON && cloud)) && (
                <Btn full kind="raise" label="Bank current session →" onClick={() => { bankSession(); setSess({ n: 0, good: 0, ev: 0, leaks: {}, byStage: {}, aggr: 0, pass: 0, foldn: 0, realized: 0, hands: 0 }); }} />
              )}
              {nRec > 0 && profile && (
                <div className="ll-tap" onClick={() => { store.set(histKey(profile), []); setHistory([]); }}
                  style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 12, textDecoration: "underline" }}>clear {profile}'s history</div>
              )}
            </div>
          );
        })()}

        {view === "setup" && (
          <div>
            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "6px 0 8px" }}>MODE</div>
            <div style={{ display: "flex", gap: 4, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 4 }}>
              {seg("Drill spots", cfg.play === "drill", () => setCfg({ ...cfg, play: "drill" }), "dr")}
              {seg("Full hands", cfg.play === "hand", () => setCfg({ ...cfg, play: "hand" }), "fh")}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 8 }}>
              {cfg.play === "hand"
                ? "Play each hand start to finish. The button rotates so you cycle every seat — the lineup below is your fixed table (seat 1 is on your left, around to your right)."
                : "Fast reps of a chosen decision type. Use the focus filters to target a leak."}
            </div>

            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>TABLE</div>
            <div style={{ display: "flex", gap: 4, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 4 }}>
              {seg("9-max", cfg.mode === "9max", () => setCfg({ ...cfg, mode: "9max" }), "9m")}
              {seg("6-max", cfg.mode === "6max", () => setCfg({ ...cfg, mode: "6max" }), "6m")}
              {seg("Heads-up", cfg.mode === "hu", () => setCfg({ ...cfg, mode: "hu" }), "hu")}
            </div>

            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>STAKES</div>
            <div style={{ display: "flex", gap: 6 }}>
              {STAKES.map((s, i) => (
                <span key={s.label} className="ll-tap" onClick={() => setCfg({ ...cfg, stake: i })}
                  style={{ flex: 1, textAlign: "center", padding: "11px 4px", borderRadius: 12, fontFamily: MONO, fontSize: 14,
                    color: cfg.stake === i ? "#171309" : T.bone, background: cfg.stake === i ? T.brass : T.panel,
                    border: `1px solid ${cfg.stake === i ? T.brass : T.line}` }}>
                  {s.label}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>STARTING STACK · UP TO 500BB</div>
            <div style={{ display: "flex", gap: 6 }}>
              {STACK_OPTS.map((s, i) => (
                <span key={s} className="ll-tap" onClick={() => setCfg({ ...cfg, stack: i })}
                  style={{ flex: 1, textAlign: "center", padding: "11px 2px", borderRadius: 12, fontFamily: MONO, fontSize: 13,
                    color: cfg.stack === i ? "#171309" : T.bone, background: cfg.stack === i ? T.brass : T.panel,
                    border: `1px solid ${cfg.stack === i ? T.brass : T.line}` }}>
                  {s}bb
                </span>
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 8 }}>
              buy-in {STACK_OPTS[cfg.stack]}bb = {usd(STACK_OPTS[cfg.stack] * STAKES[cfg.stake].bb)} at {STAKES[cfg.stake].label} · stacks behind shrink as chips go in
            </div>

            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>YOUR TABLE IMAGE · how the table reads you</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {Object.entries(IMAGES).map(([id, im]) => {
                const on = cfg.image === id;
                return (
                  <span key={id} className="ll-tap" onClick={() => setCfg({ ...cfg, image: id })}
                    style={{ textAlign: "center", padding: "9px 4px", borderRadius: 10, fontFamily: MONO, fontSize: 11,
                      color: on ? "#0B1420" : T.bone, background: on ? T.club : T.panel, border: `1px solid ${on ? T.club : T.line}` }}>
                    {im.icon} {im.name}
                  </span>
                );
              })}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 8 }}>{IMAGES[cfg.image].desc}.</div>
            {(() => { const sr = sessionImage(sess); return (
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: sr.id ? T.brass : T.dim, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{sr.note}</span>
                {sr.id && sr.id !== cfg.image && <span className="ll-tap" onClick={() => setCfg({ ...cfg, image: sr.id })} style={{ color: T.club, textDecoration: "underline" }}>use this</span>}
              </div>
            ); })()}

            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>
              {cfg.mode === "hu" ? "OPPONENT" : "LINEUP · your seat rotates each hand"}
            </div>

            {cfg.mode === "hu" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PROFILES.map((p) => {
                  const on = cfg.hu === p.id;
                  return (
                    <div key={p.id} className="ll-tap" onClick={() => setCfg({ ...cfg, hu: p.id })}
                      style={{ background: on ? "rgba(217,164,65,.1)" : T.panel, border: `1.5px solid ${on ? T.brass : T.line}`, borderRadius: 14, padding: "12px 12px" }}>
                      <div style={{ fontSize: 20 }}>{p.icon}</div>
                      <div style={{ fontFamily: DISP, fontWeight: 700, fontSize: 16, letterSpacing: 1, marginTop: 4 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{p.desc}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {cfg.seats.slice(0, cfg.mode === "9max" ? 8 : 5).map((id, i) => {
                  const p = PROF[id];
                  return (
                    <div key={i} className="ll-tap"
                      onClick={() => {
                        const idx = PROFILES.findIndex((x) => x.id === id);
                        const nxt = PROFILES[(idx + 1) % PROFILES.length].id;
                        const seats = cfg.seats.slice(); seats[i] = nxt; setCfg({ ...cfg, seats });
                      }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.panel,
                        border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 14px", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: T.dim }}>SEAT {i + 1}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{p.icon}</span>
                        <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{p.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: T.brass }}>tap ↻</span>
                      </span>
                    </div>
                  );
                })}
                <div className="ll-tap" onClick={() => setCfg({ ...cfg, seats: cfg.seats.map(() => PROFILES[(Math.random() * PROFILES.length) | 0].id) })}
                  style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: T.dim, textDecoration: "underline", margin: "4px 0 0" }}>
                  randomize lineup
                </div>
              </div>
            )}

            <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>PLAYER TYPES · tap to learn the tells + assumed ranges</div>
            {PROFILES.map((p) => (
              <div key={`pt-${p.id}`} style={{ background: T.panel, border: `1px solid ${openProf === p.id ? T.brass : T.line}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
                <div className="ll-tap" onClick={() => setOpenProf(openProf === p.id ? null : p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                  <span style={{ fontSize: 16 }}>{p.icon}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontFamily: DISP, fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 11.5, color: T.dim, display: "block", marginTop: 1 }}>{p.desc}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: T.brass }}>{openProf === p.id ? "▾" : "▸"}</span>
                </div>
                {openProf === p.id && (
                  <div style={{ padding: "2px 14px 12px", borderTop: `1px solid ${T.line}` }}>
                    <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10.5, letterSpacing: 2, color: T.brass, marginTop: 10 }}>SPOT THEM LIVE</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: T.bone, lineHeight: 1.55, marginTop: 4 }}>{p.spot}</div>
                    <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10.5, letterSpacing: 2, color: T.dim, marginTop: 10 }}>OPENING RANGE · flip through positions</div>
                    {cfg.mode !== "hu" && (
                      <div style={{ display: "flex", gap: 4, margin: "6px 0 8px", flexWrap: "wrap" }}>
                        {TABLES[cfg.mode].pos.filter((ps) => ps !== "BB").map((ps) => (
                          <span key={ps} className="ll-tap" onClick={() => setGridPos(ps)}
                            style={{ fontFamily: MONO, fontSize: 10, padding: "4px 9px", borderRadius: 999,
                              color: gridPos === ps ? "#171309" : T.dim, background: gridPos === ps ? T.brass : T.panel, border: `1px solid ${gridPos === ps ? T.brass : T.line}` }}>{ps}</span>
                        ))}
                      </div>
                    )}
                    <RangeGrid p={p} mode={cfg.mode} bbv={bbv} pos={cfg.mode === "hu" ? "SB" : (TABLES[cfg.mode].rfi[gridPos] != null ? gridPos : "CO")} />
                    <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 10.5, letterSpacing: 2, color: T.dim, marginTop: 10 }}>ASSUMED RANGES</div>
                    {profDetail(p, cfg.mode).map((l, i) => (
                      <div key={i} style={{ fontFamily: MONO, fontSize: 11, color: T.bone, lineHeight: 1.55, marginTop: 8 }}>{l}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {cfg.play !== "hand" && (
              <>
                <div style={{ fontFamily: DISP, fontWeight: 600, fontSize: 12, letterSpacing: 2, color: T.dim, margin: "20px 0 8px" }}>FOCUS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {FOCI.map(([f, lbl]) => (
                    <span key={f} className="ll-tap" onClick={() => setFilter(f)}
                      style={{ padding: "8px 14px", borderRadius: 999, fontFamily: DISP, fontWeight: 700, fontSize: 13, letterSpacing: 1,
                        color: filter === f ? "#171309" : T.dim, background: filter === f ? T.brass : T.panel, border: `1px solid ${filter === f ? T.brass : T.line}` }}>
                      {lbl}
                    </span>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 24 }}>
              <Btn full kind="raise" label="Deal me in" onClick={() => start()} />
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
              ⚖️ Preflop: precomputed GTO charts. Postflop: solver-calibrated by board archetype, SPR & bet size —<br />
              mixed sizings graded like a solver mixes. Aggregate frequencies, not per-hand solves.
            </div>
          </div>
        )}
      </div>

      {view === "train" && sc && !fb && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "26px 14px 18px",
          background: `linear-gradient(180deg, rgba(16,20,24,0) 0%, ${T.ink} 38%)` }}>
          <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {acts.map((a) => <Btn key={a} kind={a} label={actionLabel(sc.stage, a, sc.hu, sc, bbv)} onClick={() => act(a)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
