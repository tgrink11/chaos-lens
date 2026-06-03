/**
 * 1880 Quant Analyzer — Rating synthesis. SINGLE SOURCE OF TRUTH.
 *
 * Why this file lives in public/ instead of src/engine/:
 * This module is consumed by BOTH the browser (the static kerry-scores.html
 * page) and the server (api/ai-take.js, which builds Claude prompts).
 * Vite serves public/ as static, so the browser can import it directly;
 * Vercel serverless functions can import from ../public/ via relative path
 * because esbuild walks the dependency tree across folder boundaries.
 * One physical file → no drift between what the table shows and what
 * Claude sees.
 *
 * THE RATING MATRIX
 * ─────────────────
 * Two orthogonal inputs combine into one Rating:
 *
 * (1) SMA tier — how the price stacks against the 15 / 62 / 200-day SMAs:
 *     STRONG       price > 15 SMA > 62 SMA > 200 SMA (fully stacked bull)
 *     TRENDING     price > 62 SMA AND price > 200 SMA
 *     WATCH        price > 200 SMA only
 *     SPECULATIVE  price < 200 SMA (line of last resort broken)
 *
 * (2) Fractal confirmation — does the price action confirm a real trend:
 *     STRONG       Hurst ≥ 0.55 AND BoxDim ≤ 1.20 AND Λ ≤ 1.25 (all 3 pass)
 *     INDECISIVE   1 or 2 of 3 pass
 *     WEAK         0 of 3 pass (random/chaotic)
 *
 * Combined into the 4×3 matrix:
 *
 *                    STRONG fractal       INDECISIVE         WEAK fractal
 *   STRONG SMA       STRONG ACCUMULATION  ACCUMULATING       TOPPING
 *   TRENDING SMA     ACCUMULATING         NO IDEA            DISTRIBUTING
 *   WATCH SMA        BUILDING BASE        NO IDEA            DISTRIBUTION
 *   SPECULATIVE SMA  SPECULATIVE          SPECULATIVE        DISTRIBUTION
 *
 * Subscriber action map (rough):
 *   STRONG ACCUMULATION   own / add — clearest signal
 *   ACCUMULATING          own / add — trend forming
 *   BUILDING BASE         watch — early stage
 *   NO IDEA               hold / no edge
 *   TOPPING               trim — late stage, fractal weakening
 *   DISTRIBUTING          reduce — selling pressure starting
 *   DISTRIBUTION          exit / avoid — clear distribution
 *   SPECULATIVE           avoid (or for speculative reclaim play only)
 */

export const RATING_CONFIG = {
  // Fractal-confirmation gate thresholds. The same thresholds that
  // previously gated the BUY/ADD/DIP system — kept here for continuity
  // and because they're empirically calibrated to the real-stock
  // distribution (see commits c0d6d97 / df182ef).
  FRACTAL_H_MIN: 0.55,        // Hurst ≥ this = persistent (not random walk)
  FRACTAL_D_MAX: 1.20,        // Box dim ≤ this = smooth path (not chaotic)
  FRACTAL_LAMBDA_MAX: 1.25,   // Λ ≤ this = uniform vol (no extreme clustering)
};

// Sort order: action urgency / bullishness. STRONG ACCUMULATION at top,
// DISTRIBUTION at bottom. Speculative sits below distribution since it's
// "dead money" in most cases (below the 200-day line of last resort).
export const RATING_ORDER = {
  'STRONG ACCUMULATION': 8,
  'ACCUMULATING':        7,
  'BUILDING BASE':       6,
  'NO IDEA':             5,
  'TOPPING':             4,
  'DISTRIBUTING':        3,
  'DISTRIBUTION':        2,
  'SPECULATIVE':         1,
};

// Tailwind classes for each Rating badge. Greens for accumulation states,
// slate for indecision, orange/red for distribution states, amber for
// speculative (caution).
export const RATING_BADGE_CLS = {
  'STRONG ACCUMULATION': 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-700',
  'ACCUMULATING':        'bg-emerald-100 text-emerald-800 font-semibold ring-1 ring-emerald-400',
  'BUILDING BASE':       'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300',
  'NO IDEA':             'bg-slate-100 text-slate-600',
  'TOPPING':             'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
  'DISTRIBUTING':        'bg-orange-200 text-orange-900 font-semibold',
  'DISTRIBUTION':        'bg-red-100 text-red-800 font-bold ring-1 ring-red-400',
  'SPECULATIVE':         'bg-amber-100 text-amber-800 ring-1 ring-amber-400',
};

