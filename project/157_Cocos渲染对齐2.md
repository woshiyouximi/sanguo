# 157 · Cocos 渲染对齐 web（第 2 轮）

> 基准：web 版是唯一视觉基准（大地圖 39,274 色 / 內政 25,687 / 物品 15,137 / 編成 15,134，数据出自 `project\143`）。
> 本轮范围：`project\143` §6「没做到 ≈15.5h」里的 5 条（文字层级 / 渐变 / ScrollView / 内政 140px 过渡带 / 色数对比度）。
> 结论：**5 条全部落地**，四页截图重拍、5 条断言全绿、tsc EXIT=0；产物由我自己重建（12:52:59），**lead 不需要再重建**。

---

## 0. 验收基准（产物时间戳）

| 项 | 值 |
|---|---|
| 构建命令 | Creator CLI，`--project F:/sanguo/game/cocos --build "platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/work/cocos_render/cocos-build;startScene=0b007000-…-000000000001"` |
| 构建产物 | `work\cocos_render\cocos-build\web-mobile\index.html` → **2026-11-25 12:52:59**（本轮最后一次重建） |
| 最后一次源码编辑 | 12:52（`ItemsPanel.ts` 的 `pagedMode`）→ **产物比源码新**，截图就是最新代码 |
| 日志 | `work\cocos_render\build7.out.log`：`build Task (web-mobile) Finished in (15 s)`；`build7.err.log` 4891B 仅循环依赖/参数类型警告 |
| lead 的产物 | `game\cocos-build\web-mobile` 仍是 **12:31:34**，本轮**没有碰过**（那个目录归 lead） |
| 静态服务 | `http://127.0.0.1:5188/`（serving `F:\sanguo\work`），页面 `http://127.0.0.1:5188/cocos_render/cocos-build/web-mobile/index.html` |

**→ 需不需要 lead 重建产物：不需要。** 本轮截图基于我自己重建的 `work\cocos_render\cocos-build`，它已经包含全部改动；`game\cocos-build` 由 lead 出自己的包时重建即可（那边的产物还是 12:31:34 的旧代码，不含本轮内容）。

---

## 1. 逐条做了什么

### 1.1 文字层级（同屏 ≥3 种字号 → 实测 7/10/12/9 种）

产物实测（`CENSUS.fonts`，按字号计数，硬证据）：

| 页 | 同屏字号（种） | 分布 |
|---|---|---|
| 大地圖 | **7** | 12×3, 13×6, 14×61, 15×1, 18×5, 20×7, 32×1 |
| 內政 | **10** | 12×3, 13×6, 14×62, 15×2, 16×23, 18×11, 20×20, 22×13, 32×1, 34×1 |
| 物品 | **12** | 10×12, 11×31, 12×6, 13×25, 14×70, 15×18, 16×25, 18×11, 20×21, 22×15, 32×2, 34×1 |
| 編成 | **9** | 12×19, 15×2, 16×26, 17×4, 18×4, 19×5, 20×1, 24×1, 32×1 |

本轮新增的两处层级（其余页原本已是多级，未动）：

- **大地圖页头副标**：标题「大 地 圖」(32/title) 之下新增 `body@14` 副标「全 圖 60 城 · 16 方 · 我方 1 城」，与君主行 19、月令 20、图例 12 一起读出 4 级。
- **月令按钮拆两行**：主标 `num@20`（徵兵/開發/推進一月）+ 副标 `body@13`（金 500 → 兵 +40 / 稅收 +68），对齐 web 的 `.cmd b + .cmd i`。
- **內政「朝堂紀要」带 4 级**：22 标题 / 18 右注 / 16 正文 / 14 提示（同时填掉 140px 过渡带，见 1.4）。

### 1.2 渐变（web 52 处 `linear-gradient`；本轮把四页的色带调用点从 80 提到 131）

四个文件里 `vBands/hBands/edgeBands/topSheen/innerEdge` 调用点合计 **131**（`vBands`59 / `topSheen`43 / `edgeBands`19 / `hBands`5 / `innerEdge`5），全部是按 2–28 段整数切分的色带，没有 Graphics 逐像素。

