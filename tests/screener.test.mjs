import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAccumulation,DEFAULT_SCREEN_SETTINGS} from '../src/screener.js';

const day=86400,start=Date.UTC(2025,0,1)/1000;
function candles({count=120,volume=1000000,distribution=false}={}){
  return Array.from({length:count},(_,index)=>{
    const narrow=index>=count-20,range=narrow?0.08:0.4;
    const close=10+(narrow?(distribution?-1:1)*(index-(count-20))*0.002:Math.sin(index)*0.1);
    const high=close+range*(distribution?0.8:0.2),low=close-range*(distribution?0.2:0.8);
    return {time:start+index*day,open:close,high,low,close,volume};
  });
}

test('a quiet positive-pressure contraction qualifies and explains each mandatory condition',()=>{
  const result=evaluateAccumulation(candles());
  assert.equal(result.classification,'accumulation');assert.equal(result.status,'Quiet accumulation candidate');assert.equal(result.score,100);assert.equal(result.eligible,true);
  for(const id of ['history','volumeCoverage','liquidity','consolidation','contraction','moneyFlow','obv','resistance'])assert.equal(result.conditions.find(condition=>condition.id===id).met,true,id);
  assert.ok(result.metrics.cmf20>0.05);assert.ok(result.metrics.obvPressure>0.1);assert.ok(result.metrics.rangeContraction<0.85);
});

test('lower-close pressure is distinguished from accumulation',()=>{
  const result=evaluateAccumulation(candles({distribution:true}));
  assert.equal(result.classification,'distribution');assert.equal(result.eligible,false);assert.ok(result.metrics.cmf20<0);assert.ok(result.metrics.obvPressure<0);
});

test('a breakout uses the previous twenty highs and does not include its own high',()=>{
  const rows=candles(),previousHigh=Math.max(...rows.slice(-21,-1).map(row=>row.high));
  rows[119]={...rows[119],open:previousHigh,low:previousHigh-0.01,close:previousHigh+0.1,high:previousHigh+0.12,volume:2000000};
  const result=evaluateAccumulation(rows);
  assert.equal(result.classification,'breakout');assert.equal(result.metrics.priorResistance,Number(previousHigh.toFixed(6)));assert.ok(result.metrics.priorResistance<rows.at(-1).high);
  assert.ok(result.metrics.rvol>=DEFAULT_SCREEN_SETTINGS.minBreakoutRvol);
});

test('a price break without volume confirmation does not qualify as breakout',()=>{
  const rows=candles(),previousHigh=Math.max(...rows.slice(-21,-1).map(row=>row.high));
  rows[119]={...rows[119],open:previousHigh,low:previousHigh-0.01,close:previousHigh+0.1,high:previousHigh+0.12};
  assert.equal(evaluateAccumulation(rows).classification,'none');
});

test('absent or all-zero volume remains unavailable rather than favorable',()=>{
  for(const volume of [undefined,NaN,-1,0]){
    const result=evaluateAccumulation(candles().map(row=>({...row,volume})));
    assert.equal(result.classification,'insufficient');assert.equal(result.score,null);assert.equal(result.metrics.cmf20,null);assert.equal(result.metrics.obvPressure,null);
  }
});

test('zero-range candles make a zero CMF contribution without division errors',()=>{
  const rows=candles().map(row=>({...row,open:10,high:10,low:10,close:10}));
  const result=evaluateAccumulation(rows);
  assert.equal(result.classification,'none');assert.equal(result.metrics.cmf20,0);assert.equal(result.metrics.obvPressure,0);assert.equal(result.metrics.atrContraction,null);assert.equal(result.metrics.rangeContraction,null);
  assert.ok(Object.values(result.metrics).every(value=>value===null||Number.isFinite(value)));
});

test('inadequate liquidity cannot be offset by a high pressure score',()=>{
  const result=evaluateAccumulation(candles({volume:100}));
  assert.equal(result.classification,'none');assert.equal(result.eligible,false);assert.equal(result.conditions.find(condition=>condition.id==='liquidity').met,false);
});

test('insufficient, invalid and duplicate history is refused without mutating input',()=>{
  assert.equal(evaluateAccumulation(candles({count:59})).classification,'insufficient');
  const invalid=candles();invalid[50].close=20;assert.equal(evaluateAccumulation(invalid).classification,'insufficient');
  const duplicate=candles();duplicate[60].time=duplicate[59].time;assert.equal(evaluateAccumulation(duplicate).classification,'insufficient');
  const reverse=candles().reverse(),original=JSON.stringify(reverse),result=evaluateAccumulation(reverse);assert.equal(result.classification,'accumulation');assert.equal(result.lastCandle,start+119*day);assert.equal(JSON.stringify(reverse),original);
});

test('no previous-window contraction is invented from a zero comparison range',()=>{
  const rows=candles().map((row,index)=>index<106?{...row,open:10,high:10,low:10,close:10}:row);
  const result=evaluateAccumulation(rows);assert.equal(result.metrics.rangeContraction,null);assert.equal(result.metrics.atrContraction,null);assert.equal(result.conditions.find(condition=>condition.id==='contraction').met,false);
});

test('turnover is computed in quote currency and configurable floors are enforced',()=>{
  const rows=candles(),result=evaluateAccumulation(rows,{minAverageTurnover:20000000});
  assert.equal(result.classification,'none');assert.equal(result.metrics.averageTurnover,Number((rows.slice(-20).reduce((sum,row)=>sum+row.close*row.volume,0)/20).toFixed(6)));
  assert.ok(result.warnings.some(warning=>warning.includes('not actual executed turnover')));
});

test('options are bounded, preserve zero liquidity floors and reject nonnumeric settings',()=>{
  const result=evaluateAccumulation(candles(),{minAverageTurnover:0,minAverageVolume:0,cmfThreshold:NaN,minBreakoutRvol:'2',maxContractionRatio:2});
  assert.equal(result.settings.minAverageTurnover,0);assert.equal(result.settings.minAverageVolume,0);assert.equal(result.settings.cmfThreshold,DEFAULT_SCREEN_SETTINGS.cmfThreshold);assert.equal(result.settings.minBreakoutRvol,DEFAULT_SCREEN_SETTINGS.minBreakoutRvol);assert.equal(result.settings.maxContractionRatio,1);
});
