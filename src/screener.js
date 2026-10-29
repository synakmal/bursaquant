/** Daily OHLCV research checklist. No investor-flow data, prediction or orders. */
export const DEFAULT_SCREEN_SETTINGS=Object.freeze({
  minAverageVolume:50000,minAverageTurnover:100000,minPrice:0.1,
  maxRangePct:12,maxBaseChangePct:8,maxDistanceToResistancePct:8,
  cmfThreshold:0.05,obvPressureThreshold:0.1,maxContractionRatio:0.85,
  minBreakoutRvol:1.5,breakoutBufferPct:0.2
});
const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const rounded=value=>Number.isFinite(value)?Number(value.toFixed(6)):null;
const limits={minAverageVolume:[0,1e12],minAverageTurnover:[0,1e15],minPrice:[0,1e8],maxRangePct:[0.1,100],maxBaseChangePct:[0.1,100],maxDistanceToResistancePct:[0.1,100],cmfThreshold:[0.001,1],obvPressureThreshold:[0.001,1],maxContractionRatio:[0.05,1],minBreakoutRvol:[1,100],breakoutBufferPct:[0,20]};
function settingsFor(options){return Object.fromEntries(Object.entries(DEFAULT_SCREEN_SETTINGS).map(([key,fallback])=>{
  const alias=key==='minAverageTurnover'?'minAvgTurnover':key==='minAverageVolume'?'minAvgVolume':key;
  const value=options?.[key]??options?.[alias],[min,max]=limits[key];return [key,typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback];
}));}
function rangePct(rows){const high=Math.max(...rows.map(row=>row.high)),low=Math.min(...rows.map(row=>row.low));return (high-low)/((high+low)/2)*100;}
function validPriceBar(row){return row&&['time','open','high','low','close'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))&&row.time>0&&row.open>0&&row.close>0&&row.low>0&&row.high>=Math.max(row.open,row.close)&&row.low<=Math.min(row.open,row.close);}

/**
 * Input bars must describe completed daily candles. The caller owns freshness and
 * interval checks. All measurements use the supplied history only, never future bars.
 * Average turnover is mean(close * volume), an approximation in quote currency.
 */
