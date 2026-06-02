/**
 * Intraday quote overlay for Kerry's Fractal Scores page.
 *
 *   GET /api/intraday-quotes?symbols=AMPX,NOW,NVDA,AAPL
 *
 * Returns an array of { symbol, price, change, changesPercentage, timestamp }
 * objects pulled from FMP's batch quote endpoint. Used by the kerry-scores
 * page to overlay live prices on top of the EOD scan data so subscribers
 * can see whether intraday action has moved a stock past its risk-range
 * band boundaries.
 *
 * Deliberately dumb: the server does NOT recompute Ratings. The client
 * already has every row's lrr/trr/sma/fractal values and imports the
 * same rating-logic module the server uses — so it can swap in the live
 * price and re-run computeRating() locally with zero drift. Single
 * source of truth, no server cycles wasted on data the client already has.
 *
 * Cost: ~1-2 FMP calls per page interaction (FMP batch quote supports up
 * to ~100 symbols per call; 130 Kerry symbols = 2 calls). Free on most
 * paid FMP plans. No Supabase writes — intraday data doesn't persist;
 * the next nightly cron supersedes whatever the overlay showed.
 */

const FMP_KEY = process.env.FMP_KEY;

const ALLOWED_ORIGINS = new Set([
  'https://behavioral-market-agent.vercel.app',
  'https://chaos-lens.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]);

// FMP /stable/batch-quote supports up to ~100 symbols per call. We batch
// at 90 to leave headroom for URL-encoding overhead and to keep each
// individual request under typical Vercel function payload limits.
const BATCH_SIZE = 90;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Fetch a single batch of quotes from FMP. Returns an array of parsed
 * quote objects (or [] on failure — we soft-fail per batch so a single
 * bad batch doesn't kill the whole response).
 *
 * FMP's /stable/quote endpoint accepts comma-separated symbols and
 * returns an array of objects with shape:
 *   { symbol, price, change, changesPercentage, ... }
 *
 * If the v3 endpoint is still available on your plan, the URL shape is
 * /v3/quote/AAPL,MSFT,GOOG. The /stable/ variant takes ?symbol=... as
 * a query parameter and is the post-Aug-2025 path for new accounts.
 */
async function fetchQuoteBatch(symbols) {
  if (symbols.length === 0) return [];
  // /stable/quote uses ?symbol= (singular) with comma-separated values.
  const symbolParam = encodeURIComponent(symbols.join(','));
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${symbolParam}&apikey=${FMP_KEY}`;
  const resp = await fetch(url).catch(() => null);
  if (!resp?.ok) return [];
  const data = await resp.json().catch(() => null);
  if (!Array.isArray(data)) return [];
  return data;
}

function normalizeQuote(q) {
  // FMP field names vary slightly between v3 and /stable; defensive lookup.
  const price = parseFloat(q?.price ?? q?.lastPrice ?? q?.regularMarketPrice);
  const change = parseFloat(q?.change ?? q?.dayChange ?? 0);
  const changePct = parseFloat(q?.changesPercentage ?? q?.changePercent ?? 0);
  // FMP timestamps are Unix seconds in /stable. Multiply to ms for JS Date.
  const tsRaw = q?.timestamp ?? q?.lastUpdated ?? null;
  const tsMs = Number.isFinite(parseFloat(tsRaw))
    ? parseFloat(tsRaw) * (parseFloat(tsRaw) < 1e12 ? 1000 : 1)
    : null;
  return {
    symbol: String(q?.symbol || '').toUpperCase(),
    price: Number.isFinite(price) ? Math.round(price * 100) / 100 : null,
    change: Number.isFinite(change) ? Math.round(change * 100) / 100 : null,
    changesPercentage: Number.isFinite(changePct)
      ? Math.round(changePct * 100) / 100
      : null,
    timestamp: tsMs ? new Date(tsMs).toISOString() : null,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!FMP_KEY) return res.status(500).json({ error: 'FMP_KEY not configured' });

  // Parse symbols param. Accept comma-separated; validate each is 1-5
  // capital letters (same gate as analyze-ticker). Cap total at 200 to
  // prevent abuse — well above the ~130 Kerry symbols a legit page load
  // would request.
  const raw = String(req.query.symbols || '').toUpperCase().trim();
  if (!raw) return res.status(400).json({ error: 'symbols query param required' });
  const symbols = [...new Set(
    raw.split(',')
      .map(s => s.trim())
      .filter(s => /^[A-Z]{1,5}$/.test(s))
  )].slice(0, 200);
  if (symbols.length === 0) {
    return res.status(400).json({ error: 'no valid symbols in request' });
  }

  // Batch the request. FMP returns one array of quote objects per call;
  // we concat them into a single quotes array. Order isn't guaranteed
  // to match input (FMP returns by exchange/symbol order internally),
  // so the client should key by symbol when matching back to rows.
  const all = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchResult = await fetchQuoteBatch(batch);
    for (const q of batchResult) {
      const norm = normalizeQuote(q);
      if (norm.symbol && norm.price != null) all.push(norm);
    }
  }

  return res.status(200).json({
    quotes: all,
    fetchedAt: new Date().toISOString(),
    requested: symbols.length,
    returned: all.length,
  });
}
