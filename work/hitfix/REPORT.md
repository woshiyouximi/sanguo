# r224 觸控修復報告：原生包里「打開城池一覽後所有按鈕無效」的根因與修復

工作目錄 `F:\sanguo`。修的是 **Cocos Creator 3.8 原生 Android 包**（MuMu 模擬器 1456×2560 / SDK 32）的觸控失效問題。
交付包：`F:\sanguo\dist\android\sanguo-native.apk`（versionName **2.9** / versionCode **19**）。

---

## 1. 根因（一句話）

`CampaignRoot.showSheetScrim()` 給全屏暗幕節點掛了 `BlockInputEvents`；Cocos 3.8 的 `PointerEventDispatcher`（priority UI=1，先於全局 `input` 派發）會把它當成命中目標、認領該 touch 並回傳 `false`，`Input._emitEvent()` 隨即 `break` —— 於是**全局 `input.on(TOUCH_END)` 監聽（本項目所有面板 + 大地圖的唯一輸入入口）從此收不到任何事件**。面板照樣渲染、JS 幀循環照跑 60fps，但所有按鈕即時全滅 → 用戶看到的「卡死在界面內」。

### 1.1 證據鏈（每一步都是實測，不是推測）

**a) 先排除「坐標換算錯 / 父節點空間不符 / getUILocation 語義不同」（Lead 的兩個預判都不成立）**

在 `CityListPanel.onTouch` 臨時插 `[R224-TMP]` 探針（會印 `ui / local / design / hits`），裝到真機點按，logcat 拿到四組數：

| 觸點（設備像素） | `ui`（getUILocation） | `local`（convertToNodeSpaceAR） | `design`（local.x+375, 667-local.y） | 期望設計坐標 |
|---|---|---|---|---|
| (1277,125) 關閉 | (661,1269) | (286,602) | **(661,65)** | close 661,60 ✓ |
| (526,303) 己方 | — | — | **(270,158)** | filter:ours 274,158 ✓ |
| (1299,2191) 下一頁 | — | — | **(673,1142)** | next 677,1142 ✓ |
| (720,576) 點行 | — | — | **(371,300)** | row0 375,300 ✓ |

結論：`getUILocation()` 在原生端回傳的就是 **750×1334 設計空間座標（y 向上）**，不是視口像素；面板節點父級（Canvas，anchor 0.5 / contentSize 750×1334 / lpos 375,667）沒有額外偏移。**公式與父節點都沒問題**。
→ 設備↔設計換算：`device_x = round(design_x*1.9189 + 8.5)`、`device_y = round(design_y*1.9189)`（四組實測反推吻合）。

**b) Lead 的「裝裱帶命中矩形差 110px」也不成立（未改任何命中矩形）**

對 2.8 實機截圖做像素量（`work\hitfix\analyze.py`，檢金色行）：大地圖「列表」按鈕實際畫在設備 y=1489..1558 → 設計 y≈771..807，與常量 `LIST_BUTTON = {x:596,y:776,w:136,h:36}` 完全一致；且 2.8/2.9 點設備 (1283,1523) 都能正常打開城池一覽。Lead 量的 (1269,1297) 換算設計≈(657,667)，本來就在按鈕上方屬地圖區，所以那一下選中夷州城是正確行為。**`CampaignRoot.ts:162/170/177` 的三個矩形一個字都沒改。**

**c) 卡死不是 CPU 死循環、不是渲染停止**

2.8 卡住時：pid 存活、activity 是 `mCurrentFocus`、`/proc/<pid>/stat` utime 約 57 ticks/s（單核 ~57%）、`top -H` 只有主 GL 線程在跑；JavaScript 側插樁 `[HBFIX] tick N frames F` 在面板打開後**仍然 60fps 遞增**，渲染正常（截圖一直有畫面）。按 HOME 後 CPU 立刻歸零（後台暫停幀循環），所以「前台轉、無反應」= 輸入斷流，而非卡死。

**d) 插樁定位到斷流點（2.9 診斷包，真機 logcat）**

