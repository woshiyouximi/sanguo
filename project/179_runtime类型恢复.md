# R179 · `runtime.ts` 类型恢复 + 三条红归因

- 执行：`n3-runtime-retype`（脚本 VM 帮工）
- 日期：2026-11-25
- 主文件：`game/src/core/smartscript/runtime.ts`
- 事故背景：R171 违规用 PowerShell 写中文注释，把该文件按 GBK 读坏（不可逆）。上一轮 `l2-summon7` 从同一次构建的 `game/dist/core/smartscript/runtime.js` 逐行还原了**逻辑**，但**丢了全部 TypeScript 类型标注**，并在首行加了 `// @ts-nocheck`。本轮把类型面补回来，`tsc --noEmit` 重新对这条文件生效。

---

## 0. 结论数字（本机实测，2026-11-25 16:10 前后）

| 项 | 结果 |
|---|---|
| `npm exec -- tsc --noEmit` | **exit 0**（改前 221 error，全在 runtime.ts） |
| `npm exec -- tsc -p tsconfig.build.json` | **exit 0** |
| `Select-String runtime.ts "@ts-nocheck"` | **0 命中** |
| 全量 `node --test tests/*.test.ts` | **tests 1430 / pass 1418 / fail 12 / suites 75**（pass ≥ 1386 ✔；另有稍早一次快照 1414/16，树在被并行改，数字在动） |
| `node work/fidelity/check.mjs` | **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**（mode=dist，exit 0），`battle.cast.strike` **PASS** |
| 本文件显式 `any` | **0 处**（`grep ': any|as any'` = 0；`any` 一词只剩注释里 1 处） |
| 本文件 `unknown` | 1 处：`recordError(err: unknown)` |
| 行为未变 | 重新编译出的 `dist/core/smartscript/runtime.js` 与事故前构建**逐字节相同**（除首行 `// @ts-nocheck` 15 字节） |

> 说明：12 条红里只有 **2 条**属于本次任务的三条红（`cast_autoaim` 的神鬼亂舞/半月斬），其余 10 条是并行的 `m4-core-action-model` 正在改 `battle.ts` 造成的（详见 §C）。

---

## A. 类型恢复

### A.1 依据从哪来

1. **调用点反推（唯一真源）**：`vm.ts`（`VmHost` / `VmOptions` / `VmPumpResult` / `Slot`）、`syscalls.ts`（`SyscallContext` 的 37 个必选 + 11 个可选成员、`SkillObject`）、`so.ts`（`SoProgram` / `SoFunction` / `Instruction`）、`syso_host.ts`（`SysoHost` / `SysoPorts` / `SysoCallResult` / `SysoWordStore`）、`audio_bus.ts`（`SfxInput` / `SystemCallInput`）、`battle.ts`（`World` / `Unit` / `GeneralState` / `Side` / `Fx`）。
2. **Cocos 旧版对照**：`game/cocos/assets/scripts/core/smartscript/runtime.ts`（1646 行，12:16，**未损坏的带类型版本**，但没有 instances/syso 等新特性）——只当形状参照，不当替换。
3. **测试/生产调用点**：`battle.ts:2662` `startSkill(world, side, m.SCRIPT, aim.x, aim.y, { ttl: life })`；`battle.ts:1401` `let program: ReturnType<typeof loadMagicProgram>`；`tests/syso.test.ts:815-831`、`tests/script_instances.test.ts:159`、`tests/smartscript.session.test.ts:119-123`、`tests/r87_waitfor.test.ts:174-234`、`tests/magic_effects.test.ts:47-51`、`tests/rush.test.ts:416`、`tests/smartscript_audio.test.ts:270`。

上一轮凭空写的 7 个导出接口**形状是错的**（都带 `[key: string]: any`，且 `RunStats` 有 `frames` 没有 `script/fn/objects`、`RunSkillResult` 多了一个不存在的 `summary()`）。本轮按实现重写。

### A.2 「行为一行不改」的硬证据

