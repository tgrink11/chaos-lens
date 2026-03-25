import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchScreenerList, fetchDailyOnly, fetchScreenerCache, saveScreenerCache } from '../api/fetcher';
import { computeOpportunityScore, rankOpportunities } from '../engine/screener';

const BATCH_SIZE = 10;
const BATCH_DELAY = 250; // ms between batches

const CACHE_KEY = 'chaos_screener_cache';

function getCachedResults() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    if (cached.date === today && Array.isArray(cached.results) && cached.results.length > 0) {
      return cached;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedResults(results) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      date: new Date().toISOString().split('T')[0],
      scannedAt: new Date().toISOString(),
      results,
    }));
  } catch { /* localStorage full — ignore */ }
}

const DIR_COLORS = {
  Long: 'text-fractal-green',
  Short: 'text-fractal-red',
};

const MOOD_COLORS = {
  PANIC: 'text-fractal-red',
  EUPHORIA: 'text-fractal-green',
  STEALTH_BUILD: 'text-fractal-purple',
  GRIND: 'text-fractal-amber',
};

const MOOD_LABELS = {
  PANIC: 'Panic',
  EUPHORIA: 'Euphoria',
  STEALTH_BUILD: 'Stealth',
  GRIND: 'Grind',
};

const PRED_COLORS = {
  THRUST_UP: 'text-fractal-green',
  CASCADE_DOWN: 'text-fractal-red',
  CONSOLIDATION: 'text-fractal-amber',
};

const PRED_LABELS = {
  THRUST_UP: 'Thrust Up',
  CASCADE_DOWN: 'Cascade Down',
  CONSOLIDATION: 'Consolidation',
};

function safeNum(val, decimals = 2) {
  const n = typeof val === 'number' && isFinite(val) ? val : null;
  return n != null ? n.toFixed(decimals) : null;
}

