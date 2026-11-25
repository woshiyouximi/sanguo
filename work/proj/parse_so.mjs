// 解析 magic_so.dis.txt → 函数表 + 调用图 + 物件类 syscall 摘要
// 用途：为 project/187 的「哪些武将技生成投射物实体」考古提供可复算数据。
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const SYM = 'F:/sanguo/game/data/magic_so.symbols.json';

const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const funcs = [];        // {idx,name,num,argc,off,ins:[{addr,op,args,line}]}
let cur = null;
const reHead = /^;\s*func\s+#(\d+)\s+(\S+)\s+id=0x([0-9A-Fa-f]+)\s+argc=(\d+)\s+@0x([0-9A-Fa-f]+)/;
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z0-9_]+)\s*(.*?)\s*(?:;\s*(.*))?$/;

for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const mh = reHead.exec(ln);
  if (mh) {
    cur = { idx: +mh[1], name: mh[2], num: parseInt(mh[3], 16), argc: +mh[4], off: parseInt(mh[5], 16), ins: [] };
    funcs.push(cur);
    continue;
  }
  if (!cur) continue;
  const m = reIns.exec(ln);
  if (!m) continue;
  cur.ins.push({ addr: parseInt(m[1], 16), op: m[3], args: m[4].trim(), cmt: (m[5] || '').trim(), line: i + 1 });
}

const byName = new Map();
const byAddr = new Map();
for (const f of funcs) { byName.set(f.name, f); byAddr.set(f.off, f); }

// 每个函数的：CALL 目标、SYSCALL(id,字面参数)、PUSHS 字符串
const info = new Map();
for (const f of funcs) {
  const calls = [], syscalls = [], strings = [], pushis = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.op === 'CALL' || ins.op === 'CALLS') calls.push({ name: ins.args.split(/\s+/)[0], addr: ins.addr, kind: ins.op, line: ins.line });
    else if (ins.op === 'SYSCALL') {
      const mm = /0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)/.exec(ins.args);
      syscalls.push({ id: mm ? parseInt(mm[1], 16) : -1, packed: mm ? parseInt(mm[2], 16) : -1, addr: ins.addr, line: ins.line });
    } else if (ins.op === 'PUSHS') strings.push({ s: ins.args, addr: ins.addr, line: ins.line });
    else if (ins.op === 'PUSHI') pushis.push({ v: +ins.args, addr: ins.addr });
  }
  info.set(f.name, { f, calls, syscalls, strings, pushis });
}

// 取某条 SYSCALL 之前最近的 k 个 PUSHI 字面量（脚本是「先压参数后 syscall」，
// 但参数之间可能夹 LDSL/local，所以只回溯到上一条 SYSCALL/CALL 或 12 条指令为止）
function pushBefore(f, addr, k) {
  const out = [];
  for (let i = 0; i < f.ins.length; i++) {
    if (f.ins[i].addr !== addr) continue;
    for (let j = i - 1; j >= 0 && out.length < k; j--) {
      const o = f.ins[j];
      if (o.op === 'SYSCALL' || o.op === 'CALL' || o.op === 'JZ' || o.op === 'JNZ' || o.op === 'JMP') break;
      if (o.op === 'PUSHI') out.push(o.args);
    }
    break;
  }
  return out.reverse();
}

const roots = funcs.filter((f) => /^Magic\d+$/.test(f.name));
export const report = roots.map((root) => {
  const seen = new Set();
  const spawns = [];
  const cbs = [];
  const strs = new Set();
  const called = new Set();
  const stack = [root.name];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    const it = info.get(n);
    if (!it) continue;
    for (const s of it.strings) strs.add(s.s);
    for (const c of it.calls) {
      called.add(c.name);
      if (!seen.has(c.name)) stack.push(c.name);
    }
    for (const sc of it.syscalls) {
      const pre = pushBefore(it.f, sc.addr, 4);
      if (sc.id === 0x11) spawns.push({ fn: n, line: sc.line, pre });
      if (sc.id === 0x2c) cbs.push({ fn: n, line: sc.line, num: pre[pre.length - 1] });
      if (sc.id === 0x18) spawns.push({ fn: n + ':frames', line: sc.line, pre });
    }
  }
  return {
    seq: root.num - 500,
    name: root.name,
    off: '0x' + root.off.toString(16).toUpperCase(),
    reach: [...seen].filter((x) => x !== root.name),
    spawns,
    cbs,
    strings: [...strs],
  };
});

if (process.argv[2] === '--json') {
  fs.writeFileSync('F:/sanguo/work/proj/so_calls.json', JSON.stringify(report, null, 1));
  console.log('wrote work/proj/so_calls.json', report.length);
} else {
  for (const r of report) {
    console.log(`#${r.seq}\t${r.name}\t${r.off}\t${r.reach.join(',')}\tspawn=${JSON.stringify(r.spawns)}\tcb=${JSON.stringify(r.cbs)}\tstr=${r.strings.join('|')}`);
  }
}
