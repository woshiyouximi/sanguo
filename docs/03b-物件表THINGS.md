# 03b 物件表 THINGS.INI

> 源文件：`extract\pak\THINGS.INI`，600,317 字节 / 9,084 行 /
> 623 段，编码 **cp950(Big5)**。JSON：`extract/json/things.json`。

这是全项目**信息密度最高**的一张表：兵种、武将造型、武器、马、箭矢、武将技特效、
天气、背景道具全部是"物件"，每个物件靠一段动画序列驱动。

## 1. 段结构与编号空间

| 段名 | 数量 | 说明 |
|---|---|---|
| `[SYSTEM]` | 1 | `TotalObjectDefine = 300`（容量，不是计数） |
| `[DEFINE]` | 1 | 官方自述常量表：类型 / 进程 / 标志位 / 动作码 + 编号分段注释 |
| `[OBJECT]` | 620 | 正式物件 620 个 |
| `[OBJECT2]` | 1 | **测试用物件**（`測試用物件`，Sequence=99），占一个段位但不属于 620 |

### 1.1 编号分段：`[DEFINE]` 自带答案

`[DEFINE]` 里有三行"键是注释、值为空"的记录，就是官方的编号分段说明：

```
001-099 師團物件
100-499 作戰時的物件(兵&主將&武將技&.....)
500-    Other objects
```

实测分布（按本文档的**物件编号** = 第几个 `[OBJECT]` 段统计）：

| 区间 | 物件数 |
|---|---|
| 100-499 作戰物件 | 400 |
| 500+ Other | 121 |
| 001-099 師團 | 99 |
| （测试物件） | 1 |

三段严丝合缝地对上了官方注释：

| 官方注释 | 实测编号 | 内容 | 数量 |
|---|---|---|---|
| `001-099 師團物件` | 1–31 師團与旗帜、32–95 兵种与战马、96–99 箭矢 | 师团级物件 | **99** |
| `100-499 作戰時的物件(兵&主將&武將技&.....)` | 100 预留空段、101–220 主将身体、221–254 武器、255–262 坐骑、263–267 背景、268–499 特效/虚拟/天气 | 战场物件 | **400** |
| `500- Other objects` | 500–620 全为武将技特效 | 其它 | **121** |

`001-099` 恰好收满 99 个、`100` 恰好是一个只写中文说明的空段、`101` 恰好是第一个
主将身体 —— 这三处吻合不可能靠巧合，说明**物件编号 = 第几个 `[OBJECT]` 段**这条规则是对的。

> **一个坑**：中间插了一段 `[OBJECT2]`（`測試用物件`，开发期残留，不占正式编号），
> 所以文件里的**段序号** = 物件编号 + 2（测试段之前）或 + 3（之后）。
> 本文档与 JSON 里 `obj`/`no_canonical` 是物件编号，`no` 是段序号，两者都保留。

### 1.2 TYPE 类型枚举（4 个）

| 常量 | 值 |
|---|---|
| `TYPE_BASE` | 1 |
| `TYPE_TROOP` | 2 |
| `TYPE_FORCE` | 3 |
| `TYPE_MAJOR` | 4 |

`Type` 字段在数据里写作**符号引用** `%TYPE_FORCE` 等，少数段写字面数字。
分布（621 段）：`%TYPE_FORCE` 421、`%TYPE_MAJOR` 162、`%TYPE_BASE` 33（含测试段那 1 个）、
字面 `2` 4 个（早期师团段直接写数字）、空 1 个（骨架段）。

### 1.3 Process（21 种运行时行为）

每个物件挂一个 `Process`，决定引擎用哪个类去跑它 —— 这是"物件类型"的真正枚举：

| Process | 值 |
|---|---|
| `DefaultObjectProcess` | 1 |
| `TroopObjectProcess` | 2 |
| `ForceSoldierObjectProcess` | 3 |
| `ForceMajorObjectProcess` | 4 |
| `GeneralObjectProcess` | 5 |
| `MagicWaveProcess` | 6 |
| `MagicFireProcess` | 7 |
| `MagicRainProcess` | 8 |
| `MagicArrowProcess` | 9 |
| `TroopFlagsProcess` | 10 |
| `MagicObjectProcess` | 11 |
| `ForceArrowObjectProcess` | 12 |
| `ShadowObjectProcess` | 13 |
| `MajorHeadProcess` | 14 |
| `MajorWeaponProcess` | 15 |
| `ForceHorseProcess` | 16 |
| `TroopShapeObjectProcess` | 17 |
| `MajorHorseProcess` | 18 |
| `WeatherObjectProcess` | 19 |
| `AniObjectProcess` | 20 |
| `MajorGeneralWeaponProcess` | 21 |

### 1.4 Flags 物件标志位（23 个常量，含 3 个组合别名）

| 标志 | 位 | 实际使用次数 |
|---|---|---|
| `OF_MAN` | 0x1 | 228 |
| `OF_MISSILE` | 0x2 | 0 |
| `OF_BACKGROUND` | 0x4 | 5 |
| `OF_CAVALRY` | 0x8 | 0 |
| `OF_BLOCKMAN` | 0x10 | 0 |
| `OF_BLOCKMISSILE` | 0x20 | 0 |
| `OF_BIGSHAPE` | 0x40 | 254 |
| `OF_TRIGGERMAN` | 0x100 | 2 |
| `OF_TRIGGERMISSILE` | 0x200 | 0 |
| `OF_NOGRAVITY` | 0x10000 | 295 |
| `OF_NONSYNCHRONISM` | 0x20000 | 18 |
| `OF_MIXER` | 0x40000 | 6 |
| `OF_WHITELIGHT` | 0x80000 | 268 |
| `OF_DARKLIGHT` | 0x100000 | 3 |
| `OF_TARGET` | 0x200000 | 0 |
| `OF_BOMB` | 0x400000 | 16 |
| `OF_ENEMYGENERAL` | 0x1000000 | 4 |
| `OF_ENEMYFORCE` | 0x2000000 | 4 |
| `OF_ATTACKENEMY` | 0x3000000 | 2 |
| `OF_MYGENERAL` | 0x4000000 | 2 |
| `OF_MYFORCE` | 0x8000000 | 0 |
| `OF_ATTACKMY` | 0xC000000 | 0 |
| `OF_ATTACKALL` | 0xF000000 | 0 |

组合别名：`OF_ATTACKENEMY = OF_ENEMYGENERAL|OF_ENEMYFORCE = 0x03000000`、
`OF_ATTACKMY = 0x0C000000`、`OF_ATTACKALL = 0x0F000000`。

写法上 `Flags`（589 段）与 `FLAGS`（31 段）混用；值可以是逗号分隔、加号叠加或纯数字 0。
解析必须大小写不敏感 + 两种分隔符都认。

### 1.5 OM_ 动作码（15 个，动画事件用）

| 动作 | 值 |
|---|---|
| `OM_ALLOCATE` | 0x1 |
| `OM_TICK` | 0x2 |
| `OM_REMOVE` | 0x3 |
| `OM_ATTACK` | 0x10000 |
| `OM_WALK` | 0x10001 |
| `OM_WAIT` | 0x10002 |
| `OM_DEATH` | 0x10003 |
| `OM_PAIN` | 0x10004 |
| `OM_TOUCHER` | 0x10005 |
| `OM_TOUCHED` | 0x10006 |
| `OM_INITATTACK` | 0x10007 |
| `OM_INITDEATH` | 0x10008 |
| `OM_DEATHSTOP` | 0x10009 |
| `OM_FLEERUN` | 0x1000C |
| `OM_SETTARGET` | 0x20001 |

## 2. 字段详解：游戏自带的"字段字典段"

`THINGS.INI` 第 **1324** 行有一段 `[OBJECT]`，`Name = 主將L1 (主體)`，
`Sequence`/`Type`/`Space`/`Flags`/`Process`/`Directory` 全空，而每个动画字段的值
**不是图形名，而是中文说明**：

