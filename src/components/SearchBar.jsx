import { useState } from 'react';

const ASSET_TYPES = [
  { key: 'stock', label: 'Stock' },
  { key: 'index', label: 'Index' },
  { key: 'bond', label: 'Bond' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'screener', label: 'Screener' },
];

const PRESETS = {
  stock: ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'SPY', 'QQQ', 'IWM', 'DIA'],
  index: ['VIX'],
  bond: ['10-Year Treasury'],
  commodity: ['GCUSD', 'SIUSD', 'CLUSD', 'NGUSD', 'HGUSD'],
};

const PRESET_LABELS = {
  GCUSD: 'Gold', SIUSD: 'Silver', CLUSD: 'Oil', NGUSD: 'Nat Gas', HGUSD: 'Copper',
};

export default function SearchBar({ onAnalyze, loading, onTabChange }) {
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState('stock');

  function handleSubmit(e) {
    e.preventDefault();
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    onAnalyze(s, assetType);
  }

  function handlePreset(preset) {
    setSymbol(preset);
    onAnalyze(preset, assetType);
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Asset type tabs */}
      <div className="flex gap-1 mb-4 bg-chaos-800 rounded-lg p-1">
        {ASSET_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => { setAssetType(t.key); onTabChange?.(t.key); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              assetType === t.key
                ? 'bg-[#114f78] text-white'
                : 'text-[#667085] hover:text-[#1a1a1a] hover:bg-[#f0f2f5]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search input — hidden when screener tab is active */}
      {assetType !== 'screener' && (
        <>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder={
                assetType === 'stock' ? 'Enter ticker (e.g. NVDA)'
                  : assetType === 'index' ? 'Enter index symbol (e.g. VIX)'
                    : assetType === 'bond' ? 'Bond analysis (press Analyze)'
                      : 'Enter commodity symbol (e.g. GCUSD)'
              }
              disabled={assetType === 'bond'}
              className="flex-1 bg-chaos-800 border border-chaos-600 rounded-lg px-4 py-3 text-[#1a1a1a] placeholder-[#98a2b3] focus:outline-none focus:border-fractal-cyan focus:ring-1 focus:ring-fractal-cyan font-mono text-lg disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || (assetType !== 'bond' && !symbol.trim())}
              onClick={() => {
                if (assetType === 'bond') onAnalyze('10Y', 'bond');
              }}
              className="bg-[#114f78] text-white font-semibold px-8 py-3 rounded-lg hover:bg-[#0d3d5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing
                </span>
              ) : 'Analyze'}
            </button>
          </form>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mt-3">
            {(PRESETS[assetType] || []).map(p => (
              <button
                key={p}
                onClick={() => handlePreset(p)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-full bg-[#f0f2f5] text-[#344054] hover:bg-[#e8eaed] hover:text-[#1a1a1a] transition-colors disabled:opacity-40"
              >
                {PRESET_LABELS[p] || p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
