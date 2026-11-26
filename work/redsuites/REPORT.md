# 三套红灯专项断言修复报告（redsuites）

日期：2026-11-26
范围：`F:\sanguo\work` 下三套一直红的专项断言（禁 git、禁构建、禁改 `game/cocos/assets/scripts/core/**`、禁改 `project/`）。

## 结论

**三套全绿**，且全部 19 条失败都判定为「**断言过期**（测的是被近期轮次取代的旧行为）」，**没有发现实现错误**。因此本次**没有修改任何 `game/**` 源码**，只改了 `work/` 下的三个断言脚本。

| 套件 | 修前 | 修后 | 判定 |
| --- | --- | --- | --- |
| `work/cocos_surrender/model_assert.mjs` | §7 直接崩（TypeError） | **170/170 PASS** | 7.5 崩 + §9 四条 = 断言过期（R221 F-01 / P1 收尾） |
| `work/cocos_surrender/panel_headless.mjs` | **3/103 FAILED** | **105/105 PASS** | 3 条 = 断言过期（R180 标题 / R196-R197 十栏） |
| `work/cocos_surrender/slot_assert.mjs` | **15/148 FAILED** | **148/148 PASS** | 15 条 = 断言过期（R187–R190 文案 / R221 F-10 active） |

附带核验（本来就绿，未改动）：
- `work/cocos_book/panel_headless.mjs` → **161/161 PASS**
- `work/cocos_book/model_assert.mjs` → **277/277 PASS**

门禁（在 `F:\sanguo\game` 实测）：
- `node node_modules/typescript/bin/tsc --noEmit` → **exit 0**
- `node --test "tests/*.test.ts"` → **tests 1895 / pass 1894 / fail 0 / cancelled 0 / skipped 0 / todo 1**，与基线 1894 pass / 1 todo 一致，无新增失败。

### 关于任务书的路径笔误（重要）

任务书说「`work\cocos_book\panel_headless.mjs`：`3/103` 失败」。实测：
- `work/cocos_book/panel_headless.mjs` 输出「面板斷言 161 條，通過 161，失敗 0 / 全部通過 ✅」——**不是红的**，条数也不是 103。
- 真正 `FAILED 3/103` 的是 **`work/cocos_surrender/panel_headless.mjs`**，失败项为 2.10 / 2.15 / 3.3，与任务书描述的失败量完全对应。

所以第 2 套按 `work/cocos_surrender/panel_headless.mjs` 修，cocos_book 两套作为回归核验跑绿。

---

## 一、`model_assert.mjs`（原：§7 崩溃）

### 1.1 `7.5 自己在職的將被俘也不算俘虜` — TypeError 崩溃

**现象**

```
$ cd F:\sanguo\work\cocos_surrender && node model_assert.mjs
...（1–7 节标题正常打印）
file:///F:/sanguo/work/cocos_surrender/model_assert.mjs:407
TypeError: Cannot read properties of null (reading 'cards')
```

旧断言（原 :402-408）：

```js
const rosterMine = freshSave();
rosterMine.captured = ['夏侯惇', '張遼'];
same('7.5 自己在職的將被俘也不算俘虜', false, open(rosterMine).cards.some((c) => c.name === '夏侯惇'));
```

**判定：断言过期**（被 R221「F-01 俘虏胜者门」取代；见 `project/216_双端差距收口.md:17`）。

**依据**

- `game/cocos/assets/scripts/core/roster.ts:840`：`surrenderCandidates()` 里 `if (opts.won === false) return []; // 胜者门：败者没有处置权`。
- `core/roster.ts:884`：`needSurrenderPanel()` 同样 `if (opts.won === false) return false;`。
- `core/roster.ts:1129-1142`：`decideBattleWon()` 在无 lastBattle 时兜底——`save.captured` / `save.executed` 里出现 `ourForceNames()`（`:1153`）的人 → 判败。
- `SurrenderModel.ts:328-330`：`const won = opts.won !== undefined ? opts.won === true : decideBattleWon(save);`
- `SurrenderModel.ts:356`：`if (!needSurrenderPanel(cards, { won: ctx.won })) return null;`
- 实测（临时探针 `work/redsuites/probe_model_won.mjs`，用 `_sim` 编译产物）：
  - `decideBattleWon(freshSave()) = true`，`ourForceNames = ['曹操','夏侯惇']`
  - `rosterMine.captured = ['夏侯惇','張遼']` 时 `decideBattleWon = false`
  - `open(rosterMine)`（默认 won）→ `null`（这正是崩因：旧断言对 null 取 `.cards`）
  - `open(rosterMine, { won: true })` → cards `['張遼','華佗','死士']`（夏侯惇确实不出卡）
  - `open(rosterMine, { won: false })` → `null`

