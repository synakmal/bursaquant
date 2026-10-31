import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/holdings-model.js';
import {HOLDING_STYLES,reviewHolding} from '../src/holding-review.js';
import {analyse} from '../src/engine.js';
import {createHoldingsController,mountHoldingsWorkspace} from '../src/holdings-ui.js';

const today='2026-11-01';
const lot=(changes={})=>({symbol:'1155',market:'MY',assetType:'Stock',tradeType:'actual',entryDate:'2020-01-02',entryPrice:10,quantity:100,entryFees:8,style:'swing',stopPrice:9,target1:12,target2:14,initialStopPrice:9,thesis:'A testable hypothesis.',notes:'',...changes});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function setup(overrides={}){
  const values=new Map(),requests=[],received=[];let connection='gateway1',storageFails=false;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(storageFails)throw new Error('quota');values.set(key,value);}};
  const deps={model,styles:HOLDING_STYLES,storage,today:()=>today,getConnectionKey:()=>connection,canFetch:()=>true,wait:async()=>{},fetchMarket:async(position,timeframe)=>{requests.push({position,timeframe});return {bars:[{close:11}],meta:{provider:'yahoo',interval:timeframe}};},analyseFrame:(_bars,style)=>({style}),reviewHolding:input=>{received.push(input);return {classification:'hold_conditions',label:'Technical hold conditions intact',summary:'Conditions are conditional.',generatedAt:input.generatedAt,style:HOLDING_STYLES[input.position.style],priceReference:{price:11,timeframe:'1day',lastCandle:'2026-10-29T01:00:00Z',provider:'yahoo',timezone:'Asia/Kuala_Lumpur',completionInferred:true},frames:[],evidence:[],risks:[],nextChecks:[],plan:{stopPrice:input.position.stopPrice,target1:input.position.target1,target2:input.position.target2},coverage:{available:2,required:2}};},...overrides};
  const controller=createHoldingsController(deps);
  return {controller,deps,values,requests,received,setConnection:value=>{connection=value;},failStorage:()=>{storageFails=true;}};
}

test('controller starts empty without network and does not alter legacy journal records',()=>{
  const legacy='[{"symbol":"AAPL","quantity":2}]',values=new Map([['bq_trades',legacy]]),requests=[];
  const {controller}=setup({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},fetchMarket:async(...args)=>requests.push(args)});
  assert.equal(controller.getBook().positions.length,0);assert.equal(requests.length,0);
  controller.savePosition(lot());assert.equal(values.get('bq_trades'),legacy);assert.ok(values.has('bq_holdings_v1'));
});

test('buy records are normalised, persisted and survive a new controller',()=>{
  const s=setup(),saved=s.controller.savePosition(lot({symbol:'1155.KL',quantity:'100'}));
  assert.equal(saved.symbol,'1155');assert.equal(saved.quantity,100);assert.equal(saved.currency,'MYR');
  const next=createHoldingsController(s.deps);assert.deepEqual(next.getBook(),s.controller.getBook());
  const copy=next.getBook();copy.positions[0].quantity=1;assert.equal(next.getBook().positions[0].quantity,100);
});

test('storage failures leave previous holdings and pending form values unchanged',()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),before=JSON.stringify(s.controller.getBook());s.failStorage();
  assert.throws(()=>s.controller.savePosition({...saved,quantity:200}),/could not save/);
  assert.equal(JSON.stringify(s.controller.getBook()),before);
  assert.throws(()=>s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:10,price:11,fees:1}),/could not save/);
  assert.equal(JSON.stringify(s.controller.getBook()),before);
});

test('partial and full sales preserve the lot and allocate fees without overselling',()=>{
  const s=setup(),saved=s.controller.savePosition(lot());
  let position=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:40,price:12,fees:2});
  let totals=model.positionTotals(position);assert.equal(totals.remainingQuantity,60);assert.equal(totals.realizedPnl,74.8);assert.equal(totals.remainingEntryFees,4.8);
  const before=JSON.stringify(s.controller.getBook());assert.throws(()=>s.controller.recordExit(saved.id,{date:'2020-01-04',quantity:61,price:11,fees:2}),/exceeds/);assert.equal(JSON.stringify(s.controller.getBook()),before);
  position=s.controller.recordExit(saved.id,{date:'2020-01-04',quantity:60,price:9,fees:2});totals=model.positionTotals(position);assert.equal(totals.status,'closed');assert.equal(totals.realizedPnl,8);assert.equal(position.exits.length,2);assert.equal(s.controller.getBook().positions.length,1);
});

