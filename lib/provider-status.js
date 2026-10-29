// Private, read-only access diagnostics. Never return provider tokens or bodies.
const USAGE_URL='https://api.isaham.my/v1/account/usage';
const MAX_BODY_BYTES=32*1024;
const providerCodes=new Set(['UNAUTHORIZED','TIER_UPGRADE_REQUIRED','QUOTA_EXCEEDED','RATE_LIMITED','MISSING_PARAMETER','INVALID_PARAMETER','RESOURCE_NOT_FOUND','INTERNAL_ERROR']);
const explanations={
  UNAUTHORIZED:'iSaham rejected the access token. Check the token saved in Vercel; do not share it in chat.',
  TIER_UPGRADE_REQUIRED:'iSaham reports that this API account does not have permission for the requested endpoint.',
  QUOTA_EXCEEDED:'iSaham reports that the monthly API credit allowance is exhausted.',
  RATE_LIMITED:'iSaham requested a rate-limit pause. No retry was attempted.',
  MISSING_PARAMETER:'iSaham reports a missing request parameter.',
  INVALID_PARAMETER:'iSaham reports an invalid request parameter.',
  RESOURCE_NOT_FOUND:'iSaham reports that its documented account-usage endpoint was not found.',
  INTERNAL_ERROR:'iSaham reports an internal service error.'
};

function safeServer(response){
  const value=String(response.headers.get('server')||'').toLowerCase();
  return !value?null:value.includes('cloudflare')?'cloudflare':value.includes('nginx')?'nginx':value.includes('vercel')?'vercel':'other';
}
async function limitedBody(response){
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES){await response.body?.cancel().catch(()=>{});return {tooLarge:true,text:''};}
  if(!response.body)return {tooLarge:false,text:''};
  const reader=response.body.getReader(),chunks=[];let length=0;
  while(true){
    const {value,done}=await reader.read();if(done)break;
    length+=value.byteLength;
    if(length>MAX_BODY_BYTES){await reader.cancel().catch(()=>{});return {tooLarge:true,text:''};}
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return {tooLarge:false,text:new TextDecoder().decode(bytes)};
}
const safeCount=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
function accountSummary(data){
  const tier=typeof data.tier==='string'?data.tier.toLowerCase():'';
  return {tier:['free','basic','pro','max'].includes(tier)?tier:'unknown',creditsUsed:safeCount(data.credits_used),creditsLimit:safeCount(data.credits_limit),creditsRemaining:safeCount(data.credits_remaining),month:typeof data.month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(data.month)?data.month:null};
}

export async function checkIsahamAccess({token=process.env.ISAHAM_API_TOKEN||'',fetcher=globalThis.fetch}={}){
  const secret=typeof token==='string'?token:'';
  const tokenFormat={hasSurroundingWhitespace:secret!==secret.trim(),hasBearerPrefix:/^Bearer\s+/i.test(secret.trim()),hasNewlines:/[\r\n]/.test(secret),hasWrappingQuotes:secret.length>1&&((secret.startsWith('"')&&secret.endsWith('"'))||(secret.startsWith("'")&&secret.endsWith("'")))};
  const result={provider:'isaham',configured:secret.length>0,tokenFormat,check:{endpoint:'/v1/account/usage',attempted:false,upstreamHTTPStatus:null,authAccepted:false,responseKind:null,restriction:null,providerErrorCode:null,server:null,message:'',account:null}};
  const check=result.check;
  if(!result.configured){check.restriction='not-configured';check.message='ISAHAM_API_TOKEN is not configured on this gateway.';return result;}
  if(Object.values(tokenFormat).some(Boolean)){
    check.restriction='token-format';check.message='Re-save the raw iSaham token in Vercel without a Bearer prefix, surrounding quotes, whitespace or line breaks. The configured value was not modified or sent.';return result;
  }
  check.attempted=true;let response;
  try{
    response=await fetcher(USAGE_URL,{headers:{Accept:'application/json',Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(10000)});
    check.upstreamHTTPStatus=response.status;check.server=safeServer(response);
    const body=await limitedBody(response);
    if(body.tooLarge){check.responseKind='too-large';check.restriction='unreadable-response';check.message='The provider response exceeded the diagnostic size limit. No response content was returned.';return result;}
    const contentType=String(response.headers.get('content-type')||'').toLowerCase();
    let payload;try{payload=JSON.parse(body.text);}catch{}
    const json=payload!==null&&typeof payload==='object'&&!Array.isArray(payload);
    const html=contentType.includes('text/html')||/^\s*(?:<!doctype\s+html|<html)/i.test(body.text);
    check.responseKind=json?'json':html?'html':body.text?'text':'empty';
    if(json){
      const rawCode=payload.error?.code;
      if(rawCode!==undefined)check.providerErrorCode=providerCodes.has(rawCode)?rawCode:'UNKNOWN_PROVIDER_ERROR';
      if(response.ok&&payload.auth===true&&payload.status==='success'&&payload.data&&typeof payload.data==='object'&&!Array.isArray(payload.data)){
        check.authAccepted=true;check.restriction=null;check.account=accountSummary(payload.data);check.message='iSaham accepted this token for its account-usage endpoint. This does not establish directory completeness or access to other endpoints.';return result;
      }
      check.restriction='json-provider-error';check.message=explanations[check.providerErrorCode]||'iSaham did not return a recognised authenticated account-usage response. No provider message or raw response was exposed.';return result;
    }
    if(html&&/cf-chl-|challenge-platform|cloudflare-browser-verification|<title>\s*just a moment/i.test(body.text)){
      check.restriction='cloudflare-challenge';check.message='The request reached an HTML browser-verification challenge. API authentication and account permission could not be established. No bypass or retry was attempted.';
    }else if(html&&(response.status===401||response.status===403)){
      check.restriction='html-access-denied';check.message='The provider refused the request with an HTML response. This does not identify a token, plan, geographic or network restriction; those remain unverified.';
    }else{
      check.restriction='non-json-refusal';check.message='The provider did not return its documented JSON API response. API authentication and the reason for refusal remain unverified.';
    }
  }catch{
    check.restriction='request-failed';check.message='The provider request or response could not be completed within the diagnostic limits. No retry or redirect was attempted.';
  }
  return result;
}
