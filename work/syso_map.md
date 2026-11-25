# R79：`SYSTEM.SO` 39 个函数工作地图

这份文件是 `project/62_SYSTEM_SO实装.md` 的**工作底稿**：把 39 个函数的名字、地址、
参数、调用点、证据、有据/无据、实装状态和测试名压到一张表里，方便日后回查"某个
SYSTEM.SO 函数到底凭什么这么实现"。

- 上游数据：`extract/pak/SCRIPT/SYSTEM.SO`（21,420 B）→ `work/system_so/funcs.txt`
  （39 段逐条反汇编，用 `work/system_so/dump_funcs.py` 生成，可重跑）。
- 代码：`game/src/core/syso_host.ts`（25 个宿主实现）、
  `game/src/core/smartscript/runtime.ts`（三级分派接线）、
  `game/tests/syso.test.ts`（34 条断言）。
- 上层文档：`work/system_so/map.md`（上一轮的机器生成表，只有规模统计）、
  `project/37a_逻辑对照.md:89`（R79 条目）。

## 1. 证据来源

| 代号 | 路径 | 用途 |
| --- | --- | --- |
| `SO` | `extract/pak/SCRIPT/SYSTEM.SO` | 函数目录 / 80 条字符串 / 2311 条指令 |
| `funcs` | `work/system_so/funcs.txt`（2443 行） | 逐函数伪汇编，本文所有"语义"列的原始依据 |
| `04` | `docs/04-脚本引擎SmartScript.md` | §5.4 内存 syscall、§6.5 调用点、§7 规模、§8.5–8.7 伪码、§9 与 OLD 版对照 |
| `04d` | `docs/04d_AI与脚本引擎.md` | §2.3 函数目录格式、§2.4 内置函数编号表 |
| `tab` | `export/script/syscall_table.json` | syscall id → 宿主地址 |
| `vm` | `game/src/core/smartscript/vm.ts` | 参数压栈/取参顺序、LDGIDX/STEIDX |
| `sc` | `game/src/core/smartscript/syscalls.ts` | syscall 语义（0x100/0x103/0x303/0x213…） |

## 2. 参数顺序（读表前必看）

`vm.ts:383`：`for (let i = argc - 1; i >= 0; i--) args[i] = this.pop();`
→ 脚本里**先压的那个**落在 `args[0]`，函数体内叫 `argN`；最后压的 `arg1` 在栈顶。
所以"源码顺序"= `args[0..N-1]`，而字节码里的 `arg1` 是**最后一个**实参。

这条规则有两个直接影响，写实现时都踩过：

1. `SetInt_Old` 字节码用 `arg2` 当地址（`loc1 = arg2 & 3`、`G[(arg2-base)>>2]`）、
   `arg1` 当值 → 源码顺序是 **`(addr, value)`**，不是 `(value, addr)`。
   证据：`funcs:320-331` 里 `SetString_Old` 自己就是 `PUSHI 0x4A71FC; PUSHI 0x46DA60;
   CALL SetInt_Old`，而 0x4A71FC 才是地址槽。
2. `MoveCamera` 字节码用 `arg3` 当 x 目标、`arg2` 当 y、`arg1` 当帧数
   （`funcs:332-410`）→ 源码顺序 `(x, y, frames)`，与 `04:905` 的
   `MoveCamera(loc8, loc9-128, 30)` 一致。

## 3. 39 行总表

"有据"= 字节码 + 至少一份文档能对上语义；"无据"= 语义落在一个**缺失的 syscall**
或**本身就是死代码**上，见 §5。

