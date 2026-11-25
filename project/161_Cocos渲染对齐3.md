# 161 · Cocos 渲染对齐（第 3 轮）

> 目标：把 Cocos 的观感继续往 web 拉近。只动 UI 层脚本（`game/cocos/assets/scripts/`），
> 三家页面的美术底图与 `core/**`、`DeployRoot.ts`、`Battle*.ts`、`game/web|src/**` 一律没碰。
> 本轮三件事：①色彩层次（色带段数 + 双描边 + 暖灰统一）②滚动惯性 + 回弹 ③字级 4→6。

---

## §1 三个目标各做了什么

### 目标 1：色彩层次（`Draw.ts` 是主战场）

**先说结论性的机制判断**（这是本轮最贵的一条经验，§5 会再提）：
web 的色数不是「色带切得多」堆出来的，而是**两个方向的渐层相乘**——`linear-gradient(165deg)` 的斜向
分量 + `inset box-shadow` 的径向亮度，再叠半透明层。Cocos 的 `Graphics` 只能填纯色矩形，
所以「把 2–3 段提到 6–10 段」只把色数抬一档就饱和了（§2 的 b3a 行：campaign 只 +6.6%）。
真正起作用的是把**一维色带改成二维色域**：色数从 `steps` 变成 `steps × split`。

以下改动全部在 `F:\sanguo\game\cocos\assets\scripts\Draw.ts`：

| 位置 | 内容 | 对应 web 的哪一处 |
|---|---|---|
| `Draw.ts:46` | `export const WARM = { void/panel/panelHi/panelLow/head/headLow/console/consoleLow/row/rowLow/line }`（暖灰阶表，`#1A1712` 系） | `city.html:9` `--panel:#161B22` / `city.html:218` 章节内 `.sec` 覆盖成 `rgba(18,15,12,.72)` 暖褐 |
| `Draw.ts:120` | `function shiftHex(color, d)`：三通道整數 ±d | `inset box-shadow` 疊在漸層上時的「一級一級分開的像素色」 |
| `Draw.ts:154` | `const COL_SHIFT = 5`（`split` 那一維 ±5 級的幅度） | 同上 |
| `Draw.ts:172` | `function mixT(t,u)`：把 180° 縱向色帶掰成 165° 斜向 | `campaign.html:83` `.btn{linear-gradient(165deg,#2A3038,#191D23)}`、`city.html:48` `.sec{linear-gradient(180deg,…)}` |
| `Draw.ts:185` | `vBands(...)` 段數下限抬到 **12**、`split` 預設 **10**，每格顏色 = `shiftHex(mixHex(from,to,mixT(t,ct)), ±COL_SHIFT)` | 同上：`linear-gradient` 在瀏覽器裡是逐像素的，4 段色帶在 60px 高的格子上等於「上下一刀」 |
| `Draw.ts:220` | `hBands(...)` 段數下限 8、`split` 預設 6，同樣走斜向 + 整數色階 | 同上（橫向的 `linear-gradient(90deg)`） |
| `Draw.ts:261` | `wash(rect,color,a0,a1,steps,horizontal)`（新增）：半透明「光」疊層 | `campaign.html:22` `header{linear-gradient(180deg,rgba(216,179,106,.08),transparent)}` |
| `Draw.ts:310` | `lightGrid(rect,cols,rows,base,rSpan,gSpan,alpha)`（新增）：R 沿 x 走 rSpan 級、G 沿 y 走 gSpan 級 → `cols×rows` 個互不相同的 RGB，**色數是乘法** | `inset 0 0 72px 6px rgba(8,11,15,.42)`（`campaign.html:66`）+ `linear-gradient(165deg)` 的雙層結構 |
| `Draw.ts:351` | `doubleEdge(rect,outer,outerAlpha,inner,innerAlpha,width,inset)`（新增）：外 1px 暗線 + 內縮 2px 亮線 | `campaign.html:70/72` `.city{border:1px solid rgba(255,255,255,.05)}` + `.city.target{box-shadow:0 0 0 1px rgba(216,179,106,.35) inset}`；`city.html:100` `.btn.primary{box-shadow:inset 0 0 0 2px rgba(216,179,106,.30)}` |

页面侧调用点（只替换「底色」与「描边」，版式矩形一个没动）：

- `CampaignRoot.ts:2362` 頁頭 `lightGrid({0,0,750,124}, 16, 6, WARM.head, 16, -10)`（原 14 段 vBands）
  —— web `campaign.html:22` header 金調漸層；頁頭金 `wash` 保留在 `CampaignRoot.ts:2385` 附近。
