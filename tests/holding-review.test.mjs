import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDING_STYLES,reviewHolding} from '../src/holding-review.js';
import {analyse} from '../src/engine.js';

const generatedAt='2026-10-30T12:00:00.000Z',now=Date.parse(generatedAt)/1000;
const position=overrides=>({id:'position_1',symbol:'AAPL',market:'US',currency:'USD',assetType:'Stock',entryDate:'2026-10-28',entryPrice:90,quantity:100,entryFees:10,style:'short',stopPrice:85,target1:120,target2:130,tradeType:'actual',exits:[],...overrides});
function frame(timeframe='1day',{price=100,direction=1,count=230,age=86400,market='US',symbol=market==='MY'?'1155.KL':'AAPL',currency=market==='MY'?'MYR':'USD'}={}){
  const step=({'1day':86400,'1h':3600,'4h':14400,'1week':7*86400})[timeframe];
  const bars=Array.from({length:count},(_,index)=>{const close=price*Math.exp(direction*(index-count+1)*.003);return {time:now-age-(count-1-index)*step,open:close*.998,high:close*1.005,low:close*.995,close,volume:100000+index*100};});
  return {timeframe,bars,analysis:analyse(bars),meta:{provider:'yahoo',symbol,currency,interval:timeframe,instrumentType:'EQUITY',completedCandles:true,timezone:market==='MY'?'Asia/Kuala_Lumpur':'America/New_York',fetchedAt:generatedAt}};
}
const review=(p=position(),frames=[frame(),frame('1h')])=>reviewHolding({position:p,frames,generatedAt});

test('styles select a bounded pair of timeframes and never mutate the recorded plan',()=>{
  assert.deepEqual(HOLDING_STYLES.short.timeframes,['1day','1h']);assert.deepEqual(HOLDING_STYLES.swing.timeframes,['1day','4h']);assert.deepEqual(HOLDING_STYLES.long.timeframes,['1day','1week']);
  assert.equal(HOLDING_STYLES.short.engineStyle,'swing');assert.equal(HOLDING_STYLES.long.engineStyle,'invest');
  assert.throws(()=>HOLDING_STYLES.short.timeframes.push('5min'));
  const p=position(),original=structuredClone(p),result=review(p);assert.deepEqual(p,original);assert.equal(result.plan.stopPrice,85);assert.equal(result.plan.target1,120);
});

test('aligned technical evidence with the recorded stop intact produces a conditional hold review',()=>{
  const result=review();assert.equal(result.classification,'hold_conditions');assert.equal(result.label,'Technical hold conditions intact');assert.equal(result.coverage.available,2);
  assert.equal(result.priceReference.timeframe,'1day');assert.equal(result.priceReference.price,100);assert.equal(result.priceReference.completionInferred,true);
  assert.equal(result.pnl.unrealizedGross,1000);assert.equal(result.pnl.unrealizedAfterEntryFees,990);assert.ok(result.risks.some(text=>text.includes('future exit fees')));assert.ok(result.evidence.length);
});

test('a stop breach takes priority over targets and trend scores on the newest eligible reference',()=>{
  const result=review(position({stopPrice:101,target1:99,target2:100}),[frame(),frame('1h',{price:100,age:3600})]);
  assert.equal(result.classification,'stop_breached');assert.equal(result.plan.stopBreached,true);assert.equal(result.plan.target2Reached,true);assert.equal(result.priceReference.price,100);assert.equal(result.priceReference.timeframe,'1h');
  assert.match(result.summary,/no stop fill/i);assert.ok(result.nextChecks[0].includes('switching style does not remove'));
});

test('a newer completed intraday stop breach cannot be hidden by an older daily close',()=>{
  const p=position({stopPrice:85}),result=review(p,[frame('1day',{price:100}),frame('1h',{price:80,age:3600})]);
  assert.equal(result.classification,'stop_breached');assert.equal(result.priceReference.timeframe,'1h');assert.equal(result.priceReference.price,80);assert.equal(result.pnl.unrealizedGross,-1000);
  assert.match(result.summary,/1H reference close/);
  const invalid=frame('1h',{price:80,age:3600});invalid.meta.completedCandles=false;
  const excluded=review(p,[frame('1day',{price:100}),invalid]);assert.equal(excluded.priceReference.timeframe,'1day');assert.equal(excluded.classification,'mixed');assert.equal(excluded.plan.stopBreached,false);
});

test('a same-day completed daily close takes precedence over a later-starting intraday bar',()=>{
  const dailyTime=Date.parse('2026-10-29T13:30:00.000Z')/1000,hourTime=Date.parse('2026-10-29T18:30:00.000Z')/1000;
  const result=review(position({stopPrice:85}),[frame('1day',{price:100,age:now-dailyTime}),frame('1h',{price:80,age:now-hourTime})]);
  assert.equal(result.priceReference.timeframe,'1day');assert.equal(result.priceReference.price,100);assert.equal(result.plan.stopBreached,false);assert.ok(result.risks.some(text=>text.includes('full regular-session reference')));
});

