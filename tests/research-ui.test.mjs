import test from 'node:test';
import assert from 'node:assert/strict';
import {researchAiContext,mountResearchWorkspace} from '../src/research-ui.js';
import {buildDeepReport} from '../src/deep-analysis.js';
import {analyse,sizePosition,DEFAULT_SETTINGS} from '../src/engine.js';
import {evaluateAccumulation} from '../src/screener.js';

function fixture(timeframe='1day'){
  const last=Math.floor(Date.now()/1000)-86400,step={'1day':86400,'4h':14400,'1h':3600}[timeframe];
  const bars=Array.from({length:230},(_,index)=>{const price=20*Math.exp(index*.002);return {time:last-(229-index)*step,open:price*.998,high:price*1.006,low:price*.994,close:price,volume:100000+index*500};});
  return {bars,meta:{provider:'yahoo',interval:timeframe,instrumentType:'EQUITY',completedCandles:true,completionInferred:true,timezone:'America/New_York',fetchedAt:new Date().toISOString()}};
}
function evidence(){
  const data=fixture(),analysis=analyse(data.bars);
  return buildDeepReport({symbol:'AAPL',market:'US',frames:[{timeframe:'1day',...data,analysis,sizedPlans:analysis.plans.map(plan=>sizePosition(plan,{...DEFAULT_SETTINGS,capital:12345,riskPct:.5},'USD',1)),accumulation:evaluateAccumulation(data.bars)}]});
}
const deferred=()=>{let resolve;const promise=new Promise(value=>{resolve=value;});return {promise,resolve};};

// This minimal DOM double tests lifecycle, explicit submission and text handling.
// It does not assert browser layout, HTML parsing fidelity or accessibility.
function mount(t,overrides={}){
  const elements=new Map();
  class Element{
    constructor(){this.disabled=false;this.value='';this.dataset={};this._text='';this._html='';}
    set innerHTML(value){this._html=String(value);this._text='';for(const match of this._html.matchAll(/\bid="([^"]+)"/g))if(!elements.has(match[1]))elements.set(match[1],new Element());}
    get innerHTML(){return this._html;}
    set textContent(value){this._text=String(value);this._html='';}
    get textContent(){return this._text;}
    querySelectorAll(){return [];}
  }
  const previousDocument=globalThis.document,previousTimer=globalThis.setTimeout;
  globalThis.document={getElementById:id=>elements.get(id)||null};
  globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0;};
  t.after(()=>{globalThis.document=previousDocument;globalThis.setTimeout=previousTimer;});
  let selection={key:'US:AAPL:settings1',symbol:'AAPL',market:'US',name:'Apple Inc.',currency:'USD',canLoad:true,mode:'swing',strategy:{name:'Balanced technical'}};
  const calls=[],requests=[],downloads=[],reports=[];
  const deps={getSelection:()=>selection,fetchMarket:async(_selection,timeframe)=>{requests.push(timeframe);return fixture(timeframe);},analyseFrame:bars=>analyse(bars),evaluateDaily:bars=>evaluateAccumulation(bars),sizePlans:analysis=>analysis.plans.map(plan=>({...plan,position:sizePosition(plan,DEFAULT_SETTINGS,'USD',1)})),buildReport:input=>{const result=buildDeepReport(input);reports.push(result);return result;},getAIStatus:async()=>({ready:true,message:'AI available.',model:'configured/model'}),sendAI:async value=>{calls.push(value);return {answer:'Review this evidence.',model:'configured/model',generatedAt:new Date().toISOString()};},download:(...args)=>downloads.push(args),...overrides};
  const root=new Element(),workspace=mountResearchWorkspace(root,deps);
  return {root,get:id=>elements.get(id),workspace,calls,requests,downloads,reports,setSelection:value=>{selection={...selection,...value};}};
}

