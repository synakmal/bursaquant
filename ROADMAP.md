# BursaQuant personal trading aide roadmap

Updated: 28 October 2026. This is a development plan, not a list of features already released or a validated trading strategy.

## Current development update

The owner confirmed Bursa Malaysia and US stock coverage. Vercel project `bursaquant` was verified connected to `synakmal/bursaquant` using the repository-URL project filter on 28 October 2026. The v0.5 source now implements the real daily screener and a separate accumulation/distribution research checklist; see [SCREENER-START-HERE.md](SCREENER-START-HERE.md). These source changes remain subject to review/deployment. The live production release must be identified by its footer.

The real-data screen takes priority over AI integration. It supports custom/watchlist lists and a verified-live Nasdaq US directory; a Bursa provider directory needs an iSaham token, and its completeness remains unverified. Explicit batches and coverage reporting are implemented. A persistent cloud screening database, automatic full-market refresh, complete entry/exit playbooks and strategy backtests remain future work.

## Purpose

Help the owner follow an explicit, testable trading playbook: understand the evidence, identify missing conditions, plan risk, record decisions and learn from outcomes. The current indicator score is a rules-based summary; it is not a probability of profit. Profitability has not been established.

GitHub remains the source of truth. The public frontend is https://synakmal.github.io/bursaquant/ and the production data gateway is https://bursaquant-syn-db04.vercel.app/api . Personal access codes, account amounts, trading journals and provider data must stay outside the public repository.

## What works today: v0.4

- On-demand Yahoo company search and single-stock historical candle analysis for supported Bursa and US symbols.
- Nine timeframe choices, subject to provider history and completed-candle availability.
- Transparent indicator scores, editable factor weights, indicator explanations and conditional pullback/breakout scenarios.
- Configurable position sizing, local watchlists, research snapshots, journal and research-brief export.
- Published GitHub Pages frontend and production Vercel gateway; the release passed 54 automated tests.

The screener still uses a demonstration universe. Indicator periods are fixed. The local explainer has no generative AI model. There is no strategy backtest, automatic alert service or cloud journal backup.

## Step 1: finish automatic publishing

1. Open https://vercel.com/syn-db04/bursaquant/settings/git .
2. Connect the existing project to GitHub repository `synakmal/bursaquant`.
3. If GitHub asks for installation access, select only that repository.
4. Keep `main` as the production branch. The repository root contains the application; no nested root directory is needed.
5. Verify that a subsequent reviewed change produces a deployment for the correct commit and that the GitHub Pages site can still fetch authorised Yahoo data.

Done when both the frontend and gateway have a verified automatic publishing path. GitHub Pages already publishes main; the Vercel GitHub integration is the remaining connection. The current manually deployed gateway remains usable while this is completed.

## Step 2: define the first personal playbook

Confirm these preferences before choosing defaults:

- Priority market: Bursa, US or both.
- Intended holding period and how often the owner can review positions.
- Existing entry/exit rules, or whether a first candidate needs to be designed.
- Later, privately: intended reference capital, acceptable planned loss per position, total open risk, allocation and actual broker costs.

Choose one candidate setup for the first test. Write down eligible instruments, context timeframe, setup timeframe, entry confirmation, invalidation, exits and reasons to stand aside. Keep an indicator preference separate from an obligatory entry rule. Numerical settings are hypotheses to evaluate, not proven recommendations.

Done when one setup can be described unambiguously enough for two independent evaluations to reach the same result using the same data.

## Step 3: v0.5 — make the playbook visible in every analysis

Planned work:

- Save named playbooks with a version and separate entry, exit and risk rules.
- Show required conditions as met, unmet or unavailable, with their measurements and explanations. An unavailable mandatory condition prevents a setup from being marked ready.
- Show context and setup timeframes together, each with its own source and latest completed-candle timestamp. A high indicator score cannot override a failed mandatory rule.
- Add a decision summary: setup status, confirmation still needed, invalidation, conditional entry, stop, target, cost assumptions and risk-based position size where calculable.
- Save the exact playbook version, data timestamps, measurements and assumptions with each research/journal entry.
- Explain what each selected indicator measures, how it affects this playbook and where it can mislead.

Done when a saved analysis can explain every condition and reproduce its decision from its saved inputs. Delayed historical candles must remain clearly identified; they do not establish an executable current price.

## Step 4: v0.6 — test the rules and track outcomes

Planned work:

- Backtest the same explicit rules used in analysis, using only information available at each historical decision time.
- Declare execution assumptions, fees, spreads, slippage, gaps and any same-candle stop/target ambiguity.
- Handle corporate actions and data gaps explicitly. Label short histories, small samples and any selection/survivorship limitations.
- Separate rule development from evaluation on unseen periods; compare with an appropriate benchmark and different market conditions.
- Report number of trades, expectancy, average win/loss, costs, maximum drawdown, exposure and losing streaks, alongside returns.
- Record paper-trade decisions prospectively, including skipped setups and deviations from the playbook. Keep paper results distinct from backtests and actual trades.

Done when results are reproducible, assumptions and limitations are visible, and the owner can assess performance on data not used to tune the rules. Historical results do not establish future profitability.

## Step 5: v0.7 — add an AI research coach

Planned work:

- Use the selected playbook, verified measurements, data timestamps and saved journal context to answer questions.
- Explain why a setup qualifies, conflicts between timeframes, what remains unconfirmed and how a rule change would affect the analysis.
- Keep arithmetic and rule evaluation in the tested calculation engine. Tie AI claims to supplied evidence and identify unavailable facts.
- Clearly distinguish measured facts, rule outcomes and interpretation. Add sourced fundamentals/news only when those data feeds actually exist.
- Choose an AI provider after reviewing its current costs and privacy terms. Make external data sharing explicit, keep keys server-side and enforce a spending limit.

Done when answers agree with the engine, disclose missing evidence and remain within the configured usage budget.

## Step 6: make it useful every day

Planned work:

- A watchlist review that analyses selected real symbols within provider limits, replacing the demonstration screener for that workflow.
- A daily shortlist of setups and a clear list of what changed since the previous review.
- A review routine for open plans, aggregate exposure and journal results.
- Export/restore for personal records; optional authenticated cloud sync later.
- Optional alerts after persistent storage, scheduling, deduplication and provider access have been designed and tested. On-demand cached requests do not by themselves provide a continuous monitoring service.

Done when the owner can perform a repeatable research and review routine and restore personal records from a backup.

## Release approach

Keep changes in small reviewed GitHub pull requests. Run checks appropriate to each change, then verify the complete stock-analysis flow before a release. Preserve private credentials and personal records outside GitHub. Keep the current functional release available while developing and testing each next milestone.

## References

- Vercel GitHub connection and deployment behaviour: https://vercel.com/docs/git/vercel-for-github
- CFA Institute, backtesting and simulation, including rolling evaluation and look-ahead/survivorship bias: https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation
