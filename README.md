# BursaQuant — Stock Research Terminal (v0.7 trial)

BursaQuant is a lightweight stock-research dashboard for US and Bursa Malaysia markets. It combines real OHLCV data with transparent technical rules, conditional entry/stop/TP scenarios and configurable position-risk calculations.

## New in v0.7: manual trades and holding reviews

Open **Trades & Holdings** to record long stock/ETF buys, partial or full sales and the plan for each remaining lot. Select short term, swing or long term for each holding, then **Analyse** to compare your recorded stop and targets with completed provider candles and timeframe evidence. A review can flag a breached stop, a reached target, weakening/conflicting evidence, conditional hold readings or missing information. It never sends orders, records a sale automatically or changes your stop to fit a different style.

Actual and paper records, MYR and USD totals stay separate. Entry fees are allocated proportionally across sold and remaining shares. Original stop risk is preserved separately from a later protective stop. Sale corrections and explicit record undo help fix manual-entry mistakes; they affect this local tracker only. Existing closed-trade journal records are preserved in an expandable section. Records stay in browser storage with dedicated validated backup/import; they are not synchronised across devices.

Read [HOLDINGS-START-HERE.md](HOLDINGS-START-HERE.md) for the walkthrough and price-reference limits. Reviews use delayed completed closes, identify the source/date and expire after 30 minutes. Whole shares and individual buy lots are supported; dividends, automatic corporate-action reconciliation, taxes, unentered fees and FX conversion are excluded. Only ticker, market and interval requests leave the browser for candles. No AI account or new API key is required.

v0.7 validation: 229 automated tests pass, including partial-sale accounting, corrections/undo, old-journal preservation, backup privacy, timeframe reference selection, invalid data and expired reviews. These checks validate implementation; they do not establish profitable trading performance.

## New in v0.6: deep stock research and IPO comparisons

Read [DEEP-RESEARCH-START-HERE.md](DEEP-RESEARCH-START-HERE.md) for the walkthrough. **Analyse deeper** fetches daily, 4H and 1H histories sequentially, shows trend agreements and conflicts, includes the daily accumulation checklist and displays conditional scenarios with your existing risk settings. Missing, invalid, stale or incomplete histories remain explicit; a report can be useful with partial coverage. Scores and pressure estimates are not probabilities or verified investor flows.

**IPO Research** is a manual, source-backed workspace for offer terms, audited annual financials, comparable listed peers, valuation multiples, offer structure, risks and a thesis. Share counts and financial totals use millions. It starts empty and does not fetch an IPO calendar or extract PDFs. Peer medians require confirmed sources, audited annual figures, the same financial year-end and currency, and your comparability review. Browser-only dossiers support JSON backup/import.

The optional **AI Research Coach** explains a fresh stock technical report. Calls are disabled until explicitly configured; no AI account, model or paid service is selected for this release. See [AI-SETUP.md](AI-SETUP.md). The server removes position sizes and account settings, limits requests and uses the existing private access code. It has no live web, news or prospectus access. It does not provide a monthly budget; configure a provider API-key/team budget before enabling it.

Validation: 161 automated tests pass, covering existing behaviour, report provenance/coverage, request races, private AI boundaries and IPO valuation/import edge cases. This verifies implementation, not profitability. iSaham remains optional and deferred; warrants remain outside scope.

## New in v0.5: a real daily screener

Read [SCREENER-START-HERE.md](SCREENER-START-HERE.md) for the new screen. It replaces simulated screener rows with explicit real-data requests for your selected universe. It flags quiet accumulation candidates, price/volume breakout candidates, distribution pressure and unavailable evidence. The rules are transparent, unvalidated research checklists, not investor-flow measurements or probabilities of a future price surge.

- Choose pasted/imported ticker lists, your watchlist or a market directory. US directories come from Nasdaq Trader; the Bursa directory requires a separate server-side iSaham token and discloses unverified completeness.
- Scan completed daily candles sequentially in batches of 1–25, with explicit continuation and rate-limit pauses. Loading a directory does not scan it.
- Review CMF20, directional-volume pressure, range/volatility contraction, prior resistance and configurable liquidity floors in each finding.
- See selected/checked/analysed/failed/insufficient/stale counts and original candle/fetch timestamps. No simulated fallback is used.
- Keep results locally, resume a compatible run and export evidence. The screen is on demand; it is not a continuously running or guaranteed full-market service. Browser storage capacity and provider request access limit practical scale.

v0.5 was published through PR #2 at commit `3689577`; both GitHub Pages and Vercel production deployed it. Vercel project `bursaquant` in `syn-db04` is connected to `synakmal/bursaquant`. The project covers stocks and ETFs; warrants are outside the current scope.

### Private provider connection check

