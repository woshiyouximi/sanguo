# R84 · SYSTEM.SO 补全（最后 9 条）

> 承接 `project/62_SYSTEM_SO实装.md`（R79：30 实装 / 9 无据）。
> 本轮把 9 条**全部实装**：`SYSTEM_SO_FUNCTIONS` 现在是 **34 host + 5 audio_bus + 0 无据**，
> `SYSO_UNSUPPORTED` 清空，另立 `SYSO_PORT_GAPS`（9 条，写清"函数体已重写，还缺哪个端口"）。
>
> 9 条能落地，靠的是先把它们卡住的 5 个宿主 syscall 从 EXE 里读出来（`work/syso84/`）。
> 之前报告里的三个关键判断是**误读**，见 §1。

---

## 0. 数字

| 项 | 前（R79） | 后（R84） |
|---|---|---|
| `status: 'host'` | 25 | **34** |
| `status: 'audio_bus'` | 5 | 5 |
| `status: 'unsupported'` | 9 | **0** |
| `SYSO_UNSUPPORTED` | 9 条 | **0 条**（保留导出，恒空） |
| `SYSO_PORT_GAPS` | — | **9 条**（缺口说明） |
| `tests/syso.test.ts` | 33 条 | **49 条**（新增 16 条，9 条函数全覆盖） |
| 全量 `node --test tests/*.test.ts` | 791 pass / 0 fail | **864 pass / 0 fail** |

---

## 1. 三个误读（这就是 9 条"无据"的根）

### 1.1 `0x200` 不是"读战场统计"，是恒等透传

`0x200` → `0x4209D4`（`work/syso84/tramp.txt`）：

```asm
4209D4  mov eax, [ebp+8]
4209D7  test eax, eax
4209D9  jne  short 4209DF
4209DB  xor  eax, eax        ; 参数为 0 ⇒ 返回 0
4209DD  jmp  short 4209E2
4209DF  mov  eax, [ebp+8]    ; 否则原样返回
```

⇒ `0x200(x) == x`（0 仍是 0）。R79 报告把 `BattleEndTalk` 里的 `0x200(g7)` 当成
"取第一项战场统计"，才得出"统计口径未确认"；实际那就是 `g7` 本身。

### 1.2 `RET n` 不是返回值，是 cdecl 清参

39 个函数的 `RET n` 与 `argc` **100% 相等**（Battle2 argc0/RET 0、CheckGround argc1/RET 1、
YieldGeneral argc2/RET 2、BattleYield argc7/RET 7、MoveCamera argc3/RET 3）。
⇒ 这 39 个全是 void。`CheckGround` 的 `RET 1` 不是"返回 1"，是"清 1 个参数"。

### 1.3 `0xA(layer, general, id)` 的第三参是 `MESSAGE.INI` 的 `MSGnnn` 编号

`0xA` → `0x41FA3C`（`work/syso84/sysA_41FA3C.txt`）：

```asm
41FA3C  ...   a3 = [ebp+0x10]                    ; 最先压的实参
41FA3F  cmp  dword [0x4A64D4 + a3*4], 0
41FA47  jz   出栈返回
41FA4D  push [0x4A64D4 + a3*4]                   ; 五槽表按 layer 取对象
41FA54  push a2                                  ; general
41FA55  push a1                                  ; id
41FA56  call 0x43483A                            ; → 0x4347B6（与 0x6 同一个落点）
41FA5B  push 0 / push a1 / push 0x41F924
41FA65  call 0x464D70                            ; 挂回调
```

`0x43483A(x,y,z)` = `y != 0 ? 0x4347B6(x, y->[+0xc], z) : 0x4347B6(x, 0, z)`。
⇒ `0xA` = "让第 `layer` 层的对象对 `general` 播表现 `id`"。`0x6` 是同一条路（动作号），
`0xA` 走的是**台词/表现编号**。

