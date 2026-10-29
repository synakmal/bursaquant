/** Pure Yahoo chart parsing and conservative completed-candle selection. */
export const INTERVALS = Object.freeze({
  '5min': {yahooInterval:'5m',yahooRange:'1mo',sourceInterval:'5min',label:'5m'},
  '15min': {yahooInterval:'15m',yahooRange:'1mo',sourceInterval:'15min',label:'15m'},
  '30min': {yahooInterval:'30m',yahooRange:'1mo',sourceInterval:'30min',label:'30m'},
  '1h': {yahooInterval:'1h',yahooRange:'2y',sourceInterval:'1h',label:'1H'},
  '4h': {yahooInterval:'1h',yahooRange:'2y',sourceInterval:'1h',label:'4H'},
  '1day': {yahooInterval:'1d',yahooRange:'5y',sourceInterval:'1day',label:'Daily'},
  '1week': {yahooInterval:'1wk',yahooRange:'5y',sourceInterval:'1week',label:'Weekly'},
  '1month': {yahooInterval:'1mo',yahooRange:'20y',sourceInterval:'1month',label:'Monthly'},
  '3month': {yahooInterval:'1mo',yahooRange:'20y',sourceInterval:'1month',label:'Quarterly'}
});

function invalid(message, code='YAHOO_INVALID_DATA') {
  return Object.assign(new Error(message), {code});
}

export function normalizeBars(rows) {
  if (!Array.isArray(rows)) return [];
  const byTime = new Map();
  for (const row of rows) {
    if (!row || ['time','open','high','low','close'].some(k=>row[k]===null||row[k]===undefined||row[k]==='')) continue;
    const bar = Object.fromEntries(['time','open','high','low','close'].map(k=>[k,Number(row[k])]));
    bar.volume = row.volume===null||row.volume===undefined ? 0 : Number(row.volume);
    if (!Object.values(bar).every(Number.isFinite) || !Number.isInteger(bar.time) || bar.time<=0 || bar.volume<0) continue;
    if ([bar.open,bar.high,bar.low,bar.close].some(n=>n<=0) || bar.high<Math.max(bar.open,bar.close) || bar.low>Math.min(bar.open,bar.close)) continue;
    byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a,b)=>a.time-b.time);
}

