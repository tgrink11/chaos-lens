# 1880 Quant Analyzer — Video Walkthrough Script

A subscriber-friendly walkthrough of the 1880 Quant Analyzer at
`https://chaos-lens.vercel.app/kerry-scores.html`. Designed to be uploaded
into NotebookLM as a source document — NotebookLM will turn this into an
Audio Overview / Deep Dive that explains the page in natural conversation.

**Estimated runtime when narrated:** 6–8 minutes.

**Audience:** subscribers who are new to the page and want to know what to
look at first. No technical background assumed.

---

## Script

### The Big Idea

Every weekday after the market closes, the 1880 Quant Analyzer reviews
every stock on Kerry's Tell Sheet, the Watchlist, and the BUS Research
list. For each one, it asks two simple questions, combines the answers,
and gives you back a one-word Rating that tells you exactly what kind of
stock you're looking at — whether it's accumulating, distributing, or
indecisive.

You don't need to know what Hurst is. You don't need to read charts. You
just need to read the Rating column, and you'll know everything the model
thinks about every stock on the page.

Let's walk through how it works.

### The Two Questions Behind Every Rating

The Rating combines two completely different ways of looking at a stock.

**Question 1 — Where does the price sit relative to its moving averages?**
This is the structural question. We look at three trend lines — the
15-day, 62-day, and 200-day Simple Moving Averages — and ask: is the
price above or below each one?

This gives us four possible "tiers":

- If the price is **above all three** moving averages, with the averages
  themselves stacked in bullish order, we call this **STRONG**.
- If the price is **above the 62-day and 200-day** but below the 15-day,
  we call this **TRENDING**.
- If the price is **above the 200-day only**, we call this **WATCH** —
  early recovery, building a base.
- If the price is **below the 200-day**, we call this **SPECULATIVE**.
  The 200-day is what we call the "line of last resort." Nothing
  structurally good happens below it.

**Question 2 — Does the price action confirm a real trend?**
This is the fractal question. A stock can be above its moving averages
and still be wandering randomly — like a drunk walking uphill. The
fractal mathematics check whether the underlying price action has the
signature of a real, persistent trend, or whether it's mostly noise.

We use three fractal measurements. The Hurst exponent measures whether
moves tend to continue in the same direction or reverse. The Higuchi
dimension measures whether the price path is smooth or chaotic.
Lacunarity measures whether volatility is uniform or comes in clusters.

If all three confirm a real trend, the price action is **STRONG**.
If one or two confirm, it's **INDECISIVE**. If none confirm, it's
**WEAK** — the price is just bouncing around with no real direction.

### Combining the Two Questions Into the Rating

These two answers combine into a 4-by-3 matrix, and the cell where they
meet is your Rating. Let me walk you through the labels.

When the structure is strong AND the fractals confirm, you get
**STRONG ACCUMULATION** — the model's clearest, most-confirmed setup.
This is a stock to own, and one to add to on weakness.

When the structure is healthy AND the fractals confirm, you get
**ACCUMULATING** — the trend is real and intact. Own it, add on weakness.

When the structure is just recovering above the 200-day AND the fractals
confirm, you get **BUILDING BASE** — early-stage. Watch it. Don't load
up yet, but it's on the radar.

When the structure is bullish BUT the fractals don't confirm, you get
mixed signals. The label is **NO IDEA** — hold what you own, don't
initiate.

When the structure is bullish BUT the fractals have weakened, you get
**TOPPING** — the trend is losing its support. Trim into strength.

When the structure is starting to crack AND the fractals are weak, you
get **DISTRIBUTING** — selling pressure is starting beneath the surface.
Reduce exposure.

When the price has lost the 200-day OR the fractal structure has fully
broken down, you get **DISTRIBUTION** — exit or avoid.

And when the price is below the 200-day line of last resort, you get
**SPECULATIVE** — dead money in most cases. Only speculative reclaim
plays apply here.

### The Special Case — DON'T CHASE

There's a ninth Rating that overrides everything else, and you need to
understand when it fires.

