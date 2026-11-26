# R83 部隊指令「33 組 × 6 條」精確步長 / 時長 —— [推測] → [反彙編]

> 對應差異清單：`project/199_对照表刷新R193.md` 第 141 / 223 / 243 行（R83 ⚠️4h，「精確步長是 [推測]（165 §4 D5）」）。
> 本輪把「一條指令走多遠、走多久」全部落到反彙編地址上；`F:\sanguo\game\src\core\army_cmd.ts` 的數字按真值改並加出處。
> 反彙編基座：`F:\sanguo\work\orig_numbers\text_dis.tsv`（5 列 TSV，地址/字節/助記/操作數/註釋）。

## 0. 一句話結論

- **每條指令在一個行動 tick 內走「恰好 1 格」**，方向是 8 鄰域之一（含斜向）；不是速度倍率、不是自由向量。
  方向表 `0x48E560` 8 項的每個分量恆為 ±1/0：`0043C52D add edx,[ebp-0x30]`（`tx = x0 + dx`）只試一格。
- **行動 tick 間隔 = 40 幀**（`0043B5DE [u+0x34]=0x28`）；**撤退態 46 幀**（`0043B5FD [u+0x34]=0x2e`）；撤退中的主將再 `+2*(F(敵軍團)−F(己軍團))`（`0043B64A..0043B653`）。
- **視覺滑動固定 40 幀/格**（`0043BF5F push 0x28`）；一格 = **96×72 px**、格心 `(0x30,0x24)`（`0x43A4E0`）。
- 33 組 × 6 條 = **198 項**：串表 `0x48F94C`（198×12B，**Big5**）、指針表 `0x48EB60`（198 項，+12 遞增）、執行表 `0x48EE78`（198 dword，只有 18 個不同目標）。
- 現值與真值的**實質偏差只有 3 處**（其餘數字本來就一致）：
  ① 主將後退誤用錐形權重 → 真值 `0x48E5C8` 是 100/0 直線；
  ② 三處「朝目標一步」用了「先沿 x 再沿 y」的 `planToward` → 真值 `0x43C888` 是 dx/dy **各自取符號**（可斜走）；
  ③ 引擎節奏比真值多 1 幀（40→41、46→47，`battle.ts` 禁改，見 §4）。
- 任務書裡的三個舊量測值（`hold 0` / `back +2.690 格` / `spread σ 0.781→2.673`）在 `game/` 下**零命中**，只存在於 `work/audit_r193/build199.mjs:512` 與 `work/_append37a.py:38` —— 那是 R158 之前的舊口徑，現文件早已換成抽格計劃模型，本報告的「現值」因此按**當前代碼 + `battle.ts` 常數**重新取。

---

## 1. 證據表

### 1.1 時長：行動節奏（`0x43B574`）

```
0043B57D  mov ecx,[eax+0x34]
0043B580  sub ecx,1
0043B586  [edx+0x34]=ecx
0043B58C  cmp [eax+0x34],0
0043B590  jg  0x43B65D          ; >0 → return 0（本幀不行動）
0043B599  mov dword ptr [ecx+0x34],0
0043B5A3  cmp dword ptr [edx+0x3c],0
0043B5A7  je  0x43B5DB          ; !=0 → vcall [obj+0x4c](obj,0x1000d,0); return 1（演出硬直）
0043B5DE  mov dword ptr [ecx+0x34],0x28   ; ★ 40 幀
0043B5E9  call 0x43B50D          ; = u+0x2c（狀態位 getter）
0043B5F1  and eax,0x4000
0043B5F8  je  0x43B656          ; 非撤退 → return 1
0043B5FD  mov dword ptr [eax+0x34],0x2e   ; ★ 46 幀
0043B608  call 0x43B6A8          ; isGeneral：u && (u+0x2c & 1)
0043B618  call 0x43B9FC          ; 敵軍團
0043B627  call 0x4429FD          ; F(u)
0043B636  call 0x4429FD          ; F(敵軍團)
0043B644  sub edx,[ebp-0xc]
0043B64A  mov ecx,[eax+0x34]
0043B64D  lea edx,[ecx+edx*2]    ; ★ u+0x34 = 46 + 2*(F(敵)−F(己))
0043B653  [eax+0x34]=edx
0043B656  mov eax,1
```

