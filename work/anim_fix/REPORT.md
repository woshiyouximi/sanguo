# 战斗动作 / 视觉重叠 问题：调查与修复方案

> 子智能体 `anim` 交付。**本轮不改生产代码**，只给证据 + 可直接照抄的补丁方案。
> 所有行号复核时间：2026-11-26 04:32（`game/src` 正被并行改写，改前请 `grep` 再确认一次）。
> 浏览器证据对应 **`game/dist` 04:06:46 那次构建**（`game/src` 04:26 后又变了），所以"页面上看到什么"对应旧版；
> 逻辑/帧序证据全部用 **Node 直接 import `game/src/*.ts`** 跑出来的，对应**当前源码**。

---

## 0. 三条结论（先看这个）

1. **挥砍动作不是"没有"，而是"一直在放"**：士兵攻击帧由 `u.cd` 单独驱动（`battleView.ts:1340`），
   而 `u.cd` 在**移动/待機分支也会被重置成 40**（`battle.ts:2529`）。
   实测：全员待機、`attacksA=attacksB=0` 的 240 tick 里，画出了 **235 张攻击序列帧，100% 来自"从没出过手"的单位**。
   ⇒ 出手与挥砍**完全解耦**，真正那一刀没有任何额外表现，玩家看到的只是"一直在挥 + 血量在掉"。
2. **受击表现在游戏里事实上不存在**：`ACTION_SIDES = ['A']`（`animSelect.ts:58`）⇒ 敵方**恒不播**受击/阵亡帧；
   我方士兵**一击必死**（`battle.ts:2583-2584`「士兵没有 HP（命中即死）」→ `applyDamage(world, to, 1, from)`），
   活着挨打的状态永远不出现 ⇒ `hit_back` 全程 **0 帧**；我方阵亡有 `death_back`（216 帧）但那是**朴刀兵的背视通用素材**，连骑兵也用它。
3. **"叠在一起"不是占位 bug，是几何必然**：用真实 `unitCell()` 统计，**逻辑同格 = 0 对/帧**（`occ` 是有效的）；
   但绘制矩形里 **>50% 面积重叠 8.76 对/帧、>75% 1 对/帧、最糟一对 ar=1.000**（两个骑兵矩形完全互相覆盖）。
   来源三项：贴图宽 72px vs 车道节距 43.59px（**相邻车道固定重叠 39.6%**）、抖动 ±10.9/±17.2px、
   滑行插值让 **5.1 对/帧**的两个单位在 `Math.round` 的格空间里落到同一位置（目标格不同，但插值途中穿过彼此；
   最硬的一例：tick 325 两个敵兵屏幕距离 **0.14px**，双方 `slide` 都在进行中）。

---

## 1. 复现环境与方法

### 1.1 服务 / 页面

```powershell
# 5299 已在跑（pid 27392）；没有就：
cd F:\sanguo\game; node web/serve.mjs 5299
# 页面（dev=1 才认调试参数）
#   http://127.0.0.1:5299/web/index.html?dev=1&auto=1&seed=7          ← 自动开战
#   http://127.0.0.1:5299/web/index.html?dev=1&auto=1&seed=7&sim=900&freeze=1  ← 精确停在第 900 tick，可复现截图
```

`main.js` 的 dev 开关（都在 `game/web/main.js`）：`auto`(:1781) 自动开战、`sim`(:1786) 先同步跑 N tick、
`freeze`(:1787) 停推进、`seed`(:1771) 固定随机、`rush`(:786) 突击、`end`(:1800) 强制结算。
`freeze` 时帧循环只 `draw()` 不 `step()`（`main.js:1506-1510`），所以 **sim+freeze+seed = 确定性定格**。

> **重要**：战斗页开局是**暂停**的（tick=0，DOM 里有 `#start`），且**缺省命令是待機**（`battle.ts:2525-2528`）。
> 不下 `advance` / `rush` 指令双方永远不会接战 —— 我实测 510 tick 时 `attacksA=attacksB=0、aliveA=aliveB=100`。

### 1.2 探针清单（全部只读，都在 `F:\sanguo\work\anim_fix\`）

| 文件 | 作用 | 产出 |
|---|---|---|
| `probe_frames.mjs` | 逐 tick 反解 `buildFrame` 的 sprite → 帧名（攻击/走路切换点） | `probe_frames.json` |
| `probe_swing.mjs` | **决定性**：攻击帧由谁驱动；敵方受击/阵亡画什么 | `case1_idle_attack_frames.json`、`case2_hit_frames.json` |
| `probe_hitframe.mjs` | 整场统计 `death_*` / `hit_*` 帧被画出的次数 | `probe_hitframe.json` |
| `probe_overlap.mjs` | 用**真正画出来的矩形**量化叠合（阈值 0.2/0.35/0.5/0.75） | `probe_overlap.json` |
| `probe_sep.mjs` | 抖动幅度、车道/行距、同车道相邻间隙 | —（数字见 §2.4） |
| `probe_general.mjs` | 主将出手/挥砍占比 | `probe_general.json` |
| `sheet_frames.py` | 从 `units_00.png` 裁帧拼版 + 逐帧差异像素占比 | `sheet_*.png`、`frame_diff.json` |
| `sheet_bodywidth.py` | 逐兵种不透明躯干宽/高（图集 px） | `body_width.json/.txt` |
| `sheet_live.py` | 6 张连拍裁切放大拼版 + 差异占比 | `live_crop_6shots.png` |

