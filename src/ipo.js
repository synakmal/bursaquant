// IPO research is entered by the user from source documents; no live IPO feed.
const IPO_STORAGE_KEY='bq_ipo_dossiers_v1';
const IPO_MAX_RECORDS=50;
const IPO_MAX_BYTES=1000000;
const IPO_METRIC_FIELDS=['price','shares','revenue','profit','equity','debt','cash','operatingCashFlow'];
const IPO_TEXT_FIELDS={name:160,sourceUrl:1800,sourceDate:10,periodEnd:10,pageRefs:400,sector:120,useOfProceeds:1800,concentration:1800,lockup:1800,risks:2400,thesis:2400,peerReason:500};
const ipoEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ipoNumber=value=>value===null||value===undefined||(typeof value==='string'&&!value.trim())?null:(typeof value==='number'||typeof value==='string')&&Number.isFinite(Number(value))?Number(value):NaN;
const ipoDate=value=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
const ipoFinite=value=>typeof value==='number'&&Number.isFinite(value);
const ipoDivide=(a,b)=>ipoFinite(a)&&ipoFinite(b)&&b>0&&Number.isFinite(a/b)?a/b:null;
const ipoMedian=values=>{const sorted=values.filter(ipoFinite).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2):null;};

export function safeIpoSourceUrl(value){
  if(!String(value??'').trim())return '';
  try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

function ipoCleanEntity(input,peer=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Each IPO or peer must be an object.');
  const record={};
  for(const [key,max]of Object.entries(IPO_TEXT_FIELDS)){
    const raw=input[key]??'';
    if(typeof raw!=='string'||raw.length>max)throw new Error(`${key} must be text with at most ${max} characters.`);
    record[key]=raw.trim();
  }
  if(!record.name)throw new Error(peer?'Each peer needs a company name.':'Enter a company name.');
  record.sourceUrl=safeIpoSourceUrl(record.sourceUrl);
  if(record.sourceUrl===null)throw new Error('Source links must use http or https and cannot contain credentials.');
  for(const field of ['sourceDate','periodEnd'])if(!ipoDate(record[field]))throw new Error(`${field} must be a valid date.`);
  for(const [field,choices,fallback]of [['market',['MY','US'],'MY'],['currency',['MYR','USD'],'MYR'],['stage',['prelisting','listed'],'prelisting'],['sourceStatus',['unverified','draft','final'],'unverified'],['basis',['unconfirmed','audited','unaudited'],'unconfirmed']]){
    const value=input[field]??fallback;if(!choices.includes(value))throw new Error(`Invalid ${field}.`);record[field]=value;
  }
  for(const field of [...IPO_METRIC_FIELDS,'primaryPct','secondaryPct']){
    const value=ipoNumber(input[field]);
    if(value!==null&&(!Number.isFinite(value)||Math.abs(value)>1e12))throw new Error(`${field} must be a finite number with absolute value at most 1 trillion.`);
    if(value!==null&&['price','shares','revenue','debt','cash','primaryPct','secondaryPct'].includes(field)&&value<0)throw new Error(`${field} cannot be negative.`);
    if(value!==null&&['price','shares'].includes(field)&&value<=0)throw new Error(`${field} must be greater than zero when supplied.`);
    if(value!==null&&['primaryPct','secondaryPct'].includes(field)&&value>100)throw new Error('Offer percentages must be between 0 and 100.');
    record[field]=value;
  }
  if(record.primaryPct!==null&&record.secondaryPct!==null&&Math.abs(record.primaryPct+record.secondaryPct-100)>0.01)throw new Error('Primary and secondary percentages must total 100 when both are supplied.');
  record.comparable=input.comparable===true;
  return record;
}

export function validateIpoDossier(input){
  const record=ipoCleanEntity(input);
  const id=input.id??'';
  if(typeof id!=='string'||(id&&!/^[a-zA-Z0-9_-]{1,80}$/.test(id)))throw new Error('Invalid IPO record ID.');
  record.id=id;
  record.schemaVersion=1;
  if(input.schemaVersion!==undefined&&input.schemaVersion!==1)throw new Error('Unsupported IPO backup version.');
  if(input.peers!==undefined&&!Array.isArray(input.peers))throw new Error('Peers must be an array.');
  if((input.peers?.length||0)>10)throw new Error('Use at most 10 peers per IPO.');
  record.peers=(input.peers||[]).map(peer=>ipoCleanEntity(peer,true));
  return record;
}

export function calculateIpoMetrics(input={}){
  const n=Object.fromEntries(IPO_METRIC_FIELDS.map(field=>[field,ipoNumber(input[field])]));
  const marketCap=ipoFinite(n.price)&&n.price>0&&ipoFinite(n.shares)&&n.shares>0&&Number.isFinite(n.price*n.shares)?n.price*n.shares:null;
  const netDebt=ipoFinite(n.debt)&&n.debt>=0&&ipoFinite(n.cash)&&n.cash>=0?n.debt-n.cash:null;
  const enterpriseValue=ipoFinite(marketCap)&&ipoFinite(netDebt)&&Number.isFinite(marketCap+netDebt)?marketCap+netDebt:null;
  return {marketCap,eps:ipoDivide(n.profit,n.shares),pe:ipoDivide(marketCap,n.profit),ps:ipoDivide(marketCap,n.revenue),netDebt,enterpriseValue,
    evRevenue:enterpriseValue!==null&&enterpriseValue>0?ipoDivide(enterpriseValue,n.revenue):null,
    netMargin:ipoDivide(n.profit,n.revenue)===null?null:ipoDivide(n.profit,n.revenue)*100,
    returnOnClosingEquity:ipoDivide(n.profit,n.equity)===null?null:ipoDivide(n.profit,n.equity)*100,
    cashConversion:ipoDivide(n.operatingCashFlow,n.profit)===null?null:ipoDivide(n.operatingCashFlow,n.profit)*100,
    peStatus:ipoFinite(n.profit)&&n.profit<=0?'N/M · non-positive profit':marketCap===null||!ipoFinite(n.profit)?'Missing inputs':'Available'};
}

function ipoSourceGaps(entity){
  const gaps=[];
  if(entity.sourceStatus!=='final')gaps.push('final/registered source not confirmed');
  if(!safeIpoSourceUrl(entity.sourceUrl))gaps.push('source link missing');
  if(!entity.sourceDate||!ipoDate(entity.sourceDate))gaps.push('source review date missing');
  if(!entity.periodEnd||!ipoDate(entity.periodEnd))gaps.push('annual financial year-end missing');
  if(entity.basis!=='audited')gaps.push('audited annual basis not confirmed');
  return gaps;
}

export function compareIpoPeers(dossier){
  const subject=calculateIpoMetrics(dossier),subjectGaps=ipoSourceGaps(dossier);
  const rows=(dossier.peers||[]).map(peer=>{
    const reasons=ipoSourceGaps(peer);
    if(!peer.comparable)reasons.push('business comparability not confirmed');
    if(peer.currency!==dossier.currency)reasons.push('currency differs');
    if(peer.periodEnd!==dossier.periodEnd)reasons.push('financial year-end differs');
    if(subjectGaps.length)reasons.push('IPO source/basis incomplete');
    return {name:peer.name,eligible:reasons.length===0,reasons,metrics:calculateIpoMetrics(peer)};
  });
  const metrics=['pe','ps','evRevenue','netMargin','returnOnClosingEquity'].map(key=>{
    const values=rows.filter(row=>row.eligible).map(row=>row.metrics[key]).filter(ipoFinite);
    const median=ipoMedian(values),value=subject[key];
    return {key,value,median,count:values.length,differencePct:median!==null&&median>0&&ipoFinite(value)?(value/median-1)*100:null};
  });
  return {subject,subjectGaps,rows,metrics,eligiblePeers:rows.filter(row=>row.eligible).length};
}

export function parseIpoImport(text){
  if(typeof text!=='string'||text.length>IPO_MAX_BYTES||new TextEncoder().encode(text).length>IPO_MAX_BYTES)throw new Error('IPO backup exceeds 1 MB.');
  let data;try{data=JSON.parse(text);}catch{throw new Error('Choose a valid IPO JSON backup.');}
  if(!data||data.schemaVersion!==1||!Array.isArray(data.dossiers)||data.dossiers.length>IPO_MAX_RECORDS)throw new Error('Expected a version 1 IPO backup with at most 50 dossiers.');
  const records=data.dossiers.map(validateIpoDossier),ids=records.map(record=>record.id).filter(Boolean);
  if(new Set(ids).size!==ids.length)throw new Error('IPO backup has duplicate record IDs.');
  return records;
}

const IPO_LABELS={price:'Offer / reference price · currency per share',shares:'Post-IPO diluted shares · millions',revenue:'Annual revenue · millions',profit:'Annual net profit attributable to owners · millions',equity:'Equity attributable to owners at year-end · millions',debt:'Debt at year-end · millions',cash:'Cash at year-end · millions',operatingCashFlow:'Annual operating cash flow · millions'};
const IPO_NAMES={pe:'P/E',ps:'P/S',evRevenue:'EV / revenue',netMargin:'Net margin',returnOnClosingEquity:'Profit / closing equity'};
const ipoFormat=(value,digits=2)=>ipoFinite(value)?new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value):'Unavailable';
const ipoLink=(url,label)=>safeIpoSourceUrl(url)?`<a href="${ipoEscape(safeIpoSourceUrl(url))}" target="_blank" rel="noopener noreferrer">${ipoEscape(label)}</a>`:'No source link';
const ipoInput=(name,label,options={})=>`<label>${ipoEscape(label)}<input name="${name}" type="${options.type||'text'}" ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''} ${options.type==='number'?'step="any"':''} ${options.maxlength?`maxlength="${options.maxlength}"`:''} ${options.required?'required':''} /></label>`;

