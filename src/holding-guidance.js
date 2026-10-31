/** Explain an existing source-gated holding review. No new trade signals or orders. */
const guidanceNumber=value=>typeof value==='number'&&Number.isFinite(value);
const guidancePositive=value=>guidanceNumber(value)&&value>0;
const guidanceText=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):'';
const guidanceList=value=>Array.isArray(value)?value.filter(item=>typeof item==='string').slice(0,8).map(item=>guidanceText(item)):[];
const guidanceProviders=['yahoo','twelvedata','isaham'];
const guidanceClassifications=['stop_breached','target_reached','hold_conditions','review_risk','mixed','plan_incomplete','insufficient','closed'];
const guidanceDisplay=(value,places=4)=>guidanceNumber(value)?Number(value.toFixed(places)).toLocaleString('en-US',{maximumFractionDigits:places}):'unavailable';

/**
 * Converts the reviewed classification into plain-language conditional guidance.
 * The upstream review remains responsible for history validation and freshness;
 * this layer checks identity/reference consistency and never upgrades a failure.
 */
export function buildHoldingGuidance(input={}){
  const {position,review}=input&&typeof input==='object'?input:{};
  const currency=['MYR','USD'].includes(position?.currency)?position.currency:'Quote currency';
  const money=value=>guidancePositive(value)?`${currency} ${guidanceDisplay(value,value<0.01?6:4)}`:'not recorded';
  const classification=guidanceClassifications.includes(review?.classification)?review.classification:'insufficient';
  const frames=Array.isArray(review?.frames)?review.frames:[];
  const available=frames.filter(frame=>frame?.status==='available');
  const reference=review?.priceReference;
  const validIdentity=!!position&&!!review&&typeof position.id==='string'&&position.id!==''&&review.positionId===position.id&&review.symbol===position.symbol&&review.market===position.market&&review.currency===position.currency;
  const referenceFrame=available.find(frame=>frame.timeframe===reference?.timeframe&&frame.lastCandle===reference?.lastCandle);
  const validReference=validIdentity&&guidancePositive(reference?.price)&&guidanceProviders.includes(reference?.provider)&&Number.isFinite(Date.parse(reference?.lastCandle||''))&&referenceFrame?.completedCandles===true&&referenceFrame?.provider===reference.provider&&referenceFrame?.price===reference.price&&available.some(frame=>frame.timeframe==='1day'&&frame.completedCandles===true&&guidanceProviders.includes(frame.provider));
  const closed=validIdentity&&classification==='closed';
  const usable=validReference&&!['insufficient','closed'].includes(classification);
  const price=usable?reference.price:null;
  const plan={};
  for(const key of ['stopPrice','target1','target2'])plan[key]=guidancePositive(review?.plan?.[key])?review.plan[key]:null;
  const stopCrossed=usable&&plan.stopPrice!==null?price<=plan.stopPrice:null;
  const target1Crossed=usable&&plan.target1!==null?price>=plan.target1:null;
  const target2Crossed=usable&&plan.target2!==null?price>=plan.target2:null;
  const pnl=guidanceNumber(review?.pnl?.unrealizedAfterEntryFees)?review.pnl.unrealizedAfterEntryFees:null;
  // A malformed classification cannot manufacture an exit or profit message.
  const consistent=usable&&(classification!=='stop_breached'||stopCrossed===true)&&(classification!=='target_reached'||target1Crossed===true||target2Crossed===true);
  const missing=guidanceList(review?.coverage?.missing);
  const reasons=[],changeOfView=[];
  const caveat='Based on the dated completed reference close. Verify current broker prices and order status; future exit costs and achievable fills are not established.';
  let action={code:'no_recommendation',label:'No supported recommendation',reason:'A matching, usable holding review and completed price reference are required.',conditions:['Correct missing or invalid information, then analyse again.'],caveat};
  if(closed){
    action={code:'closed',label:'Position closed',reason:'The holding review records no remaining shares to assess.',conditions:['Review the realised result. Record any new purchase as a separate buy lot.'],caveat:'This describes your manual records; it does not verify a broker balance.'};
    changeOfView.push('A new purchase creates a new holding to review; a closed record is not reopened automatically.');
  }else if(consistent){
    if(classification==='stop_breached'){
      action={code:pnl===null||pnl===0?'review_exit':pnl<0?'cut_loss':'protect_profit',label:pnl===null||pnl===0?'Review planned exit':pnl<0?'Cut loss — review exit':'Protect profit — review exit',reason:`The reference close ${money(price)} is at or below your recorded protective stop ${money(plan.stopPrice)}.`,conditions:['Review your recorded protective-exit rule promptly against the current broker quote.','Changing style does not move the stop or undo an actual order fill.'],caveat};
      if(pnl!==null)reasons.push(pnl<0?'The remaining holding has an estimated loss after allocated buy fees.':pnl>0?'The remaining holding still has an estimated gain after allocated buy fees, so this is profit protection rather than a cut-loss label.':'The remaining holding is at estimated break-even after allocated buy fees.');
      changeOfView.push(`A later eligible close above ${money(plan.stopPrice)} would change the current threshold comparison; it would not undo an earlier broker execution.`);
    }else if(classification==='target_reached'){
      const target=target2Crossed?plan.target2:plan.target1;
      action={code:pnl!==null&&pnl>0?'take_profit':'review_exit',label:pnl!==null&&pnl>0?'Consider taking profit':'Review planned exit',reason:`The reference close ${money(price)} is at or above your recorded ${target2Crossed?'second':'first'} target ${money(target)}.`,conditions:['Apply the partial or full exit rule you chose; no sale percentage is inferred.','Record a sale only after an actual or paper execution you made.'],caveat};
      if(pnl===null||pnl<=0)reasons.push('A reached target does not establish a profit. Your remaining position is at a loss, break-even or has unavailable cost evidence.');
      changeOfView.push('After a confirmed partial sale, record the quantity and fees, then review the remaining shares.','A later close below the target or weakening trend may change the next review; it does not establish whether an order filled.');
    }else if(classification==='hold_conditions'){
      action={code:'hold',label:'Hold while conditions remain intact',reason:'The recorded stop is intact, no recorded target is reached, and both selected timeframes show a bullish moving-average trend without a negative MACD histogram.',conditions:['Continue monitoring the original risk and exit plan.','Reassess if a recorded threshold is crossed or trend/momentum evidence weakens.'],caveat};
      changeOfView.push(`A reference close at or below your saved stop ${money(plan.stopPrice)} takes priority over favourable trend readings.`);
      if(plan.target1!==null||plan.target2!==null)changeOfView.push('A close at or above a recorded target changes the review to the planned profit/exit decision.');
      changeOfView.push('Bearish or conflicting timeframe evidence weakens the technical hold case.');
    }else if(classification==='review_risk'){
      action={code:'reassess',label:'Reassess the holding',reason:guidanceText(review.summary)||'The selected style has weakening technical evidence.',conditions:['Compare the weaker trend with your original thesis and existing invalidation rule.','Do not widen the stop merely to avoid a loss.'],caveat};
      changeOfView.push('Aligned bullish trends and non-negative MACD readings would strengthen the technical hold case, provided the stop remains intact.','A recorded stop or target crossing takes priority.');
    }else if(classification==='mixed'){
      action={code:'wait_review',label:'Wait / review — evidence mixed',reason:guidanceText(review.summary)||'The selected timeframes do not provide a complete, aligned technical case.',conditions:['Keep the existing risk limits in force while resolving contradictory or missing evidence.','One favourable indicator does not establish confirmation.'],caveat};
      changeOfView.push('Refresh missing histories. A complete aligned review can change the suggested response.','Stop and target comparisons retain priority over a mixed indicator reading.');
    }else if(classification==='plan_incomplete'){
      action={code:'complete_plan',label:'Complete the risk plan',reason:'No numeric protective stop is recorded, so the system cannot determine whether your position risk remains within that plan.',conditions:['Record your own protective stop or define the invalidation rule outside this numeric checklist.','Define how you intend to take profit or otherwise exit; no threshold is invented.'],caveat};
      changeOfView.push('A recorded stop and a fresh review allow the system to compare the holding with that numeric risk plan.');
    }
    reasons.unshift(action.reason,`Reference: ${money(price)}, ${reference.timeframe} candle starting ${guidanceText(reference.lastCandle,60)} from ${guidanceText(reference.provider,30)}.`);
    for(const frame of available.slice(0,2)){
      const indicators=frame.indicators||{};
      reasons.push(`${guidanceText(frame.timeframe,10)}: ${guidanceText(frame.trend,40)} trend; SMA20 ${guidanceDisplay(indicators.sma20)}, SMA50 ${guidanceDisplay(indicators.sma50)}, MACD histogram ${guidanceDisplay(indicators.macdHistogram,6)}.`);
    }
    if(pnl!==null&&pnl<0&&classification!=='stop_breached')reasons.push('A loss relative to entry alone is not a cut-loss trigger in this checklist; the saved stop and technical evidence drive the response.');
  }else if(!closed){
    action.reason=validIdentity&&classification==='insufficient'?guidanceText(review?.summary)||action.reason:'The supplied review is missing, mismatched or inconsistent. No directional response is supported.';
    reasons.push(action.reason);
    changeOfView.push('Correct the holding or data problem and generate a new review. Unavailable evidence cannot be treated as confirmation.');
  }
  if(!closed){
    if(plan.stopPrice===null)missing.push('Protective stop not recorded; no numeric risk limit is inferred.');
    if(plan.target1===null&&plan.target2===null)missing.push('No target levels are recorded; your discretionary profit/exit rule is not evaluated.');
    missing.push('Financial statements, valuation, company news and announcements are not connected.','Spread, liquidity, order status and the exact intraday price path are not assessed.','Wider portfolio exposure, risk tolerance and cash needs are not assessed.','Maximum holding period, trailing-stop formula and partial-sale percentages are not configured.');
    if(position?.style==='long')missing.push('A long-term business thesis must be checked separately; technical strength cannot verify it.');
  }
  const support=guidancePositive(referenceFrame?.levels?.support)?referenceFrame.levels.support:null;
  const current=consistent&&!closed;
  const known=value=>current?value:null;
  const selectedTimeframes=Array.isArray(review?.style?.timeframes)?review.style.timeframes.filter(value=>typeof value==='string'):[];
  const selectedFrames=selectedTimeframes.map(timeframe=>available.find(frame=>frame.timeframe===timeframe));
  const knownTrend=frame=>!!frame&&['Bullish','Bearish','Mixed / Range'].includes(frame.trend)&&guidanceNumber(frame.indicators?.macdHistogram);
  const completeTrendEvidence=selectedFrames.length>=2&&selectedFrames.every(knownTrend);
  // Exit thresholds take action priority, but do not hide concurrent weak evidence.
  const measuredWeakness=selectedFrames.some(frame=>frame&&(['Bearish','Mixed / Range'].includes(frame.trend)||(guidanceNumber(frame.indicators?.macdHistogram)&&frame.indicators.macdHistogram<0)));
  const weakTrend=measuredWeakness?true:completeTrendEvidence?false:null;
  const constructiveHold=stopCrossed===true||target1Crossed===true||target2Crossed===true||weakTrend===true?false:stopCrossed===false&&completeTrendEvidence?true:null;
  const scenarios=closed?[]:[
    {id:'protective-stop',situation:'Price reaches or falls below your protective stop',trigger:plan.stopPrice===null?'Stop not recorded':`Reference close ≤ ${money(plan.stopPrice)}`,response:'Review the planned protective exit. Stop fills and exit prices require broker confirmation.',active:known(stopCrossed)},
    {id:'target-1',situation:'Your first target is reached',trigger:plan.target1===null?'First target not recorded':`Reference close ≥ ${money(plan.target1)}`,response:'Review the partial/full exit rule you chose. Reaching a target does not establish profit or a fill.',active:known(target1Crossed)},
    {id:'target-2',situation:'Your second target is reached',trigger:plan.target2===null?'Second target not recorded':`Reference close ≥ ${money(plan.target2)}`,response:'Review the plan for remaining shares. No quantity or sale percentage is chosen automatically.',active:known(target2Crossed)},
    {id:'constructive-hold',situation:'The technical hold conditions remain intact',trigger:'Stop intact; no recorded target reached; both selected trends bullish; no negative MACD histogram',response:'Monitor the original plan. Reassess when a risk threshold or the trend evidence changes.',active:known(constructiveHold)},
    {id:'estimated-support',situation:'Price loses the estimated chart support',trigger:support===null?'Estimated support unavailable':`Reference close ≤ estimated ${guidanceText(reference?.timeframe,10)} support ${money(support)}`,response:'Review price structure and the original thesis. Estimated support is context; it does not replace or cancel your saved stop.',active:current&&support!==null?price<=support:null},
    {id:'conflicting-trend',situation:'Trend or momentum weakens or disagrees',trigger:'Bearish/mixed timeframe evidence or a negative MACD histogram',response:'Reassess the thesis within the existing risk plan. Avoid treating one positive indicator as confirmation.',active:known(weakTrend)},
    {id:'missing-evidence',situation:'Price history or required context is unavailable',trigger:'Invalid, stale, incomplete or missing required history',response:'Refresh or correct the data. Do not manufacture a hold or exit conclusion from missing evidence.',active:!closed&&(!consistent||(guidanceNumber(review?.coverage?.available)&&guidanceNumber(review?.coverage?.required)&&review.coverage.available<review.coverage.required))},
    {id:'time-or-trailing-rule',situation:'Your planned holding period ends or a trailing rule triggers',trigger:'No maximum holding period or trailing-stop formula is configured',response:'Apply your own documented rule and record any actual sale. The selected style alone is not an automatic deadline or trailing order.',active:null},
    {id:'business-or-execution-change',situation:'News, earnings, business risks, gaps or liquidity change',trigger:'These facts are not connected; current broker and company sources are needed',response:'Review those sources separately. The technical report cannot determine whether the business thesis or execution conditions remain sound.',active:null}
  ];
  return {action,reasons:reasons.slice(0,7),changeOfView,scenarios,missing:[...new Set(missing)],scope:'Conditional technical guidance from the supplied dated review and your saved plan. The current action uses data-quality gates, stop/target thresholds, SMA20/SMA50 trend and MACD. RSI, ATR, RVOL, SMA200 and estimated support/resistance provide context rather than additional current-action triggers. This is a finite set of common checks, not every possible situation or a guarantee of profit.'};
}
