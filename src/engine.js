/** BursaQuant educational analysis engine. No data fetching, no broker orders. */
export const DEFAULT_SETTINGS={capital:20000,riskPct:1,allocationPct:25,feePct:0.1,minFee:8,feePctUS:0,minFeeUS:0,slippagePct:0.15,usdMyr:4.30};
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
export function analyse(candles,style='swing'){
  if(!Array.isArray(candles)||candles.length<55)throw new Error('At least 55 valid OHLC candles are needed for analysis. For SMA200, 200 candles are recommended.');
  const c=candles.slice().sort((a,b)=>a.time-b.time),closes=c.map(x=>x.close),volumes=c.map(x=>x.volume||0),px=last(closes);
  const sma20=smaSeries(closes,20),sma50=smaSeries(closes,50),sma200=smaSeries(closes,200),rsi=rsiSeries(closes),atr=atrSeries(c),macd=macdSeries(closes),bb=bollinger(closes);
  const vol20=mean(volumes.slice(-21,-1).filter(x=>x>0));const hasVolume=vol20>0&&last(volumes)>0;
  const rvol=hasVolume?last(volumes)/vol20:null;const a=last(atr)||px*.02;const levels=supportResistance(c,px,a);const trendUp=px>last(sma20)&&last(sma20)>last(sma50),trendDown=px<last(sma20)&&last(sma20)<last(sma50);
  const trend=trendUp?'Bullish':trendDown?'Bearish':'Mixed / Range';const r=last(rsi),hist=last(macd.hist);const recent=c.slice(-60),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
  const factors=[
    {key:'Trend',weight:30,score:(px>last(sma20)?12:0)+(last(sma20)>last(sma50)?12:0)+(last(sma200)!==null&&px>last(sma200)?6:last(sma200)===null?3:0),reason:'Price vs SMA20/50/200'},
    {key:'Momentum',weight:25,score:(r>=45&&r<=68?15:r>68?9:r>=35?8:3)+(hist!==null&&hist>0?10:0),reason:'RSI range and MACD histogram'},
    {key:'Price structure',weight:20,score:Math.max(0,Math.min(20,Math.round(20*(px-levels.support)/Math.max(levels.resistance-levels.support,a))<=10?17:11)),reason:'Distance within the support/resistance channel'},
    {key:'Volume',weight:15,score:rvol===null?null:Math.min(15,Math.round(Math.max(0,rvol)*9)),reason:rvol===null?'No reliable volume':'Current volume / previous 20 bars'},
    {key:'Volatility',weight:10,score:a/px<.025?9:a/px<.05?6:3,reason:'ATR as percentage of price'}
  ];
  const active=factors.filter(f=>f.score!==null);const totalWeight=active.reduce((s,f)=>s+f.weight,0);
  const score=Math.round(100*active.reduce((s,f)=>s+f.score,0)/totalWeight);
  const factorData=factors.map(f=>({...f,contribution:f.score===null?null:Math.round(f.score/f.weight*100)}));
  let adjustment=1;if(style==='intraday')adjustment=.65;if(style==='medium')adjustment=1.5;if(style==='invest')adjustment=2;
  const support=levels.support,resistance=levels.resistance;
  const pullEntry=support+0.20*a*adjustment;const pullStop=Math.max(.001,support-0.70*a*adjustment);const pullRisk=pullEntry-pullStop;
  const breakoutEntry=resistance+0.15*a*adjustment;const breakoutStop=Math.max(.001,resistance-0.8*a*adjustment);const breakoutRisk=breakoutEntry-breakoutStop;
  const lowPlan={id:'lower',label:'Buy Lower',tag:'SUPPORT PULLBACK',description:'Conditional entry if price revisits support, stabilizes, and confirms a reversal. Do not assume support must hold.',entry:pullEntry,zoneLow:support,zoneHigh:support+.30*a*adjustment,deepWatch:Math.max(0.001,support-.40*a*adjustment),stop:pullStop,tp1:Math.max(resistance,pullEntry+1.5*pullRisk),tp2:Math.max(resistance+a*adjustment,pullEntry+2.5*pullRisk),tp3:Math.max(resistance+a*adjustment+pullRisk,pullEntry+3.5*pullRisk),conditions:'Look for a bullish reversal near support. A break toward the deeper watch level invalidates this support entry; reassess rather than averaging down automatically.',valid:pullEntry>pullStop};
  const breakoutPlan={id:'breakout',label:'Buy Breakout',tag:'MOMENTUM CONFIRMATION',description:'Conditional entry only after price closes beyond resistance, with confirmation and meaningful volume.',entry:breakoutEntry,zoneLow:resistance,zoneHigh:breakoutEntry+.15*a*adjustment,stop:breakoutStop,tp1:breakoutEntry+1.5*breakoutRisk,tp2:breakoutEntry+2.5*breakoutRisk,tp3:breakoutEntry+3.5*breakoutRisk,conditions:'Require candle close above resistance, check volume expansion, avoid excessive gaps.',valid:breakoutEntry>breakoutStop};
  const verdict=score>=72&&trendUp?'Constructive / Watch for Entry':score<42||trendDown?'Caution / No New Long':'Neutral / Wait for Confirmation';
  return {candles:c,price:px,previous:c.at(-2)?.close??px,sma20,sma50,sma200,rsi:r,macd:hist,atr:a,bb,rvol,hasVolume,trend,score,factors:factorData,levels:{...levels,fib382:hi-(hi-lo)*.382,fib618:hi-(hi-lo)*.618},plans:[lowPlan,breakoutPlan],verdict,style,coverage:{sma200:last(sma200)!==null,volume:hasVolume,fundamentals:false,news:false,indices:false}};
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
  const base=bases[symbol]||45,intervals={'1h':3600,'4h':14400,'1day':86400,'1week':604800},interval=intervals[timeframe]||14400;
  const now=Math.floor(Date.now()/1000/interval)*interval;let px=base*(.82+rand()*.1);const out=[];
  for(let i=0;i<n;i++){const p=rand()-.5;const variation=(.012*(p*1.7)+.003*Math.sin(i/8)+.0008);const open=px;px=Math.max(.005,px*(1+variation));const high=Math.max(open,px)*(1+rand()*.007);const low=Math.min(open,px)*(1-rand()*.007);out.push({time:now-(n-i-1)*interval,open,high,low,close:px,volume:Math.floor(120000+rand()*2200000+Math.abs(variation)*30000000)})}
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