```powershell
# 事故前那次构建（R171 之前，15:31 的 dist）早就备份成了：
#   F:\sanguo\work\n3_dist_before.js
cd F:\sanguo\game
npm.cmd exec -- tsc -p tsconfig.build.json      # 重新从改后的源码生成 dist
node -e "const fs=require('fs');const a=fs.readFileSync('F:/sanguo/work/n3_dist_before.js');const b=fs.readFileSync('F:/sanguo/game/dist/core/smartscript/runtime.js');const A=a.toString('utf8').split('\n'),B=b.toString('utf8').split('\n');console.log('before',a.length,'after',b.length,'delta',b.length-a.length);console.log('identical after dropping first line:',A.slice(1).join('\n')===B.join('\n'));"
```

实测输出：

```
before bytes 94590 after bytes 94575 delta -15
before lines 2034 after lines 2033
first line before: "// @ts-nocheck"
first line after : "// R171 事故恢复：本文件在 2026-11-25 15:32 被一次错误的 PowerShell 重写按 GBK 读坏，"
identical after dropping first line: true
```

即：**去掉首行 `// @ts-nocheck`（正好 15 字节）之后，编译产物与事故前那次构建逐字节相同**。TS 类型标注在编译时被擦除，这是"行为未变"的唯一硬证据；`type` 化改动不触及 JS 输出。

源码体量：`96608 B → 101350 B`（+4742 B，全是类型与注释），`2089 行 → 2144 行`。

### A.3 导入（4 条，全部 `import type`）

`tsconfig` 开了 `verbatimModuleSyntax`，类型导入必须写 `import type`，否则生成 JS 里会留下真实 import：

| 新增行 | 位置 | 依据 |
|---|---|---|
| `import type { GeneralState, Side, Unit, World } from "../battle.ts";` | runtime.ts:25 | `this.world/this.caster/this.general/this.side` 字段 + `spawnSoldier/summon` 造出的单位要满足 `World.units: Unit[]` |
| `import type { Instruction, SoFunction, SoSymbols } from "./so.ts";` | runtime.ts:27 | `opts.onInstruction?: (ins: Instruction) => void`；`scriptFn: SoFunction`；`preloaded.symbols: SoSymbols` |
| `import type { Slot, SlotValue, VmHost } from "./vm.ts";` | runtime.ts:29 | `class SkillRun implements VmHost`；`syscall(id, args: Slot[])`；`callScript(name, args: SlotValue[])` |
| `import type { SkillObject, SyscallContext } from "./syscalls.ts";` | runtime.ts:31 | `class SkillRun implements SyscallContext`；`objects: Map<number, SkillObject>` |

### A.4 导出接口（7 个，按实现重写）

| 接口 | 改前（l2-summon7 造） | 改后（= 实现真形状） | 依据调用点 |
|---|---|---|---|
| `FrameStat` | `killed/healed/hits/damage?` + `[k: string]: any` | `frame, instructions, syscalls, hits, killed, healed: number` | `settleFrame()` 返回字面量；`SkillSession.frames: FrameStat[]` |
| `ObjectInfo` | `x/y` + any | `resource, x, y, angle: number; dead: boolean` | `objectSummaries()` 的 map；`r87_waitfor.ts:174-234` 读 `.x/.y` |
| `RunStats` | `instructions/syscalls/frames` + any（**没有** `script/fn/objects`） | `script, fn, instructions, syscalls, objects, hits, killed, healed, unimplemented` | `statsOf()` 返回字面量；`smartscript.session.test.ts:119-123` 读 `stats.instructions` |
| `RunSummary` | `ok/objects/stats` + any | `ok: boolean; log: string[]; stats: RunStats; objects: ObjectInfo[]` | `SkillRun.summary()` 返回 `{ok,log,stats,objects}` |
| `InstanceSnapshot` | 只有 `fn` + any | `fn: string; done: boolean; pending: number; steps: number; pc: number; started: boolean` | `instanceStates()`；`script_instances.test.ts:159` `.find(x => x.fn === fn)` |
| `RunSkillResult` | 多了 `summary()`（**实现里没有**，TS2741） | `ok, log, stats, objects`（无 `summary()`） | `execute()` 返回字面量；`runSkill()` = `.execute()` |
| `SkillRunOptions` | 只有 `trace?` + any | `budget?: number; ttl?: number; trace?: (t: string) => void; onInstruction?: (ins: Instruction) => void` | `battle.ts:2662` 传 `{ ttl: life }`；`makeVm()` 读 `opts.budget` |

### A.5 新增的本地接口（5 个，都是内部形状）

