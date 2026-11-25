
## 3 本輪轉生效的 11 條（原本 `WISE_UNIMPLEMENTED` 裡）

### 3.1 登記（`game/src/core/wises_effects.ts` 的 `WISE_EXTRA_SPECS`）

| seq | 條目 | Execute | op | 值 | 寫入 | 讀取點 |
| ---: | --- | ---: | --- | ---: | --- | --- |
| 4 / 25 / 51 | 擾亂敵將 | 9-11 | `tire` | 敵 +5 / +10 / +15 | `sides[B].general.tire` | `battle.ts:2065` → `settle().tire.B.before/after` |
| 5 / 27 / 50 | 減少疲勞 | 12-14 | `tire` | 我 −5 / −10 / −15 | `sides[A].general.tire` | 同上（A 側） |
| 6 / 34 / 55 | 離間計 | 30-32 | `loyal` | 敵 −8 / −15 / −25 | `sides[B].general.loyal` | `battle.ts:2062` → `settle().loyalty.B`；`capture.ts:396` → 招降 |
| 32 | 勸降 | 33 | `persuade` | 敵 −15（帶雙閘） | `sides[B].general.loyal` | 同上 |
| 24 | 化解計策 | 57 | `dispel` | 敵方 `army.seq` 清空 | `army[B].seq = null` | `strategy.ts:779` 的派發閘 → 敵方整場不派發 |

**閘**（照抄 `strategy.ts:485-486` 的 `persuade` 分支）：`loyal > 90 || constancy > 5` → 不生效，`applyWise` 回 `{ ok:false, note:'條件不滿足，未生效' }`。

### 3.2 差分量測（同一 seed=11，開/關該技對比，`node work/wises84/measure.ts`）

```
4  擾亂敵將1檔  settle().tire.B.before      0 →   5   (+5)
25 擾亂敵將2檔  settle().tire.B.before      0 →  10   (+10)
51 擾亂敵將3檔  settle().tire.B.before      0 →  15   (+15)
5  減少疲勞1檔  settle().tire.A.before     40 →  35   (−5)
27 減少疲勞2檔  settle().tire.A.before     40 →  30   (−10)
50 減少疲勞3檔  settle().tire.A.before     40 →  25   (−15)
6  離間計1檔    settle().loyalty.B.before  33 →  25   (−8)
34 離間計2檔    settle().loyalty.B.before  33 →  18   (−15)
55 離間計3檔    settle().loyalty.B.before  33 →   8   (−25)
32 勸降         settle().loyalty.B.before  33 →  18   (−15)   ok=true
32 勸降（反向） 關羽 loyal=100 constancy=6   99 →  99   ok=false（雙閘擋住）
24 化解計策     strategyEvents(B 側派發)    1 →   0
24 化解計策     army.B.seq                  1 → null
24 化解計策     strategyEvents(A 側派發)    1 →   1（只清敵方，不清自己）
```

口徑說明：`settle()` 會把 `g.loyal` / `g.tire` 改寫成「戰後值」（`battle.ts:2070/2074`），故上表的 `before` 必須在 `settle` 之前取快照——`measure.ts` 與測試都先 `snapshot()` 再 `settle()`。
「減少疲勞」在全新世界上 `tire=0`，clamp 後無差量，故量測前手動置 `tire=40`（貼近出征頁 `?atire=` 的真實用法）。

### 3.3 為什麼 `battle.ts` 一行沒改

11 條的落點全是 `battle.ts` **既有**讀取的欄位：`general.tire`（`battle.ts:2065`）、`general.loyal`（`battle.ts:2062`）、`army.seq`（`strategy.ts:779` 派發閘）。寫欄位即生效，再加消費點反而會重複計算。這正是舊文檔「24 條沒有消費點」出錯的根因：**消費點在 `battle.ts` 的欄位讀取上，不在 `wises.ts` 的登記表裡**。

### 3.4 疲勞為什麼不接戰力/命中係數

`docs/04b5` §2.2 / §2.5 是 **[确认]**：「疲勞 `+0x3A` 在戰力與命中判定裡一次都沒被讀」；全 `.text` 45 處 `[reg+0x3A]` 逐函數掃描無讀取點。故本輪只寫 `g.tire`，觀測面是 `settle().stats.tire`（與未來的月結算），**不**把它接成 `powerOf` 係數——那會與反彙編證據衝突。

### 3.5 忠誠真的有下游（不只 settle）

`settle()` 寫回的 `g.loyal`（`battle.ts:2070`）會被 `capture.ts:389-404` 帶進 `PostGeneral`（`loyal: lg.loyal`），再餵給 `capture.ts:160-166` 的 `profileOf` → 招降成功率表（`L < 25` → 100%，見 `capture.ts:176` 註釋）。所以 **離間計 3 檔 + 勸降** 可把呂布 33 打到 8，跨過「招降必成」門檻；這是可驗證的數值後果，不只是面板數字。

## 4 12 條「戰中派發型」（本來就生效，本輪只釘住不重複算）

這 12 條在 `wises.ts` 裡**不登記**：它們的消費者是 `strategy.ts` 的派發器 + `battle.ts` 的欄位讀取。若再在戰前登記一次，出征頁選技 + 戰中派發就會**雙算**。

