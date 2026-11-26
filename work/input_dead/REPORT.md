# R228 · 「切后台回前台后界面还在、所有按钮点不动」— 定位 / 修复 / 验证报告

- 执行：input-dead（subagent），2026-11-26 17:00–17:20
- 设备：MuMu 模拟器 `127.0.0.1:16384`，`com.sanguo.sango2/com.cocos.game.AppActivity`，1456×2560，设计区 750×1334
- 构建：`dist\android\sanguo-native.apk` versionCode **26** / versionName **3.6**（17:16:09 出包，含本报告全部改动）
- **状态声明：源码修复 + 源码级契约测试 = 已验；三类真机行为（时钟暂停 / T 归零 / 抵达自动开战）= 真机未验**。原因见 §5.0：lead 于 17:08 明令「不要再对 16384 发任何 tap / input / am start」（那台模拟器是制作人本人在手动试玩）。真机验收脚本已交付：`F:\sanguo\work\input_dead\steps_verify.ps1`。

---

## 1. 结论

1. **症状的机制已经用引擎源码钉死**：任何一个 `TOUCH_END` 监听器抛异常，Cocos 3.8.8 的 `Input._emitEvent()` 会先 `_clearEvents()` 再 **把异常重新抛出**（`tools/cocos/cc388/.../engine/cocos/input/input.ts:345-359`）。于是**同一次派发里排在后面的 dispatcher 全部收不到该事件**（所有面板/大地图的全局 `input.on` 监听都在后面），异常还会冲出 `_frameDispatchEvents()`（`input.ts:506-554`）和 `director.tick()`（`director.ts:757-806`），当帧剩下的逻辑连同 `this._totalFrames++`（`director.ts:806`，tick 最后一行）一起被跳过。**这正是 R224/R225 出现过的「整条输入链永久失效」**。
2. **切后台/回前台的触发点**：Android 在窗口失焦/暂停时发的是 `ACTION_CANCEL`，引擎把它映射成 `cc::TouchEvent::Type::CANCELLED`（`native/cocos/platform/android/AndroidPlatform.cpp:446-447`，`:462` broadcast），JS 侧只会收到 `TOUCH_CANCEL`、**不会补一个 TOUCH_END**。而全工程 `TOUCH_CANCEL` 命中 **0**（`game/cocos/assets/scripts`、`game/tests`），也没有任何 `Game.EVENT_HIDE/EVENT_SHOW` 处理（同样 0 命中）。⇒ 后台期间：拖拽类状态（ItemsPanel / DeployRoot / BattleRoot 的 `onTouchStart/onTouchMove`）半截不收尾、`InputLatch` 的帧号闩锁没人复位、引擎触摸缓存没人清。回前台后的第一次/前几次 `TOUCH_END` 落在「残局」上，任何一个 `onTouch` 的假设（存档非空、面板还在、拖拽状态完整）不成立就 throw，触发第 1 条 → **界面还在（最后一帧已绘），但之后所有点击都进不来**。
3. **修复分三层**（不动 `game/src/core/**`）：
   - **异常隔离**：新增 `InputGuard.ts` 的 `safeTouch()/guardTouch()`，把 16 个文件、49 条 `input.on/off(TOUCH_*)` 全部换成安全壳 —— 任何一帧抛异常只丢这一次点击，**派发链永不断**；
   - **闩锁复位 + 自愈**：`InputLatch.ts` 新增 `resetTapLatch()`；`tapLatched()` 在帧号往回跳时自动清闩锁；
   - **生命周期复位**：`installInputResilience()` 在四个场景 Root 的 `onLoad` 里挂 `Game.EVENT_HIDE`（清闩锁）/ `Game.EVENT_SHOW`（清闩锁 + 尽力清引擎触摸缓存），并打 `[R228] EVENT_HIDE/EVENT_SHOW` 日志供真机断言。
4. **门禁全绿**：`tsc --noEmit` 0、`tsc -p cocos/tsconfig.check.json` 0、新增 `tests/input_resilience.test.ts` 12/12 pass、全量测试 **1924 tests / 1923 pass / 0 fail / 1 todo**（基线 1894 pass / 1 todo，多出的 pass 来自并行 teammate 新增测试，本轮 0 fail）。
5. **真机部分未验**：时钟暂停、T=0 自动内政、抵达自动开战三条需要人跑 `steps_verify.ps1`（§5）。

