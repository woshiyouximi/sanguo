# PATCH_camera.md —— `camera()` 补丁（**已落地 2026-11-26 07:2x**）

**状态：已贴。** 贴的是 `game/src/core/battle.ts`（真源），镜像由 `sync_core3` 生成，未手改。
贴前 `git diff` 确认 block 的改动全在 `:592-2315`（`blockPass`/`passBlocked`），与 `camera()` 零冲突；按贴时文件现况整段替换。

**最终三个常量**

```ts
CAM_GEN_BACK = 2.0;   // camX = genAX - 2 → 主将落屏幕 ~70% 高（sy≈692）
GEN_MAX_R    = 5.0;   // 主将最差留 r=+5
GEN_MIN_R    = -7.0;  // 主将出上沿不超过 r=-7
```

**落地实测（CDP `steps_cam2.mjs`，默认 100v100 關羽 vs 張角，Edge 158，canvas 695×1236）**

| 项 | 贴前 | 贴后 |
|---|---|---|
| `state.camX`（ready / 常规跟随） | 48.40 | **56.00** |
| 屏内我方单位数 | 40（仅 x51..54） | **101（x51..61 全阵 11 排）** |
| 我方主将 `r` / `sy` | +9.60 / 1334.4（出下沿） | **+2.00 / 692.4（IN）** |
| 敌方主将 `r` / `sy` | −35.40 / −845.3（出上沿） | −42.11 / −964.4（出上沿，画外） |
| `bMax` 穿 38.4 的阶跃 | 3.4 行（48.40→45.00） | 0（`cam` 已不读 `bMax`） |

验证：`npm.cmd run typecheck` exit 0；`node --test tests/battle_*.test.ts` 97/97；全量 `node --test tests/*.test.ts` **1631/1631**；`sync_core3 --diff-only` 仅 `battle.ts` 差异 → 同步后 `--dry-run` 22/22 一致；`tsc -p cocos/tsconfig.check.json` exit 0；`web` dist 重建（`tsc -p tsconfig.build.json`，`game/dist/` 已被 .gitignore 忽略）。

**贴后发现（与叫阵系统的关系）**：`game/web/main.js` 已有开局叫阵运镜（`beginTaunt`/`tickTaunt`/`skipTaunt`，`:786-849`），喊话时 `state.camX = generalUnitX(side)`（主将正中 sy=550）、喊完 `state.camX = generalUnitX('A') - 2`（`:831`）。**贴前**那一行设完 56 之后，`frame()` 的 `camera()` 会把它拖回 48.40 ⇒ 喊完镜头又飘回前锋、我方主将沉出画面；**贴后** `camera()` 也返回 56.00，两处一致、不再回漂。实测三条路径：`?taunt=0` camX 恒 56.00；默认先是叫阵 camX 13（敌将）→ 58（我将）→ 56.00 常规跟随，叫阵期间 `tick` 不推进。

**贴前离线校验**（把函数用真实 `World`/`Unit`/`field.ts` 类型跑 tsc）：

```
cd F:\sanguo; node game\node_modules\typescript\bin\tsc -p work\flow_camera\_camcheck   → exit 0
```

---

## 0. 贴之前必做

1. `git diff game/src/core/battle.ts`（或用编辑器看 `camera()` 区域）。若 block 已改过同一函数，**不要整段覆盖**，按 §3 的最小差异合并。
2. 冲突面只有两处：**第 50 行 import**、**3195-3223 的 docstring + camera() 函数**。函数体其余部分（`project()`、`strategyRegen()` 等）与本次无关。

## 1. 改动一：import（第 50 行）

```ts
// before
import { CAM_HALF_ROWS, clampCameraX } from './field.ts';
// after
import { ROWS_FAR, clampCameraX } from './field.ts';
```

`CAM_HALF_ROWS` 在 `battle.ts` 里只有 `:3204 const half = ...` 一处使用，删掉 `half` 后它变 unused。`tsconfig.json` 没开 `noUnusedLocals`，留着也不会报错，但干净起见换掉。

