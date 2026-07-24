// Background equity worker: runs the Monte-Carlo scorer off the main thread so
// sampling never janks the UI. Compute only — no network. The page posts a spot,
// the worker posts back raw {wins, ties, n}; the page computes the canonical key
// and submits (keeping the one connect-src surface on the main thread).
import { mcEquity } from "./mc-engine.js";

self.onmessage = (e) => {
  const d = e.data || {};
  try {
    const r = mcEquity(d.heroCards, d.board, d.jamRep, d.iters);
    if (r) self.postMessage({ id: d.id, wins: r.wins, ties: r.ties, n: r.n });
    else self.postMessage({ id: d.id, err: "no-result" });
  } catch (err) {
    self.postMessage({ id: d.id, err: String((err && err.message) || err) });
  }
};
