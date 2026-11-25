/**
 * SmartScript 虚拟机（纯 TS，无 DOM）。
 *
 * 语义来源：`docs/04-脚本引擎SmartScript.md`——解释器主循环 0x467F50、90 项跳转表、
 * 栈元素 8 B {value,type}、CALL/RET 约定、WAIT/WAITFOR/CALLS、引擎全局 0x4A6878。
 *
 * 与原作的两处刻意差异（见 project/28_脚本虚拟机移植.md）：
 *   1. 同步执行：WAIT 只推进虚拟帧，不真正挂起 VM（战斗层 cast() 必须同步返回）。
 *   2. 字符串是不可变 JS 字符串，不做引用计数回收。
 */

import { type Instruction, type SoFunction, type SoProgram, OPCODES } from './so.ts';

export type SlotType = 0 | 2;
export type SlotValue = number | string | number[];

export interface Slot {
  value: SlotValue;
  /** 0 = 数值（整数/浮点共用），2 = 字符串 */
  type: SlotType;
}

export interface VmHost {
  /** 返回 undefined 表示该 syscall 无返回值。 */
  syscall(id: number, args: Slot[], vm: ScriptVm): Slot | undefined;
  /** 虚拟帧推进（原作挂起 n 帧）。 */
  wait(frames: number): void;
  /** 同名脚本同步点（原作轮询活动 VM 列表）。 */
  waitFor(name: string): void;
}

export interface VmOptions {
  /** 单帧的指令预算，超出抛"疑似死循环"。帧边界 = WAIT / invoke，见 `beginFrame()`。 */
  budget?: number;
  /** 嵌套 CALLS / syscall 0x310–0x314 的最大深度。 */
  maxCallDepth?: number;
  /** 引擎全局数组长度（原作 0x4A6878 起）。 */
  engineSlots?: number;
  /**
   * 借用外部引擎数组（原作 `0x4A6878` 全场只有**一份**，所有活动脚本读写同一块）。
   *
   * `0x312/0x314` 起的并发脚本实例用它共享父实例的数组：传进来就直接用这个对象，
   * 不新建、不拷贝 —— 拷贝会让子脚本的 `STE` 与父脚本的 `LDG` 各看各的，
   * 而原作里两者是同一个下标同一格。`engineSlots` 由数组长度决定，传了它就忽略。
   */
  engine?: Int32Array;
  /**
   * R163：借用外部**槽位全局表**（`STG`/`LDSG`，121 槽）。
   *
   * 原作这张表属于"这一次施法的 MagicDef 槽"，**同一次施法的所有脚本实例共享一份**：
   * `DemonDancing`（`func #149`）每次循环 `STG g16 = 2`（`magic_so.dis.txt:12156`），
   * 而读它的是另一条脚本 `DemonDancingCallback`（`func #147`，`LDSG g16`），
   * 两者是不同的脚本实例 —— 不共享就永远读到 0。
   * 不传则各实例自建（旧行为）。
   */
  globals?: Slot[];
}

/**
 * WAIT 挂起哨兵：宿主的 `wait()` 调 `requestWait()` 抛出它，`exec()` 的循环
 * 借异常展开把控制权交回 `pump()`，**不销毁**栈/帧/pc（原作的协程挂起）。
 * 只有 `pump/resume` 会捕获它，脚本自己的异常照常向上抛。
 */
export class VmSuspend extends Error {
  frames: number;
  constructor(frames: number) {
    super(`SmartScript: WAIT 挂起 ${frames} 帧`);
    this.name = 'VmSuspend';
    this.frames = frames;
  }
}

/** `pump()` / `resume()` 的返回：挂起（带剩余帧数）或脚本返回。 */
export type VmPumpResult =
  | { state: 'wait'; frames: number }
  | { state: 'done'; value: Slot | undefined };

export const DEFAULT_BUDGET = 200_000;
export const DEFAULT_MAX_CALL_DEPTH = 32;
const DEFAULT_ENGINE_SLOTS = 512;

/**
 * 纯表现子脚本：只播动画、不产出战斗效果。它们的 WAIT 不该占用施法者的时间线
 * （原作里这类 CALLS 是并行实例）。目前只有 `StepShow` —— `func #41 @0x3A60`：
 * `0x29(obj,262144)` 现身 → `WAIT 20` → 循环 16 次 `0x27(obj,i); WAIT arg1(=10)` → `0x2B` 收尾。
 * 補兵族每造一个兵就 `CALLS "StepShow"`（`magic_so.dis.txt:3020-3070`），
 * 17 个兵 = 3060 帧、45 个兵 = 8100 帧，会撞 `MAX_SKILL_FRAMES=1200`
 * （实测 `伏兵軍陣` 只出到第 7 个兵就被截断）。见 `callKinds`。
 */
const TIMELESS_SUBSCRIPTS = new Set(['StepShow']);

const num = (v: SlotValue): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0);
const int32 = (n: SlotValue): number => {
  const v = num(n);
  return Number.isFinite(v) ? Math.trunc(v) | 0 : 0;
};
const fround = (n: SlotValue): number => Math.fround(num(n));

export class ScriptVm {
  readonly program: SoProgram;
  readonly host: VmHost;

