## 三、v4 與 c5 差在哪

### c5（`project/123`）：43 生效 / 24 條待補 → 舊賬

`project/123_原作差距复查.md` §3 寫「軍師技 24 條補全（67 條中 43 生效），24 h，單條最大功能缺口」。這個 43/24 直接抄自 `project/26_军师技系统.md` 開頭的「43 條有實現 + 24 條占位」，而 R26 是 **R84 之前**的口徑。R33（`project/109`）把 Execute 34 判阻塞、R37（`project/61`）把 12 條戰中派發接進 `strategy.ts`、R84（`project/94`）又把 11 條補成戰前效果之後，實際分類早已是 **54 + 12 + 1**。

- c5 說缺 24 條：實際 **0 條無落點**、1 條阻塞。
- c5 說 43 生效：實際 **66 條有落點**（57 真 + 9 代理）。
- 差額：**多報 23 條**；24 h 的估算不成立（真缺口 0，R88 只花在修 7 條假落點 + 去重 + 測試）。

### v4（`project/94`）：67 條全有落點 → 計數對，質量不對

v4 的「54 + 12 + 1」分類與代碼一致，這是它對的部分。但它只驗了「有沒有寫」，沒驗「寫了有沒有效」，也沒驗入口會不會重複套用：

1. **7 條假落點**：6 條恢復類（11/12/40/41/57/58）的戰前登錄是瞬回，滿血開戰時 `probe` 的 `pre` 差量為空——等於沒寫；十面埋伏（54）的「後排 +6 兵」在原作 `0x44E09D` 查無出處（原作是 `foeArmy+0x84 |= 4`）。v4 §3 的差量數字只證明了「有寫」，沒證明「有效」。
2. **67 條全部雙算**：`main.js:613-615` 把出征頁的 `?wise=` 同時傳給 `applyWise()`（戰前）與 `createWorld` 的 `strategy`（戰中派發），v4 卻只在 12 條上聲稱「戰中派發、不雙算」。實測（`probe_before.txt`）：離間計 L3 忠誠 50→25→0、增加體力 L3 maxHp 101→141→211、保留氣力 qiCostMul 1→0.8→0.528。
3. **12 條戰中技的提示是 null**：`wiseHintOf` 只查 `SPECS`，出征頁對這 12 條顯示不出效果，外觀上就是「未實作」——c5 的誤判一部分來自這裡。

結論：**v4 的計數對、結論「全有落點」不對；c5 的計數與工時都不對。** 以原作負證據判，真缺口是 7 條假落點（已補）+ 1 條阻塞（維持），不是 24 條。

## 四、R88 新實裝清單（file:line + 差分量測）

同 seed 11、`createWorld({data, seed:11})`，差量數字全部由 `game/tests/wises24.test.ts` 斷言（27 條）。

### 4.1 一場只結算一次（最大缺口）

- `game/src/core/wises.ts:318-357`：`START_APPLIED` WeakMap + `wiseFingerprint()`（士氣/單位數/修正表/flags/敵 seq/主將五維）+ `wiseAppliedAtStart()`。
- `game/src/core/wises.ts:453`：`applyWise()` 成功且指紋真的變了才記帳（滿血恢復＝沒變＝不記，留給戰中派發器）。
- `game/src/core/battle.ts:1581-1591`：`step()` 在 `tickStrategy()` 前把「戰前已生效」的 `army.seq` 清空。**只讀清單、只清 seq，不動任何戰鬥公式。**

| seq（技） | 雙算（改前） | 只算一次（改後） |
|---|---|---|
| 55 離間計 L3 | B.loyal 25 → **0** | **25** |
| 61 增加體力 L3 | maxHp 141 → **211** | **141** |
| 60 增加技力 L3 | mpMax 91 → **145** | **91** |
| 39 降敵士氣 L3 | B.morale 48 → **8** | **48** |
| 17 增強攻擊 | powerOf 增量 **+20** | **+10** |
| 8 保留氣力 | qiCostMul **0.528** | **0.8** |
| 21 增加經驗 | expPct **30** | **0** |
| 6 離間計 L1 | B.loyal 42 → **34** | **42** |
| 7 減緩集氣 L1 | B.qiTier **−1** | **0** |
| 20 喝阻敵軍 L1 | B 兵數 **90** | **100** |

### 4.2 十面埋伏（54 / Execute 44）：假的 +6 兵 → 原作 noRetreat

