// 解析 MAGIC.SO 反汇编：函数边界、PUSHS 字符串、CALL、SYSCALL，以及音效调用点。
// 输出 work/sfx84/dis.json 供后续 analyze.mjs 使用。
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);

const funcs = [];      // {idx,name,argc,off,line,ins:[...]}
let cur = null;

const reHead = /^; func #(\d+)\s+(\S+)\s+id=0x[0-9a-f]+\s+argc=(-?\d+)\s+@0x([0-9a-f]+)/;
// 000040  08000000FEFFFFFF LDSL      arg1                           ; 
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const h = reHead.exec(line);
  if (h) {
    cur = { idx: +h[1], name: h[2], argc: +h[3], off: parseInt(h[4], 16), line: i + 1, ins: [] };
    funcs.push(cur);
    continue;
  }
  if (!cur) continue;
  const m = reIns.exec(line);
  if (!m) continue;
  const [, addr, bytes, op, operand, comment] = m;
  const ins = { addr: parseInt(addr, 16), op, operand: operand.trim(), comment: comment.trim(), line: i + 1 };
  // 字符串字面量在注释里：PUSHS 209 ; "m016snd01"
  const s = /"(.*)"/.exec(comment);
  if (op === 'PUSHS' && s) ins.str = s[1];
  if (op === 'PUSHI') ins.imm = Number(operand);
  if (op === 'CALL') ins.callee = operand.trim();
  if (op === 'SYSCALL') {
    const mm = /^0x([0-9a-f]+)/i.exec(operand);
    if (mm) ins.syscall = parseInt(mm[1], 16);
  }
  cur.ins.push(ins);
}

// 音效名口径：m%03dsnd%02d（脚本里出现的名字）
const reSnd = /^m(\d{3})snd(\d{2})$/;
// 目录串：magic\NNN\*  或具体文件 magic\NNN\file
const reDir = /^magic\\(\d{3})\\/i;

// 找音效调用点：自 SYSCALL 0x301 / 0x300 往回找最近的 PUSHS 字符串
const soundSites = []; // {func, addr, line, name, dir, syscall, vol}
for (const f of funcs) {
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.op !== 'SYSCALL' || (ins.syscall !== 0x301 && ins.syscall !== 0x300)) continue;
    // 往回最多 6 条找 PUSHS
    let name = null, nameAddr = 0, nameLine = 0, vol = null;
    for (let k = i - 1; k >= Math.max(0, i - 6); k--) {
      const p = f.ins[k];
      if (p.op === 'PUSHS') { name = p.str; nameAddr = p.addr; nameLine = p.line; }
      if (p.op === 'PUSHI' && vol === null) vol = p.imm;
      if (p.op === 'CALL') break; // 跨调用，不可靠
    }
    const sm = name ? reSnd.exec(name) : null;
    soundSites.push({
      func: f.name, addr: ins.addr, line: ins.line, name: name ?? null,
      dir: sm ? sm[1] : null, syscall: ins.syscall, vol, nameAddr, nameLine,
    });
  }
}

// 每个函数载入的 magic\NNN 目录
for (const f of funcs) {
  f.dirs = [];
  for (const ins of f.ins) {
    if (ins.op !== 'PUSHS' || !ins.str) continue;
    const d = reDir.exec(ins.str);
    if (d && !f.dirs.includes(d[1])) f.dirs.push(d[1]);
  }
  f.calls = f.ins.filter((x) => x.callee).map((x) => x.callee);
  f.strs = f.ins.filter((x) => x.str).map((x) => x.str);
}

const byName = new Map(funcs.map((f) => [f.name, f]));

fs.mkdirSync('F:/sanguo/work/sfx84', { recursive: true });
fs.writeFileSync('F:/sanguo/work/sfx84/dis.json', JSON.stringify({
  funcCount: funcs.length,
  funcs: funcs.map((f) => ({ idx: f.idx, name: f.name, argc: f.argc, off: f.off, line: f.line, dirs: f.dirs, calls: f.calls, strs: f.strs })),
  soundSites,
}, null, 1));

console.log('funcs', funcs.length, 'soundSites', soundSites.length);
const named = soundSites.filter((s) => s.dir);
console.log('named', named.length, 'unnamed', soundSites.length - named.length);
const byDir = {};
for (const s of named) (byDir[s.dir] ??= []).push(`${s.name}@${s.func}:0x${s.addr.toString(16)}`);
for (const k of Object.keys(byDir).sort()) console.log(k, byDir[k].length, byDir[k].slice(0, 6).join(' '));
