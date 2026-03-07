/**
 * Next-Break Prediction Engine
 *
 * Predicts: THRUST_UP | CASCADE_DOWN | CONSOLIDATION
 * Based on fractal dynamics + behavioral momentum
 */

const PREDICTIONS = {
  THRUST_UP: {
    key: 'THRUST_UP',
    label: 'Thrust Up',
    icon: '↑',
    color: '#22c55e',
    description: 'Fractal alignment signals breakout to the upside',
  },
  CASCADE_DOWN: {
    key: 'CASCADE_DOWN',
    label: 'Cascade Down',
    icon: '↓',
    color: '#ef4444',
    description: 'Fractal breakdown signals cascading decline',
  },
  CONSOLIDATION: {
    key: 'CONSOLIDATION',
    label: 'Consolidation',
    icon: '→',
    color: '#f59e0b',
    description: 'No clear fractal direction — expect sideways chop',
  },
};

/**
 * Predict next directional break
 * @param {Object} fractalResults - from fractals.js
 * @param {Object} behavioralResults - from behavioral.js
 * @param {Object} moodResult - from mood.js
 * @returns {{ prediction: Object, confidence: number, reasoning: string[] }}
 */
export function predictBreak(fractalResults, behavioralResults, moodResult) {
  const primary = fractalResults?.primary;
  if (!primary) {
    return {
      prediction: PREDICTIONS.CONSOLIDATION,
      confidence: 0,
      reasoning: ['Insufficient data for prediction'],
    };
  }

  const H = primary.hurst?.H ?? 0.5;
  const D = primary.boxDim?.D ?? 1.5;
  const L = primary.lacunarity?.lambda ?? 1;

  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;
  const moodKey = moodResult?.mood?.key ?? 'GRIND';

  const scores = { THRUST_UP: 0, CASCADE_DOWN: 0, CONSOLIDATION: 0 };
  const reasoning = [];

  // --- THRUST UP signals ---
  // Rising Hurst = increasing persistence = momentum building
  if (H > 0.6) {
    scores.THRUST_UP += 25;
    reasoning.push(`Hurst ${H.toFixed(2)} shows strong trend persistence`);
  } else if (H > 0.55) {
    scores.THRUST_UP += 10;
  }

  // Dropping box dimension = path smoothing = breakout forming
  if (D < 1.3) {
    scores.THRUST_UP += 20;
    reasoning.push(`Box dimension ${D.toFixed(2)} — price path smoothing toward breakout`);
  }

  // Stealth build → thrust up is the classic sequence
  if (moodKey === 'STEALTH_BUILD') {
    scores.THRUST_UP += 15;
    reasoning.push('Stealth accumulation detected — precursor to thrust');
  }

  // Exhaustion + low fear = coiling spring, likely up
  if (exhaustion > 40 && fear < 20) {
    scores.THRUST_UP += 15;
    reasoning.push('Volatility compression with no fear — spring coiling');
  }

  // Moderate greed without extreme = healthy momentum
  if (greed > 20 && greed < 60) {
    scores.THRUST_UP += 10;
  }

  // --- CASCADE DOWN signals ---
  // Hurst dropping below 0.5 = anti-persistence = trend breaking
  if (H < 0.4) {
    scores.CASCADE_DOWN += 25;
    reasoning.push(`Hurst ${H.toFixed(2)} — anti-persistent, mean reversion dominating`);
  } else if (H < 0.45) {
    scores.CASCADE_DOWN += 12;
  }

  // High box dimension = noisy chaos = structure breaking
  if (D > 1.65) {
    scores.CASCADE_DOWN += 20;
    reasoning.push(`Box dimension ${D.toFixed(2)} — chaotic structure, breakdown risk`);
  }

  // Lacunarity spiking = gap clustering = air pockets forming
  if (L > 1.7) {
    scores.CASCADE_DOWN += 15;
    reasoning.push(`Lacunarity ${L.toFixed(2)} — gap clustering, air pockets in structure`);
  }

  // High fear = panic selling underway
  if (fear > 50) {
    scores.CASCADE_DOWN += 20;
    reasoning.push('Fear signals elevated — selling pressure intensifying');
  } else if (fear > 30) {
    scores.CASCADE_DOWN += 10;
  }

  // Bond inversion = macro headwinds
  if (behavioralResults?.bond?.inverted) {
    scores.CASCADE_DOWN += 10;
    reasoning.push('Yield curve inverted — macro stress signal');
  }

  // --- CONSOLIDATION signals ---
  // Hurst near 0.5 = random walk = no directional edge
  if (H > 0.45 && H < 0.55) {
    scores.CONSOLIDATION += 20;
    reasoning.push(`Hurst ${H.toFixed(2)} — random walk territory, no directional edge`);
  }

  // Box dimension in the middle = typical market noise
  if (D > 1.35 && D < 1.6) {
    scores.CONSOLIDATION += 15;
  }

  // Low behavioral signals across the board
  if (greed < 25 && fear < 25 && exhaustion < 25) {
    scores.CONSOLIDATION += 20;
    reasoning.push('No strong behavioral signals — market in equilibrium');
  }

  // Grind mood = consolidation likely
  if (moodKey === 'GRIND') {
    scores.CONSOLIDATION += 15;
  }

  // Cross-timeframe agreement boosts confidence
  const selfSim = fractalResults?.selfSimilarity?.score ?? 0;
  if (selfSim > 0.7) {
    reasoning.push('High cross-timeframe self-similarity reinforces signal');
  }

  // Pick winner
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = entries[0];
  const [, secondScore] = entries[1];

  const gap = topScore - secondScore;
  let confidence = Math.round(topScore * 0.8 + gap * 0.5);

  // Boost confidence if fractals agree across timeframes
  if (selfSim > 0.7) confidence = Math.min(95, confidence + 10);

  confidence = Math.max(5, Math.min(95, confidence));

  return {
    prediction: PREDICTIONS[topKey],
    confidence,
    reasoning: reasoning.slice(0, 6),
  };
}

export { PREDICTIONS };
