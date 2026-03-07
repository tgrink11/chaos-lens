/**
 * Fractal Orchestrator — runs all fractal computations across multiple timeframes
 */

import { computeHurst } from './hurst.js';
import { computeBoxDimension } from './boxcounting.js';
import { computeLacunarity, computeVolumeLacunarity } from './lacunarity.js';

/**
 * @typedef {Object} TimeframeData
 * @property {number[]} close - Close prices
 * @property {number[]} high - High prices
 * @property {number[]} low - Low prices
 * @property {number[]} open - Open prices
 * @property {number[]} volume - Volume data
 */

/**
 * Run full fractal analysis on a single timeframe
 * @param {TimeframeData} data
 * @returns {Object} fractal metrics for this timeframe
 */
function analyzeTimeframe(data) {
  const { close, volume } = data;

  const hurst = computeHurst(close);
  const boxDim = computeBoxDimension(close);
  const lacunarity = computeLacunarity(close);
  const volLac = computeVolumeLacunarity(volume || []);

  return {
    hurst,
    boxDim,
    lacunarity,
    volumeLacunarity: volLac,
    dataPoints: close.length,
  };
}

/**
 * Run fractal analysis across all available timeframes
 * @param {Object} timeframes - { daily, hourly, fiveMin } each with OHLCV arrays
 * @returns {Object} complete fractal results
 */
export function runFractalAnalysis(timeframes) {
  const results = {};

  if (timeframes.daily?.close?.length > 0) {
    results.daily = analyzeTimeframe(timeframes.daily);
  }

  if (timeframes.hourly?.close?.length > 0) {
    results.hourly = analyzeTimeframe(timeframes.hourly);
  }

  if (timeframes.fiveMin?.close?.length > 0) {
    results.fiveMin = analyzeTimeframe(timeframes.fiveMin);
  }

  // Compute cross-timeframe agreement
  const timeframeKeys = Object.keys(results);
  if (timeframeKeys.length >= 2) {
    const hursts = timeframeKeys.map(k => results[k].hurst.H);
    const dims = timeframeKeys.map(k => results[k].boxDim.D);

    // Self-similarity score: how consistent are fractals across scales
    const hurstSpread = Math.max(...hursts) - Math.min(...hursts);
    const dimSpread = Math.max(...dims) - Math.min(...dims);

    results.selfSimilarity = {
      hurstSpread: Math.round(hurstSpread * 1000) / 1000,
      dimSpread: Math.round(dimSpread * 1000) / 1000,
      // Low spread = high self-similarity (true fractal behavior)
      score: Math.max(0, 1 - (hurstSpread + dimSpread) / 2),
      label: hurstSpread < 0.15 && dimSpread < 0.2
        ? 'High Self-Similarity (True Fractal)'
        : hurstSpread < 0.3 && dimSpread < 0.4
          ? 'Moderate Self-Similarity'
          : 'Low Self-Similarity (Scale-Dependent)',
    };
  }

  // Primary metrics (use daily if available, else first available)
  const primary = results.daily || results[timeframeKeys[0]];
  if (primary) {
    results.primary = {
      hurst: primary.hurst,
      boxDim: primary.boxDim,
      lacunarity: primary.lacunarity,
      volumeLacunarity: primary.volumeLacunarity,
    };
  }

  return results;
}