---

## 2. 复现与现场证据

### 2.1 设备上的第一次尝试（结论：MuMu 的 HOME 不能用来复现）

| 步骤 | 命令 / 结果 |
|---|---|
| 基线截图 | `00_current.png`：南皮内政页，页头 `第2年2月`（太守 袁紹，武将 11/10） |
| 按 HOME | `adb -s 127.0.0.1:16384 shell input keyevent KEYCODE_HOME` |
| logcat（`work/input_dead/log_resume1.txt`） | `V threaded_app: Pause` / `Cocos: AndroidPlatform: APP_CMD_PAUSE` / `APP_CMD_LOST_FOCUS` |
| 3 秒后 | `ActivityManager: Killing 17928:com.sanguo.sango2/u0a47 (adj 200): remove task` → **进程被 SIGKILL**，`01_after_resume.png` 只能看到重启的 Boot 启动屏 |

⇒ **MuMu 上 `KEYCODE_HOME` 会 `remove task` 杀进程**，「界面还在但点不动」不可能在 HOME 路径上出现。
正确复现路径（已写进 `steps_verify.ps1`）：启动另一个 activity 把游戏压到后台（脚本用 `com.android.settings/.Settings`），**进程不被回收**，再 `am start -n com.sanguo.sango2/com.cocos.game.AppActivity` 回前台 —— 这样才会走 `APP_CMD_PAUSE → APP_CMD_RESUME`，且触摸残局会保留。

### 2.2 现场被真人试玩污染（所以真机验证改为交付脚本）

- 装 3.5（versionCode 25）后冷启动正常（`03_installed_boot.png` = 标题页）。
- 随后**没有我任何点击**的情况下：17:07:02 logcat 出现 `Cocos: JS: [R214] campaign start {"sci":1,"force":"劉備","owned":["平原"]}`，`04_after10s.png` 已是平原内政页（记录区 4 条「搜索」、已行動 7 人），再往后 `05_select.png`/`06_now.png` 物品页的 tab 自己从「兵器」切到「兵書」。
- lead 17:08 确认：**那台 MuMu 是制作人本人在手动试玩**，不是我或 teammate 的脚本；并明令此后禁止我发 tap/input/am start。
- 证据文件：`03_installed_boot.png`（17:06:53 标题页）、`04_after10s.png`、`05_select.png`、`06_now.png`、`log_install.txt`。

---

## 3. 根因（证据链）

### 3.1 一级机制：一个监听器 throw → 本帧所有全局输入监听收不到 + 整帧被跳过

`F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\cocos\input\input.ts:345-359`

```ts
for (let i = 0; i < length; ++i) {
    const dispatcher = this._eventDispatcherList[i];
    try {
        if (!dispatcher.dispatchEvent(event)) { break; }
    } catch (e: any) {
        this._clearEvents();          // 本帧缓存里剩下的触摸事件直接丢弃
        dispatcher.onThrowException();
        throw e;                      // 重新抛出，不吞
    }
}
```

- `InputEventDispatcher.dispatchEvent()`（`input.ts:66-69`）内部就是 `this._inputEventTarget.emit(event.type, event)` —— **监听器是同步 emit 的**：任一监听器 throw，循环就在这个 dispatcher 上炸掉，`_eventDispatcherList` 里排在后面的（含全局 `input.on(TOUCH_END, ...)` 的 16 个注册）全部收不到该事件。
- 本帧剩余缓存的触摸事件被 `_clearEvents()` 一起清掉（`_frameDispatchEvents()`，`input.ts:506-554`：NATIVE 下 `dispatchImmediately = false`（`input.ts:113`），触摸先进 `TouchInputSource` 缓存，每帧 `dispatchEventsInCache()`（`:523`）派发，末尾 `_clearEvents()`（`:553`））。
- 异常继续冲出 `director.tick()`（`game/director.ts:757-806`）：`input._frameDispatchEvents()` 在 **`:771`（帧最前，且在 `if (!this._paused)` 之前）**，`this._totalFrames++` 在 **`:806`（函数最后一行）** ⇒ 当帧的 update/draw 和帧号自增全部跳过。

### 3.2 为什么会「永久」失效而不是只丢一次

