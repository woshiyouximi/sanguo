# 技力（MP）不会恢复 —— 原作口径调查与改动方案

- 调查者：`jili`（subagent），交付给 `lead`
- 时间：2026-11-26
- 范围：只读 `game/**`（另一个智能体正在改 `game/src/core/battle.ts`，本轮**没有**改它）；反汇编证据来自 `F:\sanguo\work\dis_*.txt` 与 `docs/`、`project/` 既有还原文档
- 交付物：本报告 + `F:\sanguo\work\jili\probe.mjs`（一次性验证脚本，`node work\jili\probe.mjs` 可跑）
- 置信度标记：**[确认]**＝反汇编/源码直证；**[推测]**＝有多条间接证据；**[待证]**＝还没找到证据

---

## 0. 一句话结论

**原作在战斗内没有「基础回技力」：只有军师技「技力自動恢復」（`army+0x84 |= 2`）生效时才会回，速率是「每 tick 累加 `+0x88`(30/50/70)，越过 6000 回 1 点」——60Hz 下 = 参数/100 点/秒（L1 0.30、L2 0.50、L3 0.70 点/秒），无军师技时整场恒为 0；我们现在的实现方向对、但公式错（按上限百分比、120 tick 一次，比原作快约 3.3×，且随 mpMax 放大），需要把 `strategyRegen()` 换成定额累加器和 `0x1770` 阈值。**

---

## 1. 五个问题逐条

### Q1. 原作到底有没有被动回技力？——「有，但只由军师技开启」[确认]

**证据 1（恢复函数本体）**：`work/dis_battle_units.txt:5984-6059`（地址 `0x43E84A`–`0x43E963`）函数 `0x43E847(army)`：

```
0x43E84B  mov eax,[ebp+8]        ; arg = army
0x43E84E  mov ecx,[eax+0x48]     ; g = army->+0x48  (general 记录指针)
...       mov edx,[arg+0x84]     ; flags
0x43E857  and eax,1  test        ; bit0 = 体力恢复
          je   0x43E8DD          ; bit0 不成立才看 bit1
  ; --- 体力分支 ---
          [arg+0x8c] += [arg+0x88]         ; 累加器 += 参数
          cmp dword [arg+0x8c],0x1770      ; 6000
          jle 0x43E8D8                     ; 没到 6000 直接退出
          [arg+0x8c] -= 0x1770             ; 越过 6000 → 扣掉 6000（余数保留）
          mov cx,[g+0x12]; add cx,1; mov [g+0x12],cx        ; 体力当前 +1
          if ([g+0x12] > [g+0x10]) [g+0x12] = [g+0x10]      ; 夹到体力上限
          jmp 0x43E960                     ; ★ 体力分支结束就返回，不走技力分支
  ; --- 技力分支 0x43E8DD ---
          mov edx,[eax+0x84]; and edx,2; je end             ; bit1 = 技力恢复
          [arg+0x8c] += [arg+0x88]
          cmp [arg+0x8c],0x1770; jle end
          [arg+0x8c] -= 0x1770
          mov ax,[g+0x16]; add ax,1; mov [g+0x16],ax        ; 技力当前 +1
          if ([g+0x16] > [g+0x14]) [g+0x16] = [g+0x14]      ; 夹到技力上限
```

要点：
- `+0x84` bit0/bit1 分别开体力/技力恢复；**同一时刻只有一路生效，bit0（体力）优先**；
- `+0x88` = 参数（速率），`+0x8c` = 累加器，阈值 **`0x1770` = 6000**；
- 越过阈值回 **1 点**，且 `-= 6000` 保留余数；**与上限无关，是定额 +1**，不是百分比；
- `g+0x12`=体力当前、`g+0x10`=体力上限；`g+0x16`=技力当前、`g+0x14`=技力上限（偏移语义见 Q4 的推导）。

**证据 2（唯一调用点＝每帧 tick）**：`0x43E847` 只被 `0x43E964`（主将每帧更新函数）在 `0x43E9E5` 调用一次（`work/dis_battle_units.txt:6060-6159` 段内）。而 `0x43E964` 只被 Process 4（`ForceMajor`＝主将战场对象，`0x43EF64`）的 **OM_TICK（msg=2）分支**调用：

