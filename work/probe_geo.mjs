// 临时探针：看几何 —— 战线在哪、主将离战线多远、主将何时可被打到
import { loadData } from '../game/src/data.ts';
import { createWorld, step, TICK_HZ } from '../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data' });

function run(seed, aTroop = 0, bTroop = 0) {
  const w = createWorld({
    data, seed,
    a: { troop: aTroop, formation: 0, morale: 60, general: { str: 70, int: 60, level: 1 } },
    b: { troop: bTroop, formation: 0, morale: 60, general: { str: 70, int: 60, level: 1 } },
  });
  const rows = [];
  const gen = (side) => w.units.find((u) => u.side === side && u.isGeneral);
  let n = 0;
  const limit = 180 * TICK_HZ;
  while (!w.over && n < limit) {
    step(w); n++;
    if (n % 150 === 0 || w.over) {
      const a = w.units.filter((u) => u.alive && u.side === 'A' && !u.isGeneral);
      const b = w.units.filter((u) => u.alive && u.side === 'B' && !u.isGeneral);
      const ga = gen('A'), gb = gen('B');
      // A 前锋 = min x（朝敌方），B 前锋 = max x
      const aFront = a.length ? Math.min(...a.map((u) => u.x)) : NaN;
      const bFront = b.length ? Math.max(...b.map((u) => u.x)) : NaN;
      rows.push({
        t: (n / TICK_HZ).toFixed(1),
        aliveA: a.length, aliveB: b.length,
        aFront: aFront.toFixed(1), bFront: bFront.toFixed(1),
        gap: (aFront - bFront).toFixed(1),
        gAx: ga.x.toFixed(1), gBx: gb.x.toFixed(1),
        // 主将到最近敌人的距离
        dA: Math.min(...b.map((u) => Math.hypot(u.x - ga.x, u.y - ga.y))).toFixed(1),
        dB: Math.min(...a.map((u) => Math.hypot(u.x - gb.x, u.y - gb.y))).toFixed(1),
      });
    }
  }
  console.log(`seed=${seed} winner=${w.winner} tick=${w.tick} (${(w.tick / TICK_HZ).toFixed(1)}s) reason=${w.endReason} genA=${w.sides.A.general.alive} genB=${w.sides.B.general.alive}`);
  console.table(rows);
}

run(1);
run(9001, 2, 10);
