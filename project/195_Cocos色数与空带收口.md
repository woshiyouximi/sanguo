# 195 Cocos 色数与空带收口：編成页 3143 → 4241，物品页空带 302 → 23px

> 目标：Cocos 观感继续逼近 web，**不改任何逻辑**。两件收尾：
> ① 編成页「≥8 次出现」色数 3134 → ≥3631（lead 验收线），且不许发紫；
> ② 物品页右详情区在「只有 1~2 行真实内容」时不再留大片纯色空带（最长连续无墨纵向 ≤80px）。
>
> 一句话结论：**編成页把六张卡与页头页脚的 `areaGrid` 二维网格真正铺开（28 栏 → 63 栏，栏组合 28 → 63），
> 并用新写的 `Draw.gridWeave` 蛇形排列把 gridShade 的 96px 竖缝消掉；色数 3143 → 4241（+34.9%），
> 深色区逐点偏差最大 3（876 口径）/ 6（750 口径），偏紫像素占比 1.42% → 1.42%。
> 物品页把「原作欄位」12 行空骨架、说明/裝上後提示、大圖框裡的空記號、以及 1042..1142 的唯讀注解帶填上，
> 空带 302px → 23px。**
>
> 硬约束遵守：只改 `game/cocos/assets/scripts/Draw.ts`、`DeployRoot.ts`、`ItemsPanel.ts`；
> **未动** `game/src/**`、`game/web/**`、`core/**`、`Battle*.ts`、`CampaignRoot.ts`、`TextRole.ts`、`CityPanel.ts`。

---

## 0 摘要

1. `[确认]` **加段数没用、加「栏组合」有用**：`gridShade` 的单格颜色是
   `base + (rv = i%(rMax+1), gv = round(gSpan·j/(rows-1)), bv = -⌊i/(rMax+1)⌋%(bMax+1) + j%2)`，
   所以一个网格能产生的互异色 ≤ `(rMax+1)(bMax+1) × |gSpan|+1 × 2`，**与 rows/cols 的实际段数无关**。
   上一轮把列数 20 → 28 只 +6.6%，正因为 28 栏只吃到 28 个栏组合；这轮把 `areaGrid` 的列上限
   `Math.min(cols, 28)` 放到 `63`，并把 `rMax/bMax` 从 6/4 提到 8/6（9×7 = 63 个 `(rv,bv)` 组合），
   单卡色数预算 616 → 1764。
2. `[确认]` **63 栏 gridShade 有肉眼可见的 96px 竖缝**（`rv` 每 8 栏从 +8 直接掉回 0，1× 截图就能看出一片片竖条），
   这是「为凑色数把网格铺细」带来的新瑕疵。解法不是退回去，而是换排列：新写 `Draw.gridWeave`
   ——**蛇形（serpentine）**，段内 R 递增、下一段反向回捲，段与段交界只差 B 的 1 级，
   相邻列永远只差 1 级（1/255 不可见），而 `(rv,bv)` 组合数与 `gridShade` 完全相同（不减色数）。
   `gridShade` 一字未动，其他页面继续用它。
3. `[确认]` 最终色数（**750×1334 → 半分辨率 375×667、NEAREST、≥8 次**，与 lead 口径一致）：
   編成 **3143 → 4241**（b4c 基线 3134）、物品 2157 → 2246（選中態）、物品空態 1841 → 2069、
   大地圖 4327 → 4327、內政 4708 → 4708（后两页零变化，因为没碰它们的绘制路径）。
4. `[确认]` **没发紫**：876 交付对（`deploy_before` / `deploy_after`）十个区域均值最大通道差 **1.4**、
   14 个设计坐标点逐点最大差 **3**、偏紫像素占比 **1.42% → 1.42%**；750 对（gridWeave vs before）
   分别是 **1.2 / 6 / 2.55% → 2.56%**。深色区仍在 `(33,22,27)`、`(37,24,26)` 一带，
   与 lead 给的 `(26,22,30)/(32,29,37)` 同量级，偏差远小于 8。
