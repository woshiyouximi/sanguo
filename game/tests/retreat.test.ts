/**
 * R38 撤退（`0x4447B7`：全军转 `cmd 8` + `0x4000` 退却状态）专项。
 *
 * 源码里 `maybeRetreat` / `checkOver` 都是**私有函数**，不能直接 import，
 * 所以这里一律从公开面驱动：`requestRetreat()` 下命令，`step()` 推帧观察逃逸/离场/判定，
 * `world.fled` / `world.status` / `world.endReason` / `world.units` / `world.stats` 取证。
 *
 * **R158 迁移：从「连续速度」改成「行动 tick 抽格」。** 原作撤退（`project/155` §2.2 第 8 行）：
 *   - `0x43CC95`（小队）/ `0x43C7E3`（主将）：`sx = A?+1:-1, sy = 0`，**与敌人位置无关**；
 *   - 权重 `0x48E8E0`（小队 80/10/10）/ `0x48E658`（主将 100/0）；
 *   - 同一个 handler 里 `0x43B51E(u,0x4000)` 置撤退态，于是 `0x43B574` 把行动间隔从 40 改成 46；
 *   - 走位器 phase2（`0x43C4C0`）发现「撤退态 + 目标列已越界」才 `0x43BFE7` 退场并置 `0x8000`。
 * 所以旧的「每 tick 位移恒为 MOVE_PER_TICK*RETREAT_SPEED」断言全部作废：现在**每 46 帧才走一格**，
 * 中间 45 帧逻辑格不动（`u.x/u.y` 只是 40 帧插值，见 `ACTION_SLIDE_TICKS`）。
 *
 * 覆盖的坑（每条都对应一个真实现过的分叉）：
 *   - 下令撤退后该侧全体 `flee=true`、`status|=0x4000`，行动间隔变 46；
 *   - 撤退者**不算阵亡**：`killsInf/killsCav` 与兵力差都不因撤退增长；
 *   - 走出格子（`0x43AF54` 之外）才退场，边界前一格留着；
 *   - 全离场判负：`endReason==='retreat'`、`winner` 是对面、败方 `status===2`（R38 的 status 语义）；
 *   - `requestRetreat` 幂等（重复/结束后都是 false）；
 *   - `maybeRetreat` 必须**同时**满足 `aiRetreat:true` 且 `aiSides[side]:true`，并在兵力比 ≤0.3、
 *     敌方 ≥2× 的边界上精确触发（30/31、40/39）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  actionIntervalOf,
  chooseStepCell,
  createWorld,
  planDirected,
  step,
  requestRetreat,
  unitCell,
  ACTION_INTERVAL_TICKS,
  GENERAL_SLOW_INTERVAL,
  GRID_W,
  GRID_H,
  STEP_W_STRAIGHT,
  AI_RETREAT_TROOP_RATIO,
  AI_RETREAT_ADVANTAGE,
} from '../src/core/battle.ts';
import type { CreateOptions, Unit, World, Side } from '../src/core/battle.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function makeWorld(over: Partial<CreateOptions> = {}, soldiers = 6): World {
  return createWorld({ data, seed: 1, a: { soldiers }, b: { soldiers }, ...over });
}

/** 跑 `step` 直到 `over` 或达到上限；返回实际跑了多少 tick。 */
function runUntilOver(world: World, maxTicks: number): number {
  let ticks = 0;
  while (!world.over && ticks < maxTicks) {
    step(world);
    ticks++;
  }
  return ticks;
}

/** 把单位摆到某个逻辑格、清掉插值、行动计时归零（下一个 tick 就是它的行动 tick）。 */
function place(u: Unit, gx: number, gy: number): void {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = undefined;
  u.cd = 0;
}

/** 手动打死某侧 n 个兵（不走战斗，用于精确摆兵力比）。返回实际打死的个数。 */
function killSoldiers(world: World, side: Side, n: number): number {
  let left = n;
  for (const u of world.units) {
    if (left <= 0) break;
    if (u.side === side && !u.isGeneral && u.alive) {
      u.alive = false;
      left--;
    }
  }
  assert.equal(left, 0, `要杀 ${n} 个 ${side} 兵，但只找到 ${n - left} 个`);
  return n;
}

