// 解析 magic_so.dis.txt：函数分块 + 调用图 + 指令统计
// 用途：查清 MAGIC.SO 里哪些函数真正读引擎目标（LDG 3 / SYSCALL 0x111/0x112/0x113）
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);

/** @type {{idx:number,name:string,id:string,argc:number,addr:string,from:number,to:number}[]} */
const funcs = [];
const headerRe = /^; func #(\d+)\s+(\S+)\s+id=(\S+)\s+argc=(\d+)\s+@(\S+)/;
for (let i = 0; i < lines.length; i++) {
  const m = headerRe.exec(lines[i]);
  if (m) {
    if (funcs.length) funcs[funcs.length - 1].to = i;
    funcs.push({ idx: +m[1], name: m[2], id: m[3], argc: +m[4], addr: m[5], from: i, to: lines.length });
  }
}

const opRe = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+(\S+)\s*(.*?)\s*;/;
const callRe = /^CALL\s+(\S+)/;

const byName = new Map();
let lds = 0, calls = 0;
for (const f of funcs) {
  const ops = [];
  for (let i = f.from + 1; i < f.to; i++) {
    const line = lines[i];
    if (line.startsWith('; func #')) break;
    const m = opRe.exec(line);
    if (!m) continue;
    const op = m[3];
    const args = m[4] || '';
    ops.push({ pc: m[1], op, args, line: i + 1 });
    lds++;
  }
  f.ops = ops;
  byName.set(f.name, f);
}

function stat(f) {
  let g3 = 0, g2 = 0, g5 = 0, g4 = 0, s100 = 0, s111 = 0, s112 = 0, s113 = 0, s129 = 0, s12a = 0, s10d = 0, s125 = 0;
  for (const o of f.ops) {
    if (o.op === 'LDG') {
      const n = parseInt(o.args, 10);
      if (n === 3) g3++; else if (n === 2) g2++; else if (n === 5) g5++; else if (n === 4) g4++;
    } else if (o.op === 'SYSCALL') {
      const n = parseInt(o.args, 16);
      if (n === 0x100) s100++; else if (n === 0x111) s111++; else if (n === 0x112) s112++;
      else if (n === 0x113) s113++; else if (n === 0x129) s129++; else if (n === 0x12a) s12a++;
      else if (n === 0x10d) s10d++; else if (n === 0x125) s125++;
    }
  }
  return { g2, g3, g4, g5, s100, s111, s112, s113, s10d, s125, s129, s12a };
}

// 全函数统计：哪些函数读 g3
const rows = funcs.map(f => ({ name: f.name, idx: f.idx, n: f.ops.length, ...stat(f) }));
const withG3 = rows.filter(r => r.g3 > 0).sort((a, b) => b.g3 - a.g3);
const withS100 = rows.filter(r => r.s100 > 0).sort((a, b) => b.s100 - a.s100);
const withS111112 = rows.filter(r => r.s111 + r.s112 > 0);

const out = [];
out.push(`函数总数=${funcs.length} 指令总数=${lds}`);
out.push(`LDG3 函数数=${withG3.length}  LDG3 总次数=${rows.reduce((s, r) => s + r.g3, 0)}`);
out.push(`SYSCALL 0x100 函数数=${withS100.length} 总次数=${rows.reduce((s, r) => s + r.s100, 0)}`);
out.push(`SYSCALL 0x111/0x112 函数数=${withS111112.length}`);
out.push('');
out.push('== 读 g3 最多的 30 个函数 ==');
for (const r of withG3.slice(0, 30)) out.push(`#${r.idx} ${r.name}  g3=${r.g3} g2=${r.g2} g5=${r.g5} s100=${r.s100} s111=${r.s111} s112=${r.s112} s113=${r.s113} ins=${r.n}`);
out.push('');
out.push('== 写 targetPx(0x100) 最多的 20 个函数 ==');
for (const r of withS100.slice(0, 20)) out.push(`#${r.idx} ${r.name}  s100=${r.s100} g3=${r.g3} g5=${r.g5} s111=${r.s111} s112=${r.s112} s113=${r.s113}`);
out.push('');
out.push('== 读 targetPx(0x111/0x112) 的全部函数 ==');
for (const r of withS111112) out.push(`#${r.idx} ${r.name}  s111=${r.s111} s112=${r.s112} s100=${r.s100} g3=${r.g3} s113=${r.s113}`);

// 调用图
function callees(f, depth = 1, acc = new Set(), seen = new Set()) {
  if (seen.has(f.name)) return acc;
  seen.add(f.name);
  for (const o of f.ops) {
    const m = callRe.exec(o.op + ' ' + o.args);
    if (!m) continue;
    const name = m[1];
    acc.add(name);
    if (depth > 1 && byName.has(name)) callees(byName.get(name), depth - 1, acc, seen);
  }
  return acc;
}

// magics.json -> SCRIPT -> MagicN
const magics = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magics.json', 'utf8'));
const arr = Array.isArray(magics) ? magics : (magics.magics || magics.list || Object.values(magics)[0]);
out.push('');
out.push('== 110 条武将技：脚本函数读数统计（含一层调用）==');
out.push('seq name            fn        g3 g5 s100 s111 s112 s113  直接调用');
for (const m of arr) {
  const fnName = 'Magic' + (m.SCRIPT - 500);
  const fn = byName.get(fnName);
  if (!fn) { out.push(`${m.SEQUENCE} ${m.NAME} SCRIPT=${m.SCRIPT} -> ${fnName} 缺失`); continue; }
  const direct = [...callees(fn, 1)].filter(n => byName.has(n));
  const agg = { g3: 0, g5: 0, s100: 0, s111: 0, s112: 0, s113: 0 };
  const add = (s) => { agg.g3 += s.g3; agg.g5 += s.g5; agg.s100 += s.s100; agg.s111 += s.s111; agg.s112 += s.s112; agg.s113 += s.s113; };
  add(stat(fn));
  for (const n of direct) add(stat(byName.get(n)));
  out.push(`${String(m.SEQUENCE).padStart(3)} ${String(m.NAME).padEnd(12)} ${fnName.padEnd(9)} ${String(agg.g3).padStart(2)} ${String(agg.g5).padStart(2)} ${String(agg.s100).padStart(4)} ${String(agg.s111).padStart(4)} ${String(agg.s112).padStart(4)} ${String(agg.s113).padStart(4)}  ${direct.join(',')}`);
}

fs.mkdirSync('F:/sanguo/work/autoaim', { recursive: true });
fs.writeFileSync('F:/sanguo/work/autoaim/dis_stats.txt', out.join('\n') + '\n');
console.log(out.slice(0, 60).join('\n'));
