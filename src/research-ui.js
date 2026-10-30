// Plain DOM research workspace. Network and calculation dependencies are injected.
const researchEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const researchNumber=(value,places=2)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:places}):'Unavailable';

/** Strip personal position sizes before an explicit AI request. */
export function researchAiContext(report){
  const copy=JSON.parse(JSON.stringify(report));
  copy.kind='stock';
  for(const frame of copy.frames||[])for(const plan of frame.plans||[])delete plan.sizing;
  return copy;
}

export function mountResearchWorkspace(root,deps){
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
      reportKey=startKey;render();el('deepProgress').textContent=`${paused?'Paused. ':''}${report.counts.available}/3 timeframes passed the data checks. ${report.status==='complete'?'Report ready.':'Missing or rejected timeframes are shown below.'}`;
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
