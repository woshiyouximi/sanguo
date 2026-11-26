# R81 — Exec34「後選出陣」的 3 槽：從 [推測] 變 [反彙編]

- 任務來源：`project/199_对照表刷新R193.md` 第 139 / 222 / 244 行（R81 ⚠️ 4h）
- 取證檔：`work/orig_numbers/text_dis.tsv`（5 列 TSV，166143 行；位址 / 位元組 / 助記符 / 運算元 / 跳轉註記）
- 分析腳本：`work/r81_exec34/table.mjs`（軍師技跳表重建）、`work/r81_exec34/strings.mjs`（PE + Big5 字串）
- 產物：`game/src/core/deploy_queue.ts`（改）、`game/tests/deploy_queue.test.ts`（改）、`game/tests/exec34.test.ts`（改）、`game/tests/exec34_truth.test.ts`（新，9 條 = 8 pass + 1 todo）

## 0. 結論（先講）

| 問題 | 答案 | 關鍵地址 |
|---|---|---|
| Exec34 操作哪個結構 | 每側 `army` 結構裡**唯一**的「出陣下標」`army->+0x04`（entries 基址 `+0x1C`、步長 `0x48`）。不是「3 個槽」，也沒有「前 3 上陣」字段 | `0x446F45`、`0x446EE8` |
| 「3」從哪來 | **原作裡沒有 3**。`0x448690` 全長 52 條指令、**0 條**含立即數 3；沒有 `cmp ...,3`。3 是本重製版戰場寬度（每側 3 個單位 = `DEPLOY_FIELD_SLOTS`），被 `project/162 §5.2` 誤當成原作槽數 | `0x448690`–`0x448760` |
| 「後選出陣」是什麼 | 「**敵方先定、我方後選**」的時點/順序，不是「選後面 3 位」。落地動作 = `army->+0x04 = 列表首行 + 光標`，界限是列表**條目總數**，可選任意一員 | `0x4496D1` / `0x449853` |
| 調用點 | 編成頁（WarPrep）的「出　陣」列表：消息處理函數 `0x44960B`，A 側 `0x449853`、B 側 `0x4496D1`（都在 case 4「選定」）；敵方由 `0x4042ED(army,1)` 先自動選（`0x447DF1` B / `0x447E34` A） | `0x41C06C` 開窗、`0x4042ED` |
| 回寫存檔 / soldiers / 站位 | **都不碰**。`0x44DE44` 全文 6 條指令、零狀態寫入；`0x448690` 只把 `entry+0x0C/0x454/0x458` 抄給單位，不寫回武将記錄；重製版只回寫 `save.deployQueue` 一個鍵 | `0x44DE44` |

## 1. 三個問題的反彙編證據

### Q1：Exec34 到底操作哪個數組/結構？「3」在哪？

`0x446F45`（全程序只有 **2** 個調用點，都在 `0x448690` 里）——「取當前出陣單位」的全部邏輯：

```
00446F48	8b4508	mov	eax, dword ptr [ebp + 8]        ; arg = army
00446F4B	8b4804	mov	ecx, dword ptr [eax + 4]        ; ★ 唯一的出陣下標
00446F4E	6bc948	imul	ecx, ecx, 0x48                  ; entry 步長 0x48
00446F51	8b5508	mov	edx, dword ptr [ebp + 8]
00446F54	8d440a1c	lea	eax, [edx + ecx + 0x1c]         ; &army->entries[idx]（基址 +0x1C）
00446F58	5d	pop	ebp
00446F59	c3	ret
```

`army` 結構初始化（`0x446EE8` 起，`memcpy 0x48` 填完 entries 之後）：

```
00446EC6	e845700200	call	0x46df10              ; memcpy(&entries[i], 武将記錄, 0x48)
00446EDA	8b82df000000	mov	eax, dword ptr [edx + 0xdf]  ; 鏈表 next
00446EEE	8911	mov	dword ptr [ecx], edx          ; army+0x00 = entry 數
00446EF3	c7400802000000	mov	dword ptr [eax + 8], 2
00446EFD	c7410400000000	mov	dword ptr [ecx + 4], 0        ; ★ 出陣下標 = 0（單一字段）
00446F07	c7420c00000000	mov	dword ptr [edx + 0xc], 0
```