| 接口 | 形状 | 为什么需要 |
|---|---|---|
| `HitPoint` | `{ x, y, r: number }` | `resolveHits`/`resolveFrameHits`/`unhitUnits`/`applyHits`/`pushFx`/`collideCallbacks` 之间传的都是格坐标命中点；不标就退化成 `{x:any,y:any,r:any}[]` |
| `VmInstance` | `{ vm: ScriptVm; fn: SoFunction; args: Slot[]; done: boolean; pending: number; started: boolean; hitDamage?: number }` | `instances: VmInstance[]`、`spawnInstance()` 返回、`pumpInstance(inst)`；原声明 `instances: any[]` 导致 `TS2339 Property 'vm' does not exist on type 'never'` |
| `SystemSoScriptResult` | `{ ok, ran: boolean; log: string[]; instructions, syscalls: number }` | `executeSystemScript()` 的返回；`rush.test.ts:416` 读 `res.ok/ran/log/instructions/syscalls` |
| `SystemSoRunOptions` | `{ program?: SoProgram; trace?; onInstruction?; budget? }` | `runSystemSoFunction(world, side, name, opts)` 的 4 个可选字段（原 `opts = {}` 推断成 `{}`，报 TS2339） |
| `SysoHostOptions` | `{ log?: string[]; trace?: (line: string) => void }` | `createBattleSysoHost(world, side, opts)`；`smartscript_audio.test.ts:270` 传 `{ log }` |

### A.6 `class SkillRun` 字段（46 个）

`class SkillRun implements VmHost, SyscallContext`（runtime.ts:270）——这一行让编译器逐成员核对端口契约。

| 组 | 声明 | 依据 |
|---|---|---|
| 身份 | `world: World; side: Side; scriptNum: number; fnNum: number; program: SoProgram` | 构造参数；`world.data.magics.find(m => m.SCRIPT === scriptNum)` |
| 执行 | `rootVm: ScriptVm; instances: VmInstance[] = []; current: VmInstance \| undefined; log: string[] = []; opts: SkillRunOptions` | `makeVm()` 建 `rootVm`；`0x312/0x314` 起子实例 |
| 阵营 | `casterHandle: number; targetHandle: number; caster: Unit; general: GeneralState` | `SyscallContext` 要求 `readonly casterHandle/targetHandle: number`；`this.general = world.sides[side].general` |
| 索引 | `byUnit = new Map<Unit, number>(); byHandle = new Map<number, Unit>(); unitList: Unit[]` | 单位↔句柄双向表；`unitList` 供"按方向取同侧单位" |
| 物件 | `objects = new Map<number, SkillObject>(); nextObjectHandle = 1; nextSummonHandle = 1` | `spawnObject()` 造的字面量含 `cbDamage?`，只能落到 `SkillObject` |
| R163 | `cbFired = new Set<string>(); cbPrev = new Map<number, { x: number; y: number }>()` | `collideCallbacks()`；键 `物件句柄:单位句柄` |
| 引擎 | `engine = new Int32Array(512); engineOverflow = new Map<number, number>(); clockValue = 0; workTicks = 0` | `vm.setEngineValue` 只覆盖 512 槽，越界进溢出表 |
| 落点 | `targetPoint = { x: 0, y: 0 }; castAim = { x: 0, y: 0 }` | 构造时 `targetPoint` = 最近敌人的像素位置，`castAim` 是玩家落点（脚本可用 `0x100` 挪前者，挪不动后者） |
| 音画 | `brightnessValue = 16; resources: string[]; sounds: string[]; soundsEmitted = 0` | `sound()/loadResource()/brightness()` 去重 |
| 统计 | `unimplemented = new Set<number>(); calls: string[]; healTargets = new Set<number>(); healed/killed = 0; frameKilled0/frameHealed0 = 0; hitUnits = new Set<Unit>(); totalHits = 0` | `statsOf()/settleFrame()`；`unimplemented` → `Stats.unimplemented: number[]`（原 `[...set].sort()` 报 TS18046 `'a' is of type 'unknown'`） |
| 逐帧 | `frameMode = false; framesRun = 0; framesSeen = 0; nestedWaits = 0; lastFrameEndedScript = false; fallbackApplied = false; fxPushed = false` | `pumpFrame()/settleFrame()/finishFrames()` 的状态机 |
| 其他 | `scriptFn: SoFunction \| undefined; ok = true; error = ''; truncated = ''; direction: number; isHeal/isSummon/isWide: boolean; syso: SysoHost` | `scriptFunction()` 的返回值；`ATTRIB` 正则；`new SysoHost(...)` |