- `F(x) = (x+0x40)->[0x48]->int16[+0x40]`（`0x4429FD`，`00442A06..00442A12`）。
- `0x43B9FC(u) = 0x43B9E2(u+0x40)`；`0x43B9E2`：入參 == `0x4A8A60` 則返回 `0x4B03A0`，否則返回 `0x4A8A60`
  ⇒ **`0x4A8A60` = A 方軍團、`0x4B03A0` = B 方軍團**。
- 讀出：普通 **40 幀**、撤退 **46 幀**、主將撤退 **46 + 2Δ**（Δ 的字段語義仍未定，見 §4）。

滑動與像素（`0x43BF26` → `0x43BE42`，`0x43A4E0`）：

```
0043BF5F  push 0x28              ; ★ speed = 40 幀/格
0043BF63  push gy / push gx / push u
0043BF6D  call 0x43BE42
0043BEF9  idiv dword ptr [ebp+0x14]   ; 位移 ÷ 40
0043A4E6  imul eax,eax,0x60      ; ★ 96 px / 格（x）
0043A4E9  add eax,0x30           ;   格心 0x30
0043A4F1  imul edx,edx,0x48      ; ★ 72 px / 格（y）
0043A4F4  add edx,0x24           ;   格心 0x24
```

抖動：`0043BE6F push 0x30; call 0x450117` → `px += rand()%0x30 − 0x18`（±24 px）；
`push 0x24` → `py += rand()%0x24 − 0x12`（±18 px）；夾取 `±0x780000`(120px) / `±0x5A0000`(90px)。

### 1.2 步長：一步一格（`0x43C4C0` + `0x43C2A5` + `0x48E560`）

```
0043C4C9  mov ecx,[eax+8]        ; x0 = u+8
0043C4D5  mov [edx+0xc]          ; y0 = u+0xc
0043C4DC  mov edx,[ebp+0x14]
0043C4E0  add edx,4              ; desc+4 = 第一組權重
0043C4E4  push &out / push edx / push sy / push sx
0043C4EB  call 0x43C2A5          ; 加權抽 8 個候選方向
0043C52D  add edx,[ebp-0x30]     ; ★ tx = x0 + out[i].dx —— 只加一次
0043C536  add ecx,[ebp-0x38]     ;   ty = y0 + out[i].dy
```

方向表 `0x48E560`（8 項 short）：`(1,0) (1,-1) (0,-1) (-1,-1) (-1,0) (-1,1) (0,1) (1,1)` = E/NE/N/NW/W/SW/S/SE。
旋轉表 `0x48E5A8` = `[0,-1,+1,-2,+2,-3,+3,-4]`；基準方向表 `0x48E580` = `[3,2,1,4,-1,0,5,6,7]`（`[4]=-1` ⇒ 原地不動）。

### 1.3 逐條 handler（主將表 `0x43CF8D` 9 項 / 小隊表 `0x43D0C9` 10 項）

