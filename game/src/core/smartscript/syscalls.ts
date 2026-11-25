/**
 * MAGIC.SO ，syscall 层。
 *
 * 语义来源：`export/script/syscall_handlers.asm.txt`（每，handler ，x86 反汇编）
 * ，`docs/04-脚本引擎SmartScript.md`。原作里 syscall 直接读写引擎内存
 * （单位对，+0x08 ，16.16 像素坐标，0x10/+0x12 ，maxHP/HP），这里把这。
 * 内存操作换成 `SyscallContext` 上的显式方法，由 runtime.ts 映射，World。
 *
 * 坐标系：脚本里一律用像素，x/0x60(96)=格列、y/0x48(72)=格行。
 * 参数顺序：SYSCALL 压栈顺序，arg1 ，argN，所，args[0] 就是 arg1。
 */

import type { Slot, SlotValue, ScriptVm } from './vm.ts';

/** 脚本创建的物件（原作 MagicObject）。坐标是像素，*/
export interface SkillObject {
  handle: number;
  /** 资源号，例如 11001，6001；来，0x10/0x11 的参数，*/
  resource: number;
  /** 像素坐标，*/
  x: number;
  y: number;
  z: number;
  /** 宿主单位句柄， = 无），*/
  unit: number;
  /** 0x15 设置的方向（0..255 一整圈，28=左）与速度，*/
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  /** 0x18 设置的持续帧数（物件飞行/存在时长），*/
  frames: number;
  /** 创建时的虚拟帧，*/
  born: number;
  /** 消失的虚拟帧（born + frames， 表示不按帧数消失），*/
  expiresAt: number;
  dead: boolean;
  /** 0x2C 写入的动作号（+0x98），*/
  motion: number;
  /** `0x029`/`0x02B` 读写状态字（原作 `obj+0x30`，R145）。 */
  flags: number;
  /** `0x027` 写入的动画帧号（原作 `obj+0x58`，R145）。 */
  animFrame: number;
  /**
   * `0x02C` 写入的 `obj+0x98`（原作 `0x420291`：`obj[+0x98] = arg2`）。
   *
   * R163 定案：**这是"物件碰撞回调"的脚本号**，不是父/子物件关联号。
   * 证据链：`LockTargetXY`（`magic_so.dis.txt:649-677`）最后 `0x2C(loc1, arg4)`，而
   * `DemonDancing`（`@0x14DE8`）调它时传的 arg4 = 14001；14001 = 0x36B1 =
   * `DemonDancingCallback`（`func #147 @0x14C70`）的 num。引擎侧在
   * `0x40AA82..0x40ABC5` 的物件碰撞判定里读 `obj[+0x98]` 非 0 才 `0x41F740` 起回调。
   */
  param98: number;
  /**
   * R163：挂上 `param98` 那一刻脚本的 `g16`（本击伤害量），只在端口里有意义。
   *
   * 原作是**碰撞那一刻**由 `DemonDancingCallback` 自己 `LDSG g16` 取的，因为原作的
   * 碰撞是逐帧连续发生的；端口的碰撞判定是"一次施法跑完再统一结算"
   * （`execute()` / `settleFrame()`），那时 `g16` 已经被最后一击改成 20 了，
   * 所以要在 `0x2C` 挂回调时把当时的值冻在这里。
   */
  cbDamage?: number;
  /** `0x02E` 写入的 `obj+0x9C + idx*4`（`idx < 3`）。 */
  params: [number, number, number];
}

export interface SyscallContext {
  readonly vm: ScriptVm;
  readonly casterHandle: number;
  readonly targetHandle: number;
  /** 当前虚拟帧（WAIT 推进），*/
  readonly clock: number;

  /** 单位句柄 ，存活单位；找不到返回 undefined，*/
  unitOf(handle: number): { x: number; y: number; z: number; side: number; alive: boolean } | undefined;
  /** 单位句柄；非单位返回 0，*/
  handleOfObject(handle: number): number;
  /**
   * `0x129`（`0x43B375`）/ `0x10D`（`0x43A7AC`）的唯一实参是**阵营/方向**
   * （MAGIC.SO 的 55 个调用点全是 `LDG 5; PUSHI 1; XOR`，即 `g5 ^ 1`），
   * 返回该方主将的句柄（原作是"该方主将/其身体物件"）。解析不出返回 0。
   * 可选：`battle.ts` 的 damage-only 通道（只跑同步 `Hurt`，不会碰到这两条 syscall）
   * 没实现它，`case 0x10d/0x129` 里按 0 处理。
   */
  sideUnitHandle?(direction: number): number;
  /**
   * `0x10C`（`0x4204FE → 0x43A795`）：该方**当前兵数**（投手 0=A / 1=B，绝对阵营）。
   * 原作读 sideStruct `+0x5C`；`0x4449BE` 用 `cmp [0x4A8ABC],0 / jg` 判"该方还有兵"。
   * 可选：damage-only 通道没实现它，`case 0x10c` 里按 0 处理。
   */
  aliveCount?(camp: number): number;
  isUnit(handle: number): boolean;
  unitSide(handle: number): number;
  unitAlive(handle: number): boolean;

