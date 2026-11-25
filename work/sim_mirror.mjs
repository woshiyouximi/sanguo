// 临时探针：镜像局公平性（A 侧是否有系统性优势/劣势）+ 主将是否挨打
import { loadData } from '../game/src/data.ts';
import { TICK_HZ, createWorld, step } from '../game/src/core/battle.ts';
import { runBattle } from '../tools/sim_balance.mjs';

const data = loadData({ dir: 'F:/sanguo/game/data' });
const N = Number(process.argv[2] ?? 400);
const base = { troop: 0, formation: 0, morale: 60, general: { str: 70, int: 60, level: 1 } };

let aWin = 0, draw = 0, atkA = 0, atkB = 0, hitA = 0, hitB = 0, secs = 0;
let genHurtA = 0, genHurtB = 0, genDeadA = 0, genDeadB = 0, firstBloodA = 0, firstBloodB = 0;
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const w = createWorld({ data, seed: 1000 + k, a: { ...base, soldiers: 100 }, b: { ...base, soldiers: 100 } });
  let first = 0;
  const hpA0 = w.sides.A.general.hp, hpB0 = w.sides.B.general.hp;
  const startA = w.sides.A.aliveCount, startB = w.sides.B.aliveCount;
  while (!w.over && w.tick < 30 * 180) {
    step(w);
    if (!first) {
      if (w.sides.A.aliveCount < startA) { first = 1; firstBloodA++; }
      else if (w.sides.B.aliveCount < startB) { first = 2; firstBloodB++; }
    }
  }
  if (w.winner === 'A') aWin++;
  else if (w.winner === 'draw') draw++;
  atkA += w.stats.attacksA; atkB += w.stats.attacksB;
  hitA += w.stats.hitsA; hitB += w.stats.hitsB;
  secs += w.tick / TICK_HZ;
  if (w.sides.A.general.hp < hpA0) genHurtA++;
  if (w.sides.B.general.hp < hpB0) genHurtB++;
  if (!w.sides.A.general.alive) genDeadA++;
  if (!w.sides.B.general.alive) genDeadB++;
}
const p = aWin / N;
const se = Math.sqrt((p * (1 - p)) / N);
console.log(`镜像 朴刀/方形/士气60/武70  N=${N}  A胜=${aWin} (${(p * 100).toFixed(1)}% ±${(196 * se).toFixed(1)})  平=${draw}`);
console.log(`  95%CI ${((p - 1.96 * se) * 100).toFixed(1)}% .. ${((p + 1.96 * se) * 100).toFixed(1)}%`);
console.log(`  攻击 A=${atkA} B=${atkB}  命中 A=${hitA} (${(hitA / atkA).toFixed(4)}) B=${hitB} (${(hitB / atkB).toFixed(4)})`);
console.log(`  命中次数差 = ${hitA - hitB}`);
console.log(`  主将挨打 A=${genHurtA} B=${genHurtB}  主将死 A=${genDeadA} B=${genDeadB}`);
console.log(`  先掉血 A=${firstBloodA} B=${firstBloodB}`);
console.log(`  平均时长 ${(secs / N).toFixed(2)} s  墙钟 ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// 同一批 seed 下，兵种改变是否真的改变战斗（对角镜像应完全一致）
const r1 = runBattle(data, { a: base, b: base }, 1000, { soldiers: 100, maxSec: 180 });
const alt = { ...base, troop: 12 };
const r2 = runBattle(data, { a: alt, b: alt }, 1000, { soldiers: 100, maxSec: 180 });
console.log(`  对角镜像同一 seed：朴刀 ${r1.winner}/${r1.tick}  女兵 ${r2.winner}/${r2.tick} → ${r1.winner === r2.winner && r1.tick === r2.tick ? '完全相同（兵种只经相克表生效）' : '不同'}`);
