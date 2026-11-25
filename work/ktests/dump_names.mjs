import fs from 'node:fs';
import path from 'node:path';

const root = 'F:/sanguo/game/tests';
const out = [];
for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.test.ts'))) {
  const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:test|it|describe)\(\s*['"`](.*?)['"`]/);
    if (m) out.push(`${f}:${i + 1}\t${m[1]}`);
  });
}
fs.writeFileSync('F:/sanguo/work/ktests/test_names.txt', out.join('\n'), 'utf8');
console.log('tests', out.length);
