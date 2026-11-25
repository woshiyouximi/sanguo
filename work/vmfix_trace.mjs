// R88 跟踪：MoreSoldier / ProduceSoldier 的 CALLS 实参到底是多少。
import { runSkill } from '../game/src/core/smartscript/runtime.ts';
import { createWorld, QI_MAX } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const world = createWorld({
  data, seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const g = world.units.find((u) => u.isGeneral && u.side === 'A');
g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
world.sides.A.general.qi = QI_MAX;

const lines = [];
const r = runSkill(world, 'A', 509, 20, 6.5, { trace: (t) => lines.push(t) });
console.log('ok=', r.ok, 'lines=', lines.length);
for (const t of lines) if (/MoreSoldier|ProduceSoldier|StepShow/.test(t)) console.log(t);
console.log('--- 0x113/0x119 相关 syscall 计数 ---');
console.log('units total=', world.units.length, 'A=', world.units.filter((u) => u.side === 'A').length, 'B=', world.units.filter((u) => u.side === 'B').length);
