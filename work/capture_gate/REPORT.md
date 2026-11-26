# F-01 Cocos 侧：戰後俘虜處置「勝者門」交付報告

> 對應 `work/parity_sweep/REPORT.md` F-01（:236-241）與總表 :101-103 三子項：
> 勝者門 ✗、敗方 AI 處置 + 戰報 ✗（Cocos 0 命中）、冪等門 ✗（lastPost 無 `ai`/`battleTs`）。
> 本輪把三項都收進 Cocos 可測模型層，UI 只留一段可粘貼的調用。

**一句話結論**：Cocos 現在有和 web `campaign.html:4874-4988` 逐條對齊的勝者門
（`SurrenderModel.resolveCaptureFlow()`：我方勝才 `open`，我方敗走 core 的
`planAiDisposal/applyAiDisposal` 並落 `save`+`lastPost.ai/battleTs`），模型層 6/6 測試綠、
雙 tsc 0、全量測試 0 fail；**唯一沒做的是 `CampaignRoot.ts` 接入**（按要求只給可粘貼片段，見 §4），
接入前敗方戰報/落盤還不會執行，但「輸了卻彈我方俘虜處置面板」這個 P0 已被模型層的 `won` 門擋死。

---

## 0. 改動邊界與文件清單

只動了 3 個文件（禁 `git`、未碰 `CampaignRoot.ts` / `GameState.ts` / 其他面板 / `game/src/core/**`）：

| 文件 | 原狀 → 現狀 | 內容 |
|---|---|---|
| `game/cocos/assets/scripts/core/roster.ts` | 889 → **1168 行** | 按 lead R220 授權：新增 `ENEMY_HELD`（:56）、`applyCapturesToRoster` 摘 `敵軍`（:216）、`SurrenderOpts.won`（:559 附近）、`surrenderCandidates` 首行 `opts.won === false` 衛兵（:744/:748）、`needSurrenderPanel(cards, {won})`（:786/:787）；文件末（`rememberReleased` 之後，:914 起）原樣搬入 `game/src/core/roster.ts:766-1013` 勝者門整段（:947 `BattleOutcome`、:1007 `readBattleOutcome`、:1037 `decideBattleWon`、:1061 `ourForceNames`、:1090 `markEnemyHeld`、:1117 `planAiDisposal`、:1146 `applyAiDisposal`），每處適配帶 `// [R220 mirror]` 註釋；零已有函式被改簽名。 |
| `game/cocos/assets/scripts/SurrenderModel.ts` | 675 → **962 行** | `SurrenderCtxOpts.won` / `SurrenderCtx.won`；`contextOf()` 自動判勝負（`decideBattleWon`）；`stateOf()` 把 `won` 傳進 `surrenderCandidates`/`needSurrenderPanel`；`myNamesOf()` 把 `_moved==='敵軍'` 排除；文件末新增 `CaptureFlowOpts` / `CaptureDisposal` / `CaptureFlow` / `resolveCaptureFlow()`（:722-962）。 |
| `game/tests/capture_gate_cocos.test.ts` | 新增 **262 行 / 6 test** | F-01①-⑤ + 防漂移守門（見 §5）。 |

---

## 1. `resolveCaptureFlow` 簽名

