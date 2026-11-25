// 哪些带音效的函数是「从任何 MagicN 都到不了」的（= 物件回调 / 死代码）
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/final.json', 'utf8'));
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const byName = new Map(sym.functions.map((f) => [f.name, f]));
// 重建 call 图
const DIS = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const reH = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
let cur = null;
const calls = new Map();
const pushis = new Map();
for (const line of DIS) {
  const h = reH.exec(line);
  if (h) { cur = h[2]; calls.set(cur, calls.get(cur) ?? []); pushis.set(cur, pushis.get(cur) ?? []); continue; }
  const m = reIns.exec(line);
  if (!m || !cur) continue;
  if (m[3] === 'CALL') calls.get(cur).push({ addr: parseInt(m[1], 16), callee: m[4].trim() });
  if (m[3] === 'PUSHI') pushis.get(cur).push({ addr: parseInt(m[1], 16), imm: Number(m[4].trim()) });
}
const inDeg = new Map();
for (const [f, arr] of calls) for (const c of arr) inDeg.set(c.callee, (inDeg.get(c.callee) ?? 0) + 1);

const sites = j.soundSites.filter((s) => s.sndDir);
const funcsWithSnd = [...new Set(sites.map((s) => s.func))];
// 从所有 MagicN 出发的可达集合
const reach = new Set();
const stack = sym.functions.filter((f) => /^Magic\d+$/.test(f.name)).map((f) => f.name);
while (stack.length) {
  const n = stack.pop();
  if (reach.has(n)) continue;
  reach.add(n);
  for (const c of calls.get(n) ?? []) if (byName.has(c.callee)) stack.push(c.callee);
}
console.log('MagicN 可达函数', reach.size, '/', sym.functions.length);
console.log('\n带音效但不可达的函数:');
for (const f of funcsWithSnd) {
  if (reach.has(f)) continue;
  const s = sites.filter((x) => x.func === f).map((x) => x.name).join(',');
  console.log(' ', f, 'num=' + (byName.get(f)?.num ?? '?'), 'inDeg=' + (inDeg.get(f) ?? 0), 'snd=' + s, 'line=' + byName.get(f)?.line);
}
console.log('\n不可达但被 CALL 的函数（inDeg>0）说明由不可达父函数调用：');
for (const f of funcsWithSnd) {
  if (!reach.has(f) && (inDeg.get(f) ?? 0) > 0) {
    const parents = [...calls.entries()].filter(([, arr]) => arr.some((c) => c.callee === f)).map(([k]) => k);
    console.log(' ', f, '<=', parents.join(','));
  }
}
// 各 MagicN 是否可达某音效函数
const reachOf = (start) => { const s = new Set(); const st = [start]; while (st.length) { const n = st.pop(); if (s.has(n)) continue; s.add(n); for (const c of calls.get(n) ?? []) if (byName.has(c.callee)) st.push(c.callee); } return s; };
console.log('\n不可达函数名清单（供人工判定）:', funcsWithSnd.filter((f) => !reach.has(f)).join(' '));
