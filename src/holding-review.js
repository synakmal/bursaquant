/**
 * Conditional review of a manually recorded long stock/ETF position.
 * Calculations and provider requests are supplied by the caller. No orders,
 * model calls, stop changes or target changes occur in this module.
 *
 * Stop execution is never inferred from a candle or guaranteed at the stop:
 * https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15
 */
export const HOLDING_STYLES=Object.freeze({
  short:Object.freeze({id:'short',label:'Short term · days',engineStyle:'swing',timeframes:Object.freeze(['1day','1h'])}),
  swing:Object.freeze({id:'swing',label:'Swing · days to weeks',engineStyle:'medium',timeframes:Object.freeze(['1day','4h'])}),
  long:Object.freeze({id:'long',label:'Long term · months+',engineStyle:'invest',timeframes:Object.freeze(['1day','1week'])})
});
const holdingNumber=value=>typeof value==='number'&&Number.isFinite(value);
const holdingText=(value,length=300)=>typeof value==='string'?value.slice(0,length):'';
const holdingRound=value=>holdingNumber(value)?Number(value.toFixed(6)):null;
const holdingLast=values=>Array.isArray(values)?values.at(-1):null;
const holdingDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const holdingIso=seconds=>holdingNumber(seconds)&&seconds>0&&seconds<8640000000000?new Date(seconds*1000).toISOString():null;
const holdingTicker=(value,market)=>String(value||'').toUpperCase().replace(market==='MY'?/\.KL$/:/\./g,market==='MY'?'':'-');

function holdingExchangeDate(seconds,timezone){
  try{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(seconds*1000)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }catch{return null;}
}

