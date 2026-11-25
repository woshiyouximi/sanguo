import fs from 'node:fs';
const dump = fs.readFileSync('F:/sanguo/work/dis_battle_B_44D450.txt', 'utf8').split(/\r?\n/);
const big5 = new Map();
for (const line of fs.readFileSync('F:/sanguo/work/str_big5.tsv', 'utf8').split(/\r?\n/)) {
  const p = line.split('\t');
  if (p.length >= 2 && /^[0-9A-F]{8}$/.test(p[0])) big5.set(p[0].toUpperCase(), p[1]);
}
// parse lines: "  0044D529                       mov    edx, dword ptr [ebp - 0xc]   "
const ins = [];
for (const line of dump) {
  const m = line.match(/^\s*([0-9A-F]{8})\s+(\S+(?:\s+\S+)*?)\s{2,}(.*)$/);
  if (!m) continue;
  ins.push({ va: m[1], op: (m[2] || '').trim(), arg: (m[3] || '').replace(/;.*/, '').trim() });
}
// find block starts: an instruction immediately following a 'jmp 0x44e6c7' or 'jmp 0x44e6c9' (end) that is >= 0x44D529
const starts = [];
for (let i = 0; i < ins.length; i++) {
  const a = ins[i].arg.toLowerCase();
  if (ins[i].op === 'jmp' && (a === '0x44e6c7' || a === '0x44e6c9' || a === '0x44e6ec')) {
    const nx = ins[i + 1];
    if (nx && parseInt(nx.va, 16) >= 0x44d529 && parseInt(nx.va, 16) < 0x44e6f4) starts.push(i + 1);
  }
}
console.log('block count', starts.length);
// build blocks
const blocks = [];
for (let k = 0; k < starts.length; k++) {
  const s = starts[k];
  const e = k + 1 < starts.length ? starts[k + 1] - 1 : ins.length;
  const body = ins.slice(s, e);
  const strs = [];
  for (const it of body) if (it.op === 'push') {
    const mm = it.arg.match(/0x(49[0-9a-f]{4})/i);
    if (mm) strs.push({ va: '00' + mm[1].toUpperCase(), text: big5.get('00' + mm[1].toUpperCase()) || '?' });
  }
  const calls = body.filter(x => x.op === 'call').map(x => x.arg.replace(/;.*/, '').trim());
  blocks.push({ idx: k, va: body[0]?.va, strs, calls, body });
}
// print compact
for (const b of blocks) {
  const st = [...new Set(b.strs.map(s => s.text))].join(' | ');
  console.log(`idx=${String(b.idx).padStart(2)} va=${b.va} exec=${b.idx + 1} strs=[${st}] calls=[${[...new Set(b.calls)].join(',')}]`);
}
fs.writeFileSync('F:/sanguo/work/blocks_44d450.json', JSON.stringify(blocks.map(b => ({ idx: b.idx, va: b.va, strs: b.strs, body: b.body.map(x => x.va + ' ' + x.op + ' ' + x.arg) })), null, 1));
