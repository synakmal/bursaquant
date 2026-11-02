# Deep stock research

## Analyse a stock more deeply

1. Open [BursaQuant](https://synakmal.github.io/bursaquant/). If necessary, save your existing gateway URL and personal access code in Risk & Data Settings.
2. In Stock Analysis, choose a Bursa or US stock and click Refresh Data. This leaves demo mode and requests provider history.
3. Save your preferred rating strategy and risk settings. Capital and FX values are your assumptions, not account balances fetched from a broker.
4. Click **Analyse deeper**. The report requests daily, 4H and 1H data separately. It pauses after a rate limit and shows individual failures instead of inventing missing data.
5. Read the alignment summary, supporting evidence and contrary evidence. Check the bar dates, missing SMA200/volume coverage and daily accumulation conditions. Price/volume pressure does not identify who bought or sold.
6. Expand a timeframe's conditional scenarios. Check the confirmation, invalidation, fees, slippage and position size before treating a plan as relevant. Scenarios across timeframes are alternatives, not simultaneous orders.
7. Export the report if you want a record before the outcome. Track decisions and realised results after costs in Trades & Holdings; a high score is not a measured profitable edge.

The report uses a seven-calendar-day stale limit, not a complete exchange holiday calendar. Daily bars can show the previous completed session. Intraday coverage and 4H history depend on the provider, exchange sessions and source availability. Unknown candle completion is excluded from the deeper report.

## Optional AI

Click **Check AI setup** in Deep Research. With the default release it reports that calls are disabled. Stock research and holding reviews work without it.

When enabled later, asking AI explicitly sends your question and the technical report through your private gateway. Position quantities, capital, allocation settings, journal and access codes are excluded. Do not type private details into the question. AI answers refer to evidence IDs but still require checking. It cannot fetch current news, prospectuses or fundamentals. The first AI version accepts stock technical reports only.

Choose a provider/model and spending limit before following [AI-SETUP.md](AI-SETUP.md). No monthly cap is enforced by this application.
