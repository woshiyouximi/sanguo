import fs from 'node:fs';
const buf = fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI');
let txt;
try {
  txt = new TextDecoder('big5').decode(buf);
  console.log('big5 ok, head:', JSON.stringify(txt.slice(0, 120)));
} catch (e) {
  console.log('big5 fail', e.message);
  txt = buf.toString('latin1');
}
const lines = txt.split(/\r?\n/);
console.log('lines', lines.length);
// 段：以 [name] 或 [name-xxx] 开头
const secs = [];
let cur = null;
for (const line of lines) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { cur = { name: m[1], props: {}, line: secs.length }; secs.push(cur); continue; }
  if (!cur) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) cur.props[kv[1]] = kv[2];
}
console.log('sections', secs.length);
const withSeq = secs.filter((s) => s.props.Sequence);
console.log('withSequence', withSeq.length);
const sndTokens = [];
for (const s of secs) {
  for (const [k, v] of Object.entries(s.props)) {
    for (const m of v.matchAll(/\$([A-Za-z0-9_]+)/g)) sndTokens.push({ obj: s.name, seq: s.props.Sequence, dir: s.props.Directory, field: k, snd: m[1] });
  }
}
const mSnd = sndTokens.filter((t) => /^m\d{3}snd\d{2}$/i.test(t.snd));
console.log('total $ tokens', sndTokens.length, 'm-snd tokens', mSnd.length);
const byS = {};
for (const t of mSnd) (byS[t.snd.toLowerCase()] ??= []).push(t);
for (const k of Object.keys(byS).sort()) {
  console.log(k, byS[k].length, byS[k].map((t) => `${t.obj}[seq=${t.seq},${t.field},dir=${t.dir}]`).join(' | ').slice(0, 400));
}
fs.writeFileSync('F:/sanguo/work/sfx84/things_msnd.json', JSON.stringify({ sections: secs.map((s) => ({ name: s.name, seq: s.props.Sequence, dir: s.props.Directory, snds: Object.entries(s.props).filter(([k, v]) => /\$/.test(v)).map(([k, v]) => ({ k, v })) })), mSnd: byS }, null, 1));
