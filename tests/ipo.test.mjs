import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateIpoMetrics,compareIpoPeers,validateIpoDossier,parseIpoImport,safeIpoSourceUrl} from '../src/ipo.js';

const entity=(overrides={})=>({name:'Research company',currency:'MYR',market:'MY',stage:'prelisting',sourceStatus:'final',sourceUrl:'https://www.example.com/prospectus.pdf',sourceDate:'2026-10-30',periodEnd:'2025-12-31',basis:'audited',price:2,shares:100,revenue:80,profit:10,equity:50,debt:20,cash:5,operatingCashFlow:8,...overrides});

test('IPO ratios use millions consistently and diluted post-IPO share count',()=>{
  const m=calculateIpoMetrics(entity());
  assert.deepEqual(m,{marketCap:200,eps:.1,pe:20,ps:2.5,netDebt:15,enterpriseValue:215,evRevenue:2.6875,netMargin:12.5,returnOnClosingEquity:20,cashConversion:80,peStatus:'Available'});
});
test('missing cash and debt stay unknown rather than being assumed zero',()=>{
  const m=calculateIpoMetrics({price:'2',shares:'100',profit:'',revenue:null,debt:'',cash:0,equity:0,operatingCashFlow:''});
  assert.equal(m.marketCap,200);assert.equal(m.eps,null);assert.equal(m.pe,null);assert.equal(m.ps,null);assert.equal(m.netDebt,null);assert.equal(m.enterpriseValue,null);assert.equal(m.evRevenue,null);assert.equal(m.netMargin,null);assert.equal(m.returnOnClosingEquity,null);
});
test('loss-making, zero-profit, zero-revenue and net-cash cases avoid misleading multiples',()=>{
  const loss=calculateIpoMetrics(entity({profit:-5,revenue:0,cash:300}));
  assert.equal(loss.eps,-.05);assert.equal(loss.pe,null);assert.match(loss.peStatus,/N\/M/);assert.equal(loss.ps,null);assert.equal(loss.enterpriseValue,-80);assert.equal(loss.evRevenue,null);assert.equal(loss.cashConversion,null);
  assert.equal(calculateIpoMetrics(entity({profit:0})).pe,null);
});
test('peer medians exclude mismatched periods/currency, draft sources and unconfirmed comparable businesses',()=>{
  const peers=[entity({name:'Peer A',comparable:true,price:1}),entity({name:'Peer B',comparable:true,price:3}),entity({name:'Wrong FY',comparable:true,price:100,periodEnd:'2024-12-31'}),entity({name:'Draft',comparable:true,sourceStatus:'draft'}),entity({name:'USD peer',comparable:true,currency:'USD'}),entity({name:'Not comparable',comparable:false})];
  const result=compareIpoPeers(entity({peers}));
  assert.equal(result.eligiblePeers,2);assert.equal(result.metrics.find(m=>m.key==='pe').median,20);assert.equal(result.metrics.find(m=>m.key==='pe').differencePct,0);assert.equal(result.metrics.find(m=>m.key==='pe').count,2);
  assert.match(result.rows[2].reasons.join(','),/year-end differs/);assert.match(result.rows[3].reasons.join(','),/final\/registered/);assert.match(result.rows[4].reasons.join(','),/currency differs/);
});
test('peer non-positive profit is excluded from P/E median but meaningful sales multiple remains',()=>{
  const result=compareIpoPeers(entity({peers:[entity({name:'Loss peer',comparable:true,profit:-1})]}));
  assert.equal(result.eligiblePeers,1);assert.equal(result.metrics.find(m=>m.key==='pe').count,0);assert.equal(result.metrics.find(m=>m.key==='ps').count,1);assert.equal(result.metrics.find(m=>m.key==='pe').differencePct,null);
});
test('subject must have source-backed annual audited data before a peer median is produced',()=>{
  const result=compareIpoPeers(entity({sourceUrl:'',peers:[entity({comparable:true})]}));
  assert.equal(result.eligiblePeers,0);assert.equal(result.metrics.find(m=>m.key==='pe').median,null);assert.match(result.subjectGaps.join(','),/source link missing/);
});
test('source URLs accept only explicit web links without embedded credentials',()=>{
  for(const bad of ['javascript:alert(1)','data:text/html,<script>','file:///C:/secret','https://user:pass@example.com/','/relative','//evil.example'])assert.equal(safeIpoSourceUrl(bad),null);
  assert.equal(safeIpoSourceUrl('https://example.com/report?a=1&b=2'),'https://example.com/report?a=1&b=2');assert.equal(safeIpoSourceUrl(''),'');
});
test('dossier validation preserves incomplete research and strips unrecognised credential fields',()=>{
  const record=validateIpoDossier({name:'New IPO',price:'',profit:null,gatewayAccessCode:'secret',peers:[]});
  assert.equal(record.price,null);assert.equal(record.profit,null);assert.equal(record.sourceStatus,'unverified');assert.equal(record.id,'');assert.equal('gatewayAccessCode'in record,false);
  assert.equal(validateIpoDossier(entity({name:'<img src=x onerror=alert(1)>'})).name,'<img src=x onerror=alert(1)>');
});
test('invalid financial inputs, unrealistic payloads, dates and inconsistent offer percentages are rejected',()=>{
  for(const change of [{price:0},{shares:-10},{cash:-1},{revenue:'oops'},{profit:true},{profit:Infinity},{profit:1e15},{primaryPct:80,secondaryPct:30},{sourceDate:'2026-02-30'},{periodEnd:'2025-2-1'},{sourceUrl:'javascript:alert(1)'},{name:'x'.repeat(161)},{currency:'BTC'},{sourceStatus:'verified-by-ai'},{peers:Array(11).fill(entity())}])assert.throws(()=>validateIpoDossier(entity(change)));
  assert.doesNotThrow(()=>validateIpoDossier(entity({primaryPct:70,secondaryPct:30,profit:-1,equity:-5,operatingCashFlow:-2})));
});
test('backups are bounded, versioned and validated atomically',()=>{
  const backup=JSON.stringify({schemaVersion:1,dossiers:[entity({id:'ipo_1',peers:[entity({name:'Peer',comparable:true})]})]});
  const [record]=parseIpoImport(backup);assert.equal(record.id,'ipo_1');assert.equal(record.peers[0].comparable,true);assert.equal(record.schemaVersion,1);
  for(const text of ['{',JSON.stringify({schemaVersion:2,dossiers:[]}),JSON.stringify({schemaVersion:1,dossiers:[entity({id:'a'}),entity({id:'a'})]}),JSON.stringify({schemaVersion:1,dossiers:[entity({id:'"><script>'})]}),JSON.stringify({schemaVersion:1,dossiers:[entity(),entity({price:'NaN'})]}),' '.repeat(1000001)])assert.throws(()=>parseIpoImport(text));
});
