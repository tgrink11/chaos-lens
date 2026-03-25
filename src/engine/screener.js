/**
 * Screener Scoring Engine
 * Runs lightweight daily-only fractal analysis and computes opportunity score.
 * Reuses existing engine modules — no new math.
 */

import { runFractalAnalysis } from './fractals';
import { runBehavioralAnalysis } from './behavioral';
import { classifyMood } from './mood';
import { predictBreak } from './prediction';

/**
 * Run daily-only fractal pipeline on a single symbol's OHLCV data.
 * Returns a score object with all key metrics.
 */
export function computeOpportunityScore(dailyOHLCV) {
  if (!dailyOHLCV?.close?.length || dailyOHLCV.close.length < 60) {
    return null; // Not enough data
  }

  // Step 1: Fractal analysis (daily only — no hourly/5min)
  const fractalResults = runFractalAnalysis({
    daily: dailyOHLCV,
    hourly: null,
    fiveMin: null,
  });

  const primary = fractalResults?.primary;
  if (!primary?.hurst?.H) return null;

  // Step 2: Behavioral analysis
  const behavioralResults = runBehavioralAnalysis(dailyOHLCV, 'stock', null);

  // Step 3: Mood classification
  const moodResult = classifyMood(fractalResults, behavioralResults, dailyOHLCV.close);

  // Step 4: Prediction (next break)
  const predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, dailyOHLCV.close);

  // Extract key metrics
  const H = primary.hurst?.H ?? 0.5;
  const D = primary.boxDim?.D ?? 1.5;
  const L = primary.lacunarity?.lambda ?? 1.0;
  const greed = behavioralResults?.greed?.score ?? 0;
  const fear = behavioralResults?.fear?.score ?? 0;
  const exhaustion = behavioralResults?.exhaustion?.score ?? 0;
  // mood is an object {key, label, color, description} — extract key string
  const moodObj = moodResult?.mood;
  const mood = (typeof moodObj === 'string' ? moodObj : moodObj?.key) ?? 'GRIND';
  const moodConfidence = moodResult?.confidence ?? 0;
  // prediction is nested: { prediction: {key, label, ...}, confidence, reasoning }
  const predObj = predictionResult?.prediction;
  const prediction = (typeof predObj === 'string' ? predObj : predObj?.key) ?? 'CONSOLIDATION';
  const predConfidence = predictionResult?.confidence ?? 0;

  // Compute recent momentum (20-day return %)
  const closes = dailyOHLCV.close;
  const len = closes.length;
  const momentum20 = len >= 20
    ? ((closes[len - 1] - closes[len - 20]) / closes[len - 20]) * 100
    : 0;

  // Classify direction: Long or Short
  const direction = classifyDirection(prediction, momentum20);

  // Compute composite opportunity score (0-100)
  const score = computeComposite(H, D, L, greed, fear, exhaustion, prediction, predConfidence);

  return {
    H: Math.round(H * 100) / 100,
    D: Math.round(D * 100) / 100,
    lambda: Math.round(L * 100) / 100,
    greed: Math.round(greed),
    fear: Math.round(fear),
    exhaustion: Math.round(exhaustion),
    mood,
    moodConfidence: Math.round(moodConfidence),
    prediction,
    predConfidence: Math.round(predConfidence),
    score: Math.round(score),
    direction,
    momentum: Math.round(momentum20 * 100) / 100,
  };
}

/**
 * Classify trade direction based on prediction and recent momentum.
 * THRUST_UP → Long, CASCADE_DOWN → Short, CONSOLIDATION → use momentum.
 */
function classifyDirection(prediction, momentum20) {
  if (prediction === 'THRUST_UP') return 'Long';
  if (prediction === 'CASCADE_DOWN') return 'Short';
  // CONSOLIDATION — use 20-day momentum to decide
  return momentum20 >= 0 ? 'Long' : 'Short';
}

/**
 * Composite opportunity score (0-100)
 * Ranks stocks where the fractal engine has the STRONGEST signals.
 */
function computeComposite(H, D, L, greed, fear, exhaustion, prediction, predConfidence) {
  // 1. Trend Strength (0-25): How far Hurst is from 0.5 (random walk)
  //    H=0.5 → 0 points, H=0.9 or H=0.1 → 25 points
  const trendStrength = Math.min(25, Math.abs(H - 0.5) * 62.5);

  // 2. Structural Clarity (0-20): Reward extreme box dimensions
  //    D=1.5 → 0 points (maximally noisy), D<1.15 or D>1.85 → 20 points
  const clarity = Math.min(20, Math.abs(D - 1.5) * 57);

  // 3. Gap Signal (0-15): High lacunarity = accumulation/distribution zones
  //    L=1.0 → 0 points, L>2.0 → 15 points
  const gapSignal = Math.min(15, Math.max(0, (L - 1.0)) * 15);

  // 4. Behavioral Edge (0-15): Any extreme behavioral signal
  //    Max of (greed, fear, exhaustion) → scale to 0-15
  const maxBehavior = Math.max(greed, fear, exhaustion);
  const behavioralEdge = Math.min(15, (maxBehavior / 100) * 15);

  // 5. Direction Confidence (0-25): Prediction confidence × direction weight
  //    THRUST_UP or CASCADE_DOWN = full weight, CONSOLIDATION = 0.5 weight
  const dirWeight = prediction === 'CONSOLIDATION' ? 0.5 : 1.0;
  const directionConfidence = Math.min(25, (predConfidence / 100) * 25 * dirWeight);

  return trendStrength + clarity + gapSignal + behavioralEdge + directionConfidence;
}

/**
 * Sort scored symbols descending by score, return top N
 */
export function rankOpportunities(scoredSymbols, topN = 20) {
  return [...scoredSymbols]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