`0x448690`（全程序唯一調用點 `0x448DE9`）——每側**只建一個**單位：

```
00448696	a18c664a00	mov	eax, dword ptr [0x4a668c]    ; A 軍
0044869C	e8a4e8ffff	call	0x446f45                ; ← 只取一個 entry
004486A4	a3248a4a00	mov	dword ptr [0x4a8a24], eax     ; g_unitA
004486B5	8b420c	mov	eax, dword ptr [edx + 0xc]    ; unit+0x30 = entry+0x0C
004486C7	8b8258040000	mov	eax, dword ptr [edx + 0x458]  ; unit+0x40 = army+0x458
004486DC	8b8254040000	mov	eax, dword ptr [edx + 0x454]  ; unit+0x44 = army+0x454
004486EC	e854e8ffff	call	0x446f45                ; B 軍同樣一次
004486F4	a3208a4a00	mov	dword ptr [0x4a8a20], eax     ; g_unitB
0044873F	e8801affff	call	0x43a1c4                ; 全 .text 唯一調用點：只初始化這 2 個單位
```

**「3」的確切來源：不存在。** 掃描結果（可重跑，見 §6）：

- `0x448690`–`0x448760`：52 條指令，含立即數 `3` 的 **0 條**，`cmp ...,3` 的 **0 條**；
- `0x446F45`–`0x446F5A`：0 條；
- `call 0x446F45` = 2 次（`0x44869C` / `0x4486EC`）、`call 0x448690` = 1 次（`0x448DE9`）、`call 0x43A1C4` = 1 次（`0x44873F`）；
- 出陣名額的「上限」只出現在兩個地方：`army+0x00` 的 entry 數（循環上界）與編成頁列表的條目總數（`[0x491034]` / `[0x491094]`，見 Q2）。

所以「3 槽」= 本重製版每側 3 個戰場單位（`project/168` 已證原作每側 1 個將領單位），被寫成了原作槽數 —— 屬 [推測]，本輪證偽。

### Q2：「後選出陣」是「後選的先出陣」還是「選後面 3 位」？誰調用？

原文寫入出陣下標的**只有**兩處，都在編成頁列表的消息處理函數 `0x44960B` 的 case 4（選定某一項）裡：

```
; B 側（case 4，先判全局 [0x4a79c8] & 1，寫 [0x4a6690]）
004496B1	8b158c104900	mov	edx, dword ptr [0x49108c]     ; 列表滾動首行
004496B7	035120	add	edx, dword ptr [ecx + 0x20]   ; + 光標（第幾行）
004496BA	8955fc	mov	dword ptr [ebp - 4], edx
004496C0	3b0594104900	cmp	eax, dword ptr [0x491094]     ; ★ 界限 = 列表條目總數（不是 3）
004496C6	7d1e	jge	0x4496e6
004496C8	8b0d90664a00	mov	ecx, dword ptr [0x4a6690]
004496D1	895104	mov	dword ptr [ecx + 4], edx      ; ★ army->+0x04 = 選中的那一員
004496D4	6800080000	push	0x800
004496D9	6860104900	push	0x491060                     ; 對這個列表控件發命令（0x41CAB5）
004496DE	e8d233fdff	call	0x41cab5
```

（`0x41CAB5` 是「遍歷控件樹 + 調 vtable `[+0x18]`/`[+0x10]`」的通用派發，不是寫內存；`0x800` 這個命令碼的具體作用本輪未定。`[0x4a79c8]` 全程序 119 處引用，是模式/控制位全局，語義本輪未定。）

```
; A 側（對稱，用 0x49102c / 0x491034 / 0x4a668c）
0044981A	8b0d2c104900	mov	ecx, dword ptr [0x49102c]
00449820	034820	add	ecx, dword ptr [eax + 0x20]
00449829	3b1534104900	cmp	edx, dword ptr [0x491034]     ; ★ 同樣是列表條目總數
0044984B	a18c664a00	mov	eax, dword ptr [0x4a668c]
00449853	894804	mov	dword ptr [eax + 4], ecx      ; ★ armyA->+0x04 = 選中的那一員
```

