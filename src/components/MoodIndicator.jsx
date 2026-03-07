export default function MoodIndicator({ moodResult }) {
  if (!moodResult?.mood) return null;

  const { mood, confidence, scores } = moodResult;

  // Sort scores for bar chart
  const sortedScores = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      label: key.replace('_', ' '),
      value,
      isTop: key === mood.key,
    }));

  const maxScore = Math.max(...sortedScores.map(s => s.value), 1);

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      {/* Main mood display */}
      <div className="text-center mb-6">
        <div
          className="inline-flex items-center gap-3 px-6 py-3 rounded-full animate-fractal-pulse"
          style={{ backgroundColor: mood.color + '20', border: `2px solid ${mood.color}` }}
        >
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: mood.color }} />
          <span className="text-2xl font-bold font-mono" style={{ color: mood.color }}>
            {mood.label}
          </span>
        </div>
        <div className="mt-2 text-sm text-gray-400">{mood.description}</div>
        <div className="mt-1 text-xs text-gray-500">
          Confidence: <span className="font-mono text-gray-300">{confidence}%</span>
        </div>
      </div>

      {/* Mood score bars */}
      <div className="space-y-2">
        {sortedScores.map(s => (
          <div key={s.key} className="flex items-center gap-3">
            <span className={`text-xs w-24 text-right ${s.isTop ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>
              {s.label}
            </span>
            <div className="flex-1 h-2 bg-chaos-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(s.value / maxScore) * 100}%`,
                  backgroundColor: s.isTop ? mood.color : '#475569',
                }}
              />
            </div>
            <span className={`text-xs font-mono w-8 ${s.isTop ? 'text-gray-200' : 'text-gray-500'}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