- `work/dis_duel_43EF64.txt` / `work/dis_dmg_p04_forceMajor.txt`：`0x43EF6D mov [ebp-0x18],eax`（eax＝msg）→ `cmp [ebp-0x18],2; je 0x43EFC1` → `0x43EFC1 push [ebp+8]; call 0x43E964`；
- `docs/04b4_普攻伤害与Process.md:36`：`OM_TICK | 2 | 每帧`；`:103-122`：Process 注册链 `THINGS.INI Process=` → `0x422BEB(id)` 查表 `[0x4C09E0+id*4]` → `thingdef+0x20` → ctor `0x421983` 写 `obj+0x4C`，之后 `obj+0x4C(obj,1,0)` 发 OM_ALLOCATE，运行期每帧发 OM_TICK；
- 所以 `0x43E847` 的累加频率 = **每帧一次**（60Hz，见 Q2）。

**证据 3（`army+0x84` bit1 是不是只有军师技会置）——是。**
全量检索 `work/dis_*.txt` 里写 `[x+0x84]` 的地址，共 26 处：

| 文件:行 | 地址 | 性质 |
|---|---|---|
| `dis_battle_B_44D450.txt:750,773,788,803,818,833,848,863,877,891,911,934,945,984,1001,1018,1077,1229,1242,1255,1273,1290,1307,1324` | `0x44DE15`…`0x44E699` | **全部是 `0x44D450` 军师技分派器**（66 条 Execute 分支） |
| `dis_dmg_ctor_4218E0.txt:60` | `0x4219B9` | 构造时 `mov [ecx+0x84],0`（清零） |
| `dis_save_load.txt:112` | `0x432214` | 读档初始化 |
| `dis_battle_gen_442B08.txt:104` | `0x442C4B` | 初始化 |

其中恢复系军师技的写入字节（`dis_battle_B_44D450.txt:769-858`）逐条核过：

```
0x44DE5A  or edx,1  ; mov [ecx+0x88],0x28(40) ; mov [edx+0x8c],0   ← 體力自動恢復 L1
0x44DE9F  or edx,1  ; =0x3c(60)               ; [..+0x8c]=0         ← L2
0x44DEE4  or edx,1  ; =0x50(80)               ; [..+0x8c]=0         ← L3
0x44DF29  or edx,2  ; mov [ecx+0x88],0x1e(30) ; mov [edx+0x8c],0   ← 技力自動恢復 L1
0x44DF6E  or edx,2  ; =0x32(50)               ; [..+0x8c]=0         ← L2
0x44DFB3  or edx,2  ; =0x46(70)               ; [..+0x8c]=0         ← L3
```

即「只有军师技把 bit1 置起来，并顺手把累加器清零」。没有任何其它路径（升级、道具、战后、内政）写这个位。

**证据 4（既有文档口径一致）**：`docs/04b_战斗系统.md:377-383` 资源表里，技力（MP）的「恢复」栏**只写了「军师技『技力自動恢復』」**；`project/09_战斗原型说明.md:153` 也写「不自动回复……原作也只有军师技才回技力」。

**结论**：原作**没有基础的被动回技力**；有「军师技开启的被动回技力」，且玩家会误以为它不存在，因为不开军师技时确实恒为 0。**置信度 [确认]**。

---

### Q2. 有被动恢复的话，速率是多少？——「每 tick 累加参数，越过 6000 回 1 点；60Hz 下 = 参数/100 点/秒」[确认]

**机制（Q1 证据 1 的代码）**：

```
每帧（OM_TICK）：  acc += param            // param = +0x88 = 30 / 50 / 70
                   if (acc > 6000) { acc -= 6000; mp += 1; if (mp > mpMax) mp = mpMax; }
```

**换算**（`project/192_引擎节拍60Hz.md`：战斗倒计时 `[0x4AC35C]=0x2E68=11880` 帧、`0x444126` 每帧 −1、显示 `(11880−cd)/120` ⇒ 0.5 单位/秒、整场 **198 s** ⇒ 11880/198 = **60 帧/秒**）：

| 军师技等级 | 参数 `+0x88` | 每回 1 点所需帧 | 折合 | 整场 198 s 最多回 |
|---|---|---|---|---|
| 恢復技力 L1 | 30 | 6000/30 = 200 帧（首点 201 帧） | **0.30 点/秒**（3.33 s / 点） | ≈ 59 点 |
| 恢復技力 L2 | 50 | 120 帧（首点 121） | **0.50 点/秒** | ≈ 99 点 |
| 恢復技力 L3 | 70 | ≈86 帧（首点 87） | **0.70 点/秒** | ≈ 138 点 |
| 恢復體力 L1/L2/L3（同构，bit0） | 40 / 60 / 80 | — | 0.40 / 0.60 / 0.80 点/秒 | 79 / 118 / 158 点 |