  /** 每脚本 121 个全局槽（8 B/槽，脚本间不共享）。 */
  readonly globals: Slot[];
  /** 引擎 int 数组（原作 0x4A6878，LDG/STG/STE 访问）。 */
  readonly engine: Int32Array;
  readonly engineSlots: number;

  readonly stack: Slot[] = [];
  frame = -1;
  pc = 0;
  steps = 0;
  /** SYSCALL 执行次数（统计/文档用）。 */
  syscallCount = 0;
  /** 每个 opcode 的命中次数，下标即 opcode。 */
  readonly hits = new Int32Array(0x60);
  /** 调试钩子：设置后每次 CALL/CALLS 会回调一行描述（测试与排错用）。 */
  trace?: (text: string) => void;
  /** 调试钩子：每条指令执行前回调（排错用）。 */
  onInstruction?: (ins: Instruction) => void;

  private readonly budget: number;
  private readonly maxCallDepth: number;
  private callDepth = 0;
  /**
   * 脚本内调用栈的种类栈：`1` = **纯表现子脚本**（`TIMELESS_SUBSCRIPTS`），`0` = 普通调用
   * （CALL `0x04` 与普通 CALLS `0x47`）。栈顶 == 1 表示"当前函数是纯表现子脚本"。
   *
   * 用途：`StepShow`（`func #41 @0x3A60`）只做物件现身/16 帧逐帧换图/收尾
   * （`0x29(obj,262144)`、循环 16 次 `0x27(obj,i)`、`0x2B`），**不产生任何战斗效果**；
   * 原作里它由 CALLS 另起一条实例跑，时间线与施法者并行，所以它的 17 段 WAIT
   * （20 + 16×10 = 180 帧）在真机上并不占用施法者的帧数。
   * 端口没有逐帧贴图，这些 WAIT 纯属空转：若不摘出去，補兵族每造一个兵就要
   * 180 帧，`伏兵軍陣`（45 个兵）要 8100 帧，必然撞 `MAX_SKILL_FRAMES=1200`
   * 被截断（实测只出 7 个兵）。`runtime.wait()` 据此把这类子脚本的每段 WAIT 压成 1 帧。
   */
  private readonly callKinds: number[] = [];
  /** `enter()` 的存档：挂起时不恢复，续跑时才知道该回哪一层。 */
  private enterStates: Array<{ stack: number; frame: number; pc: number }> = [];
  /** 停在 `requestWait()` 上（栈/帧/pc 均保留）。 */
  private suspended = false;
  private waitFrames = 0;
  /** 本帧起点（`steps` 快照），预算按帧计。 */
  private stepsAtPump = 0;

  constructor(program: SoProgram, host: VmHost, opts: VmOptions = {}) {
    this.program = program;
    this.host = host;
    this.budget = opts.budget ?? DEFAULT_BUDGET;
    this.maxCallDepth = opts.maxCallDepth ?? DEFAULT_MAX_CALL_DEPTH;
    // 传了 `engine` 就借用（并发实例共享 0x4A6878 的那一份），否则按 engineSlots 新建。
    this.engineSlots = opts.engine ? opts.engine.length : (opts.engineSlots ?? Math.max(DEFAULT_ENGINE_SLOTS, program.globalSlots + 8));
    this.globals =
      opts.globals ?? Array.from({ length: Math.max(1, program.globalSlots) }, () => ({ value: 0, type: 0 as SlotType }));
    this.engine = opts.engine ?? new Int32Array(this.engineSlots);
  }

  get depth(): number {
    return this.stack.length;
  }

  push(value: SlotValue, type: SlotType = 0): void {
    this.stack.push({ value, type });
  }

  pushSlot(slot: Slot): void {
    this.stack.push({ value: slot.value, type: slot.type });
  }

  pop(): Slot {
    const s = this.stack.pop();
    if (!s) throw new Error('SmartScript: 栈下溢（pop 空栈）');
    return s;
  }

  popNum(): number {
    return num(this.pop().value);
  }

  popStr(): string {
    const s = this.pop();
    return typeof s.value === 'string' ? s.value : String(num(s.value));
  }

  peekNum(depthFromTop = 0): number {
    const i = this.stack.length - 1 - depthFromTop;
    return i >= 0 ? num(this.stack[i].value) : 0;
  }

