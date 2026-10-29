import {createHash} from 'node:crypto';

// Directories contain instrument identifiers only, never price data. A directory
// match is not evidence that the candle provider supports the instrument.
const DAY = 24 * 60 * 60 * 1000;
const MAX_TEXT = 3 * 1024 * 1024;
const sources = {
  nasdaq: 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt',
  other: 'https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt',
  isaham: 'https://api.isaham.my/v1/search'
};
const cache = new Map(), pending = new Map(), cooldowns = new Map();
const problem = (message, code, upstreamStatus=502) => Object.assign(new Error(message), {code,upstreamStatus});
const distinct = rows => [...new Map(rows.map(row=>[row.market+':'+row.symbol,row])).values()].sort((a,b)=>a.symbol.localeCompare(b.symbol,'en'));
const nonEquity = /\b(?:warrants?|preferred|preference|debentures?|notes?|bonds?)\b|\b(?:subscription|contingent value) rights?\b|\brights?(?:,|$|\s+(?:each|to receive|to acquire))|\bunits?(?:,|$|\s+(?:each|consisting|of beneficial))/i;

export function parseNasdaqDirectory(text, kind='nasdaq') {
  if (!['nasdaq','other'].includes(kind)) throw problem('Unknown Nasdaq directory format.','DIRECTORY_INVALID_DATA');
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  const header=(lines.shift()||'').split('|');
  const symbolField=kind==='nasdaq'?'Symbol':'ACT Symbol';
  for(const field of [symbolField,'Security Name','Test Issue','ETF',...(kind==='other'?['Exchange']:[])]) if(!header.includes(field)) throw problem('The US directory format changed; no directory was loaded.','DIRECTORY_INVALID_DATA');
  const instruments=[];let excludedCount=0,sourceAsOf=null;
  for(const line of lines) {
    if(line.startsWith('File Creation Time:')) {sourceAsOf=line.split('|')[0].replace('File Creation Time:','').trim();continue;}
    const fields=line.split('|');
    if(fields.length!==header.length){excludedCount++;continue;}
    const row=Object.fromEntries(header.map((key,i)=>[key,fields[i].trim()]));
    const raw=row[symbolField],name=row['Security Name'];
    if(row['Test Issue']!=='N'||!name||!['Y','N'].includes(row.ETF)||! /^[A-Z0-9]+(?:[.-][A-Z0-9]+)?$/.test(raw)||(row.ETF!=='Y'&&nonEquity.test(name))) {excludedCount++;continue;}
    const exchange=kind==='nasdaq'?'NASDAQ':({N:'NYSE',A:'NYSE AMERICAN',P:'NYSE ARCA',Z:'CBOE BZX',V:'IEX'}[row.Exchange]||row.Exchange||'US EXCHANGE');
    // Yahoo uses a hyphen for US share-class separators (e.g. BRK-B).
    instruments.push({symbol:raw.replace(/\./g,'-'),name,market:'US',currency:'USD',exchange,type:row.ETF==='Y'?'ETF':'Stock'});
  }
  const unique=distinct(instruments);
  if(!unique.length)throw problem('The US directory contained no eligible instruments.','DIRECTORY_INVALID_DATA');
  return {instruments:unique,excludedCount:excludedCount+instruments.length-unique.length,sourceAsOf,sourceCount:excludedCount+instruments.length};
}

export function parseIsahamDirectory(body) {
  const rows=body?.data?.results;
  if(!Array.isArray(rows))throw problem('iSaham did not return the expected code/name directory.','DIRECTORY_INVALID_DATA');
  const instruments=[];let excludedCount=0;
  for(const row of rows) {
    if(!row||typeof row!=='object'){excludedCount++;continue;}
    const raw=String(row.code??row.symbol??'').trim().toUpperCase().replace(/\.KL$/,'');
    const name=String(row.name||row.symbol||raw).trim(),type=String(row.stock_type||row.type||'');
    if(!/^\d{4}$/.test(raw)||!name||/warrant|right|bond|note|index|derivative/i.test(type)||nonEquity.test(name)) {excludedCount++;continue;}
    instruments.push({symbol:raw,name,market:'MY',currency:'MYR',exchange:'BURSA',type:/\bETF\b/i.test(type+' '+name)?'ETF':'Stock'});
  }
  const unique=distinct(instruments);
  if(!unique.length)throw problem('iSaham returned no eligible four-digit Bursa codes. Import a ticker list instead.','DIRECTORY_INVALID_DATA');
  return {instruments:unique,excludedCount:excludedCount+instruments.length-unique.length,sourceAsOf:body.metadata?.timestamp||null,providerCount:Number.isFinite(Number(body.data.count))?Number(body.data.count):rows.length,receivedCount:rows.length};
}

