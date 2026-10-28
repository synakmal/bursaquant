import test from 'node:test';
import assert from 'node:assert/strict';
import {screenInstrument,parseScreenSymbols,parseScreenListFile,createScreenRun,screenCoverage,usableDailyBars,scanDailyBatch} from '../src/scan-runner.js';

const NOW=Date.parse('2026-10-28T12:00:00Z');
function dailyData({last=NOW/1000-86400,volume=100000}={}){
  return {bars:Array.from({length:70},(_,i)=>({time:last-(69-i)*86400,open:10,high:11,low:9,close:10.2,volume})),meta:{provider:'yahoo',interval:'1day',completedCandles:true,fetchedAt:new Date(NOW).toISOString()}};
}
const evaluate=()=>({classification:'none',status:'No clear setup',score:20});
const noWait=async()=>{};
const options=(extra={})=>({request:async()=>dailyData(),evaluate,wait:noWait,now:()=>NOW,...extra});

test('custom ticker parsing preserves leading zeros, accepts mixed market prefixes and removes warrants',()=>{
  const parsed=parseScreenSymbols('SYMBOL; MY:0001 1155.KL,US:AAPL;AAPL\n5357CC 1234WA\nAAPL.WS');
  assert.deepEqual(parsed.instruments.map(i=>[i.market,i.symbol]),[['MY','0001'],['MY','1155'],['US','AAPL']]);
  assert.deepEqual(parsed.rejected,['SYMBOL','5357CC','1234WA','AAPL.WS']);
  assert.equal(screenInstrument({symbol:'AAPL',type:'Warrant'}),null);
  assert.equal(screenInstrument({symbol:'SPY',type:'ETF'}).type,'ETF');
  assert.equal(screenInstrument('1155','US'),null);
  assert.equal(screenInstrument('AAPL','MY'),null);
});

test('screen run deduplicates the same security and enforces daily context',()=>{
  const run=createScreenRun(['0001','0001.KL','MY:0001','US:AAPL','AAPL'],{interval:'5min',provider:'yahoo'});
  assert.deepEqual(run.queue.map(i=>i.symbol),['0001','AAPL']);
  assert.equal(run.context.interval,'1day');
  assert.deepEqual(screenCoverage(run),{total:2,checked:0,analysed:0,failed:0,insufficient:0,stale:0,candidates:0,remaining:2});
});

test('unsupported explicit markets and conflicting market identifiers cannot become a different security',()=>{
  for(const input of [{symbol:'0700',market:'HK'},'HK:0700','US:1155.KL',{symbol:'1155.KL',market:'US'},{symbol:'MY:1155',market:'US'}])assert.equal(screenInstrument(input),null);
  const parsed=parseScreenListFile('symbol,market,type\n0700,HK,Stock\nAAPL,US,Stock\nABCDW,US,Warrant\n1155,MY,Stock');
  assert.deepEqual(parsed.instruments.map(x=>x.symbol),['AAPL','1155']);assert.equal(parsed.rejected.length,2);
});

test('empty history and a provider-identified derivative fail instead of becoming stale or eligible',()=>{
  const empty=dailyData();empty.bars=[];assert.throws(()=>usableDailyBars(empty),/No daily candles/);
  const derivative=dailyData();derivative.meta.instrumentType='OPTION';assert.throws(()=>usableDailyBars(derivative),/eligible stock/);
});

test('custom share-class tickers use Yahoo hyphens and deduplicate alternate spellings',()=>{
  const parsed=parseScreenSymbols('BRK.B BRK-B US:BRK.B BF.B BF-B','US');
  assert.deepEqual(parsed.instruments.map(i=>i.symbol),['BRK-B','BF-B']);
  assert.equal(screenInstrument('BRK.B','US').symbol,'BRK-B');
  assert.equal(screenInstrument('AAPL.WS','US'),null);
});

