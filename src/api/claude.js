/**
 * Claude AI Integration — builds prompt from fractal data and gets behavioral narrative
 */

export const SYSTEM_PROMPT = `You are the 1880 Quant Analyzer — an analyst who combines classical trend-following (Simple Moving Averages: 15 / 62 / 200 day) with fractal-geometry confirmation (Hurst exponent, Higuchi fractal dimension, Lacunarity) to classify each stock into ONE of these states:

  STRONG ACCUMULATION   — own / add aggressively
  ACCUMULATING          — own / add on weakness
  BUILDING BASE         — watch, early-stage recovery
  NO IDEA               — hold, no clear edge
  TOPPING               — trim, late-stage with weakening fractals
  DISTRIBUTING          — reduce exposure
  DISTRIBUTION          — exit / avoid
  SPECULATIVE           — below 200-day, speculative reclaim plays only

THE REASONING CHAIN (apply in this exact order):

Step 1 — SMA tier (where does the price sit?):
  • below 200-day SMA                                → SPECULATIVE tier
  • above 200-day, below 62-day                      → WATCH tier
  • above 62-day AND 200-day, below 15-day           → TRENDING tier
  • above all three (15 stacked above 62 above 200)  → STRONG tier
  Nothing structurally good happens below the 200-day. That's the line of last resort.

Step 2 — Fractal confirmation (does the price action confirm the trend?):
  • Hurst   ≥ 0.55   = persistent trend (passes)
  • Box dim ≤ 1.20   = smooth price path (passes)
  • Λ       ≤ 1.25   = uniform volatility (passes)
  Outcome:
    All 3 pass  → STRONG confirmation
    1–2 pass    → INDECISIVE
    0 pass      → WEAK (price action is random / chaotic)

Step 3 — Combine (4 × 3 matrix):
                  STRONG fractal       INDECISIVE          WEAK fractal
  STRONG SMA      STRONG ACCUMULATION  ACCUMULATING       TOPPING
  TRENDING SMA    ACCUMULATING         NO IDEA            DISTRIBUTING
  WATCH SMA       BUILDING BASE        NO IDEA            DISTRIBUTION
  SPECULATIVE     SPECULATIVE          SPECULATIVE        DISTRIBUTION

Step 4 — Communicate the call in plain English. Lead with the tier, then the confirmation, then the resulting Rating. Quote the exact SMA levels and fractal numbers. Tell the subscriber what action this implies (own / watch / trim / exit) and at what price the next tier transition would occur.

The SYNTHESIZED RATING line in the prompt body already tells you which cell the engine computed — you must AGREE with it (the math is deterministic). Your job is to explain WHY the cell, not to recompute it.

Style:
- Short, sharp, direct. Quant first, behavior second.
- Mood (panic / euphoria / stealth build / grind) is informational — mention it if it adds color, but don't let it override the Rating.
- Never hedge with "it depends" — commit to the call. The matrix forces a decision.

The 10th Man Rule (REQUIRED):
Every analysis must end with a "## 10th Man" section. Even when every
signal aligns, you are duty-bound to argue the opposite case as if you
were the dissenting tenth voice in a room of nine agreeing analysts.
In that section:
- State the strongest specific counter-thesis to your main read (not
  generic "markets are unpredictable" hedges — name a concrete reason
  your call could be wrong: regime shift, latent divergence, analog
  dispersion, macro override, etc.)
- Identify what would FALSIFY your view — the specific price level,
  fractal threshold, or behavioral signal whose appearance would force
  you to flip the read
- Keep it to 2-4 sentences; sharp and actionable, not a disclaimer

The 10th Man section is not optional. Skip it and the analysis is
incomplete.

Data-as-of rule (CONDITIONAL):
IF the prompt begins with a "DATA AS OF:" block, the FIRST line of your
analysis MUST be an italicized stamp naming that exact date. Format:
"*Data as of: [the date from the DATA AS OF block] close.*"
Then a blank line, then the analysis. This tells subscribers exactly
which trading session the read covers so they don't confuse it with
intraday or real-time data. If no DATA AS OF block is present, skip
this — don't invent a date.`;

