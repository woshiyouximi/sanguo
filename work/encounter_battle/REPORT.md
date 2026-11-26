# F-06 修復報告：路上遭遇戰改為真打（Cocos 正式版側）

- **日期**：2026-11-26
- **範圍**：`game/cocos/assets/scripts/CampaignRoot.ts`（唯一改動的既有檔）+ 新增 `game/tests/encounter_battle.test.ts`
- **未動**：`web/**`、`game/src/core/**`、`SurrenderModel.ts`、`DeployRoot.ts`、`BattleRoot.ts`、`GameState.advanceMonth`（GameState.ts 本次**零改動**）
- **判定**：✅ 完成。遭遇戰拖過一個月 → 進 `Battle` 場景真打；舊 `Math.random()` 折算僅在 `?autoenc=1` / `AUTO_ENCOUNTER = true` 時保留（默認關，註釋寫明「僅調試用，正式版必須真打」）；戰後兵損/勝負/俘將處置全走既有管線。

---

## 1. 現狀復核（修前）

`game/cocos/assets/scripts/CampaignRoot.ts` 原 `advanceArmiesMonth()`（原行 3482-3519）在 `stationStandoff()` 對峙分支直接：

```ts
const chance = Math.max(0.15, Math.min(0.85, mine / (mine + foe)));
const win = Math.random() < chance;
const winner = win ? a : b; const loser = win ? b : a;
GameState.removeArmy(loser.id);
GameState.updateArmy(winner.id, { troops: Math.round(winner.troops * 0.5), progress: 0 });
```

註釋自認「Cocos 沒有路上野戰場景…所以走 web 批次推進用的 resolveEncounter() 口徑。標 [新設計]」。web 對應的 `game/web/campaign.html:4547 startEncounter()` 是「兩支部隊都 removeArmy → 跳戰鬥頁真打」。本輪把 Cocos 側也改成真打，**這條「[新設計]」口徑作廢**。

## 2. 改了哪段（`CampaignRoot.ts`，4306 → 4868 行）

| # | 位置（現行號） | 內容 |
|---|---|---|
| 1 | 1111-1457 | **新增純邏輯區** `#region 遭遇戰（F-06）：真打入口 + 戰後回寫（純邏輯）`，內含 `[[ENCOUNTER_CORE]]` … `[[/ENCOUNTER_CORE]]` 標記段（零 `import 'cc'`、零 `GameState`/`sys`/`director` 依賴，供測試逐字抽取剝型跑行為） |
| 2 | 1746-1748 | `initCampaign()` 之後：`if (freshRun) this.clearEncounterPending();`（同劇本同勢力重開 runKey 不變，必須清舊快照） |
| 3 | 1762-1766 | `start()` 裡 `this.loadBattleLog()` 之後、`healStaleQueue()` / `resolveCaptureFlow()` 之前：`const encounter = this.applyPendingEncounter(); if (encounter.logs.length > 0) this.pushBattleLog(encounter.logs);` |
| 4 | 1855-1858 | 既有招降 flow 的 `else if` 鏈末尾：`else if (encounter.note) { this.hintText = this.clampHint(encounter.note, 160); this.refresh(); }` |
| 5 | 2524-2534 | `endInterior()` 逐月迴圈：`const moved = this.advanceArmiesMonth();` 之後插 `if (moved.battle) { 存檔/戰報/hint/refresh; return; }`——本幀已切場景，**絕不能**繼續跑 `runMapAi()`/後續月份（否則戰後 wins/losses 增量判定被污染） |
| 6 | 3818-3989 | 新增類方法：`static queryValue()`、`encounterRunKey()`、`encounterGeneralOf()`、`encounterIntelGeneral()`、`startEncounterBattle()`、`applyPendingEncounter()`、`storeEncounterPending()`、`readEncounterPending()`、`clearEncounterPending()` |
| 7 | 3991-4087 | `advanceArmiesMonth()` 重寫對峙分支：真打優先，擲骰降為調試兜底；返回型別加 `battle: boolean`；doc 第 4 條改寫 |

### 新增純邏輯區要點（1111-1457）

