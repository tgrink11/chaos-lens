export default function Guide({ onBack }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 no-print">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-fractal-cyan hover:text-[#0d3d5e] text-sm font-medium mb-8 flex items-center gap-1"
      >
        <span>&larr;</span> Back to Analysis
      </button>

      {/* Title */}
      <h1 className="text-4xl font-bold font-mono mb-2">
        <span className="text-fractal-cyan">Chaos Report</span> Guide
      </h1>
      <p className="text-[#667085] mb-10 text-lg">
        Everything you need to understand this tool, written in plain English.
      </p>

      {/* Section 1: What is Chaos Report? */}
      <Section title="What is Chaos Report?">
        <p>
          Most people think stock prices move randomly. They don't — not entirely.
          Hidden inside price charts are <strong>patterns that repeat</strong> at every
          zoom level. Zoom into a 5-minute chart and it looks surprisingly similar to a
          daily chart. These repeating patterns are called <strong>fractals</strong>.
        </p>
        <p>
          Chaos Report uses math to measure these fractal patterns. It doesn't guess,
          and it doesn't use opinions. It calculates three numbers that describe
          <em> how</em> a price is moving — then uses those numbers to predict where it
          might go next.
        </p>
        <p>
          It looks at two timeframes: the <strong>next 15 days</strong> (short-term) and
          the <strong>next 62 days</strong> (medium-term). It works on stocks, volatility
          indices like the VIX, bonds, and commodities.
        </p>
      </Section>

      {/* Section 2: Reading each section */}
      <h2 className="text-2xl font-bold text-[#1a1a1a] mt-14 mb-6 font-mono">
        How to Read Each Section
      </h2>

      <Section title='Where is [Symbol] Headed?' color="cyan">
        <p>
          This is the <strong>bottom line</strong> — the quick answer. It tells you whether
          the math expects prices to go up, down, or sideways.
        </p>
        <TermList>
          <Term name="Bullish">Prices are likely heading up.</Term>
          <Term name="Bearish">Prices are likely heading down.</Term>
          <Term name="Neutral">No clear direction — could go either way.</Term>
        </TermList>
        <p>
          The <strong>confidence percentage</strong> tells you how strong the signal is.
          70% means the math is fairly sure. 40% means it's a weak lean. This is never
          100% — markets always have uncertainty.
        </p>
      </Section>

      <Section title="Fractal Signature" color="purple">
        <p>
          Think of this as the <strong>fingerprint</strong> of how the price is moving.
          Three numbers capture the shape of the price path:
        </p>
        <TermList>
          <Term name="Hurst Exponent (H)">
            Does the price tend to <em>keep going</em> in the same direction, or does it
            <em> bounce back</em>? A value near <strong>0.5</strong> means random — like a
            coin flip. Above <strong>0.6</strong> means it tends to keep trending. Below{' '}
            <strong>0.4</strong> means it tends to reverse.
          </Term>
          <Term name="Box-Counting Dimension (D)">
            Is the price path <em>smooth</em> or <em>jagged</em>? A lower number (near 1.0)
            means the price is moving in a clean, smooth line. A higher number (near 1.7+)
            means the path is messy and chaotic.
          </Term>
          <Term name="Lacunarity (&Lambda;)">
            Are there <em>gaps</em> in the pattern? Think of it like holes in Swiss cheese.
            Higher values mean the price has air pockets — places where it could suddenly
            jump or drop.
          </Term>
        </TermList>
      </Section>

      <Section title="Market Mood" color="amber">
        <p>
          This combines all the math into a single <strong>emotional label</strong> for the
          market right now. There are four possible moods:
        </p>
        <TermList>
          <Term name="Panic">
            Fear is in control. Sellers are dumping, volume is spiking on down moves,
            and the fractal structure is breaking apart.
          </Term>
          <Term name="Euphoria">
            Greed is in control. Buyers are aggressively pushing prices up. The trend is
            smooth and persistent. Upper wicks are getting long (buyers reaching too high).
          </Term>
          <Term name="Stealth Build">
            Something is quietly happening under the surface. Volume is low, the price range
            is tight, but there are signs of accumulation. This often comes before a big move.
          </Term>
          <Term name="Grind">
            No one is in control. The price is chopping sideways with no clear direction.
            The math says this looks like a random walk — no edge to trade.
          </Term>
        </TermList>
        <p>
          If you see a <strong>"Regime Shift Detected"</strong> warning, it means the recent
          behavior is significantly different from the longer-term pattern. The market may be
          changing character.
        </p>
      </Section>

      <Section title="Multi-Timeframe Chart" color="cyan">
        <p>
          This shows the fractal metrics at three different zoom levels: <strong>daily</strong>,{' '}
          <strong>hourly</strong>, and <strong>5-minute</strong>.
        </p>
        <p>
          When all three timeframes show similar numbers, the pattern is <strong>consistent
          at every scale</strong>. That's a strong, trustworthy signal.
        </p>
        <p>
          When they disagree, the market looks different depending on how closely you zoom in.
          The signal is weaker and less reliable.
        </p>
      </Section>

      <Section title="Behavioral Signals" color="green">
        <p>
          Fractals measure the <em>shape</em> of price movement. Behavioral signals measure
          what <strong>traders are actually doing</strong>. Three signals are tracked:
        </p>
        <TermList>
          <Term name="Greed (0-100)">
            Are buyers overreaching? This is measured by <em>upper wicks</em> on candles —
            when the price spikes up during a bar but then falls back down before it closes.
            Long upper wicks mean buyers pushed too hard and got rejected.
          </Term>
          <Term name="Fear (0-100)">
            Is panic selling happening? This is measured by <em>volume spikes on down
            moves</em>. When the price drops and trading volume suddenly doubles or triples,
            that's fear — people rushing to sell.
          </Term>
          <Term name="Exhaustion (0-100)">
            Is the market running out of energy? When the price range gets very tight and
            volatility keeps shrinking, the market is "coiling" like a spring. This often
            happens right before a big move in one direction.
          </Term>
        </TermList>
      </Section>

      <Section title="Next Break Prediction" color="red">
        <p>
          Based on all the fractal and behavioral signals combined, this predicts the
          <strong> most likely next big move</strong>:
        </p>
        <TermList>
          <Term name="Thrust Up">A breakout to the upside — prices jump higher.</Term>
          <Term name="Cascade Down">A sharp decline — prices drop quickly.</Term>
          <Term name="Consolidation">More sideways chop — no clear break coming yet.</Term>
        </TermList>
        <p>
          The reasoning section below shows which specific signals led to this prediction.
        </p>
      </Section>

      <Section title="Historical Analogs" color="purple">
        <p>
          This is one of the most powerful sections. The system searches through the asset's
          <strong> own price history</strong> to find past moments when the fractal fingerprint
          looked similar to right now.
        </p>
        <p>
          Then it shows <strong>what happened next</strong> in each of those past episodes.
          If 4 out of 5 similar moments led to the price going up, that's useful information.
        </p>
        <p>
          The table shows each analog's fractal signature (H, D, &Lambda;), the direction
          that followed, the return percentage, and the maximum up and down moves.
        </p>
      </Section>

      <Section title="AI Fractal Analysis" color="cyan">
        <p>
          An AI (Claude) reads all the data from every section above — the fractals, the mood,
          the behavioral signals, the analogs — and writes a <strong>plain-English
          interpretation</strong> tying everything together.
        </p>
        <p>
          Think of it as having an analyst read the entire report and explain what it means
          in conversational language.
        </p>
      </Section>

      <Section title="Backtest Results" color="amber">
        <p>
          This is the <strong>honesty check</strong>. Anyone can make predictions — but were
          they <em>accurate</em> in the past?
        </p>
        <p>
          The system goes back in time, runs its prediction engine at multiple past dates using
          <strong> only the data that was available at that time</strong> (no cheating by looking
          at the future). Then it checks: did the predicted direction match what actually happened?
        </p>
        <TermList>
          <Term name="Hit Rate">
            The percentage of correct predictions. Above 55% is good. Above 60% is strong.
            Below 40% means the model struggled with this particular asset.
          </Term>
          <Term name="Confidence Calibration">
            When the system said it was 70% confident, was it actually right 70% of the time?
            Well-calibrated confidence means the numbers are trustworthy, not just made up.
          </Term>
        </TermList>
      </Section>

      {/* Section 3: Key Concepts */}
      <h2 className="text-2xl font-bold text-[#1a1a1a] mt-14 mb-6 font-mono">
        Key Concepts
      </h2>

      <div className="bg-chaos-800 border border-chaos-600 rounded-xl p-6 space-y-4">
        <TermList>
          <Term name="Fractal">
            A pattern that repeats at different sizes. Zoom into a coastline on a map and the
            jagged shape looks the same whether you're looking at 100 miles or 1 mile. Price
            charts work the same way.
          </Term>
          <Term name="Hurst Exponent">
            A number between 0 and 1 that measures whether a price tends to trend (keep going)
            or revert (bounce back). Named after the scientist who discovered it studying river
            floods.
          </Term>
          <Term name="Confidence">
            How strong the mathematical signal is, expressed as a percentage. It is{' '}
            <strong>not</strong> a guarantee. A 75% confidence reading means the math strongly
            leans one way — but 25% of the time, the opposite could happen.
          </Term>
          <Term name="Walk-Forward Backtest">
            A way to test predictions honestly. The system pretends it's in the past, makes
            a prediction using only past data, then checks what actually happened. It never
            "peeks" at the future.
          </Term>
          <Term name="Regime Shift">
            When the market's behavior suddenly changes. For example, a calm, trending market
            might suddenly become chaotic. The recent fractal pattern diverges from the
            longer-term pattern.
          </Term>
        </TermList>
      </div>

      {/* Section 4: Disclaimers */}
      <div className="mt-14 mb-8 bg-chaos-800 border border-amber-500/30 rounded-xl p-6">
        <h3 className="text-lg font-bold text-[#b45309] mb-3">Important</h3>
        <ul className="space-y-2 text-[#344054] text-sm">
          <li>Chaos Report is an <strong>educational tool</strong>. It is not financial advice.</li>
          <li>No system can predict the market perfectly. Even the best signals are wrong sometimes.</li>
          <li>Past fractal patterns do not guarantee future results.</li>
          <li>Always do your own research before making investment decisions.</li>
        </ul>
      </div>

      {/* Bottom back button */}
      <button
        onClick={onBack}
        className="text-fractal-cyan hover:text-[#0d3d5e] text-sm font-medium mt-4 mb-16 flex items-center gap-1"
      >
        <span>&larr;</span> Back to Analysis
      </button>
    </div>
  );
}

/* --- Helper components --- */

function Section({ title, color = 'gray', children }) {
  const borderColors = {
    cyan: 'border-fractal-cyan/30',
    purple: 'border-purple-500/30',
    amber: 'border-amber-500/30',
    green: 'border-green-500/30',
    red: 'border-red-500/30',
    gray: 'border-chaos-600',
  };

  return (
    <div className={`bg-chaos-800 border ${borderColors[color]} rounded-xl p-6 mb-6`}>
      <h3 className="text-xl font-bold text-[#1a1a1a] font-mono mb-4">{title}</h3>
      <div className="space-y-3 text-[#344054] text-[15px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function TermList({ children }) {
  return <dl className="space-y-3 mt-2">{children}</dl>;
}

function Term({ name, children }) {
  return (
    <div>
      <dt className="font-semibold text-[#1a1a1a] inline">{name}: </dt>
      <dd className="inline text-[#344054]">{children}</dd>
    </div>
  );
}
