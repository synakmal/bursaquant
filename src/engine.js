/** BursaQuant educational analysis engine. No data fetching, no broker orders. */
export const DEFAULT_SETTINGS={capital:20000,riskPct:1,allocationPct:25,feePct:0.1,minFee:8,feePctUS:0,minFeeUS:0,slippagePct:0.15,usdMyr:4.30};
export const RATING_INDICATORS=[
  {id:'trend',name:'Moving-average trend',description:'Moving averages smooth closing prices so the direction is easier to see.',how:'SMA20 averages the last 20 closes; SMA50 and SMA200 use 50 and 200. This rule checks price above SMA20, SMA20 above SMA50, and price above SMA200 when available.',limitation:'Averages lag price and can change direction repeatedly in a range. Missing SMA200 is excluded from this rule.'},
  {id:'rsi',name:'RSI momentum',description:'RSI14 compares recent upward and downward price changes on a scale from 0 to 100.',how:'The rating gives its highest reading inside your preferred RSI band, a lower reading above that band, and less credit below it. The band is your preference, not a universal entry signal.',limitation:'A high RSI can persist in a strong trend. A low RSI does not establish that a reversal is coming.'},
  {id:'macd',name:'MACD momentum',description:'MACD compares faster and slower exponential moving averages to describe momentum.',how:'The MACD line is EMA12 minus EMA26. Its signal line is a 9-period EMA. A positive histogram means MACD is above its signal; this checklist awards full credit when positive.',limitation:'This checks the latest histogram, not whether a crossover just occurred. MACD lags and can whipsaw.'},
  {id:'structure',name:'Support / resistance',description:'Support and resistance are estimated areas where price previously paused or turned.',how:'The engine looks for local swing lows and highs. This pullback-oriented rule favours price in the lower half of the estimated support/resistance range.',limitation:'These are estimates, not guaranteed barriers. The engine uses ATR-based fallback levels if no suitable swing is found.'},
  {id:'volume',name:'Relative volume',description:'Relative volume compares activity in the latest candle with the preceding candles.',how:'RVOL divides the latest volume by the mean positive volume of the previous 20 candles. This rule scales credit with RVOL, reaching full credit at approximately 1.67 times.',limitation:'An unfinished candle has incomplete volume. Partial exchange feeds can differ from consolidated market volume; larger volume does not establish direction.'},
  {id:'volatility',name:'ATR volatility',description:'ATR14 measures typical candle movement, including gaps from the previous close.',how:'ATR uses a smoothed average of true ranges. This rule prefers lower ATR relative to price: below 2.5% receives more credit than 2.5–5% or above 5%.',limitation:'Lower volatility is a preference, not evidence of higher returns. ATR does not predict price direction or guarantee a stop will fill.'},
  {id:'bollinger',name:'Bollinger-band location',description:'Bollinger Bands place two standard-deviation bands around a 20-period moving average.',how:'This pullback-oriented rule gives full credit between the lower band and middle average, partial credit between the middle and upper band, and less credit outside the bands.',limitation:'A band touch does not confirm a reversal. Price can follow a band during a trend; flat bands are excluded as unavailable.'}
];
export const STRATEGY_PRESETS={
  balanced:{id:'balanced',name:'Balanced technical',description:'A mixed checklist of trend, momentum, price structure, volume and volatility.',weights:{trend:30,rsi:15,macd:10,structure:20,volume:15,volatility:10,bollinger:0},rsiLow:45,rsiHigh:68,constructiveAt:72,cautionBelow:42},
  trend:{id:'trend',name:'Trend emphasis',description:'Gives more weight to moving averages and momentum. This is an emphasis profile, not a backtested trading system.',weights:{trend:45,rsi:15,macd:20,structure:5,volume:10,volatility:5,bollinger:0},rsiLow:50,rsiHigh:70,constructiveAt:72,cautionBelow:42},
  pullback:{id:'pullback',name:'Pullback emphasis',description:'Emphasises support proximity and band location. A reversal still needs separate confirmation.',weights:{trend:20,rsi:15,macd:5,structure:30,volume:5,volatility:10,bollinger:15},rsiLow:35,rsiHigh:55,constructiveAt:72,cautionBelow:42},
  breakout:{id:'breakout',name:'Breakout emphasis',description:'Emphasises trend, momentum and volume. The score alone does not confirm a break above resistance.',weights:{trend:30,rsi:15,macd:20,structure:0,volume:25,volatility:10,bollinger:0},rsiLow:55,rsiHigh:75,constructiveAt:72,cautionBelow:42}
};
export function normalizeStrategy(input){
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
export const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
export const round=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const last=a=>a[a.length-1];
export function smaSeries(values,period){return values.map((_,i)=>i+1<period?null:mean(values.slice(i+1-period,i+1)));}
export function emaSeries(values,period){const out=Array(values.length).fill(null);if(values.length<period)return out;let e=mean(values.slice(0,period));out[period-1]=e;const k=2/(period+1);for(let i=period;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out;}
export function rsiSeries(closes,period=14){const out=Array(closes.length).fill(null);if(closes.length<=period)return out;let gain=0,loss=0;for(let i=1;i<=period;i++){const x=closes[i]-closes[i-1];gain+=Math.max(0,x);loss+=Math.max(0,-x);}gain/=period;loss/=period;out[period]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);for(let i=period+1;i<closes.length;i++){const delta=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,delta))/period;loss=(loss*(period-1)+Math.max(0,-delta))/period;out[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}return out;}
export function atrSeries(candles,period=14){const tr=candles.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)));const out=Array(candles.length).fill(null);if(tr.length<period)return out;let a=mean(tr.slice(0,period));out[period-1]=a;for(let i=period;i<tr.length;i++){a=(a*(period-1)+tr[i])/period;out[i]=a;}return out;}
export function macdSeries(closes){const fast=emaSeries(closes,12),slow=emaSeries(closes,26);const macd=closes.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);const valid=macd.filter(v=>v!==null);const signalValid=emaSeries(valid,9);const signal=Array(macd.length).fill(null);let j=0;for(let i=0;i<macd.length;i++)if(macd[i]!==null)signal[i]=signalValid[j++];return {macd,signal,hist:macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i])};}
export function bollinger(closes,p=20,mult=2){if(closes.length<p)return null;const a=closes.slice(-p),mid=mean(a),sd=Math.sqrt(mean(a.map(x=>(x-mid)**2)));return {middle:mid,upper:mid+mult*sd,lower:mid-mult*sd};}
function supportResistance(candles,price,atr){const n=candles.length;const pivotsLow=[],pivotsHigh=[];for(let i=Math.max(3,n-95);i<n-3;i++){const c=candles[i];if(c.low<=Math.min(...candles.slice(i-3,i+4).map(x=>x.low)))pivotsLow.push(c.low);if(c.high>=Math.max(...candles.slice(i-3,i+4).map(x=>x.high)))pivotsHigh.push(c.high)}const below=pivotsLow.filter(v=>v<price).sort((a,b)=>b-a),above=pivotsHigh.filter(v=>v>price).sort((a,b)=>a-b);const recent=candles.slice(-60);let support=below[0]??Math.min(...recent.map(x=>x.low));let resistance=above[0]??Math.max(...recent.map(x=>x.high));if(support>=price)support=price-atr*1.3;if(resistance<=price)resistance=price+atr*1.3;return {support:Math.max(0.001,support),resistance};}
export function analyse(candles,style='swing',strategy){
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
export function sizePosition(plan, settings=DEFAULT_SETTINGS, currency='MYR', lotSize=1){
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
export function generateDemo(symbol='AAPL',timeframe='4h',n=230){
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
export function exchangeEpoch(datetime,zone='UTC'){
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
export function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);if(lines.length<56)throw new Error('CSV needs a header and at least 55 candles.');
  const split=(line)=>{let res=[],cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){res.push(cur.trim());cur='';}else cur+=ch;}res.push(cur.trim());return res;};
  const names=split(lines[0]).map(v=>v.toLowerCase().replace(/[^a-z]/g,''));const lookup=key=>names.indexOf(key);const timeIndex=names.findIndex(v=>['datetime','date','time','timestamp'].includes(v));
  const idx=['open','high','low','close'].map(lookup);if(timeIndex<0||idx.some(i=>i<0))throw new Error('CSV requires datetime/date, open, high, low and close columns.');
  const vi=lookup('volume');let rows=[];
  for(const ln of lines.slice(1)){const fields=split(ln),raw=fields[timeIndex];const parsed=/^\d{10,13}$/.test(raw)?Number(raw)/(raw.length===13?1000:1):Date.parse(raw.includes('T')||/[zZ+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z')/1000;const nums=idx.map(j=>Number(fields[j]));const volume=vi>=0?Number(fields[vi]):0;if(!Number.isFinite(parsed)||nums.some(x=>!Number.isFinite(x))||nums[0]<=0||nums[1]<Math.max(nums[0],nums[3])||nums[2]>Math.min(nums[0],nums[3])||nums[2]<=0||nums[3]<=0||!Number.isFinite(volume)||volume<0)continue;rows.push({time:Math.floor(parsed),open:nums[0],high:nums[1],low:nums[2],close:nums[3],volume});}
  rows.sort((a,b)=>a.time-b.time);rows=rows.filter((x,i,a)=>i===0||x.time!==a[i-1].time);if(rows.length<55)throw new Error('Fewer than 55 valid OHLC candles; check CSV fields and dates.');return rows;
}
