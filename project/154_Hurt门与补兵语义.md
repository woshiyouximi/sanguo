# 154 `Hurt` 门与补兵语义（g2/g3 定案 + 落地清单）

> 任务来源：`project/152`、`project/153` 遗留的第 1 条未解——`Hurt @0x12E4` 的
> `EQ(arg2,g2); EQ(arg2,g3); LOR; 3D` 到底问的是谁，谁写 `g2/g3`。
> 本轮结论全部来自 **Sango2.exe（三国群英传2 修正版 1.05+）机器码** 与 **MAGIC.SO / SYSTEM.SO 字节码**
> 两头交叉，不靠手感、不动断言。
> 标记：`[确认]` = 有指令级证据且双向交叉；`[推测]` = 证据只到一侧；`[未解]` = 没查到决定性证据，写清缺口。
>
> **本轮不落代码**（lead 裁决 2026-11-25）：证据冻结在 §1，改动清单在 §5，等 `i1-move-grid`
> 的 `battle.ts` 步进重写落地、树绿之后再一次性执行。

---

## 0. 一句话结论

**`Hurt` 里的 `LDG 2` / `LDG 3` 读的是 EXE 的引擎全局数组 `0x4A6878[2]` / `[3]`（进程级 64 个 dword），
不是 `MAGIC.SO` 的脚本全局 `g2`/`g3`；它的唯一写入者是 `0x43BA59`——`G[2] = 施法方主将句柄`、
`G[3] = 对方主将句柄`、`G[5] = 阵营(0/1)`。** 所以原作 `Hurt` 的语义是
「**受害者不是双方主将之一 ⇒ 只放 `Hit01` 音；是主将 ⇒ `0x2B` 受击动作 + `0x125` 扣血**」。
152/153 把「脚本全局 `g2/g3`」与「引擎全局 `[2]/[3]`」当成同一块内存，这是前提错误。

同时用 handler 机器码钉死三个 VM 语义 bug（`0x3C/0x3D` 极性、binop 左右序、CALLS 取参序）。三处按 EXE
改正后**补兵真的出兵、R67 全绿**，但撞 7 条回归，根因是端口缺「并发脚本实例」这一层——不在指令语义。

---

## 1. 结论清单

### 1.1 两个 "global" 不是同一块内存 `[确认]`

| opcode | 助记符 | 读/写 | 地址 | 出现次数 | 分发 handler |
|---|---|---|---|---|---|
| `0x09` | `LDSG slot` | 读**脚本全局** | `ScriptObject+0x18`，8 B/槽 ×121，每脚本一份 | 128 | `0x463BF0 → 0x4667F0` |
| `0x0A` | `LDG imm32` | 读**引擎全局** | `0x4A6878 + idx*4`，idx 0..0x3F | **781** | `0x463C00` |
| `0x0C` | `STG slot` | 写**脚本全局** | `ScriptObject+0x18` | 107 | `0x463CF0` |
| `0x0D` | `STE imm32` | 写**引擎全局** | `0x4A6878 + idx*4` | **2** | `0x463DB0` |
| `0x1F`/`0x50` | `ING`/`DEG` | 引擎全局自增/自减 | `0x4A6878` | — | `0x464B9D` / `0x464C4D` |

指令级证据（`work/g2g3/xd.py` 反汇编；EXE 载入基址 0x400000）：

```
0x463C00 (LDG) : call 0x467E30(fetchImm) ; cmp eax,0x40 ; mov eax,[eax*4+0x4a6878] ; push
0x463CF0 (STG) : fetchImm → edi ; pop → ecx ; eax=`esi+8`(ScriptObject) ;
                 eax=[eax+0x18] ; [eax+edi*8]=ecx ; [eax+edi*8+4]=2
0x464F26..F39  : rep stosd 清 0x4a6980 起 0xa dword，再清 0x4a6878 起 0x40 dword（= 64 槽）
```

⇒ `Hurt` 的两条 `LDG 2` / `LDG 3` 与 `MoreSoldier`/`ProduceSoldier` 里的 `LDSG/STG g*` 完全不是一个空间。
`MAGIC.SO` 全文只有 4 处 `STG g2|g3`，用途各不相同，且都**与 `Hurt` 无关**：

| 位置 | 函数 | 语义 |
|---|---|---|
| `0x2DBC STG g2` | `DownBrightness` #33 | 亮度渐变的持久参数槽；`RaiseBrightness` #34 开头 `LDSG g2` 拿它当起点 |
| `0x3B5C STG g3` | `HitGeneral` #42 | 「本场只打一次主将」的一次性闩锁（0=未打，1=已打） |
| `0x3E08 STG g3` | 同族另一入口 | 同上 |
| `0x3AA4C / 0x3AA5C STG g3/g1` | `InitializeBattle` #351 | 开局清 0（g2 不清） |

