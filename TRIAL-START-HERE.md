# BursaQuant latest-data personal trial (v0.4)

The trial fetches Yahoo's latest available historical OHLCV candles and calculates your selected technical rating, support/resistance, conditional entries, targets and risk sizing. No Yahoo API key is needed by this unofficial adapter. Access, coverage and finality are not guaranteed; it does not provide unlimited request rights. Review Yahoo's terms before enabling automated access. Keep the data gateway personal and provider datasets out of public GitHub files.

## Try it on this PC

If the local trial server is already running, open **http://127.0.0.1:8000** in your browser. Otherwise, with Node.js 22 or later available, open PowerShell in this source directory and run:

```powershell
npm start
```

This runs the site and gateway together, bound only to this PC. Keep that terminal running while using the site. Press Ctrl+C to stop it. No package installation is needed for this zero-dependency project.

1. Open the site and wait for AAPL's daily chart to load.
2. If an earlier demo setting was saved, click **Refresh Data**. If prompted, open **Risk & Data Settings**, set Gateway URL to `/api`, select **Yahoo Finance**, leave the access code blank for the default local trial, and **Save & test gateway**.
3. Search **Maybank**, select **1155.KL**, and choose **1D**. You can also enter `1155` directly. Try **CIMB / 1023** or **AAPL** next.
4. Confirm the source is **YAHOO FINANCE**, inspect the candle date and fetched timestamp, and review any provider/completion notes. A daily candle's timestamp marks its start, not when its closing price was last updated.
5. Open **Strategy & Learning**. Choose a preset or edit weights, then **Save & recalculate**. The local explainer shows the evidence for the rating.
6. Set your capital and risk in **Risk & Data Settings**. Return to the analysis for position sizes and conditional entry/stop/TP scenarios. Save an analysis or add the instrument to your watchlist.

The explainer is rules-based; a generative AI service, fundamentals and news are not connected. The screener is still a labelled demonstration universe. Single-stock analysis is the verified trial path.

## Put the trial online while keeping GitHub

1. Add Vercel and sign in with GitHub. Its Hobby plan is intended for personal, non-commercial use.
2. Use the tested trial branch of `synakmal/bursaquant`. Import that repository, or select the review branch when creating a preview. Do not deploy the older main branch before the trial changes are merged.
3. Use Framework Preset **Other**, Build Command **npm run build**, and the repository root as the source. Output Directory can be `.` for this static frontend; the `api/` directory contains Vercel functions.
4. Add environment variables:

   ```text
   BQ_DATA_PROVIDER=yahoo
   BQ_ACCESS_TOKEN=<your long random personal access code>
   ```

   Keep the actual code in Vercel's environment settings. Do not put it into GitHub or a chat. The code restricts requests to your personal gateway; it is not a Yahoo credential or data licence.
5. Deploy/redeploy. Open the deployment, then **Risk & Data Settings**. Use `/api`, choose Yahoo Finance and enter the same personal access code. Click **Save & test gateway**.
6. Repeat the Maybank/AAPL checks above before using the trial regularly. If keeping the frontend on GitHub Pages, instead enter the full Vercel gateway URL ending in `/api` and configure `BQ_ALLOWED_ORIGIN=https://synakmal.github.io` on Vercel.

## What is deliberately conservative

- Five-minute, 15-minute, 30-minute, hourly, daily, weekly and monthly inputs depend on Yahoo's symbol coverage and history. Quarterly bars combine three complete calendar months.
- 4H bars are constructed as session buckets of up to four hours. They can be shorter at lunch/session close. Bursa uses 30-minute source candles so the 14:30 session start is respected; this limits its history and may leave SMA200 unavailable.
- Current incomplete candles are excluded using exchange time and provider timestamps. After 30 minutes past the provider's regular close, a last trade in the final 15 minutes permits an inferred settled close. This is an explicit assumption, not proof of provider finality. Missing early-close/holiday calendars can cause conservative omissions.
- The latest completed daily bar can be the previous session while today's session is open. Weekly/monthly/quarterly charts intentionally exclude unfinished periods.
- Matching warm-server responses are cached for 15 minutes intraday and four hours for higher intervals. The cache is in memory and can reset when a serverless instance restarts. Changing strategy weights recalculates locally without another data request.
- HTTP 429 pauses new Yahoo requests in that instance for at least 15 minutes. There is no automatic retry, alternate host or request-limit bypass. Provider failure is shown as an error; demo candles require an explicit choice.

Sources: [Yahoo data-use notice](https://help.yahoo.com/kb/SLN2352.html), [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).
