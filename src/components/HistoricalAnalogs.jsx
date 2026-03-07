export default function HistoricalAnalogs({ analogResults }) {
  if (!analogResults?.analogs?.length) return null;

  const { analogs, consensus } = analogResults;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-gray-200 mb-1 font-mono">Historical Analogs</h2>
      <p className="text-xs text-gray-500 mb-4">
        We searched through this asset's own price history to find past periods where the fractal pattern looked like it does right now. The table below shows what happened next in those similar episodes — giving a data-driven sense of what may follow.
      </p>

      {/* Consensus summary */}
      {consensus && (
        <div className="mb-4 p-4 rounded-lg bg-chaos-700 border border-chaos-600">
          <div className="flex items-center gap-4">
            <div className={`text-lg font-bold font-mono ${
              consensus.direction === 'UP' ? 'text-fractal-green'
                : consensus.direction === 'DOWN' ? 'text-fractal-red'
                  : 'text-fractal-amber'
            }`}>
              {consensus.direction === 'UP' ? '↑' : consensus.direction === 'DOWN' ? '↓' : '↔'}
              {' '}{consensus.direction}
            </div>
            <div className="text-sm text-gray-300">
              Avg return: <span className="font-mono font-semibold">{consensus.avgReturn > 0 ? '+' : ''}{consensus.avgReturn}%</span>
            </div>
            <div className="text-sm text-gray-400">
              Bullish: <span className="font-mono">{consensus.upPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Analog table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-chaos-600">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-center py-2 px-2">H</th>
              <th className="text-center py-2 px-2">D</th>
              <th className="text-center py-2 px-2">Λ</th>
              <th className="text-center py-2 px-2">Direction</th>
              <th className="text-right py-2 px-2">Return</th>
              <th className="text-right py-2 px-2">Max Up</th>
              <th className="text-right py-2 px-2">Max Down</th>
            </tr>
          </thead>
          <tbody>
            {analogs.map((a, i) => (
              <tr key={i} className="border-b border-chaos-700 hover:bg-chaos-700/50">
                <td className="py-2 px-2 text-gray-400 font-mono">{i + 1}</td>
                <td className="py-2 px-2 text-center font-mono text-gray-300">{a.signature.H}</td>
                <td className="py-2 px-2 text-center font-mono text-gray-300">{a.signature.D}</td>
                <td className="py-2 px-2 text-center font-mono text-gray-300">{a.signature.lambda}</td>
                <td className="py-2 px-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    a.outcome.direction === 'UP' ? 'bg-green-500/20 text-fractal-green'
                      : a.outcome.direction === 'DOWN' ? 'bg-red-500/20 text-fractal-red'
                        : 'bg-amber-500/20 text-fractal-amber'
                  }`}>
                    {a.outcome.direction}
                  </span>
                </td>
                <td className={`py-2 px-2 text-right font-mono ${
                  a.outcome.returnPct >= 0 ? 'text-fractal-green' : 'text-fractal-red'
                }`}>
                  {a.outcome.returnPct > 0 ? '+' : ''}{a.outcome.returnPct}%
                </td>
                <td className="py-2 px-2 text-right font-mono text-fractal-green">
                  +{a.outcome.maxUpside}%
                </td>
                <td className="py-2 px-2 text-right font-mono text-fractal-red">
                  {a.outcome.maxDownside}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Analogs matched by Euclidean distance in fractal space (H, D, Λ). Outcomes measured over {analogs[0]?.outcome?.daysAfter || 20} subsequent bars.
      </div>
    </div>
  );
}
