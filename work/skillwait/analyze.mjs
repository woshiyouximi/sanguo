// MAGIC.SO 反汇编 → 每个武将技的 syscall/调用闭包画像，并与探针结果 join。
// 用法：node work/skillwait/analyze.mjs [probe.json] [out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const PROBE = process.argv[2] ?? 'F:/sanguo/work/skillwait/base2.json';
const OUT = process.argv[3] ?? 'F:/sanguo/work/skillwait/analysis.json';

const HDR = /^;\s*func #(\d+)\s+(\S+)\s+id=0x([0-9A-Fa-f]+)\s+argc=(\d+)\s+@0x([0-9A-Fa-f]+)/;
// 行：ADDR  字节串(8~32 hex)  OPCODE  操作数  ; 注释
const INSN = /^([0-9A-F]{6})\s+(?:[0-9A-F]{8,}\s+)?([A-Z][A-Z0-9_]*)\s*([^;]*);?\s*(.*)$/;
// PUSHS 的数字是字符串表 id，注释里给出真实名字：`PUSHS 20 ; "MoveCamera"`
const PUSHS_NAME = /"([A-Za-z_][A-Za-z0-9_]*)"/;

const funcs = new Map();
{
  let cur = null;
  for (const ln of readFileSync(DIS, 'utf8').split(/\r?\n/)) {
    const h = HDR.exec(ln);
    if (h) { cur = { argc: +h[4], body: [] }; funcs.set(h[2], cur); continue; }
    if (!cur || ln.startsWith(';')) continue;
    const m = INSN.exec(ln);
    if (m) cur.body.push({ op: m[2], arg: (m[3] ?? '').trim(), com: m[4] ?? '' });
  }
}

/** 单函数的直接引用：syscall id、CALL 名字、CALLS 名字（PUSHS 解析）。 */
function directOf(name) {
  const f = funcs.get(name);
  const out = { sys: [], calls: [], names: [] };
  if (!f) return out;
  let pending = null; // 上一次 CALL/CALLS 之后出现的第一个 PUSHS 名字 = 被调函数名
  for (const { op, arg, com } of f.body) {
    if (op === 'SYSCALL') {
      const idm = /^0x([0-9A-Fa-f]+)/.exec(arg);
      if (idm) out.sys.push(parseInt(idm[1], 16));
    } else if (op === 'CALL') {
      out.calls.push(arg.split(/\s/)[0]);
      pending = null;
    } else if (op === 'CALLS') {
      if (pending) out.names.push(pending);
      pending = null;
    } else if (op === 'PUSHS' && pending === null) {
      const nm = PUSHS_NAME.exec(com);
      if (nm) pending = nm[1];
    }
  }
  return out;
}

const memo = new Map();
function closure(name, seen = new Set()) {
  if (memo.has(name)) return memo.get(name);
  if (seen.has(name)) return [];
  seen.add(name);
  const d = directOf(name);
  const own = { sys: [...d.sys], fns: [name] };
  for (const c of [...d.calls, ...d.names]) {
    if (!funcs.has(c)) { own.fns.push(`${c}(缺)`); continue; }
    const sub = closure(c, seen);
    own.sys.push(...sub.sys);
    own.fns.push(...sub.fns);
  }
  memo.set(name, own);
  return own;
}

const probe = JSON.parse(readFileSync(PROBE, 'utf8'));
const rows = probe.map((r) => {
  const fn = `Magic${r.script - 500}`;
  const c = funcs.has(fn) ? closure(fn) : { sys: [], fns: [] };
  const sys = [...new Set(c.sys)].sort((a, b) => a - b);
  return { seq: r.seq, script: r.script, name: r.name, effect: r.effect, fn, nSys: sys, fns: [...new Set(c.fns)] };
});

// ── 交叉表：每个 syscall 在"有效/无效果"两组各出现几次 ──
const ids = new Set();
for (const r of rows) for (const s of r.nSys) ids.add(s);
const cross = [...ids].sort((a, b) => a - b).map((id) => {
  const e = rows.filter((r) => r.effect && r.nSys.includes(id)).length;
  const n = rows.filter((r) => !r.effect && r.nSys.includes(id)).length;
  return { id, e, n };
});
cross.sort((a, b) => (b.n - b.e) - (a.n - a.e));

const noEff = rows.filter((r) => !r.effect);
const eff = rows.filter((r) => r.effect);
console.log(`=== ${rows.length} 条：有效 ${eff.length}，无效果 ${noEff.length} ===`);
console.log('\n=== syscall 交叉表（按 无效果-有效 排序）===');
for (const t of cross) {
  const mark = t.n > 0 && t.e === 0 ? '  <<只在无效果组' : t.e === 0 ? '' : '';
  console.log(`0x${t.id.toString(16).toUpperCase().padStart(4, '0')}  eff=${String(t.e).padStart(3)}  no=${String(t.n).padStart(3)}${mark}`);
}
console.log('\n=== 无效果逐条 ===');
for (const r of noEff) {
  console.log(`  ${String(r.seq).padStart(3)} ${r.fn.padEnd(10)} ${String(r.name).padEnd(8)} sys=[${r.nSys.map((x) => '0x' + x.toString(16)).join(' ')}]`);
}
writeFileSync(OUT, JSON.stringify({ rows, cross, noEff: noEff.map((r) => r.seq), eff: eff.map((r) => r.seq) }, null, 1), 'utf8');
console.log('\n已写', OUT);
