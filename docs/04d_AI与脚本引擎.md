# 三国群英传2 电脑 AI 与 Smart Script 脚本引擎（逆向）

> 对象：`Sango2.exe`（682,496 B，PE32/MSVC6，ImageBase `0x400000`）+ `F:\sanguo\extract\pak\SCRIPT\MAGIC.SO`、`SYSTEM.SO`
> 证据约定：`VA=0x...`、文件偏移、引用字符串（cp950 繁中）、INI 行号。凡未能证实的写「未定位」。
> 工具：`F:\sanguo\tools\dis_range.py`、`xref_call.py`（真正的 call 图工具）、`xref_addr.py`、`jumptables.py`、`fieldmap.py`。

---

# 第一部分：电脑 AI

## 1.1 `-AIOFF` 开关 → 全局位掩码 `0x4A79C8`

命令行解析器 **`0x40B46E`（1786 B）**，用 `0x47DB60`（strcmp 类）逐参数比较后**只置位一个全局 dword**：

```
0x40B792: push "-MAPMODE"  … or  al, 8  ; [0x4A79C8] |= 0x08
0x40B7D0: push "-AIOFF"    … or  edx,0x10; [0x4A79C8] |= 0x10    ← AI 总开关
0x40B811: push "-INFO"     …                                （分析：其余参数同样置位）
```

反汇编事实（`0x40B7EF`）：

```
mov edx, dword ptr [0x4A79C8]
or  edx, 0x10
mov dword ptr [0x4A79C8], edx
```

**结论**：`0x4A79C8` 是**命令行/调试开关的位掩码**；`bit4 (0x10)` = AI 关闭。已知其他位：
- `bit1 (0x02)`：抑制「`%s等級升為第%d級`」提示（`0x40F432: mov eax,[0x4A79C8] / and eax,2 / test`）
- `bit3 (0x08)`：`-MAPMODE`
- `0x40B46E` 同函数还处理 `-VER`/`-AUTO`/`-AUTODEMO`/`-ONCE`/`-BATTLE`/`-SPEED`/`-INFO`（字符串见 funcmap.tsv 该行）

其余位对应的具体判定点**未定位**（`0x4A79C8` 在 .text 有 60+ 处引用，大部分是反汇编错位噪声）。

## 1.2 AI 总入口链（自外向内）

```
0x40D751 (239 B)  AI 势力回合  ← 每个 AI 势力调一次
   ├─ 0x401910(king)                  ; 势力级预处理（未定位具体内容）
   └─ if (0x401B84(king) == 1) {      ; 「该势力本月可以行动」判定
          0x40BE20();                 ; 清空 AI 行动候选表 ([0x4C39A0]=0)
          0x40CBB6(king);             ; ① 遍历该势力所有城池，产生候选行动
          idx = 0x40CC10();           ; ② 从候选里选 Rate 最大的一条
          if (idx != -1 && idx != [0x4C39A0])
              0x40D52F(king, idx);    ; ③ 执行该行动
      }
```

反汇编证据（`0x40D7E0`–`0x40D83A`）：

```
0x40D7E4 call 0x401910
0x40D7F0 call 0x401B84 ; cmp eax,1 / jne 结束
0x40D7FD call 0x40BE20            ; [0x4C39A0] = 0
0x40D806 call 0x40CBB6
0x40D80E call 0x40CC10            ; → [ebp-0x10]
0x40D816 cmp [ebp-0x10], -1 / je 结束
0x40D81F cmp ecx, [0x4C39A0] / je 结束    ; 与候选数相等 = 没有行动
0x40D82F call 0x40D52F
```

**注意"每势力每月只做一个动作"**：候选表可能有多条，但只执行 `Rate` 最大的一条（见 1.5）。

## 1.3 逐城扫描：`0x40CBB6`（90 B）

```
0x40CBB6(king) {
    city = king->[+0x338];              // 势力城池链头
    while (city) {
        0x40BFCE(city);                 // 模块 A（内政/开发类，见 1.6）
        0x40C1E4(city);                 // 模块 B（征兵/兵力类，见 1.6）
        0x40CAF1(city);                 // 模块 C：攻城/联合（见 1.4）
        0x40C34D(city);                 // 模块 D（移动武将/补给类，见 1.6）
        city = city->[+0xA2];           // 同势力下一城
    }
}
```

反汇编：`0x40CBBF: mov ecx,[eax+0x338]`、`0x40CC01: mov ecx,[eax+0xa2]`、四个 `call` 顺序 `0x40BFCE → 0x40C1E4 → 0x40CAF1 → 0x40C34D`。

## 1.4 攻城/联合策划：`0x40CAF1`（197 B）+ `0x40C635`（1212 B）

### `0x40CAF1(city)`：先看自家武将，再看 9 个邻城