号码就是 `MSGnnn`，证据两条：

1. `docs/03d-文本与配置.md:11-27` 的号段表：200-299 单挑险胜/平手、300-399 单挑叫阵报名、
   400-499 单挑接战、500-599 追击败逃、600-705 完胜、800-899 招降/成年/加入、950+ 招降/处斩/释放；
2. `F:\sanguo\extract\json\message.json`（524 条，cp950，键 `MSG<3位>`，0..988 无重复）的
   `block` 字段与上表逐段吻合：`MSG270="勝負就留到下一次吧！%k%%e%"`（平手）、
   `MSG800="我找到了%S3%將軍，請大人會見他。%k%%l%"`（招降）、
   `MSG950="良禽擇木而棲，賢臣擇主而事，加入我方吧！%k%%l%"`（招降表）。

⇒ `BattleEndTalk` 选 `rand(500,568)` / `rand(600,705)` / `rand(240,263)` / `rand(270,290)`
的"四档随机"不是乱写，分别是"追击败逃 / 完胜 / 惨败 / 平手"四段号段。
`StartBattle` 的 `rand(300,409)` 就是叫阵与接战。

---

## 2. 九条逐条

反汇编出处：`export/script/system_so.dis.txt`（SYSTEM.SO 本体）+ `work/syso84/`（EXE 宿主函数）。

### 2.1 `CheckGround(arg1)` @0xA8C · argc 1 → **实装（空函数）**

```
000A8C  PUSHI 1; RET          ← 首条就是返回
000A94..000B34                 ← 死代码：while (0x107(arg1) <= 0) WAIT 1;
                                 0x17(arg1,0,0); 0x25(arg1,4096); 0x26(arg1,16,1)
```

后 20 条与 `WeatherObjectDeath`（@0xB3C）主体逐条同构，只差那个 WAIT 循环——
原作大概是先写判定、后来改成"直接返回"留下的尸体。
⇒ 可观测行为 = 什么都不做。
实装：`game/src/core/syso_host.ts:739`（`case 'CheckGround'` → `{ handled: true }`）。
测试：`syso.test.ts:550`「Battle2 与 CheckGround 是原作自带的空函数」。

### 2.2 `Battle2()` @0x10D8 · argc 0 → **实装（空壳）**

```
0010D8  PUSHN 7               ← 声明 7 个局部变量
0010E4  RET 0                 ← 一个都没用就返回
```
实装：`syso_host.ts:744`。测试：同上。

### 2.3 `BattleYield(arg1..arg7)` @0x1F70 · argc 7 → **实装**

```
loc1 = 0x105(arg7); loc2 = 0x106(arg7);      ; 句柄 arg7 的像素 x/y
loc3 = 0x105(arg6); loc4 = 0x106(arg6);      ; 句柄 arg6 的像素 x/y
MoveCamera(loc1, loc2-128, 60);  0x3(arg3, 0, PUSHS27)
MoveCamera(loc3, loc4-128, 60);  0x3(arg2, 0, PUSHS28)
MoveCamera(loc1, loc2-128, 60);  0x3(arg3, 0, PUSHS29)
0x139(arg1);  0x114(0);  RET 7
```

三句原文（`PUSHS27/28/29`）：

| PUSHS | 原文 |
|---|---|
| 27 | `%S2%將軍，請加入我方，共創統一大業!!%k%%e%` |
| 28 | `就讓我們共創統一大業吧!!%k%%e%` |
| 29 | `將軍真是明智之舉!!%k%%e%` |

`arg4`/`arg5`（调用点是 2/3）函数体一次都没读。
实装：`syso_host.ts:1250`；镜头用 `0x105/0x106`（端口 `unitAt`），收尾 `orBattleFlag`（:1193）+ `resetOverlay`（:1207）。
测试：`syso.test.ts:557`「BattleYield：三段镜头 + 三句原文…」（断言三句层号顺序、最终镜头坐标、`0x200|0x1000` 两个标志位）。

