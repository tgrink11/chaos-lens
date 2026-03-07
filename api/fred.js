export default async function handler(req, res) {
  const key = process.env.FRED_KEY;
  if (!key) return res.status(500).json({ error: 'FRED_KEY not configured' });

  const { series_id, ...params } = req.query;
  if (!series_id) return res.status(400).json({ error: 'series_id required' });

  const qs = new URLSearchParams({
    series_id,
    api_key: key,
    file_type: 'json',
    ...params,
  }).toString();

  const url = `https://api.stlouisfed.org/fred/series/observations?${qs}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }

    const data = await resp.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