export default function ScreenerTab({ onSelectSymbol }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, symbol: '' });
  const [results, setResults] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [failed, setFailed] = useState(0);
  const abortRef = useRef(false);
  const hasInitialized = useRef(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setFailed(0);
    abortRef.current = false;

    try {
      // Step 1: Fetch the universe
      setProgress({ current: 0, total: 0, symbol: 'Loading universe...' });
      const universe = await fetchScreenerList();

      if (!Array.isArray(universe) || universe.length === 0) {
        throw new Error('No symbols returned. Check API configuration.');
      }

      setProgress({ current: 0, total: universe.length, symbol: 'Starting scan...' });

      // Step 2: Process in batches
      const scored = [];
      let failCount = 0;

      for (let i = 0; i < universe.length; i += BATCH_SIZE) {
        if (abortRef.current) break;

        const batch = universe.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(async (item) => {
            const { daily, quote } = await fetchDailyOnly(item.symbol);
            if (!daily?.close?.length) return null;

            const scoreObj = computeOpportunityScore(daily);
            if (!scoreObj) return null;

            return {
              ...item,
              ...scoreObj,
              price: quote?.price ?? null,
              changePercent: quote?.changesPercentage ?? null,
            };
          })
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled' && r.value) {
            scored.push(r.value);
          } else {
            failCount++;
          }
        }

        setFailed(failCount);
        setProgress({
          current: Math.min(i + BATCH_SIZE, universe.length),
          total: universe.length,
          symbol: batch[batch.length - 1]?.symbol || '',
        });

        // Update live top 20 every 5 batches
        if (scored.length > 0 && (i % (BATCH_SIZE * 5) === 0 || i + BATCH_SIZE >= universe.length)) {
          setResults(rankOpportunities(scored, 20));
        }

        // Rate limit delay between batches
        if (i + BATCH_SIZE < universe.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
      }

      // Final ranking
      const top20 = rankOpportunities(scored, 20);
      setResults(top20);
      setLastScanned(new Date());
      setCachedResults(top20);
      // Save to Supabase (shared across all users)
      saveScreenerCache(top20).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }, []);

  // On mount: check Supabase cache → localStorage fallback → auto-scan
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Try localStorage first (instant), then Supabase (shared across users)
    const localCached = getCachedResults();
    if (localCached) {
      setResults(localCached.results);
      setLastScanned(new Date(localCached.scannedAt));
      return;
    }

    // Check Supabase for server-side cache (shared across all users)
    fetchScreenerCache()
      .then(({ results: serverResults, scannedAt }) => {
        if (serverResults && serverResults.length > 0) {
          setResults(serverResults);
          setLastScanned(new Date(scannedAt));
          // Also save to localStorage for instant access next time
          setCachedResults(serverResults);
        } else {
          // No cache anywhere — auto-execute scan
          handleScan();
        }
      })
      .catch(() => {
        // Supabase unavailable — auto-execute scan
        handleScan();
      });
  }, [handleScan]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleSort = useCallback((field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const sortedResults = results ? [...results].sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
  }) : null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Scan Controls */}
      {!scanning && !results && (
        <div className="bg-chaos-800 rounded-xl p-8 border border-chaos-600 text-center">
          <div className="text-5xl mb-4 opacity-30">◈</div>
          <h2 className="text-xl text-[#1a1a1a] font-mono mb-2">Morning Market Scan</h2>
          <p className="text-sm text-[#667085] mb-6 max-w-lg mx-auto">
            Scans S&P 500 and small/mid-cap stocks using fractal analysis.
            Identifies the top 20 opportunities ranked by trend strength, structural clarity,
            behavioral extremes, and prediction confidence.
          </p>
          <button
            onClick={handleScan}
            className="bg-[#114f78] text-white font-semibold px-8 py-3 rounded-lg hover:bg-[#0d3d5e] transition-colors text-lg"
          >
            Run Morning Scan
          </button>
          <p className="text-xs text-[#98a2b3] mt-3">
            Scans ~2,500 symbols. Takes 3-5 minutes.
          </p>
        </div>
      )}

      {/* Progress */}
      {scanning && (
        <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-fractal-cyan" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[#344054] font-mono text-sm">
                Analyzing <span className="text-fractal-cyan">{progress.symbol}</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[#667085] text-sm">
                {progress.current} / {progress.total} ({pct}%)
              </span>
              <button
                onClick={handleStop}
                className="text-xs text-[#667085] hover:text-fractal-red transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-chaos-700 rounded-full h-2">
            <div
              className="bg-fractal-cyan h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {failed > 0 && (
            <p className="text-xs text-[#98a2b3] mt-2">{failed} symbols skipped (insufficient data)</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-fractal-red text-sm">
          {error}
        </div>
      )}

      {/* Results Table */}
      {sortedResults && sortedResults.length > 0 && (
        <div className="bg-chaos-800 rounded-xl border border-chaos-600 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-chaos-600">
            <h3 className="text-lg font-semibold text-[#1a1a1a] font-mono">
              Top 20 Opportunities
            </h3>
            <div className="flex items-center gap-4">
              {lastScanned && (
                <span className="text-xs text-[#667085]">
                  Scanned {lastScanned.toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={handleScan}
                disabled={scanning}
                className="text-xs text-fractal-cyan hover:text-[#0d3d5e] transition-colors disabled:opacity-40"
              >
                Re-scan
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#667085] uppercase tracking-wider">
                  {[
                    { key: 'score', label: '#' },
                    { key: 'symbol', label: 'Symbol' },
                    { key: 'direction', label: 'Dir' },
                    { key: 'sector', label: 'Sector' },
                    { key: 'price', label: 'Price' },
                    { key: 'changePercent', label: 'Chg%' },
                    { key: 'score', label: 'Score' },
                    { key: 'H', label: 'Hurst' },
                    { key: 'D', label: 'BoxDim' },
                    { key: 'lambda', label: 'Lacun' },
                    { key: 'momentum', label: 'Mom%' },
                    { key: 'mood', label: 'Mood' },
                    { key: 'prediction', label: 'Prediction' },
                    { key: 'predConfidence', label: 'Conf%' },
                  ].map(col => (
                    <th
                      key={col.key + col.label}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-3 text-left cursor-pointer hover:text-[#344054] transition-colors whitespace-nowrap"
                    >
                      {col.label}
                      {sortField === col.key && (
                        <span className="ml-1 text-fractal-cyan">{sortDir === 'desc' ? '▾' : '▴'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d0d5dd]">
                {sortedResults.map((r, i) => (
                  <tr
                    key={r.symbol}
                    onClick={() => onSelectSymbol(r.symbol)}
                    className="hover:bg-[#f0f2f5] cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-3 text-[#667085] font-mono">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-mono font-bold text-fractal-cyan">{r.symbol}</div>
                      <div className="text-xs text-[#667085] truncate max-w-[140px]">{r.name}</div>
                    </td>
                    <td className={`px-3 py-3 font-mono font-bold text-xs ${DIR_COLORS[r.direction] || 'text-[#667085]'}`}>
                      {r.direction}
                    </td>
                    <td className="px-3 py-3 text-[#667085] text-xs">{r.sector}</td>
                    <td className="px-3 py-3 text-[#344054] font-mono">
                      {safeNum(r.price) ? `$${safeNum(r.price)}` : '—'}
                    </td>
                    <td className={`px-3 py-3 font-mono ${
                      r.changePercent > 0 ? 'text-fractal-green' : r.changePercent < 0 ? 'text-fractal-red' : 'text-[#667085]'
                    }`}>
                      {safeNum(r.changePercent) ? `${r.changePercent >= 0 ? '+' : ''}${safeNum(r.changePercent)}%` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center justify-center w-10 h-7 rounded-md bg-[#114f78]/10 text-fractal-cyan font-mono font-bold text-sm">
                        {r.score}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[#344054]">{safeNum(r.H) ?? '—'}</td>
                    <td className="px-3 py-3 font-mono text-[#344054]">{safeNum(r.D) ?? '—'}</td>
                    <td className="px-3 py-3 font-mono text-[#344054]">{safeNum(r.lambda) ?? '—'}</td>
                    <td className={`px-3 py-3 font-mono ${
                      r.momentum > 0 ? 'text-fractal-green' : r.momentum < 0 ? 'text-fractal-red' : 'text-[#667085]'
                    }`}>
                      {safeNum(r.momentum) != null ? `${r.momentum >= 0 ? '+' : ''}${safeNum(r.momentum)}%` : '—'}
                    </td>
                    <td className={`px-3 py-3 font-semibold text-xs ${MOOD_COLORS[r.mood] || 'text-[#667085]'}`}>
                      {MOOD_LABELS[r.mood] || r.mood}
                    </td>
                    <td className={`px-3 py-3 font-semibold text-xs ${PRED_COLORS[r.prediction] || 'text-[#667085]'}`}>
                      {PRED_LABELS[r.prediction] || r.prediction}
                    </td>
                    <td className="px-3 py-3 font-mono text-[#344054]">{r.predConfidence ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-[#d0d5dd] text-xs text-[#98a2b3]">
            Click any row to run full fractal analysis. Score combines trend strength, structural clarity, behavioral extremes, and prediction confidence.
          </div>
        </div>
      )}

      {/* No results after scan */}
      {!scanning && results && results.length === 0 && (
        <div className="bg-chaos-800 rounded-xl p-8 border border-chaos-600 text-center">
          <p className="text-[#667085]">No opportunities found. Try re-scanning.</p>
        </div>
      )}
    </div>
  );
}
