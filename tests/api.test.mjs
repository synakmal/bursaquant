import test from 'node:test';
import assert from 'node:assert/strict';
import market from '../api/market.js';
import search from '../api/search.js';
import health from '../api/health.js';
import {authorize} from '../lib/market-shared.js';

function response(){return {statusCode:0,headers:{},text:'',setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},end(body=''){this.text=body;return this;},body(){return this.text?JSON.parse(this.text):null;}};}
function configure(t,values={}){
 const names=['BQ_DATA_PROVIDER','BQ_ENABLE_YAHOO','BQ_ACCESS_TOKEN','VERCEL','TWELVE_DATA_API_KEY','ISAHAM_API_TOKEN'];
 const old=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;
 for(const name of names)delete process.env[name];for(const [name,value]of Object.entries(values))process.env[name]=value;
 t.after(()=>{globalThis.fetch=originalFetch;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}});
}
const request=(query={},extra={})=>({method:'GET',query,headers:{},...extra});

test('hosted Yahoo requests require configured private gateway code; local trusted requests can proceed',t=>{
 configure(t,{VERCEL:'1'});let res=response();assert.equal(authorize(request(),res,{requirePrivate:true}),false);assert.equal(res.statusCode,503);assert.equal(res.body().error.code,'ACCESS_CODE_NOT_CONFIGURED');
 res=response();assert.equal(authorize(request({}, {bqLocal:true}),res,{requirePrivate:true}),false);
 delete process.env.VERCEL;res=response();assert.equal(authorize(request({}, {bqLocal:true}),res,{requirePrivate:true}),true);
 process.env.BQ_ACCESS_TOKEN='test-access-code';res=response();assert.equal(authorize(request(),res,{requirePrivate:true}),false);assert.equal(res.statusCode,403);
 res=response();assert.equal(authorize(request({}, {headers:{'x-bq-access-token':'test-access-code'}}),res,{requirePrivate:true}),true);
});

test('market handler rejects unknown providers, wrong market/provider pairs and unauthenticated requests without fetching',async t=>{
 configure(t,{BQ_DATA_PROVIDER:'yahoo'});let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected request');};
 for(const [query,status,code]of [
  [{market:'US',symbol:'AAPL',provider:'arbitrary'},400,'INVALID_PROVIDER'],
  [{market:'XX',symbol:'AAPL'},400,'INVALID_MARKET'],
  [{market:'MY',symbol:'1155',provider:'twelvedata'},400,'PROVIDER_MARKET_MISMATCH'],
  [{market:'US',symbol:'AAPL',provider:'yahoo'},503,'ACCESS_CODE_NOT_CONFIGURED']
 ]){const res=response();await market(request(query),res);assert.equal(res.statusCode,status);assert.equal(res.body().error.code,code);}
 assert.equal(calls,0);
});

test('health reports capability booleans but never includes configured credentials or access code',async t=>{
 configure(t,{BQ_DATA_PROVIDER:'yahoo',BQ_ACCESS_TOKEN:'health-test-secret',TWELVE_DATA_API_KEY:'twelve-test-secret',ISAHAM_API_TOKEN:'isaham-test-secret'});
 const res=response();await health(request(),res);assert.equal(res.statusCode,200);assert.equal(res.body().defaultProvider,'yahoo');assert.equal(res.body().accessCodeRequired,true);assert.equal(res.body().providers.yahoo,true);
 for(const secret of ['health-test-secret','twelve-test-secret','isaham-test-secret'])assert.equal(res.text.includes(secret),false);
});

test('search validates provider/market and applies private access checks before fetching',async t=>{
 configure(t,{BQ_DATA_PROVIDER:'yahoo',BQ_ACCESS_TOKEN:'search-test-secret'});let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected request');};
 for(const [query,status,code]of [
  [{q:'Apple',provider:'bad'},400,'INVALID_PROVIDER'],
  [{q:'Apple',market:'bad'},400,'INVALID_MARKET'],
  [{q:'Apple',provider:'yahoo'},403,'ACCESS_DENIED'],
  [{q:'A',provider:'yahoo'},400,'INVALID_QUERY']
 ]){const res=response();await search(request(query),res);assert.equal(res.statusCode,status);assert.equal(res.body().error.code,code);}
 assert.equal(calls,0);
});

test('market refuses to analyse a provider response with fewer than55 completed candles',async t=>{
 configure(t,{BQ_DATA_PROVIDER:'yahoo',BQ_ACCESS_TOKEN:'market-test-secret'});let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({chart:{result:[{meta:{symbol:'SMALL',currency:'USD',exchangeTimezoneName:'America/New_York'},timestamp:[Date.parse('2026-01-02T14:30:00Z')/1000],indicators:{quote:[{open:[10],high:[12],low:[9],close:[11],volume:[100]}]}}],error:null}}),{status:200});};
 const res=response();await market(request({market:'US',symbol:'SMALL',provider:'yahoo',interval:'1day'},{headers:{'x-bq-access-token':'market-test-secret'}}),res);
 assert.equal(calls,1);assert.equal(res.statusCode,422);assert.equal(res.body().error.code,'INSUFFICIENT_BARS');assert.equal(res.body().bars,undefined);
});
