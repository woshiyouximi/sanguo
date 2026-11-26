import { createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData();
const w = createWorld({
  data,
  seed: 7,
  terrain: 0,
  sideA: { general: '關羽', soldiers: 10, officers: [] },
  sideB: { general: '守備隊', soldiers: 10, officers: [] },
});
for (let i = 0; i < 120; i += 1) step(w, 1);
console.log('start', { over: w.over, A: w.units.filter((u) => u.side === 'A').length, B: w.units.filter((u) => u.side === 'B').length, bGenUnit: w.units.some((u) => u.side === 'B' && u.isGeneral) });

// 模拟「打光守军」：把 B 侧除主将以外的单位全部打死
for (const u of w.units) {
  if (u.side === 'B' && !u.isGeneral) u.alive = false;
}
let t = 0;
while (!w.over && t < 12000) {
  step(w, 1);
  t += 1;
}
console.log('soldiers-dead', {
  over: w.over,
  winner: w.winner,
  reason: w.endReason,
  tick: w.tick,
  ticksAfter: t,
  bGenAlive: w.sides.B.general.alive,
  bGenHp: w.sides.B.general.hp,
  bUnits: w.units.filter((u) => u.side === 'B' && u.alive).map((u) => ({ g: u.isGeneral, x: u.x, y: u.y })),
  aUnits: w.units.filter((u) => u.side === 'A' && u.alive).length,
  nearestA: w.units
    .filter((u) => u.side === 'A' && u.alive && !u.isGeneral)
    .map((u) => ({ x: u.x, y: u.y, hp: u.hp, state: u.state, key: u.key ?? null }))
    .sort((p, q) => Math.abs(p.x - 13) + Math.abs(p.y - 6) - (Math.abs(q.x - 13) + Math.abs(q.y - 6)))
    .slice(0, 5),
});
