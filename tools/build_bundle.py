"""Generate standalone JS for opening BursaQuant directly from index.html (no build dependencies)."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
engine=(ROOT/'src/engine.js').read_text()
app=(ROOT/'src/app.js').read_text()
engine=re.sub(r'\bexport\s+(?=(?:const|function)\s)', '', engine)
app=re.sub(r"^import\s+\{[^\n]+\}\s+from\s+['\"]\./engine\.js['\"];?\s*\n", '', app, count=1)
assert 'export ' not in engine and not app.startswith('import ')
output='/* Auto-generated from engine.js and app.js using tools/build_bundle.py. */\n(()=>{\n'+engine+'\n'+app+'\n})();\n'
(ROOT/'src/bundle.js').write_text(output)
print('Generated src/bundle.js:',len(output),'bytes')
