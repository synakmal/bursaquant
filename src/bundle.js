/* Generated from source modules by npm run build. */
(()=>{
/** BursaQuant educational analysis engine. No data fetching, no broker orders. */
const DEFAULT_SETTINGS={capital:20000,riskPct:1,allocationPct:25,feePct:0.1,minFee:8,feePctUS:0,minFeeUS:0,slippagePct:0.15,usdMyr:4.30};
const RATING_INDICATORS=[
  {id:'trend',name:'Moving-average trend',description:'Moving averages smooth closing prices so the direction is easier to see.',how:'SMA20 averages the last 20 closes; SMA50 and SMA200 use 50 and 200. This rule checks price above SMA20, SMA20 above SMA50, and price above SMA200 when available.',limitation:'Averages lag price and can change direction repeatedly in a range. Missing SMA200 is excluded from this rule.'},
  {id:'rsi',name:'RSI momentum',description:'RSI14 compares recent upward and downward price changes on a scale from 0 to 100.',how:'The rating gives its highest reading inside your preferred RSI band, a lower reading above that band, and less credit below it. The band is your preference, not a universal entry signal.',limitation:'A high RSI can persist in a strong trend. A low RSI does not establish that a reversal is coming.'},
  {id:'macd',name:'MACD momentum',description:'MACD compares faster and slower exponential moving averages to describe momentum.',how:'The MACD line is EMA12 minus EMA26. Its signal line is a 9-period EMA. A positive histogram means MACD is above its signal; this checklist awards full credit when positive.',limitation:'This checks the latest histogram, not whether a crossover just occurred. MACD lags and can whipsaw.'},
  {id:'structure',name:'Support / resistance',description:'Support and resistance are estimated areas where price previously paused or turned.',how:'The engine looks for local swing lows and highs. This pullback-oriented rule favours price in the lower half of the estimated support/resistance range.',limitation:'These are estimates, not guaranteed barriers. The engine uses ATR-based fallback levels if no suitable swing is found.'},
  {id:'volume',name:'Relative volume',description:'Relative volume compares activity in the latest candle with the preceding candles.',how:'RVOL divides the latest volume by the mean positive volume of the previous 20 candles. This rule scales credit with RVOL, reaching full credit at approximately 1.67 times.',limitation:'An unfinished candle has incomplete volume. Partial exchange feeds can differ from consolidated market volume; larger volume does not establish direction.'},
  {id:'volatility',name:'ATR volatility',description:'ATR14 measures typical candle movement, including gaps from the previous close.',how:'ATR uses a smoothed average of true ranges. This rule prefers lower ATR relative to price: below 2.5% receives more credit than 2.5–5% or above 5%.',limitation:'Lower volatility is a preference, not evidence of higher returns. ATR does not predict price direction or guarantee a stop will fill.'},
  {id:'bollinger',name:'Bollinger-band location',description:'Bollinger Bands place two standard-deviation bands around a 20-period moving average.',how:'This pullback-oriented rule gives full credit between the lower band and middle average, partial credit between the middle and upper band, and less credit outside the bands.',limitation:'A band touch does not confirm a reversal. Price can follow a band during a trend; flat bands are excluded as unavailable.'}
];
const STRATEGY_PRESETS={
  balanced:{id:'balanced',name:'Balanced technical',description:'A mixed checklist of trend, momentum, price structure, volume and volatility.',weights:{trend:30,rsi:15,macd:10,structure:20,volume:15,volatility:10,bollinger:0},rsiLow:45,rsiHigh:68,constructiveAt:72,cautionBelow:42},
  trend:{id:'trend',name:'Trend emphasis',description:'Gives more weight to moving averages and momentum. This is an emphasis profile, not a backtested trading system.',weights:{trend:45,rsi:15,macd:20,structure:5,volume:10,volatility:5,bollinger:0},rsiLow:50,rsiHigh:70,constructiveAt:72,cautionBelow:42},
  pullback:{id:'pullback',name:'Pullback emphasis',description:'Emphasises support proximity and band location. A reversal still needs separate confirmation.',weights:{trend:20,rsi:15,macd:5,structure:30,volume:5,volatility:10,bollinger:15},rsiLow:35,rsiHigh:55,constructiveAt:72,cautionBelow:42},
  breakout:{id:'breakout',name:'Breakout emphasis',description:'Emphasises trend, momentum and volume. The score alone does not confirm a break above resistance.',weights:{trend:30,rsi:15,macd:20,structure:0,volume:25,volatility:10,bollinger:0},rsiLow:55,rsiHigh:75,constructiveAt:72,cautionBelow:42}
};
function normalizeStrategy(input){
  const base=STRATEGY_PRESETS.balanced;
  const clone=s=>({...s,weights:{...s.weights}});
  if(typeof input==='string')return clone(STRATEGY_PRESETS[input]||base);
  if(!input||typeof input!=='object'||Array.isArray(input))return clone(base);
  const reference=Object.hasOwn(STRATEGY_PRESETS,input.id)?STRATEGY_PRESETS[input.id]:base;
  if(input.weights!==undefined&&(!input.weights||typeof input.weights!=='object'||Array.isArray(input.weights)))return clone(base);
  const numeric=(value,fallback,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
  const weights=Object.fromEntries(RATING_INDICATORS.map(({id})=>[id,numeric(input.weights?.[id],reference.weights[id],0,100)]));
  if(!Object.values(weights).some(w=>w>0))return clone(base);
  const rsiLow=numeric(input.rsiLow,reference.rsiLow,0,99),rsiHigh=numeric(input.rsiHigh,reference.rsiHigh,1,100);
  const constructiveAt=numeric(input.constructiveAt,reference.constructiveAt,1,100),cautionBelow=numeric(input.cautionBelow,reference.cautionBelow,0,99);
  if(rsiLow>=rsiHigh||cautionBelow>=constructiveAt)return clone(base);
  return {id:input.id==='custom'?'custom':reference.id,name:typeof input.name==='string'&&input.name.trim()?input.name.trim().slice(0,80):reference.name,description:typeof input.description==='string'?input.description.slice(0,500):reference.description,weights,rsiLow,rsiHigh,constructiveAt,cautionBelow};
}
const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const round=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const last=a=>a[a.length-1];
function smaSeries(values,period){return values.map((_,i)=>i+1<period?null:mean(values.slice(i+1-period,i+1)));}
function emaSeries(values,period){const out=Array(values.length).fill(null);if(values.length<period)return out;let e=mean(values.slice(0,period));out[period-1]=e;const k=2/(period+1);for(let i=period;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out;}
function rsiSeries(closes,period=14){const out=Array(closes.length).fill(null);if(closes.length<=period)return out;let gain=0,loss=0;for(let i=1;i<=period;i++){const x=closes[i]-closes[i-1];gain+=Math.max(0,x);loss+=Math.max(0,-x);}gain/=period;loss/=period;out[period]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);for(let i=period+1;i<closes.length;i++){const delta=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,delta))/period;loss=(loss*(period-1)+Math.max(0,-delta))/period;out[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}return out;}
function atrSeries(candles,period=14){const tr=candles.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)));const out=Array(candles.length).fill(null);if(tr.length<period)return out;let a=mean(tr.slice(0,period));out[period-1]=a;for(let i=period;i<tr.length;i++){a=(a*(period-1)+tr[i])/period;out[i]=a;}return out;}
function macdSeries(closes){const fast=emaSeries(closes,12),slow=emaSeries(closes,26);const macd=closes.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);const valid=macd.filter(v=>v!==null);const signalValid=emaSeries(valid,9);const signal=Array(macd.length).fill(null);let j=0;for(let i=0;i<macd.length;i++)if(macd[i]!==null)signal[i]=signalValid[j++];return {macd,signal,hist:macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i])};}
function bollinger(closes,p=20,mult=2){if(closes.length<p)return null;const a=closes.slice(-p),mid=mean(a),sd=Math.sqrt(mean(a.map(x=>(x-mid)**2)));return {middle:mid,upper:mid+mult*sd,lower:mid-mult*sd};}
function supportResistance(candles,price,atr){const n=candles.length;const pivotsLow=[],pivotsHigh=[];for(let i=Math.max(3,n-95);i<n-3;i++){const c=candles[i];if(c.low<=Math.min(...candles.slice(i-3,i+4).map(x=>x.low)))pivotsLow.push(c.low);if(c.high>=Math.max(...candles.slice(i-3,i+4).map(x=>x.high)))pivotsHigh.push(c.high)}const below=pivotsLow.filter(v=>v<price).sort((a,b)=>b-a),above=pivotsHigh.filter(v=>v>price).sort((a,b)=>a-b);const recent=candles.slice(-60);let support=below[0]??Math.min(...recent.map(x=>x.low));let resistance=above[0]??Math.max(...recent.map(x=>x.high));if(support>=price)support=price-atr*1.3;if(resistance<=price)resistance=price+atr*1.3;return {support:Math.max(0.001,support),resistance};}
function analyse(candles,style='swing',strategy){
  if(!Array.isArray(candles)||candles.length<55)throw new Error('At least 55 valid OHLC candles are needed for analysis. For SMA200, 200 candles are recommended.');
  const c=candles.slice().sort((a,b)=>a.time-b.time),closes=c.map(x=>x.close),volumes=c.map(x=>x.volume||0),px=last(closes);
  const sma20=smaSeries(closes,20),sma50=smaSeries(closes,50),sma200=smaSeries(closes,200),rsi=rsiSeries(closes),atr=atrSeries(c),macd=macdSeries(closes),bb=bollinger(closes);
  const vol20=mean(volumes.slice(-21,-1).filter(x=>x>0));const hasVolume=vol20>0&&last(volumes)>0;
  const rvol=hasVolume?last(volumes)/vol20:null;const a=last(atr)||px*.02;const levels=supportResistance(c,px,a);const trendUp=px>last(sma20)&&last(sma20)>last(sma50),trendDown=px<last(sma20)&&last(sma20)<last(sma50);
  const trend=trendUp?'Bullish':trendDown?'Bearish':'Mixed / Range';const r=last(rsi),hist=last(macd.hist);const recent=c.slice(-60),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
  const config=normalizeStrategy(strategy),hasLong=last(sma200)!==null;
  const trendRatio=((px>last(sma20)?12:0)+(last(sma20)>last(sma50)?12:0)+(hasLong&&px>last(sma200)?6:0))/(hasLong?30:24);
  const rangePosition=(px-levels.support)/Math.max(levels.resistance-levels.support,a),atrPct=a/px*100;
  const bandRatio=!bb||bb.upper<=bb.lower?null:px>=bb.lower&&px<=bb.middle?1:px>bb.middle&&px<=bb.upper?.6:.2;
  const values={
    trend:{ratio:trendRatio,reason:`Price ${px.toFixed(4)}; SMA20 ${last(sma20).toFixed(4)}; SMA50 ${last(sma50).toFixed(4)}; SMA200 ${hasLong?last(sma200).toFixed(4):'unavailable and excluded'}.`},
    rsi:{ratio:r===null?null:r>=config.rsiLow&&r<=config.rsiHigh?1:r>config.rsiHigh?.6:r>=Math.max(0,config.rsiLow-10)?8/15:.2,reason:`RSI14 ${r===null?'unavailable':r.toFixed(1)}; preferred band ${config.rsiLow}–${config.rsiHigh}.`},
    macd:{ratio:hist===null?null:hist>0?1:0,reason:`MACD12/26/9 histogram ${hist===null?'unavailable':hist.toFixed(4)}; positive earns credit.`},
    structure:{ratio:rangePosition<=.5?.85:.55,reason:`Price ${(rangePosition*100).toFixed(1)}% through the ATR-adjusted support/resistance range; lower-half preference.`},
    volume:{ratio:rvol===null?null:Math.min(1,Math.max(0,rvol)*.6),reason:rvol===null?'Reliable positive volume unavailable; excluded from the rating.':`Latest volume / previous 20 positive-volume mean: ${rvol.toFixed(2)}×.`},
    volatility:{ratio:atrPct<2.5?.9:atrPct<5?.6:.3,reason:`ATR14 ${a.toFixed(4)} / price: ${atrPct.toFixed(2)}%; lower-volatility preference.`},
    bollinger:{ratio:bandRatio,reason:bandRatio===null?'Bollinger range unavailable or flat; excluded from the rating.':`Price ${px.toFixed(4)}; lower ${bb.lower.toFixed(4)}, middle ${bb.middle.toFixed(4)}, upper ${bb.upper.toFixed(4)}; pullback-location preference.`}
  };
  const factorData=RATING_INDICATORS.filter(x=>config.weights[x.id]>0).map(({id,name})=>{
    const weight=config.weights[id],{ratio,reason}=values[id];
    return {id,key:name,weight,score:ratio===null?null:round(weight*ratio,4),contribution:ratio===null?null:Math.round(ratio*100),reason};
  });
  const active=factorData.filter(f=>f.score!==null),totalWeight=active.reduce((s,f)=>s+f.weight,0);
  const selectedWeight=factorData.reduce((s,f)=>s+f.weight,0);
  const score=totalWeight>0?Math.round(100*active.reduce((s,f)=>s+f.score,0)/totalWeight):null;
  let adjustment=1;if(style==='intraday')adjustment=.65;if(style==='medium')adjustment=1.5;if(style==='invest')adjustment=2;
  const support=levels.support,resistance=levels.resistance;
  const pullEntry=support+0.20*a*adjustment;const pullStop=Math.max(.001,support-0.70*a*adjustment);const pullRisk=pullEntry-pullStop;
  const breakoutEntry=resistance+0.15*a*adjustment;const breakoutStop=Math.max(.001,resistance-0.8*a*adjustment);const breakoutRisk=breakoutEntry-breakoutStop;
  const lowPlan={id:'lower',label:'Buy Lower',tag:'SUPPORT PULLBACK',description:'Conditional entry if price revisits support, stabilizes, and confirms a reversal. Do not assume support must hold.',entry:pullEntry,zoneLow:support,zoneHigh:support+.30*a*adjustment,deepWatch:Math.max(0.001,support-.40*a*adjustment),stop:pullStop,tp1:Math.max(resistance,pullEntry+1.5*pullRisk),tp2:Math.max(resistance+a*adjustment,pullEntry+2.5*pullRisk),tp3:Math.max(resistance+a*adjustment+pullRisk,pullEntry+3.5*pullRisk),conditions:'Look for a bullish reversal near support. A break toward the deeper watch level invalidates this support entry; reassess rather than averaging down automatically.',valid:pullEntry>pullStop};
  const breakoutPlan={id:'breakout',label:'Buy Breakout',tag:'MOMENTUM CONFIRMATION',description:'Conditional entry only after price closes beyond resistance, with confirmation and meaningful volume.',entry:breakoutEntry,zoneLow:resistance,zoneHigh:breakoutEntry+.15*a*adjustment,stop:breakoutStop,tp1:breakoutEntry+1.5*breakoutRisk,tp2:breakoutEntry+2.5*breakoutRisk,tp3:breakoutEntry+3.5*breakoutRisk,conditions:'Require candle close above resistance, check volume expansion, avoid excessive gaps.',valid:breakoutEntry>breakoutStop};
  const verdict=score===null?'Insufficient indicator data':score>=config.constructiveAt?'Constructive / Watch for Entry':score<config.cautionBelow?'Caution / No New Long':'Neutral / Wait for Confirmation';
  return {candles:c,price:px,previous:c.at(-2)?.close??px,sma20,sma50,sma200,rsi:r,macd:hist,atr:a,bb,rvol,hasVolume,trend,score,factors:factorData,strategy:config,ratingCoverage:{availableWeight:totalWeight,selectedWeight},levels:{...levels,fib382:hi-(hi-lo)*.382,fib618:hi-(hi-lo)*.618},plans:[lowPlan,breakoutPlan],verdict,style,coverage:{sma200:last(sma200)!==null,volume:hasVolume,fundamentals:false,news:false,indices:false}};
}
/** Long-position pretrade model. Estimates two-sided commissions & price slippage. Does not model gaps/taxes/FX fees. */
function sizePosition(plan, settings=DEFAULT_SETTINGS, currency='MYR', lotSize=1){
  const s={...DEFAULT_SETTINGS,...settings};const fx=currency==='USD'?s.usdMyr:1;
  const entry=Number(plan.entry),stop=Number(plan.stop),capital=Number(s.capital),riskPct=Number(s.riskPct),allocationPct=Number(s.allocationPct);
  const riskLimit=capital*riskPct/100/fx;const budget=capital*allocationPct/100/fx;
  if(!Number.isFinite(entry)||!Number.isFinite(stop)||entry<=stop||stop<0||capital<=0||riskPct<=0||allocationPct<=0||fx<=0)return {qty:0,riskLimit:0,budget:0,estimatedLoss:0,cost:0,rr1:null,rr2:null,message:'Invalid entry/stop or risk settings'};
  const step=Math.max(1,Math.round(lotSize));const pct=Math.max(0,Number(currency==='USD'?s.feePctUS:s.feePct))/100,slip=Math.max(0,Number(s.slippagePct))/100,minFee=Math.max(0,Number(currency==='USD'?s.minFeeUS:s.minFee));
  const projectedLoss=q=>q*((entry-stop)+(entry+stop)*slip)+Math.max(minFee,q*entry*pct)+Math.max(minFee,q*stop*pct);
  let hi=Math.floor(Math.min(budget/entry,riskLimit/Math.max(.000001,(entry-stop)+(entry+stop)*(pct+slip)))/step);
  let low=0;
  while(low<hi){const mid=Math.ceil((low+hi)/2);if(projectedLoss(mid*step)<=riskLimit)low=mid;else hi=mid-1;}
  const qty=low*step;const estimatedLoss=qty?projectedLoss(qty):0;const tpNet=(price)=>qty?qty*(price-entry)-qty*(price+entry)*slip-Math.max(minFee,qty*entry*pct)-Math.max(minFee,qty*price*pct):0;
  return {qty,riskLimit,budget,estimatedLoss,cost:qty*entry,rr1:qty&&plan.tp1?tpNet(plan.tp1)/estimatedLoss:null,rr2:qty&&plan.tp2?tpNet(plan.tp2)/estimatedLoss:null,message:qty===0?'No position fits both risk and allocation caps, including estimated costs.':'Estimated risk assumes the stop fills; losses can exceed this amount.'};
}
function generateDemo(symbol='AAPL',timeframe='4h',n=230){
  let seed=2166136261;const key=`${symbol}-${timeframe}`;for(const ch of key)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  const bases={AAPL:184,NVDA:148,MSFT:411,TSLA:315,SPY:585,QQQ:505,'1155':10.2,'1023':7.6,'5347':13.5,'5183':5.6,'5296':1.72,'FBMKLCI':1640,'5357CC':0.14};
  const base=bases[symbol]||45,intervals={'5min':300,'15min':900,'30min':1800,'1h':3600,'4h':14400,'1day':86400,'1week':604800},interval=intervals[timeframe]||14400;
  let now=Math.floor(Date.now()/1000/interval)*interval;const date=new Date();
  if(timeframe==='1week'){const day=(date.getUTCDay()+6)%7;now=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-day)/1000;}
  const monthStep=timeframe==='3month'?3:timeframe==='1month'?1:0,anchorMonth=monthStep===3?Math.floor(date.getUTCMonth()/3)*3:date.getUTCMonth();
  const candleTime=offset=>monthStep?Date.UTC(date.getUTCFullYear(),anchorMonth-offset*monthStep,1)/1000:now-offset*interval;
  let px=base*(.82+rand()*.1);const out=[];
  for(let i=0;i<n;i++){const p=rand()-.5;const variation=(.012*(p*1.7)+.003*Math.sin(i/8)+.0008);const open=px;px=Math.max(.005,px*(1+variation));const high=Math.max(open,px)*(1+rand()*.007);const low=Math.min(open,px)*(1-rand()*.007);out.push({time:candleTime(n-i-1),open,high,low,close:px,volume:Math.floor(120000+rand()*2200000+Math.abs(variation)*30000000)})}
  return out;
}
function exchangeEpoch(datetime,zone='UTC'){
  const raw=String(datetime).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return Math.floor(Date.parse(raw+'T00:00:00Z')/1000);
  const normalized=raw.replace(' ','T');
  if(/(?:Z|[+-]\d\d:?\d\d)$/i.test(normalized))return Math.floor(Date.parse(normalized)/1000);
  const wanted=Date.parse(normalized+'Z');if(!Number.isFinite(wanted))return NaN;
  let utc=wanted;
  try{
    const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let pass=0;pass<3;pass++){
      const parts=Object.fromEntries(format.formatToParts(new Date(utc)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
      const observed=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
      const correction=wanted-observed;if(correction===0)break;utc+=correction;
    }
  }catch{return Math.floor(wanted/1000)}
  return Math.floor(utc/1000);
}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);if(lines.length<56)throw new Error('CSV needs a header and at least 55 candles.');
  const split=(line)=>{let res=[],cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){res.push(cur.trim());cur='';}else cur+=ch;}res.push(cur.trim());return res;};
  const names=split(lines[0]).map(v=>v.toLowerCase().replace(/[^a-z]/g,''));const lookup=key=>names.indexOf(key);const timeIndex=names.findIndex(v=>['datetime','date','time','timestamp'].includes(v));
  const idx=['open','high','low','close'].map(lookup);if(timeIndex<0||idx.some(i=>i<0))throw new Error('CSV requires datetime/date, open, high, low and close columns.');
  const vi=lookup('volume');let rows=[];
  for(const ln of lines.slice(1)){const fields=split(ln),raw=fields[timeIndex];const parsed=/^\d{10,13}$/.test(raw)?Number(raw)/(raw.length===13?1000:1):Date.parse(raw.includes('T')||/[zZ+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z')/1000;const nums=idx.map(j=>Number(fields[j]));const volume=vi>=0?Number(fields[vi]):0;if(!Number.isFinite(parsed)||nums.some(x=>!Number.isFinite(x))||nums[0]<=0||nums[1]<Math.max(nums[0],nums[3])||nums[2]>Math.min(nums[0],nums[3])||nums[2]<=0||nums[3]<=0||!Number.isFinite(volume)||volume<0)continue;rows.push({time:Math.floor(parsed),open:nums[0],high:nums[1],low:nums[2],close:nums[3],volume});}
  rows.sort((a,b)=>a.time-b.time);rows=rows.filter((x,i,a)=>i===0||x.time!==a[i-1].time);if(rows.length<55)throw new Error('Fewer than 55 valid OHLC candles; check CSV fields and dates.');return rows;
}

const BQAccumulation=(()=>{
/** Daily OHLCV research checklist. No investor-flow data, prediction or orders. */
const DEFAULT_SCREEN_SETTINGS=Object.freeze({
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
function evaluateAccumulation(bars,options={}){
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

return {DEFAULT_SCREEN_SETTINGS,evaluateAccumulation};
})();
const BQScanRunner=(()=>{
// Real-data screening utilities. Requests are sequential, bounded and resumable.
function screenInstrument(value, marketHint='all') {
  const raw=typeof value==='object'&&value?value:{symbol:value};
  let ticker=String(raw.symbol||'').trim().toUpperCase(),market=String(raw.market||marketHint).toUpperCase();
  const explicitMarket=String(raw.market||'').toUpperCase();
  if(explicitMarket&&!['MY','US','ALL'].includes(explicitMarket))return null;
  const prefix=ticker.match(/^([A-Z]+):/);
  if(prefix){if(!['MY','US'].includes(prefix[1])||(['MY','US'].includes(explicitMarket)&&prefix[1]!==explicitMarket))return null;market=prefix[1];ticker=ticker.slice(prefix[0].length);}
  if(/\.KL$/.test(ticker)){if(prefix?.[1]==='US'||explicitMarket==='US')return null;market='MY';ticker=ticker.slice(0,-3);}
  if(!['MY','US'].includes(market))market=/^\d{4}$/.test(ticker)?'MY':'US';
  if(market==='US')ticker=ticker.replace(/\./g,'-');
  const type=({stock:'Stock',equity:'Stock',etf:'ETF'})[String(raw.type||'Stock').toLowerCase()];
  if(!['Stock','ETF'].includes(type))return null;
  // Custom Bursa warrant codes are intentionally excluded until a derivative
  // security master is connected. Numeric ordinary-share codes preserve zeros.
  if(market==='MY'&&!/^\d{4}$/.test(ticker))return null;
  if(market==='US'&&(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)||/(?:[-.](?:W|WS|WT|U|R))$/.test(ticker)))return null;
  if(['SYMBOL','TICKER','CODE'].includes(ticker))return null;
  return {symbol:ticker,name:String(raw.name||ticker).slice(0,180),market,currency:market==='MY'?'MYR':'USD',exchange:String(raw.exchange||(market==='MY'?'BURSA':'US')),type};
}

function parseScreenSymbols(text, market='all') {
  const seen=new Set(),instruments=[],rejected=[];
  for(const token of String(text||'').slice(0,200000).split(/[\s,;]+/).filter(Boolean)){
    const item=screenInstrument(token,market);
    if(!item){rejected.push(token.slice(0,32));continue;}
    const key=item.market+':'+item.symbol;if(seen.has(key))continue;seen.add(key);instruments.push(item);
    if(instruments.length>=12000)break;
  }
  return {instruments,rejected};
}

function parseScreenListFile(text,market='all') {
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  const fields=line=>[...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(match=>(match[1]??match[2]??'').replace(/""/g,'"').trim());
  const header=fields(lines[0]||'').map(value=>value.toLowerCase()),symbolIndex=header.findIndex(value=>['symbol','ticker','code'].includes(value));
  if(symbolIndex<0)return parseScreenSymbols(text,market);
  const marketIndex=header.indexOf('market'),nameIndex=header.indexOf('name'),typeIndex=header.indexOf('type'),instruments=[],rejected=[],seen=new Set();
  for(const line of lines.slice(1)){
    const cells=fields(line),raw=cells[symbolIndex],item=screenInstrument({symbol:raw,market:marketIndex>=0?cells[marketIndex]:market,name:nameIndex>=0?cells[nameIndex]:raw,type:typeIndex>=0?cells[typeIndex]:'Stock'});
    if(!item){rejected.push(String(raw||'').slice(0,32));continue;}const key=item.market+':'+item.symbol;if(seen.has(key))continue;seen.add(key);instruments.push(item);
    if(instruments.length>=12000)break;
  }
  return {instruments,rejected};
}

function createScreenRun(instruments, context={}) {
  const seen=new Set(),queue=[];
  for(const raw of instruments){const item=screenInstrument(raw);if(!item)continue;const key=item.market+':'+item.symbol;if(seen.has(key))continue;seen.add(key);queue.push(item);}
  return {version:1,context:{...context,interval:'1day'},queue,results:[],cursor:0,startedAt:new Date().toISOString(),updatedAt:null,pausedReason:'',running:false};
}

function screenCoverage(run) {
  const counts={total:run?.queue?.length||0,checked:run?.results?.length||0,analysed:0,failed:0,insufficient:0,stale:0,candidates:0};
  for(const row of run?.results||[]){
    if(row.error)counts.failed++;
    else if(row.stale)counts.stale++;
    else if(row.evaluation?.classification==='insufficient')counts.insufficient++;
    else {counts.analysed++;if(['accumulation','breakout'].includes(row.evaluation?.classification))counts.candidates++;}
  }
  counts.remaining=Math.max(0,counts.total-counts.checked);return counts;
}

function usableDailyBars(data) {
  if(!Array.isArray(data?.bars)||!data.meta||data.meta.interval!=='1day')throw new Error('Daily provider candles were not supplied.');
  if(!['yahoo','isaham','twelvedata'].includes(data.meta.provider))throw new Error('A recognised market-data source is required. Simulated data is excluded.');
  if(data.meta.completedCandles!==true)throw new Error('The gateway cannot establish completed daily candles for this source.');
  if(!data.bars.length)throw new Error('No daily candles were supplied.');
  if(data.meta.instrumentType&&!['EQUITY','ETF'].includes(String(data.meta.instrumentType).toUpperCase()))throw new Error('This instrument is not an eligible stock or ETF.');
  // Do not repair malformed or duplicated history silently: these affect volume
  // indicators and the reference window used for a candidate classification.
  let previous=-Infinity;
  for(const b of data.bars){
    if(!['time','open','high','low','close','volume'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k]))||b.time<=previous||b.open<=0||b.close<=0||b.low<=0||b.volume<0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.high<b.low)throw new Error('Provider history contains invalid, unordered or duplicate candles.');
    previous=b.time;
  }
  return data.bars;
}

async function scanDailyBatch(run,{request,evaluate,onUpdate=()=>{},shouldStop=()=>false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),batchSize=25,spacingMs=1500,now=()=>Date.now(),maxAgeDays=7}={}) {
  if(run.running)return run;
  const count=Math.max(1,Math.min(25,Math.trunc(Number(batchSize)||25))),end=Math.min(run.queue.length,run.cursor+count);
  run.running=true;run.pausedReason='';onUpdate(run);
  try {
    while(run.cursor<end&&!shouldStop()){
      const instrument=run.queue[run.cursor];let row,rateLimited=false;
      try {
        const data=await request(instrument),bars=usableDailyBars(data),last=bars.at(-1)?.time;
        const stale=!last||last>now()/1000||now()/1000-last>maxAgeDays*86400;
        row={instrument,meta:data.meta,lastCandle:last?new Date(last*1000).toISOString():null,fetchedAt:data.meta.fetchedAt||new Date(now()).toISOString(),stale,evaluation:stale?null:evaluate(bars,instrument)};
      }catch(error){
        rateLimited=error.status===429||error.code==='YAHOO_RATE_LIMITED';
        row={instrument,error:String(error.message||'Data unavailable').slice(0,350),checkedAt:new Date(now()).toISOString()};
      }
      run.results.push(row);run.cursor++;run.updatedAt=new Date(now()).toISOString();onUpdate(run);
      if(rateLimited){run.pausedReason='Provider rate limit reached. This scan stopped; respect the provider pause before continuing.';break;}
      if(run.cursor<end&&!shouldStop())await wait(Math.max(1500,Number(spacingMs)||1500));
    }
    if(shouldStop())run.pausedReason='Paused by you. Completed results are retained.';
    else if(!run.pausedReason&&run.cursor<run.queue.length)run.pausedReason='Batch complete. Continue explicitly to scan the next batch.';
  }finally{run.running=false;onUpdate(run);}
  return run;
}

return {screenInstrument,parseScreenSymbols,parseScreenListFile,createScreenRun,screenCoverage,usableDailyBars,scanDailyBatch};
})();
const BQDeepAnalysis=(()=>{
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
  base.completedCandles=true;base.completionInferred=meta.provider==='yahoo'||meta.completionInferred===true;
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
  if(base.completionInferred)base.warnings.push('Candle completion is inferred by the gateway and is not guaranteed by the provider.');
  base.warnings.push('The latest candle is a completed historical bar, not a live trade. Stop fills and target prices are not guaranteed.');
  base.plans=(Array.isArray(analysis.plans)?analysis.plans:[]).map((plan,index)=>deepPlan(plan,input.sizedPlans?.[index]?.position??input.sizedPlans?.[index])).filter(Boolean);
  if(timeframe==='1day')base.accumulation=deepAccumulation(input.accumulation);
  base.evidence=['supporting','contrary','observations'].flatMap(kind=>base[kind].map((text,index)=>({id:`${timeframe}:${kind}:${index+1}`,kind,text})));
  return base;
}

/** Return a source-gated report; valid timeframes remain usable after partial failures. */
function buildDeepReport({symbol='',market='',frames=[],generatedAt=new Date().toISOString(),mode='swing',strategy=null}={}){
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

return {buildDeepReport};
})();
const BQResearchUI=(()=>{
// Plain DOM research workspace. Network and calculation dependencies are injected.
const researchEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const researchNumber=(value,places=2)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:places}):'Unavailable';

/** Strip personal position sizes before an explicit AI request. */
function researchAiContext(report){
  const copy=JSON.parse(JSON.stringify(report));
  copy.kind='stock';
  for(const frame of copy.frames||[])for(const plan of frame.plans||[])delete plan.sizing;
  return copy;
}

function mountResearchWorkspace(root,deps){
  root.innerHTML=`<div class="card research-controls"><div class="card-title-row"><h3 id="deepSelection">Selected stock</h3><span class="badge badge-outline">Daily · 4H · 1H</span></div><p class="muted small">Choose a ticker in Stock Analysis, then build a report from three separate sets of provider candles. Requests run sequentially. Unavailable timeframes remain visible.</p><div class="row-buttons"><button id="runDeepResearch" class="btn primary">Build deep report →</button><button id="stopDeepResearch" class="btn ghost" disabled>Pause</button><button id="exportDeepResearch" class="btn secondary" disabled>↓ Export report</button></div><p id="deepProgress" class="research-status" role="status" aria-live="polite">No deep report built yet.</p></div><div id="deepReport"></div><div class="card space-top"><div class="card-title-row"><h3>AI Research Coach</h3><button id="checkResearchAI" class="btn sm ghost">Check AI setup</button></div><p id="researchAIStatus" class="muted small" role="status">AI is optional. Check the server setup before asking a question.</p><label class="research-question" for="researchQuestion">Ask about this report<textarea id="researchQuestion" rows="3" maxlength="1000" placeholder="What supports the long thesis, what contradicts it, and what confirmation is missing?"></textarea></label><div class="row-buttons research-prompts"><button class="btn sm ghost" data-research-prompt="Challenge the bullish thesis using the evidence. What would invalidate it?">Challenge my thesis</button><button class="btn sm ghost" data-research-prompt="Explain the timeframe conflicts and what confirmation remains missing.">Explain conflicts</button><button class="btn sm ghost" data-research-prompt="Explain the daily accumulation checklist, including contradictory and missing evidence.">Check accumulation</button></div><button id="askResearchAI" class="btn primary" disabled>Ask AI about this report</button><p class="disclaimer">Sends this report and your question to the configured AI provider only when you click Ask. Access codes, your journal and position-size settings are excluded. The AI has no live web or news access. It explains evidence; it cannot establish future profit.</p><div id="researchAIAnswer" class="research-answer" role="status" aria-live="polite">Build a report first. Paid AI calls remain disabled until you configure the server.</div></div>`;
  const el=id=>document.getElementById(id);
  let report=null,reportKey='',running=false,paused=false,sequence=0,aiReady=false,aiBusy=false,aiSequence=0,setupSequence=0,connectionKey='';
  const key=()=>deps.getSelection().key;
  const valid=()=>report&&reportKey===key()&&report.counts.available>0;
  const money=(value,currency)=>`${researchEscape(currency)} ${researchNumber(value,value<1?4:2)}`;
  const list=items=>(items||[]).length?`<ul>${items.map(item=>`<li>${researchEscape(item)}</li>`).join('')}</ul>`:'<p class="muted small">No qualifying evidence in this category.</p>';
  function buttons(){el('runDeepResearch').disabled=running;el('stopDeepResearch').disabled=!running;el('exportDeepResearch').disabled=!report||reportKey!==key();el('askResearchAI').disabled=!valid()||!aiReady||aiBusy||running;}
  function refresh(){
    const selection=deps.getSelection();
    const connection=selection.connectionKey||selection.key;
    if(connectionKey!==connection){aiReady=false;setupSequence++;connectionKey=connection;el('researchAIStatus').textContent='Connection changed. Check AI setup for this gateway.';}
    el('deepSelection').textContent=`${selection.symbol} · ${selection.market} · ${selection.name}`;
    if(report&&reportKey!==key()){
      el('deepReport').innerHTML='<div class="data-notice">Selection or research settings changed. Build a new report to use these settings.</div>';
      el('deepProgress').textContent='Previous report is out of date for this selection.';
      el('researchAIAnswer').textContent='Build a new report before asking about this selection.';
      aiSequence++;
    }
    buttons();
  }
  function render(){
    if(!report)return;
    const currency=deps.getSelection().currency;
    el('deepReport').innerHTML=`<div class="card space-top"><div class="card-title-row"><h3>${researchEscape(report.symbol)} · ${researchEscape(report.alignment)} alignment</h3><span class="badge">${report.counts.available}/3 timeframes</span></div><p class="research-summary">${researchEscape(report.summary)}</p><p class="muted small">Generated ${researchEscape(report.generatedAt)} · ${researchEscape(report.strategy.name)} · ${researchEscape(report.mode)} scenarios. Each timeframe uses its own last completed candle; these are not simultaneous quotes.</p></div><div class="research-frame-grid">${report.frames.map(frame=>{
      if(frame.status!=='available')return `<div class="card research-frame"><h3>${researchEscape(frame.label)} · ${researchEscape(frame.status)}</h3><p>${researchEscape(frame.reason)}</p><p class="muted small">${researchEscape(frame.provider||'No provider history confirmed')}${frame.lastCandle?' · Last candle '+researchEscape(frame.lastCandle):''}</p></div>`;
      return `<div class="card research-frame"><div class="card-title-row"><h3>${researchEscape(frame.label)}</h3><span class="badge badge-outline">${researchEscape(frame.trend)}</span></div><div class="research-frame-price">${money(frame.price,currency)}</div><p class="muted small">${researchEscape(frame.provider)} · ${frame.barsUsed} candles<br>Bar start: ${researchEscape(frame.lastCandle)}<br>Timezone: ${researchEscape(frame.timezone||'Not supplied')}<br>Fetched: ${researchEscape(frame.fetchedAt||'Not supplied')}<br>Completion ${frame.completionInferred?'inferred':'reported'} · Rating ${researchNumber(frame.score)}/100</p><div class="indicator-table">${[['RSI14',frame.indicators.rsi14],['RVOL',frame.indicators.rvol],['MACD histogram',frame.indicators.macdHistogram],['ATR %',frame.indicators.atrPct],['Support',frame.levels.support],['Resistance',frame.levels.resistance]].map(([name,value])=>`<div class="indicator-row"><span>${name}</span><strong>${researchNumber(value,4)}</strong></div>`).join('')}</div><h4>Measured evidence</h4>${list([...frame.supporting,...frame.contrary,...frame.observations])}<details><summary>Coverage and limitations</summary>${list(frame.warnings)}<p class="small">Selected indicator weight available: ${frame.coverage.availableWeight}/${frame.coverage.selectedWeight}.</p></details></div>`;
    }).join('')}</div><div class="two-col"><div class="card"><h3>Supports the long thesis</h3>${list(report.supporting)}</div><div class="card"><h3>Challenges the long thesis</h3>${list(report.contrary)}</div></div>${renderAccumulation(report.frames.find(frame=>frame.timeframe==='1day'))}<div class="card space-top"><h3>Conditional scenarios by timeframe</h3><p class="muted small">Alternative plans, not simultaneous positions. Choose a timeframe and confirm its conditions. Target levels are model outputs, not forecasts.</p>${report.frames.filter(frame=>frame.status==='available').map(frame=>`<details class="research-plan"><summary>${researchEscape(frame.label)} · ${frame.plans.length} modelled scenarios</summary>${frame.plans.map(plan=>`<div class="scenario"><strong>${researchEscape(plan.label)}</strong><p>${researchEscape(plan.conditions)}</p><p>Entry ${money(plan.entry,currency)} · Stop ${money(plan.stop,currency)}<br>Targets ${plan.targets.map(target=>money(target,currency)).join(' / ')}<br>Gross reward/risk: ${plan.grossRewardRisk.map(value=>researchNumber(value)+'×').join(' / ')}</p>${plan.sizing?`<p>Maximum modelled units: ${researchNumber(plan.sizing.qty,0)} · Estimated loss including configured costs: ${money(plan.sizing.estimatedLoss,currency)}<br>Net TP1 / TP2 reward/risk: ${plan.sizing.netRewardRisk.map(value=>researchNumber(value)+'×').join(' / ')}<br>${researchEscape(plan.sizing.message)}</p>`:''}</div>`).join('')||'<p class="muted small">No valid scenario geometry available.</p>'}</details>`).join('')}</div><div class="two-col"><div class="card"><h3>Next checks</h3>${list(report.nextChecks)}</div><div class="card"><h3>Missing evidence</h3>${list(report.missingInputs)}</div></div><div class="card space-top"><h3>How to judge whether this helps</h3><p class="muted small">Record the thesis, trigger and invalidation before the outcome. Review realised results after fees and slippage in the Trading Journal. A high rating alone does not establish a profitable edge.</p>${list(report.limitations)}</div>`;
    buttons();
  }
  function renderAccumulation(frame){
    if(!frame?.accumulation)return '';
    const value=frame.accumulation;
    return `<div class="card space-top"><div class="card-title-row"><h3>Daily accumulation research</h3><span class="badge">${researchEscape(value.status)}</span></div><p class="muted small">Uses the daily screener's current checklist settings, separately from your rating strategy.</p><div class="indicator-table">${value.conditions.map(condition=>`<div class="indicator-row"><span>${researchEscape(condition.label)}<small class="research-rule">${researchEscape(condition.rule)}</small></span><strong>${condition.met===null?'Unavailable':condition.met?'Met':'Not met'}</strong></div>`).join('')}</div>${list(value.warnings)}</div>`;
  }
  async function run(){
    if(running)return;
    const selection=deps.getSelection(),startKey=selection.key,seq=++sequence;
    if(!selection.canLoad){el('deepProgress').textContent=selection.unavailableReason;return;}
    running=true;paused=false;report=null;aiSequence++;el('deepReport').innerHTML='';el('researchAIAnswer').textContent='Building new evidence. Previous AI answers have been cleared.';buttons();
    const frames=[];
    try{
      for(const timeframe of ['1day','4h','1h']){
        if(paused||startKey!==key()||seq!==sequence)break;
        el('deepProgress').textContent=`Loading ${timeframe==='1day'?'daily':timeframe.toUpperCase()} candles for ${selection.symbol} (${frames.length+1}/3)…`;
        try{
          const data=await deps.fetchMarket(selection,timeframe);
          if(startKey!==key()||seq!==sequence)break;
          const bars=data.bars;
          const analysis=deps.analyseFrame(bars,selection);
          frames.push({timeframe,bars,meta:data.meta,analysis,accumulation:timeframe==='1day'?deps.evaluateDaily(bars,selection):null,sizedPlans:deps.sizePlans(analysis,selection)});
        }catch(error){frames.push({timeframe,error:String(error.message||'Data request failed.').slice(0,350)});if(error.status===429){paused=true;el('deepProgress').textContent='Provider rate limit reached. Remaining requests have stopped.';}}
        if(!paused&&frames.length<3)await new Promise(resolve=>setTimeout(resolve,1500));
      }
      if(startKey!==key()||seq!==sequence){el('deepProgress').textContent='Selection changed during loading. Build a report for the new selection.';return;}
      report=deps.buildReport({symbol:selection.symbol,market:selection.market,frames,generatedAt:new Date().toISOString(),mode:selection.mode,strategy:selection.strategy});
      reportKey=startKey;render();el('deepProgress').textContent=`${paused?'Paused. ':''}${report.counts.available}/3 timeframes passed the data checks. ${report.status==='complete'?'Report ready.':'Missing or rejected timeframes are shown below.'}`;el('researchAIAnswer').textContent='No AI answer requested. Review the report above; use Check AI setup before asking a question.';
    }catch(error){el('deepProgress').textContent='Report unavailable: '+error.message;}
    finally{running=false;refresh();}
  }
  async function checkAI(){
    refresh();const seq=++setupSequence,connection=connectionKey;
    el('researchAIStatus').textContent='Checking the private AI endpoint…';el('checkResearchAI').disabled=true;
    try{const state=await deps.getAIStatus();const selection=deps.getSelection();if(seq!==setupSequence||connection!==(selection.connectionKey||selection.key))return;aiReady=state.ready===true;el('researchAIStatus').textContent=state.message+(state.model?' Model: '+state.model+'.':'');}
    catch(error){if(seq===setupSequence){aiReady=false;el('researchAIStatus').textContent='AI setup check failed: '+error.message;}}
    finally{el('checkResearchAI').disabled=false;buttons();}
  }
  async function askAI(){
    if(!valid()||!aiReady||aiBusy||running)return;
    const question=el('researchQuestion').value.trim()||'Explain the supporting evidence, contrary evidence, missing inputs and conditions that would invalidate this thesis.';
    if(question.length>1000)return;
    const contextKey=key(),seq=++aiSequence;aiBusy=true;buttons();el('researchAIAnswer').textContent='Reviewing the supplied evidence…';
    try{
      const result=await deps.sendAI({question,context:researchAiContext(report)});
      if(contextKey!==key()||seq!==aiSequence)return;
      el('researchAIAnswer').textContent=result.answer+`\n\n${result.truncated?'Response reached the output limit and may be incomplete.\n':''}Model: ${result.model} · Generated ${result.generatedAt}\nScope: supplied report only; no live web, news or independent verification.`;
    }catch(error){if(contextKey===key()&&seq===aiSequence)el('researchAIAnswer').textContent='AI unavailable: '+error.message;}
    finally{aiBusy=false;buttons();}
  }
  el('runDeepResearch').onclick=run;el('stopDeepResearch').onclick=()=>{paused=true;el('stopDeepResearch').disabled=true;el('deepProgress').textContent='Pausing after the current request.';};
  el('exportDeepResearch').onclick=()=>{if(report&&reportKey===key())deps.download('bursaquant-deep-report.json',JSON.stringify(report,null,2),'application/json');};
  el('checkResearchAI').onclick=checkAI;el('askResearchAI').onclick=askAI;
  root.querySelectorAll('[data-research-prompt]').forEach(button=>button.onclick=()=>{el('researchQuestion').value=button.dataset.researchPrompt;});
  refresh();
  return {run,refresh};
}

return {researchAiContext,mountResearchWorkspace};
})();
const BQIpo=(()=>{
// IPO research is entered by the user from source documents; no live IPO feed.
const IPO_STORAGE_KEY='bq_ipo_dossiers_v1';
const IPO_MAX_RECORDS=50;
const IPO_MAX_BYTES=1000000;
const IPO_METRIC_FIELDS=['price','shares','revenue','profit','equity','debt','cash','operatingCashFlow'];
const IPO_TEXT_FIELDS={name:160,sourceUrl:1800,sourceDate:10,periodEnd:10,pageRefs:400,sector:120,useOfProceeds:1800,concentration:1800,lockup:1800,risks:2400,thesis:2400,peerReason:500};
const ipoEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ipoNumber=value=>value===null||value===undefined||(typeof value==='string'&&!value.trim())?null:(typeof value==='number'||typeof value==='string')&&Number.isFinite(Number(value))?Number(value):NaN;
const ipoDate=value=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
const ipoFinite=value=>typeof value==='number'&&Number.isFinite(value);
const ipoDivide=(a,b)=>ipoFinite(a)&&ipoFinite(b)&&b>0&&Number.isFinite(a/b)?a/b:null;
const ipoMedian=values=>{const sorted=values.filter(ipoFinite).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2):null;};

function safeIpoSourceUrl(value){
  if(!String(value??'').trim())return '';
  try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

function ipoCleanEntity(input,peer=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Each IPO or peer must be an object.');
  const record={};
  for(const [key,max]of Object.entries(IPO_TEXT_FIELDS)){
    const raw=input[key]??'';
    if(typeof raw!=='string'||raw.length>max)throw new Error(`${key} must be text with at most ${max} characters.`);
    record[key]=raw.trim();
  }
  if(!record.name)throw new Error(peer?'Each peer needs a company name.':'Enter a company name.');
  record.sourceUrl=safeIpoSourceUrl(record.sourceUrl);
  if(record.sourceUrl===null)throw new Error('Source links must use http or https and cannot contain credentials.');
  for(const field of ['sourceDate','periodEnd'])if(!ipoDate(record[field]))throw new Error(`${field} must be a valid date.`);
  for(const [field,choices,fallback]of [['market',['MY','US'],'MY'],['currency',['MYR','USD'],'MYR'],['stage',['prelisting','listed'],'prelisting'],['sourceStatus',['unverified','draft','final'],'unverified'],['basis',['unconfirmed','audited','unaudited'],'unconfirmed']]){
    const value=input[field]??fallback;if(!choices.includes(value))throw new Error(`Invalid ${field}.`);record[field]=value;
  }
  for(const field of [...IPO_METRIC_FIELDS,'primaryPct','secondaryPct']){
    const value=ipoNumber(input[field]);
    if(value!==null&&(!Number.isFinite(value)||Math.abs(value)>1e12))throw new Error(`${field} must be a finite number with absolute value at most 1 trillion.`);
    if(value!==null&&['price','shares','revenue','debt','cash','primaryPct','secondaryPct'].includes(field)&&value<0)throw new Error(`${field} cannot be negative.`);
    if(value!==null&&['price','shares'].includes(field)&&value<=0)throw new Error(`${field} must be greater than zero when supplied.`);
    if(value!==null&&['primaryPct','secondaryPct'].includes(field)&&value>100)throw new Error('Offer percentages must be between 0 and 100.');
    record[field]=value;
  }
  if(record.primaryPct!==null&&record.secondaryPct!==null&&Math.abs(record.primaryPct+record.secondaryPct-100)>0.01)throw new Error('Primary and secondary percentages must total 100 when both are supplied.');
  record.comparable=input.comparable===true;
  return record;
}

function validateIpoDossier(input){
  const record=ipoCleanEntity(input);
  const id=input.id??'';
  if(typeof id!=='string'||(id&&!/^[a-zA-Z0-9_-]{1,80}$/.test(id)))throw new Error('Invalid IPO record ID.');
  record.id=id;
  record.schemaVersion=1;
  if(input.schemaVersion!==undefined&&input.schemaVersion!==1)throw new Error('Unsupported IPO backup version.');
  if(input.peers!==undefined&&!Array.isArray(input.peers))throw new Error('Peers must be an array.');
  if((input.peers?.length||0)>10)throw new Error('Use at most 10 peers per IPO.');
  record.peers=(input.peers||[]).map(peer=>ipoCleanEntity(peer,true));
  return record;
}

function calculateIpoMetrics(input={}){
  const n=Object.fromEntries(IPO_METRIC_FIELDS.map(field=>[field,ipoNumber(input[field])]));
  const marketCap=ipoFinite(n.price)&&n.price>0&&ipoFinite(n.shares)&&n.shares>0&&Number.isFinite(n.price*n.shares)?n.price*n.shares:null;
  const netDebt=ipoFinite(n.debt)&&n.debt>=0&&ipoFinite(n.cash)&&n.cash>=0?n.debt-n.cash:null;
  const enterpriseValue=ipoFinite(marketCap)&&ipoFinite(netDebt)&&Number.isFinite(marketCap+netDebt)?marketCap+netDebt:null;
  return {marketCap,eps:ipoDivide(n.profit,n.shares),pe:ipoDivide(marketCap,n.profit),ps:ipoDivide(marketCap,n.revenue),netDebt,enterpriseValue,
    evRevenue:enterpriseValue!==null&&enterpriseValue>0?ipoDivide(enterpriseValue,n.revenue):null,
    netMargin:ipoDivide(n.profit,n.revenue)===null?null:ipoDivide(n.profit,n.revenue)*100,
    returnOnClosingEquity:ipoDivide(n.profit,n.equity)===null?null:ipoDivide(n.profit,n.equity)*100,
    cashConversion:ipoDivide(n.operatingCashFlow,n.profit)===null?null:ipoDivide(n.operatingCashFlow,n.profit)*100,
    peStatus:ipoFinite(n.profit)&&n.profit<=0?'N/M · non-positive profit':marketCap===null||!ipoFinite(n.profit)?'Missing inputs':'Available'};
}

function ipoSourceGaps(entity){
  const gaps=[];
  if(entity.sourceStatus!=='final')gaps.push('final/registered source not confirmed');
  if(!safeIpoSourceUrl(entity.sourceUrl))gaps.push('source link missing');
  if(!entity.sourceDate||!ipoDate(entity.sourceDate))gaps.push('source review date missing');
  if(!entity.periodEnd||!ipoDate(entity.periodEnd))gaps.push('annual financial year-end missing');
  if(entity.basis!=='audited')gaps.push('audited annual basis not confirmed');
  return gaps;
}

function compareIpoPeers(dossier){
  const subject=calculateIpoMetrics(dossier),subjectGaps=ipoSourceGaps(dossier);
  const rows=(dossier.peers||[]).map(peer=>{
    const reasons=ipoSourceGaps(peer);
    if(!peer.comparable)reasons.push('business comparability not confirmed');
    if(peer.currency!==dossier.currency)reasons.push('currency differs');
    if(peer.periodEnd!==dossier.periodEnd)reasons.push('financial year-end differs');
    if(subjectGaps.length)reasons.push('IPO source/basis incomplete');
    return {name:peer.name,eligible:reasons.length===0,reasons,metrics:calculateIpoMetrics(peer)};
  });
  const metrics=['pe','ps','evRevenue','netMargin','returnOnClosingEquity'].map(key=>{
    const values=rows.filter(row=>row.eligible).map(row=>row.metrics[key]).filter(ipoFinite);
    const median=ipoMedian(values),value=subject[key];
    return {key,value,median,count:values.length,differencePct:median!==null&&median>0&&ipoFinite(value)?(value/median-1)*100:null};
  });
  return {subject,subjectGaps,rows,metrics,eligiblePeers:rows.filter(row=>row.eligible).length};
}

function parseIpoImport(text){
  if(typeof text!=='string'||text.length>IPO_MAX_BYTES||new TextEncoder().encode(text).length>IPO_MAX_BYTES)throw new Error('IPO backup exceeds 1 MB.');
  let data;try{data=JSON.parse(text);}catch{throw new Error('Choose a valid IPO JSON backup.');}
  if(!data||data.schemaVersion!==1||!Array.isArray(data.dossiers)||data.dossiers.length>IPO_MAX_RECORDS)throw new Error('Expected a version 1 IPO backup with at most 50 dossiers.');
  const records=data.dossiers.map(validateIpoDossier),ids=records.map(record=>record.id).filter(Boolean);
  if(new Set(ids).size!==ids.length)throw new Error('IPO backup has duplicate record IDs.');
  return records;
}

const IPO_LABELS={price:'Offer / reference price · currency per share',shares:'Post-IPO diluted shares · millions',revenue:'Annual revenue · millions',profit:'Annual net profit attributable to owners · millions',equity:'Equity attributable to owners at year-end · millions',debt:'Debt at year-end · millions',cash:'Cash at year-end · millions',operatingCashFlow:'Annual operating cash flow · millions'};
const IPO_NAMES={pe:'P/E',ps:'P/S',evRevenue:'EV / revenue',netMargin:'Net margin',returnOnClosingEquity:'Profit / closing equity'};
const ipoFormat=(value,digits=2)=>ipoFinite(value)?new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value):'Unavailable';
const ipoLink=(url,label)=>safeIpoSourceUrl(url)?`<a href="${ipoEscape(safeIpoSourceUrl(url))}" target="_blank" rel="noopener noreferrer">${ipoEscape(label)}</a>`:'No source link';
const ipoInput=(name,label,options={})=>`<label>${ipoEscape(label)}<input name="${name}" type="${options.type||'text'}" ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''} ${options.type==='number'?'step="any"':''} ${options.maxlength?`maxlength="${options.maxlength}"`:''} ${options.required?'required':''} /></label>`;

function ipoEntityForm(peer=false){
  return `<div class="ipo-fields">${ipoInput('name',peer?'Peer company':'IPO company',{required:true,maxlength:160})}<label>Market<select name="market"><option value="MY">Bursa Malaysia</option><option value="US">US</option></select></label><label>Currency for every amount<select name="currency"><option value="MYR">MYR</option><option value="USD">USD</option></select></label><label>${peer?'Reference price status':'IPO stage'}<select name="stage"><option value="prelisting">Pre-listing / offer price</option><option value="listed">Listed / reference price</option></select></label>${ipoInput('sector','Business / sector',{maxlength:120})}${ipoInput('sourceUrl',peer?'Annual report / filing URL':'Prospectus / filing URL',{type:'url',maxlength:1800})}<label>Document status · user confirmed<select name="sourceStatus"><option value="unverified">Not verified</option><option value="draft">Draft / exposure only</option><option value="final">Final / registered filing</option></select></label>${ipoInput('sourceDate','Source last reviewed',{type:'date'})}${ipoInput('pageRefs','Document pages / sections and price date',{maxlength:400})}${ipoInput('periodEnd','Annual financial year-end',{type:'date'})}<label>Financial basis<select name="basis"><option value="unconfirmed">Not confirmed</option><option value="audited">Audited annual</option><option value="unaudited">Other / unaudited</option></select></label>${IPO_METRIC_FIELDS.map(field=>ipoInput(field,peer&&field==='shares'?'Diluted shares · millions':IPO_LABELS[field],{type:'number',...(['price','shares','revenue','debt','cash'].includes(field)?{min:0}:{})})).join('')}</div>`;
}

function ipoReadEntity(form){
  const value={};
  for(const element of form.querySelectorAll('[name]'))value[element.name]=element.type==='checkbox'?element.checked:element.value;
  return value;
}
function ipoFillEntity(form,data){
  for(const element of form.querySelectorAll('[name]')){
    if(element.type==='checkbox')element.checked=data[element.name]===true;
    else element.value=data[element.name]??'';
  }
}

function mountIpoWorkspace(rootElement){
  if(!rootElement)return {destroy(){}};
  let dossiers=[],currentId='',peers=[],storageWarning='',destroyed=false;
  try{const saved=globalThis.localStorage?.getItem(IPO_STORAGE_KEY);if(saved)dossiers=parseIpoImport(saved);}catch{storageWarning='Saved IPO research could not be read. Import a backup if available; no saved record has been overwritten.';}
  rootElement.innerHTML=`<div class="ipo-intro card"><h3>Build a prospectus-backed IPO dossier</h3><p>Compare what you would pay with audited financials and selected listed peers. Enter figures from the final prospectus and annual reports; BursaQuant does not fetch or verify these documents automatically.</p><div class="ipo-source-links">${ipoLink('https://www.bursamalaysia.com/','Bursa Malaysia · official site')}${ipoLink('https://www.sc.com.my/resources/prospectus-exposure','SC · draft prospectus exposure')}${ipoLink('https://www.sec.gov/search-filings','SEC EDGAR · US filings')}${ipoLink('https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-17','SEC · IPO research guide')}</div><p class="small muted">Draft exposure documents can change and are not final investment documents. Listing dates, offer terms and financial inputs require your source review. This is a manual research workspace, not a live IPO calendar.</p></div>
  <div class="ipo-layout space-top"><div class="card ipo-editor"><div class="card-title-row"><h3>IPO details & financials</h3><button type="button" class="btn sm ghost" data-action="new">New dossier</button></div><p class="small muted">All share counts and financial totals below use <strong>millions</strong>; only price and EPS use currency per share. Blank means unknown; enter 0 only when confirmed. Use one audited full year, not a quarter or forecast. Equity, debt and cash use that year-end; post-IPO pro forma adjustments are not inferred.</p><form class="ipo-form" data-role="dossier">${ipoEntityForm()}<div class="ipo-fields">${ipoInput('primaryPct','New shares · % of total offered',{type:'number',min:0,max:100})}${ipoInput('secondaryPct','Existing holders selling · % of offered',{type:'number',min:0,max:100})}</div>${[['useOfProceeds','Use of proceeds · expansion, working capital, debt repayment, fees'],['concentration','Customer / supplier concentration and related-party exposure'],['lockup','Lock-up / moratorium terms and potential share overhang'],['risks','Main risks, governance, dilution and unproven assumptions'],['thesis','Why research this IPO? What would invalidate your thesis?']].map(([field,label])=>`<label class="ipo-note">${label}<textarea name="${field}" maxlength="${IPO_TEXT_FIELDS[field]}" rows="3"></textarea></label>`).join('')}<div class="row-buttons"><button type="submit" class="btn primary">Calculate research report</button><button type="button" class="btn secondary" data-action="save">Save dossier</button></div></form><p class="ipo-status small" data-role="status" role="status" aria-live="polite"></p></div>
  <aside class="card ipo-saved"><h3>My IPO watchlist</h3><p class="small muted">Saved on this browser only. Export a backup to move research to another device.</p><div data-role="saved" class="ipo-records"></div><div class="row-buttons space-top"><button type="button" class="btn ghost sm" data-action="export">Export backup</button><label class="btn ghost sm ipo-file">Import backup<input type="file" accept=".json,application/json" data-role="import" /></label></div><p class="small muted">Import adds new record IDs, keeps existing records and never imports a trading order.</p></aside></div>
  <div class="card space-top"><div class="card-title-row"><h3>Choose comparable listed peers</h3><button type="button" class="btn sm secondary" data-action="add-peer">+ Add peer</button></div><p class="small muted">Up to 10 peers. Match the business model, financial year-end, currency and audited annual basis. Each peer needs a source link and review date. Confirm comparability after reviewing growth, size, leverage, accounting and one-off items. Medians exclude incomplete or mismatched entries.</p><div data-role="peers" class="ipo-peer-list"></div></div><div data-role="report" class="space-top" aria-live="polite"><div class="card"><h3>Research report</h3><p class="muted small">Start a dossier and calculate to see valuation, missing evidence and peer comparisons. No sample companies or invented valuations are loaded.</p></div></div>`;
  const find=selector=>rootElement.querySelector(selector),form=find('[data-role="dossier"]'),status=find('[data-role="status"]');
  const message=text=>{status.textContent=text;};
  const makeId=()=>globalThis.crypto?.randomUUID?.()||'ipo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  function readDossier(){
    peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));
    return validateIpoDossier({...ipoReadEntity(form),id:currentId,peers});
  }
  function persist(next){
    if(next.length>IPO_MAX_RECORDS)throw new Error('Keep at most 50 dossiers; export and delete older research first.');
    const text=JSON.stringify({schemaVersion:1,dossiers:next});
    if(new TextEncoder().encode(text).length>IPO_MAX_BYTES)throw new Error('IPO storage exceeds 1 MB; export and remove older dossiers first.');
    globalThis.localStorage.setItem(IPO_STORAGE_KEY,text);dossiers=next;storageWarning='';renderSaved();
  }
  function renderSaved(){
    find('[data-role="saved"]').innerHTML=dossiers.length?dossiers.map(record=>`<div class="ipo-record"><strong>${ipoEscape(record.name)}</strong><span class="small muted">${ipoEscape(record.market)} · ${record.stage==='listed'?'Listed':'Pre-listing'} · ${ipoEscape(record.sourceDate||'Review date missing')}</span><div class="row-buttons"><button type="button" class="btn sm ghost" data-action="open" data-id="${ipoEscape(record.id)}">Open</button><button type="button" class="btn sm ghost" data-action="delete" data-id="${ipoEscape(record.id)}">Delete</button></div></div>`).join(''):'<p class="small muted">No IPO dossiers saved yet.</p>';
  }
  function renderPeers(){
    find('[data-role="peers"]').innerHTML=peers.map((peer,index)=>`<details class="ipo-peer" open><summary>Peer ${index+1}${peer.name?' · '+ipoEscape(peer.name):''}</summary><div data-peer-index="${index}" class="ipo-form">${ipoEntityForm(true)}<label class="ipo-check"><input name="comparable" type="checkbox" /> I reviewed this business as comparable to the IPO</label>${ipoInput('peerReason','Why this is a useful peer / differences',{maxlength:500})}<button type="button" class="btn sm ghost" data-action="remove-peer" data-index="${index}">Remove peer</button></div></details>`).join('')||'<p class="small muted">No peers entered. Add two or more well-matched companies for a more useful context.</p>';
    for(const [index,peer]of peers.entries())ipoFillEntity(find(`[data-peer-index="${index}"]`),peer);
  }
  function renderReport(record){
    find('[data-role="report"]').removeAttribute('data-stale');
    const comparison=compareIpoPeers(record),m=comparison.subject;
    const gaps=[...comparison.subjectGaps];
    for(const field of IPO_METRIC_FIELDS)if(record[field]===null)gaps.push(`${IPO_LABELS[field]} not supplied`);
    if(!record.useOfProceeds)gaps.push('use of proceeds not documented');
    if(!record.risks)gaps.push('risks not documented');
    if(!record.lockup)gaps.push('lock-up / moratorium not documented');
    const cards=[['Market cap',`${ipoFormat(m.marketCap)} ${record.currency}m`],['P/E',m.pe===null?m.peStatus:ipoFormat(m.pe)+'×'],['P/S',m.ps===null?'Unavailable':ipoFormat(m.ps)+'×'],['Net debt',`${ipoFormat(m.netDebt)} ${record.currency}m`],['EV / revenue',m.evRevenue===null?'Unavailable / N/M':ipoFormat(m.evRevenue)+'×'],['Net margin',m.netMargin===null?'Unavailable':ipoFormat(m.netMargin)+'%']];
    const metricCell=(key,value)=>ipoFinite(value)?ipoFormat(value)+(['netMargin','returnOnClosingEquity'].includes(key)?'%':'×'):'Unavailable / N/M';
    find('[data-role="report"]').innerHTML=`<div class="card"><div class="card-title-row"><h3>${ipoEscape(record.name)} · IPO research</h3><span class="badge badge-outline">User-entered evidence</span></div><p class="small muted">${ipoEscape(record.market)} · ${ipoEscape(record.currency)} · Annual financial year ended ${ipoEscape(record.periodEnd||'not supplied')} · Source reviewed ${ipoEscape(record.sourceDate||'not supplied')} · ${ipoLink(record.sourceUrl,'Open source document')}</p>${record.sourceStatus==='draft'?'<p class="ipo-warning">Draft / exposure document: figures and offer terms can change. Obtain the final registered prospectus before deciding.</p>':''}<div class="ipo-metrics">${cards.map(([label,value])=>`<div class="metric"><div class="label">${label}</div><div class="value">${ipoEscape(value)}</div></div>`).join('')}</div><div class="ipo-report-two"><div><h4>Cash and ownership checks</h4><p>EPS on entered diluted shares: ${ipoFormat(m.eps,4)} ${ipoEscape(record.currency)} per share.<br>Operating cash flow / net profit: ${m.cashConversion===null?'Unavailable / N/M':ipoFormat(m.cashConversion)+'%'}.<br>Profit / closing equity: ${m.returnOnClosingEquity===null?'Unavailable / N/M':ipoFormat(m.returnOnClosingEquity)+'%'}.<br>New / existing shares as share of offer: ${ipoFormat(record.primaryPct)}% / ${ipoFormat(record.secondaryPct)}%.</p><p class="small muted">Profit / closing equity is a rough proxy, not ROE using average equity. EPS uses post-IPO diluted shares with historical profit; it is not reported historical EPS. New-share proceeds go to the issuer; secondary-sale proceeds go to selling holders. Allocation and listing returns are not predicted.</p></div><div><h4>Evidence still needed</h4>${gaps.length?`<ul>${gaps.map(gap=>`<li>${ipoEscape(gap)}</li>`).join('')}</ul>`:'<p>Required input fields are present. Accuracy, suitability and completeness still depend on your document review.</p>'}</div></div></div>
      <div class="card space-top"><h3>Peer comparison · ${comparison.eligiblePeers} eligible of ${comparison.rows.length} entered</h3><div class="scroll-table"><table><thead><tr><th>Measure</th><th>IPO</th><th>Peer median</th><th>Peers used</th><th>Difference to median</th></tr></thead><tbody>${comparison.metrics.map(metric=>`<tr><td>${IPO_NAMES[metric.key]}</td><td>${metricCell(metric.key,metric.value)}</td><td>${metricCell(metric.key,metric.median)}</td><td>${metric.count}</td><td>${metric.differencePct===null?'Unavailable':ipoFormat(metric.differencePct)+'%'}</td></tr>`).join('')}</tbody></table></div>${comparison.rows.map((row,index)=>`<div class="ipo-peer-result"><strong>${ipoEscape(row.name)}</strong> · ${ipoLink(record.peers[index].sourceUrl,'Source')}<p>${row.eligible?'Eligible for medians when the metric is meaningful.':ipoEscape('Excluded: '+row.reasons.join('; '))}</p><p>${ipoEscape(record.peers[index].peerReason||'Comparability rationale not documented.')}</p></div>`).join('')}<p class="small muted">A lower multiple can reflect weaker growth, earnings quality, governance or risk. The median is context, not fair value or a buy signal. Two peers can still be a biased sample. EV here is market cap + entered debt − cash; it excludes preferred shares, non-controlling interests and other adjustments. Banks, insurers and other financial firms need a sector-specific model. Negative or zero profit makes P/E not meaningful; missing inputs remain unavailable.</p></div>
      <div class="card space-top"><h3>Thesis, offer structure & risks</h3>${[['Thesis / invalidation',record.thesis],['Use of proceeds',record.useOfProceeds],['Concentration / related parties',record.concentration],['Lock-up / potential selling pressure',record.lockup],['Risks / governance',record.risks]].map(([label,value])=>`<div class="ipo-research-note"><h4>${label}</h4><p>${ipoEscape(value||'Not documented.')}</p></div>`).join('')}<p class="small muted">${record.stage==='prelisting'?'Pre-listing IPOs have no traded-price history for technical timing. After listing, enough completed candles must accumulate before normal indicators are available.':'Use Stock Analysis separately once the listed ticker has sufficient completed price history. Listing-day volatility and gaps can make planned stops unreliable.'} IPO allocation and market gains are uncertain. Compare the downside, liquidity and your position risk before committing capital.</p></div>`;
  }
  function reset(){currentId='';peers=[];form.reset();form.querySelector('[name="market"]').value='MY';form.querySelector('[name="currency"]').value='MYR';renderPeers();find('[data-role="report"]').innerHTML='<div class="card"><h3>New IPO research</h3><p class="small muted">Enter source-backed figures and calculate a report.</p></div>';message('New unsaved dossier.');}
  function download(){
    const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),dossiers},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='bursaquant-ipo-research.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function onSubmit(event){if(event.target!==form)return;event.preventDefault();try{const record=readDossier();renderReport(record);message('Report calculated from the current inputs. Save the dossier to keep these edits.');}catch(error){message(error.message);}}
  function markEdited(){
    const report=find('[data-role="report"]');
    if(!report.hasAttribute('data-stale')){
      report.setAttribute('data-stale','true');
      const warning=document.createElement('p');warning.className='ipo-warning';warning.textContent='Inputs have changed. The report below uses the previous calculation. Recalculate to include current edits.';report.prepend(warning);
    }
    message('Unsaved edits. Calculate the report again, then save the dossier to keep the changes.');
  }
  function onInput(event){if(event.target.closest('[data-role="dossier"], [data-peer-index]'))markEdited();}
  function onClick(event){
    const button=event.target.closest('[data-action]');if(!button||!rootElement.contains(button))return;
    try{
      const action=button.dataset.action;
      if(action==='new'){reset();return;}
      if(action==='save'){
        const record=readDossier();record.id ||= makeId();
        const next=dossiers.some(item=>item.id===record.id)?dossiers.map(item=>item.id===record.id?record:item):[record,...dossiers];
        persist(next);currentId=record.id;renderReport(record);message('IPO dossier saved on this browser. Export a backup for other devices.');
      }
      if(action==='open'){
        const record=dossiers.find(item=>item.id===button.dataset.id);if(!record)return;currentId=record.id;peers=record.peers.map(peer=>({...peer}));ipoFillEntity(form,record);renderPeers();renderReport(record);message('Saved dossier opened. Changes are kept only when you press Save dossier.');
      }
      if(action==='delete'){
        const id=button.dataset.id;persist(dossiers.filter(record=>record.id!==id));if(currentId===id)currentId='';message('Saved dossier deleted. The current form stays available until you leave or start a new dossier.');
      }
      if(action==='add-peer'){
        peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));if(peers.length>=10)throw new Error('Use at most 10 peers.');
        peers.push({market:form.querySelector('[name="market"]').value,currency:form.querySelector('[name="currency"]').value,stage:'listed',periodEnd:form.querySelector('[name="periodEnd"]').value,basis:'unconfirmed',sourceStatus:'unverified'});renderPeers();markEdited();message('Peer added. Fill its source and financials, confirm comparability, then calculate again.');
      }
      if(action==='remove-peer'){peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));peers.splice(Number(button.dataset.index),1);renderPeers();markEdited();message('Peer removed from current edits. Calculate and save to update the report and stored dossier.');}
      if(action==='export'){download();message('IPO backup exported. It contains your research, not gateway or AI access credentials.');}
    }catch(error){message(error.name==='QuotaExceededError'?'Browser storage is full. Export a backup and free space before saving.':error.message||'IPO action failed.');}
  }
  async function onChange(event){
    if(event.target!==find('[data-role="import"]'))return;
    const input=event.target,file=input.files?.[0];if(!file)return;
    try{
      if(file.size>IPO_MAX_BYTES)throw new Error('IPO backup exceeds 1 MB.');
      const imported=parseIpoImport(await file.text());if(destroyed)return;
      const existing=new Set(dossiers.map(record=>record.id));let added=0;
      const newRecords=imported.filter(record=>!record.id||!existing.has(record.id)).map(record=>({...record,id:record.id||makeId()}));
      added=newRecords.length;persist([...dossiers,...newRecords]);message(`Imported ${added} dossier${added===1?'':'s'}. Existing record IDs were kept unchanged.`);
    }catch(error){message(error.message||'Could not import this IPO backup.');}finally{input.value='';}
  }
  renderSaved();renderPeers();if(storageWarning)message(storageWarning);
  rootElement.addEventListener('submit',onSubmit);rootElement.addEventListener('click',onClick);rootElement.addEventListener('change',onChange);rootElement.addEventListener('input',onInput);
  return {destroy(){destroyed=true;rootElement.removeEventListener('submit',onSubmit);rootElement.removeEventListener('click',onClick);rootElement.removeEventListener('change',onChange);rootElement.removeEventListener('input',onInput);}};
}