```
Name = 主將L1 (主體)
Sequence = 
Type = 
Space = 
Flags = 
Process = 
Directory = 
First = 起始圖檔
Wait = 等待
Walk = 前進
Attack = 正常攻擊
Attack2 = 後攻擊
Attack3 = 半月斬
Attack4 = 神鬼亂舞
Attack5 = ??
Spell1 = 施法1
Spell2 = 施法2
Shot1 = 射弓
Shot2 = 射鬼擊
Shot3 = 連努
Defense = 防禦
Pain = 被打到
Death = 死亡
Win = 勝利
```

这是宇峻自己留下的字段字典 —— 下表的动画字段含义**不是推测，是厂商写的**。

### 2.1 公共字段

| 字段 | 含义 | 取值/证据 |
|---|---|---|
| `Name` | 物件名（调试器里显示的名字） | 可带 `\t` 注释如 `弓箭\t(射出去的弓箭)` |
| `Sequence` | **逻辑编号**，与段序号无关 | 师团 51-54；旗帜 1-27；兵种 100-172；箭 500-503；主将身体 600-859；武器 700-767；马 900-907；特效 10000+；天气 9994-9996 |
| `Type` | 物件大类 | 见 1.2 |
| `Space` | 四元组 `x,y,w,h` | 实测 `8,8,64,0`（人形）、`4,4,48,0`（师团移动）、`8,8,8,0`（旗帜） |
| `Flags` / `FLAGS` | 标志位组合 | 见 1.4 |
| `Process` | 运行时行为类 | 见 1.3 |
| `Directory` | 图形子目录（相对 SHAPE\） | `\MAJOR\BODY`、`\Force\`、`\magic\038`（大小写混用） |
| `Life` | 存活时间（**推测**：毫秒） | 仅 16 处：马尸体 `1200`、箭 `2400`；无 Life 的物件不自动消失 |

### 2.2 动画字段（含出现次数）

| 字段 | 官方中文含义 | 出现次数 | 说明 |
|---|---|---|---|
| `First` | 起始圖檔 | 163 | 骨架段给出的中文含义 |
| `Wait` | 等待 | 621 | 骨架段给出的中文含义 |
| `Walk` | 前進 | 232 | 骨架段给出的中文含义 |
| `Attack` | 正常攻擊 | 216 | 骨架段给出的中文含义 |
| `Attack2` | 後攻擊 | 163 | 骨架段给出的中文含义 |
| `Attack3` | 半月斬 | 163 | 骨架段给出的中文含义 |
| `Attack4` | 神鬼亂舞 | 163 | 骨架段给出的中文含义 |
| `Attack5` | ?? | 163 | 骨架段给出的中文含义 |
| `Spell1` | 施法1 | 163 | 骨架段给出的中文含义 |
| `Spell2` | 施法2 | 163 | 骨架段给出的中文含义 |
| `Shot1` | 射弓 | 163 | 骨架段给出的中文含义 |
| `Shot2` | 射鬼擊 | 163 | 骨架段给出的中文含义 |
| `Shot3` | 連努 | 163 | 骨架段给出的中文含义 |
| `Defense` | 防禦 | 215 | 骨架段给出的中文含义 |
| `Pain` | 被打到 | 215 | 骨架段给出的中文含义 |
| `Death` | 死亡 | 232 | 骨架段给出的中文含义 |
| `Win` | 勝利 | 176 | 骨架段给出的中文含义 |

补充（数据侧推断）：

- `Attack2` = "後攻擊"：从 Attack2 起图形名换一位变体位（`L1A6…`/`L1A5…`），
  对应不同武器/攻击方向的动作组。
- `Attack3` = "半月斬"、`Attack4` = "神鬼亂舞"：**专给特定武将技用**，
  印证"主将攻击动画随技能切换"的设计。
- `Attack5` 官方写作 `??`（未实现/预留），但真实数据里 Attack5..Attack8 都有内容，
  说明发售后又扩了动作槽位。
- `Win` = 勝利、`Lose` = 失敗（仅 3 段有 `Lose`，师团专用）。
- 士兵只有 Wait/Walk/Attack/Win/Defense/Pain/Death 7 个动作；主将身体有 22 个。

## 3. 动画序列语法（本表的核心）

动画字段的值是一串 **token**，共 7 类：

| token | 出现次数 | 含义 | 例子 |
|---|---|---|---|
| `#n` | 6848 | 帧延时（1..9999，`#9999` 常用作「停在这里」） | `#16`、`#128`、`#9999` |
| 图形名 | 34220 | 一帧图形，文件 = `SHAPE\<Directory>\<名>.SHP` | `L1W10001`、`MCA10002` |
| `@%OM_xxx` | 1109 | 在该帧向引擎发物件动作事件 | `@%OM_ATTACK`、`@%OM_DEATHSTOP` |
| `$xxx` | 263 | 播放音效 | `$Hit01`、`$Defense`、`$Horse01` |
| `!nnnn` | 15 | 启动 `SCRIPT\MAGIC.SO` 中编号 nnnn 的脚本 | `!7005`、`!33002` |
| `SCROVER` | 3040 | 序列到此结束 | 动画末尾 |
| `NULSHAPE` | 1074 | 本帧不画（空图形占位） | `First = #1, NULSHAPE` |

### 3.1 真实样例：主将身体（`主將L1 (主體) - 劍`，Sequence=600）

```
Space = 8,8,64,0
Flags = OF_MAN, OF_BIGSHAPE
Process = %ForceMajorObjectProcess
Directory = \\MAJOR\\BODY
First = #1, NULSHAPE
Wait = L1W10001, #16, L1W10002, #8, L1W10003, #8, L1W10004, #16, L1W10003, #8, L1W10002, #8
Walk = #4, L1R10001, L1R10002, ... L1R10009
Attack = #3, L1A10002, ... L1A10007, @%OM_ATTACK, L1A10008, ... L1A10011, SCROVER
Spell1 = #64, L1L10001, SCROVER
Defense = #8, L1D10002, $Defense, SCROVER
Pain = #4, L1H10002, $Hit01, L1H10002, SCROVER
Death = #5, L1F10001, ... L1F10004, #128, L1F10006, #5, ... , #128, L1F10010, #9999, @%OM_DEATHSTOP, SCROVER
```

图形名规律：`{身体}{动作字母}{变体位}{帧:4d}`
（W=待机 R=跑 A=攻击 L=施法 S=射 D=防御 H=受击 F=倒地 FS=胜利），
变体位即武器型（1=劍 2=槍 3=矛 5/6=其它），帧号与磁盘 4 位文件名一一对应。

### 3.2 `@` 事件全部清单

| 事件 | 次数 | OM_ 值 |
|---|---|---|
| `@%OM_ATTACK` | 705 | — |
| `@%OM_DEATHSTOP` | 344 | — |
| `@%OM_REMOVE` | 48 | — |
| `@%OM_WALK` | 12 | — |

`@%OM_ATTACK` 出现在挥击命中的那一帧 —— 引擎在此刻做伤害判定；
`@%OM_DEATHSTOP` 出现在死亡动画末尾 —— 停止死亡动画并保留尸体。

### 3.3 `$` 音效全部清单

| 音效 | 次数 |
|---|---|
| `$Defense` | 120 |
| `$Hit01` | 120 |
| `$Horse01` | 8 |
| `$m005snd02` | 4 |
| `$m004snd01` | 2 |
| `$m007snd01` | 2 |
| `$m010snd01` | 2 |
| `$m005snd04` | 1 |
| `$m005snd03` | 1 |
| `$m005snd05` | 1 |
| `$m033snd01` | 1 |
| `$m033snd02` | 1 |

### 3.4 `!nnnn` 启动脚本（修版说明 #15 的官方特性）

修版说明原话："支持在 Things.ini 中，主将/士兵/弓箭动画序列里加入 `!xxxxx` 启动脚本
（类似于武将技物件）"。全表**恰好 15 处**：