  /** 像素坐标读写，*/
  unitPx(handle: number): { x: number; y: number; z: number };
  setTargetPx(x: number, y: number): void;
  targetPx(): { x: number; y: number };
  /** 目标格（像素）上的单位句柄，没有，0，*/
  unitAtPx(x: number, y: number): number;
  /**
   * R163（`project/163`）：把一个单位句柄解析成**其所在一方的主将句柄**。
   *
   * 原作的地图格表（`0x4B3CA0`，71×14 个指针，`0x43AF7A` 取格）里存的是"部队/单位记录"，
   * 各处取到记录后都会再读 `unit[+0x44]` 拿**主将**（`0x40AA82`@0x40AB65 的碰撞回调：
   * `locc = hitUnit[+0x44]`；`0x113` 的"这格站着谁"被 `DemonDancing` 直接与 `g3`
   * 比较，也只有拿主将才比得上）。端口的小兵是一个个独立单位、与主将没有父子指针，
   * 所以只能按 side 反查 `isGeneral`。
   *
   * 可不实现：不实现时 `0x113` 退回"该格最近单位"，碰撞回调退回"该格最近单位"。
   */
  generalOf?(handle: number): number;
  /**
   * R163：读脚本**槽位全局表**的第 `index` 槽（`STG`/`LDSG` 那张，不是 `LDG`/`STE` 的
   * int 引擎数组）。同一次施法的所有脚本实例共享一份（见 `VmOptions.globals`）。
   * 目前只有 `0x02C` 用它冻 `g16`（本击伤害量）。
   */
  globalGet?(index: number): number;
  /**
   * R163：当前脚本实例**派发时冻结**的 `g16`（本击伤害量），见 `std::SkillObject.cbDamage`。
   */
  instanceHitDamage?(): number;
  /**
   * `0x12A` / `0x12B` 的宿主（R163）：**指定阵营在 tile 矩形内的单位句柄表**。
   *
   * 原作 `0x43EEA9(camp,cx,cy,hw,hh)` → `0x402920(阵营, cx±hw, cy±hh)` 数个数，
   * `0x43EEE8(...,idx)` → `0x4029CB(...,idx)` 取第 idx 个；`camp` 是脚本口径的
   * 阵营/方向值（调用点全是 `g5 ^ 1`，映射规则与 `sideUnitHandle` / `spawnSoldier` 相同）。
   * 返回顺序必须**确定**（同输入同输出），脚本拿它当数组下标用。
   * 宿主没接线时按空表处理（`0x12A` 得 0、`0x12B` 得 0）。
   */
  unitsInRect?(camp: number, x0: number, y0: number, x1: number, y1: number): number[];

  /** 物件，*/
  spawnObject(resource: number, x: number, y: number, z: number, unit: number): number;
  objectOf(handle: number): SkillObject | undefined;
  setObjectPx(handle: number, x: number, y: number, z: number): void;
  /** 0x15：方向（0..255）与速度，*/
  setObjectMotion(handle: number, angle: number, speed: number): void;
  /** 0x18：物件存在的帧数，*/
  setObjectFrames(handle: number, frames: number): void;

  /** 伤害/治疗（正数治疗，负数伤害），*/
  applyHpDelta(handle: number, delta: number): void;
  /**
   * `0x125` 的宿主函数 `0x43ED96`（R67）：夹 0..maxHP + 判死都在宿主里做。
   * 给了就走它（`battle.ts` 的伤害通道注入），没给退回 `applyHpDelta`
   * （`runtime.ts` 没注入 ⇒ 法术路径逐位不变）。
   * 参数：`(受害句柄, 伤害量, 来源句柄)`，伤害量是**正数**（见 `battle.ts` 的
   * `damageViaScript()` 注释：`Hurt` 的门 `0 <= arg1` 只放行非负值）。
   */
  damage?(handle: number, amount: number, src: number): void;
  readHp(handle: number): number;
  maxHp(handle: number): number;
  /**
   * `0x119(side, x, y)` 的宿主：在格 (x,y) 新生成**一名**士兵，返回句柄（失败 0）。
   *
   * R88（project/152 §1/§3）：原来这条走 `summon()`，但 `summon` 是按数量铺一片的
   * 早期近似，既不探格也不看上限；原作 `ProduceSoldier` 是"先 `0x113` 探空、再
   * `0x119` 生一个、`StepShow` 播出場动作、补够 `need` 就停" ⇒ 这里是**新增单位**，
   * 不是复活尸体。`side` 用脚本口径的方向值（同 `0x10D`），由宿主映射到阵营。
   */
  spawnSoldier(side: number, x: number, y: number): number;
  /** 召唤（旧近似，0x119 已改走 `spawnSoldier`；保留接口给别的宿主通道）。 */
  summon(a: number, b: number, c: number): number;

  /** 引擎全局（原，0x4A6878 数组），*/
  engineGet(index: number): number;
  engineSet(index: number, value: number): void;

