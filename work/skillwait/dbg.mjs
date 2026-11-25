import { readFileSync } from 'node:fs';
const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const lines = readFileSync(DIS, 'utf8').split(/\r?\n/);
const HDR = /^;\s*func #(\d+)\s+(\S+)\s+id=0x([0-9A-Fa-f]+)\s+argc=(\d+)\s+@0x([0-9A-Fa-f]+)/;
const funcs = new Map();
let cur = null;
for (const ln of lines) {
  const m = HDR.exec(ln);
  if (m) { cur = { body: [] }; funcs.set(m[2], cur); continue; }
  if (!cur) continue;
  if (ln.startsWith(';')) continue;
  const t = ln.indexOf(';');
  const code = (t >= 0 ? ln.slice(0, t) : ln).trimEnd();
  if (!code) continue;
  cur.body.push(code);
}
const INSN = /^([0-9A-F]{6})\s+([0-9A-F]{8,})\s+([A-Z][A-Z0-9_]*)\s*(.*)$/;
console.log('Magic4 body:', funcs.get('Magic4').body);
let hit = 0, miss = 0;
for (const ln of funcs.get('Spout').body) { if (INSN.test(ln)) hit++; else { miss++; if (miss < 4) console.log('MISS', JSON.stringify(ln)); } }
console.log('Spout hit/miss', hit, miss);
console.log('sample match:', INSN.exec('0238AC  050000000700000001000000 SYSCALL   0x7, 0x1'));