test('sale corrections preserve IDs, reopen a closed lot and reject overselling atomically',()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),closed=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:100,price:11,fees:2}),exit=closed.exits[0];
  const corrected=s.controller.updateExit(saved.id,exit.id,{id:'replacement_must_not_win',date:'2020-01-04',quantity:40,price:12,fees:2});
  assert.equal(corrected.exits.length,1);assert.equal(corrected.exits[0].id,exit.id);assert.equal(corrected.exits[0].date,'2020-01-04');assert.equal(model.positionTotals(corrected).remainingQuantity,60);assert.equal(model.positionTotals(corrected).realizedPnl,74.8);
  const before=JSON.stringify(s.controller.getBook());assert.throws(()=>s.controller.updateExit(saved.id,exit.id,{date:'2020-01-05',quantity:101,price:11,fees:2}),/exceeds/);assert.equal(JSON.stringify(s.controller.getBook()),before);
  assert.throws(()=>s.controller.updateExit(saved.id,'missing',{date:'2020-01-05',quantity:1,price:11,fees:0}),/existing sale/);assert.equal(JSON.stringify(s.controller.getBook()),before);
});

test('undoing a sale restores its quantity and entry-fee balance without broker activity',()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),sold=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:40,price:12,fees:2});
  const restored=s.controller.removeExit(saved.id,sold.exits[0].id),totals=model.positionTotals(restored);
  assert.equal(restored.exits.length,0);assert.equal(totals.remainingQuantity,100);assert.equal(totals.realizedPnl,0);assert.equal(totals.remainingEntryFees,8);assert.equal(s.requests.length,0);
  assert.throws(()=>s.controller.removeExit(saved.id,sold.exits[0].id),/existing sale/);
});

test('failed sale corrections and undo writes preserve the old record',()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),sold=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:40,price:12,fees:2}),before=JSON.stringify(s.controller.getBook());s.failStorage();
  assert.throws(()=>s.controller.updateExit(saved.id,sold.exits[0].id,{date:'2020-01-04',quantity:30,price:11,fees:1}),/could not save/);assert.equal(JSON.stringify(s.controller.getBook()),before);
  assert.throws(()=>s.controller.removeExit(saved.id,sold.exits[0].id),/could not save/);assert.equal(JSON.stringify(s.controller.getBook()),before);
});

test('entry history locks after sales while style and protective plan remain editable',()=>{
  const s=setup(),saved=s.controller.savePosition(lot());
  const sold=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:10,price:11,fees:1});
  for(const update of [{quantity:200},{entryPrice:9},{entryDate:'2020-01-01'},{entryFees:0},{tradeType:'paper'},{initialStopPrice:8}])assert.throws(()=>s.controller.savePosition({...sold,...update}),/cannot be changed/);
  const edited=s.controller.savePosition({...sold,style:'long',stopPrice:10.5,target1:13,exits:[]});
  assert.equal(edited.exits.length,1);assert.equal(edited.stopPrice,10.5);assert.equal(edited.initialStopPrice,9);assert.equal(edited.style,'long');
});

test('an omitted original stop stays unknown and is never rewritten by a current-stop edit',()=>{
  const s=setup(),saved=s.controller.savePosition(lot({initialStopPrice:null}));
  assert.equal(saved.initialStopPrice,null);
  const edited=s.controller.savePosition({...saved,stopPrice:10.5,initialStopPrice:10});assert.equal(edited.initialStopPrice,null);
});

test('import skips identical IDs and rejects conflicting IDs atomically',()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),backup=s.controller.exportBackup();
  assert.deepEqual(s.controller.importBackup(backup),{added:0,skipped:1});
  const conflict=JSON.stringify({schemaVersion:1,positions:[{...saved,quantity:200}]});
  assert.throws(()=>s.controller.importBackup(conflict),/same ID/);assert.equal(s.controller.getBook().positions[0].quantity,100);
  const other=JSON.stringify({schemaVersion:1,positions:[{...saved,id:'other_lot',symbol:'1023'}]});assert.equal(s.controller.importBackup(other).added,1);assert.equal(s.controller.getBook().positions.length,2);
});

