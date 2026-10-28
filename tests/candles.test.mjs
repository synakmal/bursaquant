import test from 'node:test';
import assert from 'node:assert/strict';
import {INTERVALS,normalizeBars,prepareYahooChart} from '../lib/candles.js';
import {generateDemo} from '../src/engine.js';

const epoch=s=>Date.parse(s)/1000;
const bar=(time,close=12,volume=100)=>({time:typeof time==='number'?time:epoch(time),open:10,high:Math.max(13,close),low:9,close,volume});
function chart(rows,{timezone='America/New_York',symbol='AAPL',end,marketTime}={}){
 return {chart:{result:[{timestamp:rows.map(b=>b.time),meta:{symbol,exchangeTimezoneName:timezone,currency:symbol.endsWith('.KL')?'MYR':'USD',regularMarketTime:typeof marketTime==='number'?marketTime:marketTime?epoch(marketTime):undefined,currentTradingPeriod:{regular:{end:typeof end==='number'?end:end?epoch(end):undefined}}},indicators:{quote:[Object.fromEntries(['open','high','low','close','volume'].map(k=>[k,rows.map(b=>b[k])]))]}}],error:null}};
}
const parse=(rows,interval,now,options={})=>prepareYahooChart(chart(rows,options),{interval,now:Date.parse(now)});

test('normalization rejects invalid OHLC/volume, sorts and deduplicates without inventing candles',()=>{
 const old=bar('2026-10-22T13:30:00Z'),next=bar('2026-10-22T14:30:00Z');
 const result=normalizeBars([next,old,{...old,close:11},{...next,time:next.time+1,volume:-1},{...next,time:next.time+2,high:8},{...next,time:null},{...next,time:next.time+3,close:null}]);
 assert.equal(result.length,2);assert.equal(result[0].time,old.time);assert.equal(result[0].close,11);assert.equal(result[1].time,next.time);
});

test('daily candles exclude active session and accept today only after known regular close',()=>{
 const rows=[bar('2026-10-26T13:30:00Z'),bar('2026-10-27T13:30:00Z')],options={end:'2026-10-27T20:00:00Z',marketTime:'2026-10-27T20:00:00Z'};
 assert.equal(parse(rows,'1day','2026-10-27T18:00:00Z',options).bars.length,1);
 assert.equal(parse(rows,'1day','2026-10-27T20:01:00Z',options).bars.length,2);
 assert.equal(parse(rows,'1day','2026-10-27T20:01:00Z').bars.length,1);
 assert.equal(parse(rows,'1day','2026-10-28T01:00:00Z',{end:'2026-10-26T20:00:00Z'}).bars.length,1);
});

test('Bursa daily completion respects exchange-local date rather than UTC date',()=>{
 const rows=[bar('2026-10-26T01:00:00Z'),bar('2026-10-27T01:00:00Z')],options={timezone:'Asia/Kuala_Lumpur',symbol:'1155.KL',end:'2026-10-27T09:00:00Z',marketTime:'2026-10-27T09:00:00Z'};
 assert.equal(parse(rows,'1day','2026-10-27T08:00:00Z',options).bars.length,1);
 assert.equal(parse(rows,'1day','2026-10-27T09:01:00Z',options).bars.length,2);
 assert.equal(parse(rows,'1day','2026-10-27T17:00:00Z',options).bars.length,2);
});

test('intraday candles use actual period end and preserve valid zero volume',()=>{
 const rows=[bar('2026-10-27T13:30:00Z',12,0),bar('2026-10-27T13:35:00Z'),bar('2026-10-27T13:40:00Z')];
 const result=parse(rows,'5min','2026-10-27T13:39:59Z',{marketTime:'2026-10-27T13:39:59Z'});
 assert.equal(result.bars.length,1);assert.equal(result.bars[0].volume,0);assert.equal(result.meta.completedCandles,true);assert.equal(result.meta.adjustment,'provider-ohlc');
});

test('delayed provider market time prevents wall-clock completion of a still-partial candle',()=>{
 const rows=[bar('2026-10-27T13:30:00Z'),bar('2026-10-27T13:35:00Z'),bar('2026-10-27T13:40:00Z')];
 const result=parse(rows,'5min','2026-10-27T14:00:00Z',{marketTime:'2026-10-27T13:38:00Z'});
 assert.equal(result.bars.length,1);assert.equal(result.meta.marketTimestamp,'2026-10-27T13:38:00.000Z');assert.equal(result.meta.latestCandleStart,'2026-10-27T13:30:00.000Z');
 assert.equal(parse(rows,'5min','2026-10-27T14:00:00Z').bars.length,0);
 const daily=[bar('2026-10-26T13:30:00Z'),bar('2026-10-27T13:30:00Z')];
 assert.equal(parse(daily,'1day','2026-10-27T20:05:00Z',{end:'2026-10-27T20:00:00Z',marketTime:'2026-10-27T19:55:00Z'}).bars.length,1);
 assert.equal(parse(daily,'1day','2026-10-27T21:00:00Z',{end:'2026-10-27T20:00:00Z'}).bars.length,1);
});