```
0x40CAF1(city) {
    if (city->[+0x3C] == 0) return 0;              // 空城/无守将，跳过
    // ① 城内每个在职武将做一次"个人行动"
    for (g = city->[+0x24]; g; g = g->[+0xE3]) {    // 城内武将链
        if (g->[+0x91] & 1)                         // STATUS==1 登用（在职）
            total += 0x40C47C(g);                   // 武将个人行动（未定位细节）
    }
    // ② 对每个"可通行邻城"
    for (i = 0; i < 9; i++) {
        n = 0x4054B9(city, i);                     // 第 i 个可通行邻城
        if (!n) break;
        if (n->[+0x10] == city->[+0x10]) continue; // 同势力，跳过
        0x40C635(city->[+0x10], city, n);          // 发起"攻打/联合"候选
    }
}
```

证据：`0x40CAF7: cmp dword ptr [eax+0x3c],0`、`0x40CB11: mov edx,[ecx+0x24]`、`0x40CB20: mov ecx,[eax+0x91] / and ecx,1`、`0x40CB44: mov eax,[edx+0xe3]`、`0x40CB6F: call 0x4054B9`、`0x40CB86: mov eax,[ecx+0x10] / cmp eax,[edx+0x10]`、`0x40CB9D: call 0x40C635`。
`0x4054B9` 的语义见 `04c_世界与内政.md` §5.2（9 槽邻接表 `city+0x46`，`FLAGS==1` 的关卡被跳过）。

### `0x40C635(kingId, srcCity, dstCity)`：出兵数计算 + 评分

签名（`[ebp+8]=kingId`、`[ebp+0xc]=srcCity`、`[ebp+0x10]=dstCity`）。
关键常量与分支（反汇编逐条还原）：

```
0x40C643: if (!0x409E8F(srcCity, dstCity)) {          // 邻接/可达性谓词
0x40C657:     if (!0x409E8F(srcCity, srcCity)) return 0;
0x40C66F:     if (0x450117(0x80)) return 0; }          // rand(128)!=0 → 放弃（概率门）
limit = 0x40C511(dstCity);                             // 目标城"可投入兵力上限"
0x405989(dstCity);                                     // 目标城兵力量化

if (dstCity->[+0x14] != 0) {                           // 目标城有太守 → 硬攻
    n = dstCity->[+0x30] + rand(3) + 1;                // 城内兵数 + 1..3
    n = min(n, limit);
    n = min(n, 5);                                     // 单次出兵上限 5 单位
    n = min(n, srcCity->[+0x30] - 1);                  // 自家留 1
} else {                                               // 空城 → 少量占领
    n = rand(2) + 1;
    n = min(n, limit); n = min(n, 5); n = min(n, srcCity->[+0x30] - 1);
}
if (n == 0) return 0;

// —— 评分（Rate）——
if (dstCity->[+0x10] == [0x4A64F0])                    // 目标是"玩家势力"的城
     0x40BE2F(4 /*攻擊player*/, srcCity, dstCity, 0, n, 0, 200);      // Rate=0xC8=200
else if (dstCity->[+0x10] == 0)                        // 空城
     0x40BE2F(8 /*佔領空城*/, srcCity, dstCity, 0, n, 0, 80/(dstCity->[+0x38]+1));
else                                                   // 其他 AI 的城
     0x40BE2F(5 /*攻擊ai*/, srcCity, dstCity, 0, n, 0, 100);          // Rate=0x64=100
```

**Rate 常量表（硬证据，`0x40C635` 内立即数）**：

| 情形 | ACT | Rate | 指令证据 |
|---|---|---|---|
| 攻打**玩家**的城 | 4 `攻擊player` | **200** (`0xC8`) | `0x40C7BB: push 0xc8` |
| 攻打**其他 AI** 的城 | 5 `攻擊ai` | **100** (`0x64`) | `0x40C813: push 0x64` |
| 占领**空城** | 8 `佔領空城` | **80/(距离+1)** (`0x50`) | `0x40C7EE: mov eax,0x50 / idiv (srcCity->[0x38]+1)` |
| **联合**攻打玩家城 | 7 `聯合` | **200** | `0x40C8CC..0x40C8D4` 分支里 `push 0x32` 的是 AI 版；玩家版在 `0x40CA88: push 0xc8` |
| 联合攻打 AI 城 | 7 `聯合` | **50** (`0x32`) | `0x40C8C2: push 0x32`、`0x40CAAD: push 0x32` |

**联合分支（`0x40C8EC` 起）**：`for (i = 0; i < 9; i++)` 遍历 `0x4054B9(dstCity, i)`（目标城的邻城），
若 `neighbor->[+0x10] == 本势力 kingId` 且 `neighbor != srcCity` 且 `limit + 0x40C511(neighbor) >= 需要兵力`，
则把两城的兵力对半分（`half = 需要/2`、依次 `min(..,5)`）作为联合部队，记一条 ACT=7 的候选。

