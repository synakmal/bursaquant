import {analyse,generateDemo,parseCSV,sizePosition,exchangeEpoch,DEFAULT_SETTINGS,round,RATING_INDICATORS,STRATEGY_PRESETS,normalizeStrategy} from './engine.js';
import {evaluateAccumulation,DEFAULT_SCREEN_SETTINGS} from './screener.js';
import {screenInstrument,parseScreenSymbols,parseScreenListFile,createScreenRun,screenCoverage,scanDailyBatch} from './scan-runner.js';
import {buildDeepReport} from './deep-analysis.js';
import {mountResearchWorkspace} from './research-ui.js';
import {mountIpoWorkspace} from './ipo.js';
import {validatePosition,positionTotals,validateHoldingsBook,parseHoldingsBackup,serializeHoldingsBook,summarizeHoldings} from './holdings-model.js';
import {HOLDING_STYLES,reviewHolding} from './holding-review.js';
import {mountHoldingsWorkspace} from './holdings-ui.js';
function registerHoldings(){
 holdingsWorkspace=mountHoldingsWorkspace($('holdingsWorkspace'),{
   model:{validatePosition,positionTotals,validateHoldingsBook,parseHoldingsBackup,serializeHoldingsBook,summarizeHoldings},
   styles:HOLDING_STYLES,reviewHolding,
   getConnectionKey:()=>JSON.stringify([gatewayBase,dataProvider,gatewayRevision,ratingStrategy]),
   canFetch:()=>({ready:!!gatewayBase&&!demoMode,message:!gatewayBase?'Connect your personal data gateway in Risk & Data Settings first.':'Click Refresh Data in Stock Analysis to leave demo mode before reviewing a holding.'}),
   fetchMarket:(item,interval)=>researchGatewayFetch(`/market?market=${encodeURIComponent(item.market)}&symbol=${encodeURIComponent(item.symbol)}&interval=${encodeURIComponent(interval)}&provider=${encodeURIComponent(dataProvider)}&limit=500`),
   analyseFrame:(bars,engineStyle)=>analyse(bars,engineStyle,ratingStrategy)
 });
}
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
let researchWorkspace=null,holdingsWorkspace=null,gatewayRevision=0;
let ratingStrategy=normalizeStrategy(load('ratingStrategy',null));
let screenRun=load('screenRun',null),screenDirectory=load('screenDirectory',null),screenStop=false,screenLoading=false,screenDirectorySeq=0,screenVisible=100;
if(screenRun?.version!==1||!Array.isArray(screenRun?.queue)||!Array.isArray(screenRun?.results))screenRun=null;
if(screenRun)screenRun.running=false;
if(!Array.isArray(screenDirectory?.instruments))screenDirectory=null;
function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4200)}
function fmt(v,dec=2){return Number.isFinite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—'};
const money=(v,currency=symbol.currency)=>`${currency==='USD'?'$':'RM'}${fmt(v,v>1?2:4)}`;
const nfmt=v=>Number.isFinite(v)?fmt(v,2):'—';
function setPage(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===page));$('crumb').textContent=({'analysis':'STOCK ANALYSIS','research':'DEEP RESEARCH & AI','ipo':'IPO RESEARCH','screener':'STOCK SCREENER','watchlist':'WATCHLIST','journal':'TRADES & HOLDINGS','settings':'SETTINGS','strategy':'STRATEGY & LEARNING'})[page]||'STOCK ANALYSIS';$('sidebar').classList.remove('open');if(page==='settings')fillSettings();if(page==='strategy'){fillStrategyForm();renderResearchAnswer();}if(page==='watchlist')renderWatch();if(page==='journal'){renderJournal();holdingsWorkspace?.refresh();}if(page==='screener')renderScreener();if(page==='research')researchWorkspace?.refresh();if(page==='analysis')requestAnimationFrame(drawChart);window.scrollTo({top:0,behavior:'instant'});}
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
 $('exportSaved').onclick=()=>download('bursaquant-backup.json',JSON.stringify({watchlist,snapshots,settings,trades,ratingStrategy,holdings:holdingsWorkspace?.getBook(),exportedAt:new Date().toISOString()},null,2),'application/json');$('exportJournal').onclick=exportJournal;
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
register();registerStrategy();registerScreener();registerResearch();registerHoldings();$('tickerInput').value=symbol.symbol;if(demoMode)loadDemo(false);else fetchOrDemo();setInterval(()=>{$('clock').textContent=new Date().toLocaleString('en-MY',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT'},5000);$('clock').textContent=new Date().toLocaleString('en-MY',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'})+' MYT';
