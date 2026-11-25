/** 从 _core_diff.md 提取紧凑清单：每个 DIFF 文件 → hunk 数 + 前 3 个 hunk 的首条 ± 行 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const text = fs.readFileSync(path.join(HERE, '_core_diff.md'), 'utf8').split('\n');
const out = [];
let cur = null;
let hunk = null;
for (const line of text) {
  const m = /^## (\S+)\s+\((\w+)\)/.exec(line);
  if (m) {
    cur = { file: m[1], status: m[2], hunks: 0, samples: [] };
    out.push(cur);
    hunk = null;
    continue;
  }
  if (!cur) continue;
  if (/^  ──/.test(line)) { cur.hunks += 1; hunk = null; continue; }
  const d = /^([+-])\s+(\d+)\s+(.*)$/.exec(line);
  if (!d) continue;
  if (!hunk) { hunk = { del: null, add: null, delLine: null, addLine: null }; cur.samples.push(hunk); }
  const key = d[1] === '-' ? 'del' : 'add';
  const keyLine = d[1] === '-' ? 'delLine' : 'addLine';
  if (!hunk[key]) { hunk[key] = d[3].trim().slice(0, 96); hunk[keyLine] = Number(d[2]); }
}
for (const r of out) {
  if (r.status === 'SAME') continue;
  console.log(`\n### ${r.file}  hunks=${r.hunks}`);
  for (const h of r.samples.slice(0, 4)) {
    console.log(`   - web:${h.delLine ?? '-'} ${h.del ?? '(无)'}`);
    console.log(`   + coc:${h.addLine ?? '-'} ${h.add ?? '(无)'}`);
  }
}
