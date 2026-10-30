/**
 * A compact research report over independently fetched, completed provider bars.
 * No network calls, predictions or new indicator calculations occur here.
 *
 * buildDeepReport({symbol, market, frames, generatedAt, mode, strategy})
 * frames: [{timeframe:'1day'|'4h'|'1h', bars, meta, analysis, error?,
 *           accumulation?, sizedPlans?}]. `analysis` comes from analyse(bars).
 * Optional daily `accumulation` comes from evaluateAccumulation(bars); optional
 * `sizedPlans` are sizePosition results (or {position: result}) in analysis.plans order. They are never
 * inferred when absent. The caller must render all returned text as plain text.
 */
const DEEP_TIMEFRAMES=['1day','4h','1h'];
const DEEP_FRAME_NAMES={'1day':'Daily','4h':'4H','1h':'1H'};
const DEEP_PROVIDERS=['yahoo','twelvedata','isaham'];
const deepNumber=value=>typeof value==='number'&&Number.isFinite(value);
const deepRound=value=>deepNumber(value)?Number(value.toFixed(6)):null;
const deepText=(value,limit=300)=>typeof value==='string'?value.slice(0,limit):'';
const deepLast=values=>Array.isArray(values)?values.at(-1):null;
const deepIso=seconds=>deepNumber(seconds)&&Math.abs(seconds)<8640000000000?new Date(seconds*1000).toISOString():null;

function deepPlan(plan,sized){
  if(!plan||plan.valid!==true||!['entry','stop','tp1','tp2','tp3'].every(key=>deepNumber(plan[key]))||plan.stop<0||plan.entry<=plan.stop||plan.tp1<=plan.entry||plan.tp2<=plan.tp1||plan.tp3<=plan.tp2)return null;
  const result={id:deepText(plan.id,30),label:deepText(plan.label,80),entry:deepRound(plan.entry),stop:deepRound(plan.stop),targets:[plan.tp1,plan.tp2,plan.tp3].map(deepRound),conditions:deepText(plan.conditions,600),description:deepText(plan.description,400),riskPerShare:deepRound(plan.entry-plan.stop),grossRewardRisk:[plan.tp1,plan.tp2,plan.tp3].map(price=>deepRound((price-plan.entry)/(plan.entry-plan.stop))),sizing:null};
  // Results already include user settings, commissions, FX and lot constraints.
  // Never fabricate a position quantity from an absent or malformed size model.
  if(sized&&deepNumber(sized.qty)&&Number.isInteger(sized.qty)&&sized.qty>=0&&['riskLimit','budget','estimatedLoss','cost'].every(key=>deepNumber(sized[key])&&sized[key]>=0))result.sizing={qty:sized.qty,riskLimit:deepRound(sized.riskLimit),budget:deepRound(sized.budget),estimatedLoss:deepRound(sized.estimatedLoss),cost:deepRound(sized.cost),netRewardRisk:[sized.rr1,sized.rr2].map(deepRound),message:deepText(sized.message,350)};
  return result;
}

function deepAccumulation(value){
  if(!value||!['accumulation','breakout','distribution','none','insufficient'].includes(value.classification))return null;
  const metrics={};
  for(const key of ['cmf20','obvPressure','rvol','rangePct','rangeContraction','atrContraction','averageVolume','averageTurnover','priorResistance','distanceToResistancePct'])metrics[key]=deepRound(value.metrics?.[key]);
  return {classification:value.classification,status:deepText(value.status,100),score:deepNumber(value.score)&&value.score>=0&&value.score<=100?value.score:null,metrics,conditions:(Array.isArray(value.conditions)?value.conditions:[]).slice(0,15).map(condition=>({id:deepText(condition.id,40),label:deepText(condition.label,100),met:typeof condition.met==='boolean'?condition.met:null,reason:deepText(condition.reason,350),rule:deepText(condition.rule,350)})),warnings:['Price/volume pressure cannot identify buyers or sellers, establish institutional intent, or prove accumulation.','The checklist has not been backtested and is not a probability of profit.']};
}

