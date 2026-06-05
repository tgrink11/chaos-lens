/**
 * ETF universe for the 1880 Quant Analyzer — sourced LIVE from a Google Sheet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  👉  TO ADD OR REMOVE AN ETF: just edit the Google Sheet. No code change.
 *      Sheet: https://docs.google.com/spreadsheets/d/1Cabu2q88qH_XByl8_gIKRjQXNt_NVEPO
 *      Tickers live in COLUMN B (rows 3+). Anything that isn't a 1–5 letter
 *      ticker (headers, blanks, sector names in column A) is ignored.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The nightly cron (api/cron/kerry-scan.js) calls loadEtfSymbols() at scan
 * time, scores each ticker with list_type: 'etf', and upserts them into the
 * kerry_scores table — so they appear under the "ETF" filter pill on
 * /kerry-scores.html. Add a ticker to the sheet today, it's scanned tonight.
 *
 * The admin rescan endpoint (api/admin/rescan.js) also calls loadEtfSymbols()
 * so a freshly-added ETF can be scored on demand with the correct list_type
 * (POST /api/admin/rescan?symbol=XXX) without waiting for the cron.
 *
 * The sheet must be shareable as "Anyone with the link can view" — the loader
 * fetches it unauthenticated via Google's CSV export endpoint.
 *
 * Notes on the fetch method: this sheet is an uploaded .xlsx, for which the
 * gviz/tq endpoint (used by the Kerry native sheet) is unreliable. The CSV
 * `export` endpoint works for both native and uploaded sheets, so we use it
 * here and parse column B ourselves.
 */

// Public sheet id + tab. Overridable via env without a code change if the
// sheet is ever swapped. Empty gid = the sheet's first tab (where the data is).
export const ETF_SHEET_ID = process.env.ETF_SHEET_ID || '1Cabu2q88qH_XByl8_gIKRjQXNt_NVEPO';
export const ETF_SHEET_GID = process.env.ETF_SHEET_GID || '';
// Tickers are in column B → zero-based index 1.
const ETF_COL_INDEX = 1;

/**
 * Fallback ETF set, used ONLY if the live sheet fetch fails, so a transient
 * Google hiccup never makes the entire ETF category vanish for a night. Core
 * benchmarks + the 11 SPDR sectors.
 */
export const ETF_FALLBACK = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY',
  'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
];

/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields, escaped quotes (""),
 * and commas/newlines inside quotes — the data columns (prices, % returns)
 * can contain commas, so a naive split(',') would land on the wrong column.
 * Returns an array of rows, each an array of cell strings.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Fetch the ETF tickers from the live Google Sheet (column B). Returns a
 * de-duplicated, validated, upper-cased array. On any failure, logs and falls
 * back to ETF_FALLBACK so the category degrades gracefully instead of vanishing.
 */
export async function loadEtfSymbols() {
  const url = `https://docs.google.com/spreadsheets/d/${ETF_SHEET_ID}/export?format=csv${
    ETF_SHEET_GID ? `&gid=${ETF_SHEET_GID}` : ''
  }`;
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const tickers = parseCsv(text)
      .map((r) => String(r[ETF_COL_INDEX] || '').toUpperCase().trim())
      .filter((s) => /^[A-Z]{1,5}$/.test(s));
    const set = new Set(tickers);
    if (set.size === 0) throw new Error('no tickers parsed from column B');
    return [...set];
  } catch (e) {
    console.warn(`[etf-symbols] live sheet load failed (${e.message}); using fallback list (${ETF_FALLBACK.length})`);
    return [...ETF_FALLBACK];
  }
}

/** Convenience: load the ETF universe as a Set for fast membership tests. */
export async function loadEtfSet() {
  return new Set(await loadEtfSymbols());
}
