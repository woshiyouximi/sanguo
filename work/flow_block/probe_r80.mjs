/**
 * block 诊断：R80（tests/smartscript_audio.test.ts:425）60v60 打不完的原因。
 * 复刻 freshWorld(11,60)：seed 11、双方 troop 0（枪兵）、formation 0（方形）、soldiers 60、engage。
 * 用法：node work/flow_block/probe_r80.mjs [--off]
 */
import { GRID_W, createWorld, step, unitCell } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const OFF = process.argv.includes('--off');

const w = engage(
  createWorld({
    data,
    seed: 11,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 60, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 60, general: { name: 'B', str: 60, int: 70 } },
  }),
);
w.blockPass = !OFF;

const lastCell = new Map();
const streak = new Map();
for (const u of w.units) {
  lastCell.set(u, -1);
  streak.set(u, 0);
}

let t = 0;
for (; t < 2600 && !w.over; t++) {
  step(w);
  for (const u of w.units) {
    if (!u.alive) continue;
    const c = unitCell(u);
    const k = c.gy * GRID_W + c.gx;
    if (k === lastCell.get(u)) streak.set(u, streak.get(u) + 1);
    else {
      lastCell.set(u, k);
      streak.set(u, 0);
    }
  }
  if (t % 200 === 0) {
    const a = w.units.filter((u) => u.side === 'A' && u.alive).length;
    const b = w.units.filter((u) => u.side === 'B' && u.alive).length;
    const frozen = w.units.filter((u) => u.alive && streak.get(u) > 120).length;
    console.log(
      `t=${w.tick} alive A=${a} B=${b} atk=${w.stats.attacksA + w.stats.attacksB} hit=${w.stats.hitsA + w.stats.hitsB} 冻结=${frozen}`,
    );
  }
}

console.log(`\nmode=${OFF ? 'OFF' : 'ON'} tick=${w.tick} over=${w.over}`);
const cellAt = (gx, gy) =>
  w.units.find((v) => v.alive && unitCell(v).gx === gx && unitCell(v).gy === gy);
const label = (o) => (o ? `${o.side}${o.isGeneral ? '將' : '兵'}` : '·');
const free = (gx, gy) => !cellAt(gx, gy);
console.log('--- 终局全部存活单位（含「横移到敌人车道」可行性）');
for (const u of w.units) {
  if (!u.alive) continue;
  const c = unitCell(u);
  const f = u.side === 'A' ? -1 : 1;
  // 敌人车道：上下各一格；横移落点 = (本格 x + 1 或 x - 1, 敌人那条车道)
  const en = (gx, gy) => {
    const o = cellAt(gx, gy);
    return o && o.side !== u.side;
  };
  const inLaneUp = en(c.gx, c.gy - 1) || en(c.gx + f, c.gy - 1);
  const inLaneDn = en(c.gx, c.gy + 1) || en(c.gx + f, c.gy + 1);
  const pullUp = inLaneUp && (free(c.gx, c.gy - 1) || free(c.gx + f, c.gy - 1));
  const pullDn = inLaneDn && (free(c.gx, c.gy + 1) || free(c.gx + f, c.gy + 1));
  console.log(
    `${label(u)} (${c.gx},${c.gy}) 停${streak.get(u)} ` +
      `前(${c.gx + f},${c.gy})=${label(cellAt(c.gx + f, c.gy))} ` +
      `上(${c.gx},${c.gy - 1})=${label(cellAt(c.gx, c.gy - 1))} 下(${c.gx},${c.gy + 1})=${label(cellAt(c.gx, c.gy + 1))} ` +
      `| 侧翼有敌 上=${inLaneUp ? 'Y' : 'n'} 下=${inLaneDn ? 'Y' : 'n'} | 可横移贴敌车道 上=${pullUp ? 'Y' : 'n'} 下=${pullDn ? 'Y' : 'n'}`,
  );
}
console.log('存活冻结(>120tick)单位总数 =', w.units.filter((u) => u.alive && streak.get(u) > 120).length);