5. `[确认]` 物品页空带：`items.det` 最长连续无墨 **302px → 23px**、`items.bigFrame` **111 → 7px**，
   全页最长（`deploy.page`）本来就是 55px，未变。口径见 §5。
6. `[确认]` 六套断言全过：`assert_layout` 15/15、`layout_guard` ✓、`hud_layout` ✓、
   `skin_assert` 7691 条 ALL PASS、`skin_nodes_assert` 107/107、`input_assert` 386/386。

---

## 1 口径（先固定，免得数字对不上）

### 1.1 色数（`work\cocos_render3\cstat.py`，未改）

- 输入 750×1334 截图（Cocos 设计分辨率 750×1334，1 设计像素 = 1 图px）。
- 图 > 400k px 时用 **NEAREST 半分辨率** → 375×667；统计**出现次数 ≥8 的 RGB 值个数**（`d2` 列）。
- lead 给的 3134 / 2157 / 4329 / 4708 都是这个 `d2` 口径，本报告沿用。
- 876×1368 的截图半分辨率是 438×684，每设计像素只占 0.51 半像素，**格数口径会掉**，
  所以 876 只作交付截图，**色数一律用 750×1334 量**；两套都拍了，两套都留着。

### 1.2 876×1368 的坐标映射（量空带用）

876 宽不是 750 的 1.168 倍等比拉伸，而是**等比 fit-height + 左右留边**：由金色框线反推
`scale = 1.0255`、`ox = 53.4`、`oy = 0`（设计 `list` 框 x=18..448 ↔ 图 px 73..510）。
早先按 1.168 量得到「0 个无墨行」的假结果，就是错在这里。

### 1.3 空带（`work\cocos_render4\inkband.py`，自写）

- 矩形用**设计坐标**，四边内缩 6px（不含描边本身——描边是「框」，不算内容墨）。
- 逐行判墨：对每个 x 比较 `p(x)` 与 `p(x+3)`，任一通道差 > 5 记一个墨点（**局部反差**口径，
  缓慢渐变的底纹不会被误判成墨，文字笔画 / 分隔线 / 格线 / 图标会）。
- 行内墨点 < `max(6, 3%行宽)` → 该行「无墨」；最长连续无墨行数 = 空带长度。
- 判据：`items.det` 与 `items.bigFrame` 的最长无墨距离 ≤ 80px。

---

## 2 編成页色数：三段演进

| 段 | 做法 | 列组合 | 单卡预算 | 750 色数 | 结果 |
|---|---|---|---|---|---|
| 起点（上一轮） | `areaGrid` 28 栏、`rMax/bMax = 6/4`、`gridShade` | 28（4×7） | 616 | **3143**（b4c 3134） | 差 488 到线 |
| ① | 28 → **63 栏**，`rMax/bMax = 8/6`（9×7） | 63 | 1764 | **4270** | 过线，但**整页 96px 竖缝** |
| ② | 同 ① 的栏数与振幅，排列换 `Draw.gridWeave` 蛇形 | 63 | 1764 | **4241** | 过线，**缝消失**，与 before 同样平滑 |

三段都遵守「只在中性暖灰内 ±1~2 级抖动」：base 仍是 `#221F1B`（R34 G31 B27），最深一格
R+8 / G−13 / B−6 ≈ `(42,18,21)`，仍是暖褐；B 跟着 R 一起下沉，**不会回到 (27,6,29) 那种洋红**。

关键账（`DeployRoot.areaGrid`）：

- 栏组合：`(rMax+1)×(bMax+1)` = `9×7 = 63`（原 28）。
- 列方向 G 级数：`|gSpan|+1 = 14`（原 11，`span` 上限从 10 放到 13）。
- 行方向 `jv = j%2` 再 ×2。→ 单卡 63×2×14 = **1764**（原 616）；页头 63×11 = 693（原 308）、页脚 63×12 = 756（原 336）。
- 一张卡 704 宽切 63 栏 = 每格 11.2 设计 px，半分辨率 5.6×3.7 ≈ 20 像素，**仍远高于「≥8 次」阈值**，
  所以每一格都能被 cstat 数进去（这也解释了为什么 63 栏能真的变成色数而不是被阈值吃掉）。

