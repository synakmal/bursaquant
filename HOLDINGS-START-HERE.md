# Manual trades and holding reviews

Open **Trades & Holdings** on [BursaQuant](https://synakmal.github.io/bursaquant/). This is a personal record and research tool. Your broker remains the source of actual executions and account balances.

## Record a holding

You can start from **Stock Analysis → + Add holding**. The unsaved form carries the ticker, market, stock/ETF type and trading style. Short Swing / Intraday maps to short term, Medium Swing to swing, and Long-Term Research to long term. Buy date, price, quantity, fees and plan levels stay blank for your own entries. Demo analysis opens a paper draft. If you have unsaved holding edits, save or cancel them before starting another draft. Clicking Add holding never saves a purchase by itself.

1. Enter the market, ticker, buy date, entry price, quantity in individual shares/units and entry fees. Each record is one buy lot; record additional buys separately.
2. Mark the record as an actual trade or a paper trade. Their results remain separate.
3. Choose short term, swing or long term. Add your current protective stop, targets and the reason for holding the stock. Unknown plan values can stay blank; the review will identify the gaps.
4. If you know your original stop at entry, record it separately. It stays fixed so later stop changes do not rewrite the original risk. A missing original stop means the initial risk is unknown.
5. Save the holding. Records stay on this browser. Export a holdings backup before changing device/browser or clearing storage.

Use actual filled prices and fees from your broker. The tracker supports long positions and whole shares/units. It does not import executions, reconcile broker balances, combine additional buy lots automatically or place orders.

## Analyse an open holding

Connect the existing data gateway and leave demo mode using **Refresh Data** in Stock Analysis. Then click **Analyse** beside an open holding.

The selected style determines the context:

| Style | Histories reviewed |
| --- | --- |
| Short term | Daily and 1H |
| Swing | Daily and 4H |
| Long term | Daily and weekly |

Fresh completed daily history is required as an anchor. A valid completed **1H or 4H close from a later exchange date** supplies the price reference for short/swing reviews; otherwise the completed daily close takes priority because it includes that completed session. A same-day intraday bar is not necessarily newer than a completed daily bar just because its start timestamp is later. Weekly history adds long-term context and never replaces the daily price reference. The report identifies the reference interval, exact candle date, inferred completion, failures and missing information. An old price from before the recorded buy date cannot assess the new holding. Candle timestamps identify bar starts, not exact last-trade times.

The review can flag a protective stop breached on the reference close, a target reached, weakening/conflicting technical evidence, hold conditions that remain intact, or insufficient evidence. These are conditional reviews of your plan. They do not detect every intraday crossing, confirm broker order execution or establish a current executable price. A stop can fill at a different price, particularly during a gap; see the [SEC stop-order guide](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15).

Changing trading style does not automatically move your stop or extend your target. Long-term technical readings cannot verify the company's business outlook, valuation or your investment thesis; review financial statements and announcements separately. No AI account is required.

## How the suggested response is chosen

The report starts with a conditional suggested response, measured reasons and what would change the view. The existing deterministic rules are applied in this order:

| Priority | Criteria | Suggested response |
| --- | --- | --- |
| Data gate | Invalid holding, missing/stale daily anchor or unsupported reference | No supported recommendation |
| Closed record | No remaining shares | Position closed |
| Protective stop | Reference close at or below your recorded stop | Cut loss / protect profit / review planned exit, depending on estimated remaining P/L |
| Recorded target | Reference close at or above target 1 or 2 | Consider taking profit if estimated P/L is positive; otherwise review planned exit |
| Missing risk plan | No numeric protective stop recorded | Complete the risk plan |
| Missing context | Selected style's second timeframe unavailable | Wait / review — evidence incomplete |
| Weak context | Context timeframe has a bearish moving-average trend | Reassess the holding |
| Aligned technical case | Both selected trends bullish, neither MACD histogram negative | Hold while conditions remain intact |
| Other combinations | Conflicting or mixed technical evidence | Wait / review — evidence mixed |

Bullish trend means `close > SMA20 > SMA50`; bearish means `close < SMA20 < SMA50`. MACD histogram describes the difference between the MACD line and its signal line; a negative reading prevents the technical-hold classification. RSI, ATR, RVOL, SMA200 and estimated support/resistance add context but do not determine that current classification. Your configurable stock-rating weights are a separate checklist. A loss relative to entry alone does not trigger a cut-loss response.

Open **Common scenarios** for the trigger and conditional response for stops, targets, technical strength, estimated support, weakening/conflicting evidence and missing history. **Condition met** refers only to the displayed reference and evidence. Unavailable inputs are **Not evaluated**. Estimated chart support never replaces your entered stop. Time-based exits, trailing formulas and partial-sale percentages are not inferred from the style; record/apply your own rules.

This covers common technical situations, not every possible event. Fundamentals, valuation, company news, announcements, portfolio exposure, cash needs, spread and broker execution are not connected. They remain missing information, not neutral or positive evidence.

## What happens after analysis

The system displays the dated review and uses its reference close for indicative open P/L. You review the reasons, verify current broker prices and company information, and decide what to do. It does not place orders, sell shares, move your stop, record a sale, continuously monitor the position or send alerts. Enter a sale only after you make the actual or paper execution. Refresh the analysis after a changed plan or new information; reviews expire after 30 minutes and when the holding or gateway changes.

## Record sales and review results

Record a sale with its actual date, quantity, price and fees. A partial sale reduces the open quantity; a full sale closes the record. The tracker allocates entry fees proportionally between sold and remaining shares. Realised P/L uses recorded sale proceeds and costs. Open P/L uses the last analysed close, deducts allocated entry fees and excludes future exit costs. No quote means no marked open P/L.

Buy details are locked after a sale is recorded to protect the cost history. Stop, targets, style and notes can still be reviewed. You can correct a manually entered sale or explicitly undo that record; these actions update this tracker only. Monetary totals remain separated by currency and actual/paper status. Dividends, corporate-action adjustments, taxes, FX conversion and any fees you have not entered are excluded. Reconcile your manual records with your broker after splits or other corporate actions. Reviews expire after 30 minutes and are cleared when the record or gateway changes; click Analyse again for a new review.

## Backups and previous records

The holdings workspace has JSON export and validated import. Import preserves existing record IDs rather than silently replacing them. Export before moving between browsers; there is no cloud synchronisation.

Earlier closed-trade journal records remain in their own expandable section below the holdings workspace. They are not silently converted into open positions or included twice in the holdings totals. The general research backup also includes the new holdings book; use the dedicated holdings backup/import for moving this tracker between browsers.

Holding details, entry prices, quantities and notes stay in your browser. Analysing a holding sends the ticker, market and candle interval to your existing gateway; it does not send your trading record to an AI service or broker.
