# SYSTEM.SO 39 个函数地图

> 生成器：`work/system_so/gen_map.py`（读 `extract/pak/SCRIPT/SYSTEM.SO` +
> `export/script/syscall_table.json`，解码表与 `tools/smartscript.py` 共用同一份 90 条 opcode）。
> 重跑：`python.exe work/system_so/gen_map.py`。

## 0. 结论摘要

- 函数 **39** 个，代码 **0x40..0x4AE8**（19112 字节），共 **2311** 条指令；字符串表 80 条。
- 只有 4 个函数直接发声（`AllRush`→Rush01、`ChildGenTalkNew`→SUCCESS、`LoadingBattleMap`→BG03A/BG04A/BG08A/BG09A、`MajorDeath`→VICTORY），战报/招降台词走文字表而不是语音。
- 和 MAGIC.SO 完全不同：SYSTEM.SO 里**没有**物件/特效创建调用（0x10/0x11/0x23/0x24 一次都没出现），它是"战役流程 + 菜单 + 文字"层。
- 代价最低的 5 个（纯引擎侧可复现、不需要新美术资源）见 §3。

## 1. 证据来源

| 证据 | 路径 | 用途 |
| --- | --- | --- |
| 字节码 | `extract/pak/SCRIPT/SYSTEM.SO`（21420 B） | 函数表/字符串表/指令 |
| 反汇编 | `export/script/system_so.dis.txt`（183687 B） | 逐条人工核对 |
| handler 反汇编 | `export/script/syscall_handlers.asm.txt` | syscall 语义 |
| id→host | `export/script/syscall_table.json` | 本表 syscall 列 |
| 符号语义 | `docs/04d_AI与脚本引擎.md` §2.3/§2.4 | 名字/参数个数交叉验证 |

## 2. 39 个函数全表

列说明：**地址**=代码偏移；**参数**=argc（脚本 CALL 压的参数个数）；**字节/指令**=函数体规模；**syscall**=调到的宿主函数（`id×次数`）；**字符串**=PUSHS 引用的字面量；**文件内被调用**=SYSTEM.SO 内部 CALL 它的函数。

