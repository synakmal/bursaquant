import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,generateDemo,normalizeStrategy,STRATEGY_PRESETS,RATING_INDICATORS} from '../src/engine.js';

const weights=(overrides={})=>Object.fromEntries(RATING_INDICATORS.map(({id})=>[id,overrides[id]??0]));
const custom=(overrides={},rest={})=>({id:'custom',name:'Test strategy',weights:weights(overrides),...rest});
const falling=()=>Array.from({length:230},(_,i)=>({time:1700000000+i*86400,open:351-i,close:350-i,high:352-i,low:349-i,volume:1000}));

test('normalization protects presets from mutation and rejects empty or contradictory configurations',()=>{
  const a=normalizeStrategy('balanced');a.weights.trend=0;
  assert.equal(STRATEGY_PRESETS.balanced.weights.trend,30);
  for(const value of [null,[],{weights:null},custom(),custom({rsi:100},{rsiLow:80,rsiHigh:20}),custom({rsi:100},{cautionBelow:80,constructiveAt:50})]){
    assert.deepEqual(normalizeStrategy(value),STRATEGY_PRESETS.balanced);
  }
  const bounded=normalizeStrategy(custom({rsi:1000,trend:-10}));
  assert.equal(bounded.weights.rsi,100);assert.equal(bounded.weights.trend,0);
});

test('only enabled indicators influence score and disabled trend does not veto a preferred RSI',()=>{
  const a=analyse(falling(),'swing',custom({rsi:100},{rsiLow:0,rsiHigh:30}));
  assert.equal(a.trend,'Bearish');assert.equal(a.rsi,0);
  assert.deepEqual(a.factors.map(x=>x.id),['rsi']);
  assert.equal(a.score,100);assert.equal(a.verdict,'Constructive / Watch for Entry');
  assert.equal(a.factors[0].score,100);
});

test('changing the preferred RSI band changes rating without changing measured indicators or entry plans',()=>{
  const rows=falling();
  const preferred=analyse(rows,'swing',custom({rsi:100},{rsiLow:0,rsiHigh:30}));
  const outside=analyse(rows,'swing',custom({rsi:100},{rsiLow:45,rsiHigh:68}));
  assert.equal(preferred.rsi,outside.rsi);assert.equal(outside.score,20);
  assert.deepEqual(preferred.plans,outside.plans);
});

test('weights produce the expected weighted percentage rather than treating weight totals as a fixed 100',()=>{
  // Falling prices: RSI0 inside 0–30 earns 100%; price below the averages earns 0%.
  const a=analyse(falling(),'swing',custom({rsi:30,trend:70},{rsiLow:0,rsiHigh:30}));
  assert.equal(a.trend,'Bearish');assert.equal(a.score,30);
  const b=analyse(falling(),'swing',custom({rsi:10,trend:10},{rsiLow:0,rsiHigh:30}));
  assert.equal(b.score,50);
});

test('missing volume is excluded from denominator and fully unavailable ratings return null',()=>{
  const rows=falling().map(x=>({...x,volume:0}));
  const a=analyse(rows,'swing',custom({rsi:30,volume:70},{rsiLow:0,rsiHigh:30}));
  assert.equal(a.score,100);assert.deepEqual(a.ratingCoverage,{availableWeight:30,selectedWeight:100});
  assert.equal(a.factors.find(x=>x.id==='volume').score,null);
  const b=analyse(rows,'swing',custom({volume:100}));
  assert.equal(b.score,null);assert.equal(b.verdict,'Insufficient indicator data');
  assert.deepEqual(b.ratingCoverage,{availableWeight:0,selectedWeight:100});
});

test('custom thresholds change verdict without changing indicator score',()=>{
  const rows=falling();
  const a=analyse(rows,'swing',custom({rsi:100},{rsiLow:45,rsiHigh:68,constructiveAt:15,cautionBelow:10}));
  const b=analyse(rows,'swing',custom({rsi:100},{rsiLow:45,rsiHigh:68,constructiveAt:80,cautionBelow:40}));
  assert.equal(a.score,20);assert.equal(b.score,20);
  assert.equal(a.verdict,'Constructive / Watch for Entry');assert.equal(b.verdict,'Caution / No New Long');
});

test('flat Bollinger bands are unavailable; presets always produce bounded finite factor scores',()=>{
  const flat=falling().map(x=>({...x,open:10,high:10,low:10,close:10}));
  const a=analyse(flat,'swing',custom({bollinger:100}));
  assert.equal(a.score,null);
  for(const preset of Object.values(STRATEGY_PRESETS)){
    const result=analyse(generateDemo('AAPL','4h'),'swing',preset);
    assert.ok(Number.isFinite(result.score)&&result.score>=0&&result.score<=100);
    for(const factor of result.factors){
      assert.ok(factor.weight>0);assert.ok(factor.score===null||(factor.score>=0&&factor.score<=factor.weight));
      assert.ok(factor.contribution===null||(factor.contribution>=0&&factor.contribution<=100));
      assert.ok(factor.reason.length>10);
    }
  }
});
