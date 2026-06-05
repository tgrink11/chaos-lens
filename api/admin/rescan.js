/**
 * Admin rescan endpoint — force-refresh stuck or stale kerry_scores rows.
 *
 * Why it exists: the nightly cron can silently fail on individual symbols
 * (FMP timeout, ticker change, transient data issue) and leave their rows
 * frozen. CORZ was stuck for 22 days before we noticed. This endpoint
 * lets the operator re-run the exact same scoring logic the cron uses,
 * targeted at one symbol or at every stale row, without waiting for the
 * next 22:00 UTC scheduled run.
 *
 * Auth:
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Usage:
 *   POST /api/admin/rescan?symbol=CORZ
 *     → rescore CORZ only (looks up its list_type from the existing row;
 *       if no row exists, defaults to 'watchlist')
 *
 *   POST /api/admin/rescan?stale=1
 *     → find every row with scanned_at >3 weekdays old, rescore all of them
 *
 *   POST /api/admin/rescan?symbols=AMPX,NOW,CORZ
 *     → rescore a specific comma-separated list (defaults each to watchlist
 *       unless the row already exists with a different list_type)
 *
 * Behavior mirrors the cron exactly: same scoreSymbol function, same
 * upsert path, same conviction_history rollover. So a rescan produces
 * the same row the cron would have produced if it hadn't silently failed.
 *
 * Returns per-symbol results — every success and every failure with a
 * concrete reason. No silent skips.
 */

import {
  scoreSymbol,
  upsertScores,
  buildConvictionHistory,
  weekdaysSince,
  STALE_THRESHOLD_WEEKDAYS,
} from '../../src/server/kerry-scoring.js';
import { loadEtfSet } from '../../src/server/etf-symbols.js';

const FMP_KEY = process.env.FMP_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CHAOS_LENS_URL = process.env.CHAOS_LENS_URL || '';
const CRON_SECRET = process.env.CRON_SECRET;

const ALLOWED_ORIGINS = new Set([
  'https://behavioral-market-agent.vercel.app',
  'https://chaos-lens.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Fetch existing rows for the given symbols so we can preserve list_type
 * + conviction_history when upserting.
 */
async function fetchExistingRows(symbols) {
  if (symbols.length === 0) return new Map();
  const inList = symbols.map(s => `"${s}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/kerry_scores?symbol=in.(${inList})&select=symbol,list_type,scanned_at,conviction_history,short_term_direction,short_term_confidence,medium_term_direction,medium_term_confidence,prediction,prediction_confidence,mood,box_dim`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!resp.ok) return new Map();
  const rows = await resp.json().catch(() => []);
  const map = new Map();
  for (const row of rows) map.set(row.symbol, row);
  return map;
}

/**
 * Find every row with scanned_at older than STALE_THRESHOLD_WEEKDAYS.
 * Used when the caller passes ?stale=1.
 */
async function findStaleSymbols() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/kerry_scores?select=symbol,scanned_at&order=scanned_at.asc&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  const now = new Date().toISOString();
  return rows
    .filter(r => weekdaysSince(r.scanned_at, now) > STALE_THRESHOLD_WEEKDAYS)
    .map(r => r.symbol);
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Auth gate — same secret as the cron.
  const authHeader = req.headers.authorization || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized — supply Authorization: Bearer ${CRON_SECRET}' });
  }

  if (!FMP_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'server not configured (missing FMP_KEY / SUPABASE_*)' });
  }

  // Decide which symbols to rescan.
  const singleSymbol = String(req.query.symbol || '').toUpperCase().trim();
  const symbolsParam = String(req.query.symbols || '').toUpperCase().trim();
  const wantStale = req.query.stale === '1';

  let targets = [];
  let mode;
  if (singleSymbol) {
    if (!/^[A-Z]{1,5}$/.test(singleSymbol)) {
      return res.status(400).json({ error: `invalid symbol: ${singleSymbol}` });
    }
    targets = [singleSymbol];
    mode = 'single';
  } else if (symbolsParam) {
    targets = [...new Set(
      symbolsParam.split(',')
        .map(s => s.trim())
        .filter(s => /^[A-Z]{1,5}$/.test(s))
    )];
    mode = 'list';
    if (targets.length === 0) {
      return res.status(400).json({ error: 'no valid symbols in symbols= param' });
    }
  } else if (wantStale) {
    targets = await findStaleSymbols();
    mode = 'stale';
    if (targets.length === 0) {
      return res.status(200).json({
        ok: true,
        mode,
        message: 'no stale rows found — nothing to rescan',
        scored: 0,
        failed: 0,
      });
    }
  } else {
    return res.status(400).json({
      error: 'specify ?symbol=XXX, ?symbols=A,B,C, or ?stale=1',
    });
  }

  // Cap to prevent accidental full-table rescans through this endpoint.
  // The cron exists for that. 50 is enough for any realistic stale set.
  if (targets.length > 50) {
    return res.status(400).json({
      error: `too many targets (${targets.length}) — admin rescan capped at 50; use the nightly cron for full re-scoring`,
      targets_first10: targets.slice(0, 10),
    });
  }

  const startedAt = Date.now();
  const existing = await fetchExistingRows(targets);
  // Live ETF universe — only needed to categorize a never-scored symbol, so
  // skip the sheet fetch when every target already has a row.
  const needEtfLookup = targets.some(sym => !existing.get(sym));
  const etfSet = needEtfLookup ? await loadEtfSet() : new Set();
  const env = { fmpKey: FMP_KEY, chaosLensUrl: CHAOS_LENS_URL };

  // Run sequentially to keep FMP politely paced — 50 symbols × ~500ms each
  // ≈ 25s, well under the 60s function maxDuration.
  const succeeded = [];
  const failed = [];
  for (const sym of targets) {
    const existingRow = existing.get(sym);
    // Prefer the symbol's existing category. For a never-scored symbol, fall
    // back to 'etf' if it's in the ETF list, otherwise 'watchlist' (the old
    // default). This lets a newly-added ETF be scored on demand with the
    // right list_type instead of waiting for the next nightly cron.
    const listType = existingRow?.list_type || (etfSet.has(sym) ? 'etf' : 'watchlist');
    const prevHistory = existingRow?.conviction_history || [];
    const result = await scoreSymbol(sym, listType, prevHistory, env);
    if (result.ok) {
      const rowWithHistory = {
        ...result.row,
        conviction_history: buildConvictionHistory(existingRow),
      };
      succeeded.push(rowWithHistory);
    } else {
      failed.push({ symbol: sym, error: result.error });
      console.warn(`[admin/rescan] ${sym} failed: ${result.error}`);
    }
  }

  // Upsert all successes in one round-trip.
  let upsertError = null;
  if (succeeded.length > 0) {
    try {
      await upsertScores(succeeded, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    } catch (e) {
      upsertError = e.message;
      console.error('[admin/rescan] upsert error:', e);
    }
  }

  return res.status(upsertError ? 500 : 200).json({
    ok: !upsertError,
    mode,
    elapsedMs: Date.now() - startedAt,
    requested: targets.length,
    scored: succeeded.length,
    failed: failed.length,
    succeededSymbols: succeeded.map(r => ({
      symbol: r.symbol,
      list_type: r.list_type,
      price: r.price,
      sma_62: r.sma_62,
      sma_200: r.sma_200,
      lrr: r.lrr,
      trr: r.trr,
      hurst: r.hurst,
      box_dim: r.box_dim,
      lambda: r.lambda,
    })),
    failures: failed,
    upsertError,
  });
}