### 1.2 引擎全局 `[2]`/`[3]` 的唯一写入者 = `0x43BA59` `[确认]`

全 EXE 只有 **26 处**绝对引用落进 `[0x4A6878,0x4A6978)`（`work/g2g3/xref2b.txt`：4 字节 LE 模式扫描 +
局部反汇编定位，绕开 .text 内嵌数据导致的失步）。slot 2 三个写点、slot 3 两个、slot 5 四个：

| slot | 写点 | 指令 |
|---|---|---|
| 2 (`0x4A6880`) | `0x43BA8C` | `a3 80 68 4a 00   mov [0x4a6880],eax` |
| | `0x443BFF` | 同型（`[0x4A8AA4] → 0x421AD2 → G2`） |
| | `0x4448E3` | 同型 |
| 3 (`0x4A6884`) | `0x43BA9D` | `a3 84 68 4a 00   mov [0x4a6884],eax` |
| | `0x443C19` | 同型 |
| 5 (`0x4A688C`) | `0x43BAAB` / `0x43BAB7` | `mov [0x4a688c],0` / `,1` |
| | `0x4448BE` / `0x4448CA` | `,0` / `,1` |

写入者 `0x43BA59`（三参 void；`work/g2g3/d43b9.txt`）：

```
0043BA59 mov eax,[ebp+8]       ; arg0 = 某一方战场结构（0x4A8A60=A / 0x4B03A0=B）
0043BA62 mov ecx,[eax+0x44]    ; arg0->+0x44 = 该方主将的图形对象指针
0043BA6C call 0x43B9E2         ; 取另一方结构
0043BA84 call 0x421AD2         ; ★ ptr → 句柄：f(p) = p ? p->[4] : 0
0043BA8C mov [0x4a6880],eax    ; ★ G[2] = 施法方主将句柄
0043BA95 call 0x421AD2
0043BA9D mov [0x4a6884],eax    ; ★ G[3] = 对方主将句柄
0043BAA2 cmp [ebp+8],0x4a8a60
0043BAAB/B7 mov [0x4a688c],0/1 ; ★ G[5] = 阵营（A→0，B→1）
0043BAC1 mov [0x4a6664],1
0043BAD7 call 0x41F740         ; (arg0->0x44, arg2, arg3) —— 真正去跑脚本/技能
```

**句柄与对象的两个方向（务必分清，端口两套句柄空间就栽在这里）`[确认]`**：

| 函数 | 方向 | 机器码 | 语义 |
|---|---|---|---|
| `0x421AD2(ptr)` | **对象指针 → 句柄** | `mov ecx,[eax+4]`（NULL→0） | 句柄就是对象自带的 ID，存在 `obj+0x04` |
| `0x421A80(handle)` | **句柄 → 对象指针** | `idx = handle & 0xffff; if (idx > 0x800) return 0; obj = [0x4A64A0] + idx*0xA8; if (obj->[4] != handle) return 0; return obj` | 对象表 `0x4A64A0`，2048 项，stride `0xA8`，命中校验 `obj->[4] == handle` |

- 所以 `G[2]/G[3]` 里存的是**图形对象句柄**（低 16 位是表下标），不是单位数组下标；
  端口里 `HANDLE_BASE = 1000 + units 下标`、`DAMAGE_HANDLE_BASE = 0x400000 + units 下标` 是两套自建空间，
  与 EXE 的 `0x4A64A0` 表无关——实施时要按端口自己的 `byHandle` 走，不能照抄 `& 0xffff`。
- `0x4A8A60` / `0x4B03A0` 是双方战场结构；`+0x44` 是「该方主将图形对象指针」（写者 `0x442B08`）。
  对应槽 `0x4A8AA4` / `0x4B03E4` 被 `0x443BEB/0x443BF7` 与 `0x443C04/0x443C11` 直接喂给 G2/G3 `[确认]`。
- `0x43BA59` 的 11 个调用点：`0x43BBDA`、`0x44255F…0x4426AA`（9 处，调试热键簇：
  `test [0x4a6764],0x10000000/0x20000000/…` 后 `push 0; push <magicId>; push 0x4a8a60; call 0x43ba59`，
  magicId ∈ {0x1F6,0x67,0x68,0x64,0xC8,0x12C,0x62,0x61}）、`0x443EC9`
  ⇒ 它就是「**按 magicId 跑一条武将技脚本**」的公共入口，也是 G2/G3/G5 的唯一哨兵。
- 另有 `0x4448B2(sideStruct)`：只写 `G[5]`/`G[2]`（**不写 G3**），随后 `call 0x41F740(0,0x3b)`、
  `call 0x43ADED(sideStruct,0x101,7)` ⇒ 不同入口写不同子集，G3 可能保留上一场的值（见 §7 未解 5）。