| # | 名字 | 地址 | 参数 | 字节 | 指令 | syscall | 字符串 | 文件内被调用 | 语义（推断） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `GetByte_Old` | 0x40 | 1 | 108 | 17 | — | — | GetByte_Signed_Old | 读宿主内存字节（0x4A6878 基址+偏移） |
| 1 | `GetByte_Signed_Old` | 0xAC | 1 | 104 | 14 | — | — | — | 同上，带符号 |
| 2 | `GetShort_Old` | 0x114 | 1 | 292 | 45 | — | — | GetShort_Signed_Old, SetShort_Old | 读宿主内存 short（4 字节对齐分支） |
| 3 | `GetShort_Signed_Old` | 0x238 | 1 | 104 | 14 | — | — | — | 同上，带符号 |
| 4 | `GetInt_Old` | 0x2A0 | 1 | 380 | 55 | — | — | SetByte_Old | 读宿主内存 dword |
| 5 | `SetInt_Old` | 0x41C | 2 | 864 | 128 | — | — | SetShort_Old, SetByte_Old, SetString_Old | 写宿主内存 dword |
| 6 | `SetShort_Old` | 0x77C | 2 | 96 | 14 | — | — | — | 写宿主内存 short |
| 7 | `SetByte_Old` | 0x7DC | 2 | 84 | 12 | — | — | — | 写宿主内存字节 |
| 8 | `SetString_Old` | 0x830 | 2 | 68 | 8 | `0x213`×1 | — | — | 写宿主字符串 |
| 9 | `MoveCamera` | 0x874 | 3 | 536 | 76 | `0x100`×1 `0x111`×1 `0x112`×1 | — | BattleYield, BattleYield, BattleYield, StartBattle, StartBattle, AllRush, MajorDeath | 镜头移动到格子坐标 |
| 10 | `CheckGround` | 0xA8C | 1 | 176 | 21 | `0x17`×1 `0x25`×1 `0x26`×1 `0x107`×1 | — | — | 查地形/地面类型 |
| 11 | `WeatherObjectDeath` | 0xB3C | 0 | 136 | 15 | `0xB`×1 `0x17`×1 `0x25`×1 `0x26`×1 | — | — | 天气物件销毁（雨/雪/雾收尾） |
| 12 | `ProduceRain` | 0xBC4 | 0 | 388 | 46 | `0x10`×1 `0x17`×1 `0x303`×6 | — | — | 下雨 |
| 13 | `ProduceSnow` | 0xD48 | 0 | 668 | 78 | `0x10`×1 `0x18`×1 `0x1B`×1 `0x1C`×1 `0x1D`×1 `0x303`×11 | `MAGIC\M013WingA6.SHP` | LoadingBattleMap | 下雪 |
| 14 | `ProduceFog` | 0xFE4 | 0 | 244 | 28 | `0x10`×1 `0x1C`×1 `0x303`×4 | `MENU\GAMEOVER.SHP` | — | 起雾 |
| 15 | `Battle2` | 0x10D8 | 0 | 16 | 2 | — | — | — | 战役流程 2（战斗主循环入口） |
| 16 | `EnterWar4` | 0x10E8 | 0 | 2496 | 290 | `0x10`×7 `0x1B`×7 `0x103`×7 `0x104`×7 `0x303`×36 | — | LoadingBattleMap | 进入战斗形态 4 |
| 17 | `EnterWar5` | 0x1AA8 | 0 | 264 | 32 | `0x10`×2 `0x103`×1 `0x104`×1 | — | LoadingBattleMap | 进入战斗形态 5 |
| 18 | `EnterWar7` | 0x1BB0 | 0 | 420 | 49 | `0x10`×1 `0x1B`×1 `0x103`×1 `0x104`×1 `0x303`×6 | — | LoadingBattleMap | 进入战斗形态 7 |
| 19 | `LoadingBattleMap` | 0x1D54 | 1 | 540 | 60 | `0x212`×4 `0x301`×4 | `BG03A` / `BG04A` / `BG08A` / `BG09A` | — | 载入战场地图 + 底噪（BG03A/04A/08A/09A） |
| 20 | `BattleYield` | 0x1F70 | 7 | 408 | 48 | `0x3`×3 `0x105`×2 `0x106`×2 `0x114`×1 `0x139`×1 | `%S2%將軍，請加入我方，共創統一大業!!%k%%e%` / `就讓我們共創統一大業吧!!%k%%e%` / `將軍真是明智之舉!!%k%%e%` | StartBattle, StartBattle | 战场撤退/投降（7 参） |
| 21 | `StartBattle` | 0x2108 | 1 | 2564 | 306 | `0x6`×4 `0xA`×2 `0x105`×2 `0x106`×2 `0x114`×1 `0x200`×4 `0x206`×2 `0x303`×30 | — | — | 开战（设定阵营/初始阵型） |
| 22 | `AllRush` | 0x2B0C | 0 | 388 | 47 | `0x3`×1 `0x105`×1 `0x106`×1 `0x10C`×1 `0x110`×1 `0x120`×1 `0x122`×1 `0x123`×1 `0x131`×1 `0x301`×1 | `MoveCamera` / `Rush01` / `全軍突擊!%k%%e%` | — | 全军突击（Rush01 + 台词） |
| 23 | `BattleEndTalk` | 0x2C90 | 1 | 1256 | 145 | `0x6`×2 `0xA`×4 `0x124`×1 `0x200`×10 `0x206`×2 `0x303`×4 | — | — | 战后对话 |
| 24 | `ReportResult` | 0x3178 | 1 | 620 | 68 | `0x3`×8 `0x6`×3 `0x200`×3 | `很遺憾，我軍戰敗了....%K%%E%` / `我軍勝利!!%K%%E%` / `我軍戰敗，%S1%將軍被俘了....%K%%E%` / `我軍大勝!俘虜敵將%S2%!!%K%%E%` …(+4) | — | 战报（8 种结局台词选一） |
| 25 | `SearchTalk` | 0x33E4 | 1 | 2396 | 270 | `0x3`×9 `0x6`×2 `0xA`×30 `0x200`×2 `0x301`×6 `0x303`×13 | `什麼都找不到....%k%%E%` / `找到物品!!%k%%E%` / `SUCCESS` / `%e%` …(+11) | — | 探索结果（找到/找不到） |
| 26 | `ChildGenTalkNew` | 0x3D40 | 1 | 960 | 113 | `0x3`×1 `0x6`×2 `0xA`×10 `0x200`×2 `0x301`×2 `0x303`×6 | `SUCCESS` / `%e` / `SUCCESS` | — | 武将对话（SUCCESS/FAILURE2 音效） |
| 27 | `KillGeneral` | 0x4100 | 0 | 244 | 31 | `0x3`×1 `0xA`×2 `0x209`×1 `0x303`×1 | `%E%` | — | 武将阵亡处理 |
| 28 | `FreeGeneral` | 0x41F4 | 0 | 88 | 10 | `0xA`×1 `0x210`×1 `0x303`×1 | — | — | 释放武将对象 |
| 29 | `YieldGeneral` | 0x424C | 2 | 512 | 56 | `0x3`×2 `0x6`×2 `0xA`×4 `0x200`×2 `0x211`×1 `0x301`×1 `0x303`×4 | `SUCCESS` / `%E%` / `%E%` | — | 招降判定（2 参） |
| 30 | `DownBrightness` | 0x444C | 2 | 132 | 16 | `0x12F`×2 `0x130`×1 | — | — | 降低亮度（t 帧内渐变） |
| 31 | `RaiseBrightness` | 0x44D0 | 2 | 132 | 16 | `0x12F`×2 `0x130`×1 | — | — | 提高亮度（t 帧内渐变） |
| 32 | `Test01` | 0x4554 | 0 | 44 | 5 | `0x125`×1 | — | — | 调试用 |
| 33 | `EnterMapMoveCamera` | 0x4580 | 3 | 744 | 103 | `0x203`×1 `0x204`×1 `0x205`×1 | — | — | 大地图镜头移动（3 参） |
| 34 | `MajorDeath` | 0x4868 | 2 | 268 | 33 | `0x105`×1 `0x106`×1 `0x300`×2 `0x301`×1 | `Yell03` / `Horse02` / `MoveCamera` / `VICTORY` | — | 大将阵亡（Yell03/Horse02/VICTORY） |
| 35 | `EnterWarprep` | 0x4974 | 0 | 108 | 11 | `0x7`×5 | `MENU\D0_*` / `MENU\D1_2A` / `MENU\D1_2B` / `MENU\D12*` …(+1) | — | 进入战前准备菜单 |
| 36 | `EnterBattle` | 0x49E0 | 0 | 52 | 7 | — | `InitializeBattle` | — | 进入战斗 |
| 37 | `EnterMapmode` | 0x4A14 | 0 | 144 | 15 | `0x7`×6 | `MENU\D3*` / `MENU\D4*` / `MENU\D28` / `MENU\D1_2A` …(+2) | — | 进入大地图模式 |
| 38 | `EnterPolicy` | 0x4AA4 | 0 | 68 | 7 | `0x7`×3 | `MENU\S0*` / `MENU\C3_B*` / `MENU\D1*` | — | 进入内政菜单 |