function deepFrame(input,timeframe,nowSeconds){
  const base={timeframe,label:DEEP_FRAME_NAMES[timeframe],status:'unavailable',reason:'This timeframe has not been loaded.',provider:null,timezone:null,fetchedAt:null,lastCandle:null,completedCandles:false,completionInferred:false,ageDays:null,barsUsed:0,trend:null,score:null,verdict:null,price:null,indicators:null,levels:null,coverage:null,supporting:[],contrary:[],observations:[],warnings:[],evidence:[],plans:[],accumulation:null};
  if(!input)return base;
  const invalid=(status,reason)=>({...base,status,reason});
  if(input.error)return invalid('error',deepText(typeof input.error==='string'?input.error:input.error.message,350)||'Market-data request failed.');
  const {meta,bars,analysis}=input;
  if(!meta||!DEEP_PROVIDERS.includes(meta.provider))return invalid('unverified','A recognised provider source is required. Demo and unverified CSV data are excluded.');
  base.provider=meta.provider;base.timezone=deepText(meta.timezone,80)||null;base.fetchedAt=deepText(meta.fetchedAt,60)||null;
  if(meta.interval!==timeframe)return invalid('invalid','The provider interval does not match this report timeframe.');
  if(meta.completedCandles!==true)return invalid('incomplete','The gateway cannot establish completed candles for this timeframe.');
  base.completedCandles=true;base.completionInferred=meta.completionInferred===true;
  if(meta.instrumentType&&!['EQUITY','ETF'].includes(String(meta.instrumentType).toUpperCase()))return invalid('unsupported','This instrument is not an eligible stock or ETF.');
  if(!Array.isArray(bars)||bars.length<55)return invalid('insufficient','At least 55 completed candles are required for technical analysis.');
  base.barsUsed=bars.length;
  let previous=0;
  for(const bar of bars){
    if(!bar||!['time','open','high','low','close'].every(key=>deepNumber(bar[key]))||bar.time<=previous||bar.time<=0||bar.open<=0||bar.close<=0||bar.low<=0||bar.high<bar.low||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close)||(bar.volume!==undefined&&(!deepNumber(bar.volume)||bar.volume<0)))return invalid('invalid','History contains invalid, unordered or duplicate candles.');
    previous=bar.time;
  }
  const last=bars.at(-1);base.lastCandle=deepIso(last.time);base.ageDays=deepRound((nowSeconds-last.time)/86400);
  if(!base.lastCandle||last.time>nowSeconds)return invalid('invalid','A candle timestamp is in the future or outside the supported date range.');
  // A seven-calendar-day guard tolerates weekends without pretending to model
  // exchange calendars. This is a stale-history limit, not a latest-trade claim.
  if(nowSeconds-last.time>7*86400)return invalid('stale','The latest candle is older than seven calendar days. Refresh before using this report.');
  if(!analysis||!deepNumber(analysis.price)||analysis.price!==last.close||!Array.isArray(analysis.candles)||analysis.candles.length!==bars.length||analysis.candles.some((bar,index)=>!bar||['time','open','high','low','close','volume'].some(key=>(bar[key]??null)!==(bars[index][key]??null))))return invalid('invalid','Technical calculations do not match the supplied provider history.');
  if(!['Bullish','Bearish','Mixed / Range'].includes(analysis.trend)||!deepNumber(deepLast(analysis.sma20))||!deepNumber(deepLast(analysis.sma50))||!analysis.ratingCoverage||!deepNumber(analysis.ratingCoverage.availableWeight)||!deepNumber(analysis.ratingCoverage.selectedWeight))return invalid('insufficient','The technical calculation is missing required trend or rating coverage.');
  base.status='available';base.reason='Completed provider candles passed source, interval, price and freshness checks.';
  base.price=deepRound(analysis.price);base.trend=analysis.trend;base.score=deepNumber(analysis.score)&&analysis.score>=0&&analysis.score<=100?analysis.score:null;base.verdict=deepText(analysis.verdict,120);
  base.indicators={sma20:deepRound(deepLast(analysis.sma20)),sma50:deepRound(deepLast(analysis.sma50)),sma200:deepRound(deepLast(analysis.sma200)),rsi14:deepRound(analysis.rsi),macdHistogram:deepRound(analysis.macd),rvol:deepRound(analysis.rvol),atr14:deepRound(analysis.atr),atrPct:analysis.price>0&&deepNumber(analysis.atr)?deepRound(analysis.atr/analysis.price*100):null};
  const support=analysis.levels?.support,resistance=analysis.levels?.resistance;
  base.levels={support:deepNumber(support)&&support>0?deepRound(support):null,resistance:deepNumber(resistance)&&resistance>0?deepRound(resistance):null};
  base.coverage={availableWeight:analysis.ratingCoverage.availableWeight,selectedWeight:analysis.ratingCoverage.selectedWeight,sma200:base.indicators.sma200!==null,volume:analysis.hasVolume===true,fundamentals:false,news:false,benchmark:false};
  if(analysis.trend==='Bullish')base.supporting.push('Close is above SMA20 and SMA20 is above SMA50.');
  else if(analysis.trend==='Bearish')base.contrary.push('Close is below SMA20 and SMA20 is below SMA50.');
  else base.observations.push('Price and short/medium moving averages show a mixed or ranging trend.');
  if(deepNumber(analysis.macd)){
    if(analysis.macd>0)base.supporting.push('MACD histogram is positive; momentum is above its signal line.');
    else if(analysis.macd<0)base.contrary.push('MACD histogram is negative; momentum is below its signal line.');
    else base.observations.push('MACD histogram is zero; no positive or negative histogram bias.');
  }
  if(base.indicators.sma200!==null){
    if(analysis.price>deepLast(analysis.sma200))base.supporting.push('Close is above SMA200.');
    else if(analysis.price<deepLast(analysis.sma200))base.contrary.push('Close is below SMA200.');
    else base.observations.push('Close equals SMA200.');
  }else base.warnings.push('SMA200 is unavailable; longer-term trend coverage is limited.');
  const low=analysis.strategy?.rsiLow,high=analysis.strategy?.rsiHigh;
  if(deepNumber(analysis.rsi)&&deepNumber(low)&&deepNumber(high))base.observations.push(`RSI14 is ${deepRound(analysis.rsi)}; your preferred band is ${low}–${high}. This band is a strategy preference.`);
  if(analysis.hasVolume!==true)base.warnings.push('Usable volume is missing; volume confirmation is unavailable.');
  else if(deepNumber(analysis.rvol))base.observations.push(`RVOL is ${deepRound(analysis.rvol)} times the preceding 20 positive-volume average. Volume alone does not establish buying direction.`);
  if(analysis.ratingCoverage.availableWeight<analysis.ratingCoverage.selectedWeight)base.warnings.push('Some selected indicators are unavailable and excluded from the normalised rating.');
  if(meta.completionInferred)base.warnings.push('Candle completion is inferred by the gateway and is not guaranteed by the provider.');
  base.warnings.push('The latest candle is a completed historical bar, not a live trade. Stop fills and target prices are not guaranteed.');
  base.plans=(Array.isArray(analysis.plans)?analysis.plans:[]).map((plan,index)=>deepPlan(plan,input.sizedPlans?.[index]?.position??input.sizedPlans?.[index])).filter(Boolean);
  if(timeframe==='1day')base.accumulation=deepAccumulation(input.accumulation);
  base.evidence=['supporting','contrary','observations'].flatMap(kind=>base[kind].map((text,index)=>({id:`${timeframe}:${kind}:${index+1}`,kind,text})));
  return base;
}

