/**
 * Composite conviction score — single source of truth.
 *
 * This module replaces four duplicated implementations of the same formula
 * that lived in kerry-scan.js, ai-take.js, analyze-ticker.js, and inline
 * in kerry-scores.html. The HTML file still has to duplicate the body
 * (it's a static page with no module loader), but the server-side
 * endpoints all import from here so any future change happens in one
 * place — except the HTML mirror, which is kept in lockstep manually.
 *
 * Returns a signed score in roughly -5 … +5. Positive = bullish setup,
 * negative = bearish setup, near-zero = signals disagree.
 *
 * Inputs (all fields on the kerry_scores row shape):
 *   - short_term_direction:    'bullish' | 'bearish' | 'neutral'
 *   - short_term_confidence:   0-100
 *   - medium_term_direction:   'bullish' | 'bearish' | 'neutral'
 *   - medium_term_confidence:  0-100
 *   - prediction:              'THRUST_UP' | 'CASCADE_DOWN' | 'CONSOLIDATION'
 *   - prediction_confidence:   0-100
 *   - mood:                    'EUPHORIA' | 'STEALTH_BUILD' | 'PANIC' | 'GRIND'
 *   - hurst:                   0-1
 *   - box_dim:                 1-2
 *
 * Calibration changes vs. the original formula (May 2026 audit):
 *   A. tanh-smoothed box-dim amplification — kills the discontinuity at
 *      zero where a 0.01 signal shift could jump conviction by ±1.0
 *   B. CONSOLIDATION penalty — when the engine literally says "no
 *      breakout" but the directional signals are strong (|s| > 1.0),
 *      pull the score back toward neutral by 0.3
 *   C. Internal-disagreement penalty — when 15-day and 62-day horizons
 *      point opposite directions, multiply by 0.7 to reflect the split
 *   D. Hurst quality factor — H > 0.6 amplifies an existing direction
 *      (genuinely persistent trend); H in [0.45, 0.55] with strong
 *      directional signals subtracts 0.3 (random-walk territory, the
 *      direction isn't structurally supported)
 */
export function computeConviction(r) {
  let s = 0;

  // Direction signals weighted by confidence.
  const c15 = (r.short_term_confidence || 0) / 100;
  if (r.short_term_direction === 'bullish') s += c15;
  else if (r.short_term_direction === 'bearish') s -= c15;

  const c62 = (r.medium_term_confidence || 0) / 100;
  if (r.medium_term_direction === 'bullish') s += c62;
  else if (r.medium_term_direction === 'bearish') s -= c62;

  const cP = (r.prediction_confidence || 0) / 100;
  if (r.prediction === 'THRUST_UP') s += cP;
  else if (r.prediction === 'CASCADE_DOWN') s -= cP;

  // Mood. Asymmetric: STEALTH_BUILD is a leading bullish signal so it
  // earns a positive weight even though there's no equivalent quiet-
  // distribution mood.
  if (r.mood === 'EUPHORIA') s += 0.7;
  else if (r.mood === 'STEALTH_BUILD') s += 0.5;
  else if (r.mood === 'PANIC') s -= 0.7;

  // FIX B — CONSOLIDATION penalty. The engine is explicitly saying "no
  // breakout coming" but the rest of the signals are pulling directional.
  // Reduce the conviction magnitude so the row reads "model is split"
  // rather than "high conviction."
  if (r.prediction === 'CONSOLIDATION' && Math.abs(s) > 1.0) {
    s -= Math.sign(s) * 0.3;
  }

  // FIX C — Horizon-disagreement penalty. 15-day bullish + 62-day bearish
  // (or vice versa) means the model is fighting itself; the cancellation
  // already reduces magnitude, but explicit dampening makes it clearer.
  const dir15 = r.short_term_direction;
  const dir62 = r.medium_term_direction;
  if (
    (dir15 === 'bullish' && dir62 === 'bearish') ||
    (dir15 === 'bearish' && dir62 === 'bullish')
  ) {
    s *= 0.7;
  }

  // FIX D — Hurst quality factor. High persistence (H > 0.6) means the
  // trend is structurally real; amplify whichever direction the signals
  // already point. H near random-walk territory with strong directional
  // signals warrants skepticism — the direction isn't backed by the
  // underlying chaos structure.
  if (Number.isFinite(r.hurst)) {
    if (r.hurst > 0.6 && Math.abs(s) > 0.5) {
      s += Math.sign(s) * 0.3;
    } else if (r.hurst >= 0.45 && r.hurst <= 0.55 && Math.abs(s) > 1.0) {
      s -= Math.sign(s) * 0.3;
    }
  }

  // FIX A — Smoothness bonus with continuous scaling. tanh(s) maps the
  // signal sign smoothly through zero (saturating to ±1 for large |s|),
  // so a tiny positive signal gets a tiny amplification instead of the
  // full ±1.0 step the old `sign > 0 ? 1 : -1` produced.
  if (Number.isFinite(r.box_dim)) {
    const smoothness = Math.max(0, 1.5 - r.box_dim); // 0 (chop) → 0.5 (clean)
    s += smoothness * Math.tanh(s) * 2;
  }

  return Math.round(s * 100) / 100;
}
