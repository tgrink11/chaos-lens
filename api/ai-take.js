/**
 * On-demand AI verdict for a single Kerry-list symbol.
 *
 *   GET /api/ai-take?symbol=NVDA               → cache hit if <24h old
 *   GET /api/ai-take?symbol=NVDA&refresh=1     → force a fresh call
 *
 * Pipeline mirrors the full chaos-lens report exactly:
 *   1. Validate the symbol is on the Kerry list (limits attack surface).
 *   2. Check the `ai_takes` Supabase table — return cached text if <24h.
 *   3. Fetch 2y of daily OHLCV from FMP and run the same engine stages
 *      (fractals → behavioral → mood → predict → analogs) as the cron does.
 *   4. Build the exact same Claude prompt the chaos-lens app uses, so the
 *      AI verdict is identical to what you'd see in the full report.
 *   5. Call /api/analyze internally (centralized retry/model fallback).
 *   6. Upsert into `ai_takes` and return.
 *
 * Cost guard: 24h cache means a symbol can cost at most one Claude call per
 * day no matter how many clicks. With ~130 Kerry symbols and Sonnet at
 * ~$0.01/call, the theoretical daily ceiling is ~$1.30 even if every
 * symbol gets refreshed.
 */

import { runFractalAnalysis } from '../src/engine/fractals.js';
import { runBehavioralAnalysis } from '../src/engine/behavioral.js';
import { classifyMood } from '../src/engine/mood.js';
import { findAnalogs } from '../src/engine/analogs.js';
import { predictBreak, predictHorizons } from '../src/engine/prediction.js';
import { computeTrend } from '../src/engine/trend.js';
import { computeConviction } from '../src/engine/conviction.js';
import { computeRiskRange } from '../src/engine/riskRange.js';
// Rating logic lives in /public/rating-logic.js — same physical file the
// browser imports from kerry-scores.html. Vercel's bundler walks the
// relative import and includes it in the function bundle. Single source
// of truth across client + server.
import { computeRating } from '../public/rating-logic.js';
import { buildPrompt, SYSTEM_PROMPT } from '../src/api/claude.js';

const FMP_KEY = process.env.FMP_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isoDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function fetchDailyOHLCV(symbol) {
  const from = isoDateOffset(-730);
  const to = isoDateOffset(0);
  // Migrated from v3 to /stable/ (v3 deprecated Aug 31, 2025 for new accounts).
  const histUrl = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${FMP_KEY}`;

  const resp = await fetch(histUrl).catch(() => null);
  if (!resp?.ok) return null;
  const data = await resp.json().catch(() => null);
  const historical = data?.historical || data;
  if (!Array.isArray(historical) || historical.length === 0) return null;

  const sorted = [...historical].sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    date: sorted.map(d => d.date),
    open: sorted.map(d => parseFloat(d.open) || 0),
    high: sorted.map(d => parseFloat(d.high) || 0),
    low: sorted.map(d => parseFloat(d.low) || 0),
    close: sorted.map(d => parseFloat(d.close) || parseFloat(d.adjClose) || 0),
    volume: sorted.map(d => parseFloat(d.volume) || 0),
  };
}

async function callClaude(prompt, host) {
  // Hit our own /api/analyze for retry+fallback logic in one place.
  const base = host ? `https://${host}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://chaos-lens.vercel.app');
  const resp = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1500,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Claude API ${resp.status}`);
  }
  return resp.json();
}

/**
 * Pull H, D, Λ values across the entire kerry_scores table and compute
 * percentile context for the symbol currently being analyzed. Lets the
 * AI prompt say "this stock is at the 90th percentile for Hurst across
 * today's scan" rather than just "Hurst=0.56."
 *
 * Returns null gracefully if Supabase is empty or the fetch fails —
 * the prompt builder handles the missing-context case.
 */
async function fetchPopulationStats(thisH, thisD, thisL) {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/kerry_scores?select=hurst,box_dim,lambda`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) return null;
    const rows = await resp.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const statsFor = (field, thisValue) => {
      const arr = rows.map(r => r[field]).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      if (arr.length === 0) return null;
      const at = (q) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(q * (arr.length - 1))))];
      let lower = 0, equal = 0;
      for (const v of arr) {
        if (v < thisValue) lower++;
        else if (v === thisValue) equal++;
        else break;
      }
      const percentile = Math.round(((lower + 0.5 * equal) / arr.length) * 100);
      return {
        median: at(0.5),
        p10: at(0.10),
        p25: at(0.25),
        p75: at(0.75),
        p90: at(0.90),
        percentile,
      };
    };

    return {
      hurst: statsFor('hurst', thisH),
      box_dim: statsFor('box_dim', thisD),
      lambda: statsFor('lambda', thisL),
    };
  } catch {
    return null;
  }
}