**上限**：`g+0x14`（技力上限），越过就夹住，不会溢出。
**是否只在非战斗状态回**：恰好相反——**只在战斗内回**。该机制长在战场单位对象的 OM_TICK 里，战斗一结束对象销毁就没了；战场外没有任何等价路径（见 Q3）。战斗内**不受**行动节拍/硬直/待机影响：恢复调用 `0x43E9E5 call 0x43E847` 在函数前段，早于行动闸门 `0x43B574`（`0x43EB4C`）——[确认]。
**注意**：`+0x8c` 是**战场单位对象**上的累加器，军师技生效时清零；同一次战斗中不会自然重置。

---

### Q3. 玩家怎么补技力？——「军师技（唯一战斗内来源）、升级重算上限；战后不补满；战场外回补未定位」[确认]+[待证]

按证据分四条：

1. **军师技「恢復技力」（SEQUENCE 12/41/58 → Execute 38/39/40）**：战斗内持续回复，参数 30/50/70（Q1/Q2）。这是原作战斗内**唯一**的技力来源 [确认]（`docs/04b:377-383` 恢复栏、`project/61_策略与援军.md:100-102,150`、`project/130_军师技24条裁决.md:66-68`）。
2. **军师技「增加技力」（SEQUENCE 13/42/60 → Execute 18/19/20，地址 `0x44D9A2/0x44DA15/0x44DA88`）**：一次性同时提高**技力上限和当前值**（原作写 `+0x14` 与 `+0x16` 两个字段）。是「上限 +12/20/30」还是「上限的 25/40/60%」两处还原口径不一致（见 §4.6 附带发现）[待证]。
3. **升级**：`0x40F23C`（`work/dis_battle_stat_40F23C.txt` 全文）等级 +1 后按 `0x40A098` 重算**上限**，并保留「旧上限 − 公式值」的溢出；**它只重写 `g+0x10`/`g+0x14`（上限字段），不写 `g+0x12`/`g+0x16`（当前值）**。⇒ 原作升级**不是**「当前值回满」；我们的 `battle.ts:3686-3691` 把它实现成「按新上限补满当前值」是**偏宽松**的建模 [确认偏移]。
4. **战后**：结算 `0x41048D` 只做「快照 → 档案」回写并夹紧：`0x41070C mov ax,[edx+0x28]; 0x410710 mov [ecx+0x16],ax`（技力当前夹到战场剩余），**没有补满分支** [确认]。
5. **战场外（城内休息 / 每回合回复 / 战后自动回满）**：**没有找到证据** [待证]。检索覆盖：全部 `project/*.md`（「休養/休息/回满/恢复体力」关键词）、`work/dis_*.txt` 里对 `general+0x16` 的写入点、`dis_save_load.txt`、`dis_battle_settle_41048D.txt`、`dis_capture_448560_postbattle.txt`。目前只确认「战斗内不自动回」「战后不补满」「开战不回满（继承上场剩余）」。是否存在内政回合的缓慢恢复，需要再查内政/回合结算 dump 才能坐实；**不影响本任务的改动方向**。

**我们的现状对照**（`game/src/core`，只读核对）：
- 军师技管线**已经接好，不是「没实现」**：
  - 数据：`game/data/wises.json` 里 `SEQUENCE 12/41/58 = 恢復技力`、`Execute 38/39/40`、`ACTIVE 2`（战斗中持续）；
  - 战前生效：`game/src/core/wises_effects.ts:155-171` 的 `case 'hp_regen'/'mp_regen'` 写 `army.mpRegen = spec.value; army.flags |= 0x2;`（参数 30/50/70 与原作完全一致，见 `wises.ts:202-204`）；
  - 战中派发：`strategy.ts:789-790` 落 `army.mpRegen`；`battle.ts:2805 tickStrategy(world)` 在首次接战时派发；
  - 入口：`game/web/deploy.html:708-718` 出征页可选军师技 → `campaign.html:538,4700` 写成 `?wise=` → `main.js:539/677/743`（`strategy: cfg.wise || null` + `applyWise(world,'A',cfg.wise)`）。
