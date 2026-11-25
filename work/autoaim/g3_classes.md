# g3（引擎目标句柄）在 MAGIC.SO 各技能里的使用分类

判定：`LDG 3` 之后若存进 `STL locN` 而全函数再没 `LDSL locN` = **读了丢掉**（对结果无影响）；
直接作为 `SYSCALL`/比较指令的操作数，或存进 loc 后又回读 = **真正消费**。

## A. 真正消费 g3 的技能（65 条：落点会经 g3 影响这些技）

| seq | 技能 | 脚本函数 | LDG3 | 函数 | 消费点 |
|---|---|---|---|---|---|
| 3 | 地泉衝 | Magic4 | 2 | Spout | dis:20335→SYSCALL<br>dis:20343→SYSCALL |
| 4 | 火箭 | Magic3 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 6 | 木輪攻 | Magic6 | 1 | RollTub | dis:28145→28148 |
| 8 | 火雷 | Magic5 | 2 | Powder | dis:25866→SYSCALL<br>dis:25874→SYSCALL |
| 9 | 雷擊 | Magic10 | 3 | Thunder | dis:5168→5384<br>dis:5252→5255<br>dis:5309→EQ |
| 10 | 炎龍 | Magic12 | 5 | FireDragon | dis:14350→14353<br>dis:14410→14413<br>dis:14462→14465<br>dis:14514→14517<br>dis:14566→14569 |
| 11 | 伏焰 | Magic7 | 1 | OnFire | dis:18391→18513 |
| 14 | 雷光波動 | Magic11 | 3 | Thunder | dis:5168→5384<br>dis:5252→5255<br>dis:5309→EQ |
| 15 | 火箭烈 | Magic15 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 18 | 地泉裂勁 | Magic16 | 2 | Spout | dis:20335→SYSCALL<br>dis:20343→SYSCALL |
| 20 | 木輪強襲 | Magic18 | 1 | RollTub | dis:28145→28148 |
| 21 | 炎龍無雙 | Magic20 | 5 | FireDragon | dis:14350→14353<br>dis:14410→14413<br>dis:14462→14465<br>dis:14514→14517<br>dis:14566→14569 |
| 22 | 雷光振殺 | Magic22 | 3 | Thunder | dis:5168→5384<br>dis:5252→5255<br>dis:5309→EQ |
| 24 | 火雷爆 | Magic17 | 2 | Powder | dis:25866→SYSCALL<br>dis:25874→SYSCALL |
| 25 | 黃龍天翔 | Magic26 | 2 | CallDragon | dis:15274→15277<br>dis:15323→15326 |
| 26 | 地泉鯨浪 | Magic32 | 2 | Spout | dis:20335→SYSCALL<br>dis:20343→SYSCALL |
| 28 | 雷擊閃 | Magic25 | 3 | Thunder | dis:5168→5384<br>dis:5252→5255<br>dis:5309→EQ |
| 29 | 炎龍殺陣 | Magic28 | 5 | FireDragon | dis:14350→14353<br>dis:14410→14413<br>dis:14462→14465<br>dis:14514→14517<br>dis:14566→14569 |
| 30 | 火箭天襲 | Magic34 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 32 | 火雷星雨 | Magic30 | 2 | Powder | dis:25866→SYSCALL<br>dis:25874→SYSCALL |
| 33 | 炎龍怒濤 | Magic36 | 5 | FireDragon | dis:14350→14353<br>dis:14410→14413<br>dis:14462→14465<br>dis:14514→14517<br>dis:14566→14569 |
| 34 | 赤焰洪流 | Magic21 | 1 | OnFire | dis:18391→18513 |
| 35 | 木輪濤擊 | Magic35 | 1 | RollTub | dis:28145→28148 |
| 36 | 赤焰火海 | Magic29 | 1 | OnFire | dis:18391→18513 |
| 38 | 大地狂嘯 | Magic40 | 4 | Earthquake | dis:28537→28540<br>dis:28609→EQ<br>dis:28613→SYSCALL<br>dis:28623→SYSCALL |
| 39 | 雷光燋獄 | Magic38 | 3 | Thunder | dis:5168→5384<br>dis:5252→5255<br>dis:5309→EQ |
| 41 | 炎龍絕殺 | Magic42 | 5 | FireDragon | dis:14350→14353<br>dis:14410→14413<br>dis:14462→14465<br>dis:14514→14517<br>dis:14566→14569 |
| 42 | 五雷轟頂 | Magic37 | 1 | BigThunder | dis:5483→5525 |
| 43 | 狂雷天牢 | Magic43 | 2 | Sparkle | dis:24287→PUSHI<br>dis:24300→24302 |
| 45 | 飛矢 | Magic45 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 47 | 突石 | Magic48 | 4 | ConvexStone | dis:9671→SYSCALL<br>dis:9674→SYSCALL<br>dis:9685→SYSCALL<br>dis:9688→SYSCALL |
| 48 | 落石 | Magic47 | 3 | StoneEmitter | dis:8345→SYSCALL<br>dis:8373→8376<br>dis:8436→8439 |
| 49 | 刀劍亂 | Magic53 | 2 | Slash | dis:26572→26575<br>dis:26729→26732 |
| 51 | 旋龍 | Magic54 | 3 | Tornado | dis:10751→10754<br>dis:10896（丢弃）<br>dis:10910→10919 |
| 55 | 突石劍 | Magic75 | 4 | ConvexStone | dis:9671→SYSCALL<br>dis:9674→SYSCALL<br>dis:9685→SYSCALL<br>dis:9688→SYSCALL |
| 56 | 太極門 | Magic57 | 3 | TaiChi | dis:19413→19416<br>dis:19506→NE<br>dis:19614→NE |
| 58 | 八門金鎖 | Magic85 | 2 | Frozen | dis:11709→SYSCALL<br>dis:11718→SYSCALL |
| 61 | 地茅刺 | Magic62 | 1 | Spear | dis:26181→26183 |
| 63 | 冰柱刺 | Magic51 | 3 | Ice | dis:17693→17696<br>dis:17827→NE<br>dis:17956→NE |
| 64 | 突劍四方 | Magic93 | 4 | ConvexStone | dis:9671→SYSCALL<br>dis:9674→SYSCALL<br>dis:9685→SYSCALL<br>dis:9688→SYSCALL |
| 68 | 突襲石 | Magic55 | 1 | RollDown | dis:21713→21720 |
| 69 | 龍砲 | Magic60 | 3 | FireWork | dis:25216→SYSCALL<br>dis:25244→25247<br>dis:25305→25308 |
| 71 | 生死門 | Magic66 | 1 | BlackHole | dis:16421→LDSL |
| 72 | 亂飛矢 | Magic72 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 73 | 地茅亂刺 | Magic82 | 1 | Spear | dis:26181→26183 |
| 74 | 龍砲激射 | Magic78 | 3 | FireWork | dis:25216→SYSCALL<br>dis:25244→25247<br>dis:25305→25308 |
| 75 | 旋龍合璧 | Magic80 | 3 | Tornado | dis:10751→10754<br>dis:10896（丢弃）<br>dis:10910→10919 |
| 76 | 冰柱群鋒 | Magic79 | 3 | Ice | dis:17693→17696<br>dis:17827→NE<br>dis:17956→NE |
| 78 | 太極華陣 | Magic73 | 3 | TaiChi | dis:19413→19416<br>dis:19506→NE<br>dis:19614→NE |
| 79 | 滾石遽壓 | Magic76 | 1 | RollDown | dis:21713→21720 |
| 80 | 八卦奇陣 | Magic94 | 1 | Pa | dis:22635→22638 |
| 86 | 亂刀狂舞 | Magic81 | 2 | Slash | dis:26572→26575<br>dis:26729→26732 |
| 87 | 飛矢烈震 | Magic90 | 4 | ArrowSupport | dis:6639→SYSCALL<br>dis:6676→6679<br>dis:6739→6742<br>dis:6854→6857 |
| 90 | 龍砲滅殺 | Magic99 | 3 | FireWork | dis:25216→SYSCALL<br>dis:25244→25247<br>dis:25305→25308 |
| 91 | 炬石轟 | Magic83 | 3 | StoneEmitter | dis:8345→SYSCALL<br>dis:8373→8376<br>dis:8436→8439 |
| 93 | 茅刺遍地 | Magic103 | 1 | Spear | dis:26181→26183 |
| 94 | 滾石怒衝 | Magic97 | 1 | RollDown | dis:21713→21720 |
| 95 | 劍輪舞 | Magic106 | 1 | TwisterSword | dis:27885→27888 |
| 96 | 分身斬 | Magic98 | 1 | Duplicator | dis:11367→PUSHI |
| 97 | 冰嵐刃舞 | Magic101 | 3 | Ice | dis:17693→17696<br>dis:17827→NE<br>dis:17956→NE |
| 100 | 旋龍天舞 | Magic88 | 3 | Tornado | dis:10751→10754<br>dis:10896（丢弃）<br>dis:10910→10919 |
| 101 | 地獄之門 | Magic89 | 1 | BlackHole | dis:16421→LDSL |
| 102 | 集火柱 | Magic107 | 1 | FirePillar | dis:23936→23939 |
| 104 | 神鬼亂舞 | Magic105 | 4 | DemonDancing | dis:12050→EQ<br>dis:12110→EQ<br>dis:12116→PUSHI<br>dis:12194→PUSHI |
| 105 | 炬石煉獄 | Magic104 | 3 | StoneEmitter | dis:8345→SYSCALL<br>dis:8373→8376<br>dis:8436→8439 |

