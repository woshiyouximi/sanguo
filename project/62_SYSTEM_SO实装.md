# R79：`SYSTEM.SO` 39 个函数实装

**结论**：上一轮只有 5 个函数（亮度×2 / 突击 / 大将阵亡 / 载入战场地图）在
`audio_bus.ts` 里有宿主侧重写，其余 34 个是空壳。本轮把这 34 个逐个反汇编核对后，
**新增 25 个真正有行为的实现**（`game/src/core/syso_host.ts`），剩 9 个写成带理由的
"无据"清单（其中 `Battle2`、`CheckGround` 两个是原作自己就是空壳/死代码）。
接线只动 `runtime.callScript` 的分派链，`audio_bus.ts` / `battle.ts` / `web/**` 一行未改。

| 项 | 数 |
| --- | --- |
| `SYSTEM.SO` 函数总数 | 39 |
| 本轮新增有行为实现（host） | **25** |
| 上一轮已有实现（audio_bus） | 5 |
| 无据（带理由，不静默留空壳） | 9 |
| 新增测试用例（`game/tests/syso.test.ts`） | **34**（8 个 describe，每条实装函数 ≥1 条行为断言） |
| 新增/修改的生产代码 | `syso_host.ts`（新，894 行）、`runtime.ts`（+~60 行，4 处） |

工作底稿（39 行完整表含调用点/证据行号）：`work/syso_map.md`。

---

## 1. 39 行总表

"原型"是**源码顺序**（`vm.ts:383` 的压栈顺序：`args[0]` = 第一个实参 = 函数体内 `argN`）。
"依据"列的行号：`funcs:N-M` = `work/system_so/funcs.txt` 的伪汇编行区间；
`04:NNN` = `docs/04-脚本引擎SmartScript.md` 行号；`04d:NNN` / `tab` = `export/script/syscall_table.json`。