test('AI context strips all position quantities, budgets and cost models without mutating report',()=>{
  const original=evidence(),before=JSON.stringify(original),context=researchAiContext(original);
  assert.ok(original.frames[0].plans[0].sizing);assert.equal(context.kind,'stock');assert.equal(context.frames[0].plans[0].sizing,undefined);assert.equal(JSON.stringify(original),before);
  const sent=JSON.stringify(context);assert.doesNotMatch(sent,/"(?:qty|riskLimit|budget|estimatedLoss|cost|netRewardRisk|capital|riskPct|gatewayAccessCode|journal)"/);
  assert.equal(context.frames[0].plans[0].entry,original.frames[0].plans[0].entry);assert.equal(context.frames[0].provider,'yahoo');assert.equal(context.frames[0].completedCandles,true);assert.ok(context.evidence.length);
  context.frames[0].plans[0].entry=0;assert.notEqual(original.frames[0].plans[0].entry,0);
});

test('AI context handles zero-quantity positions and unavailable sizing without inventing risk',()=>{
  const original=evidence();original.frames[0].plans[0].sizing={qty:0,estimatedLoss:0,budget:0};original.frames[0].plans[1].sizing=null;
  const context=researchAiContext(original);assert.ok(context.frames[0].plans.every(plan=>!Object.hasOwn(plan,'sizing')));assert.equal(original.frames[0].plans[0].sizing.qty,0);
});

test('mount performs no network requests and requires an explicit report action',t=>{
  const ui=mount(t);assert.deepEqual(ui.requests,[]);assert.deepEqual(ui.calls,[]);assert.equal(ui.get('askResearchAI').disabled,true);assert.equal(ui.get('exportDeepResearch').disabled,true);
  assert.match(ui.get('deepSelection').textContent,/AAPL/);assert.match(ui.root.innerHTML,/No deep report/);
});

test('building a report loads three timeframes sequentially without automatically calling AI',async t=>{
  const order=[];let active=0,maximum=0;
  const ui=mount(t,{fetchMarket:async(_selection,timeframe)=>{active++;maximum=Math.max(maximum,active);order.push(timeframe);await new Promise(resolve=>setImmediate(resolve));active--;return fixture(timeframe);}});
  await ui.workspace.run();assert.deepEqual(order,['1day','4h','1h']);assert.equal(maximum,1);assert.equal(ui.reports[0].status,'complete');assert.match(ui.get('deepProgress').textContent,/3\/3/);assert.equal(ui.get('exportDeepResearch').disabled,false);assert.equal(ui.get('askResearchAI').disabled,true);assert.deepEqual(ui.calls,[]);
  await ui.get('checkResearchAI').onclick();assert.equal(ui.get('askResearchAI').disabled,false);assert.deepEqual(ui.calls,[]);
});

test('a rate-limit response preserves prior valid evidence and stops remaining requests',async t=>{
  const intervals=[];
  const ui=mount(t,{fetchMarket:async(_selection,timeframe)=>{intervals.push(timeframe);if(timeframe==='4h')throw Object.assign(new Error('Provider rate limit reached.'),{status:429});return fixture(timeframe);}});
  await ui.workspace.run();assert.deepEqual(intervals,['1day','4h']);assert.equal(ui.reports[0].status,'partial');assert.equal(ui.reports[0].counts.available,1);assert.equal(ui.reports[0].frames[1].status,'error');assert.equal(ui.reports[0].frames[2].status,'unavailable');assert.match(ui.get('deepProgress').textContent,/Paused/);assert.match(ui.get('deepReport').innerHTML,/rate limit/);
});

test('selection changes during loading prevent old report publication and export',async t=>{
  const pending=deferred();let calls=0;
  const ui=mount(t,{fetchMarket:async()=>{calls++;return pending.promise;}});
  const running=ui.workspace.run();ui.setSelection({key:'US:MSFT:settings1',symbol:'MSFT'});ui.workspace.refresh();pending.resolve(fixture());await running;
  assert.equal(calls,1);assert.equal(ui.reports.length,0);assert.equal(ui.get('exportDeepResearch').disabled,true);assert.match(ui.get('deepProgress').textContent,/Selection changed/);assert.doesNotMatch(ui.get('deepReport').innerHTML,/AAPL/);
});