function ipoEntityForm(peer=false){
  return `<div class="ipo-fields">${ipoInput('name',peer?'Peer company':'IPO company',{required:true,maxlength:160})}<label>Market<select name="market"><option value="MY">Bursa Malaysia</option><option value="US">US</option></select></label><label>Currency for every amount<select name="currency"><option value="MYR">MYR</option><option value="USD">USD</option></select></label><label>${peer?'Reference price status':'IPO stage'}<select name="stage"><option value="prelisting">Pre-listing / offer price</option><option value="listed">Listed / reference price</option></select></label>${ipoInput('sector','Business / sector',{maxlength:120})}${ipoInput('sourceUrl',peer?'Annual report / filing URL':'Prospectus / filing URL',{type:'url',maxlength:1800})}<label>Document status · user confirmed<select name="sourceStatus"><option value="unverified">Not verified</option><option value="draft">Draft / exposure only</option><option value="final">Final / registered filing</option></select></label>${ipoInput('sourceDate','Source last reviewed',{type:'date'})}${ipoInput('pageRefs','Document pages / sections and price date',{maxlength:400})}${ipoInput('periodEnd','Annual financial year-end',{type:'date'})}<label>Financial basis<select name="basis"><option value="unconfirmed">Not confirmed</option><option value="audited">Audited annual</option><option value="unaudited">Other / unaudited</option></select></label>${IPO_METRIC_FIELDS.map(field=>ipoInput(field,peer&&field==='shares'?'Diluted shares · millions':IPO_LABELS[field],{type:'number',...(['price','shares','revenue','debt','cash'].includes(field)?{min:0}:{})})).join('')}</div>`;
}