### 1.3 脚本侧交叉印证：G2/G3/G5 的功能语义 `[确认]`

不看写者也能从脚本用法反推（两条脚本各自独立自洽）：

**DemonDancing（`Magic105` = 神鬼亂舞，func #149 @0x14DE8）**

```
0x105(G2) → 像素 x ；0x106(G2) → 像素 y ；0x100(x, y-120)      ; 用 G2 的坐标当落点
LDG 5; PUSHI 1; EQ; 3D L14F24                                   ; G5==1 取 x-1 格，否则 x+1 格
0x113(格) → loc2                                                ; 查该格占用者
LDSL loc2; LDG 3; EQ  → 记 flag（目标是否就在正前方）
… 0x11(G2, 24001, loc7, 0)                                      ; 造恶魔，G2 是 owner
SYSCALL 0x314 argc=10 → LockTargetXY(...)                       ; 伤害来自另起的脚本实例
```

**TwisterSword（`Magic106` = 劍輪舞，func #294 @0x30F20）**

```
0x129(LDG 5 xor 1) → loc3 ；LDSL loc3; PUSHI 0; EQ; 3D L310C0   ; loc3==0 时 loc3 = LDG 3
0x105(loc3) / 0x106(loc3) ；MoveCamera(x, y-120, 20)            ; 拿 G3 的坐标推镜头
```

⇒ `G2` = **施法方单位句柄**（坐标/落点/造物件的 owner）、`G3` = **目标单位句柄**（相等判断/取坐标）、
`G5` = **0/1 阵营/朝向**（`±1` 格镜像；`loc7 = 128` 是半圈朝向位）。与 `0x43BA59` 的写法完全吻合。

`Hurt` 门因此读作：**「受害者 == 施法方主将 或 == 对方主将」**——`Hurt` 是给**主将**用的伤害入口；
小兵在原作里走别的通路（§1.5）。

### 1.4 `SYSCALL 0x125` 的真实语义 `[确认]`

```
0x125 host @0x42076D : target = 0x421A80([ebp+8]) ; src = 0x421A80([ebp+0xc]) ;
                       if (target) 0x43ED96(target, src, [ebp+0x10])
0x421A80(handle)     : 见 §1.2 的「句柄 → 对象指针」
0x43ED96(t, s, v)    : if (s) { u = s->[0x84] ; g = u->[0x48] ;
                               v += v * (int16)g->[0x2e] / 100 ; }
                       [0x4B4C3C] = v ; t->vtable->msg(0x1000E, s, v)   ; call [t+0x4c]
```

- `0x43ED96` 全 EXE **只有一个调用者** `0x4207A3`（就在 0x125 宿主里）；`push 0x1000e` 全 EXE 只有
  `0x43EDF3` 一处（另三处裸常量 `0x482160/0x482D98/0x48326C` 是接收侧分派数据）
  ⇒ **脚本 `0x125` 是唯一的伤害入口**；实际扣血由目标对象的 vtable 消息处理决定 ⇒ 士兵也能被打，
  只是脚本侧只有 `Hurt` 这一条路，而 `Hurt` 又按 G2/G3 过滤 `[确认]`
- 端口的 `syscalls.ts:423 case 0x125`：`ctx.damage(a(0), a(2), a(1))`（= target, value, src），
  与 `0x42076D` 的实参序一致 `[确认]`

### 1.5 三个 VM 语义 bug（handler 机器码逐字）`[确认]`

| # | 原作 | 端口（本轮前的现状） | 证据 |
|---|---|---|---|
| 1 | `0x3C`@`0x464660`：`test eax,eax; je +3; mov [esi+0x10],edi` ⇒ **弹出 ≠0 才跳**（真跳）<br>`0x3D`@`0x464690`：`test eax,eax; jne +3; mov [esi+0x10],edi` ⇒ **弹出 ==0 才跳**（假跳） | `0x3c: popNum()===0 跳` / `0x3d: popNum()!==0 跳`（**整个反**） | 脚本侧 5 处独立自洽：`InitializeBattle` 的 `LT(loc1,60); 3D` 是 for 出口（循环体只 `INCL`、回边在 `0x3AB10`）；`HitGeneral` 的 `LDSG g3; JNZ` 是一次性闩锁；`F104` 的 `g120<501 ? 501 : ++g120`；DemonDancing 的「目标不在正前方」分支；`MoreSoldier` 的 4 条上限/弃技判据 |
| 2 | `0x463ED0`(SUB)：`edi=pop(); eax=pop(); sub eax,edi` ⇒ **先压=左操作数**，`A;B;SUB = A−B` | `const x=pop(); const y=pop(); fn(x,y)` ⇒ 栈顶当左 | `MoveCamera` 的 `LDSL arg3; LDSL loc2; SUB`（目标−当前）只有新读法成立；同一处机器码决定 GT/LT/GE/LE、DIV/MOD/SHL/SHR |
| 3 | `0x467490` pop 5 槽后按 `name,pop4,pop3,pop2,pop1` 调 `0x4653F0`；`0x4653F0` 从 **pop4**（名字之上那槽）起顺序压 `fn->argc` 个槽；`frame` 指在刚压进去的旧 frame 上 ⇒ `LDSL argN = frame-1-N` ⇒ **arg1 = 数组第 argc−1 项** | 固定 `[d,c,b2,a2]`（块顶当 arg1），只对 argc=4 成立 | 被调方交叉：`ProduceSoldier(need, side)` 的 `LDSL arg1` 是循环上界、`LDSL arg2` 是阵营镜像位（`EQ(arg2,1)`）；`StepShow(10, handle)` 的 `LDSL arg1; WAIT` |