test('CSV ticker lists preserve leading zeros, quoted company names and explicit mixed markets',()=>{
  const csv='\uFEFFsymbol,market,name\r\n0001,MY,"Example, Berhad"\r\nAAPL,US,"Apple ""Research"", Inc."\r\nBRK.B,US,Berkshire Hathaway\r\nBRK-B,US,Duplicate\r\n1155.KL,MY,Maybank';
  const parsed=parseScreenListFile(csv,'all');
  assert.equal(parsed.rejected.length,0);
  assert.deepEqual(parsed.instruments.map(i=>[i.symbol,i.market,i.name]),[
    ['0001','MY','Example, Berhad'],['AAPL','US','Apple "Research", Inc.'],['BRK-B','US','Berkshire Hathaway'],['1155','MY','Maybank']
  ]);
});

test('CSV headers can be reordered and an absent market column uses the selected market',()=>{
  const bursa=parseScreenListFile('name,code\n"Example, Company",0001\nMaybank,1155','MY');
  assert.deepEqual(bursa.instruments.map(i=>[i.market,i.symbol]),[['MY','0001'],['MY','1155']]);
  assert.equal(bursa.instruments[0].name,'Example, Company');
  const us=parseScreenListFile('name,market,ticker\nMicrosoft,us,MSFT\nWarrant,MY,5357CC');
  assert.equal(us.instruments[0].symbol,'MSFT');assert.deepEqual(us.rejected,['5357CC']);
});

test('plain-text ticker files remain usable without a CSV header',()=>{
  const parsed=parseScreenListFile('MY:0001,1155.KL\nUS:AAPL;BRK.B','all');
  assert.deepEqual(parsed.instruments.map(i=>[i.market,i.symbol]),[['MY','0001'],['MY','1155'],['US','AAPL'],['US','BRK-B']]);
});

test('explicit ticker suffixes choose their market while an ordinary ticker respects the market hint',()=>{
  assert.equal(screenInstrument('1155.KL','US').market,'MY');
  assert.equal(screenInstrument('MY:0001','US').market,'MY');
  assert.equal(screenInstrument('US:AAPL','MY').market,'US');
  assert.equal(screenInstrument('AAPL','MY'),null);
  assert.equal(screenInstrument('1155','US'),null);
});

test('only recognised sources with established completed daily candles can be screened',()=>{
  assert.equal(usableDailyBars(dailyData()).length,70);
  for(const changes of [{provider:'simulated'},{provider:'unknown'},{interval:'15min'},{completedCandles:false}]){
    const data=dailyData();Object.assign(data.meta,changes);assert.throws(()=>usableDailyBars(data));
  }
  assert.throws(()=>usableDailyBars({bars:dailyData().bars}));
});

test('malformed and duplicate price history is rejected before it can generate pressure signals',()=>{
  for(const mutate of [
    data=>{data.bars[3].time=data.bars[2].time;},
    data=>{data.bars[3].time=data.bars[4].time+1;},
    data=>{data.bars[3].high=8;},
    data=>{data.bars[3].low=12;},
    data=>{data.bars[3].volume=-1;},
    data=>{data.bars[3].volume=NaN;},
    data=>{data.bars[3].close='10';}
  ]){const data=dailyData();mutate(data);assert.throws(()=>usableDailyBars(data));}
});

test('batches are sequential, capped at 25 and resume without duplicate requests',async()=>{
  const queue=Array.from({length:28},(_,i)=>'S'+String.fromCharCode(65+i));
  // Restrict ticker characters to letters for a stable instrument list.
  queue[26]='TAA';queue[27]='TAB';
  const run=createScreenRun(queue),calls=[],waits=[];let active=0,maxActive=0;
  const request=async item=>{active++;maxActive=Math.max(maxActive,active);calls.push(item.symbol);await Promise.resolve();active--;return dailyData();};
  await scanDailyBatch(run,options({request,batchSize:100,spacingMs:1,wait:async ms=>{waits.push(ms);}}));
  assert.equal(calls.length,25);assert.equal(run.cursor,25);assert.equal(maxActive,1);assert.equal(run.running,false);
  assert.equal(waits.length,24);assert.ok(waits.every(ms=>ms>=1500));assert.match(run.pausedReason,/Batch complete/);
  await scanDailyBatch(run,options({request}));
  assert.equal(calls.length,28);assert.equal(new Set(calls).size,28);assert.equal(run.cursor,28);assert.equal(run.pausedReason,'');
});

