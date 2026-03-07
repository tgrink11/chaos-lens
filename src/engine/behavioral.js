/**
 * Behavioral Pattern Detection — pure math, no AI
 *
 * Detects greed, fear, and exhaustion from OHLCV candle data
 * plus bond-specific and commodity-specific signals.
 */

/**
 * Detect greed signals from long upper wicks
 * @param {Object} data - { open, high, low, close } arrays
 * @param {number} lookback - candles to analyze (default 20)
 * @returns {{ score: number, signals: string[], intensity: string }}
 */
export function detectGreed(data, lookback = 50) {
  const { open, high, low, close } = data;
  const n = Math.min(lookback, close.length);
  const signals = [];
  let wickScore = 0;

  for (let i = close.length - n; i < close.length; i++) {
    if (i < 0) continue;
    const body = Math.abs(close[i] - open[i]);
    const upperWick = high[i] - Math.max(open[i], close[i]);
    const totalRange = high[i] - low[i];

    if (totalRange === 0) continue;

    // Recency weight: recent bars count more (1.0 to 2.0 linearly)
    const progress = (i - (close.length - n)) / (n - 1 || 1);
    const weight = 1.0 + progress;

    const wickRatio = upperWick / (body || 0.001);
    const wickPct = upperWick / totalRange;

    // Long upper wicks signal greed — buyers reaching too high
    if (wickRatio > 2.0) {
      wickScore += 3 * weight;
      signals.push(`Bar ${i}: upper wick ${wickRatio.toFixed(1)}x body — aggressive buying exhaustion`);
    } else if (wickRatio > 1.2) {
      wickScore += 1.5 * weight;
    }

    // Wick dominates the range
    if (wickPct > 0.6) {
      wickScore += 2 * weight;
    }
  }

  const normalized = Math.min(100, (wickScore / n) * 35);

  let intensity;
  if (normalized > 70) intensity = 'Extreme Greed';
  else if (normalized > 45) intensity = 'High Greed';
  else if (normalized > 25) intensity = 'Moderate Greed';
  else if (normalized > 10) intensity = 'Mild Greed';
  else intensity = 'No Greed Signal';

  return { score: Math.round(normalized), signals: signals.slice(-5), intensity };
}

/**
 * Detect fear signals from volume spikes
 * @param {Object} data - { volume, close } arrays
 * @param {number} lookback - candles to analyze
 * @returns {{ score: number, signals: string[], intensity: string }}
 */
export function detectFear(data, lookback = 50) {
  const { volume, close } = data;
  if (!volume || volume.length < lookback + 20) {
    return { score: 0, signals: [], intensity: 'No Data' };
  }

  const signals = [];
  let fearScore = 0;
  const n = Math.min(lookback, close.length);

  for (let i = close.length - n; i < close.length; i++) {
    if (i < 20) continue;

    // Recency weight: recent bars count more (1.0 to 2.0 linearly)
    const progress = (i - (close.length - n)) / (n - 1 || 1);
    const weight = 1.0 + progress;

    // Rolling 20-bar volume mean and std
    const window = volume.slice(i - 20, i);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((a, v) => a + (v - mean) ** 2, 0) / window.length);

    if (std === 0) continue;

    const zScore = (volume[i] - mean) / std;
    const priceDown = close[i] < close[i - 1];

    // Volume spike + price decline = fear
    if (zScore > 2.5 && priceDown) {
      fearScore += 4 * weight;
      signals.push(`Bar ${i}: volume ${zScore.toFixed(1)}σ spike on decline — panic selling`);
    } else if (zScore > 2.0 && priceDown) {
      fearScore += 2.5 * weight;
      signals.push(`Bar ${i}: volume ${zScore.toFixed(1)}σ spike — capitulation risk`);
    } else if (zScore > 1.8) {
      fearScore += 1 * weight;
    }
  }

  const normalized = Math.min(100, (fearScore / n) * 30);

  let intensity;
  if (normalized > 70) intensity = 'Extreme Fear';
  else if (normalized > 45) intensity = 'High Fear';
  else if (normalized > 25) intensity = 'Moderate Fear';
  else if (normalized > 10) intensity = 'Mild Fear';
  else intensity = 'No Fear Signal';

  return { score: Math.round(normalized), signals: signals.slice(-5), intensity };
}

/**
 * Detect exhaustion from flat ranges and declining volatility
 * @param {Object} data - { high, low, close } arrays
 * @param {number} lookback
 * @returns {{ score: number, signals: string[], intensity: string }}
 */