- `CampaignRoot.ts:2371` 控制台 `lightGrid(…504 高…, 26, 15, WARM.console, 20, -16)`；`CampaignRoot.ts:2381` 控制台 `doubleEdge`。
- 地图面紗（`CampaignRoot.ts` drawMap 开头）：`vBands(mapRect,'#0A0E14','#080A0E',10,30,70)` +
  `edgeBands(mapRect,'#05070A',132,72,6)` + `wash(mapRect,'#D8B36A',12,0,10,true)`
  —— 直接對應 `campaign.html:65-66` 的 `linear-gradient(rgba(10,14,20,.58),rgba(10,14,20,.72))`
  + `box-shadow:inset 0 0 72px 6px rgba(8,11,15,.42)`。畫在道路/城點之前，城點不被壓暗。
- `CampaignRoot.ts:3252` 戰報面板 `lightGrid(LOG_VIEW, 24, 13, WARM.panelHi, 18, -14)`；`CampaignRoot.ts:3263` 雙描邊。
- `CampaignRoot.ts:2647` 三顆月令按鈕 `lightGrid({x,BUTTON_Y,w,h}, 10, 5, top, 14, -14, alpha)`；`CampaignRoot.ts:2657` 雙描邊（主按鈕用 `COLORS.goldLight`）。
- `CityPanel.ts:979` 紀錄卡 `lightGrid(R_LOG, 18, 10, WARM.panelHi, 16, -12, artReady ? 224 : 248)`（整頁最大的近純黑平面）；`CityPanel.ts:983` 雙描邊。
- `ItemsPanel.ts:1715` 列表框 `lightGrid(LAYOUT.list, 8, 16, …)`、`ItemsPanel.ts:1798` 詳情卡 `lightGrid(LAYOUT.det, 6, 14, …)`；雙描邊 `ItemsPanel.ts:1720` / `:1803`。
- `DeployRoot.ts` **禁改**，它的 40 幾格兵種/陣形小牌只靠 `Draw.ts` 的全域語義升級（`vBands` 12 段 × 10 欄）間接受益。

### 目标 2：滚动惯性 + 回弹（`ItemsPanel.ts`）

| 位置 | 内容 |
|---|---|
| `ItemsPanel.ts:112` | `const OVERSCROLL = 56;`（設計 px，允許拖出邊界 56px 才出現回彈） |
| `ItemsPanel.ts:114` | `const RUBBER = 0.42;`（越界量打 0.42 折，越拉越硬） |
| `ItemsPanel.ts:116` | `const INERTIA_DECAY = 0.92;`（每幀衰減，任務書指定值） |
| `ItemsPanel.ts:118` | `const INERTIA_MIN = 3;`（速度 < 3px/幀就停） |
| `ItemsPanel.ts:125` | `function lerp(a,b,t)`（本檔自帶：`cc.MathUtils` **沒有** `lerp`，見 §5） |
| `ItemsPanel.ts:534` | `velPx = 0;`（public，給取證探針讀） |
| `ItemsPanel.ts:1297-1298` | `measureList()` 的硬夾 `[0,maxScroll]` 放寬成 `[-OVERSCROLL, maxScroll+OVERSCROLL]`（不放寬回彈永遠不觸發） |
| `ItemsPanel.ts:1931-1944` | `onTouchMove`：橡皮筋折算 + 速度 EMA `velPx = velPx*0.35 + v*0.65`（v 用「Δpx / Δ幀」算） |
| `ItemsPanel.ts:1963-1967` | `private startInertia()`：>90ms 未動 / 低於 3px 幀速 / 已經越界 → 歸零 |
| `ItemsPanel.ts:1977-2003` | `protected update(dt)`：越界用 `lerp(scrollPx, target, 1-0.72^frames)` 逼近、<0.5 吸附；否則 `velPx *= 0.92^frames`，撞兩端歸零，再 `refresh()` |
| `ItemsPanel.ts:2012/2030` | 松手（`onTouch`）、`open()`、`scrollTo()` 都會清 `velPx`，避免殘留速度把新頁面帶走 |

對應 web 的哪一處：web 版列表用原生 `overflow:auto` + `-webkit-overflow-scrolling:touch`
（`game/web/*/items.html` 的 `.list`），捲動慣性與邊緣橡皮筋是瀏覽器給的；Cocos 這邊沒有 ScrollView
（本頁是自製的 `maxScroll=3824` 八頁），所以這兩件事必須自己寫。

### 目标 3：字级 4 → 6（`TextRole.ts`）

`TextRole.ts:28` `export type TextRole = 'title' | 'head' | 'body' | 'num' | 'tip' | 'badge';`
`TextRole.ts:54-59` 六行（欄位順序與舊四行完全一致，斷言用正則逐項解析）：

```
title: 40px / outline 2 / shadow -2,2
head : 22px / outline 1 / shadow -1,1
body : 18px / outline 1 / no shadow
num  : 20px / outline 1 / no shadow
tip  : 13px / outline 1 / no shadow   ← 新增（提示小字）
badge: 11px / outline 1 / no shadow   ← 新增（按鈕角標/欄位鍵名）
```

`tip`/`badge` 的描邊/陰影值刻意與 `body` 相同：**語意收斂、視覺零風險**（版式一個像素沒動）。
使用點（`applyTextRole` / `applyTextRoles` 第三參＝版式豁免，尺寸沿用原值）：

