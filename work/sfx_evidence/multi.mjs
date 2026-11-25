// multi.mjs — rows where more than one distinct m-sound is statically reachable
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('work/sfx_evidence/audit.json', 'utf8'));
for (const o of rows) {
  const all = [...new Set(o.scriptSnd.map(s => s.split('@')[0]).concat(o.thingSnd.map(s => s.split('@')[0])))];
  if (all.length > 1) console.log(`${o.k} ${o.name} dir${o.dir} cur=${o.cur} grade=${o.grade}  candidates=${all.join(',')}`);
}