## 1.5 选择最优行动：`0x40CC10`（137 B）——评分最大 + 哨兵 800

```
0x40CC10() {
    n = [0x4C39A0];                       // 候选条数（≤ 0x40）
    for (i = 0; i < n; i++)
        rate[i] = [0x4C32A0 + i*0x1C + 0x18];   // 每条候选的 Rate
    rate[n] = 0x320;                      // ★ 哨兵 800，比任何真实 Rate 都大
    return 0x468740(rate, n + 1);         // 返回最大值下标（未定位其内部，但语义由上句确定）
}
```

证据：`0x40CC66: mov dword ptr [ebp+edx*4-0x104], 0x320`、`0x40CC81: call 0x468740`。
调用方 `0x40D81F: cmp ecx,[0x4C39A0] / je 结束` ⇒ **返回 `n` 即"没有可执行行动"**。

**这就是"打谁"的全部决策逻辑**：把所有候选按 Rate 排序取最大，用户可据此判断 AI 行为优先级：
`攻打玩家(200) > 联合打玩家(200) > 攻打AI(100) > 占领空城(≤80) > 联合打AI(50)`。

## 1.6 AI 行动记录（环形表）与调试输出

| 项 | 值 | 证据 |
|---|---|---|
| 候选条数 | `0x4C39A0`（上限 **0x40 = 64**） | `0x40BE32: cmp dword ptr [0x4c39a0],0x40` |
| 候选表基址 | `0x4C32A0`，**stride 0x1C (28 B)** | `0x40BE44: imul eax,eax,0x1c` |
| 记录布局 | `+0x00` ACT 类型、`+0x04` 源城 ptr、`+0x08` 目标城 ptr、`+0x0C` 参数1、`+0x10` 参数2（出兵数）、`+0x14` 参数3、`+0x18` **Rate** | `0x40BE2F` 顺序写 7 个 dword |
| 写入函数 | `0x40BE2F(act, c1, c2, a, b, c, rate)`（7 参数 cdecl） | 同上 |
| 清空 | `0x40BE20`：`[0x4C39A0] = 0` | `0x40BE23` |

### ACT 行动类型表（`0x487248`，9 项，cp950）

| ACT | 字符串 | VA | 含义 |
|---|---|---|---|
| 0 | `不明` | `0x48726C` | 未知/占位 |
| 1 | `補金` | `0x487274` | 补充金钱（内政） |
| 2 | `逃跑` | `0x48727C` | 撤退/避战 |
| 3 | `移動武將` | `0x487284` | 武将调城 |
| 4 | `攻擊player` | `0x487290` | 攻击玩家的城 |
| 5 | `攻擊ai` | `0x48729C` | 攻击其他 AI 的城 |
| 6 | `cheat` | `0x4872A4` | 作弊/特殊（仅调试） |
| 7 | `聯合` | `0x4872AC` | 多城联合出兵 |
| 8 | `佔領空城` | `0x4872B4` | 占领无主城 |

### 调试输出 `0x40BECB`（259 B）

```
printf(0x4872C0);                 // 头："君主:%s"
for (i = 0; i < [0x4C39A0]; i++) {
    rec = 0x4C32A0 + i*0x1C;
    printf(0x4872CC,  ACT名表[rec->act],  rec->src->name(+0x04), rec->src->[+0x30],
                      rec->dst->name(+0x04), rec->dst->[+0x30], rec->+0x10, rec->+0x18);
    if (rec->act == 7) printf(0x4872FC, rec->+0x0C 城名, 兵数);
}
```

格式串（cp950）：
`0x4872CC "ACT=%s, 從%s%d人 -> %s%d人, 出兵%d人，Rate=%d"`（xref `0x40BF70`）
`0x4872FC "聯合%s%d人,出兵%d人"`（xref `0x40BFB9`）
⇒ **只要让游戏跑到 AI 阶段并开启这条调试输出，就能直接看到 AI 的每个决策与评分**（这是本文档最有实用价值的验证手段）。

## 1.7 AI 伪代码（整体）