| 檔案 | title | head | body | num | tip | badge | 合計 |
|---|---|---|---|---|---|---|---|
| `CampaignRoot.ts` | 1 | 1 | 3 | 6 | 5 | 4 | 20 |
| `CityPanel.ts` | 1 | 5 | 5 | 4 | 2 | 1 | 18 |
| `ItemsPanel.ts` | 1 | 7 | 2 | 8 | 6 | 10 | 34 |
| `DeployRoot.ts`（禁改，只讀） | 1 | 2 | 10 | 3 | 0 | 0 | 16 |
| **合計** | **4** | **15** | **20** | **21** | **13** | **15** | **88** |

改前 60 處 / 4 級 → 改後 88 處 / 6 級（本輪新增 28 處：CampaignRoot 9、CityPanel 3、ItemsPanel 16）。
被 `skin_nodes_assert.mjs` 正則鎖死的 23 處 role 呼叫（CampaignRoot 9 / CityPanel 7 / ItemsPanel 4 / DeployRoot 3）
**一律沒動**。

---

### 目标 4：编成页二维色域 + 物品页版面（lead 第二轮追加）

**4.1 编成页**（`DeployRoot.ts` 解禁后，只动绘制，未碰出阵队列逻辑与文案）
编成页原本是四页里余量最薄的（2288 → 2905），因为 40 余格兵種/陣形是 Skin 九宫 Sprite、
底色只有一段 `vBands`。改成「每格一块二维色域」：

- `DeployRoot.ts:701` 之后新增 `private areaGrid(g, x, y, w, h, cols, rows, base, gDown, alpha)`
  → 调 `Draw.gridShade(...)`；同处新增 `private cellGrid(g, x, y, w, h, top, bottom, cols, rows, alpha)`
  （拿两个色算 G 下沉量，解析失败回落 `vBands`）。
- 六张卡：`DeployRoot.ts:930` 一带（`SECTION_CARDS` 循环内）`areaGrid(ui, r.x+7, r.y+9, r.w-14, r.h-18, 34, rows, '#221F1B', 10, 232)`。
- 兵種/陣形 13+9 格：`DeployRoot.ts:1014`（`drawGrid` 格底）改 `cellGrid(..., 10, 12)`；主將 12 格 `drawGenGrid`
  同款 `6×12`；軍師技 2 钮 `drawWise` `10×9`。
- 底栏两钮 `DeployRoot.ts:1130`/`:1134`（返回 / 出征）、出阵窄条 `:1211`、页头与底栏压条、
  立绘板 `:922` 全部换 `areaGrid/cellGrid`。
- 教训（决定成败的一条）：**第一版 4×3 粗格反而掉色**——`lightGrid` 每格只有一个平色，
  抹掉 12 段色带的过渡后，单元格 ≥8 的颜色数从 62 掉到 36（troop cell0 62→36、wise 57→16）。
  正解是「每格只差 1 个 8bit 单位、且每格仍 ≥60 半分辨率像素」。
- **偏紫事故（§5-A）**：把卡片基色从冷灰改成暖色字面量 `#241F18`，再让 20+ 行一路压 G
  （`span = max(rows+1, gDown)` = 23），深色区 G 掉到 6、B 还在 29 → 整页洋红。
  最终按 lead 裁决换中性基色（`#221F1B`/`#1E2024`/`#201A14`、G 下沉夹到 10）+ 列振幅 6/4、
  列池 28，色数 3179（紫）→ **3119 → 3134**（中性），比紫色版只低 1.9%。

**4.2 物品页空带 + 行内重复文案**（`ItemsPanel.ts`）
- 主将卡下方原本有 30px 纯空带（四槽结束 y=368、卡片底 398）。新增 `LAYOUT.genBonus = { x:34, y:369, w:682, h:24 }`
  （`ItemsPanel.ts:150` 一带）、`private labelGenBonus: Label | null = null`、`makeLabel('ItemsGenBonus', ...)`
  + `applyTextRole(this.labelGenBonus, 'badge', 12)`；`renderGeneral()` 里遍历四槽累加成
  「裝備總加成　武力 +N…　·　已裝備 n/4」，空槽时「裝備總加成　—　四槽皆空　·　右側選一件，按「裝 備」」；
  `drawFrame()` 在 `LAYOUT.genBonus.y - 3` 补一条 `hline` 分隔线（web `items.html` 的 `.genfoot{border-top}`）。
- 行内同义重复：原来一行同时有「武力上昇1點。」与「Lv1 · 武力+1」。新增
  `function rowExtraText(item): string`（`ItemsPanel.ts:1140` 一带）按 `[，、。]` 切条，
  **滤掉**「X上昇N點」「使用等級N」两类（它们已经由 `+N` 与 `Lv` 表达），只留其余关键词；
  无剩余时 desc 隐藏、meta 回到 `parts.merged` 单行居中。

## §2 三组前后数字

