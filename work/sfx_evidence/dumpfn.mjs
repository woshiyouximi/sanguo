// dumpfn.mjs — dump a MAGIC.SO function body summary: ThingID candidates, CALLS, sound sites.
// usage: node work/sfx_evidence/dumpfn.mjs ArrowSupport Thunder ...
import fs from 'node:fs';

const L = fs.readFileSync('export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const names = process.argv.slice(2);

const hdrs = [];
L.forEach((l, i) => { if (l.includes('func #') && /\sid=0x/.test(l)) hdrs.push({ i, l }); });

for (const nm of names) {
  const h = hdrs.find(x => new RegExp('\\s' + nm + '\\s+id=').test(x.l));
  if (!h) { console.log('##### ' + nm + ' NOT FOUND'); continue; }
  let j = h.i + 2; const body = [];
  while (j < L.length) { if (/^; -{10,}/.test(L[j]) && body.length > 2) break; body.push({ i: j + 1, s: L[j] }); j++; }
  console.log('##### ' + nm + '  header L' + (h.i + 1) + '  ' + h.l.replace(/^;\s*/, ''));
  const ids = [];
  for (const b of body) { const m = b.s.match(/PUSHI\s+(\d+)/); if (m) { const v = +m[1]; if (v >= 10000 && v < 43000) ids.push(v + '@L' + b.i); } }
  console.log('  ThingID candidates: ' + (ids.join(', ') || '-'));
  for (const b of body) {
    if (/CALLS|CALL\s|SYSCALL\s+0x3(0[01]|1[0-4])|PUSHS\s+\d+\s+; "/.test(b.s)) {
      console.log('   L' + b.i + '  ' + b.s.trim().replace(/\s+/g, ' ').slice(0, 130));
    }
  }
}
