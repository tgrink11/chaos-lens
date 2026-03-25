import { useState, useEffect } from 'react';

const STORAGE_KEY = 'chaos_report_email';

export default function EmailGate({ onUnlocked }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) {
      setUnlocked(true);
      onUnlocked();
    }
  }, [onUnlocked]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      // Success — save and unlock
      localStorage.setItem(STORAGE_KEY, trimmed);
      setUnlocked(true);
      onUnlocked();
    } catch (err) {
      // On network/server error, still unlock — don't block user on infra issues
      console.error('Email submit error:', err.message);
      localStorage.setItem(STORAGE_KEY, trimmed);
      setUnlocked(true);
      onUnlocked();
    } finally {
      setSubmitting(false);
    }
  }

  // Already unlocked — render nothing
  if (unlocked) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#f5f7fa] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-chaos-800 border border-chaos-600 rounded-2xl p-8 shadow-2xl">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4 opacity-40">◇</div>
            <h1 className="text-2xl font-bold font-mono tracking-tight">
              <span className="text-fractal-cyan">Chaos</span>
              <span className="text-[#1a1a1a]"> Report</span>
            </h1>
            <p className="text-sm text-[#667085] mt-1">Fractal Market Analysis</p>
          </div>

          {/* Description */}
          <p className="text-[#344054] text-center mb-6 text-sm leading-relaxed">
            Enter your email to access fractal market analysis.
            Decode market psychology using Hurst exponents, box-counting dimensions,
            and lacunarity across multiple timeframes.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="your@email.com"
                autoFocus
                className="w-full bg-[#f5f7fa] border border-chaos-600 rounded-lg px-4 py-3 text-[#1a1a1a] placeholder-[#98a2b3] focus:outline-none focus:border-fractal-cyan focus:ring-1 focus:ring-fractal-cyan font-mono text-lg"
              />
              {error && (
                <p className="text-fractal-red text-xs mt-2">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full bg-fractal-cyan text-white font-semibold py-3 rounded-lg hover:bg-[#0d3d5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-lg"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </span>
              ) : 'Get Access'}
            </button>
          </form>

          {/* Disclaimer */}
          <p className="text-xs text-[#98a2b3] text-center mt-6">
            No spam. Fractal insights only. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
