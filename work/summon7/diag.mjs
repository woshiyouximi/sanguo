// 诊断：直接跑 SCRIPT=509（伏兵組陣）看 CALL/CALLS 轨迹
import { createWorld, QI_MAX } from '../../game/src/core/battle.ts';
import { runSkill } from '../../game/src/core/smartscript/runtime.ts';
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
const before = world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length;
console.log('before', before);
let n = 0;
const res = runSkill(world, 'A', 509, 20, 6.5, {
  trace: (t) => {
    n++;
    if (n < 400) console.log('T', t);
  },
});
console.log('res', { hits: res.hits, kills: res.kills, ok: res.ok, reason: res.reason });
console.log('after', world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length);
console.log('log', (res.log ?? []).slice(0, 40));
