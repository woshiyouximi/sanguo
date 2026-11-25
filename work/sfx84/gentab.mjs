import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/map6.json', 'utf8'));
const padEnd = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
let t = '';
for (const r of rows) {
  const k = ('00' + r.seq).slice(-3);
  const entry = `'${k}': '${r.snd}',`.replace(/,$/, '');
  t += '    ' + padEnd(entry + ',', 20) + `// [${r.grade}] ${r.name} dir${r.dir}\n`;
}
fs.writeFileSync('F:/sanguo/work/sfx84/table_js.txt', t);
console.log(t.slice(0, 700));
console.log('rows', rows.length);
