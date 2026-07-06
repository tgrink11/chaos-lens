"use strict";
/**
 * GET /api/scan?key=<SCAN_SECRET>[&limit=25][&concurrency=40]
 *
 * Runs the Chaos Lens fractal scan against the bundled ticker universe
 * (data/tickers.txt) using live FMP /stable/ data, and returns the same
 * schema as results.json in the original chaos_lens_live.py pipeline:
 *   { universe, requested, unresolved, rows }
 *
 * Auth: requires ?key=<SCAN_SECRET> matching the SCAN_SECRET env var,
 * so this endpoint can't be hit (and burn FMP quota) by randoms.
 *
 * Required env vars (set in Vercel project settings, not in code):
 *   FMP_API_KEY   - your FMP enterprise key
 *   SCAN_SECRET   - a random string you invent; required as ?key=
 */

const fs = require("fs");
const path = require("path");
const { loadPrices, normalize } = require("../lib/fmp");
const { analyze } = require("../lib/engine");

function loadTickers() {
  const raw = fs.readFileSync(path.join(__dirname, "..", "data", "tickers.txt"), "utf8");
  const set = new Set(raw.split(/\s+/).filter(Boolean));
  return [...set].sort();
}

// Simple concurrency-limited async pool (no external deps).
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, next);
  await Promise.all(runners);
  return results;
}

module.exports = async (req, res) => {
  const { key, limit, concurrency } = req.query || {};

  if (!process.env.SCAN_SECRET || key !== process.env.SCAN_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!process.env.FMP_API_KEY) {
    res.status(500).json({ error: "FMP_API_KEY not configured on this deployment" });
    return;
  }

  let tickers = loadTickers();
  if (limit) tickers = tickers.slice(0, Number(limit));

  const workerCount = concurrency ? Number(concurrency) : 40;
  const apiKey = process.env.FMP_API_KEY;

  const outcomes = await runPool(tickers, workerCount, async (t) => {
    const sym = normalize(t);
    try {
      const prices = await loadPrices(sym, apiKey);
      if (!prices || prices.length < 60) return { status: "fail", ticker: t };
      return { status: "ok", row: analyze(sym, prices) };
    } catch (e) {
      return { status: "fail", ticker: `${t} (${e.message || e})` };
    }
  });

  const rows = outcomes.filter((o) => o.status === "ok").map((o) => o.row);
  const unresolved = outcomes.filter((o) => o.status === "fail").map((o) => o.ticker);
  rows.sort((a, b) => Math.abs(b.conviction) - Math.abs(a.conviction));

  res.status(200).json({
    generatedAt: new Date().toISOString(),
    universe: rows.length,
    requested: tickers.length,
    unresolved,
    rows,
  });
};
