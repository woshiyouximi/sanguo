// 159 临时探针：神鬼亂舞(104) 在 L1-L4 之后的命中/物件明细。
import { fileURLToPath } from 'node:url';
import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';

const data = loadData({ dir: fileURLToPath(new URL('../game/data/', import.meta.url)) });
const m = data.magics.find((x) => x.SEQUENCE === 104);
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
const r = runSkill(world, 'A', m.SCRIPT, 20, 6.5);
console.log(`ok=${r.ok} hits=${r.stats.hits} killed=${r.stats.killed} objects=${r.stats.objects} instructions=${r.stats.instructions}`);
console.log(`fx=${JSON.stringify(world.fx.at(-1))}`);
console.log(`log:\n${r.log.join('\n')}`);
