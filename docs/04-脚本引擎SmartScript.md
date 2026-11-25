# 04 · 脚本引擎 SmartScript（三国群英传2 / Sango2.exe）

> 逆向对象：`Sango2.exe`（1999，宇峻奥汀，修正版 1.05+，682,496 字节，PE32，ImageBase 0x400000）
> 脚本文件：`SCRIPT\MAGIC.SO`（261,008 B）、`SCRIPT\SYSTEM.SO`（21,420 B），以及改版附带的 `.OLD` 原版备份
> 本文所有 EXE 地址均为 VA（虚拟地址），所有 `.SO` 地址均为文件内偏移。
> 标注约定：**[确认]** = 有反汇编/字节级证据；**[推测]** = 由相邻证据推断，尚未动态验证。

---

## 0. 结论速览

| 项目 | 结论 | 证据 |
|---|---|---|
| 解释器主循环 | `0x467F50`，每步取一个 dword 操作码，`op > 0x59` 即结束 | [确认] `cmp eax,0x59; ja …; call [eax*4+0x4A2A48]` |
| 调度表 | `0x4A2A48`，90 项（0x00–0x59），每项 `int handler(VM*)` | [确认] |
| 指令编码 | 定长 dword 操作码 + 0/1/2 个 dword 操作数 | [确认] 90 个 handler 的 `call 0x467E30` 次数统计 |
| 栈 | 8 字节槽 `{value:dword, type:dword}`，type 0=数值、2=字符串对象 | [确认] `0x467CE0/0x467D40/0x467CC0` |
| 变量空间 | 局部槽（frame 之上）、脚本全局槽 121 个（`ScriptObject+0x18`）、引擎全局 int 数组 64 个（`0x4A6878`） | [确认] |
| 函数调用 | `CALL` 操作数为 `.SO` 文件内绝对偏移；压返回地址 + 旧 frame，`frame=depth-1` | [确认] `0x463B60` |
| SYSCALL | `SYSCALL id, flags`；`0x4A69B0` 为 1024 项宿主函数指针表，启动时由 `0x420D52` 注册 **124** 项 | [确认] |
| 0x119 | 宿主 `0x42068C` → `0x43A971` → 返回对象句柄；脚本中 12 次、均为 3 参数 | [确认] 与说明文件“召唤伏兵高级兵”吻合 [推测] |
| 0x213–0x219 | `0x213 = strcpy`，`0x214–0x216` 读 u32/i16/i8，`0x217–0x219` 写 u32/u16/u8 | [确认] 完全验证说明文件 |
| MAGIC.SO 覆盖 | 463 函数 / 30,720 条指令 / unknown **0（0.000%）** | [确认] |
| SYSTEM.SO 覆盖 | 39 函数 / 2,311 条指令 / unknown **0（0.000%）** | [确认] |
| 函数边界自洽 | 每个函数解码后恰好停在下一函数入口，且以 RET/RETV 结束：`bad 0 / 463`、`bad 0 / 39` | [确认] |

---

## 1. 研究对象与方法

### 1.1 文件位置

| 文件 | 大小 | 说明 |
|---|---|---|
| `F:\sanguo\extract\pak\SCRIPT\MAGIC.SO` | 261,008 B | 全部武将技/军师技脚本（修正版 1.05+） |
| `F:\sanguo\extract\pak\SCRIPT\MAGIC.SO.OLD` | 259,496 B | 原版备份 |
| `F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO` | 21,420 B | 系统/战斗流程脚本（修正版） |
| `F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO.OLD` | 17,724 B | 原版备份 |

> 任务描述中的 `SCRIPT\` 目录并不存在，实际文件在解包目录 `extract\pak\SCRIPT\` 下。

### 1.2 工具链

* 反汇编：`capstone 5.0.9` + `pefile`，解释器固定为
  `C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`
* EXE 内存映射：`pe.get_memory_mapped_image()`，VA 与镜像偏移的关系为 `off = VA - 0x400000`。
* 自写工具（均在 `F:\sanguo\tools\`）：
  `sango_dis.py`（EXE 反汇编辅助）、`smartscript.py`（正式反汇编器）、`ss_stats.py`（栈深/规模）、
  `ss_verify.py`（函数边界校验）、`ss_use.py`（SYSCALL 使用面）、`ss_diff.py`（新旧版对比）、
  `ss_syscalls.py`（模拟 `0x420D52` 还原 syscall 表）、`ss_callee.py` / `ss_xref.py`（宿主函数与交叉引用）。

### 1.3 复现命令

```bat
python F:\sanguo\tools\smartscript.py F:\sanguo\extract\pak\SCRIPT\MAGIC.SO  -o F:\sanguo\export\script\magic_so.dis.txt
python F:\sanguo\tools\smartscript.py F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO -o F:\sanguo\export\script\system_so.dis.txt
python F:\sanguo\tools\ss_verify.py     :: 输出 bad 0 / 463、bad 0 / 39
```

---

## 2. 文件格式

### 2.1 头部（0x40 字节）

| 偏移 | 类型 | 值（MAGIC.SO） | 含义 |
|---|---|---|---|
| 0x00 | char[16] | `"Smart Script\0\0\0\0"` | 魔数（12 字节字符串 + 4 字节 0） |
| 0x10 | u32 | 0x00000100 | 版本号（1.00） |
| 0x14 | u32 | 0x00000040 | 代码区起点（恒 0x40） |
| 0x18 | u32 | 0x0003D548 | 符号表（函数表）偏移 |
| 0x1C | u32 | 0x000001CF (463) | 符号表项数 |
| 0x20 | u32 | 0x0003F238 | 字符串指针表偏移 |
| 0x24 | u32 | 0x00000244 (580) | 字符串指针表项数 |
| 0x28 | u32 | 0x00000079 (121) | **每个脚本对象的全局槽数量**（加载时按 `121*8+8` 分配，见 3.5） |
| 0x2C | u32 | 0x0003FB48 | 文件数据末尾（其后为 0x48 字节署名区） |
| 0x30 | u32 | 0xFFFFFFFF | 新版固定 -1；`.OLD` 为 0（用途不明） |
| 0x34 | u32 | 0xFFFFFFFF | 同上 |
| 0x38 | u32 | 0xFFFFFFFF | 同上 |
| 0x3C | u32 | 0xFFFFFFFF | 同上 |

### 2.2 四个文件实测

| 文件 | 大小 | sym_off | sym_cnt | str_off | str_cnt | +0x28 | data_end | 代码区 |
|---|---|---|---|---|---|---|---|---|
| MAGIC.SO | 261,008 (0x3FB90) | 0x3D548 | 463 | 0x3F238 | 580 | 0x79 | 0x3FB48 | 0x40–0x3B6A0 |
| MAGIC.SO.OLD | 259,496 (0x3F5A8) | 0x3D460 | 454 | 0x3F0C0 | 314 | 0x79 | 0x3F5A8-0x48 | 0x40–0x3C435 |
| SYSTEM.SO | 21,420 (0x53AC) | 0x4FB4 | 39 | 0x5224 | 80 | 0x79 | 0x5364 | 0x40–0x4AE8 |
| SYSTEM.SO.OLD | 17,724 (0x453C) | 0x42C8 | 29 | 0x4498 | 41 | 0x79 | 0x453C-0x48 | 0x40–0x4059 |

### 2.3 段布局

```
+0x00  头部 0x40 字节
+0x40  代码区（dword 记号流，函数入口由符号表给出）
        ↓ 函数名串区起点 = 字符串指针表中的最小指针值
       函数名串区（NUL 结尾、4 字节对齐；MAGIC 0x3B6A0 起 580 个串 / SYSTEM 0x4AE8 起 80 个串）
       ↓
       符号表（16 字节/项）
       ↓
       字符串指针表（u32 文件偏移，加载时逐项 +base 变成指针）
       ↓
       0x48 字节署名区