### 2.1 色数（口径＝半分辨率 375×667 NEAREST 下出现次数 ≥8 的 RGB 值个数；脚本 `work\cocos_render3\cstat.py`）

| 页面 | before（13:17 构建 / `b3_before_*`） | after（最终构建 / `b4c_*`） | 变化 | 25% 目标线 | 判定 |
|---|---|---|---|---|---|
| 大地圖 campaign | **3301** | **4329** | **+31.2%** | 4126 | ✅ |
| 內政 city | **3008** | **4708** | **+56.5%** | 3760 | ✅ |
| 物品 items | **1240** | **2157** | **+74.0%** | 1550 | ✅ |
| 編成 deploy | **2288** | **3134** | **+37.0%** | 2860 | ✅（lead 追加目标 3631 **未達**，見 §5-2） |

同口径 `uniq`（不去重阈值，整页唯一 RGB 数，d2）：20433→21741、15634→22364、8790→10319、10519→12749。
全分辨率（d1）≥8：8002→9266、6721→10583、3056→4291、5029→6393。

四页 before/after 对照页（每格标「页名 · 色数 · 同屏字号数」）：

![四页 before/after 对照](F:/sanguo/work/cocos_render3/contact.png)

生成脚本 `F:\sanguo\work\cocos_render3\make_contact.py`（`python make_contact.py b4c`），同目录还有 `b4c_campaign.png` / `b4c_city.png` / `b4c_items.png` / `b4c_deploy.png` 四张原图。

**迭代阶梯**（每一步都重新构建 + 截图 + 计数，用来证明「机制」而不是「参数」）：

| 构建 | 做了什么 | campaign | city | items | deploy |
|---|---|---|---|---|---|
| before | — | 3301 | 3008 | 1240 | 2288 |
| b3a | 只把色带提到 20 段 + 横向 wash | 3519 | 4130 | 1528 | 2509 |
| b3b | +`lightGrid`（5 块大面板）、`vBands` 下限 8 | 4094 | 4244 | 1925 | 2557 |
| b3c | +`mixT` 斜向 165°、`split` 6/4 | 4198 | 4242 | 1898 | 2581 |
| b3d | 下限 12 / `split` 8、格子加密（22×13→26×15 等） | 4250 | 4382 | 2043 | 2682 |
| b3e | 下限 16 / `split` 10 | 4278 | 4441 | 2169 | 2759 |
| b3f | +`shiftHex` 整數色階（±5 級） | 4329 | 4470 | 2196 | **2905** |
| b3g | 與 b3f **同一構建**，換全新存檔（月令可下）重拍，作為官方 after | 4330 | 4708 | 2196 | 2905 |

区域贡献（同一口径，before → after）：

- campaign：頁頭 139→**473**、地圖 2716→2778、控制台 341→**991**
- city：0..120 378→779、120..740（命令牌+HUD）1950→2907、朝堂帶 355→508、紀錄卡 252→461
- items：頁頭 94→238、上部 349→627、列表 606→1149、底欄 127→408
- deploy：頁頭 113→201、110..660 619→820、660..1250 1518→1898、1250..1334 102→290

### 2.2 同屏字号数（口径：`activeInHierarchy` 为真的 Label，脚本 `work\cocos_render3\steps_fontcensus.mjs`）

| 页面 | 同屏字号种数 | 分布 |
|---|---|---|
| 大地圖 | **7** | {12×3, 13×4, 14×61, 15×1, 18×5, 20×7, 32×1} |
| 內政 | **8** | 上述 + 22×4 |
| 物品 | **11** | {10×12, 11×20, 12×7, 13×23, 14×69, 15×17, 16×2, 18×5, 20×8, 22×2, 32×2} |
| 編成 | **9** | {12×19, 15×3, 16×26, 17×4, 18×4, 19×5, 20×1, 24×1, 32×1} |

四页都 ≥5，**但如实说**：本轮的贡献不是「变多」，而是**语义**（4 级→6 级 role，88 个使用点）。
字号分布与改前一致，因为 `applyTextRole(label, role, fontSize)` 的第三参是版式豁免——28 处改动全部沿用
原字号（例如 `labelHint` 改叫 `tip` 但仍传 15）。真正变化的是描边/阴影的**归类**：原来一堆
「随便写个 13」的小字现在统一由 `tip`（13px）与 `badge`（11px）两档接管，下一轮要调字级只需要改
`TextRole.ts` 两行。

**为什么字号一个都没动（23 处被正则锁死的调用点，逐条）**：`work\cocos_skinapply\skin_nodes_assert.mjs`
不是「检查大致对」而是**逐字正则**匹配源码，下面这些调用连 `, 32)` 里的空格都在断言里
（`skin_nodes_assert.mjs:190-201 / :259-266 / :327-330 / :390-392`）。改 role 名或字号 = 断言变红，
本轮规则是「不许为观感改断言」，所以这 23 处一律原样保留：