- `game/src/core/wises_effects.ts:112-122`：`case 'no_retreat'`，敵將有 `Horse` → `return false`（原作 `0x40918A` 破解分支）；否則 `army.flags |= 0x4`。
- `game/src/core/wises_effects.ts:174`：登記 `54`（`WISE_SPECS[54]` 由 `WISE_EXTRA_SPECS` 併入）。
- 刪除 `wises.ts` 舊的 `54: { op:'units', value:6 }`。
- 差量：`B.flags 0 → 4`；`A` 兵數 **100**（舊 106）；`requestRetreat(B) true → false`；有坐騎時 `ok=false`、flags 0。

### 4.3 恢復體力/技力 6 條：瞬回（滿血無效）→ 原作持續回復

- `game/src/core/wises.ts:184-186`：`11/40/57` → `hp_regen` 40/60/80；`:176-178`：`12/41/58` → `mp_regen` 30/50/70。
- `game/src/core/wises_effects.ts:123-140`：寫 `army.hpRegen/mpRegen`、`army.qiParam`、`flags |= 1/2`；`battle.ts:2107-2118` 的 `strategyRegen()` 每 60 tick 按 max×param/1000 回復。
- 差量：`11: hpRegen 0→40、flags 0→1`；`12: mpRegen 0→30、flags 0→2`；改前 `pre` 差量為空（滿血瞬回＝沒寫）。

### 4.4 勸降（32 / Execute 33）：補原作投靠位

- `game/src/core/wises_effects.ts:100-110`：五道閘不變；成功先 `army.flags |= 0x400`（原作 `foeArmy+0x84 |= 0x400`），再扣忠誠 15（`capture.ts` 招降代理）。
- 差量：`B.flags 0 → 0x400`、`B.loyal 50 → 35`；忠誠 99 時 `ok=false`、flags 0。

### 4.5 12 條戰中技的 UI 提示

- `game/src/core/wises_effects.ts:183-196`：`WISE_STRATEGY_HINTS`（12 鍵）；`wises.ts:472` 的 `wiseHintOf()` 改為 `SPECS ?? HINTS ?? null`，seq 3 仍 null。
- 效果：出征頁對 12 條由「無說明」變成「戰中：…」，不再被誤讀成未實裝。

### 4.6 測試

- 新增 `game/tests/wises24.test.ts`：**27 條**，全過；每條新實裝至少 1 條同 seed 差分量測（見上表）。

## 五、獨立複核 Execute 34（seq 3）：維持 [阻塞]

r33 的依據是 `work/dis_battle_B_44D450.txt:763-768`。本輪獨立重讀：

- `0x44DE44` 分支體（dis 763-768）只有三條指令：`push 0x491900`（字串「成功」）→ `call 0x46dae0`（消息欄）→ `jmp 0x44e6c7`。**沒有一條寫內存**。
- 分支入口由 `0x44D3E0` 的閘 + `idx = 0x40A63A(unit1->self) - 1` 選中；`0x40A63A` 取的是 `SEQUENCE`（1-based），所以 `3` 是 `wises.json` 的 `SEQUENCE`，不是「第 3 回合」。`Execute = 34` 才是分支號。
- `ATTRIB=1`（戰前選擇）與 `project/52:172`（本作無出陣隊列）、`docs/07b` §6（Obj3 部隊池）一致：真實效果是「使用方在敵方之後選將/兵種」，需要戰役編成層的 5 將隊列 + 開戰前重排，戰場內核沒有這個結構。
- R88 的一次性守衛不會誤攔它：`applyWise(3)` 回 `ok=false`、指紋不變、不進清單，`army.seq=3` 照舊進派發器（只打日誌）。`wises24.test.ts` 有專門用例釘住。

**結論：r33 正確，維持 [阻塞]。** 三處既有測試（`wises_r84.test.ts:84-135`、`wises.test.ts` 的 seq 3 用例、`strategy.test.ts` 的 seq 3 用例）與 R88 新用例互不矛盾。

## 六、[阻塞] 清單（需要什麼證據/改動才能做）

