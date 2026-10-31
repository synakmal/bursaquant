// Manual holdings stay in browser storage. Only symbol/market leave for candles.
const HOLDINGS_STORAGE_KEY='bq_holdings_v1';
const holdingsEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const holdingsNumber=(value,places=2)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:places}):'Unavailable';
const holdingsMoney=(value,currency)=>`${holdingsEscape(currency)} ${holdingsNumber(value,Number.isFinite(value)&&Math.abs(value)<1?4:2)}`;
const holdingsCopy=value=>JSON.parse(JSON.stringify(value));
const holdingsId=()=>globalThis.crypto?.randomUUID?.()||'holding_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
const holdingsToday=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** Controller is also usable without the DOM for persistence/race verification. */
export function createHoldingsController(deps){
  const model=deps.model,storage=deps.storage||globalThis.localStorage;
  const wait=deps.wait||((delay)=>new Promise(resolve=>setTimeout(resolve,delay)));
  const now=()=>deps.now?.()??Date.now();
  const timestamp=()=>new Date(now()).toISOString();
  let book={schemaVersion:1,positions:[]},loadError='',unreadable='',listener=()=>{},active=null,sequence=0;
  const reviews=new Map();
  let connection=String(deps.getConnectionKey?.()||'');
  const today=()=>deps.today?.()||holdingsToday();
  const validate=value=>model.validateHoldingsBook(value,{today:today()});
  try{const raw=storage?.getItem(HOLDINGS_STORAGE_KEY);if(raw){unreadable=raw;book=model.parseHoldingsBackup(raw,{today:today()});unreadable='';}}
  catch{loadError='Saved holdings could not be read. Export a rescue copy before replacing this data with a valid backup.';}
  const emit=()=>listener();
  const position=id=>book.positions.find(item=>item.id===id);
  const fingerprint=item=>JSON.stringify(item);
  function invalidate(id){reviews.delete(id);if(active?.id===id)active.cancelled=true;}
  function commit(next,{replaceUnreadable=false}={}){
    if(loadError&&!replaceUnreadable)throw new Error(loadError);
    const clean=validate(next),encoded=model.serializeHoldingsBook(clean);
    if(!storage?.setItem)throw new Error('Browser storage is unavailable. The record has not been saved.');
    try{storage.setItem(HOLDINGS_STORAGE_KEY,encoded);}catch{throw new Error('Browser storage could not save this change. Export a backup or free space; the previous records remain unchanged.');}
    for(const [id,value]of reviews)if(!clean.positions.some(item=>item.id===id&&fingerprint(item)===value.fingerprint))invalidate(id);
    if(active&&!clean.positions.some(item=>item.id===active.id&&fingerprint(item)===active.fingerprint))active.cancelled=true;
    book=clean;loadError='';unreadable='';emit();return holdingsCopy(clean);
  }
  function savePosition(input){
    const existing=input.id?position(input.id):null;
    if(input.id&&!existing)throw new Error('This holding no longer exists. Start a new record.');
    if(existing?.exits.length){
      for(const key of ['symbol','market','assetType','tradeType','entryDate','entryPrice','quantity','entryFees','initialStopPrice'])if(input[key]!==undefined&&String(input[key]??'')!==String(existing[key]??''))throw new Error('Entry details cannot be changed after a sale. Keep this lot’s history and record another buy as a separate holding.');
    }
    const savedAt=timestamp(),candidate={...existing,...input,id:existing?.id||holdingsId(),exits:existing?.exits||[],initialStopPrice:existing?existing.initialStopPrice:(input.initialStopPrice??null),createdAt:existing?.createdAt||savedAt,updatedAt:savedAt};
    const clean=model.validatePosition(candidate,{today:today()});
    commit({schemaVersion:1,positions:existing?book.positions.map(item=>item.id===clean.id?clean:item):[clean,...book.positions]});
    invalidate(clean.id);emit();return holdingsCopy(clean);
  }
  function recordExit(id,input){
    const existing=position(id);if(!existing)throw new Error('Choose an existing holding.');
    const exit={...input,id:holdingsId()},candidate=model.validatePosition({...existing,exits:[...existing.exits,exit],updatedAt:timestamp()},{today:today()});
    commit({schemaVersion:1,positions:book.positions.map(item=>item.id===id?candidate:item)});invalidate(id);emit();return holdingsCopy(candidate);
  }
  function updateExit(id,exitId,input){
    const existing=position(id);if(!existing||!existing.exits.some(exit=>exit.id===exitId))throw new Error('Choose an existing sale record.');
    const candidate=model.validatePosition({...existing,exits:existing.exits.map(exit=>exit.id===exitId?{...input,id:exit.id}:exit),updatedAt:timestamp()},{today:today()});
    commit({schemaVersion:1,positions:book.positions.map(item=>item.id===id?candidate:item)});invalidate(id);emit();return holdingsCopy(candidate);
  }
  function removeExit(id,exitId){
    const existing=position(id);if(!existing||!existing.exits.some(exit=>exit.id===exitId))throw new Error('Choose an existing sale record.');
    const candidate=model.validatePosition({...existing,exits:existing.exits.filter(exit=>exit.id!==exitId),updatedAt:timestamp()},{today:today()});
    commit({schemaVersion:1,positions:book.positions.map(item=>item.id===id?candidate:item)});invalidate(id);emit();return holdingsCopy(candidate);
  }
  function importBackup(text,options={}){
    const incoming=model.parseHoldingsBackup(text,{today:today()}),next=[...book.positions];let added=0,skipped=0;
    for(const item of incoming.positions){const current=next.find(existing=>existing.id===item.id);if(current){if(fingerprint(current)!==fingerprint(item))throw new Error('A backup record has the same ID but different values. No records were imported; keep both backups and resolve the conflict first.');skipped++;}else{next.push(item);added++;}}
    commit({schemaVersion:1,positions:next},options);return {added,skipped};
  }
  function refresh(){
    const next=String(deps.getConnectionKey?.()||'');
    if(next!==connection){connection=next;reviews.clear();if(active)active.cancelled=true;}
    emit();
  }
  async function analysePosition(id){
    refresh();if(active)throw new Error('Wait for the current holding review to finish.');
    const current=position(id);if(!current)throw new Error('Choose an existing holding.');
    const totals=model.positionTotals(current);if(totals.remainingQuantity<=0)throw new Error('This holding is closed. Its realised result is in Trade History.');
    reviews.delete(id);emit();
    const capability=deps.canFetch?.()??true;
    if(capability===false||capability?.ready===false)throw new Error(capability?.message||'Connect your personal data gateway in Risk & Data Settings first.');
    const profile=deps.styles[current.style];if(!profile)throw new Error('Choose a supported trading style.');
    const snapshot=holdingsCopy(current),request={id,sequence:++sequence,connection,fingerprint:fingerprint(current),cancelled:false,progress:'Loading completed candles…'};
    active=request;emit();const frames=[];
    const stillCurrent=()=>active===request&&!request.cancelled&&request.connection===String(deps.getConnectionKey?.()||'')&&fingerprint(position(id))===request.fingerprint;
    try{
      for(const timeframe of profile.timeframes){
        if(!stillCurrent())return null;
        request.progress=`Loading ${timeframe==='1day'?'daily':timeframe==='1week'?'weekly':timeframe.toUpperCase()} candles for ${snapshot.symbol}…`;emit();
        try{
          const data=await deps.fetchMarket({symbol:snapshot.symbol,market:snapshot.market},timeframe);
          if(!stillCurrent())return null;
          frames.push({timeframe,bars:data.bars,meta:data.meta,analysis:deps.analyseFrame(data.bars,profile.engineStyle)});
        }catch(error){frames.push({timeframe,error:String(error.message||'Provider data unavailable.').slice(0,350)});if(error.status===429)break;}
        if(frames.length<profile.timeframes.length)await wait(1500);
      }
      if(!stillCurrent())return null;
      const report=deps.reviewHolding({position:snapshot,totals,frames,generatedAt:timestamp()});
      reviews.set(id,{fingerprint:request.fingerprint,connection:request.connection,report});return holdingsCopy(report);
    }finally{if(active===request)active=null;emit();}
  }
  return {
    getBook:()=>holdingsCopy(book),getPosition:id=>position(id)?holdingsCopy(position(id)):null,
    getReview:id=>{const value=reviews.get(id),generated=Date.parse(value?.report?.generatedAt||'');if(!value)return null;if(!Number.isFinite(generated)||now()-generated>=30*60000||generated>now()+60000||value.connection!==String(deps.getConnectionKey?.()||'')||value.fingerprint!==fingerprint(position(id))){reviews.delete(id);return null;}return holdingsCopy(value.report);},
    getState:()=>({loadError,active:active?{id:active.id,progress:active.progress,cancelled:active.cancelled}:null}),
    savePosition,recordExit,updateExit,removeExit,importBackup,analysePosition,refresh,
    exportBackup:()=>unreadable||model.serializeHoldingsBook(book),
    subscribe:fn=>{listener=typeof fn==='function'?fn:()=>{};},
    setStyle:(id,style)=>{const existing=position(id);if(!existing)throw new Error('Choose an existing holding.');return savePosition({...existing,style});}
  };
}