```

关键点：**代码区终点不是符号表偏移**，而是函数名串区的起点。若把名字串当代码线性扫描，会得到 5%–10% 的假“未知操作码”。反汇编器用 `min(字符串指针表)` 作为代码终点后，未知率立刻降为 0。

名字串区之后是符号表，再之后才是字符串指针表——顺序与头部字段的书写顺序（sym 在前、str 在后）一致，但 `sym_off < str_off` 并不意味着符号表紧跟代码区。

### 2.4 符号表项（16 字节）

| 偏移 | 类型 | 含义 |
|---|---|---|
| +0 | u32 | 函数代码偏移（文件内绝对偏移，即 `CALL` 的操作数） |
| +4 | u32 | 参数个数 argc（0–10） |
| +8 | u32 | 函数名字符串的文件偏移 |
| +0xC | u32 | 编号：底层原语为 0；武将技为 0x1F5+（Magic1=0x1F5 … Magic110=0x262，Magic200=0x2BC）；回调为 0x3E8/0xBB9/0x4269 等 |

`MAGIC.SO` 的 463 项 = 约 350 个底层原语（`Hurt`、`Thunder`、`CreateFireRing`、`CreateHolyLight`…）+ 111 个 `MagicN` 入口桩；`SYSTEM.SO` 39 项（`GetByte_Old`、`StartBattle`、`MoveCamera`、`BattleYield`…）。

### 2.5 字符串指针表

* 项数 = 名字总数（MAGIC 580 / SYSTEM 80），每项是**文件内偏移**，指向名字串区。
* 加载器 `0x468060` 会把每一项加上文件缓冲基址，改写成绝对指针，存入 `ScriptObject+0x14` 指向的数组。
* `PUSHS idx` 的 idx 就是该表下标；反汇编器直接用它解出 `"magic\016\*"`、`"m016snd01"` 这类字面量。
* 文本编码为 **cp950/Big5**（不是 GBK）：`A9 52 C0 F8 B3 4E` → `命療術`。

### 2.6 尾部署名

四个文件在 `data_end` 之后都有同一段 0x48 字节的 ASCII 署名：

```
Script Object Creator: Henryshow
Pseudo Compiler Author: Allen Zhou
```

这解释了为什么修改版能往 `.SO` 里加脚本：作者保留了原编译器的容器格式。

---

## 3. 虚拟机模型

### 3.1 对象布局（`VM`，0x48 字节，ctor `0x467AA0`，vtable `0x47F5D0`）

| 偏移 | 类型 | 含义 |
|---|---|---|
| +0x00 | void** | vtable（只有析构） |
| +0x04 | u32 | 保留 |
| +0x08 | ScriptObject* | 所属脚本对象（提供代码缓冲、字符串表、全局槽） |
| +0x0C | u32 | 当前脚本号（`RunById` 的 id） |
| +0x10 | u32 | **pc**：下一条指令的文件内绝对偏移 |
| +0x14 | u32 | **frame**：当前函数栈基（槽下标） |
| +0x18 | u32 | 栈深（已用槽数） |
| +0x1C | Slot* | 栈数组（8 字节/槽） |
| +0x20 | u32 | 栈容量（初值 0x20，按 0x20 递增） |
| +0x24 | u32 | 脚本对象 id / 管理器索引 |
| +0x28 | void* | 等待回调（`WAIT` 用） |
| +0x2C | void* | 等待回调参数（字符串对象等） |
| +0x30 | u32 | 等待回调参数类型 |
| +0x34 | u32 | 最近一次 `pop` 的类型（0 数值 / 2 字符串） |
| +0x38 | u32 | 标志 |
| +0x3C/+0x40/+0x44 | — | 内部指针 |

### 3.2 栈槽与类型

```c
struct Slot { uint32_t value; uint32_t type; };   // 8 字节
// type == 0：数值。整数与浮点共用 type 0，由指令区分（ADD/FADD…）
// type == 2：字符串对象指针（16 字节对象，见 3.6）
```

栈操作 API：

| 函数 | 语义 |
|---|---|
| `0x467C20` | 扩容到至少 n 槽（每次 +0x20） |
| `0x467CC0` | pop：返回 value，把 type 写入 `VM+0x34`；空栈返回 0 |
| `0x467CE0` | push 整数（type 0） |
| `0x467D10` | push 浮点（type 0） |
| `0x467D40` | push 引用/字符串（type 2） |
| `0x467D70` | push n 个 0（`PUSHN`） |

### 3.3 调用约定与栈帧

```c
// 调用前：调用者按 从右到左 压入实参（argN … arg1，arg1 在栈顶）
CALL target:
    push(pc_next);          // 返回地址 = CALL 指令之后的位置
    push(frame);            // 旧 frame
    frame = depth - 1;      // 指向“旧 frame”槽
    pc = target;            // target 是 .SO 文件内绝对偏移

// 被调用者看到的栈（自高到低）：
//   [frame+0] 旧 frame      ← 编译器不使用 loc0
//   [frame-1] 返回地址
//   [frame-2] arg1
//   [frame-3] arg2 ...
```

因此：

* 参数 k 的槽位下标 = `-(k+1)`：`arg1 → -2`、`arg2 → -3` …（反汇编器据此打印 `LDSL arg1`）。
* 局部变量从 `loc1` 开始（`PUSHN n` 之后可用 `loc1..locn`；`loc0` 是旧 frame 槽，脚本从不使用）。
* `RET n` / `RETV n` 的 `n` 是**调用者压入的参数个数**，返回时用于清栈。

### 3.4 返回指令

`RETV n`（0x01，有返回值）：

1. pop 返回值（暂存 value/type）；
2. `while (depth > frame+1) pop`（释放沿途 type 2 字符串）；
3. `depth = frame+1`；pop 恢复 `frame`；
4. pop 返回地址；
5. 再 pop n 个实参；
6. 把返回值 push 回去；
7. 若返回地址 != 0 则 `pc = 返回地址` 并返回 1；否则返回 -1（VM 结束）。

`RET n`（0x02，无返回值）同上，但第 6 步不 push。

### 3.5 变量空间

| 空间 | 位置 | 数量 | 访问指令 |
|---|---|---|---|
| 局部变量 | 栈上 `frame+idx` | 由 `PUSHN` 决定 | `LDSL/STL/INCL/DECL/LDSLS`、`*IDX` |
| 脚本全局 | `ScriptObject+0x18` 数组，8 字节/槽 | **121**（头部 +0x28 = 0x79） | `LDSG/STG/INCG/DECG/LDSGS`、`*IDX` |
| 引擎全局 | `0x4A6878` 起 64 个 dword | **64** | `LDG/STE/INCE/DECE/LDGIDX` 等 |

* 脚本全局槽在加载时 `calloc(0x79*8+8)`，全零，脚本之间**不共享**（每个 `ScriptObject` 一份）。
* 引擎全局是**进程级**的整数数组，脚本通过 `LDG 2` / `LDG 3` / `LDG 5` 读取“施法者 / 目标 / 方向”等战斗上下文；其赋值点在战斗流程代码里，未定位（[推测] 由 `0x4A6878` 的写入者设置）。
* 引擎全局数组的访问**没有边界检查**（`cmp 0x40` 之后是两条 nop）；修改版的“任意内存读写脚本”正是利用这一点：把 `0x4A6878` 当基址，`(addr-0x4A6878)>>2` 当下标。

### 3.6 字符串对象（16 字节）

| 偏移 | 类型 | 含义 |
|---|---|---|
| +0 | u8 | 类型标志 |
| +4 | char* | 字符数据指针；数据前 1 字节是引用计数 |
| +8 | u32 | 长度 |
| +0xC | u32 | 容量 |

分配 `0x46E430`（operator new 包装，16 字节），释放 `0x46E420`（引用计数减 1，归零则 free 数据与对象）。`PUSHS` 会新建对象并拷贝；`LDSL` 遇到字符串槽会克隆后再压栈，因此字符串在栈上按值语义传递。

### 3.7 生命周期与调度

* 所有活动 VM 挂在一个全局 vector：`begin 0x4A686C` / `end 0x4A6870` / `cap 0x4A6874`。
* `0x465700` 是 VM 管理器的 Update：遍历 vector，对每个 VM 调 `0x467F10`；返回 -1 说明脚本结束，从 vector 移除并调用 `[vtable](1)` 销毁。
* `0x467F10`：若 `0x467E70()` 返回 0（没有等待/可继续），就循环 `0x467F50` 单步，直到某条指令返回非 1。
* **`WAIT n`（0x42）**：弹出 n，把全局 `0x4A6860` 设为倒计时回调 `0x467320`（`(*p)--; return *p>0`），再由 `0x467E50` 复制到 `VM+0x28/+0x2C/+0x30`；`0x467E70` 每帧调用该回调，返回 0 时恢复执行。→ **脚本暂停 n 帧**，这是所有技能动画的节奏控制手段（MAGIC.SO 中出现 588 次）。

### 3.8 加载器与脚本注册表

| 函数 | 作用 |
|---|---|
| `0x464F60` | 资源管理入口：id 0..9 → `[0x4A6980+id*4]`，新建 0x1C 字节 `ScriptObject` 后调 `0x468060(name)` |
| `0x468060` | 读文件、校验、重定位字符串指针表、分配 121 个全局槽 |
| `0x468160` | `findById`：按 16 字节项的 `+0xC` 编号查找 |
| `0x4681A0` | `findByName`：按 `+8` 名字串查找 |
| `0x468230` | `getPtrByIdx`：取字符串表第 i 项 |
| `0x4650E0` | `RunById(scriptId, args…)`：找函数项 → 建 VM → 压参 → 初始化 → 注册到 vector |
| `0x4653F0` | `RunByName(name, args…)`：按名字运行脚本函数（`CALLS` 与 syscall 0x310–0x314 用它） |

`0x468060` 的关键步骤（反汇编顺序）：

```
OpenFile / GetFileSize / malloc / ReadFile / Close
obj->buf      = file_buffer          // [+4]
obj->symcnt   = header[0x1C]         // [+8]
obj->symtab   = buf + header[0x18]   // [+0xC]
obj->strcnt   = header[0x24]         // [+0x10]
obj->strtab   = buf + header[0x20]   // [+0x14]（逐项 += buf 重定位）
obj->globals  = calloc(0x79*8 + 8)   // [+0x18]
```

---

## 4. 指令集

### 4.1 编码

* 代码是 **dword 流**，小端。
* 每条指令 = `u32 opcode` + `0/1/2` 个 `u32` 操作数。
* 操作数格式只有 6 种：

| 格式 | 含义 |
|---|---|
| `imm32` | 立即数（有符号） |
| `offset` | `.SO` 文件内绝对偏移（CALL / JMP / JZ / JNZ 的目标） |
| `str#` | 字符串表下标 |
| `slot` | 栈槽索引（负数=参数，正数=局部） |
| `id, flags` | SYSCALL：id + `(ret<<16)|argc` |
| `val, target` | CASE：比较值 + 跳转目标 |