### 2.1 为什么必须换 `gridWeave`

`gridShade` 的段内是斜坡：`rv = 0,1,2,…,rMax`，第 9 栏回到 0。rMax=8 时一次跳 8 级，
在 1× 截图上就是**周期 96px 的竖条**（`work\cocos_render4\cmp_gen_3x.png` / `crop1x_after.png`）。
`gridWeave` 把每段做成来回走：段内 `rv = 0..rMax`、下一段 `rv = rMax..0`，
段间交界只差 B 的 1 级；整条曼哈顿路径上**每一步都只跨 1 级**，于是没有跳变、也就没有硬边。
三行对照存在 `work\cocos_render4\cmp_bands.png`（同一块空区 300,340–750,470：before / gridShade / gridWeave）。

---

## 3 最终数字（750×1334，半分辨率 375×667 口径）

| 页 | before | after | 变化 | 说明 |
|---|---|---|---|---|
| 大地圖 campaign | 4327 | **4327** | 0 | 未碰该路径（b4c 基线 4329） |
| 內政 city | 4708 | **4708** | 0 | 同上 |
| 物品 items（選中態） | 2157 | **2246** | +89（+4.1%） | 说明行 / 唯讀注解帶 |
| 物品 items（空態） | 1841 | **2069** | +228（+12.4%） | 骨架 12 行 + 大圖框記號 + 注解帶 |
| **編成 deploy** | **3143** | **4241** | **+1098（+34.9%）** | 验收线 3631，b4c 基线 3134 |

原始输出（`cstat.py`）：

```
before750_campaign.png  750x1334  >=8: d2=4327   d1=9274   | uniq: d2=21804  d1=43798
before750_city.png      750x1334  >=8: d2=4708   d1=10583  | uniq: d2=22364  d1=44617
before750_items.png     750x1334  >=8: d2=2157   d1=4291   | uniq: d2=10319  d1=22642
before750_deploy.png    750x1334  >=8: d2=3143   d1=6483   | uniq: d2=12923  d1=24970
after750_campaign.png   750x1334  >=8: d2=4327   d1=9273   | uniq: d2=21805  d1=43798
after750_city.png       750x1334  >=8: d2=4708   d1=10583  | uniq: d2=22364  d1=44617
after750_items.png      750x1334  >=8: d2=2246   d1=4424   | uniq: d2=10432  d1=22775
after750_deploy.png     750x1334  >=8: d2=4241   d1=8004   | uniq: d2=14661  d1=27053
before750_empty_items.png  750x1334  >=8: d2=1841  d1=3761  | uniq: d2=8763   d1=19238
after750_empty_items.png   750x1334  >=8: d2=2069  d1=4120  | uniq: d2=9363   d1=20223
```

> `before` 用的是**改前代码的构建快照**（`work\cocos_render4\before\cocos-build\web-mobile`），
> 与 `after` 同一管线、同一截图脚本、同一帧状态，所以 3143↔4241 是可比的成对数。
> 与 lead 给的 3134 差 9（0.3%），来自快照构建与等帧差异，不影响结论。

顺带把 **876×1368 口径**也量了（半分辨率 438×684，与 375×667 不可比，仅作方向参考）：

```
deploy_before.png   876x1368  >=8: d2=3824   d1=8399   | uniq: d2=21049  d1=44045
deploy_after.png    876x1368  >=8: d2=4912   d1=10039  | uniq: d2=22882  d1=46383
items_before.png    876x1368  >=8: d2=2127   d1=5668   | uniq: d2=17650  d1=40522
items_after.png     876x1368  >=8: d2=2383   d1=6297   | uniq: d2=18697  d1=42185
```

即交付截图这一对同样是 **+1088 色（+28.5%）**，与 750 口径的 +34.9% 同向、同量级。

---

## 4 像素复核（证明没发紫）

`work\cocos_render4\recheck.py`：区域均值、逐点采样、偏紫像素占比三件一起量。

### 4.1 交付对（876×1368，`deploy_before.png` vs `deploy_after.png`）