跑法：`node probe_swing.mjs`（Node ≥ 22，直接 import `game/src/*.ts`）；Python 用
`C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`（自带 Pillow）。

### 1.3 浏览器 6 连拍（要求项 ②）

用 Edge CDP 有头窗口（`--remote-debugging-port=9342 --user-data-dir=F:\sanguo\work\.edgeprof_anim --window-size=900,1500`），
在 `?dev=1&auto=1&seed=7` 上每 **150ms** 截一张，共 6 张：`live_0..5.png`（876×1368），
对应 tick = **368 / 391 / 414 / 437 / 461 / 486**。

**裁切放大**：`sheet_live.py` 取"帧0→帧1 变化最剧烈的 32×32 块"（全图坐标 (326,898)），
以它为中心裁 120×110 再放大 4×，六帧拼成一张：`live_crop_6shots.png`（1440×932）。

**帧 A vs 帧 B 是否有差异？—— 有，而且很大，但差异主要不是"攻击动作"，是"位移"：**

| 对比 | 全图差异像素占比 | 该 120×110 局部差异 |
|---|---|---|
| shot0 → shot1 | 9.43% | **71.55%** |
| shot1 → shot2 | 8.87% | **68.65%** |
| shot2 → shot3 | 8.60% | 63.79% |
| shot3 → shot4 | 8.39% | 57.29% |
| shot4 → shot5 | 7.37% | 42.42% |
| shot0 → shot5（2 秒） | 6.86% | — |

结论要分两层说：
- **静态帧确实会变**（不是"卡在一帧"），局部 42–72% 像素都不同；肉眼在 `live_crop_6shots.png` 里能清楚看到
  同一批兵在 **举刀过顶 / 劈下 / 收刀** 之间跳。
- **但这批连拍的那一局 `attacksA = attacksB = 0`**（§2.1 实测）——也就是说，**这些"挥砍"全是在没打人的时候放的**。
  再加上镜头 `camX` 平移 + 单位走位，整屏 7–9% 的差异里没有多少能归因于"这一刀砍中了"。
  ⇒ 用户的"攻击没有动作"应理解为 **"攻击没有可辨识的动作事件"**，不是"帧不动"。

### 1.4 美术资源本身没问题（排除"图集未加载退化成色块"）

- 浏览器实测：`unitsLoaded=true`、`groups=13`、`frames=572`，console 0 条、exception 0 条、netFails 0 条。
- `game/web/anim/units.json`：13 组 × `back`12 / `front`12 / `attack`10 / `attackEnemy`10，`hold:4`，`canvas_w:75`。
- 逐帧差异（`frame_diff.json`，与首帧比较的差异像素占比）：
  - `podao_atk_00..09` = 0/36/36/38/39/47/49/49/48/44% → **明显是"举过头顶→劈下→回位"**
  - `podao_walk_00..03` = 0/26/28/31% → 只有腿部在动
  - `actions` 的 `attack_back` = 0/12/15/15/23/23/21/19/20/21%，`hit_back` = 0/30/38/37/35/32/28/23/14/0%
- `game/web/anim/actions.json` 只有 3 组共 44 帧：`attack_back`17 / `death_back`17 / `hit_back`10 —— **全是背视（我方）**，
  没有任何 `*_front` / `*_enemy` 版本，这是 §3.2 改不动的硬约束。

---

## 2. 现状：绘制链路逐段（要求项 ①）

### 2.1 ① 走动有没有帧序列循环？—— **有，而且是 12 帧 × hold 4**

- `battleView.ts:1153 drawActors()` 收集演员 → `:1172-1176` 排序 → `:1178` 主将走 `drawGeneral`，否则 `:1179 drawSoldier`。
- `battleView.ts:1232` `const set = pickUnitFrames(world, u, { units })`（`unitFrames.ts:131`）：
  A 侧取 `group.back`、B 侧取 `group.front`，各 **12 帧**（`unitFrames.ts:148`）。
- `battleView.ts:1347` 走路相位：
  ```ts
  const phase = Math.floor(u.x * 7 + u.y * 13) + Math.floor(tick / Math.max(1, hold));
  idx = ((phase % seq.length) + seq.length) % seq.length;
  ```
  `hold = 4`（`units.json`），即 **每 4 tick 换一帧 = 15fps 的踏步**，并且**按格位错开相位**（100 个兵不会同步踏步）。
  ⇒ 走动循环是正常工作的，视觉上"腿部在动"但幅度小（差异像素只有 26–31%）。
- 降级链：兵种图集 → 老 `atlas.json` 的 `walk_back/walk_front`（`battleView.ts:1271-1280`）→ 色块（`:1283-1303`）。

### 2.2 ② 攻击有没有独立帧/动作段？—— **有两套，但都不是由"出手"触发**

