# 開場叫陣（StartBattle @0x2108）實作報告

日期：2026-11-26　子智能體：taunt　範圍：`game/src/core/open_taunt.ts`（新）、`game/tests/open_taunt.test.ts`（新）、`game/web/main.js`、`game/src/view/battleView.ts`。

## 1. 需求與原作流程

原作《三國群英傳 2》開戰時雙方主將各喊一句，喊話時鏡頭切到說話方；兩段播完鏡頭回到我方主將，然後才開始走戰鬥邏輯。重製版原本一進戰鬥頁（或點「開戰」）就直接開打，兩將相距 45 行時玩家不知道在看誰。

本次補上：**建 world → 敵將叫陣（鏡頭硬切 B 主將）→ 我將接話（鏡頭硬切 A 主將）→ 鏡頭回「我方主將 − 2 行」→ 恢復 step**。URL `?taunt=0` 可整段關閉，方便與舊版對拍。

## 2. 取證鏈（file:line）

| 主題 | 位置 | 取到的結論 |
|---|---|---|
| StartBattle 反編譯 | `game/src/core/syso_host.ts:1288-1337`（函數體 `:1305-1337`） | `g2=global(2)` 我將、`g3=global(3)` 敵將/戰場中心、`g7/g8` 兩主將；`0x6` 四組動作；`loc6=screenRegion(g7)`、`loc5=screenRegion(g8)`；`MoveCamera(g3, 30)` → `0xA(2,0,loc3)` → `MoveCamera(g2, 60)` → 重抽 `loc4 != loc3` → `0xA(3,0,loc4)` → `0x114(1)` |
| 兩段編號 | `game/src/core/syso_host.ts:1339-1372` | `callLine(near,far)` / `answerLine(near,far)`，逐字照抄到 `open_taunt.ts:127-179` |
| 分區 `0x206` | `game/src/core/syso_host.ts:1151-1174` | `col>=0x5A(90) \|\| row>=0x5A → 0`；`col>=0x4B(75) \|\| row>=0x4B → 1`；否則 2 |
| 主將像素/格座標端口 | `game/src/core/smartscript/runtime.ts:2574-2582` | `global(2)` = `SYSTEM_SO_GENERAL_HANDLE`；`unitAt` 回 `{x: gx*96, y: gy*72, col: round(gx), row: round(gy)}`（71×14 格） |
| 鏡頭參數 | `project/95_SYSTEM_SO补全.md:134-162`（表格 `:145-150`） | `MoveCamera(0x105(g3), 0x106(g3)-128, 30)`、`MoveCamera(0x105(g2), 0x106(g2)-128, 60)`：目標是主將像素座標，第三參數是 30/60 tick 的鏡頭時長 |
| 腳本偽代碼 | `docs/04-脚本引擎SmartScript.md:886-915` | `loc6=ScreenRegionTest(g7)`、`loc5=ScreenRegionTest(g8)`，確認 loc5/loc6 = 兩主將分區 |
| 既有實作旁證 | `game/tests/syso.test.ts:600-610` | `StartBattle(0)` 恰好兩句、layers `[2,3]`、id ∈ [300,409]、兩句不同 |
| 台詞原文 | `docs/03d-文本与配置.md:499-648`；`extract/json/message.json`；`work/d_message.tsv` | MSG300-409 共 110 條全非空；MSG380-409 為後段/接戰號段 |
| 號段結構 | `docs/03d-文本与配置.md:22-31`、`:72` | 300-399 叫陣/報名（100 條）、400-409 接戰（兩句輪換 5 次）、410-440 留白 |

## 3. 編號規則（與 syso_host 一致）

`near = loc5 = screenRegion(我將)`、`far = loc6 = screenRegion(敵將)`。`rand` 為閉區間。

第一段（敵將 B，看 `near`）：

