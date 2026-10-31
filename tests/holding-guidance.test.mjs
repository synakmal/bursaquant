import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse} from '../src/engine.js';
import {reviewHolding} from '../src/holding-review.js';
import {buildHoldingGuidance} from '../src/holding-guidance.js';

const generatedAt='2026-10-30T12:00:00.000Z',now=Date.parse(generatedAt)/1000;
const position=overrides=>({id:'lot1',symbol:'AAPL',market:'US',currency:'USD',assetType:'Stock',entryDate:'2026-10-20',entryPrice:90,quantity:100,entryFees:10,style:'short',stopPrice:85,target1:120,target2:130,tradeType:'actual',exits:[],...overrides});
function frame(timeframe='1day',{price=100,direction=1}={}){
  const step=timeframe==='1day'?86400:timeframe==='1week'?7*86400:3600;
  const bars=Array.from({length:230},(_,i)=>{const close=price*Math.exp(direction*(i-229)*.003);return {time:now-86400-(229-i)*step,open:close*.998,high:close*1.005,low:close*.995,close,volume:100000+i*100};});
  return {timeframe,bars,analysis:analyse(bars),meta:{provider:'yahoo',symbol:'AAPL',currency:'USD',interval:timeframe,instrumentType:'EQUITY',completedCandles:true,timezone:'America/New_York',fetchedAt:generatedAt}};
}
function guidance(p=position(),frames=[frame(),frame('1h')]){const review=reviewHolding({position:p,frames,generatedAt});return {review,result:buildHoldingGuidance({position:p,review})};}

test('a conditional hold contains measured reasons and concrete changes of view without mutating inputs',()=>{
  const p=position(),review=reviewHolding({position:p,frames:[frame(),frame('1h')],generatedAt}),before=structuredClone({position:p,review});
  const result=buildHoldingGuidance({position:p,review});assert.equal(result.action.code,'hold');assert.match(result.action.label,/while conditions/);assert.ok(result.reasons.some(text=>text.includes('SMA20')));assert.ok(result.changeOfView.some(text=>text.includes('USD 85')));assert.deepEqual({position:p,review},before);
  assert.match(result.scope,/finite set/);assert.match(result.scope,/RSI, ATR, RVOL, SMA200/);assert.doesNotMatch(JSON.stringify(result),/probability|win rate|guaranteed profit/i);
});

test('a breached stop distinguishes cutting an estimated loss from protecting an estimated gain',()=>{
  assert.equal(guidance(position({entryPrice:110,stopPrice:101})).result.action.code,'cut_loss');
  const gain=guidance(position({entryPrice:70,stopPrice:101})).result;assert.equal(gain.action.code,'protect_profit');assert.doesNotMatch(gain.action.label,/cut loss/i);
  const zero=guidance(position({entryPrice:100,entryFees:0,stopPrice:101})).result;assert.equal(zero.action.code,'review_exit');
});

test('a target reached below entry cost is an exit review rather than a claim of profit',()=>{
  const profit=guidance(position({target1:95,target2:99})).result;assert.equal(profit.action.code,'take_profit');
  const loss=guidance(position({entryPrice:110,target1:95,target2:99})).result;assert.equal(loss.action.code,'review_exit');assert.ok(loss.reasons.some(text=>text.includes('does not establish a profit')));
  assert.ok(profit.action.conditions.some(text=>text.includes('no sale percentage')));
});

test('the existing stop-first priority is preserved when stop and target comparisons both hold',()=>{
  const result=guidance(position({entryPrice:110,stopPrice:101,target1:95,target2:99})).result;
  assert.equal(result.action.code,'cut_loss');assert.equal(result.scenarios.find(row=>row.id==='protective-stop').active,true);assert.equal(result.scenarios.find(row=>row.id==='target-2').active,true);
});

test('concurrent weak trend evidence stays visible when an exit threshold has priority',()=>{
  for(const plan of [{stopPrice:101},{target1:95,target2:99}]){
    const result=guidance(position(plan),[frame(),frame('1h',{direction:-1})]).result;
    assert.ok(['protect_profit','take_profit'].includes(result.action.code));
    assert.equal(result.scenarios.find(row=>row.id==='conflicting-trend').active,true);
    assert.equal(result.scenarios.find(row=>row.id==='constructive-hold').active,false);
  }
});

