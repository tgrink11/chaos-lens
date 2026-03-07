/**
 * Fractal Metrics Display — SVG gauge arcs for Hurst, Box-Counting, Lacunarity
 */

function Gauge({ value, min, max, label, sublabel, color, unit = '' }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - pct * 0.75); // 270° arc

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="120" viewBox="0 0 140 120">
        {/* Background arc */}
        <circle
          cx="70" cy="70" r="45"
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeLinecap="round"
          transform="rotate(135 70 70)"
        />
        {/* Value arc */}
        <circle
          cx="70" cy="70" r="45"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(135 70 70)"
          className="gauge-animate"
          style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
        />
        {/* Value text */}
        <text x="70" y="65" textAnchor="middle" className="fill-gray-100 text-2xl font-mono font-bold" fontSize="24">
          {typeof value === 'number' ? value.toFixed(3) : '—'}
        </text>
        <text x="70" y="85" textAnchor="middle" className="fill-gray-400 text-xs" fontSize="11">
          {unit}
        </text>
      </svg>
      <div className="text-center -mt-2">
        <div className="text-sm font-semibold text-gray-200">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>
      </div>
    </div>
  );
}

export default function FractalMetrics({ fractalResults }) {
  const p = fractalResults?.primary;
  if (!p) return null;

  const { hurst, boxDim, lacunarity } = p;

  // Color based on interpretation
  const hurstColor = hurst.H > 0.6 ? '#22c55e' : hurst.H < 0.4 ? '#ef4444' : '#f59e0b';
  const dimColor = boxDim.D < 1.3 ? '#22c55e' : boxDim.D > 1.6 ? '#ef4444' : '#f59e0b';
  const lacColor = lacunarity.lambda > 1.5 ? '#a855f7' : lacunarity.lambda < 1.15 ? '#06b6d4' : '#f59e0b';

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-gray-200 mb-4 font-mono">Fractal Signature</h2>
      <div className="grid grid-cols-3 gap-4">
        <Gauge
          value={hurst.H}
          min={0} max={1}
          label="Hurst Exponent"
          sublabel={hurst.label}
          color={hurstColor}
          unit="H"
        />
        <Gauge
          value={boxDim.D}
          min={1} max={2}
          label="Box-Counting Dim"
          sublabel={boxDim.label}
          color={dimColor}
          unit="D"
        />
        <Gauge
          value={lacunarity.lambda}
          min={1} max={3}
          label="Lacunarity"
          sublabel={lacunarity.label}
          color={lacColor}
          unit="Λ"
        />
      </div>

      {/* Self-similarity */}
      {fractalResults.selfSimilarity && (
        <div className="mt-4 pt-4 border-t border-chaos-600 text-center">
          <span className="text-xs text-gray-400">Cross-Timeframe Self-Similarity: </span>
          <span className={`text-sm font-mono font-semibold ${
            fractalResults.selfSimilarity.score > 0.7 ? 'text-fractal-green'
              : fractalResults.selfSimilarity.score > 0.4 ? 'text-fractal-amber'
                : 'text-fractal-red'
          }`}>
            {(fractalResults.selfSimilarity.score * 100).toFixed(0)}%
          </span>
          <span className="text-xs text-gray-500 ml-2">
            {fractalResults.selfSimilarity.label}
          </span>
        </div>
      )}
    </div>
  );
}
