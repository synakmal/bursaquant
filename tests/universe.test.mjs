import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNasdaqDirectory,parseIsahamDirectory,getUniverse,clearUniverseCache} from '../lib/universe.js';
import universe from '../api/universe.js';

const nasdaq='Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nAAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\nQQQ|Invesco QQQ Trust|G|N|N|100|Y|N\nAAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\nAACIW|Armada - Warrant|G|N|N|100|N|N\nAACIU|Armada - Units|G|N|N|100|N|N\nTEST|Test issue|G|Y|N|100|N|N\nPREF|Example - Preferred Stock|G|N|N|100|N|N\nFile Creation Time: 1027202621:32|||||||';
const other='ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\nBRK.B|Berkshire Hathaway Class B Common Stock|N|BRK.B|N|100|N|BRK/B\nSPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY\nBAD$A|Example preferred shares|N|BADpA|N|100|N|BAD-A\n';
function response(){return {statusCode:0,headers:{},text:'',setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},end(body=''){this.text=body;return this;},body(){return this.text?JSON.parse(this.text):null;}};}

test('Nasdaq directories preserve stocks/ETF flags, share classes and source time while excluding tests and special instruments',()=>{
 const a=parseNasdaqDirectory(nasdaq),b=parseNasdaqDirectory(other,'other');
 assert.deepEqual(a.instruments.map(x=>x.symbol),['AAPL','QQQ']);assert.equal(a.instruments[1].type,'ETF');assert.equal(a.excludedCount,5);assert.equal(a.sourceAsOf,'1027202621:32');
 assert.deepEqual(b.instruments.map(x=>x.symbol),['BRK-B','SPY']);assert.equal(b.instruments[0].exchange,'NYSE');assert.equal(b.instruments[1].exchange,'NYSE ARCA');
 assert.throws(()=>parseNasdaqDirectory('<html>blocked</html>'),/format changed/);
});

test('Bursa directory uses numeric provider codes rather than appending KL to company mnemonics',()=>{
 const result=parseIsahamDirectory({data:{count:5,results:[{code:'1155',symbol:'MAYBANK',name:'MALAYAN BANKING BHD'},{code:'1155',symbol:'MAYBANK'},{code:'1023',symbol:'CIMB'},{code:'5357CC',symbol:'WARRANT'},{symbol:'MAYBANK'}]},metadata:{timestamp:'2026-10-27T17:00:00+08:00'}});
 assert.deepEqual(result.instruments.map(x=>x.symbol),['1023','1155']);assert.equal(result.excludedCount,3);assert.equal(result.providerCount,5);assert.equal(result.sourceAsOf,'2026-10-27T17:00:00+08:00');
 assert.throws(()=>parseIsahamDirectory({data:{symbols:['MAYBANK']}}),/expected code\/name directory/);
});

test('ETF flags take precedence over names containing bonds or beneficial units; ordinary rights are excluded',()=>{
 const rows='Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nBND|Total Bond Market ETF Units of Beneficial Interest|G|N|N|100|Y|N\nTESTER|Example Corp - Rights|G|N|N|100|N|N';
 const result=parseNasdaqDirectory(rows);assert.deepEqual(result.instruments.map(x=>x.symbol),['BND']);assert.equal(result.instruments[0].type,'ETF');assert.equal(result.excludedCount,1);
});

test('directory fetches only official US listings, deduplicates in-flight calls and reuses the 24-hour cache',async()=>{
 clearUniverseCache();let calls=0;
 const fetcher=async url=>{calls++;assert.match(String(url),/^https:\/\/www\.nasdaqtrader\.com\/dynamic\/symdir\/(?:nasdaqlisted|otherlisted)\.txt$/);return new Response(String(url).includes('nasdaqlisted')?nasdaq:other);};
 const [a,b]=await Promise.all([getUniverse('US',{fetcher}),getUniverse('US',{fetcher})]);
 assert.equal(calls,2);assert.deepEqual(a,b);assert.equal(a.instruments.length,4);assert.equal(a.meta.provider,'nasdaq-trader');assert.equal(a.meta.cached,false);assert.equal(a.meta.complete,true);assert.equal(a.meta.sourceCount,10);
 const c=await getUniverse('US',{fetcher});assert.equal(c.meta.cached,true);assert.equal(calls,2);assert.equal(Date.parse(c.meta.cacheExpiresAt)-Date.parse(c.meta.fetchedAt),86400000);
});

test('unconfigured Bursa directory fails explicitly without making a request; configured search-all keeps the token in a header',async()=>{
 clearUniverseCache();let calls=0;const token='directory-private-test';
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.isaham.my/v1/search');assert.equal(options.headers.Authorization,'Bearer '+token);return Response.json({data:{results:[{code:'1155',symbol:'MAYBANK'}],count:1}});};
 await assert.rejects(getUniverse('MY',{fetcher,token:''}),error=>error.code==='DIRECTORY_NOT_CONFIGURED');assert.equal(calls,0);
 const result=await getUniverse('MY',{fetcher,token});assert.equal(calls,1);assert.equal(result.instruments[0].symbol,'1155');assert.equal(JSON.stringify(result).includes(token),false);assert.match(result.meta.coverage,/not independently verified/);assert.equal(result.meta.complete,false);
});

test('Bursa provider totals larger than received rows disclose an incomplete directory',async()=>{
 clearUniverseCache();const fetcher=async()=>Response.json({data:{results:[{code:'1155',symbol:'MAYBANK'}],count:1000}});
 const result=await getUniverse('MY',{fetcher,token:'partial-test'});assert.equal(result.meta.expectedTotal,1000);assert.equal(result.meta.receivedCount,1);assert.equal(result.meta.truncated,true);assert.equal(result.meta.complete,false);
});

test('upstream rate limits pause further directory requests rather than retrying',async()=>{
 clearUniverseCache();let calls=0;const fetcher=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'3600'}});};
 await assert.rejects(getUniverse('MY',{fetcher,token:'rate-test'}),error=>error.code==='DIRECTORY_RATE_LIMITED');
 await assert.rejects(getUniverse('MY',{fetcher,token:'rate-test'}),error=>error.upstreamStatus===429);assert.equal(calls,1);
});

test('universe API protects directories, handles preflight and rejects invalid markets before fetching',async t=>{
 const before=process.env.BQ_ACCESS_TOKEN;process.env.BQ_ACCESS_TOKEN='api-directory-test';t.after(()=>{if(before===undefined)delete process.env.BQ_ACCESS_TOKEN;else process.env.BQ_ACCESS_TOKEN=before;});
 let res=response();await universe({method:'GET',query:{market:'US'},headers:{}},res);assert.equal(res.statusCode,403);assert.equal(res.body().error.code,'ACCESS_DENIED');
 res=response();await universe({method:'OPTIONS',headers:{}},res);assert.equal(res.statusCode,204);
 res=response();await universe({method:'GET',query:{market:'ALL'},headers:{}},res);assert.equal(res.statusCode,400);
});
