import { createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData();
const base = {
  data,
  seed: 7,
  terrain: 0,
  sideA: { general: '關羽', soldiers: 10, officers: [] },
  sideB: { general: '守備隊', soldiers: 0, officers: [] },
};

for (const label of ['空城 0 兵', '空城 0 兵 + 主将无兵']) {
  const w = createWorld(base);
  let ticks = 0;
  while (!w.over && ticks < 4000) {
    step(w, 1);
    ticks += 1;
  }
  console.log(label, {
    over: w.over,
    winner: w.winner,
    reason: w.endReason,
    tick: w.tick,
    unitsA: w.units.filter((u) => u.side === 'A').length,
    unitsB: w.units.filter((u) => u.side === 'B').length,
    bGenAlive: w.sides.B.general.alive,
  });
}