```ts
// game/cocos/assets/scripts/SurrenderModel.ts:820
export function resolveCaptureFlow(
  save: CampaignSave,
  data: GameData,
  opts: CaptureFlowOpts = {},
): CaptureFlow;

export interface CaptureFlowOpts extends SurrenderCtxOpts {
  /** 招降入城 / 戰報城名；不給就按 lastBattle.city → save.last → owned[0] 推（web :4882-4886） */
  home?: string;
}
export type CaptureDisposal = AiDisposalEntry;

export interface CaptureFlow {
  open: boolean;                 // 只有「我方勝 + 有卡」為 true
  cards: SurrenderCard[];        // 勝方待處置的敵將卡（open=false 時為 []）
  aiDisposal: CaptureDisposal[]; // 敗方：敵方 AI 的處置計劃（reason==='lost' 時非空）
  reason: 'won' | 'lost' | 'none';
  home: string;                  // 招降入城/戰報城名
  won: boolean;                  // 本場勝負（opts.won 顯式覆蓋優先）
  outcome: BattleOutcome | null; // save.lastBattle（舊檔可能 null）
  aiResult: AiDisposalResult | null; // 敗方 applyAiDisposal 結果
  state: SurrenderState | null;  // 勝方：可直接交給 SurrenderPanel.show(node, opts, state) 免重算
  logs: SurrenderLogLine[];      // 要 push 進戰報的行（文案與 web 逐字對齊）
  notice: string;                // 提示條：我軍戰敗：敵軍處置我軍俘將（勸降 1 · 斬首 1）
  lastPost: Record<string, unknown> | null; // 本次寫入/復用的 save.lastPost
}
```

判定順序（全部在模型層，UI 不重複判）：

1. `outcome = readBattleOutcome(save)`；
2. `won = opts.won ?? decideBattleWon(save, outcome)`（舊檔無 `lastBattle` 時走 core 兜底：丟城/俘虜含我方人 → 敗，否則勝）；
3. `home = opts.home || outcome.city(且 cities 有) || save.last(且 cities 有) || owned[0] || ''`；
4. **冪等門**：`outcome.ts > 0 && lastPost.ai === true && lastPost.battleTs === outcome.ts` ⇒ `reason:'none'`、不重複處置；
5. `own = ctx.mine ∪ ourForceNames(save) ∪ king`（防我方將出現在「可招降」卡上）；
6. 敗 → 敵方 AI 處置；勝 → 髒隊列清理 + 開面板判斷。

---

## 2. 判定表（勝/敗/平 × 有/無隊列）

「隊列」= `save.captured`（我軍被俘/敵將被俘待決）+ `save.executed`（被斬待決）。

| 戰果 | 待決隊列 | reason | open | cards | aiDisposal | 副作用（都只改記憶體 `save`） |
|---|---|---|---|---|---|---|
| 勝（`won=true`） | 有敵將 | `won` | **true** | 非空 | `[]` | 開面板；`save.lastPost` 等面板 `finishOf()` 再寫（web 同款） |
| 勝 | 空 | `none` | false | `[]` | `[]` | `save.lastPost = null` |
| 勝 | 只有我方髒名 | `none` | false | `[]` | `[]` | 摘掉我方名 + 生成「本城名單不變」戰報行（`logs` 非空） |
| 敗（`won=false`） | 有我方將（captured/executed/outcome） | `lost` | **false** | `[]` | **非空** | `applyAiDisposal` 落庫（勸降→`_moved='敵軍'`；斬首/陣亡→出池；釋放→名單不動）；摘 `captured/executed` 已處置名；寫 `lastPost{ai:true,battleTs:outcome.ts,...}`；`logs` 逐將；`notice` 匯總；寫 `generalRecord` 敗場（`battle!==false` 時） |
| 敗 | 空（無人可處置） | `none` | false | `[]` | `[]` | `save.lastPost = null`（清舊提示） |
| 平手/無戰果（無 `lastBattle`） | 空 | `none` | false | `[]` | `[]` | 兜底判為「勝」，但無隊列 ⇒ 什麼都不做 |
| 無 `lastBattle`（舊檔） | 有敵將 | `won` | true | 非空 | `[]` | 保持舊行為：能開就開 |
| 同一場已處置過 | — | `none` | false | `[]` | `[]` | 冪等門命中，`logs=[]`、`lastPost` 原樣返回，不重複寫檔 |
| `opts.won` 顯式覆蓋 | 任意 | 按覆蓋值走 | — | — | — | 供測試/自檢強制單邊（勝/敗） |