| 物件号 | 物件名 | 所在字段 | 脚本号 |
|---|---|---|---|
| 271 | 雨水 | `Death` | 99 |
| 272 | 雨水 | `Death` | 99 |
| 273 | 雨水 | `Death` | 99 |
| 317 | 向上射弓箭的藍小兵 | `Wait` | 6003 |
| 318 | 向上射弓箭的紅小兵 | `Wait` | 6004 |
| 336 | 投石車 | `Wait` | 7005 |
| 339 | 我方向下飛的石頭 | `Death` | 7003 |
| 340 | 敵方向下飛的石頭 | `Death` | 7003 |
| 348 | 我方向下飛的石頭 | `Death` | 7004 |
| 349 | 敵方向下飛的石頭 | `Death` | 7004 |
| 358 | 投石車 | `Wait` | 7005 |
| 435 | 火柱 | `Death` | 18002 |
| 442 | 火柱 | `Death` | 42002 |
| 539 | 藍砲 | `Wait` | 33002 |
| 543 | 紅砲 | `Wait` | 33002 |

这 15 处是"物件 → MAGIC.SO 脚本"的唯一接口，也是新引擎最值得保留的扩展点：
物件不只能播动画，还能在指定帧回调一段脚本。

## 4. 621 个物件段的分类（620 正式 + 1 测试段）

| 分类 | 个数 |
|---|---|
| 武将技特效 | 348 |
| 主将身体（4 武器变体） | 120 |
| 武将武器 | 34 |
| 師團旗幟 | 27 |
| 兵种·红军兵种 | 13 |
| 兵种·红军骑兵 | 13 |
| 兵种·蓝军兵种 | 13 |
| 兵种·蓝军骑兵 | 13 |
| 兵种·骑兵战马 | 12 |
| 主将坐骑 | 8 |
| 背景/场景道具 | 5 |
| 師團（行军/战斗军团表示） | 4 |
| 箭矢（射出去的箭/飞刀/链锤） | 4 |
| 天气 | 3 |
| 占位/异常段（无 Process） | 1 |
| 影子 | 1 |
| 测试用物件（OBJECT2） | 1 |
| 通用动画物件 | 1 |

各分类占用的编号区间（正式编号）：

| 分类 | 起始编号 | 结束编号 | 个数 |
|---|---|---|---|
| 師團（行军/战斗军团表示） | 1 | 4 | 4 |
| 師團旗幟 | 5 | 31 | 27 |
| 兵种·蓝军兵种 | 32 | 44 | 13 |
| 兵种·红军兵种 | 45 | 57 | 13 |
| 兵种·蓝军骑兵 | 58 | 70 | 13 |
| 兵种·红军骑兵 | 71 | 83 | 13 |
| 兵种·骑兵战马 | 84 | 95 | 12 |
| 箭矢（射出去的箭/飞刀/链锤） | 96 | 99 | 4 |
| 占位/异常段（无 Process） | 100 | 100 | 1 |
| 主将身体（4 武器变体） | 101 | 220 | 120 |
| 武将武器 | 221 | 254 | 34 |
| 主将坐骑 | 255 | 262 | 8 |
| 背景/场景道具 | 263 | 267 | 5 |
| 武将技特效 | 268 | 620 | 348 |
| 影子 | 269 | 269 | 1 |
| 通用动画物件 | 270 | 270 | 1 |
| 天气 | 271 | 273 | 3 |

