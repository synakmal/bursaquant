import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDINGS_LIMITS,validatePosition,positionTotals,validateHoldingsBook,parseHoldingsBackup,serializeHoldingsBook,summarizeHoldings,normalizeLegacyTrades} from '../src/holdings-model.js';
const today='2026-10-30',options={today};
const lot=(changes={})=>({id:'lot_1',symbol:'1155',market:'MY',currency:'MYR',entryDate:'2026-10-01',entryPrice:10,quantity:1000,entryFees:20,style:'swing',stopPrice:9,target1:12,target2:14,exits:[],...changes});
const sale=(changes={})=>({id:'sale_1',date:'2026-10-20',quantity:400,price:12,fees:8,...changes});
const book=positions=>({schemaVersion:1,positions});

test('normalisation infers currency, preserves zero fees and strips unknown private fields',()=>{
  const value=validatePosition(lot({symbol:'1155.KL',currency:undefined,entryPrice:'10',quantity:'1000',entryFees:'0',accessCode:'private',settings:{capital:99}}),options);
  assert.equal(value.symbol,'1155');assert.equal(value.currency,'MYR');assert.equal(value.quantity,1000);assert.equal(value.entryFees,0);assert.equal(value.tradeType,'actual');assert.equal(value.initialStopPrice,9);
  assert.ok(!Object.hasOwn(value,'accessCode'));assert.ok(!Object.hasOwn(value,'settings'));
  assert.equal(validatePosition(lot({symbol:'BRK.B',market:'US',currency:undefined}),options).symbol,'BRK-B');
});
test('cash currency, unsupported security types and derivative codes are rejected',()=>{
  for(const change of [{currency:'USD'},{assetType:'Warrant'},{symbol:'5357CC'},{symbol:'AAPL',market:'XX'},{symbol:'ABC-W',market:'US',currency:'USD'},{symbol:'1155.KL',market:'US',currency:'USD'}])assert.throws(()=>validatePosition(lot(change),options));
});
test('whole-share quantities and bounded positive entry values reject accidental invalid inputs',()=>{
  for(const change of [{quantity:0},{quantity:1.5},{quantity:true},{quantity:''},{entryPrice:0},{entryPrice:Infinity},{entryPrice:NaN},{entryPrice:true},{entryFees:-1},{entryFees:''},{quantity:1e10},{entryPrice:1e9,quantity:1e9}])assert.throws(()=>validatePosition(lot(change),options));
});
test('calendar dates reject impossible dates, future records and exits before entry',()=>{
  for(const entryDate of ['2026-02-30','2026-13-01','2026-10-31','1899-12-31',''])assert.throws(()=>validatePosition(lot({entryDate}),options));
  assert.throws(()=>validatePosition(lot({exits:[sale({date:'2026-09-30'})]}),options),/earlier/);
  assert.throws(()=>validatePosition(lot({exits:[sale({date:'2026-10-31'})]}),options),/future/);
  assert.throws(()=>validatePosition(lot({tradeType:'paper',entryDate:'2026-11-01'}),options),/future/);
  assert.equal(validatePosition(lot({entryDate:'2024-02-29'}),options).entryDate,'2024-02-29');
  assert.throws(()=>validatePosition(lot({createdAt:'2026-02-30T12:00:00Z'}),options),/calendar/);
});
test('style and paper/actual types are explicit; protective levels can be unknown or trail above entry',()=>{
  for(const style of ['short','swing','long'])assert.equal(validatePosition(lot({style}),options).style,style);
  assert.throws(()=>validatePosition(lot({style:'forever'}),options));assert.throws(()=>validatePosition(lot({tradeType:'broker'}),options));
  const unknown=validatePosition(lot({stopPrice:'',target1:null,target2:'',initialStopPrice:null}),options);
  assert.equal(unknown.stopPrice,null);assert.equal(unknown.target1,null);assert.equal(unknown.initialStopPrice,null);
  assert.equal(validatePosition(lot({stopPrice:11,initialStopPrice:9}),options).stopPrice,11);
  assert.throws(()=>validatePosition(lot({target1:12,target2:11}),options));
  assert.throws(()=>validatePosition(lot({target1:12,target2:12}),options),/above/);
});
test('partial sale allocates purchase fees proportionately and retains remaining cost',()=>{
  const p=lot({exits:[sale()]}),totals=positionTotals(p,{price:11,today});
  assert.equal(totals.remainingQuantity,600);assert.equal(totals.soldQuantity,400);assert.equal(totals.allocatedEntryFees,8);assert.equal(totals.remainingEntryFees,12);
  assert.equal(totals.realizedPnlGross,800);assert.equal(totals.realizedPnl,784);assert.equal(totals.remainingCostBasis,6012);assert.equal(totals.marketValue,6600);assert.equal(totals.unrealizedPnl,588);assert.equal(totals.totalPnl,1372);assert.equal(totals.breakEvenPrice,10.02);
});
test('multiple sales and a final close charge all entry and exit fees exactly once',()=>{
  const totals=positionTotals(lot({exits:[sale(),sale({id:'sale_2',date:'2026-10-25',quantity:600,price:9,fees:12})]}),options);
  assert.equal(totals.status,'closed');assert.equal(totals.realizedPnlGross,200);assert.equal(totals.realizedPnl,160);assert.equal(totals.allocatedEntryFees,20);assert.equal(totals.remainingEntryFees,0);assert.equal(totals.remainingCostBasis,0);assert.equal(totals.unrealizedPnl,0);assert.equal(totals.marketValue,0);assert.equal(totals.totalPnl,160);assert.equal(totals.breakEvenPrice,null);
});
test('zero-price write-off and entry-only open positions calculate without a fabricated quote',()=>{
  const writtenOff=positionTotals(lot({exits:[sale({quantity:1000,price:0,fees:0})]}),options);
  assert.equal(writtenOff.realizedPnl,-10020);assert.equal(writtenOff.status,'closed');
  const open=positionTotals(lot(),options);assert.equal(open.unrealizedPnl,null);assert.equal(open.marketValue,null);assert.equal(open.totalPnl,null);assert.equal(open.realizedPnl,0);
  assert.throws(()=>positionTotals(lot(),{price:0,today}));assert.throws(()=>positionTotals(lot(),{price:'11',today}));
});
test('exits cannot oversell, duplicate IDs, carry negative fees or consume a fractional share',()=>{
  for(const exits of [[sale({quantity:1001})],[sale(),sale({quantity:700})],[sale(),sale({quantity:100})],[sale({fees:-1})],[sale({quantity:.5})],[sale({price:-1})]])assert.throws(()=>validatePosition(lot({exits}),options));
});
test('validation does not mutate source data and returns exits sorted by actual date',()=>{
  const input=lot({exits:[sale({id:'late',date:'2026-10-25'}),sale({id:'early',date:'2026-10-05',quantity:100})]});const original=JSON.stringify(input);
  const value=validatePosition(input,options);assert.equal(JSON.stringify(input),original);assert.equal(value.exits[0].id,'early');assert.notEqual(value.exits,input.exits);
});
test('original risk baseline survives trailing-stop edits and remains unknown when not recorded',()=>{
  const p=validatePosition(lot(),options),moved=validatePosition({...p,stopPrice:11},options);
  assert.equal(positionTotals(p,options).initialRisk,1020);assert.equal(positionTotals(moved,options).initialRisk,1020);
  assert.equal(positionTotals(lot({stopPrice:11,initialStopPrice:null}),options).initialRisk,null);
  assert.equal(positionTotals(lot({stopPrice:11,initialStopPrice:11}),options).initialRisk,null);
});
test('closed R multiple uses the original recorded risk while a partial close does not imply final R',()=>{
  const closed=positionTotals(lot({stopPrice:11,initialStopPrice:9,exits:[sale({quantity:1000,price:12,fees:20})]}),options);
  assert.ok(Math.abs(closed.realizedRMultiple-1960/1020)<1e-9);
  assert.equal(positionTotals(lot({exits:[sale()]}),options).realizedRMultiple,null);
});
test('saved books require unique holding and exit IDs with known version and bounded list sizes',()=>{
  assert.throws(()=>validateHoldingsBook({schemaVersion:2,positions:[]},options));assert.throws(()=>validateHoldingsBook(book([lot({id:''})]),options));
  assert.throws(()=>validateHoldingsBook(book([lot(),lot()]),options));assert.throws(()=>validateHoldingsBook(book([lot({exits:[sale({id:''})]})]),options));
  assert.throws(()=>validateHoldingsBook(book([lot(),lot({id:'lot_2',exits:[sale()]}),lot({id:'lot_3',exits:[sale()]})]),options));
  assert.throws(()=>validateHoldingsBook(book(Array(HOLDINGS_LIMITS.maxPositions+1).fill(lot())),options));
});
test('JSON backups round-trip only allowlisted fields and reject malformed or oversized imports',()=>{
  const source=book([lot({exits:[sale()]})]);source.accessCode='never-export';source.positions[0].apiKey='never-export';
  const json=serializeHoldingsBook(source,options);assert.doesNotMatch(json,/never-export|accessCode|apiKey/);assert.deepEqual(parseHoldingsBackup(json,options),validateHoldingsBook(source,options));
  assert.throws(()=>parseHoldingsBackup('{oops',options));assert.throws(()=>parseHoldingsBackup(JSON.stringify({schemaVersion:1,positions:'bad'}),options));assert.throws(()=>parseHoldingsBackup(' '.repeat(HOLDINGS_LIMITS.maxBackupBytes+1),options));
});
test('multibyte content counts against backup bytes rather than only character count',()=>{
  const json='"'+'😀'.repeat(510000)+'"';assert.ok(json.length<HOLDINGS_LIMITS.maxBackupBytes);assert.throws(()=>parseHoldingsBackup(json,options),/2 MB/);
});
test('summaries separate currencies and paper records, showing incomplete quote coverage',()=>{
  const data=book([lot(),lot({id:'us',symbol:'AAPL',market:'US',currency:'USD',quantity:10}),lot({id:'paper',tradeType:'paper'}),lot({id:'closed',exits:[sale({id:'final',quantity:1000})]})]);
  const stats=summarizeHoldings(data,{quotes:{lot_1:11},today});
  assert.equal(stats.actual.MYR.openPositions,1);assert.equal(stats.actual.MYR.closedPositions,1);assert.equal(stats.actual.MYR.quotedMarketValue,11000);assert.equal(stats.actual.MYR.quotedUnrealizedPnl,980);assert.equal(stats.actual.USD.unquotedOpenPositions,1);assert.equal(stats.actual.USD.quotedMarketValue,0);assert.equal(stats.paper.MYR.openPositions,1);assert.equal(Object.hasOwn(stats,'totalPnl'),false);
});
test('legacy closed trades keep recording dates without inventing entry/exit dates or silently importing invalid rows',()=>{
  const result=normalizeLegacyTrades([{date:'2026-10-01',symbol:'aapl',currency:'USD',entry:10,exit:12,quantity:10,fees:1,notes:'old',token:'never'},{symbol:'bad',currency:'MYR',entry:10,exit:12,quantity:-1}]);
  assert.equal(result.records.length,1);assert.equal(result.rejected.length,1);assert.equal(result.records[0].realizedPnl,19);assert.equal(result.records[0].recordedAt,'2026-10-01');assert.equal(result.records[0].entryDate,null);assert.equal(result.records[0].exitDate,null);assert.ok(!Object.hasOwn(result.records[0],'token'));
});
