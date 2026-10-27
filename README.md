# BursaQuant — Stock Research Terminal (v0.3)

BursaQuant is a lightweight stock-research dashboard for US and Bursa Malaysia markets. It combines real OHLCV data with transparent technical rules, conditional entry/stop/TP scenarios and configurable position-risk calculations.

> **Data safety:** Provider responses do not guarantee freshness, accuracy, completeness, display rights or executable prices. The app never places trades.

## New in v0.3: your strategy, explained

Open **Strategy & Learning** in the sidebar. No API registration is needed to try these features with demo candles or imported CSV.

- Start with Balanced, Trend, Pullback or Breakout emphasis; edit and save a custom name.
- Enable individual rating inputs and set relative weights: moving-average trend, RSI, MACD, support/resistance, relative volume, ATR volatility and Bollinger-band location.
- Adjust the preferred RSI band and the constructive/caution score thresholds.
- Ratings, the demo screener, local answers and exported AI context use the saved rules. Research snapshots retain the strategy used when saved.
- Read an expandable guide for each indicator, including its calculation, use in this app and limitations.
- Ask the local explainer about the score, confirmation conditions, risk sizing or missing evidence.
- Export an AI research brief containing the selected strategy, measured evidence, data source, coverage and risk settings. This creates a local file; it does not contact an AI service.

Weights need not sum to 100. Score = 100 × available weighted points / available selected weight. Zero disables an indicator. Missing inputs are excluded from the denominator; if every selected input is unavailable the rating is unavailable. These are unvalidated preference profiles, not backtested systems or probabilities of profit. Disabling a rating input does not remove its chart overlay or change entry/stop/target geometry. Trading style and risk settings remain separate.

Indicator periods remain SMA20/50/200, RSI14, MACD12/26/9, ATR14, Bollinger20/2 and previous-20-candle relative volume. Period editing and extra timeframes are future work. Current chart intervals remain 1H, 4H, daily and weekly. An AI model, provider credentials and automatic continuous price refresh are not connected by this update.

The original v0.1 and v0.2 ZIP extracts are preserved in the workspace's `versions/` directory. This `bursaquant/` directory is the active source. Upload its contents to the repository root when publishing, not the surrounding workspace or archives. Keep personal journal exports and research briefs outside the repository.

## What changed in v0.2

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

For Bursa 1H/4H research, use the existing CSV importer until a provider with suitable intraday rights is selected.

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

1. Bursa live 1H/4H requires a future intraday provider; v0.2 will not fabricate it.
2. The screener is still a demonstration-universe scanner, not a full-market real-time scanner.
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
