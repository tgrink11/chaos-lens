export default function PredictionPanel({ predictionResult }) {
  if (!predictionResult?.prediction) return null;

  const { prediction, confidence, reasoning } = predictionResult;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <h2 className="text-lg font-semibold text-[#1a1a1a] mb-1 font-mono">Next Break Prediction</h2>
      <p className="text-xs text-[#667085] mb-4">
        Based on all the fractal and behavioral signals above, this predicts the most likely next significant move. <strong className="text-[#667085]">Thrust Up</strong> = breakout higher, <strong className="text-[#667085]">Cascade Down</strong> = sharp decline, <strong className="text-[#667085]">Consolidation</strong> = sideways choppy action.
      </p>

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
          <div className="text-xs text-[#667085] mt-0.5">{prediction.description}</div>
        </div>

        {/* Confidence */}
        <div className="ml-auto text-center">
          <div className="text-2xl font-mono font-bold text-[#1a1a1a]">{confidence}%</div>
          <div className="text-xs text-[#667085]">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-2 bg-[#e8eaed] rounded-full overflow-hidden mb-4">
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
          <h3 className="text-xs font-semibold text-[#667085] uppercase tracking-wider">Signal Breakdown</h3>
          {reasoning.map((r, i) => (
            <div key={i} className="text-sm text-[#344054] flex items-start gap-2">
              <span style={{ color: prediction.color }} className="mt-0.5 text-xs">▸</span>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