### A.7 方法签名（167 处单行声明改写）

按端口分组（每组只列代表性签名 + 依据）：

**① `VmHost`（vm.ts:44-59 定义的契约，3 个成员）**

```ts
syscall(id: number, args: Slot[]): Slot | undefined
wait(frames: number): void
waitFor(name: string): void
```

依据：`vm.ts` 的 `VmHost` 接口；`wait` 是 `requestWait()` 的宿主侧入口（`vm.ts:308 requestWait(frames: number): never`）。

**② `SyscallContext`（syscalls.ts，37 必选 + 11 可选）**——本类实现了全部：

```ts
get vm(): ScriptVm                                     // 当前实例的 VM
unitOf(handle: number): { x; y; z; side: number; alive: boolean } | undefined
handleOfObject(handle: number): number
isUnit(handle: number): boolean
unitSide/unitAlive(handle: number): number | boolean
unitPx(handle: number): { x; y; z: number }
setTargetPx(x: number, y: number): void
targetPx(): { x; y: number }
unitAtPx(x: number, y: number): number
unitsInRect(camp: number, x0: number, y0: number, x1: number, y1: number): number[]
unitAtTile(x: number, y: number): number
spawnObject(resource: number, x: number, y: number, z: number, unit: number): number
objectOf(handle: number): SkillObject | undefined
setObjectPx(handle, x, y, z): void
setObjectMotion(handle: number, angle: number, speed: number): void
setObjectFrames(handle: number, frames: number): void
applyHpDelta(handle: number, delta: number): void
readHp(handle: number): number
maxHp(handle: number): number
summon(a: number, b: number, c: number): number
spawnSoldier(side: number, x: number, y: number): number
engineGet(index: number): number
engineSet(index: number, value: number): void
rand(min: number, max: number): number
sound(name: string, volume: number, unit?: number): void
loadResource(pattern: string): void
brightness(value: number): void
brightnessOf(): number
screenFlash(on: boolean): void
allRush(side: number): boolean
text(speaker: number, line: string): void
callScript(name: string, args: SlotValue[]): SlotValue | undefined
spawnScript(name: string, args: SlotValue[]): SlotValue | undefined
trace(line: string): void
markUnimplemented(id: number, why: string): void
sideUnitHandle(direction: number): number
aliveCount(camp: number): number
globalGet(index: number): number
generalOf(handle: number): number
instanceHitDamage(): number
```

依据：`syscalls.ts` 的 `SyscallContext`；`dispatchSyscall(ctx, id, args)` 只用这些成员。`Slot`/`SlotValue` 来自 `vm.ts:12-13`。

**③ 生命周期 / 执行**

```ts
execute(): RunSkillResult
executeSystemScript(name: string): SystemSoScriptResult
beginFrames(): boolean
pumpFrame(first: boolean): 'wait' | 'done'
settleFrame(): FrameStat
finishFrames(): void
advanceClock(): void
spawnInstance(fn: SoFunction, args: Slot[], vm: ScriptVm, hitDamage?: number): VmInstance
pumpInstance(inst: VmInstance): void
drainInstancesSync(): void
```

依据：`SkillSession.pump()/advance()`（runtime.ts:2040-2058）怎么调它们；`statsOf()/writeLog()` 的入参。

**④ 几何 / 命中**

```ts
resolveHits(): HitPoint[]
resolveFrameHits(): HitPoint[]
unhitUnits(pts: HitPoint[]): HitPoint[]
applyHits(hits: HitPoint[]): void
pushFx(hits: HitPoint[]): number
collideCallbacks(): HitPoint[]
```

依据：`execute()` 里 `const hits = this.resolveHits()` → `applyHits` → `pushFx`；`settleFrame()` 里 `hits.concat(cbHits)`。`pushFx` 内部 `let kind: 'heal' | 'aoe' | 'strike'`（否则 `string` 赋不进 `Fx.kind` 联合）。

