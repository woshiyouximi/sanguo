// 场景布局诊断：打印双方单位坐标，确认探针落点 (20,6.5) 到底离谁近。
import { createWorld } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const world = createWorld({
  data, seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24; g.y = 6.5;
console.log('field?', world.w, world.h);
for (const side of ['A', 'B']) {
  const us = world.units.filter((u) => u.side === side);
  const gs = us.filter((u) => u.isGeneral);
  const sol = us.filter((u) => !u.isGeneral);
  console.log(`side ${side}: n=${us.length} gen=(${gs.map((u) => u.x.toFixed(1) + ',' + u.y.toFixed(1)).join(')(')})`);
  console.log(`  soldiers x[${Math.min(...sol.map((u) => u.x)).toFixed(1)}..${Math.max(...sol.map((u) => u.x)).toFixed(1)}] y[${Math.min(...sol.map((u) => u.y)).toFixed(1)}..${Math.max(...sol.map((u) => u.y)).toFixed(1)}]`);
  console.log(`  sample: ${sol.slice(0, 6).map((u) => `(${u.x.toFixed(1)},${u.y.toFixed(1)}${u.kind === 'cavalry' ? 'C' : ''})`).join(' ')}`);
}
console.log('aim (20,6.5) 最近的敌单位:', world.units.filter((u) => u.side === 'B')
  .map((u) => ({ u, d: Math.hypot(u.x - 20, u.y - 6.5) })).sort((p, q) => p.d - q.d).slice(0, 3)
  .map((p) => `(${p.u.x.toFixed(1)},${p.u.y.toFixed(1)})d=${p.d.toFixed(2)}`).join(' '));
