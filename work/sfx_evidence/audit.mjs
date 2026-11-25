// audit.mjs — cross-check the game's MAGIC_SFX table against script/thing evidence
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync('work/sfx_evidence/resolve.json', 'utf8'));
const ts = fs.readFileSync('game/src/core/audio_bus.ts', 'utf8');

const cur = {};
const tbl = ts.slice(ts.indexOf('export const MAGIC_SFX'), ts.indexOf('MAGIC_SFX_GRADE'));
for (const m of tbl.matchAll(/'(\d{3})':\s*'([^']+)'/g)) cur[m[1]] = m[2];
const grd = {};
const gblk = ts.slice(ts.indexOf('export const MAGIC_SFX_GRADE'));
for (const m of gblk.matchAll(/'(\d{3})'\s*:\s*'([^']+)'/g)) grd[m[1]] = m[2];

const out = [];
for (const r of rows) {
  const k = String(r.seq).padStart(3, '0');
  const scriptSnd = [...new Map((r.snds || []).map(s => [s.snd + '@' + s.depth, s])).values()]
    .map(s => `${s.snd}@d${s.depth}<${s.path}>L${s.line}`);
  const thingSnd = [...new Map((r.hits || []).filter(h => h.sounds.length)
    .map(h => [h.sounds.join('|') + '@' + h.seq, h])).values()]
    .map(h => `${h.sounds.join('+')}@obj${h.seq}/${h.name}@d${h.depth}`);
  const c = cur[k] || '?';
  const evid = scriptSnd.concat(thingSnd);
  const ok = c === 'arrow' ? false : evid.some(e => e.startsWith(c + '@'));
  out.push({ k, name: r.name, dir: r.dir, dirs: r.dirs, fx: r.fx, cur: c, grade: grd[k], ok, scriptSnd, thingSnd });
}

fs.writeFileSync('work/sfx_evidence/audit.json', JSON.stringify(out, null, 1));
const bad = out.filter(o => !o.ok);
console.log('rows', out.length, ' mismatch', bad.length);
for (const o of bad) {
  console.log(`\n${o.k} ${o.name} dir${o.dir} cur=${o.cur} grade=${o.grade}`);
  if (o.scriptSnd.length) o.scriptSnd.forEach(s => console.log('   S ' + s));
  if (o.thingSnd.length) o.thingSnd.forEach(s => console.log('   T ' + s));
}