return {safeIpoSourceUrl,validateIpoDossier,calculateIpoMetrics,compareIpoPeers,parseIpoImport,mountIpoWorkspace};
})();
const {evaluateAccumulation,DEFAULT_SCREEN_SETTINGS}=BQAccumulation;
const {screenInstrument,parseScreenSymbols,parseScreenListFile,createScreenRun,screenCoverage,scanDailyBatch}=BQScanRunner;
const {buildDeepReport}=BQDeepAnalysis;
const {mountResearchWorkspace}=BQResearchUI;
const {mountIpoWorkspace}=BQIpo;
function deepSelection(){
 const controls=screenControls(),screenSettings={minAverageVolume:controls.minAverageVolume,minAverageTurnover:symbol.market==='MY'?controls.turnoverMY:controls.turnoverUS,maxRangePct:controls.maxRangePct,cmfThreshold:controls.cmfThreshold};
 return {symbol:symbol.symbol,name:symbol.name,market:symbol.market,currency:symbol.currency,type:symbol.type,mode:style,strategy:ratingStrategy,riskSettings:{...settings},screenSettings,key:JSON.stringify([symbol.symbol,symbol.market,symbol.type,dataProvider,gatewayBase,gatewayRevision,demoMode,style,ratingStrategy,settings,screenSettings]),connectionKey:JSON.stringify([dataProvider,gatewayBase,gatewayRevision]),canLoad:!!gatewayBase&&!demoMode&&['Stock','ETF'].includes(symbol.type),unavailableReason:!gatewayBase?'Connect your gateway in Risk & Data Settings first.':demoMode?'Select a stock and click Refresh Data in Stock Analysis to leave demo mode.':'Deep research supports ordinary stocks and ETFs.'};
}
async function researchGatewayFetch(path,{method='GET',body}={}){
 if(!gatewayBase)throw new Error('Connect your personal gateway in Risk & Data Settings first.');
 const resp=await fetch(gatewayUrl(path),{method,cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(gatewayAccessCode?{'X-BQ-Access-Token':gatewayAccessCode}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let data=null;try{data=await resp.json();}catch{}
 if(!resp.ok)throw Object.assign(new Error(data?.error?.message||`Gateway HTTP ${resp.status}`),{status:resp.status,code:data?.error?.code});
 if(!data||typeof data!=='object')throw new Error('Gateway returned an unreadable response.');
 return data;
}
function registerResearch(){
 researchWorkspace=mountResearchWorkspace($('deepWorkspace'),{
   getSelection:deepSelection,
   fetchMarket:(selection,interval)=>researchGatewayFetch(`/market?market=${encodeURIComponent(selection.market)}&symbol=${encodeURIComponent(selection.symbol)}&interval=${encodeURIComponent(interval)}&provider=${encodeURIComponent(dataProvider)}&limit=500`),
   analyseFrame:(bars,selection)=>analyse(bars,selection.mode,selection.strategy),
   evaluateDaily:(bars,selection)=>evaluateAccumulation(bars,selection.screenSettings),
   sizePlans:(analysis,selection)=>analysis.plans.map(plan=>sizePosition(plan,selection.riskSettings,selection.currency,selection.market==='MY'&&selection.type==='Stock'?100:1)),
   buildReport:buildDeepReport,getAIStatus:()=>researchGatewayFetch('/research'),sendAI:body=>researchGatewayFetch('/research',{method:'POST',body}),download
 });
 $('openDeepResearch').onclick=()=>{setPage('research');researchWorkspace.run();};
 mountIpoWorkspace($('ipoWorkspace'));
}
const instruments=[
 {symbol:'AAPL',name:'Apple Inc.',market:'US',exchange:'NASDAQ',currency:'USD',type:'Stock'},
 {symbol:'NVDA',name:'NVIDIA Corporation',market:'US',exchange:'NASDAQ',currency:'USD',type:'Stock'},
 {symbol:'MSFT',name:'Microsoft Corporation',market:'US',exchange:'NASDAQ',currency:'USD',type:'Stock'},
 {symbol:'TSLA',name:'Tesla, Inc.',market:'US',exchange:'NASDAQ',currency:'USD',type:'Stock'},
 {symbol:'SPY',name:'SPDR S&P 500 ETF Trust',market:'US',exchange:'NYSE Arca',currency:'USD',type:'ETF'},
 {symbol:'QQQ',name:'Invesco QQQ Trust',market:'US',exchange:'NASDAQ',currency:'USD',type:'ETF'},
 {symbol:'1155',name:'Malayan Banking Berhad (Maybank)',market:'MY',exchange:'BURSA',currency:'MYR',type:'Stock'},
 {symbol:'1023',name:'CIMB Group Holdings Berhad',market:'MY',exchange:'BURSA',currency:'MYR',type:'Stock'},
 {symbol:'5347',name:'Tenaga Nasional Berhad',market:'MY',exchange:'BURSA',currency:'MYR',type:'Stock'},
 {symbol:'5183',name:'Petronas Chemicals Group Berhad',market:'MY',exchange:'BURSA',currency:'MYR',type:'Stock'},
 {symbol:'5296',name:'MR D.I.Y. Group (M) Berhad',market:'MY',exchange:'BURSA',currency:'MYR',type:'Stock'},
 {symbol:'FBMKLCI',name:'FTSE Bursa Malaysia KLCI (index demo)',market:'MY',exchange:'BURSA',currency:'MYR',type:'Index'},
 {symbol:'5357CC',name:'Illustrative structured warrant — not priced by equity model',market:'MY',exchange:'BURSA',currency:'MYR',type:'Warrant'}
];
const $=id=>document.getElementById(id);const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('bq_'+key))??fallback}catch{return fallback}};
const persist=(key,val)=>{try{localStorage.setItem('bq_'+key,JSON.stringify(val));return true}catch{notify('Browser storage unavailable; export a backup.');return false}};
let settings={...DEFAULT_SETTINGS,...load('settings',{})};let watchlist=load('watchlist',[]),snapshots=load('snapshots',[]),trades=load('trades',[]);
let symbol=instruments[0],timeframe='1day',style='swing',candles=[],source='SIMULATED DEMO',sourceAt='',currentAnalysis=null,zoom=85,hoverIndex=null,toastTimer=null;
const hosted=/^https?:$/.test(window.location?.protocol||'');
const defaultGateway=hosted?(window.location?.hostname==='synakmal.github.io'?'https://bursaquant-syn-db04.vercel.app/api':'/api'):'';
let gatewayBase=load('gatewayBase',defaultGateway);
let dataProvider=load('dataProvider','auto'),demoMode=load('demoMode',!gatewayBase),gatewayAccessCode=load('gatewayAccessCode','');
if(!['auto','yahoo','twelvedata','isaham'].includes(dataProvider))dataProvider='auto';
let requestSeq=0,activeDataKey='',dataError='';
let lastProviderMeta=null;
let researchWorkspace=null,gatewayRevision=0;
let ratingStrategy=normalizeStrategy(load('ratingStrategy',null));
let screenRun=load('screenRun',null),screenDirectory=load('screenDirectory',null),screenStop=false,screenLoading=false,screenDirectorySeq=0,screenVisible=100;
if(screenRun?.version!==1||!Array.isArray(screenRun?.queue)||!Array.isArray(screenRun?.results))screenRun=null;
if(screenRun)screenRun.running=false;
if(!Array.isArray(screenDirectory?.instruments))screenDirectory=null;
function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4200)}
function fmt(v,dec=2){return Number.isFinite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—'};
const money=(v,currency=symbol.currency)=>`${currency==='USD'?'$':'RM'}${fmt(v,v>1?2:4)}`;
const nfmt=v=>Number.isFinite(v)?fmt(v,2):'—';
function setPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('crumb').textContent=({'analysis':'STOCK ANALYSIS','research':'DEEP RESEARCH & AI','ipo':'IPO RESEARCH','screener':'STOCK SCREENER','watchlist':'WATCHLIST','journal':'TRADING JOURNAL','settings':'SETTINGS','strategy':'STRATEGY & LEARNING'})[page]||'STOCK ANALYSIS';$('sidebar').classList.remove('open');if(page==='settings')fillSettings();if(page==='strategy'){fillStrategyForm();renderResearchAnswer();}if(page==='watchlist')renderWatch();if(page==='journal')renderJournal();if(page==='screener')renderScreener();if(page==='research')researchWorkspace?.refresh();if(page==='analysis')requestAnimationFrame(drawChart);window.scrollTo({top:0,behavior:'instant'});}
function getInstrument(q){q=q.toUpperCase().replace('.KL','');return instruments.find(s=>s.symbol.toUpperCase()===q)||instruments.find(s=>s.name.toUpperCase()===q)||null}
function selectedInstrument(q){const found=getInstrument(q);if(found)return found;const raw=String(q).trim().toUpperCase().replace(/[^A-Z0-9.^:-]/g,'').slice(0,24);if(!raw)throw new Error('Type a ticker or company name first.');return {symbol:raw,name:`Custom ticker ${raw}`,market:/^\d{4}/.test(raw)?'MY':'US',exchange:'USER SELECTED',currency:/^\d{4}/.test(raw)?'MYR':'USD',type:'Stock'};}
let searchTimer=null;
async function renderDropdown(){
  const q=$('tickerInput').value.trim().toLowerCase(),box=$('searchResults');clearTimeout(searchTimer);if(!q){box.classList.add('hidden');return;}
  const local=instruments.filter(x=>x.symbol.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).slice(0,5);
  const show=items=>{box.innerHTML=items.map(s=>`<button class="search-result" data-symbol="${htmlEscape(s.symbol)}" data-market="${htmlEscape(s.market)}"><span><strong>${htmlEscape(s.symbol)}</strong> &nbsp; ${htmlEscape(s.name)}</span><small>${htmlEscape(s.market)}</small></button>`).join('')||'<div class="empty">No connected-market matches. You can also enter a ticker directly.</div>';box.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{$('tickerInput').value=b.dataset.symbol;box.classList.add('hidden');chooseSymbol(b.dataset.symbol,b.dataset.market);}));};
  show(local);box.classList.remove('hidden');const provider=dataProvider,base=gatewayBase;
  searchTimer=setTimeout(async()=>{if(!base||q.length<2)return;try{
    const data=await gatewayFetch(`/search?market=ALL&q=${encodeURIComponent(q)}&provider=${encodeURIComponent(provider)}`);
    if(q!==$('tickerInput').value.trim().toLowerCase()||provider!==dataProvider||base!==gatewayBase)return;
    const remote=Array.isArray(data.results)?data.results:[];const merged=[...local,...remote.map(x=>({symbol:x.symbol,name:x.name||x.instrument_name||x.symbol,market:x.market||(/Malaysia|Bursa|\.KL$/i.test((x.exchange||'')+' '+x.symbol)?'MY':'US'),exchange:x.exchange||'MARKET',currency:x.currency||(/Malaysia|Bursa|\.KL$/i.test((x.exchange||'')+' '+x.symbol)?'MYR':'USD'),type:x.type||'Stock'}))].filter((x,i,a)=>x.symbol&&a.findIndex(y=>y.symbol===x.symbol&&y.market===x.market)===i).slice(0,12);show(merged);
  }catch(e){if(q===$('tickerInput').value.trim().toLowerCase()&&!local.length)box.innerHTML=`<div class="empty">Search unavailable: ${htmlEscape(e.message)}. Enter a known ticker directly.</div>`;}},350);
}
function chooseSymbol(input,marketHint=''){try{const local=selectedInstrument(input);if(marketHint==='MY'&&!getInstrument(input))local.market='MY',local.currency='MYR',local.exchange='BURSA';if(marketHint==='US'&&!getInstrument(input))local.market='US',local.currency='USD';symbol=local;$('tickerInput').value=symbol.symbol;$('searchResults').classList.add('hidden');fetchOrDemo();}catch(e){notify(e.message)}}
function exchangeTimezone(){
  const fallback=symbol.market==='MY'?'Asia/Kuala_Lumpur':'America/New_York',candidate=lastProviderMeta?.timezone||lastProviderMeta?.exchangeTimezoneName||fallback;
  try{new Intl.DateTimeFormat('en',{timeZone:candidate}).format(new Date());return candidate;}catch{return fallback;}
}
function exchangeTimeParts(time){
  const epoch=typeof time==='number'?time*1000:Date.parse(time);if(!Number.isFinite(epoch))return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:exchangeTimezone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function exchangeTimestamp(value,includeRaw=true){
  const raw=String(value??'');if(!raw)return 'unknown';
  // Provider dates without an offset already describe the exchange's calendar.
  if(typeof value!=='number'&&!/(?:Z|[+-]\d\d:?\d\d)$/i.test(raw))return `${raw.replace('T',' ')} (${exchangeTimezone()})`;
  const p=exchangeTimeParts(value);if(!p)return raw;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (${exchangeTimezone()})${includeRaw&&typeof value!=='number'?' · '+raw:''}`;
}
function candleTimestampLabel(){
  if(source==='CSV IMPORT')return 'Last imported candle';
  if(!lastProviderMeta?.completedCandles)return 'Last supplied candle';
  return lastProviderMeta.provider==='yahoo'||lastProviderMeta.completionInferred?'Latest candle (completion inferred)':'Latest available completed candle';
}
function renderProviderDetails(){
  const box=$('providerDetails'),meta=lastProviderMeta;if(!meta){box.textContent='';box.classList.add('hidden');return;}
  const details=[];
  if(meta.cached===true)details.push('Served from the gateway cache.');else if(meta.cached===false)details.push('Fetched from the provider for this gateway cache.');
  if(meta.cacheExpiresAt)details.push('Cache expires: '+exchangeTimestamp(meta.cacheExpiresAt)+'. Expiry controls the next refresh; it is not the candle timestamp.');
  if(meta.completionPolicy)details.push(meta.completionPolicy);
  if(meta.notes)details.push(meta.notes);else if(meta.provider==='yahoo')details.push('Candle completion is inferred; it is not guaranteed by Yahoo.');
  if(Number(meta.missingAggregationGroups)>0)details.push(`${meta.missingAggregationGroups} aggregation groups omitted because source candles were missing.`);
  if(timeframe==='4h'&&!String(meta.completionPolicy||'').includes('shorter'))details.push('4H candles follow exchange sessions; buckets near lunch breaks or the market close may be shorter than four hours.');
  if(!meta.completedCandles)details.push('The provider has not confirmed that all supplied candles are complete.');
  box.textContent=details.join('\n');box.classList.toggle('hidden',!details.length);
}
function setSource(kind,asof=''){
  source=kind;sourceAt=asof;const unavailable=kind==='DATA UNAVAILABLE'||kind==='LOADING DATA',demo=kind==='SIMULATED DEMO';
  $('sourceLabel').textContent=kind;$('sourceDot').className='status-dot '+(demo?'simulated':unavailable?'unavailable':'live');$('marketBadge').textContent=demo?'DEMO DATA':kind;
  $('dataNotice').classList.toggle('actual',!demo&&!unavailable);$('dataNotice').classList.toggle('data-error',kind==='DATA UNAVAILABLE');
  $('dataNoticeText').textContent=demo?'SIMULATED SAMPLE · Generated candles; NOT historical quotes or current market prices.':kind==='CSV IMPORT'?'USER-SUPPLIED CSV · Verify timestamps, source, adjustments and selected candle interval.':kind==='YAHOO FINANCE'?'YAHOO FINANCE · Latest available historical candles · Delayed data may apply':kind==='TWELVE DATA API'?'TWELVE DATA · Provider candles · Check the candle timestamp':kind==='iSAHAM API'?'iSAHAM API · Provider candles · Freshness is not guaranteed':kind==='LOADING DATA'?'Loading provider candles…':'No provider analysis available. Check Risk & Data Settings or explicitly load demo data.';
  const fetched=lastProviderMeta?.fetchedAt||lastProviderMeta?.retrievedAt||'';
  $('dataTimestamp').textContent=asof?`${candleTimestampLabel()}: ${exchangeTimestamp(asof)}${fetched?' · Fetched: '+exchangeTimestamp(fetched):''}`:'';renderProviderDetails();
}
function selectionKey(){return [symbol.market,symbol.symbol,timeframe,dataProvider,gatewayBase].join('|');}
function clearAnalysis(message,kind='DATA UNAVAILABLE'){
  candles=[];currentAnalysis=null;activeDataKey='';lastProviderMeta=null;setSource(kind);$('dataNoticeText').textContent=message;
  $('symbolTitle').textContent=symbol.symbol;$('companyName').textContent=symbol.name;$('exchangeTag').textContent=`${symbol.exchange} · ${symbol.type.toUpperCase()}`;$('currentPrice').textContent='—';$('priceChange').textContent='';$('chartLength').textContent='No provider candles loaded';$('chartTimezone').textContent='Chart timezone: '+exchangeTimezone();$('indicatorTF').textContent=timeframe.toUpperCase();
  ['metricCards','planCards','scoreFactors','indicatorTable','levelTable','scenarioDetails'].forEach(id=>$(id).innerHTML='');$('scoreNumber').textContent='—';$('scoreLabel').textContent='Analysis unavailable';$('scoreExplanation').textContent=message;$('scoreRing').style.background='#273447';$('coverageNotice').textContent='A rating requires valid historical candles.';$('technicalMood').textContent='Unavailable';$('researchAnswer').textContent=message;
  $('watchBtn').textContent=watchlist.includes(symbol.symbol)?'★ In watchlist':'☆ Watchlist';$('watchCount').textContent=watchlist.length;$('saveAnalysis').disabled=true;$('exportAiBrief').disabled=true;$('chartTooltip').classList.add('hidden');$('priceCanvas').width=$('priceCanvas').width;$('activeStrategyLabel').textContent=`Rating strategy: ${ratingStrategy.name} · awaiting data`;
}
function gatewayUrl(path){const base=(gatewayBase||'/api').replace(/\/$/,'');return base+path;}
async function gatewayFetch(path){const resp=await fetch(gatewayUrl(path),{cache:'no-store',headers:{Accept:'application/json',...(gatewayAccessCode?{'X-BQ-Access-Token':gatewayAccessCode}:{})}});let data=null;try{data=await resp.json()}catch{}if(!resp.ok)throw Object.assign(new Error(data?.error?.message||data?.message||`Gateway HTTP ${resp.status}`),{status:resp.status,code:data?.error?.code});return data;}
async function fetchOrDemo(){
  if(demoMode){loadDemo(false);return;}
  if(!gatewayBase){clearAnalysis('Set your gateway URL in Risk & Data Settings, or choose Load Demo.');return;}
  const key=selectionKey(),seq=++requestSeq,retain=activeDataKey===key&&currentAnalysis&&source!=='SIMULATED DEMO'&&source!=='CSV IMPORT';dataError='';
  if(!retain)clearAnalysis('Loading the latest available provider candles…','LOADING DATA');else{$('dataNoticeText').textContent='Refreshing provider candles; the previous analysis remains visible until this request finishes.';$('dataNotice').classList.remove('data-error');}
  $('refreshData').disabled=true;
  try{
    const data=await gatewayFetch(`/market?market=${encodeURIComponent(symbol.market)}&symbol=${encodeURIComponent(symbol.symbol)}&interval=${encodeURIComponent(timeframe)}&provider=${encodeURIComponent(dataProvider)}&limit=500`);
    if(seq!==requestSeq||key!==selectionKey())return;
    const meta=data.meta||{},rows=(data.bars||[]).map(v=>({time:Number(v.time),open:+v.open,high:+v.high,low:+v.low,close:+v.close,volume:+v.volume||0})).filter(x=>Number.isFinite(x.time)&&x.open>0&&x.close>0&&x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)).sort((a,b)=>a.time-b.time).filter((x,i,a)=>i===0||x.time!==a[i-1].time);
    if(rows.length<55)throw new Error(`Provider returned ${rows.length} valid candles; this trial needs at least 55 for analysis.`);
    candles=rows;lastProviderMeta=meta;activeDataKey=key;dataError='';
    setSource(meta.provider==='yahoo'?'YAHOO FINANCE':meta.provider==='isaham'?'iSAHAM API':'TWELVE DATA API',meta.lastCompleteCandle||meta.lastCandle||meta.lastUpdated||new Date(rows.at(-1).time*1000).toISOString());
    updateAll();notify(`Loaded ${rows.length} provider candles. ${candleTimestampLabel()}: ${exchangeTimestamp(sourceAt)}.`);
  }catch(e){
    if(seq!==requestSeq||key!==selectionKey())return;dataError=e.message||'Provider request failed.';
    if(retain){$('dataNotice').classList.add('data-error');$('dataNoticeText').textContent=`Refresh failed: ${dataError} Showing the previously loaded analysis with its original timestamp.`;renderResearchAnswer();}
    else clearAnalysis(`Provider data unavailable: ${dataError} No rating has been generated. Retry, check Risk & Data Settings, or explicitly choose Load Demo.`);
    notify(`Provider data unavailable: ${dataError}`);
  }finally{if(seq===requestSeq)$('refreshData').disabled=false;}
}
function loadDemo(remember=true){requestSeq++;dataError='';activeDataKey='';lastProviderMeta=null;demoMode=true;if(remember)persist('demoMode',true);$('refreshData').disabled=false;candles=generateDemo(symbol.symbol,timeframe);setSource('SIMULATED DEMO');updateAll();}
function fillStrategyForm(config=ratingStrategy){
  const s=normalizeStrategy(config);
  $('strategyPreset').innerHTML=Object.values(STRATEGY_PRESETS).map(p=>`<option value="${p.id}">${htmlEscape(p.name)}</option>`).join('')+'<option value="custom">Custom</option>';
  $('strategyPreset').value=STRATEGY_PRESETS[s.id]?s.id:'custom';
  $('strategyName').value=s.name;$('strategyDescription').textContent=s.description;
  $('strategyRsiLow').value=s.rsiLow;$('strategyRsiHigh').value=s.rsiHigh;$('strategyConstructive').value=s.constructiveAt;$('strategyCaution').value=s.cautionBelow;
  $('strategyWeights').innerHTML=RATING_INDICATORS.map(i=>`<div class="strategy-weight"><label class="indicator-toggle"><input type="checkbox" data-enable="${i.id}" ${s.weights[i.id]>0?'checked':''}><span>${htmlEscape(i.name)}</span></label><label class="weight-label">Weight<input type="number" data-weight="${i.id}" min="1" max="100" step="1" value="${s.weights[i.id]||10}" ${s.weights[i.id]>0?'':'disabled'} required></label></div>`).join('');
  $('strategyWeights').querySelectorAll('[data-enable]').forEach(box=>box.addEventListener('change',()=>{$('strategyWeights').querySelector(`[data-weight="${box.dataset.enable}"]`).disabled=!box.checked;}));
}
function registerStrategy(){
  fillStrategyForm();
  $('indicatorGuide').innerHTML=RATING_INDICATORS.map(i=>`<details class="card guide-card"><summary>${htmlEscape(i.name)}</summary><p>${htmlEscape(i.description)}</p><h4>How it works here</h4><p>${htmlEscape(i.how)}</p><h4>What it cannot tell you</h4><p>${htmlEscape(i.limitation)}</p></details>`).join('')+`<div class="card guide-card"><h3>Strategy presets</h3>${Object.values(STRATEGY_PRESETS).map(p=>`<h4>${htmlEscape(p.name)}</h4><p>${htmlEscape(p.description)}</p>`).join('')}<p>Combining indicators does not guarantee independent evidence: moving averages, MACD and RSI all reuse price history. These presets have not been backtested.</p></div>`;
  $('editStrategy').onclick=()=>{setPage('strategy');fillStrategyForm();};
  $('strategyPreset').onchange=e=>{if(e.target.value!=='custom')fillStrategyForm(STRATEGY_PRESETS[e.target.value]);};
  $('strategyForm').addEventListener('input',e=>{if(e.target.id!=='strategyPreset'){$('strategyPreset').value='custom';$('strategyStatus').textContent='Unsaved changes. Save to update the rating and answers.';}});
  $('strategyForm').onsubmit=e=>{
    e.preventDefault();const weights=Object.fromEntries(RATING_INDICATORS.map(i=>[i.id,$('strategyWeights').querySelector(`[data-enable="${i.id}"]`).checked?Number($('strategyWeights').querySelector(`[data-weight="${i.id}"]`).value):0]));
    const rsiLow=Number($('strategyRsiLow').value),rsiHigh=Number($('strategyRsiHigh').value),constructiveAt=Number($('strategyConstructive').value),cautionBelow=Number($('strategyCaution').value);
    if(!Object.values(weights).some(w=>w>0)||Object.values(weights).some(w=>!Number.isFinite(w)||w<0||w>100)||rsiLow>=rsiHigh||cautionBelow>=constructiveAt){$('strategyStatus').textContent='Enable at least one indicator; use weights up to 100, RSI minimum below maximum, and caution below constructive.';return;}
    const preset=$('strategyPreset').value;ratingStrategy=normalizeStrategy({id:preset,name:$('strategyName').value.trim()||'My strategy',description:STRATEGY_PRESETS[preset]?.description||'Your selected indicators and relative weights.',weights,rsiLow,rsiHigh,constructiveAt,cautionBelow});
    persist('ratingStrategy',ratingStrategy);fillStrategyForm();updateAll();$('strategyStatus').textContent='Saved. Ratings and explanations now use these rules.';notify('Strategy saved and ratings recalculated');
  };
  $('resetStrategy').onclick=()=>{fillStrategyForm(STRATEGY_PRESETS.balanced);$('strategyStatus').textContent='Balanced settings loaded. Save to apply them.';};
  $('explainTopic').onchange=renderResearchAnswer;
  $('exportAiBrief').onclick=()=>{if(!currentAnalysis)return;const a=currentAnalysis,warrant=symbol.type==='Warrant';const evidence={symbol:symbol.symbol,market:symbol.market,timeframe,style,source,lastCandle:sourceAt||null,providerMetadata:lastProviderMeta,refreshError:dataError||null,generatedAt:new Date().toISOString(),strategy:a.strategy,score:warrant?null:a.score,verdict:warrant?'Derivative model pending':a.verdict,factors:warrant?[]:a.factors,coverage:a.coverage,ratingCoverage:a.ratingCoverage,price:a.price,levels:a.levels,plans:warrant?[]:a.plans,riskSettings:settings};download('bursaquant-ai-research-brief.md','# BursaQuant research brief\n\nExplain the evidence below using only the selected strategy. Identify unavailable inputs, conflicting signals and unconfirmed conditions. Do not invent news, fundamentals, current prices or a probability of profit. These are user-selected preferences, not a validated trading system. If the source is simulated, describe an educational example only. Structured warrants are not rated by this model.\n\n```json\n'+JSON.stringify(evidence,null,2)+'\n```\n','text/markdown');};
}
function renderResearchAnswer(){
  if(!currentAnalysis){$('researchAnswer').textContent=dataError?`Provider data unavailable: ${dataError}. Load valid candles to generate an explanation.`:'Load provider candles or explicitly choose demo data to generate an explanation.';return;}const a=currentAnalysis,box=$('researchAnswer');
  const heading=`${symbol.symbol} · ${timeframe.toUpperCase()} · ${source}\nSaved strategy: ${a.strategy.name}. `;
  const freshness=source==='SIMULATED DEMO'?'These are synthetic candles; this is an educational example.':source==='CSV IMPORT'?`Last imported candle: ${sourceAt||'unknown'}. Verify the supplied data source, interval and candle completeness.`:`${candleTimestampLabel()}: ${exchangeTimestamp(sourceAt)}. ${lastProviderMeta?.fetchedAt?'Fetched: '+exchangeTimestamp(lastProviderMeta.fetchedAt)+'. ':''}Delayed data may apply. ${lastProviderMeta?.provider==='yahoo'?'Completion is conservatively inferred and not guaranteed by Yahoo. ':!lastProviderMeta?.completedCandles?'Provider candle completion has not been confirmed. ':''}${dataError?'Refresh failed; this is the previously loaded analysis. ':''}`;
  if(symbol.type==='Warrant'){box.textContent=heading+freshness+'\n\nStructured warrants need a separate derivative model. Equity ratings and entry explanations are unavailable.';return;}
  const topic=$('explainTopic').value;let answer='';
  if(topic==='score')answer=`Rating: ${a.score===null?'unavailable':a.score+'/100'} · ${a.verdict}.\n${a.factors.map(f=>`${f.key}: ${f.score===null?'unavailable':fmt(f.score,1)+'/'+f.weight+' weighted points'}. ${f.reason}`).join('\n')}\nScore = available weighted points divided by available selected weight, multiplied by 100. Coverage: ${a.ratingCoverage.availableWeight}/${a.ratingCoverage.selectedWeight} selected weight. Disabled indicators do not contribute; missing inputs are excluded.`;
  if(topic==='conditions')answer=`Your ${a.strategy.name} rating is a checklist, not confirmation of an entry.\nPullback: watch for a revisit and reversal near support at ${money(a.levels.support)}.\nBreakout: require a close above resistance at ${money(a.levels.resistance)}, then check follow-through and reliable volume.\nA break below support weakens the long thesis. Both entry scenarios remain alternatives regardless of the selected rating preset. ${a.trend} is the observed moving-average trend.`;
  if(topic==='risk'){const p=a.plans[0],pos=sizePosition(p,settings,symbol.currency,symbol.market==='MY'&&symbol.type==='Stock'?100:1);answer=`Reference capital: RM${fmt(settings.capital)}. Risk limit: ${fmt(settings.riskPct)}% per trade; allocation cap: ${fmt(settings.allocationPct)}%.\nFor the illustrative Buy Lower entry ${money(p.entry)} and stop ${money(p.stop)}, the model allows up to ${fmt(pos.qty,0)} units. Estimated loss including configured costs: ${money(pos.estimatedLoss)}.\nQuantity is capped by both risk and allocation. ${pos.message} The rating weights do not change your capital or risk limits.`;}
  if(topic==='limitations')answer=`Fundamentals, news/sentiment, sector and index context are not connected. No AI model or broker is connected. ${a.factors.filter(f=>f.score===null).map(f=>f.key+' is unavailable.').join(' ')}\nFixed periods: SMA20/50/200, RSI14, MACD12/26/9, ATR14, Bollinger20/2 and preceding-20-candle volume. An unfinished candle can change the readings. Selected weights and thresholds are preferences, not backtested performance estimates.`;
  box.textContent=heading+freshness+'\n\n'+answer;
}
function updateAll(){if(!candles.length){renderResearchAnswer();return;}try{currentAnalysis=analyse(candles,style,ratingStrategy);}catch(e){clearAnalysis(e.message);notify(e.message);return;}hoverIndex=null;zoom=Math.min(85,candles.length);$('saveAnalysis').disabled=false;$('exportAiBrief').disabled=false;renderAnalysis();renderResearchAnswer();requestAnimationFrame(drawChart);}
function renderAnalysis(){if(!currentAnalysis)return;const a=currentAnalysis,prev=a.previous,change=(a.price-prev)/prev*100;const isWarrant=symbol.type==='Warrant';$('symbolTitle').textContent=symbol.symbol;$('companyName').textContent=lastProviderMeta?.name||symbol.name;$('exchangeTag').textContent=`${lastProviderMeta?.exchange||symbol.exchange} · ${symbol.type.toUpperCase()}`;$('currentPrice').textContent=money(a.price);$('priceChange').textContent=(change>=0?'+':'')+fmt(change)+'% per candle';$('priceChange').className='chg '+(change>=0?'up':'down');$('indicatorTF').textContent=timeframe.toUpperCase();$('chartTimezone').textContent='Chart timezone: '+exchangeTimezone();$('chartLength').textContent=`${candles.length} candles loaded · ${timeframe.toUpperCase()} data`;
  const metrics=[['Price trend',a.trend,'SMA20 / SMA50'],['RSI (14)',fmt(a.rsi,1),a.rsi>70?'Overbought zone':a.rsi<30?'Oversold zone':'Momentum reading'],['Relative Volume',a.rvol?fmt(a.rvol,2)+'×':'N/A',a.rvol?'vs previous 20 bars':'Volume missing'],['ATR (14)',money(a.atr),fmt(a.atr/a.price*100,2)+'% of price'],['Setup Score',isWarrant||a.score===null?'N/A':a.score+'/100',isWarrant?'Separate warrant model needed':a.verdict]];
  $('metricCards').innerHTML=metrics.map(x=>`<div class="metric"><div class="label">${htmlEscape(x[0])}</div><div class="value ${x[0]==='Price trend'?(a.trend==='Bullish'?'up':a.trend==='Bearish'?'down':''):''}">${htmlEscape(x[1])}</div><div class="detail">${htmlEscape(x[2])}</div></div>`).join('');
  $('planCards').innerHTML=isWarrant?'<div class="card" style="grid-column:1/-1">This symbol is a structured warrant. Equity-style Buy Lower/Breakout scores are disabled. A separate warrant model requires underlying security, expiry, conversion ratio, exercise price and market liquidity.</div>':a.plans.map((p,i)=>{const pos=sizePosition(p,settings,symbol.currency,symbol.market==='MY'&&symbol.type==='Stock'?100:1);const rr1=pos.rr1===null?'—':fmt(pos.rr1,2)+'×';const rr2=pos.rr2===null?'—':fmt(pos.rr2,2)+'×';const caution=source==='SIMULATED DEMO'?'SIMULATED prices — not actionable.':source==='CSV IMPORT'?'Review CSV recency before considering this scenario.':'Provider freshness not guaranteed; confirm live quotes.';
   return `<div class="plan-card ${i===0?'featured':''}"><div class="plan-top"><div class="plan-type">${htmlEscape(p.tag)}</div><span class="pill ${i===0?'good':''}">${i===0?'Support entry':'Confirmation entry'}</span></div><h4>${htmlEscape(p.label)}</h4><p>${htmlEscape(p.description)}</p><div class="plan-details"><div><span>Illustrative entry</span><strong>${money(p.entry)}</strong></div><div><span>Entry zone</span><strong>${money(p.zoneLow)}–${money(p.zoneHigh)}</strong></div><div><span>Invalidation / stop</span><strong class="down">${money(p.stop)}</strong></div><div><span>First target (TP1)</span><strong class="up">${money(p.tp1)}</strong></div><div><span>Second target (TP2)</span><strong class="up">${money(p.tp2)}</strong></div>${p.deepWatch?`<div><span>Deeper watch level (not an order)</span><strong>${money(p.deepWatch)}</strong></div>`:''}<div><span>Third target (TP3)</span><strong class="up">${money(p.tp3)}</strong></div><div><span>Gross capital used</span><strong>${money(pos.cost)}</strong></div><div><span>Maximum modelled loss</span><strong>${money(pos.estimatedLoss)}</strong></div><div><span>Suggested maximum units</span><strong>${fmt(pos.qty,0)}</strong></div><div><span>Net TP1 / TP2 RR</span><strong>${rr1} / ${rr2}</strong></div></div><div class="plan-footer"><strong>Confirmation:</strong> ${htmlEscape(p.conditions)}<br><strong>Data caution:</strong> ${htmlEscape(caution)}<br><strong>Execution:</strong> ${htmlEscape(pos.message)}</div></div>`;
   }).join('')+`<div class="plan-card"><div class="plan-top"><div class="plan-type">NO POSITION</div><span class="pill risk">Always an option</span></div><h4>Hold / Wait / Avoid</h4><p>Stand aside when the confirmation conditions are missing, liquidity is poor, or the setup exceeds your risk limit.</p><div class="plan-details"><div><span>Current trend</span><strong>${a.trend}</strong></div><div><span>Rules-based rating</span><strong>${a.score??'N/A'}/100</strong></div><div><span>Support</span><strong>${money(a.levels.support)}</strong></div><div><span>Resistance</span><strong>${money(a.levels.resistance)}</strong></div></div><div class="plan-footer"><strong>Important:</strong> Breakout and pullback are alternatives, not simultaneous orders. Neither model guarantees fills, stop execution, or profits.</div></div>`;
  $('scoreNumber').textContent=isWarrant||a.score===null?'—':a.score;$('scoreRing').style.background=isWarrant||a.score===null?'#273447':`conic-gradient(${a.score>=a.strategy.constructiveAt?'#33ce9a':a.score>=a.strategy.cautionBelow?'#e6b35b':'#e97085'} 0deg ${a.score*3.6}deg,#273447 ${a.score*3.6}deg 360deg)`;$('scoreLabel').textContent=isWarrant?'Derivative model pending':a.verdict;$('scoreExplanation').textContent=isWarrant?'A structured warrant cannot be evaluated with ordinary equity indicator scoring alone.':`${a.strategy.name}. ${a.trend} observed trend. Selected indicator rules determine this score; it is not a probability of future returns.`;
  $('scoreFactors').innerHTML=isWarrant?'':a.factors.map(f=>`<div class="factor-row"><div class="factor-name" title="${htmlEscape(f.reason)}">${htmlEscape(f.key)}</div><div class="factor-track"><div class="factor-fill" style="width:${f.contribution??0}%"></div></div><div class="factor-value">${f.score===null?'N/A':fmt(f.score,1)+'/'+f.weight}</div></div>`).join('');$('coverageNotice').textContent=`Available selected weight: ${a.ratingCoverage.availableWeight}/${a.ratingCoverage.selectedWeight}. Disabled indicators do not contribute. Missing inputs are excluded. Fundamentals, sector indices and external news are not included.`;$('activeStrategyLabel').textContent=`Rating strategy: ${a.strategy.name} · ${a.factors.length} enabled indicators`;
  const indicators=[['SMA 20',a.sma20.at(-1)?money(a.sma20.at(-1)):'Insufficient history'],['SMA 50',a.sma50.at(-1)?money(a.sma50.at(-1)):'Insufficient history'],['SMA 200',a.sma200.at(-1)?money(a.sma200.at(-1)):'Need 200 candles'],['RSI 14',fmt(a.rsi,1)],['MACD histogram',fmt(a.macd,4)],['Bollinger Upper',money(a.bb?.upper)],['Bollinger Lower',money(a.bb?.lower)],['RVOL',a.rvol?fmt(a.rvol,2)+'×':'Unavailable']];$('indicatorTable').innerHTML=indicators.map(x=>`<div class="indicator-row"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  const levels=[['Nearby support',money(a.levels.support)],['Nearby resistance',money(a.levels.resistance)],['Fibonacci 38.2%',money(a.levels.fib382)],['Fibonacci 61.8%',money(a.levels.fib618)]];$('levelTable').innerHTML=levels.map(x=>`<div class="indicator-row"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  $('scenarioDetails').innerHTML=[['Bullish scenario',`A close above ${money(a.levels.resistance)} with convincing follow-through and reliable volume would support a breakout hypothesis.`],['Neutral scenario',`Price remains between ${money(a.levels.support)} and ${money(a.levels.resistance)}. Waiting for clearer confirmation can be preferable.`],['Bearish scenario',`A confirmed break below ${money(a.levels.support)} would weaken the bullish thesis; modelled stop execution is not guaranteed.`]].map(x=>`<div class="scenario"><strong>${x[0]}</strong><p>${x[1]}</p></div>`).join('');$('technicalMood').textContent=a.trend;
  $('watchBtn').textContent=watchlist.includes(symbol.symbol)?'★ In watchlist':'☆ Watchlist';$('watchCount').textContent=watchlist.length;
}
function drawChart(){const cvs=$('priceCanvas');if(!cvs||!currentAnalysis||!cvs.clientWidth)return;const wrap=cvs.parentElement,w=wrap.clientWidth,h=wrap.clientHeight,dpr=Math.max(1,window.devicePixelRatio||1);cvs.width=Math.floor(w*dpr);cvs.height=Math.floor(h*dpr);const ctx=cvs.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);ctx.fillStyle='#111a2b';ctx.fillRect(0,0,w,h);
  const data=currentAnalysis.candles,n=Math.min(data.length,Math.max(25,zoom)),start=data.length-n,subset=data.slice(start),padLeft=18,padTop=15,padRight=70,padBottom=27,ww=w-padLeft-padRight,hh=h-padTop-padBottom;
  const values=subset.flatMap(c=>[c.high,c.low]).concat([currentAnalysis.levels.support,currentAnalysis.levels.resistance]);let min=Math.min(...values),max=Math.max(...values);const buff=(max-min)*.11||max*.03;min-=buff;max+=buff;
  const py=y=>padTop+(max-y)/(max-min)*hh;const px=i=>padLeft+(i+.5)*ww/n;ctx.font='10px DM Sans, sans-serif';ctx.textBaseline='middle';
  for(let i=0;i<=5;i++){const price=min+(max-min)*i/5,y=py(price);ctx.strokeStyle='#26334b';ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(padLeft,y);ctx.lineTo(w-padRight+2,y);ctx.stroke();ctx.fillStyle='#7c8ba3';ctx.fillText(fmt(price,price<1?3:2),w-padRight+10,y+1);}
  for(let i=0;i<7;i++){const k=Math.floor((n-1)*i/6),x=px(k);ctx.strokeStyle='#222f42';ctx.beginPath();ctx.moveTo(x,padTop);ctx.lineTo(x,h-padBottom);ctx.stroke();const p=exchangeTimeParts(subset[k].time);ctx.fillStyle='#73849e';const label=['1month','3month'].includes(timeframe)?`${p.year}-${p.month}`:['1day','1week'].includes(timeframe)?`${p.month}-${p.day}`:`${p.month}-${p.day} ${p.hour}:${p.minute}`;ctx.fillText(label,Math.max(4,Math.min(w-90,x-23)),h-12);}
  const horizontal=(value,color,name,dash=true)=>{if(!Number.isFinite(value))return;const y=py(value);ctx.strokeStyle=color;ctx.globalAlpha=.72;ctx.lineWidth=1;ctx.setLineDash(dash?[5,4]:[]);ctx.beginPath();ctx.moveTo(padLeft,y);ctx.lineTo(w-padRight,y);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.font='10px DM Sans, sans-serif';ctx.fillText(name,w-padRight-94,y-9);};
  horizontal(currentAnalysis.levels.support,'#38ce9c','SUPPORT');horizontal(currentAnalysis.levels.resistance,'#ed7587','RESIST');if(symbol.type!=='Warrant')horizontal(currentAnalysis.plans[0].entry,'#b797fb','BUY LOWER');
  const line=(series,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1.55;ctx.beginPath();let began=false;for(let i=0;i<n;i++){const v=series[start+i];if(v===null||v===undefined){began=false;continue}if(!began){ctx.moveTo(px(i),py(v));began=true}else ctx.lineTo(px(i),py(v));}ctx.stroke()};line(currentAnalysis.sma20,'#efcc83');line(currentAnalysis.sma50,'#7b90ff');
  const cw=Math.min(12,Math.max(2,ww/n*.66));subset.forEach((v,i)=>{const x=px(i),rise=v.close>=v.open,col=rise?'#33c89d':'#e56e83';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,py(v.high));ctx.lineTo(x,py(v.low));ctx.stroke();const y=Math.min(py(v.open),py(v.close)),height=Math.max(1,Math.abs(py(v.open)-py(v.close)));ctx.fillRect(x-cw/2,y,cw,height)});
  if(Number.isInteger(hoverIndex)&&hoverIndex>=start&&hoverIndex<data.length){const i=hoverIndex-start,x=px(i);ctx.strokeStyle='#9aa8c27a';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,padTop);ctx.lineTo(x,h-padBottom);ctx.stroke();ctx.setLineDash([])};
  cvs.__chartMeta={start,n,padLeft,padRight,ww};
}
function renderWatch(){const items=$('watchItems');items.innerHTML=watchlist.length?watchlist.map(s=>{const n=instruments.find(x=>x.symbol===s);return `<div class="watch-item"><div><strong>${htmlEscape(s)}</strong><div class="sub">${htmlEscape(n?.name||'Custom ticker')}</div></div><div class="row-buttons"><button class="btn sm secondary" data-open="${htmlEscape(s)}">Analyse →</button><button class="btn sm ghost" data-remove="${htmlEscape(s)}">Remove</button></div></div>`}).join(''):'<div class="empty">No watchlist symbols. Select a ticker in Stock Analysis and click Watchlist.</div>';
  items.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{setPage('analysis');chooseSymbol(b.dataset.open)}));items.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{watchlist=watchlist.filter(s=>s!==b.dataset.remove);persist('watchlist',watchlist);renderWatch();$('watchCount').textContent=watchlist.length}));
  $('savedItems').innerHTML=snapshots.length?snapshots.map((s,i)=>`<div class="watch-item"><div><strong>${htmlEscape(s.symbol)} · ${htmlEscape(s.timeframe)}</strong><div class="sub">${htmlEscape(s.date)} • ${htmlEscape(s.source)} • ${s.score??'N/A'}/100 • ${htmlEscape(s.verdict)}</div></div><button class="btn sm ghost" data-deletesnap="${i}">Remove</button></div>`).join(''):'<div class="empty">No saved analyses yet. Save a snapshot from the Stock Analysis view.</div>';
  $('savedItems').querySelectorAll('[data-deletesnap]').forEach(b=>b.addEventListener('click',()=>{snapshots.splice(Number(b.dataset.deletesnap),1);persist('snapshots',snapshots);renderWatch()}));}
