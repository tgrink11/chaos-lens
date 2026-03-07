const DIRECTION_CONFIG = {
  bullish: {
    label: 'Bullish',
    arrow: '↑',
    bgClass: 'bg-green-500/10 border-green-500/30',
    textClass: 'text-fractal-green',
    arrowBg: 'bg-green-500/20',
  },
  bearish: {
    label: 'Bearish',
    arrow: '↓',
    bgClass: 'bg-red-500/10 border-red-500/30',
    textClass: 'text-fractal-red',
    arrowBg: 'bg-red-500/20',
  },
  neutral: {
    label: 'Neutral',
    arrow: '→',
    bgClass: 'bg-amber-500/10 border-amber-500/30',
    textClass: 'text-fractal-amber',
    arrowBg: 'bg-amber-500/20',
  },
};

function OutlookCard({ horizon }) {
  if (!horizon) return null;
  const config = DIRECTION_CONFIG[horizon.direction] || DIRECTION_CONFIG.neutral;

  return (
    <div className={`flex-1 rounded-xl p-5 border ${config.bgClass}`}>
      <div className="flex items-center gap-4">
        {/* Arrow icon */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold ${config.arrowBg} ${config.textClass}`}>
          {config.arrow}
        </div>

        <div className="flex-1 min-w-0">
          {/* Horizon label */}
          <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">
            {horizon.days}-Day Outlook
          </div>

          {/* Direction + confidence */}
          <div className="flex items-center gap-2">
            <span className={`text-xl font-bold font-mono ${config.textClass}`}>
              {config.label}
            </span>
            <span className="text-sm text-gray-400 font-mono">
              {horizon.confidence}% confidence
            </span>
          </div>

          {/* Plain-English summary */}
          <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">
            {horizon.summary}
          </p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 bg-chaos-700 rounded-full overflow-hidden mt-3">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${horizon.confidence}%`,
            backgroundColor: config.textClass.includes('green') ? '#22c55e'
              : config.textClass.includes('red') ? '#ef4444' : '#f59e0b',
          }}
        />
      </div>
    </div>
  );
}

export default function DirectionalOutlook({ horizons, symbol }) {
  if (!horizons) return null;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600 print-break">
      <h2 className="text-lg font-semibold text-gray-200 mb-1 font-mono">
        Where is {symbol} headed?
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Directional outlook based on fractal pattern analysis across multiple timeframes
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OutlookCard horizon={horizons.shortTerm} />
        <OutlookCard horizon={horizons.mediumTerm} />
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        Based on fractal geometry analysis of price behavior. This is not financial advice.
      </p>
    </div>
  );
}