## 2. 改动二：替换 3195-3223（docstring + 函数体）

### 原文（当前，3195-3223）

```ts
/**
 * 摄像机：两军都有兵时看双方前锋中点；一侧清空则看剩下那侧包围盒中心。
 *
 * 夹取走 `field.clampCameraX()`（`[CAM_MIN, CAM_MAX] ≈ [6.29, 64.49]`，由透视带沿 + 精灵身位反解），
 * 不再用 `450/ROW_PX`：常数投影是 12.6 行/屏，透视是 13.327 行/屏且两端不等（远 7.43、近 5.89），
 * 用旧半屏夹取会让夹取端点本身越界（camX=63.7 时最后一排的脚在 1034.6）。
 * `half` 只保留给「两军相距超过一屏」这道换镜判据，数值仍是 6.3 行，不参与夹取。
 */
export function camera(world: World): number {
  const half = CAM_HALF_ROWS;
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  let aN = 0, bN = 0;
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.side === 'A') { aN++; aMin = Math.min(aMin, u.x); aMax = Math.max(aMax, u.x); }
    else { bN++; bMin = Math.min(bMin, u.x); bMax = Math.max(bMax, u.x); }
  }
  let cam: number;
  if (aN && bN) {
    const mid = (aMin + bMax) / 2;
    // 开局两军相距 30 行、一屏只有 13.3 行：若直接取中点，屏幕上只有空战场（实测就是"点开战什么都看不见"）。
    // 因此相距超过一屏时先跟住我方前锋——把它放在屏幕 ~65% 高处（约 2.6 行偏置），等接近了再过渡到中点。
    cam = (aMin - bMax > 2 * half) ? aMin - 2.6 : mid;
  }
  else if (aN) cam = (aMin + aMax) / 2;
  else if (bN) cam = (bMin + bMax) / 2;
  else cam = GRID_W / 2;
  return clampCameraX(cam);
}
```

### 新文（粘贴这段）

```ts
// 我方主将锚点：主将放屏幕 ~70% 高（r=+2）；三条守卫决定阵形过深时牺牲谁。
const CAM_GEN_BACK = 2.0;   // 锚点前置量（行）
const GEN_MAX_R = 5.0;      // 主将最差也得留 r=+5（离下沿还有 0.894 行）
const GEN_MIN_R = -7.0;     // 主将最差不得出上沿超过 r=-7

/**
 * 摄像机：**钉我方主将**（原作 `project/176:362-376` 记录镜头全程跟主将、敌将从未入镜）。
 *
 * 语义：`camX = genAX - 2`，即把主将放在屏幕 ~70% 高处（透视 sy≈692），
 * 一屏 13.327 行（远 7.43 / 近 5.89）足够同时装下我方整阵（100 兵 11 排）。
 * 三条守卫（阵形过深时按优先级牺牲）：
 *   守 1  `cam ≤ aMin + ROWS_FAR`  前锋别顶出上沿 —— 阵深 > 9.43 行时开始触发；
 *   守 2  `cam ≥ genAX - GEN_MAX_R` 主将别掉出下沿 —— 阵深 > 12.43 行（一屏装不下）时宁可丢前排；
 *   守 3  `cam ≤ genAX - GEN_MIN_R` 主将别出上沿 —— 与前压时的下限兜底。
 * 主将阵亡（或单位表里找不到）时退回旧的「跟我方前锋」行为，保证镜头不跳空。
 * 夹取仍走 `field.clampCameraX()`（`[CAM_MIN, CAM_MAX] ≈ [6.29, 64.49]`）。
 *
 * 为什么不再取两军前锋中点：中点会把 camX 拉向敌阵（满员接战 50.5），
 * 而我方主将仍在 r=+7.5 出画 ⇒ 既没让主将入画、又把敌人拉近；且 bMax 穿过 38.4 时
 * 会产生 48.40→45.00 的 3.4 行突跳。钉主将后这两个问题同时消失。
 */
export function camera(world: World): number {
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  let aN = 0, bN = 0;
  let genAX = NaN;   // 我方主将 gx：world.sides.A.general 只有 hp/str/int、没有坐标，只能从 units 找
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.side === 'A') {
      aN++; aMin = Math.min(aMin, u.x); aMax = Math.max(aMax, u.x);
      if (u.isGeneral) genAX = u.x;
    } else { bN++; bMin = Math.min(bMin, u.x); bMax = Math.max(bMax, u.x); }
  }
  let cam: number;
  if (aN && bN) {
    if (Number.isFinite(genAX)) {
      cam = genAX - CAM_GEN_BACK;               // 默认：钉我方主将
      cam = Math.min(cam, aMin + ROWS_FAR);     // 守 1：我方前锋别顶出上沿
      cam = Math.max(cam, genAX - GEN_MAX_R);   // 守 2：主将别掉出下沿
      cam = Math.min(cam, genAX - GEN_MIN_R);   // 守 3：主将别出上沿
    } else {
      cam = aMin - 2.6;                         // 主将已阵亡：退回旧「跟前锋」
    }
  }
  else if (aN) cam = (aMin + aMax) / 2;
  else if (bN) cam = (bMin + bMax) / 2;
  else cam = GRID_W / 2;
  return clampCameraX(cam);
}
```