| 指令 | 入口 | 關鍵片段 | 讀出的值 |
|------|------|----------|----------|
| 0 待機 | `0x43C907` | `0043C90A push 0x48e6a0 / push 0 / push 0 / call 0x43c4c0` | (0,0)+全 0 權重 ⇒ **0 格** |
| 1 前進（主將） | `0x43C758` | `0043C767 push 0x48e5c8 / 0043C76C push 0 / 0043C76E push -1`；B `0043C785 push 1` | (A −1,0 / B +1,0)，desc `0x48E5C8`=100/0 |
| 1 前進（士兵） | `0x43C921` | `0043C929 call 0x43c831` / `0043C933 jne 0x43c9c2`；`0043C93F cmp [edx+0x64],0` / `0043C948 cmp [eax+0x20],1` | 前線→`0x43C888(敵軍團)`；否則 `0x48E6E8`=80/10/10 |
| 2 後退（主將） | `0x43C795` | `0043C798 push 0x100 / call 0x43b51e`；A `0043C7B5 push 0x48e5c8 / push 0 / push 1`、B `0043C7CC push -1` | (A +1,0 / B −1,0)，desc **`0x48E5C8` 直線 100/0**，並置 `0x100` |
| 2 後退（士兵） | `0x43C9EF` | `0043CA4D push 0x48e778 / push 0 / push 1`、B `0043CA64 push -1` | (A +1,0)，desc `0x48E778`=80/10/10；不置 `0x100` |
| 3 上移 | `0x43CA7B` | `0043CA8A push 0x48e7c0 / push 1 / push 0`；B `0043CAA1` **完全相同** | (0,+1)，desc `0x48E7C0`=100/0，A/B 不鏡像 |
| 4 下移 | `0x43CAB8` | `0043CAC7 push 0x48e7c0 / push -1 / push 0` | (0,−1)，A/B 相同 |
| 5 分散 | `0x43CB87` | `0043CB8F call 0x43c831` / `0043CB97 cmp eax,1`；`0043CBCD cmp [u+0xc],3` `jle`；`0043CBD6 cmp,0xa` `jl`；`0043CC19 cmp,7` `jl` | 前線→`0x43C888`；`y∉(3,10)`→(sx,0)；`y≥7`→(sx,+1)；否則 (sx,−1)；三檔都 `0x48E6E8` |
| 6 集中 | `0x43CAF5` | `0043CAFE mov ecx,[0x48e4d0]` / `0043CB04 sub ecx,[eax+0xc]` / `0043CB0E je`；`0043CB32 push 0x48e850 / push sy / push 0`；`0043CB57 push 0x48e898 / push 0 / push -1` | `0x48E4D0`=**6**；dy≠0→(0,sign(dy)) `0x48E850`；dy=0→(sx,0) `0x48E898`=35,5,5,5,5,5,5,35 |
| 7 突擊 | `0x43CDD3` | `0043CDDF mov edx,[ecx+0x38f4]` / `0043CDF2 call 0x43b556` / `0043D068 call 0x43c888` | 朝緩存敵 unit 格，desc `0x48E808`；**只走小隊表** |
| 8 撤退（主將） | `0x43C7E3` | `0043C7F2 push 0x48e658 / push 0 / push 1`；`0043C81E push 0x4000 / call 0x43b51e` | (A +1,0)，desc `0x48E658`=100/0 |
| 8 撤退（士兵） | `0x43CC95` | `0043CCA4 push 0x48e8e0 / push 0 / push 1`；`0043CCD0 push 0x4000` | (A +1,0)，desc `0x48E8E0`=80/10/10 |
| 9 歸陣 | `0x43D072` | `0043D075 mov eax,[u+0x40]` / `push [eax+0xc]` / `push [eax+8]` / `0043D093 call 0x43c888` | 朝己方軍團格，desc `0x48E808` |

「朝目標一步」`0x43C888`（前進/分散的前線分支、突擊、歸陣共用）：

```
0043C894  sub ecx,[eax+8]        ; dx
0043C8A0  sub eax,[edx+0xc]      ; dy
0043C8A6  cmp ecx,0 / jle / 0043C8AC mov 1 / 0043C8B5 xor+setge+dec   ; sx = sign(dx)
0043C8C8  ... 同一套                    ; sy = sign(dy)  ★ 兩軸各自取符號
0043C8EA  push 0x48e808
```

前線判定 `0x43C831`：A 側 `u+8 <= 敵軍團+8 + 3`（`0043C853 add eax,3`），B 側鏡像。

### 1.4 描述符權重表 `0x48E5C8`（12 條 × stride `0x48`）

| 位址 | jitter | accum1[8] | accum2[8] |
|------|--------|-----------|-----------|
| `0x48E5C8` | 1 | 100,0… | 100,0… |
| `0x48E610` | 1 | 100,0… | 100,0…（無引用死數據） |
| `0x48E658` | 1 | 100,0… | 100,0… |
| `0x48E6A0` | 1 | 全 0 | 全 0 |
| `0x48E6E8` | 0 | 80,10,10,0,0,0,0,0 | 60,15,15,5,5,0,0,0 |
| `0x48E730` | 1 | 100,0… | 100,0… |
| `0x48E778` | 0 | 80,10,10… | 60,15,15,5,5… |
| `0x48E7C0` | 1 | 100,0… | 100,0… |
| `0x48E808` | 0 | 80,10,10… | 60,15,15,5,5… |
| `0x48E850` | 0 | 80,10,10… | 60,15,15,5,5… |
| `0x48E898` | 0 | 35,5,5,5,5,5,5,35 | 同左 |
| `0x48E8E0` | 0 | 80,10,10… | 60,15,15,5,5… |

### 1.5 33 組 × 6 條表

- 串表 `0x48F94C..0x490294` = **198 項 × 12 字節**（`0x948`B），**Big5**（GBK 解出亂碼）。
- 指針表 `0x48EB60` 198 項，每項恰指向串表 +12 遞增，198 個互不相同。
- 執行表 `0x48EE78` 198 dword，索引 = `[0x4A6674]`（陣形號 0..32）× `0x18` + slot×4；
  `004450CD` 段：`imul ecx,ecx,0x18` / `call [ecx+eax*4+0x48ee78]` / `mov ecx,[ecx+eax*4+0x48eb60]`。