describe('R38 requestRetreat：下令即全体转退却', () => {
  it('下令后该侧存活单位全部 flee，status=2，fled=true，对面不受影响', () => {
    const w = makeWorld();
    assert.equal(w.fled.B, false);
    assert.equal(w.status.B, 0);
    assert.equal(actionIntervalOf(w.units.find((u) => u.side === 'B' && !u.isGeneral)!), ACTION_INTERVAL_TICKS);

    assert.equal(requestRetreat(w, 'B'), true);

    for (const u of w.units) {
      if (u.side === 'B') {
        assert.equal(u.flee, true, 'B 侧单位应全部进入退却');
        // `0x43B51E(u,0x4000)`：撤退态是单位字段，`0x43B574` 据此把间隔改成 46 帧。
        assert.equal((u.status ?? 0) & 0x4000, 0x4000, '撤退态应写进 u.status（0x4000）');
        assert.equal(actionIntervalOf(u), GENERAL_SLOW_INTERVAL, '撤退态行动间隔 = 46 帧（0x43B574）');
      } else {
        assert.ok(!u.flee, 'A 侧不应被牵连');
        assert.equal((u.status ?? 0) & 0x4000, 0);
      }
    }
    assert.equal(w.fled.B, true);
    assert.equal(w.fled.A, false);
    assert.equal(w.status.B, 2, '败退侧 status 应为 2（R38 的 0x4000 退却状态）');
    assert.equal(w.status.A, 0);
    assert.equal(w.over, false, '刚下令不应立刻结束，要等走出场地');
  });

  it('重复下令返回 false（幂等），对面仍可下令', () => {
    const w = makeWorld();
    assert.equal(requestRetreat(w, 'B'), true);
    assert.equal(requestRetreat(w, 'B'), false, '同一侧重复下令必须返回 false');
    assert.equal(requestRetreat(w, 'A'), true, '两侧都可以撤退（各走各的）');
    assert.equal(w.fled.A, true);
    assert.equal(w.fled.B, true);
    assert.equal(w.status.A, 2);
    assert.equal(w.status.B, 2);
  });

  it('exit code 等价物：结束后再下令返回 false', () => {
    const w = makeWorld({}, 3);
    assert.equal(requestRetreat(w, 'B'), true);
    assert.ok(runUntilOver(w, 4000) < 4000);
    assert.equal(w.over, true);
    assert.equal(requestRetreat(w, 'B'), false);
    assert.equal(requestRetreat(w, 'A'), false);
  });
});

describe('R38 撤退离场：走出格子才算走，且不计阵亡', () => {
  it('B 侧全军撤离 → A 胜、endReason=retreat、B 全部移出 units[]、双方击杀均为 0', () => {
    const w = makeWorld();
    assert.equal(requestRetreat(w, 'B'), true);
    const ticks = runUntilOver(w, 4000);

    assert.ok(ticks > 0 && ticks < 4000, `撤退应在有限帧内结束，实际 ${ticks} tick`);
    assert.equal(w.over, true);
    assert.equal(w.endReason, 'retreat');
    assert.equal(w.winner, 'A');
    assert.equal(w.fled.B, true);
    assert.equal(w.status.B, 2);
    assert.equal(w.status.A, 0);

    assert.equal(w.units.filter((u) => u.side === 'B').length, 0, 'B 侧单位（含主将）应全部离场被摘掉');
    assert.ok(w.units.every((u) => u.side === 'A'));

    assert.equal(w.stats.killsInf, 0);
    assert.equal(w.stats.killsCav, 0);
    assert.equal(w.stats.killsInfB, 0);
    assert.equal(w.stats.killsCavB, 0);
    assert.equal(w.sides.B.aliveCount, 0);

    // 结束后 step 是纯 no-op（源码第一步 `if (world.over) return`）。
    const tick = w.tick;
    const units = w.units.length;
    step(w);
    assert.equal(w.tick, tick);
    assert.equal(w.units.length, units);
  });

  it('A 侧全军撤离 → B 胜、endReason=retreat、A 的 status=2（镜像对称）', () => {
    const w = makeWorld({ seed: 2 });
    assert.equal(requestRetreat(w, 'A'), true);
    const ticks = runUntilOver(w, 4000);

    assert.ok(ticks > 0 && ticks < 4000);
    assert.equal(w.endReason, 'retreat');
    assert.equal(w.winner, 'B');
    assert.equal(w.fled.A, true);
    assert.equal(w.status.A, 2);
    assert.equal(w.status.B, 0);
    assert.equal(w.units.filter((u) => u.side === 'A').length, 0);
    assert.equal(w.stats.killsInf + w.stats.killsCav, 0);
    assert.equal(w.stats.killsInfB + w.stats.killsCavB, 0);
  });

  it('离场边界（A 侧 +x）：走到第 70 列留着，再走一格（越出 0x47）才退场', () => {
    // `0x43AF54`：`0<=x<0x47 && 0<=y<0xE` 才算界内；`0x43C4C0` phase2 只在
    // 「撤退态 0x4000 且 tx 越界」时走 `0x43BFE7` 退场，所以 70 → 71 是唯一的分界。
    // 这里用主将的撤退计划（`0x48E658` = 100/0 直线），排除 10% 斜格抖动带来的不确定性。
    const w = makeWorld({ seed: 3 }, 4);
    assert.equal(requestRetreat(w, 'A'), true);
    const soldier = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
    const straight = planDirected(1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'retreat');
    place(soldier, GRID_W - 1, 6); // 70 → 71：越界
    assert.deepEqual(chooseStepCell(w, soldier, straight, new Map<number, Unit>()), { exit: true }, '第 70 列再往前一格必须退场');

    place(soldier, GRID_W - 2, 6); // 69 → 70：界内
    const inside = chooseStepCell(w, soldier, straight, new Map<number, Unit>());
    assert.deepEqual(inside, { gx: GRID_W - 1, gy: 6 }, '第 69 列应该走到第 70 列，不许提前退场');
  });

  it('离场边界（B 侧 −x）：走到第 0 列留着，再走一格（越出 0）才退场', () => {
    const w = makeWorld({ seed: 4 }, 4);
    assert.equal(requestRetreat(w, 'B'), true);
    const soldier = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    const straight = planDirected(-1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'retreat');
    place(soldier, 0, 6); // 0 → −1：越界
    assert.deepEqual(chooseStepCell(w, soldier, straight, new Map<number, Unit>()), { exit: true }, '第 0 列再往前一格必须退场');

    place(soldier, 1, 6); // 1 → 0：界内
    assert.deepEqual(chooseStepCell(w, soldier, straight, new Map<number, Unit>()), { gx: 0, gy: 6 }, '第 1 列应该走到第 0 列');
  });
});