### 2.4 `StartBattle(arg1)` @0x2108 · argc 1 → **实装**

```
0x6(3,1,g7); 0x6(2,1,g8); 0x6(3,2,g8); 0x6(2,2,g7);
if (arg1 == 1)   { BattleYield(g3,g2,g8,g7,2,3,1); RET 1; }
if (arg1 == -1)  { BattleYield(g2,g3,g7,g8,3,2,0); RET 1; }
loc6 = 0x206(g7);  loc5 = 0x206(g8);
MoveCamera(0x105(g3), 0x106(g3)-128, 30);
loc3 = <第一段叫阵号>;  0xA(2,0,loc3);
MoveCamera(0x105(g2), 0x106(g2)-128, 60);
do { loc4 = <第二段叫阵号> } while (loc4 == loc3);
0xA(3,0,loc4);  0x114(1);  RET 1
```

两段编号的号段（`0x303` = rand）：

第一段（按 `loc5 = 0x206(g8)`）：
- `loc5==0` → `rand(0,1)==0 ? 300-319 : 380-399`
- `loc5==1` → `rand(0,1)==0 ? 320-339 : 380-399`
- `loc5==2` → `loc6(0x206(g7))==0` 时同上式但基号 340-359；否则 `rand(0,2)`：0→340-359 / 1→380-399 / 2→360-379

第二段（按 `loc6`）：
- `loc6==0` → `rand(0,2)`：0→300-319 / 1→380-399 / 2→400-409
- `loc6==1` → `rand(0,2)`：0→320-339 / 1→380-399 / 2→400-409
- `loc6==2` → `loc5==0` 时 `rand(0,2)`：0→340-359 / 1→380-399 / 2→400-409；否则 `rand(0,3)`：0→340-359 / 1→380-399 / 2→360-379 / 3→400-409

参数语义：`arg1` 是模式（1 / -1 走 `BattleYield` 的"简化招降"分支，0 走双段叫阵）。
实装：`syso_host.ts:1281`，两段选择拆成 `callLine`（:1316）/ `answerLine`（:1328）。
测试：`syso.test.ts:572`（`arg1=1`：四条 0x6 + 三句 BattleYield 原文）、`:590`（`arg1=0`：两段编号都落在 300-409 且互不相同）。

### 2.5 `BattleEndTalk(arg1)` @0x2C90 · argc 1 → **实装**

```
loc4 = 0x206(g7);  loc3 = 0x206(g8);
switch (arg1) {
  case 1:   loc1=2; loc6=g7; loc7=g8; loc2=1; if (!(loc3==2 && loc4==0)) loc2=3; break;
  case 2:   loc1=3; loc7=g7; loc6=g8; loc2=1; if (!(loc4==2 && loc3==0)) loc2=3; break;
  case 256: case 512: loc2 = -1; break;                 // 不发台词
  case 4:   loc1=2; loc2=2; loc6=g7; loc7=g8; break;
  case 8:   loc1=3; loc2=2; loc7=g7; loc6=g8; break;
  case 16:  loc1=3; loc2=0; loc7=g7; loc6=g8; break;
  default:  loc1=0; loc2=0;                             // PUSHN 清零 ⇒ 走 270-290 平手档
}
0x6(loc1,1,loc7);  0x6(loc1,2,loc6);
switch (loc2) {
  0:  0xA(loc1,0,rand(270,290));    // 平手
  1:  0xA(loc1,0,rand(500,568));    // 追击败逃
  2:  0xA(loc1,0,rand(600,705));    // 完胜
  3:  0xA(loc1,0,rand(240,263));    // 惨败
 -1:  不发
}
0x124();  RET 1
```