- **默认什么都不回**：不带 `?wise=`（或不选军师技）时 `army.flags = 0`、`army.mpRegen = 0`，`strategyRegen()` 第一行 `if (!onHp && !onMp) return;` 直接返回。这就是用户看到的现象。
- 我们每场开战**满技力**（`battle.ts:1025 mp: mpMax`），原作是跨场持久、开战不回满（Q4）。

---

### Q4. 跨战斗持久性：原作持久、我们每场重置 [确认]

**原作 [确认]**：
- 技力当前/上限是**武将档案**字段：`general+0x14`=技力上限、`general+0x16`=技力当前（`+0x18`=BaseHP、`+0x1A`=BaseMP）。推导链：①`0x40A098(g)` 算的是上限（`docs/04b:231-235`），升级 `0x40F23C` 用 `[g+0x14] − 0x40A098(g)` 当溢出、再写回 `[g+0x14] = 公式 + 溢出` ⇒ `+0x14` 是上限；②`0x43E847` 把 `+0x16` 加到 `+0x14` 封顶 ⇒ `+0x16` 是当前；③扣技力的 `0x43BAE3` 扣的是 `+0x16`（`docs/04b:257-267`）；④结算 `0x41048D` 把 `unit+0x28`（战场当前快照）夹回 `g+0x16`。
- 存档字段：`docs/07b_武将数据结构.md:282-285` 的 gen→save 映射 `+0x30←+0x10, +0x32←+0x12, +0x34←+0x14, +0x36←+0x16`（偏移映射可信；**该文档的语义标签（谁当前谁上限）是反的**，以本报告为准）。
- 战场初始化：`0x43A1C4`（`work/dis_form_init_43A1C4.txt`）开战把 `g+0x10/+0x14/+0x12/+0x16` 复制进战场单位快照 —— **开战不重置、继承上场剩余**。
- 战后结算 `0x41048D` 回写剩余 ⇒ 跨战斗持久，需要靠军师技/升级才能回升 [确认]。

**我们的现状**：
- `battle.ts:1025 mp: mpMax` —— 每场开局满技力；
- `settle()`（`battle.ts:3549`）只改 `world.sides[*].general` 的内存对象，**不回写存档/名册**；`main.js:968 endBattle()` 战后只持久化疲劳/士气/招降等（`main.js:1072-1126`），没有 HP/MP 字段。
- ⇒ 我们是「每场满值」，比原作**宽松**；用户抱怨的「不回」不是持久性问题，而是**战斗内不回**。

---

### Q5. 我们的 `mpMax` 公式与 `MP_BASE` 是否与原作一致？——公式一致；`MP_BASE` 只是兜底 [确认]

原作 `0x40A098(g)`（`docs/04b_战斗系统.md:231-235`）：

```
mp = BaseMP(+0x1A) + (Level*2 * t) / 100
if (mp < BaseMP) mp = BaseMP
if (mp > 0x7FFF) mp = 0x7FFF
t = (STR > INT) ? (STR + INT) / 2 : INT
```

我们 `battle.ts:1251-1258 mpCapOf()`：

```ts
const t = s > i ? Math.trunc((s + i) / 2) : i;
const v = Math.trunc((Math.round(level) * 2 * t) / 100);
return Math.max(baseMp, Math.min(0x7fff, baseMp + v));
```

逐项一致（含 `STR > INT` 才取平均这个「怪处」）**[确认]**；`garrison.ts:462-477` 的同名公式也一致。
`battle.ts:272 MP_BASE = 60` 只是「无档案临时将/测试将」的兜底；`game/data/generals.json` 实际 401 个将都有 `BaseMP`，范围 34–99（平均 39.8，唯一 99 是异常值），所以真实主将上限基本 < 61（1 级），`+v` 随等级成长。
`project/09_战斗原型说明.md:153` 的旧口径「技力上限 = 60 + 智力/2」**已过时**（当时 BaseMP 未导出时用的代理公式），报告/文档应更新。

---

## 2. 复现：现在到底回不回、回多快（probe.mjs）

运行：

```
cd F:\sanguo
node work\jili\probe.mjs
```

脚本不依赖 UI/浏览器/模拟器，直接 `import` `game/src/core/battle.ts`（node v24 原生 TS 类型擦除）＋ `game/src/data.ts` 的 `loadData()`，并复刻 `game/tests/_engage.ts` 的接战夹具（`installArmyOrders` + 双方 `aiCommand(...,'advance')/'rush'`；**不下令双方永远不接战**，军师技永远不会派发）。

实跑输出（本次原样粘贴）：