**旧端口为什么"看起来没事"**：bug 1 与 bug 2 **互相抵消**——`A;B;LT;3D(假跳)` 在双反之下等价于
`B<A` 为真时跳，所有有序比较的 if/while 恰好全对。但 `EQ`/`NE`/`LAND`/`LOR`/`LNOT` 是**对称**的，
抵消不了 ⇒ 所有「相等/不等」门（`Hurt` 的 G2/G3 门、`MoreSoldier` 的 `NE(loc7,0)` 弃技门、
`ProduceSoldier` 的 `EQ(loc3,0)` 换行门）整个反。这就是「补兵 0 兵」与「Hurt 只放音」同源的原因。

### 1.6 按 EXE 改完三处 + 接通 G2/G3：补兵成功，但撞 7 条回归 `[确认]`

实测（`work/vmfix_units.mjs`、`work/g2g3/p6xx.json`）：

- 7 条补兵技 **seq 5 / 17 / 19 / 31 / 37 / 57 / 81 全部真出兵**（探针 `units 42 → 42 → 44`，每个 seq +2；
  `markSummon=2`；`marks=[{s:1,m:0},{s:1,m:0}]` 不再弃技）
- `R67` 5 条全绿（脚本通道打主将掉 7 点血、打士兵 hp 1→0、混战每次命中都过 syscall、与 legacy 逐 tick 等价、独立 PRNG）
- 全量 **1272 → 1260（12 红）**，再加 G2/G3 桥后 **1265（7 红）**：606 逐帧、606 同步、神鬼亂舞(104)、
  R87 旋龍、R87 WAITFOR、R52 音量、R84 spellKills

**根因不是这三处指令语义，而是端口缺「并发脚本实例」`[确认]`（现象）/`[推测]`（机制）**：

1. `TornadoMotion`（func #125 @0x11710）的 `L11728: 0x12(arg6); 3D L11814 … WAIT 1; JMP L11728`
   在端口永不退出——`0x12` 问「物件还活着吗」，而端口的物件由**同一条 VM 栈串行**推进，等不到自己死
   ⇒ 同步模型在 `pc=0x117E4` 撞 `MAX_SKILL_FRAMES=1200` 被截断（R87 旋龍、R52 音量都栽在这里）。
2. 606 的忠实串行时间线 ≈ `TwisterSword 105 帧` + `CreateTwisterSword 281 帧` +
   `CreateTwisterSwordAttack 280 帧` **≈ 666 帧**（实测 601，嵌套 WAIT 被 `nestedWaits` 折叠），
   而断言要 `帧数>1000`、`指令>400k`、`物件>50`——这些数字是**旧反极性行为**下的产物。
3. 神鬼亂舞的伤害来自 `SYSCALL 0x314`（host `0x420CAD`，10 实参版 invoke-by-name，与 CALLS 同一套
   `0x4653F0`）另起的 `LockTargetXY` 实例——原作并发跑，端口没有这一层，只能拿到 `hits 1`（断言 ≥3）。

> 把 `MAX_SKILL_FRAMES` 临时提到 4000 反而更糟：旋龍仍在 `0x117E4` 截断（文案变 4000）、
> R52「49 号 3 个发声点」变 8 条、`R80 真跑一场战斗` 新增红（1200 tick 不结束）——证明那几条是
> **不终止的轮询**，不是"跑得慢"。已回退 1200。

---

## 2. 本轮决定：**不改行为**（lead 裁决）

1. `[确认]` 三处 VM 语义按 EXE 改是**对的**，补兵也确实出兵；
2. 但改完直接破闸门 ③「606 帧数与 R52 音量不回归」（`1265/7`），而破的原因在**另一个子系统**
   （并发脚本实例），不是数值口径问题；
