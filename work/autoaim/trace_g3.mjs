// 追踪 g3 是否被真正消费：LDG 3 -> STL locN -> 之后是否 LDSL locN
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const funcs = [];
const headerRe = /^; func #(\d+)\s+(\S+)\s+id=(\S+)\s+argc=(\d+)\s+@(\S+)/;
for (let i = 0; i < lines.length; i++) {
  const m = headerRe.exec(lines[i]);
  if (m) {
    if (funcs.length) funcs[funcs.length - 1].to = i;
    funcs.push({ idx: +m[1], name: m[2], argc: +m[4], addr: m[5], from: i, to: lines.length });
  }
}
const opRe = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+(\S+)\s*(.*?)\s*;/;
for (const f of funcs) {
  f.ops = [];
  for (let i = f.from + 1; i < f.to; i++) {
    if (lines[i].startsWith('; func #')) break;
    const m = opRe.exec(lines[i]);
    if (!m) continue;
    f.ops.push({ pc: m[1], op: m[3], args: (m[4] || '').trim(), line: i + 1 });
  }
}
const byName = new Map(funcs.map(f => [f.name, f]));

function g3Report(f) {
  const res = [];
  for (let i = 0; i < f.ops.length; i++) {
    const o = f.ops[i];
    if (o.op !== 'LDG' || parseInt(o.args, 10) !== 3) continue;
    // 下一条必须是 STL/STG，否则直接当参数用掉
    const next = f.ops[i + 1];
    if (!next) { res.push({ line: o.line, how: '末尾' }); continue; }
    if (next.op === 'STL' || next.op === 'STG') {
      const slot = next.args;
      const used = f.ops.slice(i + 2).filter(x => x.op === 'LDSL' && x.args === slot || x.op === 'LDSG' && x.args === slot);
      res.push({ line: o.line, how: `存入 ${slot}`, used: used.map(u => u.line), readBack: used.length });
    } else if (next.op === 'PUSHS' || next.op === 'PUSHI') {
      res.push({ line: o.line, how: '（被下一条覆盖，丢弃）' });
    } else {
      res.push({ line: o.line, how: `直接作为参数 -> ${next.op}`, consumed: true });
    }
  }
  return res;
}

const names = process.argv.slice(2);
const out = [];
for (const n of names) {
  const f = byName.get(n);
  if (!f) { out.push(`${n}: 缺失`); continue; }
  const r = g3Report(f);
  out.push(`#${f.idx} ${f.name} argc=${f.argc} @${f.addr} 指令=${f.ops.length} LDG3=${r.length}`);
  for (const x of r) out.push(`   dis:${x.line} ${x.how}${x.used ? ' -> 回读于 ' + x.used.join(',') : ''}`);
}
console.log(out.join('\n'));
