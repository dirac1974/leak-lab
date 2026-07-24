// Equity aggregator: turns pooled ll_equity_samples into confirmed ll_equity_cache
// rows. Trust model — the crowd's raw tallies decide WHICH board spots are worth
// caching (demand), but the equity we publish is an AUTHORITATIVE server-side
// Monte-Carlo recompute of that exact spot, so a poisoned or noisy pool can never
// push a wrong number into grading. A key is confirmed only when it clears the
// demand gate AND the pooled estimate agrees with the recompute within tolerance.
//
//   Run (service role, never commit the key):
//     SUPABASE_SERVICE_ROLE_KEY=... node tools/sim/aggregate-equity.js
//   Self-test (no DB, no secret):
//     node tools/sim/aggregate-equity.js --self-test
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..", "..");

// Tunables.
const N_MIN = 20000;   // min pooled trials before a spot/bucket is worth confirming
const SID_MIN = 2;     // min distinct contributors (one device can't confirm alone)
const PER_SID_CAP = 60000; // cap any single sid's pooled trials, so one source can't dominate
const VERIFY_ITERS = 120000; // authoritative recompute depth (SE ~0.14% at 50%)
const TOL = 0.03;      // pooled-vs-recompute agreement band to confirm an exact spot
// Buckets (texture × strength-decile) pool many distinct exact spots, so the
// authoritative check recomputes a sample of members and allows a slightly wider
// band (member-sampling noise on top of MC noise).
const BUCKET_MEMBER_CAP = 12; // most-observed member spots recomputed per bucket
const TOL_BUCKET = 0.04;

const RRC = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };

// Reconstruct a concrete (representative) spot from a canonical key. Suits are the
// canonical labels; equity is suit-relabel invariant, so any representative works.
function keyToSpot(k) {
  const parts = String(k).split("|");
  if (parts.length !== 4) return null;
  const [rv, profId, street, label] = parts;
  const [heroS, boardS = ""] = label.split("/");
  const toCards = (s) => {
    const out = [];
    for (let i = 0; i + 1 < s.length; i += 2) { const r = RRC[s[i]]; if (!r) return null; out.push({ r, s: s[i + 1] }); }
    return out;
  };
  const hero = toCards(heroS), board = toCards(boardS);
  if (!hero || hero.length !== 2 || !board) return null;
  return { rv: +rv, profId, street, hero, board };
}

// Pool raw sample rows into one tally per key, capping each contributor so no
// single sid dominates. Returns { key -> { wins, ties, n, sids, sidSet } }.
function aggregateSamples(rows) {
  const bySidKey = {}; // `${k}\t${sid}` -> { wins, ties, n }
  for (const r of rows) {
    const kk = `${r.k}\t${r.sid == null ? "" : r.sid}`;
    const a = (bySidKey[kk] = bySidKey[kk] || { wins: 0, ties: 0, n: 0 });
    a.wins += r.wins; a.ties += r.ties; a.n += r.n;
  }
  const out = {};
  for (const kk of Object.keys(bySidKey)) {
    const [k, sid] = kk.split("\t");
    const a = bySidKey[kk];
    const scale = a.n > PER_SID_CAP ? PER_SID_CAP / a.n : 1; // proportionally cap this sid
    const o = (out[k] = out[k] || { wins: 0, ties: 0, n: 0, sidSet: new Set() });
    o.wins += a.wins * scale; o.ties += a.ties * scale; o.n += a.n * scale; o.sidSet.add(sid);
  }
  for (const k of Object.keys(out)) { const o = out[k]; o.sids = o.sidSet.size; o.equity = o.n ? (o.wins + o.ties / 2) / o.n : 0; }
  return out;
}