3. 在并发模型补上之前，补兵与帧数/音量**不可两全**；为了过测试去放宽断言/改数值是禁止的；
4. 另外 `i1-move-grid` 正在并发重写 `battle.ts` 的移动步进，两边一起动会让全量红一片、无法判责。

因此：**保留旧语义 + 把结论写死进注释**（防止下一轮再走回头路），G2/G3 桥一并拆掉——
在旧极性下 G2/G3 一旦填对，`Hurt` 的门就变成"只放音"，R67 立刻全红（§6 阴性对照 b）。

---

## 3. file:line 改动表（终态：行为零改动）

| 文件:行 | 改动 | 行为 |
|---|---|---|
| `game/src/core/smartscript/vm.ts:572-595` | 0x3C/0x3D 注释块重写：EXE handler 逐字、5 处脚本自洽、`_opcode_table.md` 命名反向、「改了会红 7 条」清单 | 代码仍 `0x3c: popNum()===0 跳` / `0x3d: popNum()!==0 跳`（与原状逐字一致） |
| `game/src/core/smartscript/vm.ts:633-659` | CALLS 注释：`0x467490`/`0x4653F0` 推导 + `ProduceSoldier`/`StepShow` 交叉验证 + 正确取法 | 代码仍 `callInline(fn, [d,c,b2,a2], next)`（与原状一致） |
| `game/src/core/smartscript/vm.ts:878-889` | binop 注释：`0x463ED0 sub eax,edi` ⇒ 先压=左；与反极性互相抵消、只对有序比较成立 | 代码仍 `x=pop(); y=pop()`（与原状一致） |
| `game/src/core/battle.ts:1275-1319` | `applyDamage`/`damageViaScript` 回 3 参；删掉两行 `setEngineValue(2/3,…)`；注释写清原作 G2/G3 由 `0x43BA59` 写、普攻不走 `Hurt`、端口为何必须保持 0 | 与原状一致 |
| `game/src/core/battle.ts:2123,2126` | 两处 `applyDamage(..., from)` → 回 3 参 | 与原状一致 |
| `game/src/core/smartscript/runtime.ts:207` | `MAX_SKILL_FRAMES` 实验值 4000 回 **1200** | 与原状一致 |
| `game/tests/_probe_tmp.test.ts` | 临时探针（读 `PROBE_SCRIPT` 跑单脚本 dump json），**已删除** | — |

产物（`work/g2g3/`，不入库）：`xd.py`（反汇编 + `--callers`）、`xref2.py`/`xref2b.txt`（0x4A6878 引用扫描）、
`d43b9.txt`（0x43BA59）、`d421a.txt`（0x421AD2）、`p605.json`/`p606.json`/`p503.json`（脚本探针 dump）、
`rebuild_battle.py`/`rebuild_report.txt`（一次 PS 写坏 `battle.ts` 后的重建）。

---

## 4. 测试数字

| 阶段 | 全量 `node --test tests/*.test.ts` | 备注 |
|---|---|---|
| 基线（本轮动手前） | **1272 / pass 1272 / fail 0**（≈55 s） | 硬约束起点 |
| 只改 CALLS 取参 | 1272 / 0 | 补兵仍 0 兵（证明 CALLS 不是唯一病根） |
| L1+L2+L3（极性+binop+CALLS） | **1260 / 12** | 补兵出兵、R67 绿；606/R52/R87/神鬼亂舞/R84 红 |
| 再加 L4（G2/G3 桥） | **1265 / 7** | R67 5 条回绿后剩 7 条 |
| **全部回退（本轮终态）** | 见下 | 行为与原状一致 |
| 保真网 `work/fidelity/check.mjs`（mode=dist） | **PASS 458 / FAIL 0 / SKIP 3 / WARN 1** | `tsc -p tsconfig.build.json` exit 0 之后测得 |

终态全量**没有复跑**（lead 指示：等 `i1-move-grid` 落地、树绿再跑；本轮不吃全量结果）。当前可用证据：

- 类型检查：`npm.cmd exec -- tsc --noEmit` **exit 0**（13:04 复测；此前 12:59–13:04 之间曾红在
  `tests/retreat.test.ts:26-27`——i1 删了 `battle.ts` 的 `MOVE_PER_TICK`/`RETREAT_SPEED` 而测试未同步，i1 已自行修好）