讀法：**選誰，誰就站上那個唯一的出陣位**（原第 0 槽順延），而不是「重排前 3 槽」、也不是「選最後 3 位」。
「後選」= 時點：敵方先定（AI 自動選，`0x4042ED(army,1) → 0x4040F3(army)`，調用點 `0x447DF1` B 側 / `0x447E34` A 側 `[0x4a79c8]&0x100` 時），我方列表後開（WarPrep 的「出　陣」項，`0x491578`；窗口 `0x41C06C(0x491000/0x491060,4)`）。

```
004042F2	6a00	push	0
004042F4	ff7508	push	dword ptr [ebp + 8]
004042F7	e833faffff	call	0x403d2f            ; 刷新/整理 army
00404301	837904ff	cmp	dword ptr [ecx + 4], -1
00404305	741b	je	0x404342                    ; 沒有出陣將 → 直接返回
00404307	837d0c01	cmp	dword ptr [ebp + 0xc], 1
0040430B	750c	jne	0x404319
00404311	e8ddfdffff	call	0x4040f3            ; flag==1 → AI 自動選出陣武將
```

Exec34 分支本身（`0x44D450` 的跳表 `0x44E6F4`，`table[33] = 0x44DE44`，即 `wise_id 34`）：

```
0044DE44	6800194900	push	0x491900            ; Big5 "成功"
0044DE49	8b45e4	mov	eax, dword ptr [ebp - 0x1c]  ; 消息欄上下文
0044DE4C	50	push	eax
0044DE4D	e88efc0100	call	0x46dae0            ; 打一句話
0044DE52	83c408	add	esp, 8
0044DE55	e96d080000	jmp	0x44e6c7            ; 函數尾
```

六條指令、**零狀態寫入**：不立旗標、不動 `army+0x04`、不寫武将記錄。對照相鄰的 wise 35（`0x44DE5A`）才有 `[ecx+0x84] |= 1` / `[+0x88]=0x28` / `[+0x8c]=0` 這類真正的戰鬥效果寫入 —— 反證 Exec34 的效果純在編成層。

### Q3：隊列改動後回寫存檔嗎？影響 soldiers / anchorX（站位）嗎？

**不。** 三層證據：

1. `0x44DE44` 零寫入（上）。整個 `0x44D450` 派發器只有「成功率判定 → 跳表」兩步，Exec34 那格沒有任何副作用。
2. `0x448690` 只「讀」`army+0x0C / +0x454 / +0x458` 抄給戰場單位（`unit+0x30 / +0x44 / +0x40`）；回程沒有任何 `mov [army+...], reg`，更沒有 `mov [武将記錄+...], reg`。`soldiers` / `anchorX` 在單位初始化 `0x43A1C4` 之後由戰場邏輯自己算，與出陣下標無關（`project/168` 已證每側只 1 個將領單位，位置由戰場生成，不從隊列取）。
3. 重製版：`saveQueue()` 只寫 `save.deployQueue` 一個鍵（`deploy_queue.ts:224` 起），`applyWise()` 只立 `army.A.chooseAfterFoe`，`exec34.test.ts` 用 `powerOf/soldiers/x,y` 快照比對，跑滿一場 unit 只減不增。

## 2. 被證偽的舊斷言（逐條）

