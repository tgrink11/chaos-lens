# Kerry's Tell Sheet + Watchlist daily scan — setup

This pipeline scores symbols pulled from Kerry's Google Sheet every weekday
after market close and exposes the results for `behavioral-market-agent` to
render.

## What's included

| File | Purpose |
|---|---|
| `api/cron/kerry-scan.js` | Vercel cron target. Fetches symbols, runs the engine, upserts to Supabase. |
| `api/kerry-scores.js` | Public read endpoint (CORS-allowed for `behavioral-market-agent`). |
| `vercel.json` | Adds the cron entry: `0 22 * * 1-5` (22:00 UTC = 6pm ET DST / 5pm EST). |
| `src/App.jsx` | Reads `?symbol=…&type=…` on mount so each table row can deep-link to a full report. |

## One-time setup

### 1. Supabase schema

Run this in the SQL editor of the same Supabase project the screener cache uses:

```sql
create table kerry_scores (
  symbol text primary key,
  list_type text not null check (list_type in ('tellsheet','watchlist')),
  name text,
  price numeric,
  short_term_direction text,
  short_term_confidence int,
  medium_term_direction text,
  medium_term_confidence int,
  prediction text,
  prediction_confidence int,
  prediction_reasoning text,
  mood text,
  hurst numeric,
  box_dim numeric,
  lambda numeric,
  chaos_lens_url text,
  conviction_history jsonb not null default '[]'::jsonb,
  scanned_at timestamptz not null default now()
);

create index kerry_scores_list_type_idx on kerry_scores (list_type);
```

**If the table already exists**, add the new column in place:

```sql
alter table kerry_scores
  add column if not exists conviction_history jsonb not null default '[]'::jsonb;
```

`conviction_history` stores the prior N days of computed conviction scores
as `[{date: 'YYYY-MM-DD', value: number}, ...]`, newest first. The cron
prepends yesterday's value on each run and caps at 5 entries. The UI
displays them as a small mini-row under today's conviction number. History
populates organically — there will be 0 prior days after the first scan,
1 after the second, etc.

If a symbol appears on both lists (e.g., HUT, MRVL), it'll exist as one row
with whichever `list_type` was upserted last. If you'd rather have one row
per (symbol, list_type) pair, change the primary key:

```sql
-- Alternative: composite key
alter table kerry_scores drop constraint kerry_scores_pkey;
alter table kerry_scores add primary key (symbol, list_type);
```

### 1b. AI-take cache table

Powers the "Get AI take" button on the standalone page. Runs Claude on
a single Kerry-list ticker on demand and caches the answer for 24 hours
so repeat clicks the same day are free.

```sql
create table ai_takes (
  symbol text primary key,
  text text not null,
  model text,
  generated_at timestamptz not null default now()
);
```

No RLS needed (same reasoning as `kerry_scores`).

### 2. Vercel environment variables

Add these in the chaos-lens project's Vercel settings → Environment Variables:

| Name | Value | Notes |
|---|---|---|
| `KERRY_SHEET_ID` | `1Dw85xeqaZnFF1d8LKPbKVObP-ymZ4_M6_st-q7yjxas` | The Google Sheet ID |
| `KERRY_SHEET_GID` | `0` | Defaults to `0` if unset |
| `CRON_SECRET` | (generate 32 random bytes) | `openssl rand -hex 32` |
| `CHAOS_LENS_URL` | `https://chaos-lens.vercel.app` (or your custom domain) | Used to build deep-link URLs in scored rows |
| `FMP_KEY` | (existing) | Reused from current setup |
| `SUPABASE_URL` | (existing) | Reused |
| `SUPABASE_ANON_KEY` | (existing) | Reused |
| `ANTHROPIC_KEY` | (existing) | Powers the AI-take button; reused from the chaos-lens app's existing config |

### 3. Sheet permissions

The cron uses Google's public `gviz` CSV export. The sheet must remain set to
**"Anyone with the link can view"** for fetches to succeed. No API key is
needed.

## Schedule

```json
"crons": [{ "path": "/api/cron/kerry-scan", "schedule": "0 22 * * 1-5" }]
```

- 22:00 UTC weekdays
- = 6:00pm ET during daylight saving / 5:00pm EST during standard time
- = ~2 hours after the NYSE close (4:00pm ET), comfortably after FMP
  publishes the day's EOD data.

Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` on cron
invocations, so the endpoint verifies that header and 401s otherwise.

## Manually triggering a run

Once deployed and env vars are set:

```bash
curl -X GET "https://chaos-lens.vercel.app/api/cron/kerry-scan" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Response shape:

```json
{
  "ok": true,
  "elapsedMs": 14823,
  "totals": { "tellsheet": 54, "watchlist": 78 },
  "tellsheet": { "scored": 54, "failed": 0 },
  "watchlist": { "scored": 75, "failed": 3 }
}
```

A few `failed` entries are normal — FMP returns nothing for some thinly-
traded or recently-listed tickers, and the engine requires at least 60 daily
bars.

## Consumer fetch (`behavioral-market-agent`)

```js
const { scores, lastScanned, count } = await fetch(
  'https://chaos-lens.vercel.app/api/kerry-scores'
).then(r => r.json());
```

Filter by list:

```js
fetch('https://chaos-lens.vercel.app/api/kerry-scores?list=tellsheet')
```

Each row:

```ts
{
  symbol: string;
  list_type: 'tellsheet' | 'watchlist';
  name: string | null;
  price: number | null;
  short_term_direction: 'bullish' | 'bearish' | 'neutral';
  short_term_confidence: number;       // 0-100
  medium_term_direction: 'bullish' | 'bearish' | 'neutral';
  medium_term_confidence: number;
  prediction: 'THRUST_UP' | 'CASCADE_DOWN' | 'CONSOLIDATION';
  prediction_confidence: number;       // 0-100
  prediction_reasoning: string | null; // top reason
  mood: 'PANIC' | 'EUPHORIA' | 'STEALTH_BUILD' | 'GRIND';
  hurst: number;                       // 0-1
  box_dim: number;                     // 1-2
  lambda: number;                      // ≥ 1
  chaos_lens_url: string | null;       // deep-link to full report
  conviction_history: Array<{          // prior days, newest first; max 5
    date: string | null;               // 'YYYY-MM-DD' of that scan
    value: number;                     // computed conviction for that day
  }>;
  scanned_at: string;                  // ISO 8601
}
```

## Suggested table layout for the consumer

| Symbol | List | Name | 15-Day | 15d Conf | 62-Day | 62d Conf | Prediction | Pred Conf | Top Reason | Price | Mood | [Full Report ↗] |

Clicking the Full Report cell opens `chaos_lens_url` in a new tab, which
auto-loads the full chaos-lens analysis for that ticker thanks to the
deep-link support added in `App.jsx`.

## Sheet ranges

Configured in `api/cron/kerry-scan.js`:

```js
const RANGES = {
  tellsheet: ['A5:A58'],
  watchlist: ['A73:A148', 'A160:A163'],
};
```

If Kerry expands the lists, update these ranges and redeploy. The cron uses
Google's `gviz` endpoint with explicit ranges so adding rows outside the
specified bounds won't accidentally pick up non-ticker cells.
