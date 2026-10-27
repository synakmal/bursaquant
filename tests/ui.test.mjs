import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// A small DOM double for event and persistence checks. This does not test browser
// layout, HTML constraint validation, canvas rendering or network integrations.
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../src/bundle.js',import.meta.url),'utf8');
function boot(saved={}){
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
  const context=vm.createContext({document,window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,Blob,URL:{createObjectURL:blob=>{const key='blob:'+downloads.length;downloads.push({blob,url:key});return key;},revokeObjectURL(){}},fetch:()=>{throw new Error('Unexpected network request in offline UI test');}});
  vm.runInContext(bundle,context,{filename:'src/bundle.js'});
  return {get:id=>byId.get(id),storage,downloads};
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
