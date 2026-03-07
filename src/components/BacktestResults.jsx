import { useState } from 'react';

const DIR_COLORS = {
  bullish: 'text-fractal-green',
  bearish: 'text-fractal-red',
  neutral: 'text-fractal-amber',
};

const DIR_BG = {
  bullish: 'bg-green-500',
  bearish: 'bg-red-500',
  neutral: 'bg-amber-500',
};

function rateColor(rate) {
  if (rate == null) return 'text-gray-500';
  if (rate >= 0.55) return 'text-fractal-green';
  if (rate >= 0.40) return 'text-fractal-amber';
  return 'text-fractal-red';
}

function rateBg(rate) {
  if (rate == null) return '#6b7280';
  if (rate >= 0.55) return '#22c55e';
  if (rate >= 0.40) return '#f59e0b';
  return '#ef4444';
}

function pct(val) {
  if (val == null) return '—';
  return `${Math.round(val * 100)}%`;
}

function HitRateCard({ label, metrics }) {
  if (!metrics || metrics.total === 0) return null;

  return (
    <div className="flex-1 bg-chaos-700 rounded-xl p-5">
      <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">
        {label}
      </div>
      <div className={`text-3xl font-bold font-mono ${rateColor(metrics.hitRate)}`}>
        {pct(metrics.hitRate)}
      </div>
      <div className="text-sm text-gray-400 mt-1">
        {metrics.hits} / {metrics.total} correct
      </div>
      <div className="h-1.5 bg-chaos-600 rounded-full overflow-hidden mt-3">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${metrics.hitRate * 100}%`, backgroundColor: rateBg(metrics.hitRate) }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>Avg conf on hits: {metrics.avgConfidenceOnHit ?? '—'}%</span>
        <span>Misses: {metrics.avgConfidenceOnMiss ?? '—'}%</span>
      </div>
    </div>
  );
}

function DirectionTable({ shortTerm, mediumTerm }) {
  const directions = ['bullish', 'bearish', 'neutral'];
  const horizons = [
    { label: '15-Day', data: shortTerm },
    { label: '62-Day', data: mediumTerm },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 uppercase tracking-wider">
            <th className="text-left py-2 pr-4">Horizon</th>
            <th className="text-left py-2 pr-4">Direction</th>
            <th className="text-right py-2 pr-4">Predicted</th>
            <th className="text-right py-2 pr-4">Correct</th>
            <th className="text-right py-2">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {horizons.map(({ label, data }) =>
            data?.total > 0 && directions.map((dir, i) => {
              const d = data.byDirection[dir];
              if (!d || d.predicted === 0) return null;
              return (
                <tr key={`${label}-${dir}`} className="border-t border-chaos-600">
                  <td className="py-2 pr-4 text-gray-300 font-mono">
                    {i === 0 ? label : ''}
                  </td>
                  <td className={`py-2 pr-4 capitalize ${DIR_COLORS[dir]}`}>
                    {dir}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-300 font-mono">
                    {d.predicted}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-300 font-mono">
                    {d.correct}
                  </td>
                  <td className={`py-2 text-right font-mono font-semibold ${rateColor(d.accuracy)}`}>
                    {pct(d.accuracy)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function CalibrationChart({ calibration, label }) {
  if (!calibration) return null;
  const filled = calibration.filter(b => b.count > 0);
  if (filled.length === 0) return null;

  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">
        {label} — Confidence Calibration
      </div>
      <div className="space-y-2">
        {calibration.map(bucket => (
          <div key={bucket.label} className="flex items-center gap-3">
            <div className="w-16 text-xs text-gray-400 font-mono text-right shrink-0">
              {bucket.label}
            </div>
            <div className="flex-1 h-2 bg-chaos-600 rounded-full overflow-hidden">
              {bucket.count > 0 && (
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(bucket.hitRate ?? 0) * 100}%`,
                    backgroundColor: rateBg(bucket.hitRate),
                  }}
                />
              )}
            </div>
            <div className="w-24 text-xs text-gray-400 font-mono shrink-0">
              {bucket.count > 0
                ? <><span className={rateColor(bucket.hitRate)}>{pct(bucket.hitRate)}</span> <span className="text-gray-600">({bucket.count})</span></>
                : <span className="text-gray-600">—</span>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestPointRow({ point }) {
  const hit15 = point.actual15 && point.predicted15.direction === point.actual15.actualDirection;
  const hit62 = point.actual62 && point.predicted62.direction === point.actual62.actualDirection;

  return (
    <tr className="border-t border-chaos-700 text-xs">
      <td className="py-1.5 pr-3 text-gray-400 font-mono">{point.date}</td>
      <td className={`py-1.5 pr-3 capitalize font-mono ${DIR_COLORS[point.predicted15.direction]}`}>
        {point.predicted15.direction} <span className="text-gray-500">{point.predicted15.confidence}%</span>
      </td>
      <td className="py-1.5 pr-3 font-mono">
        {point.actual15
          ? <span className={hit15 ? 'text-fractal-green' : 'text-fractal-red'}>
              {hit15 ? '✓' : '✗'} {(point.actual15.actualReturn * 100).toFixed(1)}%
            </span>
          : <span className="text-gray-600">—</span>
        }
      </td>
      <td className={`py-1.5 pr-3 capitalize font-mono ${DIR_COLORS[point.predicted62.direction]}`}>
        {point.predicted62.direction} <span className="text-gray-500">{point.predicted62.confidence}%</span>
      </td>
      <td className="py-1.5 font-mono">
        {point.actual62
          ? <span className={hit62 ? 'text-fractal-green' : 'text-fractal-red'}>
              {hit62 ? '✓' : '✗'} {(point.actual62.actualReturn * 100).toFixed(1)}%
            </span>
          : <span className="text-gray-600">—</span>
        }
      </td>
    </tr>
  );
}

export default function BacktestResults({ backtestResult, symbol, loading, progress }) {
  const [showTestPoints, setShowTestPoints] = useState(false);

  // Loading state
  if (loading) {
    return (
      <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600 no-print">
        <h2 className="text-lg font-semibold text-gray-200 mb-3 font-mono">Backtest</h2>
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-fractal-cyan" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-mono text-fractal-cyan">
            Running walk-forward backtest... {progress}%
          </span>
        </div>
        <div className="h-1.5 bg-chaos-700 rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Error / insufficient data
  if (backtestResult?.error) {
    return (
      <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600 no-print">
        <h2 className="text-lg font-semibold text-gray-200 mb-2 font-mono">Backtest</h2>
        <p className="text-sm text-gray-400">{backtestResult.message}</p>
      </div>
    );
  }

  if (!backtestResult?.metrics) return null;

  const { metrics, testPoints, config } = backtestResult;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600 no-print">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-200 font-mono">
          Backtest Results
        </h2>
        <span className="text-xs text-gray-500 font-mono bg-chaos-700 px-2 py-1 rounded">
          {metrics.testPointCount} test points
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-1">
        How accurate were the predictions historically? We ran the prediction engine at multiple points in the past using only data available at that time, then checked if the predicted direction matched what actually happened.
      </p>
      <p className="text-xs text-gray-500 mb-5">
        Walk-forward test on {symbol} daily data
        {metrics.dateRange.first && metrics.dateRange.last
          ? ` from ${metrics.dateRange.first} to ${metrics.dateRange.last}`
          : ''}
        {' '}(stride: {config.stride} bars)
      </p>

      {/* Headline hit rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <HitRateCard label="15-Day Hit Rate" metrics={metrics.shortTerm} />
        <HitRateCard label="62-Day Hit Rate" metrics={metrics.mediumTerm} />
      </div>

      {/* Direction accuracy table */}
      <div className="mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">
          Accuracy by Direction
        </div>
        <DirectionTable shortTerm={metrics.shortTerm} mediumTerm={metrics.mediumTerm} />
      </div>

      {/* Confidence calibration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <CalibrationChart calibration={metrics.shortTerm.calibration} label="15-Day" />
        <CalibrationChart calibration={metrics.mediumTerm.calibration} label="62-Day" />
      </div>

      {/* Collapsible test points */}
      <div>
        <button
          onClick={() => setShowTestPoints(!showTestPoints)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors font-mono"
        >
          {showTestPoints ? '▾ Hide' : '▸ Show'} {testPoints.length} Test Points
        </button>

        {showTestPoints && (
          <div className="mt-3 max-h-80 overflow-y-auto border border-chaos-600 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider sticky top-0 bg-chaos-800">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">15d Pred</th>
                  <th className="text-left py-2 px-3">15d Actual</th>
                  <th className="text-left py-2 px-3">62d Pred</th>
                  <th className="text-left py-2 px-3">62d Actual</th>
                </tr>
              </thead>
              <tbody>
                {testPoints.map((tp, i) => (
                  <TestPointRow key={i} point={tp} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        Backtest uses only daily data with no look-ahead bias. Past performance does not predict future results.
      </p>
    </div>
  );
}