那个 throw 的监听器只要**同一个残局条件还在**（例如拖拽状态字段是 `undefined`、面板对象已销毁但字段没清），后续每一次 `TOUCH_END` 都会在它这里再抛一次 → 每次都把派发链打断在同一个位置 → 所有按钮/地图都收不到点击，但画面仍是最后一帧渲染的结果。这与用户原话「切回去以后界面就无法点击」完全一致，也和 `project/217_触控根因与双端收编.md` 里 R224 的记录一致。

### 3.3 切后台为什么是导火索

| 事实 | 证据 |
|---|---|
| Android 失焦/暂停时发 `ACTION_CANCEL`，引擎映射为 `TouchEvent::Type::CANCELLED` 并 broadcast | `native/cocos/platform/android/AndroidPlatform.cpp:446-447`、`:462`；`java/src/com/cocos/lib/CocosTouchHandler.java:132` |
| 我们工程没有任何 `TOUCH_CANCEL` 监听 ⇒ 取消事件无人收尾 | `Select-String game\cocos\assets\scripts\*.ts, game\tests\*.ts -Pattern 'TOUCH_CANCEL'` = **0 命中** |
| 我们工程没有任何 `Game.EVENT_HIDE/EVENT_SHOW` 监听 ⇒ 回前台不复位任何输入状态 | 全 scripts grep `EVENT_HIDE|EVENT_SHOW` = 0 命中（修复前） |
| 引擎 `PointerEventDispatcher.claimedTouchIdList`（`2d/event/pointer-event-dispatcher.ts:154-172`）没有 hide/show 清 claim 的代码 | 引擎源码，`:48-267` 内无 show/hide 分支 |
| `_onHide/_onShow` 只做 `emit(EVENT_HIDE)+pauseByEngine()` / `emit(EVENT_SHOW)+resumeByEngine()`，**不会拆 `_eventDispatcherList`** | `game/game.ts:1095-1112`（`Game.EVENT_HIDE='game_on_hide'` `:206`、`EVENT_SHOW='game_on_show'` `:216`；`pauseByEngine` `:559`、`resumeByEngine` `:569`） |

### 3.4 第二重隐患：`InputLatch` 同帧闩锁在异常帧后可能「卡死」

修复前 `game/cocos/assets/scripts/InputLatch.ts`：

```ts
let latchedFrame = -1;
export function latchTap(): void { latchedFrame = director ? director.getTotalFrames() : -1; }
export function tapLatched(): boolean {
  if (!director || latchedFrame < 0) return false;
  return director.getTotalFrames() === latchedFrame;
}
```

`getTotalFrames()` 的自增在 `director.tick()` 的最后一行（`director.ts:806`）：**一帧里只要在 `:771` 的输入派发处抛了异常，这一帧的帧号就不涨**。Cocos 3.8.8 又没有 hide/show 复位点，于是闩锁可能停在「永远等于当前帧」的状态，把所有 `TOUCH_END` 都吞掉（`CampaignRoot.onTouch` 第一句就是 `if (tapLatched()) return;`）。

### 3.5 输入面清点（为什么「兜住 16 个文件」就够了）

- 16 个文件、49 条 `input.on/off(Input.EventType.TOUCH_*)`，全部 `this.onTouch`，**无 try/catch**。
- 全工程 `addComponent(Button)` / `BlockInputEvents` / `node.on(Node.EventType.TOUCH*)` 均**无实际使用**（只剩注释）；`ScrollView` 也未使用（`ItemsPanel.ts:13`、`ScenarioSelect.ts:10-11` 注释明说改用上/下页）。
- ⇒ 全部输入都收敛在这 16 个全局监听器里，把它们全部包成 `guardTouch`，即可保证「任何一帧抛异常都不会打断全局派发链」。

---

## 4. 改动清单（文件:行）

> 约束遵守：未执行任何 git 操作；未改 `game/src/core/**`；未改 `project/`；中文文件全部用 write/edit 落盘（未用 `Set-Content`）。

### 4.1 新增：`game/cocos/assets/scripts/InputGuard.ts`（~147 行）