- 198 項只落到 **18 個目標**：`0x4449A9`×33、`0x444ACB`×33、`0x444B0F`×33、`0x444A35`×24、`0x444A80`×24、`0x4449EA`×18、`0x44501B`×9、`0x444D51`×4、`0x444CCF`×3、`0x444D10`×3、`0x444F58`×3、`0x444F99`×3、`0x444FDA`×3、`0x444D92`×1、`0x444E36`×1、`0x444EEB`×1、`0x44505C`×1、`0x444E99`×1。
- label 與現文件 `GROUP_LABELS` **逐組逐項一致**；slot4 全 33 項 = 全軍待機、slot5 = 全軍突擊。
- 唯一矛盾：**g23** 串表 slot0=`前軍前進`/slot1=`伏軍攻擊`，執行表卻是 slot0=`0x44501B`(伏軍攻擊)/slot1=`0x4449A9`(前軍前進)（互換）。本文件按串表建表、不改行為，見 §4。

---

## 2. 現值 vs 真值對照

「差」按一步（一個行動 tick）的最大偏差計；>0.1 格的行**加粗**。

| 項目 | 現值（改動前） | 反彙編真值 | 差 |
|------|----------------|------------|-----|
| 每 tick 步長 | 1 格（8 鄰域） | 1 格（`0x48E560` 恆 ±1/0） | 0 |
| 普通行動間隔 | `ACTION_INTERVAL_TICKS`=40 | 40（`0043B5DE`） | 0（常數）；引擎實跑 41，見 §4 |
| 撤退間隔 | `GENERAL_SLOW_INTERVAL`=46 | 46（`0043B5FD`） | 0（常數）；實跑 47 |
| 撤退中主將追加 | 未實裝 | `46 + 2*(F(敵)−F(己))`（`0043B64A`） | **Δ 幀**（Δ 未定） |
| 視覺滑動 | `ACTION_SLIDE_TICKS`=40 | 40（`0043BF5F`） | 0 |
| 一格像素 / 格心 | 96×72 / (48,36) | `0x60`/`0x48`，`0x30`/`0x24` | 0 |
| 抖動 | ±12 / ±9 px（`commitStep`） | ±24 / ±18 px（`0x43BE6F`） | **0.125 格（x）/ 0.125 格（y）** |
| 待機 | 0 格 | `0x48E6A0` 全 0 ⇒ 0 | 0 |
| 主將前進 | (A−1,0) `STEP_W_STRAIGHT` | (A−1,0) `0x48E5C8` 100/0 | 0 |
| 士兵前進 | (A−1,0) `CONE` | `0x48E6E8` 80/10/10 | 0 |
| 前線改朝敵軍團 | `planToward`（先 x 後 y） | `0x43C888` 兩軸取符號 | **dy≠0 時少走 1 格 y（100%）** |
| 主將後退 | (A+1,0) **`CONE` 80/10/10** | (A+1,0) **`0x48E5C8` 100/0 直線** | **20% 概率走 ±45°，期望 \|Δy\|=0.2 格** |
| 士兵後退 | (A+1,0) `CONE` | `0x48E778` 80/10/10 | 0 |
| 上移 / 下移 | (0,±1) `STRAIGHT`，A/B 同 | `0x43CA8A`/`0x43CAC7`，A/B 同 | 0 |
| 分散三檔 | `y∉(3,10)`→(sx,0)、`y≥7`→(sx,+1)、否則 (sx,−1)，`CONE` | 同（`0043CBCD`/`0043CBD6`/`0043CC19`） | 0 |
| 集中目標行 | `FOCUS_ROW`=6 | `0x48E4D0`=6 | 0 |
| 集中歸行後權重 | `STEP_W_FOCUS_ROW` 35,5,…,5,35 | `0x48E898` 同 | 0 |
| 突擊 | 朝緩存敵格，權重 `CONE`，但 `rushStepPlan` 用 `planToward` | `0x48E808` 80/10/10 + `0x43C888` 兩軸 | **dy≠0 時少走 1 格 y** |
| 撤退（主將/士兵） | `retreatStepPlan`：主將 `STRAIGHT` / 士兵 `CONE`，+x | `0x48E658` 100/0 / `0x48E8E0` 80/10/10 | 0 |
| 歸陣 | `planToward`（先 x） | `0x43C888` 兩軸 | **dy≠0 時少走 1 格 y** |
| 主將 cmd 3..7 | 空操作 | `0x43CF8D[3..7]` 全指 `0x43CF89` ret | 0 |
| 突擊速度倍率 | `RUSH_SPEED`=1.0 | 無速度倍率（`0x43BF26` 第 4 參恆 `0x28`） | 0 |

