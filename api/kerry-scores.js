/**
 * Public read endpoint for the daily Kerry's Tell Sheet + Watchlist scan.
 *
 * Returns the most-recently-stored row per symbol. Consumed by
 * behavioral-market-agent (via cross-origin fetch).
 *
 * Optional query params:
 *   ?list=tellsheet | watchlist   — filter to one list (default: both)
 *
 * CORS: explicitly allow the behavioral-market-agent origin so the browser
 * can read this endpoint from there.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const ALLOWED_ORIGINS = new Set([
  'https://behavioral-market-agent.vercel.app',
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

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const listFilter = req.query.list;
  const validList = listFilter === 'tellsheet' || listFilter === 'watchlist';

  // Build PostgREST query. Order by list_type then symbol so the response is
  // deterministic across calls — easier to diff on the consumer side.
  const params = new URLSearchParams({
    select: '*',
    order: 'list_type.asc,symbol.asc',
  });
  if (validList) params.set('list_type', `eq.${listFilter}`);

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/kerry_scores?${params}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return res.status(502).json({ error: `Supabase ${resp.status}: ${text}` });
    }
    const scores = await resp.json();
    const lastScanned = scores.reduce(
      (acc, r) => (!acc || r.scanned_at > acc ? r.scanned_at : acc),
      null
    );

    // Edge cache 1h; serve stale for 24h while revalidating. The scan only
    // runs once per day, so a fresh fetch on every request would be wasteful.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      scores,
      lastScanned,
      count: scores.length,
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
