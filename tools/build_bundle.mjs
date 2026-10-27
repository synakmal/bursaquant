import {readFileSync, writeFileSync} from 'node:fs';
const engine = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8')
  .replace(/\bexport\s+(?=(?:const|function)\s)/g, '');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  .replace(/^import\s+\{[^\n]+\}\s+from\s+['"]\.\/engine\.js['"];?\s*\r?\n/, '');
if (/\bexport\s/.test(engine) || /^import\s/.test(app)) throw new Error('Unexpected module syntax');
const bundle = '/* Generated from engine.js and app.js by npm run build. */\n(()=>{\n'+engine+'\n'+app+'\n})();\n';
writeFileSync(new URL('../src/bundle.js', import.meta.url), bundle);
console.log('Generated src/bundle.js');
