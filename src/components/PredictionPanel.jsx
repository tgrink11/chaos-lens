export default function PredictionPanel({ predictionResult }) {
  if (!predictionResult?.prediction) return null;

  const { prediction, confidence, reasoning } = predictionResult;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-gray-200 mb-4 font-mono">Next Break Prediction</h2>

      <div className="flex items-center gap-4 mb-4">
        {/* Direction arrow */}
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: prediction.color + '20', color: prediction.color }}
        >
          {prediction.icon}
        </div>

        <div>
          <div className="text-xl font-bold font-mono" style={{ color: prediction.color }}>
            {prediction.label}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{prediction.description}</div>
        </div>

        {/* Confidence */}
        <div className="ml-auto text-center">
          <div className="text-2xl font-mono font-bold text-gray-200">{confidence}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-2 bg-chaos-700 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${confidence}%`,
            backgroundColor: prediction.color,
          }}
        />
      </div>

      {/* Reasoning */}
      {reasoning?.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Signal Breakdown</h3>
          {reasoning.map((r, i) => (
            <div key={i} className="text-sm text-gray-300 flex items-start gap-2">
              <span style={{ color: prediction.color }} className="mt-0.5 text-xs">▸</span>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