操作数个数不是猜的：对每个 handler 做 CFG 遍历，统计它到 `call 0x467E30`（fetch）的可达次数，得到权威表；再用“每个函数必须恰好止于下一函数入口”做交叉校验（463/463、39/39 全部通过）。

### 4.2 完整指令表（0x00–0x59，90 条）

计数列为该指令在 MAGIC.SO / SYSTEM.SO 中出现的次数（0 表示脚本未使用）。

| 操作码 | 助记符 | 操作数 | MAGIC | SYSTEM | 语义 |
|---|---|---|---|---|---|
| 0x00 | `NOP` | — | 0 | 0 | 空操作 |
| 0x01 | `RETV` | imm32 | 36 | 11 | 函数返回并带回返回值；n = 调用者压入的参数个数（用于清栈） |
| 0x02 | `RET` | imm32 | 469 | 37 | 函数返回（无返回值）；n = 参数个数 |
| 0x03 | `PUSHN` | imm32 | 319 | 26 | 压 n 个 0，为局部变量预留槽位 |
| 0x04 | `CALL` | offset | 392 | 20 | 调用脚本内函数，target 为 .SO 文件内绝对偏移 |
| 0x05 | `SYSCALL` | id, flags | 3596 | 369 | 调用宿主 API（syscall）；id 为 0..0x3FF，flags 低 16 位=参数个数，高 16 位=返回处理（0 无/1,2 整数/3 字符串） |
| 0x06 | `PUSHI` | imm32 | 9307 | 672 | 压入 32 位立即数（整数） |
| 0x07 | `PUSHS` | str# | 894 | 61 | 压入字符串表中的第 idx 个字符串（新建字符串对象） |
| 0x08 | `LDSL` | slot | 6217 | 300 | 读局部槽（frame+idx）；若为字符串则克隆一份再压栈 |
| 0x09 | `LDSG` | slot | 128 | 2 | 读脚本全局槽 idx（0..120） |
| 0x0A | `LDG` | imm32 | 781 | 115 | 读引擎全局整型数组 0x4A6878[idx]（idx 0..0x3F） |
| 0x0B | `STL` | slot | 1913 | 186 | 弹出值写入局部槽 frame+idx |
| 0x0C | `STG` | slot | 107 | 5 | 弹出值写入脚本全局槽 idx |
| 0x0D | `STE` | imm32 | 2 | 0 | 弹出值写入引擎全局数组 0x4A6878[idx] |
| 0x0E | `POP` | — | 43 | 8 | 弹出并丢弃栈顶（字符串则释放） |
| 0x0F | `ADD` | — | 730 | 38 | 整数加：b + a |
| 0x10 | `FADD` | — | 0 | 0 | 浮点加 |
| 0x11 | `OP11` | — | 0 | 0 | 字符串比较辅助（脚本中未出现） |
| 0x12 | `SUB` | — | 559 | 29 | 整数减：b - a |
| 0x13 | `FSUB` | — | 0 | 0 | 浮点减 |
| 0x14 | `MUL` | — | 330 | 9 | 整数乘 |
| 0x15 | `FMUL` | — | 1 | 0 | 浮点乘 |
| 0x16 | `DIV` | — | 118 | 13 | 整数除：b / a（商） |
| 0x17 | `FDIV` | — | 2 | 0 | 浮点除 |
| 0x18 | `MOD` | — | 10 | 0 | 整数取余：b % a |
| 0x19 | `OP19` | — | 0 | 0 | 未实现/占位：弹两个值后固定压 0（脚本中未出现） |
| 0x1A | `NEG` | — | 240 | 11 | 整数取负 |
| 0x1B | `FNEG` | — | 0 | 0 | 浮点取负 |
| 0x1C | `NOT` | — | 0 | 0 | 按位取反 |
| 0x1D | `INCL` | slot | 202 | 3 | 局部槽 idx 自增（字符串槽跳过） |
| 0x1E | `INCG` | slot | 4 | 0 | 脚本全局槽 idx 自增 |
| 0x1F | `INCE` | imm32 | 0 | 0 | 引擎全局数组 idx 自增（idx < 0x40） |
| 0x20 | `DECL` | slot | 54 | 7 | 局部槽 idx 自减 |
| 0x21 | `DECG` | slot | 2 | 0 | 脚本全局槽 idx 自减 |
| 0x22 | `DECE` | imm32 | 0 | 0 | 引擎全局数组 idx 自减 |
| 0x23 | `AND` | — | 64 | 26 | 按位与 |
| 0x24 | `OR` | — | 16 | 14 | 按位或 |
| 0x25 | `XOR` | — | 98 | 0 | 按位异或 |
| 0x26 | `EQ` | — | 425 | 32 | 整数相等比较，结果 0/1 |
| 0x27 | `EQ` | — | 0 | 0 | 同 0x26（编译器产生的重复表项） |
| 0x28 | `STREQ` | — | 0 | 0 | 字符串相等比较（非字符串操作数先转字符串） |
| 0x29 | `NE` | — | 33 | 11 | 整数不等 |
| 0x2A | `NE` | — | 1 | 0 | 同 0x29（重复表项） |
| 0x2B | `STRNE` | — | 0 | 0 | 字符串不等 |
| 0x2C | `GT` | — | 153 | 11 | 整数大于：b > a |
| 0x2D | `FGT` | — | 0 | 0 | 浮点大于 |
| 0x2E | `STRGT` | — | 0 | 0 | 字符串大于 |
| 0x2F | `GE` | — | 63 | 0 | 整数大于等于 |
| 0x30 | `FGE` | — | 4 | 0 | 浮点大于等于 |
| 0x31 | `STRGE` | — | 0 | 0 | 字符串大于等于 |
| 0x32 | `LT` | — | 252 | 7 | 整数小于 |
| 0x33 | `FLT` | — | 4 | 0 | 浮点小于 |
| 0x34 | `STRLT` | — | 0 | 0 | 字符串小于 |
| 0x35 | `LE` | — | 54 | 0 | 整数小于等于 |
| 0x36 | `FLE` | — | 0 | 0 | 浮点小于等于 |
| 0x37 | `STRLE` | — | 0 | 0 | 字符串小于等于 |
| 0x38 | `LNOT` | — | 9 | 0 | 逻辑非：非 0 → 0，0 → 1 |
| 0x39 | `LAND` | — | 29 | 3 | 逻辑与：两操作数均非 0 → 1 |
| 0x3A | `LOR` | — | 25 | 1 | 逻辑或 |
| 0x3B | `JMP` | offset | 750 | 97 | 无条件跳转；target 为 .SO 文件内绝对偏移 |
| 0x3C | `JZ` | offset | 53 | 3 | 条件跳转：弹出条件，为 0 时跳转 |
| 0x3D | `JNZ` | offset | 1005 | 58 | 条件跳转：弹出条件，非 0 时跳转 |
| 0x3E | `SHL` | — | 10 | 10 | 左移：b << a |
| 0x3F | `SHR` | — | 24 | 24 | 算术右移：b >> a |
| 0x40 | `CASE` | val, target | 71 | 53 | switch 分支：弹出值，若等于 imm 则跳到 target，否则把值压回供下一个 CASE 比较 |
| 0x41 | `NOP` | — | 0 | 0 | 空操作（重复表项） |
| 0x42 | `WAIT` | — | 588 | 16 | 等待 n 帧：挂起本 VM，n 递减到 0 再继续（动画节奏） |
| 0x43 | `NOP` | — | 0 | 0 | 空操作（重复表项） |
| 0x44 | `NOP` | — | 0 | 0 | 空操作（重复表项） |
| 0x45 | `WAITFOR` | — | 62 | 2 | 等待名为 name 的脚本结束：弹名字串，轮询活动 VM 列表直到同名函数消失（同步点） |
| 0x46 | `FINDVM` | — | 0 | 0 | 按名字查找活动 VM，压入其句柄（0/非 0）；脚本中未出现 |
| 0x47 | `CALLS` | — | 329 | 1 | 按名字调用另一脚本函数，带 4 个参数：name, a, b, c, d（name 最先压栈） |
| 0x48 | `I2F` | — | 6 | 0 | 整数转浮点 |
| 0x49 | `I2S` | — | 0 | 0 | 整数转字符串对象 |
| 0x4A | `F2I` | — | 1 | 0 | 浮点转整数（截断） |
| 0x4B | `F2S` | — | 0 | 0 | 浮点转字符串对象 |
| 0x4C | `OP4C` | — | 0 | 0 | 弹出值并释放（字符串），然后压 0（脚本中未出现） |
| 0x4D | `OP4D` | — | 0 | 0 | 同 0x4C（重复表项，脚本中未出现） |
| 0x4E | `LDSLS` | slot | 58 | 0 | 读局部字符串槽 idx，克隆后压栈 |
| 0x4F | `LDSGS` | slot | 14 | 1 | 读脚本全局字符串槽 idx，克隆后压栈 |
| 0x50 | `LDGIDX` | imm32 | 8 | 10 | 引擎数组按下标读：先弹 idx，再取 base，读 0x4A6878[base+idx]（无边界检查） |
| 0x51 | `STLIDX` | imm32 | 22 | 0 | 局部槽按下标写：弹值、base、idx，写 frame+base+idx |
| 0x52 | `STGIDX` | imm32 | 26 | 2 | 脚本全局槽按下标写 |
| 0x53 | `STEIDX` | imm32 | 7 | 7 | 引擎数组按下标写 |
| 0x54 | `INCLIDX` | imm32 | 0 | 0 | 局部槽按下标自增 |
| 0x55 | `INCGIDX` | imm32 | 0 | 0 | 脚本全局槽按下标自增 |
| 0x56 | `INCEIDX` | imm32 | 0 | 0 | 引擎数组按下标自增 |
| 0x57 | `DECLIDX` | imm32 | 0 | 0 | 局部槽按下标自减 |
| 0x58 | `DECGIDX` | imm32 | 0 | 0 | 脚本全局槽按下标自减 |
| 0x59 | `DECEIDX` | imm32 | 0 | 0 | 引擎数组按下标自减 |