- 保真网（13:05 复测，`tsc -p tsconfig.build.json` exit 0 之后）：**PASS 458 / FAIL 0 / SKIP 3 / WARN 1**
- 本条线 6 个测试文件（`r50_r67`、`r87_waitfor`、`smartscript`、`smartscript.session`、`smartscript_audio`、
  `battle_feedback`，在 i1 修好 tsc 之前那一轮）= **91 条 / pass 89 / fail 2**：
  - 606 两条**回绿**：`ℹ 同步 606：ok=true 指令=528080 syscall=18872 物件=90`、
    `ℹ 逐帧 606：1132 帧 done=true ok=true reason=""`
  - 神鬼亂舞、R87 旋龍/WAITFOR、R52 音量、R67 全 5 条 **回绿**
  - 剩 2 条红：`R84 多帧技…法术击杀该 >0（实际 0，会话数 0）`、`R80 真跑一场战斗：战斗应在 1200 tick 内结束`
    ——两条都断言「真 `step()` 跑完一场战斗」，与 `i1-move-grid` 正在重写的移动/步进同域
    （同一时刻全量跑时 `剧本×地形×种子` 矩阵也全红），不在本轮改动面内

---

## 5. 落地清单（等 `i1-move-grid` 落地、树绿之后执行）

前置：`[确认]` 三处 VM 语义 + G2/G3 接线**必须同进同退**（§6 阴性对照 a/b/d 已证）；顺序按 L1→L4，
L3 可独立先行（单独改全量不变，见 §4 第二行）。预计 20 分钟落完 + 两轮验证。

### L0 前置（真正的阻塞项）：并发脚本实例 `[推测]`

没有它，L1+L2+L4 一落地就撞 §1.6 的 7 条红。要补的最小面：

- `runtime.ts` 的 `spawnObject`（`:855-883`）/ `unitAlive`（`:819-825`）/ `wait`（`:691-709`）/ `frameMode`
  改成「每个 object/技能实例一个执行上下文，`advance()` 逐帧 round-robin」，虚拟帧从**求和**改**取最大**；
- `syscalls.ts` 的 `0x312` / `0x314`（现为 invoke-by-name 同步内联）改成「新建实例 + 排队」；
- `runtime.ts:1478` 的 `while (!this.done && guard++ < MAX_SKILL_FRAMES + 8) this.advance();` 要按实例推进。

### L1 `0x3C/0x3D` 极性 — `game/src/core/smartscript/vm.ts:596-601`

```ts
case 0x3c:
  if (this.popNum() !== 0) this.pc = a;   // 真跳（0x464660: je +3 = ==0 不跳）
  return undefined;
case 0x3d:
  if (this.popNum() === 0) this.pc = a;   // 假跳（0x464690: jne +3 = ≠0 不跳）
  return undefined;
```

- 为什么：§1.5 #1；`_opcode_table.md` 的 `0x3C JZ / 0x3D JNZ` 是反的。
- 预期变化：`tests/smartscript.session.test.ts:67` 逐帧 606 **1132 帧 → 601 帧**、`:184` 同步 606
  **528080 → 358291 指令**（两者都会红，是旧极性标定的数字，需按 §5 尾部「重定基线」处理）；
  `tests/smartscript_audio.test.ts:134` 音量只剩 `0.784…`×3（缺 `230/255`）；
  `tests/smartscript.test.ts:173` 神鬼亂舞 `hits ≥3 → 1`。
- 验证：`node --test tests/smartscript.session.test.ts tests/smartscript.test.ts`（应看到上述新数字）+ 补兵探针（L3 尾部）。

### L2 binop 左右序 — `vm.ts:887-889`

```ts
const y = this.pop();   // 右操作数（0x463ED0 先 pop 的那个）
const x = this.pop();   // 左操作数（先压的）
this.push(fn(x.value, y.value));
```

- 为什么：§1.5 #2（`sub eax,edi`）。**必须与 L1 同时**，否则所有有序比较的 if/while 全反。
- 预期变化：与 L1 合并计（单独改会让 `LT/GT/LE/GE` 门全反，全量会大面积红——不要单独试）。

### L3 CALLS 取参 — `vm.ts:659`

```ts
const argc = Math.max(0, Math.min(4, fn.argc));
const argv = [a2, b2, c, d].slice(0, argc).reverse();
this.callInline(fn, argv, ins.next);
```

- 为什么：§1.5 #3（`arg1` = 名字之上最靠内那槽）。`a2` = pop4 = 块最底、`d` = pop1 = 块顶。
- 预期变化：**单独改全量不变（1272）**，但补兵仍 0 兵；与 L1+L2 合并后 7 条补兵技出兵。
- 验证（**关键探针，期望值固定**）：

```powershell
cd F:\sanguo\game
node ..\work\vmfix_units.mjs     # 修好：units 42 -> 42 -> 44（每个 seq +2）、markSummon=2、
                                 #       marks=[{"s":1,"m":0},{"s":1,"m":0}]
                                 # 未修好：units 不变、markSummon=0、marks 里 m:1（弃技）
node ..\work\vmfix_trace.mjs     # CALLS 实参块 trace：ProduceSoldier 应拿到 arg1=need、arg2=side
```

  seq 清单固定为 **5 / 17 / 19 / 31 / 37 / 57 / 81**（`work/vmfix_units.mjs` 里的 `seqs` 常量）。