/** Return a source-gated report; valid timeframes remain usable after partial failures. */
export function buildDeepReport({symbol='',market='',frames=[],generatedAt=new Date().toISOString(),mode='swing',strategy=null}={}){
  const now=Date.parse(generatedAt);
  if(!Number.isFinite(now))throw new Error('A valid report generation timestamp is required.');
  const inputs=Array.isArray(frames)?frames:[];
  const reports=DEEP_TIMEFRAMES.map(timeframe=>{
    const matches=inputs.filter(frame=>frame?.timeframe===timeframe);
    return deepFrame(matches.length>1?{error:'Duplicate timeframe inputs; this timeframe was excluded.'}:matches[0],timeframe,now/1000);
  });
  const usable=reports.filter(frame=>frame.status==='available'),up=usable.filter(frame=>frame.trend==='Bullish'),down=usable.filter(frame=>frame.trend==='Bearish'),mixed=usable.filter(frame=>frame.trend==='Mixed / Range');
  let alignment='unavailable',summary='No verified timeframe is available. Load completed provider candles before drawing a technical conclusion.';
  if(usable.length){
    if(up.length&&down.length){alignment='conflicting';summary='Timeframes disagree: bullish and bearish trend evidence coexist. A higher-timeframe trend and a lower-timeframe entry may be out of step.';}
    else if(usable.length<3){alignment='partial';summary='Only part of the daily / 4H / 1H picture is available. Do not describe the missing timeframes as confirming the thesis.';}
    else if(up.length===3){alignment='bullish';summary='Daily, 4H and 1H all show a bullish moving-average trend. This alignment does not confirm an entry or establish expected returns.';}
    else if(down.length===3){alignment='bearish';summary='Daily, 4H and 1H all show a bearish moving-average trend. A new long thesis would need evidence of a change in conditions.';}
    else {alignment='mixed';summary='The available timeframes include mixed or ranging trend readings. Directional confirmation is incomplete.';}
  }
  const supporting=usable.flatMap(frame=>frame.supporting.map(text=>`${frame.label}: ${text}`));
  const contrary=usable.flatMap(frame=>frame.contrary.map(text=>`${frame.label}: ${text}`));
  const daily=reports.find(frame=>frame.timeframe==='1day');
  if(daily.accumulation?.classification==='distribution')contrary.push('Daily: the configured price/volume checklist indicates distribution pressure; it does not identify investor intent.');
  if(['accumulation','breakout'].includes(daily.accumulation?.classification))supporting.push(`Daily: ${daily.accumulation.status.toLowerCase()} under the configured checklist; this hypothesis is unvalidated.`);
  const missingInputs=reports.filter(frame=>frame.status!=='available').map(frame=>`${frame.label}: ${frame.reason}`);
  missingInputs.push('Financial statements, valuation, company announcements, news and sector/market benchmarks are not connected to this technical report.');
  return {version:1,symbol:deepText(symbol&&typeof symbol==='object'?symbol.symbol:symbol,40),market:deepText(market,20),generatedAt:new Date(now).toISOString(),mode:deepText(mode,40),strategy:{name:deepText(typeof strategy==='string'?strategy:strategy?.name,80)||'Selected technical strategy'},status:usable.length===3?'complete':usable.length?'partial':'unavailable',alignment,summary,counts:{available:usable.length,total:3,bullish:up.length,bearish:down.length,mixed:mixed.length},frames:reports,evidence:usable.flatMap(frame=>frame.evidence),supporting,contrary,missingInputs,nextChecks:[!usable.length?'Load verified completed candles before assessing any technical scenario.':alignment==='conflicting'?'Resolve the timeframe conflict before treating a lower-timeframe move as confirmation.':'Check price reaction at the stated support or resistance before treating a conditional scenario as active.','Compare entry, stop and targets against fees, slippage, liquidity and your own risk settings.','Verify company announcements and upcoming events before making a decision.'],limitations:['Technical scores are weighted checklists, not probabilities, expected returns or evidence of a profitable strategy.','Freshness uses a seven-calendar-day limit, not a complete exchange holiday calendar. Candle timestamps identify bar starts.','These rules have not been backtested. Track paper decisions and realised results, including costs, to assess usefulness.']};
}
