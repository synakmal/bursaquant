// Real-data screening utilities. Requests are sequential, bounded and resumable.
export function screenInstrument(value, marketHint='all') {
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

export function parseScreenSymbols(text, market='all') {
  const seen=new Set(),instruments=[],rejected=[];
  for(const token of String(text||'').slice(0,200000).split(/[\s,;]+/).filter(Boolean)){
    const item=screenInstrument(token,market);
    if(!item){rejected.push(token.slice(0,32));continue;}
    const key=item.market+':'+item.symbol;if(seen.has(key))continue;seen.add(key);instruments.push(item);
    if(instruments.length>=12000)break;
  }
  return {instruments,rejected};
}

export function parseScreenListFile(text,market='all') {
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

export function createScreenRun(instruments, context={}) {
  const seen=new Set(),queue=[];
  for(const raw of instruments){const item=screenInstrument(raw);if(!item)continue;const key=item.market+':'+item.symbol;if(seen.has(key))continue;seen.add(key);queue.push(item);}
  return {version:1,context:{...context,interval:'1day'},queue,results:[],cursor:0,startedAt:new Date().toISOString(),updatedAt:null,pausedReason:'',running:false};
}

export function screenCoverage(run) {
  const counts={total:run?.queue?.length||0,checked:run?.results?.length||0,analysed:0,failed:0,insufficient:0,stale:0,candidates:0};
  for(const row of run?.results||[]){
    if(row.error)counts.failed++;
    else if(row.stale)counts.stale++;
    else if(row.evaluation?.classification==='insufficient')counts.insufficient++;
    else {counts.analysed++;if(['accumulation','breakout'].includes(row.evaluation?.classification))counts.candidates++;}
  }
  counts.remaining=Math.max(0,counts.total-counts.checked);return counts;
}

export function usableDailyBars(data) {
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

export async function scanDailyBatch(run,{request,evaluate,onUpdate=()=>{},shouldStop=()=>false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),batchSize=25,spacingMs=1500,now=()=>Date.now(),maxAgeDays=7}={}) {
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
