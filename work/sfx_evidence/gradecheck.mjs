// gradecheck.mjs — for each row, minimum evidence depth of the chosen sound, vs declared grade
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('work/sfx_evidence/audit.json', 'utf8'));
const minDepth = (o) => {
  let best = 99;
  for (const s of o.scriptSnd) {
    const [nm, rest] = s.split('@d');
    if (nm !== o.cur) continue;
    best = Math.min(best, parseInt(rest, 10));
  }
  for (const s of o.thingSnd) {
    const nm = s.split('@')[0];
    if (!nm.split('+').includes(o.cur)) continue;
    const d = parseInt((s.match(/@d(\d+)$/) || [])[1] || '99', 10);
    best = Math.min(best, d);
  }
  return best;
};
const stat = {};
for (const o of rows) {
  const d = minDepth(o);
  stat[o.grade] = (stat[o.grade] || 0) + 1;
  if ((o.grade === 'A' && d > 1) || (o.grade === 'A2' && (d > 4 || d === 99)) || o.grade === 'C') {
    console.log(`${o.k} ${o.name} dir${o.dir} cur=${o.cur} grade=${o.grade} minDepth=${d}  ` +
      `S=[${o.scriptSnd.slice(0, 3).join(' ; ')}] T=[${o.thingSnd.slice(0, 2).join(' ; ')}]`);
  }
}
console.log('grade counts', JSON.stringify(stat));