  rand(min: number, max: number): number;
  sound(name: string, volume: number, unit?: number): void;
  loadResource(pattern: string): void;
  brightness(value: number): void;
  /** `0x130`：读回 `0x48E520`（`0x12F` 写的那格）。原作 `DownBrightness` 设完要读回来比较。 */
  brightnessOf(): number;
  screenFlash(on: boolean): void;
  /**
   * R137 全軍突擊：`0x120(unit, cmd)` 里的 `cmd` 含 `0x10000` 位时，把该单位所属阵营
   * 全体切成突击态。`side` 用脚本口径（1 = A / 2 = B，与 `unitSide` 一致）。
   * 宿主没接线就不做事（伤害脚本通道自建的 ctx 里没有它）。
   */
  allRush?(side: number): boolean;
  /**
   * `0x003(speaker, flags, text)`：战场台词框。原作的 `AllRush` 就用它弹「全軍突擊!」
   * （`export\script\system_so.dis.txt:1581`）。有接线就把文本交出去（`SkillRun` 记进
   * log，宿主通道走 `SysoPorts.text`），没接线就只留 trace —— 台词框的渲染仍不在本轮范围。
   */
  text?(speaker: number, line: string): void;
  /** 按名字调用同文件脚本（`0x310`/`0x311`/`0x313`：同栈内联）。 */
  callScript(name: string, args: SlotValue[]): SlotValue | undefined;
  /**
   * `0x312` / `0x314`：按名字**新起一条并发脚本实例**（L0，`project/154 §5`）。
   *
   * 原作这两条走"给 object 挂脚本"的路（host `0x420C43` / `0x420CAD`），被调方拿到
   * 自己的 VM 槽、与调用方同时存在，由引擎每帧轮流推进（`LockTargetXY` 的 `WAIT`
   * 因此不会拖长调用方）。宿主不实现就退回 `callScript()` 的内联语义。
   */
  spawnScript?(name: string, args: SlotValue[]): SlotValue | undefined;
  trace(line: string): void;
  /** 未实，占位，syscall 记一次，*/
  markUnimplemented(id: number, why: string): void;
}

const num = (v: SlotValue | undefined): number =>
  typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0;
const str = (v: SlotValue | undefined): string => (typeof v === 'string' ? v : '');

/** 真实现：语义已对齐到 World，*/
const IMPLEMENTED = new Set<number>([
  0x001, 0x003, 0x007, 0x008, 0x00a, 0x00b,
  0x010, 0x011, 0x012, 0x013, 0x014, 0x015, 0x017, 0x018, 0x019, 0x01b, 0x01c, 0x01d, 0x01f,
  0x025, 0x026, 0x027, 0x028, 0x029, 0x02b, 0x02c, 0x02e, 0x02f,
  0x100, 0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x108, 0x109,
  0x10c, 0x10d, 0x110, 0x111, 0x112, 0x113, 0x115, 0x116, 0x117, 0x118, 0x119,
  0x120, 0x121, 0x125, 0x128, 0x129, 0x12a, 0x12b, 0x12d, 0x12e, 0x12f, 0x130, 0x131,
  0x201, 0x203, 0x204, 0x213,
  0x300, 0x301, 0x303, 0x310, 0x311, 0x312, 0x313, 0x314,
]);

/** 占位：有确定返回，无副作用，但原作的真实表现无法在 2D 客户端复现，*/
const STUBBED = new Set<number>([
  0x016, 0x01a, 0x01e, 0x020, 0x021, 0x023, 0x024, 0x031,
  0x122, 0x123, 0x127, 0x132, 0x133, 0x134, 0x135, 0x136, 0x138,
  0x202,
]);

export interface SyscallDispatchResult {
  handled: boolean;
  value: Slot | undefined;
}