| # | 名字 | 地址 | argc | 原型（源码顺序） | 语义 | 调用点 | 依据 | 有据 | 实装 | 测试 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `GetByte_Old` | 0x40 | 1 | `(addr) → u8` | 读 `0x4A6878` 全局字数组的任意字节：`w=G[(a-B)>>2]; (w>>(8*((a-B)&3)))&0xFF` | `GetByte_Signed_Old` | `funcs:1-19`、`04:568-580`、`04:917-934` | 有据 | host | `GetByte_Old 按字节偏移寻址同一个字（小端），四种对齐都要对` |
| 1 | `GetByte_Signed_Old` | 0xAC | 1 | `(addr) → i8` | 同上后符号扩展：`b&128? b\|-256 : b` | — | `funcs:20-36`、`04:576` | 有据 | host | `GetByte_Signed_Old 做 8 位符号扩展：0x80 → -128，0x7F → 127` |
| 2 | `GetShort_Old` | 0x114 | 1 | `(addr) → u16` | 读 16 位；`addr&3==3` 走跨字分支 `((w2<<8)\|((w1>>24)&0xFF))&0xFFFF` | `GetShort_Signed_Old`、`SetShort_Old` | `funcs:37-83`、`04:577` | 有据 | host | `GetShort_Old 读 16 位，含 addr&3==3 的跨字分支` |
| 3 | `GetShort_Signed_Old` | 0x238 | 1 | `(addr) → i16` | `v&32768? v\|-65536 : v` | — | `funcs:84-100` | 有据 | host | `GetShort_Signed_Old 做 16 位符号扩展` |
| 4 | `GetInt_Old` | 0x2A0 | 1 | `(addr) → i32` | 按 `addr&3` 四分支拼双字。**`&3==2` 分支原作丢 bit16-23**（`((w1>>16)&0xFFFF)\|(w2<<24)`） | `SetByte_Old` | `funcs:101-157`、`04:917-934` | 有据 | host（照抄 bug） | `GetInt_Old 按字节拼字：offset 0/1/3 精确，offset 2 复刻原作的丢位 bug` |
| 5 | `SetInt_Old` | 0x41C | 2 | `(addr, value)` | 读-改-写 dword，四种对齐都保留邻居字节 | `SetShort_Old`、`SetByte_Old`、`SetString_Old` | `funcs:158-287`、`04:936-949` | 有据 | host | `SetInt_Old(addr, value) 四种对齐都能写进去，且不越界改邻居字节` |
| 6 | `SetShort_Old` | 0x77C | 2 | `(addr, value)` | `SetInt_Old(addr, (GetShort_Old(addr+2)<<16)\|(value&0xFFFF))` | — | `funcs:288-304` | 有据 | host | `SetByte_Old 只改目标字节（读-改-写），SetShort_Old 只改目标半字` |
| 7 | `SetByte_Old` | 0x7DC | 2 | `(addr, value)` | `SetInt_Old(addr, (GetInt_Old(addr)&0xFFFFFF00)\|(value&0xFF))` | — | `funcs:305-319` | 有据 | host | 同上 |
| 8 | `SetString_Old` | 0x830 | 2 | `(dest, src) → void` | 先 `SetInt_Old(0x4A71FC, 0x46DA60)` 把 strcpy 指针塞进函数指针槽，再 `0x213(dest, src)` | — | `funcs:320-331`、`04:574-582`、`04:936-949` | 有据 | host | `SetString_Old 写函数指针槽 + 逐字节 strcpy，GetByte 能读回每个字符` |
| 9 | `MoveCamera` | 0x874 | 3 | `(x, y, frames)` | 千分位线性插值：`step=(t*1000-cam*1000)/frames`，每帧 `0x100`，`\|Δ/100\|` 相等即收尾 | `BattleYield`×3、`StartBattle`×2、`AllRush`、`MajorDeath` | `funcs:332-410`、`04:905` | 有据 | host | `MoveCamera 按帧数逐步插值，最后一步精确落在目标点`（+2 条） |
| 10 | `CheckGround` | 0xA8C | 1 | `(cell) → ?` | **首条就是 `RET 1`**，后面 20 条全是死代码 | — | `funcs:411-434` | 无据（死体） | — | 清单用例断言它进 `SYSO_UNSUPPORTED` 且理由含 `RET 1` |
| 11 | `WeatherObjectDeath` | 0xB3C | 0 | `()` | 取当前物件句柄 `0xB`，`0x17(h,0,0)` 归位 + `0x25(h,4096)` + `0x26(h,16,1)` | — | `funcs:435-452` | 有据 | host | `WeatherObjectDeath 回收最近一批天气物件并把天气清回晴` |
| 12 | `ProduceRain` | 0xBC4 | 0 | `()` | `PUSHI 1; JNZ` 短路，粒子段**永不执行**；按常量重建：`n=rand(3,10)`，每滴 `(rand(0,1024), rand(0,1024))`、速度 `rand(300,500)`、资源 `rand(0,2)+9994`、`0x17(h,2,rand(2,5),0)` | — | `funcs:453-501` | 有据（死体按常量猜测） | host | `ProduceRain 生成 3..10 个 9994..9996 物件，x/y 落在 0..1024`（+1 条可复现） |
| 13 | `ProduceSnow` | 0xD48 | 0 | `()` | 同上短路；`loc7=rand(0,255)` 风力、`loc6=rand(1,3)` 变体、每片 `0x1C("MAGIC\M013WingA6.SHP")`、`0x1D(rand(256,512))`、`0x1B(m,m)` m=`rand(40960,65536)`、`0x18(wind, rand(-10,10), rand(2,4))` | `LoadingBattleMap` | `funcs:502-583` | 有据（死体按常量猜测） | host | `ProduceSnow 带风力/变体/SHP 与运动速度，且帧数落在 2..4` |
| 14 | `ProduceFog` | 0xFE4 | 0 | `()` | **无短路、可达**：`(rand(0,1024), rand(0,1024), rand(300,500))` + `0x1C("MENU\GAMEOVER.SHP")`，资源 `rand(0,2)+9994` | — | `funcs:584-615` | 有据 | host | `ProduceFog 只生成 1 个物件，换 GAMEOVER.SHP，尺寸 300..500` |
| 15 | `Battle2` | 0x10D8 | 0 | `()` | 16 B / 2 条指令：`PUSHN 7; RET 0` —— 空壳 | — | `funcs:616-619` | 无据（空壳） | — | 清单用例断言理由含 `RET 0`/空壳 |
| 16 | `EnterWar4` | 0x10E8 | 0 | `()` | 6 个定点 402 标记（列 `rand(-2,3)/rand(4,8)/rand(48,53)/rand(54,58)/rand(9,47)/rand(-10,-2)`，行 `rand(14,17)`）+ `rand(6,9)` 个散布，`x+=rand(0,96)`、`y+=rand(0,72)`、`0x1B(rand(32768,65536))` | `LoadingBattleMap` | `funcs:620-912` | 有据 | host | `EnterWar4 生成 6 个定点 + rand(6,9) 个散布的 402 标记` |
| 17 | `EnterWar5` | 0x1AA8 | 0 | `()` | 无随机：11 组、行固定 15、列 `i*7`，403@`(x,y)` + 404@`(x,y+70)` = 22 个物件 | `LoadingBattleMap` | `funcs:913-947` | 有据 | host | `EnterWar5 无随机：22 个标记（11 组 403 + 404），坐标可精确推算` |
| 18 | `EnterWar7` | 0x1BB0 | 0 | `()` | 60 个：行 `rand(14,17)`、列 `rand(0,71)`、资源 `rand(400,401)`、`x+=rand(0,96)`、`y+=rand(0,72)`、`0x1B(rand(40960,65536))` | `LoadingBattleMap` | `funcs:948-999` | 有据 | host | `EnterWar7 生成 60 个 400/401 标记，资源号只能是这两者` |
| 19 | `LoadingBattleMap` | 0x1D54 | 1 | `(mapIndex)` | `0x212`×4 载入 BG03A/04A/08A/09A，`0x301`×4 发底噪 | — | `funcs:1000-1064`、`tab` | 有据 | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 20 | `BattleYield` | 0x1F70 | 7 | `(a1..a7)` | 招降/撤退：`0x105/0x106` 取双方像素、`0x114` + `0x139` 判胜负，3 条招降台词 | `StartBattle`×2 | `funcs:1065-1117`、`04:889-902` | 无据（缺 `0x139`、`0x114` 语义） | — | `SYSO_UNSUPPORTED` 理由：缺 0x139/0x114 |
| 21 | `StartBattle` | 0x2108 | 1 | `(mode)` | 306 条的战役入口：注册 4 组阵型名（`0x200`+`0x6`）、`0x206` 屏分区、`MoveCamera`、按 mode 调 `BattleYield` | — | `funcs:1118-1427`、`04:882-915` | 无据（缺 `0x200`/`0x206`） | — | 理由：缺 0x200/0x206 |
| 22 | `AllRush` | 0x2B0C | 0 | `()` | `0x301("Rush01")` + `0x131`/`0x110` 闪白 + `MoveCamera` + 台词 `全軍突擊!%k%%e%` | — | `funcs:1428-1479` | 有据 | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 23 | `BattleEndTalk` | 0x2C90 | 1 | `(mode)` | 145 条：战后对话，`0x200`×10 取台词、`0x124` 播、`0x206` 分区 | — | `funcs:1480-1627` | 无据（缺 `0x200`/`0x124`） | — | 理由：缺 0x200/0x124 |
| 24 | `ReportResult` | 0x3178 | 1 | `(outcome)` | 8 种结局台词选一（strings 36-43），`0x3`×8 播、`0x200`×3 选行 | — | `funcs:1628-1699` | 无据（缺 `0x200`） | — | 理由：缺 0x200 |
| 25 | `SearchTalk` | 0x33E4 | 1 | `(result)` | 270 条：`0xA`×30 查表、`0x200` 取台词、`0x301` 发 SUCCESS，含"什麼都找不到"/"找到物品!!" | — | `funcs:1700-1973` | 无据（缺 `0x200`/`0xA`） | — | 理由：缺 0x200/0xA |
| 26 | `ChildGenTalkNew` | 0x3D40 | 1 | `(id)` | 113 条：`0x301("SUCCESS")`/`FAILURE2`，`0xA`×10 查表 | — | `funcs:1974-2090` | 无据（缺 `0x200`/`0x6`） | — | 理由：缺 0x200/0x6 |
| 27 | `KillGeneral` | 0x4100 | 0 | `()` | `slot=rand(0,10)`；`0xA(0, g7, 910+2s)`、`0xA(1, g8, 911+2s)`；`0x3(0, g7, "%E%")`；`0x209()` | — | `funcs:2091-2125` | 有据 | host | `KillGeneral 用 rand(0,10) 选偶数对槽（910/911 起），并写全局 7/8 号`（+1 条） |
| 28 | `FreeGeneral` | 0x41F4 | 0 | `()` | `0xA(0, g7, rand(940,945))`；`0x210()` | — | `funcs:2126-2138` | 有据 | host | `FreeGeneral 用 rand(940,945) 选释放槽，并记下是哪位武将` |
| 29 | `YieldGeneral` | 0x424C | 2 | `(a, b)` | 56 条：`0x211` 招降动作、`0x301("SUCCESS")`、`0x200` 台词 | — | `funcs:2139-2198` | 无据（缺 `0x200`/`0x211`） | — | 理由：缺 0x200/0x211 |
| 30 | `DownBrightness` | 0x444C | 2 | `(level, frames)` | `0x12F`×2 写/读亮度、`0x130` 比较，逐帧降到 `16-level` | — | `funcs:2199-2217`、`04d:373` | 有据 | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 31 | `RaiseBrightness` | 0x44D0 | 2 | `(level, frames)` | 同上，升到 `level` | — | `funcs:2218-2236`、`04d:374` | 有据 | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 32 | `Test01` | 0x4554 | 0 | `()` | 5 条：`0x125(g2, 0, 10000)` → `applyHpDelta(g2, 10000)` | — | `funcs:2237-2244`、`sc:331` | 有据 | host | `Test01 对 g2 打 10000 点伤害（0x125 的唯一调试入口）` |
| 33 | `EnterMapMoveCamera` | 0x4580 | 3 | `(x, y, speed)` | 从 (160,120) 起，`step=\|Δ\|/2<speed? Δ/2 : sign*×speed`，逐帧 `0x205`；收尾清 g2 | — | `funcs:2245-2350` | 有据 | host | `EnterMapMoveCamera 从屏幕中心 (160,120) 出发，按步长夹到目标点并清守卫`（+1 条） |
| 34 | `MajorDeath` | 0x4868 | 2 | `(side, handle)` | `0x300`×2 + `0x301`：Yell03 / Horse02 / VICTORY，`0x105/0x106` 定位 | — | `funcs:2351-2388` | 有据 | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 35 | `EnterWarprep` | 0x4974 | 0 | `()` | 11 条：`0x7` 载入 5 组 `MENU\D0_*`/`D1_2A`/`D1_2B`/`D12*`/`WARPREP*` | — | `funcs:2389-2403` | 有据 | host | `EnterWarprep 载入 5 组备战菜单资源（顺序与字节码一致）` |
| 36 | `EnterBattle` | 0x49E0 | 0 | `()` | 7 条：`PUSHS "InitializeBattle"; PUSHI 0 ×4; CALLS` | — | `funcs:2404-2413` | 有据 | host | `EnterBattle 就是 CALLS InitializeBattle(0,0,0,0)` |
| 37 | `EnterMapmode` | 0x4A14 | 0 | `()` | 15 条：先 `STG g2=0`，再载入 `MENU\D3*`/`D4*`/`D28`/`D1_2A`/`D1_2B`/`D12*` | — | `funcs:2414-2432` | 有据 | host | `EnterMapmode 先清 g2，再载入 6 组地图菜单资源` |
| 38 | `EnterPolicy` | 0x4AA4 | 0 | `()` | 7 条：载入 `MENU\S0*`/`C3_B*`/`D1*` | — | `funcs:2433-2443` | 有据 | host | `EnterPolicy 载入 3 组内政菜单资源` |