参数语义：`arg1` 就是 `ReportResult` 那套结果位（1 我方胜 / 2 敌方胜 / 4 / 8 / 16 平手 / 256 招降 / 512 被招降）。
实装：`syso_host.ts:1375`；`0x124` 落在 `resetTalk`（:1216）。
测试：`syso.test.ts:604`（`arg1=1` + `0x206` 分区 → 500-568 档、两层 0x6、`0x124`）、`:621`（`arg1=256` 不发台词）。

### 2.6 `ReportResult(arg1)` @0x3178 · argc 1 → **实装（零依赖）**

```
WAIT 1;  0x6(0,1,g7);  0x6(0,2,g8);  0x6(0,3,g9);
switch (arg1) {
  1:   (g9, PUSHS36) "很遺憾，我軍戰敗了....%K%%E%"
  2:   (g7, PUSHS37) "我軍勝利!!%K%%E%"
  4:   (g9, PUSHS38) "我軍戰敗，%S1%將軍被俘了....%K%%E%"
  8:   (g7, PUSHS39) "我軍大勝!俘虜敵將%S2%!!%K%%E%"
  256: (g9, PUSHS40) "%S1%將軍投靠敵方了....%K%%E%"
  512: (g7, PUSHS41) "說服%S2%將軍加入我方!!%K%%E%"
  16:  (g7, PUSHS42) "雙方平手....%K%%E%"
  def: (g7, PUSHS43) "結果不明.......%K%%E%"
}
```

这 8 条是**函数内常量**，不查 `MSG` 表 —— 所以这条是本轮唯一"完整、无缺口"的实装。
实装：`syso_host.ts:1441`。测试：`syso.test.ts:628`（8 个分支逐条比对原文 + 说话方武将 + `WAIT 1`）。

### 2.7 `SearchTalk(arg1)` @0x33E4 · argc 1 → **实装**

```
while (g1 == 0) WAIT 1;   g1 = 1;          ; 与搜索动画的握手位
0x6(0,1,g7);  0x6(0,3,g9);
switch (arg1) {
  0:  0x3(0,g7,PUSHS45) "什麼都找不到....%k%%E%"
  1:  0x3(0,g7,PUSHS46) "找到物品!!%k%%E%"
  16: if(g7!=g8) 0xA(0,g7,800); 0xA(0,g8,rand(801,809)); 0xA(1,g9,810);
      音效 SUCCESS; 0xA(0,g8,819); 0x3(1,g9,"%e%");
      if (g7==g8) { 0xA(0,g8,812); 0xA(0,g7,813) } else 0x3(0,g8,"%e%")
  17: 同上但 0xA(1,g9,rand(820,826)); 0xA(0,g8,rand(830,840)); … 0xA(1,g9,811)
  18: 0xA(0,g8,rand(801,809)); 0xA(1,g9,rand(851,861)); 音效 FAILURE2; 0xA(0,g8,814)
  19: 0xA(0,g8,rand(801,809)); 0xA(1,g9,rand(850,860)); 音效 FAILURE2; 0xA(0,g8,815)
  20: g7==g8: 817/818/SUCCESS/rand(894,899)/rand(900,903)/812/rand(904,907)
      g7!=g8: 816/rand(870,874)/SUCCESS/rand(875,878)/rand(890,893)/0x3(0,g8,"%e%")
}
g1 = 0;  RET 1
```

参数语义：`arg1` 是搜索结果码（0 空手、1 物品、16-20 人物/武将相关）。
实装：`syso_host.ts:1492`。测试：`syso.test.ts:651`（握手 `g1=1→0`）、`:665`（16 分支 + `g7==g8` 改发 812/813）、`:684`（18/19 的 FAILURE2 + 814/815）、`:697`（20 的两条分支）。

### 2.8 `ChildGenTalkNew(arg1)` @0x3D40 · argc 1 → **实装**

