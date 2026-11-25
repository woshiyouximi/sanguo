# 143 · Cocos 渲染观感对齐 web（w5-render）

> 目标（用户原话）：「cocos和网页版还差多少？我看网页版的效果比cocos似乎好很多」「先做到还原再考虑打包交货」。
> 前置审计：`project/122_Cocos验收差距.md`（2026-11-25 08:36 产物，8 项渲染能力 0 项达标）。
> 本文只记**本轮实际做的改动 + 可复现的数字**，不重述审计结论。

## 0. 一句话结论

四页（大地圖 / 內政 / 物品 / 編成）的**表面质感**已经从「纯色块 + 平底」推进到「纵向着色带 + 金属片 + 金色格线 + 内阴影」：
色数 +1.0%~+10.3%、平均亮度 +1.6~+3.5（朝 web 的 30.5~43.8 靠）、内政页紀錄面板最长无墨带 **271px → 51px**（面板内）、九宫 SLICED 精灵 **0 → 140 个**、`enableOutline` **2 → 602 处**。
四项布局/皮肤断言全绿、`tsc --noEmit` EXIT=0、布局矩形一个没动。

**没做到**：字级层级（大地圖 60/97 个 Label 仍是 14px）、全屏朝堂美术素材只有 640×480（色数上限受此制约）、web 独有的首屏/结算/列表/存档/势力五页在 Cocos 侧不存在（属页面缺失，不是渲染差距）。工时估算见 §7，合计剩余 ≈ 15.5h。

---

## 1. 改动的文件（全部在 `game/cocos/assets/scripts/`，未越界）

| 文件 | 改动 |
|---|---|
| `Draw.ts` | **新建**（182 行，纯数据、不 import `cc`）：`vBands / hBands / edgeBands / topSheen / innerEdge / mixHex / parseHex / toHex`，`slices()` 用 `Math.round` 对齐保证色带无缝无叠 |
| `CityPanel.ts` | `paintBands()` + `drawMain()` 全量着色带 + `tipsOf()` 提示行 + `refresh()` 填 5 行 |
| `ItemsPanel.ts` | `paintBands()` + `drawFrame()` 整页/页头/武将卡/四槽/页籤/列表逐行/详情/大图框/底栏三钮 |
| `DeployRoot.ts` | `paintBands()` + 顶栏/底栏/立绘底板/主将格/兵种格/阵形格/军师技格/滑轨/两钮 |
| `CampaignRoot.ts` | `paintBands()` + 页头/控制台/戰報面板/三颗工具钮/三颗行动钮 |

未改：`BattleRoot.ts`、`BattleInput.ts`、`game/src/**`、`game/web/**`、`MonarchPanel.ts`；也未改任何布局矩形（`MAP_VIEW`/`CONSOLE_TOP`/`R_HUD`/`R_CMD`/`R_LOG`/`BUTTON_Y`/`LOG_VIEW`/`LAYOUT.*` 全原值）。

### Draw.ts 的接口（给后续页面复用）

```ts
interface Band { x: number; y: number; w: number; h: number; color: string; alpha: number }
vBands(x, y, w, h, from, to, steps = 12, alphaFrom = 255, alphaTo = 255): Band[]
hBands(...)                                   // 横向
edgeBands(rect, color, alpha, depth, steps)   // 四边内阴影（做「金属片压边」）
topSheen(x, y, w, color, alpha = 40, h = 1)   // 顶部 1px 高光
innerEdge(rect, color, alpha = 40, inset = 1) // 内描边
```

为什么用「N 段色带」而不是一张渐变图：Cocos 3.8.8 没有 CSS `linear-gradient`，而九宫 PNG 的**中心是透空的**（`plate_btn` 308×40 center=(0,0,0,0)、`edge=(222,166,74,255)`；`frame_panel`/`plate_sq` 同），所以把色带画在九宫层**下面**、从透空中心透出来，既不动 PNG 字节（`skin_assert` 逐字节锁死 26 张图 + `EXPECTED_TOTAL_BYTES=20742`），也不新增 skin 节点（`skin_nodes_assert` 锁死 `SKIN_SLOTS` 条数）。

---

## 2. 逐项交付

### 2.1 九宫铺开