统计：**39 = 25 host + 5 audio_bus（上一轮）+ 9 无据**。

## 4. 接线：`runtime.callScript` 的三级分派

```
callScript(name, args)
  ├─ audio_bus.callSystemSo(...)   命中 5 个 → 发音频/亮度事件，return undefined
  ├─ syso_host.SysoHost.call(...)  命中 25 个 → 落地到 world/物件/引擎槽，return 值
  └─ vm.invokeByName(name, slots)  其余（MAGIC.SO 同名函数）
```

- `SysoHost` 的内存族必须接 `vm.engine`（`LDGIDX/STEIDX` 的那块 `Int32Array`），
  不能接 `Runtime.engine`（那是 0xA/0x300 系 syscall 用的另一块 512 字数组，
  两者不 alias）。越界地址（如 `0x4A71FC` 的函数指针槽）落 `engineOverflow`。
- `SysoHost` 的随机源在 `Runtime` 里注入的是 `runtime.rand`（走 `world.rng`），
  所以同一个 `seed` 下技能脚本与系统脚本共用一条随机序列；单测里直接
  `new SysoHost(ports, { seed })` 用自带 mulberry32。

## 5. 无据的 9 个：缺口在哪

| 名字 | 缺什么 | 具体证据 |
| --- | --- | --- |
| `Battle2` | 没有函数体 | `funcs:616-619`：16 B，只有 `PUSHN 7; RET 0` |
| `CheckGround` | 没有函数体 | `funcs:411-434`：0xA8C 第一条就是 `RET 1`，后 20 条不可达 |
| `BattleYield` | `0x139`、`0x114` 无语义 | `tab` 里 0x139 无宿主地址；`sc` 里没有 0x139 分支 |
| `StartBattle` | `0x200`、`0x206` | `04d:360-374` 的编号表只到 0x1A3 附近，0x200 段未定名；`sc` 无对应 case |
| `BattleEndTalk` | `0x200`、`0x124` | 同上；0x124 不在 `syscall_table.json` |
| `ReportResult` | `0x200` | 同上；没有 0x200 就无法从 8 条台词里选行 |
| `SearchTalk` | `0x200`、`0xA` | 0xA 在 `04d:360-374` 写作"读全局/引擎量"，但参数形式（0/1/2 三参）未定；0x200 同前 |
| `ChildGenTalkNew` | `0x200`、`0x6` | 0x6 在 `tab` 有地址，但实参含义（阵型名？）无文档 |
| `YieldGeneral` | `0x200`、`0x211` | 0x211 不在 `tab`；没有它就无法知道"招降成功"的落点 |

