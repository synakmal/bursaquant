import {cors,json,fail,authorize} from '../lib/market-shared.js';
import {getUniverse} from '../lib/universe.js';

export default async function handler(req,res) {
  cors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return fail(res,405,'METHOD_NOT_ALLOWED','GET only.');
  const market=String(req.query?.market||'US').toUpperCase();
  if(!['US','MY'].includes(market))return fail(res,400,'INVALID_MARKET','Choose US or MY.');
  if(!authorize(req,res,{requirePrivate:true}))return;
  try{return json(res,200,{status:'ok',...await getUniverse(market)});}
  catch(error){return fail(res,[400,429,503].includes(error.upstreamStatus)?error.upstreamStatus:502,error.code||'DIRECTORY_ERROR',error.message||'Instrument directory unavailable.');}
}
