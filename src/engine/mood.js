/**
 * Mood Classifier — synthesizes fractal metrics + behavioral signals into a single mood
 *
 * Moods: PANIC | EUPHORIA | STEALTH_BUILD | GRIND
 */

const MOODS = {
  PANIC: {
    key: 'PANIC',
    label: 'Panic',
    color: '#ef4444',
    description: 'Fear-driven selling cascade — fractals breaking down, volume exploding',
  },
  EUPHORIA: {
    key: 'EUPHORIA',
    label: 'Euphoria',
    color: '#22c55e',
    description: 'Greed-driven momentum — persistent trending, wick overextension',
  },
  STEALTH_BUILD: {
    key: 'STEALTH_BUILD',
    label: 'Stealth Build',
    color: '#a855f7',
    description: 'Quiet accumulation — clustered gaps, low volume, hidden structure',
  },
  GRIND: {
    key: 'GRIND',
    label: 'Grind',
    color: '#f59e0b',
    description: 'Directionless chop — random walk, uniform distribution, no edge',
  },
};

/**
 * Classify the current market mood
 * @param {Object} fractalResults - from fractals.js
 * @param {Object} behavioralResults - from behavioral.js
 * @returns {{ mood: Object, confidence: number, scores: Object }}
 */
export function classifyMood(fractalResults, behavioralResults) {
  const primary = fractalResults?.primary;
  if (!primary) {
    return { mood: MOODS.GRIND, confidence: 0, scores: {} };
  }

  const H = primary.hurst?.H ?? 0.5;
  const D = primary.boxDim?.D ?? 1.5;
  const L = primary.lacunarity?.lambda ?? 1;
  const volL = primary.volumeLacunarity?.lambda ?? 1;

  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;

  // Score each mood
  const scores = {
    PANIC: 0,
    EUPHORIA: 0,
    STEALTH_BUILD: 0,
    GRIND: 0,
  };

  // --- PANIC ---
  // Low Hurst (anti-persistent chaos) + high fear + high box dimension
  if (H < 0.4) scores.PANIC += 25;
  else if (H < 0.45) scores.PANIC += 15;

  if (D > 1.6) scores.PANIC += 20;
  else if (D > 1.5) scores.PANIC += 10;

  if (fear > 50) scores.PANIC += 30;
  else if (fear > 30) scores.PANIC += 15;

  if (volL > 1.6) scores.PANIC += 15; // Volume clustering in sell-offs

  // Bond inversion amplifies panic
  if (behavioralResults?.bond?.inverted) scores.PANIC += 15;

  // Commodity panic dump
  if (behavioralResults?.commodity?.panicDump) scores.PANIC += 20;

  // --- EUPHORIA ---
  // High Hurst (persistent trending) + greed + low box dimension (smooth)
  if (H > 0.65) scores.EUPHORIA += 25;
  else if (H > 0.55) scores.EUPHORIA += 15;

  if (D < 1.3) scores.EUPHORIA += 20;
  else if (D < 1.4) scores.EUPHORIA += 10;

  if (greed > 50) scores.EUPHORIA += 30;
  else if (greed > 30) scores.EUPHORIA += 15;

  if (L < 1.15) scores.EUPHORIA += 10; // Uniform trend

  // --- STEALTH BUILD ---
  // Moderate Hurst + high lacunarity + low volume + low fear/greed
  if (H > 0.45 && H < 0.6) scores.STEALTH_BUILD += 15;

  if (L > 1.5) scores.STEALTH_BUILD += 25;
  else if (L > 1.3) scores.STEALTH_BUILD += 15;

  if (volL > 1.4) scores.STEALTH_BUILD += 15; // Volume clustering

  if (fear < 15 && greed < 15) scores.STEALTH_BUILD += 20;
  if (exhaustion > 30) scores.STEALTH_BUILD += 15;

  // Commodity hoarding
  if (behavioralResults?.commodity?.hoarding) scores.STEALTH_BUILD += 20;

  // --- GRIND ---
  // Hurst near 0.5 (random) + low box dim variation + low lacunarity + low signals
  if (H > 0.45 && H < 0.55) scores.GRIND += 20;

  if (D > 1.35 && D < 1.65) scores.GRIND += 15;

  if (L < 1.2) scores.GRIND += 15;

  if (fear < 20 && greed < 20 && exhaustion < 20) scores.GRIND += 20;

  // Find winner
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = entries[0];
  const [, secondScore] = entries[1];

  // Confidence: gap between top and second
  const maxPossible = 100;
  const gap = topScore - secondScore;
  const confidence = Math.min(100, Math.round((topScore / maxPossible) * 60 + gap));

  return {
    mood: MOODS[topKey],
    confidence: Math.max(0, Math.min(100, confidence)),
    scores,
  };
}

export { MOODS };
