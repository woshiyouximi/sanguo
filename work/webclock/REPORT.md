# web 调试台时间语义对齐原作（逐帧 T 时钟）报告

- 任务：把 `game/web/campaign.html`（web 调试台大地图）的时间语义改成与 38 版原作 / Cocos 端一致，补齐双端。
- 范围：只改 `game/web/campaign.html` 与 `game/tests/**`；未动 `game/cocos/**`、未动 `project/`、未构建 Cocos、未执行任何 git 命令。
- 结论：已完成并通过静态门禁与 CDP 实测。**page 端不再一次跑 12 个月**；大地图逐帧走 `T`（一年 3600 tick），`T==0` 自动进内政（年份 +1），「內政終了」只把 `T` 重设 3600；任意浮层打开时停表。
- 验证浏览器进程：**0**（已 `cdpweb.mjs close` + `reap.mjs --kill --match=edgeprof_webclock` 复核）。

---

## 1. 原作证据（复核 `work/orig_time/REPORT.md`）

| 语义 | 原作证据 | 证据行 |
|---|---|---|
| 大地图时间 = 每帧 −1 的计数器 T | `0x41B6B9/0x41B6C1` 减一、`0x41B6C6` 判 0 | `work/orig_time/REPORT.md:180` |
| 一年 3600 / 一月 300 / 一日 10 tick | `0x41B849` / `0x41B855` / `0x41B879` | `work/orig_time/REPORT.md:433`、`:459-461` |
| 月份现算 `floor((3600−T)/300)+1`，不储存 | `0x41B849–0x41B899` | `work/orig_time/REPORT.md:434` |
| 年份只在进内政时 +1（`0x4238C3`） | 唯一自增点 | `work/orig_time/REPORT.md:435`、`:512`、`:634` |
| 面板/模态打开时时间停 | `0x41BEC1` 等 | `work/orig_time/REPORT.md:244`、`:384`、`:530` |
| 「內政終了」= 只 `T=3600` + 切回大地图，不跑月份模拟 | `0x427FE0 → 0x427FD6 → 0x41BBF5` | `work/orig_time/REPORT.md:214-215`、`:437`、`:640` |
| 兵团每帧推进（与日历无关） | `0x41B127 → 0x41AFAB → 0x41AF58` | `work/orig_time/REPORT.md:295`、`:401`、`:641` |

---

## 2. 改动清单

### 2.1 `game/web/campaign.html`（改后 6363 行）