### 4.3 控制流细节

* **CALL（0x04）**：压返回地址与旧 frame，`frame=depth-1`；目标为文件内绝对偏移，反汇编器直接解析成函数名。
* **JMP/JZ/JNZ（0x3B–0x3D）**：操作数为绝对偏移；反汇编器在目标处生成 `Lxxxxx:` 标签。
* **switch 链（0x40 CASE）**：

```
CASE imm, target:
    v = pop();
    if (v == imm) pc = target;
    else push(v);          // 留给下一个 CASE 继续比较
```

因此编译器把 `switch` 编译成连续的 CASE，最后一个 CASE 之后跟一条 `POP` 丢弃未匹配的值（反汇编里能看到 `CASE … CASE … POP; JMP default`）。

* **CALLS（0x47）**：`PUSHS name; <a>; <b>; <c>; <d>; CALLS` → 调用脚本函数 `name(a,b,c,d)`。这是技能脚本复用“动画原语”的主要方式（MAGIC.SO 329 次，如 `CreateBlood`、`CreateDot`、`CreateLine`、`CreateDots`、`CreateLines`）。
* **SYSCALL（0x05）**：`id` 为 0..0x3FF；`flags` 低 16 位是参数个数（0–10，handler 用跳转表 `0x466424` 决定压几个实参），高 16 位是返回处理：0=不压返回值、1/2=压 int、3=压字符串。

### 4.4 几条“怪”指令

| 指令 | 现象 | 解释 |
|---|---|---|
| `0x11` | 弹两个值、按字符串比较 | 脚本中 0 次；疑似编译器为字符串比较生成的辅助，实际用 0x28/0x2B 等 |
| `0x19` | 弹两个值后固定 push 0 | 脚本中 0 次；保留/占位 |
| `0x45` | `PUSHS "MoveCamera"; WAITFOR` | 弹名字串，调用 `0x4658A0`→`0x464D70(0x465820, name, 2)` 设置等待回调；`0x465820` 在活动 VM 列表 0x4A686C 中按“当前函数名”查找，找到就继续挂起，找不到才恢复执行 → 等待同名脚本结束（MAGIC 62 次、SYSTEM 2 次） |
| `0x4C`/`0x4D` | 弹值（释放字符串）后 push 0 | 脚本中 0 次；疑似“清空表达式结果” |
| `0x41/0x43/0x44` | 与 0x00 同一个 handler（直接 `ret 1`） | 重复表项 / 编译器填充 |

---

## 5. SYSCALL 表

### 5.1 机制

| 地址 | 函数 | 说明 |
|---|---|---|
| `0x4A69B0` | `void* table[1024]` | syscall 函数指针表，id 0..0x3FF；静态镜像全 0 |
| `0x464D10` | `RegisterSyscall(id, fn)` | `if (id < 0x400) table[id] = fn;` |
| `0x464D30` | `GetSyscall(id)` | `id < 0x400 ? table[id] : 0x4689F0` |
| `0x4689F0` | 默认 handler | 函数体只有 `ret`（no-op） |
| `0x464D50` | `InitSyscallTable()` | `for (i=0;i<0x400;i++) Register(i, 0x4689F0);` |
| `0x420D52` | 注册表初始化 | 唯一调用 `0x464D50` 的函数，之后用展开的 `mov [eax], ecx; add eax,4` 逐项写入真实 handler |

`0x420D52` 的写法很特殊：它先把整张表填成 no-op，然后从 `0x4A69B4`（id 1）开始顺序写指针，遇到空洞用 `add eax,N` 跳过。因此**不能**靠搜索 `0x4A69B0` 的引用来找它（地址只出现一次），必须从 `0x420D52` 顺着模拟 `eax`。`ss_syscalls.py` 就是这样一个迷你模拟器，最终还原出 **124 个注册项**：

```
0x001-0x00B, 0x010-0x021, 0x023-0x031,
0x100-0x109, 0x10C-0x119, 0x120-0x125, 0x127-0x139,
0x200-0x209, 0x210-0x219, 0x300-0x303, 0x310-0x315, 0x380
```

未注册的 id 落到 `0x4689F0`（no-op），所以脚本调用一个不存在的 id 不会崩溃，只是什么都不做。

### 5.2 脚本实际使用的 SYSCALL（102 个）

下表按 id 排序；`次数` 为两文件合计，`argc/ret` 为脚本中实际使用的值，`宿主` 为 handler VA；`文件` 表示出现在哪个 `.SO`。

