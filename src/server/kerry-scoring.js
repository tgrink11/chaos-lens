/**
 * Kerry scoring — SHARED server-side module.
 *
 * One physical file consumed by:
 *   - api/cron/kerry-scan.js  (nightly batch scan of Kerry's full list)
 *   - api/admin/rescan.js     (on-demand re-scoring of one or many symbols)
 *
 * Same pattern as public/rating-logic.js: single source of truth so the
 * cron's nightly output and an admin rescan can't drift apart. If you
 * tune scoring math here, both surfaces update on the next deploy.
 *
 * scoreSymbol() returns a structured result with explicit success/failure
 * reasons (was previously {row}|null in the cron, which silently swallowed
 * the *reason* a symbol failed — that's how CORZ ended up frozen for 22
 * days unnoticed).
 */

import { runFractalAnalysis } from '../engine/fractals.js';
import { runBehavioralAnalysis } from '../engine/behavioral.js';
import { classifyMood } from '../engine/mood.js';
import { findAnalogs } from '../engine/analogs.js';
import { predictBreak, predictHorizons } from '../engine/prediction.js';
import { computeTrend } from '../engine/trend.js';
import { computeConviction } from '../engine/conviction.js';
import { computeRiskRange } from '../engine/riskRange.js';

const MIN_BARS_FOR_SCORE = 60;

function isoDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function round3(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(v * 1000) / 1000
    : null;
}

/**
 * Fetch 2 years of daily OHLCV from FMP for a single symbol. Returns
 * { daily, price } on success or { error: 'reason' } on failure so the
 * caller can surface the precise failure cause to logs/users instead of
 * the silent-null pattern that hid CORZ's 22-day stall.
 *
 * @param {string} symbol
 * @param {string} fmpKey
 */