| near | 規則 |
|---|---|
| 0 | `rand(0,1)==0 ? rand(300,319) : rand(380,399)` |
| 1 | `rand(0,1)==0 ? rand(320,339) : rand(380,399)` |
| 2 且 far==0 | `rand(0,1)==0 ? rand(340,359) : rand(380,399)` |
| 2 且 far!=0 | `rand(0,2)`：0→340-359、1→380-399、2→360-379 |
| 其他 | 0（原作兜底） |

第二段（我將 A，看 `far`，只有 `far==2` 才看 `near`）：

| far | 規則 |
|---|---|
| 0 | `rand(0,2)`：300-319 / 380-399 / 400-409 |
| 1 | `rand(0,2)`：320-339 / 380-399 / 400-409 |
| 2 且 near==0 | `rand(0,2)`：340-359 / 380-399 / 400-409 |
| 2 且 near!=0 | `rand(0,3)`：340-359 / 380-399 / 360-379 / 400-409 |
| 其他 | 0 |

撞號重抽：先 `callLine`，再 `answerLine`，`while (aId === bId)` 且最多 64 次（`open_taunt.ts:211-215`）。

## 4. 實作

### 4.1 `game/src/core/open_taunt.ts`（純邏輯）

- 類型：`TauntSide`（:19）、`TauntLine{side,msgId,holdTicks,text}`（:22）、`TauntOptions`（:32）。
- 常數：`TAUNT_HOLD_TICKS=90`（:54）、`TAUNT_HOLD_MIN=30`/`MAX=300`（:56-58）、`TAUNT_MSG_MIN/MAX=300/409`（:60-62）、`TAUNT_MAX_REROLL=64`（:64）。
- `screenRegion(col,row)`（:70）逐字照抄 75/90 閾值；`regionFromCamera(gx,camX)`（:83）是重製版代理（[推測]，見缺口）。
- `clampHoldTicks`（:92）、`tauntEnabled`（:98，`0/off/false/no` 關）、`makeTauntRng`（:108，mulberry32 閉區間）。
- `callLine`（:127）、`answerLine`（:151）、`fillTauntText`（:189，剝 `%k%%e%` 等尾碼、換 `%S1%/%s1%/%S2%`）。
- `buildTauntSeq`（:203）：先 B 後 A、預設名「我將/敵將」、`enabled:false` 回空。
- `TAUNT_TEXT`（:239-350）：內嵌 110 條原文，與 docs/message.json 逐條一致。

### 4.2 `game/src/view/battleView.ts`（只畫，不做邏輯）

- `TauntView{side,name,text,t,hold}`（:225）；`ViewOptions.taunt?: TauntView|null`（:289）。
- `TAUNT_BANNER={x:40,y:790,w:670,h:138}`（:2359）、`drawTaunt()`（:2361）：
  陰影 + `panelAlpha` 底板 + 陣營色邊框/左條 + 名牌 pill（「我將/敵將 + 接戰/叫陣」）+ `wrapCJK(...,24,3)` + 進度條。
- `buildFrame()` 最後一筆 `drawTaunt(out, opts.taunt)`（:1034），蓋在 HUD/提示框之上。

### 4.3 `game/web/main.js`（接線）

