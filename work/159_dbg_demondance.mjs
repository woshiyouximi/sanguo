// 159 临时调试：神鬼亂舞(104) 同步跑时的命中集合
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const world = createWorld({
  data,
  seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24;
g.y = 6.5;
g.prevX = g.x;
g.prevY = g.y;
const script = data.magics.find((m) => m.SEQUENCE === 104).SCRIPT;
const r = runSkill(world, 'A', script, 20, 6.5);
console.log(`script=${script} ok=${r.ok} hits=${r.stats.hits} killed=${r.stats.killed} fx=${JSON.stringify(r.fx)}`);
console.log(`objects=${r.objects?.length ?? 'n/a'}`);
const near = world.units
  .filter((u) => u.side === 'B' && !u.alive)
  .map((u) => `${u.isGeneral ? 'GEN' : 'sold'}@(${u.x},${u.y})`);
console.log(`B 阵亡=${near.length} ${near.slice(0, 10).join(' ')}`);
console.log(`B 存活兵位置=${world.units
  .filter((u) => u.side === 'B' && !u.isGeneral && u.alive)
  .slice(0, 8)
  .map((u) => `(${u.x},${u.y})`)
  .join(' ')}`);
