export default function AnalysisNarrative({ analysis }) {
  if (!analysis) return null;

  const { text, model, error, loading } = analysis;

  return (
    <div className="bg-chaos-800 rounded-xl p-6 border border-chaos-600">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] font-mono">AI Fractal Analysis</h2>
          <p className="text-xs text-[#667085] mt-1">
            An AI reads all the fractal data, behavioral signals, and historical analogs above, then writes a plain-English interpretation of what it all means together.
          </p>
        </div>
        {model && (
          <span className="text-xs text-[#667085] font-mono bg-[#f0f2f5] px-2 py-1 rounded">
            {model}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="h-4 bg-chaos-700 rounded animate-shimmer w-full" />
          <div className="h-4 bg-chaos-700 rounded animate-shimmer w-5/6" />
          <div className="h-4 bg-chaos-700 rounded animate-shimmer w-4/6" />
          <div className="h-4 bg-chaos-700 rounded animate-shimmer w-5/6" />
          <div className="h-4 bg-chaos-700 rounded animate-shimmer w-3/6" />
        </div>
      )}

      {error && (
        <div className="text-sm text-fractal-red bg-red-500/10 rounded-lg p-4 border border-red-500/20">
          Analysis unavailable: {error}
        </div>
      )}

      {text && !loading && (
        <div className="prose prose-sm max-w-none">
          {text.split('\n').map((para, i) => {
            if (!para.trim()) return null;

            // Handle markdown-style headers
            if (para.startsWith('##')) {
              return (
                <h3 key={i} className="text-fractal-cyan font-semibold text-sm mt-4 mb-1 font-mono">
                  {para.replace(/^#+\s*/, '')}
                </h3>
              );
            }

            // Handle bullet points
            if (para.trim().startsWith('- ') || para.trim().startsWith('* ')) {
              return (
                <div key={i} className="text-sm text-[#344054] flex items-start gap-2 ml-2">
                  <span className="text-fractal-cyan mt-0.5">▸</span>
                  <span>{para.replace(/^[-*]\s*/, '')}</span>
                </div>
              );
            }

            // Bold text handling
            const formatted = para.replace(
              /\*\*(.*?)\*\*/g,
              '<strong class="text-[#1a1a1a]">$1</strong>'
            );

            return (
              <p
                key={i}
                className="text-sm text-[#344054] leading-relaxed mb-2"
                dangerouslySetInnerHTML={{ __html: formatted }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