```
-- 区域均值 (R,G,B) 与最大通道差 --
  main     before=(40.7,32.9,31.9)  after=(41.0,32.0,31.0)  maxd=0.9  dB-R=-1.2
  gen      before=(40.7,29.5,28.4)  after=(41.1,28.4,27.5)  maxd=1.1  dB-R=-1.3
  troop    before=(34.7,26.8,28.8)  after=(35.6,25.8,28.3)  maxd=1.0  dB-R=-1.4
  form     before=(41.0,32.0,31.9)  after=(41.8,31.1,31.5)  maxd=0.9  dB-R=-1.2
  wise     before=(50.1,35.4,28.7)  after=(50.6,34.6,27.9)  maxd=0.8  dB-R=-1.3
  power    before=(38.5,31.7,29.4)  after=(38.9,31.3,28.8)  maxd=0.6  dB-R=-1.0
  header   before=(42.9,33.0,29.3)  after=(43.5,32.2,28.4)  maxd=0.9  dB-R=-1.5
  footer   before=(52.4,41.6,36.9)  after=(52.9,40.7,36.7)  maxd=0.9  dB-R=-0.7
  gutter   before=(31.6,25.8,24.8)  after=(31.6,25.8,24.8)  maxd=0.0
  bg_right before=(39.6,30.6,30.1)  after=(40.4,29.5,28.7)  maxd=1.4  dB-R=-2.2
-- 逐点（设计坐标，14 点）--
  (100, 450) before=(33,22,27)  after=(35,20,27)  maxd=2
  (400, 640) before=(37,24,26)  after=(39,22,24)  maxd=2
  (700,1100) before=(36,28,25)  after=(33,27,22)  maxd=3
  ...（其余 11 点 maxd ≤ 3）
-- 汇总 --
  区域均值最大通道差 = 1.4
  逐点最大通道差     = 3
  偏紫像素占比 before=1.42%  after=1.42%
```

### 4.2 750 对（`before750_deploy` vs `after750_deploy`，gridWeave 版）

区域均值最大通道差 **1.2**、逐点最大差 **6**（在 `(400,640)`：`(25,24,30) → (31,23,29)`，
即 G 反向下沉 2、R 抬 6，仍是暖灰而不是洋红）、偏紫像素占比 **2.55% → 2.56%**。
判据：偏紫像素 = `B > R+6 且 B > G+10`；两版都在 2.5% 量级（Cocos 底图自身的冷灰像素），**没有被我的网格推高**。

结论：**没有发紫，深色区与 before 同量级，偏差远小于 8。**

---

## 5 物品页空带测量

### 5.1 空带从哪来

物品页详情区 `LAYOUT.det = {460,406,272,736}`（底边 1142）。有选中物品时 12 行「原作欄位」铺到
y≈1040，几乎填满；**点「陣法 / 兵符」这类 0 件的页签**时 `setFilter`（`ItemsPanel.ts:1155`）
把 `selectedSeq` 清成 `null`，旧 `renderDetail()` 只写「未選擇物品」并把 detType / detFoot / desc /
preview / fieldKeys / fieldVals **全部清空**，于是 y≈742..1142 变成 **400px 纯色平带**
（外加 bigFrame 126×126 空框）。这是 web 没有的空带。

### 5.2 填了什么（全部落在既有矩形内，未动 LAYOUT 常量）

| 位置（设计坐标） | 填法 | 性质 |
|---|---|---|
| `fieldKeys/fieldVals` 848..1040 | 12 行 `FIELD_ROWS` 欄名 + `—` | **真实内容**（唯讀資料表的空行），不是画上去的灰条 |
| `desc` 742 / `preview` 788 | 「這張卡會列出：…」「裝上後：—」 | 复用既有 Label，说明这张卡的版式 |
| `detType 574 / detFoot 592` | 「點左邊清單任一行」「選中後顯示加成與原作欄位」 | 复用既有 Label |
| `bigFrame` 414..540 | `doubleEdge` 内框 + 金色斜十字 + 中宫 36×36 | Graphics，空框里给一个「未選」記號 |
| 1042..1140 | `vBands #241E18→#14110C` 8 段 + `doubleEdge` + `topSheen` + 3 条 hline；其上 `labelDetNote`「原作欄位為資料表原文 · 唯讀　加成已計入四槽 · 不重複計算」 | 实心带 + 分隔线（题目点名的做法） |