補充：
- 表中「有隊列」還要再過規則層：若 `surrenderCandidates()` 把候選濾空（名單對不上劇本資料等），`needSurrenderPanel(cards,{won})` 關門 ⇒ 落到 `reason:'none'`（`cards=[]`），不會開空面板。
- 遊戲沒有「平手」結算，所以「平手/無戰果」= 沒有 `save.lastBattle` 且隊列空 ⇒ 一定 `none`。
- `opts.battle === false`（hud/自檢）時敗方不寫 `generalRecord`，其餘落庫照舊（與舊行為一致）。
- 敗方戰報/提示文案與 web 逐字一致：`戰 報：（我方）X 被敵軍勸降，已轉投敵營`、
  `我軍戰敗：敵軍處置我軍俘將（勸降 1 · 斬首 1）`；`lastPost` 欄位也照抄 web :4963-4978。

---

## 3. 與 web `game/web/campaign.html` 的對齊說明

模型層是 web 兩段函式的 1:1 搬移（web 是權威真源，R208/R211 那輪已驗過）：

| web（`campaign.html`） | Cocos `SurrenderModel.resolveCaptureFlow()` |
|---|---|
| `settleBattleReturn()` :4874 起；`king/outcome/own/last/bCity/home` 推斷 :4875-4886 | 步驟 1-5（`kingOf`/`readBattleOutcome`/`ourForceNames`/`homeOf`） |
| 冪等門 :4888-4889（`outcome.ts>0 && lastPost.ai===true && num(prev.battleTs)===outcome.ts` ⇒ `return null`） | 第 4 步冪等門（`reason:'none'`、返回 `lastPost: prev`） |
| `if (!won) return aiDisposeCaptives({outcome, home, king})` :4891-4892 | 敗分支（`reason:'lost'`） |
| 勝方 `pending/doomed/oursHeld` 清我方髒隊列 + `pushLog('戰 報：（我方）…被敵軍俘去，本城名單不變','lost')` :4897-4902 | 勝分支同款（`logs` 返回給 UI push） |
| 隊列空 ⇒ `save.lastPost=null; return null` :4905-4907 | 勝分支 `box.lastPost=null` + `reason:'none'` |
| `surrenderCandidates(save, GDATA, {atCity: garrisonNames(home).concat(probeKingNames()), mine, king, won}).filter(!own)` :4911-4916 | 勝分支 `surrenderCandidates(..., {atCity, mine, king, won})` + `filter(name 非空 && !own.has)` |
| `if (!needSurrenderPanel(cards,{won})) { lastPost=null; return null }` :4917 | 勝分支 `needSurrenderPanel(cards,{won})` ⇒ none |
| `surBattleReal=!surProbeOn(); openSurrenderSheet(cards,home)` :4920-4921 | `open:true` + `state`（面板尚未打開，由 UI 調） |
| `aiDisposeCaptives()` :4935-4988：`joined/executed/fallen → planAiDisposal → applyAiDisposal → 摘隊列 → verdict 逐將 pushLog('lost') + noteGeneralResult(false) → lastPost{ai:true,battleTs} → autosave()` | 敗分支：同一順序，`verdict` = `DISPOSAL_TEXT`（逐字一致）；返回 `logs/notice/aiResult/lastPost`，落盤由 UI 片段做（模型層不碰 Cocos `GameState`） |
| `notice(bits.join(' · '))` :4986 | `notice` 字串返回 |

差異（都是有意的）：
1. web 直接 `autosave()/render()/notice()`；Cocos 模型層**不碰 UI/存檔**，只返回 `logs/notice/lastPost`，由 `CampaignRoot` 片段 push 戰報 + `GameState.persistSave()`（`SurrenderPanel.finish()` 已有落盤；敗方沒面板，所以片段補這一下）。
2. Cocos 的 `own` 多加了 `ctx.mine`（面板層自推的我方名單）：比 web 更保守，寧可多算我方，避免自家將出卡（關鍵回歸⑤）。
3. Cocos 勝方 `lastPost` 不在模型層寫，仍由面板 `finishOf()` 寫（與舊 Cocos 流程一致，也和 web `openSurrenderSheet` 一致）。

---

## 4. 待補 UI 片段（`CampaignRoot.ts`，請負責該檔的智能體粘貼）