export function evaluateAccumulation(bars,options={}){
  let latestCandle=Array.isArray(bars)&&bars.length?bars.at(-1)?.time??null:null;
  const settings=settingsFor(options),conditions=[],warnings=[
    'Price/volume indicators are pressure proxies; they do not identify investors or prove accumulation. Every executed trade has a buyer and seller.',
    'The checklist and score are unvalidated research rules, not a probability of profit or a prediction of a price surge.'
  ];
  const add=(id,label,met,value,rule,reason)=>conditions.push({id,label,met,value,rule,reason});
  const result=(classification,status,score,metrics={},reason='')=>({classification,status,score,eligible:classification==='accumulation'||classification==='breakout',metrics,conditions,reasons:reason?[reason]:conditions.filter(condition=>condition.met===false||condition.met===null).map(condition=>condition.reason),warnings,settings,barsUsed:Array.isArray(bars)?bars.length:0,lastCandle:latestCandle});
  if(!Array.isArray(bars)||bars.length<60){add('history','Daily history',false,Array.isArray(bars)?bars.length:0,'At least 60 completed daily candles','At least 60 completed daily candles are required.');return result('insufficient','Insufficient data',null,{},'At least 60 completed daily candles are required.');}
  if(bars.some(row=>!validPriceBar(row))){add('history','Daily history',false,null,'Valid OHLC boundaries and numeric timestamps','One or more price candles are invalid; no candidate was inferred.');return result('insufficient','Insufficient data',null,{},'Invalid OHLC or timestamp data.');}
  const rows=bars.slice().sort((left,right)=>left.time-right.time);
  latestCandle=rows.at(-1).time;
  if(rows.some((row,index)=>index>0&&row.time===rows[index-1].time)){add('history','Daily history',false,null,'Distinct candle timestamps','Duplicate candle timestamps must be resolved before screening.');return result('insufficient','Insufficient data',null,{},'Duplicate candle timestamps.');}
  add('history','Daily history',true,rows.length,'At least 60 completed daily candles',`${rows.length} supplied candles; 120 or more is preferable for context.`);
  const current=rows.at(-1),recent=rows.slice(-20),previous=rows.slice(-40,-20),priorBase=rows.slice(-21,-1),volumeWindow=rows.slice(-41);
  const volumeValid=volumeWindow.every(row=>typeof row.volume==='number'&&Number.isFinite(row.volume)&&row.volume>=0);
  const positiveVolumeBars=volumeValid?recent.filter(row=>row.volume>0).length:0;
  const hasVolume=volumeValid&&positiveVolumeBars>=16&&current.volume>0;
  add('volumeCoverage','Usable volume',hasVolume,positiveVolumeBars,'Valid non-negative volume over 41 candles; positive volume on at least 16 of the latest 20 and on the latest candle',hasVolume?'Volume coverage meets the checklist requirement.':'Missing volume or too many zero-volume candles; pressure signals are unavailable.');
  const price=current.close,baseRange=rangePct(recent),priorRange=rangePct(previous),priorResistance=Math.max(...priorBase.map(row=>row.high));
  const priceChangePct=(price/rows.at(-21).close-1)*100,distanceToResistancePct=(priorResistance-price)/priorResistance*100;
  const trueRangePct=rows.map((row,index)=>index===0?null:Math.max(row.high-row.low,Math.abs(row.high-rows[index-1].close),Math.abs(row.low-rows[index-1].close))/rows[index-1].close*100);
  const atrPct=average(trueRangePct.slice(-14)),previousAtrPct=average(trueRangePct.slice(-28,-14));
  const rangeContraction=priorRange>0?baseRange/priorRange:null,atrContraction=previousAtrPct>0?atrPct/previousAtrPct:null;
  const averageVolume=hasVolume?average(recent.map(row=>row.volume)):null,averageTurnover=hasVolume?average(recent.map(row=>row.close*row.volume)):null;
  const priorAverageVolume=hasVolume?average(priorBase.map(row=>row.volume)):null,rvol=priorAverageVolume>0?current.volume/priorAverageVolume:null;
  let cmf20=null,obvPressure=null,upDownVolumeRatio=null;
  if(hasVolume){
    const totalVolume=recent.reduce((sum,row)=>sum+row.volume,0);
    cmf20=recent.reduce((sum,row)=>sum+(row.high===row.low?0:((row.close-row.low)-(row.high-row.close))/(row.high-row.low))*row.volume,0)/totalVolume;
    let signedVolume=0,upVolume=0,downVolume=0;
    for(let index=rows.length-20;index<rows.length;index++){
      const change=rows[index].close-rows[index-1].close,volume=rows[index].volume;
      signedVolume+=Math.sign(change)*volume;if(change>0)upVolume+=volume;else if(change<0)downVolume+=volume;
    }
    obvPressure=signedVolume/totalVolume;
    // A zero denominator stays unavailable rather than creating an infinite ratio.
    upDownVolumeRatio=downVolume>0?upVolume/downVolume:null;
  }
  const metrics=Object.fromEntries(Object.entries({price,rangePct:baseRange,rangeContraction,atrPct,atrContraction,cmf20,obvPressure,upDownVolumeRatio,rvol,priorResistance,distanceToResistancePct,averageVolume,averageTurnover,priceChangePct,positiveVolumeBars}).map(([key,value])=>[key,rounded(value)]));
  if(rows.length<120)warnings.push('Fewer than 120 daily candles were supplied; longer-term context is limited.');
  warnings.push('Average turnover is mean daily close × volume in the instrument quote currency, not actual executed turnover.');
  const liquid=hasVolume?price>=settings.minPrice&&averageVolume>=settings.minAverageVolume&&averageTurnover>=settings.minAverageTurnover:null;
  const consolidating=baseRange<=settings.maxRangePct&&Math.abs(priceChangePct)<=settings.maxBaseChangePct;
  const contracting=(rangeContraction!==null&&rangeContraction<=settings.maxContractionRatio)||(atrContraction!==null&&atrContraction<=settings.maxContractionRatio);
  const positiveFlow=hasVolume?cmf20>=settings.cmfThreshold:null,positiveObv=hasVolume?obvPressure>=settings.obvPressureThreshold:null;
  const nearResistance=distanceToResistancePct>=0&&distanceToResistancePct<=settings.maxDistanceToResistancePct;
  add('liquidity','Liquidity floor',liquid,metrics.averageTurnover,`Price ≥ ${settings.minPrice}; average volume ≥ ${settings.minAverageVolume}; approximate daily turnover ≥ ${settings.minAverageTurnover} in quote currency`,liquid?'The configured liquidity floors are met.':hasVolume?'The configured price, volume or turnover floor is not met.':'Liquidity cannot be evaluated without usable volume.');
  add('consolidation','Quiet price base',consolidating,metrics.rangePct,`20-candle range ≤ ${settings.maxRangePct}%; absolute 20-candle price change ≤ ${settings.maxBaseChangePct}%`,consolidating?'Recent prices form a relatively narrow base.':'The recent price range or price move is too large for this quiet-base checklist.');
  add('contraction','Contracting movement',contracting,metrics.atrContraction,`20-candle range ratio or 14-candle true-range percentage ratio ≤ ${settings.maxContractionRatio} versus the previous window`,contracting?'Range or movement has contracted versus the preceding window.':'No qualifying contraction was observed; zero comparison ranges are unavailable.');
  add('moneyFlow','Positive close-location pressure',positiveFlow,metrics.cmf20,`CMF20 ≥ ${settings.cmfThreshold}`,positiveFlow?'Closes weighted by volume favour the upper parts of candles.':hasVolume?'CMF20 does not meet the positive-pressure threshold.':'CMF20 is unavailable because volume coverage is insufficient.');
  add('obv','Positive directional-volume pressure',positiveObv,metrics.obvPressure,`20-candle signed volume / total volume ≥ ${settings.obvPressureThreshold}`,positiveObv?'More recent volume accompanies rising closes than falling closes.':hasVolume?'Directional-volume pressure does not meet the positive threshold.':'Directional-volume pressure is unavailable because volume coverage is insufficient.');
  add('resistance','Below and near prior resistance',nearResistance,metrics.distanceToResistancePct,`Close 0–${settings.maxDistanceToResistancePct}% below the preceding 20-candle high, excluding the current candle`,nearResistance?'Price remains below and near the observed prior high.':'Price is above prior resistance or farther below it than the configured limit.');
  const breakout=hasVolume&&price>priorResistance*(1+settings.breakoutBufferPct/100)&&rvol>=settings.minBreakoutRvol&&positiveFlow&&positiveObv&&rangePct(priorBase)<=settings.maxRangePct;
  add('breakout','Price/volume breakout',hasVolume?!!breakout:null,metrics.rvol,`Close > prior 20-candle high + ${settings.breakoutBufferPct}%; RVOL ≥ ${settings.minBreakoutRvol}; positive pressure; preceding base range ≤ ${settings.maxRangePct}%`,breakout?'A close beyond the previous base is accompanied by qualifying volume and pressure.':hasVolume?'The complete price/volume breakout checklist is not met.':'Breakout volume confirmation is unavailable.');
  if(!hasVolume)return result('insufficient','Insufficient data',null,metrics,'Usable volume is required for accumulation/distribution screening.');
  const score=(consolidating?20:0)+(contracting?20:0)+(positiveFlow?20:0)+(positiveObv?20:0)+(nearResistance?10:0)+(liquid?10:0);
  if(liquid&&breakout)return result('breakout','Breakout candidate',score,metrics);
  if(liquid&&consolidating&&contracting&&positiveFlow&&positiveObv&&nearResistance)return result('accumulation','Quiet accumulation candidate',score,metrics);
  if(liquid&&cmf20<=-settings.cmfThreshold&&obvPressure<=-settings.obvPressureThreshold)return result('distribution','Distribution pressure',score,metrics);
  return result('none','No clear setup',score,metrics);
}
