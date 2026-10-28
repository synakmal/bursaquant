import { cors, json, fail, authorize, cleanSymbol } from '../lib/market-shared.js';
import {searchYahoo} from '../lib/yahoo.js';

async function searchTwelveData(q) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return [];
  const u = new URL('https://api.twelvedata.com/symbol_search');
  u.searchParams.set('symbol', q);
  u.searchParams.set('outputsize', '20');
  u.searchParams.set('show_plan', 'false');
  u.searchParams.set('apikey', key);
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.status === 'error') throw new Error(body.message || `Twelve Data HTTP ${r.status}`);
  return Array.isArray(body.data) ? body.data.filter(x => /United States/i.test(x.country || '')).map(x => ({
    symbol: x.symbol, name: x.instrument_name, market: 'US', exchange: x.exchange, currency: x.currency, type: x.instrument_type
  })) : [];
}

async function searchIsaham(q) {
  const key = process.env.ISAHAM_API_TOKEN;
  if (!key) return [];
  const u = new URL('https://api.isaham.my/v1/search');
  u.searchParams.set('q', q);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.status === 'error') throw new Error(body.error?.message || `iSaham HTTP ${r.status}`);
  return Array.isArray(body.data?.results) ? body.data.results.map(x => ({
    symbol: x.symbol || cleanSymbol(x.code), name: x.name || x.symbol, market: 'MY', exchange: 'BURSA', currency: 'MYR', type: 'Stock'
  })) : [];
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'GET only.');
  const q = String(req.query?.q || '').trim().slice(0, 80);
  const market = String(req.query?.market || 'ALL').toUpperCase();
  const requestedProvider=String(req.query?.provider||'auto').toLowerCase();
  const provider=requestedProvider==='auto'?(process.env.BQ_DATA_PROVIDER==='yahoo'?'yahoo':'auto'):requestedProvider;
  if (q.length < 2) return fail(res, 400, 'INVALID_QUERY', 'Search requires at least two characters.');
  if(!['US','MY','ALL'].includes(market))return fail(res,400,'INVALID_MARKET','Choose US, MY or ALL.');
  if(!['auto','yahoo','twelvedata','isaham'].includes(provider))return fail(res,400,'INVALID_PROVIDER','Unknown provider.');
  if(!authorize(req,res,{requirePrivate:provider==='yahoo'}))return;
  try {
    if(provider==='yahoo')return json(res,200,{status:'ok',...await searchYahoo(q,market)});
    const results = [];
    if ((provider==='auto'||provider==='twelvedata')&&(market === 'ALL' || market === 'US')) results.push(...await searchTwelveData(q));
    if ((provider==='auto'||provider==='isaham')&&(market === 'ALL' || market === 'MY')) results.push(...await searchIsaham(q));
    const unique = results.filter((x,i,a) => a.findIndex(y => y.market === x.market && y.symbol === x.symbol) === i).slice(0, 20);
    return json(res, 200, { status: 'ok', results: unique });
  } catch (e) {
    return fail(res, [429,503].includes(e.upstreamStatus)?e.upstreamStatus:502, e.code||'SEARCH_ERROR', e.message || 'Search failed.');
  }
};
