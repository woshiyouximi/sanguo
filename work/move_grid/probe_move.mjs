// probe: does the new step model actually move units? print cells over time
import { loadData } from '../../game/src/data.ts';
import { createWorld, step, unitCell, GRID_W } from '../../game/src/core/battle.ts';

const data = loadData();
const w = createWorld({
  data,
  seed: 7,
  a: { formation: 0, troop: 2, morale: 60, soldiers: 100, general: { name: 'A', str: 80, int: 60 } },
  b: { formation: 0, troop: 10, morale: 60, soldiers: 100, general: { name: 'B', str: 80, int: 60 } },
});
const cellsOf = (side) => w.units.filter((u) => u.side === side).map((u) => unitCell(u));
const meanX = (side) => { const c = cellsOf(side); return c.reduce((s, v) => s + v.gx, 0) / c.length; };
console.log('start', 'A x range', Math.min(...cellsOf('A').map((c) => c.gx)), Math.max(...cellsOf('A').map((c) => c.gx)), 'mean', meanX('A').toFixed(2),
  '| B mean', meanX('B').toFixed(2));
for (let t = 1; t <= 600; t++) {
  step(w);
  if (t % 100 === 0) {
    const a = cellsOf('A'), b = cellsOf('B');
    console.log(`t=${t} A meanX ${meanX('A').toFixed(2)} span ${Math.min(...a.map((c) => c.gx))}..${Math.max(...a.map((c) => c.gx))} | B meanX ${meanX('B').toFixed(2)} span ${Math.min(...b.map((c) => c.gx))}..${Math.max(...b.map((c) => c.gx))} | units ${w.units.length} over=${w.over} hitA=${w.sides.A.general ? '' : ''}`);
  }
}