```c
void AI_Turn(King *k)                                   // 0x40D751
{
    PreProcess(k);                                      // 0x401910
    if (!CanActThisMonth(k)) return;                     // 0x401B84
    ClearCandidates();                                   // 0x40BE20 → [0x4C39A0]=0

    for (City *c = k->firstCity /*+0x338*/; c; c = c->nextOfKing /*+0xA2*/) {
        PlanDomestic(c);        // 0x40BFCE  内政/开发 → ACT 1 補金、6 cheat 等
        PlanRecruit(c);         // 0x40C1E4  征兵/兵力
        PlanAttack(c);          // 0x40CAF1  攻城/联合
        PlanMoveGeneral(c);     // 0x40C34D  调将/运输
    }

    int best = ArgMaxRate();                             // 0x40CC10（哨兵 800）
    if (best >= 0 && best < [0x4C39A0])
        ExecuteAction(k, best);                          // 0x40D52F
}

void PlanAttack(City *c)                                 // 0x40CAF1
{
    if (c->troopsFlag /*+0x3c*/ == 0) return;
    for (General *g = c->gens /*+0x24*/; g; g = g->nextInCity /*+0xE3*/)
        if (g->status /*+0x91*/ & 1) PersonalAction(g);   // 0x40C47C
    for (int i = 0; i < 9; i++) {
        City *n = Neighbor(c, i);                        // 0x4054B9（跳过 FLAGS==1 关卡）
        if (!n) break;
        if (n->king /*+0x10*/ == c->king) continue;
        PlanStrike(c->king, c, n);                        // 0x40C635
    }
}

int PlanStrike(int kingId, City *src, City *dst)          // 0x40C635
{
    if (!Reachable(src, dst)) {                          // 0x409E8F
        if (!Reachable(src, src)) return 0;
        if (rand() % 128) return 0;                      // 0x450117(0x80)
    }
    int limit = TroopLimit(dst);                          // 0x40C511
    int n = (dst->major /*+0x14*/) ? dst->troops /*+0x30*/ + rand()%3 + 1
                                   : rand()%2 + 1;
    n = min(n, limit); n = min(n, 5); n = min(n, src->troops - 1);
    if (n <= 0) return 0;

    if (dst->king == PLAYER_KING /*0x4A64F0*/)
        PushCandidate(ACT_ATTACK_PLAYER, src, dst, n, 200);
    else if (dst->king == 0)
        PushCandidate(ACT_TAKE_EMPTY, src, dst, n, 80 / (dst->dist /*+0x38*/ + 1));
    else
        PushCandidate(ACT_ATTACK_AI, src, dst, n, 100);

    // 联合：目标城的邻城里找同势力城，兵力够就对半分兵
    for (int i = 0; i < 9; i++) {
        City *nb = Neighbor(dst, i);
        if (!nb) break;
        if (nb->king != kingId || nb == src) continue;
        if (limit + TroopLimit(nb) < needed) continue;
        PushCandidate(ACT_JOINT, src, dst, nb, half(n), dst->king == PLAYER_KING ? 200 : 50);
    }
    return 1;
}
```

## 1.8 未定位（AI 部分）

1. `0x401910` / `0x401B84`（势力预处理 / 本月可否行动）的内部条件。
2. `0x40BFCE`（393 B）、`0x40C1E4`（361 B）、`0x40C34D`（303 B）三个 per-city 规划器的具体评分表（它们也 push 候选，但 Rate 常量未逐条读）。
3. `0x40C47C`（149 B，武将个人行动）——被 5 处调用。
4. `0x409E8F(a,b)` 邻接谓词的具体实现（只有 `0x40C635` 两处调用）。
5. `0x40C511(city)` "可投入兵力上限"的公式。
6. `0x468740(arr,n)` 的内部实现（按调用约定应为"返回最大元素下标"）。
7. `0x4A79C8` 其余位的语义（除 bit1/bit3/bit4）。
8. AI 的"招谁/开发什么"评分：ACT 表里有 `補金`/`移動武將`，但对应规划器未逆完。

---

# 第二部分：Smart Script 引擎

## 2.1 文件头（`SCRIPT\MAGIC.SO`，261,008 B = 0x3FB90）

| 偏移 | 值 | 含义（已用算术闭合验证） |
|---|---|---|
| `+0x00` | `"Smart Script"` | 魔数（ASCII，无 `\0` 结尾） |
| `+0x10` | `0x00000100` | 版本 1.00 |
| `+0x14` | `0x00000040` | **段0（代码+字符串）起点** |
| `+0x18` | `0x0003D548` | **段1（函数目录）起点** |
| `+0x1C` | `0x000001CF` = 463 | **函数目录条数** |
| `+0x20` | `0x0003F238` | **段2（符号名表）起点** |
| `+0x24` | `0x00000244` = 580 | **符号条数** |
| `+0x28` | `0x00000079` = 121 | 未定位（候选：全局变量数/常量池数） |
| `+0x2C` | `0x0003FB48` | **段3（版权串）起点** |
| `+0x30..0x3F` | 4 × `0xFFFFFFFF` | 保留 |

算术闭合：
- 段1 = `0x3F238 − 0x3D548 = 0x1CF0 = 463 × 16` ✔（463 条 × 16 B 记录）
- 段2 = `0x3FB48 − 0x3F238 = 0x910 = 580 × 4` ✔（580 个 dword 名字指针）
- 段3 = `0x3FB90 − 0x3FB48 = 0x48 = 72` B = 版权串：
  `"Script Object Creator: Henryshow\0\0\0\0Pseudo Compiler Author: Allen Zhou\0\0"`
  ⇒ **脚本系统由 Henryshow 设计、Allen Zhou 写的"伪编译器"**（1999 年第三方脚本方案）。