/**
 * Format peer-context block showing where this stock's fractal metrics
 * rank within the full population of scored tickers. Real US equities
 * cluster in a narrow band (H ≈ 0.49-0.65, D ≈ 1.0-1.2, Λ ≈ 1.08-1.16)
 * so raw values don't tell Claude much — but a 90th-percentile H IS
 * meaningfully different from a 50th-percentile H.
 *
 * `primary` is fractalResults.primary, `stats` is { hurst, box_dim,
 * lambda } each with { median, p10, p25, p75, p90, percentile }.
 */
function formatPopulationContext(primary, stats) {
  if (!stats) return '';
  const fmt = (v, p) => {
    if (!Number.isFinite(v)) return '—';
    if (!stats[p]) return v.toFixed(3);
    const s = stats[p];
    const pct = s.percentile;
    const place = pct >= 90 ? `top ${100 - pct}%`
      : pct <= 10 ? `bottom ${pct}%`
      : `${pct}th percentile`;
    return `${v.toFixed(3)} — ${place} of scan (population median ${s.median?.toFixed(3) ?? '—'}, range ${s.p10?.toFixed(3) ?? '—'}–${s.p90?.toFixed(3) ?? '—'})`;
  };
  return `\nPEER CONTEXT (within today's Kerry-list scan):
- Hurst:  ${fmt(primary.hurst.H, 'hurst')}
- BoxDim: ${fmt(primary.boxDim.D, 'box_dim')}
- Lacuna: ${fmt(primary.lacunarity.lambda, 'lambda')}`;
}

/**
 * Build the analysis prompt from computed metrics
 */