export function mountHoldingsWorkspace(root,deps){
  const controller=createHoldingsController(deps),styles=deps.styles;
  let editingId='',exitId='',editingExitId='',reviewId='',message='',editorBaseline='';
  const e=id=>document.getElementById(id);
  const field=(id,label,{type='text',value='',min,max,step,required=false,wide=false}={})=>`<label${wide?' class="holding-wide"':''}>${label}<input id="${id}" type="${type}" value="${holdingsEscape(value)}"${min!==undefined?' min="'+min+'"':''}${max!==undefined?' max="'+max+'"':''}${step?' step="'+step+'"':''}${required?' required':''}${type==='text'?' maxlength="160"':''}/></label>`;
  const styleOptions=selected=>Object.values(styles).map(profile=>`<option value="${holdingsEscape(profile.id)}"${profile.id===selected?' selected':''}>${holdingsEscape(profile.label)}</option>`).join('');
  root.innerHTML=`<div class="card holdings-intro"><div class="card-title-row"><h3>My manually recorded holdings</h3><span class="badge badge-outline">Personal · browser only</span></div><p class="muted small">Record each buy as a separate lot. Quantities are individual shares or units, not Bursa board lots. Record partial or full sales against the same lot. Your broker remains the source of truth for executions.</p><div class="row-buttons"><button id="holdingsNew" class="btn primary">+ Record buy / holding</button><button id="holdingsExport" class="btn secondary">↓ Export holdings backup</button><label class="btn ghost holdings-file">↑ Import holdings backup<input id="holdingsImport" type="file" accept=".json,application/json"/></label></div><p id="holdingsStatus" class="holdings-status" role="status" aria-live="polite"></p><div id="holdingsRecovery"></div></div><div id="holdingsStats" class="holdings-summary"></div><div class="card space-top"><h3>Open holdings</h3><p class="muted small">Choose a style for each holding, then Analyse. Reviews use completed delayed candles and your saved protective stop and targets. Saved reviews expire after 30 minutes; refresh with Analyse to obtain a new review. A review does not submit an order.</p><div class="scroll-table"><table class="holdings-table"><thead><tr><th>Holding</th><th>Remaining / bought</th><th>Entry / remaining cost</th><th>Trading style</th><th>Last reviewed close / unrealised P/L</th><th>Actions</th></tr></thead><tbody id="holdingsRows"></tbody></table></div></div><div id="holdingEditor" class="card space-top"><div class="card-title-row"><h3 id="holdingEditorTitle">Record a buy / existing holding</h3><button id="holdingCancelEdit" class="btn sm ghost" type="button">Cancel editing</button></div><p class="muted small">Enter the actual execution date, price and fees from your broker. Use separate lots for later buys. Blank stop or target means it has not been defined. Original entry details lock after the first sale.</p><form id="holdingEntryForm" class="holdings-form">${field('holdingSymbol','Ticker · e.g. 1155 / AAPL',{required:true})}<label>Market<select id="holdingMarket"><option value="MY">Bursa Malaysia · MYR</option><option value="US">US · USD</option></select></label><label>Instrument<select id="holdingAssetType"><option value="Stock">Stock</option><option value="ETF">ETF</option></select></label><label>Record type<select id="holdingTradeType"><option value="actual">Actual trade</option><option value="paper">Paper trade</option></select></label>${field('holdingEntryDate','Buy date',{type:'date',required:true})}${field('holdingEntryPrice','Buy price per share',{type:'number',min:'0.000001',step:'any',required:true})}${field('holdingQuantity','Shares / units bought',{type:'number',min:1,step:1,required:true})}${field('holdingEntryFees','Total buy fees · quote currency',{type:'number',min:0,step:'any',value:0,required:true})}<label>Trading style<select id="holdingStyle">${styleOptions('swing')}</select></label>${field('holdingStop','Current protective stop · optional',{type:'number',min:'0.000001',step:'any'})}${field('holdingTarget1','Take-profit level 1 · optional',{type:'number',min:'0.000001',step:'any'})}${field('holdingTarget2','Take-profit level 2 · optional',{type:'number',min:'0.000001',step:'any'})}${field('holdingOriginalStop','Original stop at entry · optional',{type:'number',min:'0.000001',step:'any'})}<label class="holding-wide">Thesis / reason to hold<textarea id="holdingThesis" rows="2" maxlength="2000" placeholder="Why did you enter? What would invalidate the idea?"></textarea></label><label class="holding-wide">Notes<textarea id="holdingNotes" rows="2" maxlength="2000" placeholder="Broker execution details, conditions to monitor, lessons…"></textarea></label><div class="row-buttons holding-full"><button class="btn primary" type="submit" id="holdingSave">Save holding</button><span id="holdingEntryLock" class="muted small"></span></div></form></div><div id="holdingExitEditor" class="card space-top hidden"><h3 id="holdingExitTitle">Record a sale</h3><p class="muted small">Record only an actual or paper execution you made. Analysing a holding never records a sale automatically.</p><form id="holdingExitForm" class="holdings-form"><label class="holding-full">Sale entry<select id="holdingExitMode"><option value="">New sale</option></select></label>${field('holdingExitDate','Sale date',{type:'date',required:true})}${field('holdingExitQuantity','Shares / units sold',{type:'number',min:1,step:1,required:true})}${field('holdingExitPrice','Sale price per share',{type:'number',min:0,step:'any',required:true})}${field('holdingExitFees','Total sale fees · quote currency',{type:'number',min:0,step:'any',value:0,required:true})}<div class="row-buttons holding-full"><button class="btn primary" type="submit" id="holdingExitSave">Save sale</button><button id="holdingUndoSale" class="btn ghost hidden" type="button">Undo this sale record</button><button id="holdingCancelExit" class="btn ghost" type="button">Cancel</button></div></form><div id="holdingUndoPanel" class="holdings-undo hidden"><p id="holdingUndoMessage"></p><div class="row-buttons"><button id="holdingConfirmUndo" type="button" class="btn secondary">Confirm undo sale record</button><button id="holdingCancelUndo" type="button" class="btn ghost">Keep sale record</button></div></div></div><div id="holdingReview" class="space-top"></div><details class="card space-top"><summary class="holdings-detail-title">Recorded lots & sale history</summary><p class="muted small">Realised results allocate buy fees proportionally to sold shares and include recorded sale fees. Open-position P/L uses the reviewed historical close, includes remaining buy fees and excludes dividends, unknown future selling fees, taxes and FX costs.</p><div id="holdingHistory"></div></details>`;
  const entryIds={symbol:'holdingSymbol',market:'holdingMarket',assetType:'holdingAssetType',tradeType:'holdingTradeType',entryDate:'holdingEntryDate',entryPrice:'holdingEntryPrice',quantity:'holdingQuantity',entryFees:'holdingEntryFees',style:'holdingStyle',stopPrice:'holdingStop',target1:'holdingTarget1',target2:'holdingTarget2',initialStopPrice:'holdingOriginalStop',thesis:'holdingThesis',notes:'holdingNotes'};
  const numeric=new Set(['entryPrice','quantity','entryFees','stopPrice','target1','target2','initialStopPrice']);
  const entryLocked=['symbol','market','assetType','tradeType','entryDate','entryPrice','quantity','entryFees'];
  const editorFingerprint=()=>JSON.stringify(Object.values(entryIds).map(id=>e(id).value));
  const say=text=>{message=text;e('holdingsStatus').textContent=text;};
  const list=items=>(items||[]).length?`<ul>${items.map(value=>`<li>${holdingsEscape(value)}</li>`).join('')}</ul>`:'<p class="muted small">No additional evidence supplied.</p>';
  function resetEditor(){
    editingId='';for(const [key,id]of Object.entries(entryIds)){e(id).value=({market:'MY',assetType:'Stock',tradeType:'actual',style:'swing',entryFees:0,entryDate:holdingsToday()})[key]??'';e(id).disabled=false;}
    e('holdingEditorTitle').textContent='Record a buy / existing holding';e('holdingEntryLock').textContent='';e('holdingSave').textContent='Save holding';
    editorBaseline=editorFingerprint();
  }
  function beginDraft(input){
    if(editorFingerprint()!==editorBaseline){say('You have unsaved holding details. Save or cancel those edits before starting a holding from Stock Analysis.');e('holdingEditor').scrollIntoView?.({behavior:'smooth',block:'start'});return false;}
    if(!input||!['MY','US'].includes(input.market)||!['Stock','ETF'].includes(input.assetType)||!['short','swing','long'].includes(input.style)||!['actual','paper'].includes(input.tradeType)||typeof input.symbol!=='string'||!/^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(input.symbol))throw new Error('Choose a supported stock or ETF before adding a holding.');
    resetEditor();
    for(const key of ['symbol','market','assetType','style','tradeType'])e(entryIds[key]).value=input[key];
    // Chart prices and plans cannot establish an actual broker execution.
    for(const key of ['entryDate','entryPrice','quantity','entryFees','stopPrice','target1','target2','initialStopPrice','thesis','notes'])e(entryIds[key]).value='';
    exitId='';editingExitId='';e('holdingExitEditor').classList.add('hidden');e('holdingUndoPanel').classList.add('hidden');
    e('holdingEditorTitle').textContent=`New ${input.symbol} holding · enter broker details`;
    editorBaseline=editorFingerprint();
    say(input.tradeType==='paper'?'Paper draft opened from demo analysis. Enter and review the details before saving; no trade has been recorded.':'Holding draft opened from Stock Analysis. Enter the actual buy date, filled price, quantity and fees from your broker, then review and save.');
    e('holdingEditor').scrollIntoView?.({behavior:'smooth',block:'start'});e('holdingEntryDate').focus?.();return true;
  }
  function editPosition(id){
    const position=controller.getPosition(id);if(!position)return;
    editingId=id;for(const [key,fieldId]of Object.entries(entryIds)){e(fieldId).value=position[key]??'';e(fieldId).disabled=position.exits.length>0&&(entryLocked.includes(key)||key==='initialStopPrice');}
    // Original planned risk is a baseline, not a value to rewrite with each review.
    e('holdingOriginalStop').disabled=true;e('holdingEditorTitle').textContent=`Edit ${position.symbol} · plan and notes`;e('holdingEntryLock').textContent=position.exits.length?'Entry details are locked because sales have been recorded.':'Original stop is preserved; current stop and targets remain editable.';e('holdingSave').textContent='Save changes';
    editorBaseline=editorFingerprint();
    e('holdingEditor').scrollIntoView?.({behavior:'smooth',block:'start'});say('Editing saved holding. Reviews update only after you save and analyse again.');
  }
  function renderStats(book){
    const groups=new Map();
    for(const position of book.positions){const key=position.tradeType+':'+position.currency,group=groups.get(key)||{currency:position.currency,type:position.tradeType,open:0,realized:0,cost:0};const totals=deps.model.positionTotals(position);group.open+=totals.remainingQuantity>0?1:0;group.realized+=totals.realizedPnl;group.cost+=totals.remainingCostBasis;groups.set(key,group);}
    e('holdingsStats').innerHTML=[...groups.values()].map(group=>`<div class="card holdings-currency"><strong>${holdingsEscape(group.currency)} · ${group.type==='paper'?'Paper':'Actual'}</strong><div class="indicator-row"><span>Open lots</span><strong>${group.open}</strong></div><div class="indicator-row"><span>Remaining cost incl. buy fees</span><strong>${holdingsMoney(group.cost,group.currency)}</strong></div><div class="indicator-row"><span>Realised P/L after recorded fees</span><strong class="${group.realized>=0?'up':'down'}">${holdingsMoney(group.realized,group.currency)}</strong></div></div>`).join('');
  }
  function render(){
    const book=controller.getBook(),state=controller.getState();renderStats(book);
    e('holdingsStatus').textContent=state.loadError||message||'No broker connection. Records and backups stay in your browser.';
    e('holdingsRecovery').innerHTML=state.loadError?'<label class="holdings-recovery"><input type="checkbox" id="holdingReplaceUnreadable"/> I exported a rescue copy and want a valid imported backup to replace the unreadable saved data.</label>':'';
    const open=book.positions.filter(position=>deps.model.positionTotals(position).remainingQuantity>0);
    e('holdingsRows').innerHTML=open.length?open.map(position=>{
      const report=controller.getReview(position.id),quote=report?.priceReference?.price,totals=deps.model.positionTotals(position,{price:quote??null});
      const pnl=Number.isFinite(totals.unrealizedPnl)?`${holdingsMoney(totals.unrealizedPnl,position.currency)} · after buy fees`:'Analyse to obtain a dated close';
      return `<tr><td><strong>${holdingsEscape(position.symbol)}</strong><small>${holdingsEscape(position.market)} · ${position.tradeType==='paper'?'Paper':'Actual'} · Bought ${holdingsEscape(position.entryDate)}</small></td><td>${holdingsNumber(totals.remainingQuantity,0)} / ${holdingsNumber(position.quantity,0)}</td><td>${holdingsMoney(position.entryPrice,position.currency)}<small>Cost ${holdingsMoney(totals.remainingCostBasis,position.currency)}</small></td><td><label class="holdings-style-label"><span class="sr-only">Trading style for ${holdingsEscape(position.symbol)}</span><select data-holding-style="${holdingsEscape(position.id)}">${styleOptions(position.style)}</select></label></td><td>${Number.isFinite(quote)?holdingsMoney(quote,position.currency):'No reviewed quote'}<small>${holdingsEscape(pnl)}</small>${report?.priceReference?.lastCandle?`<small>Bar start ${holdingsEscape(report.priceReference.lastCandle)}</small>`:''}${report?`<small>${holdingsEscape(report.label)}</small>`:''}</td><td><div class="row-buttons"><button class="btn sm primary" data-holding-action="analyse" data-id="${holdingsEscape(position.id)}"${state.active?' disabled':''}>Analyse holding</button><button class="btn sm ghost" data-holding-action="edit" data-id="${holdingsEscape(position.id)}">Edit plan</button><button class="btn sm secondary" data-holding-action="sell" data-id="${holdingsEscape(position.id)}">Record sale</button></div></td></tr>`;
    }).join(''):'<tr><td colspan="6" class="empty">No open holdings. Record a buy or import your holdings backup.</td></tr>';
    e('holdingHistory').innerHTML=book.positions.length?book.positions.map(position=>{
      const totals=deps.model.positionTotals(position);
      return `<details class="holdings-lot-history"><summary>${holdingsEscape(position.symbol)} · ${position.tradeType==='paper'?'Paper':'Actual'} · ${totals.status==='closed'?'Closed':'Open'} · Realised ${holdingsMoney(totals.realizedPnl,position.currency)}</summary><p class="small">Bought ${holdingsNumber(position.quantity,0)} at ${holdingsMoney(position.entryPrice,position.currency)} on ${holdingsEscape(position.entryDate)}. Buy fees ${holdingsMoney(position.entryFees,position.currency)}. Remaining ${holdingsNumber(totals.remainingQuantity,0)}.</p>${position.exits.length?`<div class="scroll-table"><table><thead><tr><th>Sale date</th><th>Shares / units</th><th>Price</th><th>Sale fees</th><th>Correction</th></tr></thead><tbody>${position.exits.map(exit=>`<tr><td>${holdingsEscape(exit.date)}</td><td>${holdingsNumber(exit.quantity,0)}</td><td>${holdingsMoney(exit.price,position.currency)}</td><td>${holdingsMoney(exit.fees,position.currency)}</td><td><button class="btn sm ghost" data-holding-action="correct-sale" data-id="${holdingsEscape(position.id)}" data-exit-id="${holdingsEscape(exit.id)}">Correct / undo</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted small">No sales recorded.</p>'}<p class="holdings-note">${holdingsEscape(position.thesis||'No thesis recorded.')}<br>${holdingsEscape(position.notes||'')}</p><button class="btn sm ghost" data-holding-action="edit" data-id="${holdingsEscape(position.id)}">Edit plan / notes</button></details>`;
    }).join(''):'<p class="muted small">No manual holdings recorded yet.</p>';
    if(state.active){e('holdingReview').innerHTML=`<div class="card"><h3>Holding review</h3><p class="holdings-status" role="status">${holdingsEscape(state.active.cancelled?'Holding or connection changed. Discarding the in-flight result…':state.active.progress)}</p></div>`;}
    else if(reviewId)renderReview(reviewId);
  }
  function renderGuidance(guidance,position){
    const action=guidance.action;
    return `<div class="card holding-guidance"><div class="eyebrow">SUGGESTED RESPONSE · CONDITIONAL</div><div class="card-title-row"><h3>${holdingsEscape(position.symbol)} · ${holdingsEscape(action.label)}</h3><span class="badge badge-outline">${holdingsEscape(styles[position.style].label)}</span></div><p class="holdings-review-summary">${holdingsEscape(action.reason)}</p><div class="two-col"><div><h4>Why this response?</h4>${list(guidance.reasons)}</div><div><h4>What would change this view?</h4>${list(guidance.changeOfView)}</div></div>${action.conditions?.length?`<h4>Conditions to check</h4>${list(action.conditions)}`:''}<p class="disclaimer">${holdingsEscape(action.caveat||guidance.scope)}</p><details class="holding-scenarios"><summary>Common scenarios · suggested response and trigger</summary><p class="muted small">These checks cover the recorded plan and available technical evidence. They do not cover every possible market event.</p><div class="scroll-table"><table><thead><tr><th>Situation</th><th>Suggested response</th><th>Trigger / evidence needed</th><th>At this reference</th></tr></thead><tbody>${guidance.scenarios.map(row=>`<tr><td>${holdingsEscape(row.situation)}</td><td>${holdingsEscape(row.response)}</td><td>${holdingsEscape(row.trigger)}</td><td>${row.active===true?'Condition met':row.active===false?'Condition not met':'Not evaluated'}</td></tr>`).join('')}</tbody></table></div></details><details class="holding-scenarios"><summary>Criteria and information not assessed</summary><p class="muted small">The holding decision checks the recorded stop and targets first. Bullish trend means close above SMA20 and SMA20 above SMA50; bearish trend reverses that order. A technical hold requires both selected trends bullish and neither MACD histogram negative. RSI, ATR, RVOL, SMA200 and estimated support/resistance add context; they do not determine the current holding classification. Your custom indicator-rating weights are a separate checklist.</p><p class="muted small">${holdingsEscape(guidance.scope)}</p>${list(guidance.missing)}</details></div>`;
  }
  function renderReview(id){
    const report=controller.getReview(id),position=controller.getPosition(id);
    if(!report||!position){e('holdingReview').innerHTML='<div class="card"><h3>Holding review</h3><p class="muted small">This review is unavailable or its holding/settings changed. Analyse the saved holding again.</p></div>';return;}
    const reference=report.priceReference;
    e('holdingReview').innerHTML=`<div class="card holding-review-card holding-review-${holdingsEscape(report.classification)}"><div class="card-title-row"><h3>${holdingsEscape(position.symbol)} · ${holdingsEscape(report.label)}</h3><span class="badge badge-outline">${holdingsEscape(report.style?.label||styles[position.style].label)}</span></div><p class="holdings-review-summary">${holdingsEscape(report.summary)}</p>${reference?`<p class="muted small">Reference: ${holdingsMoney(reference.price,position.currency)} · completed ${holdingsEscape(reference.timeframe||'1day')} candle starting ${holdingsEscape(reference.lastCandle)} · ${holdingsEscape(reference.timezone||'exchange timezone not supplied')}<br>Source ${holdingsEscape(reference.provider)} · Fetched ${holdingsEscape(reference.fetchedAt||'unknown')} · Completion ${reference.completionInferred?'inferred':'reported'}<br>Generated ${holdingsEscape(report.generatedAt)}. This is a historical candle close, not a live executable quote.</p>`:'<p class="muted small">No usable price reference. A holding conclusion and current P/L cannot be established.</p>'}<div class="two-col"><div><h4>Evidence</h4>${list(report.evidence)}</div><div><h4>Risks and missing context</h4>${list(report.risks)}</div></div><h4>Your saved plan</h4><p class="small">Protective stop: ${holdingsMoney(report.plan?.stopPrice,position.currency)} · Target 1: ${holdingsMoney(report.plan?.target1,position.currency)} · Target 2: ${holdingsMoney(report.plan?.target2,position.currency)}</p><p class="holdings-note">Thesis: ${holdingsEscape(position.thesis||'Not recorded.')}</p><h4>Conditional next checks</h4>${list(report.nextChecks)}<details><summary>Timeframe coverage · ${report.coverage?.available??0}/${report.coverage?.required??0}</summary>${(report.frames||[]).map(frame=>`<div class="holdings-frame"><strong>${holdingsEscape(frame.timeframe)} · ${holdingsEscape(frame.status)}</strong><p>${holdingsEscape(frame.reason||frame.trend||'')}${frame.lastCandle?' · Bar start '+holdingsEscape(frame.lastCandle):''}</p>${list(frame.warnings)}</div>`).join('')}</details><p class="disclaimer">Stop or target thresholds are compared with the reference close, not an actual fill. Verify your broker’s current quote, announcements and order status before deciding. No sale is recorded unless you enter it yourself. Style changes do not rewrite your stop or targets.</p></div>`;
    if(deps.buildGuidance){const guidance=deps.buildGuidance({position,review:report});const evidence=e('holdingReview').innerHTML;e('holdingReview').innerHTML=renderGuidance(guidance,position)+'<details class="card space-top holding-detailed-review"><summary>Detailed technical evidence and data checks</summary>'+evidence+'</details>';}
  }
  function fillExitEditor(saleId=''){
    const position=controller.getPosition(exitId);if(!position)return;
    const totals=deps.model.positionTotals(position),sale=position.exits.find(exit=>exit.id===saleId);
    if(!sale&&totals.remainingQuantity<=0){say('This lot is closed. Choose an existing sale to correct or undo.');return;}
    editingExitId=sale?.id||'';e('holdingExitMode').value=editingExitId;
    e('holdingExitDate').value=sale?.date||holdingsToday();e('holdingExitQuantity').value=sale?.quantity??totals.remainingQuantity;e('holdingExitQuantity').max=totals.remainingQuantity+(sale?.quantity||0);e('holdingExitPrice').value=sale?.price??'';e('holdingExitFees').value=sale?.fees??0;
    e('holdingExitSave').textContent=sale?'Save sale correction':'Save sale';e('holdingUndoSale').classList[sale?'remove':'add']('hidden');e('holdingUndoPanel').classList.add('hidden');
  }
  function openExit(id,saleId=''){
    const position=controller.getPosition(id);if(!position)return;const totals=deps.model.positionTotals(position);
    exitId=id;e('holdingExitTitle').textContent=`Record / correct sale · ${position.symbol} · ${holdingsNumber(totals.remainingQuantity,0)} shares / units remaining`;
    e('holdingExitMode').innerHTML=`<option value=""${totals.remainingQuantity<=0?' disabled':''}>New sale${totals.remainingQuantity<=0?' · lot closed':''}</option>`+position.exits.map(exit=>`<option value="${holdingsEscape(exit.id)}">Correct ${holdingsEscape(exit.date)} · ${holdingsNumber(exit.quantity,0)} at ${holdingsMoney(exit.price,position.currency)}</option>`).join('');
    fillExitEditor(saleId||(totals.remainingQuantity<=0?position.exits[0]?.id:''));e('holdingExitEditor').classList.remove('hidden');e('holdingExitEditor').scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function downloadBackup(){
    const text=controller.exportBackup(),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=controller.getState().loadError?'bursaquant-holdings-rescue.txt':'bursaquant-holdings.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say(controller.getState().loadError?'Saved raw holdings data exported for recovery.':'Holdings backup exported. It contains your private manual records; store it securely.');
  }
  function onClick(event){
    const button=event.target.closest?.('[data-holding-action]');if(!button||!root.contains(button))return;
    const {id,holdingAction:action}=button.dataset;
    if(action==='edit')editPosition(id);
    if(action==='sell')openExit(id);
    if(action==='correct-sale')openExit(id,button.dataset.exitId);
    if(action==='analyse'){reviewId=id;controller.analysePosition(id).then(report=>{if(report)say('Holding review ready. Check its candle dates and conditions.');else say('Holding or connection changed; the old review was discarded.');}).catch(error=>{say(error.message);renderReview(id);});}
  }
  function onChange(event){
    const select=event.target.closest?.('[data-holding-style]');
    if(select&&root.contains(select)){try{controller.setStyle(select.dataset.holdingStyle,select.value);say('Trading style saved. Analyse this holding again to apply it.');}catch(error){say(error.message);render();}}
  }
  e('holdingEntryForm').onsubmit=event=>{
    event.preventDefault();try{
      const input=Object.fromEntries(Object.entries(entryIds).map(([key,id])=>[key,numeric.has(key)?e(id).value.trim()===''?null:Number(e(id).value):e(id).value]));
      if(editingId){input.id=editingId;input.initialStopPrice=controller.getPosition(editingId)?.initialStopPrice??null;}
      const saved=controller.savePosition(input);say(`${saved.symbol} holding ${editingId?'updated':'saved'} on this browser.`);resetEditor();
    }catch(error){say(error.message);}
  };
  e('holdingExitForm').onsubmit=event=>{event.preventDefault();try{
    for(const [id,label]of [['holdingExitQuantity','Shares sold'],['holdingExitPrice','Sale price'],['holdingExitFees','Sale fees']])if(e(id).value.trim()==='')throw new Error(label+' is required. Enter 0 only when confirmed.');
    const values={date:e('holdingExitDate').value,quantity:Number(e('holdingExitQuantity').value),price:Number(e('holdingExitPrice').value),fees:Number(e('holdingExitFees').value)},correction=!!editingExitId;
    if(correction)controller.updateExit(exitId,editingExitId,values);else controller.recordExit(exitId,values);
    e('holdingExitEditor').classList.add('hidden');e('holdingUndoPanel').classList.add('hidden');exitId='';editingExitId='';say(correction?'Sale correction saved. Remaining shares and realised results have been recalculated.':'Sale recorded. Remaining shares and realised results have been recalculated.');
  }catch(error){say(error.message);}};
  e('holdingExitMode').onchange=()=>fillExitEditor(e('holdingExitMode').value);
  e('holdingUndoSale').onclick=()=>{
    const position=controller.getPosition(exitId),sale=position?.exits.find(exit=>exit.id===editingExitId);if(!sale)return;
    e('holdingUndoMessage').textContent=`Undo the manual ${position.symbol} sale record for ${holdingsNumber(sale.quantity,0)} shares / units on ${sale.date}? The quantity returns to this holding and recorded P/L is recalculated. This changes your tracker only; it does not cancel a broker trade.`;e('holdingUndoPanel').classList.remove('hidden');
  };
  e('holdingConfirmUndo').onclick=()=>{try{controller.removeExit(exitId,editingExitId);e('holdingExitEditor').classList.add('hidden');e('holdingUndoPanel').classList.add('hidden');exitId='';editingExitId='';say('Manual sale record undone. Shares returned to the holding; no broker trade was changed.');}catch(error){say(error.message);}};
  e('holdingCancelUndo').onclick=()=>e('holdingUndoPanel').classList.add('hidden');
  e('holdingsImport').onchange=async event=>{
    const file=event.target.files?.[0];if(!file)return;try{if(file.size>2000000)throw new Error('Choose a holdings backup of at most 2 MB.');const replace=e('holdingReplaceUnreadable')?.checked===true,result=controller.importBackup(await file.text(),{replaceUnreadable:replace});say(`Imported ${result.added} holdings; ${result.skipped} identical records already existed.`);}catch(error){say(error.message);}event.target.value='';
  };
  e('holdingsNew').onclick=()=>{resetEditor();e('holdingEditor').scrollIntoView?.({behavior:'smooth',block:'start'});};e('holdingCancelEdit').onclick=resetEditor;e('holdingCancelExit').onclick=()=>{exitId='';editingExitId='';e('holdingExitEditor').classList.add('hidden');e('holdingUndoPanel').classList.add('hidden');};e('holdingsExport').onclick=downloadBackup;
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);controller.subscribe(render);resetEditor();render();
  return {getBook:controller.getBook,refresh:controller.refresh,beginDraft,controller};
}