| id | 次数 | argc | ret | 宿主 | 语义 | 文件 |
|---|---|---|---|---|---|---|
| 0x001 | 5 | 4 | 0 | 0x41F8EF | 以 MagicDef 对象 [+4] 的脚本号运行脚本（4 参数） | MAGIC |
| 0x003 | 25 | 3 | 0 | 0x41F950 | 0x43483A(a,b,c) 后排队回调（动画节拍） | SYSTEM |
| 0x006 | 15 | 3 | 0 | 0x41F9C1 | 0x434885(a,b,c)（c≠0 时） | SYSTEM |
| 0x007 | 106 | 1 | 0 | 0x41F9E0 | 载入图形资源，名字如 "magic\000\*"（106 次） | MAGIC/SYSTEM |
| 0x008 | 4 | 1 | 0 | 0x41F9F1 | 资源/动画辅助（0x41F9F1，未细解） | MAGIC |
| 0x00A | 53 | 3 | 0 | 0x41FA3C | 0x41FA3C（SYSTEM 常用，未细解） | SYSTEM |
| 0x00B | 9 | 0 | 1 | 0x420D48 | 取当前脚本/单位句柄 [0x4A69A8]+0x24 | MAGIC/SYSTEM |
| 0x010 | 78 | 5 | 1 | 0x41FA7F | 在 (x,y,z) 创建对象/特效，返回句柄 | MAGIC/SYSTEM |
| 0x011 | 197 | 4 | 1 | 0x41FADE | 以单位坐标为基准创建对象（unit, dx,dy,dz） | MAGIC |
| 0x012 | 84 | 1 | 1 | 0x41FB30 | 单位存在性检查 | MAGIC |
| 0x013 | 94 | 1 | 0 | 0x41FB4E | 单位移除/死亡处理（校验 0x1234 魔数，遍历 0x4C2C04 链表） | MAGIC |
| 0x014 | 58 | 4 | 0 | 0x41FB77 | 0x422548(unit,a,b,c) | MAGIC |
| 0x015 | 104 | 5 | 0 | 0x41FBB8 | 两单位+坐标 → 0x468990（线段/距离计算） | MAGIC |
| 0x016 | 1 | 6 | 0 | 0x41FC36 | 0x41FC36（6 参数，未细解） | MAGIC |
| 0x017 | 40 | 3 | 0 | 0x41FD2B | 0x41FD2B（3 参数，未细解） | MAGIC/SYSTEM |
| 0x018 | 83 | 4 | 0 | 0x41FD63 | 0x422548(unit,a,b,c) | MAGIC/SYSTEM |
| 0x019 | 11 | 3 | 0 | 0x41FD98 | 0x41FD98（3 参数，未细解） | MAGIC |
| 0x01A | 15 | 1 | 1 | 0x41FDE0 | 0x41FDE0（1 参数，返回 int） | MAGIC |
| 0x01B | 149 | 3 | 0 | 0x41FE0A | 设置单位动画/帧（写 +0x5C、+0x60） | MAGIC/SYSTEM |
| 0x01C | 20 | 2 | 0 | 0x41FE45 | 0x41FE45（2 参数，未细解） | MAGIC/SYSTEM |
| 0x01D | 17 | 2 | 0 | 0x41FE86 | 0x41FE86（2 参数，未细解） | MAGIC/SYSTEM |
| 0x01E | 2 | 2 | 0 | 0x41FEAC | 0x41FEAC（2 参数，未细解） | MAGIC |
| 0x01F | 4 | 2 | 0 | 0x41FEFB | 0x41FEFB（2 参数，未细解） | MAGIC |
| 0x020 | 6 | 2 | 0 | 0x41FF21 | 0x41FF21（2 参数，未细解） | MAGIC |
| 0x021 | 9 | 2 | 0 | 0x41FF4A | 0x41FF4A（2 参数，未细解） | MAGIC |
| 0x023 | 4 | 3 | 1 | 0x41FF70 | 0x41FF70（3 参数，返回 int） | MAGIC |
| 0x024 | 1 | 4 | 1 | 0x420049 | 0x420049（4 参数，返回 int） | MAGIC |
| 0x025 | 37 | 2 | 0 | 0x420131 | 0x420131（2 参数，未细解） | MAGIC/SYSTEM |
| 0x026 | 138 | 3 | 0 | 0x42015E | 设置移动/动作指令：写 +0x8C=(a<<16)|b、+0x90=0x100000、+0x50=b，flags|=0x40000 | MAGIC/SYSTEM |
| 0x027 | 35 | 2 | 0 | 0x42018F | 0x42018F（2 参数，未细解） | MAGIC |
| 0x028 | 53 | 4 | 0 | 0x4201B5 | 0x4201B5（4 参数，未细解） | MAGIC |
| 0x029 | 94 | 2 | 0 | 0x42020E | 单位状态标志 |= arg（+0x30） | MAGIC |
| 0x02B | 33 | 2 | 0 | 0x420261 | 0x420261（2 参数，未细解） | MAGIC |
| 0x02C | 68 | 2 | 0 | 0x420291 | 写 [unit+0x98] | MAGIC |
| 0x02E | 37 | 3 | 0 | 0x4202E7 | 0x4202E7（3 参数，未细解） | MAGIC |
| 0x02F | 21 | 2 | 1 | 0x42031A | 0x42031A（2 参数，返回 int） | MAGIC |
| 0x031 | 5 | 2 | 0 | 0x420377 | 0x420377（2 参数，未细解） | MAGIC |
| 0x100 | 66 | 2 | 0 | 0x42039F | 设置脚本目标坐标（全局 0x4AC368/0x4AC370） | MAGIC/SYSTEM |
| 0x101 | 6 | 1 | 1 | 0x4203B4 | 单位所在格 X（x/0x60） | MAGIC |
| 0x102 | 6 | 1 | 1 | 0x4203FE | 单位所在格 Y（y/0x48） | MAGIC |
| 0x103 | 13 | 1 | 1 | 0x420448 | 格 X → 像素（i*0x60+0x30） | MAGIC/SYSTEM |
| 0x104 | 9 | 1 | 1 | 0x420459 | 格 Y → 像素（i*0x48+0x24） | SYSTEM |
| 0x105 | 207 | 1 | 1 | 0x42046A | 单位 X（定点 16.16，>>16） | MAGIC/SYSTEM |
| 0x106 | 169 | 1 | 1 | 0x420490 | 单位 Y | MAGIC/SYSTEM |
| 0x107 | 29 | 1 | 1 | 0x4204B6 | 单位 Z | MAGIC/SYSTEM |
| 0x108 | 24 | 1 | 1 | 0x4204DC | 像素 → 格 X（/0x60） | MAGIC |
| 0x109 | 1 | 1 | 1 | 0x4204ED | 像素 → 格 Y（/0x48） | MAGIC |
| 0x10C | 14 | 1 | 1 | 0x4204FE | 0x43A795(side) 取阵营对象 | MAGIC/SYSTEM |
| 0x10D | 24 | 1 | 1 | 0x420518 | 0x43A7AC(side) 遍历对象数组 | MAGIC |
| 0x110 | 46 | 0 | 0 | 0x4205A8 | 清 0x4A6660（战斗流程标志） | MAGIC/SYSTEM |
| 0x111 | 13 | 0 | 1 | 0x4205B2 | 取目标 X | MAGIC/SYSTEM |
| 0x112 | 5 | 0 | 1 | 0x4205BC | 取目标 Y | MAGIC/SYSTEM |
| 0x113 | 24 | 2 | 1 | 0x4205C6 | 0x43AFAA(a,b) → 对象 [+4] 句柄 | MAGIC |
| 0x114 | 2 | 1 | 0 | 0x420604 | 清 0x4A6660/0x4A6670，0x48E520=0x10 | SYSTEM |
| 0x115 | 5 | 1 | 1 | 0x420615 | 阵营判断（比较 vtable 0x4A8A60 / 0x4B03A0） | MAGIC |
| 0x116 | 2 | 1 | 1 | 0x420655 | 取 word[obj+0x2E]（符号扩展） | MAGIC |
| 0x117 | 4 | 1 | 1 | 0x420666 | 取 word[obj+0x12] | MAGIC |
| 0x118 | 1 | 2 | 0 | 0x420677 | 设 word[obj+0x12] = min(arg, word[obj+0x10]) | MAGIC |
| 0x119 | 12 | 3 | 1 | 0x42068C | 创建伏兵/对象数组元素，返回句柄（推测：说明文件称“召唤伏兵高级兵”，参数 x/y/类型） | MAGIC |
| 0x120 | 58 | 2 | 0 | 0x4206CE | 0x421E1B(unit,val) | MAGIC/SYSTEM |
| 0x121 | 48 | 2 | 0 | 0x42071C | [unit+0x3C] += val*0x28 | MAGIC |
| 0x122 | 2 | 0 | 0 | 0x42074F | 0x42074F（无参数，未细解） | MAGIC/SYSTEM |
| 0x123 | 2 | 0 | 0 | 0x420759 | 0x420759（无参数，未细解） | MAGIC/SYSTEM |
| 0x124 | 1 | 0 | 0 | 0x420763 | 0x444362（清标志） | SYSTEM |
| 0x125 | 4 | 3 | 0 | 0x42076D | 0x43ED96(unit,a,b) | MAGIC/SYSTEM |
| 0x127 | 1 | 2 | 0 | 0x4207AF | 0x43EE09(unit,val) | MAGIC |
| 0x128 | 93 | 2 | 0 | 0x4207DC | 写经 [unit+0x84] 取得对象的 [+0x40]+0x54 | MAGIC |
| 0x129 | 31 | 1 | 1 | 0x420809 | 0x43B375（单位/对象查询，返回 int） | MAGIC |
| 0x12A | 15 | 5 | 1 | 0x42081A | 0x43EEA9（5 参数，返回 int） | MAGIC |
| 0x12B | 15 | 6 | 1 | 0x42083B | 0x43EEE8（6 参数，返回 int） | MAGIC |
| 0x12D | 6 | 0 | 1 | 0x420887 | 0x420887（无参数，返回 int） | MAGIC |
| 0x12E | 3 | 0 | 1 | 0x420891 | 0x420891（无参数，返回 int） | MAGIC |
| 0x12F | 9 | 1 | 0 | 0x42089B | 置全局 0x48E520 = min(v,0x10)（亮度/强度） | MAGIC/SYSTEM |
| 0x130 | 3 | 0 | 1 | 0x4208AC | 读 0x48E520 | MAGIC/SYSTEM |
| 0x131 | 46 | 0 | 0 | 0x4208B6 | 置 0x4A6660 = 1 | MAGIC/SYSTEM |
| 0x132 | 11 | 0 | 1 | 0x4208C0 | 0x4208C0（无参数，返回 int） | MAGIC |
| 0x133 | 3 | 0 | 1 | 0x4208CA | 0x4208CA（无参数，返回 int） | MAGIC |
| 0x134 | 3 | 1 | 1 | 0x4208D4 | 0x4208D4（1 参数，返回 int） | MAGIC |
| 0x135 | 1 | 1 | 0 | 0x420916 | 0x46D0A0 + 0x43A73C（显示模式相关） | MAGIC |
| 0x136 | 1 | 0 | 0 | 0x420958 | 0x43A750 + 0x46B2A0（显示模式相关） | MAGIC |
| 0x138 | 2 | 1 | 0 | 0x4209B2 | 0x4209B2（1 参数，未细解） | MAGIC |
| 0x139 | 1 | 1 | 0 | 0x4209C3 | 0x443CF5（1 参数，未细解） | SYSTEM |
| 0x200 | 23 | 1 | 3 | 0x4209D4 | 参数原样返回（字符串/通用透传） | SYSTEM |
| 0x201 | 8 | 2 | 1 | 0x4209E6 | round(*(float*)addr * k) | MAGIC |
| 0x202 | 4 | 2 | 1 | 0x420A05 | round(*(float*)addr * k)（另一入口） | MAGIC |
| 0x203 | 1 | 0 | 1 | 0x420A24 | 屏幕中心 X（320/2） | SYSTEM |
| 0x204 | 1 | 0 | 1 | 0x420A4F | 屏幕中心 Y（240/2） | SYSTEM |
| 0x205 | 1 | 2 | 0 | 0x420A7A | 0x40D8F7（屏幕坐标换算） | SYSTEM |
| 0x206 | 4 | 1 | 1 | 0x420A8F | 屏幕区域判定，返回 0/1/2 | SYSTEM |
| 0x209 | 1 | 0 | 0 | 0x420AFE | 0x44ECC2（无参数，未细解） | SYSTEM |
| 0x210 | 1 | 0 | 0 | 0x420B08 | 0x44EDB4（无参数，未细解） | SYSTEM |
| 0x211 | 1 | 0 | 0 | 0x420B12 | 0x44EBE2（无参数，未细解） | SYSTEM |
| 0x212 | 4 | 0 | 1 | 0x420B1C | 读 [0x48CD28] | SYSTEM |
| 0x213 | 2 | 2 | 1 | 0x46DC60 | strcpy(dest, src) —— 向任意地址写字符串 | MAGIC/SYSTEM |
| 0x300 | 30 | 3 | 0 | 0x420B26 | 0x420B26（3 参数，未细解） | MAGIC/SYSTEM |
| 0x301 | 103 | 2 | 0 | 0x420B77 | 播放音效(name, vol)（0x4699A0） | MAGIC/SYSTEM |
| 0x303 | 750 | 2 | 1 | 0x420BAA | 随机数 rand(min,max)（750 次，最常用） | MAGIC/SYSTEM |
| 0x310 | 110 | 6 | 0 | 0x420BE9 | 按名字调用脚本，6 参数 | MAGIC |
| 0x311 | 48 | 7 | 0 | 0x420C14 | 按名字调用脚本，7 参数 | MAGIC |
| 0x312 | 10 | 8 | 0 | 0x420C43 | 按名字调用脚本，8 参数 | MAGIC |
| 0x313 | 2 | 9 | 0 | 0x420C76 | 按名字调用脚本，9 参数 | MAGIC |
| 0x314 | 105 | 10 | 0 | 0x420CAD | 按名字调用脚本，10 参数 | MAGIC |

