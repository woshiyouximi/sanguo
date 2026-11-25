// 目录块（num ∈ [dir*1000, dir*1000+999]）里的音效 —— 该特效目录“物件回调”层的音效
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/final3.json', 'utf8'));
const sites = j.soundSites;
const funcs = j.funcs;
const numOf = new Map(funcs.map((f) => [f.name, f.num]));
const byDir = new Map();
for (const s of sites) {
  const n = numOf.get(s.func) ?? 0;
  if (!n) continue;
  const d = String(Math.floor(n / 1000)).padStart(3, '0');
  if (!byDir.has(d)) byDir.set(d, []);
  byDir.get(d).push({ func: s.func, name: s.name, addr: s.addr, syscall: s.syscall });
}
for (const d of [...byDir.keys()].sort()) {
  const uniq = [...new Set(byDir.get(d).map((x) => x.func + ':' + x.name))];
  console.log('dir', d, '=>', uniq.join('  '));
}
console.log('\n各目录块函数（num 有值）:');
const blocks = new Map();
for (const f of funcs) {
  if (!f.num) continue;
  const d = String(Math.floor(f.num / 1000)).padStart(3, '0');
  if (!blocks.has(d)) blocks.set(d, []);
  blocks.get(d).push(f.name + '#' + f.num);
}
for (const d of [...blocks.keys()].sort()) console.log(' ', d, blocks.get(d).join(' '));
