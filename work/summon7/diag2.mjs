// 诊断 2：打印 maxHp 与工事状态
import { createWorld, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const world = createWorld({
  data,
  seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24;
g.y = 6.5;
g.prevX = g.x;
g.prevY = g.y;
world.sides.A.general.qi = QI_MAX;
console.log('A general maxHp', world.sides.A.general.maxHp, 'hp', g.hp);
console.log('A units', world.units.filter((u) => u.side === 'A').length, 'B units', world.units.filter((u) => u.side === 'B').length);
console.log('A xs', [...new Set(world.units.filter((u) => u.side === 'A').map((u) => Math.round(u.x * 10) / 10))].sort((a, b) => a - b).join(','));
console.log('B xs', [...new Set(world.units.filter((u) => u.side === 'B').map((u) => Math.round(u.x * 10) / 10))].sort((a, b) => a - b).join(','));
console.log('A ys', [...new Set(world.units.filter((u) => u.side === 'A').map((u) => Math.round(u.y * 10) / 10))].sort((a, b) => a - b).join(','));
