import test from 'node:test';
import assert from 'node:assert/strict';
import {checkIsahamAccess} from '../lib/provider-status.js';
import handler from '../api/provider-status.js';

const token='private-provider-token-never-return-me';
const jsonResponse=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const success={auth:true,status:'success',data:{tenant_id:'private-tenant',tier:'free',credits_used:0,credits_limit:500,credits_remaining:500,month:'2026-10',unknown:'private-account-field'}};

test('usage authentication checks only the documented zero-credit endpoint and returns a whitelisted account summary',async()=>{
  let calls=0;
  const result=await checkIsahamAccess({token,fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://api.isaham.my/v1/account/usage');assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    return jsonResponse(success,200,{server:'cloudflare'});
  }});
  assert.equal(calls,1);assert.equal(result.check.authAccepted,true);assert.equal(result.check.upstreamHTTPStatus,200);assert.equal(result.check.server,'cloudflare');
  assert.deepEqual(result.check.account,{tier:'free',creditsUsed:0,creditsLimit:500,creditsRemaining:500,month:'2026-10'});
  for(const forbidden of [token,'private-tenant','private-account-field','tenant_id'])assert.equal(JSON.stringify(result).includes(forbidden),false);
});

test('HTTP 200 without the recognised authenticated success envelope cannot confirm access',async()=>{
  for(const payload of [{...success,auth:false},{...success,status:'error'},{auth:true,status:'success',data:null},[]]){
    const result=await checkIsahamAccess({token,fetcher:async()=>jsonResponse(payload)});
    assert.equal(result.check.authAccepted,false);assert.equal(result.check.account,null);
  }
});

test('documented JSON authentication, tier, quota and rate-limit failures remain distinct without reflecting provider messages',async()=>{
  for(const [code,status]of [['UNAUTHORIZED',401],['TIER_UPGRADE_REQUIRED',403],['QUOTA_EXCEEDED',403],['RATE_LIMITED',429]]){
    let calls=0;const result=await checkIsahamAccess({token,fetcher:async()=>{calls++;return jsonResponse({auth:false,status:'error',error:{code,message:'Echo '+token}},status);}});
    assert.equal(calls,1);assert.equal(result.check.providerErrorCode,code);assert.equal(result.check.upstreamHTTPStatus,status);assert.equal(result.check.authAccepted,false);assert.equal(result.check.restriction,'json-provider-error');
    assert.equal(JSON.stringify(result).includes(token),false);assert.equal(JSON.stringify(result).includes('Echo'),false);
  }
});

test('unknown error codes and headers cannot reflect a secret or arbitrary provider text',async()=>{
  const result=await checkIsahamAccess({token,fetcher:async()=>jsonResponse({error:{code:token,message:token}},403,{server:token})});
  assert.equal(result.check.providerErrorCode,'UNKNOWN_PROVIDER_ERROR');assert.equal(result.check.server,'other');assert.equal(JSON.stringify(result).includes(token),false);
});

test('HTML browser challenge is distinguished from HTML access denied and opaque non-JSON refusal',async()=>{
  const fixtures=[
    ['<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/test"></script></html>','text/html','cloudflare-challenge'],
    ['<!doctype html><html><title>Forbidden '+token+'</title>Access denied '+token+'</html>','text/html','html-access-denied'],
    ['Forbidden '+token,'text/plain','non-json-refusal']
  ];
  for(const [body,type,restriction]of fixtures){
    const result=await checkIsahamAccess({token,fetcher:async()=>new Response(body,{status:403,headers:{'Content-Type':type}})});
    assert.equal(result.check.restriction,restriction);assert.equal(result.check.authAccepted,false);assert.equal(result.check.providerErrorCode,null);assert.equal(JSON.stringify(result).includes(token),false);
  }
});

test('malformed stored tokens are diagnosed without mutation or an upstream request',async()=>{
  const fixtures=[[' '+token,'hasSurroundingWhitespace'],['Bearer '+token,'hasBearerPrefix'],[token+'\nabc','hasNewlines'],['"'+token+'"','hasWrappingQuotes']];
  for(const [stored,flag]of fixtures){
    let calls=0;const result=await checkIsahamAccess({token:stored,fetcher:async()=>{calls++;throw Error('Must not fetch');}});
    assert.equal(calls,0);assert.equal(result.configured,true);assert.equal(result.tokenFormat[flag],true);assert.equal(result.check.attempted,false);assert.equal(result.check.restriction,'token-format');assert.equal(JSON.stringify(result).includes(token),false);
  }
});

