# BursaQuant — Free Stock Research Terminal (MVP v0.1)

A lightweight **zero-install** stock-analysis dashboard for US and Bursa Malaysia research, using explainable technical rules, conditional entry/exit scenarios and configurable position-risk calculations.

> **Important:** The application opens in **SIMULATED DEMO** mode. Demo candles are synthetic, not current or historical market quotes. Never use demonstration levels to place real trades. To analyse actual bars, import a trusted CSV or supply your own Twelve Data API key for an optional direct browser request. Real feed access, accuracy, freshness, public display rights and Bursa/warrant coverage are NOT guaranteed.

## Quick start (no npm, no Python required)

1. Extract the entire ZIP so that `index.html` and `src/` remain in the same folder.
2. Open **`index.html`** using Chrome, Edge or Firefox.
3. Search e.g. `Maybank`, `1155`, `Apple` or `AAPL` using the sample company catalogue.
4. Select `1H`, `4H`, `1D` or `1W`, or choose the trading-style dropdown.
5. Open **Risk & Data Settings** to adjust your reference capital, percentage risk, position allocation, estimated fees/slippage and manually assumed USD/MYR conversion.
6. Explore **Buy Lower**, **Buy Breakout** and **Hold/Wait** setups. They are contingent scenarios derived from current loaded candles, NOT live broker buy calls or guaranteed trades.
7. Try **Stock Screener**, **Watchlist** and **Trading Journal**. Watchlists and journal entries are saved in your local browser storage.

This build uses plain JavaScript, CSS, HTML and an independent Canvas candlestick chart. **No npm dependency or web server is needed.** Internet access is needed only for optional live data or web fonts.

## GitHub Pages (free static site)

1. Create a new GitHub repository (for example `BursaQuant`).
2. Upload **the extracted contents** of this folder to the repository root (`index.html` at the top level). Do not upload the ZIP as the website.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/(root)**, and save.
5. Open the GitHub Pages URL shown in Settings → Pages when deployment succeeds.

Never commit API keys, private broker credentials, transaction histories or user-specific personal financial information to the public repo. The app has no broker-trading integration.

## Market data options

### 1) Demo data (default)

- Simulates valid OHLCV-shaped series from deterministic generated data.
- Company name search works with a **small built-in catalogue**. Arbitrary tickers can be entered, but these will also use simulated prices unless actual data is loaded.
- The on-screen banner always says **SIMULATED SAMPLE** when demo data is active.
- The demo uses equally spaced bars, not real trading-session/calendar intervals. It is a UI and math demonstration, not a source of backtesting data.
- The "screener" scans only the built-in *demonstration universe*, not the full US/Bursa market. A fully live universe scanner is a future feature requiring a source and licensing evaluation.

### 2) Local CSV import

Use the `Import CSV` button on the analysis page. Minimum 55 valid candles; 200+ recommended for SMA200.

Required columns (case-insensitive):

```csv
datetime,open,high,low,close,volume
2026-01-01,10.50,10.70,10.40,10.60,100000
2026-01-02,10.60,10.80,10.50,10.75,120000
```

- `date` or `timestamp` may substitute for `datetime`; volume is optional.
- Prices must already be adjusted/consistent as required by your research method.
- **Timezone notice:** Datetimes with explicit timezone offsets are preferred. Datetimes without offsets are currently interpreted as UTC. Provider timestamps may instead be exchange-local; normalize them before importing. Dates alone are accepted.
- A CSV's interval cannot be changed by switching the 1H/4H/1D selector. Provide a dataset that already matches the intended timeframe.
- This data stays in your browser for the active page session; only the snapshot summaries are saved if you click Save Analysis.

The included `sample_synthetic_4h.csv` contains **synthetic candles only** for testing the importer.

### 3) Personal Twelve Data API key (optional, direct from browser)

1. Obtain a key from the provider subject to their current free-plan eligibility and usage terms.
2. Open **Risk & Data Settings → Market Data**, enter the key, and press **Use key this session**.
3. Go to **Stock Analysis**, select a symbol/timeframe, and press **Analyse**.
4. The app makes a direct request from your browser to `/time_series` with `interval=1h`, `4h`, `1day`, or `1week`.
5. If browser CORS rules, rate limits, lack of entitlement, symbol lookup problems or network errors prevent loading, the app **clearly falls back to SIMULATED DEMO** and displays an error toast. Do not mistake fallback data for a live quote.

A key is saved only in **sessionStorage** for this tab/session, not bundled or added to a repository. It may still appear in browser network requests; use a personal, low-privilege, limited API key. Public users enter their own keys.

