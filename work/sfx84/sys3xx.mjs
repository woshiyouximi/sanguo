import fs from 'node:fs';
const L = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const reH = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
let cur = null;
const hits = [];
for (let i = 0; i < L.length; i++) {
  const h = reH.exec(L[i]);
  if (h) { cur = h[2]; continue; }
  if (/SYSCALL\s+0x3[01][0-9a-f]/.test(L[i])) hits.push({ line: i + 1, fn: cur, txt: L[i].trim(), ctx: L.slice(Math.max(0, i - 4), i + 1) });
}
console.log('syscall 0x30x/0x31x sites', hits.length);
const byFn = {};
for (const h of hits) (byFn[h.fn] ??= []).push(h);
for (const [fn, arr] of Object.entries(byFn)) {
  console.log('###', fn, arr.length);
  for (const h of arr) console.log('  line', h.line, h.txt, '| prev:', h.ctx.slice(0, -1).map((x) => x.trim().split(/\s+/).slice(2, 4).join(' ')).join(' / '));
}