test('missing configuration does not contact the provider',async()=>{
  let calls=0;const result=await checkIsahamAccess({token:'',fetcher:async()=>{calls++;throw Error('Must not fetch');}});
  assert.equal(calls,0);assert.equal(result.configured,false);assert.equal(result.check.restriction,'not-configured');
});

test('diagnostics bound streamed provider responses to 32 KB and do not expose oversized content',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(token+'x'.repeat(33000)));},cancel(){cancelled=true;}});
  const result=await checkIsahamAccess({token,fetcher:async()=>new Response(stream,{status:403})});
  assert.equal(cancelled,true);assert.equal(result.check.responseKind,'too-large');assert.equal(result.check.restriction,'unreadable-response');assert.equal(JSON.stringify(result).includes(token),false);
});

test('network/redirect errors are not retried or reflected',async()=>{
  let calls=0;const result=await checkIsahamAccess({token,fetcher:async()=>{calls++;throw Error('Blocked request with '+token);}});
  assert.equal(calls,1);assert.equal(result.check.restriction,'request-failed');assert.equal(result.check.authAccepted,false);assert.equal(JSON.stringify(result).includes(token),false);
});

test('account fields remain bounded literals and valid numeric usage values',async()=>{
  const result=await checkIsahamAccess({token,fetcher:async()=>jsonResponse({auth:true,status:'success',data:{tier:token,credits_used:token,credits_limit:-1,credits_remaining:Infinity,month:token}})});
  assert.deepEqual(result.check.account,{tier:'unknown',creditsUsed:null,creditsLimit:null,creditsRemaining:null,month:null});assert.equal(JSON.stringify(result).includes(token),false);
});

function response(){return {statusCode:0,headers:{},text:'',setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},end(body=''){this.text=body;return this;},body(){return this.text?JSON.parse(this.text):null;}};}
function configure(t,values={}){
  const names=['BQ_ACCESS_TOKEN','BQ_ALLOWED_ORIGIN','ISAHAM_API_TOKEN','VERCEL'],old=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch;
  for(const name of names)delete process.env[name];Object.assign(process.env,values);
  t.after(()=>{globalThis.fetch=originalFetch;for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}});
}
const request=(extra={})=>({method:'GET',query:{provider:'isaham'},headers:{},...extra});

test('private API blocks unauthorised requests before provider access and keeps preflight/method gates',async t=>{
  configure(t,{BQ_ACCESS_TOKEN:'gateway-private-code',ISAHAM_API_TOKEN:token,BQ_ALLOWED_ORIGIN:'https://synakmal.github.io'});let calls=0;globalThis.fetch=async()=>{calls++;return jsonResponse(success);};
  const denied=response();await handler(request(),denied);assert.equal(denied.statusCode,403);assert.equal(calls,0);
  const preflight=response();await handler(request({method:'OPTIONS',headers:{origin:'https://synakmal.github.io'}}),preflight);assert.equal(preflight.statusCode,204);assert.equal(preflight.headers['Access-Control-Allow-Origin'],'https://synakmal.github.io');assert.equal(calls,0);
  const method=response();await handler(request({method:'POST'}),method);assert.equal(method.statusCode,405);assert.equal(calls,0);
});

test('API reports configuration missing, invalid provider or a safe access report without echoing either credential',async t=>{
  configure(t,{BQ_ACCESS_TOKEN:'gateway-private-code'});let calls=0;globalThis.fetch=async()=>{calls++;return jsonResponse(success);};
  const headers={'x-bq-access-token':'gateway-private-code'},missing=response();await handler(request({headers}),missing);assert.equal(missing.statusCode,503);assert.equal(calls,0);
  process.env.ISAHAM_API_TOKEN=token;
  const invalid=response();await handler(request({headers,query:{provider:'elsewhere'}}),invalid);assert.equal(invalid.statusCode,400);assert.equal(calls,0);
  const ok=response();await handler(request({headers}),ok);assert.equal(ok.statusCode,200);assert.equal(ok.body().check.authAccepted,true);assert.equal(calls,1);assert.equal(ok.headers['Cache-Control'],'no-store');
  for(const secret of [token,'gateway-private-code'])assert.equal(ok.text.includes(secret),false);
});
