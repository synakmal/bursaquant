# BursaQuant v0.5 real daily screener trial

Status: this guide describes the v0.5 changes under development and review. It does not establish that v0.5 has been published to production. Check the version shown in the site footer before following these steps; the v0.4 demonstration screener is different.

The v0.5 screener checks actual provider candles for a selected list of stocks and ETFs. It looks for quiet price bases, possible buying pressure, breakouts and selling-pressure patterns. Results cover only the instruments actually checked. Loading a market directory does not complete a market-wide scan.

## 1. Connect the market-data gateway

Open **Risk & Data Settings**. Use the configured gateway, select **Yahoo Finance**, enter the personal access code for that deployment and choose **Save & test gateway**. Keep the access code private. The production and preview deployments can use different codes.

The Yahoo adapter does not need a Yahoo provider API key. It is unofficial: availability, instrument coverage and request access are not unlimited or guaranteed. No synthetic candles replace a failed screening request.

## 2. Choose the instruments

Open **Stock Screener**. The initial market is **Bursa Malaysia** and the initial universe choice is **My ticker list**.

- Paste four-digit Bursa codes such as `1155, 1023, 5347, 5296`. Leading zeros matter. A `.KL` suffix is accepted and normalised.
- For US instruments, select **US stocks & ETFs** and paste tickers such as `AAPL, MSFT, NVDA, BRK-B`.
- For a mixed list, select **Mixed custom list** and use explicit prefixes such as `MY:1155` and `US:AAPL`.
- **Use my watchlist** copies eligible symbols from the watchlist saved in this browser.
- **Import ticker file** accepts `.txt` or `.csv` files smaller than 200 KB. Plain ticker text may use commas or new lines. CSV accepts a `symbol`, `ticker` or `code` column; optional columns are `market`, `name` and `type`. Market values are `MY` or `US`; supported types are `Stock`, `Equity` and `ETF`.

Example CSV:

```csv
symbol,market,name,type
1155,MY,Maybank,Stock
AAPL,US,Apple,Stock
SPY,US,SPDR S&P 500 ETF,ETF
```

The imported list is normalised into ticker selections. Do not rely on imported names or security types being retained as a verified security master. Custom US ticker types are not independently verified; a ticker format alone cannot identify every warrant or special instrument.

### Optional market directories

Choose a single market, then **Load market directory**. This retrieves identifiers first; it does not fetch every instrument's candles.