```
=== ① 不带军师技（正常游玩路径：army.flags = 0） ===
开战：t=    0  A  61/61  B  61/61   (mpMax 公式 baseMp=60 str=80 int=60 level=1)
[事件] t=  300  A  31/61  B  31/61  ← 双方各扣 30 点（模拟放技）
      t=  600  A  31/61  B  31/61
      t= 1200  A  31/61  B  31/61
      t= 1800  A  31/61  B  31/61
      t= 2400  A  31/61  B  31/61
[观测] 扣技力后 2100 tick（35.0 s）A 主将技力变化 +0 ⇒ 0.000 点/秒

=== ② 带军师技「恢復技力」L1（a.strategy = 12） ===
开战：t=    0  A  61/61  B  61/61   (mpMax 公式 baseMp=60 str=80 int=60 level=1)
[事件] t=  300  A  31/61  B  31/61  ← 双方各扣 30 点（模拟放技）
      t=  600  A  33/61  B  31/61
      t= 1200  A  43/61  B  31/61
      t= 1800  A  53/61  B  31/61
      t= 2400  A  61/61  B  31/61
[观测] 扣技力后 2100 tick（35.0 s）A 主将技力变化 +30 ⇒ 0.857 点/秒

=== ③ 速率口径对比（军师技「恢復技力」L1，param=30，mpMax=61）===
原作 : 每 tick +30 累加，满 6000 回 1 点 ⇒ 0.30 点/秒（= 参数/100），与 mpMax 无关
现行 : 每 120 tick（2.0 s）回 2 点 ⇒ 1.00 点/秒，随 mpMax 线性放大
误差 : 现行 / 原作 = 3.3×
整场 : 战斗 198 s（原作 0x2E68=11880 帧@60Hz），原作 L1 最多回 59 点，现行最多回 198 点
常量 : MP_BASE = 60（game/src/core/battle.ts）
```

**结论**：
- 不带军师技：**0 恢复**（0.000 点/秒）——与用户描述完全一致，也与原作一致；
- 带「恢復技力」L1：**能回**，实测 0.857 点/秒——但**比原作（0.30 点/秒）快约 3.3 倍**，且是「每 2 秒 2 点」，原作是「每 3.33 秒 1 点」；
- 我方的偏差方向是**过强**，不是过弱。所以「技力不会恢复」的根因是**没有触发**（没带军师技 / 没走对入口），不是公式太弱。

---

## 3. 为什么用户觉得「技力不会恢复」

1. **原作没有基础回技力**：不开军师技时，技力整场不涨——这点我们现在的行为其实是忠实的。玩家的预期来自「气力会自动涨」（我方 `battle.ts` 的 `tickSkills` 每 tick 给 `g.qi += max(STR,INT)`，带集气档位），自然以为技力也该涨。**这是认知落差，需要在 UI/说明里讲清楚**。
2. **即使带了军师技，原作的回复也慢到肉眼几乎看不见**：L1 = 0.30 点/秒 ≈ 每 3.3 秒回 1 点，整场 198 秒最多 59 点；L3 也只有 0.70 点/秒。如果不做「+1」飘字/状态提示，玩家**仍然会觉得「没回」**。
3. **我们每场开战满技力**（Q4：原作是跨场持久、开战继承剩余），玩家通常只在长战斗里发现「放完技不回」，更容易误判。
4. **入口问题**：正常战役要在出征页选军师技（`deploy.html:708-718` → `?wise=` → `main.js:743 applyWise`），不选/没有军师时一次都不回；probe ② 证明只要 `strategy: 12` 就会回。**如果用户说「我选了也没回」，那是接线 bug（需现场复验），而不是公式问题。**
5. 我们带技时回得比原作快 3.3 倍——所以「回不动」绝不是速率问题。

---

## 4. 改动方案

> 本轮**不改 `game/**`**，以下是给 lead 的落地清单。改动集中在 `battle.ts::strategyRegen()` 一个函数 + 两个字段/常量 + 注释与测试。Cocos 不需要单独改（core 单源）。

### 4.1 必改：把 `strategyRegen()` 换回原作的「定额累加 + 阈值」[对应 Q2]

**位置**：`game/src/core/battle.ts:3372-3390`（当前实现），调用点 `battle.ts:3352` 不动。
**替换成**（可直接用）：