test('unreadable stored data is preserved and needs an explicit replacement import',()=>{
  const raw='{broken',values=new Map([['bq_holdings_v1',raw]]),s=setup({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
  assert.match(s.controller.getState().loadError,/could not be read/);assert.equal(s.controller.exportBackup(),raw);assert.throws(()=>s.controller.savePosition(lot()),/could not be read/);assert.equal(values.get('bq_holdings_v1'),raw);
  const backup=JSON.stringify({schemaVersion:1,positions:[]});assert.throws(()=>s.controller.importBackup(backup),/could not be read/);s.controller.importBackup(backup,{replaceUnreadable:true});assert.equal(s.controller.getState().loadError,'');assert.deepEqual(JSON.parse(values.get('bq_holdings_v1')).positions,[]);
});

test('analysis fetches only the ticker/market and chosen style frames in sequence',async()=>{
  const s=setup(),saved=s.controller.savePosition(lot({style:'long',notes:'Private account note'}));
  const report=await s.controller.analysePosition(saved.id);
  assert.equal(report.classification,'hold_conditions');assert.deepEqual(s.requests.map(r=>r.timeframe),['1day','1week']);
  assert.deepEqual(s.requests[0].position,{symbol:'1155',market:'MY'});assert.doesNotMatch(JSON.stringify(s.requests),/entryPrice|quantity|Private|notes|stopPrice/);
  assert.equal(s.received[0].frames[0].analysis.style,'invest');assert.ok(s.controller.getReview(saved.id));
});

test('review timestamps use the injected clock and expire exactly after thirty minutes',async()=>{
  let clock=Date.parse('2026-11-01T02:00:00Z');const s=setup({now:()=>clock}),saved=s.controller.savePosition(lot());
  await s.controller.analysePosition(saved.id);assert.equal(s.controller.getReview(saved.id).generatedAt,'2026-11-01T02:00:00.000Z');assert.equal(saved.createdAt,'2026-11-01T02:00:00.000Z');
  clock+=30*60000-1;assert.ok(s.controller.getReview(saved.id));clock++;assert.equal(s.controller.getReview(saved.id),null);assert.equal(s.requests.length,2);assert.equal(s.controller.getBook().positions.length,1);
});

test('real market-analysis and holding-review modules integrate with the manual lot controller',async()=>{
  const clock=Date.parse('2026-11-01T12:00:00Z'),s=setup({now:()=>clock,fetchMarket:async(_position,timeframe)=>{
    const end=Date.parse('2026-10-30T01:00:00Z')/1000,step=timeframe==='1day'?86400:14400;
    const bars=Array.from({length:230},(_,i)=>({time:end-(229-i)*step,open:19+i/230,high:20+i/230,low:18+i/230,close:19.1+i/230,volume:100000+i}));
    return {bars,meta:{provider:'yahoo',symbol:'1155.KL',currency:'MYR',interval:timeframe,completedCandles:true,timezone:'Asia/Kuala_Lumpur',fetchedAt:'2026-11-01T11:00:00Z'}};
  },analyseFrame:(bars,style)=>analyse(bars,style),reviewHolding}),saved=s.controller.savePosition(lot({stopPrice:21,target1:25,target2:30}));
  const report=await s.controller.analysePosition(saved.id);assert.equal(report.classification,'stop_breached');assert.equal(report.priceReference.timeframe,'1day');assert.equal(report.priceReference.completionInferred,true);assert.ok(report.evidence.some(value=>value.includes('100 shares')));assert.equal(s.controller.getBook().positions[0].exits.length,0);
});

test('correcting or undoing a sale invalidates previously reviewed quantities and P/L',async()=>{
  const s=setup(),saved=s.controller.savePosition(lot()),sold=s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:40,price:12,fees:2});
  await s.controller.analysePosition(saved.id);assert.ok(s.controller.getReview(saved.id));s.controller.updateExit(saved.id,sold.exits[0].id,{date:'2020-01-03',quantity:30,price:12,fees:2});assert.equal(s.controller.getReview(saved.id),null);
  await s.controller.analysePosition(saved.id);assert.ok(s.controller.getReview(saved.id));s.controller.removeExit(saved.id,sold.exits[0].id);assert.equal(s.controller.getReview(saved.id),null);
});

test('a new request clears old conclusions and preserves failed-frame evidence without fallback',async()=>{
  let failed=false;const s=setup({fetchMarket:async(_p,timeframe)=>{if(failed)throw new Error('No data');return {bars:[{close:11}],meta:{provider:'yahoo',interval:timeframe}};}}),saved=s.controller.savePosition(lot());
  await s.controller.analysePosition(saved.id);assert.ok(s.controller.getReview(saved.id));failed=true;
  const running=s.controller.analysePosition(saved.id);assert.equal(s.controller.getReview(saved.id),null);await running;
  assert.equal(s.received[1].frames.length,2);assert.ok(s.received[1].frames.every(frame=>frame.error==='No data'));assert.ok(s.received[1].frames.every(frame=>!frame.bars));
});

