// 用 symbols.json 的权威函数表切分反汇编（463 项），比正则抓 ; func 头可靠。
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const SYM = 'F:/sanguo/game/data/magic_so.symbols.json';

const sym = JSON.parse(fs.readFileSync(SYM, 'utf8'));
const fns = sym.functions.slice().sort((a, b) => a.off - b.off);
console.log('symbols', sym.functions.length, 'codeEnd', sym.codeEnd, 'strCount', sym.stringCount);
const names = new Map();
for (const f of fns) names.set(f.name, (names.get(f.name) ?? 0) + 1);
const dup = [...names.entries()].filter(([, n]) => n > 1);
console.log('dupNames', dup.length, JSON.stringify(dup.slice(0, 20)));

const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const reHead = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;

// addr -> ins
const insByAddr = new Map();
const headLine = new Map(); // name -> line
for (let i = 0; i < lines.length; i++) {
  const h = reHead.exec(lines[i]);
  if (h) headLine.set(`${h[2]}@${parseInt(h[3], 16)}`, i + 1);
  const m = reIns.exec(lines[i]);
  if (!m) continue;
  const [, addr, bytes, op, operand, comment] = m;
  const a = parseInt(addr, 16);
  const ins = { addr: a, op, operand: operand.trim(), comment, line: i + 1, bytes: bytes.length / 2 };
  const s = /"(.*)"/.exec(comment);
  if (op === 'PUSHS' && s) ins.str = s[1];
  if (op === 'PUSHI') ins.imm = Number(operand);
  if (op === 'CALL') ins.callee = operand.trim();
  if (op === 'SYSCALL') {
    const mm = /^0x([0-9a-f]+)/i.exec(operand);
    if (mm) ins.syscall = parseInt(mm[1], 16);
  }
  insByAddr.set(a, ins);
}
const addrs = [...insByAddr.keys()].sort((a, b) => a - b);
console.log('ins', addrs.length, 'symbols.instructionCount', sym.instructionCount);

// 每条指令归到 off <= addr < nextOff 的函数
const funcs = [];
for (let k = 0; k < fns.length; k++) {
  const f = fns[k];
  const end = k + 1 < fns.length ? fns[k + 1].off : sym.codeEnd;
  const ins = [];
  for (let j = addrs.length - 1; j >= 0; j--) {
    const a = addrs[j];
    if (a < f.off) break;
    if (a < end) ins.push(insByAddr.get(a));
  }
  ins.reverse();
  funcs.push({ idx: f.idx, name: f.name, num: f.num, argc: f.argc, off: f.off, end, ins,
    line: headLine.get(`${f.name}@${f.off}`) ?? 0 });
}
const empty = funcs.filter((f) => f.ins.length === 0);
console.log('funcs', funcs.length, 'empty', empty.length, empty.slice(0, 5).map((f) => `${f.name}@0x${f.off.toString(16)}`));

const reSnd = /^m(\d{3})snd(\d{2})$/i;
const reDir = /^magic\\(\d{3})\\/i;
const soundSites = [];
for (const f of funcs) {
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.op !== 'SYSCALL' || (ins.syscall !== 0x301 && ins.syscall !== 0x300)) continue;
    let name = null, nameAddr = 0, nameLine = 0, vol = null;
    for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
      const p = f.ins[k];
      if (p.op === 'PUSHS' && p.str) { name = p.str; nameAddr = p.addr; nameLine = p.line; }
      else if (p.op === 'PUSHI' && vol === null) vol = p.imm;
      else if (p.op === 'CALL' || p.op === 'PUSHV' || p.op === 'LDSL') break;
    }
    const sm = name ? reSnd.exec(name) : null;
    soundSites.push({ func: f.name, funcOff: f.off, funcLine: f.line, addr: ins.addr, line: ins.line,
      name: name ?? null, sndDir: sm ? sm[1] : null, sndIdx: sm ? sm[2] : null,
      syscall: ins.syscall, vol, nameAddr, nameLine });
  }
}
for (const f of funcs) {
  f.dirs = [];
  for (const ins of f.ins) {
    if (ins.op !== 'PUSHS' || !ins.str) continue;
    const d = reDir.exec(ins.str);
    if (d && !f.dirs.includes(d[1])) f.dirs.push(d[1]);
  }
  f.calls = f.ins.filter((x) => x.callee).map((x) => x.callee);
  f.strs = f.ins.filter((x) => x.str).map((x) => ({ s: x.str, addr: x.addr, line: x.line }));
}
fs.writeFileSync('F:/sanguo/work/sfx84/dis.json', JSON.stringify({
  funcCount: funcs.length,
  funcs: funcs.map((f) => ({ idx: f.idx, name: f.name, num: f.num, argc: f.argc, off: f.off, end: f.end, line: f.line, dirs: f.dirs, calls: f.calls, strs: f.strs })),
  soundSites,
}, null, 1));

console.log('soundSites', soundSites.length, 'named', soundSites.filter((s) => s.sndDir).length);
const byDir = {};
for (const s of soundSites.filter((s) => s.sndDir)) (byDir[s.sndDir] ??= []).push(`${s.name}@${s.func}#${s.funcLine}:0x${s.addr.toString(16)}`);
for (const k of Object.keys(byDir).sort()) console.log(k, byDir[k].length, byDir[k].join(' '));
