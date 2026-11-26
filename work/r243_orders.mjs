import { createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';
import { installArmyOrders } from '../game/src/core/army_cmd.ts';

const data = loadData();
const w = createWorld({
  data,
  seed: 20261124,
  month: 1,
  terrain: 0,
  a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
  b: { troop: 10, formation: 3, soldiers: 100, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  aiSides: { B: true },
});
installArmyOrders(w);
for (let i = 0; i < 200; i += 1) step(w);
// 打光守军的兵（保留主将）
for (const u of w.units) if (u.side === 'B' && !u.isGeneral) u.alive = false;
let t = 0;
while (!w.over && t < 12000) {
  step(w);
  t += 1;
}
const bGen = w.units.find((u) => u.side === 'B' && u.isGeneral);
console.log({
  over: w.over,
  winner: w.winner,
  reason: w.endReason,
  tick: w.tick,
  ticksAfter: t,
  bGenUnit: bGen ? { alive: bGen.alive, x: bGen.x, y: bGen.y } : null,
  bAliveCount: w.sides.B.aliveCount,
  bGenAlive: w.sides.B.general.alive,
  aAlive: w.units.filter((u) => u.side === 'A' && u.alive).length,
  aFront: Math.min(...w.units.filter((u) => u.side === 'A' && u.alive && !u.isGeneral).map((u) => u.x)),
});