## B. 读了但立刻丢掉的技能（11 条：落点对这些技完全无影响）

| seq | 技能 | 脚本函数 | LDG3 | 函数 | 死读点 |
|---|---|---|---|---|---|
| 2 | 落月弓 | Magic2 | 1 | ShootObject | dis:3914（丢弃） |
| 13 | 御飛刀 | Magic14 | 1 | ShootObject | dis:3914（丢弃） |
| 50 | 半月斬 | Magic50 | 1 | HalfMoon | dis:2692（丢弃） |
| 52 | 落日弓 | Magic52 | 1 | ShootObject | dis:3914（丢弃） |
| 59 | 鬼戟 | Magic58 | 1 | ShootObject | dis:3914（丢弃） |
| 65 | 衝車 | Magic67 | 1 | RushCart | dis:4224（丢弃） |
| 82 | 駟衝車 | Magic86 | 1 | RushCart | dis:4224（丢弃） |
| 83 | 三日月斬 | Magic77 | 1 | HalfMoon | dis:2692（丢弃） |
| 88 | 三聖華斬 | Magic92 | 1 | HalfMoonNew | dis:23097（丢弃） |
| 107 | 日月輪斬 | Magic102 | 1 | HalfMoon | dis:2692（丢弃） |
| 109 | 五嶽華斬 | Magic109 | 1 | HalfMoonNew | dis:23097（丢弃） |

