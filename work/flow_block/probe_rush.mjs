/**
 * block 探针 3：全軍突擊 + 不豁免（R190 v2）会不会把战线堵成死局。
 *
 * 背景：R190 v1 用 `kind==='rush'` / `world.rush[side]` 豁免换绿了 R80(60v60) 与 R39(天气)，
 * 但 lead 判定「用户抱怨的就是全军突击时穿过去」⇒ 豁免已删。本探针量四件事：
 *   1. 战斗总 tick（打到一方全灭 / 时间上限）
 *   2. `最长连续不动 tick`（单单位）+ `不动 >600 tick 的单位数`
 *   3. 死局：2000 tick 窗口内 `attacks` 总数不再增长，但双方仍有存活单位
 *   4. 若死局：被堵单位周边是什么（前方空格但侧翼有敌？目标格全被占？）
 *
 * 走的是真实指令层：`engage()` = `installArmyOrders` + `aiCommand('advance')` + `aiCommand('rush')`
 * ⇒ 槽 0 = 前進、槽 1..7 = 突擊、`world.rush[side] = true`（和 APK 里按「全軍突擊」同一条路径）。
 *
 * 跑法：node work/flow_block/probe_rush.mjs
 */
import { GRID_W, createWorld, step, unitCell } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

const CELL = (c) => `${c.gx},${c.gy}`;

function run(label, soldiers, maxTicks, seed = 7) {
  const w = engage(
    createWorld({
      data,
      seed,
      a: { soldiers, troop: 2, formation: 0, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
      b: { soldiers, troop: 10, formation: 3, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
      aiSides: { B: true },
    }),
  );
  const seen = new Map(); // unit -> { key, streak, max }
  for (const u of w.units) seen.set(u, { key: -1, streak: 0, max: 0 });
  const attackSamples = []; // [tick, attacks]
  let t = 0;
  for (; t < maxTicks && !w.over; t++) {
    step(w);
    for (const u of w.units) {
      const s = seen.get(u);
      if (!u.alive) {
        s.key = -1;
        s.streak = 0;
        continue;
      }
      const c = unitCell(u);
      const k = c.gy * GRID_W + c.gx;
      if (k === s.key) s.streak++;
      else {
        s.key = k;
        s.streak = 0;
      }
      if (s.streak > s.max) s.max = s.streak;
    }
    if (t % 200 === 0) attackSamples.push([w.tick, w.stats.attacksA + w.stats.attacksB]);
  }
  attackSamples.push([w.tick, w.stats.attacksA + w.stats.attacksB]);

  // 最长不动 + >600 计数（只看还活着、且至少活到结尾的单位）
  let globalMax = 0;
  let over600 = 0;
  let stuck = null;
  for (const u of w.units) {
    const s = seen.get(u);
    if (!u.alive) continue;
    if (s.max > globalMax) {
      globalMax = s.max;
      stuck = u;
    }
    if (s.max > 600) over600++;
  }

  // 死局窗口：最后一次 attacks 增长之后又过了多少 tick
  let lastGrowTick = 0;
  let prev = 0;
  for (const [tk, at] of attackSamples) {
    if (at > prev) lastGrowTick = tk;
    prev = at;
  }
  const flat = w.tick - lastGrowTick;
  const deadlock = !w.over && flat >= 2000;

  const aliveA = w.units.filter((u) => u.side === 'A' && u.alive).length;
  const aliveB = w.units.filter((u) => u.side === 'B' && u.alive).length;

  console.log(`\n=== ${label}（${soldiers}v${soldiers}, seed ${seed}）`);
  console.log(`  1. 总 tick = ${w.tick}  over=${w.over}  存活 A=${aliveA} B=${aliveB}  出手 A=${w.stats.attacksA} B=${w.stats.attacksB}`);
  console.log(`  2. 最长连续不动 tick（单单位）= ${globalMax}；不动 >600 tick 的存活单位 = ${over600}`);
  console.log(`  3. 最后增长 tick=${lastGrowTick}，其后 ${flat} tick 出手数不变 ⇒ 死局=${deadlock ? 'YES' : 'no'}`);
  if (stuck && globalMax > 200) {
    const c = unitCell(stuck);
    const at = (gx, gy) => {
      const o = w.units.find((v) => v.alive && v !== stuck && unitCell(v).gx === gx && unitCell(v).gy === gy);
      return o ? `${o.side}${o.isGeneral ? '將' : '兵'}` : '·';
    };
    const front = stuck.side === 'A' ? -1 : 1;
    console.log(
      `  4. 最久不动的 ${stuck.side}${stuck.isGeneral ? '將' : '兵'} 在 (${CELL(c)})，` +
        `前格(${c.gx + front},${c.gy})=${at(c.gx + front, c.gy)} ` +
        `上(${c.gx},${c.gy - 1})=${at(c.gx, c.gy - 1)} 下(${c.gx},${c.gy + 1})=${at(c.gx, c.gy + 1)} ` +
        `斜前=${at(c.gx + front, c.gy - 1)}/${at(c.gx + front, c.gy + 1)}`,
    );
    if (deadlock) {
      // 死局时统计「前方空格但侧翼有敌」的比例（这正是 lead 猜的堵法）
      let frontFreeFlankFoe = 0;
      let allOccupied = 0;
      let n = 0;
      for (const u of w.units) {
        if (!u.alive) continue;
        const s = seen.get(u);
        if (s.max <= 200) continue;
        n++;
        const c2 = unitCell(u);
        const f = u.side === 'A' ? -1 : 1;
        const occ = (gx, gy) => w.units.some((v) => v.alive && v !== u && unitCell(v).gx === gx && unitCell(v).gy === gy);
        const foe = (gx, gy) =>
          w.units.some((v) => v.alive && v.side !== u.side && unitCell(v).gx === gx && unitCell(v).gy === gy);
        if (!occ(c2.gx + f, c2.gy) && (foe(c2.gx + f, c2.gy - 1) || foe(c2.gx + f, c2.gy + 1))) frontFreeFlankFoe++;
        else if (occ(c2.gx + f, c2.gy)) allOccupied++;
      }
      console.log(`     死局中「前格空但侧翼有敌」=${frontFreeFlankFoe} /「前格被占」=${allOccupied} / 停滞单位 ${n}`);
    }
  }
  return { tick: w.tick, globalMax, over600, deadlock, flat, aliveA, aliveB };
}

run('60v60 全軍突擊', 60, 6000);
run('100v100 全軍突擊', 100, 6000);