**改法**（`work/cocos_surrender/model_assert.mjs:404-415`）

- 7.5 显式传 `{ won: true }`，继续断言「自己人不出卡」这个真正的过滤语义。
- 新增 `7.5b`：默认 `open(rosterMine)` 必须为 `null`（胜者门：我方将在处置名单且无 lastBattle → 判败，不弹面板）。
- 新增 `7.5c`：显式 `{ won: false }` 也必须为 `null`。
- 注释写明由 R221 F-01（`core/roster.ts:1129-1142`、`SurrenderModel.ts:328-330/:356`）取代旧行为。

### 1.2 `9.1 / 9.2 / 9.5 / 9.10` — 写回名单只收 `recruited === true`

**现象**（修完 7.5 后暴露）

- 9.1 期望 `['張遼','華佗']`，实际 `['張遼','程昱','華佗']`
- 9.2 / 9.5 期望 `['張遼']`，实际 `['張遼','程昱']`
- 9.10 期望卡数 2，实际 3

**判定：断言过期**（queuePostBattle 语义被 P1 收尾波次改掉）。

**依据**

- `SurrenderModel.ts:676-681` 注释明文：「所有俘虜（不論戰場預判成敗）都進 captured，逐將檔位留到面板再算」，与 `game/web/main.js:845-853` 一致。
- 旧语义（只把 recruited===true 的写回）见 `project/120_Cocos招降面板.md:222`；P1 病灶记录见 `project/132_验收实测.md:144`。
- 修复记录：`project/37a_*.md:494` 标「已修（本轮）」，mtime 2026-11-25 16:23，属 R178/R179 收尾波次（早于本轮断言，故断言未同步）。

**改法**（`model_assert.mjs:476-487`）

- 9.1 → `['張遼','程昱','華佗']`（所有俘虏都进 captured）
- 9.2 / 9.5 → `['張遼','程昱']`
- 9.10 → 卡数 3

**最终：170/170 PASS**（原计数因 §7 崩溃跑不到结尾无法统计；本次 7.5 一条拆为 7.5 + 新增 7.5b/7.5c，并把 §9 四条旧期望改为现行语义）。

---

## 二、`panel_headless.mjs`（真实路径：`work/cocos_surrender/`，原 3/103）

### 2.1 `2.10 標題` — 旧 web 文案

- **现象**：期望 `'抓 到 敵 將'`，实际 `'武 將 招 降'`。
- **判定：断言过期**（R180 战斗 HUD 对齐那轮）。
- **依据**：`game/cocos/assets/scripts/SurrenderPanel.ts:69-75`：`const PANEL_TITLE_TEXT = '武 將 招 降';`，注释写明「逐字照原作」；`SurrenderModel.PANEL_TITLE` 仍是 web 共用「抓 到 敵 將」，本轮只改 Cocos UI，落在 `project/180_战斗HUD对齐.md` 指定点。
- **改法**（`panel_headless.mjs:198-201`）：期望改 `'武 將 招 降'`，注释引上面两处。

### 2.2 `2.15 面板子節點數` — 旧「5×9 卡」布局

- **现象**：期望 57，实际 152。
- **判定：断言过期**（R196/R197「招降十欄」）。
- **依据**：`SurrenderPanel.ts:91-102` `SUR_FIELD_KEYS = [等級, 士氣, 疲勞, 武力, 智力, 忠誠, 武器, 物品, 勝場數, 敗場數]`；`:422-450` 为每卡建 10 個 `SurFieldK*` + 10 個 `SurFieldV*`。旧「5×9 卡」的节点公式已不成立。
  152 = 1 蒙版 + 1 Graphics + 5 表頭（SurTitle/SurSub/SurPrev/SurPage/SurNext）+ 5×28 卡（頭像+名+檔位+10鍵+10值+理由+取捨+3按鈕）+ 1 SurMsg + 3 批量 + 1 SurFinish。
- **改法**（`panel_headless.mjs:208-213`）：期望改 152，标题里写清节点公式，注释注明被 R196/R197 取代。

### 2.3 `3.3 SurStat0` — 单行数值已被十栏逐格取代

