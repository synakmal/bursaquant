# Start using v0.6

## Analyse a stock more deeply

1. Open [BursaQuant](https://synakmal.github.io/bursaquant/). If necessary, save your existing gateway URL and personal access code in Risk & Data Settings.
2. In Stock Analysis, choose a Bursa or US stock and click Refresh Data. This leaves demo mode and requests provider history.
3. Save your preferred rating strategy and risk settings. Capital and FX values are your assumptions, not account balances fetched from a broker.
4. Click **Analyse deeper**. The report requests daily, 4H and 1H data separately. It pauses after a rate limit and shows individual failures instead of inventing missing data.
5. Read the alignment summary, supporting evidence and contrary evidence. Check the bar dates, missing SMA200/volume coverage and daily accumulation conditions. Price/volume pressure does not identify who bought or sold.
6. Expand a timeframe's conditional scenarios. Check the confirmation, invalidation, fees, slippage and position size before treating a plan as relevant. Scenarios across timeframes are alternatives, not simultaneous orders.
7. Export the report if you want a record before the outcome. Track decisions and realised results after costs in Trading Journal; a high score is not a measured profitable edge.

The report uses a seven-calendar-day stale limit, not a complete exchange holiday calendar. Daily bars can show the previous completed session. Intraday coverage and 4H history depend on the provider, exchange sessions and source availability. Unknown candle completion is excluded from the deeper report.

## Research an IPO

1. Open **IPO Research** and enter the company, market and offer stage.
2. Link the prospectus, record your review date and page references, and confirm whether it is a final source or a draft. Enter the actual financial year-end and audited annual basis. BursaQuant does not verify your source declaration.
3. Enter offer price per share. Enter **post-IPO fully diluted shares and all financial totals in millions**: 500 million shares is `500`, not `500000000`. Enter annual profit attributable to ordinary shareholders. Balance-sheet amounts use that year-end; IPO proceeds are not silently added to historical cash.
4. Leave unavailable values blank. An explicitly confirmed zero is different from unknown. Loss-making P/E is not meaningful.
5. Add comparable listed peers using the same units. Document why their businesses are comparable; review growth, size, accounting, one-off profits and leverage. Supply each peer's source and review date. A median uses only eligible meaningful values, with counts displayed.
6. Record new-share versus existing-holder selling percentages, use of proceeds, customer concentration, governance, lock-up terms, risks and thesis invalidation.
7. Calculate the report, review missing evidence and save the dossier. Export a backup before changing browser/device or clearing storage. Imports add new record IDs and preserve existing saved records.

The first workspace has no automatic IPO calendar, PDF extraction, allocation forecast or listing-gain prediction. Pre-listing IPOs have no traded-price history for technical timing. After listing, the normal stock engine needs at least 55 candles. Generic EV/revenue comparisons are unsuitable for some financial-sector businesses; use sector-specific analysis.

## Optional AI

Click **Check AI setup** in Deep Research. With the default release it reports that calls are disabled. The technical and IPO tools work without it.

When enabled later, asking AI explicitly sends your question and the technical report through your private gateway. Position quantities, capital, allocation settings, journal and access codes are excluded. Do not type private details into the question. AI answers refer to evidence IDs but still require checking. It cannot fetch current news, prospectuses or fundamentals. The first AI version accepts stock technical reports only.

Choose a provider/model and spending limit before following [AI-SETUP.md](AI-SETUP.md). No monthly cap is enforced by this application.
