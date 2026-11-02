# BursaQuant release scope

Updated 2 November 2026. GitHub remains the source of truth. This personal tool focuses on Bursa Malaysia and US stocks/ETFs, using the existing delayed Yahoo gateway.

## Focused personal release

- Stock Analysis: completed candles, nine timeframes, transparent ratings and conditional trade planning.
- Deep Research: daily/4H/1H evidence, agreement/conflicts, accumulation checklist and explicit data gaps.
- Stock Screener: selected universes, daily batches, progress and provider-failure disclosure.
- Watchlist and saved research snapshots.
- Trades & Holdings: manual buy lots, partial/full sales, fee-aware results, trading styles and explained conditional holding reviews.
- Strategy & Learning: editable rating rules and indicator explanations.
- Risk & Data Settings: the existing private gateway, risk assumptions and manual FX input.

v0.7.3 removes IPO Research from the interface and browser bundle. Existing browser data is not deleted. Its fixed sidebar now scrolls independently, including on short windows, with keyboard focus and non-shrinking navigation content. v0.7.2 holding guidance and v0.7.1 analysis-to-holding drafts remain available.

## Completion checks

1. Check Bursa and US stock research with dated provider data; missing evidence must remain unavailable.
2. Verify navigation on desktop, short windows and mobile. Every item and data status must be reachable.
3. Verify manual buys, partial/full sales, holding review and holdings backup/import. Broker execution details stay manual.
4. Publish tested code through GitHub; verify Pages and Vercel serve the intended commit.
5. Use the existing tracker with broker-confirmed records, export regular backups and review results after costs.

## Deferred scope

IPO research and warrants are excluded. iSaham remains optional and deferred; do not repeat blocked access checks without changed conditions. AI calls remain disabled until deliberately configured. Automated trading, new paid feeds, cloud synchronisation, continuous monitoring and alerts are outside this release.

Possible later additions should solve an observed problem: a compact review queue for holdings, strategy performance by trading style, or easier backups. Keep any statistics tied to recorded trades and sufficient samples. Strategy profitability is not established by automated software checks.