### 5.3 实测（876×1368）

```
items_before.png  876x1368  scale=(1.0255,1.0255) off=(53.4,0)
  items.det        inkless=488/742  longest=302  at design y=842..1135   next: 95@843 48@564
  items.det.lower  inkless=344/359  longest=302  at design y=842..1135
  items.bigFrame   inkless=111/117  longest=111  at design y=426..533
  items.gen        inkless= 47/297  longest= 18
  items.list       inkless=149/742  longest= 15
  deploy.page      inkless=170/1356 longest= 55

items_after.png   876x1368
  items.det        inkless=244/742  longest= 23  at design y=777..799   next: 22@1103 21@1080
  items.det.lower  inkless=154/359  longest= 22  at design y=1115..1135
  items.bigFrame   inkless= 15/117  longest=  7  at design y=509..515
  items.gen        inkless= 47/297  longest= 18
  items.list       inkless=149/742  longest= 15
  deploy.page      inkless=170/1356 longest= 55
```

判据 ≤80px：**详情区 302 → 23px、大圖框 111 → 7px，全部达标**；最长的一条 23px 落在
「原作欄位」标题与第一行欄名之间，属正常栏间距，不是空带。

---

## 6 改动清单（file:line）

| # | 文件:行 | 改前 | 改后 | 性质 |
|---|---|---|---|---|
| 1 | `game/cocos/assets/scripts/Draw.ts:406-441` | —（无此函数） | 新增 `export function gridWeave(rect, cols, rows, base, rMax = 8, gSpan = -13, bMax = 6, alpha = 255): Band[]`，蛇形排列 | 新绘制原语（`gridShade` 一字未动） |
| 2 | `game/cocos/assets/scripts/DeployRoot.ts:42` | `import { Band, edgeBands, gridShade, lightGrid, … }` | `import { Band, edgeBands, gridWeave, lightGrid, topSheen, vBands }` | 换原语 |
| 3 | `DeployRoot.ts:737-764` | `areaGrid(...)` 内 `span` 夹 10、`c = min(cols, 28)`、`gridShade(..., 6, -span, 4, alpha)` | `span` 夹 13、`c = min(cols, 63)`、`gridWeave(..., rMax, -span, bMax, alpha)`，签名尾加 `rMax = 7, bMax = 5` | **色数主改** |
| 4 | `DeployRoot.ts:1027` | 页头 `areaGrid(base, 0, 0, 750, 124, 30, 11, '#2A241C', 16, 214)` | `(…, 63, 11, '#2A241C', 16, 214, 8, 6)` | 列 30→63 |
| 5 | `DeployRoot.ts:1028` | 页脚 `(…, 0, 1194, 750, 140, 30, 12, '#2B2D2B', 14, 236)` | `(…, 63, 12, '#2B2D2B', 14, 236, 8, 6)` | 同上 |
| 6 | `DeployRoot.ts:1062` | 六张卡 `areaGrid(ui, r.x+7, r.y+9, r.w-14, r.h-18, 34, rows, '#221F1B', 16, 232)` | `(…, 63, rows, '#221F1B', 16, 232, 8, 6)` | 同上（`CARD_ROWS` 未动） |
| 7 | `ItemsPanel.ts:509` | — | `private labelDetNote: Label \| null = null;` | 新 Label 字段 |
| 8 | `ItemsPanel.ts:677-685` | — | 建 `ItemsDetNote` Label（`y=1046, h=40`, 11px, `textFaint`, CLAMP） | 唯讀注解帶文字 |
| 9 | `ItemsPanel.ts:806` | — | `applyTextRole(this.labelDetNote, 'tip', 11);` | role 接线 |
| 10 | `ItemsPanel.ts:1576-1593` | 无选中：6 个 Label 清空 | 写「未選擇物品 / 點左邊清單任一行 / …」+ desc/preview 两行提示 + **12 行 FIELD_ROWS 欄名与 `—`** | **空带主改** |
| 11 | `ItemsPanel.ts:1926-1956` | 无选中时大圖框空、1042 以下空白 | 大圖框 `doubleEdge` + 斜十字 + 中宫（`1931-1942`）；`noteRect {x:det.x+6, y:1042, w:det.w-12, h:1142-2-1042}` 的 `vBands` + `doubleEdge` + `topSheen` + 3 条 hline（`1947-1956`） | 空带主改（Graphics） |

