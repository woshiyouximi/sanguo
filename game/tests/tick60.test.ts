/**
 * R192：引擎节拍的**契约锁**（30 Hz → 60 Hz）。
 *
 * 为什么单开一个文件：这次改动的核心不是某个玩法数字，而是「1 tick = 多少秒」这个
 * **全仓唯一真源**。它一旦漂移，行动间隔、特效时长、HUD 倒计时、援军延时会**同时**
 * 变味，而单看每处的注释很难发现。所以这里把三类东西钉住：
 *
 *  1. 甲类（原作 tick 计数，**字面值不许动**）：40/46/60 —— 它们的含义是"引擎帧"，
 *     60 Hz 下才与原件实测 66–79 Hz 的节奏对齐（`project/190` p5）；
 *  2. 乙类（本作按墙钟设计的时长，**必须能除以 TICK_HZ 得回秒数**）：特效 1 s、
 *     飘字 1.5 s、AI 放技 10 s、回气/援军 2 s；
 *  3. HUD 倒计时口径：11880 tick / 120 = 99、0.5/秒、整场 198 秒。
 *
 * 证据：`project/190_主将与士兵速度裁决.md`、`project/180_战斗HUD对齐.md`、
 * `project/192_引擎节拍60Hz.md`。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_INTERVAL_TICKS,
  ACTION_SLIDE_TICKS,
  AI_SKILL_INTERVAL_TICKS,
  ATTACK_COOLDOWN,
  BATTLE_SECONDS,
  BATTLE_TICK_LIMIT,
  FX_FRAMES_PER_SEC,
  FX_TICK_PER_FRAME,
  FX_TTL_DEFAULT,
  FX_TTL_MAX,
  FX_TTL_MIN,
  GENERAL_SLOW_INTERVAL,
  SKILL_MARK_TTL,
  TICK_HZ,
} from '../src/core/battle.ts';
import { AI_PERIOD } from '../src/core/battle_ai.ts';
import { REGEN_PERIOD_TICKS, REINFORCE_TICKS_PER_STEP } from '../src/core/strategy.ts';
import { ATTACK_TICKS, DEATH_TICKS, HIT_TICKS } from '../src/view/animSelect.ts';
import { clockUnitsLeft } from '../src/view/battleView.ts';

const sec = (ticks: number): number => ticks / TICK_HZ;
const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

// ---------------------------------------------------------------------------
// 一、tick 率本体
// ---------------------------------------------------------------------------

test('TICK_HZ = 60（原作实测 66–79 Hz，取最保守的一档）', () => {
  assert.equal(TICK_HZ, 60);
  // 不是 30：30 Hz 会把 40 tick 的行动闸门拖成 1.333 s/格，比原作慢一倍（project/190 p5）
  assert.notEqual(TICK_HZ, 30);
});

test('BATTLE_TICK_LIMIT = 11880（原作 [0x4AC35C] 初值 0x2E68），整场仍是 198 秒', () => {
  assert.equal(BATTLE_TICK_LIMIT, 11880);
  assert.equal(11880, 0x2e68, '字面值就是原作常数');
  assert.equal(BATTLE_SECONDS, 198);
  assert.equal(sec(BATTLE_TICK_LIMIT), 198);
});

// ---------------------------------------------------------------------------
// 二、甲类：原作 tick 计数一个字都不许改
// ---------------------------------------------------------------------------

test('甲类常量保持原作帧数：行动 40 / 撤退 46 / 滑行 40 / AI 决策 60', () => {
  assert.equal(ACTION_INTERVAL_TICKS, 40, '0x43B5DE mov [ecx+0x34],0x28');
  assert.equal(ATTACK_COOLDOWN, 40, '0x43D24B 复用同一 0x43B574 闸门');
  assert.equal(GENERAL_SLOW_INTERVAL, 46, '0x43B5FD 的 0x2e（撤退态）');
  assert.equal(ACTION_SLIDE_TICKS, 40, '0x43BE42 第 4 参 push 0x28');
  assert.equal(AI_PERIOD, 60, '0x444385 mov [倒计时],0x3C');
});

test('一格用时 = 40/60 ≈ 0.667 秒（原作录像 0.507 主将 / 0.602 弓兵）', () => {
  near(sec(ACTION_INTERVAL_TICKS), 2 / 3);
  const t = sec(ACTION_INTERVAL_TICKS);
  assert.ok(t > 0.5 && t < 0.7, `一格 ${t.toFixed(3)} s 应落在 0.5–0.7 s（旧 30 Hz 是 1.333 s）`);
  // 31 格接近 = 两军布阵间距，一个整 tick 粒度都别省
  near(sec(31 * ACTION_INTERVAL_TICKS), 20.667, 1e-3);
});

// ---------------------------------------------------------------------------
// 三、乙类：本作按「秒」设计的时长必须能除回秒数
// ---------------------------------------------------------------------------

test('特效时长：缺省 1 秒、下限 0.8 秒、上限 4.4 秒', () => {
  assert.equal(FX_TTL_DEFAULT, 60);
  near(sec(FX_TTL_DEFAULT), 1);
  assert.equal(FX_TTL_MIN, 48);
  near(sec(FX_TTL_MIN), 0.8);
  assert.equal(FX_TTL_MAX, 264);
  near(sec(FX_TTL_MAX), 4.4);
  // 每帧 tick × 每秒帧数 = TICK_HZ（帧率是墙钟量，不随 tick 率变）
  near(FX_TICK_PER_FRAME * FX_FRAMES_PER_SEC, TICK_HZ, 1e-9);
  near(FX_TICK_PER_FRAME, 4.411764705882353, 1e-12);
});

test('飘字 1.5 秒 / AI 放技 10 秒', () => {
  assert.equal(SKILL_MARK_TTL, 90);
  near(sec(SKILL_MARK_TTL), 1.5);
  assert.equal(AI_SKILL_INTERVAL_TICKS, 600);
  near(sec(AI_SKILL_INTERVAL_TICKS), 10);
});

test('strategy.ts 的 2 秒周期（不能 import battle.ts，字面值靠这里守着）', () => {
  // strategy.ts ← battle.ts 是单向 import，反向会成环 ⇒ 那边只能写 120 字面值。
  assert.equal(REGEN_PERIOD_TICKS, 120);
  near(sec(REGEN_PERIOD_TICKS), 2);
  assert.equal(REINFORCE_TICKS_PER_STEP, 120);
  near(sec(REINFORCE_TICKS_PER_STEP), 2);
});

test('视图 overlay 窗口按墙钟保持：攻击 0.33 s / 受击 0.27 s / 死亡 0.4 s', () => {
  assert.equal(ATTACK_TICKS, 20);
  near(sec(ATTACK_TICKS), 1 / 3, 0.01);
  assert.equal(HIT_TICKS, 16);
  near(sec(HIT_TICKS), 0.2667, 1e-3);
  assert.equal(DEATH_TICKS, 24);
  near(sec(DEATH_TICKS), 0.4, 1e-9);
});

// ---------------------------------------------------------------------------
// 四、HUD 倒计时：ceil((LIMIT − tick)/120)，0.5/秒，198 秒见底
// ---------------------------------------------------------------------------

test('倒计时口径：起始 99、每 2 秒掉 1、11880 tick 见底', () => {
  assert.equal(clockUnitsLeft(0), 99);
  assert.equal(clockUnitsLeft(TICK_HZ * 2 - 1), 99, '不到 2 秒不掉');
  assert.equal(clockUnitsLeft(TICK_HZ * 2), 98, '第 2 秒掉 1');
  assert.equal(clockUnitsLeft(TICK_HZ * 4), 97);
  assert.equal(clockUnitsLeft(TICK_HZ * 100), 49, '100 秒 = 掉 50 点');
  assert.equal(clockUnitsLeft(BATTLE_TICK_LIMIT), 0);
  assert.equal(clockUnitsLeft(BATTLE_TICK_LIMIT * 2), 0, '见底夹 0');
});

test('倒计时速率 = 0.5 单位/秒（197 秒掉完 98.5 点，整场 198 秒）', () => {
  const perSec = -(clockUnitsLeft(TICK_HZ) - clockUnitsLeft(0)) / 1; // 1 秒内掉多少
  assert.ok(Math.abs(perSec) < 1e-9, '第 1 秒内还没掉（2 秒 1 点）');
  const over2s = (clockUnitsLeft(0) - clockUnitsLeft(TICK_HZ * 2)) / 2;
  near(over2s, 0.5, 1e-9);
  // 99 点 × 2 秒 = 198 秒 = 整场
  near(99 * 2, BATTLE_SECONDS, 1e-9);
});