| 行 | 内容 |
|---|---|
| 53 | `export function safeTouch<C extends object>(label, handler)`：`try { handler.call(this, event) } catch { logTouchError(...) }` —— 异常隔离的唯一入口 |
| 76 | `export function touchErrorCount(): number`（供测试/诊断） |
| 86 | `export function guardTouch<T extends object>(target, method, label)`：按 `WeakMap<object, Map<string,fn>>` 缓存包装函数（**保证 on/off 拿到同一个函数**）；方法不存在时只 `console.warn('[R228] touch method missing', ...)` 不抛 |
| 114 | `export function resetInputAfterShow()`：先 `resetTapLatch()`，再 `typeof input._clearEvents === 'function'` 时清引擎触摸缓存（私有 API，取不到/抛错只 warn） |
| 133 | `export function installInputResilience()`：幂等（`if (installed) return`） |
| 137 | `game.on(Game.EVENT_HIDE, ...)` → `resetTapLatch()` + `console.log('[R228] EVENT_HIDE: ...')` |
| 143 | `game.on(Game.EVENT_SHOW, ...)` → `resetInputAfterShow()` + `console.log('[R228] EVENT_SHOW: ...')` |

错误日志格式 `console.warn('[R228] touch error', label, err)`，限流 20 条（第 21 条起提示「超過 20 次，後續不再印」），避免一次残局刷爆 logcat。

### 4.2 修改：`game/cocos/assets/scripts/InputLatch.ts`

| 行 | 内容 |
|---|---|
| 30 | 新增 `export function resetTapLatch(): void { latchedFrame = -1; }` |
| 35–43 | `tapLatched()` 重写：`const frame = director.getTotalFrames(); if (frame < latchedFrame) { latchedFrame = -1; return false; } return frame === latchedFrame;`（帧号往回跳 = 换场景/重载，自动清闩锁） |

### 4.3 修改：16 个文件 49 条注册全部换成 `guardTouch`

每条形如 `input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', '<Class>'), this);`（`off` 用同一形式，保证注销到同一个包装函数）。行号：

| 文件 | on 行 | off 行 |
|---|---|---|
| ArmyLayer.ts | 1152 | 1174, 1183 |
| BattleRoot.ts | 274, 275, 276 | 280, 281, 282 |
| BootRoot.ts | 71 | 75 |
| CampaignRoot.ts | 5223 | 5227 |
| CityListPanel.ts | 474 | 482, 491 |
| CityPanel.ts | 752 | 758 |
| DeployRoot.ts | 644, 645, 646 | 650, 651, 652 |
| EndingPanel.ts | 411 | 419, 428 |
| ForcesPanel.ts | 757 | 769 |
| GeneralBookPanel.ts | 640 | 654 |
| ItemsPanel.ts | 1004, 1005, 1006 | 1018, 1019, 1020 |
| MonarchPanel.ts | 365 | 371 |
| SaveSlots.ts | 951 | 960 |
| ScenarioSelect.ts | 177 | 185, 194 |
| SurrenderPanel.ts | 487 | 499 |
| TitlePanel.ts | 140 | 149, 158 |

### 4.4 修改：四个场景 Root 在 `onLoad` 开头挂生命周期复位

| 文件:行 | 调用 |
|---|---|
| BattleRoot.ts:270 | `installInputResilience();` |
| BootRoot.ts:69 | 同上（启动场景先挂上，之后换场景不丢） |
| CampaignRoot.ts:1689 | 同上 |
| DeployRoot.ts:392 | 同上 |

### 4.5 新增：`game/tests/input_resilience.test.ts`（12 条源码级契约，全 pass）

1. `safeTouch` 有 try/catch 且 catch 调 `logTouchError`；2. 日志带 `[R228]` 前缀且限流 20；3. `guardTouch` 用 WeakMap 缓存；4. `resetTapLatch()` 清成 -1；5. `tapLatched()` 未设闩锁返回 false；6. 帧号回退自愈；7. `installInputResilience` 幂等且挂 `Game.EVENT_HIDE/SHOW`；8. SHOW 分支走 `resetInputAfterShow`；9. `resetInputAfterShow` 先 reset 闩锁再（尽力）清缓存；10. HIDE 分支 reset 闩锁；11. 所有 `input.on/off(TOUCH_*)` 都是 guardTouch 形式（裸 `this.onTouch` 出现次数 = 0），覆盖 16 个文件、注册 ≥ 40；12. 每档 `off` 参数 ⊆ `on`、四个 Root 都 import+call、`CampaignRoot.onTouch` 仍以 `if (tapLatched()) return;` 开头。

---