| 位置 | 內容 |
|---|---|
| `:16` | `import { buildTauntSeq, regionFromCamera, tauntEnabled } from '../dist/core/open_taunt.js'` |
| `:62` | `ENTRY_BATTLE = from==='campaign' \|\| encounter==='1' \|\| DEFEND` |
| `:64` | `TAUNT_ON = tauntEnabled(QUERY.get('taunt'))` |
| `:96/:98` | `state.taunt` / `state.camHold` |
| `:772` | `generalUnitX(side)`：`world.units` 找 `isGeneral && side`，缺時退回 `camera(world)` |
| `:786` | `beginTaunt()`：`regionFromCamera` 算 near/far → `buildTauntSeq({seed: state.seed*2654435761>>>0})`（與戰鬥隨機數分開）→ `state.taunt={seq,i:0,ticks:0}` → `camX` 硬切第一位說話者 |
| `:810` | `tickTaunt(dt)`：按真實秒累計；到 `holdTicks/TICK_HZ` 切下一句並硬切鏡頭；播完 `camX=generalUnitX('A')-2`、`camHold={x,t:2}`、`accumulator=0`、`lastTs=now`、訊息「開戰！」 |
| `:841` | `skipTaunt()`：CDP/調試跳過 |
| `:851` | `tauntViewData()`：給 view 的 `{side,name,text,t,hold}` |
| `:895` | `startBattle()` 在 mode='fighting'、清場之後呼叫 `beginTaunt()` |
| `:1307` | `viewOptions()` 加 `taunt` |
| `:1451/:1515` | 叫陣期間 pointer/keyboard 直接 return |
| `:1650` | `frame()` 在 `state.taunt` 時只 `tickTaunt(dt)+draw()`，**不 step**（凍結單位） |
| `:1690-1697` | 相機段加 `camHold` 覆蓋（叫陣後 2s 定鏡） |
| `:1931-1941` | `ENTRY_BATTLE` 時跳過首幀 ready 繪製、加 `body.solo`（收頁眉），`await startBattle()` |
| `:2044` | `__sanguo.skipTaunt`（CDP 用） |
| `:1075` | `save.lastBattle`（另一條 campaign 需求，一併落地） |

流程順序：`startBattle` 建 world → `beginTaunt`（敵將 B，鏡頭硬切 B 主將）→ 1.5s → 我將 A（鏡頭硬切 A 主將）→ 1.5s → 鏡頭回 A 主將 −2、`camHold` 2s → step 恢復。

## 5. 驗證

### 5.1 編譯與測試（全部 exit 0 / 全綠）

```
cd F:\sanguo\game
node --check web/main.js                         # 0
npm.cmd exec -- tsc --noEmit                     # 0
npm.cmd exec -- tsc -p tsconfig.build.json       # 0，產出 dist/core/open_taunt.js
node --test tests/open_taunt.test.ts             # tests 25 / pass 25 / fail 0（8 suites）
```

測試覆蓋：`screenRegion` 74/75/89/90 邊界、`regionFromCamera` 兩檔、`callLine`/`answerLine` 全分支與異常值、撞號重抽（132 次呼叫）、`enabled:false` 不耗隨機、holdTicks 夾取 [30,300]、`tauntEnabled('0'/off/false/no)`、`fillTauntText` 尾碼/佔位符、`TAUNT_TEXT` 110 條連續非空與關鍵編號逐字、`makeTauntRng` 可復現。

### 5.2 CDP（PORT=9341，有頭 Edge，`Page.bringToFront` + 關背景節流）

指令：
```
$env:PORT='9341'; $env:PROFILE='F:\sanguo\work\.edgeprof_taunt'
$env:PAGE_URL='http://127.0.0.1:5299/web/index.html'; $env:MATCH='5299'
$env:OUTDIR='F:\sanguo\work\flow_taunt'
$env:GPU_ARGS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion'
node work\cocos_verify\cdpweb.mjs launch
node work\cocos_verify\cdpweb.mjs run work\flow_taunt\steps_taunt.mjs
```

從 `?from=campaign&seed=7` 進頁，實測：

| 階段 | mode | tick | camX | 主將 x | taunt | i/side | msgId | 台詞 | header |
|---|---|---|---|---|---|---|---|---|---|
| 第一段 | fighting | 0 | 13 | A=58 / B=13 | true | 0 / B | 303 | 你的人頭我要定了，有什麼遺言就快交代吧！ | hidden |
| 第二段 | fighting | 0 | 58 | A=58 | true | 1 / A | 395 | 反賊張角，準備受死吧！ | hidden |
| 播完 | fighting | 0 | **56**（=58−2） | A=58 | false | — | — | — | hidden |
| 播完 +700ms | fighting | **42** | 56 | A=58 | false | — | — | — | hidden |
| `?taunt=0` | fighting | 1→33 | 48.4 | A=58 | **false** | — | — | — | hidden |