**A. 兵种图集自带的攻击序列（10 帧，我/敵各一套）**
- `battleView.ts:1338-1345`：
  ```ts
  const interval = actionIntervalOf(u);              // 士兵 40
  const swingTicks = Math.min(24, interval - 1);     // 24
  const swinging = allowSwing && atk.length > 0 && u.cd > interval - swingTicks;  // u.cd > 16
  const spent = interval - u.cd;
  idx = Math.floor(spent / (swingTicks / atk.length));   // 24 tick 铺 10 帧 = 2.4 tick/帧 ≈ 25fps
  ```
  ⇒ 判据是 **`u.cd > 16`**，而 `u.cd` 是这个单位的**行动计时器**：
  - 攻击分支 `battle.ts:2509 u.cd = interval`
  - **移动/待機分支 `battle.ts:2529 u.cd = interval`**（同一行，无论走不走、打不打）
  ⇒ 每个行动周期**固定前 24/40 tick 在挥砍**，占空比 60%。

  实测（`probe_swing.mjs` Case 1，全员待機 240 tick）：
  ```
  world.stats.attacksA/B = 0 0
  画出的攻击序列帧总数 = 235   其中「本单位从没出过手(lastAttackTick==null)」= 235 (100%)
  样例 {"tick":1,"name":"dadao_atk_00","cd":40,"lat":null}
       {"tick":1,"name":"dadao_atk_09","cd":17,"lat":null}
  ```
  主将同理（`probe_general.mjs`）：1800 tick 里 **A 主将一次没出手**，但挥砍窗口占比 **71.3%**（B 主将 71.2%）。

  > **这个 bug 仓库里已经修过一次，只是没修士兵**：
  > `game/src/view/generalAtlas.ts:253-257` 的注释写得很清楚 ——
  > "旧实现拿 `u.cd` 落在行动间隔最后 1/4 当'正在挥砍'。但 `cd` 只是行动计时器 —— 单位**走路**时它照样在倒数，
  > 于是行军中的主将每隔 40 tick 就空挥一次。……所以这里改成读真事件：**打过才播**。"
  > 主将的新实现是 `attackAgeOf()`（`generalAtlas.ts:259-264`，读 `u.lastAttackTick`）；
  > 士兵路径**没跟进**，还留着老的 `u.cd` 门（`battleView.ts:1340`）。

**B. animSelect 的背视动作覆盖（我方才走）**
- `battleView.ts:1238` `pickActionFrame(u, world, actionAtlas)` → `animSelect.ts:197`：
  阵亡(`death_back`,24tick) > 受击(`hit_back`,16tick) > 攻击(`attack_back`,20tick)；
  但 `animSelect.ts:199 if (!ACTION_SIDES.includes(u.side)) return null`，`ACTION_SIDES = ['A']`（`:58`）
  ⇒ **只对我方生效，敵方恒 null**。
- `battleView.ts:1239` 还有一行"让位"逻辑：
  ```ts
  const act = set && set.attack.length > 0 && act0?.key === 'attack_back' ? null : act0;
  ```
  兵种图集有攻击帧时，把 `attack_back` 丢掉（避免"拉弓拉到一半换刀"），
  于是 **`attack_back` 在整个 900 tick 对局里 0 次出现**（`probe_hitframe.mjs`），
  只有 `death_back` 还能进来（216 帧，见 2.3）。

### 2.3 ③ 受击有没有闪烁/后仰？—— **没有。既没有帧，也没有程序化反馈**

`probe_hitframe.mjs`（100v100 接战 900 tick，`atkA=76 atkB=69 hitsA=55 hitsB=9 blocks=81`）：

| 统计项 | 结果 |
|---|---|
| 画出的 `death_*` 帧 | **216**（全部 A 侧，`death_back`） |
| 画出的 `hit_*` 帧 | **0** |
| 画出的 `attack_back` | **0**（被 `:1239` 让位掉了） |
| `isDying()` 为真的单位-次 | 216 |
| 活着且 `lastHitTick` 在 16 tick 内的单位-次 | **0** |

三个原因叠在一起：
1. **敌方完全没有**：`ACTION_SIDES=['A']` ⇒ B 侧 `pickActionFrame` 恒 null；
   `drawActors:1165 if (!u.alive && !dying && !generalDying(...)) continue;` ⇒ **敵兵阵亡是"原地消失"**，没有倒地。
   （`probe_swing.mjs` Case 2 里"B 侧阵亡/刚挨打画了什么帧"= 空集 `{}`。）
2. **我方士兵也没有受击帧**：士兵没有 HP，命中即死（`battle.ts:2583-2584` 的注释与
   `applyDamage(world, to, 1, from)`），`alive && tick-lastHitTick < 16` 这个状态**从不出现** ⇒ `hit_back` 永远用不上。
3. **我方阵亡帧是通用素材**：`death_back` 来自 `actions_00.png`，是**朴刀兵**的倒地序列。
   实测样本 `{side:"A", kind:"cavalry", pick:{key:"death_back"}}` —— **骑兵用朴刀兵的倒地帧**。