async function readCache(symbol) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_takes?symbol=eq.${symbol}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function writeCache(row) {
  await fetch(`${SUPABASE_URL}/rest/v1/ai_takes`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

// Kerry-list gate removed: subscribers can now run AI takes on any valid
// ticker via the "Analyze any ticker" input on the Kerry's Fractal Scores
// page. Cost containment relies on the 24h Supabase cache + a downstream
// FMP fetch that fails-closed for invalid symbols, so the worst-case
// abuse footprint is one Claude call per unique symbol per day.

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!FMP_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'server not configured' });
  }

  const symbol = String(req.query.symbol || '').toUpperCase().trim();
  const refresh = req.query.refresh === '1';

  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'invalid symbol' });
  }

  // Cache check
  if (!refresh) {
    const cached = await readCache(symbol);
    if (cached?.text) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return res.status(200).json({
          symbol,
          text: cached.text,
          model: cached.model,
          generatedAt: cached.generated_at,
          cached: true,
        });
      }
    }
  }

  // Re-run the engine end-to-end so the prompt is identical to the
  // chaos-lens app's full-report prompt — no skew from drift between
  // the cron's stored values and what the engine would produce today.
  const daily = await fetchDailyOHLCV(symbol);
  if (!daily?.close?.length || daily.close.length < 60) {
    return res.status(503).json({ error: 'insufficient data from FMP' });
  }

  const fractalResults = runFractalAnalysis({ daily, hourly: null, fiveMin: null });
  if (!fractalResults?.primary?.hurst) {
    return res.status(500).json({ error: 'fractal analysis failed' });
  }

  const behavioralResults = runBehavioralAnalysis(daily, 'stock', null);
  const moodResult = classifyMood(fractalResults, behavioralResults, daily.close);
  const predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, daily.close);
  const currentSignature = {
    H: fractalResults.primary.hurst.H,
    D: fractalResults.primary.boxDim.D,
    lambda: fractalResults.primary.lacunarity.lambda,
  };
  const analogResults = findAnalogs(daily.close, currentSignature);

  // Compute trend + setup so the AI prompt includes the SMA ladder and
  // the accumulation/breakout phase label. We need conviction first
  // (built from horizon outputs + mood + D), so run predictHorizons too.
  const horizonResults = predictHorizons(
    fractalResults, behavioralResults, moodResult, analogResults, daily.close
  );
  const todayConvictionInput = {
    short_term_direction: horizonResults.shortTerm.direction,
    short_term_confidence: horizonResults.shortTerm.confidence,
    medium_term_direction: horizonResults.mediumTerm.direction,
    medium_term_confidence: horizonResults.mediumTerm.confidence,
    prediction: predictionResult.prediction.key,
    prediction_confidence: predictionResult.confidence,
    mood: moodResult.mood.key,
    hurst: fractalResults.primary.hurst.H,
    box_dim: fractalResults.primary.boxDim.D,
  };
  const todayConv = computeConviction(todayConvictionInput);

  // Pull existing conviction_history from Supabase if this symbol is on
  // the Kerry list so BREAKOUT/EXTENDED can fire. Non-Kerry symbols just
  // get an empty history (Accum/Up/Down/Neutral still work).
  let prevHistory = [];
  try {
    const histResp = await fetch(
      `${SUPABASE_URL}/rest/v1/kerry_scores?symbol=eq.${symbol}&select=conviction_history&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (histResp.ok) {
      const rows = await histResp.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]?.conviction_history) {
        prevHistory = rows[0].conviction_history;
      }
    }
  } catch { /* best-effort */ }

  const trendResult = computeTrend(daily.close, todayConv, prevHistory);

  // Population context: pull H/D/Λ across the current Kerry scan so the
  // AI sees where this stock ranks against its peers, not just the
  // absolute fractal values (which cluster tightly across US equities).
  const populationStats = await fetchPopulationStats(
    fractalResults.primary.hurst.H,
    fractalResults.primary.boxDim.D,
    fractalResults.primary.lacunarity.lambda
  );

  // Risk Range + Rating. Lets the AI prompt explicitly address entry
  // timing (where price sits in the LRR..TRR band, is volume confirming)
  // and the synthesized BUY/ADD/HOLD/TRIM/SELL/DIP call.
  const riskRange = computeRiskRange(daily, fractalResults.primary.lacunarity.lambda);
  const rating = computeRating({
    _conviction: todayConv,
    price: daily.close[daily.close.length - 1],
    sma_62: trendResult?.sma62,
    sma_200: trendResult?.sma200,
    range_pos: riskRange?.range_pos,
    vol_ratio: riskRange?.vol_ratio,
  });

  const prompt = buildPrompt(
    symbol, 'stock', fractalResults, behavioralResults, moodResult, predictionResult, analogResults, trendResult, populationStats, riskRange, rating
  );

  let claudeResp;
  try {
    claudeResp = await callClaude(prompt, req.headers.host);
  } catch (e) {
    return res.status(502).json({ error: `Claude call failed: ${e.message}` });
  }

  if (!claudeResp?.text) {
    return res.status(502).json({ error: 'empty Claude response' });
  }

  const generatedAt = new Date().toISOString();
  await writeCache({
    symbol,
    text: claudeResp.text,
    model: claudeResp.model || null,
    generated_at: generatedAt,
  });

  return res.status(200).json({
    symbol,
    text: claudeResp.text,
    model: claudeResp.model,
    generatedAt,
    cached: false,
  });
}