export async function fetchDailyOHLCV(symbol, fmpKey) {
  if (!fmpKey) return { error: 'FMP_KEY not configured' };
  const from = isoDateOffset(-730);
  const to = isoDateOffset(0);
  // Migrated from v3 to /stable/ (v3 deprecated Aug 31, 2025 for new accounts).
  const histUrl = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${fmpKey}`;

  let resp;
  try {
    resp = await fetch(histUrl);
  } catch (e) {
    return { error: `FMP fetch threw: ${e.message}` };
  }
  if (!resp.ok) return { error: `FMP returned HTTP ${resp.status}` };

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return { error: `FMP returned unparseable JSON: ${e.message}` };
  }

  const historical = data?.historical || data;
  if (!Array.isArray(historical)) {
    return { error: `FMP returned non-array payload (keys: ${data ? Object.keys(data).join(',') : 'null'})` };
  }
  if (historical.length === 0) {
    return { error: 'FMP returned empty historical array — symbol may be unrecognized or delisted' };
  }

  const sorted = [...historical].sort((a, b) => new Date(a.date) - new Date(b.date));
  const daily = {
    date: sorted.map(d => d.date),
    open: sorted.map(d => parseFloat(d.open) || 0),
    high: sorted.map(d => parseFloat(d.high) || 0),
    low: sorted.map(d => parseFloat(d.low) || 0),
    close: sorted.map(d => parseFloat(d.close) || parseFloat(d.adjClose) || 0),
    volume: sorted.map(d => parseFloat(d.volume) || 0),
  };

  const lastClose = daily.close[daily.close.length - 1];
  const price = Number.isFinite(lastClose) && lastClose > 0
    ? Math.round(lastClose * 100) / 100
    : null;

  if (price == null) {
    return { error: 'last close in FMP history was zero or non-numeric' };
  }

  return { daily, price };
}

/**
 * Score a single symbol end-to-end. Returns:
 *   { ok: true, row }                  — fully scored, ready to upsert
 *   { ok: false, error: 'reason' }    — failed; reason surfaces upstream
 *
 * Notes:
 *   - `prevHistory` is the existing kerry_scores row's conviction_history
 *     array (newest first). Used by computeTrend for ACCUMULATING /
 *     BREAKOUT detection. Empty array is fine for first-time scoring.
 *   - `chaosLensUrl` is optional — only used to build the
 *     `chaos_lens_url` field for table click-throughs.
 *
 * @param {string} symbol
 * @param {string} listType
 * @param {Array} prevHistory
 * @param {{fmpKey:string, chaosLensUrl?:string}} env
 */
export async function scoreSymbol(symbol, listType, prevHistory, env) {
  const fetched = await fetchDailyOHLCV(symbol, env.fmpKey);
  if (fetched.error) {
    return { ok: false, error: `fetchDailyOHLCV: ${fetched.error}` };
  }
  if (!fetched.daily?.close?.length || fetched.daily.close.length < MIN_BARS_FOR_SCORE) {
    return {
      ok: false,
      error: `insufficient bars from FMP (${fetched.daily?.close?.length || 0} < ${MIN_BARS_FOR_SCORE})`,
    };
  }
  const { daily, price } = fetched;

  let fractalResults;
  try {
    fractalResults = runFractalAnalysis({ daily, hourly: null, fiveMin: null });
  } catch (e) {
    return { ok: false, error: `runFractalAnalysis threw: ${e.message}` };
  }
  const primary = fractalResults?.primary;
  if (!primary?.hurst?.H) {
    return { ok: false, error: 'fractal analysis returned no Hurst value' };
  }

  let behavioralResults, moodResult, predictionResult, analogResults, horizonResults;
  try {
    behavioralResults = runBehavioralAnalysis(daily, 'stock', null);
    moodResult = classifyMood(fractalResults, behavioralResults, daily.close);
    predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, daily.close);
    const currentSignature = {
      H: primary.hurst.H,
      D: primary.boxDim.D,
      lambda: primary.lacunarity.lambda,
    };
    analogResults = findAnalogs(daily.close, currentSignature);
    horizonResults = predictHorizons(
      fractalResults, behavioralResults, moodResult, analogResults, daily.close
    );
  } catch (e) {
    return { ok: false, error: `downstream analysis threw: ${e.message}` };
  }

  const topReason = predictionResult.reasoning?.[0] || null;
  const chaosUrl = env.chaosLensUrl
    ? `${env.chaosLensUrl}/?symbol=${encodeURIComponent(symbol)}&type=stock`
    : null;

  const partial = {
    symbol,
    list_type: listType,
    name: null,
    price,
    short_term_direction: horizonResults.shortTerm.direction,
    short_term_confidence: horizonResults.shortTerm.confidence,
    medium_term_direction: horizonResults.mediumTerm.direction,
    medium_term_confidence: horizonResults.mediumTerm.confidence,
    prediction: predictionResult.prediction.key,
    prediction_confidence: predictionResult.confidence,
    prediction_reasoning: topReason,
    mood: moodResult.mood.key,
    hurst: round3(primary.hurst.H),
    box_dim: round3(primary.boxDim.D),
    lambda: round3(primary.lacunarity.lambda),
    chaos_lens_url: chaosUrl,
    scanned_at: new Date().toISOString(),
  };

  // Trend + setup + risk range. These are the fields that were NULL in
  // CORZ's stuck row — explicit try/catch so a transient failure here
  // doesn't poison the entire row (it'd surface as a clear error string
  // instead of vanishing).
  let trend, risk;
  try {
    const todayConv = computeConviction(partial);
    trend = computeTrend(daily.close, todayConv, prevHistory || []);
    risk = computeRiskRange(daily, primary.lacunarity.lambda);
  } catch (e) {
    return { ok: false, error: `trend/risk-range compute threw: ${e.message}` };
  }

  const row = {
    ...partial,
    sma_9: trend.sma9,
    sma_15: trend.sma15,
    sma_62: trend.sma62,
    sma_200: trend.sma200,
    setup: trend.setup,
    lrr: risk.lrr,
    trr: risk.trr,
    range_pos: risk.range_pos,
    realized_vol: risk.realized_vol,
    vol_ratio: risk.vol_ratio,
    band_k: risk.band_k,
  };

  return { ok: true, row };
}

/**
 * Upsert a batch of rows to Supabase via PostgREST.
 * Uses `resolution=merge-duplicates` so existing rows update in place.
 *
 * @param {Array<Object>} rows
 * @param {{supabaseUrl:string, supabaseKey:string}} env
 */
export async function upsertScores(rows, env) {
  if (!rows.length) return { ok: true, count: 0 };
  const resp = await fetch(`${env.supabaseUrl}/rest/v1/kerry_scores`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseKey,
      Authorization: `Bearer ${env.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase upsert failed: ${resp.status} ${text}`);
  }
  return { ok: true, count: rows.length };
}

/**
 * Build the conviction_history array for a fresh row by prepending the
 * previously-scanned row's conviction (computed from its stored fields)
 * to the existing history, then capping at the depth limit.
 *
 * `existingRow` is the row as it existed BEFORE this scan overwrote it.
 * `historyDepth` defaults to 5.
 */
export function buildConvictionHistory(existingRow, historyDepth = 5) {
  if (!existingRow) return [];
  const prevConv = computeConviction(existingRow);
  if (!Number.isFinite(prevConv)) return existingRow.conviction_history || [];
  const prevDate = existingRow.scanned_at
    ? String(existingRow.scanned_at).split('T')[0]
    : null;
  const prevHistory = Array.isArray(existingRow.conviction_history)
    ? existingRow.conviction_history
    : [];
  // Don't double-record if today's scan ran twice (e.g. manual + cron).
  if (prevDate && prevHistory[0]?.date === prevDate) return prevHistory;
  return [{ date: prevDate, value: prevConv }, ...prevHistory].slice(0, historyDepth);
}

/**
 * Compute how many WEEKDAYS old a scanned_at timestamp is, relative to
 * a "now" reference (defaults to current UTC). Weekday-aware so the
 * normal Fri → Mon gap (~72h calendar) only counts as 1 trading day old.
 *
 * Returns a non-negative integer.
 */
export function weekdaysSince(scannedAtIso, nowIso) {
  if (!scannedAtIso) return Infinity;
  const scanMs = new Date(scannedAtIso).getTime();
  const nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (!Number.isFinite(scanMs) || nowMs <= scanMs) return 0;
  // Walk day-by-day, counting only Mon-Fri.
  let cursor = new Date(scanMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(nowMs);
  endDay.setUTCHours(0, 0, 0, 0);
  let weekdays = 0;
  while (cursor.getTime() < endDay.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) weekdays++;
  }
  return weekdays;
}

export const STALE_THRESHOLD_WEEKDAYS = 3;