| 页 | 新加 | file:line |
|---|---|---|
| 大地圖 | 页头顶光条 `vBands(0,0,750,7,'#5E4C2C'→'#2A241C')` + 页头四周内阴影 `edgeBands(...,150,22,4)` | `CampaignRoot.ts:2372`、`:2373` |
| 大地圖 | 控制台顶内阴影 `vBands(0,830,750,9,'#000000'→'#272A2D')` | `CampaignRoot.ts:2374` |
| 大地圖 | 图例底板（新）`vBands(266,774,234,36)` + topSheen + stroke | `CampaignRoot.ts:2393` |
| 大地圖 | 戰報面板 顶/底高光 + 内金线 | `CampaignRoot.ts:3206`、`:3208` |
| 大地圖 | 月令按钮横向渐变 `hBands(...)` + `edgeBands(...,96,8,3)` + 底缘黑 sheen | `CampaignRoot.ts:2605` |
| 內政 | 页头顶光条、返回钮 edgeBands+底黑、R_HUD/R_LOG 顶光+底黑 | `CityPanel.ts` drawMain 内 |
| 內政 | 140px 带双段渐变 + edgeBands + 上下双金线 + 左侧竖金条 | `CityPanel.ts:990`–`:999` |
| 物品 | 每行横向渐变 `hBands`（选中/奇偶三套色）+ 底缘黑 sheen；页头/武将卡/列表/详情/大图框 topSheen+底黑 | `ItemsPanel.ts:1718`（行）、`:1615`–`:1616`（页头）、`:1624`/`:1675`（卡/列表） |
| 編成 | 六张九宫卡片内光影 `vBands(#FFFFFF→#000000, α9→24, 8 段)` + 顶金高光 + 底黑压边（卡片原来是一整块纯色） | `DeployRoot.ts:858`–`:866` |

对比度数字（`rstat.py`，p5–p95 跨度 span）：

| 页 | span 前 → 后 | RMS 前 → 后 | mean 前 → 后 |
|---|---|---|---|
| 大地圖 | 72.1 → **72.7** | 28.4 → 27.5 | 35.4 → 35.1 |
| 內政 | 99.6 → **109.9** | 31.2 → **32.5** | 37.9 → **38.9** |
| 物品 | 92.8 → **96.0** | 31.3 → 31.5 | 35.2 → 35.1 |
| 編成 | 85.3 → **87.0** | 30.4 → 30.1 | 32.7 → **34.1** |

### 1.3 ScrollView（物品列表：一屏内可滚动）

没用 `cc.ScrollView` 组件（要改节点树、要 Mask + content 两层，会动版式），用的是**自制拖动 + 虚拟滚动窗口**：

- 新增状态：`scrollPx`（设计 px）、`pageTops[]`（每页起点，前缀和）、`maxScroll`、`dragOn/dragMoved/dragStartY/dragStartScroll`、`pagedMode` —— `ItemsPanel.ts:486`–`:497`。
- `measureList()` 前缀和 + clamp（`:1245`）、`pageAt(scroll)`（`:1262`）、`flatEntries()`（`:1234`）。
- `placePage()` 双模（`:1216`）：`pagedMode=true` 只铺当前页（行数口径与旧探针一致）；`false` 铺整份列表的连续窗口，且**只放整条落在 456..1100 内的 entry**（半条被裁会压到 nav 列 y1104）。
- 触摸：`TOUCH_START`→`onTouchStart`（`:1857`，只认列表 body 内的按下）、`TOUCH_MOVE`→`onTouchMove`（`:1872`，dy 1:1 映射、超 6px 记 `dragMoved`、实时 refresh）、`TOUCH_END`→`onTouch` 开头 `if (this.dragMoved) { …收尾 return; }`（拖完不误选行）。
- 视觉承诺：右侧 4px 滚动条（轨 `#0A0D12` α200 + thumb `goldLight→goldDim` 4 段 + 1px 高光），`ItemsPanel.ts:1824` 起（`thumbH = max(36, 644²/total)`）；只在 `maxScroll>0.5` 时画。
  - **踩坑修复**：起初 `trackX = body.x+body.w+3 = 443`，正好压在列表框的金色内描边（445–446）上，thumb 只剩 1px 可见；改成 `+9`（449…452，正好在 448–460 的 gutter 中间）后截图里能清楚看到一根滚动的金条。