4. 主将：`generalAtlas.ts:268 lastHit()` 只用于 `generalDying()`（死亡窗口），**没有受击闪烁**。
5. 全仓没有任何"命中闪白 / 后仰 / 顿帧"的绘制代码：`lastHitTick` 的读者只有
   `animSelect.ts:203`（死亡帧）、`generalAtlas.ts:269`（死亡窗口）、`audio_bus.ts:570`（受击音效）。

> 所以"只是站着掉血"这个描述是**字面准确**的：受害者的绘制在这一帧**没有任何变化**，
> 变化只发生在血条/数字上。而且`傷害數字`是唯一的即时反馈，60fps 下 3-4 帧就飘走了。

### 2.4 ④ 视觉重叠的量化（要求项 ③）

**判据**：取 `buildFrame` 真正输出的 sprite 矩形 `(x-w/2, y-h, w, h)`（`w = 75*s`，`s` 是该行透视缩放），
两两求交叠面积 / 较小矩形面积，超过阈值记一对。900 tick、每 3 tick 采样 = **300 帧样本**。

| 交叠比阈值 | 实际绘制（含抖动/滑行） | 其中同阵营 | 其中敌我 |
|---|---|---|---|
| > 20% | **70.39** 对/帧 | 65.87 | 4.52 |
| > 35% | **32.66** 对/帧 | 30.39 | 2.27 |
| > 50% | **8.76** 对/帧 | 8.09 | 0.68 |
| > 75% | **1.00** 对/帧 | 0.97 | 0.03 |
| **逻辑同格**（真实 `unitCell()`） | **0** | 0 | 0 |

最糟一对（`probe_overlap.json`）：
```json
{"ar":1.0,"tick":721,
 "a":{"side":"A","kind":"cavalry","gx":38.63,"gy":12.47},
 "b":{"side":"A","kind":"cavalry","gx":39.06,"gy":12.38},
 "rectA":[629.0,775.7,81.9,67.7], "rectB":[628.4,760.4,83.2,116.4]}
```
两个骑兵相距 **0.43 格纵深 / 0.09 车道**，矩形完全互相覆盖 —— 看起来是"一个长了六条腿的骑兵"。
（另：tick 25 开战全体起步时有 **23 对**同时压在一起。）

**几何底数**（`probe_sep.mjs` + `field.ts`/`projection.ts`）：
- 车道节距（中排）`lanePitch(0) = LANE_PX * rowScale(0) * LANE_SQUEEZE = 53.57 × 0.9625 × 0.8453 = 43.59px`
- 士兵贴图绘制宽 `75 × 0.9625 = 72.2px`
  ⇒ **相邻车道固定重叠 (72.2 − 43.59)/72.2 = 39.6% 宽**
- 行距 `rowPitch(0) = 68.75px`，贴图高 67–116px（`body_width.json`）⇒ 相邻行重叠 0–41%
- 抖动（`commitStep` 的 `jx/jy` 换算到屏幕）：横向 |dev| p50 4.10 / max **10.90px**；纵深 |dev| p50 8.16 / max **17.19px**
  ⇒ 同车道相邻两兵竖直间隙 **min 3.82px**（p05 22.77px，p50 70.21px）
- 滑行：`ACTION_SLIDE_TICKS = 40` 线性插值，两个单位"换位"时中途必然穿过彼此；
  实测 **5.1 对/帧**的两个单位在 `Math.round` 的格空间里处于同一位置（但 `unitCell()` 的目标格不同）

**结论**：不是 `occ` 占位失效（逻辑同格 0 对/帧，`buildOccupancy` 有效），
也不是绘制顺序错（`battleView.ts:1172-1176` 已经是"远者先画 → 近者覆盖"，同深度士兵先主将后，遮挡关系正确）。
**纯粹是"贴图比格子大 + 永久抖动 + 滑行交叉"三点几何问题**。

---

## 3. 修复方案（要求项 ④）

分两块，**每块都能独立上线、独立验收**。建议顺序：3.1.1 → 3.1.2 → 3.2.1 → 3.1.3 → 3.2.2。

### 3.1 帧序列（行走 / 攻击 / 受击）

#### 3.1.1 【P0】士兵攻击窗口改读真实出手事件 `lastAttackTick`

**改哪**：`game/src/view/battleView.ts:1336-1349`（`pushSpriteFrames` 内）

```ts
// 现在（bug）
const interval = actionIntervalOf(u);
const swingTicks = Math.min(24, interval - 1);
const swinging = allowSwing && atk.length > 0 && u.cd > interval - swingTicks;
const seq = swinging ? atk : walk;
if (swinging) {
  const spent = interval - u.cd;
  idx = Math.min(atk.length - 1, Math.max(0, Math.floor(spent / (swingTicks / atk.length))));
}
```

```ts
// 改成：窗口由「真出手」决定，和 generalAtlas.attackAgeOf 同口径
const interval = actionIntervalOf(u);
const swingTicks = Math.min(24, interval - 1);           // 保持 24 tick ≈ 0.4s
const age = attackAgeOf(u, tick);                        // ← 新增，见下
const swinging = allowSwing && atk.length > 0 && age !== null;
const seq = swinging ? atk : walk;
if (swinging) {
  const step = Math.max(1e-6, swingTicks / atk.length);
  idx = Math.min(atk.length - 1, Math.max(0, Math.floor(age / step)));
}
```

