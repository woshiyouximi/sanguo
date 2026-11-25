// 修 runtime.ts 里从编译产物带过来的 .js 说明符（src 里一律用 .ts，node 直接跑 .ts 才解析得到）
import fs from 'node:fs';

const p = 'F:/sanguo/game/src/core/smartscript/runtime.ts';
let t = fs.readFileSync(p, 'utf8');

const found = [...t.matchAll(/['"](\.[^'"]*?\.js)['"]/g)].map((x) => x[1]);
console.log('before:', JSON.stringify([...new Set(found)]));

t = t.replace(/(['"])(\.[^'"]*?)\.js\1/g, (all, q, base) => `${q}${base}.ts${q}`);

fs.writeFileSync(p, t, 'utf8');

const after = [...t.matchAll(/['"](\.[^'"]*?\.js)['"]/g)].map((x) => x[1]);
console.log('after:', JSON.stringify(after));
console.log('imports line:');
for (const line of t.split('\n').slice(0, 20)) if (line.includes('import') || line.includes('from ')) console.log('  ' + line);