```ts
/**
 * 原作 `0x43E847(army)`（`work/dis_battle_units.txt` 地址 0x43E84A–0x43E963，唯一调用点
 * `0x43E9E5`，而 0x43E964 由 Process 4 的 OM_TICK(msg=2) 每帧调用）：
 *   - `army+0x84` bit0=体力恢复 / bit1=技力恢复（只有军师技「體力/技力自動恢復」会置位）；
 *   - 每帧 `army+0x8c += army+0x88`（参数 40/60/80 或 30/50/70）；
 *   - `army+0x8c > 0x1770(6000)` ⇒ `-= 6000`、对应当前值 +1、夹到上限；
 *   - bit0 成立时直接返回，技力分支整段不走（体力优先）。
 */
function strategyRegen(world: World, side: Side): void {
  const army = world.army?.[side];
  if (!army) return;
  const g = world.sides[side].general;
  if (!g.alive) return;
  // bit0 优先：原作 0x43E857 在体力分支末尾 `jmp 0x43E960`，技力分支被整段跳过
  if ((army.flags & ARMY_FLAG.hpRegen) !== 0) {
    if (army.hpRegen <= 0) return;
    army.hpRegenAcc = (army.hpRegenAcc ?? 0) + army.hpRegen;
    if (army.hpRegenAcc > REGEN_ACC_MAX) {
      army.hpRegenAcc -= REGEN_ACC_MAX;
      g.hp = Math.min(g.maxHp, g.hp + 1);
    }
    return;
  }
  if ((army.flags & ARMY_FLAG.mpRegen) !== 0) {
    if (army.mpRegen <= 0) return;
    army.mpRegenAcc = (army.mpRegenAcc ?? 0) + army.mpRegen;
    if (army.mpRegenAcc > REGEN_ACC_MAX) {
      army.mpRegenAcc -= REGEN_ACC_MAX;
      g.mp = Math.min(g.mpMax, g.mp + 1);
    }
  }
}
```

**配套字段/常量**：

- `game/src/core/strategy.ts:435` 附近：
  ```ts
  /**
   * 原作 `0x43E847` 的累加阈值：`army+0x8c` 越过 `0x1770`=6000 回 1 点。
   * 速率 = 参数/100 点/秒（60Hz）：30→0.30、50→0.50、70→0.70（技力）；
   * 40→0.40、60→0.60、80→0.80（体力）。
   */
  export const REGEN_ACC_MAX = 0x1770;
  ```
  原来的 `export const REGEN_PERIOD_TICKS = 120;`（`strategy.ts:435`）在本改动后不再被 `strategyRegen` 使用。建议**保留导出但标注「已废弃，仅测试引用」**，或者删掉并同步改 `game/tests/tick60.test.ts:105-106`（`assert.equal(REGEN_PERIOD_TICKS,120)` / `near(sec(...),2)`）为对 `REGEN_ACC_MAX` 的断言。
- `game/src/core/strategy.ts:105-125` 的 `ArmyStatus`：新增**可选**字段，避免动 `emptyArmyStatus()` 的对象形状（该文件 `:164` 注释明确说「没带技的 army 对象形状不变」）：
  ```ts
  /** 原作 `army+0x8c`：恢复累加器（越过 REGEN_ACC_MAX 回 1 点） */
  hpRegenAcc?: number;
  mpRegenAcc?: number;
  ```
  （`emptyArmyStatus()` 不用改，`?? 0` 兜底即可；如果 lead 更偏好显式初始化，也可在 `emptyArmyStatus()` 加 `hpRegenAcc: 0, mpRegenAcc: 0`，二者等价。）
- `battle.ts:36` 的 import 列表里若有 `REGEN_PERIOD_TICKS`，按上面选择删除或保留。

### 4.2 默认值

- `army.mpRegen`/`hpRegen` 默认 **0**，不新增任何基础回复——这是忠实口径 [确认]。
- **不要在 `ARMY_FLAG` 里新增「被动回技力」位**：原作 bit1 语义就是「军师技『技力自動恢復』」，`wises_effects.ts:155-171`、`strategy.ts:789-790`、`wisesFingerprint`（`wises.ts:360-390` 读 `army.flags`）都已按这个语义接线，加位会污染指纹/测试假设。
- 如果产品一定要给「没带军师技也有微量回复」的体验兜底（**属于偏离原作**），建议做成 `createWorld` 的独立参数，而不是 flag：
  ```ts
  // battle.ts CreateOptions 附近
  /** 偏离原作：无军师技时的基础回技力（tick 累加值，0 = 忠实；30 ≈ 0.30 点/秒） */
  passiveMpRegen?: number;
  ```
  在 `strategyRegen()` 里对「没有任何 flags」的 army 也走同一累加（`army.mpRegenAcc += opts.passiveMpRegen`），并给 `main.js` 加 `?mpregen=<n>` 调试参数 + 文档标注「偏离原作」。**默认值必须 0**，否则战役平衡会被悄悄改掉。