```ts
/** 出手动作的年龄（tick）；没在出手 / 超出窗口返回 null。口径照抄 generalAtlas.ts:259。 */
function attackAgeOf(u: Unit, tick: number): number | null {
  const t0 = (u as unknown as { lastAttackTick?: number }).lastAttackTick;
  if (typeof t0 !== 'number' || !Number.isFinite(t0)) return null;
  const d = tick - t0;
  return d >= 0 && d < 24 ? d : null;
}
```

- **顺手**：`allowSwing` 的最后一个调用点 `battleView.ts:1277`（老 `atlas.json` 降级路径）传的是
  `!usesActionFrames(u)`，保留即可；`:1264` 的实参 `true` 也可以删掉，让函数签名退化成 3 个可选参数。
- **收益**：未接战 0% 空挥（现在 60%）；接战时每一次真出手都**精确对应第 0 帧起手**，
  而且**两侧同时**有表现（B 用 `attackEnemy` 组，`unitFrames.ts:150` 已经选好了）。
- **风险**：行军时不再有挥砍 → 队伍看起来"太规矩"。缓解：`hold` 从 4 调到 5–6 让走路循环更从容，
  或行军时用 `walk_side`（素材已备，`unitFrames.ts:129` 注明"这一轮不接"）。
- **风险**：`actionIntervalOf(u)` 在 `swingTicks = min(24, interval-1)` 里还留着，是为了让
  撤退/慢速单位的窗口不变；`age` 已经与 `interval` 无关，这里可以简化成常量 24，但保守起见先保留。

#### 3.1.2 【P0】给敌我双方都补上「受击」的程序化反馈

素材约束：`actions.json` 只有 `*_back`，**没有正面受击帧**；士兵一击必死所以 `hit_back` 用不上。
所以不要指望帧，改成 **view 层的程序化反馈**（0 素材依赖，两侧通用）：

在 `drawSoldier()` 的**影子之后、选帧之前**（`battleView.ts:1228` 之后）插入：

```ts
// 受击反馈：命中后 6 tick 内，画一个"冲击星" + 让身体沿被打方向后退 3px
const hitAge = typeof u.lastHitTick === 'number' ? world.tick - u.lastHitTick : 999;
const FLASH = 6;                       // 6 tick ≈ 0.1s，肉眼刚好够
if (hitAge >= 0 && hitAge < FLASH) {
  const k = 1 - hitAge / FLASH;        // 1 → 0
  const dirY = u.side === 'A' ? 1 : -1; // 被打的人往自己背后退（屏幕上=朝己方后方）
  fy += dirY * 3 * k;                  // 后仰：绘制位置回退，最多 3px
  // 冲击星：三条短线呈 "米" 字，在胸口高度（fy - 20*s）
  const cx = fx, cy = fy - 20 * s;
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
    LN(out, cx - Math.cos(a) * 7 * s * k, cy - Math.sin(a) * 7 * s * k,
            cx + Math.cos(a) * 7 * s * k, cy + Math.sin(a) * 7 * s * k,
            withAlpha(COLORS.goldLight ?? '#ffd76a', 0.9 * k), 1.6 * s);
  }
}
```

- 位置要在 `scaleSpriteCmds` 之后统一缩放，所以更稳妥的写法是**最后 push 两条 `LN` 指令**
  （不参与 `scaleSpriteCmds` 的缩放），坐标全部已经乘过 `s`。
- **落地细节（已核对）**：`fx/fy` 现在是 `const`（`battleView.ts:1224-1225`），要改成 `let`；
  `LN(out, x1, y1, x2, y2, stroke, width = 1, alpha = 1, dash?)`（`battleView.ts:888`）；
  `withAlpha` 已 import（`battleView.ts:112`）、`COLORS.goldLight = '#F0D79C'` 已存在（`theme.ts:41`）。
- **代价**：每帧最多几十条线指令；`LN`/`E`/`R` 都是既有原语（`battleView.ts` 里到处在用）。
- **收益**：这是"站着掉血"最直接的解药 —— 挨打的人**当帧就有可见变化**，两侧都有。
- **风险**：`u.lastHitTick` 只对"真命中"写（`battle.ts:2566`；`hitRoll` 没过时 `:2560-2564` 直接 `continue`，不写），
  所以"格挡/闪避"仍然没有反馈 —— 如果要做，得让 core 也记 `lastBlockTick`（**本轮不建议**，超出 view 范围）。

#### 3.1.3 【P1】阵亡表现：敌兵不要"原地消失"，我方不要"骑兵用朴刀的倒地帧"

两条独立的小改：