// Group exact-key aggregates into texture×strength buckets — the level where
// samples from DIFFERENT exact spots reinforce each other. deriveBucket maps an
// exact canonical key to its bucket key (null = unparseable, dropped).
function bucketize(agg, deriveBucket) {
  const out = {};
  for (const k of Object.keys(agg)) {
    const bk = deriveBucket(k);
    if (!bk) continue;
    const a = agg[k];
    const b = (out[bk] = out[bk] || { wins: 0, ties: 0, n: 0, sidSet: new Set(), members: [] });
    b.wins += a.wins; b.ties += a.ties; b.n += a.n;
    for (const s of a.sidSet) b.sidSet.add(s);
    b.members.push({ k, n: a.n });
  }
  for (const bk of Object.keys(out)) { const b = out[bk]; b.sids = b.sidSet.size; b.equity = b.n ? (b.wins + b.ties / 2) / b.n : 0; }
  return out;
}

const passesDemand = (agg) => agg.n >= N_MIN && agg.sids >= SID_MIN;
const decideConfirm = (pooledEquity, recomputed) => Math.abs(pooledEquity - recomputed) <= TOL;
const seOf = (p, n) => (n > 0 ? Math.sqrt(Math.max(0, p * (1 - p)) / n) : null);

// Build a CJS probe of the app so the recompute uses the SAME engine as clients.
function loadEngine() {
  const tmp = path.join(__dirname, ".build");
  fs.mkdirSync(tmp, { recursive: true });
  fs.cpSync(path.join(root, "src"), tmp, { recursive: true });
  fs.copyFileSync(path.join(tmp, "leak-lab.jsx"), path.join(tmp, "src.jsx"));
  fs.writeFileSync(path.join(tmp, "probe.jsx"),
    fs.readFileSync(path.join(tmp, "src.jsx"), "utf8") +
    "\nexport { mcEquity, equityKey, bucketKeyOf, PROF, EQUITY_MODEL_V };\n");
  esbuild.buildSync({ entryPoints: [path.join(tmp, "probe.jsx")], bundle: true, format: "cjs",
    jsx: "automatic", loader: { ".jsx": "jsx" }, external: ["react", "react/jsx-runtime"], outfile: path.join(tmp, "probe.js"), logLevel: "silent" });
  return require(path.join(tmp, "probe.js"));
}

// Authoritative equity of a reconstructed spot vs the profile's shove range.
function recompute(M, spot, iters) {
  const p = M.PROF[spot.profId];
  if (!p) return null;
  let s = 0, k = 4;
  for (let i = 0; i < k; i++) { const e = M.mcEquity(spot.hero, spot.board, p.jamRep, Math.round(iters / k)); if (e) s += e.equity; }
  return +(s / k).toFixed(4);
}