test('a losing holding alone does not become a cut-loss trigger',()=>{
  const result=guidance(position({entryPrice:110,stopPrice:90})).result;assert.equal(result.action.code,'hold');assert.ok(result.reasons.some(text=>text.includes('loss relative to entry alone')));
});

test('absent risk thresholds remain unknown and are never invented from chart support',()=>{
  const result=guidance(position({stopPrice:null,target1:null,target2:null})).result;
  assert.equal(result.action.code,'complete_plan');assert.equal(result.scenarios.find(row=>row.id==='protective-stop').trigger,'Stop not recorded');assert.equal(result.scenarios.find(row=>row.id==='protective-stop').active,null);assert.ok(result.missing.some(text=>text.includes('No target levels')));
});

test('bearish and incomplete context retain their upstream review decisions',()=>{
  const weak=guidance(position(),[frame(),frame('1h',{direction:-1})]).result;assert.equal(weak.action.code,'reassess');
  const missing=guidance(position(),[frame()]).result;assert.equal(missing.action.code,'wait_review');assert.equal(missing.scenarios.find(row=>row.id==='missing-evidence').active,true);assert.ok(missing.missing.some(text=>text.includes('1h')));
  assert.equal(missing.scenarios.find(row=>row.id==='conflicting-trend').active,null);assert.equal(missing.scenarios.find(row=>row.id==='constructive-hold').active,null);
});

test('insufficient or unverified data produces no directional recommendation or quote-based scenario',()=>{
  const noDaily=guidance(position(),[frame('1h')]).result;assert.equal(noDaily.action.code,'no_recommendation');assert.equal(noDaily.scenarios.find(row=>row.id==='protective-stop').active,null);
  const p=position(),review=guidance(p).review;review.priceReference.provider='demo';const demo=buildHoldingGuidance({position:p,review});assert.equal(demo.action.code,'no_recommendation');assert.equal(demo.scenarios.find(row=>row.id==='constructive-hold').active,null);
});

test('mismatched identity and contradictory exit classifications cannot manufacture advice',()=>{
  const p=position(),review=guidance(p).review;
  assert.equal(buildHoldingGuidance({position:{...p,id:'different'},review}).action.code,'no_recommendation');
  assert.equal(buildHoldingGuidance({position:p,review:{...review,classification:'stop_breached'}}).action.code,'no_recommendation');
  assert.equal(buildHoldingGuidance({position:p,review:{...review,classification:'target_reached'}}).action.code,'no_recommendation');
});

test('missing profit data never labels a stop breach or target as a realised gain',()=>{
  const p=position({stopPrice:101}),review=guidance(p).review;review.pnl=null;
  assert.equal(buildHoldingGuidance({position:p,review}).action.code,'review_exit');
  const tp=position({target1:95,target2:99}),targetReview=guidance(tp).review;targetReview.pnl=null;
  assert.equal(buildHoldingGuidance({position:tp,review:targetReview}).action.code,'review_exit');
});

test('long-term business, portfolio and unconfigured exit rules stay explicitly unknown',()=>{
  const p=position({style:'long'}),result=guidance(p,[frame(),frame('1week')]).result;
  assert.equal(result.action.code,'hold');assert.ok(result.missing.some(text=>text.includes('long-term business thesis')));assert.ok(result.missing.some(text=>text.includes('Wider portfolio')));assert.ok(result.missing.some(text=>text.includes('trailing-stop formula')));
  assert.equal(result.scenarios.find(row=>row.id==='time-or-trailing-rule').active,null);assert.equal(result.scenarios.find(row=>row.id==='business-or-execution-change').active,null);
});

test('closed holdings have no new price scenario or trade suggestion',()=>{
  const p=position({exits:[{id:'sale1',date:'2026-10-21',quantity:100,price:110,fees:2}]}),result=guidance(p).result;
  assert.equal(result.action.code,'closed');assert.deepEqual(result.scenarios,[]);assert.doesNotMatch(JSON.stringify(result.action),/buy now|sell now/i);
});

test('null, unknown and malformed reports fail closed without copying arbitrary fields',()=>{
  for(const input of [undefined,{},null,{position:position(),review:{classification:'unknown',secret:'private'}}]){
    const result=buildHoldingGuidance(input);assert.equal(result.action.code,'no_recommendation');assert.doesNotMatch(JSON.stringify(result),/private/);
  }
});