> 錨點：`start()` 裡 `const homeCity = this.selected ?? this.save.owned[0] ?? '';` 開始、
> 到 `hasPendingCaptures(this.save) { ... }` 整塊結束（**本次讀檔時在 `CampaignRoot.ts:1451-1471`**；
> 該檔正被其他智能體改，行號可能漂移，請搜 `hasPendingCaptures` 定位）。
> 替換整塊即可；其後的 `freshRun`/`EndingPanel` 段落不動。

### 4.1 import 兩處

```ts
// ① :46 去掉 hasPendingCaptures（改完只剩 healStaleQueue 在用）
import { healStaleQueue } from './core/run_scoped';

// ② :52 SurrenderPanel 旁邊加一行
import * as SurrenderModel from './SurrenderModel';
```

### 4.2 替換塊（可直接粘貼）

```ts
      // F-01（R208/R220）：勝負門收進模型層 `SurrenderModel.resolveCaptureFlow()`——
      // 我方勝才開處置面板；我方敗由敵方 AI 處置我方俘將（save 已由模型層落庫）。
      const homeCity = this.selected ?? this.save.owned[0] ?? '';
      const garrisonNow = garrisonOf(data as unknown as GarrisonData, sci, homeCity);
      const atCity = Array.isArray(garrisonNow?.officers)
        ? garrisonNow!.officers.map((o) => String(o?.name ?? '')).filter(Boolean)
        : undefined;
      const flow = SurrenderModel.resolveCaptureFlow(SurrenderModel.saveOf(this.save), data, {
        home: homeCity,
        atCity,
        king: monarchName,
        mine: this.myOfficerNames(),
        scenIdx: sci,
      });
      // 模型層已經改過 save（敗方 AI 處置 / 勝方摘髒名）：有戰報就先寫 + 落盤。
      if (flow.logs.length > 0) {
        // 敗方逐將「戰 報：（我方）X 被敵軍…」；勝方摘我方髒名時「本城名單不變」。
        this.pushBattleLog(
          flow.logs.map((l) => battleLogLine(Number(this.save.month ?? 0), l.text, l.kind)),
        );
        GameState.persistSave();
      }
      if (flow.open) {
        SurrenderPanel.showIfNeeded(this.node, {
          save: this.save,
          data,
          home: flow.home,
          atCity,
          king: monarchName,
          mine: this.myOfficerNames(),
          onDone: () => {
            this.seedRuntimeOfficers();
            this.refresh();
          },
        });
      } else if (flow.reason === 'lost') {
        // 敗方：敵方 AI 已處置我軍俘將（模型層已落庫），這裡補提示條 + 重建運行時名單。
        this.hintText = this.clampHint(flow.notice, 160);
        this.seedRuntimeOfficers();
        this.refresh();
      }
```

### 4.3 說明

- `flow.open` 才開面板；敗方/無事時**絕不開**（模型層雙層硬門：`surrenderCandidates` + `needSurrenderPanel` 都吃 `won`）。
- 敗方 `save` 落庫已在 `resolveCaptureFlow()` 內完成（`applyAiDisposal`: 勸降→`_moved='敵軍'`、斬首/陣亡→出池、釋放→名單不動；`captured/executed` 摘掉已處置名；`lastPost{ai:true,battleTs}`；`generalRecord` 敗場）。片段補「戰報 push + `GameState.persistSave()` + 提示條 + 重建運行時名單」。
- 敗方重複回大地圖：冪等門返回 `reason:'none'`、`logs=[]`，不會重複寫戰報/寫檔。
- 勝方「我方被誤寫進隊列」的清理戰報（web :4899）同樣走 `flow.logs` 的先寫後開面板，不會漏。
- 勝方面板的落盤/名單重建仍由原 `onDone`（`finishOf()` → `GameState.persistSave()` → `seedRuntimeOfficers()`）負責，語義不變。
- 備選（少算一次 `openOf`）：`if (flow.open && flow.state) SurrenderPanel.show(this.node, {..同上..}, flow.state);` —— `showIfNeeded` 會用同一份存檔重算，結果等價，二者皆可。
- 片段用到的符號都在 `CampaignRoot` 現有作用域：`data/sci/monarchName/this.save/this.node/this.myOfficerNames()/this.seedRuntimeOfficers()/this.refresh()/this.pushBattleLog()/battleLogLine()/this.hintText/this.clampHint()/GameState.persistSave()`。
- ⚠️ 改完把 `:46` 的 import 改成只留 `healStaleQueue`（`hasPendingCaptures` 全檔只有 import + 原 `:1452` 兩處用到；tsconfig 沒開 `noUnusedLocals`、tsc 不會紅，但留著就是死 import；`core/run_scoped.ts` 仍導出它，不影響別人）。

