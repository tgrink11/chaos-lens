/**
 * Higuchi Fractal Dimension (replaces previous box-counting implementation).
 *
 * The old box-counting code used a 2D grid and walked the price path,
 * marking occupied boxes. Its line-segment interpolation between
 * consecutive bars used only 2 sub-steps regardless of how much the
 * path moved per timestep — at high grid resolutions the curve actually
 * crossed 5-10 boxes between samples but only 2-3 were recorded. This
 * systematically biased D downward, making chaotic stocks look smoother
 * than they were. Compression of all real-world stocks into D ≈ 1.1-1.3
 * was the result.
 *
 * Higuchi (1988) is a 1D fractal dimension that operates directly on the
 * sequential price series. There's no grid, no line interpolation, no
 * 2D embedding — instead it constructs k sub-series by sampling every
 * k-th point, computes the average path "length" at each scale, and
 * derives D from how length scales with k. Robust for short series
 * (~250 bars and up), widely used in EEG / biosignal analysis and
 * financial time-series literature.
 *
 * Interpretation (unchanged from box-counting):
 *   D ≈ 1.0   → smooth, line-like price path (clean trend or extreme compression)
 *   D ≈ 1.2-1.4 → typical trending market with noise
 *   D ≈ 1.5   → random walk
 *   D ≈ 1.7+  → chaotic, space-filling (extreme volatility / breakdown)
 *
 * Algorithm:
 *   For each scale k = 1, 2, ..., kMax:
 *     1. For each starting offset m in [0, k-1]:
 *        - Take the sub-series x(m), x(m+k), x(m+2k), ..., x(m + M*k)
 *          where M = floor((N - 1 - m) / k)
 *        - Compute L_m(k) = [Σ |Δ|] · (N-1) / (M · k · k)
 *     2. L(k) = mean of L_m(k) over the k offsets
 *   The dimension D is the slope of log(L(k)) vs log(1/k).
 */

function linearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 1.5, r2: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, r2 };
}

/**
 * Compute Higuchi fractal dimension.
 * The function is still named computeBoxDimension and returns the same
 * shape ({ D, r2, label, scales }) so all callers continue to work.
 *
 * @param {number[]} prices - Close prices (ascending order)
 * @returns {{ D: number, r2: number, label: string, scales: Array }}
 */
export function computeBoxDimension(prices) {
  const N = prices.length;
  if (N < 32) {
    return { D: 1.5, r2: 0, label: 'Insufficient data', scales: [] };
  }

  // Flat-line edge case: no variation → D = 1 exactly.
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  if (maxP - minP === 0) {
    return { D: 1.0, r2: 1, label: 'Smooth Trend', scales: [] };
  }

  // kMax tuned for ~500-730 bar daily series. The literature recommends
  // kMax such that there are still ~10+ points at the largest stride;
  // floor(sqrt(N)) is a good rule of thumb, capped at ~16 for stability.
  const kMax = Math.min(16, Math.max(8, Math.floor(Math.sqrt(N))));

  const logK = [];
  const logL = [];
  const scales = [];

  for (let k = 1; k <= kMax; k++) {
    const Lms = [];
    for (let m = 0; m < k; m++) {
      const M = Math.floor((N - 1 - m) / k);
      if (M < 1) continue;
      let sum = 0;
      for (let i = 1; i <= M; i++) {
        sum += Math.abs(prices[m + i * k] - prices[m + (i - 1) * k]);
      }
      // Higuchi normalization: (N-1) / (M · k · k)
      const Lm = (sum * (N - 1)) / (M * k * k);
      Lms.push(Lm);
    }
    if (Lms.length === 0) continue;
    const Lk = Lms.reduce((a, b) => a + b, 0) / Lms.length;
    if (Lk > 0) {
      logK.push(Math.log(1 / k));
      logL.push(Math.log(Lk));
      scales.push({ k, L: Lk });
    }
  }

  if (logK.length < 4) {
    return { D: 1.5, r2: 0, label: 'Insufficient data', scales: [] };
  }

  // Slope of log(L) vs log(1/k) IS the Higuchi fractal dimension.
  const { slope: D, r2 } = linearRegression(logK, logL);
  const clamped = Math.max(1, Math.min(2, D));

  // Labels — same buckets as box-counting since Higuchi produces values
  // in the same 1-2 range and the interpretation is identical (smoothness
  // vs space-filling chaos).
  let label;
  if (clamped < 1.15) label = 'Smooth Trend';
  else if (clamped < 1.35) label = 'Low Complexity';
  else if (clamped < 1.55) label = 'Moderate Chaos';
  else if (clamped < 1.75) label = 'High Volatility';
  else label = 'Extreme Chaos';

  return { D: clamped, r2, label, scales };
}
