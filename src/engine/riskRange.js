/**
 * Risk Range layer — defensible approximation of the Hedgeye P/V/V band.
 *
 * Three inputs from the daily OHLCV (and our existing lacunarity):
 *   - Volatility  → band width (k · σ widened by clustering)
 *   - Price       → center of band + position within it (range_pos 0..1)
 *   - Volume      → confirmation multiplier (5d/50d ratio)
 *
 * Outputs are emitted on each scan row alongside the existing fractal /
 * conviction / trend fields. The client uses them to synthesize a single
 * Rating (Buy / Add / Hold / Trim / Sell) — see computeRating() in
 * public/kerry-scores.html. The Conviction score answers "do I want this
 * direction"; the Risk Range answers "is this a good price right now."
 *
 * IMPORTANT: This is an APPROXIMATION of Hedgeye's logic, not their closed
 * formula. The value here is combining their entry-timing read with our
 * direction/quality read. Keep them visibly separate so disagreement
 * between them stays legible.
 */

// ───── Tunables (calibrate against acceptance criteria: ~60-70% of
// realized 15-bar forward high/low should fall inside LRR..TRR). ─────
export const RISK_RANGE_CONFIG = {
  TRADE_WINDOW: 15,          // ~3 trading weeks — vol estimate horizon
  BASE_K: 1.5,               // base band multiplier (σ → band half-width)
  LAC_WIDEN_FACTOR: 0.5,     // how much each unit of (Λ - 1) widens the band
  LAC_WIDEN_CAP: 0.75,       // max widening multiplier (capped at +75%)
  VOL_FAST_WINDOW: 5,        // short-term volume average
  VOL_SLOW_WINDOW: 50,       // baseline volume average
  MIN_HISTORY: 50,           // bars required to emit any range
};

function stdev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / n;
  let v = 0;
  for (const x of arr) v += (x - m) ** 2;
  return Math.sqrt(v / (n - 1));
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v) {
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

/**
 * Compute the risk-range fields for a single symbol.
 *
 * @param {Object} daily - { close: number[], volume: number[], ... } from FMP
 * @param {number} lambda - existing lacunarity value from the fractal engine
 * @returns {{
 *   lrr: number|null,
 *   trr: number|null,
 *   range_pos: number|null,
 *   realized_vol: number|null,
 *   vol_ratio: number|null,
 *   band_k: number|null
 * }}
 *
 * Returns all nulls if there's insufficient history or any input is bad —
 * the caller treats this as "no range signal" and the rating logic falls
 * back to conviction-only (HOLD/SELL only, never BUY).
 */
export function computeRiskRange(daily, lambda) {
  const empty = {
    lrr: null, trr: null, range_pos: null,
    realized_vol: null, vol_ratio: null, band_k: null,
  };
  if (!daily || !Array.isArray(daily.close) || !Array.isArray(daily.volume)) return empty;
  const N = daily.close.length;
  if (N < RISK_RANGE_CONFIG.MIN_HISTORY) return empty;

  const W = RISK_RANGE_CONFIG.TRADE_WINDOW;
  if (N < W + 1) return empty;

  // Log returns over the trade window.
  const returns = [];
  for (let i = N - W; i < N; i++) {
    const p0 = daily.close[i - 1];
    const p1 = daily.close[i];
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 <= 0 || p1 <= 0) continue;
    returns.push(Math.log(p1 / p0));
  }
  if (returns.length < W - 2) return empty;

  const sigma = stdev(returns);
  if (!Number.isFinite(sigma) || sigma === 0) return empty;

  // Lacunarity widens the band when volatility is clustering — a break is
  // more likely soon, so we widen the expected trading range. The widen
  // factor saturates at LAC_WIDEN_CAP so a single extreme Λ value can't
  // produce an absurdly wide band.
  const lacExcess = Number.isFinite(lambda) ? Math.max(0, lambda - 1.0) : 0;
  const widen = clamp(
    lacExcess * RISK_RANGE_CONFIG.LAC_WIDEN_FACTOR,
    0,
    RISK_RANGE_CONFIG.LAC_WIDEN_CAP
  );
  const kAdj = RISK_RANGE_CONFIG.BASE_K * (1 + widen);

  // Band centered on the most recent close. (Alternative: 9-day EMA — see
  // calibration note in the spec; we go with last close because it's the
  // anchor traders see on their screens.)
  const price = daily.close[N - 1];
  if (!Number.isFinite(price) || price <= 0) return empty;
  const halfWidth = price * sigma * kAdj;
  const lrr = price - halfWidth;
  const trr = price + halfWidth;

  // range_pos: 0 = at LRR (buy zone), 1 = at TRR (sell zone). For
  // computing today's location we just use the current price, which by
  // construction sits at center → range_pos = 0.5. The interesting case
  // is intraday/next-day — but at scan time it's always mid-band. We
  // still emit it for consistency and so a custom-ticker analyzed mid-day
  // (when the price has moved off close) shows the right value.
  const rangePos = clamp((price - lrr) / (trr - lrr), 0, 1);

  // Volume confirmation: 5-day avg vs 50-day avg. >1.2 = participation
  // confirming whatever direction the price is taking; <0.8 = thin /
  // suspect / unlikely to sustain.
  const fastW = Math.min(RISK_RANGE_CONFIG.VOL_FAST_WINDOW, N);
  const slowW = Math.min(RISK_RANGE_CONFIG.VOL_SLOW_WINDOW, N);
  const volFast = daily.volume.slice(N - fastW)
    .filter(v => Number.isFinite(v) && v >= 0);
  const volSlow = daily.volume.slice(N - slowW)
    .filter(v => Number.isFinite(v) && v >= 0);
  const fastAvg = mean(volFast);
  const slowAvg = mean(volSlow);
  const volRatio = (slowAvg > 0 && Number.isFinite(fastAvg))
    ? fastAvg / slowAvg
    : null;

  return {
    lrr: round4(lrr),
    trr: round4(trr),
    range_pos: round4(rangePos),
    realized_vol: round4(sigma),
    vol_ratio: volRatio != null ? round4(volRatio) : null,
    band_k: round4(kAdj),
  };
}
