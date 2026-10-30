import {cors,json,fail,authorize} from '../lib/market-shared.js';
import {RESEARCH_LIMITS,ResearchError,researchConfiguration,generateResearch} from '../lib/research.js';

function originAllowed(req){
  const origin=req.headers?.origin;if(!origin)return true;
  const local=req.bqLocal===true&&process.env.VERCEL!=='1';
  if(local&&/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin))return true;
  const configured=process.env.BQ_ALLOWED_ORIGIN||'';
  if(configured)return origin===configured;
  return /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)||/^https:\/\/[^.]+\.vercel\.app$/i.test(origin)||/^http:\/\/localhost(?::\d+)?$/i.test(origin);
}

async function readInput(req){
  const declared=req.headers?.['content-length'];
  if(declared!==undefined&&(!/^\d+$/.test(String(declared))||Number(declared)>RESEARCH_LIMITS.maxInputBytes))throw new ResearchError(413,'RESEARCH_INPUT_TOO_LARGE','Research input exceeds the 64 KB limit.');
  const type=String(req.headers?.['content-type']||'');
  if(!/^application\/json(?:\s*;|$)/i.test(type))throw new ResearchError(415,'JSON_REQUIRED','Send research input as application/json.');
  let raw;
  if(req.body!==undefined){
    try{raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);}catch{throw new ResearchError(400,'INVALID_JSON','Research input must be valid JSON.');}
  }else if(typeof req[Symbol.asyncIterator]==='function'){
    const chunks=[];let length=0,timer;
    const reading=(async()=>{for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=bytes.length;if(length>RESEARCH_LIMITS.maxInputBytes){req.pause?.();throw new ResearchError(413,'RESEARCH_INPUT_TOO_LARGE','Research input exceeds the 64 KB limit.');}chunks.push(bytes);}return Buffer.concat(chunks,length).toString('utf8');})();
    try{raw=await Promise.race([reading,new Promise((_,reject)=>{timer=setTimeout(()=>{req.pause?.();reject(new ResearchError(408,'RESEARCH_INPUT_TIMEOUT','The research request body timed out.'));},5000);})]);}finally{clearTimeout(timer);}
  }
  if(typeof raw!=='string'||Buffer.byteLength(raw)>RESEARCH_LIMITS.maxInputBytes)throw new ResearchError(413,'RESEARCH_INPUT_TOO_LARGE','Research input is missing or exceeds the 64 KB limit.');
  try{return JSON.parse(raw);}catch{throw new ResearchError(400,'INVALID_JSON','Research input must be valid JSON.');}
}

export default async function handler(req,res){
  cors(req,res);res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(!originAllowed(req))return fail(res,403,'ORIGIN_NOT_ALLOWED','This origin is not allowed to use the personal AI gateway.');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','POST'].includes(req.method))return fail(res,405,'METHOD_NOT_ALLOWED','GET or POST only.');
  if(!process.env.BQ_ACCESS_TOKEN&&!(req.bqLocal===true&&process.env.VERCEL!=='1'))return fail(res,503,'ACCESS_CODE_NOT_CONFIGURED','Configure BQ_ACCESS_TOKEN before using this personal AI gateway.');
  if(!authorize(req,res,{requirePrivate:true}))return;
  if(req.method==='GET')return json(res,200,{status:'ok',...researchConfiguration()});
  // The disabled state is checked before reading a body or contacting AI.
  const config=researchConfiguration();
  if(!config.ready)return fail(res,503,'AI_NOT_CONFIGURED',config.message);
  try{return json(res,200,await generateResearch(await readInput(req)));}
  catch(error){if(error instanceof ResearchError)return fail(res,error.status,error.code,error.message);return fail(res,500,'RESEARCH_REQUEST_FAILED','The research request could not be processed.');}
}