---

## 5. 測試與驗證

新測試 `game/tests/capture_gate_cocos.test.ts`（262 行，`// @ts-nocheck` + `node:module` 的 `registerHooks` 解決 Cocos 源「import 不帶副檔名」；動態 `import()` 避免把 cocos 拉進主 tsconfig program）：

| # | 斷言 |
|---|---|
| F-01① | 我方勝 + 隊列非空 ⇒ `open:true`、`reason:'won'`、`cards` 非空、`state` 非 null |
| F-01② | 我方敗 ⇒ `open:false`、`reason:'lost'`、`cards:[]`、`aiDisposal` 非空（勸降/斬首沿用戰鬥頁結果）、`logs/notice` 非空；重複調用 ⇒ `none` 且不重複 |
| F-01③ | 平手/無戰果 ⇒ `reason:'none'`；有勝績但隊列空 ⇒ `none` |
| F-01④ | 敗方處置後：`save.captured/executed` 清空、`_moved['關羽']==='敵軍'`、`_moved['張飛']==='陣亡'`、roster 城名單摘除、`lastPost.ai===true`/`battleTs` 對上、`myNamesOf()` 不再含敗方俘將 |
| F-01⑤ | **關鍵回歸**：敗方時我方將不以「可招降」卡出現；勝方髒隊列（含我方名）只處置敵將、我方名被摘掉並記「本城名單不變」戰報 |
| 防漂移 | 鏡像與 core 的勝者門導出集合相等（`readBattleOutcome/decideBattleWon/ourForceNames/markEnemyHeld/planAiDisposal/applyAiDisposal` 兩邊皆 function）；`surrenderCandidates.length >= 2`（帶可選參數）；`ENEMY_HELD/DEAD/RELEASED` 兩邊相等；`needSurrenderPanel([], {won:false})===false` |

實測（2026-11-26 12:0x，本機 Node v24.21.0）：