- `const AUTO_ENCOUNTER: boolean = false;` —— **默認 false**，type annotation 必須顯式（否則 `=== true` 觸發 TS2367）。
- `autoEncounterOn(debugFlag)`：`AUTO_ENCOUNTER === true` 或 debugFlag 為 `'1'`/`true` 時為 true。
- `encounterSides(a, b)`：`#站` 雙方 side 必不同（`stationStandoff()` 保證），我方（`side === 'A'`）固定為 `mine`；兩邊都不是我軍 → `null`。
- `encounterLoadout(mine, foe, mineGen, foeGen)`：把「我方將名+屬性+兵+兵種陣形」「敵方將名+屬性+兵+兵種陣形」組成 `BattleLoadout`；兵力按 web `encounterUrl()` 同款 clamp 1..100。
- `encounterPendingOf / parseEncounterPending / encounterHold / encounterPlan`：跨場景快照的序列化/校驗（version + runKey + 形狀三道門）與戰後結算計畫。
- `encounterPlan()` 勝負判定：`win = after.wins > before.wins`、`lose = after.losses > before.losses`，都不變 → `draw`；勝方以 **半兵**（`ENCOUNTER_SURVIVOR_RATE = 0.5`，與 web/舊口徑一致）`progress: 0` 回到大地圖，敗方從地圖消失。

## 3. 戰鬥入口（復用既有 `BattleLaunch` 總線）

`startEncounterBattle(a, b)`（3893-3932）：

```ts
GameState.removeArmy(mine.id);
GameState.removeArmy(foe.id);
this.save = GameState.loadSave();
this.pushBattleLog([...'遭 遇 戰：… 進入戰場（真打）'...]);
GameState.startBattle(city, encounterLoadout(mine, foe, mineGen, foeGen));
```

- 入口就是既有攻城/守城同款 `GameState.startBattle(target, loadout)`（`GameState.ts:997`）→ `director.loadScene('Battle')`；`BattleRoot` 認 `from === 'campaign'`，結算後自動 `director.loadScene('Campaign')` 回大地圖。
- **A 側 = 我方**：`BattleRoot` 固定 `aiSides: { B: true }`，所以把玩家放 A 側就是「玩家打 AI」。
- 攜帶資料：我方 `gen/genStr/genInt/genLevel/wise` + `soldiers`（1..100）+ `troop=2`（大刀）/`form=0`（方形）；敵方 `bgen/bstr/bint/bsoldiers` + `btroop=10`（黃巾）/`bform=3`（雁形）——兵種/陣形取 `BattleRoot` 對 `launch` 的缺省口徑（野戰沒有出陣頁可選）。
- `city` 傳**已在 owned 的我方城**（`mine.from`，退回 `owned[0]`）。原因寫在程式註釋：`recordBattleResult()` 對 `!city` 直接 return（戰績全落不了庫）；傳不在 owned 的城則我方 A 勝時會被 `if (won) save.owned.push(city)` 誤算成「攻下這座城」。
- 兩支部隊先 `removeArmy` 再切場景（與 web `startEncounter()` 同款）；勝方由回寫以半兵重建，敗方不再出現。

## 4. 戰後回寫（不重複造招降管線）

漏斗是「BattleRoot 結算 → 回大地圖 → `start()` 回寫 → 既有招降 flow」：

1. **BattleRoot（未改）**：`recordBattleResult(city, winner, armyId=null, defend=false, record)` 落 `wins/losses/streak/bestStreak`；`queuePostBattle()` 把俘虜/斬首寫進 `save.captured/executed`。
2. **跨場景載體**：`sys.localStorage['sanguo_encounter_v1']` 存「開戰前雙方部隊 + 戰前 wins/losses 快照」（Battle→Campaign 是新場景實例，`CampaignRoot` 欄位全丟）。快照帶 `runKey`（劇本:勢力）與版本號，換局/壞檔/舊版自動丟棄。
3. **`applyPendingEncounter()`（3940-3962，在 `start()` 的 `loadBattleLog()` 之後）**：
   - `encounterPlan()` 用「戰後 wins/losses − 戰前快照」判 A 勝 / B 勝 / 平手（draw 含中途退出：不增不減）；
   - `GameState.addArmy()` 復原勝方（半兵、`progress: 0`），平手雙方原兵力歸位；
   - 寫 `save.lastBattle = { won, city, defend: false, captured/executed/dead/joined: [], ts }`（`core/roster.readBattleOutcome()` 讀的權威勝負信號；俘虜佇列已由 `queuePostBattle()` 寫，**這裡只補勝負、不重複寫佇列**）；
   - `GameState.persistSave()`；戰報一行 `battleLogLine(month, plan.logText, plan.logKind)`。