test('provider 429 pauses at the failed security without retrying or fetching later symbols',async()=>{
  const run=createScreenRun(['AAPL','MSFT','TSLA']);let calls=0;
  await scanDailyBatch(run,options({request:async()=>{calls++;throw Object.assign(new Error('Pause provider'),{status:429});}}));
  assert.equal(calls,1);assert.equal(run.cursor,1);assert.equal(run.running,false);assert.match(run.pausedReason,/rate limit/i);
  assert.equal(screenCoverage(run).failed,1);assert.equal(screenCoverage(run).remaining,2);
});

test('gateway Yahoo cooldown code also pauses when a transport status is unavailable',async()=>{
  const run=createScreenRun(['AAPL','MSFT']);let calls=0;
  await scanDailyBatch(run,options({request:async()=>{calls++;throw Object.assign(new Error('Pause provider'),{code:'YAHOO_RATE_LIMITED'});}}));
  assert.equal(calls,1);assert.match(run.pausedReason,/rate limit/i);
});

test('a per-security failure does not invent data and does not prevent other securities being analysed',async()=>{
  const run=createScreenRun(['AAPL','MSFT','TSLA']);let evaluations=0;
  await scanDailyBatch(run,options({request:async item=>{if(item.symbol==='MSFT')throw new Error('Not found');return dailyData();},evaluate:()=>{evaluations++;return {classification:'accumulation',score:100};}}));
  assert.equal(evaluations,2);assert.equal(run.results[1].evaluation,undefined);assert.match(run.results[1].error,/Not found/);
  assert.deepEqual(screenCoverage(run),{total:3,checked:3,analysed:2,failed:1,insufficient:0,stale:0,candidates:2,remaining:0});
});

test('stale and future candles are never evaluated and have separate coverage',async()=>{
  const run=createScreenRun(['AAPL','MSFT','TSLA']);let evaluations=0;
  await scanDailyBatch(run,options({request:async item=>dailyData({last:item.symbol==='AAPL'?NOW/1000-9*86400:item.symbol==='MSFT'?NOW/1000+86400:NOW/1000-86400}),evaluate:()=>{evaluations++;return evaluate();}}));
  assert.equal(evaluations,1);assert.equal(run.results[0].stale,true);assert.equal(run.results[1].stale,true);
  assert.equal(run.results[0].evaluation,null);assert.equal(screenCoverage(run).stale,2);assert.equal(screenCoverage(run).analysed,1);
});

test('unusable indicator coverage is counted separately from failures and stale records',async()=>{
  const run=createScreenRun(['AAPL']);
  await scanDailyBatch(run,options({evaluate:()=>({classification:'insufficient',score:null})}));
  assert.equal(screenCoverage(run).insufficient,1);assert.equal(screenCoverage(run).analysed,0);assert.equal(screenCoverage(run).failed,0);
});

test('cancellation keeps completed records and resume starts with the next security',async()=>{
  const run=createScreenRun(['AAPL','MSFT','TSLA']),calls=[];let stop=false;
  await scanDailyBatch(run,options({request:async item=>{calls.push(item.symbol);return dailyData();},shouldStop:()=>stop,onUpdate:state=>{if(state.results.length===1)stop=true;}}));
  assert.deepEqual(calls,['AAPL']);assert.equal(run.cursor,1);assert.match(run.pausedReason,/Paused by you/);assert.equal(run.running,false);
  stop=false;
  await scanDailyBatch(run,options({request:async item=>{calls.push(item.symbol);return dailyData();}}));
  assert.deepEqual(calls,['AAPL','MSFT','TSLA']);assert.equal(run.results.length,3);
});

test('a second batch call cannot overlap a running request',async()=>{
  const run=createScreenRun(['AAPL']);let release,calls=0;
  const pending=scanDailyBatch(run,options({request:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return dailyData();}}));
  await scanDailyBatch(run,options({request:async()=>{calls++;return dailyData();}}));
  assert.equal(calls,1);release();await pending;assert.equal(run.running,false);assert.equal(run.results.length,1);
});