test('pause retains the completed in-flight timeframe and makes no further requests',async t=>{
  const pending=deferred();let calls=0;
  const ui=mount(t,{fetchMarket:async()=>{calls++;return pending.promise;}});
  const running=ui.workspace.run();ui.get('stopDeepResearch').onclick();pending.resolve(fixture());await running;
  assert.equal(calls,1);assert.equal(ui.reports[0].counts.available,1);assert.match(ui.get('deepProgress').textContent,/Paused/);assert.equal(ui.get('runDeepResearch').disabled,false);
});

test('AI submission is explicit, omits position sizes and renders model text literally',async t=>{
  let sent;
  const ui=mount(t,{sendAI:async value=>{sent=value;return {answer:'<img src=x onerror=alert(1)>',model:'configured/model',generatedAt:'2026-10-30T04:00:00Z'};}});
  await ui.workspace.run();await ui.get('checkResearchAI').onclick();ui.get('researchQuestion').value='Challenge the thesis.';await ui.get('askResearchAI').onclick();
  assert.equal(sent.question,'Challenge the thesis.');assert.equal(sent.context.kind,'stock');assert.ok(sent.context.frames.every(frame=>frame.plans.every(plan=>!Object.hasOwn(plan,'sizing'))));assert.match(ui.get('researchAIAnswer').textContent,/<img src=x/);assert.equal(ui.get('researchAIAnswer').innerHTML,'');assert.match(ui.get('researchAIAnswer').textContent,/no live web/);
});

test('late AI answers are discarded after the selection changes',async t=>{
  const pending=deferred();
  const ui=mount(t,{sendAI:async()=>pending.promise});await ui.workspace.run();await ui.get('checkResearchAI').onclick();
  const asking=ui.get('askResearchAI').onclick();ui.setSelection({key:'US:MSFT:settings1',symbol:'MSFT'});ui.workspace.refresh();pending.resolve({answer:'OLD_AAPL_ANSWER',model:'configured/model',generatedAt:new Date().toISOString()});await asking;
  assert.doesNotMatch(ui.get('researchAIAnswer').textContent,/OLD_AAPL_ANSWER/);assert.match(ui.get('researchAIAnswer').textContent,/Build a new report/);assert.equal(ui.get('askResearchAI').disabled,true);
});

test('unavailable selections do not start provider requests or export a report',async t=>{
  const ui=mount(t);ui.setSelection({canLoad:false,unavailableReason:'Select an ordinary stock or ETF first.'});await ui.workspace.run();assert.equal(ui.requests.length,0);assert.equal(ui.reports.length,0);assert.match(ui.get('deepProgress').textContent,/ordinary stock/);
});

test('late AI setup checks cannot enable a different gateway connection',async t=>{
  const pending=deferred(),ui=mount(t,{getAIStatus:async()=>pending.promise});
  ui.setSelection({connectionKey:'gateway1:code1'});ui.workspace.refresh();await ui.workspace.run();const checking=ui.get('checkResearchAI').onclick();
  ui.setSelection({key:'US:AAPL:settings2',connectionKey:'gateway2:code2'});ui.workspace.refresh();pending.resolve({ready:true,message:'Old gateway ready.',model:'old/model'});await checking;
  assert.equal(ui.get('askResearchAI').disabled,true);assert.doesNotMatch(ui.get('researchAIStatus').textContent,/Old gateway ready/);assert.equal(ui.calls.length,0);
});

test('currency labels are escaped and zero-position reward/risk stays unavailable',async t=>{
  const ui=mount(t,{sizePlans:analysis=>analysis.plans.map(plan=>({...plan,position:{qty:0,riskLimit:0,budget:0,estimatedLoss:0,cost:0,rr1:null,rr2:null,message:'No position fits the configured caps.'}}))});
  ui.setSelection({currency:'<b>untrusted</b>'});await ui.workspace.run();const rendered=ui.get('deepReport').innerHTML;
  assert.match(rendered,/&lt;b&gt;untrusted&lt;\/b&gt;/);assert.doesNotMatch(rendered,/<b>untrusted<\/b>/);assert.match(rendered,/Maximum modelled units: 0/);assert.doesNotMatch(rendered,/NaN|Infinity/);assert.match(rendered,/No position fits/);
});
