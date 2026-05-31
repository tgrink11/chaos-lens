# Kerry's Fractal Scores — Video Tutorial Script

A short, beginner-friendly walkthrough of the Kerry's Fractal Scores page at
`https://chaos-lens.vercel.app/kerry-scores.html`. Designed to be uploaded into
NotebookLM as a source document — NotebookLM will turn this into an Audio
Overview / Deep Dive that explains the page in natural conversation.

**Estimated runtime when narrated:** 5–7 minutes.

**Audience:** subscribers who are new to the page and want to know what to look
at first. No technical background assumed.

---

## Script

**The Big Idea**

Imagine you had a robot analyst who, every weekday after the market closes,
looked at every single stock on Kerry's Tell Sheet and Watchlist. The robot
studied two years of price action for each one, ran a battery of mathematical
tests, and came back to you the next morning with a single, plain-English
answer: should I buy this, hold this, trim this, or sell this?

That's exactly what Kerry's Fractal Scores does. It's a daily screening tool
that turns hours of analysis into one column on a table. You don't need to
read charts. You don't need to know what a moving average is. You just need to
read the Rating column and the Why column, and you'll know what the model
thinks about every stock Kerry's tracking.

Let's walk through what you'll see.

**The Rating — Your Bottom Line**

The most important column on the page is called Rating. It shows one of six
words, each color-coded so you can spot them at a glance:

**BUY** in bold green means the model is firing on all cylinders. The stock is
trending up, the price action confirms a real trend (not just random noise),
and the current price is at the low end of its recent trading range — meaning
you'd be buying near a favorable entry point. This is the model's strongest
"act now" signal.

**ADD** in regular green is similar to BUY but the entry isn't quite as
favorable. Price is in the lower half of the range, not the bottom quarter.
It's a good place to add to a position you already own, but maybe not where
you'd open a new one.

**DIP** in light blue is a watch list candidate. The stock has pulled back to
a level of support, the long-term trend is still intact, and the price action
looks healthy — but the directional signals haven't fully turned bullish yet.
The model is saying "this is interesting; wait for the momentum to confirm
before pulling the trigger."

**HOLD** in slate gray means no clear edge. Maybe signals are mixed, or the
price is sitting in the middle of its range, or the trend hasn't been
confirmed by the underlying price math. You don't initiate a new position on
a HOLD — but you also don't have to sell what you already own.

**TRIM** in orange means the stock is bullish, but the price has rallied to
the top of its recent range. If you buy here, you'd be buying near a
short-term peak. The model is saying take some profits, don't add. There's
one exception — if volume is strongly confirming the breakout, the model
softens TRIM to HOLD because a real, well-attended breakout deserves more
respect than a quiet one.

**SELL** in bold red has two flavors. Either the price has broken below its
200-day moving average — which is the model's "line of last resort," the line
that defines whether a stock is still in a long-term uptrend — or the
directional signals have turned bearish and the price is in the upper half
of its range. Either way, exit the position.

That's it. Six colors, six actions. The Rating column tells you what to do.

**The Why Column**

Right next to the Rating is a column called Why. This is a one-sentence
explanation, in plain English, of exactly why the Rating fired. For example,
a BUY might read: "Bullish signals lined up and price is at the low end of
its range — favorable entry." A SELL might read: "Price broke below its
long-term support — exit the position." You shouldn't need to read anything
else to understand what the model is saying.

**The Mood Column**

After Why, you'll see a Mood column. This is the market psychology read for
each stock. Euphoria means the stock is trending up with healthy structure.
Panic means it's breaking down with high fear. Stealth Build means there's
quiet accumulation happening — often a precursor to a move higher. Grind
means there's no clear emotional edge in the price action.

Mood doesn't drive the Rating, but it's a useful sanity check. If you see a
BUY rating with Euphoria mood, the call has emotional backing. If you see a
BUY rating with Panic mood, that's unusual and worth a deeper look.

**The AI Take Button**

For any stock where you want to dig deeper, there's a "Get AI take" button on
every row. Click it, and Claude — the same AI you might use through
Anthropic — runs a full analysis on that one stock. Claude looks at the
fractal numbers, the volatility band, the trend structure, the historical
price comparisons, and writes a short, sharp narrative explaining what's
happening.

Every AI Take ends with a section called the "10th Man." This is a discipline
borrowed from military intelligence: even when every signal lines up bullish,
one voice in the room is required to argue the opposite case. The 10th Man
section names the strongest counter-thesis — what would make this trade
wrong, what specific price level or signal would force a flip in the read.
This protects you from groupthink when you're already feeling confident
about a stock.

First click on any stock costs about one penny. The answer caches for
24 hours, so re-opening it later the same day is free. If you want a fresh
take, there's a Refresh link at the bottom of the panel.

**How to Use This Page in the Morning**

Here's a routine that takes maybe two minutes a day.

First, open the page. The default view is "Simple" — just the columns you
need to make a decision. If you ever want the full analytical breakdown,
there's a Detailed toggle at the top, but you don't need it for normal use.

Second, the table is already sorted with the most actionable signals at the
top. BUYs come first, then ADDs, then DIPs, then HOLDs, then TRIMs, then
SELLs. Scan the top of the list. If you see a BUY or ADD, read the Why
column to understand what's lined up.

Third, for any stock that catches your eye, click "Get AI take." Wait about
five seconds while Claude analyzes it. Read the narrative. Pay particular
attention to the 10th Man section — that's where the contrarian risk is laid
out.

Fourth, use the filter pills to narrow to Tell Sheet, Watchlist, or BUS
Research only — or type a ticker into the search box to jump to a specific
name. You can also analyze any ticker that's not on the lists by typing it
into the "Analyze any ticker" box near the top.

That's the workflow. Rating tells you what; Why tells you why; AI Take tells
you the full story.

**When the Page Says "No Buys"**

Here's something important. Some days, you'll open this page and there won't
be a single BUY rating. Not one. This is not a failure of the model — it's a
feature.

The Rating only fires BUY when four things line up simultaneously: direction
is bullish, price is above both the 62-day and 200-day moving averages,
the underlying price action confirms a real trend (not random noise), and
the current price is at a favorable entry point. On days when the market is
choppy, when stocks are stretched, or when there's a broad pullback — very
few stocks clear all four gates.

The right move on those days is often to wait. Patience is half of trading.
The model refuses to manufacture signals just to give you something to
trade. When everything aligns, it tells you. When nothing aligns, it tells
you that too.

If you want to see what's setting up but not yet confirmed, look at the DIP
list. Those are stocks that have pulled back to favorable prices with the
long-term trend still intact. Some of them will turn into BUYs in the coming
days; some won't. They're your watch list.

**Final Reminder**

Kerry's Fractal Scores is a screening tool. It's one model's read on a
snapshot of price data, computed the same way every day with no human
override. It's not investment advice. It's a starting point for your own
research and decision-making, not a substitute for it.

Use it the way you'd use any good screen: to narrow a list of two hundred
stocks down to the handful worth a closer look. The closer look — that's
still your job.

Thanks for watching.