| 区域 | 行号 | 内容 |
|---|---|---|
| 页头状态栏 | :271 | stats 列新增 `時間 <b id="clockNow">T=3600</b>`（T 实时值/「內政 · 凍結」） |
| 内政门浮层 | :480-492 | 新增 `#interiorSheet`（class="sheet"，刻意无 `.x`/`data-close`，不可点背景关闭）；内含 `#intTtl/#intSub/#intBody/#intFoot`、`#btnInteriorCity`（跳 `city.html` 内政，返回仍在内政浮层）、`#btnInteriorEnd`（= 內政終了） |
| 时钟常量/状态 | :1022-1035 | `CLOCK_TICKS_PER_YEAR = 3600`、`CLOCK_TICKS_PER_MONTH = 300`、`CLOCK_TICKS_PER_DAY = 10`、`CLOCK_STEP = 1 / 60`、`CLOCK_STORE_KEY='sg_campaign_interior'`；`clockT/clockAcc/clockSpeed/clockPaused/clockInterior/clockLastMs/clockVisualAcc/overlayDepth/clockReady` |
| 浮层停表接线 | :2106-2135 | `hideSheets()` 保留内政浮层并维护 `overlayDepth`（keepInterior 时 scrim 保持可见）；`openSheet(id)` 内政期间别的抽屉不能顶掉它、结尾 `overlayDepth = 1`；`closeOverlays()` 内政期间不可关 |
| 时钟小节 | :2137-2320 | `clockSyncFromSave()`（`clockT = 3600 − ((month−1)%12)×300` 由存档月序反推）、`syncClockTFromMonth()`、`clockAttachToSave()`（新局/读档挂接 + 恢复内政 localStorage 标记）、`clockRunning()`、`advanceArmiesTick(n)`（兵团按 tick 推进）、`armyNeedsEvent()`、`monthTick()`、`stepClock(n)`、`enterInterior()`（:2242）、`showInteriorSheet()`（:2258）、`refreshClockText()`（:2280）、`refreshClockVisual()`（:2287）、`clockFrame(now)`（:2293；rAF 60Hz 固定步长循环） |
| 内政终了 | :2753-2774 | `endMonth()` 整支重写：流动中按它只提示；内政中则 `clockPaused=false; clockInterior=false; clockT=CLOCK_TICKS_PER_YEAR; clockAcc=0; …`＋日志/提示＋`render()`。**body 内无 `advanceMonth`** |
| 读档挂接 | :2053-2075 | `loadSlot()` 尾 `clockAttachToSave()`（`gameStarted=true` 之后） |
| 新局挂接 | :2878-2910 | `startNewGame()` 尾 `clockAttachToSave()`（新局 month=1 → T=3600、直接流动） |
| render | :2996、:3006、:3062-3076 | `$('ym')` 后 `refreshClockText()`；全宽按钮双形态：内政中＝「內 政 終 了」、流动中＝「時間流動中」（T 只由页头显示，避免与 10fps 刷新不一致） |
| 按钮行为 | :4082-4086 | `data-act="advance"`：未开局只提示；流动中只提示「時間正在流動：等內政時間到了（T=0）…」；内政中 → `endMonth()` |
| 内政终了按钮 | :4250 | `$('btnInteriorEnd').addEventListener('click', … endMonth())` |
| 月度流水线 | :5640-5790 | `advanceMonth(n, opts = {})`：新增 `clockMode = opts.clock === true`；`clockMode` 时跳过整月 `advanceArmies(save.armies)`/`marchSnapshot()`（兵团已按 tick 推进）；非 clockMode（`?adv=N`/`?auto=1`/`__r7.advance`/`__armyUi.adv`）在结尾 `syncClockTFromMonth()` 把 T 与 month 对齐 |
| 启动 + 探针 | :6329-6360 | `requestAnimationFrame(clockFrame);`、`window.__clock = { state, tick, reset }`（CDP 用） |

同时保留：`?adv=N`、`?auto=1`、`?demo=`、`?marchdemo=`、`?cmd=endmonth` 等既有调试入口。

### 2.2 测试

| 文件 | 行号 | 内容 |
|---|---|---|
| `game/tests/web_clock_parity.test.ts` | 新文件，6 test：:31、:38、:49、:58、:74、:82 | 源码级契约：常量 3600/300/10；rAF + `clockAcc += Math.min(dt, 0.25)` + `clockT = Math.max(0, clockT - n)`；**不得出现 `advanceMonth(12)`**；`monthTick()` 走 `advanceMonth(1, { clock: true })`；`enterInterior()` 有 `Saves.ensureYear`/`showInteriorSheet`；`endMonth()` 有 `clockT = CLOCK_TICKS_PER_YEAR` 且无 `advanceMonth`；`overlayDepth` 停表；Cocos 锚点（`private clockT = 3600;`、`update(dt: number)`、`stepClock`、`monthTick`、`enterInterior/endInterior`、`UI_PANEL_NODES`） |
| `game/tests/affairs_p1.test.ts` | :62-80（旧 F4 两测改写）、:8/:60 注释 | 旧契约「内政终了跑 advanceMonth(12)」改为「只重设 T=3600、不跑月份模拟」；保留「`?adv=N` 单月调试路径」 |
| `game/tests/affairs_f1f8.test.ts` | :42-46 | F1 改为「流动中只提示；`clockT = CLOCK_TICKS_PER_YEAR`；无 advanceMonth」 |
| `game/tests/cocos_p1_port.test.ts` | :83-90（[F4] web 测改写）、:13 注释 | 断言 `endMonth()` 无 `advanceMonth`、有 `clockT`、campaign 有 rAF 与 3600/300 常量 |
| `game/tests/rows85.test.ts` | :509-512 | R13 内政终了断言改为 `clockT = CLOCK_TICKS_PER_YEAR;` 且 `doesNotMatch(/advanceMonth\(/)` |

