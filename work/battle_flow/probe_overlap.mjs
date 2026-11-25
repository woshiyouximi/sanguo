import { createWorld, step, camera, GRID_W, GRID_H, unitCell } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({
  data,
  seed: 7,
  a: { troop: 2, formation: 0, soldiers: 60, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
  b: { troop: 10, formation: 3, soldiers: 60, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  aiSides: { B: true },
});

let worst = { tick: -1, dup: 0, sample: [] };
for (let t = 0; t < 400; t++) {
  step(w);
  const seen = new Map();
  let dup = 0;
  const sample = [];
  for (const u of w.units) {
    if (!u.alive) continue;
    const c = unitCell(u);
    const k = `${Math.round(c.gx)},${Math.round(c.gy)}`;
    if (seen.has(k)) { dup++; if (sample.length < 6) sample.push(k); }
    else seen.set(k, u);
  }
  if (dup > worst.dup) worst = { tick: t, dup, sample };
}
console.log('camera', camera(w).toFixed(2), 'aliveA', w.sides.A.aliveCount, 'aliveB', w.sides.B.aliveCount);
console.log('worst same-cell', JSON.stringify(worst), 'of', w.units.filter((u) => u.alive).length);
const gens = w.units.filter((u) => u.alive && u.isGeneral).map((u) => ({ side: u.side, gx: +u.x.toFixed(2), gy: +u.y.toFixed(2) }));
console.log('generals', JSON.stringify(gens));