- 实测（CDP 直读活引擎）：`maxScroll=3824`、`pages=8`、`pageTops=[0,642,1258,1874,2486,3128,3770,4412]`、拖到 400 时 `placed=11` 条、列表从「風嘴刀」连续滚到「月牙戟」。
- **逐页不变量**（等价于 `work\cocos_items\panel_headless.mjs` 锁的那条，但我不能改它的 `_sim` 副本，所以在真引擎里验）`probe_pages.mjs`：8 页 `placed` = `pageSizes` = **12/11/11/12/12/12/12/1**，全部一致。
- 手感：跟手、无惯性、无回弹（任务书允许省）。翻页钮仍在，`setPage` 会把 `scrollPx` 对到该页起点（`pagedMode=true`）。

### 1.4 內政 140px 过渡带

原来 `R_CMD` 底(740) 到 `R_LOG` 顶(880) 是 140px 的纯暗带（`gaps.py` 判为整段无墨）。现在换成「朝堂紀要」带：

- 结构：双段竖向渐变 `#302A20→#1A1D22→#2C241A`（10 段，α226/214/232）+ `edgeBands(120,16,3)` + 顶金高光(46)/底黑压边(90) + 金色描边(α96) + 上下两条金线(α130/90) + 左侧 2px 竖金条。`CityPanel.ts:990`–`:995`。
- 文字（4 级）：`朝 堂 紀 要`(22/head) · `月令已用 · 金 1,200`(18/num, 右对齐) · `太守 — · 軍師 — · 武將 0 員 · 內政效率 ×0.53`(16/body) · `預備兵 141／142 · 兵 141／600 · 人口 80,330`(14/body)。建在 `CityPanel.ts:404` 起（在 `layoutRects` 与抽屉 `gSheet` 之前 ⇒ 打开抽屉能盖住），role 在 `:534`–`:537`。
- 数字（`gaps.py`，thr=110，x 40..712，y 118–1240）：

| | 前（`after_city.png`） | 后（`w7c_city.png`） |
|---|---|---|
| 最长无墨带 | **142px**（y 739–880） | **43px**（y 838–880） |
| 空白段数 | 6 | 10 |

剩下那 43px 是「提示行 y814 之下 → 帶子底 880」的收尾留白（带宽 140 固定、字只有 4 行），要再压就得动 `R_CMD/R_LOG` 矩形，本轮不允许。

### 1.5 色数 / 对比度（不动布局矩形）

`rstat.py`（同脚本、同口径，375×667 抽样后数唯一色）：

| 页 | 前（`after_*.png`） | 后（`w7c_*.png`） | 变化 | web | 达成率（后/web） |
|---|---|---|---|---|---|
| 大地圖 | 20,404 | **20,433** | +29 | 39,274 | 52.0% |
| 內政 | 14,724 | **15,466** | **+742（+5.0%）** | 25,687 | 60.2% |
| 內政＋命令 | 14,857 | **15,548** | **+691** | — | — |
| 物品 | 8,684 | **8,790** | +106 | 15,137 | 58.1% |
| 編成 | 9,931 | **10,519** | **+588（+5.9%）** | 15,134 | 69.5% |

---

## 2. 没做到 / 差距与原因