## 5. 验证结果（5 条）

### 5.0 为什么真机部分未验（重要）

lead 17:08 指令原文（历史记录）：「那台 MuMu 不是被 teammate 抢占了，是**制作人本人在手动试玩** …… 从现在起**不要对 `127.0.0.1:16384` 发任何 tap / input / am start** …… 需要真机验收的部分，**写成脚本交给 lead**」。我 17:06–17:07 的实机尝试就被真人试玩打断（§2.2）。因此下面 V3–V5 的真机行为**均未在我手上验证**，交付 `steps_verify.ps1` 由 lead 择机执行。

| # | 验证项 | 结果 | 证据 |
|---|---|---|---|
| V1 | 异常隔离：任何 `onTouch` 抛异常都不再打断全局派发链 | **已验（源码 + 契约测试）**；真机行为未验 | `gate_input_resilience.log`（12 pass / 0 fail）；契约 11 断言 16 档 49 条注册全为 `guardTouch`、裸 `this.onTouch` = 0 |
| V2 | 回前台复位：`EVENT_HIDE` 清闩锁、`EVENT_SHOW` 清闩锁 + 清引擎触摸缓存 | **已验（源码 + 契约测试）**；真机需看日志 | 契約 7/8/9/10；`InputGuard.ts:137,143`；脚本会断言 logcat 出现 `[R228] EVENT_HIDE` / `[R228] EVENT_SHOW` |
| V3 | 时钟：新局 → 回大地图 → 16 秒页头到「4月」；**打开任意面板时停表，关闭后继续** | **真机未验** | 现有旁证：`04_after10s.png`（新局后自动进内政页、页头 `第1年1月`，说明 freshRun 分支正常）。脚本采集 `r_v3_clock_t0.png` / `r_v3_clock_t16.png`（期望 4 月）/ 面板开 `r_v3_panel_open.png` + 8 秒后 `r_v3_panel_after8s.png`（期望页头不变）/ 关闭后 `r_v3_panel_closed.png`（期望继续走） |
| V4 | T 归零：页头跳年（≈60 秒）应**自动开内政页并停表**；关掉后从「1 月」重新走、不卡死反复弹窗 | **真机未验** | 脚本 `-ClockCheck` 段采集 `r_v4_yearend.png`（期望自动内政页）/ `r_v4_after_close.png`（期望 `第N年1月` 并继续走）；日志断言无 TypeError |
| V5 | 抵达自动开战：平原→樂陵 的兵团走到应**自动进「出征編成」屏** | **真机未验** | 脚本 `-ArrivalCheck` 段：人为出征后每 5 秒截一张 `r_v5_arrival_t*.png` + 抓 `logcat`；若停在城下没进战斗，截图与 logcat 就是现场证据 |

> 说明：V1/V2 的「已验」只到**源码级**——它们证明「以后任何一帧抛异常都不会再打断派发链」，但「切后台回来后第一次点击是否真的会触发原先那个 throw」仍要真机复现才能确认。报告不把真机行为写成已验证。

### 5.1 门禁数字（17:16–17:18 最终状态）

