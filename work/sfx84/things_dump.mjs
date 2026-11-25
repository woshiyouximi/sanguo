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
const want = [5001, 5002, 6003, 6004, 14001, 15001, 15002, 15003, 15005, 15008, 15009, 15010, 17002, 17023, 20001, 20002, 43002, 43003, 44001];
for (const w of want) {
  const s = secs.find((x) => Number(x.props.Sequence) === w);
  if (!s) { console.log(w, 'NOT FOUND'); continue; }
  const snd = Object.entries(s.props).filter(([, v]) => v.includes('$')).map(([k, v]) => k + '=' + v);
  console.log(w, '[' + s.name + ']', 'dir=' + s.props.Directory, 'proc=' + s.props.Process, 'Type=' + s.props.Type, snd.join(' | '));
}
console.log('\n0001-0010 与 014/015 目录物件:');
for (const s of secs) {
  const d = (s.props.Directory || '').toLowerCase();
  if (!/^\\magic\\(001|014|015)$/.test(d)) continue;
  console.log(' ', s.props.Sequence, '[' + s.name + ']', d, 'proc=' + s.props.Process);
}
