import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import FractalMetrics from './components/FractalMetrics';
import MoodIndicator from './components/MoodIndicator';
import BehaviorCards from './components/BehaviorCards';
import PredictionPanel from './components/PredictionPanel';
import AnalysisNarrative from './components/AnalysisNarrative';
import HistoricalAnalogs from './components/HistoricalAnalogs';
import TimeframeChart from './components/TimeframeChart';
import { fetchStockData, fetchBondData, fetchCommodityData } from './api/fetcher';
import { getAnalysis } from './api/claude';
import { runFractalAnalysis } from './engine/fractals';
import { runBehavioralAnalysis } from './engine/behavioral';
import { classifyMood } from './engine/mood';
import { predictBreak, predictHorizons } from './engine/prediction';
import { findAnalogs } from './engine/analogs';
import DirectionalOutlook from './components/DirectionalOutlook';
import PrintButton from './components/PrintButton';
import BacktestResults from './components/BacktestResults';
import { runBacktestAsync } from './engine/backtest';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState('');
  const [results, setResults] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);

  const handleAnalyze = useCallback(async (sym, type) => {
    setLoading(true);
    setError(null);
    setSymbol(sym);
    setAssetType(type);
    setResults(null);
    setBacktestResult(null);
    setBacktestLoading(false);
    setBacktestProgress(0);

    try {
      // Step 1: Fetch data
      let rawData, yieldData;

      if (type === 'stock') {
        rawData = await fetchStockData(sym);
      } else if (type === 'bond') {
        const bondData = await fetchBondData();
        rawData = { daily: bondData.daily, hourly: null, fiveMin: null, quote: null };
        yieldData = bondData.yields;
      } else if (type === 'commodity') {
        rawData = await fetchCommodityData(sym);
      }

      if (!rawData?.daily?.close?.length) {
        throw new Error('No price data returned. Check symbol and try again.');
      }

      // Step 2: Run fractal analysis
      const fractalResults = runFractalAnalysis({
        daily: rawData.daily,
        hourly: rawData.hourly,
        fiveMin: rawData.fiveMin,
      });

      // Step 3: Run behavioral analysis
      const behavioralResults = runBehavioralAnalysis(rawData.daily, type, yieldData);

      // Step 4: Classify mood (pass daily closes for recent-regime detection)
      const moodResult = classifyMood(fractalResults, behavioralResults, rawData.daily.close);

      // Step 5: Predict next break (pass daily closes for directional awareness)
      const predictionResult = predictBreak(fractalResults, behavioralResults, moodResult, rawData.daily.close);

      // Step 6: Find historical analogs
      const currentSignature = {
        H: fractalResults.primary?.hurst?.H ?? 0.5,
        D: fractalResults.primary?.boxDim?.D ?? 1.5,
        lambda: fractalResults.primary?.lacunarity?.lambda ?? 1,
      };
      const analogResults = findAnalogs(rawData.daily.close, currentSignature);

      // Step 7: Predict directional horizons (15-day, 62-day)
      const horizonResults = predictHorizons(fractalResults, behavioralResults, moodResult, analogResults, rawData.daily.close);

      // Set results immediately (before Claude call)
      const partialResults = {
        fractalResults,
        behavioralResults,
        moodResult,
        predictionResult,
        analogResults,
        horizonResults,
        analysis: { text: null, model: null, error: null, loading: true },
        quote: rawData.quote,
      };
      setResults(partialResults);

      // Step 8: Launch walk-forward backtest (async, non-blocking)
      setBacktestLoading(true);
      runBacktestAsync(rawData.daily, type, yieldData, {
        onProgress: (pct) => setBacktestProgress(pct),
      }).then(result => {
        setBacktestResult(result);
        setBacktestLoading(false);
      });

      // Step 9: Get Claude AI analysis (async, update when ready)
      const analysis = await getAnalysis(
        sym, type, fractalResults, behavioralResults, moodResult, predictionResult, analogResults
      );

      setResults(prev => ({
        ...prev,
        analysis: { ...analysis, loading: false },
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-chaos-900">
      {/* Header */}
      <header className="border-b border-chaos-700 py-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-mono tracking-tight">
                <span className="text-fractal-cyan">Chaos</span>
                <span className="text-gray-100"> Report</span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">15 to 62 Day Insights of Price Movement</p>
            </div>
            {symbol && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xl font-mono font-bold text-gray-200">{symbol}</div>
                  <div className="text-xs text-gray-500 uppercase">{assetType}</div>
                  {results?.quote && (
                    <div className="text-sm font-mono mt-0.5">
                      <span className="text-gray-300">${results.quote.price?.toFixed(2)}</span>
                      {results.quote.changesPercentage != null && (
                        <span className={`ml-2 ${results.quote.changesPercentage >= 0 ? 'text-fractal-green' : 'text-fractal-red'}`}>
                          {results.quote.changesPercentage >= 0 ? '+' : ''}{results.quote.changesPercentage?.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {results && <PrintButton />}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search */}
      <section className="py-8 no-print">
        <div className="max-w-6xl mx-auto px-4">
          <SearchBar onAnalyze={handleAnalyze} loading={loading} />
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 mb-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-fractal-red text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !results && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-3 text-fractal-cyan">
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-lg font-mono">Computing fractal signature...</span>
            </div>
            <p className="text-gray-500 text-sm mt-2">Running Hurst, Box-Counting, and Lacunarity across timeframes</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="max-w-6xl mx-auto px-4 pb-16 space-y-6">
          {/* Directional Outlook — plain-English summary for novice investors */}
          <DirectionalOutlook horizons={results.horizonResults} symbol={symbol} />

          {/* Row 1: Fractal Metrics + Mood */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FractalMetrics fractalResults={results.fractalResults} />
            <MoodIndicator moodResult={results.moodResult} />
          </div>

          {/* Row 2: Multi-timeframe chart */}
          <TimeframeChart fractalResults={results.fractalResults} />

          {/* Row 3: Behavioral Cards */}
          <BehaviorCards behavioralResults={results.behavioralResults} />

          {/* Row 4: Prediction + Analogs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PredictionPanel predictionResult={results.predictionResult} />
            <HistoricalAnalogs analogResults={results.analogResults} />
          </div>

          {/* Row 5: AI Analysis */}
          <AnalysisNarrative analysis={results.analysis} />

          {/* Row 6: Backtest Results */}
          <BacktestResults
            backtestResult={backtestResult}
            symbol={symbol}
            loading={backtestLoading}
            progress={backtestProgress}
          />

          {/* Footer disclaimer */}
          <div className="text-center text-xs text-gray-600 pt-4 border-t border-chaos-700">
            Chaos Report uses fractal geometry for educational analysis only. Not financial advice. Past fractal patterns do not guarantee future results.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !results && !error && (
        <div className="max-w-6xl mx-auto px-4 text-center py-20">
          <div className="text-6xl mb-4 opacity-20">◇</div>
          <h2 className="text-xl text-gray-400 font-mono">Enter a ticker to begin fractal analysis</h2>
          <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
            Chaos Report computes Hurst exponents, box-counting dimensions, and lacunarity
            across daily, hourly, and 5-minute timeframes to decode market psychology.
          </p>
        </div>
      )}
    </div>
  );
}
