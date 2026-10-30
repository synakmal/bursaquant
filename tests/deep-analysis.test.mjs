import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDeepReport} from '../src/deep-analysis.js';
import {analyse,sizePosition,DEFAULT_SETTINGS} from '../src/engine.js';
import {evaluateAccumulation} from '../src/screener.js';

const generatedAt='2026-10-30T04:00:00.000Z';
const now=Date.parse(generatedAt)/1000;
function frame(timeframe='1day',{direction=1,count=230,age=86400,volume=true}={}){
  const step={'1day':86400,'4h':14400,'1h':3600}[timeframe];
  const bars=Array.from({length:count},(_,index)=>{
    const price=40*Math.exp(direction*index*.002);
    return {time:now-age-(count-1-index)*step,open:price*.998,high:price*1.006,low:price*.994,close:price,volume:volume?100000+index*500:0};
  });
  const analysis=analyse(bars,'swing','trend');
  return {timeframe,bars,analysis,meta:{provider:'yahoo',interval:timeframe,instrumentType:'EQUITY',completedCandles:true,completionInferred:true,timezone:'America/New_York',fetchedAt:generatedAt},sizedPlans:analysis.plans.map(plan=>({...plan,position:sizePosition(plan,DEFAULT_SETTINGS,'USD',1)})),accumulation:timeframe==='1day'?evaluateAccumulation(bars):undefined};
}
const report=frames=>buildDeepReport({symbol:'AAPL',market:'US',frames,generatedAt,mode:'swing',strategy:{name:'Trend emphasis'}});

test('three verified timeframes produce a bounded evidence report and conditional cost-aware plans',()=>{
  const result=report([frame(),frame('4h'),frame('1h')]);
  assert.equal(result.status,'complete');assert.equal(result.alignment,'bullish');assert.equal(result.counts.available,3);assert.equal(result.strategy.name,'Trend emphasis');
  assert.equal(result.frames[0].completedCandles,true);assert.equal(result.frames[0].completionInferred,true);
  assert.equal(result.frames[0].plans.length,2);assert.ok(result.frames[0].plans[0].grossRewardRisk.every(value=>value>0));assert.ok(result.frames[0].plans[0].sizing.qty>=0);
  assert.ok(result.evidence.length);assert.equal(new Set(result.evidence.map(item=>item.id)).size,result.evidence.length);
  assert.match(result.summary,/does not confirm an entry/);assert.equal(result.frames[0].coverage.news,false);assert.ok(result.missingInputs.some(value=>value.includes('Financial statements')));
  assert.doesNotThrow(()=>JSON.stringify(result));assert.equal(result.probability,undefined);
});

test('Yahoo completion remains inferred when gateway metadata omits the optional inference flag',()=>{
  const item=frame();delete item.meta.completionInferred;
  const result=report([item]).frames[0];assert.equal(result.status,'available');assert.equal(result.completedCandles,true);assert.equal(result.completionInferred,true);assert.ok(result.warnings.some(value=>value.includes('completion is inferred')));
  item.meta.provider='twelvedata';const reported=report([item]).frames[0];assert.equal(reported.completionInferred,false);assert.ok(!reported.warnings.some(value=>value.includes('completion is inferred')));
  item.meta.completionInferred=true;assert.equal(report([item]).frames[0].completionInferred,true);
});

test('bullish daily and bearish 4H readings expose conflict even when 1H is missing',()=>{
  const result=report([frame(),frame('4h',{direction:-1})]);
  assert.equal(result.status,'partial');assert.equal(result.alignment,'conflicting');assert.equal(result.counts.bearish,1);assert.ok(result.supporting.length);assert.ok(result.contrary.length);
  assert.ok(result.missingInputs.some(value=>value.startsWith('1H:')));assert.match(result.nextChecks[0],/conflict/);
});

test('all bearish frames report a bearish alignment without turning it into a return prediction',()=>{
  const result=report(['1day','4h','1h'].map(timeframe=>frame(timeframe,{direction:-1})));
  assert.equal(result.alignment,'bearish');assert.equal(result.counts.bearish,3);assert.equal(result.frames[0].trend,'Bearish');assert.ok(result.contrary.length>3);
});

test('a failed request does not reuse old analysis for that timeframe',()=>{
  const daily=frame();daily.error={message:'Provider temporarily unavailable.'};
  const result=report([daily,frame('4h')]);
  assert.equal(result.status,'partial');assert.equal(result.frames[0].status,'error');assert.equal(result.frames[0].price,null);assert.deepEqual(result.frames[0].plans,[]);assert.deepEqual(result.frames[0].supporting,[]);assert.match(result.frames[0].reason,/temporarily/);
});

test('unrecognised, demo and absent provider sources cannot produce conclusions',()=>{
  for(const provider of ['demo','csv',undefined,'Yahoo']){
    const item=frame();item.meta.provider=provider;
    const result=report([item]);assert.equal(result.frames[0].status,'unverified');assert.equal(result.status,'unavailable');assert.equal(result.frames[0].score,null);assert.deepEqual(result.evidence,[]);
  }
});