- **US:** the gateway reads Nasdaq Trader's Nasdaq-listed and other-exchange directory files. It retains eligible stocks and ETFs and filters known test issues and separately modelled securities using available flags and names. OTC instruments are outside this directory scope. See [Nasdaq's field definitions](https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs).
- **Bursa:** directory loading requires `ISAHAM_API_TOKEN` on the server. It uses iSaham's documented search-all response to obtain numeric code/name mappings. Completeness is not independently verified; returned and reported counts can differ. It is not a guarantee of every Bursa security. See [iSaham's API documentation](https://api.isaham.my/docs).

You can scan a pasted or imported Bursa list through Yahoo without the iSaham directory token. Directory responses are cached for up to 24 hours in a warm gateway instance; they are not a permanent database.

Known warrant codes and directory special instruments are excluded. Full warrant screening remains a separate, unfinished data and analysis module.

## 3. Set the checklist and start a small batch

The visible initial settings are research hypotheses:

| Setting | Initial value |
| --- | --- |
| Minimum average daily volume | 50,000 units |
| Minimum approximate daily turnover, Bursa | MYR 100,000 |
| Minimum approximate daily turnover, US | USD 1,000,000 |
| Maximum 20-day range | 12% |
| Minimum CMF20 pressure | 0.05 |
| Instruments in one batch | 10 |

Turnover here is the average of daily close × volume in each instrument's quote currency. It is not actual executed turnover. Screener thresholds are separate from the single-stock rating weights.

Choose **Start real daily scan**. Requests run sequentially, with at least 1.5 seconds between requests inside a batch. A batch can contain 1–25 instruments. Choose **Scan next batch** explicitly to continue through the remaining selected instruments. A large directory can therefore take many batches; the app does not automatically sweep it in the background.

**Pause** takes effect after the current request. A provider HTTP 429 stops the batch without an automatic retry. Respect the provider pause before continuing. A failed row remains recorded as failed; continuing moves through the remaining queue rather than silently retrying it.

Changing the selected universe, checklist or gateway requires starting a new scan to apply those settings. Display filters such as **Minimum checklist score** and **Result** help inspect the existing results.

## 4. Understand the evidence

The screener requires at least **60 completed daily candles**, not 60-minute candles. The gateway infers completion from exchange/provider information; completion is not guaranteed by Yahoo. The previous trading day's candle is normal while the current daily session remains unfinished.

Daily candles more than seven calendar days old, future-dated candles, malformed history and unusable volume do not produce a normal candidate result. Shorter histories, missing inputs and provider errors remain visible.

| Check | What it means in this trial |
| --- | --- |
| Quiet price base | The latest 20-candle range and absolute price change stay within the configured limits. |
| Contraction | The recent range or average true-range percentage is smaller than the preceding comparison window. This simple average differs from Wilder's ATR on the analysis page. |
| CMF20 | Volume weights where closes occur within each candle's high–low range. Positive readings favour closes toward the upper part of the range. Zero-range candles contribute neutral close-location pressure. |
| Directional-volume pressure | A normalised 20-candle change in OBV: volume on rising closes contributes positively, falling closes negatively, and unchanged closes neutrally. It is a proxy, not measured buyer/seller order flow. |
| Prior resistance | The highest high of the preceding 20 candles, excluding the current candle. |
| Relative volume | The latest volume compared with the preceding 20-candle average, excluding the latest candle from that average. |
| Liquidity floor | Configured price, average volume and approximate turnover requirements. |

For the underlying indicator concepts, read Fidelity's [Chaikin Money Flow guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/cmf) and [OBV guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/obv). The combined BursaQuant checklist and thresholds have not been backtested or validated.

- **Quiet accumulation candidate:** all required base, contraction, positive-pressure, liquidity and below/near-resistance conditions are met.
- **Breakout candidate:** the close exceeds prior resistance with the required relative volume, positive pressure, liquidity and preceding base conditions.
- **Distribution pressure:** both close-location and directional-volume pressure are sufficiently negative, with the liquidity floor met.
- **No clear setup:** sufficient usable data exists, but the required conditions do not all qualify.
- **Insufficient, stale or failed data:** a normal candidate classification cannot be made.

The score is a weighted checklist summary. It is not a probability of profit, proof of institutional accumulation or a prediction of a price surge. Every transaction has a buyer and a seller. Daily OHLCV cannot establish the identity or intent of the participants. False breakouts, corporate actions, data errors and illiquidity can mislead these checks.

## 5. Review coverage and save your work

Read **Universe**, **Checked**, **Analysed** and **Unavailable** before interpreting the shortlist. A directory containing thousands of symbols and a batch checking ten means ten were checked, not thousands. Open **View checks** for each row's measured values, rules and warnings. Inspect its candle date and fetch time; the time you run the screen is not the time the price was traded.

Choose **Analyse** to open that instrument's daily chart and request its individual analysis. The screener is a research shortlist, not an order or an executable-price quote.

Completed batch results and the selected directory are saved locally in this browser where storage is available. Choose **Export results** to download a JSON record containing the selected universe, checklist context, coverage counts, timestamps and row evidence. Keep personal exports outside the public GitHub repository. Browser storage can fill up or be cleared; another browser or device does not automatically share these results.

Keep the page open while a batch runs. There is no cloud background scanner, automatic daily refresh, scheduled alert service or cross-device synchronisation in this version. Saved results retain their original timestamps until you explicitly run a new scan. If the page is closed during a batch, work since the last saved batch may be lost.