**Public display / licensing:** Market-data providers may forbid redistribution or public display even when an API allows personal queries. You must review the provider's permitted uses before deploying for others. The software includes no publicly cached third-party market-data files.

## Position sizing and risk rules

- Initial settings: **RM20,000** reference capital, **1%** planned risk per trade, **25%** maximum position allocation. All adjustable.
- Includes separate configurable **Bursa** and **US** brokerage fee assumptions, minimum fees, and estimated slippage per side.
- For US shares, capital allocation is converted using your **manual** USD/MYR rate. It is not a current market FX quote.
- For ordinary Bursa shares, quantity is rounded down to multiples of **100**, and to whole units for US stocks / ETFs. Instrument-specific odd-lot or board-lot exceptions are not modeled.
- Quantity is capped to meet BOTH maximum allocation and estimated loss at the invalidation/stop price after approximate two-sided fees and slippage.
- TP1 and TP2 risk/reward calculations estimate net returns using projected commissions and slippage.
- **Risk limits are NOT guarantees**: overnight gaps, trading halts, spreads, taxes, levies, FX charges, liquidity, order rejection and fills outside the stop can cause larger losses.
- Risk calculations are not a recommendation to allocate your maximum allowable budget.

## Technical analysis

Currently implemented:

- SMA 20, 50 and 200 (SMA200 is not reported if fewer than 200 candles)
- RSI14 (Wilder smoothing)
- MACD (12/26 EMAs, 9-period signal), histogram
- Wilder ATR14
- Bollinger Bands (20, 2 standard deviations)
- Relative Volume (most recent volume compared to previous 20 bars)
- Approximate support/resistance from local swing extrema
- Fibonacci 38.2% and 61.8% of recent 60-bar high–low range
- Conditional Buy Lower, Buy Breakout and Hold/Wait scenarios with invalidation and TP1/TP2/TP3
- Price-based bullish/neutral/bearish research scenarios
- Transparent score components (trend, momentum, price structure, volume, volatility)

**Scores are descriptive technical-condition scores, not AI advice, probability estimates, statistical forecasts, or backtested performance claims.** News sentiment, external indices and financial fundamentals are explicitly marked unconnected. Warrants are flagged as needing a dedicated derivative model, and the normal equity trade-planning and score panels are not shown for them.

## Watchlist, saved analysis and journal

- Use the Watchlist button on the Stock Analysis screen.
- Save Analysis creates a summary snapshot with inputs, levels and setups.
- A trading journal records **closed** positions with currency, entry, exit, quantity, costs and notes.
- Export the whole personal workspace JSON from Watchlist, or export journal CSV.
- The initial journal displays the sum of net P/L only if all trades use the same currency; mixed-currency journals explicitly display **Mixed FX** instead of a meaningless sum.
- Nothing syncs across devices in this version. Browser settings and private/incognito modes may erase your local storage. Regularly export backups.

## Limitations and next milestones

1. Reliable publicly displayable **US + Bursa** market data, company-name autocomplete from the provider and data-reliability validations.
2. True universe-wide scanner, with rate-limit-conscious caching and market-specific eligibility checks.
3. Warrant-specific pricing (mother stock, conversion ratio, exercise price, premium, expiry, bid/ask liquidity).
4. Fundamental statement ingestion, sentiment/news citations, market regime & sector inputs.
5. Scheduled alerting, backtesting and historical scoring with lookahead-safe methodology.
6. Cross-device sync, backups and richer journal performance analytics.
7. Robust exchange-session calendars, tick-size rules, corporate actions, and tax/levy models.

No real-time market data, full-market live scanning, proven AI ratings, live alerts, or broker order placement are claimed in v0.1.

## Developer notes

Files:

```
index.html              Browser UI
src/styles.css          Responsive fintech design
src/engine.js           Pure analysis / position sizing math (ES module)
src/app.js              User interface and source adapters (ES module)
src/bundle.js           Generated zero-dependency browser bundle
tools/build_bundle.py   Bundle generation, requires only Python 3
sample_synthetic_4h.csv Example simulated OHLCV data
tests/engine.test.mjs    Basic unit tests
```

You can edit `index.html` and `src/styles.css` directly. If you modify `src/app.js` or `src/engine.js`, regenerate the distributable bundle:

```bash
python tools/build_bundle.py
```

To run the engine tests (Node.js required only for testing):

```bash
npm test
```

## External references

- Twelve Data API: https://twelvedata.com/docs
- GitHub Pages deployment: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- Market data rights: check each provider's contract and terms before public dissemination.

Created as an educational research prototype. No affiliation with Bursa Malaysia, TradingView, market-data providers, or brokerage firms.
