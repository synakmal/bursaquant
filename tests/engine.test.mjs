import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,generateDemo,parseCSV,sizePosition,DEFAULT_SETTINGS,smaSeries,emaSeries,rsiSeries,exchangeEpoch} from '../src/engine.js';

test('demo candles have valid OHLC boundaries',()=>{
 const rows=generateDemo('1155','4h');assert.equal(rows.length,230);
 for(const v of rows){assert.ok(v.high>=Math.max(v.open,v.close));assert.ok(v.low<=Math.min(v.open,v.close));assert.ok(v.volume>=0)}
});
test('indicators meet simple reference conditions',()=>{
 const values=Array.from({length:30},(_,i)=>i+1);
 assert.equal(smaSeries(values,5).at(-1),28);
 assert.ok(emaSeries(values,5).at(-1)>27);
 assert.equal(rsiSeries(values,14).at(-1),100);
});
test('analysis produces ordered entry, stop and take profit levels',()=>{
 for(const market of ['AAPL','1155','SPY']){
  const a=analyse(generateDemo(market,'4h'));
  assert.ok(a.score>=0&&a.score<=100);assert.ok(a.levels.support<a.price);assert.ok(a.levels.resistance>a.price);
  assert.equal(a.plans.length,2);
  for(const p of a.plans){assert.ok(p.entry>p.stop);assert.ok(p.tp1>p.entry);assert.ok(p.tp2>p.tp1);assert.ok(p.tp3>p.tp2)}
 }
});
test('position sizing respects allocation, estimated fees and max risk',()=>{
 const p={entry:2.5,stop:2.4,tp1:2.8,tp2:3};const s={...DEFAULT_SETTINGS,capital:20000,riskPct:1,allocationPct:25};const x=sizePosition(p,s,'MYR',100);
 assert.equal(x.qty%100,0);assert.ok(x.cost<=5000);assert.ok(x.estimatedLoss<=200);assert.ok(x.qty>0);
 const usd=sizePosition({entry:150,stop:145,tp1:160,tp2:170},{...s,usdMyr:4.3},'USD',1);
 assert.ok(usd.cost*4.3<=5000+1e-8);assert.ok(usd.estimatedLoss*4.3<=200+1e-8);
});
test('too-narrow budget correctly refuses the trade',()=>{
 const x=sizePosition({entry:100,stop:99,tp1:104},{...DEFAULT_SETTINGS,capital:100,riskPct:.1,allocationPct:10},'MYR',100);
 assert.equal(x.qty,0)
});
test('CSV import checks enough rows and parses OHLC',()=>{
 const seed=generateDemo('AAPL','1day',75);const csv='datetime,open,high,low,close,volume\n'+seed.map(v=>[new Date(v.time*1000).toISOString().slice(0,10),v.open,v.high,v.low,v.close,v.volume].join(',')).join('\n');const rows=parseCSV(csv);
 assert.equal(rows.length,75);assert.equal(rows.at(-1).close,seed.at(-1).close);assert.equal(rows.at(-1).time,seed.at(-1).time);
 assert.throws(()=>parseCSV('datetime,open,high,low,close\n2025-01-01,1,2,0.5,1.5'));
});

test('provider exchange-local timestamps are translated to UTC correctly',()=>{
 assert.equal(new Date(exchangeEpoch('2026-10-24 15:00:00','Asia/Kuala_Lumpur')*1000).toISOString(),'2026-10-24T07:00:00.000Z');
 assert.equal(new Date(exchangeEpoch('2026-07-01 10:00:00','America/New_York')*1000).toISOString(),'2026-07-01T14:00:00.000Z');
 assert.equal(new Date(exchangeEpoch('2026-01-01 10:00:00','America/New_York')*1000).toISOString(),'2026-01-01T15:00:00.000Z');
});