- **现象**：期望 `labelText(panel,'SurStat0') === '武 92 · 智 78 · 忠誠 40 · 義理 4'`，实际 `<missing>`（`SurStat0` 标签已不存在）。
- **判定：断言过期**（R196/R197 十栏渲染）。
- **依据**：`SurrenderPanel.ts:140-155` 改由 `surFieldCells()` 逐格出键/值；`:698-708` 逐格填 `SurFieldK*/SurFieldV*`，`null → 灰「—」`不冒充 0。`SurrenderPanel.ts:136-138` 的 `lossNow` 让「敗場數」在战后处置场景先现算 1 败。
- **改法**（`panel_headless.mjs:238-250`）：拆成三条
  - 3.3 十欄键顺序 `['等級','士氣','疲勞','武力','智力','忠誠','武器','物品','勝場數','敗場數']`
  - 3.3a 武力/智力/忠誠真值 `['92','78','40']`
  - 3.3b 存档没有的栏位画「—」、敗場數现算 `'1'`：`['—','—','—','—','—','—','1']`

**最终：105/105 PASS**（原 103 + 新增 3.3a/3.3b 等共 105；`FAILED 3/103` → `ALL PASS 105`）。

---

## 三、`slot_assert.mjs`（原 15/148）

全部 15 条都是**断言过期**，分两组：旧存档槽文案（R187–R190 批次）与旧 active 语义（R221 F-10）。**未改任何实现**。

### 3.1 文案组（10 条：7.1/7.2/7.4/7.5/7.6/7.7/7.8/7.9/8.7/8.9/8.10/8.20/8.39 中的文案项）

**判定：断言过期**，被 R187–R190 批次（Cocos 大地图部队层，`project/186 §5` 文案同步；`work` 还原清单 `project/31_还原清单.md:408` §一之補 20 / `:416` #221）取代。

**依据（实现即规格）**——`game/cocos/assets/scripts/SaveSlots.ts`：

| 行 | 现行行为 |
| --- | --- |
| `:671` | `export const SLOT_LABEL = '記錄';`（照 web `saves.js:1481`，原作帧 `work/video_ui/A_save_t0035.png`） |
| `:702-706` | `slotTitle(index) => 記錄 + pad2(index+1)`，即 `記錄01…記錄10` |
| `:715-738` | `slotLines()`：空槽 l2 = `空 · 可存入目前進度`（:722，无「槽」字）；有档 l1 = `${title}${name}${tag}`（:734）；l2 = `[君主, 城數NN, 武將NNN, 時間NNN年].join(' ｜ ')`（:726-731/:735）；l3 = `存於 ${dateText(record.at)}`（:736） |
| `:686` / `:695-699` | `AD_ANCHOR = 184`；`adYearOfMonth(118) = 193`，故第二行为 `… ｜ 時間193年`（不再有旧「第10年10月 / 7勝2敗 / 20」） |
| `:741-743` | `subText = 存檔目標：${slotTitle(active-1)} · 已用 ${filled} / 10 槽 · 點槽位列可切換目標` |

规格文档：`project/181_纪元与存档内政字段.md:15`（原作帧：行首 記錄01…10、4 段 君主｜城數NN｜武將NNN｜時間NNN年）、`:118-119`（明确从旧「槽 N…10」+9 段改为 4 段）、`:19-20`（中文用繁體 記錄/城數/武將/時間）；`project/186_Cocos部队层与兵团指令.md:214-228`（§5 文案同步；`:219` 样例 `['記錄01 · 使用中', '公孫瓚 ｜ 城數01 ｜ 武將003 ｜ 時間184年', '存於 …']`）；`project/182_大地图部队层.md:236`；web 同源 `game/web/saves.js:1481/:1484/:1490-1515`（空槽 `['空']`）。
实机佐证：`work/ui_sweep/REPORT.md:129-130`（2026-11-26 巡检 2.9 包）副标 `存檔目標：記錄01 · 已用 0/10 槽 · 點槽位列可切換目標`、10 行 `記錄01–10` + `空 · 可存入目前進度`；旧「槽 N」文案只出现在已被取代的 `project/120_Cocos招降面板.md:150/:160` 与 `project/132:21/:102`。

**改法**（`slot_assert.mjs:293-315` 一带，注释统一引 R187–R190）：

| 断言 | 旧期望 → 新期望 |
| --- | --- |
| 7.1 | `槽 2` → `記錄02` |
| 7.2 | `空槽 · 可存入目前進度` → `空 · 可存入目前進度` |
| 7.4 | `槽 2 · 官渡 · 使用中` → `記錄02 · 官渡 · 使用中` |
| 7.5 | `第10年10月 · 城2 · 7勝2敗` → 含 `曹操 ｜ 城數02 ｜ 武將003 ｜ 時間193年` |
| 7.6 | 含 `20` → 含 `時間193年` |
| 7.7 | `君主曹操 · 將3` → `存於 2023-11-15 06:13` |
| 7.8 | `槽 2 · 官渡` → `記錄02 · 官渡` |
| 7.9 | 副标含 `槽 2` → 含 `記錄01`（active 仍为 1，见 3.2） |
| 8.7 | `存檔目標：槽 1` → `存檔目標：記錄01` |
| 8.9 / 8.10 / 8.39 | `槽 1` / `槽 10` → `記錄01` / `記錄10` |
| 8.20 | `startsWith('槽 1')` → `startsWith('記錄01')` |