### 2.3 辅助脚本（不属交付代码，供复现）

- `work/webclock/_extract.mjs`：把 `campaign.html` 的 `<script type="module">` 抽成 `_campaign_check.mjs` 供 `node --check` 做语法门禁（已通过）。
- `work/webclock/steps.mjs`：CDP 验收脚本（见 §4）。
- `work/webclock/*.png`：实测截图；`console_steps.json`：浏览器 console dump（0 exception / 0 netFail）。

---

## 3. 与 Cocos 端字段对照

| 行为 | web（`game/web/campaign.html`） | Cocos（`game/cocos/assets/scripts/CampaignRoot.ts`） | 原作 |
|---|---|---|---|
| 计数器 | `clockT`（:1028） | `private clockT = 3600;`（:1566） | `T=[0x4C30E0]` |
| 累加器 | `clockAcc`（:1029） | `private clockAcc = 0;`（:1568） | 逐帧 −1，无累加器 |
| 速度 | `clockSpeed = 1`（:1030） | `private clockSpeed = 1;`（:1570） | 无（固定 −1） |
| 暂停（内政/窗口） | `clockPaused` + `clockInterior`（:1031-1032） | `private clockPaused = false;`（:1572） | `[0x4A6440]` 子状态 |
| 面板停表 | `overlayDepth`（:1035）+ scrim 可见性 | `clockRunning()` 里 `UI_PANEL_NODES`/`Scrim_*`/`cityPanel.isOpen()`（:2641-2648） | `0x41BEC1` 模态判定 |
| 主循环 | `clockFrame(now)` rAF + 60Hz 固定步长（:2293） | `update(dt: number)`（:2619） | 每帧 `0x41B6C1` |
| 可否流动 | `clockRunning()`（:2177） | `private clockRunning()`（:2641） | 同上暂停条件 |
| 单 tick | `stepClock(n)`：`clockT = Math.max(0, clockT - n)`（:2222） | `private stepClock(n)`（:2653） | `0x41B6C1` |
| 兵团推进 | `advanceArmiesTick(n)`（:2186） | `private stepArmiesFrame(n)`（:4340） | `0x41B127 → 0x41AFAB` |
| 跨月结算 | `monthTick()` → `advanceMonth(1, { clock: true })`（:2216） | `private monthTick(): boolean`（:2673） | HUD 现算月份，无「月流水线」 |
| 进内政 | `enterInterior()`：T=0、`Saves.ensureYear`、开 `#interiorSheet`（:2242） | `private enterInterior()`（:2694） | `0x41B6C6 → 0x4238C3`，切内政场景 |
| 内政终了 | `endMonth()`：只 `clockT=3600; clockAcc=0`（:2753） | `private endInterior()`（:2711） | `0x41BBF5`：T=3600 + 回大地图 |
| 常量 | `CLOCK_TICKS_PER_YEAR/MONTH/DAY`（:1023-1025） | 同类注释常量（:1566 起注释） | 3600 / 300 / 10 |

差异说明：Cocos 侧内政是场景内 `openCityPanel`；web 是多页架构，用页内 `#interiorSheet` 浮层（见 §6）。

---

## 4. CDP 实测

### 4.1 环境与方法