**(a) 敌兵**：给 `isDying`/`pickActionFrame` 放开 B 侧，但**不新增素材**，用"程序化倒地"代替帧：
```ts
// battleView.ts drawActors 里，B 侧尸体放行
const dyingB = u.side === 'B' && !u.alive && typeof u.lastHitTick === 'number'
               && world.tick - u.lastHitTick < 24;
if (!u.alive && !dying && !generalDying(world, u) && !dyingB) continue;
```
绘制时（`drawSoldier` 内）用最后一帧 `front` 帧 + `out.push` 一条带旋转的 sprite 指令
（`DrawCmd` 现在没有 `rot` 字段 ⇒ **要么加字段，要么用三条 `R()` 画一个"倒下"的矩形**）。
最省的方案：**尸体用一个压扁的椭圆 + 兵种色**，24 tick 内 alpha 从 1 渐到 0 —— 3 行代码，视觉上"倒下了"。

**(b) 我方**：`death_back` 是朴刀兵的素材，骑兵/弓兵用它是错的。
选项 1（推荐）：**只让"朴刀类"兵种用 `death_back`**，其他兵种也走 (a) 的程序化倒地；
选项 2：给 `actions.json` 补 13 个兵种 × 17 帧的倒地序列（美术工作量大，本轮不做）。

#### 3.1.4 【P2】行走帧（可选，优先级低）

`hold=4` → 15fps，配合 2 帧差异只有 26–31% 的素材，行军看起来像"滑步"。
建议 `hold=5`（12fps，更从容）或补 `walk_side` 侧向循环（`unitFrames.ts:129` 已注明素材已备）。
**这一条不影响用户反馈的两个问题，最后再做。**

---

### 3.2 视觉分离（抖动夹取 / 滑行交叉 / 绘制顺序）

#### 3.2.1 【P0】滑行交叉：禁止两个单位在滑行途中穿过彼此

**根因**：`commitStep` 只把**目标格**写进 `occ`（`battle.ts:2134`），但两个单位若同时"交换"目标格，
各自的旧格在对方出发时已腾空 ⇒ 允许交换 ⇒ 40 tick 插值途中必然重合（实测 5.1 对/帧）。

**改哪**：`game/src/core/battle.ts:2131-2150`（`commitStep`）+ `:2471` `step()` 里的占位构建。

```ts
// 1) 在 step() 里维护"滑行中占位"表（每个 tick 重建即可，40 tick 量级，成本可忽略）
const movingTo: Map<number, Unit> = new Map();       // cellKey → 正在滑向它的单位
for (const u of world.units) {
  if (!u.alive || !u.slide) continue;
  const c = unitCell(u);                              // 已有：滑行时返回目标格
  const k = cellKey(c.gx, c.gy);
  if (!movingTo.has(k)) movingTo.set(k, u);
}

// 2) chooseStepCell / commitStep 前，若目标格已在 movingTo 里（且不是自己）→ 当作不可走
//    最省事的落点：在 commitStep 里加一条软约束（不返回失败，只把抖动往反方向推）
```

**更保守的替代（推荐先做这个，改动 3 行）**：**给"交换"场景加一个车道错位** ——
```ts
// commitStep: 若目标格已被人从反方向滑向本格（即"对穿"），把抖动 dy 往同侧偏
const crossing = movingTo.get(cellKey(cell.gx, cell.gy));   // 若有单位正滑向我的格子
if (crossing && crossing !== u) {
  const dir = Math.sign(u.y - crossing.y) || 1;
  dy = clampPx((cell.gy - u.y) * 72 + dir * 30, 90);        // 一方偏上、一方偏下，错开半个车道
}
```
效果：对穿时两个兵在屏幕上**横向错开约 30px**，视觉上"擦肩而过"而不是"合体"。

- **风险**：`chooseStepCell` 返回 `null` 时已有兜底 `settleToCell`（`battle.ts:2534`），不会卡死；
  但过度禁止会让阵型重排变慢。建议先上"错位"而不是"禁止"。
- **验收**：见 §4 的 `ar > 0.75` 断言（目标 0 对/帧）。

#### 3.2.2 【P0】抖动收紧（改 `commitStep` 的 jx/jy）

**改哪**：`game/src/core/battle.ts:2136-2139`

```ts
// 现在：jx ∈ [−24,+23] px、jy ∈ [−18,+17] px，换算到屏幕是 ±10.9 / ±17.2（含行缩放后）
const jx = Math.floor(rng() * 0x30) - 0x18;
const jy = Math.floor(rng() * 0x24) - 0x12;
// 建议：砍到 1/2 ～ 1/3，并保持"整格"语义不变
const jx = Math.floor(rng() * 0x18) - 0x0c;   // −12..+11 px
const jy = Math.floor(rng() * 0x12) - 0x09;   // −9..+8  px
```

- 效果（按 `probe_sep` 的口径估算）：同车道相邻两兵的竖直间隙 `min` 从 **3.82px** 提到 ≈ 30px；
  相邻车道的横向最大逼近从 21.8px 提到 ≈ 33px。
- **风险**：抖动原本是"打破网格呆板感"的手段（`commitStep` 注释里提到原作也有随机）。
  砍到 1/2 视觉上仍然有错落感；砍到 0 会明显"方阵化"，**不建议直接归零**。
- **别动** `settleToCell`（`battle.ts:2161-2166`）：它本来就没有抖动，是对的。

