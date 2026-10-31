/** Manual long-only share lots. No broker, quote fetch, FX conversion or storage. */
export const HOLDINGS_LIMITS=Object.freeze({maxPositions:500,maxExitsPerPosition:200,maxBackupBytes:2000000,maxQuantity:1000000000,maxPrice:1000000000,maxFees:1000000000000,maxNotional:1000000000000000});
const holdingObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const holdingFinite=value=>typeof value==='number'&&Number.isFinite(value);
const holdingRound=value=>Number.isFinite(value)?Number(value.toFixed(10)):null;
const holdingBytes=value=>new TextEncoder().encode(value).length;
const holdingToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function holdingText(value,name,max,fallback=''){
  const text=value??fallback;
  if(typeof text!=='string'||text.length>max)throw new Error(`${name} must be text with at most ${max} characters.`);
  return text.trim();
}
function holdingId(value,name,required=false){
  const id=holdingText(value,name,80);
  if((required&&!id)||(id&&!/^[A-Za-z0-9_-]{1,80}$/.test(id)))throw new Error(`${name} must be a unique identifier using letters, numbers, underscores or hyphens.`);
  return id;
}
function holdingNumber(value,name,{optional=false,min=0,max=HOLDINGS_LIMITS.maxNotional,integer=false,fallback}={}){
  if(value===undefined&&fallback!==undefined)value=fallback;
  if(value===null||value===undefined||(typeof value==='string'&&!value.trim())){
    if(optional)return null;
    throw new Error(`${name} is required.`);
  }
  if(!['number','string'].includes(typeof value)||!Number.isFinite(Number(value)))throw new Error(`${name} must be a finite number.`);
  const number=Number(value);
  if(number<min||number>max||(integer&&!Number.isSafeInteger(number)))throw new Error(`${name} must be ${integer?'a whole number ':''}between ${min} and ${max}.`);
  return number;
}
function holdingDate(value,name,{optional=false,today}={}){
  const raw=holdingText(value,name,10);
  if(optional&&!raw)return '';
  const millis=Date.parse(raw+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(millis)||new Date(millis).toISOString().slice(0,10)!==raw||raw<'1900-01-01')throw new Error(`${name} must be a valid calendar date.`);
  if(today&&raw>today)throw new Error(`${name} cannot be in the future.`);
  return raw;
}
function holdingTimestamp(value,name){
  const raw=holdingText(value,name,40);
  if(!raw)return '';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw)||!Number.isFinite(Date.parse(raw)))throw new Error(`${name} must be a UTC timestamp.`);
  holdingDate(raw.slice(0,10),name);
  return new Date(raw).toISOString();
}
function holdingTodayOption(today){return holdingDate(today??holdingToday(),'Today');}

