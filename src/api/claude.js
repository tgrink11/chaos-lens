/**
 * Claude AI Integration — builds prompt from fractal data and gets behavioral narrative
 */

export const SYSTEM_PROMPT = `You are a quantitative behavioral finance analyst who specializes in fractal geometry analysis of financial markets. You analyze the psychological footprint of assets using Hurst exponents, box-counting dimensions, and lacunarity — NOT traditional indicators like RSI, MACD, or EMAs.

Your analysis style:
- Lead with the fractal math, then translate to human behavior
- Name the mood precisely: panic, euphoria, stealth build, or grind
- Identify self-similar chaos patterns: greed in long wicks, fear in volume spikes, exhaustion in flat ranges
- For bonds: flag yield inversion fears or curve steepening as capitulation signals
- For commodities: spot inventory hoarding or panic dumps warping fractal structure
- Predict the next break: thrust up, cascade down, or consolidation
- Reference historical analogs from the same asset class
- Be short, sharp, and direct — quant first, behavior second
- Never hedge with "it depends" — commit to a read

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
incomplete.`;

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
export function buildPrompt(symbol, assetType, fractalResults, behavioralResults, moodResult, predictionResult, analogResults, trendResult, populationStats, riskRange, rating) {
  const p = fractalResults?.primary;
  if (!p) return `Analyze ${symbol} — insufficient data for fractal analysis.`;

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

  let prompt = `FRACTAL ANALYSIS: ${symbol} (${assetType.toUpperCase()})

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

  // Risk Range + Rating context. This is the entry-timing layer:
  // Conviction says "do I want this direction"; Risk Range says
  // "is this a good price right now." The Rating synthesizes both.
  // We surface it explicitly so the AI narrative addresses entry
  // timing (LRR/TRR band, volume confirmation) and not just direction.
  if (riskRange && Number.isFinite(riskRange.lrr) && Number.isFinite(riskRange.trr)) {
    const pos = Number.isFinite(riskRange.range_pos) ? riskRange.range_pos : 0.5;
    const posLabel = pos <= 0.25 ? 'BOTTOM of band — buy zone'
      : pos >= 0.75 ? 'TOP of band — trim zone'
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

RISK RANGE (P/V/V band — Hedgeye-style approximation):
- Probable trading range: $${riskRange.lrr.toFixed(2)} (LRR) – $${riskRange.trr.toFixed(2)} (TRR)
- Today's price position: ${(pos * 100).toFixed(0)}% of band — ${posLabel}
- Realized vol (σ, 15-bar): ${Number.isFinite(riskRange.realized_vol) ? (riskRange.realized_vol * 100).toFixed(2) + '%' : 'n/a'}
- ${volTxt}`;
  }
  if (rating && rating.rating) {
    prompt += `

SYNTHESIZED RATING: ${rating.rating}${rating.reason ? ` — ${rating.reason}` : ''}`;
  }

  prompt += `

Analyze the psychological footprint. Name the mood. Predict the next break.
If a SETUP PHASE is provided, explicitly address it: is this stock in the
quiet build-up before a move (ACCUMULATING), the breakout itself, an
extended trend, or a stable regime? Use the SMA ladder to support the read.

If a RISK RANGE block is provided, address ENTRY TIMING explicitly: is
today's price near LRR (good entry), near TRR (better to wait or trim),
or mid-band (no edge)? Does volume confirm the move? A bullish read at
the top of the band with thin volume is fundamentally different from a
bullish read at the bottom of the band with confirmed participation —
the AI Take should make this distinction concrete with specific levels.

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