- 段0 = `0x40 .. 0x3D548`（250,632 B），**代码与字符串混排**，字符串区从约 `0x3B6A0` 开始。

`SYSTEM.SO` 21,420 B 同格式（另一套函数库）。

## 2.2 段1：函数目录（463 条 × 16 B）

记录 `{u32 code_offset, u32 argcount, u32 name_offset, u32 0}`：

| # | code_offset | argcount | name_offset | 名字 |
|---|---|---|---|---|
| 0 | `0x0040` | 1 | `0x3B6A0` | `GetByte_Old` |
| 1 | `0x00AC` | 1 | `0x3B6AC` | `GetByte_Signed_Old` |
| 2 | `0x0114` | 1 | `0x3B6C0` | `GetShort_Old` |
| 3 | `0x0238` | 1 | `0x3B6D0` | `GetShort_Signed_Old` |
| 4 | `0x02A0` | 1 | `0x3B6E4` | `GetInt_Old` |
| 5 | `0x041C` | **2** | `0x3B6F0` | `SetInt_Old` |
| … | … | … | … | … |
| 462 | `0x3B688` | 0 | — | `Magic200` |

**`argcount` 字段已证**（`SetInt_Old` 2 参数 = 读+写语义）。
`argcount` 分布（完整统计，463 条）：

| argc | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 条数 | 137 | 71 | 123 | 52 | 36 | 29 | 9 | 4 | 1 | 1 |

（完整表已导出：`F:\sanguo\work\magic_so_funcatalog.txt`，格式 `序号<TAB>code_offset<TAB>argc<TAB>名字`）

## 2.3 段2：符号名表（580 条）= **SYSCALL 编号表**

580 个 dword 全部指向 `+0x3B6A0 .. +0x3D53C` 的 ASCII 名字。
**关键结论：`SYSCALL n` 的 n 就是这张表的下标。**

| 下标 | 名字 | 说明 |
|---|---|---|
| 0..8 | `GetByte_Old` / `GetByte_Signed_Old` / `GetShort_Old` / `GetShort_Signed_Old` / `GetInt_Old` / `SetInt_Old` / `SetShort_Old` / `SetByte_Old` / `SetString_Old` | **内存读写原语**（按字节/字/双字/字符串，带符号版） |
| 281 = **0x119** | `TraceOnFire` | 火焰追踪回调（火系武将技用） |
| 468 = 0x1D4 | `InitializeBattle` | 战斗初始化 |
| **469 = 0x1D5** | **`Magic1`** | **武将技 1 = 命疗术** |
| 470..578 | `Magic2` .. `Magic110` | 武将技 2..110 |
| **531..537 = 0x213..0x219** | **`Magic63` .. `Magic69`** | ★ 任务书所说「SYSCALL 0x213-219」实为**武将技 63..69 的效果函数**，不是"读内存" |
| 579 = 0x243 | `Magic200` | 特殊技 200 |

⇒ **武将技 N 的脚本入口 = `SYSCALL (468 + N)`**，即 `0x1D4 + N`。
`命疗术`（武将技 1）→ `SYSCALL 0x1D5`（下标 469 = `Magic1`）。
任务书提到的 `SYSCALL 0x119`（281 = `TraceOnFire`）确实存在，但它属于火系技的回调，与"召唤伏兵"无关；**"0x119 召唤伏兵"未得到证据支持**（伏兵相关名字未在符号表中出现）。

## 2.4 内置函数表（前 60 条，含参数个数）

这是脚本可调用的**引擎 API**（`序号 = SYSCALL 编号`，第二列 `code_offset` 是它在 MAGIC.SO 段0 内的实现偏移）：