注意区间是各类的 min..max，**在区间内会交错**（如 268–273 的虚拟物件/影子/天气夹在
武将技特效的编号里，因为它们同属 `\magic\` 家族）。要精确查某个号属于哪类，看第 6 节总表。

### 4.1 兵种表（13 个基准兵种 × 4 套配色/骑乘 = 52 个物件）

| Sequence | 物件号 | 名称 | Walk 帧 | Attack 帧 | Death 帧 | 动作数 | 图形命中率 |
|---|---|---|---|---|---|---|---|
| 100 | 32 | 朴刀兵 | 12 | 10 | 10 | 7 | 100% |
| 101 | 33 | 長槍兵 | 12 | 10 | 10 | 7 | 100% |
| 102 | 34 | 大刀兵 | 12 | 10 | 10 | 7 | 100% |
| 103 | 35 | 弓箭兵 | 12 | 10 | 10 | 7 | 100% |
| 104 | 36 | 鍊錘兵 | 12 | 10 | 10 | 7 | 100% |
| 105 | 37 | 飛刀兵 | 12 | 10 | 10 | 7 | 100% |
| 106 | 38 | 武鬥兵 | 12 | 10 | 10 | 7 | 100% |
| 107 | 39 | 蠻族兵 | 12 | 10 | 10 | 7 | 100% |
| 108 | 40 | 鐵鎚兵 | 12 | 10 | 10 | 7 | 100% |
| 109 | 41 | 籐甲兵 | 12 | 10 | 10 | 7 | 100% |
| 110 | 42 | 黃巾賊 | 12 | 10 | 10 | 7 | 100% |
| 111 | 43 | 弩兵 | 12 | 10 | 10 | 7 | 100% |
| 112 | 44 | 女兵 | 12 | 10 | 10 | 7 | 100% |
| 120 | 45 | 朴刀兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 121 | 46 | 長槍兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 122 | 47 | 大刀兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 123 | 48 | 弓箭兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 124 | 49 | 鍊錘兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 125 | 50 | 飛刀兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 126 | 51 | 武鬥兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 127 | 52 | 蠻族兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 128 | 53 | 鐵鎚兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 129 | 54 | 籐甲兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 130 | 55 | 黃巾賊(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 131 | 56 | 弩兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 132 | 57 | 女兵(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 140 | 58 | 朴刀兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 141 | 59 | 長槍兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 142 | 60 | 大刀兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 143 | 61 | 弓箭兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 144 | 62 | 鍊錘兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 145 | 63 | 飛刀兵 (騎兵) | 12 | 10 | 10 | 7 | 100% |
| 146 | 64 | 武鬥兵 (騎兵) | 12 | 10 | 10 | 7 | 100% |
| 147 | 65 | 蠻族兵 (騎兵) | 12 | 10 | 10 | 7 | 100% |
| 148 | 66 | 鐵鎚兵 (騎兵) | 12 | 10 | 10 | 7 | 100% |
| 149 | 67 | 籐甲兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 150 | 68 | 黃巾賊 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 151 | 69 | 弩兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 152 | 70 | 女兵 (騎兵) | 9 | 10 | 10 | 7 | 100% |
| 160 | 71 | 朴刀兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 161 | 72 | 長槍兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 162 | 73 | 大刀兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 163 | 74 | 弓箭兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 164 | 75 | 鍊錘兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 165 | 76 | 飛刀兵 (騎兵)(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 166 | 77 | 武鬥兵 (騎兵)(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 167 | 78 | 蠻族兵 (騎兵)(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 168 | 79 | 鐵鎚兵 (騎兵)(紅軍) | 12 | 10 | 10 | 7 | 100% |
| 169 | 80 | 籐甲兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 170 | 81 | 黃巾賊 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 171 | 82 | 弩兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |
| 172 | 83 | 女兵 (騎兵)(紅軍) | 9 | 10 | 10 | 7 | 100% |

四个区段：`100-112` 蓝军步兵、`120-132` 红军步兵、`140-152` 蓝军骑兵、`160-172` 红军骑兵。
骑兵另配 `180-195` 战马物件 12 个。13 个基准兵种：
朴刀兵/長槍兵/大刀兵/弓箭兵/鍊錘兵/飛刀兵/武鬥兵/蠻族兵/鐵鎚兵/籐甲兵/黃巾賊/弩兵/女兵。

### 4.2 主将身体：30 组 × 4 武器变体 = 120

名字格式 `主將L1 (主體) - 劍`：`L0..LE`（15 组）与 `R0..RE`（15 组，红军配色），
每组 4 个变体按武器分（劍/槍/矛/刀）。Sequence 600-859。

### 4.3 武将技特效：`\magic\NNN` 目录

48 个目录实例（含大小写混写）。数据里 `\MAGIC\` 与 `\magic\` 混用，
同一个编号会分成两行出现（如 `\MAGIC\000` 14 + `\magic\000` 4 = 18 个物件同属 000 号家族）：

| 目录 | 物件数 |
|---|---|
| `\magic\038` | 32 |
| `\magic\029` | 30 |
| `\magic\007` | 24 |
| `\magic\013` | 16 |
| `\magic\036` | 16 |
| `\magic\020` | 15 |
| `\MAGIC\000` | 14 |
| `\magic\026` | 13 |
| `\magic\003` | 11 |
| `\magic\006` | 11 |
| `\magic\034` | 11 |
| `\magic\005` | 10 |
| `\magic\010` | 10 |
| `\magic\017` | 10 |
| `\MAGIC\018` | 10 |
| `\magic\028` | 8 |
| `\magic\031` | 8 |
| `\magic\039` | 8 |
| `\MAGIC\006` | 7 |
| `\MAGIC\015` | 6 |
| `\MAGIC\016` | 6 |
| `\magic\033` | 6 |
| `\magic\014` | 5 |
| `\magic\022` | 5 |
| `\magic\000` | 4 |
| `\MAGIC\010` | 4 |
| `\magic\015` | 4 |
| `\magic\032` | 4 |
| `\magic\037` | 4 |
| `\magic\001` | 3 |
| `\magic\008` | 3 |
| `\magic\030` | 3 |
| `\magic\009` | 2 |
| `\magic\011` | 2 |
| `\magic\012` | 2 |
| `\magic\018` | 2 |
| `\magic\019` | 2 |
| `\magic\021` | 2 |
| `\magic\023` | 2 |
| `\magic\025` | 2 |
| `\magic\027` | 2 |
| `\magic\035` | 2 |
| `\magic\040` | 2 |
| `\` | 1 |
| `\magic\004` | 1 |
| `\MAGIC\008` | 1 |
| `\MAGIC\011` | 1 |
| `\magic\041` | 1 |

命名即用法：`\magic\038` 全是剑光（`劍A1..A16 / 劍B1..B16`），`\magic\039` 是桶子与碎片，
`\magic\003` 是飞行道具与弓光。这套"一个目录 = 一个技能家族"的组织方式值得新游戏照抄。

### 4.4 虚拟物件与天气

| Sequence | 名称 | 作用 |
|---|---|---|
| 1011 | `虛幻物件 (沒有任何圖形)` | 纯逻辑物件，占一个物件槽做判定/触发 |
| 1012 | `影子 (沒有固定圖形)` | `ShadowObjectProcess`，运行时按主人图形生成影子 |
| 1013 | `AniObjectProcess` 物件 | 通用动画播放器 |
| 2500 | `無形有重力` | 看不见但受重力（落点判定/砸地） |
| 2501 | `無形無重力` | 看不见也不受重力 |
| 9994-9996 | `雨水` 等 | `WeatherObjectProcess`，天气层 |

## 5. 交叉验证：图形名 ↔ 磁盘文件

| 指标 | 数值 |
|---|---|
| 图形引用总数 | 34220 |
| 命中 | 34195 |
| 缺失 | 25 |
| 命中率 | 99.93% |
| 有缺失的物件数 | 2 |

有缺失的只有这两段：

| 物件号 | 名称 | 缺失数 | 命中率 |
|---|---|---|---|
|  | 測試用物件 | 8 | 0% |
| 100 | 主將L1 (主體) | 17 | 0% |

也就是说**真实物件的图形引用 100% 命中**，25 处缺失全在
`L359 [OBJECT2] 測試用物件`（引用不存在的 `M1R10001-8`）与 `L1324` 骨架段（值是中文说明文字）上。
34220 个文件名不可能靠猜对上 —— 这反过来证明编号/命名规则推导正确。

## 6. 621 个物件段总清单（编号 1..620，另有 1 个测试段）

| 物件号 | Sequence | 名称 | Type | Process | Directory | 分类 |
|---|---|---|---|---|---|---|
| 1 | 51 | 師團移動時的物件 | TYPE_TROOP | TroopObjectProcess | \Troop\ | 師團（行军/战斗军团表示） |
| 2 | 52 | 師團移動時的物件(1) | TYPE_TROOP | TroopShapeObjectProcess | \Troop\ | 師團（行军/战斗军团表示） |
| 3 | 53 | 師團移動時的物件(2) | TYPE_TROOP | TroopShapeObjectProcess | \Troop\ | 師團（行军/战斗军团表示） |
| 4 | 54 | 師團移動時的物件(3) | TYPE_TROOP | TroopShapeObjectProcess | \Troop\ | 師團（行军/战斗军团表示） |
| 5 | 1 | Troop Flags 1 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 6 | 2 | Troop Flags 2 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 7 | 3 | Troop Flags 3 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 8 | 4 | Troop Flags 4 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 9 | 5 | Troop Flags 5 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 10 | 6 | Troop Flags 6 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 11 | 7 | Troop Flags 7 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 12 | 8 | Troop Flags 8 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 13 | 9 | Troop Flags 9 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 14 | 10 | Troop Flags 10 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 15 | 11 | Troop Flags 11 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 16 | 12 | Troop Flags 12 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 17 | 13 | Troop Flags 13 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 18 | 14 | Troop Flags 14 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 19 | 15 | Troop Flags 15 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 20 | 16 | Troop Flags 16 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 21 | 17 | Troop Flags 17 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 22 | 18 | Troop Flags 18 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 23 | 19 | Troop Flags 19 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 24 | 20 | Troop Flags 20 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 25 | 21 | Troop Flags 21 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 26 | 22 | Troop Flags 22 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 27 | 23 | Troop Flags 23 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 28 | 24 | Troop Flags 24 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 29 | 25 | Troop Flags 25 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 30 | 26 | Troop Flags 26 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| 31 | 27 | Troop Flags 27 | TYPE_BASE | TroopFlagsProcess | \Troop\ | 師團旗幟 |
| — | 99 | 測試用物件 | TYPE_BASE | DefaultObjectProcess | \Force\ | 测试用物件（OBJECT2） |
| 32 | 100 | 朴刀兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 33 | 101 | 長槍兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 34 | 102 | 大刀兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 35 | 103 | 弓箭兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 36 | 104 | 鍊錘兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 37 | 105 | 飛刀兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 38 | 106 | 武鬥兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 39 | 107 | 蠻族兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 40 | 108 | 鐵鎚兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 41 | 109 | 籐甲兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 42 | 110 | 黃巾賊 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 43 | 111 | 弩兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 44 | 112 | 女兵 | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军兵种 |
| 45 | 120 | 朴刀兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 46 | 121 | 長槍兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 47 | 122 | 大刀兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 48 | 123 | 弓箭兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 49 | 124 | 鍊錘兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 50 | 125 | 飛刀兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 51 | 126 | 武鬥兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 52 | 127 | 蠻族兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 53 | 128 | 鐵鎚兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 54 | 129 | 籐甲兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 55 | 130 | 黃巾賊(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 56 | 131 | 弩兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 57 | 132 | 女兵(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军兵种 |
| 58 | 140 | 朴刀兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 59 | 141 | 長槍兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 60 | 142 | 大刀兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 61 | 143 | 弓箭兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 62 | 144 | 鍊錘兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 63 | 145 | 飛刀兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 64 | 146 | 武鬥兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 65 | 147 | 蠻族兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 66 | 148 | 鐵鎚兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 67 | 149 | 籐甲兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 68 | 150 | 黃巾賊 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 69 | 151 | 弩兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 70 | 152 | 女兵 (騎兵) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·蓝军骑兵 |
| 71 | 160 | 朴刀兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 72 | 161 | 長槍兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 73 | 162 | 大刀兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 74 | 163 | 弓箭兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 75 | 164 | 鍊錘兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 76 | 165 | 飛刀兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 77 | 166 | 武鬥兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 78 | 167 | 蠻族兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 79 | 168 | 鐵鎚兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 80 | 169 | 籐甲兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 81 | 170 | 黃巾賊 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 82 | 171 | 弩兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 83 | 172 | 女兵 (騎兵)(紅軍) | TYPE_FORCE | ForceSoldierObjectProcess | \Force\ | 兵种·红军骑兵 |
| 84 | 180 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 85 | 181 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 86 | 182 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 87 | 183 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 88 | 184 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 89 | 185 | 馬(藍軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 90 | 190 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 91 | 191 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 92 | 192 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 93 | 193 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 94 | 194 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 95 | 195 | 馬(紅軍) 騎兵死亡後的馬 | TYPE_FORCE | ForceHorseProcess | \Force\ | 兵种·骑兵战马 |
| 96 | 500 | 弓箭 (射出去的弓箭) | TYPE_FORCE | ForceArrowObjectProcess | \Force\ | 箭矢（射出去的箭/飞刀/链锤） |
| 97 | 501 | 飛刀 (射出去的飛刀) | TYPE_FORCE | ForceArrowObjectProcess | \Force\ | 箭矢（射出去的箭/飞刀/链锤） |
| 98 | 502 | 鍊錘 (射出去的鍊錘) | TYPE_FORCE | ForceArrowObjectProcess | \Force\ | 箭矢（射出去的箭/飞刀/链锤） |
| 99 | 503 | 弩箭 (弩兵射出去的箭) | TYPE_FORCE | ForceArrowObjectProcess | \Force\ | 箭矢（射出去的箭/飞刀/链锤） |
| 100 | — | 主將L1 (主體) | — | — | — | 占位/异常段（无 Process） |
| 101 | 600 | 主將L1 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 102 | 601 | 主將L1 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 103 | 602 | 主將L1 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 104 | 603 | 主將L1 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 105 | 604 | 主將L2 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 106 | 605 | 主將L2 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 107 | 606 | 主將L2 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 108 | 607 | 主將L2 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 109 | 608 | 主將L3 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 110 | 609 | 主將L3 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 111 | 610 | 主將L3 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 112 | 611 | 主將L3 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 113 | 612 | 主將L4 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 114 | 613 | 主將L4 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 115 | 614 | 主將L4 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 116 | 615 | 主將L4 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 117 | 616 | 主將L5 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 118 | 617 | 主將L5 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 119 | 618 | 主將L5 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 120 | 619 | 主將L5 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 121 | 620 | 主將L6 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 122 | 621 | 主將L6 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 123 | 622 | 主將L6 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 124 | 623 | 主將L6 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 125 | 624 | 主將L7 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 126 | 625 | 主將L7 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 127 | 626 | 主將L7 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 128 | 627 | 主將L7 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 129 | 628 | 主將L8 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 130 | 629 | 主將L8 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 131 | 630 | 主將L8 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 132 | 631 | 主將L8 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 133 | 632 | 主將L9 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 134 | 633 | 主將L9 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 135 | 634 | 主將L9 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 136 | 635 | 主將L9 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 137 | 636 | 主將LA (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 138 | 637 | 主將LA (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 139 | 638 | 主將LA (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 140 | 639 | 主將LA (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 141 | 640 | 主將LB (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 142 | 641 | 主將LB (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 143 | 642 | 主將LB (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 144 | 643 | 主將LB (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 145 | 644 | 主將LC (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 146 | 645 | 主將LC (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 147 | 646 | 主將LC (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 148 | 647 | 主將LC (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 149 | 648 | 主將LD (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 150 | 649 | 主將LD (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 151 | 650 | 主將LD (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 152 | 651 | 主將LD (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 153 | 652 | 主將LE (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 154 | 653 | 主將LE (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 155 | 654 | 主將LE (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 156 | 655 | 主將LE (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 157 | 656 | 主將L0 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 158 | 657 | 主將L0 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 159 | 658 | 主將L0 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 160 | 659 | 主將L0 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 161 | 800 | 主將R1 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 162 | 801 | 主將R1 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 163 | 802 | 主將R1 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 164 | 803 | 主將R1 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 165 | 804 | 主將R2 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 166 | 805 | 主將R2 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 167 | 806 | 主將R2 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 168 | 807 | 主將R2 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 169 | 808 | 主將R3 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 170 | 809 | 主將R3 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 171 | 810 | 主將R3 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 172 | 811 | 主將R3 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 173 | 812 | 主將R4 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 174 | 813 | 主將R4 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 175 | 814 | 主將R4 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 176 | 815 | 主將R4 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 177 | 816 | 主將R5 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 178 | 817 | 主將R5 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 179 | 818 | 主將R5 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 180 | 819 | 主將R5 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 181 | 820 | 主將R6 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 182 | 821 | 主將R6 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 183 | 822 | 主將R6 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 184 | 823 | 主將R6 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 185 | 824 | 主將R7 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 186 | 825 | 主將R7 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 187 | 826 | 主將R7 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 188 | 827 | 主將R7 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 189 | 828 | 主將R8 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 190 | 829 | 主將R8 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 191 | 830 | 主將R8 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 192 | 831 | 主將R8 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 193 | 832 | 主將R9 (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 194 | 833 | 主將R9 (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 195 | 834 | 主將R9 (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 196 | 835 | 主將R9 (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 197 | 836 | 主將RA (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 198 | 837 | 主將RA (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 199 | 838 | 主將RA (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 200 | 839 | 主將RA (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 201 | 840 | 主將RB (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 202 | 841 | 主將RB (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 203 | 842 | 主將RB (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 204 | 843 | 主將RB (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 205 | 844 | 主將RC (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 206 | 845 | 主將RC (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 207 | 846 | 主將RC (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 208 | 847 | 主將RC (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 209 | 848 | 主將RD (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 210 | 849 | 主將RD (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 211 | 850 | 主將RD (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 212 | 851 | 主將RD (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 213 | 852 | 主將RE (紅軍)(主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 214 | 853 | 主將RE (紅軍)(主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 215 | 854 | 主將RE (紅軍)(主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 216 | 855 | 主將RE (紅軍)(主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 217 | 856 | 主將R0 (主體) - 劍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 218 | 857 | 主將L0 (主體) - 槍 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 219 | 858 | 主將L0 (主體) - 矛 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 220 | 859 | 主將L0 (主體) - 刀 | TYPE_MAJOR | ForceMajorObjectProcess | \MAJOR\BODY | 主将身体（4 武器变体） |
| 221 | 700 | 主將 (武器)直劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 222 | 701 | 主將 (武器)吳鉤劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 223 | 702 | 主將 (武器)青銅劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 224 | 703 | 主將 (武器)流星鎚 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 225 | 704 | 主將 (武器)弧月刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 226 | 705 | 主將 (武器)雙股劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 227 | 706 | 主將 (武器)龍淵劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 228 | 707 | 主將 (武器)青釭劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 229 | 708 | 主將 (武器)古錠刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 230 | 709 | 主將 (武器)七星劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 231 | 710 | 主將 (武器)倚天劍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 232 | 720 | 主將 (武器)圓錐槍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 233 | 721 | 主將 (武器)鉤鎌槍 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 234 | 722 | 主將 (武器)馬叉 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 235 | 723 | 主將 (武器)金殺 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 236 | 724 | 主將 (武器)月牙戟 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 237 | 725 | 主將 (武器)雙鐵戟 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 238 | 726 | 主將 (武器)紫龍戟 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 239 | 727 | 主將 (武器)方天畫戟 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 240 | 740 | 主將 (武器)銅殳 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 241 | 741 | 主將 (武器)蛇矛 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 242 | 742 | 主將 (武器)銅長刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 243 | 743 | 主將 (武器)鐵鉞戟 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 244 | 744 | 主將 (武器)三尖刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 245 | 745 | 主將 (武器)鐵脊蛇矛 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 246 | 746 | 主將 (武器)丈八蛇矛 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 247 | 760 | 主將 (武器)眉尖刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 248 | 761 | 主將 (武器)鳳嘴刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 249 | 762 | 主將 (武器)大斧 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 250 | 763 | 主將 (武器)狼牙棒 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 251 | 764 | 主將 (武器)兩刃斧 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 252 | 765 | 主將 (武器)鐵蒺藜骨朵 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 253 | 766 | 主將 (武器)青龍刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 254 | 767 | 主將 (武器)青龍偃月刀 | TYPE_MAJOR | MajorGeneralWeaponProcess | \MAJOR\WEAPON | 武将武器 |
| 255 | 900 | 主將1 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 256 | 901 | 主將2 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 257 | 902 | 主將3 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 258 | 903 | 主將4 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 259 | 904 | 主將5 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 260 | 905 | 主將6 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 261 | 906 | 主將7 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 262 | 907 | 主將8 (馬) | TYPE_MAJOR | MajorHorseProcess | \MAJOR\HORSE | 主将坐骑 |
| 263 | 400 | 樹 | TYPE_BASE | DefaultObjectProcess | \BG | 背景/场景道具 |
| 264 | 401 | 樹 | TYPE_BASE | DefaultObjectProcess | \BG | 背景/场景道具 |
| 265 | 402 | 石頭 | TYPE_BASE | DefaultObjectProcess | \BG | 背景/场景道具 |
| 266 | 403 | 火台 | TYPE_BASE | DefaultObjectProcess | \BG | 背景/场景道具 |
| 267 | 404 | 火 | TYPE_BASE | DefaultObjectProcess | \BG | 背景/场景道具 |
| 268 | 1011 | 虛幻物件 (沒有任何圖形) | TYPE_FORCE | MagicObjectProcess | \ | 武将技特效 |
| 269 | 1012 | 影子 (沒有固定圖形) | TYPE_FORCE | ShadowObjectProcess | \ | 影子 |
| 270 | 1013 | 虛幻物件 (沒有任何圖形) | TYPE_FORCE | AniObjectProcess | \ | 通用动画物件 |
| 271 | 9994 | 雨水 | TYPE_FORCE | WeatherObjectProcess | \ | 天气 |
| 272 | 9995 | 雨水 | TYPE_FORCE | WeatherObjectProcess | \ | 天气 |
| 273 | 9996 | 雨水 | TYPE_FORCE | WeatherObjectProcess | \ | 天气 |
| 274 | 2500 | 無形有重力 | TYPE_FORCE | MagicObjectProcess | \magic\000 | 武将技特效 |
| 275 | 2501 | 無形無重力 | TYPE_FORCE | MagicObjectProcess | \magic\000 | 武将技特效 |
| 276 | 10003 | 火球 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 277 | 10004 | 集氣A | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 278 | 10005 | 集氣B | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 279 | 10006 | 集氣C | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 280 | 10007 | 集氣D | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 281 | 10008 | 集氣E | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 282 | 10009 | 集氣F | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 283 | 10010 | 集氣G | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 284 | 10011 | 集氣H | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 285 | 10012 | 血 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 286 | 10013 | 紫球 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 287 | 10014 | 青球 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 288 | 10015 | 士兵著火 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 289 | 10016 | 士兵著火 | TYPE_FORCE | MagicObjectProcess | \MAGIC\000 | 武将技特效 |
| 290 | 10017 | 掉下的不動鍋 | TYPE_FORCE | MagicObjectProcess | \magic\000 | 武将技特效 |
| 291 | 10018 | 掉下的不動鍋 | TYPE_FORCE | MagicObjectProcess | \magic\000 | 武将技特效 |
| 292 | 11001 | 半月斬 | TYPE_FORCE | MagicObjectProcess | \magic\001 | 武将技特效 |
| 293 | 11002 | 半月斬爆炸 | TYPE_FORCE | MagicObjectProcess | \magic\001 | 武将技特效 |
| 294 | 11003 | 煙塵A | TYPE_FORCE | MagicObjectProcess | \magic\001 | 武将技特效 |
| 295 | 13001 | 飛行武器箭（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 296 | 13002 | 飛行武器箭的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 297 | 13003 | 飛行武器小刀（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 298 | 13004 | 飛行武器小刀的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 299 | 13005 | 飛行武器戟（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 300 | 13006 | 飛行武器戟的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 301 | 13007 | 飛行武器箭的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 302 | 13008 | 飛行武器BOMB的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 303 | 13009 | 飛行武器BOMB的光（M012） | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 304 | 13010 | 落日弓的尾巴光 | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 305 | 13011 | 落月弓的頭光 | TYPE_FORCE | MagicObjectProcess | \magic\003 | 武将技特效 |
| 306 | 14001 | 衝車 | TYPE_FORCE | MagicObjectProcess | \magic\004 | 武将技特效 |
| 307 | 15001 | 閃電A | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 308 | 15002 | 閃電B | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 309 | 15003 | 閃電C | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 310 | 15004 | 煙 | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 311 | 15005 | 波及閃電 | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 312 | 15006 | 波及閃電 | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 313 | 15007 | 士兵身上的電 | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 314 | 15008 | 大型閃電（M009） | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 315 | 15009 | 大型閃電（M009） | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 316 | 15010 | 閃電 | TYPE_FORCE | MagicObjectProcess | \magic\005 | 武将技特效 |
| 317 | 16001 | 向上射弓箭的藍小兵 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 318 | 16002 | 向上射弓箭的紅小兵 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 319 | 16003 | 向上飛的箭 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 320 | 16004 | 我方向下飛的箭 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 321 | 16005 | 靜止的藍小兵 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 322 | 16006 | 靜止的紅小兵 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 323 | 16007 | 敵方向下飛的箭 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 324 | 16008 | 停止的箭火 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 325 | 16009 | 向上飛的箭火 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 326 | 16010 | 向下飛的箭火 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 327 | 16011 | 著火士兵身上的火 | TYPE_FORCE | MagicObjectProcess | \magic\006 | 武将技特效 |
| 328 | 16012 | 斷箭A | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 329 | 16013 | 斷箭B | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 330 | 16014 | 斷箭C | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 331 | 16015 | 斷箭D | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 332 | 16016 | 斷箭E | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 333 | 16017 | 斷箭F | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 334 | 16018 | 斷箭G | TYPE_FORCE | MagicObjectProcess | \MAGIC\006 | 武将技特效 |
| 335 | 17001 | 著火士兵身上的火 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 336 | 17002 | 投石車 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 337 | 17003 | 投石 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 338 | 17004 | 投石影子 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 339 | 17005 | 我方向下飛的石頭 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 340 | 17006 | 敵方向下飛的石頭 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 341 | 17007 | 石頭碎片 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 342 | 17008 | 石頭碎片 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 343 | 17009 | 石頭碎片 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 344 | 17010 | 石頭碎片 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 345 | 17011 | 石頭碎片 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 346 | 17012 | 火石爆炸 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 347 | 17013 | 石頭上的火 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 348 | 17014 | 我方向下飛的石頭 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 349 | 17015 | 敵方向下飛的石頭 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 350 | 17016 | 火花 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 351 | 17017 | 火花 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 352 | 17018 | 火花 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 353 | 17019 | 火花 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 354 | 17020 | 火花 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 355 | 17021 | 石頭上的火 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 356 | 17021 | 石頭上的火 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 357 | 17022 | 往上石頭上的火 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 358 | 17023 | 投石車 | TYPE_FORCE | MagicObjectProcess | \magic\007 | 武将技特效 |
| 359 | 18001 | 著火士兵身上的火 | TYPE_FORCE | MagicObjectProcess | \magic\008 | 武将技特效 |
| 360 | 18002 | 擴張的光氣環 | TYPE_FORCE | MagicObjectProcess | \MAGIC\008 | 武将技特效 |
| 361 | 18003 | 我方的攻擊魔法爆炸火 | TYPE_FORCE | MagicObjectProcess | \magic\008 | 武将技特效 |
| 362 | 18004 | 我方的攻擊魔法爆炸 | TYPE_FORCE | MagicObjectProcess | \magic\008 | 武将技特效 |
| 363 | 19001 | 著火士兵身上的火 | TYPE_FORCE | MagicObjectProcess | \magic\009 | 武将技特效 |
| 364 | 19002 | 我方的攻擊魔法火 | TYPE_FORCE | MagicObjectProcess | \magic\009 | 武将技特效 |
| 365 | 20001 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 366 | 20002 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 367 | 20003 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 368 | 20004 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 369 | 20005 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 370 | 20006 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 371 | 20007 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 372 | 20008 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 373 | 20009 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 374 | 20010 | 地劍 | TYPE_FORCE | MagicObjectProcess | \magic\010 | 武将技特效 |
| 375 | 20011 | 碎石A | TYPE_FORCE | MagicObjectProcess | \MAGIC\010 | 武将技特效 |
| 376 | 20012 | 碎石B | TYPE_FORCE | MagicObjectProcess | \MAGIC\010 | 武将技特效 |
| 377 | 20013 | 碎石C | TYPE_FORCE | MagicObjectProcess | \MAGIC\010 | 武将技特效 |
| 378 | 20014 | 碎石D | TYPE_FORCE | MagicObjectProcess | \MAGIC\010 | 武将技特效 |
| 379 | 21001 | 龍捲風 | TYPE_FORCE | MagicObjectProcess | \magic\011 | 武将技特效 |
| 380 | 21002 | 龍捲風 | TYPE_FORCE | MagicObjectProcess | \magic\011 | 武将技特效 |
| 381 | 21003 | 石粒 | TYPE_FORCE | MagicObjectProcess | \MAGIC\011 | 武将技特效 |
| 382 | 22001 | 劍氣地上尾光 | TYPE_FORCE | MagicObjectProcess | \magic\012 | 武将技特效 |
| 383 | 22002 | 分身衝刺 | TYPE_FORCE | MagicObjectProcess | \magic\012 | 武将技特效 |
| 384 | 23001 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 385 | 23002 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 386 | 23003 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 387 | 23004 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 388 | 23005 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 389 | 23006 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 390 | 23007 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 391 | 23008 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 392 | 23009 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 393 | 23010 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 394 | 23011 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 395 | 23012 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 396 | 23013 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 397 | 23014 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 398 | 23015 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 399 | 23016 | 定身 | TYPE_FORCE | MagicObjectProcess | \magic\013 | 武将技特效 |
| 400 | 24001 | WAVE | TYPE_FORCE | MagicObjectProcess | \magic\014 | 武将技特效 |
| 401 | 24002 | WAVE | TYPE_FORCE | MagicObjectProcess | \magic\014 | 武将技特效 |
| 402 | 24003 | WAVE | TYPE_FORCE | MagicObjectProcess | \magic\014 | 武将技特效 |
| 403 | 24004 | WAVE | TYPE_FORCE | MagicObjectProcess | \magic\014 | 武将技特效 |
| 404 | 24005 | WAVE | TYPE_FORCE | MagicObjectProcess | \magic\014 | 武将技特效 |
| 405 | 25001 | 外圍的電珠 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 406 | 25002 | 外圍的電珠 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 407 | 25003 | 光舞劍 | TYPE_FORCE | MagicObjectProcess | \magic\015 | 武将技特效 |
| 408 | 25004 | 光舞劍 | TYPE_FORCE | MagicObjectProcess | \magic\015 | 武将技特效 |
| 409 | 25005 | 光舞劍 | TYPE_FORCE | MagicObjectProcess | \magic\015 | 武将技特效 |
| 410 | 25006 | 光舞劍 | TYPE_FORCE | MagicObjectProcess | \magic\015 | 武将技特效 |
| 411 | 25007 | 中間的電泡 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 412 | 25008 | 中間的電泡 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 413 | 25009 | 外圍的電珠 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 414 | 25010 | 外圍的電珠 | TYPE_FORCE | MagicObjectProcess | \MAGIC\015 | 武将技特效 |
| 415 | 26001 | 聖光A | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 416 | 26002 | 聖光B | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 417 | 26003 | 聖光C | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 418 | 26004 | 聖光D | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 419 | 26005 | 聖光E | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 420 | 26006 | 聖光F | TYPE_FORCE | MagicObjectProcess | \MAGIC\016 | 武将技特效 |
| 421 | 27001 | 著火士兵身上的火（M002） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 422 | 27002 | 火龍，頭（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 423 | 27003 | 火龍，頭（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 424 | 27004 | 火龍，頭（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 425 | 27005 | 火龍，身（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 426 | 27006 | 火龍，身（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 427 | 27007 | 火龍，尾（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 428 | 27008 | 火龍，尾（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 429 | 27009 | 火龍，尾（M015） | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 430 | 27010 | 起點 | TYPE_FORCE | MagicObjectProcess | \magic\017 | 武将技特效 |
| 431 | 28001 | 龍 (召喚獸) | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 432 | 28002 | 火 | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 433 | 28003 | 火 | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 434 | 28004 | 火 | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 435 | 28005 | 火柱 | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 436 | 28006 | 中間的電泡（M009） | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 437 | 28007 | 中間的電泡（M009） | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 438 | 28008 | 外圍的電珠（M009） | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 439 | 28009 | 外圍的電珠（M009） | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 440 | 28010 | 著火士兵身上的火（M002） | TYPE_FORCE | MagicObjectProcess | \magic\018 | 武将技特效 |
| 441 | 28011 | 我方的攻擊魔法爆炸火（M005） | TYPE_FORCE | MagicObjectProcess | \magic\018 | 武将技特效 |
| 442 | 28012 | 火柱 | TYPE_FORCE | MagicObjectProcess | \MAGIC\018 | 武将技特效 |
| 443 | 29001 | 飛行武器箭 | TYPE_FORCE | MagicObjectProcess | \magic\019 | 武将技特效 |
| 444 | 29002 | 飛行武器箭的光 | TYPE_FORCE | MagicObjectProcess | \magic\019 | 武将技特效 |
| 445 | 30001 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 446 | 30002 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 447 | 30003 | 星星A | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 448 | 30004 | 星星B | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 449 | 30005 | 星星C | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 450 | 30006 | 星星D | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 451 | 30007 | 星星E | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 452 | 30008 | 星星F | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 453 | 30009 | 星星G | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 454 | 30010 | 星星H | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 455 | 30011 | 星星I | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 456 | 30012 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 457 | 30013 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 458 | 30014 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 459 | 30015 | 黑洞 | TYPE_FORCE | MagicObjectProcess | \magic\020 | 武将技特效 |
| 460 | 31001 | 火焰A | TYPE_FORCE | MagicObjectProcess | \magic\021 | 武将技特效 |
| 461 | 31002 | 石頭A | TYPE_FORCE | MagicObjectProcess | \magic\021 | 武将技特效 |
| 462 | 32001 | 冰霧 | TYPE_FORCE | MagicObjectProcess | \magic\022 | 武将技特效 |
| 463 | 32002 | 冰A | TYPE_FORCE | MagicObjectProcess | \magic\022 | 武将技特效 |
| 464 | 32003 | 碎冰A | TYPE_FORCE | MagicObjectProcess | \magic\022 | 武将技特效 |
| 465 | 32004 | 碎冰B | TYPE_FORCE | MagicObjectProcess | \magic\022 | 武将技特效 |
| 466 | 32005 | 碎冰C | TYPE_FORCE | MagicObjectProcess | \magic\022 | 武将技特效 |
| 467 | 33001 | 火A | TYPE_FORCE | MagicObjectProcess | \magic\023 | 武将技特效 |
| 468 | 33002 | 煙 | TYPE_FORCE | MagicObjectProcess | \magic\023 | 武将技特效 |
| 469 | 35001 | 太極A | TYPE_FORCE | MagicObjectProcess | \magic\025 | 武将技特效 |
| 470 | 35002 | 太極B | TYPE_FORCE | MagicObjectProcess | \magic\025 | 武将技特效 |
| 471 | 36001 | 水柱 | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 472 | 36002 | 石頭A | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 473 | 36003 | 石頭B | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 474 | 36004 | 水柱A | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 475 | 36005 | 水柱B | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 476 | 36006 | 水柱C | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 477 | 36007 | 水柱D | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 478 | 36008 | 水柱E | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 479 | 36009 | 水柱F | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 480 | 36010 | 水柱G | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 481 | 36011 | 水柱H | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 482 | 36012 | 水泡A | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 483 | 36013 | 水泡B | TYPE_FORCE | MagicObjectProcess | \magic\026 | 武将技特效 |
| 484 | 37001 | 牛 | TYPE_FORCE | MagicObjectProcess | \magic\027 | 武将技特效 |
| 485 | 37002 | 火焰A | TYPE_FORCE | MagicObjectProcess | \magic\027 | 武将技特效 |
| 486 | 38001 | 石頭 | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 487 | 38002 | 石頭碎片A | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 488 | 38003 | 石頭碎片B | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 489 | 38004 | 石頭碎片C | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 490 | 38005 | 石頭碎片D | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 491 | 38006 | 石頭碎片E | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 492 | 38007 | 石頭碎片F | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 493 | 38008 | 石頭碎片G | TYPE_FORCE | MagicObjectProcess | \magic\028 | 武将技特效 |
| 494 | 39001 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 495 | 39002 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 496 | 39003 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 497 | 39004 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 498 | 39005 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 499 | 39006 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 500 | 39007 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 501 | 39008 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 502 | 39009 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 503 | 39010 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 504 | 39011 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 505 | 39012 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 506 | 39013 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 507 | 39014 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 508 | 39015 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 509 | 39016 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 510 | 39017 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 511 | 39018 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 512 | 39019 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 513 | 39020 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 514 | 39021 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 515 | 39022 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 516 | 39023 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 517 | 39024 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 518 | 39025 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 519 | 39026 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 520 | 39027 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 521 | 39028 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 522 | 39029 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 523 | 39030 | 八卦 | TYPE_FORCE | MagicObjectProcess | \magic\029 | 武将技特效 |
| 524 | 40001 | 半月斬 | TYPE_FORCE | MagicObjectProcess | \magic\030 | 武将技特效 |
| 525 | 40002 | 半月斬 | TYPE_FORCE | MagicObjectProcess | \magic\030 | 武将技特效 |
| 526 | 40003 | 爆炸的光 | TYPE_FORCE | MagicObjectProcess | \magic\030 | 武将技特效 |
| 527 | 41001 | 火球 | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 528 | 41002 | 火柱A | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 529 | 41003 | 火柱B | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 530 | 41004 | 火柱C | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 531 | 41005 | 火柱D | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 532 | 41008 | 火 | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 533 | 41009 | 火 | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 534 | 41010 | 火 | TYPE_FORCE | MagicObjectProcess | \magic\031 | 武将技特效 |
| 535 | 42001 | 電球 | TYPE_FORCE | MagicObjectProcess | \magic\032 | 武将技特效 |
| 536 | 42002 | 電球 | TYPE_FORCE | MagicObjectProcess | \magic\032 | 武将技特效 |
| 537 | 42003 | 電球 | TYPE_FORCE | MagicObjectProcess | \magic\032 | 武将技特效 |
| 538 | 42004 | 電球 | TYPE_FORCE | MagicObjectProcess | \magic\032 | 武将技特效 |
| 539 | 43001 | 藍砲 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 540 | 43002 | 砲彈 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 541 | 43003 | 爆炸 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 542 | 43004 | 煙火 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 543 | 43005 | 紅砲 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 544 | 43006 | 砲彈 | TYPE_FORCE | MagicObjectProcess | \magic\033 | 武将技特效 |
| 545 | 44001 | 桶子 | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 546 | 44002 | 煙 | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 547 | 44003 | 爆炸 | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 548 | 44004 | 煙 | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 549 | 44005 | 桶子碎片A | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 550 | 44006 | 桶子碎片B | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 551 | 44007 | 桶子碎片C | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 552 | 44008 | 桶子碎片D | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 553 | 44009 | 桶子碎片E | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 554 | 44010 | 桶子碎片F | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 555 | 44011 | 桶子碎片G | TYPE_FORCE | MagicObjectProcess | \magic\034 | 武将技特效 |
| 556 | 45001 | 矛 | TYPE_FORCE | MagicObjectProcess | \magic\035 | 武将技特效 |
| 557 | 45002 | 矛 | TYPE_FORCE | MagicObjectProcess | \magic\035 | 武将技特效 |
| 558 | 46001 | 劍1 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 559 | 46002 | 劍2 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 560 | 46003 | 劍3 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 561 | 46004 | 劍4 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 562 | 46005 | 劍5 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 563 | 46006 | 劍6 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 564 | 46007 | 劍7 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 565 | 46008 | 劍8 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 566 | 46009 | 劍9 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 567 | 46010 | 劍10 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 568 | 46011 | 劍11 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 569 | 46012 | 劍12 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 570 | 46013 | 劍13 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 571 | 46014 | 劍14 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 572 | 46015 | 劍15 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 573 | 46016 | 劍16 | TYPE_FORCE | MagicObjectProcess | \magic\036 | 武将技特效 |
| 574 | 47001 | 火柱A | TYPE_FORCE | MagicObjectProcess | \magic\037 | 武将技特效 |
| 575 | 47002 | 火柱B | TYPE_FORCE | MagicObjectProcess | \magic\037 | 武将技特效 |
| 576 | 47003 | 火柱C | TYPE_FORCE | MagicObjectProcess | \magic\037 | 武将技特效 |
| 577 | 47004 | 火柱D | TYPE_FORCE | MagicObjectProcess | \magic\037 | 武将技特效 |
| 578 | 48001 | 劍A1 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 579 | 48002 | 劍A2 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 580 | 48003 | 劍A3 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 581 | 48004 | 劍A4 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 582 | 48005 | 劍A5 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 583 | 48006 | 劍A6 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 584 | 48007 | 劍A7 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 585 | 48008 | 劍A8 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 586 | 48009 | 劍A9 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 587 | 48010 | 劍A10 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 588 | 48011 | 劍A11 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 589 | 48012 | 劍A12 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 590 | 48013 | 劍A13 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 591 | 48014 | 劍A14 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 592 | 48015 | 劍A15 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 593 | 48016 | 劍A16 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 594 | 48017 | 劍B1 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 595 | 48018 | 劍B2 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 596 | 48019 | 劍B3 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 597 | 48020 | 劍B4 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 598 | 48021 | 劍B5 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 599 | 48022 | 劍B6 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 600 | 48023 | 劍B7 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 601 | 48024 | 劍B8 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 602 | 48025 | 劍B9 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 603 | 48026 | 劍B10 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 604 | 48027 | 劍B11 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 605 | 48028 | 劍B12 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 606 | 48029 | 劍B13 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 607 | 48030 | 劍B14 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 608 | 48031 | 劍B15 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 609 | 48032 | 劍B16 | TYPE_FORCE | MagicObjectProcess | \magic\038 | 武将技特效 |
| 610 | 49001 | 桶子 | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 611 | 49002 | 桶子碎片A | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 612 | 49003 | 桶子碎片B | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 613 | 49004 | 桶子碎片C | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 614 | 49005 | 桶子碎片D | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 615 | 49006 | 桶子碎片E | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 616 | 49007 | 桶子碎片F | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 617 | 49008 | 桶子碎片G | TYPE_FORCE | MagicObjectProcess | \magic\039 | 武将技特效 |
| 618 | 50001 | 石柱 | TYPE_FORCE | MagicObjectProcess | \magic\040 | 武将技特效 |
| 619 | 50002 | 煙 | TYPE_FORCE | MagicObjectProcess | \magic\040 | 武将技特效 |
| 620 | 51001 | 拒馬 | TYPE_FORCE | MagicObjectProcess | \magic\041 | 武将技特效 |

## 7. 未确定

| 字段 | 现状 | 推测与依据 |
|---|---|---|
| `Space` 的 w/h | 8,8,64,0 / 4,4,48,0 / 8,8,8,0 | x,y 像锚点，w,h 像判定框；但旗帜 w=h=8 而人形 64，更像「图形格尺寸」（**推测**） |
| `Life` | 16 处，1200 / 2400 | 推测毫秒：马尸体 1.2 秒消失、箭 2.4 秒，符合手感 |
| `Attack5..Attack8` | 骨架只写到 Attack5=?（未实现） | 真实数据都有内容，推测为发售后扩展的攻击槽 |
| `SCROVER` 的准确行为 | 共 3040 次 | 序列终止；是否回到 Wait 由 Process 决定，数据侧未证实 |
| `Type` 空值 1 个 | `[DEFINE]` 段不参与；空值来自骨架段 | 骨架段无 Process，运行时不加载 |
