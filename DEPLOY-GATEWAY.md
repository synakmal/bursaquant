# BursaQuant v0.2 — real-data gateway

The frontend can remain on GitHub Pages. The small Vercel serverless layer keeps provider secrets out of the public site.

## 1. Providers

### US — Twelve Data
Set `TWELVE_DATA_API_KEY` in the Vercel project environment variables.

The current implementation requests US 1H, 4H, 1D and 1W candles from Twelve Data.

### Bursa Malaysia — iSaham API
Set `ISAHAM_API_TOKEN` in the Vercel project environment variables.

The iSaham chart endpoint documents D/W/M history and requires Basic+ entitlement; it is not included in Free as checked on 27 October 2026. This adapter requests daily/weekly candles only. No Bursa intraday history or guaranteed quote freshness is supplied by this integration. See https://api.isaham.my/docs for current access and timestamp semantics.

## 2. Deploy

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. Add the two environment variables above under Project Settings → Environment Variables.
4. Redeploy.
5. Open the deployed Vercel `/api/health` URL. It should return `status: ok` and show which provider integrations are configured (never the secrets).
6. In BursaQuant → Risk & Data Settings, enter the Vercel API base ending in `/api`, for example `https://your-project.vercel.app/api`.
7. Click **Save & test gateway**.

The frontend can still be served from GitHub Pages. It calls the Vercel gateway cross-origin.

## 3. Important

- Do not commit `.env`, API keys, broker credentials or personal financial records.
- The gateway is read-only market-data access. It does not place trades.
- Free-tier quotas and provider terms can change. Verify current provider permissions before public display or redistribution.
- Bursa 1H/4H requires a future provider with suitable intraday rights. Until then, use 1D/1W provider historical candles with suitable entitlement, or import your own trusted intraday CSV. Provider freshness is not guaranteed.