| 命令 | 結果 |
|---|---|
| `cd F:\sanguo\game; node node_modules\typescript\bin\tsc --noEmit` | **EXIT=0** |
| `cd F:\sanguo\game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **EXIT=0** |
| `cd F:\sanguo\game; node --test "tests/capture_gate_cocos.test.ts"` | **tests 6 / pass 6 / fail 0** |
| `cd F:\sanguo\game; node --test "tests/*.test.ts"` | **tests 1828 / pass 1827 / fail 0 / todo 1**（後台 job `pwsh-888538d5292d465f` exit 0；基線 1806/1805/1，本單 +6，其餘 +16 為並發智能體新增，`fail 0`） |
| `cd F:\sanguo; node work\enc\scan_utf8.mjs game\cocos\assets\scripts\core\roster.ts game\cocos\assets\scripts\SurrenderModel.ts game\tests\capture_gate_cocos.test.ts` | `scan: 3 files, 0 BAD, 0 WARN, 3 clean -> OK` |

按要求**未跑** Cocos 構建 / 瀏覽器 / 模擬器。

---

## 6. 同步器盲區（`work/cocos_sync/sync_core3.mjs:736-743`）

```js
// :736-739 這三行讓 roster.ts / field.ts 兩側都不進入比對集
const SKIP_FILES = new Set(['roster.ts','field.ts']);
const files = walkTs(SRC_ROOT).filter((f) => !SKIP_FILES.has(f));
...
for (const f of SKIP_FILES) if (existsSync(join(SRC_ROOT, f))) webSet.add(f);
```

**後果（本單根因）**：`roster.ts` 是 Cocos 權威 fork（R197 起多招降十欄存檔讀取層），從 web 源單向同步不適用，所以被 skip；但這也讓
- `node work/cocos_sync/sync_core3.mjs --diff-only` 實測輸出「文件 23：相同 23 / 有差異 0 / cocos 缺 0」是**假綠**；
- `work/check_parity.mjs` 只解析這條匯總，**看不見 roster 分叉**——R208/R211 的勝者門只進了 `game/src/core` 和 web，Cocos 鏡像一直是舊的，`planAiDisposal` 在 Cocos 全庫 0 命中，F-01「輸了卻彈處置面板」的 P0 因此在 Cocos 端存活；
- 同理 `field.ts` 的分叉也無聲。

**建議（供 lead 派單改同步器）**：
1. 把 `SKIP_FILES` 從「不同步」降級為「不同步但必須比對」：`--diff-only`/`check_parity` 對這兩個文件名單獨列出 diff 行數（發現差異就報紅/告警，但不自動寫檔），讓假綠變真紅。
2. `field.ts` 若已無 fork 必要就收回 `SKIP_FILES`（回到自動同步）；`roster.ts` 保留人工 fork，但把「雙端同簽名」守門測試（本單第 6 個 test）擴成**全導出名集合**比對，而不只是 6 個勝者門函式。
3. 長期：把 fork 的「必須同步的段」用 marker（如 `[R220 mirror]`）標出，同步器只 diff marker 段；或給 roster 加第二份「web 側適配層」把差異集中到一個文件，讓主體回歸可同步。

---

## 7. 遺留 / 風險

1. **最重要**：`CampaignRoot.ts` 尚未接入（按任務要求不改該檔）——接入前：
   - ✅ 我方敗時不會再開處置面板（模型層 `won` 門已擋住，`openOf` 返回 null）；
   - ❌ 敗方「敵方 AI 處置我方俘將 + 逐將戰報 + 落盤」只有在片段落地後才會執行（現在敗方 `save.captured/executed` 會維持原樣）。
2. `SurrenderPanel.showIfNeeded` 內部會再算一次 `openOf`（片段備選用 `show(..., flow.state)` 可免）；二者結果等價。
3. `roster.ts` 仍是雙 fork；本單的防漂移測試只覆蓋勝者門 6 個導出 + 3 個常量，其餘導出未守（見 §6 建議 2）。
4. `CaptureFlow.logs` 兩種來源：敗方逐將處置、勝方髒隊列清理（`open` 可能為 true）；片段已用「先寫 `logs` 再分 `open`/`reason`」一次覆蓋，UI 不用再判 `reason`。
5. 片段未經 Cocos 編譯/真機（本單不跑構建）；但所用符號均已存在於 `CampaignRoot`（見 §4.3），技術上只差 import 兩行。
6. R214 的 `healStaleQueue(this.save)` 自愈塊保留在片段**之前**（本單未動），不影響新門。

---

## 8. 快速索引

- 模型層入口：`game/cocos/assets/scripts/SurrenderModel.ts:820`（`resolveCaptureFlow`），型別 :722-771。
- 鏡像勝者門：`game/cocos/assets/scripts/core/roster.ts:914-1168`（搬入段），關鍵函式 :947/:1007/:1037/:1061/:1090/:1117/:1146。
- 鏡像 `won` 衛兵：`game/cocos/assets/scripts/core/roster.ts:748`（candidates）、:787（panel）。
- 新測試：`game/tests/capture_gate_cocos.test.ts`（6 test，262 行）。
- web 對齊真源：`game/web/campaign.html:4874-4988`（`settleBattleReturn` + `aiDisposeCaptives`）。
- 對應 upstream 報告：`work/parity_sweep/REPORT.md:236-241`（F-01 節）、:101-103（三子項）。
- 同步器盲區：`work/cocos_sync/sync_core3.mjs:736-743`（`SKIP_FILES`）。