describe('R38 撤退移动：不再寻敌，方向朝本方边界', () => {
  it('B 侧一个行动 tick 走一格 −x，行动间隔重置为 46，且本 tick 不发起攻击', () => {
    const w = makeWorld({ seed: 5 });
    assert.equal(requestRetreat(w, 'B'), true);
    const alive = w.units.filter((u) => u.side === 'B' && u.alive);
    assert.ok(alive.length > 0);
    for (const u of alive) place(u, unitCell(u).gx, unitCell(u).gy);

    const from = new Map(alive.map((u) => [u, unitCell(u)]));
    step(w);

    for (const u of alive) {
      if (!w.units.includes(u)) continue;
      const a = from.get(u)!;
      const b = unitCell(u);
      // `0x43CC95`：B 侧后方是 −x，所以撤退 dx = −1（A 侧才是 +1）；
      // `0x48E8E0` 允许 10% 各一次 ±45°，那只会动 y。
      assert.equal(b.gx - a.gx, -1, `B 侧撤退应 −x 一格，实际 ${b.gx - a.gx} 格`);
      assert.ok(Math.abs(b.gy - a.gy) <= 1, '撤退的 y 只可能是 ±45° 抖动，不会更多');
      // `0x43B574`：行动 tick 到点后立刻把 `u+0x34` 重置成 46（撤退态），下一帧开始递减。
      assert.equal(u.cd, GENERAL_SLOW_INTERVAL, '撤退态行动间隔应重置为 46 帧');
    }
    assert.equal(w.stats.attacksB, 0, '撤退侧本 tick 不应再发起攻击');
    assert.equal(w.fled.B, true);
    assert.equal(w.status.B, 2);
  });

  it('撤退单位不会跑出竖屏：y 恒在 [0, GRID_H) 内', () => {
    const w = makeWorld({ seed: 6 });
    assert.equal(requestRetreat(w, 'B'), true);
    for (let i = 0; i < 300 && !w.over; i++) {
      step(w);
      for (const u of w.units) {
        if (!u.flee) continue;
        const c = unitCell(u);
        assert.ok(c.gy >= 0 && c.gy < GRID_H, `撤退单位 y 越界：${c.gy}`);
        assert.ok(c.gx >= 0 && c.gx < GRID_W, `还在场上的撤退单位 x 应在界内：${c.gx}`);
      }
    }
  });
});

