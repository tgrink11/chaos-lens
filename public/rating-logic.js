/**
 * Rating synthesis — SINGLE SOURCE OF TRUTH.
 *
 * Why this file lives in public/ instead of src/engine/:
 * This module is consumed by BOTH the browser (the static
 * kerry-scores.html page) and the server (api/ai-take.js, which builds
 * Claude prompts). Vite serves public/ as static, so the browser can
 * import it directly; Vercel serverless functions can import from
 * ../public/ via relative path because esbuild walks the dependency
 * tree across folder boundaries. One physical file → no drift between
 * what the table shows and what Claude sees.
 *
 * If you tune RATING_CONFIG here, both surfaces update on the next
 * deploy. No re-scan required.
 *
 * Conviction (the `_conviction` field on each row) is still computed
 * separately — for HTML it's the inline convictionScore() in
 * kerry-scores.html, for the server it's src/engine/conviction.js.
 * That pair is intentionally kept in lockstep with a synced comment;
 * the rating synthesis on top of conviction is what changes most
 * often, so that's what we centralized here.
 */

export const RATING_CONFIG = {
  CONVICTION_GATE: 1.0,    // |C| must exceed this to leave HOLD/DIP
  CONVICTION_DIP_LO: -0.5, // DIP fires when C is in this range AND
  CONVICTION_DIP_HI: 1.0,  //   range_pos ≤ RANGE_BUY AND above tail.
  CONVICTION_BUY_NO_RANGE: 2.5, // When range data is missing (newly-listed
                                // names with insufficient history), allow
                                // BUY only when conviction CLEARLY exceeds
                                // this higher bar AND no tail break has
                                // fired. Trade-off: buying on direction
                                // alone, no entry-timing verification.
  RANGE_BUY:   0.25,       // range_pos ≤ this counts as bottom of band
  RANGE_ADD:   0.40,       // ≤ this counts as lower-half
  RANGE_SELL:  0.60,       // ≥ this for bearish-conviction SELL
  RANGE_TRIM:  0.75,       // ≥ this for top-of-band TRIM
  VOL_LOW:     0.8,        // 5d/50d avg ratio below this = thin
  VOL_HIGH:    1.2,        // ratio above this = confirmed move
  VOLUME_CONFIRMED_TRIM_OVERRIDE: true,

  // ───── Trend-confirmation gate (Hurst + Box dim + Lacunarity) ─────
  // The 62-day SMA tells us we're "in" an uptrend; the fractal signature
  // tells us whether that trend is real or noise. All three must align
  // for BUY/ADD/DIP to fire — a stock above its 62d that's also random-
  // walking around (low H, high D, clustered Λ) isn't a confirmed
  // uptrend, just a stock that happens to be above a moving average.
  TREND_H_MIN: 0.55,        // Hurst > this = persistent (not random walk)
  TREND_D_MAX: 1.20,        // Box dim < this = smooth path (not chaotic)
  TREND_LAMBDA_MAX: 1.25,   // Λ < this = uniform vol (no extreme clustering)
};

// Returns true when the fractal signature confirms a real trend
// (regardless of direction — the directional read is the job of
// Conviction, not this gate). Null fractal values are treated as
// "don't veto" so newly-listed names still get evaluated.
function trendConfirmed(r) {
  const hOk = !Number.isFinite(r.hurst) || r.hurst >= RATING_CONFIG.TREND_H_MIN;
  const dOk = !Number.isFinite(r.box_dim) || r.box_dim <= RATING_CONFIG.TREND_D_MAX;
  const lOk = !Number.isFinite(r.lambda) || r.lambda <= RATING_CONFIG.TREND_LAMBDA_MAX;
  return hOk && dOk && lOk;
}

// Sort ordering: action urgency. BUY > ADD > DIP > HOLD > TRIM > SELL.
export const RATING_ORDER = { BUY: 6, ADD: 5, DIP: 4, HOLD: 3, TRIM: 2, SELL: 1 };

// Tri-state booleans for trend gates. null SMA → "no data, don't veto"
// rather than "fail closed." Newly-listed names without 200 bars of
// history can still rate when conviction + range_pos warrant.
function trendGates(price, sma62, sma200) {
  const hasTail = Number.isFinite(price) && Number.isFinite(sma200);
  const hasTrend = Number.isFinite(price) && Number.isFinite(sma62);
  return {
    tailBreak: hasTail && price < sma200,
    aboveTail: hasTail ? price > sma200 : null,
    aboveTrend: hasTrend ? price > sma62 : null,
  };
}

