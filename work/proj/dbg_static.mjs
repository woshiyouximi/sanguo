import { readFileSync } from 'node:fs';

const lines = readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const fns = new Map();
let cur = null;
for (const line of lines) {
  const h = /^; func #\d+\s+(\S+)\s+id=0x[0-9A-F]+ argc=(\d+)\s+@0x([0-9A-F]+)/.exec(line);
  if (h) {
    cur = { name: h[1], off: Number.parseInt(h[3], 16), argc: Number(h[2]), ins: [] };
    fns.set(cur.name, cur);
    continue;
  }
  if (!cur) continue;
  const m = /^([0-9A-F]{6})\s+([0-9A-F]{8,})\s+(\w+)\s*(.*?)\s*;\s*(.*)$/.exec(line);
  if (m) cur.ins.push({ addr: m[1], op: m[3], arg: m[4] ?? '', comment: m[5] ?? '' });
}
console.log('fns', fns.size, 'Magic2 ins', fns.get('Magic2')?.ins.length);
console.log(fns.get('Magic2')?.ins.map((i) => `${i.op} ${i.arg}`).slice(0, 6));
const callees = (fn) => fn.ins.filter((i) => i.op === 'CALL').map((i) => i.arg.split(/\s+/)[0]).filter((n) => fns.has(n));
console.log('callees of Magic2', callees(fns.get('Magic2')));
const body = [];
const seen = new Set();
const stack = ['Magic2'];
while (stack.length) {
  const n = stack.pop();
  if (seen.has(n)) continue;
  seen.add(n);
  const fn = fns.get(n);
  if (!fn) continue;
  body.push(fn);
  for (const c of callees(fn)) stack.push(c);
}
console.log('closure size', body.length, body.map((f) => f.name).join(','));
for (const fn of body) {
  for (const i of fn.ins) {
    if (i.op === 'SYSCALL') console.log('  syscall', fn.name, i.arg.split(',')[0], 'arg', i.arg);
    if (i.op === 'PUSHS') console.log('  pushs', fn.name, i.arg, JSON.stringify(i.comment));
  }
}