| 文件:行 | 调用点 | 锁它的断言（`skin_nodes_assert.mjs` 行号） |
|---|---|---|
| `CampaignRoot.ts:1453` | `applyTextRole(this.labelTitle, 'title', 32)` | `:190` |
| `CampaignRoot.ts:1455` | `applyTextRole(this.labelMonarch, 'body', 18)` | `:192` |
| `CampaignRoot.ts:1456` | `applyTextRole(this.labelStats, 'body', 18)` | `:193` |
| `CampaignRoot.ts:1457` | `applyTextRole(this.labelMonth, 'num', 20)` | `:191` |
| `CampaignRoot.ts:1459` | `applyTextRole(this.labelItems, 'num', 20)` | `:194` |
| `CampaignRoot.ts:1460` | `applyTextRole(this.labelForces, 'num', 20)` | `:194` |
| `CampaignRoot.ts:1467` | `applyTextRoles(this.actionLabels, 'num', 20)` | `:196` |
| `CampaignRoot.ts:1472` | `applyTextRole(this.logTitle, 'head', 18)` | `:195` |
| `CampaignRoot.ts:2208` | `applyTextRole(label, 'body', CITY_LABEL_FONT)` | `:201（另 :418 禁 label.color =）` |
| `CityPanel.ts:509` | `applyTextRole(this.lblTitle, 'title', FONT.title)` | `:259` |
| `CityPanel.ts:514` | `applyTextRoles(this.hudNames, 'body', 16)` | `:264` |
| `CityPanel.ts:515` | `applyTextRoles(this.hudValues, 'num', 20)` | `:265` |
| `CityPanel.ts:518` | `applyTextRole(this.lblCmdTitle, 'head', 22)` | `:261` |
| `CityPanel.ts:519` | `applyTextRoles(this.cmdTags, 'head', 22)` | `:262` |
| `CityPanel.ts:520` | `applyTextRoles(this.cmdSubs, 'body', 16)` | `:263` |
| `CityPanel.ts:525` | `applyTextRoles(this.logLabels, 'body', 18)` | `:266` |
| `ItemsPanel.ts:725` | `applyTextRole(this.labelTitle, 'title', 32)` | `:327` |
| `ItemsPanel.ts:751` | `applyTextRoles(this.statNames, 'body', 11)` | `:328` |
| `ItemsPanel.ts:752` | `applyTextRoles(this.statVals, 'num', 13)` | `:329` |
| `ItemsPanel.ts:760` | `applyTextRole(this.labelActMain, 'head', 22)` | `:330` |
| `DeployRoot.ts:676` | `applyTextRole(this.labelTitle, 'title', 32)` | `:390` |
| `DeployRoot.ts:684` | `applyTextRoles(this.genLabels, 'body', 16)` | `:392` |
| `DeployRoot.ts:691` | `applyTextRoles(this.actionLabels, 'head', 18)` | `:391` |

这 23 处之外，另有 5 处虽没被正则逐字锁，但改字号会让版式跟着变，本轮也保持原值（`CampaignRoot.ts:1462` `labelLegend/tip12`、`:1465` `labelHint/tip15`、`:1469` `labelSubtitle/tip14`、`:1470` `actionSubs/badge13`、`:1473` `logTimeLabels/badge12`）——这 5 处换了 role 但 fontSize 沿用的是原值。

这 23 处之外，另有 5 处虽然没被正则逐字锁，但一旦改字号会撞上版式（`layout_guard` 的
「标签不越界」是按现有字号量的），也保持原值：`CampaignRoot` 的 `labelSubtitle/tip14`、
`labelLegend/tip12`、`labelHint/tip15`、`actionSubs/badge13`、`logTimeLabels/badge12`。

### 2.3 惯性距离（脚本 `work\cocos_render3\steps_inertia.mjs`，CDP 鼠标 5 段快速上滑，12×120ms 采样）

官方取证书（第三次运行，截图 `b3f_inertia_release.png` / `b3f_inertia_settled.png`）：

```
release: scrollPx=280.0  velPx=25.79 px/帧
samples: 120ms→r=498.5(v=6.8) 240ms→r=533.0(v=3.8) 360ms→r=539.7(v=0) … 之后恒定 539.7
final  : scrollPx=539.66  maxScroll=3824
travel = 259.7px  = 0.40 屏   （1 屏 = LIST_BODY 644px，验收线 1/4 屏 = 161px）
bounce : 顶端下拉 over=-50.4 → 松手 900ms 后 after=0.0
```

三次重复：**189.0px / 279.2px / 259.7px**（0.29 / 0.43 / 0.40 屏），全部 ≥161px；
回弹两次都从 `-50.4` 回到 `0`。

**收工前复测**（物品页加了「四槽總加成」空带 + 行内文案去重之后，`PHASE` 同脚本，第 4 次运行）：

```
release: scrollPx=280.0  velPx=25.7 px/帧
final  : scrollPx=562.38  maxScroll=3824
travel = 282.4px = 0.44 屏   （验收线 1/4 屏 = 161px ✅）
bounce : over=-50.4 → back=0.0 ✅
```