async function requestText(fetcher,url,headers,market) {
  let response;
  try {response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});}
  catch {throw problem('The instrument-directory provider could not be reached. Import a ticker list or try later.','DIRECTORY_UNAVAILABLE');}
  if(response.status===429) {
    const raw=response.headers.get('retry-after'),seconds=Number(raw);
    const retry=raw&&Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(raw||'')-Date.now());
    cooldowns.set(market,Date.now()+Math.max(15*60000,Number.isFinite(retry)?retry:0));
    throw problem('The directory provider requested a pause. No retry was attempted. Use a ticker list or try later.','DIRECTORY_RATE_LIMITED',429);
  }
  if(!response.ok)throw problem('The directory provider returned HTTP '+response.status+'. No directory was loaded.','DIRECTORY_HTTP_ERROR',response.status===401||response.status===403?503:502);
  if(Number(response.headers.get('content-length'))>MAX_TEXT)throw problem('The directory response exceeded the size limit.','DIRECTORY_INVALID_DATA');
  const text=await response.text();
  if(text.length>MAX_TEXT)throw problem('The directory response exceeded the size limit.','DIRECTORY_INVALID_DATA');
  return text;
}

export async function getUniverse(market,{fetcher=globalThis.fetch,token=process.env.ISAHAM_API_TOKEN||''}={}) {
  if(!['US','MY'].includes(market))throw problem('Choose US or MY for the instrument directory.','INVALID_MARKET',400);
  if(market==='MY'&&!token)throw problem('The Bursa directory needs ISAHAM_API_TOKEN on the gateway. You can scan a pasted or imported Bursa ticker list without that directory token.','DIRECTORY_NOT_CONFIGURED',503);
  const key=market+':'+(market==='MY'?createHash('sha256').update(token).digest('hex'):'public');
  const now=Date.now(),hit=cache.get(key);
  if(hit&&hit.expires>now)return {...hit.value,meta:{...hit.value.meta,cached:true}};
  if((cooldowns.get(market)||0)>now)throw problem('The directory provider is paused after a rate limit. Try later or import a ticker list.','DIRECTORY_RATE_LIMITED',429);
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    let parsed,meta;
    if(market==='US') {
      const headers={Accept:'text/plain','User-Agent':'BursaQuant-Personal-Research/0.5'};
      const texts=await Promise.all([requestText(fetcher,sources.nasdaq,headers,market),requestText(fetcher,sources.other,headers,market)]);
      const parts=texts.map((text,i)=>parseNasdaqDirectory(text,i===0?'nasdaq':'other'));
      const all=parts.flatMap(part=>part.instruments),instruments=distinct(all);
      parsed={instruments,excludedCount:parts.reduce((sum,p)=>sum+p.excludedCount,0)+all.length-instruments.length};
      meta={provider:'nasdaq-trader',sourceUrls:[sources.nasdaq,sources.other],asOf:parts.map(part=>part.sourceAsOf).filter(Boolean).join(' / ')||null,sourceCount:parts.reduce((sum,p)=>sum+p.sourceCount,0),complete:true,coverage:'Both source directory files were loaded. Eligible stocks and ETFs from Nasdaq Trader Nasdaq-listed and other-exchange directories. Excludes test issues, warrants, preferreds, units, rights and debt by available flags/name filters; excludes OTC. This describes directory coverage, not a completed market scan. Candle availability is checked separately. Source file times are reported as supplied.'};
    } else {
      const text=await requestText(fetcher,sources.isaham,{Accept:'application/json',Authorization:'Bearer '+token},market);
      let body;try{body=JSON.parse(text);}catch{throw problem('iSaham returned an unreadable directory.','DIRECTORY_INVALID_DATA');}
      if(body?.status==='error')throw problem('iSaham could not supply the directory. Check its token, entitlement and quota.','DIRECTORY_UNAVAILABLE',503);
      parsed=parseIsahamDirectory(body);
      meta={provider:'isaham',sourceUrls:[sources.isaham],asOf:parsed.sourceAsOf,providerCount:parsed.providerCount,expectedTotal:parsed.providerCount,receivedCount:parsed.receivedCount,sourceCount:parsed.receivedCount,complete:false,truncated:parsed.providerCount>parsed.receivedCount,coverage:'Eligible four-digit Bursa codes returned by the configured iSaham search-all directory. Warrants and other separately modelled instruments are excluded. Provider completeness is not independently verified; this is not a claim to include every Bursa security. A reported total larger than the received count means the provider response is incomplete. Candle availability is checked separately.'};
    }
    const fetched=Date.now(),fetchedAt=new Date(fetched).toISOString(),expires=fetched+DAY;
    const value={instruments:parsed.instruments,meta:{...meta,market,total:parsed.instruments.length,excludedCount:parsed.excludedCount,fetchedAt,cacheExpiresAt:new Date(expires).toISOString(),cached:false}};
    cache.set(key,{value,expires});if(cache.size>4)cache.delete(cache.keys().next().value);
    return value;
  })();
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}

export function clearUniverseCache(){cache.clear();pending.clear();cooldowns.clear();}