function calendarTools(timezone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    formatter.format(new Date());
  } catch { throw invalid('Yahoo did not provide a supported exchange timezone.'); }
  const parts = seconds=>Object.fromEntries(formatter.formatToParts(new Date(seconds*1000)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  const dayKey = p=>p.year*10000+p.month*100+p.day;
  const dateNumber = p=>Date.UTC(p.year,p.month-1,p.day);
  const weekKey = p=>{const d=dateNumber(p),dow=new Date(d).getUTCDay();return d-((dow+6)%7)*86400000;};
  const instant = (p,minutes)=>{
    const wanted=Date.UTC(p.year,p.month-1,p.day,Math.floor(minutes/60),minutes%60);let utc=wanted;
    for(let pass=0;pass<4;pass++){
      const observed=parts(utc/1000);
      const observedUtc=Date.UTC(observed.year,observed.month-1,observed.day,observed.hour,observed.minute,observed.second);
      const change=wanted-observedUtc;if(!change)break;utc+=change;
    }
    return utc/1000;
  };
  return {parts,dayKey,dateNumber,weekKey,instant};
}

function sessionRanges(timezone, symbol) {
  if (timezone==='Asia/Kuala_Lumpur'||/\.KL$/i.test(symbol)) return [[540,750],[870,1020]];
  if (timezone==='America/New_York') return [[570,960]];
  return null;
}

function combine(bars) {
  return {time:bars[0].time,open:bars[0].open,high:Math.max(...bars.map(b=>b.high)),low:Math.min(...bars.map(b=>b.low)),close:bars.at(-1).close,volume:bars.reduce((n,b)=>n+b.volume,0)};
}

function fourHourBars(bars, cal, sessions, nowSeconds, sourceStep=3600) {
  if (!sessions) throw invalid('Session-aware 4H construction is available for US and Bursa equities only.');
  const groups = new Map();
  for (const bar of bars) {
    const p=cal.parts(bar.time),minutes=p.hour*60+p.minute;
    const session=sessions.find(([start,end])=>minutes>=start&&minutes<end);
    if(!session)continue;
    const bucketStart=session[0]+Math.floor((minutes-session[0])/240)*240;
    const bucketEnd=Math.min(bucketStart+240,session[1]);
    const key=`${cal.dayKey(p)}-${bucketStart}`;
    if(!groups.has(key))groups.set(key,{bars:[],start:cal.instant(p,bucketStart),end:cal.instant(p,bucketEnd)});
    groups.get(key).bars.push(bar);
  }
  let missing=0;const out=[];
  for(const group of groups.values()){
    if(group.end>nowSeconds)continue;
    const expected=[];for(let t=group.start;t<group.end;t+=sourceStep)expected.push(t);
    if(group.bars.length!==expected.length||group.bars.some((bar,i)=>bar.time!==expected[i])){missing++;continue;}
    out.push(combine(group.bars));
  }
  return {bars:out,missing};
}

function quarterlyBars(bars, cal, currentQuarter) {
  const groups=new Map();
  for(const bar of bars){const p=cal.parts(bar.time),key=p.year*4+Math.floor((p.month-1)/3);if(key>=currentQuarter)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(bar);}
  const out=[];let missing=0;
  for(const [quarter,group] of groups){
    const expectedStart=(quarter%4)*3+1,months=group.map(b=>cal.parts(b.time).month);
    if(group.length!==3||months.some((m,i)=>m!==expectedStart+i)){missing++;continue;}
    out.push(combine(group));
  }
  return {bars:out,missing};
}

export function prepareYahooChart(body,{symbol='',interval='1day',limit=500,now=Date.now(),sourceInterval}={}) {
  const config=INTERVALS[interval];if(!config)throw invalid('Unsupported Yahoo timeframe.','UNSUPPORTED_TIMEFRAME');
  const actualSourceInterval=sourceInterval||config.sourceInterval;
  if(sourceInterval&&!(interval==='4h'&&['1h','30min'].includes(sourceInterval))&&sourceInterval!==config.sourceInterval)throw invalid('Unsupported source candle interval.','UNSUPPORTED_TIMEFRAME');
  const result=body?.chart?.result?.[0],quote=result?.indicators?.quote?.[0];
  if(body?.chart?.error||!result||!Array.isArray(result.timestamp)||!quote)throw invalid(body?.chart?.error?.description||'Yahoo returned no chart candles.');
  const provider=result.meta||{},timezone=provider.exchangeTimezoneName||provider.timezone;
  const expectedGranularity=({'5min':'5m','15min':'15m','30min':'30m','1h':'1h','1day':'1d','1week':'1wk','1month':'1mo'})[actualSourceInterval];
  const receivedGranularity=provider.dataGranularity;
  const canonicalGranularity=value=>value==='60m'?'1h':value;
  if(receivedGranularity&&canonicalGranularity(receivedGranularity)!==canonicalGranularity(expectedGranularity))throw invalid(`Yahoo returned ${receivedGranularity} candles when ${expectedGranularity} source candles were requested. Analysis was stopped to avoid scoring the wrong timeframe.`,'YAHOO_INTERVAL_MISMATCH');
  if(typeof timezone!=='string')throw invalid('Yahoo did not supply an exchange timezone.');
  const cal=calendarTools(timezone),nowSeconds=Math.floor(Number(now)/1000);
  if(!Number.isFinite(nowSeconds))throw invalid('Invalid analysis timestamp.');
  const current=cal.parts(nowSeconds),symbolName=provider.symbol||symbol,sessions=sessionRanges(timezone,symbolName);
  const nowDay=cal.dayKey(current),nowWeek=cal.weekKey(current),nowMonth=current.year*12+current.month,nowQuarter=current.year*4+Math.floor((current.month-1)/3);
  const regularEnd=Number(provider.currentTradingPeriod?.regular?.end);
  const marketTime=Number(provider.regularMarketTime),hasMarketTime=Number.isFinite(marketTime)&&marketTime>0;
  const marketTimeIsToday=hasMarketTime&&cal.dayKey(cal.parts(marketTime))===nowDay;
  const regularEndIsToday=Number.isFinite(regularEnd)&&cal.dayKey(cal.parts(regularEnd))===nowDay;
  // Last-trade timestamps can precede the official close even after a daily bar
  // settles. This inference is explicit and applies only after a 30-minute grace.
  const settledCloseInference=regularEndIsToday&&marketTimeIsToday&&marketTime>=regularEnd-900&&marketTime<regularEnd&&nowSeconds>=regularEnd+1800;
  const todaySessionEnded=regularEndIsToday&&regularEnd<=nowSeconds&&marketTimeIsToday&&(marketTime>=regularEnd||settledCloseInference);
  const dow=new Date(cal.dateNumber(current)).getUTCDay();
  const intradaySeconds={'5min':300,'15min':900,'30min':1800,'1h':3600}[actualSourceInterval];
  const raw=result.timestamp.map((time,i)=>({time,open:quote.open?.[i],high:quote.high?.[i],low:quote.low?.[i],close:quote.close?.[i],volume:quote.volume?.[i]}));
  const valid=normalizeBars(raw);
  let bars=valid.filter(bar=>{
    if(bar.time>nowSeconds)return false;
    const p=cal.parts(bar.time),day=cal.dayKey(p);
    if(intradaySeconds){
      if(day===nowDay&&!marketTimeIsToday)return false;
      const completionClock=day===nowDay?Math.min(nowSeconds,settledCloseInference?regularEnd:marketTime):nowSeconds;
      let end=bar.time+intradaySeconds;
      const session=sessions?.find(([start,finish])=>p.hour*60+p.minute>=start&&p.hour*60+p.minute<finish);
      if(sessions&&!session)return false;
      if(session)end=Math.min(end,cal.instant(p,session[1]));
      return end<=completionClock;
    }
    if(interval==='1day')return day<nowDay||(day===nowDay&&todaySessionEnded);
    if(interval==='1week')return cal.weekKey(p)<nowWeek||(cal.weekKey(p)===nowWeek&&(dow===0||dow===6||(dow===5&&todaySessionEnded)));
    return p.year*12+p.month<nowMonth;
  });
  const excludedSourceCandles=valid.length-bars.length;
  let missingGroups=0;
  if(interval==='4h'){const grouped=fourHourBars(bars,cal,sessions,nowSeconds,intradaySeconds);bars=grouped.bars;missingGroups=grouped.missing;}
  if(interval==='3month'){const grouped=quarterlyBars(bars,cal,nowQuarter);bars=grouped.bars;missingGroups=grouped.missing;}
  const completeBars=bars.length;
  bars=bars.slice(-Math.max(1,Math.min(5000,Math.trunc(Number(limit))||500)));
  const inferenceUsed=settledCloseInference&&bars.some(bar=>interval==='1week'?dow===5&&cal.weekKey(cal.parts(bar.time))===nowWeek:cal.dayKey(cal.parts(bar.time))===nowDay);
  const policy=interval==='4h'?'Standard regular sessions only; session-end buckets may be shorter than four hours. Groups with missing source candles are omitted.':interval==='1month'||interval==='3month'?'Current calendar month/quarter excluded conservatively.':'Current incomplete candles excluded using exchange timezone, provider market timestamp and available session metadata.';
  const settlementPolicy='After 30 minutes past the provider regular-session end, a last trade in its final 15 minutes permits an inferred settled close; this does not guarantee provider finality.';
  const granularityNote=receivedGranularity?'Provider source granularity was validated.':'Yahoo did not supply dataGranularity, so source granularity could not be independently validated.';
  return {bars,meta:{provider:'yahoo',symbol:symbolName,instrumentType:provider.instrumentType||'',exchange:provider.fullExchangeName||provider.exchangeName||'',currency:provider.currency||'',timezone,interval,sourceInterval:actualSourceInterval,sourceGranularity:receivedGranularity||null,sourceGranularityValidated:Boolean(receivedGranularity),lastCandle:bars.length?new Date(bars.at(-1).time*1000).toISOString():'',latestCandleStart:bars.length?new Date(bars.at(-1).time*1000).toISOString():'',marketTimestamp:hasMarketTime?new Date(marketTime*1000).toISOString():null,fetchedAt:new Date(nowSeconds*1000).toISOString(),completedCandles:true,completionInferred:inferenceUsed,adjustment:'provider-ohlc',delay:'unknown',invalidCandles:raw.length-valid.length,droppedIncompleteOrUnusable:excludedSourceCandles,missingAggregationGroups:missingGroups,historyBarsTruncated:completeBars-bars.length,completionPolicy:policy+' '+settlementPolicy,notes:granularityNote+' Completion is conservatively inferred, not guaranteed by Yahoo. Standard session hours are used; exchange holidays and historical early closes are not fully modelled. Prices are provider OHLC; no additional dividend adjustment is applied. Splits and dividends may affect historical comparisons.'}};
}