### 5.3 验证 0x119（召唤伏兵高级兵）

* 宿主 `0x42068C` → `0x43A971(a,b,c)` → 返回 `[obj+4]` 句柄（[确认] 反汇编）。
* MAGIC.SO 中出现 12 次，**全部**是 `SYSCALL 0x119, 0x10003`（argc=3、ret=1），参数模式为“x、y、类型”或“单位坐标 ± 偏移、方向”。
* 说明文件（`群英2修正版1.05+说明.txt`）称 0x119 用于“召唤伏兵高级兵，x 坐标 +0x10000”。这与 3 参数、返回对象句柄的形态一致；`0x43A971` 内部创建对象数组元素，具体字段未逐行展开 —— 语义判定为 **[推测]**，调用形态为 **[确认]**。

### 5.4 验证 0x213–0x219（读写游戏内存）

| id | 宿主 | 反汇编语义 |
|---|---|---|
| 0x213 | `0x46DC60` | `strcpy(dest, src)`：`edi=[esp+8]`、`esi=[esp+4]`，逐字节拷贝含结尾 0 |
| 0x214 | `0x4214D7` | `return *(u32*)addr;` |
| 0x215 | `0x4214DE` | `return *(i16*)addr;` |
| 0x216 | `0x4214E6` | `return *(i8*)addr;` |
| 0x217 | `0x4214EE` | `*(u32*)addr = v;` |
| 0x218 | `0x4214F9` | `*(u16*)addr = v;` |
| 0x219 | `0x421505` | `*(u8*)addr = v;` |

完全验证说明文件的断言。配套的脚本层封装在 SYSTEM.SO/MAGIC.SO 中：

```
GetByte_Old(addr)    → 取 dword、按 addr&3 右移 8*(addr&3)、&0xFF
GetShort_Old(addr)   → 取相邻两个 dword 组合
GetInt_Old(addr)     → 直接 SYSCALL 0x214(addr)
SetByte_Old(addr,v)  → 读-改-写，用 SYSCALL 0x219
SetString_Old(addr,s)→ SetInt_Old(0x4A71FC, 0x46DC60); SYSCALL 0x213(addr, s)
```

`SetString_Old` 里那句 `SetInt_Old(0x4A71FC, 0x46DC60)` 是把 `strcpy` 的函数指针写进一个全局函数指针槽（0x4A71FC），再调用 0x213 —— 说明改版作者用“写内存”脚本本身来传递宿主函数地址，属于自举技巧。

---

## 6. 脚本如何被游戏调用

### 6.1 启动时加载

`0x41F7EC` 的循环（[确认]）：

```c
for (i = 0; i < *(int*)0x4A649C; i++) {
    char* name = ((char**)0x4C2C20)[i];
    if (LoadScriptResource(name) == -1)          // 0x464F60
        printf("Can't find Script file : %s.", name);
}
```

`0x464F60` 内部按 id 0..9 建立脚本对象数组 `0x4A6980`：`MAGIC.SO` 与 `SYSTEM.SO` 各占一个槽（具体 id 由名字表顺序决定）。

### 6.2 MAGIC.INI → MagicDef → 脚本

`0x41F740(def, a, b, c, d)`（[确认]）：

```c
int scriptId = *(int*)(def + 4);        // 0x421AD2(def)
return RunById(scriptId, a, b, c, d);   // 0x4650E0
```

失败时打印 `"Can't open script %d"`（字符串 `0x48A15C`）。

结合 `Allocate MagicDef fail !!`（`0x486939`）与 `MagicDef` 这个命名，可以确定存在一个“技能定义”结构，`+4` 字段是脚本号 [确认]；该结构由 MAGIC.INI 的字段填充 [推测，INI 解析属他人范围]。

### 6.3 RunById 的建帧过程（`0x4650E0`）

```
遍历 10 个脚本对象 → findById(scriptId) 找到 16 字节函数项
vm = new VM(0x467AA0)
for (i = 0; i < entry->argc; i++) push(宿主栈上的第 i 个参数)   // 0x467CE0
push(pc=0)            // 0x467DC0  返回地址占位
push(frame=0)         // 0x467DD0
frame = depth - 1     // 0x467E20
vm->setScript(scriptId, scriptObj)   // 0x467DE0
vm->setPC(entry->codeOffset)         // 0x467E00
vector.push_back(vm)                 // 0x4A686C
```

`0x4650E0` 按 `[entry+4]` 循环压入 argc 个参数，逐参压栈的具体顺序未逐行确认；脚本侧可观察到的结果是 `arg1 = frame-2`、`arg2 = frame-3`（即 arg1 位于栈顶方向、更靠近返回地址），这与 3.3 的栈帧图一致 [确认]。

### 6.4 技能释放时序（以 Heal 为例）

```
战斗系统：确定施法者/目标 → 填 MagicDef → 设置引擎全局槽（g2=施法者, g3=目标, g5=方向）
   ↓
0x41F740(def, …) → 0x4650E0 RunById(0x1F5=Magic1)
   ↓
Magic1: PUSHI 0; CALL Heal; RET 0
   ↓
Heal(arg1):
  载入 magic\000\*、magic\016\* 两组 SHP 资源（SYSCALL 7）
  SYSCALL 0x131() 置战斗标志；DownBrightness(8,5) 压暗画面
  SYSCALL 0x128(g2, 1) 锁定目标；取 g2 坐标 → SYSCALL 0x100(x, y-120) 设特效位置
  SYSCALL 0x121(g2, 5)：单位动作计时 += 5*0x28
  WAIT 20 → SYSCALL 0x120(g2,0x8000) → WAIT 10
  播放 m016snd01；CALL CreateHolyLight(g2, arg1)；WAIT 10
  SYSCALL 0x128(g2, 0)；WAIT 60；RaiseBrightness(16,5)；SYSCALL 0x110() 清标志
  RET 1
```

`WAIT` 把一条脚本拉长到 100+ 帧，正好覆盖施法动画时长；这也解释了为什么所有技能脚本都是“设置状态 → 播动画 → WAIT → 结算”的线性结构。

### 6.5 SYSTEM.SO 的调用

SYSTEM.SO 由战斗/剧情流程直接 `RunByName` 调用（`0x4653F0`），常见入口：

* `StartBattle(arg1)`：初始化双方阵型、镜头、天气（见 8.5）。
* `BattleYield`、`BattleEndTalk`、`SearchTalk`、`EnterWar4/7`、`MoveCamera`、`ProduceRain/Snow/Fog`。

`0x310–0x314`（6–10 参数）与 `CALLS`（4 参数）都是 `0x4653F0` 的包装，即“脚本调脚本”，形成原语库的分层。

### 6.6 THINGS.INI 的 `!xxxxx`

说明文件称 THINGS.INI 的动画序列里可以写 `!xxxxx` 启动脚本。EXE 中负责“按名字跑脚本”的只有 `0x4653F0`，其调用者包括 `0x467518`（`CALLS` handler）与 `0x420Cxx`（syscall 0x310–0x314）。因此 `!xxxxx` 的语义应是“按名字调用脚本函数” [推测]；具体解析在 INI/动画模块（他人范围），本文不展开。

---

## 7. 结构统计

### 7.1 规模

| 指标 | MAGIC.SO | SYSTEM.SO |
|---|---|---|
| 函数数 | 463 | 39 |
| 字符串字面量 | 580 | 80 |
| 代码字节 | 243,296（0x40–0x3B6A0） | 19,112（0x40–0x4AE8） |
| 指令数 | 30,720 | 2,311 |
| 未知操作码 | 0（0.000%） | 0（0.000%） |
| 使用的操作码 | 58 / 90 | 41 / 90 |
| 最大栈深 | **251**（Engulf，`PUSHN 245`） | **17**（StartBattle） |
| 有返回值函数（RETV） | 12 | 5 |
| 无返回值函数（RET） | 451 | 34 |
| SYSCALL 调用次数 | 3,596 | 369 |
| 不同 SYSCALL id | 86 | 46 |

### 7.2 栈深 Top（抽象解释，CALL 计入被调者 argc）

