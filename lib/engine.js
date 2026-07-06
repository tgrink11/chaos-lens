"use strict";
/**
 * CHAOS LENS — fractal engine (JS port of chaos_lens_live.py)
 * DFA Hurst, Higuchi Fractal Dimension, gliding-box Lacunarity, Conviction.
 * This is a line-for-line port of the Python reference implementation —
 * do not "simplify" the math without checking against chaos_lens_live.py.
 */

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
}

function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round(v, dp) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// np.polyfit(x, y, 1) -> [slope, intercept]
function polyfit1(x, y) {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  const slope = num / den;
  const intercept = my - slope * mx;
  return [slope, intercept];
}

function polyval1(coef, x) {
  const [slope, intercept] = coef;
  return x.map((v) => slope * v + intercept);
}

function cumsum(arr) {
  const out = [];
  let s = 0;
  for (const v of arr) {
    s += v;
    out.push(s);
  }
  return out;
}

function logspace(start, stop, num) {
  const logStart = Math.log10(start);
  const logStop = Math.log10(stop);
  const step = num > 1 ? (logStop - logStart) / (num - 1) : 0;
  const out = [];
  for (let i = 0; i < num; i++) out.push(10 ** (logStart + step * i));
  return out;
}

function uniqueFloorInts(arr) {
  const floored = arr.map((v) => Math.floor(v));
  return [...new Set(floored)].sort((a, b) => a - b);
}

function logReturns(prices) {
  const logs = prices.map((v) => Math.log(v));
  const out = [];
  for (let i = 1; i < logs.length; i++) out.push(logs[i] - logs[i - 1]);
  return out;
}

// x = log-returns array
function dfaHurst(x) {
  const m = mean(x);
  const y = cumsum(x.map((v) => v - m));
  const N = y.length;
  const rawScales = logspace(8, Math.floor(N / 4), 16);
  const scales = uniqueFloorInts(rawScales);
  const F = [];
  const usedScales = [];
  for (const s of scales) {
    const nseg = Math.floor(N / s);
    if (nseg < 2) continue;
    const rms = [];
    for (let v = 0; v < nseg; v++) {
      const seg = y.slice(v * s, (v + 1) * s);
      const t = Array.from({ length: s }, (_, i) => i);
      const coef = polyfit1(t, seg);
      const fit = polyval1(coef, t);
      const sq = seg.map((val, i) => (val - fit[i]) ** 2);
      rms.push(Math.sqrt(mean(sq)));
    }
    F.push(Math.sqrt(mean(rms.map((v) => v * v))));
    usedScales.push(s);
  }
  const logScales = usedScales.map((s) => Math.log(s));
  const logF = F.map((v) => Math.log(v));
  const [slope] = polyfit1(logScales, logF);
  return slope;
}

// x = raw price array
function higuchiFD(x, kmax = 10) {
  const N = x.length;
  const Lk = [];
  for (let k = 1; k <= kmax; k++) {
    const Lm = [];
    for (let m = 0; m < k; m++) {
      const upper = Math.floor((N - m) / k); // idx = 1 .. upper-1
      if (upper < 2) continue;
      let lm = 0;
      let count = 0;
      for (let i = 1; i < upper; i++) {
        lm += Math.abs(x[m + i * k] - x[m + (i - 1) * k]);
        count++;
      }
      if (count < 1) continue;
      lm = (lm * ((N - 1) / (count * k))) / k;
      Lm.push(lm);
    }
    if (Lm.length) Lk.push(mean(Lm));
  }
  const lnk = Lk.map((_, i) => Math.log(1.0 / (i + 1)));
  const logLk = Lk.map((v) => Math.log(v));
  const [slope] = polyfit1(lnk, logLk);
  return slope;
}

// x = raw price array
function glidingLacunarity(x, box = 20) {
  const logs = x.map((v) => Math.log(v));
  const r = [];
  for (let i = 1; i < logs.length; i++) r.push(Math.abs(logs[i] - logs[i - 1]));
  if (r.length <= box) return 1.0;
  const masses = [];
  for (let i = 0; i < r.length - box; i++) {
    let s = 0;
    for (let j = i; j < i + box; j++) s += r[j];
    masses.push(s);
  }
  const mMean = mean(masses);
  if (mMean === 0) return 1.0;
  const mMeanSq = mean(masses.map((v) => v * v));
  return mMeanSq / (mMean * mMean);
}

function conviction(H, fd, lac, prices) {
  const rets = logReturns(prices);
  const w = rets.length >= 60 ? rets.slice(-60) : rets;
  const trend = mean(w) / (std(w) + 1e-9);
  const persistence = H - 0.5;
  const smoothness = clip(2.0 - fd, 0.0, 1.0);
  const texture = clip(1.0 / Math.sqrt(lac), 0.3, 1.2);
  return clip(14.0 * persistence * trend * smoothness * texture, -4.4, 4.4);
}

function regime(H) {
  return H > 0.55 ? "Persistent" : H < 0.45 ? "Reverting" : "Choppy";
}

function verdict(conv, H, prices) {
  const rets = logReturns(prices);
  const w = rets.length >= 60 ? rets.slice(-60) : rets;
  const up = mean(w) > 0;
  if (regime(H) === "Choppy" || Math.abs(conv) < 1.0) return "Stand Down";
  return (conv > 0 && up) || (conv < 0 && !up) ? "Confirm" : "Deny";
}

// prices = raw price array, oldest -> newest, length >= 60
function analyze(ticker, prices) {
  const logret = logReturns(prices);
  const H = dfaHurst(logret);
  const fd = higuchiFD(prices);
  const lac = glidingLacunarity(prices);
  const conv = conviction(H, fd, lac, prices);
  const tailRet = logret.length >= 60 ? logret.slice(-60) : logret;
  return {
    ticker,
    H: round(H, 3),
    fd: round(fd, 3),
    lac: round(lac, 3),
    conviction: round(conv, 2),
    regime: regime(H),
    verdict: verdict(conv, H, prices),
    ret60: round(mean(tailRet) * 100, 3),
  };
}

module.exports = { analyze, dfaHurst, higuchiFD, glidingLacunarity, conviction, regime, verdict };
