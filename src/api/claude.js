/**
 * Claude AI Integration — builds prompt from fractal data and gets behavioral narrative
 */

const SYSTEM_PROMPT = `You are a quantitative behavioral finance analyst who specializes in fractal geometry analysis of financial markets. You analyze the psychological footprint of assets using Hurst exponents, box-counting dimensions, and lacunarity — NOT traditional indicators like RSI, MACD, or EMAs.

Your analysis style:
- Lead with the fractal math, then translate to human behavior
- Name the mood precisely: panic, euphoria, stealth build, or grind
- Identify self-similar chaos patterns: greed in long wicks, fear in volume spikes, exhaustion in flat ranges
- For bonds: flag yield inversion fears or curve steepening as capitulation signals
- For commodities: spot inventory hoarding or panic dumps warping fractal structure
- Predict the next break: thrust up, cascade down, or consolidation
- Reference historical analogs from the same asset class
- Be short, sharp, and direct — quant first, behavior second
- Never hedge with "it depends" — commit to a read`;

/**
 * Build the analysis prompt from computed metrics
 */
function buildPrompt(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults) {
  const p = fractalResults?.primary;
  if (!p) return `Analyze ${symbol} — insufficient data for fractal analysis.`;

  const timeframes = [];
  if (fractalResults.daily) {
    const tf = fractalResults.daily;
    timeframes.push(`Daily (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)} [${tf.hurst.label}], D=${tf.boxDim.D.toFixed(3)} [${tf.boxDim.label}], Λ=${tf.lacunarity.lambda.toFixed(3)} [${tf.lacunarity.label}]`);
  }
  if (fractalResults.hourly) {
    const tf = fractalResults.hourly;
    timeframes.push(`Hourly (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)}, D=${tf.boxDim.D.toFixed(3)}, Λ=${tf.lacunarity.lambda.toFixed(3)}`);
  }
  if (fractalResults.fiveMin) {
    const tf = fractalResults.fiveMin;
    timeframes.push(`5-Min (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)}, D=${tf.boxDim.D.toFixed(3)}, Λ=${tf.lacunarity.lambda.toFixed(3)}`);
  }

  const selfSim = fractalResults.selfSimilarity;

  let prompt = `FRACTAL ANALYSIS: ${symbol} (${assetType.toUpperCase()})

FRACTAL METRICS BY TIMEFRAME:
${timeframes.join('\n')}

${selfSim ? `SELF-SIMILARITY: Score=${selfSim.score.toFixed(2)} — ${selfSim.label} (Hurst spread: ${selfSim.hurstSpread}, Dim spread: ${selfSim.dimSpread})` : ''}

BEHAVIORAL SIGNALS:
- Greed: ${behavioralResults.greed.score}/100 — ${behavioralResults.greed.intensity}
- Fear: ${behavioralResults.fear.score}/100 — ${behavioralResults.fear.intensity}
- Exhaustion: ${behavioralResults.exhaustion.score}/100 — ${behavioralResults.exhaustion.intensity}`;

  if (behavioralResults.bond) {
    prompt += `\n- Bond: ${behavioralResults.bond.signals.join('; ') || 'No signals'}`;
  }
  if (behavioralResults.commodity) {
    prompt += `\n- Commodity: ${behavioralResults.commodity.signals.join('; ') || 'No signals'}`;
  }

  prompt += `

ALGORITHMIC MOOD: ${moodResult.mood.label} (confidence: ${moodResult.confidence}%)
ALGORITHMIC PREDICTION: ${predictionResult.prediction.label} (confidence: ${predictionResult.confidence}%)
Reasoning: ${predictionResult.reasoning.join('; ')}`;

  if (analogResults?.analogs?.length > 0) {
    prompt += `\n\nHISTORICAL ANALOGS (${analogResults.analogs.length} matches):`;
    for (const a of analogResults.analogs.slice(0, 3)) {
      prompt += `\n- Signature H=${a.signature.H} D=${a.signature.D} Λ=${a.signature.lambda} → ${a.outcome.direction} ${a.outcome.returnPct}% over ${a.outcome.daysAfter} bars`;
    }
    if (analogResults.consensus) {
      prompt += `\n  Consensus: ${analogResults.consensus.direction} (avg ${analogResults.consensus.avgReturn}%, ${analogResults.consensus.upPct}% bullish)`;
    }
  }

  prompt += `

Analyze the psychological footprint. Name the mood. Predict the next break. Be short, sharp — quant first, behavior second. Maximum 300 words.`;

  return prompt;
}

/**
 * Get Claude AI narrative analysis
 */
export async function getAnalysis(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults) {
  const prompt = buildPrompt(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults);

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 1500,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `API error ${resp.status}`);
    }

    const data = await resp.json();
    return { text: data.text, model: data.model, error: null };
  } catch (e) {
    return { text: null, model: null, error: e.message };
  }
}