> 任務書提到的 `back +2.690 格` / `spread σ 0.781→2.673` 不在代碼裡（見 §0 末），不作為現值。

---

## 3. 改了哪些常量（`F:\sanguo\game\src\core\army_cmd.ts`，共 891 行）

| 位置 | 改動 |
|------|------|
| `army_cmd.ts:27` | 首部新增「R83 反彙編真值」段（方向表/40/46/滑動/96×72/抖動/夾取，全帶片段地址） |
| `army_cmd.ts:256` | `GROUP_LABELS` 頭註：串表 198×12B Big5、指針表 `0x48EB60`、執行表 `0x48EE78` 索引式、18 個目標 |
| `army_cmd.ts:292-294` | g23 串表/執行表互換的註釋（**不改行為**） |
| `army_cmd.ts:311-316` | `GROUP_COUNT` 註明出處（`0x4A6674`×`0x18`、198÷6=33、`0x948`B÷12=198） |
| `army_cmd.ts:575-590` | `CMD_HOLD..CMD_RETURN` 文檔塊：主將表 `0x43CF8D`、小隊表 `0x43D0C9` 逐項 VA |
| `army_cmd.ts:591-600` | 十個 `CMD_*` 常量逐行行尾寫出處（`0x43CF8D[n]`/`0x43D0C9[n]` → handler 地址） |
| `army_cmd.ts:609` | `FOCUS_ROW = 6` 補 `0043CAFE/0043CB04/0043CB0E` |
| `army_cmd.ts:712` | 新增 `planSignToward()`：dx/dy **各自 `Math.sign`**（= `0x43C888`），`(0,0)` 返回 null（=`0x48E580[4]`=−1） |
| `army_cmd.ts:748` | `cmdStepPlan()` 文檔表擴成「命令 / 基向量 / 權重 desc / 反彙編入口」+ 時長段 |
| `army_cmd.ts:770` | **主將後退改為 `STEP_W_STRAIGHT/STEP_W_STRAIGHT`**（原先 `CONE/CONE_WIDE`） |
| `army_cmd.ts:763` / `:784` / `:810` | 前進前線、分散前線、歸陣：`planToward` → `planSignToward`（兩軸取符號） |
| `army_cmd.ts:755-813` | `cmdStepPlan()` 分支體：其餘分支補 handler 與片段地址註釋；刪除 `import { planToward }` |

測試：

| 位置 | 改動 |
|------|------|
| `game\tests\army_cmd.test.ts:865-866` | 補「主將後退 = 直線 100/0，不是錐形（R83 修正 `0043C7B5`）」兩條斷言 |
| `game\tests\army_cmd_truth.test.ts`（新增，**12 條**） | 時長 40/46/滑動 40、格尺寸 96×72、一步一格（含 120 tick 實跑 Chebyshev=1）、前進/撤退/待機時序、士兵與主將逐條基向量+desc、`0x43C888` 斜走、33×6 完整性、198 項 label 直方圖、上/下移 A/B 不鏡像 |

---

## 4. 仍未定 / 禁改偏差

### 4.1 【仍未定】

1. **主將撤退追加項的 Δ 語義**：`u+0x34 = 46 + 2*(F(敵)−F(己))`，`F(x) = (x+0x40)->[0x48]->int16[+0x40]`（`0x4429FD`）。
   `+0x40 → [0x48] → int16[+0x40]` 這個二級字段是什麼（行動力？速度？兵種表？）尚未定位；
   `0x43B9FC`/`0x43B9E2` 只確認了「敵/己軍團」的取法。影響：主將撤退間隔少一個 `2Δ` 項（`battle.ts` 禁改，只能在報告登記）。
2. **g23（第 24 組）原作數據自相矛盾**：串表 slot0/slot1 與執行表 slot0/slot1 互換（§1.5）。
   沒有 UI 錄像無法判定原作按哪張表顯示/執行；本文件保留串表口徑（按鈕文字），行為差異在 slot0/1 兩條。
