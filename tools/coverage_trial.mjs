import {yahooMarket,searchYahoo} from '../lib/yahoo.js';
import {analyse} from '../src/engine.js';
import {mkdirSync,writeFileSync} from 'node:fs';
process.env.BQ_DATA_PROVIDER='yahoo';
const cases=[['AAPL','US','1day'],['1155','MY','1day'],['1023','MY','1day'],['1155','MY','5min'],['1155','MY','15min'],['1155','MY','30min'],['1155','MY','1h'],['1155','MY','4h'],['AAPL','US','4h'],['1155','MY','1week'],['AAPL','US','1month'],['1155','MY','3month']];
const report={testedAt:new Date().toISOString(),results:[]};
const selected=process.argv.includes('--weekly')?cases.filter(x=>x[2]==='1week'):process.argv.includes('--monthly')?cases.filter(x=>['1month','3month'].includes(x[2])):cases;
for(const [symbol,market,interval]of selected){
  try{const result=await yahooMarket(symbol,market,interval,500);const a=result.bars.length>=55?analyse(result.bars):null;
    report.results.push({symbol:result.meta.symbol,interval,status:'ok',bars:result.bars.length,lastCandle:result.meta.lastCandle,fetchedAt:result.meta.fetchedAt,timezone:result.meta.timezone,canAnalyse:Boolean(a),lastClose:result.bars.at(-1)?.close,score:a?.score,notes:result.meta.notes,missingGroups:result.meta.missingAggregationGroups});
  }catch(e){report.results.push({symbol,interval,status:'error',code:e.code,message:e.message});if(e.upstreamStatus===429)break;}
}
if(!process.argv.includes('--weekly')&&!process.argv.includes('--monthly')&&!report.results.some(x=>x.code==='YAHOO_RATE_LIMITED')){
  try{const result=await searchYahoo('maybank','MY');report.search={query:'maybank',symbols:result.results.map(x=>x.symbol),status:'ok'};}
  catch(e){report.search={status:'error',code:e.code,message:e.message};}
}
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--save-local')){mkdirSync(new URL('../.local/',import.meta.url),{recursive:true});writeFileSync(new URL('../.local/yahoo-coverage.json',import.meta.url),JSON.stringify(report,null,2));}
if(report.results.some(x=>x.status==='error'||!x.canAnalyse))process.exitCode=1;
