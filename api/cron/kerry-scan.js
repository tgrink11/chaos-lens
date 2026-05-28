/**
 * Kerry's Tell Sheet + Watchlist daily scan.
 *
 * Triggered by Vercel cron at 22:00 UTC weekdays (≈ 2h after US market close).
 * Reads symbols from a public Google Sheet, runs the chaos-lens engine on
 * each, and upserts results into the `kerry_scores` Supabase table.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` (Vercel cron sets this
 * automatically when `CRON_SECRET` is configured in project env vars).
 */

import { runFractalAnalysis } from '../../src/engine/fractals.js';
import { runBehavioralAnalysis } from '../../src/engine/behavioral.js';
import { classifyMood } from '../../src/engine/mood.js';
import { findAnalogs } from '../../src/engine/analogs.js';
import { predictBreak, predictHorizons } from '../../src/engine/prediction.js';
import { computeTrend } from '../../src/engine/trend.js';
import { computeConviction } from '../../src/engine/conviction.js';

const SHEET_ID = process.env.KERRY_SHEET_ID;
const SHEET_GID = process.env.KERRY_SHEET_GID || '0';

// Ranges agreed with the sheet maintainer:
//   - Tell Sheet:  A5:A58
//   - Watchlist:   A73:A148  AND  A160:A163
const RANGES = {
  tellsheet: ['A5:A58'],
  watchlist: ['A73:A148', 'A160:A163'],
};

const FMP_KEY = process.env.FMP_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CHAOS_LENS_URL = process.env.CHAOS_LENS_URL || ''; // e.g. https://chaos-lens.vercel.app
const CRON_SECRET = process.env.CRON_SECRET;

// Trent's Investment Research — separate Supabase project (read-only).
// Anon key is safe to embed; RLS gates writes. Used to pull research tickers
// so they get fractal-scored alongside Tell Sheet + Watchlist.
const BUS_RESEARCH_URL = 'https://eerrybamcwhqgzjssjby.supabase.co/rest/v1/research_entries?select=symbol';
const BUS_RESEARCH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcnJ5YmFtY3docWd6anNzamJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDczNDcsImV4cCI6MjA5MjcyMzM0N30.DPqAPuHXkdrFKiJfzxzu0rQ_Pu2kgLuAZijllAgP640';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

// How many prior days of conviction to retain on each row. Showing 5 in the
// UI; storing 5 means tomorrow's scan can prepend today's value and drop the
// oldest without losing anything the UI displays today.
const CONVICTION_HISTORY_DEPTH = 5;

/**
 * Fetch a column range from the sheet via Google's gviz endpoint, which
 * preserves the user's row numbering (unlike the CSV export, which splits
 * multi-line cells across multiple lines).
 */