### 4.3 同步要改的注释/文档（都是错的或过期的）

| 位置 | 现状 | 改成 |
|---|---|---|
| `battle.ts:3363-3371`（`strategyRegen` 上方注释） | 「消费点未定位」「每 REGEN_PERIOD_TICKS（60 帧=2 秒）」「幅度大于原作」「[推測]」 | 引用 `0x43E847`/`0x43E964`/OM_TICK，写清「每帧累加 `+0x88`，越过 6000 回 1 点＝参数/100 点/秒」；删掉「未定位」，`REGEN_PERIOD_TICKS` 注释同步 |
| `wises_effects.ts:155-171` 注释 | 「`battle.ts:2107-2118` 的 `strategyRegen()` 每 60 tick 按百分比回復」 | 行号已漂移、周期已改为逐帧定额，指向新公式 |
| `strategy.ts:122-125` 字段注释 | 「每 REGEN_PERIOD_TICKS 回 maxHp × hpRegen / 1000」 | 改为定额累加语义 |
| `project/09_战斗原型说明.md:153` | 「技力上限 = 60 + 智力/2」 | 上限公式已还原为 `BaseMP + Level*2*t/100`（Q5），不自动回复那条保留但补「军师技恢復技力」 |
| `project/61_策略与援军.md:293` | 「+0x8C 的消费点未定位」「节奏幅度是我给的」 | 已定位：`0x43E847`，速率=参数/100 点/秒 |
| `project/52_武将技与军师技.md:159`、`project/26_军师技系统.md:19` | 「恢復技力 → mp +24/40/60」（瞬时） | 12/41/58 是**战斗中持续回复**；13/42/60 才是加技力（瞬发，同时加上限+当前） |

### 4.4 测试

- 新增 `game/tests/jili_regen.test.ts`（或并入 `tick60.test.ts`），至少锁 4 条：
  1. **忠实性**：不带任何军师技，跑 2000 tick 后 `mp` 不变（防止有人偷偷加基础回复）；
  2. **速率**：`a.strategy = 12`（参数 30），从 `mp=0` 起跑，第一次回 1 点发生在第 201 tick（累加 `>6000` 首次）、之后每 200 tick +1（允许 ±1 tick 的余数相位）；
  3. **上限**：`mp` 不超过 `mpMax`；
  4. **体力优先**：同时置 bit0/bit1 时只有 `hp` 增长、`mp` 不动（原作 `jmp 0x43E960` 语义）。
- `game/tests/tick60.test.ts:105-106`：若删 `REGEN_PERIOD_TICKS` 必须同步改（否则测试挂）。
- `node --test game/tests/*.test.ts`（在 `game/` 下跑；注意脚本 `test: node --test tests/*.test.ts`）。

### 4.5 Cocos 侧

**不需要单独处理**：`game/cocos/assets/scripts/BattleRoot.ts:376/387` 已经把 `launch?.wise`/`launch?.bwise` 作为 `strategy` 传给 `createWorld`，`applyWise`/`strategyRegen` 全在 `src/core` 单源。只要 core 改完，Cocos 重新构建/热更新即可（本轮不跑构建）。若 `BattleRoot` 有 HUD 文案写「每 X 秒回 Y」需要跟着改（目前没查到这样的文案）。

### 4.6 附带发现（不属本任务，但改动时会看到）

1. **同一件事两套口径**：`wises.ts:13/42/60`（增加技力）战前走 `mp_max` **定额 +12/20/30**、同时加当前值（`wises.ts:404-407`）；而 `strategy.ts:524-527`（战中派发 Execute 18/19/20）走 `trunc(mpMax * 25/40/60 / 100)` **百分比**。原作 `0x44D9A2/0x44DA15/0x44DA88` 到底是定额还是百分比 **[待证]**，建议另开任务统一。
2. `battle.ts:3686-3691` 的升级处理（`ovMp = mp - mpMax` 后按新上限补满）与原作「只重算上限、不补当前值」不同（Q3-3）[确认偏移]，比原作宽松，可另案处理。