Sometimes a stock is structurally perfect — above all three moving
averages, fractals confirming, everything aligned for STRONG
ACCUMULATION — but the price has run so far above its 200-day average
that buying here is mathematically chasing a parabolic move.

When a stock is more than 75 percent above its 200-day SMA, the Rating
gets promoted to **DON'T CHASE**. It shows as a bold red badge —
impossible to miss. Underneath it, in small slate text, you'll see the
structural read it would have been — something like "structurally strong
accumulation." Both are true: the trend is genuinely bullish, but the
entry has passed. Parabolic moves like this almost always retrace.

If you see DON'T CHASE, the message is simple: do not initiate a new
position here. Wait for a meaningful pullback — toward the 15-day or
62-day SMA — before considering an entry. If you already own the stock,
consider scaling back into strength.

### The Rating Modifiers

Sometimes the Rating word alone doesn't tell the whole story. When that
happens, the badge shows a lowercase tag after an em-dash. There are
four modifiers to know:

**extended** — the price is 30 to 75 percent above the 200-day SMA.
Still buyable, but stretched. Not a great entry; wait for a pullback.

**pulling back** — the 15-day directional read has turned bearish even
though the 62-day is still bullish. This is a classical pullback inside
an uptrend. Don't chase; wait for the pullback to stabilize.

**consolidating** — the 15-day direction is flat while the 62-day stays
bullish. The stock is digesting a recent move. Watch for the next
directional resolution.

**bouncing** — the 15-day has flipped bullish against a bearish
62-day. This is a counter-trend rally, not a confirmed reversal — treat
it with skepticism.

Modifiers stack. So you might see "ACCUMULATING — extended · pulling
back." Read this as: the trend is bullish, the stock is stretched, AND
right now it's pulling back. The exact opposite of a fresh buy signal.

### The Columns You'll See

Beyond the Rating, the table shows you everything that fed into it,
organized into two groups.

The **Fractals: Trend Confirmation** group, tinted yellow, shows the
inputs that drove the fractal-confirmation half of the Rating. You'll
see the 15-day and 62-day directional reads, the three fractal
measurements (Hurst, Box Dim, and Lambda), the composite conviction
score, and the algorithmic mood read.

The **Trend** group, tinted blue, shows the 15 / 62 / 200-day SMAs
themselves, each with a green ▲ if price is above and a red ▼ if below,
plus the actual SMA value. At a glance you can see exactly which tier
the stock is in.

To the right of the trend group is the **Trading Range** — a 15-day
probable price band based on volatility. The marker shows where today's
close sits within the band. Bottom = favorable entry, top = stretched.
Use this together with the Rating: an ACCUMULATING rating at the bottom
of its Trading Range is the highest-quality long signal you can find.

And on the far right is the **AI Take** button — more on that in a
moment.

### Reading the Header

At the top right of the page, you'll see what date the table reflects.
The page says something like "Rating column reflects: Tuesday, June 2,
2026 close." This is important — the data is the most recent end-of-day
close. During the trading day, this is yesterday's close. There's also
a Price sublabel under the Price column showing the same date.

If any individual row hasn't refreshed in more than three trading days,
you'll see a small amber "stale" chip next to that ticker, and the
Rating badge will be grayed out and crossed through. Do not trade on
stale ratings — the model recommends ignoring them until they refresh.

### Power Tool — The Intraday Overlay

The Rating column normally reflects yesterday's end-of-day close. But
during the trading day, you can click the **⚡ Intraday overlay** button
in the action bar. It pulls live prices for every stock and recomputes
the Rating using today's intraday price against yesterday's band.

Most of the time, the intraday read will match the EOD read. But on a
day when a stock has gapped or moved significantly, the intraday
Rating may flip — and that's exactly when you want to see it. The
overlay shows both Ratings stacked: EOD on top, Live below, with a
purple arrow when they differ.

This is a discretionary tool, not a replacement for the EOD model. Use
it when you're actively watching a name during the session.

### The AI Take

For any stock you want to dig deeper on, click "Get AI take" on the
right side of the row. Claude runs a full analysis on that stock,
following the exact same four-step reasoning the page uses:

First, Claude states the SMA tier — quoting the actual price and the
15, 62, and 200-day SMA levels. Second, Claude states the fractal
confirmation — quoting Hurst, Box Dim, and Lambda values and saying
how many gates pass. Third, Claude combines into the Rating and
explains what it means for action. Fourth, Claude names the specific
price level where the next tier transition would occur — for example,
"loses the 200-day at $X, demotes to SPECULATIVE."

Every AI Take closes with a required **10th Man** section. This is a
discipline borrowed from military intelligence: even when every signal
aligns, one voice in the room is required to argue the opposite case.
Claude names the strongest specific counter-thesis — what would make
this read wrong — and identifies the price level or signal whose
appearance would force a flip. This protects you from groupthink when
you're feeling confident about a stock.

The AI Take also leads with a "Data as of" line showing exactly which
trading-day close the analysis was built against — so you never wonder
how fresh the read is.

First click on any stock costs about a penny. The answer caches until
either 24 hours pass or a fresh overnight scan lands, whichever comes
first. So re-opening it the same day is free, and you'll automatically
get a fresh take the morning after the cron runs.

If you ever want to force a fresh pull regardless of cache — say, the
price has moved significantly intraday — there's a small "Pull fresh"
link under every Get AI Take button. One click bypasses cache.

### How to Use the Page Each Morning

Here's a routine that takes maybe two minutes a day.

First, open the page. The Rating column is already sorted with the
strongest signals at the top — STRONG ACCUMULATION, then DON'T CHASE
warnings, then ACCUMULATING, working down to DISTRIBUTION and
SPECULATIVE at the bottom.

Second, scan the top of the list. STRONG ACCUMULATION stocks are your
highest-conviction longs. Hover any Rating badge — the tooltip gives
you the plain-English reason in one sentence.

Third, watch carefully for DON'T CHASE. Even though it's structurally
bullish, the message is clear: don't enter here. Wait for a pullback.

Fourth, for any stock you want to dig deeper on, click Get AI Take.
Read the narrative. Pay particular attention to the 10th Man section —
that's where the contrarian risk is laid out.

Fifth, use the filter pills to narrow to Tell Sheet only, Watchlist
only, or BUS Research only. Or type a ticker into the search box to
jump to a specific name. You can also analyze any ticker not on the
lists by typing it into the "Analyze any ticker" box at the top.

That's the workflow. The Rating tells you what kind of stock you're
looking at. The modifiers tell you the timing. The AI Take tells you
the full story. And the 10th Man tells you what could prove you wrong.

### When the Page Shows Few Strong Signals

Some days, you'll open the page and there won't be many STRONG
ACCUMULATION or ACCUMULATING ratings. This is information, not a
failure of the model.

The Rating only fires bullish when the structure AND the fractals AND
the entry conditions all align. On choppy days, stocks that gapped
ahead, or broad pullbacks, very few names clear all the gates. The
right move is often to wait. Patience is a feature, not a bug.

If you want to see what's setting up but not yet confirmed, look at
the BUILDING BASE list — those are stocks that have reclaimed the
200-day with confirmed fractals but haven't yet broken above the
62-day. Some of them will turn into ACCUMULATING over the coming
days; some won't. They're your watch list.

### Final Reminder

The 1880 Quant Analyzer is a screening tool. It's one model's read on
a snapshot of price data, computed the same way every day with no
human override. It is not investment advice. It's a starting point for
your own research and decision-making, not a substitute for it.

Use it the way you'd use any good screen: to narrow a list of dozens
of stocks down to the handful worth a closer look. The closer look —
that's still your job.

Thanks for watching.

---

## Notes for NotebookLM (not part of the script)

If NotebookLM asks for guidance on tone: conversational, warm but not
casual. Imagine explaining to a smart friend who's new to quantitative
analysis but has been in the market a while.

If NotebookLM asks for pacing: 6–8 minutes of natural speech is the
target. Spread the technical sections (the two questions, the matrix)
over more time; move quickly through the action-implication list.

If NotebookLM asks for emphasis: spend extra time on (a) the difference
between structural Rating and the dynamic modifiers, and (b) the
DON'T CHASE warning — these are the two concepts subscribers are most
likely to misunderstand on first read.