4. **既有招降/處置入口照舊**：`start()` 接著跑 `healStaleQueue()`（先有 `lastBattle`，俘虜佇列才不會被當「無主戰果」清掉）→ `SurrenderModel.resolveCaptureFlow(save, data, {home, atCity, king, mine, scenIdx})`：我方勝 → 彈 `SurrenderPanel` 處置敵俘；我方敗 → 走 `planAiDisposal` 的 AI 處置與提示條。**`SurrenderModel.ts` 一行未改。**

## 5. 開關兜底（舊擲骰）

```ts
const debugDice = autoEncounterOn(CampaignRoot.queryValue('autoenc'));
if (!debugDice && this.startEncounterBattle(a, b)) battleStarted = true;
else { /* 舊 Math.random() 折算原樣保留 */ }
```

- 默認 `AUTO_ENCOUNTER: boolean = false` → 真打。
- `?autoenc=1`（或改常量）→ 走舊「兵多者勝率 clamp(0.15,0.85)、勝方留一半兵力」折算；戰報註明「僅調試用，正式版必須真打」。
- `queryValue()` 照 `BattleRoot.queryValue()` 同款：正則解析 `location.search` + 小遊戲 `wx.getLaunchOptionsSync()/getEnterOptionsSync()`，try/catch 兜底 null。
- 兩邊都不是我軍（AI vs AI 對峙）時 `encounterSides()` 回 null → 仍走折算（不把玩家不相關的 AI 互撞也送進戰場），此為原有行為。

## 6. 測試（新增 `game/tests/encounter_battle.test.ts`，11 tests）

來源契約（5）：

1. `CampaignRoot.ts` 含 `[[ENCOUNTER_CORE]]` 區塊、`const AUTO_ENCOUNTER[(: boolean)]? = false;`、註釋含「僅調試用」。
2. `advanceArmiesMonth()` 內含 `startEncounterBattle(a, b)` 且索引在 `Math.random()` **之前**（不再只靠擲骰），並帶 `autoEncounterOn(`/`debugDice`/`battle: battleStarted`。
3. `startEncounterBattle()` 內含 `GameState.startBattle(`、`encounterLoadout(`、`removeArmy(mine.id)`、`removeArmy(foe.id)`、`storeEncounterPending(`、`save.owned.includes(mine.from)`。
4. `applyPendingEncounter()` 存在且含 `encounterPlan(`、`GameState.addArmy(`、`lastBattle`、`persistSave()`；且 `start()` 內 `applyPendingEncounter()` 索引 < `resolveCaptureFlow(`（時序契約）。
5. `endInterior()` 含 `moved.battle` 早退且索引 < `this.runMapAi()`。

行為（6，抽 `[[ENCOUNTER_CORE]]` → `stripTypeScriptTypes` 剝型 → `new Function` 執行，不另寫鏡像）：

- `AUTO_ENCOUNTER === false`；`autoEncounterOn('1'|'true'?|'0'|undefined|null)` 的真值表（只有 `'1'`/`true` 開）。
- `encounterSides()`：A 側固定為 `mine`、B 側為 `foe`、同 side/缺 side → null。
- `encounterSoldiers()`：`0.4→1`、`250→100`、`47.6→48`、`'60'→60`（clamp 1..100）。
- `encounterLoadout()`：我方 120 兵 → `soldiers 100`、敵 90 兵 → `bsoldiers 90`；將名/STR/INT/等級/軍師技、兵種陣形常數、缺名兜底（`我軍主將`/`來犯之將`）。
- 快照往返：`encounterPendingOf → parseEncounterPending` 同 runKey 通過；換 runKey / 壞形狀 / 版本不符 / side 反 → null。
- `encounterPlan()`：A 勝（120→60、`lastBattle.won=true`、`city/ts` 保留、logKind `win`）、B 勝（敵 90→45、`won=false`、`lost`）、平手（雙方原兵力、`won=false`、`hold`）。

