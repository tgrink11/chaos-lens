/**
 * Mood Classifier — synthesizes fractal metrics + behavioral signals into a single mood
 *
 * Moods: PANIC | EUPHORIA | STEALTH_BUILD | GRIND
 *
 * v2: Uses recent-regime Hurst (last 60 bars) to detect regime changes
 *     that the full-series Hurst masks.
 */

import { computeHurst } from './hurst.js';

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
 * @param {number[]} [dailyCloses] - raw daily close prices for recent-regime computation
 * @returns {{ mood: Object, confidence: number, scores: Object, regimeChange: Object|null }}
 */
export function classifyMood(fractalResults, behavioralResults, dailyCloses) {
  const primary = fractalResults?.primary;
  if (!primary) {
    return { mood: MOODS.GRIND, confidence: 0, scores: {}, regimeChange: null };
  }

  const H = primary.hurst?.H ?? 0.5;
  const D = primary.boxDim?.D ?? 1.5;
  const L = primary.lacunarity?.lambda ?? 1;
  const volL = primary.volumeLacunarity?.lambda ?? 1;

  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;

  // --- RECENT PRICE DIRECTION ---
  // Fractal metrics are structure-only (direction-agnostic). We need to know
  // which way prices are actually moving to interpret them correctly.
  let recentReturn = 0;
  if (dailyCloses && dailyCloses.length >= 10) {
    const r10 = dailyCloses.slice(-10);
    recentReturn = (r10[r10.length - 1] - r10[0]) / r10[0];
  }
  const pricesRising = recentReturn > 0.005;
  const pricesFalling = recentReturn < -0.005;

  // --- RECENT-REGIME HURST ---
  // Compute Hurst on last 40 bars (2 months) — responsive enough to catch
  // a 1-2 week selloff while still having enough data for meaningful R/S.
  let recentH = H; // fallback to full-series
  let regimeChange = null;

  if (dailyCloses && dailyCloses.length >= 40) {
    const recentSlice = dailyCloses.slice(-40);
    const recentHurst = computeHurst(recentSlice);
    if (recentHurst && typeof recentHurst.H === 'number') {
      recentH = recentHurst.H;
      const drift = recentH - H;
      // Significant divergence = regime change
      if (Math.abs(drift) > 0.06) {
        regimeChange = {
          fullH: H,
          recentH,
          drift: Math.round(drift * 1000) / 1000,
          direction: drift > 0 ? 'trending_up' : 'breaking_down',
          label: drift > 0
            ? 'Recent trend strengthening vs history'
            : 'Recent trend breaking down vs history',
        };
      }
    }
  }

  // Use a blend of full-series and recent Hurst for scoring
  // Recent gets 60% weight because we care about what's happening NOW
  const effectiveH = H * 0.4 + recentH * 0.6;

  // Score each mood
  const scores = {
    PANIC: 0,
    EUPHORIA: 0,
    STEALTH_BUILD: 0,
    GRIND: 0,
  };

  // --- PANIC ---
  // Low Hurst (anti-persistent chaos) + high fear + high box dimension
  // Also: high Hurst + falling prices = persistent downtrend (very bearish)
  if (effectiveH < 0.4) {
    scores.PANIC += 25;
  } else if (effectiveH < 0.45) {
    scores.PANIC += 15;
  } else if (effectiveH < 0.5) {
    scores.PANIC += 8;
  } else if (effectiveH > 0.55 && pricesFalling) {
    // Persistent trend + falling prices = strong bearish momentum
    scores.PANIC += 15;
  }

  if (D > 1.6) scores.PANIC += 20;
  else if (D > 1.5) scores.PANIC += 10;

  if (fear > 40) scores.PANIC += 30;
  else if (fear > 20) scores.PANIC += 15;
  else if (fear > 10) scores.PANIC += 5;

  if (volL > 1.6) scores.PANIC += 15;

  // Regime breaking down amplifies panic
  if (regimeChange?.direction === 'breaking_down') {
    scores.PANIC += 20;
  }

  // Bond inversion amplifies panic
  if (behavioralResults?.bond?.inverted) scores.PANIC += 15;

  // Commodity panic dump
  if (behavioralResults?.commodity?.panicDump) scores.PANIC += 20;

  // --- EUPHORIA ---
  // High Hurst + smooth path + greed — BUT only if prices are actually rising.
  // A persistent downtrend (high H) with smooth decline (low D) is NOT euphoria.
  if (pricesRising) {
    if (effectiveH > 0.65) scores.EUPHORIA += 25;
    else if (effectiveH > 0.55) scores.EUPHORIA += 15;

    if (D < 1.3) scores.EUPHORIA += 20;
    else if (D < 1.4) scores.EUPHORIA += 10;

    if (L < 1.15) scores.EUPHORIA += 10;
  } else if (!pricesFalling) {
    // Flat market: give half credit for structural signals
    if (effectiveH > 0.65) scores.EUPHORIA += 10;
    if (D < 1.3) scores.EUPHORIA += 8;
  }
  // Greed is inherently directional — always counts
  if (greed > 50) scores.EUPHORIA += 30;
  else if (greed > 30) scores.EUPHORIA += 15;

  // Regime breaking down suppresses euphoria
  if (regimeChange?.direction === 'breaking_down') {
    scores.EUPHORIA -= 20;
  }

  // --- STEALTH BUILD ---
  // Moderate Hurst + high lacunarity + low volume + low fear/greed
  if (effectiveH > 0.45 && effectiveH < 0.6) scores.STEALTH_BUILD += 15;

  if (L > 1.5) scores.STEALTH_BUILD += 25;
  else if (L > 1.3) scores.STEALTH_BUILD += 15;

  if (volL > 1.4) scores.STEALTH_BUILD += 15;

  if (fear < 15 && greed < 15) scores.STEALTH_BUILD += 20;
  if (exhaustion > 30) scores.STEALTH_BUILD += 15;

  // Commodity hoarding
  if (behavioralResults?.commodity?.hoarding) scores.STEALTH_BUILD += 20;

  // --- GRIND ---
  // Hurst near 0.5 (random) + low box dim variation + low lacunarity + low signals
  if (effectiveH > 0.45 && effectiveH < 0.55) scores.GRIND += 20;

  if (D > 1.35 && D < 1.65) scores.GRIND += 15;

  if (L < 1.2) scores.GRIND += 15;

  if (fear < 20 && greed < 20 && exhaustion < 20) scores.GRIND += 20;

  // --- DIRECT PRICE MOMENTUM ---
  // Fractals measure structure, not direction. A persistent downtrend has high H
  // just like a persistent uptrend. We must check what prices are ACTUALLY doing.
  if (dailyCloses && dailyCloses.length >= 10) {
    const recent10 = dailyCloses.slice(-10);
    const ret10 = (recent10[recent10.length - 1] - recent10[0]) / recent10[0];

    if (ret10 < -0.03) {
      // 3%+ decline in 10 days: can't be euphoric when prices are falling hard
      scores.EUPHORIA -= 25;
      scores.PANIC += 20;
    } else if (ret10 < -0.015) {
      scores.EUPHORIA -= 12;
      scores.PANIC += 10;
    } else if (ret10 > 0.05) {
      scores.EUPHORIA += 10;
    }
  }

  // Ensure no negative scores
  for (const key of Object.keys(scores)) {
    scores[key] = Math.max(0, scores[key]);
  }

  // Find winner
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = entries[0];
  const [, secondScore] = entries[1];

  // Confidence: based on score magnitude + margin over second place
  // Capped at 85% — mood classification is inherently uncertain
  const maxPossible = 100;
  const gap = topScore - secondScore;
  const confidence = Math.min(85, Math.round((topScore / maxPossible) * 50 + gap * 0.8));

  return {
    mood: MOODS[topKey],
    confidence: Math.max(0, Math.min(100, confidence)),
    scores,
    regimeChange,
  };
}

export { MOODS };