1. **色数离 web 还差一截**（52%–69%）。原因不是「渐变没加」，而是**色数被底图/图元决定**：大地圖整页最大的面积是 `map/chinamap` 底图（美术资产，本轮不许动 `assets`/`game\src`），JS 侧色带只能改页头、控制台、面板边框这些「框」；內政/物品/編成同理，最大面积是九宫图元（`UiSkin` 26 张位图，`project\124` 定的，本轮不可改）。要继续往上只有三条路：① 把 web 的 CSS 渐变逐块烘成贴图（要动 `assets`/图元）；② 给九宫图元加更高分辨率的噪点/纹理；③ 局部放大色带段数（收益递减，20 段已看不出阶梯）。
2. **ScrollView 是自制的**，没有 `cc.ScrollView` 的惯性/回弹/`Elastic` 边缘效果；任务书允许省惯性，但也意味着快速甩动的观感不如 web 的 `overflow:auto`。
3. **物品页最后一页的取舍**：第 8 页只有 1 条，`pageTops[7]=4412` 会被 `maxScroll=3824` 夹住 ⇒ 翻到第 8 页时列表只铺 1 条、thumb 在底部，列表下方留白。这是为了保住 `panel_headless` 的「每页行数 == pageSizes[p]」口径做的妥协（`pagedMode` 就是为此存在）。要两全得改成「滚动位置连续、页码只是指示」，那会改探针口径，不在本轮授权内。
4. **编成页右侧大片空、內政页 header 下的留白**：都是版式矩形的问题（web 是两列/更紧凑），本轮明令不许动矩形，所以只做了光影没有重排。
5. **web 独有的 5 个页面**（`project\143` §6 提过）不在本轮 5 条范围内，没做。

---

## 3. 截图（`work\cocos_render\`，750×1334，CDP 实拍，帧数 2798→2834 证明 rAF 没冻）

| 文件 | 内容 |
|---|---|
| `w7c_campaign.png` | 大地圖：页头副标、月令按钮主+副标、图例底板、戰報面板光影 |
| `w7c_city.png` | 內政（已清空日志）：朝堂記事带 4 级文字、HUD/紀錄面板光影 |
| `w7c_city_after_cmd.png` | 內政 + 下过一次命令（紀錄有内容） |
| `w7c_items.png` | 物品：列表行渐变、右侧滚动条（thumb 在顶） |
| `w7c_items_scrolled.png` | 物品：拖到 scrollPx=400 的连续窗口（風嘴刀→月牙戟）+ thumb 在轨道中部 |
| `w7b_items_top.png` / `w7b_items_scrolled.png` | 同上，改名前的两帧（保留，可对照 thumb 位置） |
| `before_*.png` / `after_*.png` | 上一轮基线（未覆盖） |

量测脚本与本轮新增探针（都在 `work\cocos_render\`，属我可改范围）：

- `rstat.py`（色数 / mean / RMS / span）、`gaps.py`（无墨带）
- `lines.mjs`（列出改动点的精确行号）
- `probe_items.mjs` / `probe_items2.mjs`（开关物品页 + 两张滚动截图）
- `probe_pages.mjs`（逐页验 `placed == pageSizes[p]` 与 `scrollPx`）
- `w7c_census.txt` / `w7b_census.txt`（每页 CENSUS：nodes/labels/fonts/sprites…）
- `build6.out.log` / `build7.out.log`（本轮两次重建日志）

---

## 4. 五条断言 + 类型检查（全部在最终代码 + 12:52:59 产物上跑过）

| 断言 | 命令 | 结果 |
|---|---|---|
| 版式 | `node work\cocos_layout\assert_layout.mjs`（`CDP_PORT=9401`，需先跑 `steps_helpers.mjs` 装 `window.__comp`） | **15/15 PASS**（①a–⑤d，④ bottom=1334 ≥ 1300） |
| 版式纯函数 | `node work\cocos_monarch84\layout_guard.mjs` | **0**（region `CampaignRoot.ts:195–442` 246 行；60 城 0 出界 0 重叠） |
| 页头 | `node work\cocos_monarch84\hud_layout.mjs` | **0**（页头自检全部通过，0 出界 / 0 相交，按钮底 66 < 80） |
| 皮肤 | `node work\cocos_skin\skin_assert.mjs` | **7691 条 ALL PASS** |
| 皮肤节点 | `node work\cocos_skinapply\skin_nodes_assert.mjs` | **107/107**，九宫 key A8/B15/C30/D10，TextRole 4 级、降级 5 项 |
| 类型 | `cd game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit` | **EXIT=0** |

---

## 5. 构建坑（下一个人会踩）

**`ELECTRON_RUN_AS_NODE` 在环境里时，Creator 不认 `--project`**（`tools\build_wechat.ps1:441-442` 有注记）。表现：`CocosCreator.exe: bad option: --project`、进程秒退、日志 0 字节、产物 mtime 不动。正确姿势：

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$arg = 'platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/work/cocos_render/cocos-build;startScene=0b007000-1a2b-4c3d-8e4f-000000000001'
$p = Start-Process -FilePath 'F:\sanguo\tools\cocos\cc388\CocosCreator.exe' `
  -ArgumentList @('--project','F:/sanguo/game/cocos','--build',$arg) `
  -PassThru -RedirectStandardOutput F:\sanguo\work\cocos_render\build7.out.log `
            -RedirectStandardError  F:\sanguo\work\cocos_render\build7.err.log