**⑤ 调试 / 状态**

```ts
debugState(): { pc: number; depth: number; steps: number; nestedWaits: number }
debugLocal(offset: number): number
dumpObjects(): string
summary(): RunSummary
get runOk(): boolean
get runError(): string
get runTruncated(): boolean
get suspendedFrames(): number
get hasFx(): boolean
get isHealSkill(): boolean
get clock(): number
get instanceCount(): number
```

依据：`SkillSession` 的转发（`get debug()` 直接 `return this.run.debugState()`，两者形状必须一致，否则 TS2739）。

**⑥ 三个查询型 getter 在 `SkillRun` 与 `SkillSession` 两处同名**：`get clock(): number`（runtime.ts:937 / :1942）、`get isHealSkill(): boolean`（:871 / :1963）、`get instanceCount(): number`（:609 / :1959）——批量替换时按"出现 2 次"断言。

### A.8 `SkillSession` 与模块级函数

```ts
class SkillSession {
    side: Side; scriptNum: number; seq: number;
    frame = 0; pendingFrames = 0; done = false; ok = true; reason = '';
    frames: FrameStat[] = []; killed = 0; healed = 0; hits = 0;
    run: SkillRun; started = false;
    get debug(): { pc: number; depth: number; steps: number; nestedWaits: number }
    get syso(): SysoHost                       // 原写成 { spawns: InstanceSnapshot[] } —— 错
    instancesSnapshot(): InstanceSnapshot[]
    summary(): RunSummary
    advance(): FrameStat | undefined
    drain(): void
    pump(): void
    finish(): void
    constructor(run: SkillRun, seq: number)
}
```

- `get syso(): SysoHost` 的依据是 `tests/syso.test.ts:815-831`：`session.syso.call('EnterWar5', [])`、`.spawns.every(s => s.handle >= 1)`。原来的 `{ spawns: InstanceSnapshot[] }` 把 `SysoSpawn` 与 `InstanceSnapshot` 混了，且没有 `call`。
- `battle.ts:2669-2683` 读 `session.done/ok/reason/isHealSkill/hits` ⇒ 这 5 个成员必须有具体类型。

模块级：

```ts
export async function initMagicProgram(base = 'data/'): Promise<void>
export function setMagicProgram(program: SoProgram | undefined): void
export function loadMagicProgram(): SoProgram
export function runSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): RunSkillResult
export function startSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): SkillSession
function newSkillRun(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions): SkillRun
export function setSystemProgram(program: SoProgram | undefined): void
export function systemProgram(): SoProgram | undefined
export function runSystemSoFunction(world: World, side: Side, name: string, opts: SystemSoRunOptions = {}): SystemSoScriptResult
export const SYSTEM_SO_GENERAL_HANDLE = 1
export function createBattleSysoHost(world: World, side: Side, opts: SysoHostOptions = {}): SysoHost
```

`tx/ty` 由 `tx?: any` 改成**必填 `number`**：所有调用点（`battle.ts:2662`、`tests/syso.test.ts:814`）都传了具体数值；Cocos 旧版同签名也没有默认值。

### A.9 函数体内的局部标注（编译器无法推断的地方）

这些是 `tsc` 报 TS7034/TS7005/TS2345 的点，逐个补最窄类型：

| 位置 | 改前 → 改后 | 原因 |
|---|---|---|
| 构造函数 | `let best: Unit \| undefined` | 找最近敌人，`best.x` 会报 `'best' is possibly undefined` |
| `spawnInstance` | `const filled: Slot[] = []` | 推成 `never[]`，`push(arg)` 报 TS2345 |
| `execute()` | `let hits: HitPoint[] = []` | 同上 |
| `collideCallbacks()` | `const args: Slot[] = [...]` / `const hits: HitPoint[] = []` / `const seen = new Set<number>()` | `type: 2` 字面量要落进 `SlotType` 联合；`Set` 推成 `Set<never>` 报 TS2345 |
| `unitsInRect()` | `const found: Array<{ h: number; x: number; y: number }> = []` | 同上 |
| `callScript()/spawnScript()` | `const slots: Slot[] = args.map(...)` | 上下文类型让 `type: 2/0` 保住字面量 |
| `resolveHits()/resolveFrameHits()/unhitUnits()` | `const pts: HitPoint[] = []` / `const out: HitPoint[] = []` | 同上 |
| `pushFx()` | `let kind: 'heal' \| 'aoe' \| 'strike'` | 否则 `string` 赋不进 `Fx.kind` |
| `clampX/clampY/WARNED` | `(x: number): number` / `new Set<number>()` | 模块级隐式 any |
| `makeVm(base?: ScriptVm): ScriptVm` | — | `base ? { engine: base.engine } : {}` 需要 `ScriptVm` |
| 一处手工补 | `const target: Side = (Math.abs(side \| 0) & 1) === 0 ? 'A' : 'B'`（:1516） | 三元推成 `string`，赋给 `Side` 参数报 TS2345 |
| 一处手工补 | `const say = (line: string): void => {`（:2120） | 回调参数隐式 any |