> ⚠️ **对"收紧 `commitStep` 夹取"这个设想的更正**（重要，别改错地方）：
> `battle.ts:2138-2139` 的 `clampPx(..., ±120px / ±90px)` **不是抖动幅度**，它只在"一步跨多格"时才生效
> （`dy` 里 `(cell.gy - u.y) * 72` 的 72px/车道不变，±90px 恰好 = ±1.25 车道）。
> 抖动本身是 `jx/jy`（±24 / ±18px），**远小于夹取上限，完全不受 clamp 影响**。
> 如果把夹取改成 `±LANE_PX * 0.5 = 26.8px`，那么**任何一次跨车道（72px）都会被砍成 26.8px**，
> 滑行结束时单位停在离格心 0.63 车道的地方，而 `unitCell()` 已经认它是目标格 ⇒
> **视觉位置与逻辑格永久错位**，越走越歪。⇒ **抖动要改的是 `jx/jy` 的模数，不是 `clampPx` 的限值。**

#### 3.2.3 【P1】绘制顺序（现状正确，不要动）+ 近邻微偏移（可选）

- `battleView.ts:1172-1176` 的排序**已经是正确的画家算法**：
  `a.u.x - b.u.x`（远者先画）→ 同深度按 `u.y` → 同深度同车道士兵先、主将后（主将压在最上）。
  **这一块不用改**，改错会立刻出现"前面的人被后面的挡住"。
- 如果 3.2.1/3.2.2 之后仍有"完全重合"，再加一层**渲染期微偏移**：
  ```ts
  // drawActors 排序之后，给"屏幕距离 < 0.35 格"的对子里的后者一个固定侧向偏移
  // 不要在 drawSoldier 里临时算，统一在 drawActors 里给 p.sx 加 offset（不改 u.x）
  ```
  注意：这只是"打散重合"，**不解决 39.6% 的固定重叠**（那是格距问题）。

#### 3.2.4 【P2】结构性：格距 vs 贴图尺寸（需要设计决策，本轮不建议动）

- 相邻车道固定重叠 39.6% 是**几何**：`lanePitch(0)=43.59px` vs 贴图 72.2px。
  能改的旋钮只有三个，各有代价：
  1. `LANE_SQUEEZE 0.8453 → 1.0`：lanePitch 43.59 → 51.56（+18%），重叠 39.6% → 28.6%。
     代价：13 条车道的总跨度 566.6px → 670.4px（`laneScreenX` 是以 375 为中心的），
     边缘车道圆心从 91.7/658.3 变成 39.9/710.1 ⇒ 贴图（72px 宽）几乎顶到 750 画布左右边。
     风险：两侧阵型贴边、看不到边兵的一半身体，且与"阵型宽度"参数耦合。
  2. 士兵绘制宽 `75 → 64`（`units.json` 的 `canvas_w` 口径）：绘制宽 72.2 → 61.6px，重叠降到 **29.2%**。
     风险：违反 `project/189 §5` 的"1:1 不二次缩放"决策，会变糊/变小。
  3. 每方兵数 100 → 60：行数减少，绝对重叠对数下降 ~40%，但改变玩法数值。
  ⇒ **这三条都属于设计变更，不在本轮的"修复 bug"范围**。先做 3.2.1/3.2.2，再拿 §4 的探针复核。

---

## 4. 验收断言（要求项 ④）

### 4.1 Node（推荐，能进 CI）

新建 `game/tests/anim_view.test.ts`（或 `work/anim_fix/assert_anim.mjs` 先跑通再落进 tests）：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, step, camera, unitCell } from '../src/core/battle.ts';
import { buildFrame } from '../src/view/battleView.ts';
// …unitsAtlas 造假图集：{ img: SENT, frames, groups }，见 probe_overlap.mjs:20-32

test('未出手的单位不得画攻击序列帧', () => {
  // 全员待機跑 240 tick，收集 buildFrame 里名字匹配 /_atk_|attack|eatk/ 的帧
  assert.equal(attackedFramesWithNoLastAttackTick, 0);   // 现在是 235 → 改后必须是 0
});

test('真出手后 24 tick 内必须画到攻击序列帧（两侧都要）', () => {
  // engage 900 tick，对每个 lastAttackTick 的单位，统计其窗口内画到攻击帧的 tick 数
  assert.ok(coverageA >= 0.95 && coverageB >= 0.95);
});

test('阵亡的敌方单位必须画出至少 1 帧（不许原地消失）', () => {
  assert.ok(bSideDeathFrames > 0);                        // 现在是 0
});

test('相邻两单位绘制矩形 >50% 重叠的对数 ≤ 2 / 帧，>75% 为 0', () => {
  assert.ok(stats[0.5] <= 2);                             // 现在 8.76
  assert.equal(stats[0.75], 0);                           // 现在 1.00
});