### L4 G2/G3 桥（`Hurt` 门）— `game/src/core/battle.ts:1281,1292,1295,1305,1309,2123,2126`

```ts
export function applyDamage(world: World, to: Unit, amount: number, from?: Unit): number
...
if (... && damageViaScript(world, to, dmg, from)) return dmg;
...
function damageViaScript(world: World, to: Unit, dmg: number, from?: Unit): boolean {
  const victim = damageHandleOf(world, to);
  // 原作 0x43BA59：G2 = 0x421AD2(施法方主将图形对象)、G3 = 0x421AD2(对方主将图形对象)
  rt.vm.setEngineValue(2, from ? damageHandleOf(world, from) : 0);
  rt.vm.setEngineValue(3, victim);
...
applyDamage(world, to, dmg, from);   // :2123
applyDamage(world, to, 1, from);     // :2126
```

- 为什么：§1.2/§1.3；`Hurt` 只对 `{G2,G3}` 里的受害者扣血。
- 预期变化：R67 5 条从「加它才绿」变成绿（**旧极性下加它会红 5 条**，§6 b）。
- 注意：端口的 `damageHandleOf` = `0x400000 + units 下标`，是自建句柄空间；**不要**引入 EXE 的
  `& 0xffff / 0x4A64A0` 表（那是原作内存布局）。
- 附带（`[推测]`，可后置）`runtime.ts:374-378` 的 G5 写入目前是
  `setEngineValue(5, isHeal ? casterHandle : direction)`，与 EXE 的「阵营 0/1」不符；
  `TwisterSword` 的 `0x129(LDG 5 xor 1)` / `DemonDancing` 的 `EQ(G5,1)` 只在 0/1 下自洽。
  建议改成 `side === 'A' ? 0 : 1`，但**先跑 DemonDancing 探针确认 hits 再定**（探针见下）。

### L5 重定基线（与 L1-L4 同批，需 lead 确认）

以下 5 条断言按**旧反极性行为**标定，正确语义下拿不到；不是代码 bug，是基线要改（**只能按证据改**，
不能为了绿而放宽）：

| 断言 | 旧值（反极性） | 正确语义下的实测 | 依据 |
|---|---|---|---|
| `tests/smartscript.session.test.ts:67` 606 帧数 | 1132 | **601** | `TwisterSword 105 + CreateTwisterSword 281 + Attack 280 ≈ 666`，嵌套 WAIT 折叠 |
| 同上 `s.frames.length > 1000` | >1000 | 601 | 同上 |
| `:184` 606 同步指令 | 528080 | **358291** | 逐帧时间线短了，指令自然少 |
| `tests/smartscript.test.ts:173` 神鬼亂舞 hits | ≥3 | **1** | 伤害在 `0x314 LockTargetXY` 另一实例里（L0 未补） |
| `tests/smartscript_audio.test.ts:134` 音量 | 200/230 | 只有 200 | 503 同步在 `pc=0xac40` 撞 1200 帧（L0 未补） |

⇒ **建议顺序**：先做 L0（并发实例）再改 L1-L4，则上表 5 条大多能自然回到旧值，不必改基线。
若先改 L1-L4，则必须同批改这 5 条基线并留证据。

### L6 验证矩阵（落地后照抄执行）

```powershell
cd F:\sanguo\game
npm.cmd exec -- tsc --noEmit                        # 必须 exit 0
npm.cmd exec -- tsc -p tsconfig.build.json           # 出 dist（保真网用）
node --test tests/r50_r67.test.ts                    # R67 5 条必须绿（G2/G3 桥的哨兵）
node --test tests/r87_waitfor.test.ts                # 旋龍/WAITFOR：L0 未做时会红在 1200 帧
node --test tests/smartscript.session.test.ts        # 606 两条（帧数/指令数看 L5）
node --test tests/smartscript_audio.test.ts          # R52 音量（L0 未做时缺 230/255）
node --test tests/smartscript.test.ts                # 神鬼亂舞 hits（L0 未做时 =1）
node ..\work\vmfix_units.mjs                         # 7 条补兵技：42→44、markSummon=2、m:0
node --test tests/*.test.ts                          # 全量：目标 1272/1272（或按 L5 重定后的条数）
node F:\sanguo\work\fidelity\check.mjs               # PASS 458 / FAIL 0 / SKIP 3 / WARN 1
```

---

## 6. 阴性对照（关键改动改回去必须能红，全部有日志）

