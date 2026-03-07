/**
 * Hurst Exponent via Rescaled Range (R/S) Analysis
 *
 * H > 0.5 → persistent / trending (momentum)
 * H ≈ 0.5 → random walk (efficient market)
 * H < 0.5 → anti-persistent / mean-reverting (choppy)
 */

function logReturns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      r.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return r;
}

function rescaledRange(series) {
  const n = series.length;
  if (n < 2) return 0;

  const mean = series.reduce((a, b) => a + b, 0) / n;
  const deviations = series.map(x => x - mean);

  // Cumulative deviations
  const cumDev = [];
  let sum = 0;
  for (const d of deviations) {
    sum += d;
    cumDev.push(sum);
  }

  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(deviations.reduce((a, d) => a + d * d, 0) / n);

  return S > 0 ? R / S : 0;
}

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0.5, r2: 0 };

  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0, ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;

  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, r2 };
}

/**
 * Compute Hurst exponent from a price series
 * @param {number[]} prices - Close prices
 * @param {number} minWindow - Minimum sub-window size (default 8)
 * @returns {{ H: number, r2: number, label: string }}
 */
export function computeHurst(prices, minWindow = 8) {
  const returns = logReturns(prices);
  if (returns.length < minWindow * 2) {
    return { H: 0.5, r2: 0, label: 'Insufficient data' };
  }

  // Generate window sizes: powers of 2 from minWindow up to half the series
  const sizes = [];
  let s = minWindow;
  while (s <= Math.floor(returns.length / 2)) {
    sizes.push(s);
    s = Math.floor(s * 1.5);
  }

  if (sizes.length < 3) {
    return { H: 0.5, r2: 0, label: 'Insufficient data' };
  }

  const logN = [];
  const logRS = [];

  for (const size of sizes) {
    const numBlocks = Math.floor(returns.length / size);
    if (numBlocks < 1) continue;

    let rsSum = 0;
    let count = 0;

    for (let b = 0; b < numBlocks; b++) {
      const block = returns.slice(b * size, (b + 1) * size);
      const rs = rescaledRange(block);
      if (rs > 0) {
        rsSum += rs;
        count++;
      }
    }

    if (count > 0) {
      logN.push(Math.log(size));
      logRS.push(Math.log(rsSum / count));
    }
  }

  if (logN.length < 3) {
    return { H: 0.5, r2: 0, label: 'Insufficient data' };
  }

  const { slope: H, r2 } = linearRegression(logN, logRS);

  // Clamp to reasonable range
  const clamped = Math.max(0, Math.min(1, H));

  let label;
  if (clamped > 0.65) label = 'Persistent (Trending)';
  else if (clamped > 0.55) label = 'Weakly Persistent';
  else if (clamped > 0.45) label = 'Random Walk';
  else if (clamped > 0.35) label = 'Weakly Anti-Persistent';
  else label = 'Anti-Persistent (Mean-Reverting)';

  return { H: clamped, r2, label };
}