| # | 函数名 | 原型 | 语义 | 依据 | 实装状态 | 测试名 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `GetByte_Old` | `(addr) → u8` | 从 `0x4A6878` 全局字数组按字节偏移取 1 字节 | `funcs:1-19`、`04:568-580`、`04:917-934` | host | `GetByte_Old 按字节偏移寻址同一个字（小端），四种对齐都要对` |
| 1 | `GetByte_Signed_Old` | `(addr) → i8` | 同上 + 8 位符号扩展 | `funcs:20-36`、`04:576` | host | `GetByte_Signed_Old 做 8 位符号扩展：0x80 → -128，0x7F → 127` |
| 2 | `GetShort_Old` | `(addr) → u16` | 读 16 位；`addr&3==3` 跨字分支 | `funcs:37-83`、`04:577` | host | `GetShort_Old 读 16 位，含 addr&3==3 的跨字分支` |
| 3 | `GetShort_Signed_Old` | `(addr) → i16` | 同上 + 16 位符号扩展 | `funcs:84-100` | host | `GetShort_Signed_Old 做 16 位符号扩展` |
| 4 | `GetInt_Old` | `(addr) → i32` | 按 `addr&3` 四分支拼双字（`&3==2` 分支照抄原作的丢位 bug） | `funcs:101-157`、`04:917-934` | host | `GetInt_Old 按字节拼字：offset 0/1/3 精确，offset 2 复刻原作的丢位 bug` |
| 5 | `SetInt_Old` | `(addr, value) → void` | 读-改-写 dword，四种对齐都保留邻居字节 | `funcs:158-287`、`04:936-949` | host | `SetInt_Old(addr, value) 四种对齐都能写进去，且不越界改邻居字节` |
| 6 | `SetShort_Old` | `(addr, value) → void` | 只改目标半字 | `funcs:288-304` | host | `SetByte_Old 只改目标字节（读-改-写），SetShort_Old 只改目标半字` |
| 7 | `SetByte_Old` | `(addr, value) → void` | 只改目标字节 | `funcs:305-319` | host | 同上 |
| 8 | `SetString_Old` | `(dest, src) → void` | 写 strcpy 指针槽 `0x4A71FC=0x46DA60` 后 `0x213(dest,src)` | `funcs:320-331`、`04:574-582`、`04:936-949` | host | `SetString_Old 写函数指针槽 + 逐字节 strcpy，GetByte 能读回每个字符` |
| 9 | `MoveCamera` | `(x, y, frames) → void` | 千分位线性插值 + 每帧 `0x100` + 提前收尾 | `funcs:332-410`、`04:905` | host | `MoveCamera 按帧数逐步插值，最后一步精确落在目标点`（+2） |
| 10 | `CheckGround` | `(cell) → ?` | **首条 `RET 1`，后 20 条死代码** | `funcs:411-434` | 无据 | 清单用例断言理由含 `RET 1` |
| 11 | `WeatherObjectDeath` | `() → void` | `0xB` 取句柄 → `0x17/0x25/0x26` 收尾天气物件 | `funcs:435-452` | host | `WeatherObjectDeath 回收最近一批天气物件并把天气清回晴` |
| 12 | `ProduceRain` | `() → void` | 原作短路（死代码），按常量重建 `rand(3,10)` 滴雨 | `funcs:453-501` | host | `ProduceRain 生成 3..10 个 9994..9996 物件，x/y 落在 0..1024`（+1） |
| 13 | `ProduceSnow` | `() → void` | 同上，雪片带 `MAGIC\M013WingA6.SHP` 风力/变体 | `funcs:502-583` | host | `ProduceSnow 带风力/变体/SHP 与运动速度，且帧数落在 2..4` |
| 14 | `ProduceFog` | `() → void` | **可达**：1 个雾团 + `MENU\GAMEOVER.SHP` | `funcs:584-615` | host | `ProduceFog 只生成 1 个物件，换 GAMEOVER.SHP，尺寸 300..500` |
| 15 | `Battle2` | `() → void` | **`PUSHN 7; RET 0` 空壳** | `funcs:616-619` | 无据 | 清单用例断言理由含 `RET 0`/空壳 |
| 16 | `EnterWar4` | `() → void` | 6 定点 + `rand(6,9)` 个 402 标记 | `funcs:620-912` | host | `EnterWar4 生成 6 个定点 + rand(6,9) 个散布的 402 标记` |
| 17 | `EnterWar5` | `() → void` | 无随机，11 组 403+404 = 22 个 | `funcs:913-947` | host | `EnterWar5 无随机：22 个标记（11 组 403 + 404），坐标可精确推算` |
| 18 | `EnterWar7` | `() → void` | 60 个 400/401 标记 | `funcs:948-999` | host | `EnterWar7 生成 60 个 400/401 标记，资源号只能是这两者` |
| 19 | `LoadingBattleMap` | `(mapIndex) → void` | `0x212`×4 + `0x301`×4 选 BG03A/04A/08A/09A | `funcs:1000-1064`、`tab` | audio_bus（上一轮） | `tests/smartscript_audio.test.ts`（R79 段） |
| 20 | `BattleYield` | `(a1..a7) → void` | 招降/撤退 7 参，含 3 条台词 | `funcs:1065-1117`、`04:889-902` | 无据（缺 `0x139`/`0x114`） | — |
| 21 | `StartBattle` | `(mode) → void` | 开战入口：注册阵型名（`0x200`+`0x6`）、`0x206` 分区、`MoveCamera` | `funcs:1118-1427`、`04:882-915` | 无据（缺 `0x200`/`0x206`） | — |
| 22 | `AllRush` | `() → void` | `0x301("Rush01")` + 闪白 + 台词 | `funcs:1428-1479` | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 23 | `BattleEndTalk` | `(mode) → void` | 战后对话，`0x200`×10 取台词 + `0x124` 播 | `funcs:1480-1627` | 无据（缺 `0x200`/`0x124`） | — |
| 24 | `ReportResult` | `(outcome) → void` | 8 种结局台词选一（strings 36-43） | `funcs:1628-1699` | 无据（缺 `0x200`） | — |
| 25 | `SearchTalk` | `(result) → void` | 探索结果：「什麼都找不到」/「找到物品!!」 | `funcs:1700-1973` | 无据（缺 `0x200`/`0xA`） | — |
| 26 | `ChildGenTalkNew` | `(id) → void` | `0x301("SUCCESS")`/FAILURE2 + `0xA`×10 查表 | `funcs:1974-2090` | 无据（缺 `0x200`/`0x6`） | — |
| 27 | `KillGeneral` | `() → void` | `rand(0,10)` 选槽 → `0xA(0,g7,910+2s)`/`0xA(1,g8,911+2s)` → `0x209()` | `funcs:2091-2125` | host | `KillGeneral 用 rand(0,10) 选偶数对槽（910/911 起），并写全局 7/8 号`（+1） |
| 28 | `FreeGeneral` | `() → void` | `0xA(0,g7,rand(940,945))` → `0x210()` | `funcs:2126-2138` | host | `FreeGeneral 用 rand(940,945) 选释放槽，并记下是哪位武将` |
| 29 | `YieldGeneral` | `(a,b) → void` | 招降判定，`0x211` + `0x301("SUCCESS")` | `funcs:2139-2198` | 无据（缺 `0x200`/`0x211`） | — |
| 30 | `DownBrightness` | `(level, frames) → void` | `0x12F`×2 + `0x130` 逐帧降亮度 | `funcs:2199-2217`、`04d:373` | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 31 | `RaiseBrightness` | `(level, frames) → void` | 同上，升亮度 | `funcs:2218-2236`、`04d:374` | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 32 | `Test01` | `() → void` | `0x125(g2,0,10000)` → 对主将打 10000 点伤害 | `funcs:2237-2244`、`syscalls.ts:331` | host | `Test01 对 g2 打 10000 点伤害（0x125 的唯一调试入口）` |
| 33 | `EnterMapMoveCamera` | `(x, y, speed) → void` | 从 (160,120) 起步、按步长夹到目标、清 g2 | `funcs:2245-2350` | host | `EnterMapMoveCamera 从屏幕中心 (160,120) 出发，按步长夹到目标点并清守卫`（+1） |
| 34 | `MajorDeath` | `(side, handle) → void` | Yell03 / Horse02 / VICTORY | `funcs:2351-2388` | audio_bus（上一轮） | `tests/smartscript_audio.test.ts` |
| 35 | `EnterWarprep` | `() → void` | `0x7` 载入 5 组 `MENU\D0_*`… 备战菜单 | `funcs:2389-2403` | host | `EnterWarprep 载入 5 组备战菜单资源（顺序与字节码一致）` |
| 36 | `EnterBattle` | `() → void` | `CALLS InitializeBattle(0,0,0,0)` | `funcs:2404-2413` | host | `EnterBattle 就是 CALLS InitializeBattle(0,0,0,0)` |
| 37 | `EnterMapmode` | `() → void` | `STG g2=0` + 6 组地图菜单资源 | `funcs:2414-2432` | host | `EnterMapmode 先清 g2，再载入 6 组地图菜单资源` |
| 38 | `EnterPolicy` | `() → void` | `0x7` 载入 3 组内政菜单资源 | `funcs:2433-2443` | host | `EnterPolicy 载入 3 组内政菜单资源` |