test('a rejected gateway check clears the previous holding conclusion before reporting the failure',async()=>{
  let available=true;const s=setup({canFetch:()=>({ready:available,message:'Reconnect gateway'})}),saved=s.controller.savePosition(lot());
  await s.controller.analysePosition(saved.id);assert.ok(s.controller.getReview(saved.id));available=false;
  await assert.rejects(s.controller.analysePosition(saved.id),/Reconnect gateway/);assert.equal(s.controller.getReview(saved.id),null);assert.equal(s.requests.length,2);
});

test('provider rate limits stop further frame requests',async()=>{
  let calls=0;const s=setup({fetchMarket:async()=>{calls++;throw Object.assign(new Error('Pause'),{status:429});}}),saved=s.controller.savePosition(lot());
  await s.controller.analysePosition(saved.id);assert.equal(calls,1);assert.equal(s.received[0].frames[0].error,'Pause');
});

test('connection changes discard in-flight and previously completed reviews',async()=>{
  const pending=deferred(),s=setup(),saved=s.controller.savePosition(lot());await s.controller.analysePosition(saved.id);assert.ok(s.controller.getReview(saved.id));
  s.deps.fetchMarket=()=>pending.promise;const review=s.controller.analysePosition(saved.id);s.setConnection('gateway2');s.controller.refresh();pending.resolve({bars:[{close:11}],meta:{}});
  assert.equal(await review,null);assert.equal(s.controller.getReview(saved.id),null);assert.equal(s.controller.getState().active,null);
});

test('style edits or recorded sales discard an older in-flight review',async()=>{
  for(const action of ['style','sale']){
    const pending=deferred(),s=setup({fetchMarket:()=>pending.promise}),saved=s.controller.savePosition(lot());const review=s.controller.analysePosition(saved.id);
    if(action==='style')s.controller.setStyle(saved.id,'long');else s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:100,price:11,fees:1});
    pending.resolve({bars:[{close:11}],meta:{}});assert.equal(await review,null);assert.equal(s.received.length,0);assert.equal(s.controller.getReview(saved.id),null);
  }
});

test('closed lots, missing gateways and simultaneous reviews cannot start extra data calls',async()=>{
  const pending=deferred(),s=setup({fetchMarket:()=>pending.promise}),saved=s.controller.savePosition(lot());
  const first=s.controller.analysePosition(saved.id);await assert.rejects(s.controller.analysePosition(saved.id),/current holding review/);s.setConnection('new');pending.resolve({bars:[],meta:{}});await first;
  s.controller.recordExit(saved.id,{date:'2020-01-03',quantity:100,price:11,fees:1});await assert.rejects(s.controller.analysePosition(saved.id),/closed/);
  const disconnected=setup({canFetch:()=>({ready:false,message:'Configure gateway'})}),open=disconnected.controller.savePosition(lot());await assert.rejects(disconnected.controller.analysePosition(open.id),/Configure gateway/);assert.equal(disconnected.requests.length,0);
});

// Minimal DOM double: state/render behaviour, not layout or HTML constraints.
function mount(t,overrides={}){
  const nodes=new Map();
  class Element{
    constructor(){this._value='';this._html='';this._text='';this.disabled=false;this.dataset={};this.handlers={};const classes=new Set();this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)};}
    set value(value){this._value=String(value);}get value(){return this._value;}
    set innerHTML(value){this._html=String(value);for(const match of this._html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){if(!nodes.has(match[1]))nodes.set(match[1],new Element());for(const value of (match[0].match(/\bclass="([^"]*)"/)?.[1]||'').split(/\s+/).filter(Boolean))nodes.get(match[1]).classList.add(value);}}get innerHTML(){return this._html;}
    set textContent(value){this._text=String(value);}get textContent(){return this._text;}
    addEventListener(name,fn){this.handlers[name]=fn;}contains(){return true;}click(){}scrollIntoView(){}
  }
  const previous=globalThis.document;globalThis.document={getElementById:id=>nodes.get(id)||null,createElement:()=>new Element()};t.after(()=>{globalThis.document=previous;});
  const s=setup(overrides),root=new Element(),workspace=mountHoldingsWorkspace(root,s.deps);
  return {...s,root,workspace,get:id=>nodes.get(id)};
}

test('workspace boots without requests and exposes manual record/backup controls',t=>{
  const s=mount(t);assert.match(s.root.innerHTML,/Record buy \/ holding/);assert.match(s.get('holdingsRows').innerHTML,/No open holdings/);assert.equal(s.requests.length,0);assert.ok(s.get('holdingsImport'));assert.ok(s.get('holdingExitForm'));
});

test('workspace keeps actual/paper and MYR/USD totals separate and escapes research notes',t=>{
  const s=mount(t);s.workspace.controller.savePosition(lot({thesis:'<img src=x onerror=alert(1)>',notes:'<script>secret</script>'}));s.workspace.controller.savePosition(lot({symbol:'AAPL',market:'US',tradeType:'paper'}));
  const stats=s.get('holdingsStats').innerHTML;assert.match(stats,/MYR · Actual/);assert.match(stats,/USD · Paper/);assert.doesNotMatch(stats,/Mixed/);
  assert.match(s.get('holdingHistory').innerHTML,/&lt;img/);assert.doesNotMatch(s.get('holdingHistory').innerHTML,/<script>/);
});

test('manual submit preserves unsaved fields when storage rejects the save',t=>{
  let failed=false;const values=new Map(),s=mount(t,{storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(failed)throw new Error('quota');values.set(key,value);}}});
  for(const [id,value]of Object.entries({holdingSymbol:'1155',holdingEntryDate:'2020-01-02',holdingEntryPrice:'10',holdingQuantity:'100',holdingEntryFees:'8'}))s.get(id).value=value;
  failed=true;s.get('holdingEntryForm').onsubmit({preventDefault(){}});
  assert.equal(s.workspace.getBook().positions.length,0);assert.equal(s.get('holdingQuantity').value,'100');assert.match(s.get('holdingsStatus').textContent,/could not save/);
});