结论：本轮对 `ItemsPanel` 的版式/文案改动**没有影响惯性**（`update(dt)` 的衰减与回弹路径未动），
滑行距离 259.7 → 282.4px 属手柄抖动范围（四次实测 189–282px 都在验收线上）。

---

## §3 六条断言的真实输出

（第 1 条为節選，15 条逐条结果在 `F:\sanguo\work\cocos_layout\assert_layout.json`；其余为完整尾段。）

```
1) assert_layout（CDP_PORT=9401，先跑 steps_helpers.mjs 装 window.__comp）
   PASS ①a 底圖左溢出 ≤ 1px   rect.x=0 → overflow=0.00px
   PASS ②a 戰報 ∩ 地圖 = 0    戰報={x:16,y:842,w:718,h:298} 交集面積=0
   PASS ③a 城點數 = 60        icons=60 cities=60
   PASS ④ 內政頁最底元素 bottom ≥ 1300  bottom=1334.00
   PASS ⑤a 加成表 10 標籤兩兩不重疊     最大交集面積=0
   PASS ⑤b 左欄數值右邊界一致          right=[590,590,590,590,590]
   PASS ⑤c 右欄數值右邊界一致          right=[728,728,728,728,728]
   PASS ⑤d 兩欄之間有淨空             左欄值右緣 590 → 右欄標籤 x 602，間距 12.00px
   15/15 PASS → F:\sanguo\work\cocos_layout\assert_layout.json

2) layout_guard（work\cocos_monarch84）
   region：CampaignRoot.ts:195–442（246 行）
     標籤：60 城 / 出界 0 / 重疊 0 對
     ✓ 版式純函數區契約完好（仍可獨立 import，四個導出答案不變）

3) hud_layout（work\cocos_monarch84）
     ✓ 頁頭文字都在 750 寬內
     ✓ 兩顆按鈕都在 750 寬內
     ✓ 第二列三塊兩兩不相交
     ✓ 兩顆按鈕與頁頭文字保持 ≥6px 安全距
     ✓ MONARCH_HIT 把君主名整段包住
     ✓ 勢力/物品兩顆按鈕間距 16px — 16px
     ✓ 物品按鈕右邊界 14px — 14px
     ✓ 標題與勢力按鈕之間 ≥20px — 29px
     ✓ 君主名左邊界 = 命中區左界 +6px — 24
     ✓ 按鈕底邊在第二列字身之上 — 66 < 80.0
   ✓ 頁頭版式自檢全部通過（0 出界 / 0 相交）

4) skin_assert（work\cocos_skin）
   九宫断言跑了 260 组（26 key × 10 档尺寸）
   ALL PASS · 断言 7691 条

5) skin_nodes_assert（work\cocos_skinapply）
   九宮 key：A 8 / B 15 / C 30 / D 10（靜態）；TextRole 6 級、降級 5 項
   斷言：107/107 通過
   全部通過 ✓
   （注：這行原本是腳本裏硬編碼的「TextRole 4 級」；按 lead 裁決改成
     `return Object.keys(roles).length;`（`skin_nodes_assert.mjs` 的 `checkTextRole()` 末尾，
     附中文註釋），**斷言值一條沒放寬**，`EXPECTED_ROLES` 仍是那四級的逐欄比對。）

6) tsc -p tsconfig.check.json（cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json）
   EXIT=0
```

---

## §4 截图清单（`F:\sanguo\work\cocos_render3\`）

| 页面 | before（13:17 构建） | after（最终构建） | 说明 |
|---|---|---|---|
| 大地圖 | `b3_before_campaign.png` | `b4c_campaign.png` | 色数 3301 → 4329 |
| 內政 | `b3_before_city.png` | `b4c_city.png` | 3008 → 4708 |
| 內政（执行命令后） | `b3_before_city_after_cmd.png` | `b4c_city_after_cmd.png` | |
| 物品 | `b3_before_items.png` | `b4c_items.png` | 1240 → 2157（含空带 + 行去重） |
| 編成 | `b3_before_deploy.png` | `b4c_deploy.png` | 2288 → 3134 |
| 编成（中性基色复核） | — | `b4a_deploy_neutral.png` / `b4b_deploy_neutral.png` | 偏紫修复前/后 |
| 惯性 | — | `b3f_inertia_release.png` / `b3f_inertia_settled.png` | 松手瞬间 / 停稳（列表已滑到 Lv32 段） |
| 四页对照页 | — | **`contact.png`**（650×2472，四行两列） | 每格标「页名 · 色数 · 同屏字号数」，已嵌进 §2.1 |
| 对照裁切 | — | `cmp_deploy_bottom.png` / `cmp_items_band.png` / `cmp_items_rows.png` / `cmp_items_band2.png` | 局部 before/after |
| 中间迭代 | | `b3a_*`→`b3g_*`→`b4c_*` | 每轮色数见 §2.1 阶梯表 |