describe('R38 maybeRetreat：AI 兵力劣势自动撤退', () => {
  it('常量口径：兵力比 0.3、敌方 2 倍', () => {
    assert.equal(AI_RETREAT_TROOP_RATIO, 0.3);
    assert.equal(AI_RETREAT_ADVANTAGE, 2);
  });

  it('兵力比 ≤ 0.3 且敌方 ≥ 2× → 自动下令撤退', () => {
    const w = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    killSoldiers(w, 'B', 80); // B 20 / 100 = 0.2
    step(w);
    assert.equal(w.fled.B, true);
    assert.equal(w.status.B, 2);
    for (const u of w.units) if (u.side === 'B' && u.alive) assert.equal(u.flee, true);
    assert.equal(w.stats.attacksA + w.stats.attacksB, 0, '第 1 tick 双方还没接触，不应有攻击干扰判断');
  });

  it('兵力比边界：恰好 30% 触发，31% 不触发', () => {
    const at = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    killSoldiers(at, 'B', 70); // 30/100 = 0.3
    step(at);
    assert.equal(at.fled.B, true, '恰好 0.3 应触发（源码用的是 > 才跳过）');

    const above = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    killSoldiers(above, 'B', 69); // 31/100 = 0.31
    step(above);
    assert.equal(above.fled.B, false, '0.31 不应触发');
    assert.equal(above.status.B, 0);
  });

  it('敌方优势边界：敌方恰好 2× 触发，差 1 个不触发', () => {
    const at = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    killSoldiers(at, 'B', 80); // 20
    killSoldiers(at, 'A', 60); // 40 = 2×
    step(at);
    assert.equal(at.fled.B, true, '敌方恰好 2× 应触发（源码用 < 才跳过）');

    const below = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    killSoldiers(below, 'B', 80); // 20
    killSoldiers(below, 'A', 61); // 39 < 2×
    step(below);
    assert.equal(below.fled.B, false, '敌方 1.95× 不应触发');
  });

  it('aiRetreat:false 时不触发（开关优先）', () => {
    const w = makeWorld({ seed: 11, aiRetreat: false, aiSides: { B: true } }, 100);
    killSoldiers(w, 'B', 80);
    step(w);
    assert.equal(w.fled.B, false);
    assert.equal(w.status.B, 0);
  });

  it('aiRetreat:true 但该侧不在 aiSides 时不触发（源码要求两个开关同时开，任务书漏了 aiSides）', () => {
    const w = makeWorld({ seed: 11, aiRetreat: true }, 100);
    killSoldiers(w, 'B', 80);
    step(w);
    assert.equal(w.fled.B, false, '只有全局 aiRetreat 不够，还要 aiSides[B]=true');

    const w2 = makeWorld({ seed: 11, aiRetreat: true, aiSides: { A: true } }, 100);
    killSoldiers(w2, 'B', 80);
    step(w2);
    assert.equal(w2.fled.B, false, '只给 A 侧开 AI，B 侧不应自动撤退');
  });

  it('主将已阵亡的侧不会"撤退"，而是直接按 general 判负', () => {
    const w = makeWorld({ seed: 11, aiRetreat: true, aiSides: { B: true } }, 100);
    for (const u of w.units) if (u.side === 'B' && !u.isGeneral) u.alive = false;
    w.sides.B.general.alive = false;
    step(w);
    assert.equal(w.fled.B, false, '主将已死时 maybeRetreat 直接 continue');
    assert.equal(w.over, true);
    assert.equal(w.endReason, 'general');
    assert.equal(w.winner, 'A');
    assert.equal(w.status.A, 0);
  });

  // R159（`project/160_撤退态0x4000.md`）：原作有两处代码写 0x4000 ——
  // 命令入口 `0x4447E2`（军团）+ `0x444858`（逐小队 stride 0x48），以及每步执行 cmd 8 时
  // 幂等重打标的 `0x43C827` / `0x43CCD9`。清除点不存在（ClearState 只有 0x1000/0x100 两个
  // caller），所以一场战斗内单向不可逆。
  it('退却态会被逐单位打上 0x4000（含 AI 直接置 flee 的路径，不依赖 requestRetreat）', () => {
    const w = makeWorld({ seed: 7 }, 6);
    const b = w.units.filter((u) => u.side === 'B');
    for (const u of b) {
      u.flee = true; // 模拟 maybeRetreat 直接把 flee 置真
      u.cd = 0;      // 行动闸门到期，本 tick 就会走到「每步执行 cmd 8」那段
    }
    assert.equal(b.every((u) => ((u.status ?? 0) & 0x4000) === 0), true, '置位前不该有 0x4000');
    step(w);
    assert.equal(
      b.every((u) => ((u.status ?? 0) & 0x4000) !== 0),
      true,
      '每步执行 cmd 8 时应重打 0x4000（0x43CCD9）',
    );
    assert.equal(b.every((u) => actionIntervalOf(u) === GENERAL_SLOW_INTERVAL), true, '退却态间隔 = 46');
  });

  it('0x4000 在整场战斗里只置不清（把 fled 清掉也去不掉退却态）', () => {
    const w = makeWorld({ seed: 9 }, 30);
    assert.equal(requestRetreat(w, 'B'), true);
    const b = w.units.filter((u) => u.side === 'B');
    assert.equal(b.every((u) => ((u.status ?? 0) & 0x4000) !== 0), true, '撤退令下达即打标');
    b.forEach((u) => {
      u.flee = false; // 假装"取消撤退"：原作没有这条路，只能靠 status 位残留证明
    });
    step(w);
    assert.equal(
      b.every((u) => ((u.status ?? 0) & 0x4000) !== 0),
      true,
      '0x4000 不会被清（原作 ClearState 只有 0x1000/0x100 两个 caller）',
    );
    assert.equal(b.every((u) => actionIntervalOf(u) === GENERAL_SLOW_INTERVAL), true, '仍是 46 帧档');
  });
});