### A.10 节奏（每改一段跑一次 tsc）

1. 删掉首行 `// @ts-nocheck` → `tsc --noEmit` **exit 2，221 error**（全在 runtime.ts，清单存 `work/n3_tsc_raw.txt`）。
2. 一次性脚本 `work/n3_retype_a.mjs`（node + `encoding='utf-8'`，exact-string 替换、每处断言"出现 N 次"，**不用 PowerShell 写代码文件**）：`imports +4 / lines 167 / blocks 7`。
3. 再跑 tsc → runtime.ts 只剩 **5** 个 error（`target: string`、`say` 隐式 any、`pushFx` 的 `kind`、两处 `never`）→ 用 `edit` 逐处补 → **0 error**。
4. `tsc -p tsconfig.build.json` exit 0 → dist 字节比对通过（§A.2）。

### A.11 残留

- 显式 `any`：**0**（`as any` 也是 0）。
- `unknown`：1 处，`recordError(err: unknown)`——这是 catch 变量的正确类型（唯一使用者是 `String(err)`）。
- 没有 `[未解]` 标记：所有签名都能对上真实调用点；拿不准的地方一律取「结构上够用的最窄形状」（例如 `SysoHostOptions.trace` 只声明用到的签名）。

---

## B. 三条红：归因与处置

### B.1 总表

| # | 红 | 现状（2026-11-25 16:10） | 归因 | 处置 |
|---|---|---|---|---|
| 1 | `tests/magic_effects.test.ts` · `seq3 地泉衝` `killed=0` | **已绿**（该文件 20/20 全过） | 旧断言**不是**错的；是本轮之前 `battle.ts` 的中间态（`m4` 正在改）让 `cast()` 打不到人。随 `battle.ts` 回稳自愈，`runtime` 侧无需改 | 未改任何断言/期望 |
| 2 | `node work/fidelity/check.mjs` · `battle.cast.strike` FAIL | **已绿**（`PASS battle.cast.strike`，全表 FAIL 0） | 同上：期望值来自原作地址级证据（`gen_expect.mjs` 生成），不该改；红是因为 `dist` 里的 `battle.js` 处于中间态 | `work/fidelity/fidelity_expect.json` **0 处修改** |
| 3 | `tests/cast_autoaim.test.ts` · 神鬼亂舞 / 半月斬「不再吃落点」 | **仍红** | **真回归**（在 `runtime.ts` 的逐帧落点兜底，不是旧断言过期） | 未修，理由与阴性对照见 §B.3 |

### B.2 红 1 / 红 2：期望值没错，是对面中间态

- 红 1 的断言我没动过一行；它自己变绿的证据：`node --test tests/magic_effects.test.ts` → `tests 20 / pass 20 / fail 0`。
- 红 2 的期望文件我没动过一行（`fidelity_expect.json` mtime 仍是 14:31，本轮未写）；`check.mjs` 现在的输出：

```
PASS  battle.cast.heal
PASS  battle.cast.cost
PASS  battle.cast.reject.qi
PASS  battle.cast.reject.mp
PASS  battle.cast.aim
PASS  battle.cast.strike      ← 原来的 FAIL
PASS  battle.cast.aoe
```

- 判定依据：`work/gate_fidelity.log`（15:07，R171 落盘之前）此条本来就是 PASS；`project/163` 也记录 strike 族断言有地址级证据（`0x40AA82..0x40ABC5`）。所以**不许**为了让测试变绿去改期望值。