v0.5.1 adds `GET /api/provider-status?provider=isaham`, protected by the existing personal gateway access code. It checks the documented zero-credit iSaham account-usage endpoint server-side, reports non-sensitive token-format issues and sanitised provider/access errors, and returns only tier/credit totals on a recognised success. It never returns the token, raw upstream response, account identifier or IP address. Configuration booleans in `/api/health` establish only that a setting exists; they do not establish that the provider accepted it. The connection check is explicit and does not run during every scan.

## Start the latest-data trial

Published frontend: https://synakmal.github.io/bursaquant/ . On that GitHub Pages origin the app defaults to the production gateway at https://bursaquant-syn-db04.vercel.app/api . Enter your personal access code in **Risk & Data Settings** once per browser/site; the code is never included in this repository. Vercel-hosted copies continue using their same-origin `/api` routes. A daily chart uses completed sessions; use 15m/30m for available current-session candles.

Read [TRIAL-START-HERE.md](TRIAL-START-HERE.md) for the step-by-step local and GitHub/Vercel setup. `npm start` runs a personal server on http://127.0.0.1:8000 with the Yahoo trial adapter enabled. No dependency installation or provider API key is required for this local adapter. Yahoo is unofficial and request access is not unlimited or guaranteed; review its data-use terms. Hosted Yahoo requests require a private `BQ_ACCESS_TOKEN`, entered in the app's data settings.

v0.4 adds on-demand company search and historical candle analysis through Yahoo, explicit provider/error states, source and retrieval timestamps, inference/caching disclosures, request-race protection and all nine timeframe choices. Provider errors never silently replace a real-data analysis with synthetic prices. The source directory remains connected to the selected GitHub repository through its review branch.

> **Data safety:** Provider responses do not guarantee freshness, accuracy, completeness, display rights or executable prices. The app never places trades.

## New in v0.3: your strategy, explained

Open **Strategy & Learning** in the sidebar. No API registration is needed to try these features with demo candles or imported CSV.

- Start with Balanced, Trend, Pullback or Breakout emphasis; edit and save a custom name.
- Enable individual rating inputs and set relative weights: moving-average trend, RSI, MACD, support/resistance, relative volume, ATR volatility and Bollinger-band location.
- Adjust the preferred RSI band and the constructive/caution score thresholds.
- Single-stock ratings, local answers and exported AI context use the saved rules. Research snapshots retain the strategy used when saved. The daily accumulation screener has a separate, disclosed checklist and thresholds.
- Read an expandable guide for each indicator, including its calculation, use in this app and limitations.
- Ask the local explainer about the score, confirmation conditions, risk sizing or missing evidence.
- Export an AI research brief containing the selected strategy, measured evidence, data source, coverage and risk settings. This creates a local file; it does not contact an AI service.

Weights need not sum to 100. Score = 100 × available weighted points / available selected weight. Zero disables an indicator. Missing inputs are excluded from the denominator; if every selected input is unavailable the rating is unavailable. These are unvalidated preference profiles, not backtested systems or probabilities of profit. Disabling a rating input does not remove its chart overlay or change entry/stop/target geometry. Trading style and risk settings remain separate.

Indicator periods remain SMA20/50/200, RSI14, MACD12/26/9, ATR14, Bollinger20/2 and previous-20-candle relative volume. Period editing remains future work. Yahoo trial chart intervals are 5m, 15m, 30m, 1H, session-based 4H, daily, weekly, monthly and quarterly, subject to symbol/history availability. Bursa 4H uses 30-minute inputs over approximately 59 days and produces shorter buckets at lunch/close; SMA200 may be unavailable. Quarterly bars combine complete monthly groups. The latest-candle completion is inferred conservatively using exchange times, provider timestamps and a disclosed after-close settlement rule; it is not guaranteed by Yahoo. The AI model and continuous automatic refresh remain unconnected; data requests are explicit and cached.

The original v0.1 and v0.2 ZIP extracts are preserved in the workspace's `versions/` directory. This `bursaquant/` directory is the active source. Upload its contents to the repository root when publishing, not the surrounding workspace or archives. Keep personal journal exports and research briefs outside the repository.

## Historical v0.2 integrations

The sections below describe optional earlier providers; the Yahoo trial and v0.5 guide above describe the active path. iSaham chart entitlement and Twelve Data credentials are not required for pasted-list Yahoo scans.

- Added a **server-side market-data gateway** under `api/` for Vercel.
- Added **Twelve Data** integration for US 1H, 4H, 1D and 1W candles.
- Added **iSaham API** integration for Bursa Malaysia search and D/W historical candles, subject to chart entitlement and unverified freshness.
- Added remote **company-name/ticker search** through the gateway.
- Removed the need to put provider API keys into browser JavaScript.
- Added gateway health checking and a clear real-data/demo fallback.
- Preserved CSV import, technical calculations, support/resistance, Buy Lower/Breakout scenarios, TP1–TP3, invalidation, risk sizing, watchlists and journal.

## Architecture

