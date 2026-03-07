const CACHE_TTL = {
  'sp500-constituent': 604800,
  'historical-price-eod': 14400,
  'treasury': 3600,
  'commodities': 3600,
  'quote': 120,
};

function getTTL(path) {
  for (const [key, ttl] of Object.entries(CACHE_TTL)) {
    if (path.includes(key)) return ttl;
  }
  return 300;
}

export default async function handler(req, res) {
  const key = process.env.FMP_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_KEY not configured' });

  const { path, ...params } = req.query;
  if (!path) return res.status(400).json({ error: 'path query param required' });

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `https://financialmodelingprep.com/${path}?${qs}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }

    const data = await resp.json();
    const ttl = getTTL(path);
    res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