| MAGIC.SO | 深度 | SYSTEM.SO | 深度 |
|---|---|---|---|
| Engulf | 251 | StartBattle | 17 |
| CreateTwisterSword | 75 | ProduceSnow | 14 |
| CreateSpoutAround | 58 | BattleYield | 13 |
| CreateTwisterSwordAttack | 33 | ProduceRain | 11 |
| Thunder | 31 | ProduceFog | 11 |
| ConvexStone | 29 | EnterWar7 | 11 |
| RushCart | 28 | BattleEndTalk | 11 |
| Tornado | 27 | EnterWar4 | 10 |

### 7.3 指令频率 Top 20

| MAGIC.SO | 次数 | SYSTEM.SO | 次数 |
|---|---|---|---|
| PUSHI | 9,307 | PUSHI | 672 |
| LDSL | 6,217 | SYSCALL | 369 |
| SYSCALL | 3,596 | LDSL | 300 |
| STL | 1,913 | STL | 186 |
| JNZ | 1,005 | LDG | 115 |
| PUSHS | 894 | JMP | 97 |
| LDG | 781 | PUSHS | 61 |
| JMP | 750 | JNZ | 58 |
| ADD | 730 | CASE | 53 |
| WAIT | 588 | ADD | 38 |
| SUB | 559 | RET | 37 |
| RET | 469 | EQ | 32 |
| EQ | 425 | SUB | 29 |
| CALL | 392 | AND | 26 |
| MUL | 330 | PUSHN | 26 |
| CALLS | 329 | SHR | 24 |
| PUSHN | 319 | CALL | 20 |
| LT | 252 | WAIT | 16 |
| NEG | 240 | OR | 14 |
| INCL | 202 | DIV | 13 |

### 7.4 函数体积 Top

| MAGIC.SO | 指令数 | SYSTEM.SO | 指令数 |
|---|---|---|---|
| XTaiChi | 445 | StartBattle | 306 |
| StoneEmitter | 420 | EnterWar4 | 290 |
| FireWork | 405 | SearchTalk | 270 |
| Ice | 400 | BattleEndTalk | 145 |
| ArrowSupport | 398 | SetInt_Old | 128 |
| FireCow | 396 | ChildGenTalkNew | 113 |
| CreateFirePillar | 357 | EnterMapMoveCamera | 103 |
| XCreateFirePillar | 357 | ProduceSnow | 78 |

### 7.5 SYSCALL 频率 Top 20

| id | 次数 | 语义 |
|---|---|---|
| 0x303 | 750 | `rand(min,max)` |
| 0x105 | 207 | 取单位 X |
| 0x011 | 197 | 以单位坐标为基准创建对象 |
| 0x106 | 169 | 取单位 Y |
| 0x01B | 149 | 设置单位动画/帧 |
| 0x026 | 138 | 设置移动/动作指令 |
| 0x310 | 110 | 按名字调用脚本（6 参数） |
| 0x007 | 106 | 载入图形资源 |
| 0x314 | 105 | 按名字调用脚本（10 参数） |
| 0x015 | 104 | 线段/距离计算 |
| 0x301 | 103 | 播放音效 |
| 0x013 | 94 | 单位移除/死亡处理 |
| 0x029 | 94 | 单位状态标志 |= arg |
| 0x128 | 93 | 写对象 +0x40 的 +0x54 |
| 0x012 | 84 | 单位存在性检查 |
| 0x018 | 83 | 0x422548(unit,a,b,c) |
| 0x010 | 78 | 创建对象/特效 |
| 0x100 | 66 | 设置目标坐标 |
| 0x014 | 58 | 0x422548(unit,a,b,c) |
| 0x120 | 58 | 0x421E1B(unit,val) |

---

## 8. 典型脚本逐条解读

> 反汇编原文见 `F:\sanguo\export\script\magic_so.dis.txt` 与 `system_so.dis.txt`；下面给出等价伪代码。

### 8.1 `Heal`（MAGIC.SO @0x17F38，argc=1，Magic1 的实现）

```c
void Heal(int arg1) {                   // 0x17F38
  int x, y;                             // loc1, loc2
  LoadResource("magic\000\*");          // SYSCALL 7
  LoadResource("magic\016\*");          // SYSCALL 7
  SetBattleFlag1();                     // SYSCALL 0x131
  DownBrightness(8, 5);
  SetUnitField54(g2, 1);                // SYSCALL 0x128
  x = GetUnitX(g2);  y = GetUnitY(g2);  // 0x105 / 0x106
  SetEffectPos(x, y - 120);             // SYSCALL 0x100
  AddUnitTimer(g2, 5);                  // SYSCALL 0x121
  Wait(20);
  SetUnitFlag(g2, 0x8000);              // SYSCALL 0x120
  Wait(10);
  PlaySound("m016snd01", 255);          // SYSCALL 0x301
  CreateHolyLight(g2, arg1);            // CALLS? 否 —— CALL 0x17A4C
  Wait(10);
  SetUnitField54(g2, 0);
  Wait(60);
  RaiseBrightness(16, 5);
  ClearBattleFlag();                    // SYSCALL 0x110
}                                       // RET 1
```

要点：`g2` 是施法者单位 id；特效坐标取“施法者坐标向上偏 120 像素”；`arg1` 是技能等级/强度，直接传给 `CreateHolyLight`。

### 8.2 `ShootObject`（@0x6998，argc=2，Magic2 的实现）

```c
void ShootObject(int arg1, int arg2) {   // arg1=飞行物类型? arg2=方向/模式
  int caster, target, dir, dx, dy, d, sx, sy;   // loc1..loc10
  LoadResource("magic\000\*");
  LoadResource("magic\003\*");
  SetBattleFlag1();  DownBrightness(8,5);
  caster = g2; target = g3; dir = g5;
  d = 0;                                  // loc10
  if (rand(0,3) != 3) d = rand(0,90);     // 随机散布角
  if (dir == 1) { dx = 0;   dy = -1; }    // 朝上
  else          { dx = 128; dy =  1; }    // 朝下（128 为屏幕半宽偏移）
  SetUnitField54(caster, 1);
  sx = GetUnitX(caster);  sy = GetUnitY(caster);
  SetEffectPos(sx - 180*dy, sy - 120 + d);   // 起点
  Wait(15);
  switch (arg2) {
  case 0:
    SetUnitFlag(caster, 0x20000);
    SetUnitField54(caster, 0);
    Wait(15);
    PlaySound3(caster, "m003snd01", 255);   // SYSCALL 0x300
    break;
  case 1:
    SetUnitFlag(caster, 0x40000);
    SetUnitField54(caster, 0);
    Wait(15);
    …
  }
  …
}
```

（此处 `0x300` 是 3 参数版本 `0x420B26`，脚本里传了 `caster, "m003snd01", 255`。）

### 8.3 `Thunder`（@0x8DCC，argc=2，Magic10 的实现）

```c
void Thunder(int arg1, int arg2) {
  LoadResource("magic\000\*"); LoadResource("magic\005\*");
  g4 = arg1;            // 伤害/强度存入脚本全局槽 4，供回调使用
  g5 = 0;
  SetBattleFlag1(); DownBrightness(8,5);
  caster = g2; target = g3; dir = g5;
  SetUnitField54(caster, 1);
  x = GetUnitX(caster); y = GetUnitY(caster);
  SetEffectPos(x, y - 120);
  AddUnitTimer(caster, 2);
  Wait(20);
  SetUnitFlag(caster, 0x8000);
  SetUnitField54(caster, 0);
  Wait(30);

  // 方向处理：dir==1 时 loc4=128，否则 0
  loc4 = (g5 == 1) ? 128 : 0;
  loc17 = GetSideObject(g5 ^ 1);          // SYSCALL 0x10C，取敌方阵营对象
  // 之后是一段“按 arg2 循环、每次落雷 + WAIT”的循环：
  //   loc18 = max(0, arg2 - side->count) 之类；
  //   循环体内对每个落点调用 CreateLightning/ThunderStrike 并 WAIT。
  …
}
```

`Thunder` 后半段（0x9060 起）是两层循环：外层按 `arg2`（雷击次数），内层按阵营单位数，逐个取坐标 → 生成雷击特效 → `Wait`；`g4` 保存伤害值，由 `Hurt` 原语在命中时读取。

### 8.4 `ExplodeRound`（@0xF228，argc=3，Magic8 的实现）

```c
void ExplodeRound(int a, int b, int count) {
  g12 = 1;
  LoadResource("magic\000\*"); LoadResource("magic\008\*");
  SetBattleFlag1(); DownBrightness(8,5);
  x = GetUnitX(g2); y = GetUnitY(g2);
  SetEffectPos(x, y - 120);
  AddUnitTimer(g2, 2); Wait(10);
  SetUnitFlag(g2, 0x8000);
  x = GetUnitX(g2); y = GetUnitY(g2);   // 重新取（单位可能移动）
  Wait(10);
  ProduceAirCircle(18002, count * 3 / 18);
  for (i = 0; i < count; i++) {
      // 以圆周分布生成爆炸点，逐个 CALLS/CALL 特效原语
  }
}
```

### 8.5 `StartBattle`（SYSTEM.SO @0x2108，argc=1）

