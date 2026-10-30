import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,extname,sep} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Optional local credentials stay in an ignored file; no shell evaluation.
const envPath=resolve(root,'.env.local');
if(existsSync(envPath))for(const line of readFileSync(envPath,'utf8').split(/\r?\n/)){
  const m=line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');
}
process.env.BQ_DATA_PROVIDER ||= 'yahoo';
const {default:market}=await import('../api/market.js');
const {default:search}=await import('../api/search.js');
const {default:health}=await import('../api/health.js');
const {default:universe}=await import('../api/universe.js');
const {default:providerStatus}=await import('../api/provider-status.js');
const {default:research}=await import('../api/research.js');
const handlers={'/api/market':market,'/api/search':search,'/api/health':health,'/api/universe':universe,'/api/provider-status':providerStatus,'/api/research':research};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.csv':'text/csv; charset=utf-8'};
const port=Number(process.env.BQ_LOCAL_PORT||8000);
const server=http.createServer(async(req,res)=>{
  try {
    const allowedHosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);
    if(!allowedHosts.has(req.headers.host)){res.statusCode=403;return res.end('Local host only');}
    if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)){res.statusCode=403;return res.end('Open the trial directly on this PC');}
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    res.status=function(status){this.statusCode=status;return this;};
    if(handlers[url.pathname]){
      req.query=Object.fromEntries(url.searchParams);req.bqLocal=true;
      return await handlers[url.pathname](req,res);
    }
    if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end('GET only');}
    const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    // Serve the public frontend only. No environment files, source gateway,
    // research exports, package metadata or arbitrary filesystem paths.
    if(name!=='/index.html'&&name!=='/sample_synthetic_4h.csv'&&!/^\/src\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(name)){res.statusCode=404;return res.end('Not found');}
    const path=resolve(root,'.'+name);
    if(!path.startsWith(root+sep)){res.statusCode=400;return res.end('Invalid path');}
    const body=readFileSync(path);res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:body);
  } catch(e){res.statusCode=e.code==='ENOENT'?404:500;res.end('Request failed');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port '+port+' is in use. Set BQ_LOCAL_PORT to another port.':e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('BursaQuant personal trial: http://127.0.0.1:'+port+'\nYahoo trial enabled. Latest completed candles are requested on demand. Press Ctrl+C to stop.'));