```
while (g0 == 0) WAIT 1;                    ; 子嗣生成完成位
STGIDX(1, 1);                              ; 数组0[1] = 1  ⇒ 标量 g1 = 1
loc3 = LDGIDX0(30 + arg1*2);               ; 武将 A
loc4 = LDGIDX0(31 + arg1*2);               ; 武将 B
loc5 = g9;                                 ; 当前武将
0x6(0,3,loc3);  0x6(0,1,loc4);
if (loc4 != loc5) { 816 / rand(870,874) / SUCCESS / rand(875,878) / rand(890,893) / 0x3(0,loc5,"%e") }
else              { 817 / 818 / SUCCESS / rand(894,899) / rand(900,903) / 812 / rand(904,907) }
WAIT 1;  STGIDX(0, 1);  RET 1              ; g1 = 0
```

`STGIDX 0` / `LDGIDX 0` 的"数组 0"就是标量全局槽：起手 `(value,index)=(1,1)`、收尾 `(0,1)`，
与 `SearchTalk` 的 `g1=1 / g1=0` 握手逐字相同 ⇒ `LDGIDX0(30+2*arg1)` 读的是 `g[30+2*arg1]`。
实装：`syso_host.ts:1592`（`global(30 + arg1*2)` / `global(31 + arg1*2)`，标 `[推测]`：数组基址口径待考）。
测试：`syso.test.ts:723`（两位武将的 `0x6` 顺序、相等/不等两分支、`STGIDX` 的 1→0）。

### 2.9 `YieldGeneral(arg1, arg2)` @0x424C · argc 2 → **实装**

```
0x6(1,2,g8);  0x6(0,2,g8);
switch (arg2) {
  1: 0xA(0,g7,rand(950,966)); 音效 SUCCESS; 0xA(1,g8,rand(980,988)); 0x3(0,g7,"%E%")
  0: 0xA(0,g7,rand(950,966)); 0xA(1,g8,rand(970,978));               0x3(0,g7,"%E%")
}
WAIT 20;  0x211();  RET 2
```

**`arg1` 全程未读**（51 条指令里一次都没有 `LDSL arg1`）。两条 `0x6` 的第三参都是 `g8`，
因为 `0x434885` 的守卫是 `c != 0`（不是 `c` 的真假），所以两次都真的派发。
实装：`syso_host.ts:1634`；`0x211` 落 `confirmYield`（:1230）。
测试：`syso.test.ts:749`（`arg2=1`：950-966 / SUCCESS / 980-988 / `0x211` / `WAIT 20`）、`:772`（`arg2=0`：无音效仍走 `0x211`）。

---

## 3. 缺口：4 个新端口（`SYSO_PORT_GAPS`）

函数体全部按字节码重写了，但**引擎侧还有 4 个通道没有端口接**。本轮把这些做成了
`SysoPorts` 的**可选**字段（`syso_host.ts:142-153`），`runtime.ts` 没有接线（见 §4），
所以运行时只记录、不渲染，测试自己注入。

| 端口 | 对应 | 缺口 |
|---|---|---|
| `playAct(layer, action, general)` | `0x6` → `0x434885` | 重制版没有"五槽对象表 0x4BC160 + vtbl[0x20] 动作分发"；`battle.ts` 里也没有"让某个单位播某个阵型动作"的入口 |
| `msg(id)` | `0xA` → `0x43483A` | 台词表 `extract/json/message.json`（524 条，cp950）**没有**进 `game/data`，`game/src` 里没有任何加载器；`view` 只有一个 `MESSAGE_BOX` 常量 |
| `unitAt(handle)` | `0x105/0x106/0x206` | `World` 里有单位坐标，但没有"句柄 → 像素/格坐标"的查询；`0x206` 要的 +0x34/+0x36 是格坐标，与像素不是同一套 |
| `confirmYield(general)` | `0x211` → `0x44EBE2` | 招降落地要改 `GeneralState.status = 6` 并重算，属于 `battle.ts` 的领地（本轮禁改） |

