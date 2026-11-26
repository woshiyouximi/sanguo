// 解析 text_dis.tsv，重建 0x44E6F4 的 66 项跳转表，并反查某个 case 的编号
import fs from 'node:fs';

const TSV = 'F:/sanguo/work/orig_numbers/text_dis.tsv';
const lines = fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean);
const rows = [];
for (const ln of lines) {
  const c = ln.split('\t');
  if (c.length < 3) continue;
  rows.push({ addr: parseInt(c[0], 16), bytes: c[1], mnem: (c[2] || '').trim(), ops: (c[3] || '').trim() });
}
const byAddr = new Map(rows.map(r => [r.addr, r]));

// 内存字节流（用于重建数据表）
const mem = new Map();
for (const r of rows) {
  const m = r.bytes.match(/../g);
  if (!m) continue;
  m.forEach((b, i) => mem.set(r.addr + i, parseInt(b, 16)));
}

function dword(a) {
  return (mem.get(a) | (mem.get(a + 1) << 8) | (mem.get(a + 2) << 16) | (mem.get(a + 3) << 24)) >>> 0;
}

const TABLE = 0x44e6f4;
const N = 66;
console.log('idx  wise_id  target');
const seen = new Map();
for (let i = 0; i < N; i++) {
  const t = dword(TABLE + i * 4);
  console.log(String(i).padStart(2), String(i + 1).padStart(6), ' 0x' + t.toString(16).toUpperCase());
  if (!seen.has(t)) seen.set(t, []);
  seen.get(t).push(i + 1);
}
console.log('\n重复目标:', JSON.stringify([...seen].filter(([, v]) => v.length > 1).map(([k, v]) => ['0x' + k.toString(16), v])));
console.log('0x44DE44 出现在 wise_id:', [...seen].filter(([k]) => k === 0x44de44).map(([, v]) => v));

function dump(start, n = 18) {
  let a = start;
  let out = [];
  for (let i = 0; i < n; i++) {
    const r = byAddr.get(a);
    if (!r) break;
    out.push('0x' + a.toString(16).toUpperCase().padStart(8, '0') + '  ' + r.mnem + ' ' + r.ops);
    a += (r.bytes.length / 2) | 0;
  }
  return out.join('\n');
}

const target = Number(process.argv[2] || '0x44de44');
console.log('\n=== case 0x' + target.toString(16).toUpperCase() + ' ===');
console.log(dump(target, 30));