| # | 位置（改前） | 舊斷言 | 為何被證偽 | 處置 |
|---|---|---|---|---|
| 1 | `game/tests/deploy_queue.test.ts:227` | `plan.fieldSlots === DEPLOY_FIELD_SLOTS`（3）、`reorderable === [0,1,2]`、`moveSlot(plan.mine,2,0,plan.fieldSlots)` 把第 3 槽移到第 1 槽 | 原作只有 1 個出陣位（`0x446F45` 的 `[eax+4]`），沒有「前 3 槽」 | 改寫：`fieldSlots===1`、`reorderable===[0]`、`pickable===[0..4]`、`pickDeploy(mine,2)` 把趙雲提到出陣位；`moveSlot(...,limit=1)` 變 no-op |
| 2 | `game/tests/deploy_queue.test.ts:245` | `chooseAfterFoe([],[],99).fieldSlots === 5`、`reorderable === [0,1,2,3,4]` | 上限是 1，不是 5 | 改寫：夾到 `[0,1]`，`99/3/-1` 三組 |
| 3 | `game/tests/exec34.test.ts:163` | `plan.fieldSlots === DEPLOY_FIELD_SLOTS`、`reorderable === [0,1,2]`、`moveSlot(mine,2,0,plan.fieldSlots)` → `我丙` 到首位 | 同上 | 改寫：`fieldSlots===ORIGINAL_DEPLOY_PICK_SLOTS`、`reorderable===[0]`、`pickDeploy(mine,2)` 才是真正的落地動作 |
| 4 | `game/tests/exec34.test.ts:62` | 斷言訊息「可重排槽數 = 前 3 槽」（值 `=== DEPLOY_FIELD_SLOTS`） | 值本身沒變（`wises.ts` 仍寫 `DEPLOY_FIELD_SLOTS=3`，UI 依賴），但**語義**被證偽：3 是重製版戰場寬度 | 保留值斷言、改訊息，並加 `ORIGINAL_DEPLOY_PICK_SLOTS===1` |
| 5 | `game/tests/deploy_queue.test.ts:101` | 斷言訊息「後選出陣只給動前 3 槽」（值 `canMove(0,3,DEPLOY_FIELD_SLOTS)===false`） | 值仍成立（那是 UI 拖動範圍），但理由被證偽 | 保留值、改訊息 |

文檔層面同樣被證偽（**未改**，按紀律 `project/**` 只讀，留給 lead 決定）：
`project/162_出阵队列与后选出阵.md` §5.2「後選出陣讓前 3 槽可重排」、`project/165_打包前原作对比门禁.md:81` D5 的「3 槽上陣 [推测]」。

## 3. 改動

### `game/src/core/deploy_queue.ts`（421 行，改）

| 行 | 內容 |
|---|---|
| 1-57 | 頭部大注釋重寫：`army` 結構布局、`0x446F45` / `0x446EE8` / `0x448690` / `0x44DE44` 反彙編、3 槽的來源與證偽 |
| 65-67 | `DEPLOY_FIELD_SLOTS = 3` 註釋收窄成「本重製版上陣區寬度，**不是** Exec34 的槽數」 |
| 69-75 | **新增** `ORIGINAL_DEPLOY_PICK_SLOTS = 1`（原作每側出陣位個數） |
| 77-91 | **新增** `ORIGINAL_DEPLOY_EVIDENCE`（13 條 位址→指令，供測試逐條比對原件，防註釋漂移） |
| 249-255 | `moveSlot` 註釋：`limit` 只是 UI 拖動範圍，不是 Exec34 授權 |
| 317-336 | `AfterFoePlan` 擴充：`fieldSlots` 改為「=1」、新增 `pickable` / `pickOrder:'foe-first'` / `foeLeader` / `mineLeader`，`reorderable` 改為 `[0]` |
| 349-374 | `chooseAfterFoe` 收窄：`fieldSlots` 一律夾到 `0..1`（傳 3 也變 1），`pickOrder='foe-first'` |
| 376-384 | **新增** `pickDeploy(queue, index)`：把第 `index` 槽提到出陣位（第 0 槽），stable move-to-front；越界/非整數原樣返回 |

### `game/tests/deploy_queue.test.ts`（269 → 284 行）

- 行 6-12 頭注：加 R81 更正
- 行 14-41 import：加 `ORIGINAL_DEPLOY_PICK_SLOTS` / `pickDeploy`
- 行 106 訊息改寫（斷言值不變）
- 行 232-266 兩條 `chooseAfterFoe` 測試改寫（見 §2 #1/#2）

### `game/tests/exec34.test.ts`（173 → 196 行）

