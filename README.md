# Chaos Lens — Vercel deployment

Serverless port of `chaos_lens_live.py`. One endpoint, `GET /api/scan`, that scans
the bundled ~950-name ticker universe (`data/tickers.txt`) against live FMP `/stable/`
data and returns the same schema as the original `results.json`. Vercel's network
isn't behind the allowlisted proxy Cowork's sandbox uses, so this runs the real,
full-universe scan directly against FMP — no workarounds needed.

The fractal math (`lib/engine.js`) is a line-for-line port of the Python engine and
has been numerically verified against it on a synthetic 500-point series (identical
output to 3 decimal places). If you ever change the Python engine, port the change
here too — don't let them drift apart.

## What this does NOT do (yet)

- No cron. `/api/scan` computes fresh on every call rather than running on a
  schedule and caching. For a daily Cowork run, that's simpler and fine — Cowork
  just calls it once each morning. Add a Vercel Cron Job later if you want
  pre-computed, cached results instead of a live compute per call.
- No Google Sheets integration. The ticker universe is the bundled
  `data/tickers.txt` (same list as `chaos_lens_universe.txt`). Update it by editing
  the file and redeploying. Swap in live Google Sheet reads later if you want the
  sheet to be the source of truth.

## Deploy steps (things only you can do — account access)

1. **Create a GitHub repo** and push this folder's contents to it (or use the
   Vercel CLI to deploy without GitHub — your call).
2. **Go to vercel.com, sign in, "Add New... Project"**, and import that repo.
3. **Before the first deploy**, go to Project Settings -> Environment Variables
   and add:
   - `FMP_API_KEY` — your FMP enterprise key
   - `SCAN_SECRET` — a random string you invent (e.g. run `openssl rand -hex 20`
     in a terminal). This protects `/api/scan` from being called by strangers
     and burning your FMP quota.
4. **Deploy.** Vercel will give you a URL like `https://chaos-lens-xyz.vercel.app`
   (or `chaos-lens.vercel.app` if that name's free under your account).
5. Note: `maxDuration: 60` in `vercel.json` needs Fluid Compute (on by default for
   new projects) or a Pro plan for functions to run longer than 10s. A full
   ~950-ticker scan at concurrency 40 should land well under 60s, but if FMP
   rate-limits you, raise `maxDuration` (Pro plan) or lower `&concurrency=`.

## Once it's deployed

Give me (or drop in a file in the ChaosLens folder, same pattern as the FMP key)
two things:
- The deployment URL
- The `SCAN_SECRET` value

I'll call `https://<your-url>/api/scan?key=<SCAN_SECRET>` each morning, get back
the full-universe `results.json`, and pick up from there — confirm the featured
signal, write the segment script, build the figure and white paper. No more
25-name workaround.

## Testing before you rely on it

Call it yourself first with a small limit to sanity-check before trusting the
full run:

```
https://<your-url>/api/scan?key=<SCAN_SECRET>&limit=20
```

Then drop `&limit=` for the real, full-universe scan.
