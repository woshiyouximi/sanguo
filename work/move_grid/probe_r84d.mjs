import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, step, skillMarksOf } from '../../game/src/core/battle.ts';
const data = loadData();
function mk() {
  return createWorld({ data, seed: 7, a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: 56, int: 95, level: 2 } }, b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: 69, int: 63, level: 2 } }, aiSides: { A: false, B: false } });
}
for (const mode of ['auto', 'point-center', 'point-gen']) {
  const w = mk(); const a = w.units.find((u) => u.isGeneral && u.side === 'A');
  const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
  const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length, cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
  const gb = w.units.find((u) => u.isGeneral && u.side === 'B');
  a.x = cx - 1.4; a.y = cy; a.prevX = a.x; a.prevY = a.y;
  const r = mode === 'auto' ? cast(w, 'A', 50, undefined, undefined, 24) : mode === 'point-center' ? cast(w, 'A', 50, cx, cy, 24) : cast(w, 'A', 50, gb.x, gb.y, 24);
  for (let t = 0; t < 400 && w.stats.spellKillsA === 0 && !w.over; t++) step(w);
  console.log(mode, 'castDmg', r.damage, 'kills', w.stats.spellKillsA, 'dmg', w.stats.spellDamageA, 'aliveB', w.sides.B.aliveCount, 'marks', JSON.stringify(skillMarksOf(w).filter((m) => m.damage > 0 || m.kills > 0)));
}