/**
 * Compute the SMA tier given price + 15/62/200 SMAs.
 * Null SMAs are tolerated — they degrade the tier (a stock with no
 * 200-day history can't qualify for anything above SPECULATIVE without
 * a 200-day reference). This matters for newly-listed names.
 *
 * @param {{price:number, sma_15:?number, sma_62:?number, sma_200:?number}} r
 * @returns {'STRONG'|'TRENDING'|'WATCH'|'SPECULATIVE'|null}
 */
export function smaTier(r) {
  const p = r.price;
  if (!Number.isFinite(p)) return null;
  const s15 = Number.isFinite(r.sma_15) ? r.sma_15 : null;
  const s62 = Number.isFinite(r.sma_62) ? r.sma_62 : null;
  const s200 = Number.isFinite(r.sma_200) ? r.sma_200 : null;

  // Line of last resort: if SMA200 exists and price is below it, the
  // stock is in speculative territory regardless of the shorter MAs.
  if (s200 != null && p < s200) return 'SPECULATIVE';

  // Without an SMA200, we can't confirm "above the line of last resort,"
  // so the highest tier we can grant is WATCH. Newly-listed names sit here.
  if (s200 == null) {
    // No 200-day yet. Use 62-day as the next-best ladder if available.
    if (s62 != null && p > s62 && s15 != null && p > s15) return 'TRENDING';
    if (s62 != null && p > s62) return 'TRENDING';
    return 'WATCH';
  }

  // Above SMA200. Climb the ladder by adding 62 and 15 gates.
  const above62 = s62 != null && p > s62;
  const above15 = s15 != null && p > s15;
  if (above62 && above15) {
    // Strict "stacked" version: also require sma15 > sma62 > sma200 so
    // we don't reward a price spike that sits above all MAs but with
    // the MAs themselves crossing over bearishly.
    const stacked = s15 != null && s62 != null && s200 != null
      && s15 > s62 && s62 > s200;
    return stacked ? 'STRONG' : 'TRENDING';
  }
  if (above62) return 'TRENDING';
  return 'WATCH';
}

/**
 * Compute fractal confirmation based on Hurst / BoxDim / Lambda gates.
 * Null values are treated as "missing data" — we count only gates that
 * have a valid input. If all three are null, returns null.
 *
 * @param {{hurst:?number, box_dim:?number, lambda:?number}} r
 * @returns {'STRONG'|'INDECISIVE'|'WEAK'|null}
 */
export function fractalConfirmation(r) {
  const checks = [];
  if (Number.isFinite(r.hurst))   checks.push(r.hurst   >= RATING_CONFIG.FRACTAL_H_MIN);
  if (Number.isFinite(r.box_dim)) checks.push(r.box_dim <= RATING_CONFIG.FRACTAL_D_MAX);
  if (Number.isFinite(r.lambda))  checks.push(r.lambda  <= RATING_CONFIG.FRACTAL_LAMBDA_MAX);
  if (checks.length === 0) return null;
  const passed = checks.filter(Boolean).length;
  // Scale to the equivalent "if we had 3 inputs" buckets so partial-data
  // names still get sensible labels (e.g. 2-of-2 passing = STRONG).
  const ratio = passed / checks.length;
  if (ratio >= 0.99) return 'STRONG';
  if (ratio <= 0.01) return 'WEAK';
  return 'INDECISIVE';
}

// The 4×3 lookup matrix. Indexed by [tier][confirmation].
const RATING_MATRIX = {
  'STRONG': {
    'STRONG':      'STRONG ACCUMULATION',
    'INDECISIVE':  'ACCUMULATING',
    'WEAK':        'TOPPING',
  },
  'TRENDING': {
    'STRONG':      'ACCUMULATING',
    'INDECISIVE':  'NO IDEA',
    'WEAK':        'DISTRIBUTING',
  },
  'WATCH': {
    'STRONG':      'BUILDING BASE',
    'INDECISIVE':  'NO IDEA',
    'WEAK':        'DISTRIBUTION',
  },
  'SPECULATIVE': {
    'STRONG':      'SPECULATIVE',
    'INDECISIVE':  'SPECULATIVE',
    'WEAK':        'DISTRIBUTION',
  },
};

