/**
 * Walk-Forward Backtesting Engine
 *
 * Runs the full prediction pipeline at historical points using only data
 * available up to that point (no look-ahead bias), then measures actual
 * outcomes to compute accuracy metrics.
 */

import { runFractalAnalysis } from './fractals.js';
import { runBehavioralAnalysis } from './behavioral.js';
import { classifyMood } from './mood.js';
import { findAnalogs } from './analogs.js';
import { predictHorizons } from './prediction.js';

/**
 * Slice parallel OHLCV arrays
 */
function sliceOHLCV(data, start, end) {
  return {
    date: data.date.slice(start, end),
    open: data.open.slice(start, end),
    high: data.high.slice(start, end),
    low: data.low.slice(start, end),
    close: data.close.slice(start, end),
    volume: data.volume.slice(start, end),
  };
}

/**
 * Measure actual price movement after a test point
 */
function measureOutcome(closes, testIndex, horizon) {
  const startPrice = closes[testIndex];
  const endIndex = testIndex + horizon;
  if (endIndex >= closes.length || startPrice <= 0) return null;

  const endPrice = closes[endIndex];
  const actualReturn = (endPrice - startPrice) / startPrice;

  // Match analog threshold: >1% bullish, <-1% bearish, else neutral
  let actualDirection;
  if (actualReturn > 0.01) actualDirection = 'bullish';
  else if (actualReturn < -0.01) actualDirection = 'bearish';
  else actualDirection = 'neutral';

  return { actualReturn, actualDirection, startPrice, endPrice };
}

/**
 * Per-direction accuracy breakdown
 */
function computeDirectionBreakdown(points, predKey, actKey) {
  const directions = ['bullish', 'bearish', 'neutral'];
  const breakdown = {};

  for (const dir of directions) {
    const predicted = points.filter(tp => tp[predKey].direction === dir);
    const correct = predicted.filter(tp => tp[actKey]?.actualDirection === dir);
    breakdown[dir] = {
      predicted: predicted.length,
      correct: correct.length,
      accuracy: predicted.length > 0 ? correct.length / predicted.length : null,
    };
  }

  return breakdown;
}

/**
 * Confidence calibration — bin predictions by confidence, measure actual hit rate
 */
function computeCalibration(points, predKey, actKey) {
  const buckets = [
    { label: '<30%', min: 0, max: 30 },
    { label: '30-50%', min: 30, max: 50 },
    { label: '50-70%', min: 50, max: 70 },
    { label: '>70%', min: 70, max: 101 },
  ];

  return buckets.map(bucket => {
    const inBucket = points.filter(tp => {
      const conf = tp[predKey].confidence;
      return conf >= bucket.min && conf < bucket.max;
    });
    const hits = inBucket.filter(tp => tp[predKey].direction === tp[actKey]?.actualDirection);
    return {
      ...bucket,
      count: inBucket.length,
      hits: hits.length,
      hitRate: inBucket.length > 0 ? hits.length / inBucket.length : null,
    };
  });
}

/**
 * Average confidence for a set of test points
 */
function avgConfidence(points, predKey) {
  if (points.length === 0) return null;
  return Math.round(points.reduce((sum, tp) => sum + tp[predKey].confidence, 0) / points.length);
}

/**
 * Aggregate all metrics from test points
 */
function computeBacktestMetrics(testPoints) {
  const valid15 = testPoints.filter(tp => tp.actual15 != null);
  const hits15 = valid15.filter(tp => tp.predicted15.direction === tp.actual15.actualDirection);

  const valid62 = testPoints.filter(tp => tp.actual62 != null);
  const hits62 = valid62.filter(tp => tp.predicted62.direction === tp.actual62.actualDirection);

  return {
    shortTerm: {
      total: valid15.length,
      hits: hits15.length,
      hitRate: valid15.length > 0 ? hits15.length / valid15.length : 0,
      byDirection: computeDirectionBreakdown(valid15, 'predicted15', 'actual15'),
      calibration: computeCalibration(valid15, 'predicted15', 'actual15'),
      avgConfidenceOnHit: avgConfidence(hits15, 'predicted15'),
      avgConfidenceOnMiss: avgConfidence(
        valid15.filter(tp => tp.predicted15.direction !== tp.actual15?.actualDirection),
        'predicted15'
      ),
    },
    mediumTerm: {
      total: valid62.length,
      hits: hits62.length,
      hitRate: valid62.length > 0 ? hits62.length / valid62.length : 0,
      byDirection: computeDirectionBreakdown(valid62, 'predicted62', 'actual62'),
      calibration: computeCalibration(valid62, 'predicted62', 'actual62'),
      avgConfidenceOnHit: avgConfidence(hits62, 'predicted62'),
      avgConfidenceOnMiss: avgConfidence(
        valid62.filter(tp => tp.predicted62.direction !== tp.actual62?.actualDirection),
        'predicted62'
      ),
    },
    testPointCount: testPoints.length,
    dateRange: {
      first: testPoints[0]?.date,
      last: testPoints[testPoints.length - 1]?.date,
    },
  };
}