function screenControls(){return {
  market:$('screenMarket').value,universe:$('screenUniverse').value,symbols:$('screenSymbols').value,
  minAverageVolume:Number($('screenVolume').value),turnoverMY:Number($('screenTurnoverMY').value),turnoverUS:Number($('screenTurnoverUS').value),maxRangePct:Number($('screenRange').value),cmfThreshold:Number($('screenCmf').value)
};}
function screenSignature(){const c=screenControls();return JSON.stringify({...c,provider:dataProvider,gateway:gatewayBase,directory:c.universe==='directory'?screenDirectory?.meta?.fetchedAt||'':null});}
function screenDate(value,market){if(!value)return '—';try{return new Date(value).toLocaleDateString('en-GB',{timeZone:market==='MY'?'Asia/Kuala_Lumpur':'America/New_York',day:'2-digit',month:'short',year:'numeric'});}catch{return 'Unknown';}}
function renderScreener(){
  const run=screenRun,counts=screenCoverage(run),active=!!run?.running,market=$('screenMarket').value,filter=$('screenSetup').value,min=Number($('screenMin').value)||0;
  const same=!!run&&run.context?.signature===screenSignature();
  $('screenSymbols').disabled=active||$('screenUniverse').value==='directory';
  for(const id of ['screenMarket','screenUniverse','screenVolume','screenTurnoverMY','screenTurnoverUS','screenRange','screenCmf','screenListFile','screenUseWatchlist'])$(id).disabled=active;
  $('loadScreenDirectory').disabled=active||screenLoading||market==='all';$('runScreen').disabled=active||screenLoading;
  $('continueScreen').disabled=active||!same||counts.remaining===0;$('stopScreen').disabled=!active;$('exportScreen').disabled=!counts.checked;
  $('screenStats').innerHTML=[['Universe',counts.total,'Selected instruments'],['Checked',counts.checked,counts.remaining+' remaining'],['Analysed',counts.analysed,counts.candidates+' candidate findings'],['Unavailable',counts.failed+counts.insufficient+counts.stale,counts.failed+' failed · '+counts.insufficient+' insufficient · '+counts.stale+' stale']].map(([label,value,note])=>`<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="detail">${note}</div></div>`).join('');
  $('screenProgress').textContent=!run?'No scan started. Requests run sequentially in small batches and pause at provider rate limits.':active?`Checking ${Math.min(run.cursor+1,counts.total)} of ${counts.total}. Completed: ${counts.checked}. You can pause after the current request.`:`${counts.checked} of ${counts.total} checked. ${run.pausedReason||'Selected universe finished.'}${same?'':' Universe, checklist or gateway settings changed; start a new scan to apply them.'} ${run.updatedAt?'Last checked: '+new Date(run.updatedAt).toLocaleString()+'.':''}`;
  const rows=(run?.results||[]).filter(row=>{
    if(market!=='all'&&row.instrument?.market!==market)return false;
    const unavailable=!!row.error||row.stale||row.evaluation?.classification==='insufficient';
    if(filter==='unavailable')return unavailable;
    if(filter!=='all'&&row.evaluation?.classification!==filter)return false;
    return row.evaluation?.score===null||row.evaluation?.score===undefined?min===0:row.evaluation.score>=min;
  }).slice().sort((a,b)=>(b.evaluation?.score??-1)-(a.evaluation?.score??-1));
  $('screenResults').innerHTML=rows.length?rows.slice(0,screenVisible).map(row=>{
    const x=row.instrument||{},e=row.evaluation,m=e?.metrics||{},status=row.error?'Request failed':row.stale?'Stale or invalid date':e?.status||'Unavailable';
    const reason=row.error||(row.stale?'Latest supplied daily candle is future-dated or older than seven calendar days.':e?.reasons?.join(' ')||'All mandatory conditions for this finding were met.');
    const evidence=(e?.conditions||[]).map(c=>`<li><strong>${c.met===null?'Unknown':c.met?'Met':'Unmet'} · ${htmlEscape(c.label)}</strong>: ${htmlEscape(c.rule)}. ${htmlEscape(c.reason)}</li>`).join('');
    return `<tr><td><strong>${htmlEscape(x.symbol)}</strong><div class="muted small">${htmlEscape(row.meta?.name||x.name)} · ${htmlEscape(row.meta?.provider||'No data')}</div></td><td>${htmlEscape(x.market)}</td><td class="right">${Number.isFinite(m.price)?money(m.price,x.currency):'—'}</td><td class="right">${e?.score??'—'}${e?.score===null||e?.score===undefined?'':'/100'}</td><td><span class="pill ${e?.eligible?'actual':e?.classification==='distribution'?'risk':''}">${htmlEscape(status)}</span><details class="screen-evidence"><summary>View checks</summary><p>${htmlEscape(reason)}</p><ul>${evidence}</ul><p>Approx. daily turnover: ${Number.isFinite(m.averageTurnover)?money(m.averageTurnover,x.currency):'—'}; 20-day range: ${nfmt(m.rangePct)}%; signed-volume pressure: ${nfmt(m.obvPressure)}.</p><p class="muted small">Fetched: ${htmlEscape(row.fetchedAt||row.checkedAt||'Unknown')}. Candle completion is inferred. ${(e?.warnings||[]).map(htmlEscape).join(' ')}</p></details></td><td class="right">${nfmt(m.cmf20)}</td><td class="right">${Number.isFinite(m.rvol)?fmt(m.rvol,2)+'×':'—'}</td><td title="${htmlEscape(row.lastCandle||'')}">${htmlEscape(screenDate(row.lastCandle,x.market))}</td><td><button class="btn sm secondary" data-screenticker="${htmlEscape(x.symbol)}" data-screenmarket="${htmlEscape(x.market)}">Analyse</button></td></tr>`;
  }).join(''):'<tr><td colspan="9" class="empty">'+(counts.checked?'No checked instruments match these result filters.':'Choose a universe, then start a real-data scan. No simulated results are included.')+'</td></tr>';
  $('screenResultCount').textContent=`Showing ${Math.min(rows.length,screenVisible)} of ${rows.length} matching results. ${counts.checked} checked out of ${counts.total} selected instruments. Saved results retain their original dates; they are not automatically refreshed.`;
  $('screenMore').classList.toggle('hidden',rows.length<=screenVisible);
  $('screenResults').querySelectorAll('[data-screenticker]').forEach(b=>b.addEventListener('click',()=>{timeframe='1day';document.querySelectorAll('[data-tf]').forEach(t=>t.classList.toggle('selected',t.dataset.tf===timeframe));demoMode=false;persist('demoMode',false);setPage('analysis');chooseSymbol(b.dataset.screenticker,b.dataset.screenmarket);}));
}
async function loadScreenDirectory(){
  const market=$('screenMarket').value;if(market==='all')return notify('Choose Bursa Malaysia or US before loading its directory.');
  if(!gatewayBase)return notify('Connect your data gateway in Risk & Data Settings first.');
  const seq=++screenDirectorySeq,base=gatewayBase;screenLoading=true;renderScreener();$('screenDirectoryStatus').textContent='Loading instrument identifiers only; no price scan has started.';
  try {
    const data=await gatewayFetch('/universe?market='+encodeURIComponent(market));
    if(seq!==screenDirectorySeq||market!==$('screenMarket').value||base!==gatewayBase)return;
    const items=(data.instruments||[]).map(x=>screenInstrument(x)).filter(x=>x&&x.market===market);
    if(!items.length)throw new Error('The directory returned no eligible stocks or ETFs.');
    screenDirectory={instruments:items,meta:{...data.meta,market}};persist('screenDirectory',screenDirectory);$('screenUniverse').value='directory';
    $('screenDirectoryStatus').textContent=`${items.length.toLocaleString()} eligible instruments loaded. ${data.meta?.coverage||'Coverage is provider-dependent.'} Source date: ${data.meta?.asOf||'not supplied'}. Retrieved: ${data.meta?.fetchedAt||'unknown'}. No candles have been scanned yet.`;
  }catch(error){if(seq===screenDirectorySeq)$('screenDirectoryStatus').textContent='Directory unavailable: '+error.message+' You can use a pasted or imported ticker list. A v0.4 gateway needs the screener update before it can load directories.';}
  finally{if(seq===screenDirectorySeq){screenLoading=false;renderScreener();}}
}
async function runScreenBatch(fresh=false){
  if(screenRun?.running)return;
  if(!gatewayBase)return notify('Connect your gateway in Risk & Data Settings before scanning real data.');
  const c=screenControls(),batch=Number($('screenBatch').value);
  if(!Number.isInteger(batch)||batch<1||batch>25||![c.minAverageVolume,c.turnoverMY,c.turnoverUS,c.maxRangePct,c.cmfThreshold].every(Number.isFinite)||c.minAverageVolume<0||c.turnoverMY<0||c.turnoverUS<0||c.maxRangePct<0.1||c.maxRangePct>100||c.cmfThreshold<0.001||c.cmfThreshold>1)return notify('Review the checklist values and choose a batch of 1–25 stocks.');
  if(fresh){
    let pool;
    if(c.universe==='directory'){
      if(!screenDirectory||screenDirectory.meta?.market!==c.market)return notify('Load the selected market directory first, or choose My ticker list.');
      pool=screenDirectory.instruments;
    }else{const parsed=parseScreenSymbols(c.symbols,c.market);pool=parsed.instruments;if(parsed.rejected.length)notify(`${parsed.rejected.length} invalid or unsupported ticker entries excluded. Warrants are not screened.`);}
    pool=pool.filter(x=>c.market==='all'||x.market===c.market);
    if(!pool.length)return notify('Enter eligible stock tickers, use your watchlist or load a market directory.');
    screenRun=createScreenRun(pool,{controls:c,signature:screenSignature(),provider:dataProvider,gateway:gatewayBase,directoryMeta:c.universe==='directory'?screenDirectory.meta:null,ruleVersion:'accumulation-v1',settings:{...DEFAULT_SCREEN_SETTINGS,...c}});screenVisible=100;
  }else if(!screenRun||screenRun.context.signature!==screenSignature())return notify('Settings changed. Start a new scan to apply them.');
  screenStop=false;persist('screenControls',c);const snapshot=screenRun,provider=dataProvider,base=gatewayBase;
  await scanDailyBatch(snapshot,{
    batchSize:batch,shouldStop:()=>screenStop||gatewayBase!==base||dataProvider!==provider,
    request:item=>gatewayFetch(`/market?market=${encodeURIComponent(item.market)}&symbol=${encodeURIComponent(item.symbol)}&interval=1day&provider=${encodeURIComponent(provider)}&limit=250`),
    evaluate:(bars,item)=>{const result=evaluateAccumulation(bars,{minAverageVolume:c.minAverageVolume,minAverageTurnover:item.market==='MY'?c.turnoverMY:c.turnoverUS,maxRangePct:c.maxRangePct,cmfThreshold:c.cmfThreshold});if(c.universe==='custom')result.warnings.push('Custom ticker security types are not independently verified. Confirm that the symbol is an ordinary stock or ETF.');return result;},
    onUpdate:()=>renderScreener()
  });
  if(!persist('screenRun',snapshot))$('screenProgress').textContent+=' Browser storage is unavailable or full. Export these results before leaving this page.';
}
function registerScreener(){
  const saved=screenRun?.context?.controls||load('screenControls',null);
  if(saved){for(const [key,id] of Object.entries({market:'screenMarket',universe:'screenUniverse',symbols:'screenSymbols',minAverageVolume:'screenVolume',turnoverMY:'screenTurnoverMY',turnoverUS:'screenTurnoverUS',maxRangePct:'screenRange',cmfThreshold:'screenCmf'}))if(saved[key]!==undefined)$(id).value=saved[key];}
  if(screenDirectory)$('screenDirectoryStatus').textContent=`Saved directory: ${screenDirectory.instruments.length.toLocaleString()} instruments (${screenDirectory.meta?.market}). ${screenDirectory.meta?.coverage||''} Retrieved: ${screenDirectory.meta?.fetchedAt||'unknown'}.`;
  $('runScreen').onclick=()=>runScreenBatch(true);$('continueScreen').onclick=()=>runScreenBatch(false);
  $('stopScreen').onclick=()=>{screenStop=true;$('screenProgress').textContent='Pausing after the current request. Completed results will be kept.';};
  $('loadScreenDirectory').onclick=loadScreenDirectory;
  $('screenUseWatchlist').onclick=()=>{const pool=watchlist.map(x=>screenInstrument(x)).filter(Boolean).filter(x=>$('screenMarket').value==='all'||x.market===$('screenMarket').value);$('screenSymbols').value=pool.map(x=>x.market+':'+x.symbol).join('\n');$('screenUniverse').value='custom';$('screenDirectoryStatus').textContent=`${pool.length} eligible watchlist symbols selected. This is your list, not an exchange-wide universe.`;renderScreener();};
  $('screenListFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>200000)throw new Error('Choose a ticker file smaller than 200 KB.');const data=parseScreenListFile(await file.text(),$('screenMarket').value);$('screenSymbols').value=data.instruments.map(x=>x.market+':'+x.symbol).join('\n');$('screenUniverse').value='custom';$('screenDirectoryStatus').textContent=`Imported ${data.instruments.length} eligible symbols; ${data.rejected.length} unsupported entries excluded. An imported list does not establish full-market coverage.`;renderScreener();}catch(error){notify('Ticker import failed: '+error.message);}event.target.value='';});
  $('exportScreen').onclick=()=>{if(!screenRun)return;const {signature,gateway,...context}=screenRun.context;download('bursaquant-real-screen.json',JSON.stringify({version:1,context,queue:screenRun.queue,results:screenRun.results,cursor:screenRun.cursor,coverage:screenCoverage(screenRun),startedAt:screenRun.startedAt,updatedAt:screenRun.updatedAt,exportedAt:new Date().toISOString()},null,2),'application/json');};
  for(const id of ['screenMarket','screenUniverse','screenMin','screenSetup','screenVolume','screenTurnoverMY','screenTurnoverUS','screenRange','screenCmf'])$(id).addEventListener('change',()=>{if(id==='screenMarket'){screenDirectorySeq++;screenLoading=false;}renderScreener();});
  $('screenSymbols').addEventListener('input',renderScreener);$('screenMore').onclick=()=>{screenVisible+=100;renderScreener();};renderScreener();
}
function renderJournal(){const profits=trades.map(t=>(t.exit-t.entry)*t.quantity-t.fees),net=profits.reduce((a,b)=>a+b,0),wins=profits.filter(v=>v>0).length,ratio=trades.length?wins/trades.length*100:0;const metrics=[['Closed trades',trades.length,'All recorded'],['Winning trades',wins,'Profit after fees'],['Win rate',fmt(ratio,1)+'%','Historical, not predictive'],['Net P/L',fmt(net,2),'Mixed currencies: see note']];$('journalStats').innerHTML=metrics.map(([name,value,note])=>`<div class="metric"><div class="label">${name}</div><div class="value">${value}</div><div class="detail">${note}</div></div>`).join('');if(trades.some(t=>t.currency==='USD')&&trades.some(t=>t.currency==='MYR'))$('journalStats').lastElementChild.querySelector('.value').textContent='Mixed FX';
 $('tradeRows').innerHTML=trades.length?trades.map((t,i)=>{const pl=(t.exit-t.entry)*t.quantity-t.fees;return `<tr><td>${htmlEscape(t.date)}</td><td><strong>${htmlEscape(t.symbol)}</strong></td><td>${fmt(t.quantity,0)}</td><td>${money(t.entry,t.currency)}</td><td>${money(t.exit,t.currency)}</td><td class="${pl>=0?'up':'down'}">${money(pl,t.currency)}</td><td title="${htmlEscape(t.notes)}">${htmlEscape(t.notes.slice(0,45))}</td><td><button class="btn sm ghost" data-deltrade="${i}">×</button></td></tr>`}).join(''):'<tr><td colspan="8" class="empty">No journal trades yet.</td></tr>';$('tradeRows').querySelectorAll('[data-deltrade]').forEach(b=>b.addEventListener('click',()=>{trades.splice(Number(b.dataset.deltrade),1);persist('trades',trades);renderJournal()}));}
function fillSettings(){const map={setCapital:'capital',setRisk:'riskPct',setAllocation:'allocationPct',setFee:'feePct',setMinFee:'minFee',setFeeUS:'feePctUS',setMinFeeUS:'minFeeUS',setSlippage:'slippagePct',setFx:'usdMyr'};Object.entries(map).forEach(([id,key])=>$(id).value=settings[key]);$('gatewayUrl').value=gatewayBase;$('dataProvider').value=dataProvider;$('gatewayAccessCode').value=gatewayAccessCode;}
function download(filename,text,type='text/plain'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportJournal(){const clean=x=>'"'+String(x??'').replace(/"/g,'""')+'"';const cols=['date','symbol','currency','entry','exit','quantity','fees','notes'];download('bursaquant-journal.csv',[cols.join(','),...trades.map(t=>cols.map(k=>clean(t[k])).join(','))].join('\n'),'text/csv')}
function register(){document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>setPage(n.dataset.page)));$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');$('loadTicker').onclick=()=>chooseSymbol($('tickerInput').value);$('tickerInput').addEventListener('input',renderDropdown);$('tickerInput').addEventListener('keydown',e=>{if(e.key==='Enter')chooseSymbol(e.target.value);if(e.key==='Escape')$('searchResults').classList.add('hidden')});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrapper'))$('searchResults').classList.add('hidden')});document.querySelectorAll('[data-tf]').forEach(btn=>btn.addEventListener('click',()=>{if(source==='CSV IMPORT'){notify('Imported CSV candle interval is fixed; re-import a different timeframe to change it.');return}timeframe=btn.dataset.tf;document.querySelectorAll('[data-tf]').forEach(x=>x.classList.toggle('selected',x.dataset.tf===timeframe));fetchOrDemo()}));$('modeSelect').addEventListener('change',e=>{style=e.target.value;updateAll()});$('watchBtn').onclick=()=>{if(watchlist.includes(symbol.symbol)){watchlist=watchlist.filter(s=>s!==symbol.symbol);notify('Removed from watchlist')}else{watchlist.unshift(symbol.symbol);notify('Added to watchlist')}persist('watchlist',watchlist);renderAnalysis();renderResearchAnswer()};$('saveAnalysis').onclick=()=>{if(!currentAnalysis)return notify('Load valid candles before saving an analysis.');const a=currentAnalysis;snapshots.unshift({date:new Date().toISOString().slice(0,16).replace('T',' '),symbol:symbol.symbol,timeframe,style,source,lastCandle:sourceAt||null,providerMetadata:lastProviderMeta,strategy:normalizeStrategy(ratingStrategy),score:symbol.type==='Warrant'?null:a.score,verdict:symbol.type==='Warrant'?'Derivative model pending':a.verdict,price:a.price,support:a.levels.support,resistance:a.levels.resistance,plans:symbol.type==='Warrant'?[]:a.plans.map(p=>({entry:p.entry,stop:p.stop,tp1:p.tp1,tp2:p.tp2}))});snapshots=snapshots.slice(0,100);persist('snapshots',snapshots);notify('Research snapshot saved locally')};
 $('csvInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;const seq=++requestSeq,selected=selectionKey();try{const text=await f.text();if(seq!==requestSeq||selected!==selectionKey())return;const rows=parseCSV(text);candles=rows;activeDataKey='';lastProviderMeta=null;dataError='';$('refreshData').disabled=false;timeframe=$('csvTimeframe').value;document.querySelectorAll('[data-tf]').forEach(b=>b.classList.toggle('selected',b.dataset.tf===timeframe));setSource('CSV IMPORT',new Date(rows.at(-1).time*1000).toISOString());updateAll();notify(`Imported ${rows.length} valid candles. CSV replaces current chart only.`)}catch(err){$('refreshData').disabled=false;notify('CSV import failed: '+err.message)}e.target.value=''});
 $('exportSaved').onclick=()=>download('bursaquant-backup.json',JSON.stringify({watchlist,snapshots,settings,trades,ratingStrategy,exportedAt:new Date().toISOString()},null,2),'application/json');$('exportJournal').onclick=exportJournal;
 $('journalForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const t={date:new Date().toISOString().slice(0,10),symbol:String(f.get('symbol')).trim().toUpperCase().slice(0,24),currency:String(f.get('currency')),entry:Number(f.get('entry')),exit:Number(f.get('exit')),quantity:Math.trunc(Number(f.get('quantity'))),fees:Number(f.get('fees'))||0,notes:String(f.get('notes')||'').trim().slice(0,250)};if(!t.symbol||!(t.entry>0)||t.exit<0||t.quantity<1||t.fees<0)return notify('Review trade values.');trades.unshift(t);persist('trades',trades);e.target.reset();renderJournal();notify('Closed trade saved locally')});
 $('settingsForm').addEventListener('submit',e=>{e.preventDefault();const read=id=>Number($(id).value);const obj={capital:read('setCapital'),riskPct:read('setRisk'),allocationPct:read('setAllocation'),feePct:read('setFee'),minFee:read('setMinFee'),feePctUS:read('setFeeUS'),minFeeUS:read('setMinFeeUS'),slippagePct:read('setSlippage'),usdMyr:read('setFx')};if(Object.values(obj).some(v=>!Number.isFinite(v))||obj.capital<=0||obj.riskPct<=0||obj.riskPct>10||obj.allocationPct<=0||obj.allocationPct>100||obj.usdMyr<=0||obj.feePct<0||obj.minFee<0||obj.feePctUS<0||obj.minFeeUS<0||obj.slippagePct<0)return notify('Invalid risk settings. Check positive capital, risk ≤ 10%, and allocation ≤ 100%.');settings=obj;persist('settings',settings);renderAnalysis();renderResearchAnswer();notify('Risk limits saved and trade scenarios recalculated')});
 $('apiForm').addEventListener('submit',async e=>{
  e.preventDefault();const input=$('gatewayUrl').value.trim().replace(/\/$/,'');
  if(input&&input!=='/api'){try{const u=new URL(input);if(!['http:','https:'].includes(u.protocol))throw Error();}catch{return notify('Use an HTTPS gateway URL ending in /api, or /api for this site.');}}
  gatewayBase=input||defaultGateway;dataProvider=$('dataProvider').value;gatewayAccessCode=$('gatewayAccessCode').value.trim();
  persist('gatewayBase',gatewayBase);persist('dataProvider',dataProvider);persist('gatewayAccessCode',gatewayAccessCode);demoMode=false;persist('demoMode',false);requestSeq++;gatewayRevision++;
  if(!gatewayBase){clearAnalysis('Enter the deployed gateway URL, or choose Load Demo.');return;}
  try{const h=await gatewayFetch('/health');if(h.status!=='ok')throw Error('Gateway responded but is not ready.');notify('Gateway connected. Requesting the latest available candles…');await fetchOrDemo();}
  catch(err){dataError=err.message;clearAnalysis('Gateway test failed: '+err.message+'. Check the URL and your access code in Risk & Data Settings.');$('refreshData').disabled=false;notify('Gateway test failed: '+err.message);}
 });
 $('clearGateway').onclick=()=>{gatewayBase='';$('gatewayUrl').value='';persist('gatewayBase','');loadDemo();notify('Demo mode selected. Refresh Data reconnects to the gateway.')};
 $('loadDemo').onclick=()=>loadDemo();
 $('refreshData').onclick=()=>{if(!gatewayBase){if(hosted){gatewayBase=defaultGateway;persist('gatewayBase',gatewayBase);}else{setPage('settings');notify('Enter your gateway URL and access code, then Save & test gateway.');return;}}demoMode=false;persist('demoMode',false);fetchOrDemo();};
 const canvas=$('priceCanvas');canvas.addEventListener('mousemove',e=>{const meta=canvas.__chartMeta;if(!meta)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,index=meta.start+Math.floor((x-meta.padLeft)/meta.ww*meta.n);if(index<meta.start||index>=currentAnalysis.candles.length){$('chartTooltip').classList.add('hidden');return}hoverIndex=index;const c=currentAnalysis.candles[index];$('chartTooltip').innerHTML=`<strong>${htmlEscape(exchangeTimestamp(c.time,false))}</strong><br>O ${money(c.open)} &nbsp; H ${money(c.high)}<br>L ${money(c.low)} &nbsp; C ${money(c.close)}<br>Vol ${fmt(c.volume,0)}`;$('chartTooltip').style.left=Math.max(10,Math.min(rect.width-178,x+13))+'px';$('chartTooltip').classList.remove('hidden');drawChart()});canvas.addEventListener('mouseleave',()=>{hoverIndex=null;$('chartTooltip').classList.add('hidden');drawChart()});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.min(candles.length,Math.max(25,zoom+(e.deltaY>0?12:-12)));drawChart()},{passive:false});window.addEventListener('resize',drawChart);
}
register();registerStrategy();registerScreener();registerResearch();$('tickerInput').value=symbol.symbol;if(demoMode)loadDemo(false);else fetchOrDemo();setInterval(()=>{$('clock').textContent=new Date().toLocaleString('en-MY',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT'},5000);$('clock').textContent=new Date().toLocaleString('en-MY',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT';

})();
