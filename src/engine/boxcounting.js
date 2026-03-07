/**
 * Box-Counting Fractal Dimension
 *
 * Measures the complexity/roughness of a price path.
 * D ≈ 1.0 → smooth trend (clean directional move)
 * D ≈ 1.5 → noisy, volatile (typical market chaos)
 * D → 2.0 → space-filling chaos (extreme noise)
 */

/**
 * Compute box-counting dimension of a price series
 * @param {number[]} prices - Close prices
 * @returns {{ D: number, r2: number, label: string, scales: Array }}
 */
export function computeBoxDimension(prices) {
  const n = prices.length;
  if (n < 16) {
    return { D: 1.5, r2: 0, label: 'Insufficient data', scales: [] };
  }

  // Normalize price series to unit square [0,1] x [0,1]
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP;
  if (rangeP === 0) {
    return { D: 1.0, r2: 1, label: 'Flat line', scales: [] };
  }

  const normX = prices.map((_, i) => i / (n - 1));
  const normY = prices.map(p => (p - minP) / rangeP);

  // Grid scales: number of divisions along each axis
  const gridSizes = [];
  let g = 4;
  while (g <= Math.min(n, 256)) {
    gridSizes.push(g);
    g = Math.floor(g * 1.5);
  }

  if (gridSizes.length < 3) {
    return { D: 1.5, r2: 0, label: 'Insufficient data', scales: [] };
  }

  const logEps = [];
  const logN = [];
  const scales = [];

  for (const gridSize of gridSizes) {
    const eps = 1 / gridSize;
    const occupied = new Set();

    // Walk through price path and mark occupied boxes
    for (let i = 0; i < n; i++) {
      const bx = Math.min(Math.floor(normX[i] / eps), gridSize - 1);
      const by = Math.min(Math.floor(normY[i] / eps), gridSize - 1);
      occupied.add(`${bx},${by}`);

      // Also mark boxes along the line segment between consecutive points
      if (i > 0) {
        const steps = Math.max(2, Math.ceil(1 / eps / n * 2));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const ix = normX[i - 1] + t * (normX[i] - normX[i - 1]);
          const iy = normY[i - 1] + t * (normY[i] - normY[i - 1]);
          const ibx = Math.min(Math.floor(ix / eps), gridSize - 1);
          const iby = Math.min(Math.floor(iy / eps), gridSize - 1);
          occupied.add(`${ibx},${iby}`);
        }
      }
    }

    const count = occupied.size;
    logEps.push(Math.log(eps));
    logN.push(Math.log(count));
    scales.push({ gridSize, eps, count });
  }

  // D = -slope of log(N) vs log(eps)
  const mx = logEps.reduce((a, b) => a + b, 0) / logEps.length;
  const my = logN.reduce((a, b) => a + b, 0) / logN.length;
  let num = 0, den = 0;
  for (let i = 0; i < logEps.length; i++) {
    num += (logEps[i] - mx) * (logN[i] - my);
    den += (logEps[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : -1.5;
  const D = -slope;

  // R²
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < logEps.length; i++) {
    const pred = slope * logEps[i] + intercept;
    ssRes += (logN[i] - pred) ** 2;
    ssTot += (logN[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const clamped = Math.max(1, Math.min(2, D));

  let label;
  if (clamped < 1.15) label = 'Smooth Trend';
  else if (clamped < 1.35) label = 'Low Complexity';
  else if (clamped < 1.55) label = 'Moderate Chaos';
  else if (clamped < 1.75) label = 'High Volatility';
  else label = 'Extreme Chaos';

  return { D: clamped, r2, label, scales };
}