// ── DB helpers (PostgREST, service role) ─────────────────────────────────────
function sbConf() {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "src", "supabase-config.json"), "utf8"));
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { console.error("SUPABASE_SERVICE_ROLE_KEY not set — refusing to run (never commit it)."); process.exit(2); }
  return { url: cfg.url, key };
}
async function sbGet(conf, pathq) {
  const r = await fetch(`${conf.url}/rest/v1/${pathq}`, { headers: { apikey: conf.key, Authorization: `Bearer ${conf.key}` } });
  if (!r.ok) throw new Error(`GET ${pathq} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbUpsert(conf, rows) {
  const r = await fetch(`${conf.url}/rest/v1/ll_equity_cache`, {
    method: "POST",
    headers: { apikey: conf.key, Authorization: `Bearer ${conf.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert -> ${r.status} ${await r.text()}`);
}

async function main() {
  const M = loadEngine();
  const RV = M.EQUITY_MODEL_V;
  const conf = sbConf();
  // Fetch current-version samples (paginated).
  let rows = [], from = 0, PAGE = 10000;
  for (;;) {
    const page = await sbGet(conf, `ll_equity_samples?rv=eq.${RV}&select=k,wins,ties,n,sid&order=id.asc&offset=${from}&limit=${PAGE}`);
    rows = rows.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  const agg = aggregateSamples(rows);
  const keys = Object.keys(agg);
  console.log(`pooled ${rows.length} samples into ${keys.length} exact keys (rv ${RV})`);
  const upserts = [];
  let confirmed = 0, skippedDemand = 0, skippedDisagree = 0;
  // Pass 1 — exact spots: only the heavily-drilled ones ever clear this gate.
  for (const k of keys) {
    const a = agg[k];
    if (!passesDemand(a)) { skippedDemand++; continue; }
    const spot = keyToSpot(k);
    if (!spot || spot.rv !== RV) continue;
    const truth = recompute(M, spot, VERIFY_ITERS);
    if (truth == null) continue;
    if (!decideConfirm(a.equity, truth)) { skippedDisagree++;
      console.error(`  DISAGREE ${k}: pooled ${a.equity.toFixed(3)} vs recompute ${truth.toFixed(3)} (n=${Math.round(a.n)}, sids=${a.sids})`);
      continue;
    }
    upserts.push({ k, rv: RV, equity: truth, n: Math.round(a.n), se: seOf(truth, a.n), confirmed: true, updated_at: new Date().toISOString() });
    confirmed++;
  }
  // Pass 2 — texture×strength buckets: where cross-user pooling actually converges.
  // The published value is a weighted authoritative recompute of the bucket's
  // most-observed member spots; the crowd's pooled tally gates and cross-checks it.
  const deriveBucket = (k) => { const s = keyToSpot(k); return s && s.rv === RV ? M.bucketKeyOf(s.profId, s.hero, s.board) : null; };
  const buckets = bucketize(agg, deriveBucket);
  let bConfirmed = 0, bSkippedDemand = 0, bSkippedDisagree = 0, membersCapped = 0;
  for (const bk of Object.keys(buckets)) {
    const b = buckets[bk];
    if (!passesDemand(b)) { bSkippedDemand++; continue; }
    const members = [...b.members].sort((x, y) => y.n - x.n);
    const sample = members.slice(0, BUCKET_MEMBER_CAP);
    if (members.length > sample.length) { membersCapped++; console.error(`  ${bk}: verifying ${sample.length} of ${members.length} member spots (by observed n)`); }
    let wSum = 0, eSum = 0;
    for (const m of sample) {
      const spot = keyToSpot(m.k);
      if (!spot) continue;
      const e = recompute(M, spot, Math.round(VERIFY_ITERS / sample.length) + 20000);
      if (e == null) continue;
      wSum += m.n; eSum += e * m.n;
    }
    if (!wSum) continue;
    const auth = +(eSum / wSum).toFixed(4);
    if (Math.abs(b.equity - auth) > TOL_BUCKET) { bSkippedDisagree++;
      console.error(`  DISAGREE ${bk}: pooled ${b.equity.toFixed(3)} vs member recompute ${auth.toFixed(3)} (n=${Math.round(b.n)}, sids=${b.sids}, members=${members.length})`);
      continue;
    }
    upserts.push({ k: bk, rv: RV, equity: auth, n: Math.round(b.n), se: seOf(auth, b.n), confirmed: true, updated_at: new Date().toISOString() });
    bConfirmed++;
  }
  if (upserts.length) for (let i = 0; i < upserts.length; i += 500) await sbUpsert(conf, upserts.slice(i, i + 500));
  console.log(`exact: ${confirmed} confirmed, ${skippedDemand} below gate, ${skippedDisagree} disagreed`);
  console.log(`buckets: ${bConfirmed} confirmed, ${bSkippedDemand} below gate, ${bSkippedDisagree} disagreed${membersCapped ? `, ${membersCapped} verified on a member sample` : ""}`);
}

// ── Self-test: exercises parse + aggregate + recompute agreement, no DB ───────
function selfTest() {
  const M = loadEngine();
  let pass = 0, fail = 0;
  const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };
  const C = (r, s) => ({ r, s });
  const hero = [C(14, "s"), C(13, "h")], board = [C(12, "s"), C(11, "d"), C(2, "c")];
  const key = M.equityKey("nit", hero, board);
  // keyToSpot round-trips to the SAME canonical key (representative may differ, key must not).
  const spot = keyToSpot(key);
  ok("keyToSpot parses", spot && spot.profId === "nit" && spot.street === "flop" && spot.hero.length === 2 && spot.board.length === 3, JSON.stringify(spot));
  ok("keyToSpot round-trips to same key", M.equityKey(spot.profId, spot.hero, spot.board) === key);
  ok("keyToSpot rejects malformed", keyToSpot("garbage") === null && keyToSpot("1|nit|flop|ZZ/") === null);
  // Honest pooling across sids -> equity that matches an authoritative recompute.
  const truth = recompute(M, spot, 60000);
  const perSid = () => { const e = M.mcEquity(hero, board, M.PROF.nit.jamRep, 8000); return { k: key, wins: e.wins, ties: e.ties, n: e.n, sid: Math.random().toString(36).slice(2, 8) }; };
  const rows = [perSid(), perSid(), perSid(), perSid()];
  const agg = aggregateSamples(rows);
  ok("aggregate sums to one key", Object.keys(agg).length === 1 && agg[key]);
  ok("aggregate counts distinct sids", agg[key].sids === 4);
  ok("pooled equity ~ authoritative recompute", Math.abs(agg[key].equity - truth) < 0.03, `pooled ${agg[key].equity.toFixed(3)} vs ${truth.toFixed(3)}`);
  ok("confirm decision accepts honest pool", decideConfirm(agg[key].equity, truth));
  ok("confirm decision rejects a poisoned value", !decideConfirm(0.99, truth));
  // Demand gate: a single low-n sid must not confirm.
  ok("demand gate blocks one weak sid", !passesDemand(aggregateSamples([{ k: key, wins: 5, ties: 0, n: 10, sid: "a" }])[key]));
  ok("demand gate passes enough pooled trials + sids", passesDemand(aggregateSamples([{ k: key, wins: 6000, ties: 40, n: 12000, sid: "a" }, { k: key, wins: 6000, ties: 40, n: 12000, sid: "b" }])[key]));
  // Per-sid cap: one giant sid is bounded so it can't dominate the pool.
  const capped = aggregateSamples([{ k: key, wins: 500000, ties: 0, n: 1000000, sid: "whale" }])[key];
  ok("per-sid cap bounds a dominant source", capped.n <= PER_SID_CAP + 1e-6, `n=${capped.n}`);
  // Buckets: the canonical-key representative must land in the same bucket as the
  // original cards (texture and hand class are suit-relabel invariant)...
  const bkOrig = M.bucketKeyOf("nit", hero, board);
  const bkRep = M.bucketKeyOf(spot.profId, spot.hero, spot.board);
  ok("bucket key survives canonical round-trip", bkOrig === bkRep, `${bkOrig} vs ${bkRep}`);
  ok("bucket key format", /^b1\|nit\|flop\|(ahi|bwy|paired|low|wet|mono)\|[0-9]$/.test(bkOrig), bkOrig);
  // ...and different exact spots pool into their (possibly shared) buckets with
  // summed tallies and distinct-sid union.
  const C2 = (r, s) => ({ r, s });
  const hero2 = [C2(13, "d"), C2(12, "d")], board2 = [C2(14, "h"), C2(9, "c"), C2(3, "s")];
  const keyB = M.equityKey("nit", hero2, board2);
  const rowsB = [
    { k: key, wins: 600, ties: 20, n: 1200, sid: "a" }, { k: key, wins: 580, ties: 25, n: 1200, sid: "b" },
    { k: keyB, wins: 700, ties: 10, n: 1500, sid: "b" }, { k: keyB, wins: 690, ties: 12, n: 1500, sid: "c" },
  ];
  const aggB = aggregateSamples(rowsB);
  const derive = (k) => { const s = keyToSpot(k); return s ? M.bucketKeyOf(s.profId, s.hero, s.board) : null; };
  const bkt = bucketize(aggB, derive);
  const totalN = Object.values(bkt).reduce((s, b) => s + b.n, 0);
  const totalSids = Object.values(bkt).reduce((s, b) => s + b.sids, 0);
  ok("bucketize conserves trials", Math.abs(totalN - 5400) < 1e-6, `n=${totalN}`);
  ok("bucketize unions distinct sids per bucket", Object.keys(bkt).length === 1 ? totalSids === 3 : totalSids === 4, `buckets=${Object.keys(bkt).length}, sids=${totalSids}`);
  ok("bucketize tracks members", Object.values(bkt).reduce((s, b) => s + b.members.length, 0) === 2);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) selfTest();
  else main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
module.exports = { keyToSpot, aggregateSamples, bucketize, passesDemand, decideConfirm, seOf };