function ipoReadEntity(form){
  const value={};
  for(const element of form.querySelectorAll('[name]'))value[element.name]=element.type==='checkbox'?element.checked:element.value;
  return value;
}
function ipoFillEntity(form,data){
  for(const element of form.querySelectorAll('[name]')){
    if(element.type==='checkbox')element.checked=data[element.name]===true;
    else element.value=data[element.name]??'';
  }
}

export function mountIpoWorkspace(rootElement){
  if(!rootElement)return {destroy(){}};
  let dossiers=[],currentId='',peers=[],storageWarning='',destroyed=false;
  try{const saved=globalThis.localStorage?.getItem(IPO_STORAGE_KEY);if(saved)dossiers=parseIpoImport(saved);}catch{storageWarning='Saved IPO research could not be read. Import a backup if available; no saved record has been overwritten.';}
  rootElement.innerHTML=`<div class="ipo-intro card"><h3>Build a prospectus-backed IPO dossier</h3><p>Compare what you would pay with audited financials and selected listed peers. Enter figures from the final prospectus and annual reports; BursaQuant does not fetch or verify these documents automatically.</p><div class="ipo-source-links">${ipoLink('https://www.bursamalaysia.com/','Bursa Malaysia · official site')}${ipoLink('https://www.sc.com.my/resources/prospectus-exposure','SC · draft prospectus exposure')}${ipoLink('https://www.sec.gov/search-filings','SEC EDGAR · US filings')}${ipoLink('https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-17','SEC · IPO research guide')}</div><p class="small muted">Draft exposure documents can change and are not final investment documents. Listing dates, offer terms and financial inputs require your source review. This is a manual research workspace, not a live IPO calendar.</p></div>
  <div class="ipo-layout space-top"><div class="card ipo-editor"><div class="card-title-row"><h3>IPO details & financials</h3><button type="button" class="btn sm ghost" data-action="new">New dossier</button></div><p class="small muted">All share counts and financial totals below use <strong>millions</strong>; only price and EPS use currency per share. Blank means unknown; enter 0 only when confirmed. Use one audited full year, not a quarter or forecast. Equity, debt and cash use that year-end; post-IPO pro forma adjustments are not inferred.</p><form class="ipo-form" data-role="dossier">${ipoEntityForm()}<div class="ipo-fields">${ipoInput('primaryPct','New shares · % of total offered',{type:'number',min:0,max:100})}${ipoInput('secondaryPct','Existing holders selling · % of offered',{type:'number',min:0,max:100})}</div>${[['useOfProceeds','Use of proceeds · expansion, working capital, debt repayment, fees'],['concentration','Customer / supplier concentration and related-party exposure'],['lockup','Lock-up / moratorium terms and potential share overhang'],['risks','Main risks, governance, dilution and unproven assumptions'],['thesis','Why research this IPO? What would invalidate your thesis?']].map(([field,label])=>`<label class="ipo-note">${label}<textarea name="${field}" maxlength="${IPO_TEXT_FIELDS[field]}" rows="3"></textarea></label>`).join('')}<div class="row-buttons"><button type="submit" class="btn primary">Calculate research report</button><button type="button" class="btn secondary" data-action="save">Save dossier</button></div></form><p class="ipo-status small" data-role="status" role="status" aria-live="polite"></p></div>
  <aside class="card ipo-saved"><h3>My IPO watchlist</h3><p class="small muted">Saved on this browser only. Export a backup to move research to another device.</p><div data-role="saved" class="ipo-records"></div><div class="row-buttons space-top"><button type="button" class="btn ghost sm" data-action="export">Export backup</button><label class="btn ghost sm ipo-file">Import backup<input type="file" accept=".json,application/json" data-role="import" /></label></div><p class="small muted">Import adds new record IDs, keeps existing records and never imports a trading order.</p></aside></div>
  <div class="card space-top"><div class="card-title-row"><h3>Choose comparable listed peers</h3><button type="button" class="btn sm secondary" data-action="add-peer">+ Add peer</button></div><p class="small muted">Up to 10 peers. Match the business model, financial year-end, currency and audited annual basis. Each peer needs a source link and review date. Confirm comparability after reviewing growth, size, leverage, accounting and one-off items. Medians exclude incomplete or mismatched entries.</p><div data-role="peers" class="ipo-peer-list"></div></div><div data-role="report" class="space-top" aria-live="polite"><div class="card"><h3>Research report</h3><p class="muted small">Start a dossier and calculate to see valuation, missing evidence and peer comparisons. No sample companies or invented valuations are loaded.</p></div></div>`;
  const find=selector=>rootElement.querySelector(selector),form=find('[data-role="dossier"]'),status=find('[data-role="status"]');
  const message=text=>{status.textContent=text;};
  const makeId=()=>globalThis.crypto?.randomUUID?.()||'ipo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  function readDossier(){
    peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));
    return validateIpoDossier({...ipoReadEntity(form),id:currentId,peers});
  }
  function persist(next){
    if(next.length>IPO_MAX_RECORDS)throw new Error('Keep at most 50 dossiers; export and delete older research first.');
    const text=JSON.stringify({schemaVersion:1,dossiers:next});
    if(new TextEncoder().encode(text).length>IPO_MAX_BYTES)throw new Error('IPO storage exceeds 1 MB; export and remove older dossiers first.');
    globalThis.localStorage.setItem(IPO_STORAGE_KEY,text);dossiers=next;storageWarning='';renderSaved();
  }
  function renderSaved(){
    find('[data-role="saved"]').innerHTML=dossiers.length?dossiers.map(record=>`<div class="ipo-record"><strong>${ipoEscape(record.name)}</strong><span class="small muted">${ipoEscape(record.market)} · ${record.stage==='listed'?'Listed':'Pre-listing'} · ${ipoEscape(record.sourceDate||'Review date missing')}</span><div class="row-buttons"><button type="button" class="btn sm ghost" data-action="open" data-id="${ipoEscape(record.id)}">Open</button><button type="button" class="btn sm ghost" data-action="delete" data-id="${ipoEscape(record.id)}">Delete</button></div></div>`).join(''):'<p class="small muted">No IPO dossiers saved yet.</p>';
  }
  function renderPeers(){
    find('[data-role="peers"]').innerHTML=peers.map((peer,index)=>`<details class="ipo-peer" open><summary>Peer ${index+1}${peer.name?' · '+ipoEscape(peer.name):''}</summary><div data-peer-index="${index}" class="ipo-form">${ipoEntityForm(true)}<label class="ipo-check"><input name="comparable" type="checkbox" /> I reviewed this business as comparable to the IPO</label>${ipoInput('peerReason','Why this is a useful peer / differences',{maxlength:500})}<button type="button" class="btn sm ghost" data-action="remove-peer" data-index="${index}">Remove peer</button></div></details>`).join('')||'<p class="small muted">No peers entered. Add two or more well-matched companies for a more useful context.</p>';
    for(const [index,peer]of peers.entries())ipoFillEntity(find(`[data-peer-index="${index}"]`),peer);
  }
  function renderReport(record){
    find('[data-role="report"]').removeAttribute('data-stale');
    const comparison=compareIpoPeers(record),m=comparison.subject;
    const gaps=[...comparison.subjectGaps];
    for(const field of IPO_METRIC_FIELDS)if(record[field]===null)gaps.push(`${IPO_LABELS[field]} not supplied`);
    if(!record.useOfProceeds)gaps.push('use of proceeds not documented');
    if(!record.risks)gaps.push('risks not documented');
    if(!record.lockup)gaps.push('lock-up / moratorium not documented');
    const cards=[['Market cap',`${ipoFormat(m.marketCap)} ${record.currency}m`],['P/E',m.pe===null?m.peStatus:ipoFormat(m.pe)+'×'],['P/S',m.ps===null?'Unavailable':ipoFormat(m.ps)+'×'],['Net debt',`${ipoFormat(m.netDebt)} ${record.currency}m`],['EV / revenue',m.evRevenue===null?'Unavailable / N/M':ipoFormat(m.evRevenue)+'×'],['Net margin',m.netMargin===null?'Unavailable':ipoFormat(m.netMargin)+'%']];
    const metricCell=(key,value)=>ipoFinite(value)?ipoFormat(value)+(['netMargin','returnOnClosingEquity'].includes(key)?'%':'×'):'Unavailable / N/M';
    find('[data-role="report"]').innerHTML=`<div class="card"><div class="card-title-row"><h3>${ipoEscape(record.name)} · IPO research</h3><span class="badge badge-outline">User-entered evidence</span></div><p class="small muted">${ipoEscape(record.market)} · ${ipoEscape(record.currency)} · Annual financial year ended ${ipoEscape(record.periodEnd||'not supplied')} · Source reviewed ${ipoEscape(record.sourceDate||'not supplied')} · ${ipoLink(record.sourceUrl,'Open source document')}</p>${record.sourceStatus==='draft'?'<p class="ipo-warning">Draft / exposure document: figures and offer terms can change. Obtain the final registered prospectus before deciding.</p>':''}<div class="ipo-metrics">${cards.map(([label,value])=>`<div class="metric"><div class="label">${label}</div><div class="value">${ipoEscape(value)}</div></div>`).join('')}</div><div class="ipo-report-two"><div><h4>Cash and ownership checks</h4><p>EPS on entered diluted shares: ${ipoFormat(m.eps,4)} ${ipoEscape(record.currency)} per share.<br>Operating cash flow / net profit: ${m.cashConversion===null?'Unavailable / N/M':ipoFormat(m.cashConversion)+'%'}.<br>Profit / closing equity: ${m.returnOnClosingEquity===null?'Unavailable / N/M':ipoFormat(m.returnOnClosingEquity)+'%'}.<br>New / existing shares as share of offer: ${ipoFormat(record.primaryPct)}% / ${ipoFormat(record.secondaryPct)}%.</p><p class="small muted">Profit / closing equity is a rough proxy, not ROE using average equity. EPS uses post-IPO diluted shares with historical profit; it is not reported historical EPS. New-share proceeds go to the issuer; secondary-sale proceeds go to selling holders. Allocation and listing returns are not predicted.</p></div><div><h4>Evidence still needed</h4>${gaps.length?`<ul>${gaps.map(gap=>`<li>${ipoEscape(gap)}</li>`).join('')}</ul>`:'<p>Required input fields are present. Accuracy, suitability and completeness still depend on your document review.</p>'}</div></div></div>
      <div class="card space-top"><h3>Peer comparison · ${comparison.eligiblePeers} eligible of ${comparison.rows.length} entered</h3><div class="scroll-table"><table><thead><tr><th>Measure</th><th>IPO</th><th>Peer median</th><th>Peers used</th><th>Difference to median</th></tr></thead><tbody>${comparison.metrics.map(metric=>`<tr><td>${IPO_NAMES[metric.key]}</td><td>${metricCell(metric.key,metric.value)}</td><td>${metricCell(metric.key,metric.median)}</td><td>${metric.count}</td><td>${metric.differencePct===null?'Unavailable':ipoFormat(metric.differencePct)+'%'}</td></tr>`).join('')}</tbody></table></div>${comparison.rows.map((row,index)=>`<div class="ipo-peer-result"><strong>${ipoEscape(row.name)}</strong> · ${ipoLink(record.peers[index].sourceUrl,'Source')}<p>${row.eligible?'Eligible for medians when the metric is meaningful.':ipoEscape('Excluded: '+row.reasons.join('; '))}</p><p>${ipoEscape(record.peers[index].peerReason||'Comparability rationale not documented.')}</p></div>`).join('')}<p class="small muted">A lower multiple can reflect weaker growth, earnings quality, governance or risk. The median is context, not fair value or a buy signal. Two peers can still be a biased sample. EV here is market cap + entered debt − cash; it excludes preferred shares, non-controlling interests and other adjustments. Banks, insurers and other financial firms need a sector-specific model. Negative or zero profit makes P/E not meaningful; missing inputs remain unavailable.</p></div>
      <div class="card space-top"><h3>Thesis, offer structure & risks</h3>${[['Thesis / invalidation',record.thesis],['Use of proceeds',record.useOfProceeds],['Concentration / related parties',record.concentration],['Lock-up / potential selling pressure',record.lockup],['Risks / governance',record.risks]].map(([label,value])=>`<div class="ipo-research-note"><h4>${label}</h4><p>${ipoEscape(value||'Not documented.')}</p></div>`).join('')}<p class="small muted">${record.stage==='prelisting'?'Pre-listing IPOs have no traded-price history for technical timing. After listing, enough completed candles must accumulate before normal indicators are available.':'Use Stock Analysis separately once the listed ticker has sufficient completed price history. Listing-day volatility and gaps can make planned stops unreliable.'} IPO allocation and market gains are uncertain. Compare the downside, liquidity and your position risk before committing capital.</p></div>`;
  }
  function reset(){currentId='';peers=[];form.reset();form.querySelector('[name="market"]').value='MY';form.querySelector('[name="currency"]').value='MYR';renderPeers();find('[data-role="report"]').innerHTML='<div class="card"><h3>New IPO research</h3><p class="small muted">Enter source-backed figures and calculate a report.</p></div>';message('New unsaved dossier.');}
  function download(){
    const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),dossiers},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='bursaquant-ipo-research.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function onSubmit(event){if(event.target!==form)return;event.preventDefault();try{const record=readDossier();renderReport(record);message('Report calculated from the current inputs. Save the dossier to keep these edits.');}catch(error){message(error.message);}}
  function markEdited(){
    const report=find('[data-role="report"]');
    if(!report.hasAttribute('data-stale')){
      report.setAttribute('data-stale','true');
      const warning=document.createElement('p');warning.className='ipo-warning';warning.textContent='Inputs have changed. The report below uses the previous calculation. Recalculate to include current edits.';report.prepend(warning);
    }
    message('Unsaved edits. Calculate the report again, then save the dossier to keep the changes.');
  }
  function onInput(event){if(event.target.closest('[data-role="dossier"], [data-peer-index]'))markEdited();}
  function onClick(event){
    const button=event.target.closest('[data-action]');if(!button||!rootElement.contains(button))return;
    try{
      const action=button.dataset.action;
      if(action==='new'){reset();return;}
      if(action==='save'){
        const record=readDossier();record.id ||= makeId();
        const next=dossiers.some(item=>item.id===record.id)?dossiers.map(item=>item.id===record.id?record:item):[record,...dossiers];
        persist(next);currentId=record.id;renderReport(record);message('IPO dossier saved on this browser. Export a backup for other devices.');
      }
      if(action==='open'){
        const record=dossiers.find(item=>item.id===button.dataset.id);if(!record)return;currentId=record.id;peers=record.peers.map(peer=>({...peer}));ipoFillEntity(form,record);renderPeers();renderReport(record);message('Saved dossier opened. Changes are kept only when you press Save dossier.');
      }
      if(action==='delete'){
        const id=button.dataset.id;persist(dossiers.filter(record=>record.id!==id));if(currentId===id)currentId='';message('Saved dossier deleted. The current form stays available until you leave or start a new dossier.');
      }
      if(action==='add-peer'){
        peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));if(peers.length>=10)throw new Error('Use at most 10 peers.');
        peers.push({market:form.querySelector('[name="market"]').value,currency:form.querySelector('[name="currency"]').value,stage:'listed',periodEnd:form.querySelector('[name="periodEnd"]').value,basis:'unconfirmed',sourceStatus:'unverified'});renderPeers();markEdited();message('Peer added. Fill its source and financials, confirm comparability, then calculate again.');
      }
      if(action==='remove-peer'){peers=[...rootElement.querySelectorAll('[data-peer-index]')].map(peerForm=>ipoReadEntity(peerForm));peers.splice(Number(button.dataset.index),1);renderPeers();markEdited();message('Peer removed from current edits. Calculate and save to update the report and stored dossier.');}
      if(action==='export'){download();message('IPO backup exported. It contains your research, not gateway or AI access credentials.');}
    }catch(error){message(error.name==='QuotaExceededError'?'Browser storage is full. Export a backup and free space before saving.':error.message||'IPO action failed.');}
  }
  async function onChange(event){
    if(event.target!==find('[data-role="import"]'))return;
    const input=event.target,file=input.files?.[0];if(!file)return;
    try{
      if(file.size>IPO_MAX_BYTES)throw new Error('IPO backup exceeds 1 MB.');
      const imported=parseIpoImport(await file.text());if(destroyed)return;
      const existing=new Set(dossiers.map(record=>record.id));let added=0;
      const newRecords=imported.filter(record=>!record.id||!existing.has(record.id)).map(record=>({...record,id:record.id||makeId()}));
      added=newRecords.length;persist([...dossiers,...newRecords]);message(`Imported ${added} dossier${added===1?'':'s'}. Existing record IDs were kept unchanged.`);
    }catch(error){message(error.message||'Could not import this IPO backup.');}finally{input.value='';}
  }
  renderSaved();renderPeers();if(storageWarning)message(storageWarning);
  rootElement.addEventListener('submit',onSubmit);rootElement.addEventListener('click',onClick);rootElement.addEventListener('change',onChange);rootElement.addEventListener('input',onInput);
  return {destroy(){destroyed=true;rootElement.removeEventListener('submit',onSubmit);rootElement.removeEventListener('click',onClick);rootElement.removeEventListener('change',onChange);rootElement.removeEventListener('input',onInput);}};
}
