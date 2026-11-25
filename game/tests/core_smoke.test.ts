/**
 * Core 冒烟：**12 地形 × 3 剧本 × 2 种子 = 72 场**，每场最多跑 1200 tick。
 *
 * tick 预算依据（R158）：原作移动是**行动 tick 抽一格**（`0x43B574` 每 40 帧才放行一次，
 * `0x43BF26` 一次只改一格）⇒ 1/40 = 0.025 格/帧。双方 24v24 从列阵到接触实测 535~536 tick
 * （72 场全测）。旧的 1200 tick 预算是按 0.09 格/帧的连续速度算的，在本模型下必然还没接战，
 * 所以按新模型放宽到 1200 tick；断言口径不变（"必须接战、必须命中"）。
 *
 * 目的不是平衡性，而是"任何 core 改动把战斗跑崩，5 秒内发现"：
 *   - `createWorld()` 抛异常 / 单位数为 0 / 主将没生成；
 *   - `step()` 抛异常，或坐标变成 NaN；
 *   - `terrain` / `weather` 跑出合法域（R39 的 0..3）；
 *   - 提前结束时 `endReason` 不是三种合法值之一，或 `over` 与 `endReason` 自相矛盾；
 *   - 1200 tick 内根本没接战（攻击/命中都是 0 → 说明寻敌/移动/结算链路断了）；
 *   - 击杀数与兵力差脱钩（`killsInf+killsCav !== start-aliveCount`）。
 *
 * 时间预算：本机 72 场 ≈ 8 s（soldiers=24 时 units≈50，比 100 兵快 6 倍）。
 * 剧本只影响主将名字（→ generals.json 的 BaseHP/BaseMP），地形只影响 `terrainBonus`。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, step, GRID_H, GRID_W } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { weatherOf } from '../src/core/weather.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 12 条地形（terrains.json 的 `_index` 0..11）。 */
const TERRAIN_COUNT = 12;
const SCENARIO_INDEXES = [0, 1, 2];
const SEEDS = [1, 2];
const MAX_TICKS = 1200;
const SOLDIERS = 24;
/** 每场两侧各 24 兵（units≈50）；100 兵一场 456 ms 会让 72 场超出 20 s 预算。 */
const END_REASONS = new Set(['troops', 'general', 'retreat']);

/** 1200 tick 或提前结束；返回跑了几 tick。 */
function run(world: World, maxTicks: number): number {
  let ticks = 0;
  while (!world.over && ticks < maxTicks) {
    step(world);
    ticks++;
  }
  return ticks;
}

describe('core smoke：12 地形 × 3 剧本 × 2 种子（createWorld + 1200 tick）', () => {
  for (const scenarioIndex of SCENARIO_INDEXES) {
    const scenario = data.scenarios[scenarioIndex]!;
    // 用各剧本的君主当主将：名字在 generals.json 里，BaseHP/BaseMP 走真数据。
    const aName = String(scenario.kings[0]!.NAME);
    const bName = String(scenario.kings[1]!.NAME);
    for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
      for (const seed of SEEDS) {
        // 两个种子各给一个季节，让 12 条地形都产出非晴天气（R39 的雨/雪/雾路径）。
        const month = seed === 1 ? 7 : 1;
        it(`剧本 ${scenarioIndex + 1}（${aName} vs ${bName}）· 地形 ${terrain} · 种子 ${seed}`, () => {
          const world = createWorld({
            data,
            seed,
            terrain,
            month,
            a: { soldiers: SOLDIERS, general: { name: aName, str: 80, int: 60, level: 1 } },
            b: { soldiers: SOLDIERS, general: { name: bName, str: 80, int: 60, level: 1 } },
          });

          // m4：内核改成原作「默认待機」后，必须先下令才会接战（旧内核缺省自动前压）。
          engage(world);

          // ① 建局：有单位、有双方主将、地形/天气在合法域。
          assert.ok(world.units.length > 0, 'createWorld 之后不能没有单位');
          assert.equal(world.units.filter((u) => u.isGeneral).length, 2, '双方主将都要在 units[] 里');
          assert.equal(world.terrain, terrain);
          assert.equal(world.weather, weatherOf(month, terrain), 'weather 必须由 month×terrain 推出来（R39）');
          assert.ok(
            Number.isInteger(world.weather) && world.weather >= 0 && world.weather <= 3,
            `weather 越界：${world.weather}`,
          );

          // ② 跑 1200 tick（或提前结束）：不抛异常、坐标不烂。
          const ticks = run(world, MAX_TICKS);
          assert.ok(ticks > 0, '至少推进 1 tick');
          for (const u of world.units) {
            assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), `单位坐标不是有限数：${u.side} (${u.x},${u.y})`);
            assert.ok(Number.isFinite(u.prevX) && Number.isFinite(u.prevY), `单位上帧坐标不是有限数：${u.side}`);
          }
          // 场地内 + 撤退外沿；冒烟只挡"飞到无穷远"这种崩法，不锁死具体站位。
          for (const u of world.units) {
            assert.ok(u.y >= -1 && u.y <= GRID_H, `y 越界：${u.y}`);
            assert.ok(u.x >= -8 && u.x <= GRID_W + 8, `x 越界：${u.x}`);
          }

          // ③ 结束态必须自洽：over ↔ endReason ∈ 三值；没结束则两个字段都是空。
          if (world.over) {
            assert.ok(
              END_REASONS.has(String(world.endReason)),
              `非法 endReason：${String(world.endReason)}`,
            );
            assert.ok(
              world.winner === 'A' || world.winner === 'B' || world.winner === 'draw',
              `非法 winner：${String(world.winner)}`,
            );
          } else {
            assert.equal(world.endReason, null);
            assert.equal(world.winner, null);
            assert.ok(world.units.length > 0);
          }

          // ④ 1200 tick 内必须接战：寻敌 → 命中 → 伤害这条链路真的跑过。
          const attacks = world.stats.attacksA + world.stats.attacksB;
          const hits = world.stats.hitsA + world.stats.hitsB;
          assert.ok(attacks > 0, '1200 tick 内一次攻击都没有：寻敌/移动链路可能断了');
          assert.ok(hits > 0, '1200 tick 内一次命中的都没有：命中/结算链路可能断了');

          // ⑤ 击杀数与兵力差必须恒等（与 stepcav 的统计口径一致）。
          assert.equal(
            world.stats.killsInf + world.stats.killsCav,
            world.sides.B.start - world.sides.B.aliveCount,
            'A 侧击杀数 ≠ B 侧兵力差',
          );
          assert.equal(
            world.stats.killsInfB + world.stats.killsCavB,
            world.sides.A.start - world.sides.A.aliveCount,
            'B 侧击杀数 ≠ A 侧兵力差',
          );
        });
      }
    }
  }
});
