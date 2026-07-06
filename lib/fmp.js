"use strict";
/**
 * FMP /stable/ data loader — mirrors load_prices() in chaos_lens_live.py.
 * /stable/ endpoints ONLY — never /api/v3/.
 */

const BASE = "https://financialmodelingprep.com/stable";
const LOOKBACK = 420; // trading days fed to the engine
const CAL_DAYS = 640; // calendar window to guarantee >=420 trading days
const TIMEOUT_MS = 20000;
const RETRIES = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.status === 429) {
        lastErr = "429";
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e.message || String(e);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`request failed after ${RETRIES} tries: ${lastErr}`);
}

function closesFromPayload(payload) {
  let rows = payload;
  if (!Array.isArray(rows)) {
    rows = (payload && (payload.historical || payload.results)) || [];
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const parsed = [];
  for (const d of rows) {
    const c = d.price !== undefined ? d.price : d.close;
    const dt = d.date;
    if (c !== undefined && c !== null && dt) parsed.push([dt, Number(c)]);
  }
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // oldest -> newest
  return parsed.map((p) => p[1]);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Returns array of closes (oldest -> newest), or null if unresolved.
async function loadPrices(ticker, apiKey) {
  const to = new Date();
  const from = new Date(to.getTime() - CAL_DAYS * 24 * 60 * 60 * 1000);
  const toStr = isoDate(to);
  const fromStr = isoDate(from);

  // Try the '-' class-share form first (as given), then the '.' form as a fallback,
  // matching load_prices() in chaos_lens_live.py.
  const candidates = [ticker, ticker.replace(/-/g, ".")];
  for (const sym of candidates) {
    const url = `${BASE}/historical-price-eod/light?symbol=${encodeURIComponent(sym)}&from=${fromStr}&to=${toStr}&apikey=${apiKey}`;
    try {
      const payload = await getJson(url);
      const closes = closesFromPayload(payload);
      if (closes && closes.length >= 60) {
        return closes.slice(-LOOKBACK);
      }
    } catch (e) {
      // try next candidate
    }
  }
  return null;
}

// normalize(): BRK.B -> BRK-B (FMP convention), matching chaos_lens_live.py
function normalize(t) {
  return t.replace(/\./g, "-");
}

module.exports = { loadPrices, normalize, LOOKBACK, CAL_DAYS };
