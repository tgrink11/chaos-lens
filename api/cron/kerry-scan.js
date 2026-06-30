/**
 * Kerry's Tell Sheet + Watchlist + BUS! Research daily scan.
 *
 * Triggered by Vercel cron at 22:00 UTC weekdays (≈ 2h after US market close).
 * Reads symbols from a public Google Sheet + Trent's Investment Research
 * Supabase, runs the chaos-lens engine on each, and upserts results into
 * the `kerry_scores` Supabase table.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` (Vercel cron sets this
 * automatically when `CRON_SECRET` is configured in project env vars).
 *
 * Scoring logic itself lives in src/server/kerry-scoring.js so the cron
 * and the on-demand /api/admin/rescan endpoint share one source of truth.
 * Previously the cron returned silent nulls on per-symbol failures; that's
 * how CORZ ended up frozen for 22 days unnoticed. This file now logs and
 * returns precise failure reasons per symbol.
 */

import {
  scoreSymbol,
  upsertScores,
  buildConvictionHistory,
  weekdaysSince,
  STALE_THRESHOLD_WEEKDAYS,
} from '../../src/server/kerry-scoring.js';
import { loadEtfSymbols } from '../../src/server/etf-symbols.js';

const SHEET_ID = process.env.KERRY_SHEET_ID;
const SHEET_GID = process.env.KERRY_SHEET_GID || '0';

// Scan ranges in column A of the Kerry sheet. The Tell Sheet occupies the
// top block, the Watchlist the lower block.
//
// These are deliberately WIDER than the original tight ranges (was tellsheet
// A5:A58, watchlist A73:A148 + A160:A163). When the maintainer inserts rows in
// the sheet, symbols at the bottom of each block get pushed *down* past a tight
// boundary and silently fall out of the nightly scan — that's how EEM/MARA/ZS
// and 8 others froze for 17 weekdays. The headroom below each block absorbs
// future inserts so symbols stop disappearing.
//
// Safe to over-reach: fetchSheetRange() filters every cell through
// /^[A-Z]{1,5}$/, so headers, blanks, and section labels are dropped — only
// real ticker-shaped cells survive. The Tell Sheet block ends before A73, and
// because inserts only push the Watchlist *later*, extending the Tell Sheet
// down to A72 cannot capture a Watchlist name.
const RANGES = {
  tellsheet: ['A5:A72'],
  watchlist: ['A73:A200'],
};

const FMP_KEY = process.env.FMP_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CHAOS_LENS_URL = process.env.CHAOS_LENS_URL || '';
const CRON_SECRET = process.env.CRON_SECRET;

// Trent's Investment Research — separate Supabase project (read-only).
const BUS_RESEARCH_URL = 'https://eerrybamcwhqgzjssjby.supabase.co/rest/v1/research_entries?select=symbol';
const BUS_RESEARCH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcnJ5YmFtY3docWd6anNzamJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDczNDcsImV4cCI6MjA5MjcyMzM0N30.DPqAPuHXkdrFKiJfzxzu0rQ_Pu2kgLuAZijllAgP640';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

// Per-symbol retry. Most cron "failures" are transient FMP rate-limits /
// timeouts during the big batch run — a symbol that fails once almost always
// succeeds a moment later. Without a retry, one hiccup freezes that symbol's
// row until a future scan happens to succeed (the CORZ-stuck-22-days pattern).
// We try each symbol up to MAX_SCORE_ATTEMPTS times with linear backoff.
const MAX_SCORE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

/**
 * Score one symbol, retrying on either a thrown error or an { ok:false }
 * result. Never throws — returns the last { ok:false, error } if all attempts
 * fail, with the attempt count folded into the error string.
 */