| # | argc | 名字 | 语义（据名字 + 参数个数） |
|---|---|---|---|
| 0 | 1 | `GetByte_Old` | 读 1 字节 |
| 1 | 1 | `GetByte_Signed_Old` | 读 1 字节（有符号） |
| 2 | 1 | `GetShort_Old` | 读 2 字节 |
| 3 | 1 | `GetShort_Signed_Old` | 读 2 字节（有符号） |
| 4 | 1 | `GetInt_Old` | 读 4 字节 |
| 5 | 2 | `SetInt_Old` | 写 4 字节 |
| 6 | 2 | `SetShort_Old` | 写 2 字节 |
| 7 | 2 | `SetByte_Old` | 写 1 字节 |
| 8 | 2 | `SetString_Old` | 写字符串 |
| 9 | 3 | `DelayAmbientSound` | 延迟环境音 |
| 10 | 1 | `GetSoldierMaxX2` | 取士兵最大 X（×2） |
| 11 | 1 | `GetSoldierMaxX` | 取士兵最大 X |
| 12 | 1 | `HoldAllDelay` | 暂停所有延迟 |
| 13 | 2 | `ProduceShadowTime` | 生成影子（计时） |
| 14 | 5 | `MovingShadow` | 移动影子 |
| 15 | 7 | `LockByCenter` | 以中心锁定 |
| 16 | 9 | `LockTargetXY` | 锁定目标坐标（参数最多之一） |
| 17 | 3 | `LockTargetTime2` | 定时锁定目标 |
| 18 | 3 | `Hurt` | 造成伤害 |
| 19 | 3 | `MoveCamera` | 移动镜头 |
| 20 | 2 | `LockCameraSimple` | 锁定镜头 |
| 21 | 2 | `LockCameraSimple2` | 锁定镜头 2 |
| 22 | 4 | `LockCameraLine` | 沿直线锁镜头 |
| 23 | 4 | `LockCameraLineDelay` | 带延迟的直线锁镜头 |
| 24 | 4 | `LockCamera` | 锁定镜头 |
| 25 | 5 | `LockCamera2` | 锁定镜头 2 |
| 26 | 3 | `FireMan` | 火焰人（人形火） |
| 27 | 3 | `CreateBlood` | 生成血 |
| 28 | 2 | `Blood` | 血效果 |
| 29..32 | 4 | `SmallFireBall` / `SmallFireBall2/3/4` | 小火球（4 种变体） |
| 33 | 2 | `DownBrightness` | 降低亮度 |
| 34 | 2 | `RaiseBrightness` | 提高亮度 |
| 35 | 1 | `CreateDot` | 生成点 |
| 36 | 1 | `CreateDots` | 生成多点 |
| 37 | 1 | `CreateLines` | 生成多线 |
| 38 | 2 | `CreateLine` | 生成线 |
| 39 | 2 | `PowerExplode` | 力量爆炸 |
| 40 | 2 | `KeepPower` | 保持力量 |
| 41 | 2 | `StepShow` | 分步显示 |
| 42 | **6** | `HitGeneral` | **命中武将**（武将技核心） |
| 43 | 3 | `DisableAttack` | 禁止攻击 |
| 44 | 2 | `NoMoreSoldierCallback` | 士兵耗尽回调 |
| 45 | 2 | `CastFail` | 施法失败 |
| 46 | 5 | `HalfMoonAll` | 半月斩（全体） |
| 47 | 2 | `HalfMoonCallback` | 半月斩回调 |
| 48 | 1 | `ShowHalfMoonSmoke` | 半月烟雾 |
| 49 | 5 | `CreateHalfMoonSmoke` | 生成半月烟雾 |
| 50 | 1 | `HalfMoon` | 半月斩 |
| 51 | 2 | `ProduceSoldier` | 生成士兵 |
| 52 | 2 | `MoreSoldier` | 增兵 |
| 53 | 2 | `BombLight` | 爆光 |
| 54 | 2 | `ShootObjectCallback` | 发射体回调 |
| 55 | 2 | `ZoomFreq` | 缩放频率 |
| 56 | 2 | `CosZoomY` | 余弦缩放 Y |
| 57 | **6** | `ScaleShadow` | 缩放影子 |
| 58 | 3 | `FireTail` | 火焰尾迹 |
| 59 | 5 | `FlyLight` | 飞行光 |
| 60 | 2 | `ShootObject` | 发射物体 |

后半段（下标 180..230 采样）继续是武将技专用效果：`DemonDancing`(182)、`FlyingSword`(198)、`CreateHolyBall`(202)、`IncreaseHP`(204)、`Heal`(207)、`CreateIce`(202 附近)、`OnFire`(210)、`ProduceBackSoldier`(211)、`CreateTaichi`(215) 等。
⇒ **580 条符号表里混有三类条目**：① 内存/数学原语（0..8 等）；② 引擎特效函数（Hurt/Heal/CreateXxx）；③ **资源路径**（`magic\000\*`、`magic\001\*`、`MAGIC\017\m017a40001` 等 12 个一组），后者是"预加载该武将技的资源"指令。

## 2.5 段0：代码流格式（32 位字流，不是 x86）

`GetByte_Old`（`0x40`，argc=1）首 40 字节，按 dword 读：

```
0x40: 00000008  FFFFFFFE  00000006  004A6878
0x50: 00000012  00000006  00000002  0000003F
0x60: 00000050  00000000
0x68: 00000008  FFFFFFFE  00000006  004A6878   ; ← 同型块重复，仅常量变化
```

`Magic105`（目录 #456，`code_offset=0x3B610`，argc=0，16 B 一个函数）：

```
0x3B610: 00000004  00014DE8  00000002  00000000
0x3B620: 00000004  00030F20  00000002  00000000     ; Magic106
0x3B630: 00000006  00000000  00000004  0002A0AC     ; Magic107
0x3B640: 00000002  00000000  00000006  00000001     ; Magic108
0x3B650: 00000004  0002FB00  00000002  00000000     ; Magic109
```