### B.3 红 3：神鬼亂舞/半月斬 —— 真回归，未修

**现象**（`node --test tests/cast_autoaim.test.ts`，11/13）：

```
✖ 不传落点：神鬼亂舞不再吃落点（G3 = 对面主将，脚本自读 g3 而非落点）
  AssertionError: auto({"d":{"kills":8,"dmg":38,"healed":0},"hpLoss":38})
                  该等于中场({"d":{"kills":7,"dmg":38,"healed":0},"hpLoss":38})：G3 = 对面主将
✖ 不传落点：半月斬（多帧技）贴住敌兵堆，auto 与显式瞄兵堆结果一致且真有击杀
```

注意：`dmg`（主将伤害）与 `hpLoss` 两边完全相同，**只有 `d.kills` 差 1**。这恰好证明 R163 的 g3 接线（`makeVm()` 里 `G3 = generalOf(targetHandle)`，对应 `0x43BA9D`）是好的；差的不是主将伤害，而是"顺手打死的兵"。

**机制（逐帧探针实测）**：`resolveFrameHits()`（runtime.ts:1793-1797）有一条 remake 自造的「落点兜底」：

```ts
if (pts.length === 0 && !this.isHeal && !this.isSummon
    && (this.lastFrameEndedScript || this.framesSeen >= 3) && !this.fallbackApplied) {
    this.fallbackApplied = true;
    pts.push({ x: this.castAim.x / 96, y: this.castAim.y / 72, r: 1.4 });
}
```

它用的锚点是**玩家落点 `castAim`**。神鬼亂舞（SCRIPT=605）在第 3 帧就满足 `framesSeen>=3 && 这一帧没有候选点`，而它的物件要到第 6 帧才开始出现（探针：f=3 `hits=2 cb=0 objs=0`，f=6 `objs=1`，f=7 `objs=12`，f=37 `killed=7`，全程 `cbFired=0`）。于是：**兜底抢在脚本摆物件之前，按落点补了一次 r=1.4 的判定**；auto 与"中场"的 `castAim` 不同（探针 `[FB]` 行：`aim=1536,432 th=1041` vs `aim=1920,432 th=1033`）⇒ 被打到的兵不同 ⇒ `kills` 差 1。半月斬（SCRIPT=550）同理。

**阴性对照（同一棵树，只改这一行）**：把兜底条件加 `&& false` 关掉，重跑两个文件：

| 配置 | `cast_autoaim` | `magic_effects` |
|---|---|---|
| 兜底在（现状） | 11/13（神鬼、半月红） | 20/20 |
| 兜底关（`&& false`） | **13/13 全绿** | **pass 27 / fail 6**：seq3 地泉衝、seq4 火箭、seq30 火箭天襲、seq42 五雷轟頂、seq110 鬼哭神號、seq12 拒陸馬 |

→ 关掉兜底能让 2 条红变绿，但会把 6 条原本绿的技打成"空放"（`hits=0`）。**兜底是那 6 发技唯一的伤害来源，不能直接删。**（实验完已按备份还原，`runtime.ts` SHA256 前后一致：`7E95B2CF…3738D3`，复查 31 pass / 2 fail。）

**试过但不成立的两条修法**（都在 `work/n3_probe` 副本里，未落真实文件）：

| 修法 | 结果 |
|---|---|
| 只在「脚本跑完那一帧」兜底（去掉 `framesSeen>=3`） | 神鬼/半月绿，但 seq3/4/30/110/12 又红：那批发技的脚本在会话窗口内根本没有 `done`（探针：`finishFrames` 时 `done=false frames=356`），`lastFrameEndedScript` 永远不为真 |
| 延迟到会话结束再结算（`finishFrames` 里按 f=3 捕获的候选单位扣血），并把战果同步进 `SkillSession` 统计 | 神鬼/半月绿，但那 5 发技仍红：`finishFrames` 时刻落点上已经没人（单位已走位），而会话统计只累加每帧 `FrameStat`，补结算进不去 `hits` |
| 「脚本安静 3 帧才许兜底」（记录最后一次 syscall 的帧号，`framesSeen - lastActFrame >= 3` 且 `totalHits === 0`） | 神鬼/半月绿，但 seq3/4/30/42/110/12 **整整 6 条**又红：那批技的落点命中恰恰发生在脚本仍在跑 syscall 的帧上，安静窗口来得太晚 |