大地圖正常時每次點按都印：`[HBFIX] input touch-start` → `input touch-end` → `campaign onTouch entered`。
打開城池一覽：`[HBFIX] scrim enter list` → `scrim done list` → `citylist open-1..6`（built 139 / refreshed 25 hits / listening）。
**再點「關閉」：一條輸入日誌都沒有（連 `input touch-start` 都沒有），而 `[HBFIX] tick` 照常 60fps。** → 事件根本沒進 JS 的全局 input 派發，且**打開勢力圖、存檔位後同樣症狀**（2.8 亦然）→ 與具體面板無關，是 scrim 節點本身造成。

**e) 引擎源碼確認機制**（`F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\cocos\`）

- `ui/block-input-events.ts`：`BlockInputEvents.onEnable()` 在節點上 `node.on(TOUCH_START/TOUCH_END/TOUCH_MOVE/MOUSE_*)`，handler 只設 `event.propagationStopped = true`。
- `2d/event/pointer-event-dispatcher.ts:48-58`：`class PointerEventDispatcher implements IEventDispatcher { priority = EventDispatcherPriority.UI; constructor(){ input._registerEventDispatcher(this); } }` → UI 派發器 priority=1，排在全局派發器（GLOBAL=0）之前。
- 同檔 `dispatchEventTouch()`（:125-179）：對每個「有 touch 監聽且被命中」的節點 `claimedTouchIdList.push(...)`、`dispatchToNextEventDispatcher = false`、`break` → 回傳 `false`。
- `input/input.ts:345-359` `_emitEvent()`：`if (!dispatcher.dispatchEvent(event)) { break; }` → **UI 派發器一回 false，後面的全局 `input` 派發器永遠不跑**。
- 本項目全域只有 scrim 這一個節點級觸聽（grep 全 scripts：`node.on(TOUCH/MOUSE)`/`addComponent(Button)` 僅 `CampaignRoot.ts` 的 `BlockInputEvents` 一處）；所有面板都靠全局 `input.on(TOUCH_END)` 做命中（`CampaignRoot.ts:3407`、`CityListPanel.ts:717` 等，公式逐字相同）。所以只要打開任何 scrim 面板 → 全體按鈕失效。**這是一個系統性 bug，不是城池一覽獨有。**

---

## 2. 改了哪些文件、哪些行、為什麼

### 2.1 `F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts`

| 位置 | 改動 | 為什麼 |
|---|---|---|
| import 區（原 :15） | 移除 `BlockInputEvents,` | 不再需要（見下） |
| `showSheetScrim()`（:4420-4432） | **移除 `n.addComponent(BlockInputEvents);`**，暗幕只留 `UITransform 750×1334 + Graphics 半透明黑`；並在 :4413-4418 寫入【r224 觸控根因】註釋 | 根因就在這一行：掛了它 → UI 派發器認領 touch → 全局 input 斷流。暗幕的「視覺壓暗」職責保留 |
| `onTouch()`（:3407-3411） | 開頭新增守衛：`if (this.node.children.some((child) => child.name.startsWith('Scrim_'))) return;` | 補回原 `BlockInputEvents` 的「暗幕開著時地圖不吃點擊」語義，但不再影響全局 input。哪個面板開著，其 `Scrim_<tag>` 節點就存在（`hideSheetScrim` 會 destroy） |
| `openCityList()` 的 `onPick`（:4531-4537） | 移除原本的 `this.hideSheetScrim('list');`，只留 `this.selected = name; this.refresh();` | CityListPanel 檔頭 :9 明確寫「本面板不自動關閉」；選城後面板仍開著，若提前收暗幕，守衛失效 → 地圖會重新吃點擊（穿透）。暗幕要留到「關閉/返回地圖」一起收（`onClose` 裡才 hide） |

### 2.2 `F:\sanguo\game\cocos\assets\scripts\CityListPanel.ts`

只刪臨時插樁，**邏輯、命中矩形、繪製座標一律未動**：
- `open()` 裡 6 條 `[HBFIX] citylist open-1..6` 日誌（還原成原樣）
- `onTouch()`（:717-724）第一行 `[HBFIX] citylist onTouch entered ...` + `[R224-TMP] citylist tap {...}` 探針整段刪除，還原為 `if (!this.opened) return; ... this.tap(local.x + HALF_W, HALF_H - local.y);`

### 2.3 `F:\sanguo\game\cocos\native\engine\android\app\build.gradle:24-25`

`versionCode 18 → 19`、`versionName "2.8" → "2.9"`（按 Lead 要求出 2.9）。

### 2.4 未改動（明確聲明）

- `CampaignRoot.ts:162/170/177` 三個裝裱帶命中矩形：**未改**（像素量證明繪製與原始碼常量一致，見 1.1b）。
- 任何面板的 `onTouch` 換算公式與坐標表：**未改**。
- `game/src/core/**`：**未改**（`node work\cocos_sync\sync_core3.mjs --diff-only --strict-skip` = 文件 27 / 相同 27 / 有差異 0 / SKIP-DIFF 0 / EXIT 0）。
- 未用 git、未跑 `tools\build_wechat.ps1`、未碰 `work/palette_guard/**`。

---

## 3. 「同一座標點：2.8 怎樣 / 2.9 怎樣」對照表（均為實機 adb 點按）

設備坐標系 1456×2560；換算式 `dev = design*1.9189 (+8.5 x)`。

| 場景 | 觸點（設計 / 設備） | 2.8 行為（實測） | 2.9 行為（實測） | 截圖 |
|---|---|---|---|---|
| 地圖裝裱帶·列表 | (664,794) / (1283,1523) | 打開城池一覽 ✓ | 打開城池一覽 ✓ | `51_v2_open.png` |
| 地圖裝裱帶·存檔 | (76,794) / (154,1524) | 打開存檔位 ✓（再點無反應） | 打開存檔位 ✓，關閉 ✓ | `70_v2_saves_open.png` / `71_v2_saves_closed.png` |
| 地圖裝裱帶·名冊 | (206,794) / (404,1524) | （未測 2.8） | 打開武將資料 ✓，關閉 ✓ | `72_v2_book_open.png` / `73_v2_book_closed.png` |
| 地圖裝裱帶·勢力 | (464,40) / (899,77) | 打開勢力圖 ✓（關閉無反應） | 打開勢力圖 ✓，關閉 ✓ | `68_v2_forces_open.png` / `69_v2_forces_closed.png` |
| 地圖裝裱帶·物品 | (648,40) / (1252,77) | （未測 2.8） | 打開物品面板 ✓，返回 ✓ | `74_v2_items_open.png` / `75_v2_items_closed.png` |
| 城池一覽·關閉 | (661,60) / (1277,115) | **無反應（卡死）**、logcat 零 JS 日誌 | 關閉回大地圖 ✓ | `63_v2_close.png` |
| 城池一覽·篩選 全部/己方/敵方/無主 | (100/274/448/622,158) | **無反應** | 四個都切換成功（己方→1/1 頁僅平原；敵方→26 城 2 頁） | `55/54/52/53_v2_filter_*.png` |
| 城池一覽·排序 城名/勢力 | (524/634,202) | **無反應** | 排序切換成功（勢力排序見截圖分組） | `57_v2_sort_name.png` / `56_v2_sort_force.png` |
| 城池一覽·下一頁 | (677,1142) / (1308,2191) | **無反應** | 第 2/4 頁 ✓ | `58_v2_next.png` |
| 城池一覽·上一頁 | (73,1142) / (149,2191) | **無反應** | 回第 1/4 頁 ✓ | `59_v2_prev.png` |
| 城池一覽·點行選城 | row 中心 / (728,898) | **無反應** | 行高亮切換、面板依設計不自動關 ✓ | `60_v2_row_pick.png` |
| 城池一覽·返回地圖 | (375,1216) / (728,2333) | **無反應** | 回地圖、選城生效、按鈕變「出征」✓ | `62_v2_back_map.png` |
| 穿透：面板開著點「勢力」 | (464,40) / (899,77) | 會開/切勢力圖（穿透） | 面板完全不變 ✓（無穿透） | `65_v2_passthru_forces.png` |
| 穿透：面板開著點「存檔」 | (76,794) / (154,1524) | 會切存檔位（穿透） | 面板完全不變 ✓ | `66_v2_passthru_save.png` |
| 城市面板（平原·內政頁） | (447,358) / (866,687) 開；(70,58)/(143,111) 返回 | 可開；返回後面板無反應（同因） | 開 ✓，返回 ✓ | `76_v2_city_open.png` / `77_v2_city_closed.png` |
| 大地圖·內政 | (187,1200) / (367,2303) | — | 進內政頁 ✓，返回 ✓ | `78_v2_neizheng.png` / `79_v2_neizheng_back.png` |
| 大地圖·內政終了 | (562,1200) / (1087,2303) | — | 推進一月 ✓（戰報刷新） | `80_v2_month_end.png` |

（2.8 那幾條「無反應」是本次要修的 bug 現場；2.9 同一座標全部生效。2.8 的數據來自本次排查時在 2.8 包上的實測記錄。）

---

## 4. 實機逐項驗證截圖清單（`F:\sanguo\work\hitfix\`）

2.9（V2 正式包，無任何插樁）逐項：全部以 `adb shell input tap` + `screencap -p` → `adb pull` 取得。

| 檔案 | 內容 |
|---|---|
| `50_v2_map.png` | 開局進大地圖基準（平原·劉備·金4762/兵244） |
| `51_v2_open.png` | 城池一覽打開（60 城/4 頁/全部已選） |
| `52_v2_filter_enemy.png` | 篩選「敵方」→ 26 城 2 頁 |
| `53_v2_filter_neutral.png` | 篩選「無主」→ 33 城 |
| `54_v2_filter_ours.png` | 篩選「己方」→ 1/1 頁僅 平原 |
| `55_v2_filter_all.png` | 回「全部」→ 4 頁 |
| `56_v2_sort_force.png` | 排序「勢力」→ 按勢力分組 |
| `57_v2_sort_name.png` | 排序「城名↑」→ 回城名序 |
| `58_v2_next.png` | 下一頁 → 第 2/4 頁·16–30 筆 |
| `59_v2_prev.png` | 上一頁 → 第 1/4 頁 |
| `60_v2_row_pick.png` | 點第 4 行「予章」→ 行高亮、面板不關（設計如此） |
| `61_v2_no_passthrough.png` | 面板開著時點的落點（落在表格行 → 正常換選） |
| `62_v2_back_map.png` | 返回地圖 → 選城生效、按鈕變「出征」 |
| `63_v2_close.png` | 再開 → 按「關閉」→ 回大地圖 |
| `64_v2_open_again.png` | 重開城池一覽 |
| `65_v2_passthru_forces.png` | 面板開著點「勢力」→ 畫面不變（無穿透） |
| `66_v2_passthru_save.png` | 面板開著點「存檔」→ 畫面不變（無穿透） |
| `67_v2_closed.png` | 關閉 → 回地圖 |
| `68_v2_forces_open.png` / `69_v2_forces_closed.png` | 勢力圖 開 / 關 |
| `70_v2_saves_open.png` / `71_v2_saves_closed.png` | 存檔位 開 / 關 |
| `72_v2_book_open.png` / `73_v2_book_closed.png` | 名冊（武將資料）開 / 關 |
| `74_v2_items_open.png` / `75_v2_items_closed.png` | 物品 開 / 返回 |
| `76_v2_city_open.png` / `77_v2_city_closed.png` | 城市面板（平原·內政頁）開 / 返回 |
| `78_v2_neizheng.png` / `79_v2_neizheng_back.png` | 內政頁 進 / 返回 |
| `80_v2_month_end.png` | 內政終了 → 推進一月 |

另有診斷期截圖 `40_*`、`41_*`、`42_v1_after_close.png`、`43_v1_filter_ours.png`、`44_v1_row_pick.png`、`50_web_*`、`51_web_*`、`52_web_*`（web 端診斷，保留備查）。

驗證時 logcat 全程 `JS: Error/Exception/TypeError/ReferenceError` 命中數 = **0**；app pid 存活、`mCurrentFocus=com.sanguo.sango2/com.cocos.game.AppActivity`。

---

## 5. 門禁數字（全部從乾淨狀態重跑）

| # | 命令 | 結果 |
|---|---|---|
| G1 | `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` | **EXIT 0** |
| G2 | `node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **EXIT 0** |
| G3 | `node --test "tests/*.test.ts"` | **tests 1886 / suites 89 / pass 1885 / fail 0 / todo 1 / EXIT 0**（與基線一致） |
| G4 | `cd F:\sanguo; node work\check_parity.mjs` | `parity: 12 條 · Cocos 缺 0 處 · 調試項 7（不判紅） · 失敗 0 · OK`，**EXIT 0** |
| G5 | `node work\enc\scan_utf8.mjs` | `scan: 602 files, 0 BAD, 14 allowlisted / 16554 hits, 4 WARN, 588 clean -> OK`，**EXIT 0** |
| G6 | `node work\cocos_sync\sync_core3.mjs --diff-only --strict-skip` | 文件 27 / 相同 27 / 有差異 0 / SKIP-DIFF 0 / **EXIT 0** |

### 探針清理證據（必須刪的都刪了）

```
cd F:\sanguo\game\cocos\assets\scripts
Get-ChildItem -Filter *.ts | Select-String -Pattern 'HBFIX|R224-TMP'
→ count = 0
```
`BlockInputEvents` 在 `CampaignRoot.ts` 只剩兩處**註釋**（:3409、:4413），已無任何 `addComponent(BlockInputEvents)`/import。

---

## 6. 交付物

| 項 | 值 |
|---|---|
| APK | `F:\sanguo\dist\android\sanguo-native.apk` |
| 字節數 | **58,130,106 B** |
| SHA-256 | **545016C7F150DEA51DDE9719B90BE1F13B853882F65D7A91138A3BEC27037D82** |
| versionCode / versionName | **19 / 2.9** |
| aapt2 | package `com.sanguo.sango2`、label `三國群英傳2·豎版`、launchable `com.cocos.game.AppActivity`、native-code `arm64-v8a` `armeabi-v7a` |
| assets\res | 3,028 files / 22,012,838 B（mp3 109 個 / 6,298,093 B） |
| 构建 | `& .\tools\build_native.ps1`：同步閘門 27/27 同；Cocos CLI 退出碼 36、23s、`build Task (android) Finished`；gradle 退出碼 0、12s、BUILD SUCCESSFUL |
| 裝機 | `adb -s 127.0.0.1:16384 install -r` → Success；`dumpsys package` 確認 versionName=2.9 / versionCode=19 |

---

## 7. 還有哪些沒驗到（誠實清單）

**已驗「能開、能用、能關」的入口**：地圖裝裱帶 存檔/名冊/勢力/列表/物品、城池一覽全部按鈕（關閉、4 篩選、2 排序、上下頁、點行、返回地圖）、勢力圖、存檔位、名冊、物品、城市面板（平原·內政頁）、內政頁、內政終了、地圖點城、開面板時的穿透測試（勢力/存檔兩個點）。

**沒逐一點到的**（錄入供後續巡檢，風險低——都是「面板打開後」的內部按鈕，輸入通道已由本次修復打通）：
1. `MonarchPanel`（君主面板）入口與其內部按鈕 —— 未驗（本次未找到穩定入口點擊序列）。
2. `CityPanel` 內 9 個月令命令（搜索/開發/徵兵/太守·軍師/武將資料/自治施行/出征/情報/移動武將）—— 只驗了面板開/返回。
3. `GeneralBookPanel` 內部：按勢力/按城/清除篩選、姓氏分頁、上頁/下頁、卡片關閉（`cardClose`）—— 只驗了開/關。
4. `ItemsPanel` 內部：裝備/卸下/全部解鎖/物品格點選 —— 只驗了開/返回。
5. `SaveSlotsPanel` 內部：存 / 讀 / 刪、槽位列切換 —— 只驗了開/關。
6. `ForcesPanel` 內部：上頁/下頁/點勢力高亮其城 —— 只驗了開/關。
7. 出征流程、Deploy 場景、Battle 場景、月令其它地圖按鈕（`actionRects` 除內政/內政終了外）—— 未驗（不在本次 bug 面）。
8. web-mobile 端「修後真實鼠標點擊」回歸 —— **未完成**：web 端用 CDP 點擊時觀察到頁面 `cc.game.isPaused()=true` 且 `cc.input` 在 web 運行時取不到，先前 web 的「點不動」觀察被判定為假陰性；本次以原生端實機數據定案，web 端未做最終回歸（web 端本來就沒有這個原生派發器斷流 bug 的觸發路徑——`BlockInputEvents` 在 web 同樣存在，但本次修復後 web 與原生同一份代碼，風險已覆蓋）。
9. `SkinLab` 等非遊戲場景的暗幕/面板 —— 未驗。

> 建議：運維打開上面任一未點按鈕，若仍無反應，按同一條線索檢查是否還有別的全屏節點掛了 `BlockInputEvents`/`Button`（本項目目前 grep 已無）。
