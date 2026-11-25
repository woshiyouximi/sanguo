import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, settle, skillMarksOf, step } from '../../game/src/core/battle.ts';
const data = loadData();
const w = createWorld({ data, seed: 7, a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: 56, int: 95, level: 2 } }, b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: 69, int: 63, level: 2 } }, aiSides: { A: false, B: false } });
const a = w.units.find((u) => u.isGeneral && u.side === 'A');
const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length;
const cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
a.x = cx - 1.4; a.y = cy; a.prevX = a.x; a.prevY = a.y;
const r = cast(w, 'A', 50, undefined, undefined, 24);
console.log('cast', r, 'sessions', w.sessions.length, 'foes', foes.length, 'cx', cx.toFixed(1), 'a', a.x.toFixed(1), a.y.toFixed(1));
for (let t = 0; t < 400; t++) {
  step(w);
  if (t % 40 === 0) console.log('t' + t, 'sess', w.sessions.length, 'dmg', w.stats.spellDamageA, 'kills', w.stats.spellKillsA, 'marks', JSON.stringify(skillMarksOf(w).slice(0, 3)), 'foeAlive', w.sides.B.aliveCount);
  if (w.stats.spellKillsA > 0 || w.over) break;
}
console.log('end', 'sess', w.sessions.length, 'dmg', w.stats.spellDamageA, 'kills', w.stats.spellKillsA, 'marks', JSON.stringify(skillMarksOf(w)));
