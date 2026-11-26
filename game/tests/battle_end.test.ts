/**
 * 战斗结束 / 胜负判定：原作口径是**主将生死**，不是士兵数（R159 修正）。
 *
 * 原作证据（`work/orig_numbers/`、`docs/`）：
 *  - `0x443CA8(bits)` 是结果位寄存器 `[0x4B4C34]`：1=A 撤退/被俘、2=B 撤退/被俘、
 *    4=A 主将阵亡、8=B 主将阵亡、0x1000=结束触发；
 *  - 主将阵亡：`0x43DB9A` 末尾 `0x443CA8(4/8)`；随后 `0x43EAA0` 的退场倒计时归零
 *    → `0x443CA8(1/2)` + `0x443CA8(0x1000)` ⇒ 立即结束（不等当前回合打完）；
 *  - 撤退：`0x43EA4A` 那支在 `unit+0x8C!=0`（`0x4000` 退却态）时倒计时归零 → `0x443CA8(0x1000)`，
 *    `0x443CA8` 会丢弃 1/2 若已有 4/8（主将阵亡优先）；
 *  - 到点：`0x44411B` 里 `[0x4AC35C]` 递减到 0 → `0x443CA8(0x1000)`，理由码按 4/8/1/2 选，
 *    都没有就 `reason=0x10`（双方主将都还活着 = 平手），**不看剩余兵力**；
 *  - 士兵清零：`army+0x5c<=0` 只清命令可用位（不能前進/突擊/撤退），战斗继续
 *    （`project/177_战斗行动模型.md:48`），全场没有"兵尽即结束"的分支。
 *
 * 复跑：`cd F:\sanguo\game && node --test tests/battle_end.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, requestRetreat, settle, step } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { needSurrenderPanel } from '../src/core/roster.ts';
import type { SurrenderCard } from '../src/core/roster.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function makeWorld(seed = 1, soldiers = 6): World {
  return createWorld({ data, seed, a: { soldiers }, b: { soldiers } });
}

/** 跑 `step` 直到结束或到上限，返回实际 tick 数。 */
function runUntilOver(world: World, maxTicks: number): number {
  let ticks = 0;
  while (!world.over && ticks < maxTicks) {
    step(world);
    ticks++;
  }
  return ticks;
}

/** 面板只用它判"有没有卡"，这里造一张最小卡即可（`needSurrenderPanel` 不读字段）。 */
const CARD = { name: '呂布' } as unknown as SurrenderCard;

test('① 敌将阵亡 → 我方胜、endReason=general（立即结束，不等兵尽）', () => {
  const w = makeWorld(11);
  assert.equal(w.over, false);
  assert.ok(w.sides.B.aliveCount > 0, '开战时敌方还有兵，证明不是"兵尽"结束');

  w.sides.B.general.alive = false;
  step(w);

  assert.equal(w.over, true);
  assert.equal(w.endReason, 'general');
  assert.equal(w.winner, 'A');
  assert.equal(w.status.B, 3, '败方主将阵亡且未撤退 = 3（被俘/败）');
  assert.equal(w.status.A, 0);
  assert.equal(settle(w).won, true);
});

test('② 我方主将阵亡 → 我方败、endReason=general', () => {
  const w = makeWorld(12);
  w.sides.A.general.alive = false;
  step(w);

  assert.equal(w.over, true);
  assert.equal(w.endReason, 'general');
  assert.equal(w.winner, 'B');
  assert.equal(w.status.A, 3);
  assert.equal(w.status.B, 0);
  assert.equal(settle(w).won, false);
});

test('③ 一方小兵清零但主将活着 → 战斗继续（继续 step 也不结束）', () => {
  const w = makeWorld(13);
  for (const u of w.units) if (u.side === 'B' && !u.isGeneral) u.alive = false;
  step(w);

  assert.equal(w.sides.B.aliveCount, 0, 'B 的士兵确实为 0');
  assert.equal(w.over, false, '兵尽不是结束条件');
  assert.equal(w.endReason, null);
  assert.equal(w.winner, null);

  for (let i = 0; i < 5; i++) step(w);
  assert.equal(w.over, false, '再过 5 帧仍然继续');

  // 两边兵都清零、两边主将都活着 → 依然继续
  for (const u of w.units) if (u.side === 'A' && !u.isGeneral) u.alive = false;
  step(w);
  assert.equal(w.sides.A.aliveCount, 0);
  assert.equal(w.over, false, '双方兵尽也不结束（要等主将阵亡/撤退/到点）');

  // 只有主将阵亡才收尾
  w.sides.B.general.alive = false;
  step(w);
  assert.equal(w.over, true);
  assert.equal(w.endReason, 'general');
  assert.equal(w.winner, 'A');
});

test('④ 主将撤退：单侧撤光 → 对方胜、endReason=retreat、败方 status=2', () => {
  const w = makeWorld(14);
  assert.equal(requestRetreat(w, 'B'), true);
  const ticks = runUntilOver(w, 4000);

  assert.ok(ticks > 0 && ticks < 4000, `撤退应在有限帧内结束，实际 ${ticks} tick`);
  assert.equal(w.over, true);
  assert.equal(w.endReason, 'retreat');
  assert.equal(w.winner, 'A');
  assert.equal(w.status.B, 2, '撤退离场 = 2（撤退），不是 3（被俘）');
  assert.equal(w.status.A, 0);
  assert.equal(settle(w).won, true, '敌方撤退 = 我方胜，面板胜者门放行');
});

test('④b 双方同时撤光 → 平手（原作 1&&2 → reason 0x10）', () => {
  const w = makeWorld(15);
  assert.equal(requestRetreat(w, 'A'), true);
  assert.equal(requestRetreat(w, 'B'), true);
  // 两侧同时清空，避免"先撤完的一侧"抢先判负
  w.units = [];
  step(w);

  assert.equal(w.over, true);
  assert.equal(w.endReason, 'retreat');
  assert.equal(w.winner, 'draw');
  assert.deepEqual(w.status, { A: 0, B: 0 });
});

test('⑤ settle().won 与战后俘虏面板的胜者门同源（needSurrenderPanel）', () => {
  // 胜：敌将阵亡
  const win = makeWorld(16);
  win.sides.B.general.alive = false;
  step(win);
  const winSettle = settle(win);
  assert.equal(winSettle.winner, 'A');
  assert.equal(winSettle.won, true);
  assert.equal(needSurrenderPanel([CARD], { won: winSettle.won }), true, '胜者才弹处置面板');

  // 败：我将阵亡
  const lose = makeWorld(17);
  lose.sides.A.general.alive = false;
  step(lose);
  const loseSettle = settle(lose);
  assert.equal(loseSettle.winner, 'B');
  assert.equal(loseSettle.won, false);
  assert.equal(needSurrenderPanel([CARD], { won: loseSettle.won }), false, '败者没有处置权，面板不弹');

  // 撤退胜：敌方撤光，我方未败 → 面板照弹
  const retreat = makeWorld(18);
  requestRetreat(retreat, 'B');
  runUntilOver(retreat, 4000);
  const retSettle = settle(retreat);
  assert.equal(retSettle.won, true);
  assert.equal(needSurrenderPanel([CARD], { won: retSettle.won }), true);
});