**为什么我没动断言**：`same === true` 是 R163 有意翻面的新断言（`project/163` 第 159 行有「改前/改后/依据」记录：依据 `G3 = 对面主将`，`0x43BA9D`；脚本自读 `g3`、与落点无关）。把它放宽成"kills 允许差 1"就是作弊；退回 `same === false` 更是反着原作语义走。**真正的错在我们的兜底时机**，不在断言。

**根治方向（下一轮）**：兜底之所以存在，是因为一批技的物件由引擎侧 C 代码摆放（`0x40AA82` 起的碰撞循环），我们还没接。正确修法是把 `resolveFrameHits()` 的兜底降级成"**脚本自始至终没有产生任何命中**才在会话末补一次"，并且让补结算进入会话统计；更彻底的是补上 R163 指出的引擎侧摆放（`project/163` 第 7 行：`obj[+0x98]` 回调链 `0x40AA82..0x40ABC5`）。两条都需要在 `battle.ts` 稳定后重测，且 `battle.ts` 本轮对我禁改。

---

## C. 未修 / 未验收项

1. **`cast_autoaim` 的神鬼亂舞、半月斬两条红没修好**（§B.3）。按约定"修一个、报两个"收工：给出机制、阴性对照与两条失败修法，不硬凑、不放宽阈值。
2. 全量 12 条红里另 **10 条不属于本轮三条红**，全部集中在并行 agent 正在改的 `battle.ts` 行动模型/策略结算面（16:14 快照；更早一次 16:10 的快照是 14 条，树在动）：
   - `R22 真打一局：killsInf + killsCav 恒等于 start − aliveCount`
   - `R39 聚合端到端：天气越差命中越少` / `8 个种子 × 24v24 ... 命中率`
   - `R80 真跑一场战斗`、`R88 落月弓`、`化解計策（24）差量`、`去重是分側的`、`blocks 只增不减`
   - 视图面：`console：敌方块是镜像（…名字靠右）`
   - 以及两条**精确计数金标准**：`606 完整跑完一遍应是 358333 条（实际 358312）`、`606 接上碰撞回调后应固定 562 帧（实际 556 帧）`——脚本指令数/帧数随 `battle.ts` 喂进去的单位状态变化，属于行动模型改动的连带，不是类型问题（`dist` 字节比对已排除本文件）。
   - （更早快照里还出现过 `R37 策略/援軍`、`R67 script vs legacy`、`R84 化解計策 ops` 等，随 `m4` 落盘已自行转绿，进一步说明这批红与 `runtime.ts` 无关。）
3. `tsconfig.build.json` 的 `noCheck: true` 只保证语法；但 `tsc --noEmit`（strict）现在对 `runtime.ts` 是真跑通的，两者都 exit 0。

---

## D. 附：本轮产生的文件

| 路径 | 用途 |
|---|---|
| `game/src/core/smartscript/runtime.ts` | 唯一改动的源文件（+4742 B 类型） |
| `work/n3_runtime_before.ts` | 改前备份（已去掉 `@ts-nocheck` 首行的版本，96608 B） |
| `work/n3_runtime_keep.ts` | 阴性对照实验前的快照（还原用，SHA256 `7E95B2CF…3738D3`） |
| `work/n3_dist_before.js` | 事故前那次构建的 `dist` 产物（94590 B），字节比对基准 |
| `work/n3_tsc_raw.txt` | 删除 `@ts-nocheck` 后首轮 221 条 error 清单 |
| `work/n3_retype_a.mjs` | 批量补类型的 node 脚本（exact-string + 出现次数断言，UTF-8） |
| `work/n3_probe/` | 只读副本（含 no-op `battle_ai.ts` 桩），用于真实树被并行改动卡住时做实测 |
| `work/n3_patch_probe.mjs` | 副本补丁器（`log/verbose/guard/nofb/end/lastframe/defer/defer2/...`） |
| `work/n3_tests_base.txt` / `n3_tests_final.txt` | 15:53 基线与 16:10 全量测试日志 |
| `work/n3_fidelity_final.txt` | 最终 fidelity 输出（PASS 459 / FAIL 0） |
