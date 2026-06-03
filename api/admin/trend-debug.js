/**
 * Admin debug endpoint — dumps raw FMP price history + independently
 * computed SMAs for a single symbol. Used to verify whether the page's
 * SMA values match the underlying data, or whether FMP is returning
 * something weird (split-adjustment glitches, zero closes, gaps, etc.).
 *
 *   GET /api/admin/trend-debug?symbol=DELL
 *
 * Auth: Bearer ${CRON_SECRET}, same as /api/admin/rescan.
 *
 * Returns:
 *   {
 *     symbol, bars_count, oldest_date, newest_date, newest_close,
 *     min_close, max_close, zero_close_count, null_close_count,
 *     sma_15, sma_62, sma_200,                  // independently recomputed
 *     last_20_closes: [{date, close}, ...],     // for eyeballing recent moves
 *     first_5_closes: [{date, close}, ...],     // for split-adjustment check
 *     suspicious: { ... }                       // flags any obvious anomalies
 *   }
 */

import { fetchDailyOHLCV } from '../../src/server/kerry-scoring.js';

const FMP_KEY = process.env.FMP_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sma(arr, period) {
  if (!Array.isArray(arr) || arr.length < period) return null;
  let s = 0;
  for (let i = arr.length - period; i < arr.length; i++) s += arr[i];
  return s / period;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const authHeader = req.headers.authorization || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!FMP_KEY) return res.status(500).json({ error: 'FMP_KEY not configured' });

  const symbol = String(req.query.symbol || '').toUpperCase().trim();
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'invalid symbol' });
  }

  const fetched = await fetchDailyOHLCV(symbol, FMP_KEY);
  if (fetched.error) return res.status(502).json({ error: fetched.error });

  const closes = fetched.daily.close;
  const dates = fetched.daily.date;
  const n = closes.length;

  // Independent SMA recompute (same algorithm as the engine, so we're
  // verifying the data into the engine — not the engine itself).
  const sma15 = sma(closes, 15);
  const sma62 = sma(closes, 62);
  const sma200 = sma(closes, 200);

  const last20 = [];
  for (let i = Math.max(0, n - 20); i < n; i++) {
    last20.push({ date: dates[i], close: closes[i] });
  }
  const first5 = [];
  for (let i = 0; i < Math.min(5, n); i++) {
    first5.push({ date: dates[i], close: closes[i] });
  }

  // Anomaly detection.
  let zeros = 0, nulls = 0;
  let min = Infinity, max = -Infinity, minDate = null, maxDate = null;
  for (let i = 0; i < n; i++) {
    const c = closes[i];
    if (c === 0) zeros++;
    if (c == null) nulls++;
    if (Number.isFinite(c)) {
      if (c < min) { min = c; minDate = dates[i]; }
      if (c > max) { max = c; maxDate = dates[i]; }
    }
  }

  // Heuristic anomaly flags.
  const suspicious = {};
  if (zeros > 0) suspicious.zero_closes = `${zeros} day(s) had close=0 — would pollute SMAs`;
  if (nulls > 0) suspicious.null_closes = `${nulls} day(s) had null close`;
  const newestClose = closes[n - 1];
  if (Number.isFinite(newestClose) && Number.isFinite(min) && newestClose > 5 * min) {
    suspicious.large_range = `newest close $${newestClose.toFixed(2)} is >5× lowest close $${min.toFixed(2)} on ${minDate} — possible split or extreme rally`;
  }
  // Gap detection: any day-over-day move > 50% suggests a split or
  // bad data. (Real-world gaps even on takeover news rarely exceed 30%.)
  const bigGaps = [];
  for (let i = 1; i < n; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(curr)) {
      const gap = (curr - prev) / prev;
      if (Math.abs(gap) > 0.5) {
        bigGaps.push({
          date: dates[i],
          prev_close: prev,
          close: curr,
          gap_pct: Math.round(gap * 10000) / 100,
        });
      }
    }
  }
  if (bigGaps.length > 0) suspicious.big_gaps = bigGaps.slice(0, 10);

  return res.status(200).json({
    symbol,
    bars_count: n,
    oldest_date: dates[0],
    newest_date: dates[n - 1],
    newest_close: newestClose,
    min_close: Number.isFinite(min) ? min : null,
    min_date: minDate,
    max_close: Number.isFinite(max) ? max : null,
    max_date: maxDate,
    zero_close_count: zeros,
    null_close_count: nulls,
    sma_15: sma15,
    sma_62: sma62,
    sma_200: sma200,
    first_5_closes: first5,
    last_20_closes: last20,
    suspicious,
  });
}