- `tick=0` 且 `camX=13`：叫陣期間邏輯確實凍結；`camX` 等於 B 主將 x → 鏡頭在說話方。
- 第二段 `camX=58` = A 主將 x → 鏡頭切回我將。
- 播完 `camX=56` 且 `tick 0→42` → 鏡頭回「我方主將 −2」、step 已恢復。
- `?taunt=0` 時 `taunt=false`、tick 正常推進 → 關閉開關有效。
- `headerHidden=true`、`solo=true`、mode 直接 fighting → 從 campaign 進來沒有預覽卡/頁眉。
- 控制台：0 exceptions、0 netFails；僅 2 條既有 warning（`[smartscript] 占位 syscall 0x135`，與本功能無關）。

截圖（`F:\sanguo\work\flow_taunt\`）：

- `t01_taunt_enemy.png` — 敵將張角「叫陣」，鏡頭在 B 主將（camX=13）。
- `t02_taunt_own.png` — 我將「接戰」，鏡頭在 A 主將（camX=58），台詞「反賊張角，準備受死吧！」。
- `t03_after_resume.png` — 台詞框消失、鏡頭回 A 主將（camX=56）、tick 已推進 42、訊息「開戰！」。
- `t04_taunt_off.png` — `?taunt=0`：直接開打、無台詞框（camX=48.4，即舊鏡頭錨點）。

日誌：`console_steps_taunt.json`；步驟腳本：`steps_taunt.mjs`；台詞轉儲：`_msg300_409.json`。

## 6. 缺口與待辦

1. **`0x206` 分區語義未定**：原作 `unitAt` 給的是 71×14 格座標，永遠 <75/90，按端口實作 `screenRegion` 恒為 2；75/90 究竟量螢幕像素還是螢幕格，反彙編沒寫死。`open_taunt.ts:83` 的 `regionFromCamera` 用鏡頭距離（3.74/7.43 行）代兩檔，屬 **[推測]**；實戰 near/far 會落在 0/1/2（本局 0/0），號段分支可走。
2. **停留時長無字節碼依據**：`0xA`（SayMsg）本身不帶停留參數，`MoveCamera` 的 30/60 是鏡頭時長不是台詞時長；`TAUNT_HOLD_TICKS=90`（1.5s/句）是「24 字一行可讀」的呈現常數，可經 `TauntOptions.holdTicks` 調；原作真實停留由引擎訊息框計時器控制，未取證。
3. **原文表未進 `game/data`**：110 條先內嵌在 `open_taunt.ts` 的 `TAUNT_TEXT`；`extract/json/message.json` 尚未接進 runtime，後續若要全域對話（MSG240-…）需另做 message 表。
4. **鏡頭錨點依賴另一條線**：`camera(world)` 實測 48.4（我方前鋒 −2.6），主將 58 在畫面外（入畫需 ≥52.11）。叫陣後硬切 56，但 2s `camHold` 過後會被 `camera()` 平滑拉回 48.4。等 `battle.ts` 鏡頭錨點改成「我方主將 −2」後，`main.js:1690-1697` 的 `camHold` 可整段刪除。
5. **`0x6` 四組 playAct 未演**：原作 StartBattle 開頭有 4 組 `0x6`（動作/陣型層），本次只做台詞 + 鏡頭；`resetOverlay(1)` 以台詞框自然消失代替。
6. **自動開戰的入口判定**：目前認 `from=campaign`、`encounter=1`、`defend=1` 三種；`index.html` 的發佈形態（`__RELEASE__`）自有點擊邏輯未動。`?taunt=0` 與 `from=campaign` 可組合。
7. **`t04` 的 camX=48.4** 是舊錨點的直接證據：不演叫陣時我方主將仍在畫面外，這條要由鏡頭錨點那條線收尾。
