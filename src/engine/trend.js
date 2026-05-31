/**
 * Trend + setup detection.
 *
 * Returns 4 simple moving averages (9 / 15 / 62 / 200 day) plus a
 * categorical "setup" label that distinguishes between the *accumulation*
 * phase (build-up before the conviction-driven breakout) and the
 * *breakout* itself (the day conviction jumps from moderate to high).
 *
 * The motivation: the existing conviction score tends to spike on the
 * day of a breakout, not the day before. Looking at SMAs + conviction
 * slope + price-vs-MA structure surfaces the quiet accumulation phase
 * that precedes the spike. The setup label is the headline; the SMA
 * values are stored so the UI can render the full trend ladder.
 */

function sma(arr, period) {
  if (!Array.isArray(arr) || arr.length < period) return null;
  let s = 0;
  for (let i = arr.length - period; i < arr.length; i++) s += arr[i];
  return s / period;
}

function smaOffset(arr, period, offset) {
  // SMA `offset` days ago (e.g. offset=5 returns the SMA as of 5 trading
  // days back, useful for measuring slope).
  if (!Array.isArray(arr) || arr.length < period + offset) return null;
  const end = arr.length - offset;
  let s = 0;
  for (let i = end - period; i < end; i++) s += arr[i];
  return s / period;
}

function round2(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * @param {number[]} close - ascending daily closes
 * @param {number} currentConviction - today's conviction score (signed, -5..+5)
 * @param {Array<{date:string,value:number}>} prevHistory - prior days' convictions,
 *   newest first (the same field that lives on each kerry_scores row).
 * @returns {{
 *   sma9: number|null, sma15: number|null, sma62: number|null, sma200: number|null,
 *   setup: 'ACCUMULATING'|'BREAKOUT'|'EXTENDED'|'UPTREND'|'DOWNTREND'|'NEUTRAL'|null
 * }}
 */
export function computeTrend(close, currentConviction, prevHistory) {
  if (!Array.isArray(close) || close.length < 15) {
    return { sma9: null, sma15: null, sma62: null, sma200: null, setup: null };
  }

  // sma9 deliberately dropped from the trend ladder. The 9-day was too
  // noisy to carry signal — 62-day is the make-or-break trend line and
  // 200-day is the line of last resort. We keep computing sma15 for
  // internal use only (the ACCUMULATING setup detector needs a slope
  // sample shorter than 62d), but it's no longer displayed.
  const sma9 = null;
  const sma15 = sma(close, 15);
  const sma62 = sma(close, 62);
  const sma200 = sma(close, 200);
  const price = close[close.length - 1];

  // Slope of the 15-day SMA over the last 5 bars. Used as a proxy for
  // "trend is forming" without requiring price itself to be making
  // higher highs yet.
  const sma15_5dAgo = smaOffset(close, 15, 5);
  const sma15Rising = sma15 != null && sma15_5dAgo != null && sma15 > sma15_5dAgo;

  // Conviction history values, newest first → make a chronological array
  // and measure today's delta against the most recent prior value.
  const histVals = Array.isArray(prevHistory)
    ? prevHistory.map(h => h?.value).filter(v => Number.isFinite(v))
    : [];
  const prevConv = histVals.length > 0 ? histVals[0] : null;
  const convDelta = (Number.isFinite(currentConviction) && Number.isFinite(prevConv))
    ? currentConviction - prevConv
    : 0;
  const convAvg5 = histVals.length > 0
    ? histVals.reduce((a, b) => a + b, 0) / histVals.length
    : null;

  // ---------- Setup classification ----------
  //
  // Order matters: check the most specific labels first.

  // 1. EXTENDED — already running hot. 4 of the last 5 days at conviction
  //    above 2.5 means the breakout is well-established and the easy
  //    money is already gone.
  const recentHighDays = histVals.filter(v => v > 2.5).length;
  if (recentHighDays >= 4 && currentConviction > 2.5) {
    return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'EXTENDED' };
  }

  // 2. BREAKOUT — conviction just jumped from sub-1.5 yesterday to >2.0
  //    today AND price is above the short-term MA stack. This is the
  //    catch-it-on-the-day-of move (or the day-after, given EOD data).
  const priceAboveShortStack = sma9 != null && sma15 != null
    && price > sma9 && sma9 > sma15;
  const justBrokeOut = Number.isFinite(prevConv) && prevConv < 1.5
    && currentConviction > 2.0;
  if (justBrokeOut && priceAboveShortStack) {
    return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'BREAKOUT' };
  }

  // 3. ACCUMULATING — the quiet build-up. The signal we're after:
  //      - 9-day SMA above the 15-day (short-term turning up)
  //      - 15-day SMA rising (trend forming)
  //      - 15-day still at or below 62-day (medium-term not yet confirmed)
  //      - Today's price within 8% of the 62-day MA (still consolidating)
  //      - Conviction is positive but not yet a spike (1.0 to 2.5 range)
  //      - Conviction trending up over the last 5 days
  //    Requires 4 of 6 conditions; conservative enough to filter chop
  //    without being so strict it never fires.
  const accumChecks = [];
  if (sma9 != null && sma15 != null && sma9 > sma15) accumChecks.push('sma9>sma15');
  if (sma15Rising) accumChecks.push('sma15 rising');
  if (sma15 != null && sma62 != null && sma15 < sma62 * 1.005) accumChecks.push('sma15 below sma62');
  if (sma62 != null && Math.abs(price - sma62) / sma62 < 0.08) accumChecks.push('price near sma62');
  if (Number.isFinite(currentConviction) && currentConviction >= 1.0 && currentConviction <= 2.5) accumChecks.push('conv moderate');
  if (convDelta > 0.2 && Number.isFinite(convAvg5) && currentConviction > convAvg5) accumChecks.push('conv rising');
  if (accumChecks.length >= 4) {
    return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'ACCUMULATING' };
  }

  // 4. UPTREND / DOWNTREND — the simple stacked-MA check. Catches the
  //    "trend already in place" case for stocks that didn't get caught
  //    in BREAKOUT (e.g. they broke out weeks ago).
  const fullStackUp = sma9 != null && sma15 != null && sma62 != null && sma200 != null
    && price > sma9 && sma9 > sma15 && sma15 > sma62 && sma62 > sma200;
  if (fullStackUp) {
    return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'UPTREND' };
  }
  const fullStackDown = sma9 != null && sma15 != null && sma62 != null && sma200 != null
    && price < sma9 && sma9 < sma15 && sma15 < sma62 && sma62 < sma200;
  if (fullStackDown) {
    return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'DOWNTREND' };
  }

  return { sma9: round2(sma9), sma15: round2(sma15), sma62: round2(sma62), sma200: round2(sma200), setup: 'NEUTRAL' };
}