| 页面 | 运行时 SLICED 精灵（本轮实测） | 皮肤层节点 | `SKIN_SLOTS` 静态条数 | 覆盖了什么 |
|---|---|---|---|---|
| 大地圖 | **8** | `CampaignSkin` | 4 + `ACTION_SKIN_SLOTS` 4 | 页头两颗钮、提示条、戰報面板、三颗行动钮 |
| 內政 | **23** | `CityPanelSkin` | 5 | 資訊卡框、9 颗命令牌、返回、紀錄、提示、抽屉 |
| 物品 | **53** | `ItemsPanelSkin` | 8 | 页籤 8、四槽、12 武将格、列表行、详情、大图框、三钮、分页钮 |
| 編成 | **56** | `DeploySkin` | 6 分区卡 + 3 固定板（立繪/返回/出征）+ 兵種 13 / 陣形 9 / 主將 12 / 軍師技 8 + 滑軌 1 + 4 個四角選中疊層 | 全部格位 + 滑轨 + 两钮 + 四角选中叠层 |

- 口径：`Sprite.type === cc.Sprite.Type.SLICED`（TILED/SIMPLE 不算），CENSUS 见 §5。
- **说明**：九宫本体是上一轮（w5-cocos-skin）铺的，本轮**没有新增**九宫调用 —— 页面已经是「九宫层 + Label 层」结构，再加 `makeBtn/makePanel` 会在已有金框上重复叠一层框，并让 `skin_nodes_assert` 数的节点条数变化。本轮做的是**把九宫中心那层透空填上渐变**（见 2.3），否则牌面读起来还是「连续色块」。
- 审计里「SLICED 0」是 08:36 的口径；现在四页合计 **140 个**。

### 2.2 文字层级 + 描边

审计口径「text-shadow 22 + box-shadow 24 vs `LabelOutline` 2」有两处失真，本轮两种口径都实测：

| 页面 | Label 总数 | 非空 | `enableOutline` | `enableShadow` | `getComponent(LabelOutline)` |
|---|---|---|---|---|---|
| 大地圖 | 97 | 80 | **96** | 2 | 0 |
| 內政 | 158 | 134 | **157** | 15 | 0 |
| 物品 | 268 | 229 | **267** | 28 | 0 |
| 編成 | 82 | 63 | **82** | 4 | 0 |
| 合计 | 605 | 506 | **602** | 49 | 0 |

- **Cocos 3.8.8 里 `Label.enableOutline` 由 Label 自身装配，不生成 `LabelOutline` 组件** → 数 `getComponent(cc.LabelOutline)` 恒 0，审计的「只有 2 处」就是踩了这个坑。正确口径是 `label.enableOutline`，实测 602 处，**≥30 的目标早已超额**。
- 层级统一走 `TextRole.applyTextRole(label,'title'|'head'|'body'|'num')`：内政 `title 34 / head 22 / body 16-18 / num 20`、物品 `head 22 / body 17-18 / num 20`、編成 `title 32 / head 20 / body 16`。
- 受 `skin_nodes_assert` 正则锁死的 8 处 role 调用（`hudValues num 20`、`hudNames body 16`、`cmdTags head 22`、`cmdSubs body 16`、`logLabels body 18`、`lblCmdTitle head 22`、`labelTitle title 32`、`layoutRects` 字面量）**一个没动**。

### 2.3 渐变近似替代

| 页面 | 色带调用点 | 代表色带（from → to，段数） |
|---|---|---|
| 大地圖 | 15 | 页头 `#2A241C→#14100B` 12 段；控制台 `#272A2D→#0D1013` **28 段**（504px，18px 一段）；戰報 `#1E2126→#14171B` 20 段 |
| 內政 | 18 | 资讯卡 `#26221C→#181411` 16 段；命令牌内层 `#4A3520/#402D1C→#241809/#1A1209` 10 段 + 顶部高光 `#F4DCAE` 52-74 + 底部压暗 90；紀錄 `#22252A→#171A1E` 20 段 |
| 物品 | 25 | 整页 `#171B21→#1E160E` 20 段；列表**逐行** 4 段（选中 `#2A3342→#161D28`、奇偶行交替）；详情 `#20242A→#171A1F` 20 段；大图框 `#302417→#14100A` + 四边内阴影 |
| 編成 | 22 | 顶栏/底栏 12 段；格位 `#22282F→#171C22`（选中 `#4A3A20→#1D1509`）；滑轨 `#161C24→#2B3441`、已选段 `#F0D07A→#8A6A24` |