test('expired reviews and their quotes disappear on refresh without a network request',async t=>{
  let clock=Date.parse('2026-11-01T02:00:00Z');const s=mount(t,{now:()=>clock}),saved=s.workspace.controller.savePosition(lot());
  await s.workspace.controller.analysePosition(saved.id);assert.match(s.get('holdingsRows').innerHTML,/MYR 11/);
  const requests=s.requests.length;clock+=30*60000;s.workspace.refresh();assert.match(s.get('holdingsRows').innerHTML,/No reviewed quote/);assert.match(s.get('holdingsRows').innerHTML,/Analyse to obtain a dated close/);assert.equal(s.requests.length,requests);
});

function action(target){return {target:{dataset:target,closest(){return this;}}};}

test('sale editor corrects an existing sale and requires two explicit steps to undo it',t=>{
  const s=mount(t),saved=s.workspace.controller.savePosition(lot()),sold=s.workspace.controller.recordExit(saved.id,{date:'2020-01-03',quantity:100,price:11,fees:2}),saleId=sold.exits[0].id;
  s.root.handlers.click(action({holdingAction:'correct-sale',id:saved.id,exitId:saleId}));
  assert.equal(s.get('holdingExitMode').value,saleId);assert.equal(s.get('holdingExitQuantity').value,'100');assert.equal(s.get('holdingExitSave').textContent,'Save sale correction');assert.equal(s.get('holdingExitEditor').classList.contains('hidden'),false);
  s.get('holdingExitQuantity').value='40';s.get('holdingExitPrice').value='12';s.get('holdingExitForm').onsubmit({preventDefault(){}});
  assert.equal(s.workspace.getBook().positions[0].exits[0].id,saleId);assert.equal(model.positionTotals(s.workspace.getBook().positions[0]).remainingQuantity,60);assert.match(s.get('holdingsStatus').textContent,/correction saved/);
  s.root.handlers.click(action({holdingAction:'correct-sale',id:saved.id,exitId:saleId}));s.get('holdingUndoSale').onclick();
  assert.equal(s.get('holdingUndoPanel').classList.contains('hidden'),false);assert.equal(s.workspace.getBook().positions[0].exits.length,1);assert.match(s.get('holdingUndoMessage').textContent,/does not cancel a broker trade/);
  s.get('holdingCancelUndo').onclick();assert.equal(s.workspace.getBook().positions[0].exits.length,1);assert.equal(s.get('holdingUndoPanel').classList.contains('hidden'),true);
  s.get('holdingUndoSale').onclick();s.get('holdingConfirmUndo').onclick();assert.equal(s.workspace.getBook().positions[0].exits.length,0);assert.equal(model.positionTotals(s.workspace.getBook().positions[0]).remainingQuantity,100);
});

test('sale editor rejects blank monetary fields instead of recording an unknown price as zero',t=>{
  const s=mount(t),saved=s.workspace.controller.savePosition(lot());s.root.handlers.click(action({holdingAction:'sell',id:saved.id}));
  s.get('holdingExitPrice').value='';s.get('holdingExitForm').onsubmit({preventDefault(){}});assert.equal(s.workspace.getBook().positions[0].exits.length,0);assert.match(s.get('holdingsStatus').textContent,/Sale price is required/);
});
