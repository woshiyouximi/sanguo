import fs from 'node:fs';
const txt = new TextDecoder('big5').decode(fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI'));
const secs = [];
let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { cur = { name: m[1], props: {} }; secs.push(cur); continue; }
  if (!cur) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) cur.props[kv[1]] = kv[2];
}
console.log('总段数', secs.length);
const hits = [];
for (const s of secs) {
  const all = Object.entries(s.props);
  const bangs = all.filter(([, v]) => /!\d+/.test(v)).map(([k, v]) => k + '=' + v.replace(/\s+/g, ' '));
  if (bangs.length) hits.push({ seq: s.props.Sequence, name: s.name, dir: s.props.Directory, bangs });
}
console.log('带 !nnnn 的物件:', hits.length);
for (const h of hits) console.log('  seq=' + h.seq, '[' + h.name + ']', h.dir, h.bangs.join(' | '));
// dir 018 / 006 / 033 / 034 的物件全列
for (const d of ['018', '006', '033', '034', '004', '007', '010']) {
  const key = '\\magic\\' + d;
  const arr = secs.filter((s) => (s.props.Directory || '').toLowerCase() === key);
  console.log('\ndir ' + d + ' 物件', arr.length, ':', arr.map((s) => s.props.Sequence + '[' + s.name + ']').join(' '));
}