### 3.2 active 语义组（4.4、8.42）

- **现象**：`saveToSlot(..., 2, ...)` 后断言 `active === 2`，实际 `1`（8.42 同）。
- **判定：断言过期**（R221 F-10「存檔遷移」；`project/216_双端差距收口.md:17`）。
- **依据**：
  - `SaveSlots.ts:428-435` 注释：「F-10 手動存檔只寫該槽、不改 active（与 web `Saves.writeSlot` 一致）」。
  - `SaveSlots.ts:436-466` `saveToSlot()` 内已无 `index.active = n`；`:474-481` `saveAutoSlot()` 也不改 active。
  - active 只由 `:489-514` `loadFromSlot()`（`:506 index.active = n`）与 `:529-536` `setActiveSlot()` 改。
  - 修复记录：`work/save_unify/REPORT.md:14-19/:29-30`（删除 `index.active = n`、改前基线 active=2 → 改后 1；对齐 `game/web/campaign.html:2003-2004`）、`:141-142`；病灶：`work/parity_sweep/REPORT.md:115-116/:295/:299-304`。
  - 旧「存哪格 active 跟到哪格」只存在于旧设计 `project/120:150`，与 web 语义相反，不可作现规格。
  - 该 15/148 红灯此前已被 `work/roster_unify/REPORT.md:117` 记录为「SaveSlots 漂移」——即套件没跟着实现更新。
- **改法**（`slot_assert.mjs:190`、`:417-418`）：4.4 / 8.42 期望改 `1`，标签写「手動存檔不改 active（F-10，R221）」。

**最终：148/148 PASS**（15 条失败全部改为当前正确行为，无放宽：每条仍断言具体文案/值）。

---

## 四、改动文件清单

只动了 `work/` 下断言与证据脚本，**未改任何 `game/**`、`project/**`**：

1. `work/cocos_surrender/model_assert.mjs` — 7.5 改 `won:true` + 新增 7.5b/7.5c；§9 四条期望更新（:404-415、:476-487）。
2. `work/cocos_surrender/panel_headless.mjs` — 2.10 标题、2.15 节点数 152、3.3 拆三条（:198-250）。
3. `work/cocos_surrender/slot_assert.mjs` — 15 条断言按 SaveSlots 现行实现更新（§4.4、§7、§8）。
4. `work/redsuites/probe_model_won.mjs` — 新增证据脚本（复现 7.5 崩因与 `won` 门取值）。
5. `work/redsuites/REPORT.md` — 本文件。

没有 `git add` / `git commit`；中文全部用 `write` / `edit` 落盘（未用 PowerShell 写中文源码）。

## 五、复现命令

```powershell
# 构建 headless 用编译产物（已是最新，如需重建）
cd F:\sanguo\work\cocos_surrender
node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json

# 三套
node model_assert.mjs      # ALL PASS — 斷言總數 170，失敗 0
node slot_assert.mjs       # ALL PASS — 斷言總數 148，失敗 0
node panel_headless.mjs    # ALL PASS — 斷言總數 105，失敗 0

# 回归核验（cocos_book）
cd F:\sanguo\work\cocos_book
node panel_headless.mjs    # 161/161
node model_assert.mjs      # 277/277

# 门禁
cd F:\sanguo\game
node node_modules/typescript/bin/tsc --noEmit
node --test "tests/*.test.ts"
```

## 六、备注

- 任务书第 2 套的路径笔误已在开头说明；`work/cocos_sur/` 目录不存在，`slot_assert.mjs` 实际在 `work/cocos_surrender/`。
- 跑套件期间其他 agent 仍在改 `game/cocos/assets/scripts/{CityListPanel,EndingPanel,DeployRoot,ItemsPanel,TitlePanel,GeneralBook}.ts`（mtime 17:05–17:06）。`_sim` 编译产物 mtime 为 13:42（cocos_surrender）/ 12:37（cocos_book），本套件只测招降/存档面板，未受这些文件影响（实测全绿）；本次门禁在修改后重跑，并且本次未改 `game/**`，结果不受本次改动影响。
- 结论纪律：每条失败都给了断言原文、实际值、代码行或规格行；没有「可能 / 应该」类判定。