async function scoreSymbolWithRetry(sym, listType, prevHistory, env) {
  let lastErr = 'unknown error';
  for (let attempt = 1; attempt <= MAX_SCORE_ATTEMPTS; attempt++) {
    try {
      const r = await scoreSymbol(sym, listType, prevHistory, env);
      if (r.ok) return r;
      lastErr = r.error;
    } catch (e) {
      lastErr = e?.message || String(e);
    }
    if (attempt < MAX_SCORE_ATTEMPTS) {
      console.warn(`[kerry-scan] ${sym} (${listType}) attempt ${attempt}/${MAX_SCORE_ATTEMPTS} failed: ${lastErr} — retrying`);
      await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * attempt));
    }
  }
  return { ok: false, error: `failed after ${MAX_SCORE_ATTEMPTS} attempts: ${lastErr}` };
}

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
    out[listType] = [...new Set(all)];
  }
  return out;
}

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
  if (!resp.ok) return new Map();
  const rows = await resp.json().catch(() => []);
  const map = new Map();
  for (const row of rows) map.set(row.symbol, row);
  return map;
}

/**
 * Score a list of symbols with controlled concurrency. Mirrors the
 * pacing used by ScreenerTab so we don't trip FMP rate limits.
 *
 * Returns { scored, failures } where:
 *   scored:   Array<Object>           — successfully-scored rows (ready to upsert)
 *   failures: Array<{symbol,error}>   — per-symbol failure reasons; logged + returned
 *                                       in the cron response so silent stalls are
 *                                       impossible
 */
async function scoreInBatches(symbols, listType, existing) {
  const scored = [];
  const failures = [];

  const env = { fmpKey: FMP_KEY, chaosLensUrl: CHAOS_LENS_URL };

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (sym) => {
        const prevHistory = existing?.get(sym)?.conviction_history || [];
        const r = await scoreSymbolWithRetry(sym, listType, prevHistory, env);
        return { sym, r };
      })
    );
    for (const settled of results) {
      if (settled.status !== 'fulfilled') {
        failures.push({ symbol: '<unknown>', error: `Promise rejected: ${settled.reason}` });
        continue;
      }
      const { sym, r } = settled.value;
      if (r.ok) {
        scored.push(r.row);
      } else {
        failures.push({ symbol: sym, error: r.error });
        // Loud per-symbol log so the failure shows up in Vercel function
        // logs. The previous silent-null pattern is what hid CORZ.
        console.warn(`[kerry-scan] ${sym} (${listType}) failed: ${r.error}`);
      }
    }
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { scored, failures };
}

/**
 * After the upsert, scan kerry_scores for rows whose scanned_at is more
 * than STALE_THRESHOLD_WEEKDAYS weekdays behind. These are symbols the
 * cron has been silently failing on (or were never re-attempted after a
 * one-off issue). Surfaces them in the cron response so the next manual
 * /api/admin/rescan call can target them.
 */
