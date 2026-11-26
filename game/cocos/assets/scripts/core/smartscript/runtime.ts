// R171 事故恢复：本文件在 2026-11-25 15:32 被一次错误的 PowerShell 重写按 GBK 读坏，
// 源码字节不可逆丢失；这里用同一次构建（15:31，含 R171 全部改动）的编译产物
// game/dist/core/smartscript/runtime.js 逐行还原（tsc 保留注释，故注释与实现的
// 文本均与丢失前一致，只是丢了 TypeScript 的类型标注）。随后补回类型标注。
/**
 * 战斗适配层：把 MAGIC.SO 的脚本 VM 接到 `World` 上。
 *
 *   runSkill(world, side, scriptNum, tx, ty) -> { ok, log }
 *
 * 引擎全局约定（原作由战斗系统在 RunById 之前写好）：
 *   g2 = 施法主将句柄      g3 = 目标单位句柄
 *   g4 = 数值（伤害/治疗量） g5 = 方向（攻击技 0/1/2）或治疗目标句柄（治疗技）
 *
 * 单位句柄从 1000 起分配：方向只有 0/1/2，句柄 >= 1000 让
 * `CreateHolyLight` 里 `LDG 5 == 1` 这类判定不会把句柄误当方向。
 *
 * 与真实客户端的偏差（见 project/28_脚本虚拟机移植.md）：
 *   - `runSkill` 是同步模型：WAIT 不挂起协程，只推进虚拟帧，脚本一次跑完；
 *   - `startSkill` 是逐帧模型：WAIT 真挂起，`SkillSession.advance()` 每 tick 递一帧，
 *     `cast()` 走这条路径，于是"第 N 帧才生效"的技能与原作节奏一致；
 *   - 物件伤害在原作由 C 侧碰撞循环判定，这里改成"物件位置并集 + 半径"的几何判定；
 *   - 随机数默认走 world.rng，序列与 1998 年的 rand() 不同，但同一 seed 可复现；
 *     战场开了 `world.roll`（R115）时，脚本的 `rand(min,max)` 与命中概率改走原作
 *     `0x450132` 乱数流（`rand()%n` 语义），同一 seed 下同样可复现。
 */
import { FX_TTL_DEFAULT, allRush as allRushSide } from "../battle";
import type { GeneralState, Side, Unit, World } from "../battle";
import { SoProgram } from "./so";
import type { Instruction, SoFunction, SoSymbols } from "./so";
import { ScriptVm } from "./vm";
import type { Slot, SlotValue, VmHost } from "./vm";
import { dispatchSyscall } from "./syscalls";
import type { SkillObject, SyscallContext } from "./syscalls";
// Cocos 差异：音频总线在 `assets/scripts/AudioBus.ts`（AudioHost 也只认这个实例），
// 不能指向 `../audio_bus`——那份是 web 真源的副本，另建实例会让脚本音效听不见。
import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../../AudioBus';
import { SysoHost } from "../syso_host";

/*
 * R171 事故恢复时补回的**最小类型面**。
 *
 * 这里只声明调用方（battle.ts / web / tests）真正读到的成员：编译产物没有类型标注，
 * 若不给 `runSkill` / `startSkill` / `summary()` 一个具体形状，调用方一律退化到
 * `never`/`any`，`tsc --noEmit` 会在测试里报一片 implicit-any。
 * 语义上的真源仍是下面这些函数/类的实现；接口只为恢复类型检查，不改变运行时。
 */
/** 一帧的结算统计（`SkillSession.frames[]` 的元素）。 */
export interface FrameStat {
    frame: number;
    instructions: number;
    syscalls: number;
    hits: number;
    killed: number;
    healed: number;
}
/** 脚本物件的落脚点（格坐标，`r87` 用它断言 dummy 不在原点）。 */
export interface ObjectInfo {
    resource: number;
    x: number;
    y: number;
    angle: number;
    dead: boolean;
}
/**
 * 一次武将技投射物（飞行体）的**事实记录**（R187）。
 *
 * 原作里「有弹道的技」不是一个技能类别，而是脚本自己 `0x11` 建一个会动的物件、`0x18` 给寿命、
 * `0x2C` 挂碰撞回调：`ShootObject @0x6998` 建 `13001+arg2*2`、回调 `3001`
 * （`ShootObjectCallback @0x5CA4`）；`HalfMoon` 建 `11001`、回调 `1001`；`連弩` 建 `29001`、
 * 回调 `19001`。引擎逐帧推进物件、撞到单位由回调里的 `Hurt` 结算（dis:3427-3470）。
 *
 * 端口没有逐帧引擎，所以 core 只把「谁、什么时候、从哪、飞到哪、用哪个帧目录」记下来，
 * 由 `battleView.drawProjectiles()` 画成飞行实体。**伤害链一个字都没改**：谁挨打、挨多少，
 * 仍由 `resolveFrameHits()`/`collideCallbacks()`/`applyHits()` 决定。
 */
export interface ProjectileFlight {
    /** 技能 SEQUENCE（view 用它取技名、对齐 `fx` 表情） */
    seq: number;
    /** 帧目录 = `magics.json` 的 `fx_dir_primary`，也是 `web/assets/fx/index.json` 的 dirs 键 */
    dir: string;
    /** 原作物件资源号（`0x11` 第 2 参）：落月弓 13001 / 半月斬 11001 / 連弩 29001 */
    resource: number;
    side: Side;
    /** 起点 = 施法者像素位置（格），终点 = 本技引擎解析出的目标单位位置（格） */
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    /** 出生 tick（与 `world.tick` 同一条时间轴，view 按 `world.tick - bornTick` 插值） */
    bornTick: number;
    /** 飞完全程要几个 tick（= 距离/速度 向上取整，且不超过物件寿命；最小 1） */
    lifeTick: number;
    /** 脚本虚拟帧：物件被创建的那一帧 */
    bornFrame: number;
    /** 脚本虚拟帧：物件消失（回调结算或到期）的那一帧；-1 = 还没消失 */
    hitFrame: number;
}

/** world → 已产生的投射物事件。用 WeakMap 是为了不改 `World`/`battle.ts` 的形状。 */
const FLIGHT_TABLE = new WeakMap<World, ProjectileFlight[]>();
const NO_FLIGHTS: readonly ProjectileFlight[] = [];

/** 读本局已产生的投射物事件（view / 测试用；只读）。 */
export function projectilesOf(world: World): readonly ProjectileFlight[] {
    return FLIGHT_TABLE.get(world) ?? NO_FLIGHTS;
}

/** 清空本局的投射物事件（测试用：同一 world 反复放同一技时避免累积）。 */
export function clearProjectiles(world: World): void {
    FLIGHT_TABLE.delete(world);
}

/** 把一次飞行登记进 world 的事件表（同一 world 累加，按出生顺序）。 */
function pushProjectile(world: World, flight: ProjectileFlight): void {
    const list = FLIGHT_TABLE.get(world);
    if (list) list.push(flight);
    else FLIGHT_TABLE.set(world, [flight]);
}

/**
 * 弹丸**还没出生**时，落点兜底最多让位几帧。
 *
 * 取值依据：`ShootObject @0x6998` 在 spawn 之前有 `WAIT 15` + `WAIT 15`（dis:3979/3994）
 * 两段定场，端口里落月弓/御飛刀在第 11 帧、半月斬/連弩在第 7 帧建出弹丸，都在这 16 帧内。
 * 设上限而不是"等到脚本结束"，是为了不让 1001 帧的地泉衝、559 帧的劍輪舞把伤害拖到末尾。
 */
const PROJECTILE_GRACE = 16;

/** 弹丸帧目录：`magics.json` 的 `fx_dir_primary`（落月弓 "003"、半月斬 "001"），回退 `fx_dir[0]`。 */
function flightDirOf(magic: { fx_dir?: string[]; fx_dir_primary?: string } | undefined): string {
    if (!magic) return '';
    if (magic.fx_dir_primary) return magic.fx_dir_primary;
    const dirs = magic.fx_dir;
    return dirs && dirs.length > 0 ? dirs[0]! : '';
}

/** 每个程序的「函数入口偏移升序表」缓存（用于按偏移求函数体范围）。 */
const FUNCTION_OFFSETS = new WeakMap<object, number[]>();

/** 求 `off` 所在函数体的结束偏移 = 下一个函数入口（没有下一个就取 codeEnd）。 */
function bodyEndOf(program: SoProgram, off: number): number {
    let list = FUNCTION_OFFSETS.get(program);
    if (!list) {
        list = program.functions.map((f) => f.off).sort((a, b) => a - b);
        FUNCTION_OFFSETS.set(program, list);
    }
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid]! <= off) lo = mid + 1;
        else hi = mid;
    }
    return lo < list.length ? list[lo]! : program.codeEnd;
}

/**
 * 静态判定：一个脚本函数的**调用闭包**里，是否同时出现 `0x11`（建物件）与 `0x2C`（挂碰撞回调）。
 *
 * 原作的"有弹道的技"就是这对组合：`ShootObject @0x6998` 建 `13001+arg2*2` 后立刻
 * `0x2C(obj,3001)`（dis:4102-4104），`HalfMoon` 建 `11001` 后 `0x2C(obj,1001)`，
 * `連弩` 建 `29001` 后 `0x2C(obj,19001)`；而 `Spout`/`Ice` 这类只是 `0x11` 建静止特效，
 * 没有碰撞回调，不会"飞过去再结算"。
 *
 * 只看**函数体线性区间**（[入口, 下一个函数入口)）就够：SmartScript 的跳转都在函数内。
 */
function programSpawnsProjectile(program: SoProgram, root: SoFunction | undefined): boolean {
    if (!root) return false;
    const seen = new Set<number>();
    const queue: SoFunction[] = [root];
    let spawn = false;
    let callback = false;
    let budget = 20000; // 防御：病态脚本也不会让静态扫描拖住
    while (queue.length > 0 && budget > 0) {
        const fn = queue.pop()!;
        if (seen.has(fn.off)) continue;
        seen.add(fn.off);
        const end = bodyEndOf(program, fn.off);
        let off = fn.off;
        while (off < end && budget > 0) {
            let ins: Instruction;
            try {
                ins = program.decode(off);
            }
            catch {
                break;
            }
            budget -= 1;
            if (ins.op === 0x05) {
                if (ins.a === 0x11) spawn = true;
                else if (ins.a === 0x2c) callback = true;
                if (spawn && callback) return true;
            }
            else if (ins.op === 0x04) {
                const callee = program.functionAt(ins.a);
                if (callee) queue.push(callee);
            }
            else if (ins.op === 0x02 || ins.op === 0x01) {
                break; // RET / RETV：函数体到此为止
            }
            if (ins.next <= off) break; // 防御：偏移不前进
            off = ins.next;
        }
    }
    return spawn && callback;
}

/** 运行时统计（`runSkill().stats`）。 */
export interface RunStats {
    script: number;
    fn: string;
    instructions: number;
    syscalls: number;
    objects: number;
    hits: number;
    killed: number;
    healed: number;
    unimplemented: number[];
}
/** 会话/同步执行的结果摘要。 */
export interface RunSummary {
    ok: boolean;
    log: string[];
    stats: RunStats;
    objects: ObjectInfo[];
}
/** `SkillSession.instancesSnapshot()` 的元素。 */
export interface InstanceSnapshot {
    fn: string;
    done: boolean;
    pending: number;
    steps: number;
    pc: number;
    started: boolean;
}
/** `runSkill()` 的返回（= `SkillRun` 实例的外部形状）。 */
export interface RunSkillResult {
    ok: boolean;
    log: string[];
    stats: RunStats;
    objects: ObjectInfo[];
}
/** `runSkill` / `startSkill` 的可选项。 */
export interface SkillRunOptions {
    /** 指令预算（超过按截断收尾）。 */
    budget?: number;
    /** 特效寿命（虚拟帧），`cast()` 传法术的 life。 */
    ttl?: number;
    /** 逐条指令/WAIT 的调试输出。 */
    trace?: (text: string) => void;
    /** 每条指令执行前的回调（反汇编工具用）。 */
    onInstruction?: (ins: Instruction) => void;
}
/** 本地命中点（格坐标）。命中判定/resolveHits 与 `applyHits` 之间的内部形状。 */
interface HitPoint {
    x: number;
    y: number;
    r: number;
}
/** 一条脚本实例：根实例 + `0x312 / 0x314` 起的子实例。 */
interface VmInstance {
    vm: ScriptVm;
    fn: SoFunction;
    args: Slot[];
    done: boolean;
    pending: number;
    started: boolean;
    hitDamage?: number;
}
/** `executeSystemScript()` 的返回（SYSTEM.SO 战斗级函数）。 */
interface SystemSoScriptResult {
    ok: boolean;
    ran: boolean;
    log: string[];
    instructions: number;
    syscalls: number;
}
/** `runSystemSoFunction()` 的可选项。 */
interface SystemSoRunOptions {
    program?: SoProgram;
    trace?: (text: string) => void;
    onInstruction?: (ins: Instruction) => void;
    budget?: number;
}
/** `createBattleSysoHost()` 的可选项。 */
interface SysoHostOptions {
    log?: string[];
    trace?: (line: string) => void;
}
/**
 * Cocos 差异（web 那份用 `import.meta.url`，本副本不能有）：Creator 的产物是
 * System.register 包起来的函数体，`import.meta` 不是合法语法（rollup 直接判死）。
 * Cocos 走「预加载」路径（`assets/scripts/shim/host.ts` 已把 SO/数据装好），
 * 这个常量只给下面的同步 XHR / node:fs 兜底分支用，指哪都无所谓。
 *
 * R214：这里**绝对不能**写 `new URL(...)`——原生包里 `URL` 是 jsb-adapter 的垫片
 * （web-adapter.js:345 用 `document.createElementNS(..., "a")` 造假锚点），native 下
 * `a.protocol` 是 undefined，构造时就 `uri_info.protocol.toLowerCase()` 抛 TypeError；
 * 而这行在模块顶层，等于整个 main bundle 执行失败 ⇒ 原生包一启动就全黑（2026-11-26 实测）。
 * 兜底分支后续要拼 URL 的一律走字符串拼接。
 */
const DATA_URL = 'https://cocos.local/data/'; // 不要 new URL：native 无真 DOM 锚点
let cachedProgram: SoProgram | undefined;
/** 浏览器里由 `initMagicProgram()` 预先塞进来的原始字节。 */
let preloaded: { bin: ArrayBuffer | Uint8Array; symbols: SoSymbols } | undefined;
/**
 * 预加载 `magic_so.{bin,symbols.json}`。
 *
 * Node 下自动从磁盘读；浏览器下 **必须** 在开战前 `await` 一次
 * （`game/web/main.js` 里已接），否则 `cast()` 会抛"尚未加载"。
 * 之所以不做成同步 XHR：微信小游戏环境不支持，而且会阻塞首帧。
 */
/**
 * `DATA_URL` 在 web 是 `URL`、在 Cocos 镜像里是字符串；统一拼成字符串。
 *
 * 为什么不用 `new URL(name, DATA_URL)`：Cocos native 的 `URL` 是 jsb-adapter 的垫片，
 * 构造时用 `document.createElementNS('a')` 取 `protocol`，native 没有真锚点 ⇒
 * `Cannot read properties of undefined (reading 'toLowerCase')`（R224 P0-2）。
 */
function dataUrl(name: string): string {
    const base = String(DATA_URL);
    return base.endsWith('/') ? base + name : `${base}/${name}`;
}
/**
 * 把相对 `base` 解析成绝对地址。
 *
 * 优先用真 `URL`（web 的 `../data/` 要靠它）；native 的 URL 垫片会抛，退回字符串拼接
 * ——native 侧这个地址只会喂给 `fetch` 垫片，垫片按后缀匹配、根本不看前缀。
 */
function resolveBase(base: string): string {
    const href = typeof location !== 'undefined' ? String(location.href) : '';
    try {
        if (typeof URL === 'function')
            return new URL(base, href).toString();
    }
    catch {
        // native：URL 垫片不可用，走下面的手拼
    }
    const dir = href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    return dir + base;
}
export async function initMagicProgram(base = 'data/'): Promise<void> {
    if (cachedProgram || preloaded)
        return;
    const root = resolveBase(base);
    const binUrl = (root.endsWith('/') ? root : `${root}/`) + 'magic_so.bin';
    const symUrl = (root.endsWith('/') ? root : `${root}/`) + 'magic_so.symbols.json';
    const [binRes, symRes] = await Promise.all([fetch(binUrl), fetch(symUrl)]);
    if (!binRes.ok || !symRes.ok)
        throw new Error(`magic_so 加载失败: ${binRes.status}/${symRes.status}`);
    preloaded = { bin: await binRes.arrayBuffer(), symbols: (await symRes.json()) };
}
/**
 * 注册一份 MAGIC.SO 程序（测试/工具用）。
 *
 * 生产环境不注册：`loadMagicProgram()` 自己从 `game/data/` 读真字节码。这个入口留给
 * 合成程序的单元测试——`tests/script_instances.test.ts` 用一份手写字节码（`Magic37`
 * 里 `SYSCALL 0x312` 起一条子脚本）来验证并发脚本实例的调度，而不依赖某个真技能的时序。
 */