---

## 2. 新实装的 25 个（按族）

### 2.1 内存族（9 个，`0x4A6878` 全局字数组的字节级读写）

`0x4A6878` 是原作的引擎全局数组基址，脚本里写作 `PUSHI 4876408`；
`LDGIDX/STEIDX` 就是按 `(addr-base)>>2` 取字。重制版把它映射到 **`vm.engine`**
（`LDGIDX/STEIDX` 操作的同一块 `Int32Array`），越界地址落 `Runtime` 的
`engineOverflow` Map——这样 `SetString_Old` 往 `0x4A71FC`（基址 + 0x984）写
strcpy 指针也能存住。

- `GetByte_Old` / `GetByte_Signed_Old` / `GetShort_Old` / `GetShort_Signed_Old` /
  `GetInt_Old`：读，含 `addr&3` 四种对齐与跨字分支。
- `SetInt_Old` / `SetShort_Old` / `SetByte_Old`：读-改-写，只动目标 1/2/4 字节。
- `SetString_Old`：先写函数指针槽，再 `0x213` 逐字节 strcpy（末尾补 0）。

> **参数顺序的坑**：字节码里 `arg2` 是地址、`arg1` 是值，所以源码顺序是
> `(addr, value)`。`funcs:320-331` 的 `SetString_Old` 自己就写着
> `PUSHI 0x4A71FC; PUSHI 0x46DA60; CALL SetInt_Old`，可反推。实现和测试都按
> `(addr, value)`，测试里额外断言 `memory-write` 事件的 `addr` 字段防写反。

### 2.2 镜头族（2 个）

- `MoveCamera(x, y, frames)`：千分位定长插值（`step = (t*1000 - cam*1000)/frames`），
  每步发 `0x100(x, y)`；`|cx/100 - tx/100|` 相等即提前收尾；最后一步强制落到目标点。
- `EnterMapMoveCamera(x, y, speed)`：每次都从屏幕中心 `(160,120)` 起步
  （原作的 `0x203/0x204` 是常量），步长 `min(|Δ|/2, speed)`，逐帧 `0x205`，
  走完把 `g2` 守卫清 0。原作那段循环条件恒真、永不退出，重制版改成"夹到目标即停"。

