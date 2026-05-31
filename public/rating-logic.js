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
  RANGE_BUY:   0.25,       // range_pos ≤ this counts as bottom of band
  RANGE_ADD:   0.40,       // ≤ this counts as lower-half
  RANGE_SELL:  0.60,       // ≥ this for bearish-conviction SELL
  RANGE_TRIM:  0.75,       // ≥ this for top-of-band TRIM
  VOL_LOW:     0.8,        // 5d/50d avg ratio below this = thin
  VOL_HIGH:    1.2,        // ratio above this = confirmed move
  VOLUME_CONFIRMED_TRIM_OVERRIDE: true,
};

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
 * @returns {{ rating: 'BUY'|'ADD'|'DIP'|'HOLD'|'TRIM'|'SELL', reason: string }}
 */
export function computeRating(r) {
  const C = r._conviction;
  const rangePos = r.range_pos;
  const volRatio = r.vol_ratio;
  const { tailBreak, aboveTail, aboveTrend } = trendGates(r.price, r.sma_62, r.sma_200);

  // 1. TAIL-break override: price below 200d (when known) ⇒ never
  //    BUY/ADD. Wins over everything else, regardless of conviction.
  if (tailBreak) return { rating: 'SELL', reason: 'TAIL break (price < 200d)' };

  // 2. Bearish conviction → SELL when range confirms (top half) or when
  //    even the TREND line has rolled.
  if (Number.isFinite(C) && C < -RATING_CONFIG.CONVICTION_GATE) {
    if (rangePos == null) return { rating: 'SELL', reason: 'Bearish conviction (no range data)' };
    if (rangePos >= RATING_CONFIG.RANGE_SELL || aboveTrend === false) {
      return { rating: 'SELL', reason: `Bearish C=${C} + ${rangePos >= RATING_CONFIG.RANGE_SELL ? 'top half of band' : 'below 62d trend'}` };
    }
    return { rating: 'HOLD', reason: 'Bearish but mid-band' };
  }

  // 3. Bullish conviction branches — graded by where price sits in band.
  if (Number.isFinite(C) && C > RATING_CONFIG.CONVICTION_GATE) {
    if (rangePos == null) return { rating: 'HOLD', reason: 'Bullish conviction (no range data — never BUY without range)' };

    // Top of band → TRIM, unless volume confirms a real breakout.
    if (rangePos >= RATING_CONFIG.RANGE_TRIM) {
      if (RATING_CONFIG.VOLUME_CONFIRMED_TRIM_OVERRIDE
          && Number.isFinite(volRatio) && volRatio > RATING_CONFIG.VOL_HIGH) {
        return { rating: 'HOLD', reason: `Top of band but volume confirms (5/50=${volRatio.toFixed(2)})` };
      }
      return { rating: 'TRIM', reason: `Top ${Math.round((1 - rangePos) * 100)}% of band` };
    }

    // Bottom of band + uptrend (gates pass OR are unknown) → BUY. Thin
    // volume downgrades BUY→ADD. Null-SMA tolerance lets newly-listed
    // names with strong conviction still BUY.
    if (rangePos <= RATING_CONFIG.RANGE_BUY && notFailing(aboveTrend) && notFailing(aboveTail)) {
      const thin = Number.isFinite(volRatio) && volRatio < RATING_CONFIG.VOL_LOW;
      return thin
        ? { rating: 'ADD', reason: `Buy zone but thin volume (5/50=${volRatio.toFixed(2)})` }
        : { rating: 'BUY', reason: 'Bottom of band, no trend break' };
    }

    // Lower half + uptrend → ADD. Thin volume downgrades ADD→HOLD.
    if (rangePos <= RATING_CONFIG.RANGE_ADD && notFailing(aboveTrend)) {
      const thin = Number.isFinite(volRatio) && volRatio < RATING_CONFIG.VOL_LOW;
      return thin
        ? { rating: 'HOLD', reason: `Add zone but thin volume (5/50=${volRatio.toFixed(2)})` }
        : { rating: 'ADD', reason: 'Lower half of band, above 62d' };
    }

    // Bullish conviction + above trend (or unknown) but mid/upper band → HOLD.
    if (notFailing(aboveTrend)) return { rating: 'HOLD', reason: "Bullish but mid-band — own, don't chase" };
  }

  // 4. DIP — pullback into the buy zone with mid-conviction. Not strong
  //    enough to BUY, but not a HOLD either. Flags genuine pullback-in-
  //    uptrend setups for watch-list attention.
  if (rangePos != null
      && rangePos <= RATING_CONFIG.RANGE_BUY
      && notFailing(aboveTail)
      && Number.isFinite(C)
      && C >= RATING_CONFIG.CONVICTION_DIP_LO
      && C <= RATING_CONFIG.CONVICTION_DIP_HI) {
    return { rating: 'DIP', reason: `In buy zone (range_pos=${rangePos.toFixed(2)}), mid-conviction (C=${C}) — watch for momentum to turn` };
  }

  return { rating: 'HOLD', reason: 'No edge' };
}

/**
 * Continuous entry-quality score for sorting & transparency.
 * +1 at LRR, -1 at TRR, 0 mid-band. null if no range data.
 */
export function entryQuality(r) {
  if (!Number.isFinite(r.range_pos)) return null;
  return Math.round((0.5 - r.range_pos) * 2 * 100) / 100;
}