- 行 17-24 頭注：R81 更正
- 行 32-40 import：加 `ORIGINAL_DEPLOY_PICK_SLOTS` / `pickDeploy`
- 行 77-80：`value` 語義更正 + `ORIGINAL_DEPLOY_PICK_SLOTS===1`
- 行 181-195：旗標消費點測試改寫（見 §2 #3）

### `game/tests/exec34_truth.test.ts`（**新**，286 行，9 條）

| # | 測試 | 對應要求 |
|---|---|---|
| 1 | 反彙編(1)：`0x446F45` 只取一個出陣下標；entries = `+0x1C`、步長 `0x48`；`ORIGINAL_DEPLOY_EVIDENCE` 13 條逐條等於原件 | ① 3 槽的位置與順序 |
| 2 | 反彙編(2)：`0x448690` 只建 2 個單位、52 條指令 0 條含立即數 3 | ① 的「3 從哪來」 |
| 3 | 反彙編(3)：點選寫 `army->+0x04 = 光標`，界限是 `[0x491094]`/`[0x491034]` | ② 排序規則的原件依據 |
| 4 | 語義：敵方先定、我方後選；選中者插到第 0 槽、其餘相對順序不變（非倒序、非排序） | ② |
| 5 | 語義：3 個上陣槽是重製版寬度，傳 3 也夾到 1 | ① + 收窄 |
| 6 | 邊界：不足 3 人 / 0 人 / 越界 / 壞輸入都不炸、不造人、不上 5 | ③ |
| 7 | 存檔：只寫 `save.deployQueue` 一個鍵、順序即出陣序、JSON 往返、缺字段零遷移 | ④ |
| 8 | 既有 API 不破壞：`moveSlot` / `setTroop` / `swapSides` / `normalizeQueue` / `queueOf` / 純函數 | ⑤ |
| 9 | `test.todo`：玩家實際點擊次序（見 §5） | 不編 |

反彙編那三條會讀 `../../work/orig_numbers/text_dis.tsv`；檔案不在時自動 `skip`（語義斷言照跑），所以 `game/` 單獨 checkout 也能過。

## 4. 測試數字

| 命令 | 結果 |
|---|---|
| `node --test tests\deploy_queue.test.ts` | **19 tests：19 pass / 0 fail** |
| `node --test tests\exec34.test.ts` | **7 tests：7 pass / 0 fail** |
| `node --test tests\exec34_truth.test.ts` | **9 tests：8 pass / 0 fail / 1 todo** |
| `node --test tests\deploy_queue.test.ts tests\exec34.test.ts tests\exec34_truth.test.ts` | **35 tests：34 pass / 0 fail / 1 todo** |
| `node --test "tests/*.test.ts"` | **1723 tests：1705 pass / 17 fail / 1 todo**（基線 1690 pass；1723 = 基線 + 別人在飛的新測試 + 我這 9 條） |
| `npm.cmd exec -- tsc --noEmit` | **exit 0**（第一次跑時 exit 2，錯在 `src/core/army_cmd.ts` 的 `planToward` —— 另一智能體 8:23:11 正在改該檔；等他改完重跑即 0，我的檔案全程 0 錯誤） |

17 條 fail 全部與本任務無關（`game/tests/*.test.ts` 裡只有 3 個檔 import `deploy_queue`，全綠）：

```
✖ F1 大地圖：內政鍵按月份分流              ✖ R141 部隊指令 ×4
✖ civicFields ×2 / city.html 內政 8 欄      ✖ R17 Rate 權重 / R19 抽獎 ×3
✖ R86/P0 模組層引用（surState）             ✖ 14 家固定色板
✖ R83 搜索 ×4
```

（附：`work/r81_exec34/full_test.log` = 第一次跑；`full_test2.log` = army_cmd.ts 修好後重跑。）

### 重跑命令

```powershell
cd F:\sanguo\work\orig_numbers
# 1) 三條「3」的掃描：期望 52 / 0 / 2 / 1 / 1
$lines = Get-Content text_dis.tsv
$n=0; $hit=0
foreach ($l in $lines) { $a=$l.Substring(0,8)
  if ($a -ge '00448690' -and $a -lt '00448760') { $n++; if (($l -split "`t")[3] -match ',\s*3\s*$') { $hit++ } } }