```text
GitHub Pages frontend
        |
        | HTTPS JSON
        v
Vercel serverless gateway
   |                 |
   v                 v
Twelve Data        iSaham API
   |                 |
 US prices         Bursa prices
```

The provider credentials live only in Vercel environment variables. They are never committed to GitHub and are never sent to the browser.

## Real-data coverage in the free phase

### US

The gateway requests US stock/ETF OHLCV data from Twelve Data. The current Twelve Data Basic plan lists real-time US equities/ETFs, technical indicators, reference data and 800 API requests/day; `/time_series` supports 1h, 4h, 1day and 1week intervals. Verify the provider's current terms and data-display permissions before public use.

### Bursa Malaysia

The gateway uses iSaham API for Bursa search and chart history. As checked on 27 October 2026, Free includes 500 credits/month for eligible endpoints, but the chart endpoint requires **Basic+** entitlement and documents D/W/M resolutions. The existing adapter requests daily and weekly history; it does not provide Bursa intraday candles. Stored quotes have no guaranteed update interval or provider delay. An API response timestamp is not proof of quote freshness. See [iSaham documentation](https://api.isaham.my/docs) and [pricing](https://api.isaham.my/pricing).

The iSaham adapter supplies daily/weekly candles only. The Yahoo trial offers intraday intervals with the limitations described above; neither provider guarantees full coverage or unrestricted request rights.

## Deploy the gateway

Read `DEPLOY-GATEWAY.md` for the exact steps.

Short version:

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add these Vercel environment variables:
   - `TWELVE_DATA_API_KEY`
   - `ISAHAM_API_TOKEN`
   - optional `BQ_ALLOWED_ORIGIN` set to your GitHub Pages origin, e.g. `https://YOURNAME.github.io`
4. Redeploy.
5. Check `https://YOUR-VERCEL-PROJECT.vercel.app/api/health`.
6. In BursaQuant → **Risk & Data Settings → Market Data Gateway**, enter the Vercel API base ending in `/api`.
7. Click **Save & test gateway**.

You can keep the frontend on GitHub Pages. The frontend calls the Vercel gateway cross-origin.

## GitHub Pages

The frontend remains a static site. Upload the extracted repository contents so `index.html` is at the repository root. GitHub Pages can publish the static frontend; the Vercel project supplies the private serverless API layer.

## Local/demo use

If the gateway URL is blank, the site stays in **SIMULATED DEMO** mode. Demo candles are synthetic and must not be treated as market prices.

You can also import trusted OHLCV CSV data locally.

Minimum CSV columns:

```csv
datetime,open,high,low,close,volume
2026-01-01,10.50,10.70,10.40,10.60,100000
```

At least 55 valid candles are required; 200+ are recommended for SMA200.

## Technical analysis engine

- SMA 20, 50, 200
- RSI14
- MACD 12/26/9
- ATR14
- Bollinger Bands
- Relative volume
- Local swing support/resistance
- Fibonacci 38.2% / 61.8%
- Conditional Buy Lower and Buy Breakout scenarios
- Invalidation / stop levels
- TP1 / TP2 / TP3
- Explainable technical score out of 100
- Adjustable capital, risk %, allocation %, fees, slippage and USD/MYR assumption
- Bursa board-lot sizing for ordinary shares

The score is a rules-based research summary, not a probability forecast or guaranteed signal.

## Current limitations

1. Intraday history and current-candle completion are provider-dependent. Yahoo is unofficial, delayed data may apply, and its request access is not unlimited or guaranteed.
2. The screener now uses real daily candles for explicitly checked symbols, but full-market automatic refresh, durable shared result storage and complete verified Bursa instrument coverage remain future work.
3. Fundamentals, news sentiment, broader-index regime and sector relative strength are not yet wired into the final score.
4. Structured warrants still require a separate derivative model: underlying, expiry, exercise price, conversion ratio, premium, gearing, time decay and liquidity.
5. Provider quotas and display/redistribution permissions can change.
6. Risk calculations are planning estimates. Gaps, halts, spreads, fees, taxes, FX charges and execution differences can produce larger losses than the modelled stop loss.

## Developer notes

Files:

```text
index.html
src/styles.css
src/engine.js
src/app.js
src/bundle.js
api/health.js
api/market.js
api/search.js
lib/market-shared.js
.env.example
vercel.json
DEPLOY-GATEWAY.md
tools/build_bundle.py
tests/engine.test.mjs
```

After editing `src/app.js` or `src/engine.js`, regenerate the static bundle:

```bash
npm run build
```

Run the calculation tests:

```bash
npm test
```

## Security rules

- Never commit `.env`, provider tokens, broker passwords or personal financial data.
- Do not move provider secrets into `index.html`, `src/` or browser localStorage/sessionStorage.
- The gateway is read-only market data. It has no trading or broker credentials.
- If the project becomes public, configure `BQ_ALLOWED_ORIGIN` to the exact frontend origin where practical.
