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

/**
 * Horizon-specific directional predictions for novice investors
 *
 * 15-day (short-term): weights intraday fractals, sensitive to fear/greed
 * 62-day (medium-term): weights daily fractals, uses analog consensus
 */

const SUMMARIES = {
  bullish: {
    shortTerm: [
      'Short-term momentum patterns suggest upward price pressure over the next 2 weeks.',
      'Buying interest is building in the short term — fractal patterns lean bullish for the next 15 days.',
      'Near-term price structure looks constructive, with patterns favoring higher prices ahead.',
    ],
    mediumTerm: [
      'Structural patterns support a bullish bias over the next 2 months.',
      'The broader trend structure favors upside — fractal alignment points higher over 62 days.',
      'Medium-term fractal geometry is constructive, suggesting gradual upward movement.',
    ],
  },
  bearish: {
    shortTerm: [
      'Short-term patterns show selling pressure — expect potential downside over the next 2 weeks.',
      'Near-term fractal structure is deteriorating, suggesting lower prices in the next 15 days.',
      'Caution warranted — short-term patterns indicate downward momentum building.',
    ],
    mediumTerm: [
      'Structural fractal patterns suggest downside risk over the next 2 months.',
      'The broader trend is weakening — be cautious of further declines over 62 days.',
      'Medium-term patterns are breaking down, favoring a move lower.',
    ],
  },
  neutral: {
    shortTerm: [
      'No clear short-term direction — expect choppy, sideways action over the next 2 weeks.',
      'The near-term picture is mixed — patterns suggest range-bound trading for 15 days.',
      'Short-term signals are conflicting — best to wait for a clearer setup.',
    ],
    mediumTerm: [
      'No strong directional signal over the next 2 months — the market may trade sideways.',
      'Medium-term patterns are balanced — no clear edge in either direction for 62 days.',
      'The structural picture is indecisive — expect consolidation over the coming months.',
    ],
  },
};

function pickSummary(direction, horizon) {
  const pool = SUMMARIES[direction]?.[horizon] || SUMMARIES.neutral[horizon];
  return pool[Math.floor(Math.random() * pool.length)];
}

function getMetrics(fractalResults, timeframeKey) {
  const tf = fractalResults?.[timeframeKey];
  if (!tf) return null;
  return {
    H: tf.hurst?.H ?? 0.5,
    D: tf.boxDim?.D ?? 1.5,
    L: tf.lacunarity?.lambda ?? 1,
  };
}

/**
 * Predict directional outlook for 15-day and 62-day horizons
 * @param {Object} fractalResults - from fractals.js
 * @param {Object} behavioralResults - from behavioral.js
 * @param {Object} moodResult - from mood.js
 * @param {Object} analogResults - from analogs.js
 * @returns {{ shortTerm: Object, mediumTerm: Object }}
 */
export function predictHorizons(fractalResults, behavioralResults, moodResult, analogResults) {
  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;
  const moodKey = moodResult?.mood?.key ?? 'GRIND';

  // --- 15-DAY (short-term) ---
  // Prefer intraday fractals; fall back to daily
  const fast = getMetrics(fractalResults, 'fiveMin')
    || getMetrics(fractalResults, 'hourly')
    || getMetrics(fractalResults, 'daily');

  let shortBull = 0, shortBear = 0;

  if (fast) {
    // Persistent trend = bullish momentum
    if (fast.H > 0.58) shortBull += 25;
    else if (fast.H > 0.52) shortBull += 10;
    if (fast.H < 0.42) shortBear += 25;
    else if (fast.H < 0.48) shortBear += 10;

    // Smooth path = breakout forming (bullish); chaotic = breakdown
    if (fast.D < 1.35) shortBull += 15;
    if (fast.D > 1.6) shortBear += 15;

    // High lacunarity = clustering (can go either way, but with fear = bearish)
    if (fast.L > 1.5 && fear > 30) shortBear += 10;
    if (fast.L > 1.5 && greed > 30) shortBull += 10;
  }

  // Behavioral signals matter more on short horizon
  if (greed > 40) shortBull += 15;
  if (fear > 40) shortBear += 20;
  if (exhaustion > 50 && fear < 20) shortBull += 10; // coiling spring

  // Mood influence
  if (moodKey === 'EUPHORIA') shortBull += 15;
  if (moodKey === 'PANIC') shortBear += 20;
  if (moodKey === 'STEALTH_BUILD') shortBull += 10;

  const shortNet = shortBull - shortBear;
  const shortTotal = shortBull + shortBear || 1;

  let shortDirection, shortConfidence;
  if (shortNet > 10) {
    shortDirection = 'bullish';
    shortConfidence = Math.min(90, 50 + Math.round((shortNet / shortTotal) * 50));
  } else if (shortNet < -10) {
    shortDirection = 'bearish';
    shortConfidence = Math.min(90, 50 + Math.round((Math.abs(shortNet) / shortTotal) * 50));
  } else {
    shortDirection = 'neutral';
    shortConfidence = Math.max(30, 50 - Math.abs(shortNet) * 2);
  }

  // --- 62-DAY (medium-term) ---
  // Prefer daily fractals
  const slow = getMetrics(fractalResults, 'daily')
    || getMetrics(fractalResults, 'hourly');

  let medBull = 0, medBear = 0;

  if (slow) {
    if (slow.H > 0.6) medBull += 25;
    else if (slow.H > 0.53) medBull += 12;
    if (slow.H < 0.4) medBear += 25;
    else if (slow.H < 0.47) medBear += 12;

    if (slow.D < 1.3) medBull += 15;
    if (slow.D > 1.65) medBear += 15;

    // High lacunarity on daily = structural accumulation or distribution
    if (slow.L > 1.5) {
      if (moodKey === 'STEALTH_BUILD') medBull += 15;
      else if (moodKey === 'PANIC') medBear += 15;
    }
  }

  // Structural mood matters more on medium horizon
  if (moodKey === 'EUPHORIA') medBull += 10;
  if (moodKey === 'PANIC') medBear += 15;
  if (moodKey === 'STEALTH_BUILD') medBull += 15;

  // Historical analogs carry weight for medium-term
  if (analogResults?.consensus) {
    const { direction, avgReturn, confidence } = analogResults.consensus;
    const analogWeight = Math.min(20, Math.round(confidence * 0.2));
    if (direction === 'UP' && avgReturn > 0) medBull += analogWeight;
    else if (direction === 'DOWN' && avgReturn < 0) medBear += analogWeight;
  }

  // Bond inversion = medium-term headwind
  if (behavioralResults?.bond?.inverted) medBear += 10;

  const medNet = medBull - medBear;
  const medTotal = medBull + medBear || 1;

  let medDirection, medConfidence;
  if (medNet > 10) {
    medDirection = 'bullish';
    medConfidence = Math.min(90, 50 + Math.round((medNet / medTotal) * 50));
  } else if (medNet < -10) {
    medDirection = 'bearish';
    medConfidence = Math.min(90, 50 + Math.round((Math.abs(medNet) / medTotal) * 50));
  } else {
    medDirection = 'neutral';
    medConfidence = Math.max(30, 50 - Math.abs(medNet) * 2);
  }

  return {
    shortTerm: {
      direction: shortDirection,
      confidence: shortConfidence,
      summary: pickSummary(shortDirection, 'shortTerm'),
      days: 15,
    },
    mediumTerm: {
      direction: medDirection,
      confidence: medConfidence,
      summary: pickSummary(medDirection, 'mediumTerm'),
      days: 62,
    },
  };
}

export { PREDICTIONS };