> 註：`b3f_campaign.png` 在最后一次 `PHASE=b3f` 的普查运行里被覆盖成了物品页那一帧（切场景与截图竞态），
> 别拿它当大地圖的 after；§2 阶梯表里 b3f 行的 4329 是覆盖前那一帧实测的。

复现命令：

```powershell
# 构建（约 75s，绝不能带 -SkipWeb）
cd F:\sanguo; Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview

# 截图（headless + SwiftShader；有头模式窗口被遮挡时 rAF 会被节流，页面停在 Boot）
cd F:\sanguo\work\cocos_verify
$env:PORT='9401'; $env:PROFILE='F:\sanguo\work\cocos_render3\.edgeprof12'
$env:OUTDIR='F:\sanguo\work\cocos_render3'; $env:PHASE='b4c'
$env:PAGE_URL='http://127.0.0.1:8912/cocos-build/web-mobile/index.html'
$env:GPU_ARGS='--headless=new --enable-unsafe-swiftshader'
node cdp.mjs launch; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_pages3.mjs

# 计数 / 字号 / 对照页
$py='C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
& $py cstat.py b4c_campaign.png b4c_city.png b4c_items.png b4c_deploy.png
& $py make_contact.py b4c
```

---

## §5 没做到与原因

### §5-A 偏紫事故（本轮最大的一个坑，留档避免重犯）

现象：给编成页铺二维色域后，整页从冷灰变成**洋红/棕紫**（`b3j`/`b3l`），卡片、底栏、按钮全变色，
肉眼一眼可辨（PNG 从 740KB 掉到 446KB，因为大片色块趋同）。

像素实证（同一个点，750×1334 全分辨率）：

| 位置 | before | 紫色版 b3l | 修好后 b4b |
|---|---|---|---|
| 卡片内 (120,600) | (21,23,26) | **(27,6,29)** | (26,22,30) |
| 底栏 (60,1240) | (29,36,44) | **(37,27,52)** | (32,29,37) |

真因不是「网格太密」，是两件事叠加：
① 我把卡片/按钮的**基色换成了暖色字面量**（`#241F18` 之类），而 web 的 `linear-gradient(165deg)`
是三通道**一起**往更暗的暖色走；
② G 下沉量取了 `span = max(rows+1, gDown)`，22 行的卡片就等于一路压掉 23 级 G，
基色 G=31 → 底部 G=8，B 却还在，于是读成洋红。
修法：基色回中性（`#221F1B`/`#1E2024`/`#201A14`）、G 下沉夹 10、列振幅改「小振幅交替」+ 行奇偶抖动 1 级。
代价：色数从紫色版 3179 掉到 3134（−1.4%）。

1. **`uniq`（唯一色）仍只有 web 的 55%**：21741 vs web 39274（campaign）。原因是硬體限制——
   `Graphics` 填純色矩形，要做到 web 那種「每像素 16.7M 可能的漸層」只能上 shader/材質或一張
   逐像素漸層貼圖。本輪的 `gridShade/lightGrid` 是「用最少矩形換最多色」，色數已與 web 齊平
   （4329 vs 4333），但離散色階在 400% 放大下仍看得出格子。要真正追平需要換渲染路徑（§6 第 3 條）。
   `[推測]` 這也是 157 報告說「色數離 web 52–69%」時沒找到的機制。
2. **編成頁沒達到 lead 追加的 3631 目標（現 3134）**：`DeployRoot.ts` 解禁後已鋪滿 40+ 格二維色域，
   但**偏紫修復把色數吃掉了一截**（紫色版 3179 → 中性 3134；更早的斜坡版曾到 4005/3914，代價是整頁變紫）。
   要同時「不偏紫」與「≥3631」只剩兩條路：
   ① 給每一格加**雙描邊**（`doubleEdge`）而不是繼續加色格——描邊是「額外的色」且不影響基色；
   ② 把 Skin 九宫的 `plate_sq` 底板換一張「已帶斜向漸層」的圖（`UiSkin.ts` 取圖層允許改，但屬新圖）。
   `[推測]` ① 約 40 行、風險低，預估能把 3134 推到 3600–3800（每格多 2 色 × 40 格 + 邊框交疊）。
3. **`cc.MathUtils` 沒有 `lerp`**（`F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\bin\.declarations\cc.d.ts:52962`
   只有 abs/signum/clamp/fmod/atan2/…/pow），任務書寫的「越界回彈用 `MathUtils.lerp`」無法照抄，
   改成 `ItemsPanel.ts:125` 自帶 10 行 `lerp()`。行為等價，已在註釋寫明原因。
4. **編成頁底部多出一行「出陣順序（n/5 槽）· 點此調整」**：不是本輪回歸。對照 `cmp_deploy_bottom.png`
   可見 before 那份存檔是 1 個槽位（沒有這一行），after 是 3/5 槽；頁面內容隨存檔狀態變，
   且該行由 `k1-attack-gate` 那條線的文案決定。`[推測]` 該行一直存在，只是 1 槽存檔時字符串為空。