## C. 完全不读 g3 的技能（34 条）

1 命療術(Magic1/Heal)、5 伏兵組陣(Magic9/MoreSoldier)、7 虎咆(Magic8/ExplodeRound)、12 拒陸馬(Magic13/Interceptor)、16 虎咆震(Magic19/ExplodeRound)、17 伏兵排陣(Magic23/MoreSoldier)、19 後伏連兵(Magic24/BackSoldier)、23 虎咆陽炎(Magic31/ExplodeRound)、27 絕命壩(Magic27/Interceptor)、31 後伏兵陣(Magic33/BackSoldier)、37 後伏軍陣(Magic41/BackSoldier)、40 十面埋伏(Magic39/Interceptor)、44 天地無用(Magic44/FinalX1)、46 連弩(Magic46/RunningBow)、53 八面火(Magic56/EightWayFire)、54 旋燈火(Magic49/FireRing)、57 伏兵班陣(Magic65/MoreSoldier)、60 回天術(Magic63/Heal)、62 連弩激射(Magic64/RunningBow)、66 神劍(Magic61/FlyingSword)、67 八面火轉(Magic68/EightWayFire)、70 火牛陣(Magic59/FireCow)、77 烈火旋燈(Magic69/FireRing)、81 伏兵連陣(Magic84/MoreSoldier)、84 神劍閃(Magic70/FlyingSword)、85 連弩狂濤(Magic87/RunningBow)、89 神火旋張(Magic71/FireRing)、92 火牛群舞(Magic74/FireCow)、98 神劍閃華(Magic95/FlyingSword)、99 炎牆(Magic100/Wall)、103 神火怒張(Magic91/FireRing)、106 炎牆烈燒(Magic108/Wall)、108 火牛烈崩(Magic96/FireCow)、110 鬼哭神號(Magic110/FinalX2)


合计 110 条技能：消费 65 / 死读 11 / 不读 34 / 缺 0
