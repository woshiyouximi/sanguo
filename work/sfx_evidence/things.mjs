// things.mjs — parse extract/pak/THINGS.INI (Big5) into work/sfx_evidence/things.json
// Each [OBJECT] becomes one record keyed by its Sequence number.
import fs from 'node:fs';

const txt = new TextDecoder('big5').decode(fs.readFileSync('extract/pak/THINGS.INI'));
const lines = txt.split(/\r?\n/);

const objs = [];
let cur = null, curLine = 0;
lines.forEach((raw, i) => {
  const l = raw.trim();
  if (/^\[OBJECT\]/i.test(l)) { cur = { line: i + 1, sounds: [], cbs: [], fields: {} }; objs.push(cur); return; }
  if (/^\[/.test(l)) { cur = null; return; }
  if (!cur) return;
  const m = l.match(/^([A-Za-z_]+)\s*=\s*(.*)$/);
  if (!m) return;
  const k = m[1].toLowerCase(), v = m[2].trim();
  (cur.fields[k] ||= []).push(v);
  // animation cells: `$name` plays a sound, `!nnnn` calls script function nnnn
  for (const tok of v.split(',')) {
    const t = tok.trim();
    if (t.startsWith('$')) cur.sounds.push(t.slice(1));
    else if (/^!\d+$/.test(t)) cur.cbs.push(+t.slice(1));
  }
});

const out = {};
for (const o of objs) {
  const seq = parseInt((o.fields.sequence || [''])[0], 10);
  if (!seq) continue;
  out[seq] = {
    seq,
    line: o.line,
    name: (o.fields.name || [''])[0],
    dir: (o.fields.directory || [''])[0],
    type: (o.fields.type || [''])[0],
    process: (o.fields.process || [''])[0],
    sounds: [...new Set(o.sounds)],
    cbs: [...new Set(o.cbs)],
  };
}
fs.writeFileSync('work/sfx_evidence/things.json', JSON.stringify(out, null, 0));
console.log('objects with Sequence:', Object.keys(out).length, 'file L', lines.length);
const dirs = {};
for (const o of Object.values(out)) (dirs[o.dir] ||= []).push(o);
for (const d of Object.keys(dirs).sort()) {
  if (!/magic/.test(d)) continue;
  console.log(d + '  n=' + dirs[d].length);
  for (const o of dirs[d].sort((a, b) => a.seq - b.seq)) {
    console.log('   ' + o.seq + '  ' + o.name + '  $' + (o.sounds.join(',$') || '-') + (o.cbs.length ? '  !' + o.cbs.join(',!') : '') + '  [L' + o.line + ']');
  }
}