这 9 个在 `syso_host.ts` 的 `SYSO_UNSUPPORTED` 里逐条带 `why` 字符串，
测试会断言每条理由长度 ≥12 且不出现在 `SYSO_HOST_NAMES` 里（防止"静默留空壳"）。

## 6. `[推测]` 清单

1. `ProduceRain` / `ProduceSnow` 的粒子参数——原作整段是死代码，按残留常量重建。
2. `EnterMapMoveCamera` 的循环收尾——原作用"步长不变 + 恒真条件"永不退出，
   重制版改成"夹到目标点即停"。
3. `MoveCamera` 最后一步强制落到目标点（千分位整除有余数）。
4. `SetString_Old` 的非 ASCII 双字节写法（cp950 双字节按 big-endian 拆高低字节）。
5. `KillGeneral` / `FreeGeneral` 里 `0xA` 的语义（当作"写全局/引擎量"）。
6. `EnterWar4` 第 6 个定点标记的列区间（`PUSHI 2; NEG; PUSHI 10; NEG` → `rand(-10,-2)`）
   与 `rand(6,9)` 那段的散布数量。

## 7. 已知偏差

- 取字节统一用 `>>>`（无符号右移），原作的 `SHR` 对负数会带符号位；
  这只影响 `addr` 为负或 `G[i]` 为负的极端情况，正常地址区间内两者一致。
- `GetInt_Old` 的 `addr&3==2` 分支**故意照抄**原作的丢位 bug（见 #4），
  由 `tests/syso.test.ts` 的注释与断言双重记录，避免以后有人"顺手修好"导致
  与原作读值不一致。