function holdingFrame(input,timeframe,position,nowSeconds){
  const result={timeframe,status:'unavailable',reason:'This timeframe was not supplied.',provider:null,timezone:null,completedCandles:false,completionInferred:false,price:null,lastCandle:null,fetchedAt:null,trend:null,indicators:null,levels:null,warnings:[]};
  const reject=(status,reason)=>({...result,status,reason});
  if(!input)return result;
  if(input.error)return reject('error',holdingText(typeof input.error==='string'?input.error:input.error.message,350)||'The provider request failed.');
  const {bars,meta,analysis}=input;
  if(!meta||!['yahoo','twelvedata','isaham'].includes(meta.provider))return reject('unverified','A recognised provider source is required. Demo and imported candles cannot review a holding.');
  result.provider=meta.provider;
  if(meta.interval!==timeframe)return reject('invalid','The provider interval does not match the selected holding style.');
  if(meta.completedCandles!==true)return reject('incomplete','Completed provider candles have not been established.');
  result.completedCandles=true;result.completionInferred=meta.provider==='yahoo'||meta.completionInferred===true;
  if(!meta.symbol||holdingTicker(meta.symbol,position.market)!==holdingTicker(position.symbol,position.market))return reject('invalid','The provider symbol does not match this holding.');
  if(meta.currency&&meta.currency!==position.currency)return reject('invalid','The provider currency does not match this holding.');
  if(meta.instrumentType&&!['EQUITY','ETF'].includes(String(meta.instrumentType).toUpperCase()))return reject('unsupported','The provider identifies an instrument outside this stock/ETF model.');
  if(!Array.isArray(bars)||bars.length<55||bars.length>5000)return reject('insufficient','At least 55 valid completed candles are required for this timeframe.');
  let previous=0;
  for(const bar of bars){
    if(!bar||!['time','open','high','low','close'].every(key=>holdingNumber(bar[key]))||bar.time<=previous||bar.time<=0||bar.open<=0||bar.close<=0||bar.low<=0||bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close)||(bar.volume!==undefined&&(!holdingNumber(bar.volume)||bar.volume<0)))return reject('invalid','The history contains invalid, duplicated or unordered candles.');
    previous=bar.time;
  }
  const last=bars.at(-1),maxAge=timeframe==='1week'?14*86400:7*86400;
  result.lastCandle=holdingIso(last.time);
  result.timezone=holdingText(meta.timezone,80)|| (position.market==='MY'?'Asia/Kuala_Lumpur':'America/New_York');
  if(!result.lastCandle||last.time>nowSeconds)return reject('invalid','A provider candle has a future or unsupported timestamp.');
  if(nowSeconds-last.time>maxAge)return reject('stale',`The latest ${timeframe==='1week'?'weekly bar start is older than 14':'bar start is older than seven'} calendar days. Refresh the history before interpreting it.`);
  if(!holdingExchangeDate(last.time,result.timezone))return reject('invalid','The exchange timezone is not usable.');
  if(!analysis||analysis.price!==last.close||!Array.isArray(analysis.candles)||analysis.candles.length!==bars.length||analysis.candles.some((bar,index)=>!bar||['time','open','high','low','close','volume'].some(key=>(bar[key]??null)!==(bars[index][key]??null))))return reject('invalid','The supplied technical calculations do not match this history.');
  if(!['Bullish','Bearish','Mixed / Range'].includes(analysis.trend)||!holdingNumber(holdingLast(analysis.sma20))||!holdingNumber(holdingLast(analysis.sma50)))return reject('insufficient','Required moving-average evidence is missing.');
  const ma20=holdingLast(analysis.sma20),ma50=holdingLast(analysis.sma50),expectedTrend=last.close>ma20&&ma20>ma50?'Bullish':last.close<ma20&&ma20<ma50?'Bearish':'Mixed / Range';
  if(analysis.trend!==expectedTrend)return reject('invalid','The technical trend label conflicts with the supplied price and moving averages.');
  result.status='available';result.reason='Provider source, interval, completion, symbol, history and freshness checks passed.';
  result.price=last.close;result.trend=analysis.trend;result.fetchedAt=holdingText(meta.fetchedAt||meta.retrievedAt,60)||null;result.barsUsed=bars.length;
  result.indicators={sma20:holdingRound(holdingLast(analysis.sma20)),sma50:holdingRound(holdingLast(analysis.sma50)),sma200:holdingRound(holdingLast(analysis.sma200)),rsi14:holdingRound(analysis.rsi),macdHistogram:holdingNumber(analysis.macd)?analysis.macd:null,atr14:holdingRound(analysis.atr),rvol:holdingRound(analysis.rvol)};
  result.levels={support:holdingNumber(analysis.levels?.support)&&analysis.levels.support>0?holdingRound(analysis.levels.support):null,resistance:holdingNumber(analysis.levels?.resistance)&&analysis.levels.resistance>0?holdingRound(analysis.levels.resistance):null};
  if(result.completionInferred)result.warnings.push('Candle completion is inferred by the gateway, not guaranteed by Yahoo or the provider.');
  if(result.indicators.sma200===null)result.warnings.push('SMA200 is unavailable; longer-term technical coverage is limited.');
  if(analysis.hasVolume!==true)result.warnings.push('Reliable volume confirmation is unavailable.');
  if(['1h','4h'].includes(timeframe))result.warnings.push('Intraday/session volume can vary by time of day and bar duration; RVOL is not normalised for those differences.');
  if(timeframe==='1week')result.warnings.push('Weekly candle timestamps are bar starts; up to 14 calendar days is allowed for this completed weekly context. Daily history supplies the position price reference.');
  return result;
}

function holdingQuantities(position){
  if(!holdingNumber(position.quantity)||!Number.isSafeInteger(position.quantity)||position.quantity<=0||!holdingNumber(position.entryPrice)||position.entryPrice<=0||!holdingNumber(position.entryFees)||position.entryFees<0)return null;
  const exits=position.exits??[];
  if(!Array.isArray(exits))return null;
  let sold=0;
  for(const exit of exits){
    if(!exit||!holdingNumber(exit.quantity)||!Number.isSafeInteger(exit.quantity)||exit.quantity<=0||!holdingNumber(exit.price)||exit.price<0||!holdingNumber(exit.fees)||exit.fees<0||!holdingDate(exit.date)||exit.date<position.entryDate)return null;
    sold+=exit.quantity;
  }
  if(sold>position.quantity)return null;
  return {remaining:position.quantity-sold,remainingEntryFees:position.entryFees*(position.quantity-sold)/position.quantity};
}