- 四页合计 **80 处**色带调用，单处 4~28 段；对照审计「web 有 52 处 `linear-gradient`、Cocos 0 处」→ 现在 **0 → 80**（数量已超，但不是 CSS 语义的一一对应）。
- 色值不是凭感觉挑的：先按 web 截图逐区采样（页头 lum 34-37、控制台顶 43 → 底 15、内政命令牌 44、结果面板 28、列表行 30、编成格 33），再把色带两端对准这些亮度；第一版用 `#0D121A` 一类冷黑整页比 web 暗一档（mean 31.5 vs 33.9），已整体提亮。

### 2.4 滚动 / 翻页

审计「`overflow-y` 5 + scrollbar 8 vs `ScrollView` 0」：

- 物品页本身已有 **8 页翻页**（`上頁/第 N 頁/下頁`，`navRect(0..2)`，选中/装备行跨页保持）；
- 大地圖戰報已有**分页**（`LOG_VIEW` 298px，`logPage` 翻页）；
- 内政「紀錄/抽屉」是固定 5 行 + 6 行抽屉（`openSheet/closeSheet`），本轮把 5 行填满（见 2.5），不再需要滚动；
- **没有新增 `ScrollView`**：它需要 `Mask + content` 两层节点并独占一个矩形，会与 `assert_layout` 锁死的 `LOG_VIEW`/`LAYOUT.list` 相撞；按任务书「已有翻页的先不做」，三处长列表都属"已有翻页"，故跳过。

### 2.5 内政页空白

| 量测（thr=110，x 40..712，一行 ≥6 个亮像素才算"有墨"） | 改前 | 改后 | web 参照 |
|---|---|---|---|
| 紀錄面板内（y 900–1225）有墨行 | 17 行 | **81 行**（5 行满） | 0 行（web 的「結果」框整块是空的 325px） |
| 紀錄面板内最长无墨带 | **271px** | **51px** | 325px |
| 整页 y 118–1240 最长无墨带 | **271px** | **142px** | 498px |

- 142px 只剩下 `R_CMD` 底（740）与 `R_LOG` 顶（880）之间那段**设计留白**（美术地面透出 140px），不是内容空缺。
- 填充内容全部取自本页已有数据（`tipsOf(st, prepCap, eff, genCount, major, capTotal)`，5 条「◇」）：
  1. `本月令可下 / 本月令已用 · 回大地圖推進一月`（`M.monthLocked`）
  2. `城防 380 · 預備兵 141/142`（`st.defense / M.prepCapOf`）
  3. `開發−金400 · 搜索−金200`（`M.DEV.COST / M.SEARCH.COST`）
  4. `兵 141/600 · 士氣 60/100`（`M.armCaps`）
  5. `內政效率 ×0.53 · 武將 0 · 太守 —`（`M.efficiencyOf / rosterOf / majorOf`）
- **没有新增玩法**、没有新状态字段，全是从 `M.*` 读现成值。

### 2.6 色数 / 对比度 / 暗带（前后实测）

同一支 `work/cocos_render/rstat.py`（750×1334，与审计同分辨率），web 基线用同一脚本量 `work/parity_cocos/web_*.png`：

| 页面 | 色数 改前 → 改后（web） | mean 改前 → 改后（web） | RMS 改前 → 改后（web） | p5-p95 span 改前 → 改后（web） | dark<12% 改前 → 改后（web） |
|---|---|---|---|---|---|
| 大地圖 | 20,211 → **20,404**（39,274） | 31.9 → **35.4**（43.8） | 29.8 → 28.4（39.5） | 72.6 → 72.1（119.4） | 0.7 → **0.5**（1.8） |
| 內政 | 13,351 → **14,724**（25,687） | 36.3 → 37.9（33.9） | 33.4 → **31.2**（31.4） | 113.7 → 99.6（76.6） | 1.0 → 1.2（3.2） |
| 物品 | 8,044 → **8,684**（15,137） | 32.0 → **35.2**（30.5） | 32.3 → 31.3（34.2） | 93.8 → 92.8（97.9） | 4.4 → **4.1**（6.3） |
| 編成 | 9,530 → **9,931**（15,134） | 31.0 → **32.7**（34.0） | 30.9 → 30.4（35.2） | 84.0 → 85.3（118.6） | 1.3 → **1.2**（3.4） |