  setGlobal(index: number, value: SlotValue, type: SlotType = 0): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.globals.length) {
      throw new Error(`SmartScript: 脚本全局槽越界 ${index}（0..${this.globals.length - 1}）`);
    }
    this.globals[index] = { value, type };
  }

  getGlobal(index: number): Slot {
    if (!Number.isInteger(index) || index < 0 || index >= this.globals.length) {
      throw new Error(`SmartScript: 脚本全局槽越界 ${index}（0..${this.globals.length - 1}）`);
    }
    return this.globals[index];
  }

  /** 引擎全局（原作 0x4A6878 数组，脚本里用 LDG/STG/STE 访问）。 */
  engineValue(index: number): number {
    const i = this.engineIndex(index);
    return this.engine[i] | 0;
  }

  setEngineValue(index: number, value: number): void {
    this.engine[this.engineIndex(index)] = value | 0;
  }

  get opcodesHit(): number {
    let n = 0;
    for (let i = 0; i < this.hits.length; i++) if (this.hits[i] > 0) n++;
    return n;
  }

  // ── 运行入口 ───────────────────────────────────────────────────────────
  runByNum(numValue: number): Slot | undefined {
    const fn = this.program.functionByNum(numValue);
    if (!fn) throw new Error(`SmartScript: 找不到函数 num=0x${numValue.toString(16)}`);
    return this.invoke(fn, []);
  }

  runByName(name: string, args: Slot[] = []): Slot | undefined {
    const fn = this.program.functionByName(name);
    if (!fn) throw new Error(`SmartScript: 找不到函数 ${name}`);
    return this.invoke(fn, args);
  }

  /** CALLS / 0x310–0x314 用：找不到名字时静默返回 undefined（原作返回 0）。 */
  invokeByName(name: string, args: Slot[]): Slot | undefined {
    const fn = this.program.functionByName(name);
    if (!fn) return undefined;
    return this.invoke(fn, args);
  }

  /**
   * 同步调用：一口气跑到脚本返回。
   * 挂起（WAIT 走 `requestWait()`）时保留栈/帧/pc 供 `resume()` 续跑，
   * 其余情况在 finally 里恢复调用者的栈顶。
   */
  invoke(fn: SoFunction, args: Slot[]): Slot | undefined {
    this.enter(fn, args);
    try {
      return this.exec();
    } finally {
      if (!this.suspended) this.leave();
    }
  }

  // ── 协程式驱动（逐帧技能用） ───────────────────────────────────────────
  /** 当前是否停在某个 `requestWait()` 上等 `resume()`。 */
  get isSuspended(): boolean {
    return this.suspended;
  }

  /** 正在挂起的剩余帧数（未挂起时为 0）。 */
  get suspendedFrames(): number {
    return this.suspended ? this.waitFrames : 0;
  }

  /** 当前 JS 调用深度：>1 表示正在宿主 syscall 的嵌套 `invoke` 里，不能安全挂起。 */
  get callDepthNow(): number {
    return this.callDepth;
  }

  /** 栈顶这一层是不是 CALLS（`0x47`）进来的子脚本。 */
  get inCallsFrame(): boolean {
    return this.callKinds.length > 0 && this.callKinds[this.callKinds.length - 1] === 1;
  }

  /**
   * 逐帧调试：把"本帧已用指令数"归零。
   * 同步模型下由宿主在每个 WAIT 边界调用，使预算按帧而不是按整段脚本计
   * （606 劍輪舞 280 帧共 52.8 万条指令，整段计必然误报死循环）。
   */
  beginFrame(): void {
    this.stepsAtPump = this.steps;
  }

  /** 本帧已执行的指令数。 */
  get frameSteps(): number {
    return this.steps - this.stepsAtPump;
  }

  /** 启动一次可挂起的执行，跑到第一个 WAIT 或脚本返回。 */
  pump(fn: SoFunction, args: Slot[] = []): VmPumpResult {
    this.enter(fn, args);
    return this.pumpInner();
  }

  /** 从上次的 WAIT 挂起点继续，跑到下一个 WAIT 或脚本返回。 */
  resume(): VmPumpResult {
    if (!this.suspended) return { state: 'done', value: undefined };
    this.suspended = false;
    return this.pumpInner();
  }

  /**
   * 宿主在 WAIT 指令里调用：记下剩余帧数并抛出挂起哨兵。
   * 返回类型是 never，宿主可以写成 `return this.vm.requestWait(n)`。
   * 必须先置 `suspended` 再抛：`invoke` 的 finally 与 `pumpInner` 的 catch
   * 都靠这个标志区分"挂起"与"异常"。
   */
  requestWait(frames: number): never {
    this.waitFrames = Math.max(0, Math.trunc(frames) || 0);
    this.suspended = true;
    throw new VmSuspend(this.waitFrames);
  }

  private pumpInner(): VmPumpResult {
    this.stepsAtPump = this.steps;
    try {
      const value = this.exec();
      this.leaveAll();
      return { state: 'done', value };
    } catch (err) {
      if (err instanceof VmSuspend) return { state: 'wait', frames: this.waitFrames };
      this.leaveAll();
      throw err;
    }
  }

  /** 压参并建立一帧，返回前不恢复（由 `leave`/`leaveAll` 恢复）。 */
  private enter(fn: SoFunction, args: Slot[]): void {
    if (this.callDepth >= this.maxCallDepth) {
      throw new Error(`SmartScript: 调用深度超过 ${this.maxCallDepth}（${fn.name}）`);
    }
    this.callDepth++;
    this.enterStates.push({ stack: this.stack.length, frame: this.frame, pc: this.pc });
    if (this.callDepth === 1) this.callKinds.length = 0;
    // 调用者按 argN..arg1 顺序压实参，arg1 在栈顶
    for (let i = args.length - 1; i >= 0; i--) this.pushSlot(args[i]);
    this.push(0); // 返回地址哨兵：0 表示本次 invoke 的最外层
    this.push(this.frame); // 旧 frame
    this.frame = this.stack.length - 1;
    this.pc = fn.off;
  }

  /** 退出最内层 `enter`，恢复调用者视角的栈/帧/pc。 */
  private leave(): void {
    const saved = this.enterStates.pop();
    this.callDepth--;
    if (!saved) return;
    this.stack.length = saved.stack;
    this.frame = saved.frame;
    this.pc = saved.pc;
  }

  /** 丢弃整棵调用栈（脚本返回 / 正常异常收尾）。 */
  private leaveAll(): void {
    const first = this.enterStates[0];
    this.callDepth -= this.enterStates.length;
    this.enterStates.length = 0;
    this.suspended = false;
    if (!first) return;
    this.stack.length = first.stack;
    this.frame = first.frame;
    this.pc = first.pc;
  }

  private exec(): Slot | undefined {
    for (;;) {
      // 预算按"帧"计：stepsAtPump 在 pump/resume/beginFrame 处归零
      if (this.steps++ - this.stepsAtPump > this.budget) {
        // 报错文本保持与旧版一致（docs/28 §7 仍在引用这句话）
        throw new Error(`SmartScript: 疑似死循环，单次执行超过 ${this.budget} 条指令（pc=0x${this.pc.toString(16)}）`);
      }
      const ins = this.program.decode(this.pc);
      this.pc = ins.next;
      this.hits[ins.op]++;
      if (this.onInstruction) this.onInstruction(ins);
      const ret = this.step(ins);
      if (ret !== undefined && ret.finished) return ret.value;
    }
  }

  /** 执行一条指令；finished=true 表示这一嵌套层已经返回（返回地址为 0）。 */
  private step(ins: Instruction): { finished: boolean; value: Slot | undefined } | undefined {
    const { op, a, b } = ins;
    switch (op) {
      case 0x00:
      case 0x41:
      case 0x43:
      case 0x44:
        return undefined; // NOP

      case 0x01: {
        // RETV n：弹返回值 → 清理局部 → 恢复 frame/返回地址 → 弹 n 个实参 → 压返回值
        const value = this.pop();
        return this.doReturn(a, value);
      }
      case 0x02:
        return this.doReturn(a, undefined);

      case 0x03: {
        // PUSHN n：预留 loc1..locn（原作压 n 个全零槽）
        for (let i = 0; i < a; i++) this.push(0);
        return undefined;
      }

      case 0x04: {
        // CALL：实参已由调用者按 argN..arg1 压栈
        if (a < this.program.codeStart || a >= this.program.codeEnd) {
          throw new Error(`SmartScript: CALL 目标越界 0x${a.toString(16)} @0x${ins.off.toString(16)}`);
        }
        if (this.trace) {
          const fn = this.program.functionAt(a);
          const argc = fn?.argc ?? 0;
          const args: string[] = [];
          for (let k = 0; k < argc; k++) {
            const s = this.stack[this.stack.length - 1 - k];
            args.push(s ? `${s.value}` : '?');
          }
          this.trace(`CALL ${fn?.name ?? a} argc=${argc} args=[${args.join(',')}]`);
        }
        this.push(ins.next);
        this.push(this.frame);
        this.frame = this.stack.length - 1;
        this.callKinds.push(0); // CALL = 同栈内联
        this.pc = a;
        return undefined;
      }

      case 0x05: {
        // SYSCALL：操作数 (id, flags)；flags 低 16 位 argc，高 16 位 ret 类型
        const argc = b & 0xffff;
        const retType = b >>> 16;
        const args = new Array<Slot>(argc);
        for (let i = argc - 1; i >= 0; i--) args[i] = this.pop();
        this.syscallCount++;
        const result = this.host.syscall(a, args, this);
        if (retType !== 0) {
          if (result === undefined) {
            throw new Error(`SmartScript: syscall 0x${a.toString(16)} 声明有返回值（ret=${retType}）但宿主返回空`);
          }
          this.pushSlot(result);
        }
        return undefined;
      }

      case 0x06:
        this.push(int32(a));
        return undefined;

      case 0x07:
        this.push(this.program.stringAt(a), 2);
        return undefined;

      case 0x08:
        this.pushSlot(this.getLocal(a, ins.off));
        return undefined;

      case 0x09:
        this.pushSlot(this.getGlobal(a));
        return undefined;

      case 0x0a:
        this.push(this.engineValue(a));
        return undefined;

      case 0x0b: {
        const v = this.pop();
        this.setLocal(a, v, ins.off);
        return undefined;
      }

      case 0x0c:
        this.setGlobal(a, this.pop().value, 0);
        return undefined;

      case 0x0d:
        // STE：按立即数下标写引擎数组（原作用法仅 F103）
        this.setEngineValue(a, this.popNum());
        return undefined;

      case 0x0e:
        this.pop();
        return undefined;

      case 0x0f:
        this.binop((x, y) => int32(int32(x) + int32(y)));
        return undefined;
      case 0x10:
        this.binop((x, y) => fround(fround(x) + fround(y)));
        return undefined;
      case 0x11:
        // 0x11：脚本中 0 次出现，语义未定；按整数加实现（文档“已知偏差”）
        this.binop((x, y) => int32(int32(x) + int32(y)));
        return undefined;
      case 0x12:
        this.binop((x, y) => int32(int32(x) - int32(y)));
        return undefined;
      case 0x13:
        this.binop((x, y) => fround(fround(x) - fround(y)));
        return undefined;
      case 0x14:
        this.binop((x, y) => int32(int32(x) * int32(y)));
        return undefined;
      case 0x15:
        this.binop((x, y) => fround(fround(x) * fround(y)));
        return undefined;
      case 0x16:
        this.binop((x, y) => (int32(y) === 0 ? 0 : int32(int32(x) / int32(y))));
        return undefined;
      case 0x17:
        this.binop((x, y) => (fround(y) === 0 ? 0 : fround(fround(x) / fround(y))));
        return undefined;
      case 0x18:
        this.binop((x, y) => (int32(y) === 0 ? 0 : int32(x) % int32(y)));
        return undefined;
      case 0x19:
        // 0x19：脚本中 0 次出现，语义未定；按取余实现
        this.binop((x, y) => (int32(y) === 0 ? 0 : int32(x) % int32(y)));
        return undefined;
      case 0x1a:
        this.unop((x) => int32(-int32(x)));
        return undefined;
      case 0x1b:
        this.unop((x) => -fround(x));
        return undefined;
      case 0x1c:
        this.unop((x) => int32(~int32(x)));
        return undefined;

      case 0x1d:
        this.incLocal(a, 1, ins.off);
        return undefined;
      case 0x1e:
        this.bumpSlot(this.getGlobal(a), 1);
        return undefined;
      case 0x1f:
        this.setEngineValue(a, this.engineValue(a) + 1);
        return undefined;
      case 0x20:
        this.incLocal(a, -1, ins.off);
        return undefined;
      case 0x21:
        this.bumpSlot(this.getGlobal(a), -1);
        return undefined;
      case 0x22:
        this.setEngineValue(a, this.engineValue(a) - 1);
        return undefined;

      case 0x23:
        this.binop((x, y) => int32(int32(x) & int32(y)));
        return undefined;
      case 0x24:
        this.binop((x, y) => int32(int32(x) | int32(y)));
        return undefined;
      case 0x25:
        this.binop((x, y) => int32(int32(x) ^ int32(y)));
        return undefined;

      case 0x26:
      case 0x27:
        this.binop((x, y) => (x === y ? 1 : 0));
        return undefined;
      case 0x28:
        this.binop((x, y) => (String(x) === String(y) ? 1 : 0));
        return undefined;
      case 0x29:
      case 0x2a:
        this.binop((x, y) => (x !== y ? 1 : 0));
        return undefined;
      case 0x2b:
        this.binop((x, y) => (String(x) !== String(y) ? 1 : 0));
        return undefined;
      case 0x2c:
        this.binop((x, y) => (int32(x) > int32(y) ? 1 : 0));
        return undefined;
      case 0x2d:
        this.binop((x, y) => (fround(x) > fround(y) ? 1 : 0));
        return undefined;
      case 0x2e:
        this.binop((x, y) => (String(x) > String(y) ? 1 : 0));
        return undefined;
      case 0x2f:
        this.binop((x, y) => (int32(x) >= int32(y) ? 1 : 0));
        return undefined;
      case 0x30:
        this.binop((x, y) => (fround(x) >= fround(y) ? 1 : 0));
        return undefined;
      case 0x31:
        this.binop((x, y) => (String(x) >= String(y) ? 1 : 0));
        return undefined;
      case 0x32:
        this.binop((x, y) => (int32(x) < int32(y) ? 1 : 0));
        return undefined;
      case 0x33:
        this.binop((x, y) => (fround(x) < fround(y) ? 1 : 0));
        return undefined;
      case 0x34:
        this.binop((x, y) => (String(x) < String(y) ? 1 : 0));
        return undefined;
      case 0x35:
        this.binop((x, y) => (int32(x) <= int32(y) ? 1 : 0));
        return undefined;
      case 0x36:
        this.binop((x, y) => (fround(x) <= fround(y) ? 1 : 0));
        return undefined;
      case 0x37:
        this.binop((x, y) => (String(x) <= String(y) ? 1 : 0));
        return undefined;

      case 0x38:
        this.unop((x) => (int32(x) === 0 ? 1 : 0));
        return undefined;
      case 0x39:
        this.binop((x, y) => (int32(x) !== 0 && int32(y) !== 0 ? 1 : 0));
        return undefined;
      case 0x3a:
        this.binop((x, y) => (int32(x) !== 0 || int32(y) !== 0 ? 1 : 0));
        return undefined;

      case 0x3b:
        this.pc = a;
        return undefined;
      // L1（project/154 §1.5 / §5；project/159 §1）：0x3C/0x3D 的跳转极性按 EXE 实作。
      //   0x3C handler @0x464660：`edi=fetchImm(); eax=pop(); test eax,eax; je +3; mov [esi+0x10],edi`
      //     ⇒ 弹出值 == 0 时**不跳**，≠0 才改 pc ⇒ **条件为真时跳**。
      //   0x3D handler @0x464690：`... test eax,eax; jne +3; mov [esi+0x10],edi`
      //     ⇒ 弹出值 ≠ 0 时不跳，==0 才改 pc ⇒ **条件为假时跳**。
      //   交叉自洽：InitializeBattle @0x3AAD4 `LDSL loc1; PUSHI 60; LT; 3D L3AB18` 是 for 出口
      //   （循环体只 INCL loc1、回边在 0x3AB10），只有"LT 为假才跳"才不是死代码；
      //   HitGeneral @0x3B3C `LDSG g3; JNZ L03B54`（g3=0 进 body 再置 1）同理。
      //   ⇒ `export/script/_opcode_table.md` 里 `0x3C JZ / 0x3D JNZ` 的命名也是反的
      //     （`so.ts` 的表沿用旧命名，只影响可读性，语义以本处为准）。
      //   极性必须与 binop 左右序（L2）**同时**成立：旧端口是"极性反 + 操作数反"两处相互抵消，
      //   只对 LT/GT/LE/GE 这类有序比较成立；EQ/NE 对称，抵消不了 ⇒ 補兵/伤害门全反。
      //   R89 曾单独改这里 ⇒ 全量掉 7 条（606 帧数/指令数、神鬼亂舞、R87 旋龍、R52 音量），
      //   根因不是极性而是端口缺少**并发脚本实例**（project/154 §1.6）；L0 补上实例队列后
      //   这里才落地（project/159 §1）。
      //   脚本侧自洽再加 4 处（project/154 §1.5）：F104 @0x3A840 `LDSG g120; PUSHI 501; LT; 3D`
      //     得到 `g120<501 ? g120=501 : g120++`；DemonDancing @0x1511C `loc2; LDG 3; EQ; 3D L1563C`
      //     只在"目标不在正前方"时造恶魔（`0x11(G2,24001,loc7,0)` + `0x314 LockTargetXY`）。
      case 0x3c:
        if (this.popNum() !== 0) this.pc = a;
        return undefined;
      case 0x3d:
        if (this.popNum() === 0) this.pc = a;
        return undefined;

      case 0x3e:
        this.binop((x, y) => int32(int32(x) << (int32(y) & 31)));
        return undefined;
      case 0x3f:
        this.binop((x, y) => int32(int32(x) >> (int32(y) & 31)));
        return undefined;

      case 0x40: {
        // CASE：v=pop(); if(v==imm) pc=target; else push(v)
        const v = this.pop();
        if (int32(v.value) === int32(a)) this.pc = b;
        else this.pushSlot(v);
        return undefined;
      }

      case 0x42:
        this.host.wait(this.popNum());
        return undefined;

      case 0x45:
        this.host.waitFor(this.popStr());
        return undefined;

      case 0x46: {
        // FINDVM：脚本中 0 次出现；按"弹句柄、压 0"实现（文档标注推测）
        this.pop();
        this.push(0);
        return undefined;
      }

      case 0x47: {
        // CALLS：定长 4 槽的实参块，名字压在块**底下**：
        //   PUSHS name; argN; ...; arg2; arg1; (补零到 4 槽); CALLS
        // 所以块 = [a2, b2, c, d]（压栈顺序，底→顶）里**最底下 argc 个**才是真参，
        // 反转之后才是 arg1..argN；多出来的槽是调用点补的 0（不是实参）。
        const d = this.pop();
        const c = this.pop();
        const b2 = this.pop();
        const a2 = this.pop();
        const name = this.popStr();
        if (this.trace) this.trace(`CALLS ${name} argc=${this.program.functionByName(name)?.argc ?? 0} block=[${a2.value},${b2.value},${c.value},${d.value}]`);
        const fn = this.program.functionByName(name);
        if (!fn) return undefined; // 原作找不到函数时按 0 处理（旧路径同样不压栈）
        // L3（project/154 §1.5 #3 / §5；project/159 §1）：正确取法 = `[a2,b2,c,d].slice(0, argc).reverse()`。
        //   0x467490 依次 pop 5 槽（pop1=块顶 … pop5=名字），再按
        //   `push name; push pop4; push pop3; push pop2; push pop1` 调 0x4653F0；
        //   0x4653F0 从 **pop4**（名字之上那槽）起顺序压 `fn->argc` 个槽
        //   （`0x465497` 拷 `[esp+0x84]`→局部数组、`0x4654B2` 逐个 `0x467CE0` push），
        //   而 LDSL argN = frame-1-N、frame 指在刚压进去的旧 frame 上
        //   ⇒ **arg1 = 这批里最后压的那个 = 数组第 argc-1 项**；多出来的槽是调用点补位的 0。
        //   被调方交叉验证：ProduceSoldier(argc=2) 调用点压 `loc3(side); loc7(need)`，
        //   函数体 `LDSL arg1` 当循环上界（= need）、`LDSL arg2` 当阵营（= side，
        //   `EQ(arg2,1)` 走 x=70-x 镜像）；StepShow(argc=2) 调用点压 `loc5(handle); PUSHI 10`，
        //   函数体 `LDSL arg1; WAIT`。
        //   旧端口是 `[d,c,b2,a2]`（块顶当 arg1），只在 argc=4 时与正确取法一致。
        //   单独改它会连带打断 R87（`work/vmfix_tests_legacycalls.log`：1261 vs 1260），
        //   必须与 L1/L2 一起、且在 L0 的实例队列之上落地。
        this.callInline(fn, [a2, b2, c, d].slice(0, fn.argc).reverse(), ins.next);
        return undefined;
      }

      case 0x48:
        this.unop((x) => fround(int32(x)));
        return undefined;
      case 0x49:
        this.unop((x) => String(int32(x)), 2);
        return undefined;
      case 0x4a:
        this.unop((x) => int32(fround(x)));
        return undefined;
      case 0x4b:
        this.unop((x) => String(fround(x)), 2);
        return undefined;
      case 0x4c:
        // 0x4C：脚本中 0 次出现；按整数加实现
        this.binop((x, y) => int32(int32(x) + int32(y)));
        return undefined;
      case 0x4d:
        // 0x4D：脚本中 0 次出现；按取余实现
        this.binop((x, y) => (int32(y) === 0 ? 0 : int32(x) % int32(y)));
        return undefined;

      case 0x4e: {
        // LDSLS：pop index → push local 槽数组元素
        const idx = this.popNum();
        this.pushSlot(this.arrayRead(this.localIndex(a, ins.off), idx, ins.off));
        return undefined;
      }
      case 0x4f: {
        // LDSGS：pop index → push 脚本全局槽数组元素
        const idx = this.popNum();
        this.pushSlot(this.arrayReadGlobal(a, idx, ins.off));
        return undefined;
      }
      case 0x50: {
        // LDGIDX：pop index → push engine[index + operand]
        const idx = this.popNum();
        this.push(this.engineValue(idx + a));
        return undefined;
      }
      case 0x51: {
        // STLIDX：pop index, pop value → 存 local 数组
        const idx = this.popNum();
        const v = this.pop();
        this.arrayWrite(this.localIndex(a, ins.off), idx, v, ins.off);
        return undefined;
      }
      case 0x52: {
        // STGIDX：pop index, pop value → 存脚本全局数组
        const idx = this.popNum();
        const v = this.pop();
        this.arrayWriteGlobal(a, idx, v, ins.off);
        return undefined;
      }
      case 0x53: {
        // STEIDX：pop index, pop value → engine[index + operand]
        const idx = this.popNum();
        const v = this.popNum();
        this.setEngineValue(idx + a, v);
        return undefined;
      }
      case 0x54: {
        const idx = this.popNum();
        this.arrayBump(this.localIndex(a, ins.off), idx, 1, ins.off);
        return undefined;
      }
      case 0x55: {
        const idx = this.popNum();
        const g = this.getGlobal(a);
        const arr = this.ensureArray(g, `g${a}`, ins.off);
        arr[idx] = num(arr[idx] ?? 0) + 1;
        return undefined;
      }
      case 0x56: {
        const idx = this.popNum();
        this.setEngineValue(idx + a, this.engineValue(idx + a) + 1);
        return undefined;
      }
      case 0x57: {
        const idx = this.popNum();
        this.arrayBump(this.localIndex(a, ins.off), idx, -1, ins.off);
        return undefined;
      }
      case 0x58: {
        const idx = this.popNum();
        const g = this.getGlobal(a);
        const arr = this.ensureArray(g, `g${a}`, ins.off);
        arr[idx] = num(arr[idx] ?? 0) - 1;
        return undefined;
      }
      case 0x59: {
        const idx = this.popNum();
        this.setEngineValue(idx + a, this.engineValue(idx + a) - 1);
        return undefined;
      }

      default:
        throw new Error(`SmartScript: 未实现的 opcode 0x${op.toString(16)} @0x${ins.off.toString(16)}`);
    }
  }

  /**
   * 把脚本内的一次调用压进当前 exec 循环（CALLS 用），不增长宿主栈。
   * 只压实参的前 `fn.argc` 个：RET 按同一数量弹，多压会污染栈；
   * 旧实现压了 4 个再靠 invoke 的 finally 兜底，等价但没法挂起。
   */
  private callInline(fn: SoFunction, args: Slot[], retAddr: number): void {
    const argc = Math.max(0, fn.argc | 0);
    for (let i = argc - 1; i >= 0; i--) {
      const slot = args[i];
      if (slot) this.pushSlot(slot);
      else this.push(0);
    }
    this.push(retAddr);
    this.push(this.frame);
    this.frame = this.stack.length - 1;
    // 只有"纯表现"子脚本才把自己的 WAIT 从战斗时间线里摘出去（见 callKinds 注释）。
    this.callKinds.push(TIMELESS_SUBSCRIPTS.has(fn.name) ? 1 : 0);
    this.pc = fn.off;
  }

  private doReturn(argc: number, value: Slot | undefined): { finished: boolean; value: Slot | undefined } {
    if (this.callKinds.length > 0) this.callKinds.pop();
    const fr = this.frame;
    if (fr < 0) throw new Error('SmartScript: RET 时 frame 非法');
    this.stack.length = fr + 1; // 丢弃局部
    const oldFrameSlot = this.stack[fr];
    this.stack.length = fr; // 丢弃旧 frame
    const retAddrSlot = this.stack[fr - 1];
    this.stack.length = Math.max(0, fr - 1); // 丢弃返回地址
    const n = Math.max(0, argc | 0);
    this.stack.length = Math.max(0, this.stack.length - n); // 丢弃实参
    this.frame = oldFrameSlot ? num(oldFrameSlot.value) : -1;
    if (value !== undefined) this.pushSlot(value);
    const retAddr = retAddrSlot ? num(retAddrSlot.value) : 0;
    if (retAddr !== 0) {
      this.pc = retAddr;
      return { finished: false, value: undefined };
    }
    return { finished: true, value };
  }

  // ── 寻址 ───────────────────────────────────────────────────────────────
  private engineIndex(i: number): number {
    const idx = i | 0;
    if (idx < 0 || idx >= this.engineSlots) {
      throw new Error(`SmartScript: 引擎数组下标越界 ${idx}（0..${this.engineSlots - 1}）`);
    }
    return idx;
  }

  /** 局部/参数槽位：frame + idx（idx>0 是局部，idx<0 是参数，arg1 = -2）。 */
  private localIndex(idx: number, off: number): number {
    const i = this.frame + idx;
    if (this.frame < 0 || i < 0 || i >= this.stack.length) {
      throw new Error(`SmartScript: 局部槽越界 frame${idx >= 0 ? '+' : ''}${idx}=${i} @0x${off.toString(16)}`);
    }
    return i;
  }

  private getLocal(idx: number, off: number): Slot {
    return this.stack[this.localIndex(idx, off)];
  }

  private setLocal(idx: number, slot: Slot, off: number): void {
    this.stack[this.localIndex(idx, off)] = { value: slot.value, type: slot.type };
  }

  private incLocal(idx: number, delta: number, off: number): void {
    const i = this.localIndex(idx, off);
    this.stack[i] = { value: num(this.stack[i].value) + delta, type: 0 };
  }

  private bumpSlot(slot: Slot, delta: number): void {
    slot.value = num(slot.value) + delta;
    slot.type = 0;
  }

  private ensureArray(slot: Slot, name: string, off: number): number[] {
    if (Array.isArray(slot.value)) return slot.value;
    if (num(slot.value) !== 0) {
      throw new Error(`SmartScript: ${name} 不是数组（值=${String(slot.value)}）@0x${off.toString(16)}`);
    }
    const arr: number[] = [];
    slot.value = arr;
    slot.type = 0;
    return arr;
  }

  private arrayRead(slotIndex: number, idx: number, off: number): Slot {
    const slot = this.stack[slotIndex];
    const arr = this.ensureArray(slot, `frame+${slotIndex - this.frame}`, off);
    const v = arr[idx | 0];
    return { value: typeof v === 'number' ? v : 0, type: 0 };
  }

  private arrayWrite(slotIndex: number, idx: number, value: Slot, off: number): void {
    const slot = this.stack[slotIndex];
    const arr = this.ensureArray(slot, `frame+${slotIndex - this.frame}`, off);
    arr[idx | 0] = num(value.value);
  }

  private arrayBump(slotIndex: number, idx: number, delta: number, off: number): void {
    const slot = this.stack[slotIndex];
    const arr = this.ensureArray(slot, `frame+${slotIndex - this.frame}`, off);
    arr[idx | 0] = num(arr[idx | 0] ?? 0) + delta;
  }

  private arrayReadGlobal(index: number, idx: number, off: number): Slot {
    const arr = this.ensureArray(this.getGlobal(index), `g${index}`, off);
    const v = arr[idx | 0];
    return { value: typeof v === 'number' ? v : 0, type: 0 };
  }

  private arrayWriteGlobal(index: number, idx: number, value: Slot, off: number): void {
    const arr = this.ensureArray(this.getGlobal(index), `g${index}`, off);
    arr[idx | 0] = num(value.value);
  }

  private binop(fn: (x: SlotValue, y: SlotValue) => number): void {
    // L2（project/154 §1.5 / §5；project/159 §1）：原作（EXE）里**先压的是左操作数**。
    //   SUB handler @0x463ED0 `edi=pop(); eax=pop(); sub eax,edi; push eax`
    //   ⇒ 结果 = 次顶 − 栈顶，`A;B;SUB` = A−B；
    //   MoveCamera 的 `LDSL arg3; LDSL loc2; SUB`（目标 − 当前）只有这样才能读成"差值"。
    //   同一处机器码也决定 GT/LT/GE/LE（0x2C/0x32/0x2F/0x35）、DIV/MOD/SHL/SHR 的左操作数。
    //   旧端口是"栈顶当左操作数"，与 0x3C/0x3D 的反极性**互相抵消**：LT/GT/LE/GE 门恰好全对，
    //   EQ/NE/LAND/LOR/LNOT 对称抵消不了 ⇒ 那些门是反的（補兵门 / 恶魔门 / Hurt 门都挂在 EQ 上）。
    //   R89 单独改这里会撞红 606 / R52 / 神鬼亂舞 / R87，根因是缺并发脚本模型
    //   （project/154 §1.6）；L0 补上实例队列后与 L1 成对落地。
    const top = this.pop(); // 栈顶 = 右操作数（原作 edi）
    const next = this.pop(); // 次顶 = 左操作数（原作 eax）
    this.push(fn(next.value, top.value));
  }

  private unop(fn: (x: SlotValue) => SlotValue, type: SlotType = 0): void {
    const x = this.pop();
    this.push(fn(x.value), type);
  }
}

export { OPCODES };
