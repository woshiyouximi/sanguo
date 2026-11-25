# 87 · Cocos 战场观感：阵营帧集 / 主将不可见 / 出征屏兵力

> 轮次：x8（子任务）｜ 目标场景：Cocos 版 `Battle`（750×1334 设计分辨率，HUD 0..100，战场 100..1000，控制台 1000..1334）
> 复验方式：CDP 有头 Edge（`work\cocos_verify\cdp.mjs`，注意**不是** `work\cocos_verify3\`，那里没有 cdp.mjs），对现有 `game\cocos-build\web-mobile` 产物
> 代码校验：`cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` → **exit 0**（0 error / 0 warning）
> 构建：按分工**没有跑**（构建归 lead）。产物里还是旧代码，所以「改后画面」用两种方式取证：①产物内的**同公式运行时补丁**（下面 §2 有等价性证明）；②**真模块 + 真图集**的 Node/浏览器单测（§1）。

---

## 0. 结论一览

| # | 问题 | 根因（一句话） | 状态 |
|---|------|----------------|------|
| 1 | 双方士兵长得一模一样 | `bundles/res/anim/units.json` 是**旧 AI 图集**（无 `groups.*.back/front`，只有 `archer_back/front` 17 帧），Cocos 侧也从来没写过「按 Side 选 M/N」的取帧路径 | 代码已改成 FORCE 契约（`UnitFrames.ts` 新模块 + `BattleRoot` 按 side 取帧，零 tint）；**红军要 lead 同步资源 + 重建才看得到** |
| 2 | 两张主将不在画面上 | 主将生成在己方阵列**最后 2 格**（`core/battle.ts:583-597`），而镜头一屏只覆盖 **12.6 格**纵深（`core/battle.ts:1410-1427`，`half=450/ROW_PX≈6.3`）。开局两军隔 30+ 格，两位主将被投影到 **A py=1542 / B py=-1816**（画布高 1334）→ 全在画布外；`GeneralArt` 又没有任何贴边/剔除，于是「节点活着、画面上没人」 | 已修（`GeneralArt.clampShift()` 显示层贴边 + `BattleRoot` 阴影跟随）；**已用截图取证** |
| 3 | 出征屏 110 兵 vs 战场 60 兵 | 110 = `garrison.json` 的**城内预备兵池**（`city+0x82/+0x86`，原作不上场）；60 = `intel.troops` ← 空城按「我軍六成」折算（`core/garrison.ts:520-523`）。两者口径不同，界面却直接显示 garrison | 已统一到 `enemySoldiers()` 一个出口（显示 = loadout）；本城数值仍是 60 → **零平衡变化** |

---

## 1. 问题 1：双方士兵同款蓝衣

### 1.1 根因（带 file:line）

- 资源层：`game\cocos\assets\bundles\res\anim\units.json`（11,582 B，MD5 `DF20AE4101D4BFC4B9870913574ABC88`）是**旧 AI 图集**：1 页 1024×528、59 帧，只有 `archer_back_f000..f016` / `archer_front_f000..f016` / `ride_back_01..08` / `walk_side_f*`，顶层 `groups` 只有 `archer` / `ride` / `walk_side`。
  真原作 FORCE 图集在 web 侧：`game\web\anim\units.json`（43,991 B，MD5 `6A6E6446D98801626857A58233207E13`）+ `units_00.png`（823,403 B，1 页 **1024×3973**，572 帧，13 组 `podao/changqiang/dadao/archer/lianchui/feidao/wudou/manzu/tiechui/tengjia/huangjin/nu/nvbing`，每组 `back`(12) / `front`(12) / `attack`(10) / `attackEnemy`(10) + `hold`/`troop`/`letter`）。
  构建产物同证：`game\cocos-build\web-mobile` 里 grep `podao_walk` **0 命中**，只有 `archer_back_f` 那份旧图集 → 产物里根本没有 FORCE 帧。
- 代码层（改前）：`BattleRoot.ts:382-424` `loadUnitArt()` 只做两件事——`anim/atlas` 取 `walk_back_f%03d` / `walk_front_f%03d` 各 17 帧（`this.unitFrames`），`anim/units` 只取 `archer_back_*` / `archer_front_*`（`this.archerFrames`，给兵种 3/11 拉弓）。
  `drawUnitSprites()` 里 `isArcher = troop===3||troop===11`，其余兵种 A/B 两侧共用「A 走 back / B 走 front」这一对**同色**帧 → 两军自然长得一模一样。旧图集两套帧本身没有阵营语义，所以「换帧」在旧图集上无从谈起。
- 「红染」为什么不采用：web `game\src\view\unitFrames.ts` 的 `imgEnemy` 是 canvas `source-atop` 叠 `rgba(206,52,40,0.46)`（`game\web\main.js:570-572`），`project\63_士兵造型.md` §6.3 已记录它会把黄巾等偏黄兵种染成粉色。本分支**不叠任何 tint**。

### 1.2 改法

| 文件 | 改动 |
|------|------|
| `game\cocos\assets\scripts\UnitFrames.ts`（**新文件**，111 行） | 纯函数模块（不 import 'cc'，Node 里可直接跑）：`GROUP_BY_TROOP`（:41，troop 0..12 → podao/changqiang/dadao/archer/lianchui/feidao/wudou/manzu/tiechui/tengjia/huangjin/nu/nvbing，与 web `unitFrames.ts` 同源）、`unitGroupOf()`（:58）、`UNIT_HOLD = 5`（:34）、`hasForceSchema()`（:80，任一对象组带 `back`/`front` 数组才算 FORCE 版）、`pickUnitFrames(groups, troop, side, hasFrame?)`（:99，A→`back`，B→`front`；攻击帧 A→`attack`、B→`attackEnemy ?? attack`；纯数组组当缺组；帧名按 `hasFrame` 过滤保序） |
| `game\cocos\assets\scripts\ArtLayer.ts:310-346` | `loadUnitAtlas()` 回调签名扩成 `(frames, page, groups: Record<string,unknown>|null)`，从 json 顶层原样读 `groups`（非对象/数组 → null），失败路径也回调 groups |
| `game\cocos\assets\scripts\BattleRoot.ts:413-425` | `loadUnitArt()` 的 units 回调先判 `hasForceSchema(groups)`：是 → `this.forceAtlas = { groups, frames }` + 清缓存 + `console.log('[BattleRoot] 兵種圖集為原作 FORCE 版：按陣營取背視/正視幀（M 藍軍 / N 紅軍）')` 后 return；否 → 走原 `archer_back/archer_front` 老路 |
| `BattleRoot.ts:110-112` | 新字段 `private forceAtlas: { groups; frames: Map<string, SpriteFrame> } \| null`、`private forceCache = new Map<string, {walk, attack, hold}>()` |
| `BattleRoot.ts:726-741` | `drawUnitSprites()` 头部：`setOf(side)` = `forceSet(side, troop)` → 旧 `archerFrames`(3/11) → 旧 `unitFrames`（`side==='A'?back:front`，hold=3） |
| `BattleRoot.ts:749-791` | 帧相位 `phase = Math.floor(world.tick / Math.max(1, set.hold))`；A `phase % n`、B `(phase + 8) % n`（错开相位，同 web）；`h=general?72:52`，宽度按帧自身长宽比 |
| `BattleRoot.ts:798-822` | 新增 `forceSet(side, troop)`：按 `${side}:${troop}` 缓存，`pickUnitFrames(..., (name)=>force.frames.has(name))` → 帧名映射成 SpriteFrame；空则返回 null 走降级 |

**全程没有任何 `Sprite.color` / `tint` 调用**（可 grep：`BattleRoot.ts` 中无 `sprite.color` 赋值）。

### 1.3 代码级验证（不需要重建就能跑）

1. **单元测试**：把 `UnitFrames.ts` 编译成 CommonJS，用**真实** `game\web\anim\units.json` 跑 `work\cocos_battlevis\test_unitframes.mjs`：

```
troop group       walkA A[0]                B[0]                  Aatk[0]            Batk[0]
0     podao       12    podao_walk_00       podao_ewalk_00        podao_atk_00       podao_eatk_00
1     changqiang  12    changqiang_walk_00  changqiang_ewalk_00   ...                ...
...
12    nvbing      12    nvbing_walk_00      nvbing_ewalk_00       ...                ...
ALL PASS
```

断言覆盖：13/13 兵种两侧都有帧、A 全是 `{g}_walk_NN`、B 全是 `{g}_ewalk_NN`、A/B 帧集**互斥**、帧数等于 `back.length/front.length`、hold 取自组、帧名都在页里、未知兵种/空 groups/帧名全缺 → 返回 `null`（降级而不是抛）。

2. **像素级对照 harness**（真模块 + 真图集 + 浏览器 canvas）：`work\cocos_battlevis\units_mn.html`（三档 `?` 参数：默认=13 兵种 M/N 网格，`?zoom=1`=放大，`?old=1`=现 bundle 既有图集的实际帧），截图由 `steps_mn.mjs` 用 CDP 拍。
   - `work\cocos_battlevis\20_units_MN_harness.png`（750×1334）：13 行 × 2 列，左 A(M) 右 B(N)，行行不同色；页脚 `CHECK：13/13 兵種 M/N 幀集互斥、幀名全部帶 e 段 · 全數通過`。
   - `work\cocos_battlevis\21_units_MN_zoom3x.png`（750×1030）：長槍 / 弓兵 / 黃巾 / 刀兵 放大对照（左 M 右 N）。
   - `work\cocos_battlevis\22_cocos_current_frames.png`：**现 bundle** 里 A/B 实际会拿到的帧（`atlas.json` 的 walk_back/walk_front、`units.json` 的 archer_back/archer_front），可见旧图集不是「同一人两套颜色」，而是残缺/错位（`archer_front_f000` 那块区域画出来是一匹马）。

3. **量化对照**（`work\cocos_battlevis\measure_mask.py` + `measure_palette.py`，Pillow，对 `back[0]` vs `front[0]`）：

| group | ΔR | ΔG | ΔB | 更红像素 | 更蓝像素 |
|---|---|---|---|---|---|
| podao | -18.1 | +6.8 | +10.4 | 26% | 50% |
| changqiang | -6.3 | +16.4 | +4.3 | 34% | 36% |
| dadao | +14.9 | +7.3 | +15.5 | 31% | 44% |
| archer | +12.4 | +8.6 | +2.4 | 41% | 30% |
| lianchui | +6.0 | -13.7 | -2.1 | 41% | 38% |
| feidao | +55.1 | +41.3 | +9.6 | 51% | 20% |
| wudou | -42.8 | -3.2 | +10.5 | 15% | 62% |
| manzu | -7.1 | +14.8 | +25.6 | 21% | 66% |
| tiechui | +76.3 | +62.4 | +55.2 | 39% | 15% |
| tengjia | -11.3 | +3.3 | +30.7 | 9% | 51% |
| huangjin | +51.0 | +23.1 | -8.7 | 61% | 12% |
| nu | +2.4 | +7.1 | +6.5 | 36% | 37% |
| nvbing | -6.0 | +6.7 | +2.9 | 38% | 43% |

**这张表要 lead 知道的事实**：M/N 是**逐兵种换调色盘**，不是统一的「蓝军 → 红军」映射。`huangjin/feidao/tiechui` 的 N 明显更红，`wudou/manzu/tengjia` 的 N 反而更暗/更蓝。所以换帧能保证「两军一眼看出不是同一套兵」，但**不能保证每个兵种都一眼「红」**；要做到全军统一红只能靠染色，而染色已证会偏粉（project/63 §6.3），本分支按要求不做。若 lead 认为必须更红，正确做法是美术侧再出一套 N 调色盘（或加一层**非纯色**的调色映射），而不是 tint。

### 1.4 待 lead 做的一步（资源同步，我无权改 res/**）

```
copy F:\sanguo\game\web\anim\units.json     -> F:\sanguo\game\cocos\assets\bundles\res\anim\units.json
copy F:\sanguo\game\web\anim\units_00.png   -> F:\sanguo\game\cocos\assets\bundles\res\anim\units_00.png
```
（让 Cocos 重建时重新生成 .meta；旧的就是 AI 图集，直接覆盖即可）

风险点两条，重建后请先看：
1. 新页是 **1024×3973**，web-mobile 没问题；如果要出微信小游戏包，注意 2048 纹理上限会被裁，需要拆页。
2. 重建后控制台应出现 `[BattleRoot] 兵種圖集為原作 FORCE 版：按陣營取背視/正視幀（M 藍軍 / N 紅軍）`——这是「资源到位 + 代码走对分支」的一行判据；若没出现，说明 `groups` 没进 json 顶层或图集没被包进来。

---

## 2. 问题 2：两张主将不在画面上

### 2.1 根因（带 file:line，实测数据）

先排除掉三个「看起来像」的怀疑（都有实测反证）：

| 怀疑 | 实测 | 结论 |
|---|---|---|
| 世界坐标→投影 y 被裁 | 冻结帧 dump：A 侧 horse `py=-1271`（底边屏幕 y=1938）、body `py=-1227`；B 侧 horse `py=2038`（底边 -1371） | 不是「被裁」，是**压根在画布外**（画布高 1334） |
| `setPosition` 锚点算错 | `GeneralArt.place()`（`GeneralArt.ts:282-291`）公式 `y = HALF_H - (sy + h - oy)`，anchor=(0.5,0)（`makeLayer()` :54-68）→ 反推每一帧 `top/bottom` 与 bbox 完全自洽 | 锚点/公式没问题 |
| 被 `UnitSprites` 池盖住 / 层级在背景之下 | canvas 子节点 sib：`BattleHudBar 0 / Camera 1 / BattleBg 2 / AudioHost 3 / BattleBase 4 / UnitsA 5 / UnitsB 6 / Generals 7 / Fx 8 / UnitSprites 9 / GeneralArt 10 / BattleWeather 11 / Label×5 12-16 / ScreenTint 17` | 主将层在池之上，层级没问题 |

真根因链条：

1. `game\cocos\assets\scripts\core\battle.ts:583-597`：主将生成在**己方阵列最后一行之后 2 格**——`x = side==='A' ? maxX+2 : minX-2`，`y=6.5`，`isGeneral: true`。
2. `core\battle.ts:1410-1427` `camera()`：`half = 450 / ROW_PX ≈ 6.3`（`ROW_PX = 96*750/1008 ≈ 71.43`）→ **一屏只有 12.6 格纵深**；两军相隔 30+ 格时走 `cam = aMin - 2.6`（把我方前锋放在屏高约 65%）。
3. 于是开局两位主将的屏幕 y 分别是 **A 1542 / B -1816**（逐 0.5 s 采样：A 1542→1310(t≈4.5s)→929(t≈6.5s)→783；B -1816→-740→240→284）——**前 6 秒两人都在画布外**。
4. `GeneralArt.drawSide()`（改前 `GeneralArt.ts:178-225`）里**没有任何边界处理**：既没有 `BattleRoot.drawUnitSprites()` 那种 `p.y < FIELD_TOP-40 || p.y > FIELD_BOTTOM+40` 剔除（`BattleRoot.ts:754/769`），也没有贴边保护，所以「算出来在画布外」就真的画在画布外。

这也解释了 x7 的矛盾现象：`05_battle.png`（开局 4.5 s）一个主将都看不到，而结算时的 `07_general_A_zoom.png` / `08_general3_A.png` 里主将完整可见——**不是渲染坏了，是时刻不同**。web 版同理（`game\src\view\battleView.ts:585-593` 也是 ±80 剔除、`:728` `drawGeneral()` 无 clamp），只是 `work\final\battle.png` 那张恰好拍在两军接触的时刻（两位主将贴在战场带上下边缘）。

### 2.2 改法

| 位置 | 改动 |
|---|---|
| `GeneralArt.ts:211-241` | `drawSide()` 把 body/horse/weapon 收进 `parts[]`，先算 `clampShift(parts, p.x, foot)`，再统一 `place(..., sx+dx, sy+dy)`；死亡分支同样夹；成功后 `this.lastFoot[side] = {x: sx, y: sy}` |
| `GeneralArt.ts:249-275`（新） | `private clampShift(parts, sx, sy)`：按 `x ∈ [sx-ox, sx-ox+w]`、`y ∈ [sy-oy, sy+h-oy]` 求三層**并集 bbox**；`top < FIELD_TOP+4 → dy = FIELD_TOP+4-top`，否则 `bottom > FIELD_BOTTOM-4 → dy = FIELD_BOTTOM-4-bottom`；左右同理（pad=4，`DESIGN_W-4`）。**只平移不缩放**，马身/武器/身体相对位置与脚底关系不变 |
| `GeneralArt.ts:78 / 277-280 / 299-302` | 新增 `private lastFoot: Record<Side,{x,y}\|null>` + 公开 `footAt(side)`；`hideSide()` 清空 |
| `BattleRoot.ts:755-760` | 落地阴影圆心改用 `this.generalArt?.footAt(u.side)`（仅 `isGeneral` 且图集就绪时），贴边后影子跟人一起走，不会「人贴边、影留在阵里」 |

为什么选择「显示层贴边」而不是动 core：改 `camera()` 的 `half` 会改变整屏构图与两军接触节奏（web 版同源，动了就和 web 不一致），改主将生成位置会动阵形与战斗平衡。贴边只影响**画不出来的时候**，两军接近、真实位置回到带内后 shift 自动归零（实测 t≈9 s 时 A 仍余 -54 px，B 已 0）——原有构图与手感完全保留。

### 2.3 验证（产物仍是旧代码 → 用同公式运行时补丁取证）

产物不含我的改动，所以在页面里给**现网实例**打了一个与 `clampShift()` **代数等价**的补丁（`work\cocos_battlevis\steps_v1.mjs`）。等价性：`place()` 反解出 `sy-oy = 667 - node.y - h`、`sx-ox = node.x + 375 - w/2`，补丁用的就是这两个式子（`top = 667-py-h`、`left = px+375-w/2`），位移写回时 `node.x += dx`、`node.y -= dy`（Cocos y 向上）——与真代码逐项相同；阴影同样用 `footAt` 的语义补画。

实测（同一局，同一段战斗）：

| 时刻 | A 侧并集 bbox（top..bottom） | B 侧（top..bottom） | 贴边位移 |
|---|---|---|---|
| t≈1.0 s 补丁前 | 1763..1931（画布 0..1334，整只在下方场外） | -1546..-1159（整只在上方场外） | 无（`pin=null`）→ 画面上**一个主将也没有** |
| t≈1.5 s 补丁后 | 822..**996**（= FIELD_BOTTOM-4） | **104**（= FIELD_TOP+4）..278 | A dy=-935.2 / B dy=+1436.8，dx 都是 0 |
| t≈9.2 s 两军接触 | 821..996 | 144..320 | A dy=-54（仍有 54 px 贴边），B dy=0 → **自然回到真实阵位** |

截图（都在 `work\cocos_battlevis\`）：

- `11_battle_before_t1.png`（876×1368）：**修复前**——两军列阵，画面里一个主将都没有（复现 `05_battle.png` 的问题）。
- `12_battle_pinned_t1.png`（876×1368）：**同一个 tick 加贴边后**——敌将（红甲）在战场带上缘、我方主将（公孙瓒，蓝袍红帽）在下缘，两人都脚踩地面、马身完整、影子跟着贴边。
- `13_pinned_A.png` / `13_pinned_B.png`（600×600，2.5× 放大）：单个主将细节，可见马腿/马蹄着地、武器完整。
- `14_battle_pinned_t9.png`（876×1368）：t≈9.2 s 两军接触时——两位主将回到阵中真实位置（我方主将已基本不再贴边），证明钳制是「只在看不见时兜底」。

**待重建后复验**：产物重建后（新代码在 `GeneralArt.drawSide` 里直接做），上面 12/14 两张应当是**不做任何页面补丁**就出现的画面；复验时只要在 `t≈1.2 s` 拍一张、`t≈9 s` 拍一张对比即可，判定行是 `12` 里两个主将都在 FIELD_TOP..FIELD_BOTTOM 内。

---

## 3. 问题 3：出征屏 110 兵 vs 战场 60 兵

### 3.1 110 从哪来、60 从哪来

| 数 | 出处 | 含义 |
|---|---|---|
| **110**（本次实测；换城会变 145） | `DeployRoot.ts:278` `this.garrison = cityGarrisonTroops(data, 0, targetCity.NAME)` → `EnemyIntel.ts:185-199` 读 `garrison.json` | **城内守军/预备兵池总数**（原作 `city+0x82`/`+0x86`），按 `project\53_数据与配额.md` §1 / `docs\04b2` §4.2-4.3，**不直接上场** |
| 显示在 | 改前 `DeployRoot.ts:558`（目标行）与 `:584`（敌情行），两句都直接拼 `this.garrison` | 「守軍 110 兵」 |
| **60** | `DeployRoot.ts:906` `bsoldiers = clamp(round(intel?.troops ?? garrison/6), 1, 100)`，`:919` `bsoldiers: Math.max(60, Math.min(100, bsoldiers))` | 实际传给战场的 `launch.bsoldiers` |
| `intel.troops=60` 的来源 | `core\garrison.ts:520-523`：空城无守将 → `enemyTroops = Math.max(1, Math.round(mine * 0.6))`（我軍 100 → 60），`basis = 'estimate:我軍六成'`；`EnemyIntel.resolveEnemyIntel():148` 再 `clamp(round(...),1,100)` | 守備隊**折算兵力** |
| 战场侧有没有二次夹取 | `BattleRoot.ts:249` `soldiers: launch?.soldiers ?? 100`、`:260` `soldiers: launch?.bsoldiers ?? 100` | **没有**，60 全部来自 DeployRoot |

即：110 是「城里有几个预备兵」，60 是「这场战斗敌军上几个兵」，两码事，界面把前者当成了后者。

### 3.2 改法（统一到一个出口）

- `DeployRoot.ts:552-566` 新增 `private enemySoldiers(): number`：`clamp(round(intel.troops), 1, 200)`（200 = `battleSetup` 的 100 步 + 100 骑上限），无 intel 时退 `round(garrison/6)`；注释里写清原作口径与「110/145 不上场」。
- `DeployRoot.ts:574-576`：目标行（守城 / 出征两支）改用 `this.enemySoldiers()`。
- `DeployRoot.ts:597-603`：敌情行 `const troops = this.enemySoldiers()`。
- `DeployRoot.ts:925-926`：`const bsoldiers = this.enemySoldiers();`，loadout 直接写 `bsoldiers,`——**去掉 `Math.max(60, …)`**（这个下限以前只是恰好等于折算值，掩盖了口径错误）。

改哪边的理由：**统一到战场口径**（`intel.troops`）。①原作里上场的兵是守将带兵（`unit+0x58` 帶兵數+騎兵數），不是城内预备兵池；②`garrison` 是本作 `[新设计]` 的界面数字（web 时代就是「守军/6」的旧公式，`project\32` §5.2 自认），拿它当敌情会随城防规模乱跳（110/145/282）；③本城统一后仍为 **60**，平衡零变化，只是把界面上那个错数修掉。

### 3.3 验证

- 产物的 Deploy 屏实测（`steps_v1.mjs` dump，**改前**）：`garrison=110`、`intel={name:'守備隊', troops:60, fallback:true}`、`labelTarget="目標 易京 · 從 北平 出征 · 守軍 110 兵"`、`labelIntel="… · 守軍 110 兵 / 敵 黄巾·雁形 …"`、`hasEnemySoldiers=false` ← 产物里还没有新方法，正好证明这是**改前**的界面。
  截图：`work\cocos_battlevis\10_deploy_before.png`（出征屏「守軍 110 兵」）。
- 重建后同一处应显示 **60**，且与 `05/12` 里 B 侧 `start=60` 一致。**待重建后复验**（判定：Deploy 屏两个数字都等于战斗里 `world.sides.B.start`）。

---

## 4. 改动清单（全部在 `game\cocos\assets\scripts\`）

| 文件 | 行 | 内容 |
|---|---|---|
| `UnitFrames.ts` | 新增 111 行 | FORCE 取帧契约（见 §1.2） |
| `ArtLayer.ts` | 310-346 | `loadUnitAtlas` 回调加 `groups` |
| `BattleRoot.ts` | 43-44 / 106-112 / 413-425 / 654 / 726-741 / 749-791 / 798-822 | FORCE 帧集接入、按 side 取帧、阴影跟随贴边主将 |
| `GeneralArt.ts` | 78 / 211-241 / 243-275 / 277-280 / 299-302 | `clampShift` 贴边 + `footAt` |
| `DeployRoot.ts` | 552-566 / 574-576 / 597-603 / 925-926 | `enemySoldiers()` 统一口径 |

`tsc -p tsconfig.check.json --noEmit` → **exit 0**。
未改：`game\web\**`、`game\src\**`、`bundles\res\**`、`settings\**`、`tools\**`、`project\37a|31|44`。

## 5. 复验脚本与产物（都在 `work\cocos_battlevis\`）

| 文件 | 用途 |
|---|---|
| `steps_v1.mjs` | Campaign→敌城→出征→Deploy dump+截图→Battle 前后对比（贴边补丁）+ 裁剪 |
| `steps_mn.mjs` | M/N 帧集 harness 三档截图 |
| `units_mn.html` | harness 页面（真模块 `_ts/esm/UnitFrames.js` + 真图集） |
| `test_unitframes.mjs` | 取帧契约单测（ALL PASS） |
| `measure_palette.py` / `measure_mask.py` | M/N 调色盘与 silhouette 量化 |
| `inspect_atlas.mjs` | 任意 atlas json 的 pages/groups 汇总 |

用法（`cdp.mjs` 在 `work\cocos_verify\`）：

```powershell
$env:OUTDIR='F:\sanguo\work\cocos_battlevis'; $env:PORT='9333'; $env:PROFILE='F:\sanguo\work\.edgeprof_bvis'
node work\cocos_verify\cdp.mjs launch
node work\cocos_verify\cdp.mjs run work\cocos_battlevis\steps_v1.mjs
node work\cocos_verify\cdp.mjs close
```
（harness 需要仓库根静态服务：`python -m http.server 5180 --directory F:\sanguo`，因为 5173 的站点根是 `F:\sanguo\game`。）

## 6. 没验证到的部分（明确标注）

1. **游戏内红军**：需要 lead 同步 FORCE 图集并重建；在此之前只有 harness 与单测证据（§1.3）。
2. **重建后的新代码实拍**：主将贴边、Deploy 兵力数字都是「同公式补丁 / dump」取证，产物本身未含改动（§2.3、§3.3）。
3. **FORCE 帧在 52px 高度下的观感**：单帧 ~75×74，压到 h=52 后与旧 80×104 帧的视觉体积不同（更瘦），重建后建议整屏看一眼是否要微调 `h`。
4. **微信小游戏包**：1024×3973 的图集页在 2048 纹理上限平台上会被裁，本轮未验证。
