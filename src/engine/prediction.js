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
export function predictBreak(fractalResults, behavioralResults, moodResult, dailyCloses) {
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

  // Determine recent price direction — HIGH HURST MEANS PERSISTENT, NOT BULLISH
  // A persistent downtrend has high H too. We must check direction.
  let recentReturn = 0;
  if (dailyCloses && dailyCloses.length >= 15) {
    const recent = dailyCloses.slice(-15);
    recentReturn = (recent[recent.length - 1] - recent[0]) / recent[0];
  }
  const trendingUp = recentReturn > 0.005;
  const trendingDown = recentReturn < -0.005;

  const scores = { THRUST_UP: 0, CASCADE_DOWN: 0, CONSOLIDATION: 0 };
  const reasoning = [];

  // --- HIGH HURST: PERSISTENT TREND (direction matters!) ---
  if (H > 0.6) {
    if (trendingUp) {
      scores.THRUST_UP += 25;
      reasoning.push(`Hurst ${H.toFixed(2)} persistent + uptrend → bullish momentum`);
    } else if (trendingDown) {
      scores.CASCADE_DOWN += 25;
      reasoning.push(`Hurst ${H.toFixed(2)} persistent + downtrend → bearish momentum`);
    } else {
      scores.CONSOLIDATION += 10;
    }
  } else if (H > 0.55) {
    if (trendingUp) scores.THRUST_UP += 10;
    else if (trendingDown) scores.CASCADE_DOWN += 10;
  }

  // Dropping box dimension = smooth price path
  if (D < 1.3) {
    if (trendingUp) {
      scores.THRUST_UP += 20;
      reasoning.push(`Box dimension ${D.toFixed(2)} — smooth uptrend, breakout forming`);
    } else if (trendingDown) {
      scores.CASCADE_DOWN += 20;
      reasoning.push(`Box dimension ${D.toFixed(2)} — smooth decline, further downside risk`);
    } else {
      scores.THRUST_UP += 8;
    }
  }

  // Stealth build → thrust up is the classic sequence
  if (moodKey === 'STEALTH_BUILD') {
    scores.THRUST_UP += 15;
    reasoning.push('Stealth accumulation detected — precursor to thrust');
  }

  // Exhaustion + low fear = coiling spring
  if (exhaustion > 40 && fear < 20) {
    if (trendingDown) {
      scores.CASCADE_DOWN += 8;
    } else {
      scores.THRUST_UP += 15;
      reasoning.push('Volatility compression with no fear — spring coiling');
    }
  }

  // Moderate greed without extreme = healthy momentum (only if trending up)
  if (greed > 20 && greed < 60 && !trendingDown) {
    scores.THRUST_UP += 10;
  }

  // --- CASCADE DOWN signals ---
  // Low Hurst = anti-persistence = mean reversion
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

  // Direct price momentum — strong recent declines bias cascade
  if (recentReturn < -0.05) {
    scores.CASCADE_DOWN += 15;
    reasoning.push(`Price down ${(recentReturn * 100).toFixed(1)}% recently — selling pressure`);
  } else if (recentReturn < -0.02) {
    scores.CASCADE_DOWN += 8;
  }

  // Bond inversion = macro headwinds
  if (behavioralResults?.bond?.inverted) {
    scores.CASCADE_DOWN += 10;
    reasoning.push('Yield curve inverted — macro stress signal');
  }

  // Regime change from mood classifier
  if (moodResult?.regimeChange?.direction === 'breaking_down') {
    scores.CASCADE_DOWN += 12;
    reasoning.push('Regime shift detected — trend structure weakening');
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

import { computeHurst } from './hurst.js';
import { computeBoxDimension } from './boxcounting.js';
import { computeLacunarity } from './lacunarity.js';

/**
 * Compute fractal metrics on a specific slice of price data
 */
function computeSliceMetrics(prices) {
  if (!prices || prices.length < 20) return null;
  return {
    H: computeHurst(prices).H,
    D: computeBoxDimension(prices).D,
    L: computeLacunarity(prices).lambda,
  };
}

/**
 * Analyze recent price momentum from raw daily closes
 * Returns: { recentReturn, recentVolatility, trendStrength }
 */
function analyzeMomentum(closes) {
  if (!closes || closes.length < 20) return { recentReturn: 0, recentVolatility: 0, trendStrength: 0 };

  // 15-day return
  const n = closes.length;
  const recent15 = closes.slice(-15);
  const recentReturn = recent15.length > 1
    ? (recent15[recent15.length - 1] - recent15[0]) / recent15[0]
    : 0;

  // Recent volatility (15-day)
  const returns = [];
  for (let i = 1; i < recent15.length; i++) {
    if (recent15[i - 1] > 0) returns.push(Math.log(recent15[i] / recent15[i - 1]));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const recentVolatility = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length || 1));

  // Trend strength: ratio of net move to total path distance
  let pathLength = 0;
  for (let i = 1; i < recent15.length; i++) {
    pathLength += Math.abs(recent15[i] - recent15[i - 1]);
  }
  const netMove = Math.abs(recent15[recent15.length - 1] - recent15[0]);
  const trendStrength = pathLength > 0 ? netMove / pathLength : 0;

  return { recentReturn, recentVolatility, trendStrength };
}

/**
 * Predict directional outlook for 15-day and 62-day horizons
 *
 * KEY DIFFERENTIATION: Short-term uses recent 30-bar window fractals + momentum.
 * Medium-term uses full-series fractals + analog consensus + structural signals.
 * This ensures genuinely different results even from the same daily data.
 */
export function predictHorizons(fractalResults, behavioralResults, moodResult, analogResults, dailyCloses) {
  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;
  const moodKey = moodResult?.mood?.key ?? 'GRIND';

  // ============================================================
  // 15-DAY: Recent window fractals + behavioral momentum
  // ============================================================
  // Compute fractals on just the RECENT 30 bars (captures current regime)
  const recentSlice = dailyCloses?.slice(-30) || [];
  const recentMetrics = computeSliceMetrics(recentSlice);

  // Also try intraday if available
  const intradayMetrics = fractalResults?.fiveMin
    ? { H: fractalResults.fiveMin.hurst.H, D: fractalResults.fiveMin.boxDim.D, L: fractalResults.fiveMin.lacunarity.lambda }
    : fractalResults?.hourly
      ? { H: fractalResults.hourly.hurst.H, D: fractalResults.hourly.boxDim.D, L: fractalResults.hourly.lacunarity.lambda }
      : null;

  // Blend: prefer intraday, weight recent daily heavily
  const shortMetrics = intradayMetrics || recentMetrics;

  // Recent price momentum (directly observable)
  const momentum = analyzeMomentum(dailyCloses);

  let shortBull = 0, shortBear = 0;

  if (shortMetrics) {
    // HIGH HURST = PERSISTENT, NOT BULLISH. Direction must be checked.
    if (shortMetrics.H > 0.58) {
      if (momentum.recentReturn >= 0) shortBull += 20;
      else shortBear += 20; // Persistent DOWNTREND
    } else if (shortMetrics.H > 0.52) {
      if (momentum.recentReturn >= 0) shortBull += 8;
      else shortBear += 8;
    }
    if (shortMetrics.H < 0.42) shortBear += 15; // Anti-persistent = reversal risk
    else if (shortMetrics.H < 0.48) shortBear += 6;

    // Smooth path (low D) amplifies the current direction
    if (shortMetrics.D < 1.35) {
      if (momentum.recentReturn >= 0) shortBull += 12;
      else shortBear += 12;
    }
    if (shortMetrics.D > 1.6) shortBear += 12; // Chaos = breakdown risk

    if (shortMetrics.L > 1.5 && fear > 25) shortBear += 10;
    if (shortMetrics.L > 1.5 && greed > 25) shortBull += 10;
  }

  // Recent momentum is a STRONG short-term signal
  if (momentum.recentReturn > 0.05) shortBull += 20;
  else if (momentum.recentReturn > 0.02) shortBull += 12;
  else if (momentum.recentReturn < -0.05) shortBear += 20;
  else if (momentum.recentReturn < -0.02) shortBear += 12;

  // Trend strength matters short-term (efficient path = continuation likely)
  if (momentum.trendStrength > 0.6) {
    if (momentum.recentReturn > 0) shortBull += 10;
    else shortBear += 10;
  }

  // Behavioral signals hit harder short-term
  if (greed > 50) shortBull += 15;
  else if (greed > 30) shortBull += 8;
  if (fear > 50) shortBear += 18;
  else if (fear > 30) shortBear += 10;

  // Exhaustion + compression = spring (short-term breakout, direction from momentum)
  if (exhaustion > 40 && fear < 20) {
    if (momentum.recentReturn >= 0) shortBull += 12;
    else shortBear += 8;
  }

  // Mood bonuses — but suppress EUPHORIA bonus if prices are actually falling
  if (moodKey === 'EUPHORIA' && momentum.recentReturn >= 0) shortBull += 10;
  if (moodKey === 'PANIC') shortBear += 15;

  // Regime change from mood classifier
  if (moodResult?.regimeChange?.direction === 'breaking_down') {
    shortBear += 12;
  }

  const shortNet = shortBull - shortBear;
  const shortMax = Math.max(shortBull, shortBear, 1);

  let shortDirection, shortConfidence;
  if (shortNet > 8) {
    shortDirection = 'bullish';
    shortConfidence = Math.min(90, 45 + Math.round((shortBull / shortMax) * 35 + Math.abs(shortNet) * 0.3));
  } else if (shortNet < -8) {
    shortDirection = 'bearish';
    shortConfidence = Math.min(90, 45 + Math.round((shortBear / shortMax) * 35 + Math.abs(shortNet) * 0.3));
  } else {
    shortDirection = 'neutral';
    shortConfidence = Math.max(25, 45 - Math.abs(shortNet) * 2);
  }

  // ============================================================
  // 62-DAY: Full-series structural fractals + analogs + macro
  // ============================================================
  // Use the FULL daily series (captures long-term structure)
  const fullMetrics = fractalResults?.daily
    ? { H: fractalResults.daily.hurst.H, D: fractalResults.daily.boxDim.D, L: fractalResults.daily.lacunarity.lambda }
    : null;

  // Also compute a medium-window (last 90 bars) for transition detection
  const medSlice = dailyCloses?.slice(-90) || [];
  const medWindowMetrics = computeSliceMetrics(medSlice);

  let medBull = 0, medBear = 0;

  // For medium-term, compute a 62-day return for direction context
  let medReturn = 0;
  if (dailyCloses && dailyCloses.length >= 62) {
    const slice62 = dailyCloses.slice(-62);
    medReturn = (slice62[slice62.length - 1] - slice62[0]) / slice62[0];
  } else if (dailyCloses && dailyCloses.length >= 30) {
    const slice = dailyCloses.slice(-30);
    medReturn = (slice[slice.length - 1] - slice[0]) / slice[0];
  }

  if (fullMetrics) {
    // Full-series Hurst: structural persistence — direction matters!
    if (fullMetrics.H > 0.6) {
      if (medReturn >= 0) medBull += 20;
      else medBear += 15; // Persistent downtrend structurally
    } else if (fullMetrics.H > 0.53) {
      if (medReturn >= 0) medBull += 10;
      else medBear += 8;
    }
    if (fullMetrics.H < 0.4) medBear += 20;
    else if (fullMetrics.H < 0.47) medBear += 10;

    if (fullMetrics.D < 1.3) {
      if (medReturn >= 0) medBull += 12;
      else medBear += 8;
    }
    if (fullMetrics.D > 1.65) medBear += 12;

    // Structural lacunarity
    if (fullMetrics.L > 1.5) {
      if (moodKey === 'STEALTH_BUILD') medBull += 12;
      else if (moodKey === 'PANIC') medBear += 12;
    }
  }

  // Regime transition: compare recent-90 vs full-series Hurst
  if (medWindowMetrics && fullMetrics) {
    const hurstShift = medWindowMetrics.H - fullMetrics.H;
    // If recent regime is MORE persistent than long-term = strengthening trend
    if (hurstShift > 0.08) medBull += 12;
    // If recent regime is LESS persistent = weakening, potential reversal
    else if (hurstShift < -0.08) medBear += 12;

    // Dimension divergence: recent getting smoother = trend building
    const dimShift = medWindowMetrics.D - fullMetrics.D;
    if (dimShift < -0.1) medBull += 8;
    else if (dimShift > 0.1) medBear += 8;
  }

  // Mood is more structural for medium-term — but only trust EUPHORIA if prices confirm
  if (moodKey === 'EUPHORIA' && medReturn >= 0) medBull += 8;
  if (moodKey === 'PANIC') medBear += 12;
  if (moodKey === 'STEALTH_BUILD') medBull += 15;
  if (moodKey === 'GRIND') { /* neutral, no bias */ }

  // Regime change from mood classifier
  if (moodResult?.regimeChange?.direction === 'breaking_down') {
    medBear += 10;
  }

  // Historical analogs are the KEY differentiator for medium-term
  if (analogResults?.consensus) {
    const { direction, avgReturn, confidence: analogConf } = analogResults.consensus;
    const analogWeight = Math.min(25, Math.round((analogConf || 0) * 0.25));
    if (direction === 'UP' && avgReturn > 0) medBull += analogWeight;
    else if (direction === 'DOWN' && avgReturn < 0) medBear += analogWeight;
  }

  // Bond inversion = medium-term structural headwind
  if (behavioralResults?.bond?.inverted) medBear += 12;
  if (behavioralResults?.bond?.steepening) medBull += 8;

  // Commodity hoarding = medium-term bullish for that commodity
  if (behavioralResults?.commodity?.hoarding) medBull += 10;
  if (behavioralResults?.commodity?.panicDump) medBear += 10;

  const medNet = medBull - medBear;
  const medMax = Math.max(medBull, medBear, 1);

  let medDirection, medConfidence;
  if (medNet > 8) {
    medDirection = 'bullish';
    medConfidence = Math.min(90, 45 + Math.round((medBull / medMax) * 35 + Math.abs(medNet) * 0.3));
  } else if (medNet < -8) {
    medDirection = 'bearish';
    medConfidence = Math.min(90, 45 + Math.round((medBear / medMax) * 35 + Math.abs(medNet) * 0.3));
  } else {
    medDirection = 'neutral';
    medConfidence = Math.max(25, 45 - Math.abs(medNet) * 2);
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