export function detectExhaustion(data, lookback = 50) {
  const { high, low, close } = data;
  const n = Math.min(lookback, close.length);
  const signals = [];

  // ATR calculation
  const atrs = [];
  for (let i = close.length - n; i < close.length; i++) {
    if (i < 1) continue;
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    atrs.push(tr);
  }

  if (atrs.length < 5) {
    return { score: 0, signals: [], intensity: 'No Data' };
  }

  // ATR trend: is volatility declining?
  const firstHalf = atrs.slice(0, Math.floor(atrs.length / 2));
  const secondHalf = atrs.slice(Math.floor(atrs.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let exhaustionScore = 0;

  if (firstAvg > 0) {
    const atrDecline = (firstAvg - secondAvg) / firstAvg;
    if (atrDecline > 0.3) {
      exhaustionScore += 40;
      signals.push(`ATR declined ${(atrDecline * 100).toFixed(0)}% — volatility compression`);
    } else if (atrDecline > 0.15) {
      exhaustionScore += 20;
      signals.push(`ATR declining — energy fading`);
    }
  }

  // Price range compression
  const recentClose = close.slice(-n);
  const rangeHigh = Math.max(...recentClose);
  const rangeLow = Math.min(...recentClose);
  const midPrice = (rangeHigh + rangeLow) / 2;
  const rangeWidth = midPrice > 0 ? (rangeHigh - rangeLow) / midPrice : 0;

  if (rangeWidth < 0.02) {
    exhaustionScore += 35;
    signals.push(`Price range only ${(rangeWidth * 100).toFixed(1)}% — extreme compression`);
  } else if (rangeWidth < 0.05) {
    exhaustionScore += 15;
    signals.push(`Tight range ${(rangeWidth * 100).toFixed(1)}% — coiling`);
  }

  const normalized = Math.min(100, exhaustionScore);

  let intensity;
  if (normalized > 60) intensity = 'Deep Exhaustion';
  else if (normalized > 35) intensity = 'Moderate Exhaustion';
  else if (normalized > 15) intensity = 'Mild Exhaustion';
  else intensity = 'No Exhaustion';

  return { score: Math.round(normalized), signals: signals.slice(-5), intensity };
}

/**
 * Bond-specific behavioral signals
 * @param {Object} yieldData - { y2, y10, y30 } yield values
 * @returns {{ signals: string[], inverted: boolean, steepening: boolean }}
 */
export function detectBondBehavior(yieldData) {
  if (!yieldData) return { signals: [], inverted: false, steepening: false };

  const { y2, y10, y30 } = yieldData;
  const signals = [];
  let inverted = false;
  let steepening = false;

  if (y2 != null && y10 != null) {
    const spread = y10 - y2;
    if (spread < 0) {
      inverted = true;
      signals.push(`2s10s INVERTED at ${(spread * 100).toFixed(0)}bps — recession fear / capitulation`);
    } else if (spread < 0.25) {
      signals.push(`2s10s spread only ${(spread * 100).toFixed(0)}bps — inversion watch`);
    } else if (spread > 1.5) {
      steepening = true;
      signals.push(`Curve steepening at ${(spread * 100).toFixed(0)}bps — reflationary/capitulation signal`);
    }
  }

  if (y10 != null && y30 != null) {
    const longSpread = y30 - y10;
    if (longSpread < 0.1) {
      signals.push(`10s30s nearly flat — long-end demand compression`);
    }
  }

  return { signals, inverted, steepening };
}

/**
 * Commodity-specific behavioral signals
 * @param {Object} data - OHLCV data
 * @returns {{ signals: string[], hoarding: boolean, panicDump: boolean }}
 */
export function detectCommodityBehavior(data) {
  const { close, volume } = data;
  if (!close || close.length < 20) {
    return { signals: [], hoarding: false, panicDump: false };
  }

  const signals = [];
  let hoarding = false;
  let panicDump = false;

  const n = close.length;
  const recentClose = close.slice(-10);
  const priorClose = close.slice(-20, -10);

  const recentAvg = recentClose.reduce((a, b) => a + b, 0) / recentClose.length;
  const priorAvg = priorClose.reduce((a, b) => a + b, 0) / priorClose.length;
  const priceTrend = priorAvg > 0 ? (recentAvg - priorAvg) / priorAvg : 0;

  if (volume && volume.length >= 20) {
    const recentVol = volume.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const priorVol = volume.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    const volTrend = priorVol > 0 ? (recentVol - priorVol) / priorVol : 0;

    // Price up + volume declining = stealth accumulation/hoarding
    if (priceTrend > 0.02 && volTrend < -0.15) {
      hoarding = true;
      signals.push(`Price rising on declining volume — inventory hoarding pattern`);
    }

    // Price crashing + volume surging = panic dump
    if (priceTrend < -0.05 && volTrend > 0.5) {
      panicDump = true;
      signals.push(`Price dumping on volume surge — panic liquidation`);
    }
  }

  // Price velocity
  if (priceTrend > 0.08) {
    signals.push(`Commodity surging ${(priceTrend * 100).toFixed(1)}% — supply squeeze / speculative frenzy`);
  } else if (priceTrend < -0.08) {
    signals.push(`Commodity crashing ${(priceTrend * 100).toFixed(1)}% — demand destruction / forced selling`);
  }

  return { signals, hoarding, panicDump };
}

/**
 * Run all behavioral detection
 */
export function runBehavioralAnalysis(data, assetType, yieldData) {
  const greed = detectGreed(data);
  const fear = detectFear(data);
  const exhaustion = detectExhaustion(data);

  const result = { greed, fear, exhaustion };

  if (assetType === 'bond') {
    result.bond = detectBondBehavior(yieldData);
  }

  if (assetType === 'commodity') {
    result.commodity = detectCommodityBehavior(data);
  }

  return result;
}