export function buildPrompt(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults, trendResult, populationStats, riskRange, rating, dataAsOf) {
  const p = fractalResults?.primary;
  if (!p) return `Analyze ${symbol} — insufficient data for fractal analysis.`;

  // Data-as-of stamp. The most recent bar date is computed in the caller
  // (api/ai-take.js) from the FMP response and passed in as YYYY-MM-DD.
  // Phrasing the date in the prompt body (not a system meta-field) is
  // what gets Claude to actually surface it as the first line of the
  // narrative — see the SYSTEM_PROMPT "Data-as-of rule" section.
  const dataAsOfBlock = dataAsOf
    ? `DATA AS OF: ${dataAsOf} (most recent FMP daily close)\n\n`
    : '';

  const timeframes = [];
  if (fractalResults.daily) {
    const tf = fractalResults.daily;
    timeframes.push(`Daily (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)} [${tf.hurst.label}], D=${tf.boxDim.D.toFixed(3)} [${tf.boxDim.label}], Λ=${tf.lacunarity.lambda.toFixed(3)} [${tf.lacunarity.label}]`);
  }
  if (fractalResults.hourly) {
    const tf = fractalResults.hourly;
    timeframes.push(`Hourly (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)}, D=${tf.boxDim.D.toFixed(3)}, Λ=${tf.lacunarity.lambda.toFixed(3)}`);
  }
  if (fractalResults.fiveMin) {
    const tf = fractalResults.fiveMin;
    timeframes.push(`5-Min (${tf.dataPoints} bars): H=${tf.hurst.H.toFixed(3)}, D=${tf.boxDim.D.toFixed(3)}, Λ=${tf.lacunarity.lambda.toFixed(3)}`);
  }

  const selfSim = fractalResults.selfSimilarity;

  let prompt = `${dataAsOfBlock}FRACTAL ANALYSIS: ${symbol} (${assetType.toUpperCase()})

FRACTAL METRICS BY TIMEFRAME:
${timeframes.join('\n')}

${selfSim ? `SELF-SIMILARITY: Score=${selfSim.score.toFixed(2)} — ${selfSim.label} (Hurst spread: ${selfSim.hurstSpread}, Dim spread: ${selfSim.dimSpread})` : ''}
${populationStats ? formatPopulationContext(p, populationStats) : ''}
BEHAVIORAL SIGNALS:
- Greed: ${behavioralResults.greed.score}/100 — ${behavioralResults.greed.intensity}
- Fear: ${behavioralResults.fear.score}/100 — ${behavioralResults.fear.intensity}
- Exhaustion: ${behavioralResults.exhaustion.score}/100 — ${behavioralResults.exhaustion.intensity}`;

  if (behavioralResults.bond) {
    prompt += `\n- Bond: ${behavioralResults.bond.signals.join('; ') || 'No signals'}`;
  }
  if (behavioralResults.commodity) {
    prompt += `\n- Commodity: ${behavioralResults.commodity.signals.join('; ') || 'No signals'}`;
  }

  prompt += `

ALGORITHMIC MOOD: ${moodResult.mood.label} (confidence: ${moodResult.confidence}%)
ALGORITHMIC PREDICTION: ${predictionResult.prediction.label} (confidence: ${predictionResult.confidence}%)
Reasoning: ${predictionResult.reasoning.join('; ')}`;

  // Trend ladder + setup phase. Adds explicit MA structure and the
  // pre-breakout / breakout / extended classification so the AI doesn't
  // have to infer trend phase from raw fractals alone — and so it can
  // reconcile its read with the deterministic table the user is looking at.
  if (trendResult && (trendResult.sma9 != null || trendResult.setup)) {
    const SETUP_DESCRIPTIONS = {
      ACCUMULATING: 'pre-breakout accumulation — short MAs turning up, conviction rising but moderate, price still near the 62-day MA. This is the quiet build-up phase.',
      BREAKOUT: 'fresh breakout — conviction just jumped from sub-1.5 to >2.0 today AND price is above the short MA stack. The move is happening now.',
      EXTENDED: 'extended uptrend — 4+ of the last 5 days at conviction >2.5. Trend is mature; chasing here is risky.',
      UPTREND: 'mature uptrend in place — full stacked MA structure with price > 9 > 15 > 62 > 200.',
      DOWNTREND: 'mature downtrend in place — full stacked MA structure with price < 9 < 15 < 62 < 200.',
      NEUTRAL: 'no distinctive setup — mixed MA stack or no conviction edge.',
    };
    const stackChar = (v) => {
      if (v == null || !Number.isFinite(v) || !Number.isFinite(p.lastPrice)) return '?';
      return p.lastPrice > v ? '▲' : '▼';
    };
    // p.lastPrice may not exist on the fractalResults — fall back to the
    // 9-day SMA's relation to the 200-day for a rough "trend direction"
    // descriptor when we don't have an explicit price reference.
    const ladder = `9d=$${trendResult.sma9?.toFixed?.(2) ?? 'n/a'}, ` +
                   `15d=$${trendResult.sma15?.toFixed?.(2) ?? 'n/a'}, ` +
                   `62d=$${trendResult.sma62?.toFixed?.(2) ?? 'n/a'}, ` +
                   `200d=$${trendResult.sma200?.toFixed?.(2) ?? 'n/a'}`;
    prompt += `\n\nTREND STRUCTURE (Simple Moving Averages):\n${ladder}`;
    if (trendResult.setup) {
      const desc = SETUP_DESCRIPTIONS[trendResult.setup] || '';
      prompt += `\n\nSETUP PHASE: ${trendResult.setup}${desc ? ` — ${desc}` : ''}`;
    }
  }

  if (analogResults?.analogs?.length > 0) {
    prompt += `\n\nHISTORICAL ANALOGS (${analogResults.analogs.length} matches):`;
    for (const a of analogResults.analogs.slice(0, 3)) {
      prompt += `\n- Signature H=${a.signature.H} D=${a.signature.D} Λ=${a.signature.lambda} → ${a.outcome.direction} ${a.outcome.returnPct}% over ${a.outcome.daysAfter} bars`;
    }
    if (analogResults.consensus) {
      prompt += `\n  Consensus: ${analogResults.consensus.direction} (avg ${analogResults.consensus.avgReturn}%, ${analogResults.consensus.upPct}% bullish)`;
    }
  }

  // Trading Range (renamed from Risk Range) — entry-timing layer.
  // The SMA tier tells you whether to be in/out; the Trading Range
  // tells you whether NOW is a good price within the implied range.
  if (riskRange && Number.isFinite(riskRange.lrr) && Number.isFinite(riskRange.trr)) {
    const pos = Number.isFinite(riskRange.range_pos) ? riskRange.range_pos : 0.5;
    const posLabel = pos <= 0.25 ? 'BOTTOM of band — favorable entry'
      : pos >= 0.75 ? 'TOP of band — stretched, trim zone'
      : pos <= 0.40 ? 'lower half'
      : pos >= 0.60 ? 'upper half'
      : 'mid-band';
    const volTxt = Number.isFinite(riskRange.vol_ratio)
      ? `5d/50d volume ratio = ${riskRange.vol_ratio.toFixed(2)} (${
          riskRange.vol_ratio > 1.2 ? 'CONFIRMED — participation behind the move'
          : riskRange.vol_ratio < 0.8 ? 'THIN — move unconfirmed, treat with skepticism'
          : 'normal participation'
        })`
      : '5d/50d volume ratio = n/a';
    prompt += `

TRADING RANGE (15-day probable range from volatility + lacunarity):
- Range: $${riskRange.lrr.toFixed(2)} (LRR) – $${riskRange.trr.toFixed(2)} (TRR)
- Today's position: ${(pos * 100).toFixed(0)}% of band — ${posLabel}
- Realized vol (σ, 15-bar): ${Number.isFinite(riskRange.realized_vol) ? (riskRange.realized_vol * 100).toFixed(2) + '%' : 'n/a'}
- ${volTxt}`;
  }
  if (rating && rating.rating) {
    const phaseTxt = rating.phase && rating.phase !== 'ADVANCING'
      ? `, phase=${rating.phase}`
      : '';
    prompt += `

SYNTHESIZED RATING: ${rating.rating}${rating.tier ? ` (tier=${rating.tier}, fractal=${rating.confirmation}${phaseTxt})` : ''}${rating.reason ? ` — ${rating.reason}` : ''}
This Rating came from the deterministic 4×3 matrix (SMA tier × fractal
confirmation). You must AGREE with it; your job is to explain WHY the
matrix landed here, not to override it.${rating.phase && rating.phase !== 'ADVANCING' ? `

MOMENTUM PHASE: ${rating.phase}. The structural Rating is correct, but the
short-term momentum has diverged from the medium-term trend:
${rating.phase === 'PULLING BACK' ? '15-day direction has turned bearish while the 62-day stays bullish — classical pullback inside an uptrend. Address this explicitly: "Structurally ' + rating.rating + ', but currently pulling back from a recent high — don\'t chase."' : ''}${rating.phase === 'CONSOLIDATING' ? '15-day direction is flat while the 62-day stays bullish — sideways digestion of a recent move. Address this explicitly: "Structurally ' + rating.rating + ', currently consolidating — watch for the next directional resolution."' : ''}${rating.phase === 'BOUNCING' ? '15-day has flipped bullish against a bearish 62-day — this is a counter-trend rally, not a confirmed reversal. Treat with skepticism.' : ''}` : ''}`;
  }

  prompt += `

ANALYSIS — apply the 1880 Quant Analyzer reasoning chain:

Step 1: State the SMA tier explicitly. Quote the price and the 15/62/200-day
levels. Is the stock above or below each? Which tier does that put it in
(SPECULATIVE / WATCH / TRENDING / STRONG)?

Step 2: State the fractal confirmation. Quote Hurst, Box dim, and Λ. How
many of the three gates (H ≥ 0.55, D ≤ 1.20, Λ ≤ 1.25) does this stock
pass? Is the trend STRONG / INDECISIVE / WEAK in confirmation?

Step 3: Combine into the Rating (which is provided in SYNTHESIZED RATING).
Explain what that Rating implies for action: accumulate, watch, trim, or exit.

Step 4: If a TRADING RANGE block is provided, address entry timing — is
today's price near LRR (favorable entry), near TRR (stretched), or mid-
band (no edge within the Rating's broader call)? Does volume confirm?

Step 5: Name the price level where the next tier transition would occur
(e.g. "loses the 200-day at $X, demotes to SPECULATIVE" or "reclaims the
62-day at $Y, promotes to TRENDING").

Then — REQUIRED — close with a "## 10th Man" section that argues the
strongest specific case AGAINST your main read and names the concrete
signal or price level that would falsify it. No generic hedges; be
specific. The 10th Man section is mandatory regardless of how aligned
the signals look.

Be short, sharp — quant first, behavior second. Maximum 400 words total
across the main analysis and the 10th Man section.`;

  return prompt;
}

/**
 * Get Claude AI narrative analysis
 */
export async function getAnalysis(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults, trendResult) {
  const prompt = buildPrompt(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults, trendResult);

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 1500,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `API error ${resp.status}`);
    }

    const data = await resp.json();
    return { text: data.text, model: data.model, error: null };
  } catch (e) {
    return { text: null, model: null, error: e.message };
  }
}