```c
void StartBattle(int mode) {
  // 1) 用 SYSCALL 0x200（字符串透传）+ SYSCALL 6 注册 4 组“阵型/出生点”名字
  //    例如 ("3", 1, g7)、( "2", 1, g8)、("3", 2, g8)、("2", 2, g7)
  SYSCALL6("3", 1, g7);   // 0x41F9C1 → 0x434885
  SYSCALL6("2", 1, g8);
  SYSCALL6("3", 2, g8);
  SYSCALL6("2", 2, g7);

  if (mode == 1) {                       // 进攻方视角
      BattleYield(g3, g2, g8, g7, 2, 3, 1);
      return;
  }
  if (mode == -1) {                      // 防守方视角
      BattleYield(g2, g3, g7, g8, 3, 2, 0);
      return;
  }
  // mode == 0：完整战斗初始化
  loc6 = ScreenRegionTest(g7);           // SYSCALL 0x206
  loc5 = ScreenRegionTest(g8);
  loc8 = GetUnitX(g3); loc9 = GetUnitY(g3);
  MoveCamera(loc8, loc9 - 128, 30);      // CALL MoveCamera
  switch (loc5) {                        // CASE 链
  case 0: …  // 左侧/右侧/上方/下方 四种镜头与阵型布置
  case 1: …
  case 2: …
  }
  …
}
```

`StartBattle` 是全工程最大的 SYSTEM 脚本（306 条指令），展示了 `CASE` 链、`LDG` 上下文、`SYSCALL 0x200/0x206` 与 `CALL MoveCamera` 的组合用法。

### 8.6 `GetInt_Old`（SYSTEM.SO，改版新增的内存读取）

```c
int GetInt_Old(int addr) {
  return SYSCALL 0x214(addr);            // *(u32*)addr
}
```

`GetByte_Old` 则不复用 0x216，而是：

```c
int GetByte_Old(int addr) {
  int d = LDGIDX((addr - 0x4A6878) >> 2);   // 读引擎全局数组
  return (d >> (8 * (addr & 3))) & 0xFF;    // 按小端取字节
}
```

**这是“任意地址读”的关键**：`0x4A6878` 是引擎全局数组的基址，`LDGIDX` 无边界检查，于是 `addr` 可以指向进程内任意 dword。

### 8.7 `SetString_Old`（SYSTEM.SO）

```
PUSHN 2
PUSHI 0x4A71FC
PUSHI 0x46DC60
CALL SetInt_Old            ; 把 strcpy 的地址写进全局函数指针槽
LDSL arg1                  ; dest
LDSL arg2                  ; src
SYSCALL 0x213, 0x10002     ; strcpy(dest, src)
RETV 2
```

这段脚本把宿主函数地址当成数据写进内存，再通过 syscall 0x213 调用，属于典型的“脚本内自举”。

### 8.8 `MagicN` 桩表（节选）

111 个 `Magic1..Magic110 + Magic200` 入口全部是 1–9 条指令的转发桩：

| 脚本号 | 入口 | 转发到 | 参数 |
|---|---|---|---|
| 0x1F5 (Magic1) | 0x3AB20 | `Heal` | 0 |
| 0x1F6 (Magic2) | 0x3AB38 | `ShootObject` | 0, 1 |
| 0x1F7 (Magic3) | 0x3AB58 | `ArrowSupport` | 17, 1 |
| 0x1F8 (Magic4) | 0x3AB78 | `Spout` | 0 |
| 0x1F9 (Magic5) | 0x3AB90 | `Powder` | 0 |
| 0x1FA (Magic6) | 0x3ABA8 | `RollTub` | 0 |
| 0x1FB (Magic7) | 0x3ABC0 | `OnFire` | 0 |
| 0x1FC (Magic8) | 0x3ABD8 | `ExplodeRound` | 18, 160, 18003 |
| 0x1FE (Magic10) | — | `Thunder` | 20, 0 |
| 0x2BC (Magic200) | 0x3B688 | `XMoreSoldier` | 200 |

完整映射可用 `F:\sanguo\tools\ss_pick.py` 导出。

---

## 9. 改版 SYSTEM.SO / MAGIC.SO 与 .OLD 的差异

### 9.1 规模变化

| 指标 | SYSTEM.OLD | SYSTEM.NEW | MAGIC.OLD | MAGIC.NEW |
|---|---|---|---|---|
| 函数数 | 29 | 39 (+10) | 454 | 463 (+9) |
| 字符串数 | 41 | 80 (+39) | 314 | 580 (+266) |
| 代码终点 | 0x4059 | 0x4AE8 | — | 0x3B6A0 |
| 文件大小 | 17,724 | 21,420 | 259,496 | 261,008 |

### 9.2 新增函数

SYSTEM.SO 新增 10 个、删除 0 个：

```
GetByte_Old, GetByte_Signed_Old, GetShort_Old, GetShort_Signed_Old,
GetInt_Old, SetByte_Old, SetShort_Old, SetInt_Old, SetString_Old,
ChildGenTalkNew
```

MAGIC.SO 新增同样的 9 个内存访问函数（没有 `ChildGenTalkNew`），另加 266 条字符串字面量（cp950 解码后是中文台词、资源名）。

### 9.3 差异的实质

1. **新增了一层“任意内存读写”脚本库**：利用 `0x4A6878` 引擎全局数组无边界检查的缺陷，把整个进程地址空间变成可读写。
2. **0x213–0x219 是这层库的宿主原语**（strcpy / 读 u32,i16,i8 / 写 u32,u16,u8），由改版作者在 `0x420D52` 注册表里加入。
3. **`ChildGenTalkNew` 是剧情/对话相关的新脚本**，说明改版还扩充了事件脚本。
4. 原有 29 个 SYSTEM 函数与 454 个 MAGIC 函数全部保留、代码一致（除字符串表重排导致的偏移变化）。

这解释了修改版说明里“0x213-0x219 读游戏内存”“0x119 召唤伏兵高级兵”等断言：前者是改版新增能力，后者是原版就存在的宿主 API。

---

## 10. 未解问题

1. **引擎全局 `0x4A6878` 的写入者未定位**。脚本把 g2/g3/g5 当施法者/目标/方向使用，但谁在战斗流程里填这三个槽，尚未找到写入指令（可能在 `0x41xxxx` 的技能调度代码里）。
2. **`0x46` / `0x4C` / `0x4D` / `0x11` / `0x19` 五条指令在脚本中从未出现**，语义仅由 handler 反汇编推测，缺少真实用例验证；`0x45 WAITFOR` 已有 64 个用例（等待同名脚本结束），但“同名脚本如何启动”仍依赖 `CALLS`/syscall 0x310–0x314 两条路径。
3. **`0x310–0x314` 的 6–10 个参数含义未逐一列举**，只确认它们最终调用 `0x4653F0`（按名字跑脚本）。
4. **`0x119` 的对象创建细节**（`0x43A971` 内部字段）未逐行展开；“召唤伏兵”是结合说明文件的推测。
5. **`WAIT n` 的时间单位**：按“帧”理解与动画节奏吻合，但未做动态计时验证（也可能按 1/18 秒的 tick）。
6. **头部 `+0x30..0x3C` 四个 -1** 的用途不明（OLD 为 0，NEW 为 -1，可能是版权/校验标志）。
7. **每个脚本对象 121 个全局槽**的数目为何是 121（0x79），没有找到编译器的限制依据。
8. **`MagicDef` 结构与 MAGIC.INI 字段的映射**未做（INI 解析属他人范围），本文只确认 `def+4` 是脚本号。

---

## 11. 产物与工具

### 11.1 输出文件

| 文件 | 内容 |
|---|---|
| `F:\sanguo\export\script\magic_so.dis.txt` | MAGIC.SO 全量反汇编（463 函数、30,720 条、带标签/字符串/syscall 注释） |
| `F:\sanguo\export\script\system_so.dis.txt` | SYSTEM.SO 全量反汇编（39 函数、2,311 条） |
| `F:\sanguo\export\script\syscall_table.json` | 124 个已注册 syscall 的 id → handler VA |
| `F:\sanguo\export\script\syscall_handlers.asm.txt` | 124 个 handler 的反汇编清单（含字符串引用注释） |

### 11.2 工具

| 文件 | 作用 |
|---|---|
| `F:\sanguo\tools\smartscript.py` | 正式反汇编器（头解析、符号表、字符串表、指令解码、统计） |
| `F:\sanguo\tools\ss_verify.py` | 函数边界自洽校验（bad 0 / 463、bad 0 / 39） |
| `F:\sanguo\tools\ss_stats.py` | 函数规模、最大栈深（抽象解释）、opcode 直方图 |
| `F:\sanguo\tools\ss_use.py` | SYSCALL 使用面统计（id/argc/ret/宿主/文件分布） |
| `F:\sanguo\tools\ss_syscalls.py` | 模拟 `0x420D52` 还原 syscall 注册表 |
| `F:\sanguo\tools\ss_diff.py` | `.OLD` 与新版函数/字符串差异 |
| `F:\sanguo\tools\ss_callee.py` | 按 VA 反汇编任意宿主函数 |
| `F:\sanguo\tools\ss_xref.py` | 在 EXE 中查 `call` 交叉引用 |
| `F:\sanguo\tools\ss_pick.py` | 导出 MagicN → 目标原语的映射 |

---

*文档完。所有 VA 均可在 `Sango2.exe` 中直接反汇编核对；所有 `.SO` 偏移均可在 `magic_so.dis.txt` / `system_so.dis.txt` 中按行首偏移检索。*
