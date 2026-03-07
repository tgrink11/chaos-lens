/**
 * Unified Data Fetcher — pulls OHLCV from FMP, TwelveData, FRED
 */

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/**
 * Normalize OHLCV data into parallel arrays
 */
function normalizeOHLCV(items, dateKey = 'date') {
  if (!Array.isArray(items) || items.length === 0) {
    return { date: [], open: [], high: [], low: [], close: [], volume: [] };
  }

  // Sort ascending by date
  const sorted = [...items].sort((a, b) => new Date(a[dateKey]) - new Date(b[dateKey]));

  return {
    date: sorted.map(d => d[dateKey] || d.datetime),
    open: sorted.map(d => parseFloat(d.open) || 0),
    high: sorted.map(d => parseFloat(d.high) || 0),
    low: sorted.map(d => parseFloat(d.low) || 0),
    close: sorted.map(d => parseFloat(d.close) || parseFloat(d.adjClose) || 0),
    volume: sorted.map(d => parseFloat(d.volume) || 0),
  };
}

/**
 * Fetch stock data: daily from FMP + intraday from TwelveData
 */
export async function fetchStockData(symbol) {
  const results = { daily: null, hourly: null, fiveMin: null, quote: null };

  // Parallel fetch: daily history + hourly + 5-min + live quote
  const [dailyRes, hourlyRes, fiveMinRes, quoteRes] = await Promise.allSettled([
    // Daily — last 2 years from FMP
    fetchJSON(`/api/fmp?path=v3/historical-price-full/${symbol}&from=${getDateStr(-730)}&to=${getDateStr(0)}`),
    // Hourly — TwelveData
    fetchJSON(`/api/twelvedata?endpoint=time_series&symbol=${symbol}&interval=1h&outputsize=200`),
    // 5-min — TwelveData
    fetchJSON(`/api/twelvedata?endpoint=time_series&symbol=${symbol}&interval=5min&outputsize=200`),
    // Live quote
    fetchJSON(`/api/fmp?path=v3/quote/${symbol}`),
  ]);

  // Daily
  if (dailyRes.status === 'fulfilled') {
    const data = dailyRes.value;
    const historical = data?.historical || data;
    if (Array.isArray(historical)) {
      results.daily = normalizeOHLCV(historical);
    }
  }

  // Hourly
  if (hourlyRes.status === 'fulfilled') {
    const data = hourlyRes.value;
    if (data?.values) {
      results.hourly = normalizeOHLCV(data.values, 'datetime');
    }
  }

  // 5-min
  if (fiveMinRes.status === 'fulfilled') {
    const data = fiveMinRes.value;
    if (data?.values) {
      results.fiveMin = normalizeOHLCV(data.values, 'datetime');
    }
  }

  // Quote
  if (quoteRes.status === 'fulfilled') {
    const data = quoteRes.value;
    results.quote = Array.isArray(data) ? data[0] : data;
  }

  return results;
}

/**
 * Fetch bond/treasury data from FRED + FMP
 */