export function setMagicProgram(program: SoProgram | undefined): void {
    cachedProgram = program;
}
/**
 * 直接塞原始字节（Cocos 原生/小游戏用）。
 *
 * native 里 `fetch` 是垫片、`URL` 是垫片，走 `initMagicProgram()` 会连环踩坑；垫片那边
 * 已经能从 `res` bundle 读到 `magic_so.{bin,symbols}`，直接交给这里最稳。
 */
export function primeMagicProgram(bin: ArrayBuffer | Uint8Array, symbols: SoSymbols): void {
    preloaded = { bin, symbols };
    cachedProgram = undefined;
}
/** 读取 `game/data/magic_so.{bin,symbols.json}`（进程内缓存）。 */
export function loadMagicProgram(): SoProgram {
    if (cachedProgram)
        return cachedProgram;
    if (preloaded) {
        cachedProgram = SoProgram.fromJson(new Uint8Array(preloaded.bin), preloaded.symbols);
        return cachedProgram;
    }
    // 浏览器兜底：同步 XHR（首帧前一次性 261 KB，之后走缓存）。这样即使调用方
    // 忘了 `await initMagicProgram()`，技能也不会退化成占位特效。
    if (typeof XMLHttpRequest !== 'undefined') {
        // 同步 XHR 在文档里不能设 responseType，二进制的标准做法是
        // overrideMimeType('text/plain; charset=x-user-defined') 再逐字符取低 8 位。
        const getText = (u: string): string => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', u, false);
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
            xhr.send(null);
            if (xhr.status !== 200 && xhr.status !== 0)
                throw new Error(`magic_so 加载失败: ${u} (${xhr.status})`);
            return xhr.responseText;
        };
        const binText = getText(dataUrl('magic_so.bin'));
        const bytes = new Uint8Array(binText.length);
        for (let i = 0; i < binText.length; i++)
            bytes[i] = binText.charCodeAt(i) & 0xff;
        const sym = JSON.parse(getText(dataUrl('magic_so.symbols.json')));
        cachedProgram = SoProgram.fromJson(bytes, sym);
        return cachedProgram;
    }
    // Node / 测试：动态 require 以免把 node:fs 打进浏览器包
    // Cocos 差异：Cocos 的 tsconfig.check.json 不引 @types/node（`types: []`），
    // `globalThis.process` 在 strict 下没有声明，会报 TS7017。这里显式写出形状，
    // 取的仍是同一个 `process?.getBuiltinModule`，语义与 web 一致。
    const req = (globalThis as unknown as {
        process?: { getBuiltinModule?: (id: string) => any };
    }).process?.getBuiltinModule;
    if (typeof req !== 'function')
        throw new Error('magic_so 尚未加载：浏览器/小游戏请先 await initMagicProgram()');
    const fs = req('node:fs');
    const bytes = fs.readFileSync(new URL('magic_so.bin', DATA_URL));
    const sym = JSON.parse(fs.readFileSync(new URL('magic_so.symbols.json', DATA_URL), 'utf8'));
    cachedProgram = SoProgram.fromJson(new Uint8Array(bytes), sym);
    return cachedProgram;
}
/** 警告只打一次（每个 syscall 号）。 */
const WARNED = new Set<number>();
/**
 * 同步跑完一个技能脚本：一次调用产出全部命中与一个 fx。
 * 语义与首版一致（测试金标准依赖它），只是预算改成"按 WAIT 区间"计
 * ——原作时间本来就是一帧一帧走的，整段共用一个预算会把长动画技能误判成死循环。
 */
export function runSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): RunSkillResult {
    return newSkillRun(world, side, scriptNum, tx, ty, opts).execute();
}
/**
 * 逐帧启动一个技能脚本（`cast()` 用）。
 *
 * 返回的会话已经跑完**第 0 帧**：瞬发效果（治疗、直接改血量）与首帧命中
 * 已经落到 `world`，`session.frames[0]` 就是这一帧的统计。之后每次 `step()`
 * 调一次 `session.advance()`，`WAIT n` 会真的挂起 n 帧。
 */
export function startSkill(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions = {}): SkillSession {
    const run = newSkillRun(world, side, scriptNum, tx, ty, opts);
    const m = world.data.magics.find((x) => x.SCRIPT === scriptNum);
    const session = new SkillSession(run, m?.SEQUENCE ?? scriptNum);
    session.start();
    return session;
}
function newSkillRun(world: World, side: Side, scriptNum: number, tx: number, ty: number, opts: SkillRunOptions): SkillRun {
    const program = loadMagicProgram();
    const fnNum = 0x1f5 + (scriptNum - 501);
    return new SkillRun(world, side, scriptNum, fnNum, tx, ty, program, opts);
}
const HANDLE_BASE = 1000;
/**
 * 物件的默认寿命（虚拟帧）。原作由动画资源决定寿命，这里没有资源元数据；
 * 给一个"够长到能飞完、又短到轮询 0x12 的循环必然退出"的值。
 */
const DEFAULT_OBJECT_FRAMES = 96;
/**
 * 单个技能的虚拟帧上限。原作靠引擎逐帧推进，脚本里的等待循环天然有界；
 * 同步模型下少数脚本等不到终止条件，用这个预算截断，避免 200k 指令才报死循环。
 *
 * R192：这是**脚本虚拟帧**预算（1 tick = 1 虚拟帧，见 `project/28`），不是墙钟时长，
 * 所以不随 `TICK_HZ` 缩放 —— 60 Hz 下 1200 帧 = 20 秒的脚本时间，而最长的技（劍輪舞）
 * 也只用 152 帧，余量仍 >7×。
 */
const MAX_SKILL_FRAMES = 1200;
/**
 * 单方小兵上限。原作一方的布阵槽是 200 格（`game/src/core/battle.ts:324`
 * `formationCells()` 一次摆 200 个槽），补兵不能超过它；`0x119` 造兵时超限返回 0
 * （脚本据此判"格没造出来"，与格占用同一条失败路径）。
 */
const MAX_SOLDIERS_PER_SIDE = 200;
/** 网格坐标钳制：脚本里的像素/相对坐标可能落到战场外。 */
const clampX = (x: number): number => Math.max(0, Math.min(70, Number.isFinite(x) ? x : 0));
const clampY = (y: number): number => Math.max(0, Math.min(13, Number.isFinite(y) ? y : 0));
/**
 * 同步模型（`runSkill`）里一次施法最多展开多少条并发实例。
 *
 * 同步模型没有真实帧循环，子实例里的 `WAIT` 只能推虚拟帧，所以按创建顺序跑完即可；
 * 这个上限只防"脚本自己无限挂脚本"的失控（正常技能最多 13 处 `0x312` + 113 处 `0x314`
 * 里的少数几条，远小于它）。
 */
const MAX_SYNC_INSTANCES = 256;
/**
 * 脚本 `0x303 rand(min,max)` 的一抽（原作 `0x420BAA`）。
 *
 * 汇编：先比较 `arg0/arg1` 并交换成 `min/max`，`n = max - min + 1`，
 * `call 0x450117(n)`（= `rand()%n`），最后 `+ min` —— 即
 * `min + rand()%(max-min+1)`。`world.roll` 非空时走原作乱数流 `roll.int(n)`；
 * 否则回落旧 `world.rng()`，没开 roll 的战场序列逐位不变。
 * 非整数参数是旧扩展（原作只有整数），用 `float()` 保持同一分布。
 */
export function scriptRand(world: World, min: number, max: number): number {
    let lo = Math.min(min, max);
    let hi = Math.max(min, max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi))
        return 0;
    const roll = world.roll;
    if (Number.isInteger(lo) && Number.isInteger(hi)) {
        lo = Math.round(lo);
        hi = Math.round(hi);
        return lo + (roll ? roll.int(hi - lo + 1) : Math.floor(world.rng() * (hi - lo + 1)));
    }
    return lo + (roll ? roll.float() : world.rng()) * (hi - lo);
}
/**
 * 脚本结算里的「rate 概率」一次抽：`[0,1)` 均匀。
 *
 * 原作这些点由 C 侧碰撞循环取 `0x450132` 后自己比较；`world.roll` 存在时用
 * `roll.float()`（同一分布），否则保持旧 `world.rng()`。
 */
