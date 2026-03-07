import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const METRIC_COLORS = {
  hurst: '#06b6d4',
  boxDim: '#a855f7',
  lacunarity: '#f59e0b',
};

export default function TimeframeChart({ fractalResults }) {
  if (!fractalResults) return null;

  const timeframes = ['daily', 'hourly', 'fiveMin'];
  const timeframeLabels = { daily: 'Daily', hourly: 'Hourly', fiveMin: '5-Min' };

  // Build comparison data
  const hurstData = [];
  const dimData = [];
  const lacData = [];

  for (const tf of timeframes) {
    if (!fractalResults[tf]) continue;
    const label = timeframeLabels[tf];
    hurstData.push({ name: label, value: fractalResults[tf].hurst.H });
    dimData.push({ name: label, value: fractalResults[tf].boxDim.D });
    lacData.push({ name: label, value: fractalResults[tf].lacunarity.lambda });
  }

  if (hurstData.length === 0) return null;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-gray-200 mb-1 font-mono">Multi-Timeframe Fractal Comparison</h2>
      <p className="text-xs text-gray-500 mb-4">
        This compares the fractal metrics across different time scales (daily, hourly, 5-minute). When all timeframes show similar values, it means the pattern is consistent at every zoom level — a strong signal. When they disagree, the market behaves differently at different scales.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricBar data={hurstData} label="Hurst (H)" color={METRIC_COLORS.hurst} domain={[0, 1]} refLine={0.5} />
        <MetricBar data={dimData} label="Box Dim (D)" color={METRIC_COLORS.boxDim} domain={[1, 2]} refLine={1.5} />
        <MetricBar data={lacData} label="Lacunarity (Λ)" color={METRIC_COLORS.lacunarity} domain={[1, 3]} refLine={1.5} />
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4 text-xs text-gray-500">
        <span>Dashed line = neutral reference</span>
      </div>
    </div>
  );
}

function MetricBar({ data, label, color, domain, refLine }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-300 mb-2 text-center" style={{ color }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#e5e7eb',
            }}
            formatter={(value) => [value.toFixed(3), label]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={color} fillOpacity={0.7 + idx * 0.1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