/** 单个 syscall 的实现。返，undefined 表示无返回值，*/
export function dispatchSyscall(ctx: SyscallContext, id: number, args: Slot[]): Slot | undefined {
  const a = (i: number): number => num(args[i]?.value);
  const s = (i: number): string => str(args[i]?.value);
  const r = (value: SlotValue): Slot =>
    typeof value === 'string' ? { value, type: 2 } : { value, type: 0 };

  if (!IMPLEMENTED.has(id) && !STUBBED.has(id)) {
    ctx.markUnimplemented(id, `未知 syscall 0x${id.toString(16)}`);
    return undefined;
  }
  if (STUBBED.has(id)) ctx.markUnimplemented(id, `占位 syscall 0x${id.toString(16)}（视觉表现未复现）`);

  switch (id) {
    // ── 脚本/资源 ─────────────────────────────────────────────
    case 0x007:
      ctx.loadResource(s(0)); // 形如 "magic\\016\\*"
      return undefined;
    case 0x001:
      // RunById 的脚本号版本， 参，，MagicDef[+4] 运行另一段脚本。
      ctx.trace(`syscall 0x001 运行脚本 ${a(0)}`);
      return undefined;
    case 0x003: {
      // R137：`0x003(speaker, flags, text)` —— `AllRush` 的「全軍突擊!%k%%e%」从这里出来
      // （`system_so.dis.txt:1576-1581`）。旧实现只 trace 参数、把台词文本丢了；
      // `%k%%e%` 是原作的颜色/换行控制符，原样保留给渲染层。
      const line = s(2);
      ctx.trace(`syscall 0x003 台词[${a(0)}] ${line}`);
      ctx.text?.(a(0), line);
      return undefined;
    }
    case 0x008:
      ctx.trace(`syscall 0x008 ${s(0)}`);
      return undefined;
    case 0x00a:
      ctx.trace(`syscall 0x00a ${a(0)},${a(1)},${a(2)}`);
      return undefined;
    case 0x00b:
      return r(ctx.casterHandle); // 取当前施法单位句。
      // ── 物件创建/操作 ────────────────────────────────────────
    case 0x010: {
      const h = ctx.spawnObject(a(3) || a(2), a(0), a(1), a(2), 0);
      return r(h);
    }
    case 0x011: {
      // handler 0x41FADE: 0x41FA7F(unit.x, unit.y, unit.z + arg4, arg3, arg2)
      // 位置只受 arg4 ，z 偏移影响；arg3 原样传给物件构造器（朝向等）。
      const u = a(0);
      const base = ctx.unitPx(u);
      return r(ctx.spawnObject(a(1), base.x, base.y, base.z + a(3), u));
    }
    case 0x012: {
      // "物件/单位是否已结束"：0 = 还在活动（动画未走完），非 0 = 已消失/已死。
      // 脚本里的典型写法是 `loc = 0x12(obj); if (loc != 0) 收尾并返回; else { 推进一帧; WAIT 1; }`，
      // 也就是"等物件播完"。同步模型里物件按虚拟帧到期（见 runtime 的 DEFAULT_OBJECT_FRAMES）。
      //
      // R187：**物件句柄要先查物件表**。旧实现一律走 `unitAlive`，而物件句柄不在单位表里
      // ⇒ 恒返 1（已死），于是 `ShootObject @0x6998` 的轮询循环（dis:4106-4130
      // `L06FAC: loc6=0x12(obj) … WAIT 1; EQ 1; JZ L06FAC`）第一次就退出、弹丸出生当帧
      // 就被 `0x13` 销毁：落月弓(seq2)/御飛刀(13)/落日弓(52)/鬼戟(59) 的箭从来没飞过。
      // 单位分支保持原样（句柄 >= 1000 且能在单位表里查到才走单位语义）。
      const obj = ctx.objectOf(a(0));
      if (obj) return r(obj.dead || ctx.clock >= obj.expiresAt ? 1 : 0);
      return r(ctx.unitAlive(a(0)) ? 0 : 1);
    }
    case 0x013: {
      // 从活动列表移除；对单位不直接判死（伤害由 0x125 负责。
      const obj = ctx.objectOf(a(0));
      if (obj) obj.dead = true;
      return undefined;
    }
    case 0x014: {
      ctx.setObjectPx(a(0), a(1), a(2), a(3));
      return undefined;
    }
    case 0x015: {
      // handler 0x41FBB8: 0x468990(angle, speed, &vx, &vy) —，angle ，0..255 一整圈
      ctx.setObjectMotion(a(0), a(2), a(3));
      return undefined;
    }
    case 0x016:
      ctx.trace(`syscall 0x016 obj=${a(0)}`);
      return undefined;
    case 0x017:
      ctx.setObjectPx(a(0), a(1), a(2), ctx.objectOf(a(0))?.z ?? 0);
      return undefined;
    case 0x018: {
      // handler 0x41FD63: 0x422548(obj, a, b, c) —，c 是物件存在的帧数
      ctx.setObjectFrames(a(0), a(3));
      return undefined;
    }
    case 0x019: {
      // `0x41FD98`（`export/script/syscall_handlers.asm.txt:466-494`）证实三参是
      // **(句柄A, 句柄B, 数值)**：两个句柄都过 `0x421a80` 解析、都非零才 `0x4225f8(A,B,arg3)`。
      // 旧实现把第 2 个**句柄**当成 motion 数存进 `o.motion`，参数序是错的 —— 这里改成把
      // 第 3 参（数值）记进 `motion`；`0x4225f8` 的本体不在 export 里（原 EXE 未提取），
      // 所以**不实施**"A 追 B"的运动：试实现后旋龍的 dummy 会朝一个我们解析不到真目标的
      // 全局句柄（`g3`）飞走，效果从 15 hits / 8 dmg 掉到 6 hits / 0 dmg（见 project/117）。
      const o = ctx.objectOf(a(0));
      if (o) o.motion = a(2);
      return undefined;
    }
    case 0x01b: {
      const o = ctx.objectOf(a(0));
      if (o) o.motion = a(1);
      return undefined;
    }
    case 0x01c:
    case 0x01d: {
      const o = ctx.objectOf(a(0));
      if (o) o.motion = a(1);
      return undefined;
    }
    case 0x01a:
      return r(1);
    case 0x01e:
      ctx.trace(`syscall 0x${id.toString(16)} ${a(0)},${a(1)}`);
      return undefined;
    case 0x01f:
      // R163：handler `0x41FEFB`（`export/script/_syscall_table.md` 0x01F 行）=
      // `obj = 0x421A80(arg1); if (obj) obj[+0x28] = arg2`。`0x4217FE` 建物件时
      // `obj[+0x28] = 资源[+0x1c]`（资源自带的存活帧数）⇒ **0x1F = 改物件存活帧数**。
      // 调用点只有 4 处，典型是 `Tornado #136` 的 `0x1F(loc9, arg1*30 + 0x303(160,200))`
      // —— 给 dummy 物件一个 160~200 帧的寿命，脚本后面才会 `0x12(loc9)` 判活来循环。
      // 端口原先当它是空操作 ⇒ dummy 按默认 `DEFAULT_OBJECT_FRAMES`(96) 到期，
      // 旋龍的等待循环提前 60 多帧收尾（R87 实测 23 帧）。
      ctx.setObjectFrames(a(0), a(1));
      return undefined;
    case 0x020:
    case 0x021:
      ctx.trace(`syscall 0x${id.toString(16)} ${a(0)},${a(1)}`);
      return undefined;
    case 0x023: {
      const h = ctx.spawnObject(a(2), a(0), a(1), 0, 0);
      return r(h);
    }
    case 0x024: {
      const h = ctx.spawnObject(a(3), a(0), a(1), a(2), 0);
      return r(h);
    }
    case 0x025:
      ctx.trace(`syscall 0x025 ${a(0)},${a(1)}`);
      return undefined;
    case 0x026: {
      // 设置移动/动作，0x8C=(a<<16)|b, +0x90=0x100000
      ctx.trace(`syscall 0x026 unit=${a(0)} ${a(1)}/${a(2)}`);
      return undefined;
    }
    case 0x027: {
      // asm 0x0042018F：`obj[+0x58] = arg2` —— 动画帧号（R145 之前只 trace）
      const o = ctx.objectOf(a(0));
      if (o) o.animFrame = a(1);
      return undefined;
    }
    case 0x028: {
      // asm 0x004201B5：`obj[+8] += arg2<<16; obj[+0xC] += arg3<<16; obj[+0x10] += arg4<<16`
      // 像素坐标增量（x/y/z），R145 之前只 trace ⇒ CreatePower 里一批物件永远停在 (0,0)。
      const o = ctx.objectOf(a(0));
      if (o) {
        o.x += a(1);
        o.y += a(2);
        o.z += a(3);
      }
      return undefined;
    }
    case 0x029: {
      // asm 0x0042020E：`obj[+0x30] |= arg2` —— 状态位（不是 motion）
      const o = ctx.objectOf(a(0));
      if (o) o.flags = (o.flags | a(1)) >>> 0;
      return undefined;
    }
    case 0x02b: {
      // asm 0x00420261：`obj[+0x30] &= ~arg2` —— 清状态位
      const o = ctx.objectOf(a(0));
      if (o) o.flags = (o.flags & ~a(1)) >>> 0;
      return undefined;
    }
    case 0x02c: {
      // asm 0x00420291：`obj[+0x98] = arg2`（不是 motion）
      const o = ctx.objectOf(a(0));
      if (o) {
        o.param98 = a(1);
        // R163：把"这次呼叫"的 g16 冻下来（见 `SkillObject.cbDamage` 的说明）。
        const dmg = ctx.instanceHitDamage ? ctx.instanceHitDamage() : 0;
        o.cbDamage = Math.max(0, Math.trunc(dmg) | 0);
      }
      return undefined;
    }
    case 0x02e: {
      // asm 0x004202E7：`if (obj && arg2 < 3) obj[+0x9C + arg2*4] = arg3`
      const o = ctx.objectOf(a(0));
      const idx = a(1);
      if (o && idx >= 0 && idx < 3) o.params[idx] = a(2);
      return undefined;
    }
    case 0x02f:
      return r(1);
    case 0x031:
      ctx.trace(`syscall 0x031 ${a(0)},${a(1)}`);
      return undefined;
    case 0x122:
    case 0x123:
      return undefined;
    case 0x127:
      ctx.trace(`syscall 0x127 ${a(0)},${a(1)}`);
      return undefined;

    // ── 坐标 ────────────────────────────────────────────────
    case 0x100:
      ctx.setTargetPx(a(0), a(1));
      return undefined;
    case 0x101: {
      const p = ctx.unitPx(a(0));
      return r(Math.floor(p.x / 96));
    }
    case 0x102: {
      const p = ctx.unitPx(a(0));
      return r(Math.floor(p.y / 72));
    }
    case 0x103:
      return r(a(0) * 96 + 48);
    case 0x104:
      return r(a(0) * 72 + 36);
    case 0x105:
      return r(Math.round(ctx.unitPx(a(0)).x));
    case 0x106:
      return r(Math.round(ctx.unitPx(a(0)).y));
    case 0x107:
      return r(Math.round(ctx.unitPx(a(0)).z));
    case 0x108:
      return r(Math.floor(a(0) / 96));
    case 0x109:
      return r(Math.floor(a(0) / 72));
    case 0x10c:
      // handler `0x004204FE`：`push [ebp+8]; call 0x43A795`。
      // `0x43A795`（`node dis.cjs dump 0x43a795 0x43a7ac`）：`cmp [ebp+8],0; jne 0x43A7A5`
      // ⇒ 实参 0 读 `[0x4A8ABC]`、非 0 读 `[0x4B03FC]`；两者正是 A/B sideStruct
      // （`0x4A8A60`/`0x4B03A0`）的 `+0x5C`。`0x4449BE`：`cmp dword ptr [0x4A8ABC],0x0 / jg`
      // —— "该方兵数 > 0"，再加上 `MoreSoldier` 用 `0x116*5 - 0x10C` 算补兵量：
      // **0x10C(camp) = 该方当前兵数**，camp 是绝对阵营（0=A/1=B，与 0x10D/0x113 同源），
      // 不是句柄。旧端口写成 `ctx.unitSide(a(0))` 是拿 0/1 当句柄查，永远得 0。
      return r(ctx.aliveCount?.(a(0)) ?? 0);
    case 0x10d:
      // handler 0x420518 → `0x43A7AC(arg1)`。MAGIC.SO 里 0x10D 的 24 个调用点**全部**
      // 是 `LDG 5; PUSHI 1; XOR; SYSCALL 0x10D`（例：magic_so.dis.txt:10745、10890、
      // 11664），即实参是阵营/方向（g5^1）而不是句柄；返回值随后喂给 `0x11`
      // （在"该方主将的位置"生成物件）与 `0x105/0x106`。原作该方主将的"身体物件"，
      // 本模型单位/物件共用句柄空间 ⇒ 直接给单位句柄。
      return r(ctx.sideUnitHandle?.(a(0)) ?? 0);
    case 0x111:
      return r(Math.round(ctx.targetPx().x));
    case 0x112:
      return r(Math.round(ctx.targetPx().y));
    case 0x113: {
      // R88（project/152 §1）：`0x113(x, y)` 是"这一格上站着谁"。
      // handler 0x4206xx → `0x406499(...)`（vararg 桩，tag=2），语义为
      // "取格坐标 → 换算成像素中心 → 取该处的单位/物件句柄"，空格返回 0。
      // 原作先做格坐标合法性校验：x∈[0,70]、y∈[0,13]（71 列 × 14 行，即
      // `0x12D=71` / `0x12E=14`），越界一律 0 —— ProduceSoldier 依赖这个 0
      // 判断"格是空的"，越界若不返回 0 会去占一格不存在的格子。
      const gx = a(0);
      const gy = a(1);
      if (!(gx >= 0 && gx <= 70 && gy >= 0 && gy <= 13)) return r(0);
      const who = ctx.unitAtPx(gx * 96 + 48, gy * 72 + 36);
      if (who === 0) return r(0);
      // R163：格表里存的是"部队记录"，各处都会再读 `unit[+0x44]` 拿主将
      // （`0x40AA82`@0x40AB65 碰撞回调、`DemonDancing` 直接与 `g3` 比较——
      // magic_so.dis.txt:1511C 的 `LDSL loc2; LDG 3; EQ` 只有拿主将才成立）。
      // 端口的小兵是独立单位，所以在这里解析成该方主将；解析不出就退回原句柄。
      const general = ctx.generalOf ? ctx.generalOf(who) : 0;
      return r(general !== 0 ? general : who);
    }
    case 0x115:
      return r(ctx.unitSide(a(0)) === ctx.unitSide(ctx.casterHandle) ? 1 : 0);

    // ── 生命/伤害 ───────────────────────────────────────────
    case 0x116: {
      // asm 0x00420655 → `call 0x43A871(obj)`：读 word[obj+0x2E]。它与 0x117（`0x43A891`，
      // 读 hp）、0x118（`0x43A8B1`，写 hp）是同一组血量存取器 ⇒ **血量上限**。
      // R145：原来写死 0，`MAGIC.SO` 的 `MoreSoldier` 用 `0x116*5 - 0x10C` 算补兵数，
      // 0 会让结果被夹成 0 → 直接 `CastFail`，七个"伏兵"系补兵技因此一发不死兵。见报告 §2。
      const h = a(0);
      if (ctx.isUnit(h)) {
        return r(ctx.maxHp(h));
      }
      const sh = ctx.sideUnitHandle?.(h) ?? 0;
      return r(ctx.maxHp(sh));
    }
    case 0x117:
      // R163：实参是**阵营**（`IncreaseHP`@0x179B0 的 `LDG 5; SYSCALL 0x117, 1` ⇒ 传 g5），
      // 与 0x116/0x118 同组；先过 `sideUnitHandle` 把阵营换成该方主将句柄
      // （传进来的本来就是句柄时它原样返回）。
      return r(ctx.readHp(ctx.isUnit(a(0)) ? a(0) : (ctx.sideUnitHandle?.(a(0)) ?? 0)));
    case 0x118:
      // 原作：word[obj+0x12] = min(arg, word[obj+0x10])，即回血到不超过 maxHP
      {
        const h = ctx.isUnit(a(0)) ? a(0) : (ctx.sideUnitHandle?.(a(0)) ?? 0);
        ctx.applyHpDelta(h, a(1) - ctx.readHp(h));
      }
      return undefined;
    case 0x125:
      // (objVictim, dmgObj, dmg, ...) —— R163 按 handler 本体 `0x43ED96` 重新核对实参：
      //   `0043EDE7 mov [0x4b4c3c], arg3` 才是写"本次伤害"全局的那一个，
      //   `0043EDEF push arg2; push 0x1000e; push arg1; call [arg1+0x4c]`
      //   ⇒ **arg1 = 受害对象、arg2 = 0（Hurt 永远传 0）、arg3 = 伤害量**。
      // 所以 `a(2)` 是伤害量、`a(1)` 是来源/0。原作 arg2 != 0 时还会按受害主将 maxHP
      // 百分比放大（`0x43EDA2-0x43EDD4`），MAGIC.SO 的 `Hurt` 走 arg2=0 那支，暂不实现。
      // R67：注入 `damage` 宿主函数时走它（普攻与 MAGIC.SO 的 `Hurt` 共用同一条结算），
      // 否则退回 `applyHpDelta`。R163 修正：`applyHpDelta` 的口径是**负数=伤害**，
      // 旧代码直接传正数 a(2) ⇒ 法术伤害变成加血（`stats.healed` 而非 `killed`）。
      if (ctx.damage) ctx.damage(a(0), a(2), a(1));
      else ctx.applyHpDelta(a(0), -a(2));
      return undefined;
    case 0x119: {
      const ret119 = ctx.spawnSoldier(a(0), a(1), a(2));
      return r(ret119);
    }

    // ── 视觉状态（记录，不改变战斗数值） ──────────────────────
    case 0x110:
      // handler 0x420 后的 `call 0x44430d`：与 0x131（`0x4442fe`，置位=1）成对，
      // 两个 id 在字节码里各 46 次、交错出现 ⇒ 闪白「关」。强度[推测]，成对是实证。
      ctx.screenFlash(false);
      return undefined;
    case 0x120: {
      // R137：`0x120(unit, cmd)` —— handler `0x42074F` → `0x421a80(arg1)` 取对象，
      // 然后 `mov [ecx+0x6c], eax`（`export\script\syscall_handlers.asm.txt:1397-1426`）：
      // 把**命令字**写进 `unit+0x6c`，先经 `0x421e1b(obj, arg2)` 校验（返回 −1 = 不接受）。
      // 位语义（MAGIC.SO 里出现过的实参）：0x2、0x4、0x10、0x1000、0x2000、0x4000、
      // 0x8000、0x10000、0x20000、0x40000、0x80000；其中 **0x10000 = 突击**，唯一有原作
      // 调用链的一条（`SYSTEM.SO#22 AllRush` 的 `PUSHI 65536`）。
      // 其余位本作不改行为，只 trace 出来备查（见 project/137 的位值清单）。
      const cmd = a(1);
      const unitHandle = a(0);
      if ((cmd & 0x10000) !== 0) ctx.allRush?.(ctx.unitSide(unitHandle));
      // 无论有没有突击位都留一行 trace：0 也有意义（原作 handler 先把 `obj[0x6c]` 清 0 再写），
      // 调试时「命令被写成 0」和「根本没调 0x120」必须能区分开。
      ctx.trace(`syscall 0x120 命令字 0x${(cmd >>> 0).toString(16)}（仅 0x10000=突击 生效）`);
      return undefined;
    }
    case 0x121:
    case 0x128:
      return undefined;
    case 0x129:
      // handler 0x420809 → `0x43B375(arg1)`；31 个调用点同样全是 `g5 ^ 1`（阵营/方向），
      // 例如旋龍 554 的 magic_so.dis.txt:10736 → `STL loc8` → 后续 0x105/0x106 读该方
      // 主将坐标、`0x11(loc8, 2501, 0, 0)` 在主将位置上生成 dummy。
      return r(ctx.sideUnitHandle?.(a(0)) ?? 0);
    case 0x12a: {
      // R163（project/163 §1.2）：原作 handler `0x42081A` → `0x43EEA9(camp,cx,cy,hw,hh)`：
      //   `0x43B9CB(camp)` 取该阵营结构，再 `0x402920(阵营, cx-hw, cy-hh, cx+hw, cy+hh)`
      //   = **矩形内的该阵营单位个数**。`0x12B` 是同一矩形的第 idx 个（`0x4029CB`）。
      // 15 处调用点形状完全一致：`locN = 0x12A(...); for i<locN: arr[i] = 0x12B(...,i)`
      // （Thunder@0x8DCC / Tornado@0x129AC / CreateSpoutAround@0x23438 / Ice@0x1ED78 /
      //  TaiChi@0x21EB0 / Slash@0x2EAFC / XTaiChi@0x3842C / CreateSmallSwords@0x15E40 /
      //  Engulf@0x1B9A8）。
      // 旧实现"造一个物件返回 1"会让 locN 恒为 1：循环只跑一次、数组只有 1 个元素，
      // 于是 `CreateSpoutAround` 的主循环 `for loc4 < arg1` 在这条路径上永远进不去
      // （230 音量段在循环体内），且"多目标"退化成单体。
      const x0 = a(1) - a(3);
      const x1 = a(1) + a(3);
      const y0 = a(2) - a(4);
      const y1 = a(2) + a(4);
      return r(ctx.unitsInRect?.(a(0), x0, y0, x1, y1).length ?? 0);
    }
    case 0x12b: {
      // 同矩形内的第 `a(5)` 个（`0x43EEE8(camp,cx,cy,hw,hh,idx)` → `0x4029CB`），
      // 越界返回 0（原作 `0x4029CB` 找不到就回 0）。
      const x0 = a(1) - a(3);
      const x1 = a(1) + a(3);
      const y0 = a(2) - a(4);
      const y1 = a(2) + a(4);
      const list = ctx.unitsInRect?.(a(0), x0, y0, x1, y1) ?? [];
      const idx = a(5);
      const h = idx >= 0 && idx < list.length ? list[idx]! : 0;
      return r(h);
    }
    case 0x12d:
      // handler 0x420887 ，`mov eax, 0x47; ret`：常，71（屏幕行，可用行）
      return r(71);
    case 0x12e:
      // asm 0x00420891：`mov eax, 0xE; ret` —— 常量 14（栏位/格数）。
      // R145：原来写死 0，`MAGIC.SO` 的 `ProduceSoldier` 拿它当"死亡兵格数"
      // （`loc7 = 0x12E()` → `loc2 = loc7/2` → `0x113(side, loc2)` 找待复活兵），
      // 返回 0 时 `unitAt` 恒取到 0 号 ⇒ 七个"伏兵"系补兵技一发不死兵。见报告 §2。
      return r(14);
    case 0x12f:
      ctx.brightness(a(0));
      return undefined;
    case 0x130:
      // handler 0x4208AC → `call 0x4442f4`：无参 getter，读回 `0x48E520` 的亮度/强度。
      // 原来写死 16，会让 `DownBrightness`/`RaiseBrightness` 的"设完再读"永远读到满值。
      return r(ctx.brightnessOf());
    case 0x131:
      ctx.screenFlash(true);
      return undefined;
    case 0x132:
    case 0x133:
    case 0x134:
      return r(0);
    case 0x135:
    case 0x136:
    case 0x138:
      ctx.trace(`syscall 0x${id.toString(16)} ${a(0)}`);
      return id === 0x136 ? undefined : r(0);

    // ── 杂项 ────────────────────────────────────────────────
    case 0x201:
      return r(Math.round((a(0) * a(1)) / 65536));
    case 0x202:
      return r(a(0));
    case 0x203:
      return r(160);
    case 0x204:
      return r(120);
    case 0x213:
      return r(s(1));
    case 0x300:
      ctx.sound(s(1), a(2), a(0));
      return undefined;
    case 0x301:
      ctx.sound(s(0), a(1));
      return undefined;
    case 0x303:
      return r(ctx.rand(a(0), a(1)));
    case 0x310:
    case 0x311:
    case 0x313: {
      // 同文件内联调用（原作 `0x4653F0` 的直接 call）：被调方跑完才回到调用点。
      const name = s(0);
      const callArgs: SlotValue[] = [];
      for (let i = 1; i < args.length; i++) callArgs.push(args[i].value);
      const ret = ctx.callScript(name, callArgs);
      return ret === undefined ? undefined : r(ret);
    }
    case 0x312:
    case 0x314: {
      // L0（project/154 §5）：这两条是 invoke-by-name 的**并发**版本（host `0x420C43` /
      // `0x420CAD`）——给目标 object 再挂一条脚本，被调方在**自己的** VM 槽里从下一帧起
      // 与调用方并行推进，所以它里面的 `WAIT` 不拖长调用方（`LockTargetXY #16 @0xFF8`
      // 正是"先 `rand` 再 `WAIT` 才 `0x11` 造物件"）。
      // 实参布局与上面三条相同：`args[0]` = 名字。
      //
      // 实参序：R163 定的是 **`0x314` 反序、`0x312` 正序**；R171 把两条 handler 逐字节复证
      // 之后确认这个不对称**在 EXE 里没有对应物**，但把 `0x312` 也翻成反序会打断 R87 的
      // WAITFOR 契约（见下第 3 条），所以 R171 **保留** 163 的不对称，并把它记为待解。
      //
      // 字节级证据（`Sango2.exe`；`node dis.cjs dump <va> <end>`，反汇编器在
      // `work/units_per_side/dis.cjs`）：
      //  1. `0x420C43`（0x312，`syscall_table.json:786 → 4328515`）与 `0x420CAD`
      //     （0x314，`:788 → 4328621`）逐条同形：都按**地址降序**把栈参连推一遍
      //     （0x312 推 8 个 `[ebp+0x24]…[ebp+0x08]`，0x314 推 10 个 `[ebp+0x2C]…[ebp+0x08]`），
      //     随后 `call 0x4658C0`（`mov eax,[0x4A69A8]; mov eax,[eax+0x24]; ret`，无参
      //     getter，根本不读那些栈参）再 `push eax; call 0x4653F0` 起实例 ⇒ 两条走同一条
      //     实现，差别只有实参个数（8 / 10）。
      //  2. `0x4653F0`：`edi=[esp+0x80]`（= handler 最后推的 `[ebp+8]` = VM 栈顶那块实参的
      //     头）→ `0x4681A0(edi)` 按名查槽（strcmp 循环；`[ecx+8]`=个数、`[ecx+4]`=基址、
      //     `[ecx+0xC]`=槽数组）→ `[ebx+4]`=argc → `lea eax,[esp+0x84]` **升地址**逐 dword
      //     拷 argc 个 → 循环 `0x467CE0` 把它们逐个 push 进新实例的 VM 栈（`[esi+0x18]`=sp++，
      //     Slot 8 字节，`ret 0x4`）⇒ **最后 push 的那个在栈顶 = arg1**。
      //     端口 `vm.ts case 0x05` 是 `for (i=argc-1;i>=0;i--) args[i]=pop()`（`args[0]`=栈底
      //     =name、`args[argc-1]`=栈顶），`enter()` 又按 `args[N-1]..args[0]` 压栈。
      //  3. 实测（`work/summon7/sweep314.mjs`，110 条技、A/B 各 20 兵、seed 7）：
      //     312 正 / 314 反 = 有击杀的技 29 条；两条都反 = 29 条；两条都正 = 27 条。
      //     **但「两条都反」会让 `tests/r87_waitfor.test.ts:205` 由绿转红**：多帧技只跑
      //     25 帧（期望几十帧）——`旋龍 #136` 的 0x312 调用点反序后子脚本 `TornadoMotion`
      //     取到的物件句柄错位，WAITFOR 等的对象一直不出现，轮询循环提前退出；163 §4.1
      //     记过同一症状（WAITFOR 从 >40 帧掉到 23 帧）。⇒ 统一反序**不能落地**。
      //  4. 7 条補兵技在三种映射下都不受影响（走 `CALL MoreSoldier` / `CALL BackSoldier`，
      //     不经过 0x312/0x314）。
      const name = s(0);
      const callArgs: SlotValue[] = [];
      if (id === 0x314) {
        for (let i = args.length - 1; i >= 1; i--) callArgs.push(args[i].value);
      } else {
        for (let i = 1; i < args.length; i++) callArgs.push(args[i].value);
      }
      // 宿主支持实例队列就起实例；不支持（如 battle.ts 的 damage-only 通道）退回内联。
      if (ctx.spawnScript) {
        ctx.spawnScript(name, callArgs); // 两条的 ret=0：不压返回值
        return undefined;
      }
      const ret = ctx.callScript(name, callArgs);
      return ret === undefined ? undefined : r(ret);
    }
    default:
      ctx.markUnimplemented(id, `未处，syscall 0x${id.toString(16)}`);
      return undefined;
  }
}

/** 文档/测试用：本文件认定的实现级别，*/
export function syscallTier(id: number): 'implemented' | 'stub' {
  return IMPLEMENTED.has(id) ? 'implemented' : 'stub';
}
