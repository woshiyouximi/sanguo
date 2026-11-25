/**
 * 测试夹具：把一场仗「打起来」。
 *
 * m4 之后生产内核改成原作的**默认待機**（`0x43AEB2` 清 8 个命令槽；`0x43CF07[0]` 权重全 0），
 * 所以 `createWorld()` 出来之后双方站着不动，直到有人下令。旧测试全都依赖「缺省自动前压」，
 * 于是在跑接触/命中/胜负之前先在这里显式下两条命令：
 *
 *   - `advance`（`0x44497F` = `0x43ADED(army,0,1)`）只写槽 0 ⇒ 主将有 1 号命令（前進）；
 *   - `rush`（`0x4448B2` = `0x43ADED(army,0x101,7)`）只写槽 1..7 ⇒ 士兵 7 号命令（突擊）。
 *
 * 两条合用正好等于原作 AI 的 case 2（先前進再突擊），全体 1 格 / 40 tick 地压上去 —— 与旧内核
 * `defaultStepPlan` 的节奏同量级，但走的是真正的指令层（`army_cmd.armyStepPlan`）。
 *
 * 这是**测试专用**文件：生产代码不该有「自动开打」的开关，所以不放进 `src/`。
 */
import type { World } from '../src/core/battle.ts';
import { installArmyOrders } from '../src/core/army_cmd.ts';

/** 给双方装指令层并下令「全軍前進 + 全軍突擊」。返回同一个 world，便于链式书写。 */
export function engage(world: World): World {
  installArmyOrders(world);
  for (const side of ['A', 'B'] as const) {
    world.aiCommand?.(world, side, 'advance');
    world.aiCommand?.(world, side, 'rush');
  }
  return world;
}

/** 只给一侧下令（另一侧保持待機 / 或由调用方自己安排）。 */
export function engageSide(world: World, side: 'A' | 'B'): World {
  installArmyOrders(world);
  world.aiCommand?.(world, side, 'advance');
  world.aiCommand?.(world, side, 'rush');
  return world;
}
