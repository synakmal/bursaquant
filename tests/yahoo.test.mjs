import test from 'node:test';
import assert from 'node:assert/strict';

let instance=0;
const fixedNow=Date.parse('2026-10-27T10:00:00Z');
const fixture=(symbol='AAPL')=>({chart:{result:[{meta:{symbol,exchangeTimezoneName:symbol.endsWith('.KL')?'Asia/Kuala_Lumpur':'America/New_York',currency:symbol.endsWith('.KL')?'MYR':'USD',regularMarketTime:fixedNow/1000},timestamp:Array.from({length:70},(_,i)=>Date.parse('2026-07-01T13:30:00Z')/1000+i*86400),indicators:{quote:[{open:Array(70).fill(10),high:Array(70).fill(12),low:Array(70).fill(9),close:Array(70).fill(11),volume:Array(70).fill(100)}]}}],error:null}});
async function setup(t){
 const originalFetch=globalThis.fetch,originalNow=Date.now,oldEnabled=process.env.BQ_DATA_PROVIDER,oldFlag=process.env.BQ_ENABLE_YAHOO;
 process.env.BQ_DATA_PROVIDER='yahoo';delete process.env.BQ_ENABLE_YAHOO;Date.now=()=>fixedNow;
 t.after(()=>{globalThis.fetch=originalFetch;Date.now=originalNow;if(oldEnabled===undefined)delete process.env.BQ_DATA_PROVIDER;else process.env.BQ_DATA_PROVIDER=oldEnabled;if(oldFlag===undefined)delete process.env.BQ_ENABLE_YAHOO;else process.env.BQ_ENABLE_YAHOO=oldFlag;});
 return import(`../lib/yahoo.js?test=${++instance}`);
}

test('Yahoo adapter normalizes Bursa tickers and reuses matching cached candle history',async t=>{
 const adapter=await setup(t);const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify(fixture('1155.KL')),{status:200});};
 const first=await adapter.yahooMarket('1155','MY','1day',60),second=await adapter.yahooMarket('1155.KL','MY','1day',60);
 assert.equal(calls.length,1);assert.match(calls[0].url,/chart\/1155.KL/);assert.match(calls[0].url,/includePrePost=false/);
 assert.equal(first.bars.length,60);assert.equal(first.meta.cached,false);assert.equal(second.meta.cached,true);assert.equal(first.meta.fetchedAt,second.meta.fetchedAt);assert.equal(second.meta.provider,'yahoo');
});

test('simultaneous identical Yahoo requests share one in-flight fetch',async t=>{
 const adapter=await setup(t);let calls=0,release;
 globalThis.fetch=()=>{calls++;return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify(fixture()),{status:200}));});};
 const first=adapter.yahooMarket('AAPL','US','1day',60),second=adapter.yahooMarket('AAPL','US','1day',60);
 assert.equal(calls,1);release();const results=await Promise.all([first,second]);assert.equal(results[0].bars.length,60);assert.equal(results[1].bars.length,60);
});

test('HTTP429 pauses new requests without retry and still allows unexpired cached history',async t=>{
 const adapter=await setup(t);let calls=0;
 globalThis.fetch=async()=>{calls++;return calls===1?new Response(JSON.stringify(fixture()),{status:200}):new Response('',{status:429,headers:{'Retry-After':'1800'}});};
 await adapter.yahooMarket('AAPL','US','1day',60);
 await assert.rejects(adapter.yahooMarket('MSFT','US','1day',60),e=>e.code==='YAHOO_RATE_LIMITED'&&e.upstreamStatus===429);
 await assert.rejects(adapter.yahooMarket('NVDA','US','1day',60),e=>e.code==='YAHOO_RATE_LIMITED');
 assert.equal(calls,2);assert.equal((await adapter.yahooMarket('AAPL','US','1day',60)).meta.cached,true);assert.equal(calls,2);
});

test('search caches provider results while applying US/Bursa market filters independently',async t=>{
 const adapter=await setup(t);let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({quotes:[{symbol:'AAPL',longname:'Apple',quoteType:'EQUITY',exchange:'NMS'},{symbol:'1155.KL',shortname:'Maybank',quoteType:'EQUITY',exchange:'KLS'},{symbol:'VOD.L',quoteType:'EQUITY',exchange:'LSE'},{symbol:'AAPL2601C',quoteType:'OPTION',exchange:'OPR'}]}),{status:200});};
 const us=await adapter.searchYahoo('bank','US'),my=await adapter.searchYahoo('bank','MY'),all=await adapter.searchYahoo('bank','ALL');
 assert.deepEqual(us.results.map(x=>x.symbol),['AAPL']);assert.deepEqual(my.results.map(x=>x.symbol),['1155.KL']);assert.equal(my.results[0].currency,'MYR');assert.equal(all.results.length,2);assert.equal(calls,1);
});

test('Yahoo is opt-in and invalid symbols/timeframes fail before any upstream request',async t=>{
 const adapter=await setup(t);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected request');};
 delete process.env.BQ_DATA_PROVIDER;
 await assert.rejects(adapter.yahooMarket('AAPL','US','1day',60),e=>e.code==='YAHOO_NOT_ENABLED');
 process.env.BQ_DATA_PROVIDER='yahoo';
 await assert.rejects(adapter.yahooMarket('AAPL','US','99h',60),e=>e.code==='UNSUPPORTED_TIMEFRAME');
 assert.throws(()=>adapter.yahooSymbol('../AAPL','US'),e=>e.code==='INVALID_SYMBOL');assert.throws(()=>adapter.yahooSymbol('1155.KL','US'),e=>e.code==='INVALID_MARKET');assert.equal(calls,0);
});