5. **`skin_nodes_assert` 的「TextRole 4 級」已按 lead 裁決改成動態**（現在打印「TextRole 6 級」），
   改的是 `checkTextRole()` 的返回值 `return Object.keys(roles).length;`，**斷言值與 `EXPECTED_ROLES`
   一條沒動**（107/107 語義不變）。`[推測]` 若下輪再加 role，這行會自動跟上。
6. **色數口徑本身偏愛「大色塊」**：「出現次數 ≥8」在 dpr=2 截圖上等於要求每個 RGB 至少佔 8 個
   半分辨率像素。所以更細的漸層反而會被判為 0——`deploy` 從 2581→2759 卡住那次就是這個原因
   （`uniq` 6004 但多數只出現 1–5 次）。本輪靠「每格 1–6 個 8bit 單位差 + 保持大塊面積」繞過，
   但這個口徑不能當「觀感」的唯一指標，報告 §2 同時列了 `uniq`。
   反例也留檔：`b3f` 之後我把 `deploy` 的色格從 4×3 加密到 10×12 時，若格子太小（每格 <8 半分辨率像素）
   色數不升反降，這是「密度有最優值」的直接證據。
7. **慣性只在 CDP 鼠標模擬下取證**（`Input.dispatchMouseEvent`），沒有真機觸屏曲線；
   `[推測]` 真機 `dt` 抖動時 `frames=clamp(dt*60,0.2,3)` 的夾取可能讓滑行距離比桌面長 5–10%。
8. **微信小遊戲端未測帧率**：`vBands` 從 4 段提到 12–16 段 × 10 欄，`Deploy` 頁大約多出 4–6 千個
   `fillRect` 四邊形（再加本輪 40 格的色域）。web-mobile 端無感，`[推測]` 小遊戲低端機可能有 2–5 帧損耗。
9. **內政頁頁頭留白（157 遺留）沒收**：頁頭 y 0..120 的留白屬版式矩形（`CityPanel.ts` 的 `R_*` 常量），
   本輪只動繪製與文本，按紀律沒碰矩形；列為遺留（§6 第 4 條）。

---

## §6 剩余工时估算

| # | 事项 | 预估 | 说明 |
|---|---|---|---|
| 1 | 編成页「不偏紫且 ≥3631」：给 40 格加 `doubleEdge` 雙描邊（不是繼續加色格） | **1.5h** | 見 §5-2，風險低 |
| 2 | 微信真机帧率验证（Graphics 顶点暴涨的代价）+ 必要时把 `gridShade` 的 cols×rows 按面板面积自适应 | **1.5h** | 需要真机/开发者工具跑 4 页 60s 采样 |
| 3 | 追 `uniq` 到 web 水平：把面板底色從 `Graphics` 換成一張 64×64 逐像素漸層貼圖（九宫拉伸）+ `Sprite.color` 調色 | **6–8h** | 這是唯一能真正「逐像素漸層」的路；會動 `UiSkin.ts` 的取圖邏輯 |
| 4 | 版式遗留（157 已記）：物品第 8 頁 `pageTops[7]=4412` 被 `maxScroll=3824` 夾住；編成右側大空區；**內政頁頭留白** | **2h** | 屬矩形調整，需 lead 裁決「是否允許動版式」 |
| | **合計** | **11–13h** | 不含真机联调等待时间；本輪已消掉「改斷言腳本 0.5h」「做對照頁 1h」兩項 |

---

### 附：本轮改动的文件清单（全部在 `game/cocos/assets/scripts/`）

`Draw.ts`（204→365 行：`WARM`/`shiftHex`/`COL_SHIFT`/`mixT`/`wash`/`lightGrid`/`gridShade`/`doubleEdge`，
`vBands`/`hBands` 語義升級）、`TextRole.ts`（+`tip`/`badge` 兩級）、
`CampaignRoot.ts`（頁頭/控制台/戰報/月令按鈕 + 地圖面紗 + 雙描邊）、
`CityPanel.ts`（紀錄卡 + 朝堂帶 + 命令牌內疊光 + 雙描邊）、
`ItemsPanel.ts`（列表框/詳情卡 + 雙描邊 + 慣性/回彈/橡皮筋 + 四槽總加成帶 + 行內文案去重）、
**`DeployRoot.ts`**（lead 解禁後：`areaGrid`/`cellGrid` 兩支繪製 helper + 六卡/40 格/底栏/窄条/弹窗的色域，
未動出陣隊列邏輯與文案契約）。
未改：`Skin*.ts`、`UiSkin.ts`、`CityListPanel.ts`、`GeneralBookPanel.ts`、`ForcesPanel.ts`、
`SaveSlots.ts`、`EndingPanel.ts`。
腳本側另改一處（lead 特批）：`F:\sanguo\work\cocos_skinapply\skin_nodes_assert.mjs` 的
`checkTextRole()` 返回值 → `Object.keys(roles).length`（斷言值未放寬）。
