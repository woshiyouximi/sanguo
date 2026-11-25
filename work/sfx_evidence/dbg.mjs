import fs from 'node:fs';
const L = fs.readFileSync('export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const instrRe = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
for (const ln of [4297, 4309, 4317, 5362]) {
  const t = L[ln - 1].match(instrRe);
  console.log(ln, t ? JSON.stringify(t.slice(1)) : 'NOMATCH ' + JSON.stringify(L[ln - 1]));
}
const R = JSON.parse(fs.readFileSync('work/sfx_evidence/resolve.json', 'utf8'));
const r65 = R.find(x => x.seq === 65);
console.log('65', JSON.stringify(r65).slice(0, 300));
