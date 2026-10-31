import {readFileSync, writeFileSync} from 'node:fs';
const engine = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8')
  .replace(/\bexport\s+(?=(?:const|function)\s)/g, '');
const namespaces={'screener':'BQAccumulation','scan-runner':'BQScanRunner','deep-analysis':'BQDeepAnalysis','research-ui':'BQResearchUI','ipo':'BQIpo','holdings-model':'BQHoldingsModel','holding-review':'BQHoldingReview','holdings-ui':'BQHoldingsUI'};
const modules=Object.entries(namespaces).map(([file,namespace])=>{
  const source=readFileSync(new URL('../src/'+file+'.js',import.meta.url),'utf8');
  const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match=>match[1]);
  const code=source.replace(/\bexport\s+(?=(?:const|function|async\s+function)\s)/g,'');
  if(/^\s*(?:export|import)\s/m.test(code))throw new Error('Unexpected module syntax in '+file);
  return 'const '+namespace+'=(()=>{\n'+code+'\nreturn {'+names.join(',')+'};\n})();';
}).join('\n');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  .replace(/^import\s+\{([^\n]+)\}\s+from\s+['"]\.\/([\w-]+)\.js['"];?\s*\r?\n/gm,(_,names,file)=>file==='engine'?'':namespaces[file]?`const {${names}}=${namespaces[file]};\n`:`import {${names}} from './${file}.js';\n`);
if (/\bexport\s/.test(engine) || /^import\s/.test(app)) throw new Error('Unexpected module syntax');
const bundle = '/* Generated from source modules by npm run build. */\n(()=>{\n'+engine+'\n'+modules+'\n'+app+'\n})();\n';
writeFileSync(new URL('../src/bundle.js', import.meta.url), bundle);
console.log('Generated src/bundle.js');
