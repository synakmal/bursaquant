import {INTERVALS, prepareYahooChart} from './candles.js';

// Trial adapter for the unofficial Yahoo chart/search interfaces. No retries,
// alternate hosts or identity rotation. A 429 starts a local cooldown.
const cache = new Map();
const pending = new Map();
let cooldownUntil = 0;
const HEADERS = {'User-Agent':'BursaQuant-Personal-Research/0.4', Accept:'application/json'};
const error = (message, code, upstreamStatus) => Object.assign(new Error(message), {code,upstreamStatus});
export const yahooEnabled = () => process.env.BQ_DATA_PROVIDER === 'yahoo' || process.env.BQ_ENABLE_YAHOO === '1';

async function cachedRequest(key, url, ttl, transform) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return {...hit.value, meta:{...hit.value.meta, cached:true, cacheExpiresAt:new Date(hit.expires).toISOString()}};
  if (cooldownUntil > now) throw error('Yahoo requested a pause. Please try again after '+new Date(cooldownUntil).toISOString()+'.', 'YAHOO_RATE_LIMITED',429);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    let response;
    try {response = await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(15000)});}
    catch (e) {throw error(e.name==='TimeoutError'?'Yahoo request timed out.':'Yahoo could not be reached. Please try later or use CSV.', 'YAHOO_UNAVAILABLE',502);}
    if (response.status===429) {
      const rawRetry=response.headers.get('retry-after');
      const retry=rawRetry!==null&&/^\d+(?:\.\d+)?$/.test(rawRetry)?Number(rawRetry):Math.max(0,(Date.parse(rawRetry||'')-Date.now())/1000);
      cooldownUntil = Date.now()+Math.max(900,Number.isFinite(retry)?retry:0)*1000;
      throw error('Yahoo rate-limited this server. Requests are paused for at least 15 minutes; cached data may still be available.', 'YAHOO_RATE_LIMITED',429);
    }
    const body = await response.json().catch(()=>null);
    if (!response.ok) throw error(response.status===404?'Yahoo has no data for this symbol.':'Yahoo returned HTTP '+response.status+'. No retry was attempted.', 'YAHOO_HTTP_ERROR',response.status);
    if (!body) throw error('Yahoo returned an unreadable response.','YAHOO_INVALID_DATA',502);
    const value = transform(body);
    const expires = Date.now()+ttl;
    cache.set(key,{value,expires});
    if(cache.size>64)cache.delete(cache.keys().next().value);
    return {...value,meta:{...value.meta,cached:false,cacheExpiresAt:new Date(expires).toISOString()}};
  })();
  pending.set(key,task);
  try {return await task;} finally {pending.delete(key);}
}

export function yahooSymbol(symbol,market) {
  const s=String(symbol||'').trim().toUpperCase();
  if(!/^[A-Z0-9^][A-Z0-9.^=-]{0,31}$/.test(s))throw error('Enter a valid Yahoo ticker.','INVALID_SYMBOL',400);
  if(market==='MY')return s.endsWith('.KL')?s:s+'.KL';
  if(s.endsWith('.KL'))throw error('Select Bursa Malaysia for a .KL ticker.','INVALID_MARKET',400);
  return s;
}

export async function yahooMarket(symbol,market,interval,limit) {
  if(!yahooEnabled())throw error('Yahoo trial is not enabled. Set BQ_DATA_PROVIDER=yahoo on your gateway.','YAHOO_NOT_ENABLED',503);
  const config=INTERVALS[interval];
  if(!config)throw error('This timeframe is not supported.','UNSUPPORTED_TIMEFRAME',400);
  const ticker=yahooSymbol(symbol,market);
  const bursaFourHour=market==='MY'&&interval==='4h';
  const sourceInterval=bursaFourHour?'30min':config.sourceInterval;
  const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker));
  url.searchParams.set('interval',bursaFourHour?'30m':config.yahooInterval);
  if(bursaFourHour){const now=Math.floor(Date.now()/1000);url.searchParams.set('period1',String(now-59*86400));url.searchParams.set('period2',String(now));}
  else if(config.yahooRange==='20y'){const end=new Date(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-20);url.searchParams.set('period1',String(Math.floor(start.getTime()/1000)));url.searchParams.set('period2',String(Math.floor(end.getTime()/1000)));}
  else url.searchParams.set('range',config.yahooRange);
  url.searchParams.set('includePrePost','false');url.searchParams.set('events','splits');
  const ttl=['5min','15min','30min','1h','4h'].includes(interval)?15*60000:4*3600000;
  return cachedRequest('chart:'+ticker+':'+interval+':'+limit,url,ttl,body=>prepareYahooChart(body,{symbol:ticker,interval,limit,sourceInterval}));
}

export async function searchYahoo(q,market='ALL') {
  if(!yahooEnabled())throw error('Yahoo trial is not enabled.','YAHOO_NOT_ENABLED',503);
  const url=new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q',q);url.searchParams.set('quotesCount','20');url.searchParams.set('newsCount','0');
  const result=await cachedRequest('search:'+q.toLowerCase(),url,3600000,body=>({
    results:(Array.isArray(body.quotes)?body.quotes:[]).filter(x=>x.symbol&&['EQUITY','ETF','INDEX'].includes(x.quoteType)).map(x=>({
      symbol:x.symbol,name:x.longname||x.shortname||x.symbol,market:/\.KL$/i.test(x.symbol)?'MY':/^(NMS|NGM|NCM|NYQ|ASE|PCX|BTS|BATS|NASDAQ|NYSE|NYSEARCA)$/i.test(x.exchange||'')?'US':'OTHER',
      exchange:x.exchDisp||x.exchange||'',currency:/\.KL$/i.test(x.symbol)?'MYR':'USD',type:x.quoteType==='ETF'?'ETF':x.quoteType==='INDEX'?'Index':'Stock'
    })),meta:{provider:'yahoo',fetchedAt:new Date().toISOString()}
  }));
  return {...result,results:result.results.filter(x=>market==='ALL'?['US','MY'].includes(x.market):x.market===market)};
}