- 静态服务：`cd F:\sanguo\game; node web/serve.mjs 9351`（后台，测试后已 kill）。
- 浏览器：Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，`--headless=new`），CDP 端口 **9352**，profile `F:\sanguo\work\.edgeprof_webclock`，`--window-size=900,1500`。
  - 为什么自起而不用 `cdpweb.mjs launch`：该脚本 launch 后硬等 `window.cc`（Cocos 专用），web 页面必然超时。
  - 为什么 headless：有头实例在本机被其他窗口遮挡/最小化后 `document.hidden=true`，按设计（切后台停表）时钟会停，`Page.bringToFront`/`setWebLifecycleState` 均无法恢复；headless 下 `visibilityState='visible'`，渲染/截图正常（876×1408）。
- 验收脚本：`node work\cocos_verify\cdpweb.mjs run work\webclock\steps.mjs`（env `PORT=9352 MATCH=127.0.0.1:9351 OUTDIR=F:\sanguo\work\webclock`），全流程走真实 UI（点剧本卡→君主卡→开始）。
- 页面 URL：`http://127.0.0.1:9351/web/campaign.html?dev=1&auto=1`。
  - `?dev=1`：repo 保留的调试卷入口，`?auto=1` 为「AI 攻城原地结算」调试口（**不改变逐帧时钟逻辑**）。纯 URL 连续 3 次都在第 2 个月被 AI 敌袭跳守城页（兵团逐帧抵达城下的正常行为，AI 月计划按月份取种子、新局确定），为稳定量测 16 秒才带这两个参数。

### 4.2 数字（单次成功 run，headless Edge 158.0.4370.33）

| 步骤 | 读数 |
|---|---|
| 首屏（新局浮层打开） | `T=3600`、`month=1`、`ym=西元 184年 1月`、`overlayDepth=1`、`running=false`（浮层停表生效） |
| 开局后 before | `t=3528`、`month=1`、`西元 184年 1月` |
| 8 秒 | `t=3033`、`month=2`、`西元 184年 2月` |
| **16 秒**（实测 16.54 s） | `t=2537`、`month=4`、`西元 184年 4月` ⇒ **月 +3、ΔT=991 tick**（理论 16.54 s × 60 Hz ≈ 992.4） |
| 打开 `#btnSave` 存档浮层，等 4 s | `t: 2520 → 2520`、`month: 4 → 4`、`runningWhileOpen=false`（停表）；关闭后 `running=true`（恢复） |
| 存档 month 改为 12 后 reload | `loaded12=true`、载入后 `T=210`（载入瞬间 = 3600 − 11×300 = **300**，读数时已流动约 1.5 s）、`month=12`、`year=1`、`西元 184年 12月` |
| 约 5 s 后 T=0 自动内政 | `t=0`、`month=13`、`year=2`、`ym=西元 185年 1月`、页头 `內政 · 凍結`、`#interiorSheet` 可见、`clockPaused=true` |
| 点「內 政 終 了」 | `t=3547`（重设 3600 后又流动约 0.9 s）、`month=13`、`year=2`、`running=true`、`interiorOpen=false`（**没有跑任何月份模拟**） |

### 4.3 截图（`F:\sanguo\work\webclock\`）

- `map_before.png`：开局大地图，页头「西元 184年 1月」「時間 T=3528 · 流動」。
- `map_mid_8s.png`：8 秒后「西元 184年 2月」。
- `map_after_16s.png`：16 秒后「西元 184年 4月」「時間 T=2538 · 流動」（截图比读数早 1 tick）；大地图按钮显示「時間流動中」。
- `panel_paused.png`：存档浮层打开，页头 T 冻结。
- `interior_gate.png`：T=0 自动内政浮层「內 政 時 間 到 了」：`西元 185年 1月`、`year 2`、页头「內政 · 凍結」，含「進城內政」「內 政 終 了」。
- `interior_ended.png`：内政终了后回大地图，时间恢复流动。

---

## 5. 门禁