test('settled-close inference requires a30-minute grace and a last trade within final15minutes',()=>{
 const rows=[bar('2026-10-26T01:00:00Z'),bar('2026-10-27T01:00:00Z')];
 const options={timezone:'Asia/Kuala_Lumpur',symbol:'1155.KL',end:'2026-10-27T09:00:00Z',marketTime:'2026-10-27T08:58:03Z'};
 const settled=parse(rows,'1day','2026-10-27T09:31:00Z',options);assert.equal(settled.bars.length,2);assert.equal(settled.meta.completionInferred,true);assert.match(settled.meta.completionPolicy,/final 15 minutes/);
 const early=parse(rows,'1day','2026-10-27T09:05:00Z',options);assert.equal(early.bars.length,1);assert.equal(early.meta.completionInferred,false);
 const inactive=parse(rows,'1day','2026-10-27T10:00:00Z',{...options,marketTime:'2026-10-27T08:30:00Z'});assert.equal(inactive.bars.length,1);assert.equal(inactive.meta.completionInferred,false);
 const lastFive=[bar('2026-10-27T08:55:00Z')];
 assert.equal(parse(lastFive,'5min','2026-10-27T09:05:00Z',options).bars.length,0);assert.equal(parse(lastFive,'5min','2026-10-27T09:31:00Z',options).bars.length,1);
});

test('US four-hour buckets are anchored at exchange open and never combine days',()=>{
 const rows=[...Array.from({length:7},(_,i)=>bar(epoch('2026-10-26T13:30:00Z')+i*3600,11+i)),...Array.from({length:4},(_,i)=>bar(epoch('2026-10-27T13:30:00Z')+i*3600,11+i))];
 const result=parse(rows,'4h','2026-10-27T18:00:00Z',{marketTime:'2026-10-27T18:00:00Z'});
 assert.equal(result.bars.length,3);assert.equal(result.bars[0].time,epoch('2026-10-26T13:30:00Z'));assert.equal(result.bars[0].volume,400);assert.equal(result.bars[0].close,14);assert.equal(result.bars[1].time,epoch('2026-10-26T17:30:00Z'));assert.equal(result.bars[1].volume,300);
});

test('Bursa four-hour construction separates lunch and omits missing constituent groups',()=>{
 const rows=['01:00','02:00','03:00','04:00','06:30','07:30','08:30'].map(t=>bar(`2026-10-27T${t}:00Z`));
 const options={timezone:'Asia/Kuala_Lumpur',symbol:'1155.KL',marketTime:'2026-10-27T10:00:00Z'};
 const result=parse(rows,'4h','2026-10-27T10:00:00Z',options);assert.equal(result.bars.length,2);assert.equal(result.bars[0].volume,400);assert.equal(result.bars[1].volume,300);
 const missing=parse(rows.filter((_,i)=>i!==2),'4h','2026-10-27T10:00:00Z',options);assert.equal(missing.bars.length,1);assert.equal(missing.meta.missingAggregationGroups,1);
 const active=parse(rows,'4h','2026-10-27T08:00:00Z',options);assert.equal(active.bars.length,1);
});

test('Bursa four-hour construction accepts30-minute source candles on its afternoon session boundary',()=>{
 const rows=['01:00','01:30','02:00','02:30','03:00','03:30','04:00','06:00','06:30','07:00','07:30','08:00','08:30'].map(t=>bar(`2026-10-27T${t}:00Z`));
 const payload=chart(rows,{timezone:'Asia/Kuala_Lumpur',symbol:'1155.KL',marketTime:'2026-10-27T09:00:00Z'});
 const result=prepareYahooChart(payload,{interval:'4h',sourceInterval:'30min',now:Date.parse('2026-10-27T10:00:00Z')});
 assert.equal(result.bars.length,2);assert.equal(result.bars[0].volume,700);assert.equal(result.bars[1].volume,500);assert.equal(result.bars[1].time,epoch('2026-10-27T06:30:00Z'));assert.equal(result.meta.sourceInterval,'30min');assert.equal(result.meta.missingAggregationGroups,0);
});