逐条缺口（代码里的 `SYSO_PORT_GAPS`，`syso_host.ts:422`）：
BattleYield/StartBattle → `msg`+`unitAt`；BattleEndTalk → `msg`；SearchTalk → `msg`+`playAct`；
ChildGenTalkNew → `msg`+`playAct`（+`LDGIDX` 基址口径）；YieldGeneral → `msg`+`playAct`+`confirmYield`；
ReportResult / CheckGround / Battle2 → 无缺口。

**代价（如果要补全）**：`msg` 需要一条 `game/data/message.json` 的加载路径（约 524 条）；
`playAct`/`confirmYield` 要碰 `battle.ts`；`unitAt` 要 `World` 暴露句柄→坐标。
这四件都在本轮授权之外，留给 lead 排期。

---

## 4. `runtime.ts`：**一行未改**

本轮**没有动 `runtime.ts` 任何位置**，包括 `callScript` 的分派表 —— 因为分派本来就是
"名字在 `SYSO_HOST_NAMES` 里就走 `syso.call`"：

```ts
// runtime.ts:947-951（未改动，仅引用）
if (this.syso.has(name)) {
  const sysoArgs = args.map<SysoArg>(…);
  const host = this.syso.call(name, sysoArgs);
  if (host.handled) return host.value;
}
```

`HOST_NAMES` 由 `SYSTEM_SO_FUNCTIONS.filter(status === 'host')` 生成（`syso_host.ts:474`），
所以把 9 行的 `status` 改成 `'host'` 之后，**分派自动生效**，不需要加 `case`。
（`callScript` 里也确实没有任何按名字硬编码的分支需要补。）

⇒ 热点文件零风险。

---

## 5. 注册表漂移（需要 lead 同步，不在本轮授权内）

改了 `SYSTEM_SO_FUNCTIONS` 的 9 行状态后，下面两处**登记表**还是 R79 的 25/30：

1. `game/src/core/audio_bus.ts:663-689` `SYSTEM_SO_HOST_IMPLEMENTED`（25 个名字）
   与 `:691` 的注释"剩下 9 个是 `SYSO_UNSUPPORTED`"；
2. `game/cocos/assets/scripts/core/audio_bus.ts:504-533` 同一份名单（Cocos 镜像）。

建议补丁：把 9 个名字追加到 `SYSTEM_SO_HOST_IMPLEMENTED` 末尾（`SYSTEM_SO_ALL_IMPLEMENTED`
是 spread 出来的，会自动变 39），注释改成"39 条全部实装"：

```ts
  // 追加在 'EnterBattle', 之后
  'CheckGround',
  'Battle2',
  'BattleYield',
  'StartBattle',
  'BattleEndTalk',
  'ReportResult',
  'SearchTalk',
  'ChildGenTalkNew',
  'YieldGeneral',
```

**注意**：`callSystemSo()` 只认 `SYSTEM_SO_IMPLEMENTED` 那 5 个（`audio_bus.ts:730`
`if (!SYSTEM_SO_IMPLEMENTED.includes(fn)) return null`），所以这两个名单只是**对账**用途；
本轮不动它们也不会短路 `SysoHost`。`tests/smartscript_audio.test.ts:219` 锁的是那 5 个，本轮没碰，测试照旧绿。

另：`game/cocos/assets/scripts/core/syso_host.ts` 是 R79 之前的镜像（41,207 B vs 本轮 `src` 的 75,162 B），
已经落后好几轮，仓库里没有同步脚本（`package.json` 只有 test/typecheck/sim），本轮未动。

---

## 6. `[推测]` 清单（代码里逐处标注）