test('逻辑层永不同格（回归保护）', () => {
  assert.equal(dupCellPairsOverFrames, 0);                // 现在就是 0，别改坏
});
```

> 上面 5 条我用 `probe_swing.mjs` / `probe_hitframe.mjs` / `probe_overlap.mjs` 已经跑出了**当前值**，
> 括号里就是"改之前会失败的数字"，改完把断言打开即可。

### 4.2 CDP（视觉回归，人工抽查）

```js
// 1) 定格在"刚出手"的那一帧，抓两帧差
PAGE: ?dev=1&auto=1&seed=7&sim=900&freeze=1
evaluate: (() => {
  const w = window.__sanguo.state.world;
  const hit = w.units.filter(u => u.alive && u.lastAttackTick === w.tick);
  return { tick: w.tick, attackers: hit.length, stats: w.stats };
})()
// 断言：attackers > 0 才截图；否则换个 sim 值（tick 差 1）再试
// 2) 截图对比：attackers 那帧 vs 前一 tick，局部差异 > 15%（说明有可见变化）
```

固定 seed 后 tick 完全可复现，所以 `sim` 每次加 1 就能逐帧"扫"出一个真有出手的 tick。
（实测 seed=7 下第一次出手在 tick ≈ 615；`probe_frames.json` 里有精确时间线。）

---

## 5. Cocos 侧同类缺失（要求项 ⑤，只列一处）

`game/cocos/assets/scripts/` **没有 `animSelect.ts` 的镜像**（`grep pickActionFrame|ACTION_SIDES|isDying` 全空），
士兵在 Cocos 侧完全没有攻击/受击/阵亡帧的概念。主将那份还停留在旧逻辑：

**`game/cocos/assets/scripts/GeneralArt.ts:191`**（该文件 04:34 被并行改过，行号已从 189 挪到 191）
```ts
const SWING_FROM = 96;                              // :27
const attack = !dead && (u.cd ?? 0) > SWING_FROM;   // :191
else if (attack) t = Math.max(0, 120 - (u.cd ?? 0));// :204  ← 假定 interval = 120
```
web 侧已经改成 `generalAtlas.ts:259 attackAgeOf()`（读 `lastAttackTick`），Cocos 侧没跟。
更糟的是**这条判断现在是恒假的**：`u.cd` 的上限是 `actionIntervalOf()` 的返回值，
而 `ACTION_INTERVAL_TICKS = 40`、`ATTACK_COOLDOWN = 40`（`core/battle.ts:128`、`:145`，两侧同值），
撤退时才 46 —— 全都 **< 96** ⇒ `cd > 96` 永不成立，**Cocos 主将永远不挥砍**。
⇒ 如果 Cocos 侧还要维护，**至少要把这一行换成读 `lastAttackTick` 的窗口**，否则"行军中每 40 tick 空挥一次"（甚至完全不挥）会在 Cocos 上重现。

（另：`cocos/assets/scripts/core/battle.ts:2482 to.lastHitTick = world.tick` 与 web 版一致，core 是同步的。）

---

## 6. 风险与回滚

| 改动 | 风险 | 回滚 |
|---|---|---|
| 3.1.1 攻击窗口改 `lastAttackTick` | 行军时不再挥砍，观感变"静" | 单函数内的 3 行，`git checkout` 该文件即可 |
| 3.1.2 受击冲击星 | 每帧多几十条线指令（< 1% 预算） | 删掉插入块 |
| 3.1.3 B 侧阵亡 | `DrawCmd` 若无 `rot` 只能用矩形/椭圆冒充 | 保守做法：只做 24 tick 渐隐 |
| 3.2.1 滑行错位 | 可能让阵型重排变慢（`chooseStepCell` 失败率上升） | 只改 `commitStep` 里 `dy` 的 3 行 |
| 3.2.2 抖动收紧 | 失去"原作随机感" | 两个常量改回 `0x30/0x24` |

**不建议本轮做**：`LANE_SQUEEZE`、`canvas_w`、兵数（都是设计决策）；
`hit_back` 素材（需要美术出正面受击帧）。

---

## 7. 证据文件索引

| 文件 | 内容 |
|---|---|
| `probe_frames.json` | 逐 tick 帧名时间线（攻击 24 tick 走完 10 帧） |
| `case1_idle_attack_frames.json` | 待機 240 tick 的 235 张攻击帧 + 来源单位（全 `lat:null`） |
| `case2_hit_frames.json` | 接战 900 tick 的 stats 与"敵方挨打画了什么帧"= 空 |
| `probe_hitframe.json` | `death_back` 216 帧 / `hit_*` 0 帧 / `isDying` 216 单位-次 |
| `probe_overlap.json` | 四档阈值的叠合对数、最糟一对（ar=1.000 @ tick 721） |
| `probe_general.json` | 主将 1800 tick 轨迹（A 主将 0 出手，挥砍占比 71.3%） |
| `frame_diff.json` / `sheet_podao_atk.png` / `sheet_dadao_atk.png` / `sheet_actions_atk.png` | 攻击帧逐帧差异 + 3× 放大拼版 |
| `body_width.json` / `.txt` | 13 兵种躯干宽/高（铁锤 56px core = 1.04×LANE_PX） |
| `live_0..5.png`、`live_crop_6shots.png` | 浏览器 6 连拍（tick 368→486，150ms 间隔）+ 4× 放大拼版 |
| `live_crop_6shots.png` 的差异数 | 局部 71.55 / 68.65 / 63.79 / 57.29 / 42.42% |