// "Doesn't fail." true and null both pass; only literal false vetoes.
function notFailing(v) { return v !== false; }

/**
 * @param {Object} r - kerry_scores row (or row-shaped object) with at
 *   minimum: _conviction, price, sma_62, sma_200, range_pos, vol_ratio.
 *   `_conviction` is the client-computed signed score (~-5..+5); rows
 *   from /api/kerry-scores need it attached by the caller before passing in.
 * @returns {{
 *   rating: 'BUY'|'ADD'|'DIP'|'HOLD'|'TRIM'|'SELL',
 *   reason: string,             // technical reason for tooltips + AI prompt
 *   subscriberReason: string    // plain-English explanation for the Simple view
 * }}
 */
export function computeRating(r) {
  const C = r._conviction;
  const rangePos = r.range_pos;
  const volRatio = r.vol_ratio;
  const { tailBreak, aboveTail, aboveTrend } = trendGates(r.price, r.sma_62, r.sma_200);
  // Fractal-quality confirmation. Required for BUY/ADD/DIP — if the
  // fractals say the price action is random/chaotic, even a strong
  // directional read shouldn't translate into an entry.
  const confirmed = trendConfirmed(r);

  // 1. TAIL-break override.
  if (tailBreak) return {
    rating: 'SELL',
    reason: 'TAIL break (price < 200d)',
    subscriberReason: 'Price broke below its long-term support — exit the position.',
  };

  // 2. Bearish conviction branches.
  if (Number.isFinite(C) && C < -RATING_CONFIG.CONVICTION_GATE) {
    if (rangePos == null) return {
      rating: 'SELL',
      reason: 'Bearish conviction (no range data)',
      subscriberReason: 'Bearish signals across the board — exit or avoid.',
    };
    if (rangePos >= RATING_CONFIG.RANGE_SELL || aboveTrend === false) {
      return {
        rating: 'SELL',
        reason: `Bearish C=${C} + ${rangePos >= RATING_CONFIG.RANGE_SELL ? 'top half of band' : 'below 62d trend'}`,
        subscriberReason: rangePos >= RATING_CONFIG.RANGE_SELL
          ? 'Bearish trend with price in the upper half of its range — sell into strength.'
          : 'Bearish trend and intermediate support has broken — exit the position.',
      };
    }
    return {
      rating: 'HOLD',
      reason: 'Bearish but mid-band',
      subscriberReason: 'Direction is weak but no urgent breakdown — wait, don\'t initiate.',
    };
  }

  // 3. Bullish conviction branches.
  if (Number.isFinite(C) && C > RATING_CONFIG.CONVICTION_GATE) {
    if (rangePos == null) {
      // High-conviction override: when range data is missing but
      // conviction CLEARLY exceeds the higher bar AND the fractals
      // confirm a real trend (not random walk), allow BUY. Tail break
      // was ruled out at step 1, so sma_200 is either null or
      // price > sma_200. The trade-off — buying on direction alone
      // without an entry-timing verification — is surfaced explicitly
      // in the reason text so the user sees the caveat.
      if (C > RATING_CONFIG.CONVICTION_BUY_NO_RANGE && confirmed) {
        return {
          rating: 'BUY',
          reason: `Strong bullish conviction (C=${C.toFixed(2)}) + trend confirmed (H/D/Λ); no range data — entry timing not verified`,
          subscriberReason: 'Strong bullish signals across the board and the price action confirms a real trend. This name is too new to verify a textbook entry price — BUY with the caveat that entry timing isn\'t verified by the volatility band.',
        };
      }
      return {
        rating: 'HOLD',
        reason: confirmed
          ? 'Bullish conviction (no range data — never BUY without range)'
          : 'Bullish conviction but fractals don\'t confirm trend (random walk / chaotic path)',
        subscriberReason: confirmed
          ? 'Bullish signals are present but the stock is too new to verify a good entry price — hold or watch.'
          : 'Bullish signals present but the price action looks like random noise — hold or wait for the trend to confirm.',
      };
    }

    // Top of band → TRIM, unless volume confirms.
    if (rangePos >= RATING_CONFIG.RANGE_TRIM) {
      if (RATING_CONFIG.VOLUME_CONFIRMED_TRIM_OVERRIDE
          && Number.isFinite(volRatio) && volRatio > RATING_CONFIG.VOL_HIGH) {
        return {
          rating: 'HOLD',
          reason: `Top of band but volume confirms (5/50=${volRatio.toFixed(2)})`,
          subscriberReason: 'Stretched price but strong volume backing it — own what you have, don\'t add or trim.',
        };
      }
      return {
        rating: 'TRIM',
        reason: `Top ${Math.round((1 - rangePos) * 100)}% of band`,
        subscriberReason: 'Bullish but price is stretched to the top of its range — lock in some profits here.',
      };
    }

    // Bottom of band + uptrend + fractal trend confirmation → BUY
    // (or ADD if thin volume). If the fractals don't confirm a real
    // trend, drop to HOLD — bullish conviction at a buy-zone price
    // doesn't matter if the price action is random/chaotic noise.
    if (rangePos <= RATING_CONFIG.RANGE_BUY && notFailing(aboveTrend) && notFailing(aboveTail)) {
      if (!confirmed) {
        return {
          rating: 'HOLD',
          reason: 'Buy zone + above 62d but fractals don\'t confirm trend (random walk / chaotic path)',
          subscriberReason: 'Price is at the low end of its range and above the 62-day average, but the underlying price action looks like noise rather than a real trend — wait for confirmation.',
        };
      }
      const thin = Number.isFinite(volRatio) && volRatio < RATING_CONFIG.VOL_LOW;
      return thin
        ? {
            rating: 'ADD',
            reason: `Buy zone, trend confirmed (H/D/Λ), but thin volume (5/50=${volRatio.toFixed(2)})`,
            subscriberReason: 'Favorable price and the trend is confirmed by the fractals — but volume is light. Add gradually rather than all at once.',
          }
        : {
            rating: 'BUY',
            reason: 'Bottom of band, above 62d, trend confirmed (H/D/Λ)',
            subscriberReason: 'Bullish signals lined up, price action confirms a real trend, and price is at the low end of its range — favorable entry.',
          };
    }

    // Lower half + uptrend + fractal trend confirmation → ADD
    // (or HOLD if thin volume / unconfirmed trend).
    if (rangePos <= RATING_CONFIG.RANGE_ADD && notFailing(aboveTrend)) {
      if (!confirmed) {
        return {
          rating: 'HOLD',
          reason: 'Lower-half band, above 62d but fractals don\'t confirm trend',
          subscriberReason: 'Bullish setup at a fair price but the trend isn\'t confirmed by the fractal signature — wait for cleaner price action.',
        };
      }
      const thin = Number.isFinite(volRatio) && volRatio < RATING_CONFIG.VOL_LOW;
      return thin
        ? {
            rating: 'HOLD',
            reason: `Add zone but thin volume (5/50=${volRatio.toFixed(2)})`,
            subscriberReason: 'Bullish setup with confirmed trend but volume is thin — wait for participation before adding.',
          }
        : {
            rating: 'ADD',
            reason: 'Lower half of band, above 62d, trend confirmed (H/D/Λ)',
            subscriberReason: 'Bullish trend intact and confirmed, with price below mid-range — good place to add to an existing position.',
          };
    }

    // Mid/upper band + uptrend → HOLD.
    if (notFailing(aboveTrend)) return {
      rating: 'HOLD',
      reason: "Bullish but mid-band — own, don't chase",
      subscriberReason: 'Bullish trend but price is mid-range — own it but don\'t chase a higher entry.',
    };
  }

  // 4. DIP — pullback into the buy zone with mid-conviction. Requires
  //    trend confirmation: a "DIP" without confirmed fractals is just
  //    a falling stock, not a watch-list buy candidate.
  if (rangePos != null
      && rangePos <= RATING_CONFIG.RANGE_BUY
      && notFailing(aboveTail)
      && confirmed
      && Number.isFinite(C)
      && C >= RATING_CONFIG.CONVICTION_DIP_LO
      && C <= RATING_CONFIG.CONVICTION_DIP_HI) {
    return {
      rating: 'DIP',
      reason: `In buy zone (range_pos=${rangePos.toFixed(2)}), mid-conviction (C=${C}), trend confirmed (H/D/Λ) — watch for momentum to turn`,
      subscriberReason: 'Pulled back into support, long-term trend intact, and the underlying price action confirms a real trend — watch for momentum to confirm before buying.',
    };
  }

  return {
    rating: 'HOLD',
    reason: 'No edge',
    subscriberReason: 'Signals are mixed — no clear action right now.',
  };
}

/**
 * Continuous entry-quality score for sorting & transparency.
 * +1 at LRR, -1 at TRR, 0 mid-band. null if no range data.
 */
export function entryQuality(r) {
  if (!Number.isFinite(r.range_pos)) return null;
  return Math.round((0.5 - r.range_pos) * 2 * 100) / 100;
}