test('US session alignment changes with daylight saving without changing wall-clock anchors',()=>{
 const winter=Array.from({length:4},(_,i)=>bar(epoch('2026-01-05T14:30:00Z')+i*3600));
 const summer=Array.from({length:4},(_,i)=>bar(epoch('2026-07-06T13:30:00Z')+i*3600));
 assert.equal(parse(winter,'4h','2026-01-05T20:00:00Z',{marketTime:'2026-01-05T20:00:00Z'}).bars[0].time,winter[0].time);
 assert.equal(parse(summer,'4h','2026-07-06T19:00:00Z',{marketTime:'2026-07-06T19:00:00Z'}).bars[0].time,summer[0].time);
});

test('current weekly candle waits until Friday known close or the weekend',()=>{
 const rows=[bar('2026-10-19T13:30:00Z'),bar('2026-10-26T13:30:00Z')];
 assert.equal(parse(rows,'1week','2026-10-29T22:00:00Z').bars.length,1);
 assert.equal(parse(rows,'1week','2026-10-30T19:00:00Z',{end:'2026-10-30T20:00:00Z'}).bars.length,1);
 assert.equal(parse(rows,'1week','2026-10-30T21:00:00Z',{end:'2026-10-30T20:00:00Z',marketTime:'2026-10-30T20:00:00Z'}).bars.length,2);
 assert.equal(parse(rows,'1week','2026-10-31T15:00:00Z').bars.length,2);
});

test('month and quarter selection excludes current periods and incomplete three-month groups',()=>{
 const rows=[1,2,3,4,6,7,8,9,10].map(m=>bar(`2026-${String(m).padStart(2,'0')}-01T13:30:00Z`,10+m));
 const month=parse(rows,'1month','2026-10-27T20:00:00Z');assert.equal(month.bars.length,8);
 const quarter=parse(rows,'3month','2026-10-27T20:00:00Z');assert.equal(quarter.bars.length,2);assert.equal(quarter.bars[0].close,13);assert.equal(quarter.bars[1].close,19);assert.equal(quarter.bars[1].volume,300);assert.equal(quarter.meta.missingAggregationGroups,1);
});

test('invalid Yahoo payloads and unsupported intervals produce explicit errors',()=>{
 assert.throws(()=>prepareYahooChart({chart:{error:{description:'No such symbol'}}}),/No such symbol/);
 assert.throws(()=>prepareYahooChart(chart([]),{interval:'2h'}),e=>e.code==='UNSUPPORTED_TIMEFRAME');
 assert.throws(()=>prepareYahooChart(chart([],{timezone:'Invalid/Zone'})),/timezone/);
 assert.equal(Object.keys(INTERVALS).length,9);
});

test('provider granularity mismatch is rejected before analysis and hourly aliases are accepted',()=>{
 const monthly=chart([bar('2026-09-01T13:30:00Z')]);monthly.chart.result[0].meta.dataGranularity='1mo';
 assert.throws(()=>prepareYahooChart(monthly,{interval:'1week',now:Date.parse('2026-10-27T10:00:00Z')}),e=>e.code==='YAHOO_INTERVAL_MISMATCH');
 const hourly=chart([bar('2026-10-26T13:30:00Z')]);hourly.chart.result[0].meta.dataGranularity='60m';
 const valid=prepareYahooChart(hourly,{interval:'1h',now:Date.parse('2026-10-27T10:00:00Z')});assert.equal(valid.meta.sourceGranularityValidated,true);assert.equal(valid.meta.sourceGranularity,'60m');
 const missing=parse([bar('2026-10-26T13:30:00Z')],'1day','2026-10-27T10:00:00Z');assert.equal(missing.meta.sourceGranularityValidated,false);assert.match(missing.meta.notes,/could not be independently validated/);
 assert.equal(INTERVALS['1week'].yahooRange,'5y');
});

test('demo generator supports minute periods and true calendar monthly/quarterly spacing',()=>{
 for(const [interval,seconds] of [['5min',300],['15min',900],['30min',1800]]){const rows=generateDemo('AAPL',interval,3);assert.equal(rows[1].time-rows[0].time,seconds);}
 for(const interval of ['1month','3month']){const rows=generateDemo('AAPL',interval,8);assert.equal(rows.length,8);for(const row of rows){const d=new Date(row.time*1000);assert.equal(d.getUTCDate(),1);if(interval==='3month')assert.equal(d.getUTCMonth()%3,0);}}
});
