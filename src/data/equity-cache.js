// Board-specific equity cache: canonical spot key -> equity of the hero's hand
// vs a profile's shove range on that exact (suit-isomorphic) board. Populated by
// the aggregator from pooled ll_equity_samples and shipped read-only; grading
// consults it only when EQUITY_CACHE_LIVE flips on (shadow until Stats sign-off).
// Empty until the first aggregation run lands confirmed entries.
export const EQUITY_CACHE = {};