## 3. 若 block 已改过 `camera()`：最小合并

| 我的新增 | 我的删除 |
|---|---|
| `let genAX = NaN;`（1 行） | `const half = CAM_HALF_ROWS;`（1 行） |
| `if (u.isGeneral) genAX = u.x;`（1 行，放进 A 侧分支） | `const mid = (aMin + bMax) / 2;`（1 行） |
| 分支块 `if (Number.isFinite(genAX)) { ... } else { ... }` | `cam = (aMin - bMax > 2 * half) ? aMin - 2.6 : mid;`（1 行） |

保留他的 `aMin/aMax/bMin/bMax/aN/bN` 收集与「一侧清空」分支不动。若他的「不穿阵」是在**单位移动**层做的（`march.ts` / `step` 里），那与本补丁零冲突，只需确认 `camera()` 未被顺手改过。

## 4. 贴完必跑（顺序）

```
cd F:\sanguo\game
node node_modules\typescript\bin\tsc -p tsconfig.json          # web 真源，必须 exit 0
node --test tests/*.test.ts                                     # 现有 15/15 逻辑测试
cd F:\sanguo
node work\cocos_sync\sync_core3.mjs --diff-only                 # 确认差异只在 battle.ts
node work\cocos_sync\sync_core3.mjs                             # 生成镜像
node work\cocos_sync\sync_core3.mjs --dry-run                   # 应报写入 0
cd F:\sanguo\game
node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json   # 镜像，必须 exit 0
```

**永不手改** `game/cocos/assets/scripts/core/battle.ts`（同步器产物：真源写 `'./field.ts'`，镜像去后缀）。

## 5. 验收（数值，取自 `verify_anchor.mjs`）

默认阵容 100v100（A `guan yu` 阵0 x51..61 / 将 58；B `zhang jiao` 阵3 x10..24 / 将 13），t=0 暂停态：

| 断言 | 期望 | 现状（改前） |
|---|---|---|
| `camX` | **56.00**，且 `52.106 ≤ camX ≤ 58.434` | 48.40（违反下沿 3.71 行） |
| 我将屏幕 y（web 透视 / 设备 px） | **692.4 / 641.7**，区间 [660,720] 设计 | 1334.4（出下沿） |
| 我将屏幕 y（Cocos 线性） | **692.9**，区间 [660,720] | 1235.7（出下沿，曾被钳到 996） |
| 屏内我方单位数（`FIELD_TOP ≤ sy ≤ FIELD_BOTTOM`） | **101**（全阵） | 40（只有 x51..54） |
| 敌将屏幕 y | **−978.2**（web）/ **−2521.4**（Cocos）⇒ 画外 | −845.3 / −1978.6 ⇒ 画外（但被 Cocos 钳进画内） |
| 敌将入画阈值 | `camX ≤ 20.434` 才可能入画 ⇒ 断言 `camX > 25` | — |
| bMax 穿 38.4 时的阶跃 | **0** 行 | 3.4 行（48.40→45.00） |

