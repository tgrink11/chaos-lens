const CARD_CONFIG = {
  greed: {
    title: 'Greed',
    icon: '🔥',
    colorClass: 'border-fractal-green',
    bgClass: 'bg-green-500/5',
  },
  fear: {
    title: 'Fear',
    icon: '⚡',
    colorClass: 'border-fractal-red',
    bgClass: 'bg-red-500/5',
  },
  exhaustion: {
    title: 'Exhaustion',
    icon: '💤',
    colorClass: 'border-fractal-amber',
    bgClass: 'bg-amber-500/5',
  },
};

function BehaviorCard({ type, data }) {
  const config = CARD_CONFIG[type];
  if (!config || !data) return null;

  const scoreColor = data.score > 60 ? 'text-fractal-red' : data.score > 30 ? 'text-fractal-amber' : 'text-fractal-green';

  return (
    <div className={`rounded-xl p-5 border ${config.colorClass} ${config.bgClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <h3 className="text-sm font-semibold text-gray-200">{config.title}</h3>
        </div>
        <span className={`text-xl font-mono font-bold ${scoreColor}`}>
          {data.score}
        </span>
      </div>
      <div className="text-xs font-medium text-gray-300 mb-2">{data.intensity}</div>

      {/* Score bar */}
      <div className="h-1.5 bg-chaos-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${data.score}%`,
            backgroundColor: data.score > 60 ? '#ef4444' : data.score > 30 ? '#f59e0b' : '#22c55e',
          }}
        />
      </div>

      {/* Signals */}
      {data.signals?.length > 0 && (
        <ul className="space-y-1">
          {data.signals.map((s, i) => (
            <li key={i} className="text-xs text-gray-400 pl-2 border-l border-chaos-600">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BehaviorCards({ behavioralResults }) {
  if (!behavioralResults) return null;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-gray-200 mb-1 font-mono">Behavioral Signals</h2>
      <p className="text-xs text-gray-500 mb-4">
        These detect what traders are actually doing. <strong className="text-gray-400">Greed</strong> shows when buyers are overreaching (long upper wicks on candles). <strong className="text-gray-400">Fear</strong> shows panic selling (volume spikes on down moves). <strong className="text-gray-400">Exhaustion</strong> shows when volatility is drying up, often right before a big move.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BehaviorCard type="greed" data={behavioralResults.greed} />
        <BehaviorCard type="fear" data={behavioralResults.fear} />
        <BehaviorCard type="exhaustion" data={behavioralResults.exhaustion} />
      </div>

      {/* Bond signals */}
      {behavioralResults.bond?.signals?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-chaos-600">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Bond Signals</h3>
          <ul className="space-y-1">
            {behavioralResults.bond.signals.map((s, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <span className="text-fractal-cyan mt-0.5">●</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Commodity signals */}
      {behavioralResults.commodity?.signals?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-chaos-600">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Commodity Signals</h3>
          <ul className="space-y-1">
            {behavioralResults.commodity.signals.map((s, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <span className="text-fractal-purple mt-0.5">●</span> {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