| seq | 條目 | Execute | 派發器寫什麼 | `battle.ts` 消費點 | 運行時測試 |
| ---: | --- | ---: | --- | --- | --- |
| 28 | 亂陣 | 7 | 我軍 x/y 散開 + `rt.formation` | 1536 `formationBonus` | `strategy.test.ts` ✓ |
| 29 | 太公陣 | 8 | 我軍 x/y 回陣 + `rt.formation` | 1536 | — |
| 15 / 44 / 62 | 混亂敵軍 | 27-29 | 我 `atkMod` +5/+10/+15、敵 −5/−10/−15 | 1233 `powerOf` | 62 ✓（15/44 —） |
| 10 | 詐敗 | 45 | `flags \| mayRetreat` | 1607 撤退率 0.5 | — |
| 31 | 保護主將 | 46 | `flags \| guardGeneral` + `takenMul 0.75` | 1461 主將減傷 | — |
| 26 | 包圍敵軍 | 47 | `moveMul` 1.15 / 敵 0.9 + `posture` | 1407 移動 | — |
| 30 | 偷襲敵軍 | 48 | `moveMul` 1.2 | 1407 | — |
| 23 | 逼近敵軍 | 49 | `moveMul` 1.1 | 1407 | — |
| 33 | 金蟬脫殼 | 56 | `flags \| fleeAnytime` | 1607 撤退率 1 | — |
| 59 | 封武將技 | 64 | 敵 `flags \| sealMagic` | 1762 `cast()` 被拒 | `strategy.test.ts` ✓ |

本輪在 `tests/wises_r84.test.ts` 對這 12 條逐條斷言：**戰前 `applyWise` 一律 `ok=false` 且世界快照完全不變**（反向斷言，證明不雙算）。

## 5 顯式佔位：`3 後選出陣`（Execute 34）

```
WISE_SYSO_UNSUPPORTED = {
  3: '後選出陣 / Execute 34：派發器只發一條日誌（strategy.ts:498-501），本作沒有「預備兵/出陣隊列」資料結構，無法把後備武將換上場。',
}
```

**現狀**：`strategy.ts:498-501` 的 `reserve` 分支只 `ops.push({op:'note', text})`，零狀態改動。
**為什麼做不了**：`createWorld` 的 `units` 在開戰時一次生成（`battle.ts` 的 `sideRuntime.units`），全代碼沒有「換人/補員上場」接口；`SSAV` 裡預備兵是獨立數組，而 `0x44D450` 分支 34 之後只追到文字呼叫。
**需要什麼證據才能做**（任一即可）：
1. `SSAV` 結構裡預備兵數組的偏移與長度（`docs/` 尚未覆蓋）；
2. 分支 34 之後實際調用的函數地址（目前只追到 `0x48xxxx` 的字串）；
3. `EVENT` 表裡「出陣」事件號，能把後備單位插進 `units` 並同步 `soldiers/start/aliveCount`。

## 6 改動清單與驗證

| 檔案 | 改動 |
| --- | --- |
| `game/src/core/wises_effects.ts` | **新建**：`WISE_EXTRA_SPECS`(11) + `applyExtraSpec`(4 op) + `WISE_STRATEGY_ONLY`(12) + `WISE_SYSO_UNSUPPORTED`(1) |
| `game/src/core/wises.ts` | `WiseKind` +3、`WISE_KIND_LABEL` +3、`Spec.op` +4、`WiseSpec` 匯出、`SPECS` 併入 11 條、`applySpec` 回 `boolean`、`applyWise` 失敗分支、頭註釋改三分法、`WISE_UNIMPLEMENTED` 24→13 |
| `game/src/core/battle.ts` | **0 行**（沒有任何新增/修改） |
| `game/tests/wises.test.ts` | 4 處期望值更新：`43→54`、`24→13`、10 類→13 類、把 `applyWise(24)` 反向用例換成仍佔位的 `10`；`所有已實現條目都能 apply` 迴圈對 `32`（勸降雙閘）放行 |
| `game/tests/wises_r84.test.ts` | **新建** 16 個 test |
| `work/wises84/*` | `raw_table.txt`、`measure.ts`（差量）、`gen_table.ts`（全表生成）、`table.md`、`head.md`/`tail.md` |

**tsc**
- `cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json` → **EXIT=0**
- `npm.cmd exec -- tsc --noEmit` → **EXIT=0**

**測試**
- `node --test tests/wises_r84.test.ts tests/wises.test.ts` → **65 tests / 65 pass / 0 fail**（49 + 16）。
- 全量 `cd F:\sanguo\game; node --test tests/*.test.ts` → **864 tests / 864 pass / 0 fail / 39 suites / 106.2 s，exit 0**。
- 過程中曾遇兩次**並發紅**，均非本輪引入：① `tests/surrender.test.ts:105`（`袁紹 34 → 88.4%`，`50 !== 34`，且測試名在兩次跑之間從「袁紹」變成「兀突骨」）；② `tests/syso.test.ts:98`（`isSystemSoHostName` 25 vs 34）。兩者的檔案（`surrender.test.ts`、`syso_host.ts`）都在**本輪禁改清單**內，mtime 落在我的全量跑期間，單跑該檔即全綠；兄弟 agent 收工後復跑即 864/864。