| 命令 | 结果 | 日志 |
|---|---|---|
| `cd F:\sanguo\game; node node_modules\typescript\bin\tsc --noEmit` | **exit 0** | `gate_tsc_noemit.log` |
| `node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **exit 0** | `gate_tsc_cocos.log` |
| `node --test tests/input_resilience.test.ts` | **12 pass / 0 fail**（exit 0） | `gate_input_resilience.log` |
| `node --test "tests/*.test.ts"` | **tests 1924 / suites 89 / pass 1923 / fail 0 / todo 1**（exit 0） | `gate_tests_full.log` |

基线 1894 pass / 1 todo；当前 1923 pass / 0 fail（多出的 pass 来自并行 teammate 新增测试，本轮改动 0 fail）。

---

## 6. 构建产物

- 命令：`cd F:\sanguo; & .\tools\build_native.ps1`（含 CocosCreator CLI + gradle `:android:assembleDebug` + aapt2 核对），**exit 0**，日志 `work/input_dead/build_r228.log`。
- 产物：`F:\sanguo\dist\android\sanguo-native.apk`，**58,503,386 B**，17:16:09，SHA-256 `287B889C961F18679C7DD78B5FE141C6C77357A46FE660957969579721DBECF2`。
- `aapt2 dump badging`：`versionCode='26' versionName='3.6'`，`native-code: 'arm64-v8a' 'armeabi-v7a'`。
- 注：`versionCode 26 / 3.6` 是其他会话在我改代码之前就改好的（`game\cocos\native\engine\android\app\build.gradle`），我没有再动版本号。安装：`adb install -r dist\android\sanguo-native.apk`。

---

## 7. 遗留风险

1. **真机行为未验（最高风险）**：V3/V4/V5 三条只有源码证据；`steps_verify.ps1` 里有完整的时序/截图/日志断言，需要 lead 在制作人不玩的时候跑。
2. **`_clearEvents()` 是引擎私有 API**（`input.ts` 内，非公开声明）。已用 `typeof … === 'function'` + try/catch 包住：Cocos 升级后改名/移除只会少清一次缓存，不会抛。
3. **`guardTouch` 依赖 WeakMap 缓存**：同一方法若用两个不同 label 注册，on/off 会拿不到同一个函数而注销失败。当前每类只有一个 label；契约 12（off ⊆ on）能兜住这种回归。
4. **异常被兜住后，那一次点击会「无声失效」**（只有 `[R228] touch error` 警告）。这是刻意取舍：宁可丢一次点击，不可断整条输入链。若真机上警告频发，应按日志里的 label 去修对应 `onTouch` 的根因。
5. **并行开发覆盖风险**：其他 teammate 也在改 `DeployRoot.ts / GeneralBook.ts / TitlePanel.ts / ItemsPanel.ts / EndingPanel.ts / CityListPanel.ts` 等（与本次补丁同文件）。17:18 复查：`guardTouch` 51 命中、16 档齐全、两遍 tsc 与全量测试全绿；若之后再被覆盖，重放 `node work\input_dead\patch_input_guard.mjs` 即可（脚本保留 UTF-8/BOM/CRLF）。
6. **MuMu 的 HOME 不可用于此类复现**（`remove task` 杀进程）；`steps_verify.ps1` 默认用 `am start com.android.settings/.Settings` 切后台，`-UseHome` 只是对照实验。
7. **没有重挂触摸监听**：引擎 `_onHide/_onShow` 只 `emit` + `pauseByEngine/resumeByEngine`（`game.ts:1095-1112`），不拆 `_eventDispatcherList`，因此「重挂」既没必要、还会造成重复注册。若换 Cocos 版本后 hide/show 行为变了，需要重新评估。
8. **测试是源码级契约**：`game/tests` 不 import scripts（会 TS1287），所以 `input_resilience.test.ts` 用读源码 + 正则断言；重构/改名会假红，需按 §4 的契约逐条维护。
9. **收尾**：遗留 adb 进程 / 后台任务 = **0**（构建 job 已结束，host 无 java/gradle/cmd 残留）。

---

## 8. 证据文件清单（`F:\sanguo\work\input_dead\`）

| 文件 | 内容 |
|---|---|
| `00_current.png` | HOME 前的南皮内政页（第2年2月） |
| `01_after_resume.png` | HOME 杀进程后重启的 Boot 启动屏 |
| `02_booted.png` | 重启后落到的平原内政页（第1年1月，劉備） |
| `03_installed_boot.png` | 装 3.5/25 后冷启动的标题页 |
| `04_after10s.png` | 真人试玩推进到的平原内政页（旁证 V3 的 freshRun 分支） |
| `05_select.png` / `06_now.png` | 真人试玩切到物品/裝備页（tab 自己切换） |
| `log_resume1.txt` | HOME → `remove task` 杀进程的完整 logcat |
| `log_install.txt` | 装 3.5 后冷启动 logcat |
| `gate_tsc_noemit.log` / `gate_tsc_cocos.log` | 两遍 tsc 输出（均空，exit 0） |
| `gate_input_resilience.log` | 12 条契约测试输出 |
| `gate_tests_full.log` | 全量测试输出（1924 tests / 0 fail / 1 todo） |
| `build_r228.log` | 构建日志（5/5 交付与验证、aapt2 badging） |
| `patch_input_guard.mjs` | 批量补丁工具（16 档 49 条注册，保留 UTF-8/BOM/CRLF） |
| `steps_verify.ps1` | **真机验收脚本（交 lead）**，无 `-AllowTap` 时只读退出 |
