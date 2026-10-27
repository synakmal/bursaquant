import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// A small DOM double for event and persistence checks. This does not test browser
// layout, HTML constraint validation, canvas rendering or network integrations.
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../src/bundle.js',import.meta.url),'utf8');
function boot(saved={},options={}){
  const storage=new Map(Object.entries(saved)),byId=new Map(),downloads=[];
  class Element{
    constructor(tag,attributes={}){
      this.tagName=tag.toUpperCase();this.attributes=attributes;this.id=attributes.id||'';
      this.dataset=Object.fromEntries(Object.entries(attributes).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
      this.value=attributes.value||'';this.checked=Object.hasOwn(attributes,'checked');this.disabled=Object.hasOwn(attributes,'disabled');
      this.style={};this.events={};this.children=[];this.clientWidth=0;this._text='';this._html='';
      const classes=new Set((attributes.class||'').split(/\s+/).filter(Boolean));
      this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,on)=>{const next=on??!classes.has(c);next?classes.add(c):classes.delete(c);return next;}};
    }
    set textContent(value){this._text=String(value);}get textContent(){return this._text;}
    set innerHTML(value){this._html=String(value);this.children=parse(this._html);}get innerHTML(){return this._html;}
    addEventListener(event,fn){(this.events[event]??=[]).push(fn);}
    async dispatch(event,target=this){const e={target,preventDefault(){}};for(const fn of this.events[event]||[])await fn(e);if(this['on'+event])await this['on'+event](e);}
    querySelectorAll(selector){return this.children.filter(e=>matches(e,selector));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    click(){if(this.tagName==='A')downloads.push({name:this.download,url:this.href});else return this.dispatch('click');}
    remove(){}append(){}closest(){return null;}
  }
  function parse(html){
    const nodes=[];
    for(const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*?)>/gi)){
      const attrs={};for(const a of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g))attrs[a[1]]=a[2]??a[3]??'';
      const node=new Element(match[1],attrs);if(node.id)byId.set(node.id,node);
      if(node.tagName==='SELECT'){const after=html.slice(match.index+match[0].length);node.value=after.match(/<option\b[^>]*value="([^"]*)"/)?.[1]||'';}
      nodes.push(node);
    }
    return nodes;
  }
  function matches(element,selector){
    if(selector.startsWith('.'))return element.classList.contains(selector.slice(1));
    const attribute=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if(attribute)return Object.hasOwn(element.attributes,attribute[1])&&(attribute[2]===undefined||element.attributes[attribute[1]]===attribute[2]);
    return element.tagName.toLowerCase()===selector;
  }
  const elements=parse(page);
  const document={getElementById:id=>byId.get(id)||null,querySelectorAll:s=>elements.filter(e=>matches(e,s)),addEventListener(){},createElement:tag=>new Element(tag),body:{append(){}}};
  const context=vm.createContext({document,window:{location:{protocol:options.protocol||''},addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,Blob,URL:{createObjectURL:blob=>{const key='blob:'+downloads.length;downloads.push({blob,url:key});return key;},revokeObjectURL(){}},fetch:options.fetch||(()=>{throw new Error('Unexpected network request in offline UI test');})});
  vm.runInContext(bundle,context,{filename:'src/bundle.js'});
  return {get:id=>byId.get(id),all:s=>document.querySelectorAll(s),storage,downloads};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function providerData(price=100){
  const bars=Array.from({length:230},(_,i)=>({time:1700000000+i*86400,open:price+i*.01,high:price+i*.01+1,low:price+i*.01-1,close:price+i*.01+.1,volume:10000+i}));
  return {bars,meta:{provider:'yahoo',name:'Provider company',exchange:'NASDAQ',timezone:'America/New_York',lastCompleteCandle:'2026-10-26T13:30:00.000Z',fetchedAt:'2026-10-27T04:00:00.000Z',interval:'1day',completedCandles:true,completionInferred:true}};
}
function configure(ui,{name='RSI only',rsiLow=0,rsiHigh=100,enabled={rsi:100}}={}){
  ui.get('strategyPreset').value='custom';ui.get('strategyName').value=name;
  ui.get('strategyRsiLow').value=rsiLow;ui.get('strategyRsiHigh').value=rsiHigh;
  for(const box of ui.get('strategyWeights').querySelectorAll('[data-enable]')){
    box.checked=Object.hasOwn(enabled,box.dataset.enable);
    const weight=ui.get('strategyWeights').querySelector(`[data-weight="${box.dataset.enable}"]`);
    weight.disabled=!box.checked;weight.value=enabled[box.dataset.enable]??10;
  }
}

test('bundled dashboard boots offline and includes educational indicator explanations',()=>{
  const ui=boot();assert.equal(ui.get('sourceLabel').textContent,'SIMULATED DEMO');
  assert.match(ui.get('activeStrategyLabel').textContent,/Balanced technical/);
  assert.match(ui.get('researchAnswer').textContent,/Saved strategy: Balanced technical/);
  assert.match(ui.get('researchAnswer').textContent,/synthetic candles/);
  assert.match(ui.get('indicatorGuide').innerHTML,/RSI momentum/);
  assert.match(ui.get('indicatorGuide').innerHTML,/What it cannot tell you/);
});

test('saved custom strategy updates rating and explanation, survives reload and is included in snapshots',async()=>{
  const ui=boot();configure(ui,{name:'My RSI rules'});
  await ui.get('strategyForm').dispatch('submit');
  const saved=JSON.parse(ui.storage.get('bq_ratingStrategy'));
  assert.equal(saved.name,'My RSI rules');assert.equal(saved.weights.rsi,100);assert.equal(saved.weights.trend,0);
  assert.equal(ui.get('scoreNumber').textContent,'100');
  assert.match(ui.get('activeStrategyLabel').textContent,/My RSI rules · 1 enabled/);
  assert.match(ui.get('researchAnswer').textContent,/Saved strategy: My RSI rules/);
  assert.doesNotMatch(ui.get('scoreFactors').innerHTML,/Moving-average trend/);
  await ui.get('saveAnalysis').dispatch('click');
  const snapshot=JSON.parse(ui.storage.get('bq_snapshots'))[0];
  assert.equal(snapshot.strategy.name,'My RSI rules');assert.equal(snapshot.strategy.weights.rsi,100);
  const reloaded=boot(Object.fromEntries(ui.storage));
  assert.match(reloaded.get('activeStrategyLabel').textContent,/My RSI rules/);
  assert.equal(reloaded.get('scoreNumber').textContent,'100');
});

test('reset and draft edits do not affect saved rating until explicitly saved',async()=>{
  const ui=boot();configure(ui,{name:'Saved RSI'});await ui.get('strategyForm').dispatch('submit');
  await ui.get('resetStrategy').dispatch('click');
  assert.equal(ui.get('strategyName').value,'Balanced technical');
  assert.match(ui.get('activeStrategyLabel').textContent,/Saved RSI/);
  assert.match(ui.get('researchAnswer').textContent,/Saved strategy: Saved RSI/);
  assert.equal(JSON.parse(ui.storage.get('bq_ratingStrategy')).name,'Saved RSI');
  await ui.get('strategyForm').dispatch('submit');
  assert.match(ui.get('activeStrategyLabel').textContent,/Balanced technical/);
  assert.equal(JSON.parse(ui.storage.get('bq_ratingStrategy')).id,'balanced');
});

test('unavailable-only indicator configuration renders unavailable rating after CSV import',async()=>{
  const ui=boot();configure(ui,{enabled:{volume:100},name:'Volume only'});await ui.get('strategyForm').dispatch('submit');
  const rows=Array.from({length:55},(_,i)=>`${1700000000+i*3600},10,11,9,10,0`);
  const csv='timestamp,open,high,low,close,volume\n'+rows.join('\n');
  const input=ui.get('csvInput');input.files=[{text:async()=>csv}];await input.dispatch('change');
  assert.equal(ui.get('sourceLabel').textContent,'CSV IMPORT');assert.equal(ui.get('scoreNumber').textContent,'—');
  assert.equal(ui.get('scoreLabel').textContent,'Insufficient indicator data');
  assert.match(ui.get('researchAnswer').textContent,/Rating: unavailable/);
  assert.match(ui.get('coverageNotice').textContent,/0\/100/);
  assert.doesNotMatch(ui.get('scoreRing').style.background,/NaN/);
});

test('all-disabled draft is rejected without overwriting saved rules',async()=>{
  const ui=boot();configure(ui,{name:'Saved RSI'});await ui.get('strategyForm').dispatch('submit');
  configure(ui,{enabled:{}});await ui.get('strategyForm').dispatch('submit');
  assert.match(ui.get('strategyStatus').textContent,/Enable at least one/);
  assert.equal(JSON.parse(ui.storage.get('bq_ratingStrategy')).name,'Saved RSI');
});

test('hosted boot requests daily provider data and displays Yahoo source and original timestamps',async()=>{
  const calls=[];
  const ui=boot({}, {protocol:'https:',fetch:async(url,options)=>{calls.push({url,options});return response(providerData());}});
  await settle();
  assert.equal(calls.length,1);assert.match(calls[0].url,/^\/api\/market\?/);assert.match(calls[0].url,/interval=1day/);assert.match(calls[0].url,/provider=auto/);
  assert.equal(ui.get('sourceLabel').textContent,'YAHOO FINANCE');assert.equal(ui.get('indicatorTF').textContent,'1DAY');
  assert.equal(ui.get('companyName').textContent,'Provider company');
  assert.match(ui.get('dataTimestamp').textContent,/Latest candle \(completion inferred\): 2026-10-26 09:30 \(America\/New_York\)/);
  assert.match(ui.get('dataTimestamp').textContent,/2026-10-26T13:30:00.000Z/);
  assert.match(ui.get('dataTimestamp').textContent,/Fetched: 2026-10-27 00:00 \(America\/New_York\).*2026-10-27T04:00:00.000Z/);
  assert.match(ui.get('researchAnswer').textContent,/YAHOO FINANCE/);assert.doesNotMatch(ui.get('researchAnswer').textContent,/synthetic candles/);
  assert.equal(ui.get('saveAnalysis').disabled,false);
});

test('personal access code travels only in request headers and is absent from exported evidence and backups',async()=>{
  const code='my-private-access-code',calls=[];
  const ui=boot({bq_gatewayAccessCode:JSON.stringify(code)}, {protocol:'https:',fetch:async(url,options)=>{calls.push({url,options});return response(providerData());}});
  await settle();assert.equal(calls[0].options.headers['X-BQ-Access-Token'],code);assert.doesNotMatch(calls[0].url,/my-private-access-code/);
  await ui.get('exportAiBrief').dispatch('click');await ui.get('exportSaved').dispatch('click');
  const texts=await Promise.all(ui.downloads.filter(x=>x.blob).map(x=>x.blob.text()));
  assert.equal(texts.length,2);for(const text of texts)assert.doesNotMatch(text,/my-private-access-code|gatewayAccessCode/);
  assert.match(texts[0],/YAHOO FINANCE/);assert.match(texts[0],/lastCompleteCandle/);
});

test('provider failure shows unavailable analysis until demo is explicitly selected',async()=>{
  const ui=boot({}, {protocol:'https:',fetch:async()=>response({error:{message:'Incorrect personal gateway access code'}},403)});
  await settle();
  assert.equal(ui.get('sourceLabel').textContent,'DATA UNAVAILABLE');assert.equal(ui.get('currentPrice').textContent,'—');
  assert.equal(ui.get('metricCards').innerHTML,'');assert.equal(ui.get('saveAnalysis').disabled,true);assert.equal(ui.get('exportAiBrief').disabled,true);
  assert.match(ui.get('dataNoticeText').textContent,/Incorrect personal gateway access code/);assert.doesNotMatch(ui.get('dataNoticeText').textContent,/Demo data is shown/);
  await ui.get('loadDemo').dispatch('click');assert.equal(ui.get('sourceLabel').textContent,'SIMULATED DEMO');assert.equal(ui.get('saveAnalysis').disabled,false);
});

test('failed refresh of the same instrument retains original analysis with a visible failure notice',async()=>{
  let count=0;const ui=boot({}, {protocol:'https:',fetch:async()=>++count===1?response(providerData()):response({error:{message:'Rate limited'}},429)});
  await settle();const price=ui.get('currentPrice').textContent,timestamp=ui.get('dataTimestamp').textContent;
  await ui.get('refreshData').dispatch('click');await settle();
  assert.equal(ui.get('sourceLabel').textContent,'YAHOO FINANCE');assert.equal(ui.get('currentPrice').textContent,price);assert.equal(ui.get('dataTimestamp').textContent,timestamp);
  assert.match(ui.get('dataNoticeText').textContent,/Refresh failed: Rate limited/);assert.match(ui.get('researchAnswer').textContent,/previously loaded analysis/);
});

test('timeframe changes ignore an earlier request that resolves after the new analysis',async()=>{
  const pending=[];const ui=boot({}, {protocol:'https:',fetch:(url)=>new Promise(resolve=>pending.push({url,resolve}))});
  await ui.all('[data-tf]').find(b=>b.dataset.tf==='1h').dispatch('click');assert.equal(pending.length,2);
  pending[1].resolve(response(providerData(200)));await settle();const price=ui.get('currentPrice').textContent;
  assert.match(pending[1].url,/interval=1h/);assert.equal(ui.get('indicatorTF').textContent,'1H');
  pending[0].resolve(response(providerData(100)));await settle();
  assert.equal(ui.get('currentPrice').textContent,price);assert.equal(ui.get('indicatorTF').textContent,'1H');
});

test('provider changes invalidate an earlier request before it can replace the saved provider analysis',async()=>{
  const pending=[];const ui=boot({}, {protocol:'https:',fetch:(url)=>url.endsWith('/health')?Promise.resolve(response({status:'ok'})):new Promise(resolve=>pending.push({url,resolve}))});
  ui.get('gatewayUrl').value='/api';ui.get('dataProvider').value='yahoo';ui.get('gatewayAccessCode').value='personal-code';
  const submitted=ui.get('apiForm').dispatch('submit');await settle();assert.equal(pending.length,2);assert.match(pending[1].url,/provider=yahoo/);
  pending[1].resolve(response(providerData(300)));await submitted;const price=ui.get('currentPrice').textContent;
  pending[0].resolve(response(providerData(100)));await settle();
  assert.equal(ui.get('currentPrice').textContent,price);assert.equal(JSON.parse(ui.storage.get('bq_dataProvider')),'yahoo');
});

test('Bursa calendar timestamps use the exchange date at a UTC month boundary',async()=>{
  const data=providerData();Object.assign(data.meta,{timezone:'Asia/Kuala_Lumpur',lastCompleteCandle:'2026-06-30T16:00:00.000Z',interval:'1month'});
  const ui=boot({}, {protocol:'https:',fetch:async()=>response(data)});await settle();
  assert.match(ui.get('dataTimestamp').textContent,/2026-07-01 00:00 \(Asia\/Kuala_Lumpur\)/);
  assert.equal(ui.get('chartTimezone').textContent,'Chart timezone: Asia/Kuala_Lumpur');
});

test('provider details disclose cached history, inferred completion and omitted aggregation groups',async()=>{
  const data=providerData();Object.assign(data.meta,{cached:true,cacheExpiresAt:'2026-10-27T04:15:00.000Z',completionPolicy:'Session-end buckets may be shorter than four hours.',notes:'Completion is conservatively inferred, not guaranteed by Yahoo.',missingAggregationGroups:2});
  const ui=boot({}, {protocol:'https:',fetch:async()=>response(data)});await settle();
  const notice=ui.get('providerDetails');assert.equal(notice.classList.contains('hidden'),false);
  assert.match(notice.textContent,/Served from the gateway cache/);assert.match(notice.textContent,/Cache expires:/);
  assert.match(notice.textContent,/shorter than four hours/);assert.match(notice.textContent,/not guaranteed by Yahoo/);
  assert.match(notice.textContent,/2 aggregation groups omitted/);
});

test('legacy provider timestamps do not claim confirmed completed candles',async()=>{
  const data=providerData();data.meta.provider='twelvedata';delete data.meta.completedCandles;delete data.meta.completionInferred;
  const ui=boot({}, {protocol:'https:',fetch:async()=>response(data)});await settle();
  assert.match(ui.get('dataTimestamp').textContent,/^Last supplied candle:/);assert.doesNotMatch(ui.get('dataTimestamp').textContent,/completed candle/);
  assert.match(ui.get('providerDetails').textContent,/has not confirmed/);assert.match(ui.get('researchAnswer').textContent,/completion has not been confirmed/);
});