test('incomplete, mismatched interval and derivative data are separately excluded',()=>{
  const cases=[['completedCandles',false,'incomplete'],['interval','1week','invalid'],['instrumentType','WARRANT','unsupported']];
  for(const [key,value,status] of cases){const item=frame();item.meta[key]=value;const result=report([item]);assert.equal(result.frames[0].status,status);assert.deepEqual(result.frames[0].plans,[]);assert.equal(result.frames[0].trend,null);}
});

test('stale and future candles are excluded while a weekend-sized delay is visible and usable',()=>{
  const stale=report([frame('1day',{age:7*86400+1})]).frames[0];assert.equal(stale.status,'stale');assert.ok(stale.ageDays>7);assert.deepEqual(stale.plans,[]);
  const future=report([frame('1day',{age:-1})]).frames[0];assert.equal(future.status,'invalid');assert.equal(future.trend,null);
  const recent=report([frame('1day',{age:3*86400})]).frames[0];assert.equal(recent.status,'available');assert.equal(recent.ageDays,3);
});

test('malformed, duplicated and out-of-order provider bars are not silently repaired',()=>{
  const mutations=[item=>{item.bars[20].time=item.bars[19].time;},item=>{item.bars[20].low=item.bars[20].close+10;},item=>{item.bars[20].volume=-1;},item=>{item.bars[20]=null;},item=>{item.bars.reverse();}];
  for(const mutate of mutations){const item=frame();mutate(item);const result=report([item]);assert.equal(result.frames[0].status,'invalid');assert.equal(result.frames[0].price,null);assert.deepEqual(result.frames[0].plans,[]);}
});

test('calculations from different histories cannot be combined with the source metadata',()=>{
  const item=frame();item.analysis=frame('1day',{direction:-1}).analysis;
  assert.equal(report([item]).frames[0].status,'invalid');
  const second=frame();second.analysis={...second.analysis,candles:second.analysis.candles.map((bar,index)=>index===20?{...bar,close:bar.close+.01}:bar)};
  assert.equal(report([second]).frames[0].status,'invalid');
  const third=frame();third.analysis={...third.analysis,candles:third.analysis.candles.map((bar,index)=>index===20?null:bar)};
  assert.equal(report([third]).frames[0].status,'invalid');
});

test('limited history and missing volume remain explicit coverage gaps',()=>{
  const item=frame('1day',{count:70,volume:false});
  const result=report([item]);assert.equal(result.frames[0].status,'available');assert.equal(result.frames[0].coverage.sma200,false);assert.equal(result.frames[0].coverage.volume,false);assert.equal(result.frames[0].indicators.sma200,null);assert.equal(result.frames[0].indicators.rvol,null);
  assert.ok(result.frames[0].warnings.some(value=>value.includes('SMA200')));assert.ok(result.frames[0].warnings.some(value=>value.includes('volume is missing')));assert.equal(result.frames[0].accumulation.classification,'insufficient');
  const short=frame();short.bars=short.bars.slice(-54);assert.equal(report([short]).frames[0].status,'insufficient');
});

test('duplicate timeframe inputs are rejected rather than choosing a favourable result',()=>{
  const result=report([frame(),frame(),frame('1h')]);assert.equal(result.frames[0].status,'error');assert.match(result.frames[0].reason,/Duplicate/);assert.equal(result.counts.available,1);
});

test('malformed plans and absent sizing do not create fabricated risk quantities',()=>{
  const item=frame();delete item.sizedPlans;item.analysis.plans[0].stop=item.analysis.plans[0].entry+1;
  const result=report([item]);assert.equal(result.frames[0].plans.length,1);assert.equal(result.frames[0].plans[0].sizing,null);
  const raw=frame();raw.sizedPlans=raw.sizedPlans.map(value=>value.position);assert.equal(report([raw]).frames[0].plans[0].sizing.qty,raw.sizedPlans[0].qty);
});

test('untrusted fields, secrets and unsupported checklist metrics are not copied into reports',()=>{
  const item=frame();item.meta.token='DO_NOT_COPY';item.analysis.secret='DO_NOT_COPY';item.accumulation.secret='DO_NOT_COPY';item.accumulation.metrics.secret=123;
  const result=report([item]);assert.ok(!JSON.stringify(result).includes('DO_NOT_COPY'));assert.equal(result.frames[0].accumulation.metrics.secret,undefined);
});

test('report generation date must be valid and absent frames never imply confirmation',()=>{
  assert.throws(()=>buildDeepReport({generatedAt:'yesterday'}),/timestamp/);
  const result=report([]);assert.equal(result.status,'unavailable');assert.equal(result.alignment,'unavailable');assert.equal(result.counts.available,0);assert.equal(result.frames.length,3);assert.match(result.summary,/No verified/);
  assert.match(result.nextChecks[0],/Load verified/);assert.equal(buildDeepReport({symbol:null,generatedAt}).symbol,'');
});