export function scriptChance(world: World): number {
    const roll = world.roll;
    return roll ? roll.float() : world.rng();
}
class SkillRun implements VmHost, SyscallContext {
    world: World;
    side: Side;
    scriptNum: number;
    fnNum: number;
    program: SoProgram;
    /**
     * 根实例（`MagicN` 本体）的 VM。
     *
     * L0（project/154 §5）：原作的活动 VM 是**一个列表** `0x4A686C`，每条脚本附着在自己的
     * object 上、各有 pc/栈/局部变量，`0x312 / 0x314`（host `0x420C43` / `0x420CAD`）会给
     * 目标 object 再挂一条，于是被调方与调用方**同时**存在、由引擎逐帧轮流推进。
     * 端口原先只有这一个 VM，`0x312/0x314` 走 `invokeByName` 同栈内联 ⇒ 被调方跑完才轮到
     * 调用方，`LockTargetXY` 这种自带 `WAIT` 的辅助脚本就把整条技能串成了"一次性长跑"。
     * 现在一条 `SkillRun` 持有 `instances[]`：根实例 + 0x312/0x314 起的子实例。
     */
    rootVm: ScriptVm;
    /** 本次施法里活着的全部脚本实例，顺序 = 创建顺序（= 原作活动 VM 列表的推进顺序）。 */
    instances: VmInstance[] = [];
    /**
     * 正在推进的实例；undefined = 当前不在任何脚本里（宿主查询/结算代码执行时）。
     * 宿主侧所有"读当前 VM"的地方都经 `get vm()`，于是多实例共享物件/单位/时钟，
     * 而 pc/栈/局部变量/指令计数各归各的。
     */
    current: VmInstance | undefined;
    log: string[] = [];
    opts: SkillRunOptions;
    casterHandle: number;
    targetHandle: number;
    caster: Unit;
    general: GeneralState;
    byUnit = new Map<Unit, number>();
    byHandle = new Map<number, Unit>();
    unitList: Unit[] = [];
    objects = new Map<number, SkillObject>();
    nextObjectHandle = 1;
    nextSummonHandle = 1;
    /**
     * 已经触发过碰撞回调（`obj[+0x98]`）的物件句柄（R163）。
     *
     * 原作物件撞上单位后由回调把自己结束掉（`0x421E1B(obj,0x20)` 一类），端口的
     * `0x26` 未实现，所以用这个集合保证"同一个物件对同一个单位只回调一次"（键
     * `物件句柄:单位句柄`）——飞行体沿途可以撞很多个单位，但撞过的不再重复。
     *
     * 原作的碰撞是**逐帧**查格表（`0x40AA82` 在物件更新之后），所以端口要在
     * "上一帧位置 → 本帧位置"的线段上采样，否则一条 600 帧的横扫只会撞出生点那一格。
     */
    cbFired = new Set<string>();
    /** 每个物件上一帧的像素位置（碰撞采样用；见 `collideCallbacks`）。 */
    cbPrev = new Map<number, { x: number; y: number }>();
    engine = new Int32Array(512);
    clockValue = 0;
    /** 已处理的 syscall 次数，用于给不带 WAIT 的忙等循环推进虚拟帧。 */
    workTicks = 0;
    targetPoint = { x: 0, y: 0 };
    /**
     * 会话开局时的落点（像素），**不随后续 `0x100` 改写而变**。
     *
     * 落点兜底（`resolveFrameHits()`）要用它而不是 `targetPoint`：像落月弓这种
     * 「读了 g3 就丢」的技，脚本会自己 `0x100` 把 `targetPoint` 挪到敌阵上，
     * 再拿 `targetPoint` 兜底就等于"玩家瞄哪儿都没关系、一定打中"，
     * `battle_feedback.test.ts` 的『落月弓打空』就再也测不出来。
     */
    castAim = { x: 0, y: 0 };
    brightnessValue = 16;
    resources: string[] = [];
    sounds: string[] = [];
    /** 送进 audio_bus 的音效条数（不受日志 8 条上限影响）。 */
    soundsEmitted = 0;
    unimplemented = new Set<number>();
    calls: string[] = [];
    healTargets = new Set<number>();
    healed = 0;
    killed = 0;
    frameKilled0 = 0;
    frameHealed0 = 0;
    // ── 逐帧模型（startSkill）的状态 ──────────────────────────────────────
    /** true = WAIT 真挂起（逐帧）；false = 只推虚拟帧（同步 runSkill）。 */
    frameMode = false;
    /** 逐帧：会话内已结算过的单位，保证每个单位只吃一次伤害（总量与同步版一致）。 */
    hitUnits = new Set<Unit>();
    scriptFn: SoFunction | undefined;
    /** 逐帧：已跑完的帧数。 */
    framesRun = 0;
    /** 逐帧：因嵌套调用无法挂起而退化成同步推帧的次数（诊断用）。 */
    nestedWaits = 0;
    /** 逐帧：会话累计命中单位数（stats.hits 用）。 */
    totalHits = 0;
    /**
     * 逐帧：本帧是否是脚本的**最后一帧**（`pumpFrame` 返回 `'done'`）。
     *
     * 只给 `resolveFrameHits()` 的「落点兜底」用：兜底是"脚本没产出可判定物件"时的补救，
     * 它必须等到脚本跑完再判一次，否则会在第 0 帧就凭空打出伤害（`smartscript.session.test.ts`
     * 的三条逐帧断言正是钉这个的：第 0 帧不该有命中/击杀）。
     */
    lastFrameEndedScript = false;
    /** 逐帧：兜底是否已用掉（一个会话最多一次，避免多帧技被重复兜底放大伤害）。 */
    fallbackApplied = false;
    /** 逐帧：已经跑过的帧数（`pumpFrame` 每次 +1，从 1 起）。兜底只允许在第 3 帧及以后。 */
    framesSeen = 0;
    fxPushed = false;
    /** 逐帧：已经登记成投射物的物件句柄 → 事件（一个物件只登记一次）。 */
    flights = new Map<number, ProjectileFlight>();
    /** 逐帧：本会话是否出现过"会飞 + 有碰撞回调"的物件（＝这一击是弹丸打出来的）。 */
    projectileSpawned = false;
    /** R187：兜底里「小兵波及」是否已结算过（见 `applyCollateral()`）。 */
    collateralApplied = false;
    /** 缓存：本技的调用闭包会不会建投射物（见 `scriptSpawnsProjectile`）。 */
    projectileScript: boolean | undefined;
    /** 运行结果（同步 execute 与逐帧会话共用）。 */
    ok = true;
    error = '';
    truncated = '';
    direction: number;
    isHeal: boolean;
    isSummon: boolean;
    /** ATTRIB 含"全體/四周"：全场范围（fx 用 aoe 半径 3.6）。 */
    isWide: boolean;
    /**
     * SYSTEM.SO 的宿主侧函数库（R79）。
     *
     * `callScript` 的顺序是：`audio_bus.callSystemSo`（上一轮那 5 个）→ 这里（25 个）
     * → MAGIC.SO 同名函数。所以 MAGIC.SO 里若有同名函数会被 SYSTEM.SO 抢掉——
     * 原作也是这个优先级（`RunByName` 先查 SYSTEM.SO）。
     */
    syso: SysoHost;
    /** `0x4A6878` 窗口之外的引擎字（`SetString_Old` 的函数指针槽 0x4A71FC 等）。 */
    engineOverflow = new Map<number, number>();
    constructor(world: World, side: Side, scriptNum: number, fnNum: number, tx: number, ty: number, program: SoProgram, opts: SkillRunOptions) {
        this.opts = opts;
        this.world = world;
        this.side = side;
        this.scriptNum = scriptNum;
        this.fnNum = fnNum;
        this.program = program;
        const found = world.units.find((u) => u.isGeneral && u.side === side);
        if (!found)
            throw new Error(`runSkill: ${side} 方没有主将单位`);
        this.caster = found;
        this.general = world.sides[side].general;
        world.units.forEach((u, i) => {
            const h = HANDLE_BASE + i;
            this.byUnit.set(u, h);
            this.byHandle.set(h, u);
            this.unitList.push(u);
        });
        this.casterHandle = this.byUnit.get(this.caster) ?? HANDLE_BASE;
        // 目标：离 (tx,ty) 最近的敌单位
        let best: Unit | undefined;
        let bestD = Infinity;
        for (const u of world.units) {
            if (!u.alive || u.side === side)
                continue;
            const d = (u.x - tx) ** 2 + (u.y - ty) ** 2;
            if (d < bestD) {
                bestD = d;
                best = u;
            }
        }
        this.targetHandle = best ? (this.byUnit.get(best) ?? 0) : 0;
        // 方向：原作由战斗系统按"施法者 vs 目标单位"的位置填 g5（1 = 左，0 = 右）。
        // 有目标单位时以目标为准，否则退回施法点。
        const facingLeft = best ? best.x < this.caster.x : tx < this.caster.x;
        this.direction = facingLeft ? 1 : 0;
        const magic = world.data.magics.find((m) => m.SCRIPT === scriptNum);
        const attrib = magic?.ATTRIB ?? '';
        // ATTRIB 是原作的"范围类型"：全體/四周=全场，中間/兩側=单向，補血=治疗，補兵=召唤
        this.isHeal = /補血|补血/.test(attrib);
        this.isSummon = /補兵|补兵|召喚|召唤/.test(attrib);
        this.isWide = /全體|全体|四周/.test(attrib);
        this.targetPoint = {
            x: best ? best.x * 96 : tx * 96,
            y: best ? best.y * 72 : ty * 72,
        };
        this.castAim.x = this.targetPoint.x;
        this.castAim.y = this.targetPoint.y;
        this.rootVm = this.makeVm();
        // SYSTEM.SO 宿主库：内存族接引擎槽，其余接 Runtime 上已有的物件/镜头/音频方法。
        this.syso = new SysoHost({
            rand: (lo, hi) => this.rand(lo, hi),
            spawnObject: (resource, x, y, z, unit) => this.spawnObject(resource, x, y, z, unit),
            setObjectPx: (handle, x, y, z) => this.setObjectPx(handle, x, y, z),
            setObjectFrames: (handle, frames) => this.setObjectFrames(handle, frames),
            setTargetPx: (x, y) => this.setTargetPx(x, y),
            targetPx: () => this.targetPx(),
            loadResource: (pattern) => this.loadResource(pattern),
            sound: (name, volume, unit) => this.sound(name, volume, unit),
            applyHpDelta: (handle, delta) => this.applyHpDelta(handle, delta),
            global: (index) => this.globalValue(index),
            setGlobal: (index, value) => this.vm.setEngineValue(index, value),
            callScript: (name, args) => {
                this.callScript(name, args);
            },
            text: (speaker, line) => this.trace(`台词[${speaker}] ${line}`),
            allRush: () => allRushSide(this.world, this.side),
            screenFlash: (on) => this.screenFlash(on),
            trace: (line) => this.trace(line),
        }, {
            seed: 0x51c0,
            // `0x4A6878` 是原作的引擎全局数组，对应 `vm.engine`（LDGIDX/STEIDX 读写的就是它）。
            // 基址以下/数组之外的地址（如 0x4A71FC 的 strcpy 指针槽）落在溢出表里。
            store: {
                get: (index) => index >= 0 && index < this.vm.engine.length
                    ? this.vm.engine[index]
                    : (this.engineOverflow.get(index) ?? 0),
                set: (index, value) => {
                    if (index >= 0 && index < this.vm.engine.length)
                        this.vm.engine[index] = value;
                    else
                        this.engineOverflow.set(index, value);
                },
            },
        });
    }
    /**
     * 当前脚本实例的 VM。
     *
     * 宿主侧（`syso` 的引擎槽读写、`callScript`、统计、诊断）一律经这里取 VM，
     * 于是"共享的物件/单位/时钟"留在 `SkillRun` 上、"私有的 pc/栈/局部变量"留在 VM 上。
     * 不在任何脚本里时退回根 VM（构造期、`cast()` 结算期都是这个状态）。
     *
     * 公开是为了满足 `SyscallContext.vm`（`dispatchSyscall` 里 `0x46 FINDVM` 等要看当前 VM）。
     */
    get vm(): ScriptVm {
        return this.current ? this.current.vm : this.rootVm;
    }
    /**
     * 新建一个 VM 并写好本次施法要用的引擎全局。
     *
     * 原作 `0x43BA59` 在 `RunById` 之前把 G2/G3/G4/G5 写进引擎全局数组 `0x4A6878`，
     * 而且是**全场唯一一次**（`project/154 §1.2`：全 EXE 只有这一个写入者）；活动 VM
     * 列表里所有脚本读写的都是**同一块**数组（`LDG`/`STE`/`LDGIDX`/`STEIDX` 直接索引它）。
     *
     * 所以根 VM 在这里写 4 个槽；`0x312/0x314` 起的子实例**共享同一个数组对象**
     * （`vm.engine = base.engine`，不是 `set()` 拷贝——拷贝会让子脚本的 `STE` 与父脚本的
     * `LDG` 各看各的，而原作的 `0x4A6878` 只有一份）。同时子实例**不再**调
     * `setEngineValue` 重写 G2..G5：那会让"每次施法 g4 只写一次"这条守卫
     * （`tests/guard_r43_r51.test.ts:129`）多记一次写，也不是原作行为。
     */
    makeVm(base?: ScriptVm): ScriptVm {
        const vm = new ScriptVm(this.program, this, {
            budget: this.opts.budget,
            // 子实例借用父实例的引擎数组对象（原作 0x4A6878 全场一份，`STE`/`LDG` 同下标同一格）
            ...(base ? { engine: base.engine } : {}),
        });
        if (this.opts.trace)
            vm.trace = this.opts.trace;
        if (this.opts.onInstruction)
            vm.onInstruction = this.opts.onInstruction;
        if (base)
            return vm;
        vm.setEngineValue(2, this.casterHandle);
        // R163：g3 是**对面主将**的句柄（原作 `0x43BA59`@0x43BA9D：`G3 = 0x421AD2(loc2)`，
        // `loc2 = 对面 sideStruct[+0x44]` = 对面主将）。端口原来写"离落点最近的敌单位"，
        // 落点附近有小兵时 G3 会变成小兵句柄 —— `DemonDancing` 的格门
        // （`magic_so.dis.txt:1511C`：`LDSL loc2; LDG 3; EQ`，loc2 = `0x113` 取的该格主将）
        // 因此永远不相等，主段跑不到，神鬼亂舞只剩 else 段的 2 个物件。
        // 落点本身（`targetPoint`/`castAim`）仍是"最近的敌人"，与 G3 分开保存。
        vm.setEngineValue(3, this.generalOf(this.targetHandle) || this.targetHandle);
        vm.setEngineValue(4, this.valueFor());
        // R163：g5 是**阵营**（0 = A 方 / 1 = B 方），不是朝向、也不是被治疗单位句柄。
        // 原作唯一写入点 `0x43BA59`@`0x43BAA2-0x43BAB7`：
        //   `cmp [ebp+8],0x4a8a60 / jne +; mov [0x4a688c],0`（A 方）`: mov [0x4a688c],1`（B 方）。
        // `0x4a8a60` 是 A 方 sideStruct（`0x43B9E2` 在 A/B 两个 sideStruct 之间互取）。
        // 由此 MAGIC.SO 里 `LDG 5; PUSHI 1; EQ` 这类判断全是"我在右边吗"：
        // 例 `DemonDancing`@0x14EB8 用它决定探格方向 `(x/96)+1` 还是 `(x/96)-1`，
        // 并在 `0x14FB0` 用它选朝向字节 loc7 = 0/128。
        // 端口把 A 方固定放在左（`side === 'A'`），朝右 ⇒ g5 = 0；B 方 = 1。
        // 旧实现 `isHeal ? casterHandle : direction` 让治疗技读到的是句柄（几十），
        // 攻击技读到的是"目标在左吗"（同值域，所以此前没暴露）。
        vm.setEngineValue(5, this.side === 'A' ? 0 : 1);
        return vm;
    }
    /**
     * 新建一条并发脚本实例（`0x312` / `0x314` 的落点）。
     *
     * 实参按 `fn.argc` 补零——与 `vm.callInline()` 同口径：原作 `0x4653F0` 从名字之上那槽
     * 起只搬 `fn->argc` 个，块里多出来的是调用点补位的 0（`project/154 §1.5` #3）。
     * `base` 是父实例的 VM：子实例继承它的引擎全局（见 `makeVm()`）。
     */
    spawnInstance(fn: SoFunction, args: Slot[], vm: ScriptVm, hitDamage?: number): VmInstance {
        const filled: Slot[] = [];
        for (let i = 0; i < fn.argc; i++)
            filled.push(args[i] ?? { value: 0, type: 0 });
        const inst = {
            vm,
            fn,
            args: filled,
            done: false,
            pending: 0,
            started: false,
            hitDamage,
        };
        this.instances.push(inst);
        return inst;
    }
    /** 推进一步某条实例：没跑过的用 `pump`，挂起过的用 `resume`。 */
    pumpInstance(inst: VmInstance): 'wait' | 'done' {
        const prev = this.current;
        this.current = inst;
        try {
            const r = inst.started ? inst.vm.resume() : inst.vm.pump(inst.fn, inst.args);
            inst.started = true;
            if (r.state === 'done') {
                inst.done = true;
                inst.pending = 0;
            }
            return r.state;
        }
        finally {
            this.current = prev;
        }
    }
    /** 所有实例都跑完了吗（会话据此判定"技能结束"）。 */
    allInstancesDone(): boolean {
        for (const inst of this.instances)
            if (!inst.done)
                return false;
        return true;
    }
    /**
     * 会话每 tick 调一次：把各实例的 WAIT 计数递减。
     *
     * `SkillSession.pendingFrames` 恒等于"最小待唤醒帧数"，两边同步递减，
     * 于是单实例时的节奏与旧的 `vm.suspendedFrames` 逐 tick 完全一致。
     */
    tickInstanceWaits(): void {
        for (const inst of this.instances) {
            if (!inst.done && inst.pending > 0)
                inst.pending -= 1;
        }
    }
    /** 全部实例累计执行的指令数（单实例时与旧的 `vm.steps` 相同）。 */
    totalSteps(): number {
        let n = 0;
        for (const inst of this.instances)
            n += inst.vm.steps;
        return n;
    }
    /** 全部实例累计的 syscall 次数。 */
    totalSyscalls(): number {
        let n = 0;
        for (const inst of this.instances)
            n += inst.vm.syscallCount;
        return n;
    }
    /** 脚本实例数：根实例 + `0x312 / 0x314` 起的子实例。 */
    get instanceCount(): number {
        return this.instances.length;
    }
    /**
     * 各实例的快照（诊断/测试用）。
     *
     * 原作的 object 可以各自挂脚本（`0x312 / 0x314` 延迟调用），我们这里把每条实例的
     * 函数名 / 是否结束 / 剩余等待帧 / 已执行指令数 / 当前 pc 暴露出来，测试才能直接断言
     * "两条脚本在同一 tick 各自推进"（见 `tests/script_instances.test.ts`）。
     */
    instanceStates(): InstanceSnapshot[] {
        return this.instances.map((inst) => ({
            fn: inst.fn.name,
            done: inst.done,
            pending: inst.pending,
            steps: inst.vm.steps,
            pc: inst.vm.pc,
            started: inst.started,
        }));
    }
    /** `LDG n`：脚本全局槽（`SysoHost` 的 `global` 端口）。 */
    globalValue(index: number): number {
        const slot = this.vm.globals[index];
        const v = slot?.value;
        return typeof v === 'number' ? v : 0;
    }
    /** g4：原作由 MagicDef 的威力/治疗量填入。 */
    valueFor(): number {
        const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
        const atk = m?.ATTACK ?? 20;
        if (this.isHeal)
            return Math.max(1, 20 + atk);
        return Math.max(1, atk);
    }
    execute(): RunSkillResult {
        const fn = this.scriptFunction();
        if (!fn) {
            this.ok = false;
            this.error = this.missingScript();
        }
        else {
            try {
                // 同步模型：根实例 + 它经 `0x312/0x314` 起的子实例都在同一个 JS 调用里跑完
                // （同步模型没有帧循环，子实例的 WAIT 只推虚拟帧、不挂起）。
                this.pumpInstance(this.spawnInstance(fn, [], this.rootVm));
                this.drainInstancesSync();
            }
            catch (err) {
                this.recordError(err);
            }
        }
        let hits: HitPoint[] = [];
        if (this.ok) {
            hits = this.resolveHits();
            // R163：物件碰撞回调（`obj[+0x98]`）在几何判定**之后**跑：回调自己的 `Hurt`
            // 走 `0x125` 结算伤害，所以这里不能把它们再喂给 `applyHits`（会打两遍）。
            const cbHits = this.collideCallbacks();
            // 兜底：脚本没有产出可判定的特效物件（例如纯"直接改单位字段"的攻击技），
            // 就按目标格做一次小范围判定，避免技能完全没有效果。
            // 有回调命中的就不兜底了 —— 那已经说明这个技打到了人。
            if (hits.length === 0 && cbHits.length === 0 && !this.isHeal && !this.isSummon) {
                hits.push({ x: this.targetPoint.x / 96, y: this.targetPoint.y / 72, r: 1.4 });
            }
            this.applyHits(hits);
            hits = hits.concat(cbHits);
            this.totalHits = hits.length;
        }
        const fx = this.ok ? this.pushFx(hits) : 0;
        const stats = this.statsOf(hits.length);
        this.writeLog(stats, fx);
        return { ok: this.ok, log: this.log, stats, objects: this.objectSummaries() };
    }
    // ── 逐帧模型（由 SkillSession 驱动） ───────────────────────────────────
    /**
     * R137：跑 SYSTEM.SO 里的一个**具名战斗级脚本函数**（目前只有 `AllRush`）。
     *
     * 与 `execute()`（MAGIC.SO 技能）的区别：SYSTEM.SO 的战斗级函数不产法术物件、
     * 不结算命中，只发命令/音效/台词/镜头，所以这里不跑 `resolveHits`/`applyHits`/`pushFx`。
     * 走的是**真字节码**（`extract/pak/SCRIPT/SYSTEM.SO` 解析出来的 `SoProgram`），宿主通道
     * 与技能通道共用同一个 `dispatchSyscall` 实例 ⇒ `0x120` → `ctx.allRush()` → `battle.allRush()`。
     */
    executeSystemScript(name: string): SystemSoScriptResult {
        const fn = this.program.functionByName(name);
        if (!fn) {
            this.ok = false;
            this.error = `SYSTEM.SO 里没有函数 ${name}`;
        }
        else {
            try {
                this.vm.invoke(fn, []);
            }
            catch (err) {
                this.recordError(err);
            }
        }
        this.log.push(`SYSTEM.SO ${name}：指令 ${this.vm.steps} / syscall ${this.vm.syscallCount} / 虚拟帧 ${this.clockValue}`);
        if (this.calls.length)
            this.log.push(`调用 ${this.calls.join(' ')}`);
        if (this.unimplemented.size) {
            const ids = [...this.unimplemented]
                .sort((a, b) => a - b)
                .map((x) => `0x${x.toString(16)}`);
            this.log.push(`未实现 syscall：${ids.join(' ')}`);
        }
        if (!this.ok)
            this.log.push(`失败：${this.error}`);
        return {
            ok: this.ok,
            ran: Boolean(fn),
            log: this.log,
            instructions: this.vm.steps,
            syscalls: this.vm.syscallCount,
        };
    }
    /**
     * 同步模型：把 `0x312/0x314` 起的子实例按创建顺序跑完。
     *
     * 子实例里再起实例会追加到 `instances` 尾部，循环自然取到它 ⇒ 广度优先生成，
     * 与原作"活动 VM 列表 `0x4A686C` 按注册顺序轮流推进"同序。
     * 上限只防"脚本自己无限挂脚本"的失控，正常技能远到不了。
     */
    drainInstancesSync(): void {
        for (let i = 0; i < this.instances.length && i < MAX_SYNC_INSTANCES; i++) {
            const inst = this.instances[i];
            if (!inst || inst.done)
                continue;
            this.pumpInstance(inst);
        }
    }
    /** 切到逐帧模型并解析脚本函数；找不到时记失败并返回 false。 */
    beginFrames(): boolean {
        this.frameMode = true;
        const fn = this.scriptFunction();
        if (!fn) {
            this.ok = false;
            this.error = this.missingScript();
            return false;
        }
        this.scriptFn = fn;
        return true;
    }
    /**
     * 跑一帧：每条到期实例各推进一步，全部跑完才返回 `'done'`。
     *
     * L0（`project/154 §5`）：原作的活动 VM 是列表，`0x312/0x314` 起的脚本与调用方
     * **同时**存在，引擎每帧按注册顺序给每条 VM 一步。这里同构：
     *   - 首帧只 `pump` 根实例（`MagicN`）；
     *   - 之后每 tick 按创建顺序，把 `pending === 0`（不等 WAIT）的实例各推进一步；
     *   - 本 tick 里新起的实例从**下一** tick 开始跑，避免同一帧里无限展开；
     *   - 任一条抛错 ⇒ 整场按旧语义收尾（旧版单实例就是"抛错即 done"）。
     */
    pumpFrame(first: boolean): 'wait' | 'done' {
        const fn = this.scriptFn;
        if (!fn)
            return 'done';
        // 已跑过几帧（含本帧）。`resolveFrameHits()` 的落点兜底靠它区分"第 0 帧"与"之后"。
        this.framesSeen += 1;
        // 基线必须在 pump **之前**取：脚本自己的 syscall（0x118/0x125 治疗/伤害）
        // 会在 pump 期间就改 hp，settleFrame 里再取就漏计了。
        this.frameKilled0 = this.killed;
        this.frameHealed0 = this.healed;
        try {
            if (first) {
                this.pumpInstance(this.spawnInstance(fn, [], this.rootVm));
            }
            else {
                // 快照长度：本 tick 新起的实例排在本轮之后，下一 tick 才跑。
                const ready = this.instances.length;
                for (let i = 0; i < ready; i++) {
                    const inst = this.instances[i];
                    if (!inst || inst.done || inst.pending > 0)
                        continue;
                    this.pumpInstance(inst);
                }
            }
        }
        catch (err) {
            this.recordError(err);
            for (const inst of this.instances)
                inst.done = true;
            this.lastFrameEndedScript = true;
            return 'done';
        }
        // 记下"这一帧脚本是否已经跑完"，供 `resolveFrameHits()` 的落点兜底判断时机。
        // 单实例时与旧的 `r.state === 'done'` 逐帧等价（1272 条基线就是靠这条不动）。
        this.lastFrameEndedScript = this.allInstancesDone();
        return this.lastFrameEndedScript ? 'done' : 'wait';
    }
    /**
     * 结算当前帧：按物件**此刻**的位置判定命中并扣血，产出本帧统计。
     *
     * 与同步版 resolveHits 的区别是"逐帧采样"而不是"整段求并集"：移动物件
     * 这一帧扫过的线段（上一帧位置 → 当前位置）才是它这一刻能打到的地方，
     * 所以火墙/多段位移技能会表现为"伤害分摊到各帧"。命中集用 `hitUnits`
     * 去重，保证帧数只改变节奏、不改变一个技能的总量。
     */
    settleFrame(): FrameStat {
        const killed0 = this.frameKilled0;
        const healed0 = this.frameHealed0;
        // R187：本帧新出现的弹丸先登记成事件（要赶在命中判定之前 —— 兜底靠它决定该不该让位）。
        if (this.ok)
            this.emitProjectileFlights();
        const hits = this.ok ? this.resolveFrameHits() : [];
        // R187：兜底被弹丸让位时，**只把「主将那一下」延后**；原来同一次兜底对小兵的
        // 波及（`applyHits` 里按 ATTACK 赔率掷骰的那部分）仍在原来的时机结算，
        // 免得"弹丸飞出去"顺带改掉小兵减员（保真网 battle.cast.strike 就盯这条）。
        if (this.ok && this.deferFallbackForProjectile() && this.framesSeen >= 3)
            this.applyCollateral();
        if (hits.length && this.ok)
            this.applyHits(hits);
        // R163：物件碰撞回调。逐帧模型里它应该在物件更新之后、单位结算之前跑；
        // 这里放在同一帧末（物件位置已是本帧更新后的），命中数与伤害都记进本帧。
        const cbHits = this.ok ? this.collideCallbacks() : [];
        const frameHits = hits.concat(cbHits);
        this.totalHits += frameHits.length;
        const stat = {
            frame: this.framesRun++,
            instructions: this.totalSteps(),
            syscalls: this.totalSyscalls(),
            hits: frameHits.length,
            killed: this.killed - killed0,
            healed: this.healed - healed0,
        };
        // R187：物件在这帧消失（回调结算/到期）就把飞行事件封口。
        this.closeProjectileFlights();
        // 特效只在第 0 帧末产出：cast() 是同步返回的，返回时 world.fx 里必须
        // 已经有本次法术（ttl/life 也要当场可读），后续帧只累计伤害不再刷屏。
        if (stat.frame === 0 && this.ok && !this.fxPushed)
            this.fxPushed = this.pushFx(frameHits) > 0;
        return stat;
    }
    /** 会话结束：0 命中时补目标点兜底，然后写日志。 */
    finishFrames(): void {
        if (this.ok && this.totalHits === 0 && !this.isHeal && !this.isSummon) {
            // R187：有弹道的技常常"脚本先收尾、弹丸还在路上"（落月弓的弹丸寿命 16 帧，
            // 脚本 WAIT 60 已经过去）。这一击不能丢，也不能退回打"落点"——原作是撞主将，
            // 所以先用 R183 的 g3 兜底点结一次，实在没有存活主将才退回落点。
            if (!this.fallbackApplied) {
                const point = this.fallbackPoint();
                if (point) {
                    this.fallbackApplied = true;
                    this.applyHits([point]);
                }
            }
            if (this.totalHits === 0)
                this.applyHits([{ x: this.targetPoint.x / 96, y: this.targetPoint.y / 72, r: 1.4 }]);
            this.totalHits = Math.max(1, this.totalHits);
        }
        else if (this.ok && !this.isHeal && !this.isSummon && !this.fallbackApplied && this.projectileSpawned) {
            // R187：弹丸已经飞出去了、脚本却在弹丸到场之前收尾（連弩 5 支箭都在 f7 出生、
            // 会话来 f11 就结束）。这一击原作是"箭撞主将"，不能在会话结束时被吞掉：
            // 对象仍是引擎解析出的 g3，伤害仍按 ATTACK 走同一公式；这里走
            // `applyProjectileArrival()` 是为了绕开 `hitUnits` 去重（箭先撞上时主将已在集合里，
            // 见该方法注释）。
            if (this.applyProjectileArrival())
                this.fallbackApplied = true;
        }
        this.closeProjectileFlights();
        this.writeLog(this.statsOf(this.totalHits), this.fxPushed ? 1 : 0);
    }
    /** 逐帧：虚拟时间前进 1 帧（会话每 tick 调一次）。 */
    advanceClock(): void {
        this.tickClock(1);
    }
    get runOk(): boolean {
        return this.ok;
    }
    /**
     * 逐帧：还要等几帧才能再推进一步 = 所有未完成实例里**最小**的待唤醒帧数。
     *
     * 单实例时它与旧的 `vm.suspendedFrames` 完全一致（`SkillSession` 的逐 tick
     * 语义、`r87_waitfor.test.ts` 对 `pendingFrames` 的断言都靠这条不变）。
     */
    get suspendedFrames(): number {
        let min = -1;
        for (const inst of this.instances) {
            if (inst.done)
                continue;
            if (min < 0 || inst.pending < min)
                min = inst.pending;
        }
        return min < 0 ? 0 : min;
    }
    get runError(): string {
        return this.error || this.truncated;
    }
    get runTruncated(): boolean {
        return this.truncated !== '';
    }
    get hasFx(): boolean {
        return this.fxPushed;
    }
    /** 補血類技能（原作是瞬發效果，动画只是表现）——cast 里会把它一次跑完。 */
    get isHealSkill(): boolean {
        return this.isHeal;
    }
    summary(): RunSummary {
        return { ok: this.ok, log: this.log, stats: this.statsOf(this.totalHits), objects: this.objectSummaries() };
    }
    scriptFunction(): SoFunction | undefined {
        // 按名字找：MAGIC.SO 里除了 MagicN 桩之外还有一堆自带 id 的函数（F9999 之类），
        // 按 num 查会撞到无关函数，所以只用名字；找不到就是真的没有这个脚本。
        return this.program.functionByName(`Magic${this.scriptNum - 500}`);
    }
    missingScript(): string {
        return `找不到脚本函数 Magic${this.scriptNum - 500}（num=0x${this.fnNum.toString(16)}）`;
    }
    recordError(err: unknown): void {
        const msg = err instanceof Error ? err.message : String(err);
        // 帧预算截断不是脚本错误：已经创建的特效/物件仍然有效，按"已完成的部分"结算。
        if (msg.includes(`虚拟帧超过 ${MAX_SKILL_FRAMES}`))
            this.truncated = msg;
        else {
            this.ok = false;
            this.error = msg;
        }
    }
    statsOf(hits: number): RunStats {
        return {
            script: this.scriptNum,
            fn: this.scriptFunction()?.name ?? '(missing)',
            instructions: this.totalSteps(),
            syscalls: this.totalSyscalls(),
            objects: this.objects.size,
            hits,
            killed: this.killed,
            healed: this.healed,
            // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7a）。
      unimplemented: Array.from(this.unimplemented).sort((a, b) => a - b),
        };
    }
    writeLog(stats: RunStats, fx: number): void {
        this.log.push(`script ${this.scriptNum} → ${stats.fn}（${this.scriptNum - 500} 号）`);
        this.log.push(`指令 ${stats.instructions} 条 / syscall ${stats.syscalls} 次 / 虚拟帧 ${this.clockValue}`);
        if (this.resources.length)
            this.log.push(`资源 ${this.resources.join(' ')}`);
        if (this.sounds.length)
            this.log.push(`音效 ${this.sounds.join(' ')}`);
        if (this.soundsEmitted)
            this.log.push(`音效事件 ${this.soundsEmitted} 条 → audio_bus`);
        if (this.calls.length)
            this.log.push(`调用 ${this.calls.join(' ')}`);
        // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7b）。
        if (this.healTargets.size) this.log.push(`治疗目标 ${Array.from(this.healTargets).join(',')}`);
        this.log.push(`物件 ${stats.objects} 个 / 命中 ${stats.hits} / 击杀 ${stats.killed} / 治疗 ${stats.healed}`);
        if (fx)
            this.log.push(`fx ${fx} 个`);
        if (this.truncated)
            this.log.push(`截断：${this.truncated}`);
        if (!this.ok)
            this.log.push(`失败：${this.error}`);
        if (this.unimplemented.size)
            this.log.push(`未实现 syscall：${stats.unimplemented.map((x) => `0x${x.toString(16)}`).join(' ')}`);
    }
    objectSummaries(): ObjectInfo[] {
        // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7c）。
    return Array.from(this.objects.values())
            .slice(0, 24)
            .map((o) => ({ resource: o.resource, x: o.x / 96, y: o.y / 72, angle: o.angle, dead: o.dead }));
    }
    // ── VmHost ────────────────────────────────────────────────────────────
    get clock(): number {
        return this.clockValue;
    }
    syscall(id: number, args: Slot[]): Slot | undefined {
        // 原作的时间由引擎逐帧推进，与脚本是否 WAIT 无关；有些脚本用不带 WAIT 的忙等循环
        // 轮询 0x12（物件是否播完），只靠 wait() 推进虚拟帧会让它们永远等不到。这里按 syscall
        // 次数补一个"工作推进"的虚拟帧，让这类循环也有界（数值选得足够慢，不影响动画节奏）。
        // 逐帧模式下时间由 tick 驱动（每 tick 恰好 1 帧），这个补偿会把时钟推快、
        // 让 606 这类长技能提前撞上 MAX_SKILL_FRAMES，所以只在同步模型里补。
        this.workTicks++;
        if (!this.frameMode && this.workTicks % 32 === 0)
            this.tickClock(1);
        return dispatchSyscall(this, id, args);
    }
    /**
     * `WAIT n`。两种模型：
     *   - 同步（runSkill）：只把虚拟时钟推 n 帧，脚本继续在同一个 JS 调用里跑完；
     *   - 逐帧（startSkill）：把 n 交给 session，`requestWait()` 挂起 VM，
     *     session 每 tick 减 1，减到 0 才 `resume()`——这才是原作的协程语义。
     * 无论哪种模型，WAIT 边界都重置"本帧指令预算"（原作时间是逐帧推进的）。
     */
    wait(frames: number): void {
        const n = Math.max(0, Math.min(600, frames | 0));
        // 纯表现子脚本（`StepShow`，见 vm.ts `TIMELESS_SUBSCRIPTS`）在原作里是**并行实例**，
        // 只播动画、不产出战斗效果；端口没有逐帧贴图，它的 WAIT 纯属空转。
        // 補兵族每造一个兵就 `CALLS StepShow`（20 + 16×10 = 180 帧），
        // 45 个兵 = 8100 帧，会撞 MAX_SKILL_FRAMES 把脚本截断（实测 `伏兵軍陣` 只出 7 个兵）。
        // 这里把这类子脚本的每段 WAIT 压成 1 帧：保留"跨过一帧"的同步点，又不把动画时长
        // 算进施法者的时间线。普通 CALLS/CALL 一律不动，其它技的时序与原端口逐帧一致。
        if (this.vm.inCallsFrame) {
            this.nestedWaits++;
            this.tickClock(Math.min(n, 1));
            this.vm.beginFrame();
            return;
        }
        if (!this.frameMode) {
            this.tickClock(n);
            this.vm.beginFrame();
            return;
        }
        // WAIT 0 不挂起：同帧继续（否则 0 帧等待会变成"每 tick 只跑一条"的抖动）。
        if (n === 0)
            return;
        // 嵌套脚本（syscall 0x310–0x314 里的 invokeByName）没法跨帧挂起：展开会丢掉
        // 宿主那一层的返回路径。这种少数情况退化成同步推帧，行为与旧版一致。
        if (this.vm.callDepthNow > 1) {
            this.nestedWaits++;
            this.tickClock(n);
            this.vm.beginFrame();
            return;
        }
        // WAIT 的计数记在**实例**上：同一场里多条脚本各等自己的帧数
        // （原作每条 VM 有自己的等待计数，`0x467F10` 每帧只推进到期的那些）。
        if (this.current)
            this.current.pending = n;
        this.vm.requestWait(n); // 抛出挂起哨兵，栈/帧/pc 原样保留
    }
    tickClock(n: number): void {
        this.clockValue += n;
        // 原作由引擎逐帧推进动画，脚本里的 "while (物件还在) WAIT 1" 每帧只前进 1 帧、不会无限跑。
        // 同步模型没有真实的帧循环，某些脚本（例如 LockCamera 等待"越过目标点 + 物件结束"）在
        // 我们的近似下等不到终止条件，于是用一个虚拟帧预算把它截断，保留已经产生的效果。
        if (this.clockValue > MAX_SKILL_FRAMES) {
            throw new Error(`SmartScript: 技能虚拟帧超过 ${MAX_SKILL_FRAMES}（pc=0x${this.vm.pc.toString(16)}），同步模型下等待条件不会满足，脚本被截断`);
        }
    }
    /**
     * `WAITFOR name`：等同名脚本结束（docs/04-脚本引擎SmartScript.md:370）。
     *
     * 原作是"装回调 + 引擎每帧轮询"：`0x4658A0` 把名字交给 `0x464D70(0x465820,name,2)`，
     * `0x465820` 在活动 VM 列表 `0x4A686C` 里按"当前函数名"查找，找到就继续挂起、
     * 找不到才恢复；而 `0x467E70`（检查回调的那个函数）只在 `0x467F10` 的**每帧入口**
     * 被调一次 ⇒ 一次 WAITFOR 至少跨过一帧，即使同名脚本早就结束。
     *
     * 我们的 CALLS 是同栈内联执行（vm.ts `case 0x47` 的 callInline），被调脚本在
     * WAITFOR 之前就已经跑完，不存在"还挂在活动列表里的子 VM"，所以这里把原作语义
     * 等价成**让出一帧的同步点**：挂起 1 帧、下一帧再继续。
     *
     * 不能像旧版那样直接跳过：制作组把 WAITFOR 当帧循环的节流器用
     * （旋龍 554 的 `L12DEC → 0x130D8 → WAITFOR "WaitTarget" → JMP L12DEC` 整圈没有
     * 别的 WAIT），跳过会让整圈在同一帧里空转到 20 万条指令预算、被当成死循环截断。
     */
    waitFor(name: string): void {
        this.calls.push(`waitfor:${name}`);
        if (!this.frameMode) {
            // 同步模型：没有真实帧循环，把虚拟时钟推 1 帧（与原作"每帧轮询"同粒度）。
            this.tickClock(1);
            this.vm.beginFrame();
            return;
        }
        if (this.vm.callDepthNow > 1) {
            // 嵌套 invoke（syscall 0x310–0x314）跨不了帧，退化成同步推一帧（同 wait()）。
            this.nestedWaits++;
            this.tickClock(1);
            this.vm.beginFrame();
            return;
        }
        if (this.current)
            this.current.pending = 1;
        this.vm.requestWait(1);
    }
    // ── SyscallContext ────────────────────────────────────────────────────
    /** 句柄空间是共享的：单位（>=1000）与物件（1..）用同一个 `坐标/存在性` 查询。 */
    posOf(handle: number): { x: number; y: number; z: number } | undefined {
        const u = this.byHandle.get(handle);
        if (u)
            return { x: u.x * 96, y: u.y * 72, z: 0 };
        const o = this.objects.get(handle);
        if (!o)
            return undefined;
        // 物件位置按 0x15 设置的方向/速度随虚拟帧推进：原作的碰撞与动画都由引擎逐帧驱动，
        // 同步模型没有逐帧循环，只能在查询坐标时按已流逝的帧数外推（否则"飞到目标点"的循环永不满足）。
        if (o.angle >= 0 && o.speed !== 0) {
            const dt = Math.max(0, this.clockValue - o.born);
            return { x: o.x + o.vx * o.speed * dt, y: o.y + o.vy * o.speed * dt, z: o.z };
        }
        return { x: o.x, y: o.y, z: o.z };
    }
    unitOf(handle: number): { x: number; y: number; z: number; side: number; alive: boolean } | undefined {
        const p = this.posOf(handle);
        if (!p)
            return undefined;
        return { ...p, side: this.unitSide(handle), alive: this.unitAlive(handle) };
    }
    isUnit(handle: number): boolean {
        return this.byHandle.has(handle);
    }
    handleOfObject(handle: number): number {
        return this.objects.has(handle) ? handle : 0;
    }
    /**
     * `0x129` / `0x10D`：阵营/方向 → 该方主将句柄。
     *
     * 证据（magic_so.dis.txt，55 个调用点全是同一形状）：
     * `LDG 5; PUSHI 1; XOR; SYSCALL 0x129|0x10D argc=1` ⇒ 实参是 `g5 ^ 1`，
     * 即"对面那一侧"，不是句柄（旧实现把它当句柄 ⇒ 一律返回 0，
     * 旋龍 554 因此把 dummy 生成在 (0,0)、整技能 0 命中）。
     * `g5` 是**阵营**（R163 定案：`0x43BA59`@`0x43BAA2-0x43BAB7` 写 0=A / 1=B），
     * 所以 `g5 ^ 1` 就是"对面阵营"，这里是**绝对**映射：0 → A 方、1 → B 方。
     * （旧实现按 `this.direction` 相对判断，只在 g5 被误当方向/句柄时才自洽；g5 改成阵营后
     *  相对映射会在"施法方朝左"时把本方判成对面。）
     * 若实参本身就是合法句柄（`0x117`/`0x118` 的调用点会传句柄），原样返回。
     */
    sideUnitHandle(camp: number): number {
        if (this.byHandle.has(camp) || this.objects.has(camp))
            return camp;
        const c = Math.abs(camp | 0) & 1;
        const side = c === 0 ? 'A' : 'B';
        const unit = this.unitList.find((u) => u.side === side && u.isGeneral) ?? this.unitList.find((u) => u.side === side);
        return unit ? (this.byUnit.get(unit) ?? 0) : 0;
    }
    unitSide(handle: number): number {
        const u = this.byHandle.get(handle);
        if (u)
            return u.side === 'A' ? 1 : 2;
        const o = this.objects.get(handle);
        if (o) {
            const owner = this.byHandle.get(o.unit);
            if (owner)
                return owner.side === 'A' ? 1 : 2;
            return this.side === 'A' ? 1 : 2;
        }
        return 0;
    }
    unitAlive(handle: number): boolean {
        const u = this.byHandle.get(handle);
        if (u)
            return u.alive;
        const o = this.objects.get(handle);
        if (o)
            return !o.dead && this.clockValue < o.expiresAt;
        return false;
    }
    /**
     * `0x10C`：该方当前兵数（camp 0=A / 1=B，**绝对**阵营，与 `0x10D`/`0x113`/`0x119` 同源）。
     *
     * 原作 handler `0x4204FE` 只是 `push [ebp+8]; call 0x43A795`，`0x43A795` 按参数是不是 0
     * 返回 `[0x4A8ABC]` / `[0x4B03FC]` —— 也就是 A/B sideStruct 的 `+0x5C` 计数槽
     * （`0x4449BE` 的 `cmp dword ptr [0x4A8ABC],0x0 / jg` 是"该方还有兵吗"）。
     * `MoreSoldier`/`BackSoldier` 用它算补兵量 `min(0x116*5 - 0x10C, arg2)`，
     * 所以这里必须是"该方现有小兵数"（不含主将），旧端口拿 0/1 当句柄查恒得 0。
     */
    aliveCount(camp: number): number {
        const c = Math.abs(camp | 0) & 1;
        const side = c === 0 ? 'A' : 'B';
        let n = 0;
        for (const u of this.unitList)
            if (u.alive && u.side === side && !u.isGeneral)
                n++;
        return n;
    }
    unitPx(handle: number): { x: number; y: number; z: number } {
        return this.posOf(handle) ?? { x: 0, y: 0, z: 0 };
    }
    setTargetPx(x: number, y: number): void {
        this.targetPoint = { x, y };
    }
    targetPx(): { x: number; y: number } {
        return this.targetPoint;
    }
    globalGet(index: number): number {
        const slot = this.vm.getGlobal(index | 0);
        return Math.trunc(Number(slot.value) || 0) | 0;
    }
    /** R163：当前脚本实例派发时冻结的 g16（本击伤害量）。 */
    instanceHitDamage(): number {
        return this.current?.hitDamage ?? 0;
    }
    /**
     * R163：单位句柄 → **其所在一方的主将句柄**（原作 `unit[+0x44]`）。
     *
     * 依据：`0x40AA82`@0x40AB65 的碰撞回调取 `locc = hitUnit[+0x44]` 后再 `0x421AD2`
     * 转句柄；`DemonDancing` 把 `0x113` 的返回值直接与 `g3`（对面主将句柄）比较。
     * 端口的小兵与主将没有父子指针，只能按 side 反查 `isGeneral`。解析不出返回 0。
     */
    generalOf(handle: number): number {
        const unit = this.byHandle.get(handle);
        if (!unit)
            return 0;
        if (unit.isGeneral)
            return handle;
        const general = this.unitList.find((u) => u.side === unit.side && u.isGeneral === true);
        return general !== undefined ? (this.byUnit.get(general) ?? 0) : 0;
    }
    unitAtPx(x: number, y: number): number {
        let best = 0;
        let bestD = 48 * 48 + 36 * 36;
        for (const u of this.unitList) {
            if (!u.alive)
                continue;
            const dx = u.x * 96 - x;
            const dy = u.y * 72 - y;
            const d = dx * dx + dy * dy;
            if (d <= bestD) {
                bestD = d;
                best = this.byUnit.get(u) ?? 0;
            }
        }
        return best;
    }
    /**
     * `0x12A` / `0x12B` 的宿主（R163）：tile 矩形 [x0..x1] × [y0..y1] 内该阵营单位的句柄表。
     *
     * `camp` 是脚本口径的阵营/方向值 —— 原作 `0x43EEA9` 里 `0x43B9CB(camp)` 把它换成阵营
     * 结构，映射规则与 `0x10D`/`0x129`（`sideUnitHandle`）、`0x119`（`spawnSoldier`）同源：
     * 传 `g5`（= 本方阵营）得本方、传 `g5 ^ 1` 得对面（15 处调用点全是 `g5 ^ 1`）。
     * 返回按 (y, x, handle) 排序，保证同输入同输出（脚本拿返回值当数组下标：`0x12B(...,i)`）。
     */
    unitsInRect(camp: number, x0: number, y0: number, x1: number, y1: number): number[] {
        // 阵营 → 侧：原作 `0x43EEA9`/`0x43EEE8` 都先把 camp 喂给 `0x43B9CB`，后者是
        // `cmp [ebp+8],0 ; je → 0x4A8A60(A) ; 否则 → 0x4B03A0(B)` —— **绝对映射**，
        // 与施法方朝向无关（`0x10D` 走的 `0x43A7AC` 也是同一对常量）。
        const dir = Math.abs(camp | 0) & 1;
        const side = dir === 0 ? 'A' : 'B';
        const loX = Math.min(x0, x1);
        const hiX = Math.max(x0, x1);
        const loY = Math.min(y0, y1);
        const hiY = Math.max(y0, y1);
        const found: Array<{ h: number; x: number; y: number }> = [];
        for (const u of this.unitList) {
            if (!u.alive || u.side !== side)
                continue;
            const gx = Math.floor(u.x);
            const gy = Math.floor(u.y);
            if (gx < loX || gx > hiX || gy < loY || gy > hiY)
                continue;
            const h = this.byUnit.get(u) ?? 0;
            if (h !== 0)
                found.push({ h, x: u.x, y: u.y });
        }
        found.sort((p, q) => p.y - q.y || p.x - q.x || p.h - q.h);
        return found.map((e) => e.h);
    }
    /** 格 (gx,gy) 上的存活单位句柄（原作 `0x43AF7A` 查 `0x4B3CA0` 的格表，一格一个）。 */
    unitAtTile(gx: number, gy: number): number {
        let best = 0;
        let bestScore = Infinity;
        for (const u of this.unitList) {
            if (!u.alive)
                continue;
            if (Math.floor(u.x) !== gx || Math.floor(u.y) !== gy)
                continue;
            const h = this.byUnit.get(u) ?? 0;
            if (h === 0)
                continue;
            const d = Math.abs(u.x - (gx + 0.5)) + Math.abs(u.y - (gy + 0.5));
            if (d < bestScore) {
                bestScore = d;
                best = h;
            }
        }
        return best;
    }
    /**
     * 物件碰撞回调 `obj[+0x98]`（R163 缺口 1）。原作站点 `0x40AA82..0x40ABC5`：
     *
     * ```
     * 0040AA8E  cmp [ecx+0x10],0x600000 ; jl +        ; obj.z < 96px 才参与碰撞
     * 0040AAAC  call 0x43A51D                        ; obj 像素 → 格 (x/96, y/72)
     * 0040AAC8  call 0x43AF7A                        ; 该格上的单位（格表 0x4B3CA0）
     * 0040AB49  call 0x40A878 ; and obj[+0x30], mask ; 关系掩码为 0 则不打
     * 0040ABAE  push 0x421AD2(obj) ; push obj[+0x98] ; push victim ; call 0x41F740
     * ```
     *
     * 所以"多目标"不是靠射线扫过谁，而是脚本**逐个**造 2501 物件并 `0x2C` 挂上回调 id，
     * 引擎在物件与单位落在同一格时调那个回调（MAGIC.SO 里 `DemonDancing` 的 21 个
     * `LockTargetXY` 物件就是这么打的，回调体 `DemonDancingCallback` 每次 `Hurt(g16,...)`）。
     *
     * 端口实现要点：
     *   - 触发条件 = 物件所在 tile 上有**敌方**单位（关系掩码那道的等价物）；每物件只触发一次
     *     （`cbFired`），因为原作物件撞上后由回调自己结束自己（`DemonDancingCallback` 在
     *     `g16==20` 时把 g16 清 0，`FlyingSwordCallback` 递减 g17）。
     *   - 回调以**并发实例**跑（`spawnInstance` + `drainInstancesSync`），共享同一个 engine
     *     数组对象 ⇒ 回调里的 `LDSG g16`/`STE g16` 与主脚本的 `STG g16` 是同一格。
     *   - 实参顺序按 `0x4650E0` 的"前向拷贝"实测：脚本 `arg1` = 最后压栈的 = **受害者句柄**，
     *     `arg2` = **物件句柄**（与 `DemonDancingCallback` 的 `Hurt(g16, arg1, arg2)` 吻合）。
     *   - 命中的物件数计入 `hits`（`stats.hits` 因此是"打了几次"而不是"打到几个单位"）。
     * [推测] 端口没有实现 `0x26`（handler 未 dump），所以"进入碰撞态"的时机比原作早
     * `LockTargetXY` 里那 2 帧 `WAIT`；同步模型下同一次施法的全部回调都在脚本跑完后统一
     * 触发，`g16` 此时是主脚本最后一次写入的值（20），原作则按 2/2/…/20 的时序逐次结算。
     */
    collideCallbacks(): HitPoint[] {
        const hits: HitPoint[] = [];
        if (!this.ok)
            return hits;
        // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7e）。
        const list = Array.from(this.objects.values()).filter((o) => (o.param98 | 0) !== 0);
        if (list.length === 0)
            return hits;
        for (const o of list) {
            if (o.dead)
                continue;
            // 移动物件（`0x15` 设过方向/速度）的真实位置要靠 `posOf` 外推 —— 只看 `o.x/o.y`
            // 会把半个屏幕的飞行体全钉在出生格上，`HalfMoonAll` 那类"飞过去才撞"的回调就永不触发。
            const cur = this.posOf(o.handle) ?? { x: o.x, y: o.y, z: o.z };
            if (cur.z >= 96)
                continue;
            // 原作逐帧驱动物件并**每帧**查一次格表（`0x40AA82` 在物件更新之后），所以一条飞行
            // 轨迹会撞到沿途每一个单位；端口按"上一帧位置 → 本帧位置"的线段采样格表才等价。
            const from = this.cbPrev.get(o.handle) ?? cur;
            this.cbPrev.set(o.handle, { x: cur.x, y: cur.y });
            const dx = cur.x - from.x;
            const dy = cur.y - from.y;
            const dist = Math.hypot(dx, dy);
            const steps = Math.max(1, Math.ceil(dist / 48));
            const seen = new Set<number>();
            for (let s = 0; s <= steps; s++) {
                const px = from.x + (dx * s) / steps;
                const py = from.y + (dy * s) / steps;
                const gx = Math.floor(px / 96);
                const gy = Math.floor(py / 72);
                // `0x43AF54` 的边界检查：0..70 列、0..13 行。
                if (!(gx >= 0 && gx <= 70 && gy >= 0 && gy <= 13))
                    continue;
                const standing = this.unitAtTile(gx, gy);
                if (standing === 0 || seen.has(standing))
                    continue;
                seen.add(standing);
                const standingUnit = this.byHandle.get(standing);
                if (!standingUnit || !standingUnit.alive)
                    continue;
                if (standingUnit.side === this.caster.side)
                    continue;
                if (this.cbFired.has(`${o.handle}:${standing}`))
                    continue;
                this.cbFired.add(`${o.handle}:${standing}`);
                // 原作 `0x40AA82`@0x40AB65 取的是 `hitUnit[+0x44]`——**该格上单位的主将**，
                // 所以回调脚本里 `Hurt` 的受害者参数是主将，不是小兵。
                const victim = this.generalOf(standing) || standing;
                const fn = this.program.functionByNum(o.param98 | 0);
                if (!fn) {
                    this.trace(`物件 ${o.handle} 的回调脚本号 ${o.param98} 不存在（按无回调处理）`);
                    continue;
                }
                // 每击的伤害量：脚本在每次 `0x314` 之前 `STG g16 = 2`（最后一击 `STG g16 = 20`），
                // 取在 `0x2C` 挂回调那一刻（`SkillObject.cbDamage`）—— 端口的碰撞结算在整条
                // 施法跑完之后，那时 g16 已经是 20 了。`HalfMoonAll` 这类不写 g16 的脚本留 0，
                // 由下面的引擎侧兜底（脚本自己 `Hurt(g4,...)` 的那个 g4 = 引擎变量 4）。
                const perHit = Math.max(0, o.cbDamage ?? 0);
                try {
                    const args: Slot[] = [
                        { value: victim, type: 0 },
                        { value: o.handle, type: 0 },
                    ];
                    this.spawnInstance(fn, args, this.makeVm(this.vm));
                    this.drainInstancesSync();
                }
                catch (err) {
                    this.recordError(err);
                    continue;
                }
                // 原作这一击的伤害由引擎侧的 `call [locc+0x4c]`(locc, 0x10003|0x10004, obj)
                // 结算（`0x40AB65..0x40ABC5`），脚本里的 `Hurt` 遇到主将会被开头的
                // `arg2 == g2 || arg2 == g3` 拦掉（`magic_so.dis.txt:0012E0-0012E4`）只放音效。
                // 端口没有单位虚表：小兵按端口约定挨一次就阵亡（`applyHpDelta(...,-1)`），
                // 主将按这一击的伤害量结算（`HalfMoonAll` 这种没写 g16 的取引擎变量 4，
                // 也就是脚本 `Hurt(g4,...)` 本来想用的那个数）。
                if (standingUnit.isGeneral) {
                    const dmg = perHit > 0 ? perHit : Math.max(1, this.engineGet(4));
                    this.applyHpDelta(standing, -dmg);
                }
                else {
                    this.applyHpDelta(standing, -1);
                }
                const u = this.byHandle.get(standing);
                if (u) {
                    // 回调自己的 `Hurt`→`0x125` 可能已经结算过伤害了，这里只登记命中点，
                    // 并占住 `hitUnits` 防止几何扫射再结算一次同一单位。
                    this.hitUnits.add(u);
                    hits.push({ x: u.x, y: u.y, r: 1.25 });
                }
            }
        }
        return hits;
    }
    spawnObject(resource: number, x: number, y: number, z: number, unit: number): number {
        const handle = this.nextObjectHandle++;
        this.objects.set(handle, {
            handle,
            resource,
            x,
            y,
            z,
            unit,
            vx: 0,
            vy: 0,
            angle: -1,
            speed: 0,
            frames: 0,
            born: this.clockValue,
            // 原作物件寿命由动画帧数决定；同步模型里没有逐帧引擎，用默认寿命让
            // "等待物件消失"（0x12）的循环能够退出。0x18 会用真实帧数覆盖。
            expiresAt: this.clockValue + DEFAULT_OBJECT_FRAMES,
            dead: false,
            motion: 0,
            // R145：原作 `obj+0x30` / `+0x58` / `+0x98` / `+0x9C..+0xA4` 四个字段，
            // 分别由 0x029·0x02B / 0x027 / 0x02C / 0x02E 读写（见 syscalls.ts）。
            flags: 0,
            animFrame: 0,
            param98: 0,
            params: [0, 0, 0],
        });
        return handle;
    }
    objectOf(handle: number): SkillObject | undefined {
        return this.objects.get(handle);
    }