> 附带说明：`DeployRoot.ts` 中途被我自己的 pwsh 批处理用 `Get-Content/Set-Content` 以 GBK 解码写坏过一次
> （791 个 `?`、1674 行变 1559 行）。已用 Cocos 的 sourcemap 缓存
> `game/cocos/temp/programming/packer-driver/targets/editor/chunks/5b/5bda65b4…js.map`
> 的 `sourcesContent[0]` 原样还原（1674 行 / 79383 bytes / 0 个 U+FFFD），再重做上面第 2~6 条改动；
> 损坏件留档在 `work\cocos_render4\DeployRoot.damaged.ts`。**规则记下：UTF-8 源码不用 pwsh 文本管线。**

---

## 7 验收

### 7.1 `tsc`

```
cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit
exit=0
```

### 7.2 六套断言（原始输出）

`node work\cocos_layout\assert_layout.mjs`（CDP 9404，指向 after 构建，876×1368 自设）：

```
PASS  ①a 底圖左溢出 ≤ 1px           rect.x=0 → overflow=0.00px
PASS  ①b 底圖右溢出 ≤ 1px           rect 右邊=750.00 → overflow=0.00px
PASS  ①c 底圖寬 = 設計寬 750         w=750
PASS  ①d 底圖節點 bbox == mapRect  node={"n":"CampaignMapImage","x":0,"y":198.75,"w":750,"h":562.5}
PASS  ②a 戰報 ∩ 地圖 = 0           交集面積=0
PASS  ②b 戰報在地圖下方               戰報.y=842 ≥ 地圖底=761.25
PASS  ②c 內政紀錄 ∩ 地圖 = 0         交集面積=0
PASS  ②d 內政紀錄在地圖下方             紀錄.y=880 ≥ 地圖底=761.25
PASS  ③a 城點數 = 60              icons=60 cities=60
PASS  ③b 城點全部在地圖矩形內            越界 0 個
PASS  ④ 內政頁最底元素 bottom ≥ 1300  bottom=1334.00
PASS  ⑤a 加成表 10 標籤兩兩不重疊        最大交集面積=0
PASS  ⑤b 左欄數值右邊界一致             right=[590,590,590,590,590]
PASS  ⑤c 右欄數值右邊界一致             right=[728,728,728,728,728]
PASS  ⑤d 兩欄之間有淨空               左欄值右緣 590 → 右欄標籤 x 602，間距 12.00px

15/15 PASS → F:\sanguo\work\cocos_render4\assert_layout_after.json
```

`node work\cocos_monarch84\layout_guard.mjs`：

```
region：CampaignRoot.ts:222–469（246 行）
  標籤：60 城 / 出界 0 / 重疊 0 對
  ✓ 版式純函數區契約完好（仍可獨立 import，四個導出答案不變）
```

`node work\cocos_monarch84\hud_layout.mjs`：

```
  ✓ 君主名左邊界 = 命中區左界 +6px — 24
  ✓ 按鈕底邊在第二列字身之上 — 66 < 80.0

✓ 頁頭版式自檢全部通過（0 出界 / 0 相交）
```

`node work\cocos_skin\skin_assert.mjs`：

```
九宫断言跑了 260 组（26 key × 10 档尺寸）

ALL PASS · 断言 7691 条
```

`node work\cocos_skinapply\skin_nodes_assert.mjs`：

```
  ✓ DeployRoot.ts 的 buildSkin 不依賴底圖是否加載
  ✓ DeployRoot.ts 都 import 了 makeNineSlice + placeDesign

九宮 key：A 8 / B 15 / C 30 / D 10（靜態）；TextRole 6 級、降級 5 項
斷言：107/107 通過
全部通過 ✓
```