### 2.3 天气族（4 个）

- `ProduceFog`：唯一**可达**的天气函数——1 个 `MENU\GAMEOVER.SHP` 雾团。
- `ProduceRain` / `ProduceSnow`：原作函数体开头就是 `PUSHI 1; JNZ <结尾>`，
  粒子循环整段死代码；重制版按残留常量重建（雨滴 `rand(3,10)` 个、
  资源 `rand(0,2)+9994`、速度 `rand(300,500)`；雪片另有风力 `rand(0,255)`、
  变体 `rand(1,3)`、动画 `MAGIC\M013WingA6.SHP`、运动 `rand(40960,65536)`）。
- `WeatherObjectDeath`：`0xB` 取当前物件句柄 → `0x17(h,0,0)` + `0x25(h,4096)` +
  `0x26(h,16,1)`，回收本批天气物件并把天气清回晴。

### 2.4 布景/阵型标记（3 个）

- `EnterWar4`：6 个定点 402（列区间 `rand(-2,3)/rand(4,8)/rand(48,53)/rand(54,58)/
  rand(9,47)/rand(-10,-2)`，行 `rand(14,17)`）+ `rand(6,9)` 个散布。
- `EnterWar5`：无随机，11 组、行固定 15、列 `i*7`，403 + 404（y+70）= 22 个物件。
- `EnterWar7`：60 个，资源 `rand(400,401)`，行列都按 `0x103/0x104` 换算后加随机偏移。

> 顺手发现：`0x10` 的资源 id 是**最后压栈**的那个参数（5 参形态 `(x,y,0,0,res)`），
> 与 `syscalls.ts:161` 的 `spawnObject(a(3)||a(2), …)`（从别的调用形态反推的）不一致。
> 宿主侧直接按 `res=args[4]` 生成，未改 `syscalls.ts`；这条差异记在 `work/syso_map.md`。

### 2.5 武将生灭 / 调试（3 个）

- `KillGeneral`：`rand(0,10)` 选槽 → `0xA(0, g7, 910+2s)` / `0xA(1, g8, 911+2s)` →
  一句空台词（`%E%`）→ `0x209()`。
- `FreeGeneral`：`0xA(0, g7, rand(940,945))` → `0x210()`。
- `Test01`：`0x125(g2, 0, 10000)`，即对施法主将打 10000 点伤害。全文件只有这一个调用者为空。

### 2.6 菜单/流程（4 个）

`EnterWarprep`（5 组 `MENU\D0_*`/`D1_2A`/`D1_2B`/`D12*`/`WARPREP*`）、
`EnterMapmode`（先 `STG g2=0` 再 6 组 `MENU\D3*`/`D4*`/`D28`/`D1_2A`/`D1_2B`/`D12*`）、
`EnterPolicy`（3 组 `MENU\S0*`/`C3_B*`/`D1*`）、`EnterBattle`（`CALLS InitializeBattle(0,0,0,0)`）。
四个都无随机、无分支，测试断言资源串**顺序**逐个相等。

---

## 3. 无据的 9 个（逐条说明缺什么）

| 函数 | 缺口 | 证据 |
| --- | --- | --- |
| `Battle2` | 函数体是空壳 | `funcs:616-619`：16 B，只有 `PUSHN 7; RET 0` |
| `CheckGround` | 函数体是死代码 | `funcs:411-434`：`0xA8C` 第一条 `RET 1`，后面 20 条不可达 |
| `BattleYield` | `0x139`、`0x114` 无语义 | `syscall_table.json` 里 0x139 无宿主地址，`syscalls.ts` 无对应 case |
| `StartBattle` | `0x200`、`0x206` | `04d:360-374` 的编号表到 0x1A3 为止，0x200 段未定名；`syscalls.ts` 无 case |
| `BattleEndTalk` | `0x200`、`0x124` | 同上；0x124 不在 `syscall_table.json` |
| `ReportResult` | `0x200` | 没有 0x200 就无法从 8 条台词里选行 |
| `SearchTalk` | `0x200`、`0xA` | 0xA 只有"读全局/引擎量"一句（`gen_map.py` 的注释），三参形式未定 |
| `ChildGenTalkNew` | `0x200`、`0x6` | 0x6 有宿主地址，但实参含义（阵型名？）无文档 |
| `YieldGeneral` | `0x200`、`0x211` | 0x211 不在 `syscall_table.json`，招降成功落点未知 |