test('a trailing stop above entry remains a protective exit condition without pretending it is a loss',()=>{
  const result=review(position({entryPrice:70,stopPrice:101}));assert.equal(result.classification,'stop_breached');assert.ok(result.pnl.unrealizedAfterEntryFees>0);assert.doesNotMatch(result.label,/cut loss/i);
});

test('recorded targets are evaluated before bearish style evidence or missing protective stops',()=>{
  const p=position({target1:95,target2:100,stopPrice:null}),result=review(p,[frame(),frame('1h',{direction:-1})]);
  assert.equal(result.classification,'target_reached');assert.match(result.summary,/second target/);assert.equal(result.plan.stopPrice,null);assert.ok(result.risks.some(text=>text.includes('No protective stop')));
  assert.match(result.summary,/does not establish.*filled/);
});

test('a reached target below all-in entry cost is a planned exit, not an invented profit',()=>{
  const result=review(position({entryPrice:110,stopPrice:85,target1:95,target2:99}));
  assert.equal(result.classification,'target_reached');assert.equal(result.label,'Target reached — review planned exit');assert.ok(result.pnl.unrealizedAfterEntryFees<0);assert.ok(result.risks.some(text=>text.includes('does not necessarily produce a profit')));
});

test('an absent stop produces an incomplete plan and is never invented from chart support',()=>{
  const result=review(position({stopPrice:null,target1:null,target2:null}));assert.equal(result.classification,'plan_incomplete');assert.equal(result.plan.stopPrice,null);assert.ok(result.risks.some(text=>text.includes('No profit-taking target')));
});

test('a losing entry alone does not become a fabricated cut-loss instruction',()=>{
  const result=review(position({entryPrice:110,stopPrice:90}));assert.equal(result.classification,'hold_conditions');assert.equal(result.pnl.unrealizedGross,-1000);assert.equal(result.pnl.changePct,-9.090909);
});

test('missing daily history prevents a position price conclusion even when intraday context is valid',()=>{
  const result=review(position(),[frame('1h',{price:150,age:3600})]);assert.equal(result.classification,'insufficient');assert.equal(result.priceReference,null);assert.equal(result.pnl,null);assert.equal(result.coverage.available,1);
});

test('a daily candle before the entry date cannot describe the holding after entry',()=>{
  const p=position({entryDate:'2026-10-30'}),result=review(p);assert.equal(result.classification,'insufficient');assert.equal(result.pnl,null);assert.match(result.summary,/predates/);
  // Date comparison uses the exchange date, not an arbitrary UTC day boundary.
  const daily=frame('1day',{age:11.5*3600});const boundary=review(p,[daily,frame('1h')]);
  assert.equal(boundary.classification,'insufficient');assert.match(boundary.summary,/predates/);
  const newer=review(p,[frame(),frame('1h',{age:3600})]);assert.notEqual(newer.classification,'insufficient');assert.equal(newer.priceReference.exchangeDate,'2026-10-30');assert.equal(newer.priceReference.timeframe,'1h');
});

test('wrong sources, completion, interval, symbol, currency and derivative types are excluded',()=>{
  for(const change of [{provider:'demo'},{completedCandles:false},{interval:'4h'},{symbol:'MSFT'},{currency:'MYR'},{instrumentType:'WARRANT'}]){
    const daily=frame();Object.assign(daily.meta,change);const result=review(position(),[daily,frame('1h')]);assert.equal(result.classification,'insufficient');assert.equal(result.priceReference,null);assert.equal(result.pnl,null);
  }
});

test('malformed, duplicated, reversed and future OHLC histories are excluded',()=>{
  for(const mutate of [bars=>{bars[4].low=bars[4].high+1;},bars=>{bars[4].time=bars[3].time;},bars=>bars.reverse(),bars=>{bars.at(-1).time=now+1;}]){
    const daily=frame();mutate(daily.bars);const result=review(position(),[daily,frame('1h')]);assert.equal(result.classification,'insufficient');assert.equal(result.pnl,null);
  }
});

test('stale daily prices are excluded while ordinary completed weekly bar ages are allowed as context',()=>{
  const stale=review(position(),[frame('1day',{age:8*86400}),frame('1h')]);assert.equal(stale.classification,'insufficient');assert.equal(stale.frames[0].status,'stale');
  const p=position({style:'long'}),valid=review(p,[frame(),frame('1week',{age:11*86400,price:140})]);assert.equal(valid.classification,'hold_conditions');assert.equal(valid.plan.target1Reached,false);assert.equal(valid.priceReference.price,100);
  assert.ok(valid.risks.some(text=>text.includes('Financial statements')));assert.ok(valid.risks.some(text=>text.includes('14 calendar days')));
  const old=review(p,[frame(),frame('1week',{age:15*86400})]);assert.equal(old.classification,'mixed');assert.equal(old.frames[1].status,'stale');
});