async function fetchSheetRange(range) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&range=${range}&tqx=out:csv`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Sheet fetch ${range}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .map(line => line.replace(/^"|"$/g, '').trim())
    .filter(s => /^[A-Z]{1,5}$/.test(s));
}

async function loadSymbols() {
  const out = {};
  for (const [listType, ranges] of Object.entries(RANGES)) {
    const all = [];
    for (const r of ranges) {
      const tickers = await fetchSheetRange(r);
      all.push(...tickers);
    }
    out[listType] = [...new Set(all)]; // dedupe within list
  }
  return out;
}

/**
 * Pull ticker symbols from Trent's Investment Research Supabase. Returns an
 * uppercase, deduped array. Soft-fails: if the fetch breaks for any reason,
 * we log and return [] so the Tell Sheet + Watchlist scan still runs.
 */
async function loadBusResearchSymbols() {
  try {
    const resp = await fetch(BUS_RESEARCH_URL, {
      headers: { apikey: BUS_RESEARCH_KEY, Authorization: `Bearer ${BUS_RESEARCH_KEY}` },
    });
    if (!resp.ok) {
      console.warn(`BUS! Research fetch failed: ${resp.status}`);
      return [];
    }
    const rows = await resp.json();
    return [...new Set(rows
      .map(r => String(r?.symbol || '').toUpperCase().trim())
      .filter(s => /^[A-Z]{1,5}$/.test(s)))];
  } catch (e) {
    console.warn('BUS! Research fetch error:', e.message);
    return [];
  }
}

/**
 * Fetch daily OHLCV from FMP. The most recent close serves as the price
 * column — no separate /quote call is needed. The /quote endpoint is
 * rate-limited more aggressively than /historical-price-full on FMP free
 * tiers, and our throttled-queue workaround still returned null prices,
 * so the simpler and more reliable path is to read the last historical
 * close directly.
 */
async function fetchDailyOHLCV(symbol) {
  const from = isoDateOffset(-730);
  const to = isoDateOffset(0);
  // Migrated from v3/historical-price-full (deprecated for accounts created
  // after Aug 31, 2025) to /stable/historical-price-eod/full.
  const histUrl = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${FMP_KEY}`;

  const histResp = await fetch(histUrl).catch(() => null);
  if (!histResp?.ok) return null;
  const histData = await histResp.json().catch(() => null);
  const historical = histData?.historical || histData;
  if (!Array.isArray(historical) || historical.length === 0) return null;

  const sorted = [...historical].sort((a, b) => new Date(a.date) - new Date(b.date));
  const daily = {
    date: sorted.map(d => d.date),
    open: sorted.map(d => parseFloat(d.open) || 0),
    high: sorted.map(d => parseFloat(d.high) || 0),
    low: sorted.map(d => parseFloat(d.low) || 0),
    close: sorted.map(d => parseFloat(d.close) || parseFloat(d.adjClose) || 0),
    volume: sorted.map(d => parseFloat(d.volume) || 0),
  };

  // Most recent close serves as the displayed price.
  const lastClose = daily.close[daily.close.length - 1];
  const price = Number.isFinite(lastClose) && lastClose > 0
    ? Math.round(lastClose * 100) / 100
    : null;

  return { daily, price };
}

function isoDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Score a single symbol end-to-end. Returns a row ready to upsert,
 * or null if data is insufficient. `prevHistory` is the existing row's
 * conviction_history array (newest first) — used by computeTrend to
 * detect accumulation/breakout transitions.
 */
async function scoreSymbol(symbol, listType, prevHistory) {
  const fetched = await fetchDailyOHLCV(symbol);
  if (!fetched?.daily?.close?.length || fetched.daily.close.length < 60) {
    return null;
  }
  const { daily, price } = fetched;

  const fractalResults = runFractalAnalysis({ daily, hourly: null, fiveMin: null });
  const primary = fractalResults?.primary;
  if (!primary?.hurst?.H) return null;

  const behavioralResults = runBehavioralAnalysis(daily, 'stock', null);
  const moodResult = classifyMood(fractalResults, behavioralResults, daily.close);
  const predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, daily.close);

  // Build a 20-day-default analog set for UI parity with the live chaos-lens
  // app. predictHorizons internally computes 15-day and 62-day analog sets
  // matched to each horizon (see Fix #5).
  const currentSignature = {
    H: primary.hurst.H,
    D: primary.boxDim.D,
    lambda: primary.lacunarity.lambda,
  };
  const analogResults = findAnalogs(daily.close, currentSignature);

  const horizonResults = predictHorizons(
    fractalResults, behavioralResults, moodResult, analogResults, daily.close
  );

  const topReason = predictionResult.reasoning?.[0] || null;
  const chaosUrl = CHAOS_LENS_URL
    ? `${CHAOS_LENS_URL}/?symbol=${encodeURIComponent(symbol)}&type=stock`
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

  // Trend + setup. Today's conviction is derived from the row we just
  // built; prevHistory (newest-first) is the existing row's stored history.
  const todayConv = computeConviction(partial);
  const trend = computeTrend(daily.close, todayConv, prevHistory || []);

  return {
    ...partial,
    sma_9: trend.sma9,
    sma_15: trend.sma15,
    sma_62: trend.sma62,
    sma_200: trend.sma200,
    setup: trend.setup,
  };
}

function round3(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(v * 1000) / 1000
    : null;
}

/**
 * Fetch the existing rows (before this scan overwrites them) so we can carry
 * forward the conviction history. Returns a map of symbol → existing row.
 */
async function fetchExistingScores() {
  const params = new URLSearchParams({
    select: 'symbol,short_term_direction,short_term_confidence,medium_term_direction,medium_term_confidence,prediction,prediction_confidence,mood,box_dim,scanned_at,conviction_history',
  });
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/kerry_scores?${params}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!resp.ok) return new Map(); // first-ever scan, table empty — fine
  const rows = await resp.json().catch(() => []);
  const map = new Map();
  for (const row of rows) map.set(row.symbol, row);
  return map;
}