export async function fetchBondData() {
  const results = { yields: {}, daily: null };

  const fredSeries = [
    { id: 'DGS2', label: 'y2' },
    { id: 'DGS10', label: 'y10' },
    { id: 'DGS30', label: 'y30' },
    { id: 'DFF', label: 'fedFunds' },
  ];

  const fetches = fredSeries.map(s =>
    fetchJSON(`/api/fred?series_id=${s.id}&sort_order=desc&limit=250`)
      .then(data => ({ ...s, data }))
      .catch(() => ({ ...s, data: null }))
  );

  // Also fetch treasury daily from FMP for fractal analysis
  fetches.push(
    fetchJSON(`/api/fmp?path=v4/treasury&from=${getDateStr(-365)}&to=${getDateStr(0)}`)
      .then(data => ({ id: 'treasury_daily', data }))
      .catch(() => ({ id: 'treasury_daily', data: null }))
  );

  const settled = await Promise.all(fetches);

  for (const item of settled) {
    if (item.id === 'treasury_daily') {
      if (Array.isArray(item.data) && item.data.length > 0) {
        // Use 10-year yield as the "price" for fractal analysis
        const sorted = [...item.data].sort((a, b) => new Date(a.date) - new Date(b.date));
        results.daily = {
          date: sorted.map(d => d.date),
          close: sorted.map(d => parseFloat(d.year10) || 0),
          high: sorted.map(d => parseFloat(d.year10) || 0),
          low: sorted.map(d => parseFloat(d.year10) || 0),
          open: sorted.map(d => parseFloat(d.year10) || 0),
          volume: sorted.map(() => 0),
        };
      }
      continue;
    }

    const obs = item.data?.observations;
    if (Array.isArray(obs) && obs.length > 0) {
      const latest = obs.find(o => o.value !== '.');
      results.yields[item.label] = latest ? parseFloat(latest.value) : null;

      // Build time series for the 10Y for fractal analysis
      if (item.id === 'DGS10' && !results.daily) {
        const valid = obs.filter(o => o.value !== '.').reverse();
        results.daily = {
          date: valid.map(o => o.date),
          close: valid.map(o => parseFloat(o.value)),
          high: valid.map(o => parseFloat(o.value)),
          low: valid.map(o => parseFloat(o.value)),
          open: valid.map(o => parseFloat(o.value)),
          volume: valid.map(() => 0),
        };
      }
    }
  }

  return results;
}

/**
 * Fetch commodity data from FMP + TwelveData
 */
export async function fetchCommodityData(symbol) {
  const results = { daily: null, hourly: null, fiveMin: null, quote: null };

  // Map common commodity names to TwelveData symbols
  const tdSymbolMap = {
    GCUSD: 'XAU/USD', SIUSD: 'XAG/USD',
    CLUSD: 'CL', NGUSD: 'NG',
    HGUSD: 'HG',
  };
  const tdSymbol = tdSymbolMap[symbol] || symbol;

  const [dailyRes, hourlyRes, quoteRes] = await Promise.allSettled([
    // Daily from TwelveData
    fetchJSON(`/api/twelvedata?endpoint=time_series&symbol=${tdSymbol}&interval=1day&outputsize=500`),
    // Hourly from TwelveData
    fetchJSON(`/api/twelvedata?endpoint=time_series&symbol=${tdSymbol}&interval=1h&outputsize=200`),
    // Quote from FMP
    fetchJSON(`/api/fmp?path=v3/quote/${symbol}`),
  ]);

  if (dailyRes.status === 'fulfilled' && dailyRes.value?.values) {
    results.daily = normalizeOHLCV(dailyRes.value.values, 'datetime');
  }

  if (hourlyRes.status === 'fulfilled' && hourlyRes.value?.values) {
    results.hourly = normalizeOHLCV(hourlyRes.value.values, 'datetime');
  }

  if (quoteRes.status === 'fulfilled') {
    const data = quoteRes.value;
    results.quote = Array.isArray(data) ? data[0] : data;
  }

  return results;
}

/**
 * Fetch index data (VIX, etc.) from FMP
 * FMP uses ^VIX format for indices. No intraday available for indices.
 */
export async function fetchIndexData(symbol) {
  const results = { daily: null, hourly: null, fiveMin: null, quote: null };

  // FMP uses ^PREFIX format for indices (e.g. VIX → ^VIX)
  const fmpSymbol = symbol.startsWith('^') ? symbol : `^${symbol}`;
  const encodedSymbol = encodeURIComponent(fmpSymbol);

  const [dailyRes, quoteRes] = await Promise.allSettled([
    // Daily — last 2 years from FMP
    fetchJSON(`/api/fmp?path=v3/historical-price-full/${encodedSymbol}&from=${getDateStr(-730)}&to=${getDateStr(0)}`),
    // Live quote
    fetchJSON(`/api/fmp?path=v3/quote/${encodedSymbol}`),
  ]);

  // Daily
  if (dailyRes.status === 'fulfilled') {
    const data = dailyRes.value;
    const historical = data?.historical || data;
    if (Array.isArray(historical)) {
      results.daily = normalizeOHLCV(historical);
    }
  }

  // Quote
  if (quoteRes.status === 'fulfilled') {
    const data = quoteRes.value;
    results.quote = Array.isArray(data) ? data[0] : data;
  }

  return results;
}

function getDateStr(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}