/**
 * Compute adaptive stride to target ~20 test points
 */
function computeStride(totalBars, minInitialBars) {
  const testableRange = totalBars - minInitialBars - 15;
  if (testableRange <= 0) return null;
  const targetPoints = 20;
  const stride = Math.max(5, Math.floor(testableRange / targetPoints));
  return Math.min(stride, 20);
}

/**
 * Run walk-forward backtest (async, yields to main thread)
 *
 * @param {Object} dailyData - { date[], open[], high[], low[], close[], volume[] }
 * @param {string} assetType - 'stock' | 'bond' | 'commodity'
 * @param {Object} yieldData - bond yield data (only for bonds)
 * @param {Object} options - { stride?, minInitialBars?, onProgress? }
 * @returns {Promise<Object>} backtest results with metrics
 */
export async function runBacktestAsync(dailyData, assetType, yieldData, options = {}) {
  const minInitialBars = options.minInitialBars ?? (assetType === 'bond' ? 120 : 200);
  const totalBars = dailyData.close.length;
  const stride = options.stride ?? computeStride(totalBars, minInitialBars);
  const onProgress = options.onProgress ?? null;

  // Guard: need enough data
  const minRequired = minInitialBars + 15;
  if (totalBars < minRequired || !stride) {
    return {
      error: 'INSUFFICIENT_DATA',
      message: `Need at least ${minRequired} daily bars for backtesting, have ${totalBars}.`,
      barsAvailable: totalBars,
      barsRequired: minRequired,
    };
  }

  const closes = dailyData.close;
  const lastTestIndex15 = totalBars - 15 - 1;
  const lastTestIndex62 = totalBars - 62 - 1;
  const testPoints = [];

  const totalSteps = Math.floor((lastTestIndex15 - minInitialBars) / stride) + 1;

  for (let i = minInitialBars; i <= lastTestIndex15; i += stride) {
    // Progress
    if (onProgress) {
      const pct = Math.round(((i - minInitialBars) / (lastTestIndex15 - minInitialBars)) * 100);
      onProgress(Math.min(pct, 99));
    }

    // Slice data up to this test point (inclusive)
    const slicedData = sliceOHLCV(dailyData, 0, i + 1);

    // Run full pipeline
    const fractalResults = runFractalAnalysis({
      daily: slicedData,
      hourly: null,
      fiveMin: null,
    });

    const behavioralResults = runBehavioralAnalysis(slicedData, assetType, yieldData);
    const moodResult = classifyMood(fractalResults, behavioralResults);

    const currentSignature = {
      H: fractalResults.primary?.hurst?.H ?? 0.5,
      D: fractalResults.primary?.boxDim?.D ?? 1.5,
      lambda: fractalResults.primary?.lacunarity?.lambda ?? 1,
    };

    // Adapt analog window to available data
    const analogWindow = Math.min(60, Math.floor(slicedData.close.length / 3));
    const analogResults = findAnalogs(slicedData.close, currentSignature, analogWindow);

    const horizonResults = predictHorizons(
      fractalResults, behavioralResults, moodResult, analogResults, slicedData.close
    );

    // Measure actual outcomes
    const outcome15 = measureOutcome(closes, i, 15);
    const outcome62 = i <= lastTestIndex62 ? measureOutcome(closes, i, 62) : null;

    testPoints.push({
      testIndex: i,
      date: dailyData.date[i],
      predicted15: {
        direction: horizonResults.shortTerm.direction,
        confidence: horizonResults.shortTerm.confidence,
      },
      predicted62: {
        direction: horizonResults.mediumTerm.direction,
        confidence: horizonResults.mediumTerm.confidence,
      },
      actual15: outcome15,
      actual62: outcome62,
      mood: moodResult.mood.key,
    });

    // Yield to main thread every 3 iterations
    if (testPoints.length % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  if (onProgress) onProgress(100);

  return {
    error: null,
    testPoints,
    metrics: computeBacktestMetrics(testPoints),
    config: { stride, minInitialBars, totalBars, assetType },
  };
}