⇒ **每个"函数"就是一段 dword 字流**，形态为 `[opcode][operand]` 对的串联：
`04 <资源/常量id> 02 00` = "加载资源 0x14DE8，然后返回/结束"。
`0x004A6878` 是**编译期烘焙的 EXE 绝对地址**（在 `.data` 段内），只有 19 处出现 ⇒ 少数脚本直接引用宿主全局变量。

**代码段小区值分布**（`0x40..0x3B6A0`，60,824 个 dword）：

| 值 | 次数 | 值 | 次数 |
|---|---|---|---|
| 6 | 9792 | 3 | 2007 |
| 8 | 6652 | 4 | 1536 |
| 5 | 4639 | 7 | 1313 |
| 2 | 3379 | 10 | 1111 |
| 1 | 3132 | 61 (`0x3D`) | 1008 |
| 0 | 2649 | 15 | 844 |
| 11 | 2048 | −2 / −3 / −4 / −5 | 841/722/293/175 |

统计事实：**83%（50,486/60,824）的字值 < 256**，负数 2,204 个（3.6%），绝对地址仅 19 个。
⇒ 这是一套**紧凑字节码**（操作码 + 小整数操作数），不是 x86 代码，也不是资源文件。

## 2.6 指令集（opcode 表）：**未定位**（附排查证据）

任务要求给出 ≥30 条 opcode 含义表。**如实结论：opcode→语义的映射未能逆出**，理由与已排除项如下：

1. **EXE 内没有解释器特征串**：`"Smart Script"`、`"SYSCALL"`、`"sload"`、`"define"`、`"include"` 在 raw 与 imm32 两种扫法下**均 0 命中** ⇒ 装载器不校验魔数、不打印脚本系统名。
2. **没有 opcode 分派表**：全 EXE 只有 5 张 `jmp/call [reg*4+imm]` 跳转表（`0x4083A4`(9)、`0x40D558`(9)、`0x41A7F0`(8)、`0x41E30B`(8)、`0x42AB7B`→`0x42B9E5`(207)），**没有 200+ 项的 opcode 表**；`0x42AB50` 那张 207 项表已排除（它按资源 id 分派 `"FORCE\MA*"` 等，且 **0 个调用者**）。
3. **装载链只到"通用文件打开"**：`0x41F740(5 参)` → `0x421AD2(名)` → `0x4650E0`（遍历 `0x4A6980..0x4A69A8` 十个 provider，逐个 `0x468160`），失败才 `printf(0x48A15C "Can't open script %d")`。`.SO` 头解析代码未在这条链上找到（也可能是 `0x421AD2` 之后才做，但该函数内未见到 `+0x10`/`+0x14` 的读法）。
4. **最接近"版本分派"的代码**：`0x4474B0` = `cmp dword ptr [ebp+0x10], 0x100`（全 EXE 唯一一处 `cmp [reg+0x10],0x100`，与 MAGIC.SO `+0x10` 版本号吻合），同函数还比较 `4 / 8 / 0x10 / 0x200`，各分支调 `0x443F2A()` 取串 + `0x41048D`；`0x447520` 遍历 `count=[ebp+8]`、**stride 0x48** 的记录数组并判 `[rec+0x20]==3`。
   ⇒ 这是**脚本对象/导出表的构造器**，但**不是**逐条 opcode 分发器（没有对字流的解释循环）。
5. **脚本对象的运行态只有 2 个字段**可证：`0x41F713(obj)` = `obj->[0x38] >= 0 && obj->[0x38] < obj->[0x34]` ⇒ `+0x34` = 代码长度上限、`+0x38` = **PC 指令指针**；`0x41F706(h)` 把句柄存 `[0x4A6498]`（当前脚本）。**取指/译码函数未定位**（`0x41F713` 的调用者只有"还有指令吗"的判断，没有配套的 `step/exec`）。

**结论**：`MAGIC.SO` 的函数目录（含 `argc`）与符号表（含 `SYSCALL` 编号）已完整解出，可直接用于**调用脚本内置函数**；但**脚本自身的字节码语义层未定位**。要补完这一层，最可行的两条路：
(a) 在 `0x41F713`（PC 判定）的调用者附近下断点，观察 `+0x38` 如何递增、按什么规则跳到下一个 opcode；
(b) 对比 `MAGIC.SO.OLD`（259,496 B）与 `MAGIC.SO`（261,008 B）的差异块，差异集中在"新增的武将技"，其字流结构可反推 opcode 粒度。

## 2.7 与 `MAGIC.INI` 的关系