// Plain-English explanations per rating. Each shows up in the Rating
// badge tooltip and feeds the AI Take prompt's framing.
const SUBSCRIBER_REASONS = {
  'STRONG ACCUMULATION': 'Price is stacked above all three moving averages and the underlying price action confirms a real, persistent trend. This is the model\'s strongest accumulation signal — own / add.',
  'ACCUMULATING':        'Price is above the medium- and long-term trend lines, and the price action supports a real trend. A constructive setup — own / add on weakness.',
  'BUILDING BASE':       'Price has reclaimed the 200-day line of last resort with a confirmed fractal signature. Still early — watch for the 62-day cross before adding aggressively.',
  'NO IDEA':             'Price is in a defensible trend tier but the underlying price action doesn\'t confirm or reject — mixed signals, no clear edge. Hold what you have; don\'t initiate.',
  'TOPPING':             'Price still stacked bullishly above all MAs, but the underlying price action has gone chaotic / mean-reverting. The trend is losing fractal support — trim into strength.',
  'DISTRIBUTING':        'Price still above the 62 / 200 lines, but the fractal signature has weakened to random or chaotic. Selling pressure is starting beneath the surface — reduce exposure.',
  'DISTRIBUTION':        'Clear distribution — either the price has lost the 200-day or the fractal structure has fully broken down. Exit / avoid.',
  'SPECULATIVE':         'Price is below the 200-day line of last resort. Nothing structurally good happens below this line. Speculative reclaim plays only.',
};

/**
 * Main rating function — combines SMA tier + fractal confirmation.
 *
 * @param {Object} r - kerry_scores row (or row-shaped object) with at
 *   minimum: price, sma_15, sma_62, sma_200, hurst, box_dim, lambda.
 *   _conviction is no longer required for the Rating itself but is
 *   still passed through if present for downstream display.
 * @returns {{
 *   rating: string,             // one of the 8 matrix labels
 *   tier: string|null,          // SMA tier (STRONG/TRENDING/WATCH/SPECULATIVE)
 *   confirmation: string|null,  // fractal (STRONG/INDECISIVE/WEAK)
 *   reason: string,             // technical reason for tooltips + AI prompt
 *   subscriberReason: string    // plain-English explanation
 * }}
 */
export function computeRating(r) {
  const tier = smaTier(r);
  const conf = fractalConfirmation(r);

  // Insufficient data: we need at least a price + one SMA to produce
  // any tier, and one fractal value to produce any confirmation. If
  // either is missing, the Rating is "NO IDEA" with a clear caveat.
  if (!tier || !conf) {
    return {
      rating: 'NO IDEA',
      tier,
      confirmation: conf,
      reason: !tier ? 'no SMA reference (newly-listed or missing data)'
            : 'no fractal signature available',
      subscriberReason: 'Insufficient data to score this name yet — typically a newly-listed stock or one with gaps in its price history.',
    };
  }

  const rating = RATING_MATRIX[tier][conf];
  const reason = `SMA tier=${tier} (price vs 15/62/200), fractal=${conf} (H/D/Λ vs ${RATING_CONFIG.FRACTAL_H_MIN}/${RATING_CONFIG.FRACTAL_D_MAX}/${RATING_CONFIG.FRACTAL_LAMBDA_MAX})`;
  return {
    rating,
    tier,
    confirmation: conf,
    reason,
    subscriberReason: SUBSCRIBER_REASONS[rating] || '',
  };
}

/**
 * Backwards-compat shim: entryQuality is still imported by the page for
 * sort-by-entry-quality. Kept as a no-op until we redesign sort options
 * for the new Rating system. Returns null so the sort gracefully falls
 * back to symbol order.
 */
export function entryQuality(r) {
  if (!Number.isFinite(r.range_pos)) return null;
  // Same shape as before so the column sort doesn't break: +1 at LRR,
  // -1 at TRR, 0 mid-band. With the new Rating, range_pos is no longer
  // a primary driver, but it's still informative for entry timing.
  return Math.round((0.5 - r.range_pos) * 2 * 100) / 100;
}