/** Normalise a single buy lot. Empty IDs are allowed before the UI first saves it. */
export function validatePosition(input,{today}={}){
  if(!holdingObject(input))throw new Error('A holding must be an object.');
  today=holdingTodayOption(today);
  const rawSymbol=holdingText(input.symbol,'Symbol',32).toUpperCase();
  const market=input.market??(/^(?:\d{4})(?:\.KL)?$/.test(rawSymbol)?'MY':'US');
  if(!['MY','US'].includes(market))throw new Error('Choose Bursa Malaysia or US.');
  const symbol=market==='MY'?rawSymbol.replace(/\.KL$/,''):rawSymbol.replace(/\./g,'-');
  if(market==='MY'&&!/^\d{4}$/.test(symbol))throw new Error('Bursa holdings require a four-digit ordinary-share or ETF code. Warrants are not supported.');
  if(market==='US'&&(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||/\.KL$/.test(rawSymbol)||/[-.](?:W|WS|WT|U|R)$/.test(symbol)))throw new Error('Enter a supported US stock or ETF ticker. Warrants, rights and units are not supported.');
  const currency=market==='MY'?'MYR':'USD';
  if(input.currency!==undefined&&input.currency!==currency)throw new Error('The holding currency must match its selected market.');
  const assetType=input.assetType??'Stock',style=input.style??'swing',tradeType=input.tradeType??'actual';
  if(!['Stock','ETF'].includes(assetType))throw new Error('Holdings support ordinary stocks and ETFs only.');
  if(!['short','swing','long'].includes(style))throw new Error('Choose short, swing or long trading style.');
  if(!['actual','paper'].includes(tradeType))throw new Error('Choose actual or paper trade.');
  const position={id:holdingId(input.id,'Holding ID'),symbol,market,currency,assetType,
    entryDate:holdingDate(input.entryDate,'Entry date',{today}),
    entryPrice:holdingNumber(input.entryPrice,'Entry price',{min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}),
    quantity:holdingNumber(input.quantity,'Quantity',{min:1,max:HOLDINGS_LIMITS.maxQuantity,integer:true}),
    entryFees:holdingNumber(input.entryFees,'Entry fees',{min:0,max:HOLDINGS_LIMITS.maxFees,fallback:0}),style,tradeType,
    stopPrice:holdingNumber(input.stopPrice,'Stop price',{optional:true,min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}),
    target1:holdingNumber(input.target1,'First target',{optional:true,min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}),
    target2:holdingNumber(input.target2,'Second target',{optional:true,min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}),
    initialStopPrice:null,
    thesis:holdingText(input.thesis,'Thesis',2000),notes:holdingText(input.notes,'Notes',2000),
    exits:[],createdAt:holdingTimestamp(input.createdAt,'Created timestamp'),updatedAt:holdingTimestamp(input.updatedAt,'Updated timestamp')};
  // The UI preserves this original baseline when the current stop is edited.
  // Explicit null records that the original protective stop was not supplied.
  position.initialStopPrice=Object.hasOwn(input,'initialStopPrice')?holdingNumber(input.initialStopPrice,'Original stop price',{optional:true,min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}):position.stopPrice;
  if(position.target1!==null&&position.target2!==null&&position.target2<=position.target1)throw new Error('The second target must be above the first target.');
  if(position.entryPrice*position.quantity+position.entryFees>HOLDINGS_LIMITS.maxNotional)throw new Error('The holding cost exceeds the supported amount.');
  if(input.exits!==undefined&&!Array.isArray(input.exits))throw new Error('Exits must be a list.');
  if((input.exits?.length||0)>HOLDINGS_LIMITS.maxExitsPerPosition)throw new Error('Use at most 200 exits per buy lot.');
  const ids=new Set();let sold=0;
  position.exits=(input.exits||[]).map(exit=>{
    if(!holdingObject(exit))throw new Error('Each exit must be an object.');
    const clean={id:holdingId(exit.id,'Exit ID'),date:holdingDate(exit.date,'Exit date',{today}),quantity:holdingNumber(exit.quantity,'Exit quantity',{min:1,max:HOLDINGS_LIMITS.maxQuantity,integer:true}),price:holdingNumber(exit.price,'Exit price',{min:0,max:HOLDINGS_LIMITS.maxPrice}),fees:holdingNumber(exit.fees,'Exit fees',{min:0,max:HOLDINGS_LIMITS.maxFees,fallback:0})};
    if(clean.date<position.entryDate)throw new Error('An exit cannot be earlier than the entry date.');
    if(clean.id&&ids.has(clean.id))throw new Error('Exit IDs must be unique within each holding.');
    ids.add(clean.id);sold+=clean.quantity;
    if(sold>position.quantity)throw new Error('Exit quantity exceeds the shares held.');
    if(clean.price*clean.quantity+clean.fees>HOLDINGS_LIMITS.maxNotional)throw new Error('The exit value exceeds the supported amount.');
    return clean;
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return position;
}

/** Values remain in the lot's own quote currency; no FX conversion is inferred. */
export function positionTotals(input,{price=null,today}={}){
  const position=validatePosition(input,{today});
  if(price!==null&&price!==undefined&&(!holdingFinite(price)||price<=0||price>HOLDINGS_LIMITS.maxPrice))throw new Error('The reference price must be a positive finite number or unavailable.');
  const originalQuantity=position.quantity,soldQuantity=position.exits.reduce((total,exit)=>total+exit.quantity,0),remainingQuantity=originalQuantity-soldQuantity;
  const entryCost=position.entryPrice*originalQuantity+position.entryFees;
  const allocatedEntryFees=position.entryFees*soldQuantity/originalQuantity,remainingEntryFees=position.entryFees-allocatedEntryFees;
  const exitFees=position.exits.reduce((total,exit)=>total+exit.fees,0);
  const realizedPnlGross=position.exits.reduce((total,exit)=>total+(exit.price-position.entryPrice)*exit.quantity,0);
  const realizedPnl=realizedPnlGross-allocatedEntryFees-exitFees;
  const remainingCostBasis=position.entryPrice*remainingQuantity+remainingEntryFees;
  const hasPrice=holdingFinite(price)&&price>0;
  const marketValue=remainingQuantity===0?0:hasPrice?price*remainingQuantity:null;
  const unrealizedPnlGross=remainingQuantity===0?0:hasPrice?(price-position.entryPrice)*remainingQuantity:null;
  // Remaining purchase fees are known. Future exit fees, taxes and slippage are
  // unknown and deliberately excluded from this indicative unrealised value.
  const unrealizedPnl=marketValue===null?null:marketValue-remainingCostBasis;
  const initialRisk=position.initialStopPrice!==null&&position.initialStopPrice<position.entryPrice?(position.entryPrice-position.initialStopPrice)*originalQuantity+position.entryFees:null;
  return {status:remainingQuantity===0?'closed':'open',originalQuantity,soldQuantity,remainingQuantity,
    entryCost:holdingRound(entryCost),allocatedEntryFees:holdingRound(allocatedEntryFees),remainingEntryFees:holdingRound(remainingEntryFees),remainingCostBasis:holdingRound(remainingCostBasis),exitFees:holdingRound(exitFees),
    realizedPnlGross:holdingRound(realizedPnlGross),realizedPnl:holdingRound(realizedPnl),marketValue:marketValue===null?null:holdingRound(marketValue),unrealizedPnlGross:unrealizedPnlGross===null?null:holdingRound(unrealizedPnlGross),unrealizedPnl:unrealizedPnl===null?null:holdingRound(unrealizedPnl),
    totalPnl:unrealizedPnl===null?null:holdingRound(realizedPnl+unrealizedPnl),breakEvenPrice:remainingQuantity>0?holdingRound(remainingCostBasis/remainingQuantity):null,initialRisk:initialRisk===null?null:holdingRound(initialRisk),
    realizedPnlPct:soldQuantity>0?holdingRound(realizedPnl/(position.entryPrice*soldQuantity+allocatedEntryFees)*100):null,
    unrealizedPnlPct:unrealizedPnl===null||remainingQuantity===0?null:holdingRound(unrealizedPnl/remainingCostBasis*100),
    realizedRMultiple:remainingQuantity===0&&initialRisk>0?holdingRound(realizedPnl/initialRisk):null};
}

/** Closed allowlist prevents unrelated keys or credentials entering a backup. */
export function validateHoldingsBook(input,{today}={}){
  if(!holdingObject(input)||input.schemaVersion!==1||!Array.isArray(input.positions))throw new Error('Expected a version 1 holdings backup with a positions list.');
  if(input.positions.length>HOLDINGS_LIMITS.maxPositions)throw new Error('Use at most 500 buy lots.');
  today=holdingTodayOption(today);
  const ids=new Set(),exitIds=new Set();
  const positions=input.positions.map(raw=>{
    const position=validatePosition(raw,{today});
    if(!position.id||ids.has(position.id))throw new Error('Every saved holding needs a unique non-empty ID.');
    ids.add(position.id);
    for(const exit of position.exits){if(!exit.id||exitIds.has(exit.id))throw new Error('Every saved exit needs a unique non-empty ID.');exitIds.add(exit.id);}
    return position;
  });
  const book={schemaVersion:1,positions};
  if(holdingBytes(JSON.stringify(book))>HOLDINGS_LIMITS.maxBackupBytes)throw new Error('Holdings data exceeds the 2 MB limit.');
  return book;
}

export function parseHoldingsBackup(text,options={}){
  if(typeof text!=='string'||text.length>HOLDINGS_LIMITS.maxBackupBytes||holdingBytes(text)>HOLDINGS_LIMITS.maxBackupBytes)throw new Error('Holdings backup exceeds the 2 MB limit.');
  let input;try{input=JSON.parse(text);}catch{throw new Error('Choose a valid holdings JSON backup.');}
  return validateHoldingsBook(input,options);
}

export function serializeHoldingsBook(book,options={}){
  const text=JSON.stringify(validateHoldingsBook(book,options),null,2);
  if(holdingBytes(text)>HOLDINGS_LIMITS.maxBackupBytes)throw new Error('Holdings backup exceeds the 2 MB limit.');
  return text;
}

/** Summary groups paper/actual and MYR/USD separately; quote totals are partial. */
export function summarizeHoldings(book,{quotes={},today}={}){
  const valid=validateHoldingsBook(book,{today});
  const blank=()=>({openPositions:0,closedPositions:0,remainingCostBasis:0,realizedPnl:0,quotedOpenPositions:0,unquotedOpenPositions:0,quotedMarketValue:0,quotedUnrealizedPnl:0});
  const summary={actual:{MYR:blank(),USD:blank()},paper:{MYR:blank(),USD:blank()}};
  for(const position of valid.positions){
    const value=quotes?.[position.id],price=holdingFinite(value)&&value>0&&value<=HOLDINGS_LIMITS.maxPrice?value:null;
    const totals=positionTotals(position,{price,today}),group=summary[position.tradeType][position.currency];
    group.realizedPnl+=totals.realizedPnl;group.remainingCostBasis+=totals.remainingCostBasis;
    if(totals.status==='closed')group.closedPositions++;
    else {group.openPositions++;if(price===null)group.unquotedOpenPositions++;else {group.quotedOpenPositions++;group.quotedMarketValue+=totals.marketValue;group.quotedUnrealizedPnl+=totals.unrealizedPnl;}}
  }
  for(const types of Object.values(summary))for(const group of Object.values(types))for(const field of ['remainingCostBasis','realizedPnl','quotedMarketValue','quotedUnrealizedPnl'])group[field]=holdingRound(group[field]);
  return summary;
}

/** Legacy closed trades remain legacy records: their recording date is not an execution date. */
export function normalizeLegacyTrades(input){
  if(!Array.isArray(input))throw new Error('Legacy trades must be a list.');
  if(input.length>10000)throw new Error('Legacy trade list exceeds the supported size.');
  const records=[],rejected=[];
  for(const [index,item]of input.entries()){
    try{
      if(!holdingObject(item))throw new Error('Trade must be an object.');
      const symbol=holdingText(item.symbol,'Symbol',32).toUpperCase(),currency=item.currency;
      if(!symbol||!['MYR','USD'].includes(currency))throw new Error('Legacy symbol or currency is missing.');
      const entry=holdingNumber(item.entry,'Entry price',{min:Number.MIN_VALUE,max:HOLDINGS_LIMITS.maxPrice}),exit=holdingNumber(item.exit,'Exit price',{min:0,max:HOLDINGS_LIMITS.maxPrice}),quantity=holdingNumber(item.quantity,'Quantity',{min:1,max:HOLDINGS_LIMITS.maxQuantity,integer:true}),fees=holdingNumber(item.fees,'Fees',{min:0,max:HOLDINGS_LIMITS.maxFees,fallback:0});
      const recordedAt=holdingText(item.date,'Recorded date',40);
      if(recordedAt&&!Number.isFinite(Date.parse(recordedAt)))throw new Error('Legacy recorded date is invalid.');
      records.push({id:'legacy_'+index,symbol,currency,entry,exit,quantity,fees,notes:holdingText(item.notes,'Notes',2000),recordedAt,entryDate:null,exitDate:null,realizedPnl:holdingRound((exit-entry)*quantity-fees)});
    }catch(error){rejected.push({index,reason:error.message});}
  }
  return {records,rejected};
}