| 引用 | 位置 |
|---|---|
| `"MAGIC.INI"` | `0x48D4F4`（xref `0x4300D3`） |
| `"Magic01.o"` | `0x48D4A0`（xref `0x42FF2F`） |
| `"MAGIC.SO"` | 由脚本名表 + `0x41F740` 打开（名字来自 `[SCRIPT] File=` 或 `Magic%02d.o` 模板） |
| `"重新load script檔"` | xref `0x4426C5`（热重载脚本，开发期用） |
| `"SCRIPT"` / `"DESCRIPTION"` / `"Script"` | `0x42EB66` / `0x42F093` / `0x42F5CD`（TIMES*.INI 的 `[SCRIPT]` 段） |
| `"SYSTEM\TotalObjectDefine"` | `0x48E028`（`0x437B0A`）——对象定义总数 |

## 2.8 `命疗术` 的脚本在哪里？

链路已完整：`武将技 1` → `SYSCALL 0x1D5` → 符号表下标 469 = **`Magic1`** → 函数目录里同名条目 → `code_offset` 指向段0 内的字流。
`Magic1..110` 在函数目录**末尾**（`0x3B588`..`0x3B688` 一带，每个 0x18..0x20 字节），而它们的**名字**在 `0x3D1A0..` 区（与代码区物理分离）。
`Magic1` 的字流本体（`01`/`04`/`02` 三种操作 + 资源 id）与 `Heal`/`IncreaseHP`（下标 204/207）配合，构成"治疗"效果；但**具体参数绑定（治疗量、范围）在 `MAGIC.INI` 的 `[MAGIC01]` 段**，不在 `.SO` 内（`.SO` 只放流程与资源 id）。

## 2.9 `define` / `include` 预处理 与 `!xxxxx` 启动钩子

**均未定位**，排查结果：
- EXE 与 `MAGIC.SO`/`SYSTEM.SO` 的字符串区里**没有** `define`、`include`、`#`、`!` 开头的命令行（`big5_str.tsv` 与 `magic_so_strings.txt` 全表比对）。
- `MAGIC.SO` 段0 **不含可读的源文本**（只有函数名/资源名），也没有"源文件→伪码"的编译中间产物残留 ⇒ `define`/`include` 是**离线"伪编译器"（Pseudo Compiler, Allen Zhou）**的功能，运行时 `.SO` 已无宏信息。
- `!xxxxx` 启动钩子：字符串表无 `!` 前缀命令；`[SCRIPT]` 段只有 `File=` / `SCRIPT=` 两个键（`0x42EB5C` 装载），**未见"启动脚本名"表**。可能存在的钩子是 `0x4426C5` 的"重新load script檔"与 `0x41F789` 的 32 项脚本名表（`0x4C2C20`，计数 `0x4A649C`）——后者是**运行期已加载脚本清单**，可作为"启动时按序加载"的间接证据，但**顺序表未定位**。

## 2.10 脚本系统小结

| 问题 | 结论 | 置信度 |
|---|---|---|
| 文件格式 | 4 段（代码+串 / 函数目录 463×16B / 符号表 580×4B / 版权） | 高（算术闭合） |
| 内置函数表 | 463 条，含 `argc`（0..9） | 高 |
| SYSCALL 编号 | = 符号表下标；武将技 N = `0x1D4+N` | 高（0x213-219 = Magic63..69 双证） |
| 字节码 opcode 语义 | **未定位**（无分派表、无解释循环、无魔数校验） | — |
| 资源加载 | `magic\%03d\*` 通配预载 + `m%03dsndNN` 音效 | 高 |
| 编译期烘焙地址 | 19 处 `0x4xxxxx`（如 `0x4A6878`） | 高（计数） |

---

## 附：本文用到的关键地址速查

| 用途 | VA |
|---|---|
| 命令行解析（含 `-AIOFF`） | `0x40B46E` |
| 全局开关位掩码 | `0x4A79C8`（bit4=AI关闭，bit1=抑制升级提示，bit3=-MAPMODE） |
| AI 势力回合 | `0x40D751` |
| AI 逐城调度 | `0x40CBB6` |
| AI 攻城/联合 | `0x40CAF1` → `0x40C635` |
| AI 选最优（argmax+哨兵800） | `0x40CC10` |
| AI 行动记录表 | `0x4C39A0`（count）/ `0x4C32A0`（base，stride 0x1C） |
| AI 行动类型名表 | `0x487248`（9 项） |
| AI 调试输出 | `0x40BECB`（格式串 `0x4872CC`、`0x4872FC`） |
| 邻城访问器 | `0x4054B9` |
| 脚本装载 | `0x41F740` / `0x41F706` / `0x41F713` / `0x41F789` / `0x41F7EC` |
| 通用文件打开 | `0x4650E0` |
| 版本分派构造器 | `0x4474B0`（`cmp [ebp+0x10],0x100`） |
| MAGIC.SO 段表 | `+0x14/0x18/0x1C/0x20/0x24/0x2C` |