test('calculation/history mismatches and duplicate frame inputs cannot generate a favourable review',()=>{
  const daily=frame();daily.analysis={...daily.analysis,price:daily.analysis.price+1};const result=review(position(),[daily,frame('1h')]);assert.equal(result.classification,'insufficient');assert.equal(result.frames[0].status,'invalid');
  const duplicates=review(position(),[frame(),frame(),frame('1h')]);assert.equal(duplicates.classification,'insufficient');assert.match(duplicates.frames[0].reason,/Duplicate/);
});

test('inconsistent trend labels and tiny negative momentum cannot manufacture hold confirmation',()=>{
  const daily=frame();daily.analysis.trend='Bearish';const inconsistent=review(position(),[daily,frame('1h')]);assert.equal(inconsistent.classification,'insufficient');assert.equal(inconsistent.frames[0].status,'invalid');
  const tiny=frame('1h');tiny.analysis.macd=-1e-10;const result=review(position(),[frame(),tiny]);assert.equal(result.classification,'mixed');assert.equal(result.frames[1].indicators.macdHistogram,-1e-10);
});

test('Friday history remains usable during the November 1 weekend and US daylight-saving transition',()=>{
  const weekend='2026-11-01T06:30:00.000Z',dailyTime=Date.parse('2026-10-30T13:30:00.000Z')/1000,hourTime=Date.parse('2026-10-30T19:30:00.000Z')/1000;
  const daily=frame('1day',{age:now-dailyTime}),hour=frame('1h',{age:now-hourTime});daily.meta.fetchedAt=weekend;hour.meta.fetchedAt=weekend;
  const result=reviewHolding({position:position({entryDate:'2026-10-30'}),frames:[daily,hour],generatedAt:weekend});
  assert.equal(result.classification,'hold_conditions');assert.equal(result.priceReference.timeframe,'1day');assert.equal(result.priceReference.exchangeDate,'2026-10-30');assert.equal(result.coverage.available,2);
});

test('partial exits use remaining shares and proportional entry fees for unrealised P/L',()=>{
  const p=position({entryPrice:90,quantity:100,entryFees:20,exits:[{id:'exit_1',date:'2026-10-29',quantity:40,price:110,fees:5}]}),result=review(p);
  assert.equal(result.pnl.remainingQuantity,60);assert.equal(result.pnl.unrealizedGross,600);assert.equal(result.pnl.unrealizedAfterEntryFees,588);
  const closed=review(position({exits:[{date:'2026-10-29',quantity:100,price:110,fees:5}]}),[]);assert.equal(closed.classification,'closed');assert.equal(closed.priceReference,null);assert.deepEqual(closed.frames,[]);assert.equal(closed.pnl,null);
});

test('bearish selected-style context requests a risk review and incomplete context cannot confirm holding',()=>{
  const bearish=review(position(),[frame(),frame('1h',{direction:-1})]);assert.equal(bearish.classification,'review_risk');assert.match(bearish.summary,/bearish/);assert.ok(bearish.nextChecks[0].includes('do not widen'));
  const partial=review(position(),[frame(),{timeframe:'1h',error:'Provider paused'}]);assert.equal(partial.classification,'mixed');assert.equal(partial.frames[1].status,'error');assert.match(partial.summary,/incomplete/);
});

test('a long-term weekly trend does not independently validate the investment thesis',()=>{
  const p=position({style:'long'}),result=review(p,[frame(),frame('1week',{direction:-1,age:11*86400})]);assert.equal(result.classification,'review_risk');assert.equal(result.coverage.fundamentals,false);assert.equal(result.coverage.news,false);assert.ok(result.risks.some(text=>text.includes('investment thesis')));
});

test('manual position errors fail closed instead of generating missing or negative quantities',()=>{
  for(const change of [{style:'fast'},{assetType:'Warrant'},{entryDate:'2026-02-30'},{currency:'MYR'},{quantity:-1},{quantity:1.5},{entryFees:-1},{entryPrice:0},{stopPrice:NaN},{target1:110,target2:100},{exits:[{date:'2026-10-29',quantity:101,price:110,fees:0}]}]){
    const result=review(position(change));assert.equal(result.classification,'insufficient');assert.equal(result.pnl,null);
  }
  assert.equal(reviewHolding({generatedAt}).classification,'insufficient');assert.throws(()=>reviewHolding({position:position(),generatedAt:'invalid'}),/timestamp/);
});

test('source prices retain precision at a user stop boundary and Bursa ticker aliases match safely',()=>{
  const p=position({stopPrice:0.12345678,entryPrice:.12,target1:.14,target2:.15}),result=review(p,[frame('1day',{price:.123456789}),frame('1h',{price:.123456789})]);assert.equal(result.plan.stopBreached,false);assert.equal(result.priceReference.price,.123456789);
  const bursa=position({symbol:'1155',market:'MY',currency:'MYR',entryPrice:9,stopPrice:8,target1:12,target2:13}),my=review(bursa,[frame('1day',{market:'MY',price:10}),frame('1h',{market:'MY',price:10})]);assert.equal(my.classification,'hold_conditions');assert.equal(my.currency,'MYR');
});
