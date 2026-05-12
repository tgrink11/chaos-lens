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
import { predictBreak } from '../src/engine/prediction.js';
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
  const histUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(symbol)}?from=${from}&to=${to}&apikey=${FMP_KEY}`;

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

async function symbolIsInKerryList(symbol) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/kerry_scores?symbol=eq.${symbol}&select=symbol&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

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

  // Surface-area guard: only Kerry-list symbols are eligible. Without this,
  // a curl loop could request arbitrary tickers and burn Claude credit.
  const inList = await symbolIsInKerryList(symbol);
  if (!inList) {
    return res.status(404).json({ error: 'symbol not on Kerry list' });
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

  const prompt = buildPrompt(
    symbol, 'stock', fractalResults, behavioralResults, moodResult, predictionResult, analogResults
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