## 7. 驗證（全部通過）

| 項目 | 命令 | 結果 |
|---|---|---|
| 新測試 | `cd F:\sanguo\game; node --test tests/encounter_battle.test.ts` | **11 pass / 0 fail** |
| 全量測試 | `cd F:\sanguo\game; node --test tests/*.test.ts` | **tests 1865 / pass 1864 / fail 0 / todo 1** |
| 遊戲端型別 | `cd F:\sanguo\game; npx tsc --noEmit` | **exit 0** |
| Cocos 型別（倉庫門禁） | `cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **exit 0** |
| 編碼 | `cd F:\sanguo; node work\enc\scan_utf8.mjs game\cocos\assets\scripts\CampaignRoot.ts game\tests\encounter_battle.test.ts` | **2 files, 0 BAD, 0 WARN → OK** |

未跑：Cocos 構建、瀏覽器、模擬器（依紀律）。

### 關於 `tsc -p cocos`

任務書寫 `tsc -p cocos` 0。實測 `game/cocos/tsconfig.json` 是 `extends ./temp/tsconfig.cocos.json`（Cocos Creator 生成的 target ES2015 + 引擎宣告版本錯配），全倉 **465 條既有錯誤**（`Color` vs `Readonly<Color>`、`includes` 不存在於 ES2015 lib、`fromHEX`、`Vec3` 命名空間等），**與本輪改動無關**；本次新增段落（1111-1457、3818-4087）在該配置下**零錯誤**。倉庫一貫的 Cocos 型別門禁是 `cocos/tsconfig.check.json`（`project/165_打包前原作對比門禁.md` G7、`project/208`、`project/211` 等），本次以它為準 **exit 0**。原 `tsc -p cocos` 輸出已留 `work/encounter_battle/tsc_cocos_temp.log` 供核。

## 8. 遺留 / 已知限制

1. **勝負是「增量推定」而非直接訊號**：`BattleRoot` 不寫 `save.lastBattle`（禁改），只能靠回大地圖時 `wins/losses` 相對快照的增量判 A 勝/B 勝/平手。BattleRoot 的 `updateRecord()` 對 `draw` 不增不減，所以「平手」與「戰鬥中途退出/沒結算」同判——兩者都按「雙方歸位、原地重新走」處理（不損失部隊、不寫俘虜），可接受；若日後允許在 `BattleRoot` 寫 `lastBattle`，應改讀該權威訊號。
2. **遭遇戰勝利不攻下敵方出發城**：與 web `startEncounter()` 口徑一致（只 `removeArmy` 對方部隊）。`recordBattleResult()` 的 `city` 刻意傳我方 owned 城，避免 A 勝誤 annex。web 側 `encounterUrl()` 傳 `city: a.to` 的老口徑**沒有照抄**（那會讓勝方把路過城算成攻下）。
3. **AI vs AI 對峙仍走擲骰**：`encounterSides()` 只認「一方是我軍」；玩家不在場的兩支 AI 部隊撞上，仍按兵力折算（避免把無關戰鬥送進玩家戰場）。
4. **無運行期驗證**：本次只做型別 + 源碼契約 + 純邏輯行為測試，沒有 Cocos 編輯器/模擬器可看「遭遇戰是否真的跳進 Battle 場景並在結算後回大地圖」。`GameState.startBattle()` 與 `BattleRoot` 的 `from === 'campaign'` 回跳都在**既有攻城/守城路徑上已在用**，本次只是換成野戰雙方資料，風險集中在新 `loadout` 的欄位口徑（已按 `DeployRoot`/`BattleRoot` 讀取欄位逐一對齊，並由測試鎖住）。
5. **戰損口徑**：戰鬥內兵力按 web `clamp100` 壓到 1..100（只是「戰場規模」），大地圖實際兵損沿用既有「勝方留半兵」口徑，不按戰鬥傷亡逐兵折算（與舊擲骰/web 批次口徑一致）。
6. **快照殘留**：若玩家在遭遇戰中途強退（戰鬥未結算），`sanguo_encounter_v1` 會留到下次進大地圖；`applyPendingEncounter()` 判為 draw → 雙方原兵力歸位、清快照，不崩不卡死。
