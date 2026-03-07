export default async function handler(req, res) {
  const key = process.env.TWELVEDATA_KEY;
  if (!key) return res.status(500).json({ error: 'TWELVEDATA_KEY not configured' });

  const { endpoint = 'time_series', ...params } = req.query;

  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  const url = `https://api.twelvedata.com/${endpoint}?${qs}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }

    const data = await resp.json();

    if (data.status === 'error') {
      return res.status(422).json({ error: data.message || 'TwelveData error' });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
