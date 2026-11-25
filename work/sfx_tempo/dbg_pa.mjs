import fs from 'node:fs';
const ROOT = 'F:/sanguo';
const DIS = `${ROOT}/export/script/magic_so.dis.txt`;
const sym = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magic_so.symbols.json`, 'utf8'));
const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const all = [];
for (let i = 0; i < L.length; i++) {
  const m = reIns.exec(L[i]);
  if (!m) continue;
  const ins = { addr: parseInt(m[1], 16), op: m[3], operand: m[4].trim(), line: i + 1 };
  const s = /"(.*)"/.exec(m[5]);
  if (s) ins.str = s[1];
  if (ins.op === 'CALL') ins.callee = ins.operand;
  if (ins.op === 'SYSCALL') { const mm = /^0x([0-9a-f]+)/i.exec(ins.operand); if (mm) ins.syscall = parseInt(mm[1], 16); }
  all.push(ins);
}
const fns = sym.functions.slice().sort((a, b) => a.off - b.off);
const pa = fns.find((f) => f.name === 'Pa');
const idx = fns.indexOf(pa);
const end = fns[idx + 1].off;
const body = all.filter((i) => i.addr >= pa.off && i.addr < end);
console.log('Pa', pa.off.toString(16), '->', end.toString(16), 'ins', body.length);
for (const i of body.slice(-20)) console.log(i.addr.toString(16), i.op, i.operand, i.str ? '"' + i.str + '"' : '', 'line', i.line);
console.log('--- CALLS instrs in Pa ---');
for (const i of body) if (i.op === 'CALLS' || i.op === 'CALL') console.log(i.addr.toString(16), i.op, i.operand, 'line', i.line);
console.log('--- string idx 326 ---');
const strs = fs.readFileSync(`${ROOT}/work/magic_so_strings.txt`, 'utf8').split(/\r?\n/).filter(Boolean);
console.log(strs[326], '|', strs[325], '|', strs[327]);
