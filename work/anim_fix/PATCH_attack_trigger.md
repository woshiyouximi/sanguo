# PATCH · 攻击窗口改成「真出手才挥砍」（P0 3.1.1）

状态：**core 不需要改（改 0 行）**；view 侧**已经改完并全绿**，这份文档是给 lead 复核/放行用的说明 + 回滚口径。
作者：anim（R194）

---

## 1. 先纠正原计划：core 那 3 行**早就存在**

lead 的指示是「core 在真正出手那一 tick 写 `u.lastAttackTick = world.tick`（约 3 行）」。
实测：**这行已经在**，`F:\sanguo\game\src\core\battle.ts:2515`：

```ts
2511   if (foe) {
2512     const interval = actionIntervalOf(u);
2513     u.atkLock = atkLockOf(u, world, foe) ?? 1;
2514     u.cd = interval;
2515     u.lastAttackTick = world.tick;   // ← 真出手那一 tick 就在这里写
2516     intents.push({ from: u, to: foe });
2517   }
```

`cocos/assets/scripts/core/battle.ts` 是同一份镜像，同样有这行（`:2482` 附近，`lastHitTick` 写入也在）。
⇒ **【P0 3.1.1】判定为「纯 view 改动」**，不需要 core 补丁，也不需要等 block 解除。真正错的只是 view 用错了判据：旧代码用 `u.cd > interval - 24`，而 `cd` 在**移动/待機分支也会被重置**（`battle.ts:2534 u.cd = interval;`），于是行军、站桩、待機的兵也有 60% 的 tick 在挥空刀 —— 这就是用户看到的「全员空挥、真打时反而没区别」。

## 2. view 侧改法（已落盘，可直接复核）

### 2.1 `game/src/view/animSelect.ts` 新增（`:66` 一带，常量区）

```ts
export const ATTACK_TICKS = 20;        // 原有：动作图集 attack_back 的窗口
export const HIT_FLASH_TICKS = 6;      // R194 新增：程序化受击反馈窗口
...
/**
 * 攻击年龄：`lastAttackTick` 只在 `battle.ts:2515` 真正出手那一 tick 被写，
 * 所以「age !== null」== 「这个单位刚刚真的出了一刀」。返回 [0, window) 或 null。
 */
export function attackAgeOf(u: Unit, tick: number, window: number = ATTACK_TICKS): number | null {
  const at = (u as { lastAttackTick?: number }).lastAttackTick;
  if (at == null) return null;         // 从没出过手：字段根本不存在
  const d = tick - at;
  return d >= 0 && d < window ? d : null;
}
```

### 2.2 `game/src/view/battleView.ts:1412 pushSpriteFrames()` 换判据

```diff
-  const interval = actionIntervalOf(u);
-  const swingTicks = Math.min(24, interval - 1);
-  const swinging = allowSwing && atk.length > 0 && u.cd > interval - swingTicks;
-  const seq = swinging ? atk : walk;
-  const spent = interval - u.cd;
+  const swingTicks = 24;                                  // 24 tick @60Hz ≈ 0.4s，10 帧 ≈ 25fps
+  const age = allowSwing && atk.length > 0 ? attackAgeOf(u, tick, swingTicks) : null;
+  const swinging = age !== null;
+  const seq = swinging ? atk : walk;
+  ...
+  const idx = swinging ? Math.min(atk.length - 1, Math.max(0, Math.floor(age / (swingTicks / atk.length)))) : 0;
```

调用点（`battleView.ts:1315` / `:1341`）本来就传 `set.attack` 和 `allowSwing`，签名没变；**A/B 两侧都自动生效**（B 侧用 `front` + `attackEnemy`，见 `unitFrames.ts:148-152`），原来 B 侧也能挥，只是同样被 cd 门驱动。
`actionIntervalOf` 在 `battleView.ts:776 actionGaugeOf()` 里还在用（血条下的行动条），**不要连它一起删**。

## 3. 收益（实测）

`probe_r194.mjs`（`F:\sanguo\work\anim_fix\probe_r194.json`）：

| 场景 | 改前 | 改后 |
|---|---|---|
| 全员待機 240 tick（一次都没出手） | 画出 **235** 个攻击帧 | **0** |
| 接战 900 tick（60v60，`atkA=56 atkB=56`） | 攻击帧与出手无关 | 画出 **1393** 个，逐 tick 对账 **1393/1393**，450 采样 0 失配 |

`game/tests/anim_view.test.ts` 的「待機 240 tick：一个攻击帧都不许画」和「接战后逐 tick 攻击帧数 == 出手窗口内单位数」两条断言就在盯这个（全量 1631 tests 全绿）。

## 4. 风险 / 回滚

- 视觉节奏变慢：以前每 40 tick 恒有 24 tick 在挥，现在只有真出手才有 ⇒ **行军时画面安静很多**，这是对的，但如果觉得「太静」，用 `battleView.ts` 的行走相位（`phase = floor(u.x*7+u.y*13) + floor(tick/hold)`）加一点点身体前倾来补，不要回退判据。
- 若 `lastAttackTick` 将来被改成「每 tick 都写」，这条补丁就退化成旧行为 —— 验收断言（待機 0 帧）会立刻红，能兜住。
- 回滚只要还原 `pushSpriteFrames` 那 5 行（`git diff` 里 `- const interval = actionIntervalOf(u)` 一段）。

## 5. 验收

```powershell
cd F:\sanguo\game
node --test tests/anim_view.test.ts     # 7 条：待機 0 帧 / 逐 tick 对账 / 受击 / 两侧尸体 / 兵种帧
node --test tests/*.test.ts             # 全量 1631 pass
node F:\sanguo\work\anim_fix\probe_r194.mjs
```