/**
 * Build the conviction_history array for a fresh row by prepending the
 * previously-scanned row's conviction (computed from its stored fields)
 * to the existing history, then capping at CONVICTION_HISTORY_DEPTH.
 *
 * Each entry: { date: 'YYYY-MM-DD', value: <conviction> }.
 *
 * `date` is the date of the previous scan (the day that value applies to),
 * not today — today's conviction is computed on the fly by the UI from the
 * row's current fields, exactly like before.
 */
function buildConvictionHistory(existingRow) {
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
  return [{ date: prevDate, value: prevConv }, ...prevHistory].slice(0, CONVICTION_HISTORY_DEPTH);
}

/**
 * Upsert a batch of rows to Supabase via PostgREST.
 * Uses `resolution=merge-duplicates` so existing rows update in place.
 */
async function upsertScores(rows) {
  if (rows.length === 0) return { ok: true };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/kerry_scores`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase upsert failed: ${resp.status} ${text}`);
  }
  return { ok: true };
}

/**
 * Score a list of symbols with controlled concurrency. Mirrors the pacing
 * used by ScreenerTab so we don't trip FMP rate limits.
 */
async function scoreInBatches(symbols, listType, existing) {
  const scored = [];
  let failCount = 0;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(sym => {
        const prevHistory = existing?.get(sym)?.conviction_history || [];
        return scoreSymbol(sym, listType, prevHistory);
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) scored.push(r.value);
      else failCount++;
    }
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { scored, failCount };
}

export default async function handler(req, res) {
  // Auth gate. Vercel cron automatically sends Authorization: Bearer
  // ${CRON_SECRET} when CRON_SECRET is set on the project.
  const authHeader = req.headers.authorization || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SHEET_ID || !FMP_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: 'Missing required env vars',
      need: ['KERRY_SHEET_ID', 'FMP_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    });
  }

  const startedAt = Date.now();
  try {
    const lists = await loadSymbols();

    // BUS! Research tickers that aren't already on Tell Sheet or Watchlist —
    // those are the ones missing from the scan. Tickers already on one of the
    // two lists get scored under their existing list_type (no double-scoring).
    const busAll = await loadBusResearchSymbols();
    const tellSet = new Set(lists.tellsheet);
    const watchSet = new Set(lists.watchlist);
    const busOnly = busAll.filter(s => !tellSet.has(s) && !watchSet.has(s));

    const totals = {
      tellsheet: lists.tellsheet.length,
      watchlist: lists.watchlist.length,
      bus_research_total: busAll.length,
      bus_research_only: busOnly.length,
    };

    // Snapshot existing rows BEFORE scoring so we can carry forward each
    // symbol's prior conviction into the new row's history column.
    const existing = await fetchExistingScores();

    // Score all three lists. Tell Sheet first (smaller, and most-watched).
    // Pass the `existing` map so each row's prior conviction_history is
    // available to computeTrend for accumulation/breakout detection.
    const tellResult = await scoreInBatches(lists.tellsheet, 'tellsheet', existing);
    const watchResult = await scoreInBatches(lists.watchlist, 'watchlist', existing);
    const busResult = await scoreInBatches(busOnly, 'bus_research', existing);

    // Attach conviction_history to every newly-scored row.
    const attach = (row) => ({
      ...row,
      conviction_history: buildConvictionHistory(existing.get(row.symbol)),
    });
    const tellRows = tellResult.scored.map(attach);
    const watchRows = watchResult.scored.map(attach);
    const busRows = busResult.scored.map(attach);

    // Upsert all results in one round-trip per list to avoid hammering Supabase.
    await upsertScores(tellRows);
    await upsertScores(watchRows);
    await upsertScores(busRows);

    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      totals,
      tellsheet:    { scored: tellResult.scored.length,  failed: tellResult.failCount },
      watchlist:    { scored: watchResult.scored.length, failed: watchResult.failCount },
      bus_research: { scored: busResult.scored.length,   failed: busResult.failCount },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, elapsedMs: Date.now() - startedAt });
  }
}
