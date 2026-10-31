# BursaQuant roadmap

Updated 1 November 2026. GitHub remains the source of truth; this personal site serves Bursa Malaysia and US stock research. Warrants are excluded. iSaham is optional and deferred while server access is unresolved.

v0.7.1 adds a Stock Analysis **+ Add holding** shortcut. It carries the instrument and style into an unsaved manual form, preserves existing unsaved edits and requires actual execution details before saving. Demo drafts default to paper. The release passes 234 tests.

v0.7.2 makes holding guidance explicit: suggested response, reasons, changes of view, common scenarios and missing information. It preserves the existing source gates and stop/target/trend priority, distinguishes cutting losses from protecting gains and does not invent exit quantities or unconfigured rules. Broader financial/news/portfolio facts remain unassessed; no order execution or AI activation is added.

## v0.7: a focused manual trading record

- Trades & Holdings records long stock/ETF buy lots, partial/full sales, actual/paper status, trading style and a manually entered risk/target plan.
- Style-based holding review uses daily plus 1H/4H/weekly context, with source/interval/freshness checks and conditional stop/target/hold/risk findings. Stops and targets never move automatically. No broker execution or AI service is connected to these records.
- Costs, remaining quantity and realised/unrealised results are calculated from entered transactions. MYR/USD and actual/paper monetary totals remain separate. Original risk is distinct from a later stop.
- Dedicated holdings backup/import, sale corrections and explicit undo preserve record usefulness. Earlier journal records remain intact in their own section.
- The release passes 229 automated checks for existing behaviour, manual-record accounting, privacy, review evidence and asynchronous state handling.
- Next: use the tracker with broker-confirmed records and review the clarity of the workflow. Further indicators, provider integrations, AI activation and automated IPO features remain deferred.

## v0.6 implementation

- Existing Yahoo delayed/completed history, nine timeframes, editable technical ratings, risk planning, daily screener, local watchlists and journal remain available.
- Daily / 4H / 1H report with provenance, freshness, coverage, conflicts, accumulation hypotheses and conditional scenarios.
- Manual IPO dossiers with prospectus references, audited annual figures, offer structure, valuation, peer eligibility, missing inputs, local save and backup/import.
- Optional private AI Coach for stock technical reports. Disabled until a model, private key and spending controls are deliberately configured. No provider or model chosen, no paid calls made.
- 161 automated tests verify calculations, privacy boundaries and interactions; they do not establish profitability.

## Next: evaluate the research workflow

1. Walk through one Bursa stock and one US stock with the deeper report. Resolve missing data and ensure the chosen timeframe fits the intended holding period.
2. Complete one IPO dossier using its final prospectus and two or more suitable listed peers. Review every source and unit before interpreting comparisons.
3. Keep AI deferred while the core research and manual tracking workflow is evaluated. It remains optional; no paid calls should be enabled without selecting a provider and spending controls.
4. Record paper decisions before outcomes: trigger, invalidation, planned risk, costs and reasons to wait. Review realised results and mistakes; avoid optimising rules only around past winners.

## Research depth after v0.6

- Market and sector benchmarks with date-aligned relative performance.
- Sourced financial statements, valuation history, company announcements and catalysts with reporting dates and links.
- Reliable IPO discovery/calendar and prospectus extraction with page citations and human confirmation of units, periods and offer terms.
- Strategy backtesting with corporate actions, fees, slippage, out-of-sample checks and explicit data gaps.
- Wider verified Bursa stock coverage, keeping directory availability separate from candle availability.
- Reusable entry/exit playbooks and pre-trade decision records linked to journal outcomes.
- Persistent cloud screening, watchlist alerts and optional private cross-device backup after scope, provider limits and costs are agreed.

## Operational priorities

Keep credentials server-side and out of GitHub. Keep unknown inputs unavailable. Publish verified code through GitHub and check both GitHub Pages and Vercel. Preserve browser data and encourage exports. Measure whether analysis improves decisions and net results; no score, AI answer or feature guarantees profit.