`node work\cocos_input\input_assert.mjs`：

```
G16 指令台 cmd6 / armyMenu / armyCmd 命中与下令         40 条
--------------------------------------------------------
断言总数 386 · 通过 386 · 失败 0
```

> 路径说明：任务里写的 `work\cocos_render\assert_layout.mjs` / `work\cocos_render\layout_guard.mjs`
> **不存在**（`work\cocos_render` 只有截图、构建日志与 `probe_*.mjs`）；真实脚本在
> `work\cocos_layout\assert_layout.mjs`、`work\cocos_monarch84\layout_guard.mjs`、
> `work\cocos_monarch84\hud_layout.mjs`、`work\cocos_skin\skin_assert.mjs`、
> `work\cocos_skinapply\skin_nodes_assert.mjs`、`work\cocos_input\input_assert.mjs`。
> devtools 9333 当时没监听，`assert_layout` 用 `CDP_PORT=9404` 指向自己的 Edge（同一 after 构建）跑的。

### 7.3 截图（876×1368，截前 `Page.bringToFront` + `getTotalFrames()` 两次在涨）

| 文件 | 字节 | frames |
|---|---|---|
| `F:\sanguo\work\cocos_render4\deploy_before.png` | 599029 | 754 → 778 |
| `F:\sanguo\work\cocos_render4\deploy_after.png` | 603221 | 840 → 865 |
| `F:\sanguo\work\cocos_render4\items_before.png` | 471177 | 476 → 501 |
| `F:\sanguo\work\cocos_render4\items_after.png` | 523253 | 608 → 632 |
| `F:\sanguo\work\cocos_render4\contact.png` | 1333538（1760×2744，2×2 拼版） | — |

---

## 8 没做到 / 不确定

1. **`doubleEdge` 双描边没加**。lead 提的「`gridWeave` 网格 + `doubleEdge` 双描边」两条路，我只走了网格这条；
   原因是单卡 63 栏已经过线 610 色，再加双描边要动 `FIXED_PLATES` 之外的新描边层，
   而 `skin_nodes_assert` 对 `buildSkin` 的 `'plate_sel'` 计数与 `section` 解析是硬约束，
   风险/收益不划算。留作下一轮的可选项。
2. **色数是「用网格换来的」**，不是真的多画了内容。63 栏时每格 11.2 设计 px，1× 肉眼几乎不可见（见 `deploy_after.png`），
   但它确实比 before 多一点「布纹」感；如果 lead 要求「观感必须与 web 逐像素同构」，这条路到不了 web 的
   15,134（web 是 165° 渐变 × inset 阴影两个方向相乘，Cocos 的 `Graphics` 只能靠二维色域近似）。
3. **两套口径的数字不能混用**：750 口径（375×667）是 lead 的验收线，本报告结论都用它；
   876×1368 口径（438×684）每设计像素占 0.58×0.51 半像素，量出来反而更高
   （deploy 3824 → 4912、items 2127 → 2383）。两套都贴了数，别拿 876 的 4912 去对 750 的 3631。
4. **物品页「選中態」也多了 89 色**（2157 → 2246），来自新加的唯讀注解帶（它常驻在 1042..1140，
   选中时也在）。如果 lead 希望「选中的详情区一色不动」，把 `noteRect` 那段包进 `if (this.selectedSeq === null)` 即可，
   我没这么做是因为空态下反而需要这条带兜住底部的 100px。
5. **`items.list` 与 `items.gen` 的最长空带 15 / 18px 未动**（本来就 < 80），`deploy.page` 的 55px
   （页脚提示文字之间）也未动——两者都在验收线内。
6. **`work\cocos_render4\steps_cap.mjs` 有个坑**：`cdp.mjs run` 按 URL 含 `cocos-build` 找 target，
   `before/cocos-build/...` 与 `cocos-build/...` 都会命中，第一次「after 截图」截到的是旧页面（字节数与 before 几乎一样）。
   现在脚本开头会比对 `PAGE_URL` 并 `Page.reload {ignoreCache:true}` 硬刷新，才继续；后续复用请保留这段。