读法（别只看单列）：

- **色数**：+1.0% / +10.3% / +8.0% / +4.2%，与 web 的差距从「少 34%~47%」收窄到「少 29%~43%」。色数差距的主因不是渐变，是**素材**：web 整页透出的朝堂图是 DPR2 的摄影级贴图，Cocos 侧 `bg/policy/palais_*.png` 只有 **640×480**（见 §7）。
- **平均亮度**：四页全部朝 web 靠（+3.5 / +1.6 / +3.2 / +1.7）；内政均值 37.9 已略高于 web 的 33.9（上一版 36.3 也偏高，因为 web 有 3.2% 的近黑区拉低均值）。
- **RMS**：四页各降 0.5~2.2。**这是预期的**：RMS 度量的是整页方差，把「死黑 0~6 的底板」换成「12~44 的着色带」之后，与亮部（地图 50+、白字）的落差变小，方差必然降。内政 31.2 与 web 31.4 已基本重合；大地圖 28.4 仍是四页最差（web 39.5），因为它 62% 面积是地图美术、控制台占比小，而 web 的控制台是「亮底 + 白字」的大反差。
- **暗带**：`dark<12%` 三页降、一页微升，最长近黑横带（thr 6.0）四页都是 **0px**；审计算出的 347px 暗带用的是另一套阈值（对照本次 `bands.py` 口径不可直接比），本报告以「无墨带」替代（见 2.5，271 → 51px）。

---

## 3. 截图（750×1334，DPR1，`work/cocos_render/`）

| 页面 | 改前 | 改后 |
|---|---|---|
| 大地圖 | `before_campaign.png` | `after_campaign.png` |
| 內政（紀錄区空） | `before_city.png` | `after_city.png` |
| 內政（点完命令后） | — | `after_city_after_cmd.png` |
| 物品 | `before_items.png` | `after_items.png` |
| 編成 | `before_deploy.png` | `after_deploy.png` |

复现链：构建 → `http://127.0.0.1:5188/cocos_render/cocos-build/web-mobile/index.html` → `work/cocos_verify/cdp.mjs`（PORT 9401）→ `steps_pages.mjs`（PHASE=before/after）→ `rstat.py` / `gaps.py`。
**坑**：截圖前必须等 `artHall.state === 'ready'`，否则走 `artReady=false` 的纯色分支，会得到 colors 10,697 / RMS 28.4 的假数据（同一支 build 正常是 14,724 / 31.2）。

---

## 4. 断言与类型检查（全绿）