    // ── 投射物（R187）───────────────────────────────────────────────────────
    /**
     * 本技的**调用闭包**里有没有「建物件（`0x11`）+ 挂碰撞回调（`0x2C`）」这对指令。
     *
     * 原作只有这套组合才会产生"飞过去、撞到人再结算"的弹丸：
     * `ShootObject @0x6998`（dis:4102 `0x2C(obj,3001)`）、`HalfMoon`（`0x2C(obj,1001)`）、
     * `連弩`（`0x2C(obj,19001)`）。`0x11` 单独出现只是静止特效（地泉的水柱、冰柱），
     * 不算投射物 —— 这条判据让"兜底让位"只作用于真有弹道的技。
     */
    scriptSpawnsProjectile(): boolean {
        if (this.projectileScript === undefined)
            this.projectileScript = programSpawnsProjectile(this.program, this.scriptFn);
        return this.projectileScript;
    }
    /**
     * 逐帧：还有没有飞在半路的弹丸（＝兜底要让位）。
     *
     * 只看**已登记**的飞行事件：登记条件（见 `emitProjectileFlights`）已经把
     * "原地炸的贴图"、"没位置的占位副本"排除掉了，所以这里只需要比生命周期。
     */
    projectileAirborne(): boolean {
        for (const flight of this.flights.values()) {
            if (this.framesRun - flight.bornFrame < flight.lifeTick) return true;
        }
        return false;
    }
    /**
     * 逐帧：这一帧的落点兜底要不要让位给投射物（"先飞后判"）。
     *
     * 两条让位理由：
     *  - 已经登记过弹丸、且它还在飞 → 一直让到弹丸落地/到期（上限就是物件寿命）；
     *  - 还没出生 → 只给 `PROJECTILE_GRACE` 帧宽限，且只给"闭包里真有弹丸"的技。
     *    有宽限上限是为了不把地泉衝（1001 帧）、劍輪舞（559 帧）这类长脚本的伤害
     *    拖到脚本末尾：它们第 3 帧就该出伤害，宽限只是把兜底从 f3 推到 f19。
     */
    deferFallbackForProjectile(): boolean {
        if (this.projectileSpawned) return this.projectileAirborne();
        if (this.framesSeen > PROJECTILE_GRACE) return false;
        return !this.lastFrameEndedScript && this.scriptSpawnsProjectile();
    }
    /**
     * 脚本已经跑完，但弹丸还在飞 ⇒ 让会话继续空转（不结束、不结算）。
     *
     * 依据：原作伤害是弹丸**撞上目标那一帧**由碰撞回调结算的 —— 物件挂的是
     * `ShootObjectCallback @0x5CA4`（`SYSCALL 0x2C(obj,3001)`，dis:4102），回调里
     * `CALL Hurt`（dis:3470）；`ShootObject` 自己则在 `L06FAC`（dis:4106-4130）
     * 每帧轮询物件、飞完才 `WAIT 60` 收尾。端口把这个轮询循环截断在 `MAX_SKILL_FRAMES`，
     * 于是"等落地"只能由会话层补：脚本 done 之后再空转 `lifeTick` 帧，
     * 让 `resolveFrameHits()` 的兜底正好落在弹丸到场那一帧。
     */
    holdForProjectile(): boolean {
        if (!this.projectileSpawned || this.isHeal || this.isSummon) return false;
        if (this.fallbackApplied) return false; // 已经结算过，别再拖
        return this.projectileAirborne();
    }
    /**
     * 逐帧：把本帧新出现的投射物物件登记成事件（一个物件只登记一次）。
     *
     * 登记条件 = 引擎里"会飞且会碰撞"的那三件事都齐了：`0x15` 给了角度/速度（`angle>=0 && speed>0`）、
     * `0x2C` 挂了碰撞回调（`param98 !== 0`）、资源号是真物件（>= 1000；落月弓 13001、
     * 半月斬 11001、連弩 29001，而 `10003`/`2501` 这类贴图碎片不算）。
     *
     * 还要求物件有真实位置、且落点离它够远：
     *  - `(0,0)` 是"宿主查不到"时 `unitPx` 的返回值（三日月斬在 (0,0) 建了两个 `11001(spd1)`
     *    占位副本），不是弹丸；
     *  - 落点距离 < 24 px 的（劍輪舞的 `2501(spd60,cb38001)` 原地绕圈碎片）没有"飞过去"这件事。
     */
    emitProjectileFlights(): void {
        for (const o of this.objects.values()) {
            if (this.flights.has(o.handle)) continue;
            if (!(o.angle >= 0) || o.speed <= 0 || (o.param98 | 0) === 0) continue;
            if (o.resource < 1000) continue;
            if (o.x === 0 && o.y === 0) continue;
            const target = this.fallbackPoint();
            const magic = this.world.data.magics.find(m => m.SCRIPT === this.scriptNum);
            const dir = flightDirOf(magic);
            const tx = target ? target.x : this.castAim.x / 96;
            const ty = target ? target.y : this.castAim.y / 72;
            const dx = tx * 96 - o.x;
            const dy = ty * 72 - o.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 24) continue; // 原地炸/绕圈的贴图碎片：没有"飞过去"这件事
            // 物件寿命 = 0x18 给的动画帧数（`o.frames`）。**不用** `expiresAt - clockValue`：
            // 端口的虚拟时钟会被 `CALLS LockCamera` 这类子脚本里的 WAIT 一次推走几百帧
            // （落月弓实测出生时 clock 已 1201、expiresAt 还是 86），拿它算寿命只会得到 1。
            const alive = o.frames > 0 ? o.frames : DEFAULT_OBJECT_FRAMES;
            const lifeTick = Math.max(1, Math.min(alive, Math.ceil(dist / o.speed)));
            const flight: ProjectileFlight = {
                seq: magic?.SEQUENCE ?? this.scriptNum,
                dir,
                resource: o.resource,
                side: this.side,
                fromX: o.x / 96,
                fromY: o.y / 72,
                toX: tx,
                toY: ty,
                bornTick: this.world.tick,
                lifeTick,
                bornFrame: this.framesRun,
                hitFrame: -1,
            };
            this.flights.set(o.handle, flight);
            this.projectileSpawned = true;
            pushProjectile(this.world, flight);
        }
    }
    /** 逐帧：物件消失（回调结算或飞满寿命）时把事件封口（`hitFrame`；-1 = 会话结束时还在飞）。 */
    closeProjectileFlights(): void {
        for (const [handle, flight] of this.flights) {
            if (flight.hitFrame >= 0) continue;
            const o = this.objects.get(handle);
            if (!o || o.dead || this.framesRun - flight.bornFrame >= flight.lifeTick)
                flight.hitFrame = this.framesRun;
        }
    }
    /**
     * 落点兜底的判定点：优先打在**引擎解析出的目标主将**（`targetHandle` → g3）身上。
     *
     * 这是 R183「法术域五红」的结论，原样保留：原作 `Hurt @0x12B8` 会把"受害者不是双方主将"
     * 的调用拦成只放音效（`dis:0012D8-0012E8`），所以兜底必须打主将，打小兵等于空放。
     * R187 只改了兜底的**时机**（等弹丸落地），没改对象。
     */
    fallbackPoint(): HitPoint | null {
        const g3 = this.generalOf(this.targetHandle) || this.targetHandle;
        const victim = this.byHandle.get(g3);
        if (victim && victim.alive) return { x: victim.x, y: victim.y, r: 1.4 };
        if (Number.isFinite(this.castAim.x) && Number.isFinite(this.castAim.y))
            return { x: this.castAim.x / 96, y: this.castAim.y / 72, r: 1.4 };
        return null;
    }
    /**
     * R187：弹丸到场的那一击（**绕过 `hitUnits` 的一技一次去重**）。
     *
     * 为什么必须绕过去重：原作里「弹丸打人」和「脚本兜底」是两条独立通路。
     * 物件撞到人时引擎起 `param98` 指的回调（`0x40AA82..0x40ABC5`），回调里
     * `CALL Hurt(g3, victim, engine[4])`（`ShootObjectCallback @0x5CA4`，dis:3427-3470）；
     * 一次施法有几支箭、撞几帧，就结算几次，`Hurt` 里没有任何"一技一次"的门闩。
     * 端口的 `hitUnits` 只是"整技对同一单位只算一次"的近似，用在 `applyHits` 上没问题，
     * 但拿它去卡「兜底一击」就会把这一击整发吞掉——連弩 5 支箭先撞上主将、主将进了
     * `hitUnits`，`finishFrames()` 里的补刀于是被 `unhitUnits()` 静默过滤，
     * 实测 46 連弩 / 62 連弩激射 / 85 連弩狂濤 的敵將掉血从 43/49/61 掉到 23/29/35。
     * 这里按 `applyHits()` 的**同一套判定与公式**（主将 `8 + floor(ATTACK/2)`、小兵按 `rate`）
     * 结算一次，只是不做 `hitUnits` 去重 —— 赔率、半径、目标全部不新增。
     */
    applyProjectileArrival(): boolean {
        if (this.isHeal || this.isSummon)
            return false;
        const point = this.fallbackPoint();
        if (!point)
            return false;
        const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
        const atk = m?.ATTACK ?? 20;
        const generalDmg = 8 + Math.floor(atk / 2);
        let hits = 0;
        for (const u of this.world.units) {
            if (!u.alive || u.side === this.side || !u.isGeneral)
                continue;
            if ((u.x - point.x) ** 2 + (u.y - point.y) ** 2 > 0.75 * 0.75)
                continue;
            this.hitUnits.add(u);
            hits += 1;
            this.applyHpDelta(this.byUnit.get(u) ?? 0, -generalDmg);
        }
        this.totalHits += hits;
        return hits > 0;
    }
    /**
     * R187：兜底里「小兵那一半」——**时机不变**，仍在 `framesSeen >= 3` 的兜底点结算。
     *
     * R88 的落点兜底一次同时结算「主将 8+floor(ATTACK/2)」+「兜底半径内小兵按 ATTACK 赔率各 -1」。
     * 本轮只把**主将那一下**延到弹丸到场（那是原作 `CALL Hurt` 的时机），小兵那一下没有
     * 原作地址证据说要跟着延，而且延了会改小兵减员——保真网 `battle.cast.strike`
     * （落月弓瞄小兵，240 tick 内必须有减员）就是靠这次波及过的。所以这里把它留在原处：
     * 半径、赔率、掷骰次数与 `applyHits()` 完全一致（主将不掷骰，RNG 序列也一致）。
     */
    applyCollateral(): number {
        if (this.collateralApplied)
            return 0;
        const fp = this.fallbackPoint();
        if (!fp)
            return 0;
        this.collateralApplied = true;
        // 点集与 `applyHits()` 收到的完全一致：`unhitUnits()` 会把兜底圆（r=1.4）里的
        // 敌人各自变成一个 r=1.25 的命中点，主将因此也会带出一个落在自己身上的点。
        const pts = this.unhitUnits([fp]);
        if (pts.length === 0)
            return 0;
        const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
        const atk = m?.ATTACK ?? 20;
        const rate = Math.max(0.05, Math.min(0.95, 0.15 + atk * 0.01));
        let hits = 0;
        for (const u of this.world.units) {
            if (!u.alive || u.side === this.side || u.isGeneral || this.hitUnits.has(u))
                continue;
            if (!pts.some((h) => (u.x - h.x) ** 2 + (u.y - h.y) ** 2 <= 0.75 * 0.75))
                continue;
            this.hitUnits.add(u);
            hits += 1;
            if (scriptChance(this.world) < rate)
                this.applyHpDelta(this.byUnit.get(u) ?? 0, -1);
        }
        this.totalHits += hits;
        return hits;
    }
    setObjectPx(handle: number, x: number, y: number, z: number): void {
        const o = this.objects.get(handle);
        if (!o)
            return;
        o.x = x;
        o.y = y;
        o.z = z;
    }
    setObjectMotion(handle: number, angle: number, speed: number): void {
        const o = this.objects.get(handle);
        if (!o)
            return;
        // 中途改向/改速：先把"按旧速度飞到现在的位移"结算进 x/y，再把起点挪到当前帧。
        // 否则 posOf() 会拿新速度从 born 重新外推 ⇒ 物件瞬移（旋龍的 dummy 每帧被 0x19 改一次）。
        if (this.clockValue > o.born) {
            const dt = this.clockValue - o.born;
            if (o.angle >= 0 && o.speed !== 0) {
                o.x += o.vx * o.speed * dt;
                o.y += o.vy * o.speed * dt;
            }
            o.born = this.clockValue;
        }
        o.angle = ((angle % 256) + 256) % 256;
        o.speed = speed;
        const rad = (o.angle / 256) * Math.PI * 2;
        o.vx = Math.cos(rad);
        o.vy = Math.sin(rad);
    }
    setObjectFrames(handle: number, frames: number): void {
        const o = this.objects.get(handle);
        if (!o)
            return;
        o.frames = Math.max(0, frames | 0);
        if (o.frames > 0)
            o.expiresAt = this.clockValue + o.frames;
    }
    applyHpDelta(handle: number, delta: number): void {
        const u = this.byHandle.get(handle);
        if (!u || !Number.isFinite(delta) || delta === 0)
            return;
        if (u.isGeneral) {
            const g = this.world.sides[u.side].general;
            const before = g.hp;
            const cap = Math.max(0, g.maxHp);
            g.hp = Math.max(0, Math.min(cap, g.hp + delta));
            const applied = g.hp - before;
            if (applied > 0) {
                this.healed += applied;
                this.healTargets.add(handle);
            }
            if (g.hp <= 0)
                u.alive = false;
            return;
        }
        if (delta < 0) {
            if (u.alive) {
                u.alive = false;
                this.killed++;
            }
        }
    }
    readHp(handle: number): number {
        const u = this.byHandle.get(handle);
        if (!u)
            return 0;
        if (u.isGeneral)
            return Math.round(this.world.sides[u.side].general.hp);
        return u.alive ? 1 : 0;
    }
    maxHp(handle: number): number {
        const u = this.byHandle.get(handle);
        if (!u)
            return 0;
        if (u.isGeneral)
            return Math.round(this.world.sides[u.side].general.maxHp);
        return 1;
    }
    summon(a: number, b: number, c: number): number {
        const count = Math.max(1, Math.min(40, Math.abs(a) || Math.abs(c) || 5));
        const base = this.caster;
        let last = 0;
        for (let i = 0; i < count; i++) {
            const spread = i - (count - 1) / 2;
            const tileX = base.x + (this.direction === 1 ? -0.6 : 0.6) + spread * 0.25;
            const tileY = base.y + spread * 0.35;
            const u = {
                side: this.side,
                x: Math.max(0.5, Math.min(70.5, tileX)),
                y: Math.max(0.5, Math.min(13.5, tileY)),
                prevX: tileX,
                prevY: tileY,
                alive: true,
                cd: 0,
            };
            const handle = 5000 + this.nextSummonHandle++;
            this.byUnit.set(u, handle);
            this.byHandle.set(handle, u);
            this.unitList.push(u);
            this.world.units.push(u);
            last = handle;
        }
        this.log.push(`召唤 ${count} 兵`);
        return last;
    }
    /**
     * R88（project/152 §3）：`0x119(side, x, y)` 的宿主实现 —— **在指定格新生成一名士兵**。
     *
     * 原作它不是"召唤/复活"：`ProduceSoldier`（@0x4EF4，argc=2）先用 `0x113(x,y)` 探格，
     * 拿到 0（空格）才 `0x119`，随即 `StepShow(...,10,0,0)` 播一个出场动作；调用方
     * `MoreSoldier` 先把"要补几个"算成 `need`（`0x116*5 - 0x10C` 再夹到 [0,arg2]），
     * 补够 `need` 个就 `RET`。所以这里的语义是**新增单位**，不是把尸体拉活，也不该像
     * `summon()` 那样按数量铺一片（那个实现是早期近似：它不看格、不看占用、不看上限）。
     *
     * 口径：
     *   - `side` 与 `0x10D`/`sideUnitHandle` 同一套：实参是本方的"方向值"（g5 = 1 表示
     *     目标在左）⇒ 本方；否则敌方。这样 `MoreSoldier` 里 `LDG 5` 直接传进来就是本方
     *     （伏兵系是"自己的兵从两边冒出来"，x 的镜像由脚本自己算 `70-x`）。
     *   - 该格已有活兵 ⇒ 返回 0（原作靠 `0x113` 的 0 判断空格，这里再兜一道，
     *     避免同一格叠两个兵）。
     *   - 该方活兵已有 200 ⇒ 返回 0（原作战斗单位表上限；超了不再生成）。[推测：上限值
     *     与"按方计"取自 152 §3 的骨架，未在反汇编里定位到常量]
     *   - 生成成功返回句柄（5000+，与 `summon()` 共用号段），并登记 byUnit/byHandle/
     *     unitList/world.units 四处；坐标落在格中心（格 (x,y) 的中心 = (x+0.5, y+0.5) 格）。
     */
    spawnSoldier(side: number, x: number, y: number): number {
        const gx = Math.trunc(x);
        const gy = Math.trunc(y);
        if (!(gx >= 0 && gx <= 70 && gy >= 0 && gy <= 13))
            return 0;
        // 阵营是**绝对**口径（`0x43B9CB`：参数 0 → `0x4A8A60`(A) / 否则 → `0x4B03A0`(B)，
        // 与 `0x10D`/`0x10C`/`0x12A` 同一对 sideStruct），和施法方朝向无关。
        // 旧实现把 camp 按"本方/对方"折算（`dir === (this.direction & 1)`），A 方朝左时
        // camp=0 被算成 B 方 ⇒ 七条补兵技的兵全加到了对面（探针 A 20→20、B +7）。
        const target: Side = (Math.abs(side | 0) & 1) === 0 ? 'A' : 'B';
        if (this.unitAtPx(gx * 96 + 48, gy * 72 + 36) !== 0)
            return 0;
        let alive = 0;
        for (const u of this.unitList)
            if (u.alive && u.side === target && !u.isGeneral)
                alive++;
        if (alive >= MAX_SOLDIERS_PER_SIDE)
            return 0;
        const cx = gx + 0.5;
        const cy = gy + 0.5;
        const u = { side: target, x: cx, y: cy, prevX: cx, prevY: cy, alive: true, cd: 0 };
        const handle = 5000 + this.nextSummonHandle++;
        this.byUnit.set(u, handle);
        this.byHandle.set(handle, u);
        this.unitList.push(u);
        this.world.units.push(u);
        if (this.log.length < 64)
            this.log.push(`补兵 1 名 @(${gx},${gy})`);
        return handle;
    }
    engineGet(index: number): number {
        return this.engine[index | 0] ?? 0;
    }
    engineSet(index: number, value: number): void {
        const i = index | 0;
        if (i < 0 || i >= this.engine.length)
            return;
        this.engine[i] = value | 0;
    }
    rand(min: number, max: number): number {
        // R115：0x303 的落点抽，roll 优先（见 scriptRand / 0x420BAA 反汇编）。
        return scriptRand(this.world, min, max);
    }
    /**
     * `0x301(name, vol)` / `0x300(unit, name, vol)`：真的播。
     *
     * R52 之前这里只往 `sounds[]` 里记一行日志，`audio.sfx()` 从没被调过，
     * 所以 88 个脚本发声点在页面上是**静音**的。现在两条都成立：
     * 日志保留（测试/排错看得到），事件同时送进 `audio_bus`。
     * 音量口径是原作的 0..255（`emitSfx` 负责折成 0..1）。
     */
    sound(name: string, volume: number, unit?: number): void {
        const tag = unit === undefined ? name : `${name}@${unit}`;
        if (this.sounds.length < 8)
            this.sounds.push(`${tag}:${volume}`);
        this.soundsEmitted++;
        // Cocos 差异：AudioBus.SfxInput 只收 `unit: Unit` 对象（用于 3D 定位），脚本的
        // `unit` 是槽位序号，硬塞会把事件打歪；source/clock 也只有 web 版 audio_bus 认。
        emitSfx({ name, volume, source: 'script' });
    }
    loadResource(pattern: string): void {
        if (this.resources.length < 8)
            this.resources.push(pattern);
    }
    brightness(value: number): void {
        this.brightnessValue = value;
        // 0x12F：原作把 0x48E520 设成 min(v, 0x10)，即亮度上限 16。
        emitBrightness(Math.min(16, value), 'syscall:0x12f', this.clockValue);
    }
    /** `0x130`：读回 `0x12F` 写进去的那格（原作 `0x4442f4` 无参 getter）。 */
    brightnessOf(): number {
        return this.brightnessValue;
    }
    /**
     * `0x131`（置 `0x4A6660=1`）/ `0x110`（清 0）：**特效期的压暗开关**。
     *
     * 字节码里两者永远成对、且 `0x131` 后面紧跟 `DownBrightness(level, frames)`
     * （实测 `HalfMoon` @0x4738：`SYSCALL 0x131` → `PUSHI 12 / PUSHI 5` → `CALL DownBrightness`），
     * 所以它不是"白闪一下"，而是"开始压暗 → 画面恢复"的一对括号。早先的实现只把它当屏闪记录。
     */
    screenFlash(on: boolean): void {
        this.log.push(on ? '特效压暗 开' : '特效压暗 关');
        emitFlash(on, on ? 1 : 0, on ? 'syscall:0x131' : 'syscall:0x110', this.clockValue);
    }
    /**
     * R137 `0x120(unit, 0x10000)` 的落点：把该单位所属阵营**全体**切成突击态。
     *
     * `side` 是脚本口径（1 = A / 2 = B，与 `unitSide` 一致）；转成 `Side` 后交给
     * `battle.allRush()` —— 幂等，已经在突击态时返回 false（原作每次调用都照播音频）。
     */
    allRush(side: number): boolean {
        return allRushSide(this.world, side === 2 ? 'B' : 'A');
    }
    /**
     * R137 `0x003(speaker, flags, text)` 的台词：`AllRush` 的「全軍突擊!%k%%e%」从这里进 log。
     *
     * 走 `trace()` 是为了共用那 24 行的上限；`%k%%e%` 是原作的控制符，原样保留。
     */
    text(speaker: number, line: string): void {
        this.trace(`台词[${speaker}] ${line}`);
    }
    /**
     * 按名字调脚本（`0x310`–`0x314`）。
     *
     * 三级分派，顺序即原作优先级：
     *   1. `audio_bus.callSystemSo`：上一轮实装的 5 个（亮度、突击、大将阵亡、载入战场地图）；
     *   2. `SysoHost`：本轮补的 25 个 SYSTEM.SO 函数（内存/镜头/天气/布景/菜单/武将）；
     *   3. MAGIC.SO 里的同名函数（`vm.invokeByName`）。
     * 前两级都是 `RET`/`RETV` 语义明确的原语，命中就返回它们的返回值。
     */
    callScript(name: string, args: SlotValue[]): SlotValue | undefined {
        if (this.calls.length < 8)
            this.calls.push(name);
        const nums = args.map((v) => (typeof v === 'number' ? v : Number(v) || 0));
        const sys = callSystemSo(name, nums, {
            source: `system:${name}`,
            clock: this.clockValue,
            side: this.side,
        });
        if (sys)
            return undefined;
        if (this.syso.has(name)) {
            // SlotValue 还允许数组（多返回值压栈），SYSTEM.SO 的原语只吃标量。
            const sysoArgs = args.map((v) => typeof v === 'string' ? v : typeof v === 'number' ? v : 0);
            const host = this.syso.call(name, sysoArgs);
            if (host.handled)
                return host.value;
        }
        const slots: Slot[] = args.map((v) => (typeof v === 'string' ? { value: v, type: 2 } : { value: v, type: 0 }));
        const ret = this.vm.invokeByName(name, slots);
        return ret?.value;
    }
    /**
     * `0x312` / `0x314`：按名字**新起一条并发脚本实例**（L0，`project/154 §5`）。
     *
     * 与 `callScript()` 的区别只在 MAGIC.SO 那一级：`0x310/0x311/0x313` 是同栈内联调用
     * （原作 `0x4653F0` 的直接 call），`0x312/0x314` 走的是"给 object 挂脚本"——
     * 被调方拿到自己的 VM 槽、从下一帧起与调用方**并行**推进，所以它里面的 `WAIT`
     * 不再拖长调用方（`LockTargetXY` 先 `WAIT` 再 `0x11` 造物件就是这个形状）。
     *
     * 前两级（`audio_bus` / `SYSTEM.SO`）仍是同步原语：那些是 C 侧函数，没有脚本槽可挂。
     */
    spawnScript(name: string, args: SlotValue[]): SlotValue | undefined {
        if (this.calls.length < 8)
            this.calls.push(`spawn:${name}`);
        const nums = args.map((v) => (typeof v === 'number' ? v : Number(v) || 0));
        const sys = callSystemSo(name, nums, {
            source: `system:${name}`,
            clock: this.clockValue,
            side: this.side,
        });
        if (sys)
            return undefined;
        if (this.syso.has(name)) {
            const sysoArgs = args.map((v) => typeof v === 'string' ? v : typeof v === 'number' ? v : 0);
            const host = this.syso.call(name, sysoArgs);
            if (host.handled)
                return host.value;
        }
        const fn = this.program.functionByName(name);
        if (!fn) {
            this.trace(`0x312/0x314 找不到脚本 ${name}（按 0 处理）`);
            return undefined;
        }
        const slots: Slot[] = args.map((v) => (typeof v === 'string' ? { value: v, type: 2 } : { value: v, type: 0 }));
        // R163：冻住"派发这一刻"的 g16（本击伤害）—— 子实例要等父脚本跑完才 drain，
        // 那时父脚本已经把 g16 写成后续/最后一击的值（`magic_so.dis.txt:12156/12241`）。
        this.spawnInstance(fn, slots, this.makeVm(this.vm), this.globalGet(16));
        return undefined;
    }
    trace(line: string): void {
        if (this.log.length < 24)
            this.log.push(line);
    }
    markUnimplemented(id: number, why: string): void {
        this.unimplemented.add(id);
        if (!WARNED.has(id)) {
            WARNED.add(id);
            console.warn(`[smartscript] ${why}`);
        }
    }
    // ── 伤害判定 ──────────────────────────────────────────────────────────
    resolveHits(): HitPoint[] {
        if (this.isHeal || this.isSummon)
            return [];
        const pts: HitPoint[] = [];
        for (const o of this.objects.values()) {
            if (o.dead)
                continue;
            if (o.resource < 1000 || o.resource > 90000)
                continue;
            const ox = o.x / 96;
            const oy = o.y / 72;
            if (o.angle < 0) {
                pts.push({ x: ox, y: oy, r: 1.25 });
                continue;
            }
            // 有方向的物件：沿 angle 扫一条"挥砍/弹道"线段。原作由 C 侧碰撞循环逐帧判定，
            // 这里换成固定采样；reach 由 speed×frames 估算并夹在 0.9..5 格。
            const reach = Math.max(0.9, Math.min(5, (o.speed * Math.max(o.frames, 8)) / 96));
            for (let d = 0.4; d <= reach + 1e-6; d += 0.5) {
                pts.push({ x: ox + o.vx * d, y: oy + o.vy * d, r: 1.0 });
            }
        }
        const enemies = this.world.units.filter((u) => u.alive && u.side !== this.side);
        if (pts.length === 0) {
            // 纯状态类脚本：退回目标点单体判定
            pts.push({ x: this.targetPoint.x / 96, y: this.targetPoint.y / 72, r: 1.4 });
        }
        const out: HitPoint[] = [];
        for (const e of enemies) {
            let hit = false;
            for (const p of pts) {
                if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= p.r * p.r) {
                    hit = true;
                    break;
                }
            }
            if (hit)
                out.push({ x: e.x, y: e.y, r: 1.25 });
        }
        return out;
    }
    /**
     * 逐帧命中判定（session 每帧调一次）。
     *
     * 与 `resolveHits` 的差别：只看物件**这一帧**扫过的范围。
     *   - 静止物件：当前位置 ±1.25 格；
     *   - 移动物件：上一帧位置 → 当前位置的线段，逐 0.5 格采样、半径 1 格。
     * 这样"火墙每帧烧一次""飞剑飞到第 N 帧才砍到人"就能被表现出来；
     * 命中去重交给 `applyHits` 的 `hitUnits`，所以总量与同步版一致。
     */
    resolveFrameHits(): HitPoint[] {
        if (this.isHeal || this.isSummon)
            return [];
        const pts: HitPoint[] = [];
        for (const o of this.objects.values()) {
            if (o.dead)
                continue;
            // 物件寿命（0x18 设的真实帧数 / 默认 96）过了就不再参与判定
            if (this.clockValue >= o.expiresAt)
                continue;
            if (o.resource < 1000 || o.resource > 90000)
                continue;
            const cur = this.posOf(o.handle);
            if (!cur)
                continue;
            if (o.angle < 0 || o.speed === 0) {
                pts.push({ x: cur.x / 96, y: cur.y / 72, r: 1.25 });
                continue;
            }
            // 本帧扫过的线段；物件若刚创建（dt=0）就退化成单点
            const dt = this.clockValue - o.born;
            const px = dt > 0 ? cur.x - o.vx * o.speed : cur.x;
            const py = dt > 0 ? cur.y - o.vy * o.speed : cur.y;
            const dx = cur.x - px;
            const dy = cur.y - py;
            const dist = Math.hypot(dx, dy);
            const samples = Math.max(1, Math.ceil(dist / 48));
            for (let i = 0; i <= samples; i++) {
                const t = i / samples;
                pts.push({ x: (px + dx * t) / 96, y: (py + dy * t) / 72, r: 1.0 });
            }
        }
        // 兜底：与同步模型（`execute()` 的 `hits.length === 0` 分支）保持一致 —— 脚本没有产出
        // 可判定的特效物件时（纯状态技，或物件落点由引擎侧 C 代码摆放而我们还没接的那批），
        // 按脚本自己 `SYSCALL 0x100` 设的落点做一次小范围判定。缺了这条，同一段字节码走
        // `runSkill()` 有伤害、走逐帧 `settleFrame()` 却 0 命中（R145 的 89 条"实测无效果"）。
        //
        // 时机很关键：一个会话最多兜一次，且**不能是第 0 帧**。早先无条件兜底会让第 0 帧就凭空
        // 打出伤害（`smartscript.session.test.ts` 三条逐帧断言钉的就是"第 0 帧不该有命中/击杀"），
        // 也会把"打空"的点打成命中。但只允许"脚本跑完那一帧"又太晚：`magic_effects.test.ts` 里
        // seq3/4/8/9/30/42/110 这类「物件由引擎侧 C 代码摆放」的技，脚本几帧就 done、物件从没
        // 落进判定，于是整发空放。⇒ 放宽成「第 1 帧之后（`framesSeen >= 3`）或脚本已 done」。
        //
        // 兜底打谁（R178/o1）：原作这一击的受害者是**引擎解析出来的目标单位**，不是玩家点的落点。
        // 证据链：
        //   - 引擎按 `MagicDef+0x10` 的 ACTIVE 类型解析出目标句柄写 `G[3]`（`0x43BA59`@`0x43BA9D`
        //     `mov [0x4a6884]`，见 `project/154 §1.2`），110 条脚本里每条都自己 `SYSCALL 0x100`
        //     覆盖锚点（`project/139 §0`）；
        //   - 伤害只从 `Hurt` 的 `0x125(arg2, 0, arg1)` 出去，而 `Hurt` 开头就把"受害者不是
        //     双方主将"的分支拦成只放音效（`export/script/magic_so.dis.txt:0012D8-0012E8`，
        //     `project/154 §1.4`）；落月弓的回调 `ShootObjectCallback @0x5CA4` 更是把"撞到小兵"
        //     分支写成 `Hurt(...,0)`（dis:3427-3470）⇒ **小兵这条路本来就不该掉血**；
        //   - `Hurt` 的受害者是 `arg1`，而回调的 `arg1` 正是端口 `collideCallbacks` 里那句
        //     `victim = generalOf(standing)` 取到的主将（`0x40AB65` 取 `hitUnit[+0x44]`）。
        // 所以兜底点取 `targetHandle` 解析出的 g3 单位（`generalOf` 之后就是对方主将）：
        // 落月弓瞄空地也打敵將（`battle_feedback.test.ts` R88 钉的就是这条），而
        // `神鬼亂舞`/`半月斬` 这类"落点只用来选 g3"的技，auto 与显式落点因此完全等价。
        //
        // 时机（R187）：**有弹道的技要让位给弹丸**。原作这一击不是脚本在落点凭空结算，
        // 而是物件飞到人身上、由碰撞回调里的 `Hurt` 结算（`ShootObjectCallback @0x5CA4`
        // 的 `CALL Hurt`，dis:3427-3470），而 `ShootObject @0x6998` 建完物件才进
        // `L06FAC` 轮询循环（dis:4106-4130）。旧口径在 f3 就兜底，比弹丸出生（落月弓 f11）
        // 还早，于是"伤害先到、弹丸后出生"，观感上箭根本没飞出去。⇒ 弹丸在飞/即将出生的
        // 那段帧里不兜底，等它落地或到期这一帧再兜（判定对象仍是 g3，伤害数值不变）。
        if (pts.length === 0 && !this.isHeal && !this.isSummon && !this.fallbackApplied
            && (this.lastFrameEndedScript || this.framesSeen >= 3)
            && !this.deferFallbackForProjectile()) {
            const point = this.fallbackPoint();
            if (point) {
                this.fallbackApplied = true;
                pts.push(point);
            }
        }
        return this.unhitUnits(pts);
    }
    /** 从候选命中点里筛出"实际被打到、且本会话还没结算过"的敌方单位。 */
    unhitUnits(pts: HitPoint[]): HitPoint[] {
        if (pts.length === 0)
            return [];
        const enemies = this.world.units.filter((u) => u.alive && u.side !== this.side && !this.hitUnits.has(u));
        if (enemies.length === 0)
            return [];
        const out: HitPoint[] = [];
        for (const e of enemies) {
            for (const p of pts) {
                if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= p.r * p.r) {
                    out.push({ x: e.x, y: e.y, r: 1.25 });
                    break;
                }
            }
        }
        return out;
    }
    applyHits(hits: HitPoint[]): void {
        if (hits.length === 0)
            return;
        const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
        const atk = m?.ATTACK ?? 20;
        const rate = Math.max(0.05, Math.min(0.95, 0.15 + atk * 0.01));
        const generalDmg = 8 + Math.floor(atk / 2);
        for (const u of this.world.units) {
            if (!u.alive || u.side === this.side)
                continue;
            // 逐帧模型：一个单位整个技能只结算一次，帧数只改节奏不改总量。
            // （同步模型的 hitUnits 为空，等价于旧版"每次 applyHits 判定一遍"。）
            if (this.hitUnits.has(u))
                continue;
            if (!hits.some((h) => (u.x - h.x) ** 2 + (u.y - h.y) ** 2 <= 0.75 * 0.75))
                continue;
            this.hitUnits.add(u);
            if (u.isGeneral) {
                this.applyHpDelta(this.byUnit.get(u) ?? 0, -generalDmg);
            }
            else if (scriptChance(this.world) < rate) {
                this.applyHpDelta(this.byUnit.get(u) ?? 0, -1);
            }
        }
    }
    pushFx(hits: HitPoint[]): number {
        const m = this.world.data.magics.find((x) => x.SCRIPT === this.scriptNum);
        const seq = m?.SEQUENCE ?? this.scriptNum;
        const life = Math.max(1, Math.round(this.opts.ttl ?? FX_TTL_DEFAULT));
        let kind: 'heal' | 'aoe' | 'strike';
        if (this.isHeal)
            kind = 'heal';
        // 命中到两个以上单位就是范围技；ATTRIB 里的"全體/四周"也按范围处理，
        // 因为有些范围技在测试场景里只打到一个目标。
        else if (this.isSummon || this.isWide || hits.length >= 2)
            kind = 'aoe';
        else
            kind = 'strike';
        if (this.isHeal) {
            this.world.fx.push({
                seq,
                kind: 'heal',
                x: Math.round(this.general.hp),
                y: 0,
                r: 0,
                ttl: life,
                life,
                side: this.side,
            });
            return 1;
        }
        if (hits.length === 0) {
            this.world.fx.push({
                seq,
                kind,
                x: clampX(this.targetPoint.x / 96),
                y: clampY(this.targetPoint.y / 72),
                r: 1.4,
                ttl: life,
                life,
                side: this.side,
            });
            return 1;
        }
        const cx = hits.reduce((s, h) => s + h.x, 0) / hits.length;
        const cy = hits.reduce((s, h) => s + h.y, 0) / hits.length;
        const r = kind === 'aoe' ? 3.6 : 1.8;
        this.world.fx.push({ seq, kind, x: clampX(cx), y: clampY(cy), r, ttl: life, life, side: this.side });
        return 1;
    }
    /** 诊断：当前 pc / 调用深度 / 已执行指令数（探针用）。 */
    debugState(): { pc: number; depth: number; steps: number; nestedWaits: number } {
        return {
            pc: this.vm.pc,
            depth: this.vm.callDepthNow,
            steps: this.vm.steps,
            nestedWaits: this.nestedWaits,
        };
    }
    /** 诊断：读当前帧的局部槽（offset>0 局部，-2 = arg1）；探针用。 */
    debugLocal(offset: number): number {
        const slot = this.vm.stack[this.vm.frame + offset];
        return slot ? Number(slot.value) : NaN;
    }
    /** 调试：把物件坐标导出成 `[(x,y,res)]`。 */
    dumpObjects(): string {
        // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7d）。
    const arr = Array.from(this.objects.values()).slice(0, 12);
        return arr.map((o) => `(${(o.x / 96).toFixed(1)},${(o.y / 72).toFixed(1)},${o.resource})`).join(' ');
    }
}
/**
 * 一次施法的逐帧会话（`cast()` 的产物）。
 *
 *   const s = startSkill(world, 'A', 606, tx, ty);   // 第 0 帧已生效
 *   s.frames[0].killed                                // 首帧击杀（cast 用它回填）
 *   step(world)  →  s.advance()                       // 每 tick 推进一帧
 *
 * `advance()` 的节奏：先让虚拟时钟前进 1 帧（物件位置随之外推），
 * 再递减 `pendingFrames`；减到 0 才 `vm.resume()` 跑下一段脚本。
 * 所以 `WAIT 15` 真的是"挂起 15 帧"，而不是一次把时间推过去。
 */