这 9 条在 `syso_host.ts` 的 `SYSO_UNSUPPORTED` 里是 `{name, why}` 结构，
`tests/syso.test.ts` 里有专门用例断言"每条理由 ≥12 字、且不能同时出现在托管名单里"，
防止以后有人把它们当空壳静默处理。

---

## 4. 给 lead：`audio_bus.ts` 的登记片段（我不改这个文件）

`game/src/core/audio_bus.ts:483` 现在是：

```ts
export const SYSTEM_SO_IMPLEMENTED = [
  'DownBrightness',
  'RaiseBrightness',
  'AllRush',
  'MajorDeath',
  'LoadingBattleMap',
] as const;
```

**不要**把 25 个新名字直接塞进这个数组，两个原因：

1. `game/tests/smartscript_audio.test.ts:219` 用
   `assert.deepEqual(SYSTEM_SO_IMPLEMENTED, [...5 个])` 锁死了它的内容；
2. 更关键：`callSystemSo` 里 `if (!SYSTEM_SO_IMPLEMENTED.includes(fn)) return null;`，
   而 `runtime.callScript` 是 `const sys = callSystemSo(...); if (sys) return undefined;`。
   一旦这 25 个进了数组、`callSystemSo` 对它们返回 `[]`（空数组是真值），
   `callScript` 会直接 `return undefined`，**`SysoHost` 永远跑不到**。

建议在 `SYSTEM_SO_IMPLEMENTED` 之后（`SystemSoFuncName` 之前）加：

```ts
/**
 * R79：这 25 个由 `src/core/syso_host.ts` 在宿主侧实现，**不进** `callSystemSo`。
 *
 * `callSystemSo` 的契约是"返回 AudioEvent[]"，而这 25 个大多不发音频；
 * 更重要的是 `runtime.callScript` 用 `if (sys) return undefined` 判断命中，
 * 所以 `callSystemSo` 必须对这 25 个继续返回 `null`，否则宿主库被短路。
 * 这个常量只做"登记/文档/UI 展示"用。
 */
export const SYSTEM_SO_HOST_IMPLEMENTED = [
  'GetByte_Old', 'GetByte_Signed_Old', 'GetShort_Old', 'GetShort_Signed_Old',
  'GetInt_Old', 'SetInt_Old', 'SetShort_Old', 'SetByte_Old', 'SetString_Old',
  'MoveCamera', 'EnterMapMoveCamera', 'WeatherObjectDeath',
  'ProduceRain', 'ProduceSnow', 'ProduceFog',
  'EnterWar4', 'EnterWar5', 'EnterWar7',
  'KillGeneral', 'FreeGeneral', 'Test01',
  'EnterWarprep', 'EnterMapmode', 'EnterPolicy', 'EnterBattle',
] as const;

/** 39 个里真正有行为的 30 个（5 音频 + 25 宿主）。 */
export const SYSTEM_SO_ALL_IMPLEMENTED = [
  ...SYSTEM_SO_IMPLEMENTED,
  ...SYSTEM_SO_HOST_IMPLEMENTED,
] as const;
```

`SystemSoFuncName = (typeof SYSTEM_SO_IMPLEMENTED)[number]` 保持不动（它决定
`callSystemSo` 的窄类型）。若 lead 想让 `SYSTEM_SO_IMPLEMENTED` 直接变成 30 个，
必须同时改 `tests/smartscript_audio.test.ts:219`，并保证 `callSystemSo` 对这 25 个
仍然 `return null`。

---

## 5. 接线（`runtime.ts` 的 4 处改动）

1. `:27` 后：`import { SysoHost, type SysoArg } from '../syso_host.ts';`
2. 字段区：`readonly syso: SysoHost;` + `private readonly engineOverflow = new Map<number, number>();`
3. 构造函数末尾：`this.syso = new SysoHost({ ...ports }, { seed: 0x51c0, store: {…} })`，
   端口接 `rand`（走 `world.rng`，同 seed 同序列）、`spawnObject`、`setObjectPx`、
   `setObjectFrames`、`setTargetPx`、`targetPx`、`loadResource`、`sound`、
   `applyHpDelta`、`global`（`LDG n`）、`setGlobal`、`callScript`、`text`、`trace`；
   另加 `private globalValue(index)` 读 `vm.globals[index].value`。
