# 114 Cocos 美术收尾（bg/env 台账 · 零引用清理 · 内政页接缝）

> 2026-11-25 · agent `cocos-art-final`（父 `lead`）
> 授权范围：`ArtLayer.ts`、`CityPanel.ts` 美术行、`bundles\res\`（只准删）、`work\cocos_art_final\`、本文件。
> 未跑 CocosCreator / `tools\build_wechat.ps1`（构建归 lead）⇒ 所有包体数字是**推算**，已标 `[推测]`。

## 0 给 lead 的三行

1. **删干净了**：`assets/bundles/res/` 移出 **42 档资源 / 2,919,544 B**（`fx/` 41 档 + `audio/index.json`），删 1 个孤立 `bg/env.meta`；全工程**引用 0**（`refs.mjs` + `grep` 双证）。包体 **19.35 MB → 约 16.57 MB**（−2.78 MiB），20 MB 配额余 **3.43 MB** `[推测]`。
2. **`bg/env` 该走**：31 档全是云端 AI 文生图（`project/40_云上补景与UI.md:33-36` 的 job 表：terrain ×12 / hall ×6 / ui_* ×13），**从未进包**，仍在 `cocos-park\res\bg\env`；唯一历史引用点 `CityModel.hallImageOf()` 是死代码（0 调用），但 `game\tests\city_rules.test.ts` 钉了它的返回字符串 ⇒ 补丁见 §7.1。
3. **观感**：内政页 y=562 朝堂/地面硬边压成渐层（`CityPanel.ts:329-342` / `344-367` / `:376` / `:631`），暴露列跨缝 mean|ΔL| **8.61–36.11 → 0.85–3.32（−88%）**；战场 HUD 边距**没改**（`BattleRoot.ts` 不在授权）⇒ 只给 4 个补丁候选（§7.2）。

## 1 台账：`bg/env` 到底还该不该留

| 结论 | 依据 |
|---|---|
| `bg/env` 在 **bundle 里根本不存在**（只有孤立 `bg\env.meta` 169 B，已删） | `refs.mjs` 目录表无 `bundle:bg/env`；`bundles\res\bg\` 下只剩 3 张 PNG |
| 31 档（`hall_01..06.jpg` / `terrain_00..11.jpg` / `ui_*.png`）= 1 张云上 AI t2i 批次 | `project/40_云上补景与UI.md:14` 「入库 31 个文件 2.59 MB」、`:33-36` job 表（seed 3100–3315，832×1216 / 512² / 1024×256） |
| web 端已弃用、Cocos 侧 0 引用、`hallImageOf()` 死代码 | `project/73_Cocos美术复位.md:84`、`project/31_还原清单.md:142`、本轮 `refs.mjs` |
| 现在替它的是原作图：大殿用 `bg/policy/palais_0N`，战场底图用 `bg/orig/{bg,fg,mg,floor}NN` | `CityPanel.ts:327-328`、`BattleBg.ts:78` |

**判定：全部「零引用 / 未进包」**。它不占包体，只占仓库与同步体积 ⇒ 建议 lead 直接永久删（可逆：本轮没动它，仍原样在 park）。

## 2 台账单（四类，字节 = 非 `.meta` 实际字节）

### 2.1 原作图元（已进包，9,313,424 B = 分包 60.6%）

| 目录 | 档 | 字节 | 引用点 | 说明 |
|---|---|---|---|---|
| `anim/` | 4 | 1,032,910 | `BattleRoot.ts:393/417`、`UnitFrames.ts` | `atlas.json`+`atlas_00.png` 原作帧图集；`units.json`+`units_00.png` 原作 FORCE 士兵图集（`project/90_士兵图集重打包.md:3` 2048×1730 重打包，逐帧 SHA256 相同） |
| `anim/general/` | 33 | 1,766,345 | `GeneralArt.ts:106`、`ArtLayer.ts:472` | 武将动作图集 |
| `bg/orig/` | 48 | 2,558,605 | `BattleBg.ts:78` | 12 地形 × bg/fg/mg/floor |
| `bg/policy/` | 10 | 387,056 | `CityPanel.ts:327-328` | 原作 PALAIS 5 张转 webp（640×480）+ 预烘 `floor_0N` 5 张（750×318） |
| `face/`（index+full+thumb） | 801 | 1,987,174 | `ItemsPanel.ts:1046/1084`、`Portrait.ts:485` | 100×120 / 30×40，与 `project/01_竖屏UI与交互方案.md:511` 记的原作 FACE 同规格 `[推测：按原作记，未逐张比对]` |
| `items/` | 57 | 140,393 | `ItemsPanel.ts:233` | 道具图标 |
| `map/` | 6 | 1,440,941 | `CampaignRoot.ts:353/556/562` | `chinamap` 1,434,685 + `city_1..4` + `point` |

### 2.2 AI 图元（还在包里、还在用，3,814,386 B = 24.8%）

| 目录 | 档 | 字节 | 为什么还在用（引用点） | 出处 |
|---|---|---|---|---|
| `hero/` | 400 | 2,790,538 | 武将立绘：出征编成 `DeployRoot.ts:971`、头像回落链 `Portrait.ts:485`、`ItemsPanel` 第三级 | `project/00_立项书.md:111` 「立绘 Qwen 出图 + 人工精修」 |
| `bg/map_bg.png` | 1 | 599,443 | **只剩物品页** `ItemsPanel.ts:468`（大地图侧已停用，`CampaignRoot.ts:329` 注释为「已停用」） | `project/17_底图与版式.md:47` AI 重绘 |
| `bg/deploy_bg.png` | 1 | 300,989 | 出征编成底图 `DeployRoot.ts:378` | `project/17_底图与版式.md:49` AI 重绘 |
| `bg/hud_bar.png` | 1 | 123,416 | 战斗 HUD 顶条 `BattleRoot.ts:386` | `project/17_底图与版式.md:51` AI 重绘 |

### 2.3 已删 / 已移（零引用，42 档 2,919,544 B）

| 项 | 档 | 字节 | 落点 | 证据 |
|---|---|---|---|---|
| `fx/atlas_*.png` | 40 | 2,889,846 | `cocos-park\res\fx\` | `refs.mjs` 41 行 `refFiles=0`；Cocos 的「技能特效」是 `BattleRoot.ts:352` `makeGraphics('Fx')` + `:827-832` 现画，与这套图集无关 |
| `fx/index.json` | 1 | 25,758 | 同上 | 无任何脚本读它 |
| `audio/index.json` | 1 | 3,940 | `cocos-park\res\audio\` | 运行期只用逻辑名直拼 `audio/bgm|sfx`（`AudioBus.ts:128`），没人读 index |
| 孤立 `bundles\res\bg\env.meta` | （meta） | 169 | **直接删** | 目录早不存在，meta 是残留 |
| 随迁 `.meta` | 42 | 39,518 | 与资源同落 park | meta 不进包，只是跟着走 |

- 完整逐档清单：`work\cocos_art_final\prune-log.json`（85 条，含字节）。
- 移走而非删除 ⇒ 想回滚就把 `cocos-park\res\fx\*` 拷回 bundle。

### 2.4 待定（需要 lead 拍板）

| 项 | 字节 | 建议 |
|---|---|---|
| `bundles\res\manifest.json` | 65,342 | 包内唯一零引用档；它是给人/工具看的资源清单（totalFiles 564），删了包再小 64 KB，但外部脚本可能在读 ⇒ 保留或改由 `refs.mjs` 生成 |
| `cocos-park\res\bg\env\` 31 档 | 2,716,537 | 永久删（不占包体，纯 AI、web/Cocos 双端弃用） |
| `cocos-park\res\bg\policy\` 6 档 | 2,224,295 | 5 张 palais PNG 备份可删；`palais_yield.png` 393,616 **零引用**，可删 |
| `cocos-park\res\anim/general\` 36 档 / `map\` 7 档 | 5,613,774 / 1,680,865 | 进包子集之外的备份，留作回滚即可 |
| `cocos-park\res\fx\` 41 档 | 2,915,604 | 本轮移出的，回滚用；确认不需要就删 |

### 2.5 字节账 & 包体推算

| 口径 | 字节 | 说明 |
|---|---|---|
| 删前 bundle 非音频 | 17,955,885（17.12 MiB） | 与 `project/44_交接简报.md:106` 的分包 17.21 MB 对得上 `[推测]` |
| 本轮移出 | −2,919,544（2.78 MiB） | 42 档资源 |
| 删后 bundle 非音频 | **15,040,281（14.34 MiB）** | 原 9,313,424 + AI 3,814,386 + 非美术 1,912,471 |
| 包体 | 19.35 MB → **约 16.57 MB** | = 主包 2.14 + （17.21 − 2.78）；20 MB 配额余 3.43 MB |
| 若再删 `manifest.json` | −64 KB | 15,040,281 → 14,974,939 |

> 音频 16,855,211 B（`bgm` 14,027,541 + `sfx` 2,823,730 + `audio/index` 3,940）本来就被 `tools\build_wechat.ps1` 按扩展名剔除，不计入包体。

## 3 观感改动①：内政页 y=562 朝堂/地面接缝（已改）

### 3.1 病灶（实测，不是观感词）

`palais_0N.webp` 640×480 经 cover 到 750×562（scale 1.1719），`floor_0N.webp` 750×318 1:1；两者**不同源**（floor 是平色渐变板，不是 palais 底列模糊）。整页合成后跨接缝两行亮度差：

| 档 | 改前 mean\|ΔL\| | 改前 max | 改后 mean\|ΔL\| | 改后 max | 降幅 |
|---|---|---|---|---|---|
| palais_01 | 10.00 | 24.66 | 1.83 | 3.79 | −82% |
| palais_02 | 9.58 | 45.65 | 0.85 | 5.21 | −91% |
| palais_03 | 36.11 | 118.27 | 3.32 | 11.13 | −91% |
| palais_04 | 27.36 | 45.18 | 3.30 | 6.35 | −88% |
| palais_05 | 8.61 | 23.88 | 1.87 | 2.99 | −78% |

平均降幅 **87.8%**（最差档 36.11 → 3.32）。指标 = `|L(563) − L(561)|`（L = 0.2126R+0.7152G+0.0722B），只统计**暴露列**。

> **诚实说明**：y=562 这条线上 92% 的宽度被 `R_CMD` 的 9 个按钮（alpha 212）盖住，几何上只有 60 px 宽的暴露列（x 0..17 / 248..259 / 490..501 / 732..749）能全量看到接缝；上面的数字和 `ev_seam_*.png` 都是在这 60 px 上量的。

### 3.2 改法（`game\cocos\assets\scripts\CityPanel.ts`）

| 位置 | 内容 |
|---|---|
| `:133-145` | 新增 `const SEAM_Y = 562;` 与 `const SEAM_TINT: string[] = ['#351910', '#210F05', '#3D150C', '#46210F', '#3D1706'];`（= 各档 `floor_0N` 顶 6 列均值实测色） |
| `:199` | 字段 `private artSeam: Graphics | null = null;` |
| `:329-342` | `buildArt()` 末尾建 `CityHallSeam` 节点（UI_2D、750×1334、`Graphics`、`setSiblingIndex(2)`）：**在两张美术之上、`CityPanelBg`（后建）之下** ⇒ 面板会盖住它，与真实叠层一致 |
| `:344-367` | `paintSeam(palais)`：`clear()` 后上 56 行 / 下 32 行逐行 1px 矩形，alpha = `round(236·t²)`（二次曲线，两端更柔） |
| `:376` | `applyHall()` 里 `this.paintSeam(palais);`（`palais` 已知，不依赖图片加载完成） |
| `:631` | `drawMain()` 里 `if (this.artSeam) this.artSeam.node.active = artReady;`（图没到就整条关掉，不留褐色带） |

### 3.3 证据

- `work\cocos_art_final\seam_metrics.txt` —— 上面那张表的原文（脚本 `seam_metrics.py`，与 TS 实现逐行等价：整数 alpha、1px 矩形）
- `ev_before_N.png` / `ev_after_N.png` —— 750×1334 整页合成（按 CityPanel 版面 + 全部面板 alpha）
- `ev_seam_N.png` —— y=470..660 放大带，上=改前、下=改后
- `view_3_half.png` / `view_4_half.png` —— 半尺寸整页观感

## 4 观感改动②：战场 HUD 边距（**未改**，`BattleRoot.ts` 不在授权）

- 现状：`BattleRoot.ts:382` `new ArtBg(this.node,'BattleHudBar',{x:0,y:0,w:DESIGN_W,h:100})`，**没传 `cover` 参数**（默认 false）；`bg/hud_bar.png` 是 1024×256 = 4:1，被硬拉到 750×100 = 7.5:1 ⇒ 横向 ×0.732、纵向 ×0.391，**纵向压到 53%**（顶条上的纹样被压扁）。
- 另外 `:385` 的 `opacity.opacity = 150` + `:515` 的 `fillScreenRect(...,186)` 让顶条偏灰，属故意压淡，未计问题。
- 四个候选（给 lead 挑，都在 `BattleRoot.ts`，改动均 ≤3 行）：

| # | 改法 | 效果 | 代价 |
|---|---|---|---|
| ① | 第 4 参传 `true`（走 cover） | 比例正确（0.732 等比），但 1024×256 盖 750×100 会裁掉上下 ~47% | 最简单，可能切掉金边 |
| ② | rect 改 `{x:0,y:-44,w:750,h:188}` | 4:1 近似成立（750×187.5），超出屏幕的部分自然裁掉 | 顶条露出的内容变多，要与 `:515` 的 186 压暗一起调 |
| ③ | 重出 750×100 的图 | 无损、比例对 | 要新图（作者不是 Cocos 侧） |
| ④ | 改 HUD 版式（顶条改 44 或 56 高） | 与 4:1 天然贴合 | 动到版式常量，影响 `:515` 与血条位置 |

**我为什么没做**：`BattleRoot.ts` 明确不在授权清单里，且改它会动到 `cocos-monarch-ui` 侧正在跑的 HUD 相关行，冲突风险高于收益。

## 5 验证（都没问题）

| 项 | 结果 |
|---|---|
| `cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` | **EXIT=0**（改完 `CityPanel.ts` 后复跑） |
| `work\cocos_art_final\refs.mjs` 引用普查 | bundle 1,488 档 / park 122 档；**零引用 74 行** = `bundle manifest 1` + `park 73`（`bg/env` 31 + `fx` 41 + `audio/index` 1） |
| 删掉的路径在 scripts 里 | `fx/*`、`audio/index` 前缀 **0 命中**；残留命中全是注释（`audio/sfx/...` 含子串、`core/audio_bus.ts:528` 讲 web 的 index.json、`CityModel.ts:402-405` 死代码本身） |
| 场景/预制体侧隐藏引用 | 4 个 `.scene` 的 `"__uuid__"` 引用数 **全 0** ⇒ 资源全靠代码按路径寻址，删档不会断预制体 |
| 回滚 | `cocos-park\res\fx\*` + `prune-log.json` |

## 6 `refs.mjs` 跑法（每个资源 → 引用文件数）

```powershell
cd F:\sanguo
node work\cocos_art_final\refs.mjs           # 全量：扫 44 个 .ts，抽路径前缀片段，前缀匹配资源键
```
输出：`work\cocos_art_final\refs.tsv` —— TSV，列 = `root / key / bytes / refFiles / files`（1,610 行 = 每档资源一行），末尾再打「目录汇总表 + 零引用列表」。
- 模板字面量会先按 `${...}` 切成片段再匹配（`bg/policy/palais_${tag}` ⇒ 前缀 `bg/policy/palais_`），所以拼接式加载不会漏。
- 判定旧档「零引用」时它已经跑过：`fx/` 与 `audio/index` 全部 `refFiles=0`。

## 7 需要别人动手的补丁（我的授权外）

### 7.1 `CityModel.hallImageOf()` 死代码（+ 一条测试）

现状 `game\cocos\assets\scripts\CityModel.ts:402-406`：

```ts
/** 背景檔名（city.html 的 CSS 變數；Cocos 側對應 `bg/env/hall_0N`） */
export function hallImageOf(cityDef: CityDef | null | undefined): string {
  const n = hallIndexOf(cityDef);
  return `assets/bg/env/hall_0${n}.jpg`;
}
```

- 全工程 **0 调用点**（`refs.mjs` 与 `grep` 双证；`grep` 只命中自身 + 构建产物 + `game/web/**`）。
- 但 `game\tests\city_rules.test.ts` 钉了字符串：`assert.equal(M.hallImageOf({ RATE: 3 }), 'assets/bg/env/hall_03.jpg');`
- **补丁（推荐 A，删干净）**：
  - A1 删 `CityModel.ts:402-406` 整段（含注释）；
  - A2 删 `game\tests\city_rules.test.ts` 里那一行 `assert.equal(M.hallImageOf(...))`；
  - A3 `game\web\city_model.js` / `.d.ts` 同步（web 侧仍留同名导出，不影响 Cocos，但保持单一真相源）。
- **补丁 B（若不想动 tests）**：把返回改成实际在用的路径，并同步断言：

```ts
/** 背景檔名：原作 PALAIS（bg/policy/palais_0N）；6 回 1，与 CityPanel.applyHall() 同口径 */
export function hallImageOf(cityDef: CityDef | null | undefined): string {
  const n = hallIndexOf(cityDef);
  return `bg/policy/palais_0${n === 6 ? 1 : n}`;
}
```
  - 断言改 `assert.equal(M.hallImageOf({ RATE: 3 }), 'bg/policy/palais_03');`
  - 注意：`bg/policy` 是 **bundle 内**路径，`assets/` 前缀要去掉（Cocos 侧按 bundle 键寻址）。
- **补丁 C**：把 `hallIndexOf`/`hallImageOf` 一起删（`hallIndexOf` 仍被 `CityPanel.ts:371` 用，不能删 `hallIndexOf`）。

### 7.2 战场 HUD 边距

见 §4 的 4 个候选；`BattleRoot.ts:382`（图）与 `:515`（压暗）是同一个顶条，改一处要看另一处。

### 7.3 `bg/map_bg.png` 599,443 B 的下家

`CampaignRoot` 侧已停用，只剩 `ItemsPanel.ts:468` 一张底图。若 lead 要再挤 0.6 MB：物品页底图可改用 `map/chinamap`（已在包）或纯色 + `addVeil`，改动只在 `ItemsPanel.ts:465-469`（不在我授权内）。

## 8 `[推测]` 清单

1. 包体 16.57 MB 是「19.35 − 2.78」的推算；分包里除 `res/` 还有 settings/scene 等 JSON，实际值可能差 ±0.1 MB。
2. `fx/` 之前**确实在包里**：`manifest.json` 列了 `fx`（40 页 / 索引口径 3,735,590 B），且 Creator 默认按 bundle 目录整包打；我没跑构建验证。
3. `face/` 801 档按「原作」记账，依据只是尺寸与原作 FACE 同规格（100×120 / 30×40）；未与 `art_ref` 逐张比对。
4. `hero/` 400 张记为 AI 图元，依据是立项书的「立绘 Qwen 出图 + 精修」口径，非逐张溯源。
5. 删 `fx/` 不影响战斗特效：特效由 `BattleRoot.ts:827-832` 用 Graphics 现画（`if (fx.kind === 'heal') continue;`），这套图集从未被接线——`grep` 0 命中支持这一点，但没跑真机确认画面。
6. `bundle\res\manifest.json` 是否被外部脚本读，未全仓验证（只确认 bundle 内 0 引用）。

## 9 没做到的

1. **没跑构建**（授权禁止）⇒ 包体、是否需要重新导入资源、微信 IDE 是否报错，都要 lead 出包时验。
2. **战场 HUD 边距没改**（`BattleRoot.ts` 不在授权），只给了 4 个候选。
3. **`hallImageOf()` 没改**（`CityModel.ts` + `game\tests` 不在授权），只给了补丁。
4. **观感证据是 Pillow 合成图，不是引擎截图**（不能起 CocosCreator）⇒ 颜色/叠层按代码逐层复现，字体渲染差异不在图里。
5. 只做了 1 处观感微调（接缝）；第二处「HUD 边距」被授权卡住，等于只完成了 1/2。
6. `cocos-park\res` 里其余零引用备份（`palais_yield.png` 393,616 等）没删：授权只允许删 bundle 内的档。
7. 未评估 `hero/` 400 张（2.79 MB）的压缩空间——那是包体最大单一 AI 块，但换格式/降分辨率属资源重制，超出「只准删」的授权。
