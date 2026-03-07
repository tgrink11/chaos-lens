/**
 * Historical Analog Matching
 *
 * Compares current fractal signature against historical windows
 * within the same price series to find similar past episodes.
 */

import { computeHurst } from './hurst.js';
import { computeBoxDimension } from './boxcounting.js';
import { computeLacunarity } from './lacunarity.js';

/**
 * Find historical analogs in the same asset's price history
 * @param {number[]} allPrices - Full historical price series
 * @param {Object} currentSignature - { H, D, lambda } current fractal metrics
 * @param {number} windowSize - Size of comparison window (default 60)
 * @param {number} maxAnalogs - Max analogs to return (default 5)
 * @returns {Array} matching historical periods
 */
export function findAnalogs(allPrices, currentSignature, windowSize = 60, maxAnalogs = 5) {
  if (!allPrices || allPrices.length < windowSize * 3) {
    return [];
  }

  const { H: curH, D: curD, lambda: curL } = currentSignature;
  const candidates = [];

  // Slide window across history (skip the most recent window — that's our current data)
  const stride = Math.max(5, Math.floor(windowSize / 4));
  const endIdx = allPrices.length - windowSize - 10; // leave gap before current

  for (let i = 0; i <= endIdx; i += stride) {
    const window = allPrices.slice(i, i + windowSize);
    if (window.length < windowSize) continue;

    // Compute fractal signature for this historical window
    const h = computeHurst(window, 4);
    const d = computeBoxDimension(window);
    const l = computeLacunarity(window);

    // Euclidean distance in fractal space (normalized)
    const dH = (h.H - curH) * 2;  // Weight Hurst more
    const dD = (d.D - curD) * 1.5;
    const dL = (l.lambda - curL);
    const distance = Math.sqrt(dH * dH + dD * dD + dL * dL);

    // What happened AFTER this window?
    const afterStart = i + windowSize;
    const afterEnd = Math.min(allPrices.length, afterStart + 20);
    const afterPrices = allPrices.slice(afterStart, afterEnd);

    if (afterPrices.length < 5) continue;

    const startPrice = window[window.length - 1];
    const endPrice = afterPrices[afterPrices.length - 1];
    const maxAfter = Math.max(...afterPrices);
    const minAfter = Math.min(...afterPrices);

    const returnPct = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    const maxUpside = startPrice > 0 ? ((maxAfter - startPrice) / startPrice) * 100 : 0;
    const maxDownside = startPrice > 0 ? ((minAfter - startPrice) / startPrice) * 100 : 0;

    candidates.push({
      startIndex: i,
      endIndex: i + windowSize,
      distance,
      signature: {
        H: Math.round(h.H * 1000) / 1000,
        D: Math.round(d.D * 1000) / 1000,
        lambda: Math.round(l.lambda * 1000) / 1000,
      },
      outcome: {
        returnPct: Math.round(returnPct * 100) / 100,
        maxUpside: Math.round(maxUpside * 100) / 100,
        maxDownside: Math.round(maxDownside * 100) / 100,
        direction: returnPct > 1 ? 'UP' : returnPct < -1 ? 'DOWN' : 'FLAT',
        daysAfter: afterPrices.length,
      },
    });
  }

  // Sort by distance (most similar first)
  candidates.sort((a, b) => a.distance - b.distance);

  // Take top N, filter out very poor matches
  const maxDist = 1.5;
  const analogs = candidates
    .filter(c => c.distance < maxDist)
    .slice(0, maxAnalogs);

  // Compute consensus
  if (analogs.length >= 2) {
    const upCount = analogs.filter(a => a.outcome.direction === 'UP').length;
    const downCount = analogs.filter(a => a.outcome.direction === 'DOWN').length;
    const avgReturn = analogs.reduce((s, a) => s + a.outcome.returnPct, 0) / analogs.length;

    return {
      analogs,
      consensus: {
        direction: upCount > downCount ? 'UP' : downCount > upCount ? 'DOWN' : 'MIXED',
        avgReturn: Math.round(avgReturn * 100) / 100,
        upPct: Math.round((upCount / analogs.length) * 100),
        confidence: Math.round((Math.abs(upCount - downCount) / analogs.length) * 100),
      },
    };
  }

  return { analogs, consensus: null };
}