4. `callScript` 三级分派：`callSystemSo`（5 个）→ `this.syso.has/call`（25 个）→
   `vm.invokeByName`（MAGIC.SO 同名函数）。`SkillSession` 新增 `get syso()` 供测试取证。

接线正确性的两个硬断言（`tests/syso.test.ts` 最后一组）：

- `startSkill(world,'A',501,24,6)` 之后，`session.syso` 上
  `GetInt_Old(0x4A6878+8)` 读到 **g2 = 主将句柄（≥1000）**、`+12` 读到不同的 g3、
  `+0` 为 0 —— 证明内存族接的是**本场**的 `vm.engine`，不是另一块数组。
- `session.syso.call('EnterWar5')` 生成 22 个物件且句柄由 `Runtime.spawnObject` 分配
  —— 证明端口真的落到 world 上。

---

## 6. `[推测]` 清单

1. `ProduceRain` / `ProduceSnow` 的粒子参数：原作短路成死代码，只能按残留常量重建。
2. `EnterMapMoveCamera` 的循环收尾：原作"步长不变 + 条件恒真"永不退出，改为夹到目标即停。
3. `MoveCamera` 最后一步强制落到目标点（千分位整除有余数，原作靠 `/100` 比较收尾）。
4. `SetString_Old` 的非 ASCII 双字节写法（cp950 双字节按 big-endian 写高低字节）。
5. `KillGeneral` / `FreeGeneral` 里 `0xA` 的语义（按"写全局/引擎量"处理）。
6. `EnterWar4` 第 6 个定点标记的列区间（`PUSHI 2; NEG; PUSHI 10; NEG` → `rand(-10,-2)`）
   与 `rand(6,9)` 那段的散布数量。

## 7. 已知偏差

- 取字节统一用 `>>>`（无符号右移），原作 `SHR` 对负数会带符号位。正常地址区间内等价。
- **`GetInt_Old` 的 `addr&3==2` 分支故意照抄原作的丢位 bug**：
  原作是 `((w1>>16)&0xFFFF)|(w2<<24)`（`work/system_so/funcs.txt` 里 0x38C 起那几条指令），第 16..23 位恒 0。
  重制版保持同样输出（`0x88001122` 这种），并在测试里写明是原作 bug，
  避免以后被"顺手修好"导致与原作读值不一致。写侧 `SetInt_Old` 四种对齐都字节精确。

---

## 8. 验收

```
cd F:\sanguo\game
npm.cmd exec -- tsc -p tsconfig.build.json   # exit 0
npm.cmd exec -- tsc --noEmit                 # exit 0
node --test tests\syso.test.ts               # 34 pass / 0 fail
node --test tests/*.test.ts                  # 702 条 / 693 pass / 9 fail
```

全量那 9 条失败**与本任务无关**：全部落在 `tests/units.test.ts`（"兵種 3（弓箭）"、
"buildFrame：弓兵對弓兵" 等），是另一个 agent 正在写的单位图集/帧选择
（`src/view/unitFrames.ts` mtime 04:25:46、`tests/units.test.ts` 04:31:16，
都晚于本任务最后一次改动）。剔除 `tests/units.test.ts` 与 `tests/soldiers.test.ts`
后重跑：**689 pass / 0 fail**。本任务只碰 `syso_host.ts` / `runtime.ts` / `syso.test.ts`
三个文件，`runtime.ts` 的改动只是 `callScript` 里加一级分派，不改任何既有语义。

## 9. 没做到的

- 9 个无据函数仍是"有理由的空位"，其中 `StartBattle` / `BattleYield` /
  `BattleEndTalk` / `ReportResult` / `SearchTalk` / `ChildGenTalkNew` / `YieldGeneral`
  是**战役对话与流程**，需要先补齐 `0x200`（按索引取对话行）/`0x206`（屏幕分区）/
  `0x139`/`0x211`/`0x124` 这几个 syscall 的语义（建议另开一条 R 条目做
  "SYSTEM.SO 对话表 + 屏分区"）。
- `Battle2`、`CheckGround` 在原作里就是空壳/死代码，重制版没有可实装的行为，
  已在清单里注明，不算欠债。
- `0x10` 资源号取参顺序与 `syscalls.ts:161` 的不一致（宿主按 `args[4]` 取），
  `syscalls.ts` 未改（不在本任务允许改动的范围之外，但会影响 MAGIC.SO 的物件生成，
  建议 s1-strategy 或后续条目复核）。