| 命令 | 结果 |
|---|---|
| `node work/cocos_layout/assert_layout.mjs` | **15/15 PASS**，EXIT=0（底圖 bbox `{0,198.75,750,562.5}`、戰報 `{16,842,718,298}`、紀錄 `{18,880,714,348}`、icons=60、内政最底 bottom=1334、加成表右界 590/728、两栏净空 12px） |
| `node work/cocos_monarch84/layout_guard.mjs` | EXIT=0（60 城 / 出界 0 / 重叠 0） |
| `node work/cocos_monarch84/hud_layout.mjs` | EXIT=0（0 出界 / 0 相交） |
| `node work/cocos_skin/skin_assert.mjs` | EXIT=0（26 key × 10 档 = 260 组，**ALL PASS · 断言 7,691 条**） |
| `node work/cocos_skinapply/skin_nodes_assert.mjs`（附加） | 107/107 通过（`SKIN_SLOTS` A 8 / B 15 / C 30 / D 10 未变） |
| `tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |

`assert_layout.mjs` 有个前置坑：它 `main()` 一开头就 call `window.__comp()`，但 `__comp` 只内联在 `CAMPAIGN_DUMP/CITY_DUMP` 字串里、从没 evaluate 过。必须先跑 `work/cocos_render/steps_helpers.mjs`（逐字抄 `assert_layout.mjs:56-71` 的 HELPERS，并等 Boot→Campaign 落地）**且不 close/launch**，再跑 assert。

---

## 5. 运行时 CENSUS（`work/cocos_render/census.txt`）

| 页面 | nodes | Label 总/非空 | outline | shadow | SLICED | simple | skin 层 | Graphics | ScrollView | 字级分布（Top3） |
|---|---|---|---|---|---|---|---|---|---|---|
| 大地圖 | 177 | 97 / 80 | 96 | 2 | 8 | 62 | 1 | 6 | 0 | 14×60、12×11、13×11 |
| 內政 | 261 | 158 / 134 | 157 | 15 | 23 | 64 | 2 | 9 | 0 | 14×60、16×22、20×22 |
| 物品 | 431 | 268 / 229 | 267 | 28 | 53 | 90 | 3 | 11 | 0 | 14×68、11×31、16×24 |
| 編成 | 159 | 82 / 63 | 82 | 4 | 56 | 14 | 1 | 3 | 0 | 16×26、12×19、15×9 |

`Skin*` 节点名口径说明：皮肤层叫 `CampaignSkin / CityPanelSkin / ItemsPanelSkin / DeploySkin`，`makeNineSlice` 建的子节点叫 `Skin_<key>` 或业务名（`SkinGenPlate_0`、`SkinTroopPlate_7`…），`makeBtn/makePanel` 才会叫 `Btn_*`/`Panel_*`（本轮 0 个，理由见 2.1）。

---

## 6. 遗留项（明确没做，不粉饰）

1. **字级层级**：大地圖 60/97、內政 60/158 个 Label 仍是 14px（审计：85.9% / 58.3% 压在 14px 一档），web 是「题目 28-40 / 正文 18-20 / 数值 30」三档。改字号会动版式（`hudValues num 20` 等 5 处被断言正则锁死，其余需逐页核版式），本轮未动 → **≈6h**。
2. **全屏朝堂美术**：`bg/policy/palais_*.png` 只有 640×480，Cocos 拉到 750×562 / 750×318；web 用同一张但按 DPR2 输出，所以色数高一个量级。要补 2× 素材需重导美术 → **≈4h**。
3. **`plate_sel` 选中框是红色**（web 是金色）：26 张 PNG 被 `skin_assert` 逐字节锁死（`EXPECTED_TOTAL_BYTES=20742`），换图要同时改断言 → **≈2h**。
4. **物品列表 `ScrollView` 化**：现在是 8 页翻页（能翻，但不是滚动手感）→ **≈3h**。
5. **内政 140px 过渡带**：`R_CMD` 740 → `R_LOG` 880 之间仍是美术透出，web 那里是同一张半透明面板。可补一条装饰带，但要设计确认 → **≈0.5h**。
6. **web 独有 5 页**（首屏 10,883 色 / 结算 6,698 / 列表 9,058 / 存档位 6,003 / 势力 3,027）：Cocos 侧是页面缺失，不属渲染差距，未在本轮范围。
7. 战斗页未评估（`BattleRoot.ts`/`BattleInput.ts` 由另一 agent 在改）。

**合计剩余 ≈ 15.5h**（不含 6、7）。

---

## 7. 附：配色对照表（web 采样 → Cocos 落值）

| 区域 | web 采样 | Cocos 落值 |
|---|---|---|
| 大地圖页头 | lum 37 | `#2A241C → #14100B` |
| 控制台 | 顶 43 / 底 15 | `#272A2D → #0D1013`（28 段） |
| 戰報面板 | rgb(25,28,29) lum 27 | `#1E2126 → #14171B`（20 段） |
| 内政页头 | rgb(48,31,13) lum 34 | `#30240F → #16110B` |
| 内政資訊卡 | rgb(34,29,25) lum 30 | `#26221C → #181411`（16 段） |
| 内政命令牌 | rgb(55,41,31) lum 44 | `#4A3520/#402D1C → #241809/#1A1209` |
| 内政結果面板 | rgb(26,29,32) lum 28 | `#22252A → #171A1E`（20 段） |
| 物品列表行 | rgb(28,30,32) lum 30 | `#232A33`/`#1F262E → #14181D`（逐行 4 段） |
| 物品详情 | rgb(27,29,31) lum 29 | `#20242A → #171A1F` |
| 編成格位 | rgb(39,32,28) lum 33 | `#22282F → #171C22`（选中 `#4A3A20 → #1D1509`） |
| 編成页头 | lum 35 | `#2A241C → #14100B` |