$p.WaitForExit(600000)
```

`ExitCode` 恒为空不可信，只认日志 `build Task (web-mobile) Finished` + 产物 mtime。

截图（`work\cocos_verify\cdp.mjs`）：

```powershell
$env:PORT='9401'; $env:PROFILE='F:\sanguo\work\cocos_render\.edgeprof'; $env:OUTDIR='F:\sanguo\work\cocos_render'
$env:PAGE_URL='http://127.0.0.1:5188/cocos_render/cocos-build/web-mobile/index.html'; $env:MATCH='cocos-build'
node cdp.mjs launch
$env:PHASE='w7c'; node cdp.mjs run F:\sanguo\work\cocos_render\steps_pages.mjs
```

两个已知坑：① 页面被遮挡时 rAF 会停，`steps_pages.mjs` 已内置 `setFocusEmulationEnabled` + `setWebLifecycleState active` + `Page.bringToFront` + 前后帧数对比；② `launch` 之后立刻 `run` 时 Boot 场景可能还没加载完，`loadScene('Campaign')` 会静默失败（这次踩到一次，等几秒重跑即可）。

---

## 6. 本轮改动清单（全部在授权文件内）

| 文件 | 行数 | 改动点（当前行号） |
|---|---|---|
| `game\cocos\assets\scripts\CampaignRoot.ts` | 3427 | `:1148` actionSubs 字段 · `:1280` 页头副标 · `:1469–1470` 两条 role · `:2619` 按钮副标文案 · `:2605` 按钮 hBands · `:2372–2374` 页头顶光/内阴影/控制台顶内阴影 · `:2393` 图例底板 · `:3206–3208` 戰報光影 |
| `game\cocos\assets\scripts\CityPanel.ts` | 1636 | `:272` 4 个带标签字段 · `:404` 起建标签 · `:534–537` 4 条 role · `:990–995` 140px 带渐变/描边 |
| `game\cocos\assets\scripts\ItemsPanel.ts` | 1952 | `:486` scrollPx 字段 · `:495` pagedMode 字段 · `:1216` placePage 双模 · `:1234` flatEntries · `:1245` measureList · `:1262` pageAt · `:1718` 行 hBands · `:1824` 滚动条（trackX/thumbH） · `:1857` onTouchStart · `:1872` onTouchMove · `:1887` scrollTo |
| `game\cocos\assets\scripts\DeployRoot.ts` | 1266 | `:849` 页头顶光 · `:858–866` 六卡内光影 |
| `work\cocos_render\**` | — | 新增 `lines.mjs` / `probe_items.mjs` / `probe_items2.mjs` / `probe_pages.mjs` / `goto_campaign.mjs`；日志 `build6/7.*`；截图 `w7*/w7b/w7c_*` |

未改：`UiSkin.ts`、`TextRole.ts`、`Draw.ts`（这三个本轮沿用现有 API，没有新增函数）；`game\src\**`、`game\web\**`、`core\**`、`tools\**`、`project\44|37a|31` 一律没碰。