- `cd F:\sanguo\game; node node_modules/typescript/bin/tsc --noEmit` → **exit 0**。
- `node --test "tests/*.test.ts"` → **tests 1924 / pass 1923 / fail 0 / todo 1**（任务基线 1894 pass / 1 todo；本次新增 6 条 web_clock_parity 契约测试，无新增失败；仓库在多 agent 并行下总量有变动，最终 0 fail）。
- 定向回归：`node --test tests/web_clock_parity.test.ts tests/affairs_p1.test.ts tests/affairs_f1f8.test.ts tests/cocos_p1_port.test.ts tests/rows85.test.ts` → **71 pass / 0 fail**。
- HTML 内联 module 语法：`work/webclock/_extract.mjs` 抽取后 `node --check` → 0。
- 未改 `game/cocos/**`、未改 `project/`、未构建 Cocos、未执行 git 写操作。

---

## 6. 遗留差异与理由

1. **T==0 的处理选择＝页内浮层 +「進城內政」按钮（不自动跳 `city.html`）**。
   理由：① 「內政終了」必须留在大地图这一页完成（原作 0x41BBF5 是场景切换，web 整页跳转会卸载时钟并丢掉 T）；② 自动跳转会丢大地图状态、且用户无法在同一页看到「年份 +1」；③ 用 `#interiorSheet` + `localStorage['sg_campaign_interior']` 标记，从 `city.html` 返回后仍恢复内政窗口，功能等价于原作的场景内内政面板。年份 +1 由 12 次换月把 `save.month` 推到次年正月、`Saves.ensureYear(save)` 同步 `save.year` 实现（原 0x4238C3）。
2. **新局不强制打开内政面板**。Cocos `freshRun` 会先 `openCityPanel`；web 新局 `month=1`、`T=3600` 直接在大地图流动（首屏即地图，符合 web 调试台既有入口与外部验收脚本习惯；到达 T=0 时同样自动进内政）。
3. **web 存档没有 T 字段**：读档按绝对月序反推 `T = 3600 − ((month−1)%12)×300`，因此同月内刷新会回到该月月初（月内 tick 进度不持久化）。要完全一致需给存档格式加 T（超出本次范围）。
4. **帧驱动**：原作逐帧无 frame cap；web 用 `requestAnimationFrame` + 60 Hz 固定步长（`clockAcc += Math.min(dt, 0.25)`，`guard<240`），保证一年≈60 s；切后台（`document.hidden`）停表（原作无此概念，属浏览器语义）。
5. **画面刷新节流**：页头月份/地图 10 fps（每 6 tick 刷一次），换月/月度结算/内政才全量 `render()`；原作是每帧重绘。按钮里的 T 数字已移除（T 只由页头显示），避免与 10 fps 刷新不一致。
6. **月度结算复用原有单月流水线**（`advanceMonth(1, { clock: true })`：年税/自治/忠诚漂移/AI/战斗中断都在），但逐帧模式跳过整月 `advanceArmies`/`marchSnapshot`（兵团已按 tick 推进）；`?adv=N` 等调试快进仍按整月跑并同步 T。
7. **观感备注**：`?auto=1` 下 AI 攻城原地结算，16 秒内玩家会掉城（截图城 2），这是既有 `auto` 调试行为，与时钟无关。

---

## 7. 复现命令

```bat
cd F:\sanguo\game
start /b node web/serve.mjs 9351

"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new ^
  --remote-debugging-port=9352 --user-data-dir=F:\sanguo\work\.edgeprof_webclock ^
  --window-size=900,1500 --no-first-run --no-default-browser-check ^
  --hide-scrollbars --force-device-scale-factor=1 ^
  "http://127.0.0.1:9351/web/campaign.html?dev=1&auto=1"

set PORT=9352 & set MATCH=127.0.0.1:9351 & set OUTDIR=F:\sanguo\work\webclock
node work\cocos_verify\cdpweb.mjs run work\webclock\steps.mjs

set PROFILE=F:\sanguo\work\.edgeprof_webclock
node work\cocos_verify\cdpweb.mjs close
node work\cocos_verify\reap.mjs --kill --match=edgeprof_webclock
```

**遗留验证浏览器进程：0**（收尾后已复核 `msedge.exe` 中匹配 `edgeprof_webclock` 的进程数为 0，9351 静态服务已停止）。