3. **`0x43BFE7` 退場參數 / `obj+0x90` 倒計時初值 `0x40` 的消費點**（繼承 `project/155` §6.1）。
   不影響步長/時長：退場後該 unit 不再產生行動 tick（`0x8000` 已置）。
4. **`army+0x64` 的寫入者**：全 `.text` 只有 `0x43AA80`（戰鬥初始化）與 `0x444934`（全軍突擊）寫 0，
   所以「第一小隊直線前進/後退」特例（`0x48E730`/`0x48E7C0`）實際不可達 —— 本文件據此不實裝。

### 4.2 `battle.ts` 禁改造成的偏差（本輪只登記，未動）

| # | 偏差 | 現值 | 真值 | 影響 |
|---|------|------|------|------|
| ① | 抖動幅度 | `commitStep` ±12/±9 px | ±24/±18 px（`0x43BE6F`） | **0.125 格/軸** |
| ② | 主將撤退追加幀 | 只 46 | `46+2Δ`（`0043B64A`） | Δ 未定 |
| ③ | 突擊取符號 | `rushStepPlan` 用 `planToward`（先 x） | `0x43C888` 兩軸各自取符號 | **dy≠0 時少 1 格 y** |
| ④ | 行動節奏 | `if (u.cd>0){u.cd--;continue}` ⇒ 值 40 要 **41 幀**歸零 | `if (--[u+0x34] > 0) return` ⇒ **40 幀** | 每格多 1 幀（撤退 47 而非 46） |

偏差 ④ 的實測（`work/r83_steps/probe_cadence.mjs`）：主將前進在第 **1 / 42 / 83** 幀各走一格；撤退在第 **1 / 48** 幀（46+1）。真值測試 `army_cmd_truth.test.ts` 已把「40 幀內最多一格」與「第 42 幀才第二格」都釘住，等 `battle.ts` owner 修 `u.cd` 順序時只需改那一條。

---

## 5. 測試數字

- `cd F:\sanguo\game; npm.cmd exec -- tsc --noEmit` → **exit 0**
- 三文件單跑：`node --test tests\army_cmd.test.ts tests\battle_cmd_ui.test.ts tests\army_cmd_truth.test.ts`
  → **81 tests / 81 pass / 0 fail**（44 + 25 + **12**）
- 全量：`node --test "tests/*.test.ts"` → **1735 tests / 1734 pass / 0 fail / 1 todo**（87 suites）
  - 開工時基線 1690 條全綠；總數漲到 1735 是并行智能體新增的測試（本輪只加 12 條）。
  - 中途曾看到 4 條紅（`affairs_f1f8` 內政鍵、`city_rules` 自治不扣金、`era_save` city.html、`saves_r70` 色板），
    都不 import `army_cmd`，屬并行智能體在改的內政/城池/HTML/色板；最終在其修復後全量 **0 fail**。
- 我負責的 81 條全綠；`army_cmd.test.ts` 44 條（原 44，斷言只增不減）、`battle_cmd_ui.test.ts` 25 條未動、`army_cmd_truth.test.ts` 新增 12 條。

## 6. 復現

```
cd F:\sanguo\game
node F:\sanguo\work\r83_steps\dis_range.mjs 0x43B574 0x43B680    # 行動節奏閘門
node F:\sanguo\work\r83_steps\dis_range.mjs 0x43C758 0x43C920    # 主將 0/1/2/8 handler
node F:\sanguo\work\r83_steps\dis_range.mjs 0x43C921 0x43CD00    # 小隊 handler（前進/後退/上下/集中/分散/撤退）
node F:\sanguo\work\r83_steps\dump_data.mjs 0x43CF8D 0x43CFB1 i32 # 主將跳表 9 項
node F:\sanguo\work\r83_steps\dump_data.mjs 0x43D0C9 0x43D0F1 i32 # 小隊跳表 10 項
node F:\sanguo\work\r83_steps\desc_dump.mjs                      # 12 條描述符
node F:\sanguo\work\r83_steps\menu_dump_big5.mjs                 # 33×6 串表（Big5）
node F:\sanguo\work\r83_steps\probe_cadence.mjs                  # 節奏實測（1/42/83、1/48）
```

（腳本都在 `F:\sanguo\work\r83_steps\`；`dis_range.mjs` 的兩個參數要寫成帶 `0x` 的**字符串**，PowerShell 的十六進制字面量會先被轉成十進制。）