export class SkillSession {
    side: Side;
    scriptNum: number;
    /** 法术序号（fx 用）。 */
    seq: number;
    /** 已跑完的帧数（第 0 帧在 start() 里就跑完了）。 */
    frame = 0;
    /** WAIT 还剩多少 tick 才恢复（0 = 不等待）。 */
    pendingFrames = 0;
    /**
     * R187：脚本已收尾、只在等弹丸落地（此时 `advance()` 不推进虚拟时钟，
     * 否则会被 `MAX_SKILL_FRAMES` 预算截断——那个预算早被 `CALLS` 子脚本的轮询烧光了）。
     */
    holding = false;
    /** 脚本已结束（正常返回 / 失败 / 截断）。 */
    done = false;
    ok = true;
    /** 失败或截断原因（空串 = 正常）。 */
    reason = '';
    /** 每帧统计，测试会打印它。 */
    frames: FrameStat[] = [];
    /** 会话累计击杀（含所有帧）。 */
    killed = 0;
    /** 会话累计治疗量。 */
    healed = 0;
    /** 会话累计命中的单位数。 */
    hits = 0;
    /** 当前虚拟帧（物件位置按它外推）；测试用。 */
    get clock(): number {
        return this.run.clock;
    }
    /** 诊断：当前 pc / 调用深度 / 已执行指令数。 */
    get debug(): { pc: number; depth: number; steps: number; nestedWaits: number } {
        return this.run.debugState();
    }
    /**
     * 诊断：本次施法里的全部脚本实例（根 + `0x312 / 0x314` 起的子实例）。
     *
     * 原作的 `0x312`（延迟调用）会给目标 object 挂一条独立脚本会话，多个 object 的脚本
     * 在同一帧里各跑各的。`instanceStates()` 让测试能逐 tick 观察这件事。
     */
    instancesSnapshot(): InstanceSnapshot[] {
        return this.run.instanceStates();
    }
    /** 本次施法的脚本实例数（正常单实例技能恒为 1）。 */
    get instanceCount(): number {
        return this.run.instanceCount;
    }
    /** 是否为補血類技能（瞬发；cast 会一次跑完，见 `drain()`）。 */
    get isHealSkill(): boolean {
        return this.run.isHealSkill;
    }
    /**
     * 本次会话的 SYSTEM.SO 宿主库（R79）。
     *
     * 测试用它确认"宿主库真的挂在这个 Runtime 上、并且内存族读的是本场的引擎数组"。
     */
    get syso(): SysoHost {
        return this.run.syso;
    }
    run: SkillRun;
    started = false;
    constructor(run: SkillRun, seq: number) {
        this.run = run;
        this.side = run.side;
        this.scriptNum = run.scriptNum;
        this.seq = seq;
    }
    /** 跑第 0 帧；之后交给 `advance()`。 */
    start(): void {
        if (this.started)
            return;
        this.started = true;
        if (!this.run.beginFrames()) {
            this.done = true;
            this.ok = false;
            this.reason = this.run.runError;
            return;
        }
        this.pump();
    }
    /**
     * 推进 1 tick。返回本次真正跑了一帧时的统计，
     * 还在 WAIT 挂起中则返回 undefined（本 tick 只推进了时间）。
     */
    advance(): FrameStat | undefined {
        if (this.done)
            return undefined;
        // R187：弹丸还在飞、脚本已收尾 ⇒ 只推「帧」不动虚拟时钟。
        // 这个会话的虚拟帧预算往往已经被 `CALLS LockCamera` 这类子脚本里的
        // `WAIT 1` 轮询烧到上限（`MAX_SKILL_FRAMES`），再 `advanceClock()` 就会抛
        // "虚拟帧超过 1200" 把会话提前截断 —— 而等弹丸落地根本不需要时钟。
        if (this.holding) {
            this.pump();
            return this.frames[this.frames.length - 1];
        }
        try {
            this.run.advanceClock();
        }
        catch (err) {
            // 虚拟帧预算（1200）用完：保留已经产生的效果，按截断收尾
            this.reason = err instanceof Error ? err.message : String(err);
            this.finish();
            return undefined;
        }
        if (this.pendingFrames > 0) {
            this.pendingFrames--;
            // 实例侧同一份 WAIT 计数也要递减（`0x312/0x314` 起的子实例各等各的帧数）。
            this.run.tickInstanceWaits();
            if (this.pendingFrames > 0)
                return undefined; // 还没等够：本 tick 不跑脚本
        }
        this.pump();
        return this.frames[this.frames.length - 1];
    }
    /** 会话结果（结算面板 / 测试）。 */
    summary(): RunSummary {
        return this.run.summary();
    }
    /**
     * 一口气跑完（只给補血類用）。
     *
     * 原作里 命療術/補血 是**瞬發**：扣完技力血就回来了，没有"等 N 帧才回血"的玩法。
     * 脚本里那些 WAIT 是施法动作的演出，但 `cast()` 是同步返回 `healed` 的（web 端
     * 拿到就弹 `+N`），所以这里把这类会话当场走完，保证"施法即回血"。
     * 攻击/召唤類仍然逐帧推进，WAIT 真挂起。
     */
    drain(): void {
        let guard = 0;
        while (!this.done && guard++ < MAX_SKILL_FRAMES + 8)
            this.advance();
        if (!this.done)
            this.finish();
    }
    pump(): void {
        const first = this.frames.length === 0;
        const state = this.run.pumpFrame(first);
        const stat = this.run.settleFrame();
        this.frames.push(stat);
        this.frame++;
        this.pendingFrames = this.run.suspendedFrames;
        this.killed += stat.killed;
        this.healed += stat.healed;
        this.hits += stat.hits;
        if (state === 'done') {
            // R187：脚本收尾了，但登记的弹丸还在飞 ⇒ 会话先别结束，空转帧等它落地。
            // 原作里伤害是弹丸撞上目标那一帧由 `ShootObjectCallback` 结算的（dis:3427-3470），
            // 脚本自己的收尾循环（dis:4106-4130）本来就是在等它飞完；端口把这个循环截断在
            // `MAX_SKILL_FRAMES`，所以"等落地"由这里补。
            if (this.run.holdForProjectile()) {
                this.pendingFrames = 0;
                this.holding = true;
                return;
            }
            this.holding = false;
            this.finish();
        }
    }
    finish(): void {
        this.run.finishFrames();
        this.done = true;
        this.ok = this.run.runOk;
        this.reason = this.run.runError;
    }
}
/** 工具/测试注册进来的 SYSTEM.SO 程序。 */
let cachedSystemProgram: SoProgram | undefined;
/**
 * 注册一份 SYSTEM.SO 程序（`SoProgram` 由 `extract/pak/SCRIPT/SYSTEM.SO` 解析而来）。
 *
 * 生产环境不注册：web/Cocos 里 `AllRush` 走 `createBattleSysoHost()`。这个入口留给
 * 测试与工具（以及将来把 `SYSTEM.SO` 打进 `data/` 的轮次）——它是"真字节码"证据链的入口。
 */