async function findStaleRows() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/kerry_scores?select=symbol,list_type,scanned_at&order=scanned_at.asc&limit=500`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!resp.ok) return [];
  const rows = await resp.json().catch(() => []);
  const now = new Date().toISOString();
  return rows
    .map(r => ({
      symbol: r.symbol,
      list_type: r.list_type,
      scanned_at: r.scanned_at,
      weekdaysOld: weekdaysSince(r.scanned_at, now),
    }))
    .filter(r => r.weekdaysOld > STALE_THRESHOLD_WEEKDAYS);
}

export default async function handler(req, res) {
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
    const busAll = await loadBusResearchSymbols();
    // ETF category — loaded live from the ETF Google Sheet (see
    // src/server/etf-symbols.js). A symbol lives in exactly one category —
    // kerry_scores is keyed on symbol — so ETF tickers are removed from the
    // Tell Sheet / Watchlist / BUS! sets and scored only as 'etf'.
    const etfList = await loadEtfSymbols();
    const etfSet = new Set(etfList);
    const tellsheet = lists.tellsheet.filter(s => !etfSet.has(s));
    const watchlist = lists.watchlist.filter(s => !etfSet.has(s));
    const tellSet = new Set(tellsheet);
    const watchSet = new Set(watchlist);
    const busOnly = busAll.filter(s => !tellSet.has(s) && !watchSet.has(s) && !etfSet.has(s));

    const totals = {
      tellsheet: tellsheet.length,
      watchlist: watchlist.length,
      etf: etfList.length,
      bus_research_total: busAll.length,
      bus_research_only: busOnly.length,
    };

    const existing = await fetchExistingScores();

    const tellResult = await scoreInBatches(tellsheet, 'tellsheet', existing);
    const watchResult = await scoreInBatches(watchlist, 'watchlist', existing);
    const etfResult = await scoreInBatches(etfList, 'etf', existing);
    const busResult = await scoreInBatches(busOnly, 'bus_research', existing);

    const attach = (row) => ({
      ...row,
      conviction_history: buildConvictionHistory(existing.get(row.symbol)),
    });
    const tellRows = tellResult.scored.map(attach);
    const watchRows = watchResult.scored.map(attach);
    const etfRows = etfResult.scored.map(attach);
    const busRows = busResult.scored.map(attach);

    await upsertScores(tellRows, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    await upsertScores(watchRows, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    await upsertScores(etfRows, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    await upsertScores(busRows, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });

    // Post-scan staleness audit. Any row still >3 weekdays old means
    // the cron silently failed on it (either tonight or on previous runs).
    const staleRows = await findStaleRows();
    if (staleRows.length > 0) {
      console.warn(`[kerry-scan] ${staleRows.length} stale rows after upsert:`, staleRows.slice(0, 10));
    }

    // Self-healing auto-sweep. Re-score the stale rows (grouped by their
    // existing list_type) using the same retrying scorer, then upsert the
    // successes. This is the backstop that stops a symbol from silently
    // freezing for weeks even if the retry above didn't catch it tonight.
    const sweepResult = { found: staleRows.length, scored: 0, failures: [] };
    if (staleRows.length > 0) {
      const byList = {};
      for (const r of staleRows) (byList[r.list_type] ||= []).push(r.symbol);
      const sweptRows = [];
      for (const [lt, syms] of Object.entries(byList)) {
        const res = await scoreInBatches(syms, lt, existing);
        sweptRows.push(...res.scored.map(attach));
        sweepResult.failures.push(...res.failures.map(f => ({ ...f, list_type: lt })));
      }
      if (sweptRows.length > 0) {
        await upsertScores(sweptRows, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
      }
      sweepResult.scored = sweptRows.length;
      console.warn(`[kerry-scan] auto-sweep re-scored ${sweepResult.scored}/${staleRows.length} stale rows; ${sweepResult.failures.length} still failing`);
    }

    const allFailures = [
      ...tellResult.failures.map(f => ({ ...f, list_type: 'tellsheet' })),
      ...watchResult.failures.map(f => ({ ...f, list_type: 'watchlist' })),
      ...etfResult.failures.map(f => ({ ...f, list_type: 'etf' })),
      ...busResult.failures.map(f => ({ ...f, list_type: 'bus_research' })),
      ...sweepResult.failures.map(f => ({ ...f, swept: true })),
    ];

    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      totals,
      tellsheet:    { scored: tellResult.scored.length,  failed: tellResult.failures.length },
      watchlist:    { scored: watchResult.scored.length, failed: watchResult.failures.length },
      etf:          { scored: etfResult.scored.length,   failed: etfResult.failures.length },
      bus_research: { scored: busResult.scored.length,   failed: busResult.failures.length },
      failures: allFailures, // every per-symbol failure with reason
      stale: {
        count: staleRows.length,
        threshold_weekdays: STALE_THRESHOLD_WEEKDAYS,
        symbols: staleRows.slice(0, 50), // cap at 50 to keep response tidy
      },
      sweep: {
        found: sweepResult.found,            // stale rows detected this run
        healed: sweepResult.scored,          // re-scored + upserted successfully
        stillFailing: sweepResult.failures.length,
        stillFailingSymbols: sweepResult.failures.map(f => f.symbol).slice(0, 50),
      },
    });
  } catch (e) {
    console.error('[kerry-scan] top-level error:', e);
    return res.status(500).json({ error: e.message, elapsedMs: Date.now() - startedAt });
  }
}