| 位置 | 内容 |
|---|---|
| `syso_host.ts:1230` `confirmYield` | `0x211` 的主语来自引擎的 `[0x4A8090]` 待招降状态，不在脚本参数里；这里拿 `g7` 当记录键 |
| `syso_host.ts:1207` `resetOverlay` | `0x114` 末尾 `0x41C889(0x48F3F8)` 是投递引擎消息；重制版没有消息队列，只记录条件成不成立 |
| `syso_host.ts:1492` `searchTalk` | 没有帧循环：`while (g1==0) WAIT 1` 退化成"最多等 64 帧"，`waits` 记账 |
| `syso_host.ts:1592` `childGenTalkNew` | `LDGIDX 0` 的数组基址按"标量 g 空间"理解（证据是 `STGIDX(1,1)/(0,1)` 与 `SearchTalk` 的 `g1` 握手逐字相同）；假如数组 0 另有基址，`30+2*arg1` 要整体平移 |
| `syso_host.ts:1250` `battleYield` | 句柄查不到坐标时跳过该段镜头（原作会拿 0 推一个镜头） |
| `syso_host.ts:1281` `startBattle` | `do{}while(loc4==loc3)` 原作无上限重掷，这里加 64 次保险 |
| `syso_host.ts:1375` `battleEndTalk` | `0x206` 的 `+0x34/+0x36` 当**有符号 short**格坐标读（反汇编是 `movsx` 后 `cmp`，没有负值样本可验证） |

---

## 7. 验证

```
cd F:\sanguo\game
npm.cmd exec -- tsc -p tsconfig.build.json   → exit 0
npm.cmd exec -- tsc --noEmit                 → exit 0
node --test tests/syso.test.ts               → 49 pass / 0 fail
node --test tests/*.test.ts                  → 864 pass / 0 fail（39 suites，110 s）
```

新增 16 条用例（`tests/syso.test.ts:548-806`，第 7 节），9 条函数逐条覆盖：

| 函数 | 用例 |
|---|---|
| Battle2 / CheckGround | 接管 + 零副作用 |
| BattleYield | 三句原文与层号顺序、最终镜头、`0x200/0x1000` 标志 |
| StartBattle | `arg1=1` 的四条 0x6 + 三句；`arg1=0` 的两段号段与重掷 |
| BattleEndTalk | `arg1=1` 分区→500-568；`arg1=256` 不发台词 |
| ReportResult | 8 分支逐条原文 + 说话方 |
| SearchTalk | 握手、0/1 档、16（含 812/813 两态）、18/19、20（两分支） |
| ChildGenTalkNew | 两位武将取址、相等/不等分支、`STGIDX` |
| YieldGeneral | `arg2=1`/`0`、`0x211`、`WAIT 20` |
| 端口 | 注入 `msg` 后编号换原文并进台词通道 |

---

## 8. 没做到 / 留给下一轮

1. **4 个端口没接线**（§3）：`msg`/`playAct`/`unitAt`/`confirmYield` 只在测试里注入，
   实际战斗里这些台词与镜头还是"只记账不渲染"。要真跑起来必须动 `battle.ts` 与
   `game/data`（台词表），本轮禁止。
2. **台词表没有进游戏**：`extract/json/message.json` 524 条 cp950，需要一条 `game/data`
   通道（约 30 KB）才能把 `0xA` 的编号变成原文。
3. **`0x206` 的有符号性没有负坐标样本**：反汇编是 `movsx`，但没有实测过负格坐标的战场。
4. **`killGeneral`/`freeGeneral` 的旧口径没改**：它们把 `0xA` 当"写引擎变量"（走
   `ports.engineWrite`），与 §1.3 的新理解不一致。为了不改变已有行为（R79 的 4 条测试锁着），
   本轮只把 `engineWrite` 的注释更正为"第三参是 `MSGnnn` 编号"，函数体没动。
5. **`audio_bus.ts` 两处登记表 + Cocos 镜像没同步**（§5），需要 lead 决定是否改。
6. **`runtime.ts` 的两条过时注释**：`:280` 与 `:929` 还写着"25 个"，属于热点文件，
   按约定没动，一并报给 lead。