/** Use recorded plan thresholds and the selected style's latest completed close. */
export function reviewHolding({position,frames=[],generatedAt=new Date().toISOString()}={}){
  const now=Date.parse(generatedAt);
  if(!Number.isFinite(now))throw new Error('A valid holding-review generation timestamp is required.');
  const chosen=HOLDING_STYLES[position?.style],profile=chosen||HOLDING_STYLES.swing;
  const base={version:1,positionId:holdingText(position?.id,80),symbol:holdingText(position?.symbol,32),market:holdingText(position?.market,10),currency:holdingText(position?.currency,10),tradeType:position?.tradeType==='paper'?'paper':'actual',classification:'insufficient',label:'No conclusion',summary:'Valid position details and fresh completed daily history are required.',generatedAt:new Date(now).toISOString(),style:{...profile,timeframes:[...profile.timeframes]},priceReference:null,frames:[],evidence:[],risks:[],nextChecks:[],plan:{stopPrice:null,target1:null,target2:null,stopBreached:false,target1Reached:false,target2Reached:false},pnl:null,coverage:{available:0,required:profile.timeframes.length,missing:[],fundamentals:false,news:false,corporateActions:false}};
  const riskNotes=['This review compares completed historical closes, not a live executable quote. A stop or target crossing does not establish an order fill.','A completed daily close supplies the full regular-session reference. Intraday context supplies the reference only when its exchange date is later than the completed daily candle. Displayed candle timestamps are bar starts, not exact trade or execution times.','Verify current broker quotes and announcements before deciding. Gaps, slippage and available liquidity can change an exit price.','P/L assumes your recorded quantity and entry cost reflect splits and other corporate actions. Broker records and these provider prices are not reconciled automatically.','Changing trading style never changes your recorded stop or targets. No averaging down or target extension is assumed.'];
  const finish=(classification,label,summary)=>({...base,classification,label,summary});
  if(!position||!chosen||!['MY','US'].includes(position.market)||position.currency!==(position.market==='MY'?'MYR':'USD')||!['Stock','ETF'].includes(position.assetType)||!holdingDate(position.entryDate)||!(/^[A-Z0-9][A-Z0-9.-]{0,31}$/i.test(position.symbol||'')))return finish('insufficient','No conclusion','Position details or trading style are invalid; review the manual record.');
  const quantities=holdingQuantities(position);
  if(!quantities)return finish('insufficient','No conclusion','Position quantity, entry costs or recorded exits are invalid; correct the manual record first.');
  if(quantities.remaining===0)return finish('closed','Position closed','No remaining shares are recorded. Review the realised trade record instead of requesting a holding action.');
  for(const key of ['stopPrice','target1','target2']){
    const value=position[key];
    if(value!==undefined&&value!==null&&(!holdingNumber(value)||value<=0))return finish('insufficient','No conclusion','A recorded stop or target is invalid; correct the manual plan first.');
    base.plan[key]=holdingNumber(value)?value:null;
  }
  if(base.plan.target1!==null&&base.plan.target2!==null&&base.plan.target2<=base.plan.target1)return finish('insufficient','No conclusion','The second target must be above the first target. Correct the manual plan first.');
  base.risks.push(...riskNotes);
  const inputs=Array.isArray(frames)?frames:[];
  base.frames=profile.timeframes.map(timeframe=>{const matches=inputs.filter(frame=>frame?.timeframe===timeframe);return holdingFrame(matches.length>1?{error:'Duplicate timeframe inputs were excluded.'}:matches[0],timeframe,position,now/1000);});
  base.coverage.available=base.frames.filter(frame=>frame.status==='available').length;
  base.coverage.missing=base.frames.filter(frame=>frame.status!=='available').map(frame=>`${frame.timeframe}: ${frame.reason}`);
  const daily=base.frames.find(frame=>frame.timeframe==='1day'),context=base.frames.find(frame=>frame.timeframe!== '1day');
  if(daily.status!=='available'){
    base.nextChecks.push('Load fresh completed daily candles for this symbol before comparing the holding with a stop, target or profit/loss.');
    return finish('insufficient','No conclusion','Fresh completed daily anchor history is unavailable. Other timeframes cannot substitute for that required history.');
  }
  // A current intraday close must not be hidden behind yesterday's daily close.
  // On the same exchange date the completed daily bar covers the full regular
  // session, so a later intraday start cannot replace that completed close.
  // Weekly context never supplies the position price reference.
  const dailyDate=holdingExchangeDate(Date.parse(daily.lastCandle)/1000,daily.timezone);
  const eligibleIntraday=base.frames.filter(frame=>frame.status==='available'&&['1h','4h'].includes(frame.timeframe)&&holdingExchangeDate(Date.parse(frame.lastCandle)/1000,frame.timezone)>dailyDate).sort((a,b)=>Date.parse(b.lastCandle)-Date.parse(a.lastCandle));
  const reference=eligibleIntraday[0]||daily;
  const referenceDate=holdingExchangeDate(Date.parse(reference.lastCandle)/1000,reference.timezone);
  const referenceLabel=reference.timeframe==='1day'?'daily':reference.timeframe.toUpperCase();
  if(referenceDate<position.entryDate){
    base.nextChecks.push('Wait for a completed reference candle dated on or after the recorded entry date, then analyse again.');
    return finish('insufficient','No conclusion','The latest eligible completed reference candle predates your recorded entry date. It cannot describe this position after entry.');
  }
  if(position.entryDate>holdingExchangeDate(now/1000,reference.timezone))return finish('insufficient','No conclusion','The recorded entry date is in the future for this exchange. Correct the manual record.');
  base.priceReference={price:reference.price,timeframe:reference.timeframe,lastCandle:reference.lastCandle,exchangeDate:referenceDate,timezone:reference.timezone,provider:reference.provider,fetchedAt:reference.fetchedAt,completionInferred:reference.completionInferred};
  const price=reference.price,gross=(price-position.entryPrice)*quantities.remaining;
  base.pnl={remainingQuantity:quantities.remaining,entryPrice:position.entryPrice,lastClose:price,unrealizedGross:holdingRound(gross),unrealizedAfterEntryFees:holdingRound(gross-quantities.remainingEntryFees),changePct:holdingRound((price/position.entryPrice-1)*100)};
  base.evidence.push(`The latest eligible completed reference is the ${referenceLabel} close of ${price} ${position.currency}, for the candle beginning ${reference.lastCandle}.`,`The recorded entry is ${position.entryPrice} ${position.currency}; ${quantities.remaining} shares remain.`);
  base.risks.push('Entry dates have day precision only. Exact execution time and intraday movement after the fill are not established. Unrealised P/L excludes future exit fees, taxes and slippage.');
  if(base.plan.stopPrice!==null){base.plan.stopBreached=price<=base.plan.stopPrice;base.evidence.push(`Your recorded stop is ${base.plan.stopPrice} ${position.currency}; the ${referenceLabel} reference close is ${base.plan.stopBreached?'at or below':'above'} it.`);}
  else base.risks.push('No protective stop is recorded. This review cannot establish that your position-risk plan remains intact.');
  for(const key of ['target1','target2'])if(base.plan[key]!==null){base.plan[key+'Reached']=price>=base.plan[key];base.evidence.push(`Your recorded ${key==='target1'?'first':'second'} target is ${base.plan[key]} ${position.currency}; the ${referenceLabel} reference close is ${base.plan[key+'Reached']?'at or above':'below'} it.`);}
  if(base.plan.target1===null&&base.plan.target2===null)base.risks.push('No profit-taking target is recorded. A target or discretionary exit rule must come from your own plan.');
  if([base.plan.target1,base.plan.target2].some(target=>target!==null&&target<position.entryPrice+position.entryFees/position.quantity))base.risks.push('A recorded target is below the entry cost including buy fees. Reaching it does not necessarily produce a profit.');
  for(const frame of base.frames.filter(frame=>frame.status==='available')){
    base.evidence.push(`${frame.timeframe}: ${frame.trend} moving-average trend; MACD histogram ${frame.indicators.macdHistogram===null?'unavailable':frame.indicators.macdHistogram}.`);
    base.risks.push(...frame.warnings.map(warning=>`${frame.timeframe}: ${warning}`));
  }
  base.nextChecks.push('Check current broker prices and the recorded stop/target conditions before acting.','Record any actual partial or full sale manually; this review never closes a holding or sends an order.');
  if(profile.id==='long'){
    base.risks.push('Financial statements, valuation, dividends and your investment thesis are not verified by this technical review. Technical strength alone cannot establish that a long-term investment thesis remains sound.');
    base.nextChecks.push('For a long-term position, separately review the latest financial results and whether the original investment thesis has changed.');
  }
  if(base.plan.stopBreached){
    base.nextChecks.unshift(`Your recorded stop condition has been breached on the ${referenceLabel} reference close. Review your exit plan promptly; switching style does not remove that recorded breach.`);
    return finish('stop_breached','Stop breached — review exit',`The completed ${referenceLabel} reference close is at or below your recorded stop. Review the planned exit and current broker price; no stop fill or achievable exit price is assumed.`);
  }
  if(base.plan.target1Reached||base.plan.target2Reached){
    base.nextChecks.unshift('Review the recorded target/exit rule and whether a partial or full exit was planned. Record an actual fill separately.');
    return finish('target_reached',gross-quantities.remainingEntryFees>0?'Target reached — review taking profit':'Target reached — review planned exit',`The completed ${referenceLabel} reference close is at or above your recorded ${base.plan.target2Reached?'second':'first'} target. Review the planned exit decision; this does not establish that a target order filled.`);
  }
  if(base.plan.stopPrice===null)return finish('plan_incomplete','Risk plan incomplete','Add your own protective stop or explicit invalidation plan before treating a technical reading as a reason to keep holding. No stop has been invented.');
  if(context?.status!=='available')return finish('mixed','Review / evidence incomplete',`Your recorded stop and targets have not been crossed on the ${referenceLabel} reference close, but the selected style has incomplete timeframe evidence. A hold condition cannot be confirmed.`);
  const styleTrend=context.trend,negativeMomentum=base.frames.some(frame=>frame.status==='available'&&holdingNumber(frame.indicators.macdHistogram)&&frame.indicators.macdHistogram<0);
  if(styleTrend==='Bearish'){
    base.nextChecks.unshift('Review the weakening trend against the original thesis and your existing invalidation rule; do not widen the recorded stop automatically.');
    return finish('review_risk','Review holding risk',`${context.timeframe} context for your ${profile.label.toLowerCase()} style has a bearish moving-average trend. The ${referenceLabel} reference close has not breached your recorded stop or reached a target; review the thesis and existing exit conditions.`);
  }
  if(daily.trend==='Bullish'&&styleTrend==='Bullish'&&!negativeMomentum)return finish('hold_conditions','Technical hold conditions intact',`The ${referenceLabel} reference close remains above your recorded stop and below any recorded targets. Both selected timeframes have bullish moving-average trends without a negative MACD histogram. Continue monitoring the existing plan; this is conditional technical evidence, not a forecast.`);
  return finish('mixed','Review / evidence mixed',`Your recorded stop and targets have not been crossed on the ${referenceLabel} reference close, while trend or momentum evidence is mixed. Review the original thesis and wait for clearer evidence within your recorded risk plan.`);
}
