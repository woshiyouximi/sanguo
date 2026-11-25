import fs from 'node:fs';
const L = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const byName = new Map(sym.functions.map((f) => [f.name, f]));

// 1) 精确 0x310..0x314
const reH = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
let cur = null;
const hits = [];
for (let i = 0; i < L.length; i++) {
  const h = reH.exec(L[i]);
  if (h) { cur = h[2]; continue; }
  const m = /SYSCALL\s+0x(31[0-4]),\s*0x(\d+)/.exec(L[i]);
  if (m) hits.push({ line: i + 1, fn: cur, sc: m[1], ctx: L.slice(Math.max(0, i - 3), i + 1).map((x) => x.trim()) });
}
console.log('0x310..0x314 sites', hits.length);
for (const h of hits) console.log('line', h.line, h.fn, '0x' + h.sc, '|', h.ctx.slice(0, -1).map((x) => x.split(/\s+/).slice(2).join(' ')).join(' / '));

// 2) sc#### 函数的 num，谁引用它
const scfns = sym.functions.filter((f) => /^X?sc\d+$/.test(f.name));
console.log('\nsc funcs', scfns.length, scfns.map((f) => `${f.name}#${f.num}@0x${f.off.toString(16)}`).join(' '));
// 该 num 作为 PUSHI 出现？
const nums = new Map(scfns.map((f) => [f.num, f.name]));
const refs = [];
for (let i = 0; i < L.length; i++) {
  const m = /PUSHI\s+(\d+)\s*;\s*$/.exec(L[i]);
  if (m && nums.has(+m[1])) refs.push({ line: i + 1, name: nums.get(+m[1]), txt: L[i].trim() });
}
console.log('\nnum 被 PUSHI 引用:', refs.length);
for (const r of refs.slice(0, 30)) console.log('line', r.line, r.name, r.txt);
