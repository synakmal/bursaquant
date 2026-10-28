import { cors, json, fail, authorize, parseExchangeLocalToEpoch, cleanSymbol, positiveInt } from '../lib/market-shared.js';
import {yahooMarket} from '../lib/yahoo.js';

async function twelveData(symbol, interval, limit) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw Object.assign(new Error('TWELVE_DATA_API_KEY is not configured on the gateway.'), { code: 'US_PROVIDER_NOT_CONFIGURED' });
  const allowed = new Set(['1h', '4h', '1day', '1week']);
  if (!allowed.has(interval)) throw Object.assign(new Error('Unsupported US timeframe.'), { code: 'UNSUPPORTED_TIMEFRAME' });
  const u = new URL('https://api.twelvedata.com/time_series');
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('interval', interval);
  u.searchParams.set('outputsize', String(Math.min(limit, 5000)));
  u.searchParams.set('apikey', key);
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.status === 'error' || !Array.isArray(body.values)) {
    throw Object.assign(new Error(body.message || `Twelve Data HTTP ${r.status}`), { code: body.code || 'TWELVE_DATA_ERROR', upstreamStatus: r.status });
  }
  const tz = body.meta?.exchange_timezone || 'America/New_York';
  const bars = body.values.map(v => ({
    time: parseExchangeLocalToEpoch(v.datetime, tz),
    open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume || 0)
  })).filter(v => Number.isFinite(v.time) && [v.open,v.high,v.low,v.close].every(Number.isFinite));
  return {
    bars,
    meta: {
      provider: 'twelvedata',
      symbol: body.meta?.symbol || symbol,
      exchange: body.meta?.exchange || '',
      currency: body.meta?.currency || 'USD',
      timezone: tz,
      interval,
      lastCandle: body.values?.[0]?.datetime || ''
    }
  };
}

async function isaham(symbol, interval, limit) {
  const key = process.env.ISAHAM_API_TOKEN;
  if (!key) throw Object.assign(new Error('ISAHAM_API_TOKEN is not configured on the gateway.'), { code: 'BURSA_PROVIDER_NOT_CONFIGURED' });
  const resolution = ({ '1day': 'D', '1week': 'W' })[interval];
  if (!resolution) throw Object.assign(new Error('The iSaham chart endpoint requires Basic+ access and documents D/W/M bars, not intraday history. Use daily/weekly history with a suitable entitlement or import your own intraday CSV.'), { code: 'BURSA_INTRADAY_NOT_AVAILABLE' });
  const u = new URL('https://api.isaham.my/v1/stocks/chart');
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('resolution', resolution);
  u.searchParams.set('countback', String(Math.min(limit, 500)));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.status === 'error' || !Array.isArray(body.data?.bars)) {
    throw Object.assign(new Error(body.error?.message || `iSaham HTTP ${r.status}`), { code: body.error?.code || 'ISAHAM_ERROR', upstreamStatus: r.status });
  }
  const bars = body.data.bars.map(v => ({
    time: Number(v.timestamp), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume || 0)
  })).filter(v => Number.isFinite(v.time) && [v.open,v.high,v.low,v.close].every(Number.isFinite));
  return {
    bars,
    meta: {
      provider: 'isaham',
      symbol: body.data?.symbol || symbol,
      exchange: 'BURSA MALAYSIA',
      currency: 'MYR',
      timezone: 'Asia/Kuala_Lumpur',
      interval,
      resolution,
      lastCandle: bars.length ? new Date(bars[bars.length - 1].time * 1000).toISOString() : '',
      providerTimestamp: body.metadata?.timestamp || ''
    }
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'GET only.');
  const market = String(req.query?.market || '').toUpperCase();
  const symbol = cleanSymbol(req.query?.symbol);
  const interval = String(req.query?.interval || '1day');
  const requestedProvider=String(req.query?.provider||'auto').toLowerCase();
  const provider=requestedProvider==='auto'?(process.env.BQ_DATA_PROVIDER==='yahoo'?'yahoo':market==='US'?'twelvedata':'isaham'):requestedProvider;
  const limit = positiveInt(req.query?.limit, 300, 55, 500);
  if (!['US','MY'].includes(market)) return fail(res, 400, 'INVALID_MARKET', 'market must be US or MY.');
  if (!symbol) return fail(res, 400, 'INVALID_SYMBOL', 'A ticker symbol is required.');
  if(!['yahoo','twelvedata','isaham'].includes(provider))return fail(res,400,'INVALID_PROVIDER','Choose auto, yahoo, twelvedata or isaham.');
  if(!authorize(req,res,{requirePrivate:provider==='yahoo'}))return;
  if((provider==='twelvedata'&&market!=='US')||(provider==='isaham'&&market!=='MY'))return fail(res,400,'PROVIDER_MARKET_MISMATCH','This provider does not serve the selected market in this gateway.');
  try {
    const result = provider==='yahoo'?await yahooMarket(symbol,market,interval,limit):provider==='twelvedata'?await twelveData(symbol, interval, limit):await isaham(symbol, interval, limit);
    if (result.bars.length < 55) return fail(res, 422, 'INSUFFICIENT_BARS', `Provider returned only ${result.bars.length} valid bars; at least 55 are required for the analysis engine.`);
    return json(res, 200, result);
  } catch (e) {
    const status = e.code === 'BURSA_INTRADAY_NOT_AVAILABLE' ? 422 : ([400,404,429,503].includes(e.upstreamStatus)?e.upstreamStatus:502);
    return fail(res, status, e.code || 'MARKET_DATA_ERROR', e.message || 'Market data request failed.');
  }
};
