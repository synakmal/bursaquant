import {cors,json,fail,authorize} from '../lib/market-shared.js';
import {checkIsahamAccess} from '../lib/provider-status.js';

export default async function handler(req,res){
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return fail(res,405,'METHOD_NOT_ALLOWED','GET only.');
  if(!authorize(req,res,{requirePrivate:true}))return;
  if(String(req.query?.provider||'isaham').toLowerCase()!=='isaham')return fail(res,400,'INVALID_PROVIDER','This diagnostic supports isaham only.');
  const result=await checkIsahamAccess();
  if(!result.configured)return json(res,503,{status:'error',error:{code:'ISAHAM_NOT_CONFIGURED',message:'ISAHAM_API_TOKEN is not configured on this gateway.'},...result});
  return json(res,200,{status:'ok',...result});
}