1. **Execute 34 / seq 3 後選出陣** — 維持阻塞。需要：戰役編成層的「出陣隊列」結構（5 將 + 兵種順序）與開戰前重排入口；`docs/07b` §6 Obj3 部隊池是唯一線索，戰場內核與 `game/web` 都沒有。
2. **勸降真轉將（seq 32）** — `0x400` 位已寫，但消費端未定位。需要：`0x44D450` 之外讀 `army+0x84 & 0x400` 的代碼（換陣營/戰後處置/AI 目標選擇）。現有 `capture.ts` 只按忠誠招降，屬代理。
3. **偷襲（seq 30 / Execute 48）方向** — 原作 `foeArmy+0x68=4`，本作寫成我方 `posture 4 / moveMul 1.2`。需要改 `strategy.ts:planStrategy` 的 raid 分支（本輪不在可改清單），把 op 的 side 換成 `foe`。
4. **疲勞倍率（Execute 9-14）** — 原作寫 `unit+0x34 |= 0x1000`、`unit+0x38 ±1..3`，戰後 `0x41048D`/`0x4103DE` 用 K 表 30..250%；本作 `Unit` 沒有對應欄位，`general.tire ±5/10/15` 是近似。需要：`Unit` 增 `fatigueMul/fatigueIdx` + 戰後結算接線（不止讀取點）。
5. **數值口徑（Execute 15-20、53-55）[待定]** — 原作是 maxHp/mpMax 百分比（20/35/50、25/40/60）與經驗 `+0x3c` 30/50/100 點；本作沿用 R26「本作定」的 `+15/25/40`、`+12/20/30`、`+15/25/40%`。有原作證據但改動會動平衡，本輪不動，留给數值輪。

## 七、既有測試期望值改動（逐條理由）

只動了 `game/tests/wises.test.ts` 兩處：

1. **「十面埋伏（54）：後排追加 6 名兵」→「敵方 noRetreat 位，兵數不變」**
   理由：原作 `0x44E09D` 起是 `foeArmy+0x84 |= 4`（有坐騎則只打「破解我方埋伏」），`+6 兵` 在任何文檔/反彙編裡都沒有出處；舊期望值是把 R84 的猜測釘死了。新期望值同時斷言我方 flags 不變、兵數不變。
2. **「恢復體力（11）：只回當前體力」→「寫戰中持續回復 40，不動當前體力」**
   理由：原作 Execute 35-37 是 `army+0x84 |= 1`、`+0x88 = 40/60/80` 的持續回復，不是瞬回；舊期望值（50→74→98）在滿血開戰時根本不會發生，等於把無效行為釘死。新期望值斷言 `hp` 不變、`hpRegen=40`、`flags=1`。

其餘基線測試（972 條）一條未改；`wises_r84.test.ts` 的 54/13/12 三分與 seq 3 契約全部保留。

## 八、驗收

| 項 | 命令 | 結果 |
|---|---|---|
| 構建型檢 | `npm.cmd exec -- tsc -p tsconfig.build.json` | **exit 0** |
| 全量型檢 | `npm.cmd exec -- tsc --noEmit` | **exit 0** |
| 新測試 | `node --test tests/wises24.test.ts` | **27 pass / 0 fail** |
| 軍師技三件套 | `node --test tests/wises.test.ts tests/wises24.test.ts tests/wises_r84.test.ts` | **93 pass / 0 fail** |
| 全量 | `node --test tests/*.test.ts` | **1032 pass / 0 fail**（97.2 s；基線 972） |
| 裁決表 CSV | `work/wises24/wise_table.csv` | 67 行 + 表頭 |

禁改檔案：`game/web/**`、`game/cocos/**`、`game/src/core/runtime.ts`、`project/37a|31|44`、`game/web/main.js` 全部未動；`tools/build_wechat.ps1` 未跑。

## 九、沒做到

- 9 條「有·代理」沒有轉正：疲勞倍率（要改 `Unit` 模型）、偷襲方向（要改 `strategy.ts`）、勸降轉將（消費端未定位）、化解計策原作語義（原作只打日誌，本作的清 seq 是代理）。
- Execute 34 仍是阻塞（維持 r33 結論）。
- 12 條戰中技的強度只核對了 `dis` 地址與欄位，沒有逐條重新反編譯全部指令；R37 的 `[推測]` 仍在（回血節奏、`takenMul 0.75`、`moveMul` 折算）。
- 只跑了 Node 測試，沒有跑 Web 構建/瀏覽器回歸（本輪禁改 web，且 `main.js` 的 `?wise=` 接線未動）；`project/94` 未改寫，以本報告為準。