## 6. 行为变化 & 产品权衡（贴之前请 lead 过一眼）

- **开局**：camX 48.40 → 56.00，镜头后拉约 2 行（实际视窗从「世界行 40.97..54.29」变成「43.57..61.33」）⇒ 屏幕上第一次看到**整支 11 排方阵 + 主将**（现在是「只有最前 4 排兵、上半屏空战场」）。
- **接战**：不再有 bMax 穿 38.4 时的 3.4 行突跳。
- **代价（务必知情）**：钉死后敌将**基本永不入画** —— 敌将入画需 `camX ≤ genB + 7.434`，而我方主将不后撤时 `camX = genA − 2 ≈ 45~56`。这正好是 `project/176:362-376` 记录的原作行为（52 帧扫描敌将从未入镜），但产品上等于「玩家看不到敌将，只能靠小地图与底部主将卡判断」。若要"能看见敌将"，**调 `CAM_GEN_BACK` 只改取景、不解决这件事**（阈值只取决于 `genB − camX`）。
  - 可选折中（未采用）：`bMax ≥ camX − ROWS_FAR − 2`（敌军进入一屏）时把 camX 前压 `min(2, …)` 行 —— 局部回到 `mid` 的老毛病，建议先上纯锚点版看观感再定。
- 主将阵亡后走 `aMin − 2.6`（与现状一致），不会出现「镜头没人可跟」的空镜。

## 7. 回滚

把 `camera()` 换回 §2 的「原文」块、import 换回 `CAM_HALF_ROWS` 即可（一处函数 + 一行 import），与 block 的改动无耦合。

## 8. 与本轮已落地改动的依赖关系

`GeneralArt.ts` / `BattleRoot.ts` 的贴边移除**已经落地**（见下）。它把「主将出带」变成「不画」，因此：

- **只贴 Cocos 一半**时：开局两个主将**都不画** —— 与当前 web 端行为一致（web 本来就是 `continue` 裁剪）。
- **`camera()` 也贴上**：我方主将回到 `r=+2`、屏幕 y≈692，重新可见；敌将仍画外（正确）。

## 9. 本轮已落地改动（Cocos 侧，已过 tsc）

| 文件 | 行 | 改动 |
|---|---|---|
| `game/cocos/assets/scripts/GeneralArt.ts` | `:22` | import 去掉 `DESIGN_W`（只剩 `FIELD_BOTTOM, FIELD_TOP, project`） |
| 同上 | `:29-30` | 新增 `const FOOT_CULL_PAD = 40;`（与 BattleRoot 阴影层 ±40 同口径） |
| 同上 | `:218` | 新增出带裁剪（判据用 `p.y`，与 `BattleRoot.ts:1294` 阴影层逐字同条件）：`if (p.y < FIELD_TOP - FOOT_CULL_PAD || p.y > FIELD_BOTTOM + FOOT_CULL_PAD) { this.hideSide(side); return; }` |
| 同上 | `:227` | dead 分支去掉 shift：`this.place(layers.body, body, p.x, foot)` |
| 同上 | `:230` | dead 分支 `lastFoot = null` 保留 |
| 同上 | `:242-243` | 活体分支：`for (const part of parts) this.place(part.layer, part.art, p.x, foot)`；`lastFoot = { x: p.x, y: foot }` |
| 同上 | 原 `:243-276` | **删除整个 `clampShift()` 方法**（含 9 行注释） |
| 同上 | `:246` | `footAt()` docstring 改为「设计 px，未做任何贴边位移；出带时爲 null」（**该方法现已无调用者**，保留给未来的距离指示/debug） |
| `game/cocos/assets/scripts/BattleRoot.ts` | `:1294-1299` | 阴影层去掉 `pinned`/`footAt` 死代码：`const sx = p.x; const sy = p.y + 8;`（`:1294` 的 ±40 裁剪保留） |

验证：

```
cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json   → exit 0
（改前 baseline 也是 exit 0）
```
