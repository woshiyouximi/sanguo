import { readFileSync } from 'node:fs';
const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const lines = readFileSync(DIS, 'utf8').split(/\r?\n/);
const HDR = /^;\s*func #(\d+)\s+(\S+)\s+id=0x([0-9A-Fa-f]+)\s+argc=(\d+)\s+@0x([0-9A-Fa-f]+)/;
const funcs = new Map();
let cur = null;
for (const ln of lines) {
  const m = HDR.exec(ln);
  if (m) { cur = { body: [], argc: +m[4] }; funcs.set(m[2], cur); continue; }
  if (!cur) continue;
  if (ln.startsWith(';')) continue;
  const t = ln.indexOf(';');
  const code = (t >= 0 ? ln.slice(0, t) : ln).trimEnd();
  if (!code) continue;
  cur.body.push(code);
}
const names = process.argv.slice(2);
for (const n of names) {
  const f = funcs.get(n);
  console.log(`\n### ${n} argc=${f?.argc} insns=${f?.body.length}`);
  if (!f) continue;
  for (const b of f.body) console.log('  ' + b.replace(/\s+/g, ' '));
  if (f.body.length > 200) { console.log('  ...'); }
}
