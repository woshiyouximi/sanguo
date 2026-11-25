import { createWorld, step, camera, GRID_W, GRID_H, ROW_PX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({
  data,
  seed: 7,
  a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
  b: { troop: 10, formation: 3, soldiers: 100, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  aiSides: { B: true },
});

function rows(side) {
  const us = w.units.filter((u) => u.side === side);
  const xs = us.map((u) => u.x);
  return { n: us.length, min: Math.min(...xs).toFixed(2), max: Math.max(...xs).toFixed(2) };
}
function gens() {
  return w.units.filter((u) => u.general).map((u) => ({ side: u.side, x: u.x.toFixed(2), y: u.y.toFixed(2) }));
}
console.log('cam', camera(w).toFixed(2), 'grid', GRID_W, 'x', GRID_H, 'rowPx', ROW_PX.toFixed(2));
console.log('A', JSON.stringify(rows('A')), 'B', JSON.stringify(rows('B')));
console.log('generals', JSON.stringify(gens()));
for (let i = 0; i < 4; i++) step(w);
console.log('after 4 ticks cam', camera(w).toFixed(2), 'generals', JSON.stringify(gens()));
console.log('A', JSON.stringify(rows('A')), 'B', JSON.stringify(rows('B')));
