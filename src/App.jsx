import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import FractalMetrics from './components/FractalMetrics';
import MoodIndicator from './components/MoodIndicator';
import BehaviorCards from './components/BehaviorCards';
import PredictionPanel from './components/PredictionPanel';
import AnalysisNarrative from './components/AnalysisNarrative';
import HistoricalAnalogs from './components/HistoricalAnalogs';
import TimeframeChart from './components/TimeframeChart';
import { fetchStockData, fetchBondData, fetchCommodityData, fetchIndexData } from './api/fetcher';
import { getAnalysis } from './api/claude';
import { runFractalAnalysis } from './engine/fractals';
import { runBehavioralAnalysis } from './engine/behavioral';
import { classifyMood } from './engine/mood';
import { predictBreak, predictHorizons } from './engine/prediction';
import { findAnalogs } from './engine/analogs';
import DirectionalOutlook from './components/DirectionalOutlook';
import PrintButton from './components/PrintButton';
import BacktestResults from './components/BacktestResults';
import Guide from './components/Guide';
import EmailGate from './components/EmailGate';
import ScreenerTab from './components/ScreenerTab';
import { runBacktestAsync } from './engine/backtest';

export default function App() {
  const [emailUnlocked, setEmailUnlocked] = useState(
    () => !!localStorage.getItem('chaos_report_email')
  );
  const [activeTab, setActiveTab] = useState('stock');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState('');
  const [results, setResults] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

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
      } else if (type === 'index') {
        rawData = await fetchIndexData(sym);
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

  // When screener row is clicked, switch to stock tab and analyze
  const handleScreenerSelect = useCallback((sym) => {
    setActiveTab('stock');
    handleAnalyze(sym, 'stock');
  }, [handleAnalyze]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  // Email gate — blocks entire app until email submitted
  if (!emailUnlocked) {
    return <EmailGate onUnlocked={() => setEmailUnlocked(true)} />;
  }

  const isScreener = activeTab === 'screener';

  return (
    <div className="min-h-screen bg-chaos-900">
      {/* Header */}
      <header className="border-b border-chaos-700 py-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold font-mono tracking-tight">
                <span className="text-fractal-cyan">Chaos</span>
                <span className="text-[#1a1a1a]"> Report</span>
              </h1>
              <p className="text-sm text-[#667085] mt-1">15 to 62 Day Insights of Price Movement</p>
              <button
                onClick={() => setShowGuide(g => !g)}
                className="text-xs text-fractal-cyan hover:text-[#0d3d5e] mt-1 no-print"
              >
                {showGuide ? 'Close Guide' : 'Read the Guide'}
              </button>
            </div>
            {symbol && !isScreener && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xl font-mono font-bold text-[#1a1a1a]">{symbol}</div>
                  <div className="text-xs text-[#667085] uppercase">{assetType}</div>
                  {results?.quote && (
                    <div className="text-sm font-mono mt-0.5">
                      <span className="text-[#344054]">${results.quote.price?.toFixed(2)}</span>
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

      {/* Guide page */}
      {showGuide && <Guide onBack={() => setShowGuide(false)} />}

      {/* Search — always visible (tabs needed for screener) */}
      {!showGuide && (
        <section className="py-8 no-print">
          <div className="max-w-6xl mx-auto px-4">
            <SearchBar onAnalyze={handleAnalyze} loading={loading} onTabChange={handleTabChange} />
          </div>
        </section>
      )}

      {/* Screener tab content */}
      {!showGuide && isScreener && (
        <div className="max-w-6xl mx-auto px-4 pb-16">
          <ScreenerTab onSelectSymbol={handleScreenerSelect} />
        </div>
      )}

      {/* Error */}
      {!showGuide && !isScreener && error && (
        <div className="max-w-6xl mx-auto px-4 mb-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-fractal-red text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Loading state */}
      {!showGuide && !isScreener && loading && !results && (
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-3 text-fractal-cyan">
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-lg font-mono">Computing fractal signature...</span>
            </div>
            <p className="text-[#667085] text-sm mt-2">Running Hurst, Box-Counting, and Lacunarity across timeframes</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!showGuide && !isScreener && results && (
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

          {/* Inline disclaimer */}
          <div className="text-center text-xs text-[#98a2b3] pt-4 border-t border-chaos-700">
            Chaos Report uses fractal geometry for educational and informational purposes only. Not financial advice.
          </div>
        </div>
      )}

      {/* Empty state */}
      {!showGuide && !isScreener && !loading && !results && !error && (
        <div className="max-w-6xl mx-auto px-4 text-center py-20">
          <div className="text-6xl mb-4 opacity-10 text-[#667085]">◇</div>
          <h2 className="text-xl text-[#667085] font-mono">Enter a ticker to begin fractal analysis</h2>
          <p className="text-sm text-[#98a2b3] mt-2 max-w-md mx-auto">
            Chaos Report computes Hurst exponents, box-counting dimensions, and lacunarity
            across daily, hourly, and 5-minute timeframes to decode market psychology.
          </p>
        </div>
      )}

      {/* Site-wide legal disclaimer footer */}
      {!showGuide && (
        <footer className="max-w-6xl mx-auto px-4 py-8 mt-8 border-t border-chaos-800 no-print">
          <div className="text-xs text-[#98a2b3] space-y-3 leading-relaxed">
            <p className="font-semibold text-[#667085]">Disclaimer</p>
            <p>
              Chaos Report is provided by Transworld Management, Inc. for educational and informational
              purposes only. Nothing contained herein constitutes investment advice, a recommendation,
              a solicitation, or an offer to buy or sell any securities or financial instruments.
            </p>
            <p>
              All analysis, scores, predictions, and signals generated by Chaos Report are derived from
              mathematical models based on fractal geometry and historical price data. Past performance,
              patterns, and fractal signatures do not guarantee future results. Markets are inherently
              unpredictable and involve substantial risk of loss.
            </p>
            <p>
              Transworld Management, Inc., its officers, directors, employees, affiliates, and agents
              (collectively, "Transworld") make no representations or warranties, express or implied,
              regarding the accuracy, completeness, reliability, or suitability of any information
              provided. Transworld shall not be liable for any losses, damages, or claims arising from
              the use of or reliance on this tool or its outputs, including but not limited to direct,
              indirect, incidental, consequential, or punitive damages.
            </p>
            <p>
              You should consult with a qualified financial advisor before making any investment decisions.
              By using Chaos Report, you acknowledge that you are solely responsible for your own
              investment decisions and that Transworld bears no responsibility for any outcomes resulting
              from your use of this tool.
            </p>
            <p className="text-[#98a2b3]">
              &copy; {new Date().getFullYear()} Transworld Management, Inc. All rights reserved.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
