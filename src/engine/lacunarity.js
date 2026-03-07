/**
 * Lacunarity — Measures gap distribution / clustering in price series
 *
 * High Λ → clustered gaps (accumulation/distribution zones, stealth building)
 * Low Λ  → uniform spacing (grinding, no directional bias)
 *
 * Uses gliding-box method on thresholded returns.
 */

/**
 * Compute lacunarity at multiple scales
 * @param {number[]} prices - Close prices
 * @returns {{ lambda: number, lambdaByScale: Array, label: string }}
 */
export function computeLacunarity(prices) {
  const n = prices.length;
  if (n < 20) {
    return { lambda: 1, lambdaByScale: [], label: 'Insufficient data' };
  }

  // Convert to binary series: 1 if return > 0, 0 otherwise
  const binary = [];
  for (let i = 1; i < n; i++) {
    binary.push(prices[i] > prices[i - 1] ? 1 : 0);
  }

  const len = binary.length;

  // Compute lacunarity at multiple box sizes
  const scales = [];
  const boxSizes = [];
  let r = 2;
  while (r <= Math.floor(len / 3)) {
    boxSizes.push(r);
    r = Math.max(r + 1, Math.floor(r * 1.4));
  }

  if (boxSizes.length < 2) {
    return { lambda: 1, lambdaByScale: [], label: 'Insufficient data' };
  }

  let totalLambda = 0;

  for (const boxSize of boxSizes) {
    // Gliding box: slide window of size boxSize across series
    const masses = [];
    for (let i = 0; i <= len - boxSize; i++) {
      let mass = 0;
      for (let j = 0; j < boxSize; j++) {
        mass += binary[i + j];
      }
      masses.push(mass);
    }

    if (masses.length < 2) continue;

    const mean = masses.reduce((a, b) => a + b, 0) / masses.length;
    if (mean === 0) {
      scales.push({ boxSize, lambda: 1 });
      totalLambda += 1;
      continue;
    }

    const variance = masses.reduce((a, m) => a + (m - mean) ** 2, 0) / masses.length;
    const lambda = 1 + variance / (mean * mean);

    scales.push({ boxSize, lambda });
    totalLambda += lambda;
  }

  if (scales.length === 0) {
    return { lambda: 1, lambdaByScale: [], label: 'Insufficient data' };
  }

  const avgLambda = totalLambda / scales.length;

  let label;
  if (avgLambda > 1.8) label = 'Highly Clustered (Accumulation/Distribution)';
  else if (avgLambda > 1.4) label = 'Moderately Clustered';
  else if (avgLambda > 1.15) label = 'Slightly Clustered';
  else label = 'Uniform (Grind)';

  return {
    lambda: Math.round(avgLambda * 1000) / 1000,
    lambdaByScale: scales,
    label,
  };
}

/**
 * Compute lacunarity on volume data to detect hoarding/dumps
 * @param {number[]} volumes - Volume array
 * @returns {{ lambda: number, label: string }}
 */
export function computeVolumeLacunarity(volumes) {
  if (volumes.length < 20) {
    return { lambda: 1, label: 'Insufficient data' };
  }

  // Threshold: above-average volume = 1, below = 0
  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const binary = volumes.map(v => (v > mean ? 1 : 0));

  const len = binary.length;
  const boxSizes = [];
  let r = 2;
  while (r <= Math.floor(len / 3)) {
    boxSizes.push(r);
    r = Math.max(r + 1, Math.floor(r * 1.4));
  }

  let totalLambda = 0;
  let count = 0;

  for (const boxSize of boxSizes) {
    const masses = [];
    for (let i = 0; i <= len - boxSize; i++) {
      let mass = 0;
      for (let j = 0; j < boxSize; j++) mass += binary[i + j];
      masses.push(mass);
    }
    if (masses.length < 2) continue;

    const m = masses.reduce((a, b) => a + b, 0) / masses.length;
    if (m === 0) { totalLambda += 1; count++; continue; }

    const v = masses.reduce((a, x) => a + (x - m) ** 2, 0) / masses.length;
    totalLambda += 1 + v / (m * m);
    count++;
  }

  const lambda = count > 0 ? totalLambda / count : 1;

  let label;
  if (lambda > 1.8) label = 'Volume Clustering (Hoarding/Dumps)';
  else if (lambda > 1.3) label = 'Moderate Volume Clustering';
  else label = 'Uniform Volume';

  return { lambda: Math.round(lambda * 1000) / 1000, label };
}
