import {readFileSync, writeFileSync} from 'node:fs';
const engine = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8')
  .replace(/\bexport\s+(?=(?:const|function)\s)/g, '');
const modules=[['screener','BQAccumulation'],['scan-runner','BQScanRunner']].map(([file,namespace])=>{
  const source=readFileSync(new URL('../src/'+file+'.js',import.meta.url),'utf8');
  const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match=>match[1]);
  const code=source.replace(/\bexport\s+(?=(?:const|function|async\s+function)\s)/g,'');
  if(/\bexport\s|^import\s/m.test(code))throw new Error('Unexpected module syntax in '+file);
  return 'const '+namespace+'=(()=>{\n'+code+'\nreturn {'+names.join(',')+'};\n})();';
}).join('\n');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  .replace(/^import\s+\{([^\n]+)\}\s+from\s+['"]\.\/(engine|screener|scan-runner)\.js['"];?\s*\r?\n/gm,(_,names,file)=>file==='engine'?'':`const {${names}}=${file==='screener'?'BQAccumulation':'BQScanRunner'};\n`);
if (/\bexport\s/.test(engine) || /^import\s/.test(app)) throw new Error('Unexpected module syntax');
const bundle = '/* Generated from source modules by npm run build. */\n(()=>{\n'+engine+'\n'+modules+'\n'+app+'\n})();\n';
writeFileSync(new URL('../src/bundle.js', import.meta.url), bundle);
console.log('Generated src/bundle.js');