### 4.7 可选但推荐：让「回复」看得见

原作速率太慢（0.3–0.7 点/秒），即使改对，玩家仍可能觉得「没回」。建议战斗 HUD 给军师技生效侧加一个小图标/状态条（例：主将血条旁「技↑」＋每回 1 点飘字，或复用 `wises_effects` 的日志「XX：技力自動恢復」）。这是**感知修复**，不改数值。

---

## 5. 验收清单（lead 改完后逐条跑）

1. `node work\jili\probe.mjs`：期望 ① 恒 0.000 点/秒；② `a.strategy=12` 时 ≈ **0.30 点/秒**（每 3.33 s 回 1 点，t=2400 时应从 31 回到 31+floor(2100/200)=41 左右，而不是现在的 61 封顶）。
2. `cd game; node --test tests/*.test.ts`：新增的 `jili_regen` 4 条 + 既有 `tick60` 全绿。
3. `cd game; npx tsc --noEmit`：类型通过（注意可选字段）。
4. 实机：出征页选「恢復技力」开战，`?wise=12` 直开也验证一次；不带军师技验证恒不回。若玩家报告「选了也不回」，优先查 `main.js:677/743` 到 `wises_effects.ts:155-171` 的接线（当前看已接通），而不是公式。

---

## 6. 证据索引（方便复查）

| 事项 | 证据位置 |
|---|---|
| 恢复函数本体（累加器/6000/回 1 点/夹上限/体力优先） | `work/dis_battle_units.txt:5984-6059`，地址 `0x43E84A`–`0x43E963`（`0x43E847`） |
| 每帧调用（OM_TICK→0x43E964→0x43E847） | `work/dis_battle_units.txt` 0x43E9E5；`work/dis_duel_43EF64.txt`/`work/dis_dmg_p04_forceMajor.txt` `0x43EFC1`；`docs/04b4_普攻伤害与Process.md:36,103-122` |
| `army+0x84` 全部写入点（bit1 只来自军师技） | `work/dis_battle_B_44D450.txt:750…1324`（`0x44DE15`–`0x44E699`）、`dis_dmg_ctor_4218E0.txt:60`、`dis_save_load.txt:112`、`dis_battle_gen_442B08.txt:104` |
| 军师技写入字节（参数 40/60/80、30/50/70、累加器清零） | `work/dis_battle_B_44D450.txt:769-858`，`0x44DE5A/0x44DE9F/0x44DEE4/0x44DF29/0x44DF6E/0x44DFB3` |
| 帧率 60Hz / 整场 11880 帧 / 198 s | `project/192_引擎节拍60Hz.md`（`0x4AC35C`、`0x444126`） |
| 技力上限公式 `0x40A098` | `docs/04b_战斗系统.md:231-235`；我们 `battle.ts:1251-1258` |
| 扣技力 `0x43BAE3`（扣当前 `+0x16`） | `docs/04b_战斗系统.md:257-267`，dump `work/dis_battle_magic_43BAE3.txt` |
| 跨场持久：战前复制/战后回写 | `work/dis_form_init_43A1C4.txt`（0x43A1C4）；`work/dis_battle_settle_41048D.txt` `0x4106B4`–`0x410832`；存档映射 `docs/07b:282-285`（语义标签反了） |
| 升级重算上限 `0x40F23C` | `work/dis_battle_stat_40F23C.txt` 全文；`docs/04b:558-575` |
| 资源恢复口径表（技力只写军师技） | `docs/04b_战斗系统.md:377-383` |
| 我方实现 | `battle.ts:272,1015,1025,1251-1258,2805,3352,3372-3390,3549,3686-3691`；`strategy.ts:105-125,169-188,290-292,435,525,576-583,789-790`；`wises.ts:202-204`；`wises_effects.ts:155-171`；`main.js:539,677,743`；`deploy.html:708-718`；`campaign.html:538,4700` |

---

## 7. 未解决的问题（[待证]，不影响本次改动）

1. **战场外是否有技力回补**（内政/回合/城内休息）：未在现有 dump 找到；可能需要查内政回合结算 dump 才能坐实「原作是否只能靠军师技/升级回升」。
2. **「增加技力」（Execute 18/19/20）是定额还是百分比**：我们两处实现不一致（§4.6）。
3. 主将单位死亡/离场后 OM_TICK 何时停止（推测：对象移除后即停，恢复随之停止），未逐行核。
