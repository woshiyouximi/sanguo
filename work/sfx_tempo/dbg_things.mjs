import fs from 'node:fs';
const ROOT = 'F:/sanguo';
const txt = new TextDecoder('big5').decode(fs.readFileSync(`${ROOT}/extract/pak/THINGS.INI`));
const lines = txt.split(/\r?\n/);
console.log('total lines', lines.length);
console.log(lines.slice(0, 25).map((l) => JSON.stringify(l)).join('\n'));
const dirs = new Map();
let cur = null;
for (const raw of lines) {
  const line = raw.trim();
  const h = /^\[(.*)\]$/.exec(line);
  if (h) { cur = h[1]; continue; }
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv && cur && kv[1].toLowerCase() === 'directory') dirs.set(kv[2].trim(), (dirs.get(kv[2].trim()) ?? 0) + 1);
}
console.log('dir count', dirs.size);
console.log([...dirs.keys()].filter((d) => /magic/i.test(d)).sort().slice(0, 12));
