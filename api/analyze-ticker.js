/**
 * On-demand fractal analysis for any single ticker, returned in the same
 * row shape as kerry_scores so the Kerry's Fractal Scores page can render
 * it inline with the rest of the table.
 *
 *   GET /api/analyze-ticker?symbol=NVDA
 *
 * No Supabase write — each call is fresh. Engine compute is cheap (~50ms);
 * the only paid hop is one FMP /historical-price-full call per request,
 * which is also rate-limited inside the existing FMP plan.
 *
 * No Kerry-list gate: this endpoint is intentionally open to any valid
 * US ticker symbol so subscribers can analyze whatever they're watching.
 * The downstream /api/ai-take call is what costs Claude credit, so cost
 * containment lives there (24h cache).
 */

import { runFractalAnalysis } from '../src/engine/fractals.js';
import { runBehavioralAnalysis } from '../src/engine/behavioral.js';
import { classifyMood } from '../src/engine/mood.js';
import { findAnalogs } from '../src/engine/analogs.js';
import { predictBreak, predictHorizons } from '../src/engine/prediction.js';
import { computeTrend } from '../src/engine/trend.js';

// Mirrors the convictionScore() function in kerry-scores.html and the
// computeConviction() function in kerry-scan.js. Used here so trend
// classification can factor in today's conviction.
function computeConviction(r) {
  let s = 0;
  const c15 = (r.short_term_confidence || 0) / 100;
  if (r.short_term_direction === 'bullish') s += c15;
  else if (r.short_term_direction === 'bearish') s -= c15;
  const c62 = (r.medium_term_confidence || 0) / 100;
  if (r.medium_term_direction === 'bullish') s += c62;
  else if (r.medium_term_direction === 'bearish') s -= c62;
  const cP = (r.prediction_confidence || 0) / 100;
  if (r.prediction === 'THRUST_UP') s += cP;
  else if (r.prediction === 'CASCADE_DOWN') s -= cP;
  if (r.mood === 'EUPHORIA') s += 0.7;
  else if (r.mood === 'STEALTH_BUILD') s += 0.5;
  else if (r.mood === 'PANIC') s -= 0.7;
  if (Number.isFinite(r.box_dim)) {
    const smoothness = Math.max(0, 1.5 - r.box_dim);
    const sign = s > 0 ? 1 : s < 0 ? -1 : 0;
    s += smoothness * sign * 2;
  }
  return Math.round(s * 100) / 100;
}

const FMP_KEY = process.env.FMP_KEY;
const CHAOS_LENS_URL = process.env.CHAOS_LENS_URL || '';

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

  return { daily, price };
}

function round3(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(v * 1000) / 1000
    : null;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!FMP_KEY) return res.status(500).json({ error: 'FMP_KEY not configured' });

  const symbol = String(req.query.symbol || '').toUpperCase().trim();
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'invalid symbol — must be 1-5 capital letters' });
  }

  const fetched = await fetchDailyOHLCV(symbol);
  if (!fetched?.daily?.close?.length) {
    return res.status(404).json({ error: `No data returned for ${symbol}. Check the ticker spelling.` });
  }
  if (fetched.daily.close.length < 60) {
    return res.status(422).json({ error: `${symbol} has only ${fetched.daily.close.length} daily bars; need at least 60 for fractal analysis.` });
  }

  const { daily, price } = fetched;

  const fractalResults = runFractalAnalysis({ daily, hourly: null, fiveMin: null });
  const primary = fractalResults?.primary;
  if (!primary?.hurst?.H) {
    return res.status(500).json({ error: 'fractal analysis failed' });
  }

  const behavioralResults = runBehavioralAnalysis(daily, 'stock', null);
  const moodResult = classifyMood(fractalResults, behavioralResults, daily.close);
  const predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, daily.close);

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

  // Match the kerry_scores row shape exactly so the page can re-use rowHtml.
  const partial = {
    symbol,
    list_type: 'custom',
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
    conviction_history: [],
    scanned_at: new Date().toISOString(),
  };

  // Trend + setup. Custom rows have no stored history so accumulation
  // detection runs only against today's snapshot — the BREAKOUT label
  // (which requires a prior-day conviction) will never fire here, but
  // ACCUMULATING / UPTREND / DOWNTREND still work fine.
  const todayConv = computeConviction(partial);
  const trend = computeTrend(daily.close, todayConv, []);

  return res.status(200).json({
    ...partial,
    sma_9: trend.sma9,
    sma_15: trend.sma15,
    sma_62: trend.sma62,
    sma_200: trend.sma200,
    setup: trend.setup,
  });
}