/**
 * R91 正证：撤退单位**不还手**，机制不在攻击链而在选目标（`0x43BCA7` 的 `and eax,0x4000` 分支）。
 *
 * 撤退态把搜敌降级成「只朝朝向那一侧、只 1 格」（`n=1` @0x43BCE1，`dir` 取朝向 @0x43BCEE），
 * 于是**背后的敌人永远选不到**；攻击/伤害链（`0x43D686`/`0x43D400`）本身没有任何状态门。
 * 本作没 facing 字段，用 `retreatSx(u)`（A=+1、B=−1）代替朝向。
 */
describe('R91 撤退不还手：搜敌被降级为「朝向侧 1 格」', () => {
  /** 摆一个干净的两人局：B 侧一个兵在 (30,6) 撤退态，A 侧一个兵摆在指定格。 */
  function duel(ax: number, ay: number): { w: World; b: Unit; a: Unit } {
    const w = makeWorld({ seed: 5 }, 2);
    assert.equal(requestRetreat(w, 'B'), true);
    const b = w.units.find((u) => u.side === 'B' && u.alive && !u.isGeneral);
    const a = w.units.find((u) => u.side === 'A' && u.alive && !u.isGeneral);
    assert.ok(b && a, '需要有双方小兵各一名');
    // 其余单位挪远，避免干扰
    for (const u of w.units) {
      if (u === b || u === a) continue;
      if (u.alive) place(u, unitCell(u).gx, unitCell(u).gy);
    }
    place(b, 30, 6);
    place(a, ax, ay);
    a.cd = 99; // A 侧本 tick 不行动，避免它先手改变局面
    b.cd = 0;
    return { w, b, a };
  }

  it('背后（B 的撤退方向是 −x，背后是 +x）贴身的敌人打不到 → 本 tick 0 次攻击、改为走一格', () => {
    const { w, b } = duel(31, 6);
    const attacks = w.stats.attacksB;
    step(w);
    assert.equal(w.stats.attacksB, attacks, '撤退者背后的敌人不该被选中（0x43BCE1 n=1）');
    assert.equal(unitCell(b).gx, 29, '没找到敌人就执行 cmd 8：B 侧 −x 一格');
  });

  it('正前方（−x）一格有敌人 → 仍然打得着（防一刀切）', () => {
    const { w, b } = duel(29, 6);
    const attacks = w.stats.attacksB;
    step(w);
    assert.equal(w.stats.attacksB, attacks + 1, '朝向侧一格内的敌人应被选中（0x43BCEE dir=朝向）');
    assert.equal(unitCell(b).gx, 30, '有敌人时打人而不是挪窝');
  });

  it('正前方但距离 2 格（远于「只 1 格」）→ 选不到，仍然走一格', () => {
    const { w } = duel(28, 6);
    const attacks = w.stats.attacksB;
    step(w);
    assert.equal(w.stats.attacksB, attacks, '撤退态的搜索半径恒为 1 格，与兵种射程无关');
  });
});