export function setSystemProgram(program: SoProgram | undefined): void {
    cachedSystemProgram = program;
}
/** 当前注册的 SYSTEM.SO 程序（没注册就是 undefined）。 */
export function systemProgram(): SoProgram | undefined {
    return cachedSystemProgram;
}
/**
 * 跑 SYSTEM.SO 里的一个具名函数（**真字节码**）。
 *
 * 例：`runSystemSoFunction(world, 'A', 'AllRush', { program })` —— 跑完 `world.rush.A`
 * 已被 `0x120(主将, 0x10000)` 置位，`Rush01` 与「全軍突擊!%k%%e%」进了 `audio_bus` 与 log。
 */
export function runSystemSoFunction(world: World, side: Side, name: string, opts: SystemSoRunOptions = {}): SystemSoScriptResult {
    const program = opts.program ?? cachedSystemProgram;
    if (!program) {
        return {
            ok: false,
            ran: false,
            log: [`SYSTEM.SO 未注册（${name}）：浏览器里没有 .SO 字节码，走宿主通道 createBattleSysoHost()`],
            instructions: 0,
            syscalls: 0,
        };
    }
    const general = world.units.find((u) => u.isGeneral && u.side === side);
    if (!general) {
        return { ok: false, ran: false, log: [`${side} 方没有主将单位`], instructions: 0, syscalls: 0 };
    }
    const run = new SkillRun(world, side, 0, 0, general.x, general.y, program, {
        trace: opts.trace,
        onInstruction: opts.onInstruction,
        budget: opts.budget,
    });
    return run.executeSystemScript(name);
}
/** `createBattleSysoHost()` 给主将用的句柄（脚本里经 `LDG 2` 取到，即 `0x105/0x120` 的 arg1）。 */
export const SYSTEM_SO_GENERAL_HANDLE = 1;
/**
 * 给一个战场建 SYSTEM.SO 宿主 —— 这是 **web/Cocos 里 `AllRush` 的生产通道**。
 *
 * 与 `runSkill` 里的宿主是同一套端口，只是没有法术物件/命中判定：
 *   - `allRush` → `battle.allRush(world, side)`：全軍突擊的 gameplay 落点；
 *   - `sound` → `audio_bus.emitSfx`（`Rush01` 走这条，0..255 音量）；
 *   - `screenFlash` → `audio_bus.emitFlash`（`0x131`/`0x110` 的压暗括号，强度沿用旧实现 0.55）；
 *   - `text` / `trace` → `opts.log`（web 拿它更新状态条，测试拿它断言台词）；
 *   - `global(2)`/`unitAt` → 主将句柄与主将像素坐标（`MoveCamera` 要把镜头推到他头上）。
 *
 * 用法：`const host = createBattleSysoHost(world, 'A', { log }); host.call('AllRush', []);`
 */
export function createBattleSysoHost(world: World, side: Side, opts: SysoHostOptions = {}): SysoHost {
    const log = opts.log ?? [];
    const general = world.units.find((u) => u.isGeneral && u.side === side);
    const say = (line: string): void => {
        log.push(line);
        opts.trace?.(line);
    };
    return new SysoHost({
        allRush: () => allRushSide(world, side),
        sound: (name, volume) => {
            emitSfx({ name, volume, source: 'systemso:sound', clock: world.tick });
        },
        screenFlash: (on) => {
            emitFlash(on, on ? 0.55 : 0, on ? 'systemso:0x131' : 'systemso:0x110', world.tick);
        },
        global: (index) => (index === 2 ? SYSTEM_SO_GENERAL_HANDLE : 0),
        unitAt: (handle) => handle === SYSTEM_SO_GENERAL_HANDLE && general
            ? {
                x: general.x * 96,
                y: general.y * 72,
                col: Math.round(general.x),
                row: Math.round(general.y),
            }
            : undefined,
        text: (speaker, line) => say(`台词[${speaker}] ${line}`),
        trace: (line) => say(line),
    }, { seed: 0x51c0 });
}
