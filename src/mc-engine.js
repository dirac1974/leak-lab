// Pure poker maths — no React, no DOM — so it can be imported by both the app and
// the background equity worker (src/equity-worker.js) without pulling in the UI.
// Card model used by the Monte-Carlo scorer: card int = (r-2)*4 + suit, so
// rank = c>>2 (0-12), suit = c&3.

export const RC = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };

export function handScore(hi, lo, suited) {
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
export const RANKED = (() => {
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
export const PCT = Object.fromEntries(RANKED.map((h) => [h.label, h.pct]));

export const SUITS = ["s", "h", "d", "c"];
export function materialize(h) {
  const s1 = SUITS[(Math.random() * 4) | 0];
  let s2 = s1;
  if (!h.suited) { do { s2 = SUITS[(Math.random() * 4) | 0]; } while (s2 === s1); }
  return [{ r: h.hi, s: s1 }, { r: h.lo, s: s2 }];
}
export function deal() {
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
   the math" button gives ground truth, not the heuristic percentile. Exact
   5-card scorer packs category + tiebreaks into one integer; eval7 takes the
   best of C(7,5)=21. */
export const SIDX = { s: 0, h: 1, d: 2, c: 3 };
export const encCard = (c) => (c.r - 2) * 4 + SIDX[c.s];
export function rank5i(c0, c1, c2, c3, c4) {
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
export const C7 = (() => { const o=[]; for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let d=b+1;d<5;d++)for(let e=d+1;e<6;e++)for(let f=e+1;f<7;f++)o.push([a,b,d,e,f]); return o; })();
export function eval7(c) { let best = -1; for (let i=0;i<C7.length;i++){ const t=C7[i]; const s=rank5i(c[t[0]],c[t[1]],c[t[2]],c[t[3]],c[t[4]]); if(s>best)best=s; } return best; }
/* Sample one valid combo of a 169-class avoiding `used` (Set of card ints). */
export function sampleCombo(cls, used) {
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
   completing from `board` (0–5 cards). Returns {equity, iters, wins, ties, n} or null. */
export function mcEquity(heroCards, board, rangePct, iters) {
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
  return n ? { equity: (win + tie / 2) / n, iters: n, wins: win, ties: tie, n } : null;
}
