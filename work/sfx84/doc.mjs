// 把 110 行表注入 project/96_技能音效映射.md 的 <!--TABLE--> 处
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/map6.json', 'utf8'));
const f = 'F:/sanguo/project/96_技能音效映射.md';
let doc = fs.readFileSync(f, 'utf8');
if (!doc.includes('<!--TABLE-->')) { console.log('已注入'); process.exit(0); }
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
let t = '| 编号 | 技能 | fx_dir | 音效串 | 证级 | 依据 |\n|---:|---|---:|---|---|---|\n';
for (const r of rows) {
  t += `| ${r.seq} | ${r.name} | ${r.dir} | \`${r.snd}\` | ${r.grade} | ${r.via} |\n`;
}
doc = doc.replace('<!--TABLE-->', t.trimEnd());
fs.writeFileSync(f, doc);
console.log('注入', rows.length, '行，文档', doc.length, '字符');
