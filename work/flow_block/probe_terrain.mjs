// 复刻 tests/battle.test.ts:347「地形接入生效」的 200 局口径，对比 blockPass 开/关。
// 用途：判定该测试翻红是不是我这轮（passBlocked + pullInStep）引起的。
import { createWorld, step, TICK_HZ } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const troops = data.troops.names;
const troopIdx = (name) => {
  const i = troops.indexOf(name);
  if (i < 0) throw new Error(`没有兵种 ${name}`);
  return i;
};
const aTroop = troopIdx('弩兵');
const bTroop = troopIdx('朴刀');
const N = 200;
const LIMIT = 180 * TICK_HZ;

function runWorld(w) {
  engage(w);
  let n = 0;
  while (!w.over && n < LIMIT) {
    step(w);
    n++;
  }
  return w;
}

function winRate(terrain, blockPass) {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const w = createWorld({
      data,
      seed: 4000 + i,
      terrain,
      a: { troop: aTroop, soldiers: 40 },
      b: { troop: bTroop, soldiers: 40 },
    });
    if (blockPass !== undefined) w.blockPass = blockPass;
    runWorld(w);
    if (w.winner === 'A') wins++;
  }
  return wins / N;
}

for (const [label, bp] of [['基线 blockPass=false', false], ['本轮 blockPass=缺省(开)', undefined]]) {
  const r0 = winRate(0, bp);
  const r3 = winRate(3, bp);
  console.log(
    `${label}: 地形0 ${(r0 * 100).toFixed(1)}% 地形3 ${(r3 * 100).toFixed(1)}% 差 ${((r3 - r0) * 100).toFixed(1)}pt`
      + ` 门槛 +3.0pt ⇒ ${r3 > r0 + 0.03 ? 'PASS' : 'FAIL'}`,
  );
}