**(a) 极性改回 EXE 语义（`0x3d` 变成 `===0` 跳）** ⇒ 606 从 1132 帧塌到 **601 帧 / 358291 指令**，
`tests/smartscript.session.test.ts:67` 与 `:184` 两条红（断言 `帧数>1000`、`指令>400_000`），
`tests/smartscript_audio.test.ts:134` 红（只拿到 `0.784…`×3，缺 `230/255`）。

**(b) G2/G3 桥加回去（极性保持旧的）** ⇒ `Hurt` 的门变成"受害者 ∈ {G2,G3} ⇒ 只放 Hit01 音"，
`tests/r50_r67.test.ts` 5 条红（`0x125 必须被调用一次，actual 0`）⇒ 证明「填 G2/G3」与「改极性」必须同进同退。

**(c) `MAX_SKILL_FRAMES` 1200 → 4000** ⇒ `R80 真跑一场战斗` 红（`战斗应在 1200 tick 内结束`）、
`R52 49 号` 发声点数 3 → 8、旋龍仍在 `pc=0x117E4` 截断 ⇒ 证明是死等轮询而非慢。

**(d) CALLS 单独改（极性不动）** ⇒ 全量仍 1272/0，但补兵 0 兵 ⇒ 证明单改 CALLS 无效。

---

## 7. 没做到的 / 未解

1. **没做到「7 条补兵技出兵 + 全量 1272 同绿」**：缺口是 §5 L0 的并发脚本实例。原作里 object 可附着脚本、
   `0x312`/`0x314` 是 invoke-by-name 的延迟/异步版本（host `0x420C43`/`0x420CAD` 已确认走同一 `0x4653F0`），
   端口 `SkillRun` 是「一条 VM + 同栈内联」，虚拟帧求和而非取最大，`0x12(物件)` 轮询等不到自己死。
2. **终态全量未复跑**（按 lead 指示）：本轮期间 `game/src/core/battle.ts` 正被 `i1-move-grid`（R158 移动/步进
   重写）改写，12:59–13:04 之间 `tsc` 红在 `tests/retreat.test.ts:26-27`（`MOVE_PER_TICK`/`RETREAT_SPEED`
   已被 i1 删除、测试未同步），13:04 后 i1 已修好、`tsc` 回到 exit 0。曾把风险（i1 的 base 可能带回 G2/G3 桥
   ⇒ R67 变红）报给 lead；**复跑全量的时机由 lead 定**。
3. `[未解]` `0x41F740` → `0x4650E0` 的第 5 个实参（从栈上取、"垃圾"值）到底传什么。
4. `[未解]` `0x4A6664`（`0x43BA59` 与 `0x4448B2` 都把它置 1）的语义：疑似「有技能在跑」的战斗态标志。
5. `[未解]` `G[3]` 在 `0x4448B2` 这条入口不被写 ⇒ 若上一场 G3 未清，`Hurt` 可能命中"上一场的主将句柄"；
   端口侧应「每场开局清 G2/G3」（`InitializeBattle` 只清脚本 g1/g3，不清引擎 G3）。
6. `[推测]` 小兵在原作里的受伤通路（不走 `Hurt`）：`0x1000E` 的接收侧在 `0x482160/0x482D98/0x48326C`
   三张分派数据里，未逐条追。端口目前是自建桥（普攻 → `Hurt`），语义上等价「主将走 0x125、士兵 hp 1→0」。

---

## 8. 复现命令（证据侧）

```powershell
$py = 'C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
& $py F:\sanguo\work\g2g3\xd.py 0x43BA59 140          # 写入者本体（G2/G3/G5）
& $py F:\sanguo\work\g2g3\xd.py 0x463ED0 40           # binop 左右序
& $py F:\sanguo\work\g2g3\xd.py 0x464660 60           # 0x3C/0x3D 极性
& $py F:\sanguo\work\g2g3\xd.py 0x421AD2 30           # ptr → 句柄
& $py F:\sanguo\work\g2g3\xd.py 0x421A80 60           # 句柄 → ptr（对象表 0x4A64A0）
& $py F:\sanguo\work\g2g3\xd.py --callers 0x43BA59    # 11 个调用点
& $py F:\sanguo\work\g2g3\xref2.py                    # 0x4A6878 全 EXE 引用（26 处）
```

> 注意：`work/g2g3/` 下的脚本不要命名成 `dis.py`（遮蔽 stdlib `dis`，capstone 导入循环）。
> 中文文件**只能**用 write/edit 工具或 python（utf-8 无 BOM）改；PowerShell 5.1 的
> `Get-Content` 按 GBK 解码 UTF-8、`Get-Content | Set-Content` 会写坏整份文件（本轮踩过一次，§3 的
> `rebuild_battle.py` 就是从 `game/cocos/assets/scripts/core/battle.ts` 底本重建的）。