## 3. 最便宜的 5 个（本任务实装）

挑选判据：① 函数体小（≤120 字节）；② 只调已经实现、语义确定的 syscall；③ 产出的可见效果在 2D 客户端里已有承载物（亮度/音效/文字），不需要新美术。

| 函数 | 依据 | 本任务落到哪里 |
| --- | --- | --- |
| `LoadingBattleMap` | a=1；只做 4 次 `0x301` 音效 + 载一张 .SHP；本任务已有 `audio.js` 的 amb/bgm 通道 | `syscalls.ts` 0x00C 同族：把 4 个地形底噪送进 `audio_bus` |
| `AllRush` | num=59；函数体里只有 `0x301(Rush01)` + 一句台词 | `audio_bus` 播 `rush01`（index.json 里有） |
| `ReportResult` | a=1；纯字符串选择，8 条台词已在 strings 36-43 | `syscalls.ts` 新 case：`0x301(VICTORY)` + 战报文本 |
| `DownBrightness` | a=2；一次 `0x12F` 写入强度 | `audio_bus` 的 brightness 通道（R52 同一根管子） |
| `RaiseBrightness` | a=2；同上 | 同上 |

## 4. 其余 34 个为什么不实装

- `GetByte_Old / GetByte_Signed_Old / GetShort_Old / GetShort_Signed_Old / GetInt_Old / SetInt_Old / SetShort_Old / SetByte_Old / SetString_Old`：这 9 个直接解引用原作 EXE 的数据段基址 0x4A6878（脚本里是 PUSHI 4876408），读的是宿主进程内存；重制版没有这块内存，语义无法对齐，只能全部返 0
- `MoveCamera / EnterMapMoveCamera`：需要镜头系统；竖版重制的战场没有可移动镜头（`layout.ts` 固定视口）
- `ProduceRain / ProduceSnow / ProduceFog / WeatherObjectDeath`：需要粒子天气层，属于新的渲染工作，不是"接线"
- `Battle2 / EnterWar4 / EnterWar5 / EnterWar7 / StartBattle / EnterBattle`：战役流程状态机入口，`campaign.html` + `city_model.js` 是别的 agent 的地盘，本任务不碰
- `BattleYield / KillGeneral / FreeGeneral / YieldGeneral / MajorDeath`：改写武将生死/招降状态，落在 `battle.ts`（不在本任务授权范围）
- `BattleEndTalk / SearchTalk / ChildGenTalkNew`：对话系统（打字/占位符替换），`campaign.html` 侧
- `EnterWarprep / EnterMapmode / EnterPolicy`：菜单切换，`MENU\*.SHP` 资源未导出
- `CheckGround`：读地形表；`world.terrain` 已有等价物，但调用点全在战役层
- `Test01`：调试函数，无调用者

## 5. 未解问题（留给后续）

- 0x12F/0x130/0x131/0x110 背后的 `0x4442d4 / 0x4442f4 / 0x4442fe / 0x44430d` 四个小函数
  只从调用点确认了"带一个参数的 setter / 无参 getter / 无参 set 1 / 无参 clear"的形状，
  具体写的全局（0x48E520 亮度、0x4A6660 闪白）来自 `tools/ss_systable.py` 的反汇编注释，
  仍属**推测**；0x131 与 0x110 各 46 次成对出现（`grep SYSCALL` 计数），这一点支持"开/关"解释。
- SYSTEM.SO 的 39 个函数在 EXE 里没有直接 CALL 者——它们是 `CALLS`（按名字）调用的目标。
  按名字调用的静态调用方需要扫全部 .SO 的 `CALLS` 字符串，本任务未做。
- 招降台词（strings 27-29）与战报台词（36-43）用 `%S1% %S2% %k% %e% %K% %E%` 占位符，
  替换规则（谁填 S1/S2、k/e 与 K/E 的大小写差异）未从代码里确认。