"instr=$n imm3=$hit"
(Select-String text_dis.tsv 'call\s+0x446f45').Count
(Select-String text_dis.tsv 'call\s+0x448690').Count
(Select-String text_dis.tsv 'call\s+0x43a1c4').Count

# 2) Exec34 分支全文
Select-String text_dis.tsv '^0044DE(44|49|4C|4D|52|55)'

cd F:\sanguo\game
node --test tests\deploy_queue.test.ts tests\exec34.test.ts tests\exec34_truth.test.ts
```

## 5. 仍未定（沒有編）

1. **玩家實際點擊次序**：兩張列表由同一段 WarPrep 準備碼 `0x41C06C(0x491000,4)` 與 `0x41C06C(0x491060,4)` 一次打開（`0x448628` / `0x448637`），靜態代碼只證明「敵方由 `0x4042ED(army,1)` 先自動選、我方列表後開」，**不能**證明「後選的人先出陣」這句中文讀法（也不知道原作 UI 是否強制玩家先看敵方）。→ `exec34_truth.test.ts` 的 `test.todo`。
2. **`[0x491094]` / `[0x491034]` 的寫入點**：這兩個是列表控件 `+0x34`（條目總數）字段，寫入是通過寄存器（`mov dword ptr [ecx + 0x34], ...`），沒有直接的 `[0x491094]` 絕對尋址寫入；本輪只證明「讀的是內存計數、不是常數 3」，沒有逐條追出填充循環。不影響結論。
3. **`army+0x08 = 2` 的含義**（`0x446EF3`）：疑為「每側單位數 / 陣型寬度」，與 Exec34 無關，未深究。
4. **`0x44DE44` 那格是否在別處另有旗標**：`0x44D450` 派發器前後（`0x44D3E0` 成功率判定）沒有寫 Exec34 專屬狀態；若原作真有效果，只可能在別的分支共用同一段代碼 —— 但跳表 66 項無重複目標，可排除。
5. **不在我權限內、但仍寫著「重排前 3 槽」的註釋**（留給 lead 派給對應 owner）：
   `game/src/core/wises.ts:188`、`game/src/core/wises.ts:442`、`game/src/core/wises_effects.ts:262-263`、`game/src/core/strategy.ts:162`。
   `game/web/deploy.html` **不調用** `chooseAfterFoe`（只把 `DEPLOY_FIELD_SLOTS` 當拖動範圍，行 774/776/871），所以本次收窄不影響 UI。
   `game/cocos/assets/scripts/DeployRoot.ts` 若要跟著用 `pickDeploy`，需 lead 跑 `work/cocos_sync/sync_core3.mjs`。

## 6. 對 `deploy_queue.ts` 的語義收窄（任務第 4 點）

Exec34 **只影響編成層的「敵方先定、我方後選」**，不影響戰鬥內換將順序（原作戰場每側 1 個將領單位，進場後不再換將；`0x448DBF` 那條重建路徑只在單位為 0 時重建同一個出陣將，不換人）。因此：

- 舊 `chooseAfterFoe` 的「放開前 3 槽重排」被刪掉，`fieldSlots` 一律夾到 1、`reorderable = [0]`；
- 真正的落地動作改成新 API `pickDeploy(queue, index)`（任意一員 → 出陣位）；
- `DEPLOY_FIELD_SLOTS = 3` **保留**：它是重製版 3 行上陣區的寬度，`wises.ts:193` / `deploy.html:733/735/827` / `cocos` 都在用，但不再冒充「Exec34 授權的槽數」；
- `wises.ts`、`battle.ts`、`deploy.html`、`cocos/**` 一律未動（其中 `wises.ts` / `web` / `cocos` 屬他人或禁改範圍；`cocos` 的 `DeployRoot.ts` 若要用 `pickDeploy`，需 lead 走 `work/cocos_sync/sync_core3.mjs` 同步）。
