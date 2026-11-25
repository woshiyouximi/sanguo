/**
 * SYSTEM.SO 的宿主侧函数库（R79）。
 *
 * ## 为什么需要这一层
 *
 * `SYSTEM.SO` 是改版作者（Henryshow/Allen Zhou 的伪编译器）写的 39 个原语函数，
 * 由战斗/剧情流程用 `RunByName`（EXE `0x4653F0`，脚本侧 `CALLS` 与 syscall
 * `0x310–0x314`）按名字调用，见 `docs/04-脚本引擎SmartScript.md:653-660`。
 * 重制版不跑 SYSTEM.SO 的字节码，所以这 39 个函数必须逐个用宿主代码重写；
 * 上一轮只做了 5 个（在 `audio_bus.ts` 的 `callSystemSo` 里），其余是空壳。
 *
 * 本文件补 25 个（R79），R84 又啃下最后 9 个，现在 **34 个**在这里，依据一律是
 * `F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO` 的指令流
 * （反汇编见 `export\script\system_so.dis.txt`，紧凑版见 `work\system_so\funcs.txt`
 * 与 `work\syso_map.md` 的总表；R84 的宿主 syscall 反汇编在 `work\syso84\`）。
 * 凡是字节码本身无法确定的，代码里标 `[推测]`。
 *
 * ## 内存模型（9 个 `*_Old` 函数）
 *
 * 函数体把绝对地址换算成"引擎全局数组"下标再读写：
 *
 * ```
 * i = (addr - 0x4A6878) >> 2      ; 0x4A6878 = 引擎全局数组基址
 * ```
 *
 * 见 `GetByte_Old` @0x40 与 `docs/04-脚本引擎SmartScript.md:917-934`。重制版的
 * `ScriptVm.engine`（`vm.ts` 的 `engineSlots`）就是这张表的对应物，于是
 * `addr = 0x4A6878 + 4*i` ↔ 引擎槽 `i`。`SysoMemory` 因此只依赖一个
 * `SysoWordStore`：运行时把它接到 `engineGet/engineSet`，测试用稀疏表。
 *
 * 注意基址以下的地址（`SetString_Old` 写的 `0x46DA60` 函数指针槽）也在同一张
 * 稀疏表里，所以"任意地址读写"仍然是自洽的——只是不再是原作那种"无边界检查、
 * 可以踩到进程内任意 dword"的玩法，重制版按 `SysoWordStore` 的容量截断。
 *
 * ## 参数顺序
 *
 * 脚本压参顺序与形参序号相反：**最后压栈的是 arg1**（`vm.ts:286` 注释
 * "调用者按 argN..arg1 顺序压实参，arg1 在栈顶"）。本文件所有函数的 `args`
 * 都按**压栈顺序**取，因此 `args[0]` 是脚本里最先压的那个。
 * 例：`StartBattle` 里 `MoveCamera(loc8, loc9-128, 30)`（`docs/04-…:905`）
 * 压的是 x、y、帧数，于是 `args = [x, y, frames]`，而函数体内 arg1=帧数。
 */

import type { Weather } from './weather';

/** 引擎全局数组基址：脚本里 `(addr - 4876408)` 的那个 4876408。 */
export const SYSTEM_SO_BASE = 0x4a6878;

/** `SetString_Old` 写函数指针的槽（脚本里 `PUSHI 0x4A71FC` 的十进制 4878844）。 */
export const STRING_PTR_SLOT = 0x4a71fc;

/** 写进 `STRING_PTR_SLOT` 的值：宿主 strcpy 桩的地址（脚本里 `PUSHI 4643936`）。 */
export const STRCPY_STUB_ADDR = 0x46da60;

/** 天气/布景物件的资源 id 起点：`9994 + rand(0,2)` → 9994..9996。 */
export const WEATHER_RESOURCE_BASE = 9994;

/** 物件类型（重制版只保留"给引擎看"的字段）。 */
export interface SysoSpawn {
  handle: number;
  resource: number;
  x: number;
  y: number;
  z: number;
  /** 0x1B / 0x1D 设的运动速度；雨天没有。 */
  motion: number;
  /** 0x18 设的寿命帧数；雨天没有。 */
  frames: number;
  kind: 'rain' | 'snow' | 'fog' | 'war-marker';
}

export type SysoArg = number | string;

/**
 * `0x105`/`0x106`/`0x206` 要的武将坐标（R84）。
 *
 * `x/y` 是像素（`0x105`/`0x106`），`col/row` 是物件 `+0x34/+0x36` 两个**有符号 short**
 * 格坐标（`0x206` 拿它判屏幕三档）。原作两处读的是同一个物件的两份字段，重制版让端口
 * 一次给全，免得两套坐标对不上。
 */
export interface SysoUnitPos {
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface SysoCallResult {
  /** 是否由本文件的宿主实现接管。 */
  handled: boolean;
  /** 脚本 `RETV` 的返回值（只有 5 个 Get* 有）。 */
  value?: SysoArg;
}

/**
 * 宿主端口：由 `Runtime` 实现，测试可以只注入需要的几个。
 *
 * 方法名与 `Runtime` 上同名方法一一对应，`Runtime` 直接把 `this` 的箭头函数
 * 传进来即可（见 `runtime.ts` 的 `createSysoHost`）。
 */
export interface SysoPorts {
  /** `0x303`。闭区间 [min,max]，与原作 `rand()` 一致。 */
  rand?: (min: number, max: number) => number;
  /** `0x10`/`0x11`：创建物件，返回句柄。 */
  spawnObject?: (resource: number, x: number, y: number, z: number, unit: number) => number;
  /** `0x14`/`0x17`。 */
  setObjectPx?: (handle: number, x: number, y: number, z: number) => void;
  /** `0x18`：设物件寿命帧数。 */
  setObjectFrames?: (handle: number, frames: number) => void;
  /** `0x100`：战斗镜头目标点。 */
  setTargetPx?: (x: number, y: number) => void;
  /** `0x111`/`0x112`。 */
  targetPx?: () => { x: number; y: number };
  /** 地图模式镜头（`0x205`）。重制版没有独立地图镜头时退回 `setTargetPx`。 */
  setMapCamera?: (x: number, y: number) => void;
  /** `0x7`：载入图形资源。 */
  loadResource?: (pattern: string) => void;
  /** `0x300`/`0x301`：播音效（0..255 音量）。 */
  sound?: (name: string, volume: number, unit?: number) => void;
  /** `0x125`：改 HP。 */
  applyHpDelta?: (handle: number, delta: number) => void;
  /**
   * `0x125` 的宿主函数 `0x43ED96`（R67）：伤害/治疗走它，返回**实际写入的差值**
   * （夹过 0..maxHP 之后；没实现就返回 void，调用方按原参数记）。
   * `runtime.ts` 不注入它 ⇒ 法术仍走 `applyHpDelta`；`battle.ts` 的伤害通道注入它。
   */
  damage?: (handle: number, amount: number, src: number) => number | void;
  /**
   * `0xA(layer, general, id)`：**第三参是 `MESSAGE.INI` 的 `MSGnnn` 编号**，不是"引擎变量"。
   *
   * R84 才把 `0x420B12` 这一族桩函数读干净：`0x41FA3C` 拿 `layer` 去 5 槽表
   * `0x4A64D4` 取对象、把 `(general, id)` 交给它的动作分发 `0x43483A`，跟 `0x6`
   * 同一个落点（`0x4347B6`）。号段见 `docs/03d-文本与配置.md:11-27`。
   * 重制版保留旧口径只记录，新实装的 9 条走 `msg`/`playAct`。
   */
  engineWrite?: (a: number, b: number, c: number) => void;
  /**
   * `0x6(a, b, c)`（`0x41F9C1` → `0x434885`）：`if (a < 5 && c != 0)` 取 5 槽对象表
   * `0x4BC160` 的第 `a` 槽，调它的 `vtbl[0x20](obj, b, c)` —— 即"第 a 层让 c 这个武将
   * 做动作 b"。SYSTEM.SO 里的实参是 `(层, 动作 1|2|3, 武将句柄)`。
   */
  playAct?: (layer: number, action: number, general: number) => void;
  /**
   * `0xA` 的台词通道：给 `MSGnnn` 编号，返回原文。
   *
   * 台词表在 `F:\sanguo\extract\json\message.json`（524 条，cp950），**没有**进 `game/data`，
   * `runtime.ts` 也还没接线 —— 取不到时宿主只记编号（`lines` / `events` 的 `line`）。
   */
  msg?: (id: number) => string | undefined;
  /** `0x105`/`0x106`/`0x206`：按武将句柄查战场坐标；查不到时 `0x206` 按原作 `obj == 0` 给 0。 */
  unitAt?: (handle: number) => SysoUnitPos | undefined;
  /** `0x211`（`0x44EBE2`）：招降确认，引擎侧把该武将 `status` 置 6 再走一次结算。 */
  confirmYield?: (general: number) => void;
  /** `LDG n`：读脚本全局槽。 */
  global?: (index: number) => number;
  /** `STG n`。 */
  setGlobal?: (index: number, value: number) => void;
  /** `CALLS`：按名字再调一段脚本。 */
  callScript?: (name: string, args: number[]) => void;
  /** `0x3`：说一句台词（speaker 用词条号，line 为原文）。 */
  text?: (speaker: number, line: string) => void;
  /**
   * R137：`AllRush` 的 gameplay 落点 —— 把发起方**全体**（含主将）切成突击态。
   *
   * 返回 false 表示本来就在突击态（幂等，`battle.allRush()` 的返回值原样透传）。
   * 没接线时 `AllRush` 仍播音/闪白/弹台词，只是不产生 gameplay 效果。
   */
  allRush?: () => boolean;
  /** R137：`0x131`/`0x110` 的压暗括号（与 `SkillRun.screenFlash` 同一口径）。 */
  screenFlash?: (on: boolean) => void;
  trace?: (line: string) => void;
}

/** 引擎全局数组的抽象：下标是"字"（4 字节）。 */
export interface SysoWordStore {
  get(index: number): number;
  set(index: number, value: number): void;
}

/** 稀疏字表：测试与"没有 engine 的调用方"用它。 */
export class SparseWordStore implements SysoWordStore {
  private readonly words = new Map<number, number>();

  get(index: number): number {
    return this.words.get(index | 0) ?? 0;
  }

  set(index: number, value: number): void {
    const i = index | 0;
    const v = value | 0;
    if (v === 0) this.words.delete(i);
    else this.words.set(i, v);
  }

  /** 非零字数（测试用）。 */
  get size(): number {
    return this.words.size;
  }

  /** 直接看某个字（测试用，不走基址换算）。 */
  peek(index: number): number {
    return this.get(index);
  }
}

const i32 = (v: number): number => v | 0;

/**
 * 9 个内存原语的公共实现：字节寻址的窗口 + 引擎字数组。
 *
 * 每个方法都对应一条字节码路径，注释里标了偏移，方便和 `funcs.txt` 对照。
 */
export class SysoMemory {
  readonly store: SysoWordStore;
  readonly base: number;
  /** 读写次数（测试/诊断用）。 */
  reads = 0;
  writes = 0;

  constructor(store: SysoWordStore = new SparseWordStore(), base: number = SYSTEM_SO_BASE) {
    this.store = store;
    this.base = base;
  }

  /** 取一个 4 字节字。地址不必对齐——字节码自己用 `(addr-base)>>2` 取整。 */
  word(addr: number): number {
    this.reads++;
    return i32(this.store.get((addr - this.base) >> 2));
  }

  /** 写一个 4 字节字。 */
  putWord(addr: number, value: number): void {
    this.writes++;
    this.store.set((addr - this.base) >> 2, i32(value));
  }

  // ── GetByte_Old @0x40 ────────────────────────────────────────────────
  readByte(addr: number): number {
    const w = this.word(addr) >>> 0;
    return (w >>> ((addr & 3) << 3)) & 0xff;
  }

  // ── GetByte_Signed_Old @0xAC ─────────────────────────────────────────
  readByteSigned(addr: number): number {
    const b = this.readByte(addr);
    return (b & 0x80) !== 0 ? b | -256 : b;
  }

  // ── GetShort_Old @0x114 ──────────────────────────────────────────────
  readShort(addr: number): number {
    if ((addr & 3) === 3) {
      // 跨字：低字节是本字最高位，高字节是下一字最低位（0x1A0 分支）
      const hi = this.word(addr + 4) << 8;
      const lo = (this.word(addr) >>> 24) & 0xff;
      return (hi | lo) & 0xffff;
    }
    const w = this.word(addr) >>> 0;
    return (w >>> ((addr & 3) << 3)) & 0xffff;
  }

  // ── GetShort_Signed_Old @0x238 ───────────────────────────────────────
  readShortSigned(addr: number): number {
    const v = this.readShort(addr);
    return (v & 0x8000) !== 0 ? v | -0x10000 : v;
  }

  // ── GetInt_Old @0x2A0 ────────────────────────────────────────────────
  readInt(addr: number): number {
    const w1 = this.word(addr);
    switch (addr & 3) {
      case 0:
        return w1;
      case 1:
        return i32(((w1 >>> 8) & 0xffffff) | (this.word(addr + 4) << 24));
      case 2:
        return i32(((w1 >>> 16) & 0xffff) | (this.word(addr + 4) << 24));
      default:
        return i32(((w1 >>> 24) & 0xff) | (this.word(addr + 4) << 8));
    }
  }

  // ── SetInt_Old @0x41C ────────────────────────────────────────────────
  writeInt(addr: number, value: number): void {
    const v = i32(value);
    const w1 = this.word(addr);
    const w2 = this.word(addr + 4);
    switch (addr & 3) {
      case 0:
        this.putWord(addr, v);
        return;
      case 1:
        this.putWord(addr, i32(((v & 0xffffff) << 8) | (w1 & 0xff)));
        this.putWord(addr + 4, i32((v >>> 24) | (w2 & 0xffffff00)));
        return;
      case 2:
        this.putWord(addr, i32(((v & 0xffff) << 16) | (w1 & 0xffff)));
        this.putWord(addr + 4, i32((v >>> 16) | (w2 & 0xffff0000)));
        return;
      default:
        this.putWord(addr, i32(((v & 0xff) << 24) | (w1 & 0xffffff)));
        this.putWord(addr + 4, i32((v >>> 8) | (w2 & 0xff000000)));
    }
  }

  // ── SetShort_Old @0x77C ──────────────────────────────────────────────
  writeShort(addr: number, value: number): void {
    const merged = ((this.readShort(addr + 2) << 16) | (value & 0xffff)) | 0;
    this.writeInt(addr, merged);
  }

  // ── SetByte_Old @0x7DC ───────────────────────────────────────────────
  writeByte(addr: number, value: number): void {
    this.writeInt(addr, i32((this.readInt(addr) & 0xffffff00) | (value & 0xff)));
  }

  /** 一字节一字节地写字符串（`0x213` strcpy 的语义），越界由 store 决定。 */
  writeString(addr: number, text: string): void {
    let off = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code <= 0xff) {
        this.writeByte(addr + off, code);
        off += 1;
      } else {
        // [推测] 原作是 cp950 双字节；这里按高位在前写两字节，好让读回时能复原。
        this.writeByte(addr + off, (code >> 8) & 0xff);
        this.writeByte(addr + off + 1, code & 0xff);
        off += 2;
      }
    }
    this.writeByte(addr + off, 0);
  }

  /** 读到 0 为止（`strcpy` 的对偶，测试用）。 */
  readString(addr: number, max = 256): string {
    let out = '';
    for (let i = 0; i < max; i++) {
      const b = this.readByte(addr + i);
      if (b === 0) break;
      out += String.fromCharCode(b);
    }
    return out;
  }
}

const WEATHER_NONE = 0;
const WEATHER_RAIN = 1;
const WEATHER_SNOW = 2;
const WEATHER_FOG = 3;

/** 布景点：EnterWar4/5/7 的生成配方（从字节码里抄下来的常量）。 */
export interface WarMarkerRecipe {
  resource: number;
  /** 列左闭右闭区间，会被 0x103 换成像素。 */
  col: [number, number];
  /** 行左闭右闭区间，会被 0x104 换成像素。 */
  row: [number, number];
}

/** `EnterWar4` 的 6 个定点标记（@0x124/0x294/0x3D8/0x51C/0x6B8/0x838 附近）。 */
const WAR4_MARKERS: readonly WarMarkerRecipe[] = [
  { resource: 402, col: [-2, 3], row: [14, 17] },
  { resource: 402, col: [4, 8], row: [14, 17] },
  { resource: 402, col: [48, 53], row: [14, 17] },
  { resource: 402, col: [54, 58], row: [14, 17] },
  { resource: 402, col: [9, 47], row: [14, 17] },
  { resource: 402, col: [-10, -2], row: [14, 17] },
];

const WAR5_COL_STEP = 7;
const WAR5_ROWS = 11;
const WAR5_ROW = 15;

const WAR7_COUNT = 60;

// ── R84：`0x114`/`0x124`/`0x139` 碰的 6 个引擎全局格 ────────────────────────
//
// 地址与语义来自 `work/syso84/` 里三个宿主函数的反汇编（`d114_44431C.txt` 是
// `0x420604 → 0x44431C` 的真身，`sys124_444362.txt`、`sys139_443CA8.txt` 同理）。
// 它们都在脚本内存窗口 `SYSTEM_SO_BASE`(0x4A6878) **之外**，SYSTEM.SO 的 39 个函数
// 一个都不读写这些地址，所以单独放进 `engineState`，不污染 `SysoMemory`。
const ENGINE_FLASH = 0x4a6660; // 闪白/受击白屏开关（`0x114`/`0x124` 清 0）
const ENGINE_BLACK = 0x4a6670; // 黑场/遮罩开关（同上）
const ENGINE_INTRO = 0x4a8a28; // `0x124` 置 1：台词框收尾
const ENGINE_BRIGHT = 0x48e520; // 亮度（`0x114` 复位到 0x10 = 满格 16）
const ENGINE_BATTLE_STATE = 0x4b4c34; // 战场状态字（`0x139` 往里 OR 位）
const ENGINE_BATTLE_MODE = 0x4a79c8; // `0x114` 用它判 0x100 位

/** 一帧里的宿主事件，测试与报告都靠它取证。 */
export type SysoEvent =
  | { kind: 'memory-write'; addr: number; value: number }
  | { kind: 'camera'; x: number; y: number }
  | { kind: 'map-camera'; x: number; y: number }
  | { kind: 'resource'; pattern: string }
  | { kind: 'script-call'; name: string; args: number[] }
  | { kind: 'text'; speaker: number; line: string; general: number }
  | { kind: 'sound'; name: string; volume: number }
  | { kind: 'spawn'; handle: number; resource: number; x: number; y: number }
  | { kind: 'weather'; weather: number; count: number }
  | { kind: 'general-kill'; general: number; slot: number; slots: [number, number] }
  | { kind: 'general-free'; general: number; slot: number }
  | { kind: 'hp-delta'; handle: number; delta: number }
  /** R84 `0xA(layer, general, id)`：按 `MSGnnn` 编号说话（`text` 是查表结果，查不到为空串）。 */
  | { kind: 'line'; layer: number; general: number; id: number; text: string }
  /** R84 `0x6(layer, action, general)`：在 5 槽对象表里让武将做动作。 */
  | { kind: 'act'; layer: number; action: number; general: number }
  /** R84 `0x139`：战场状态字 OR 进了新位。 */
  | { kind: 'battle-flag'; flag: number; state: number }
  /** R84 `0x114`/`0x124`：清闪白/黑场、亮度复位、台词收尾。 */
  | { kind: 'engine-reset'; what: 'overlay' | 'talk'; arg: number }
  /** R84 `0x211`：招降确认。 */
  | { kind: 'general-yield'; general: number }
  /** R137 `AllRush`：`0x131`/`0x110` 的压暗括号。 */
  | { kind: 'screen-flash'; on: boolean }
  /** R137 `AllRush`：`ports.allRush()` 的结果（`applied=false` = 本来就在突击态，幂等）。 */
  | { kind: 'all-rush'; applied: boolean };


/**
 * 还没有宿主实现的函数 —— R84 之后**清零**：最后 9 条（Battle2 … YieldGeneral）的
 * 释文全部从字节码里取到了（0x200 = 恒等透传、0x206 = 屏幕分区、0x6/0xA = 动作/台词
 * 分发、0x139/0x114/0x124 = 战场状态字与闪白清理），函数体逐条重写进了本文件。
 *
 * 导出保留（`wises_effects.ts` 与报告都按名字引用它），恒为空表。
 */
export const SYSO_UNSUPPORTED: ReadonlyArray<{ name: string; why: string }> = [];

/**
 * R84 的 9 条：函数体已按字节码重写，但**某个引擎通道还没端口接**，运行时只记录不渲染。
 *
 * 缺口逐条写清（差哪一段、哪份文档没有），`project/95_SYSTEM_SO补全.md` 有完整推导。
 * `runtime.ts` 里的接线不在本轮授权范围（只许动 `callScript` 的分派表），所以这些端口
 * 目前只有测试注入。
 */
export const SYSO_PORT_GAPS: ReadonlyArray<{ name: string; port: string; why: string }> = [
  {
    name: 'BattleYield',
    port: 'msg / unitAt',
    why: '函数体已实装（3 句原文 + 3 段镜头 + 0x139 + 0x114）；缺 `MSG` 表端口与"按句柄查坐标"端口，镜头与台词只进 events',
  },
  {
    name: 'StartBattle',
    port: 'msg / unitAt',
    why: '函数体已实装（4 组 0x6 + MSG300-409 双段叫阵 + 镜头）；缺 `msg`（编号取不到原文）与 `unitAt`（g2/g3 的像素坐标）',
  },
  {
    name: 'BattleEndTalk',
    port: 'msg',
    why: '函数体已实装（0x206 分区 → MSG240/500/600/270 四档 + 0x124）；缺 `msg` 表，只有编号进 events',
  },
  {
    name: 'ReportResult',
    port: '—',
    why: '已完整实装：8 条战报原文是函数内 `PUSHS` 常量，不依赖任何外部表',
  },
  {
    name: 'SearchTalk',
    port: 'msg / playAct',
    why: '函数体已实装（5 分支、MSG800-907 编号 + 3 个音效）；缺 `msg` 原文与 `playAct`（0x6 的引擎动作分发）',
  },
  {
    name: 'ChildGenTalkNew',
    port: 'msg / playAct / global',
    why: '函数体已实装（LDGIDX0 30+2*arg1 的两个武将、MSG816-907 两分支）；缺 `msg`、`playAct`，且 `LDGIDX 0` 的数组下标口径按"标量 g 空间"推断（[推测]）',
  },
  {
    name: 'YieldGeneral',
    port: 'msg / playAct / confirmYield',
    why: '函数体已实装（MSG950-988 两分支 + 0x211）；缺 `msg`、`playAct` 与 `confirmYield`（引擎 `status=6` 的招降落地）',
  },
  {
    name: 'CheckGround',
    port: '—',
    why: '原作第一条即 `RET 1`，函数体是空函数，已等价实装',
  },
  {
    name: 'Battle2',
    port: '—',
    why: '原作只有 `PUSHN 7; RET 0`，空壳，已等价实装',
  },
];

/** 39 行总表（顺序 = SYSTEM.SO 函数目录顺序）。 */
export interface SystemSoEntry {
  idx: number;
  name: string;
  addr: number;
  argc: number;
  status: 'host' | 'audio_bus' | 'unsupported';
  note: string;
}

export const SYSTEM_SO_FUNCTIONS: readonly SystemSoEntry[] = [
  { idx: 0, name: 'GetByte_Old', addr: 0x40, argc: 1, status: 'host', note: '读 1 字节（无符号）' },
  { idx: 1, name: 'GetByte_Signed_Old', addr: 0xac, argc: 1, status: 'host', note: '读 1 字节（符号扩展）' },
  { idx: 2, name: 'GetShort_Old', addr: 0x114, argc: 1, status: 'host', note: '读 2 字节（含跨字）' },
  { idx: 3, name: 'GetShort_Signed_Old', addr: 0x238, argc: 1, status: 'host', note: '读 2 字节（符号扩展）' },
  { idx: 4, name: 'GetInt_Old', addr: 0x2a0, argc: 1, status: 'host', note: '读 4 字节（非对齐）' },
  { idx: 5, name: 'SetInt_Old', addr: 0x41c, argc: 2, status: 'host', note: '写 4 字节（非对齐）' },
  { idx: 6, name: 'SetShort_Old', addr: 0x77c, argc: 2, status: 'host', note: '写 2 字节（保留高位）' },
  { idx: 7, name: 'SetByte_Old', addr: 0x7dc, argc: 2, status: 'host', note: '写 1 字节（读-改-写）' },
  { idx: 8, name: 'SetString_Old', addr: 0x830, argc: 2, status: 'host', note: 'strcpy + 写函数指针槽' },
  { idx: 9, name: 'MoveCamera', addr: 0x874, argc: 3, status: 'host', note: '(x,y,帧数) 线性推镜头' },
  { idx: 10, name: 'CheckGround', addr: 0xa8c, argc: 1, status: 'host', note: '空函数：首条 RET 1，后 20 条是死代码' },
  { idx: 11, name: 'WeatherObjectDeath', addr: 0xb3c, argc: 0, status: 'host', note: '回收当前天气物件' },
  { idx: 12, name: 'ProduceRain', addr: 0xbc4, argc: 0, status: 'host', note: '雨粒子批次（原作被 if(1) 短路）' },
  { idx: 13, name: 'ProduceSnow', addr: 0xd48, argc: 0, status: 'host', note: '雪粒子批次（同上）' },
  { idx: 14, name: 'ProduceFog', addr: 0xfe4, argc: 0, status: 'host', note: '雾：单个 9996 物件' },
  { idx: 15, name: 'Battle2', addr: 0x10d8, argc: 0, status: 'host', note: '空壳 PUSHN 7; RET 0（原作本身就是空的）' },
  { idx: 16, name: 'EnterWar4', addr: 0x10e8, argc: 0, status: 'host', note: '6 定点 + rand(6,9) 个 402 标记' },
  { idx: 17, name: 'EnterWar5', addr: 0x1aa8, argc: 0, status: 'host', note: '11 组 403/404 标记' },
  { idx: 18, name: 'EnterWar7', addr: 0x1bb0, argc: 0, status: 'host', note: '60 个 400/401 标记' },
  { idx: 19, name: 'LoadingBattleMap', addr: 0x1d54, argc: 1, status: 'audio_bus', note: '上一轮：战场环境音' },
  { idx: 20, name: 'BattleYield', addr: 0x1f70, argc: 7, status: 'host', note: '3 句招降台词 + 3 段镜头 + 0x139/0x114' },
  { idx: 21, name: 'StartBattle', addr: 0x2108, argc: 1, status: 'host', note: '4 组 0x6 + 两段叫阵 MSG300-409' },
  {
    idx: 22,
    name: 'AllRush',
    addr: 0x2b0c,
    argc: 0,
    status: 'host',
    note: 'R137 全軍突擊：压暗 → 全体转突击命令(0x10000) → Rush01 + 「全軍突擊!」 → 复亮',
  },
  { idx: 23, name: 'BattleEndTalk', addr: 0x2c90, argc: 1, status: 'host', note: '0x206 分区选 MSG240/500/600/270 + 0x124' },
  { idx: 24, name: 'ReportResult', addr: 0x3178, argc: 1, status: 'host', note: '8 条战报原文（函数内常量）' },
  { idx: 25, name: 'SearchTalk', addr: 0x33e4, argc: 1, status: 'host', note: '5 分支：MSG800-907 + 3 个音效' },
  { idx: 26, name: 'ChildGenTalkNew', addr: 0x3d40, argc: 1, status: 'host', note: '子嗣生成：MSG816-907 两分支' },
  { idx: 27, name: 'KillGeneral', addr: 0x4100, argc: 0, status: 'host', note: '随机死亡槽 + 0x209' },
  { idx: 28, name: 'FreeGeneral', addr: 0x41f4, argc: 0, status: 'host', note: '随机释放槽 + 0x210' },
  { idx: 29, name: 'YieldGeneral', addr: 0x424c, argc: 2, status: 'host', note: 'MSG950-988 两分支 + 0x211' },
  { idx: 30, name: 'DownBrightness', addr: 0x444c, argc: 2, status: 'audio_bus', note: '上一轮：压暗' },
  { idx: 31, name: 'RaiseBrightness', addr: 0x44d0, argc: 2, status: 'audio_bus', note: '上一轮：提亮' },
  { idx: 32, name: 'Test01', addr: 0x4554, argc: 0, status: 'host', note: '调试：对 g2 打 10000 伤害' },
  { idx: 33, name: 'EnterMapMoveCamera', addr: 0x4580, argc: 3, status: 'host', note: '(x,y,步长) 地图镜头平移' },
  { idx: 34, name: 'MajorDeath', addr: 0x4868, argc: 2, status: 'audio_bus', note: '上一轮：大将阵亡音' },
  { idx: 35, name: 'EnterWarprep', addr: 0x4974, argc: 0, status: 'host', note: '载入 5 组备战菜单资源' },
  { idx: 36, name: 'EnterBattle', addr: 0x49e0, argc: 0, status: 'host', note: 'CALLS InitializeBattle(0,0,0,0)' },
  { idx: 37, name: 'EnterMapmode', addr: 0x4a14, argc: 0, status: 'host', note: 'g2=0 + 载入 6 组地图菜单资源' },
  { idx: 38, name: 'EnterPolicy', addr: 0x4aa4, argc: 0, status: 'host', note: '载入 3 组内政菜单资源' },
];

/** 本文件接管的 35 个（报告里的"新实装清单"就是从这来的；R137 起含 `AllRush`）。 */
export const SYSO_HOST_NAMES: readonly string[] = SYSTEM_SO_FUNCTIONS.filter(
  (f) => f.status === 'host',
).map((f) => f.name);

/** 39 个名字（顺序同函数目录，供遍历/断言）。 */
export const SYSTEM_SO_NAMES: readonly string[] = SYSTEM_SO_FUNCTIONS.map((f) => f.name);

const HOST_NAMES = new Set<string>(SYSO_HOST_NAMES);

/** 名字是否由本文件的宿主实现接管。 */
export function isSystemSoHostName(name: string): boolean {
  return HOST_NAMES.has(name);
}

const num = (args: readonly SysoArg[], i: number): number => {
  const v = args[i];
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
};

const str = (args: readonly SysoArg[], i: number): string => {
  const v = args[i];
  return typeof v === 'string' ? v : '';
};

/** 0x103：列 → 像素（`a*96+48`）。 */
const colToPx = (col: number): number => col * 96 + 48;
/** 0x104：行 → 像素（`a*72+36`）。 */
const rowToPx = (row: number): number => row * 72 + 36;

/** mulberry32：自带的可播种随机数，`SysoHost` 没拿到 `ports.rand` 时用它。 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 39 个 SYSTEM.SO 函数里 34 个的宿主实现（R84 之后 39 个全部有实现：
 * 5 个音效在 `audio_bus.ts`，34 个在这里，`SYSO_UNSUPPORTED` 已清空）。
 *
 * 每个 `case` 都对应 `work/system_so/funcs.txt` 里的一段指令流；变量名沿用
 * 反汇编的 `locN`，方便对照。
 */
export class SysoHost {
  readonly mem: SysoMemory;
  readonly ports: SysoPorts;

  /** 战斗镜头（`0x111/0x112` 的镜像）。 */
  camera = { x: 0, y: 0 };
  /** 地图镜头（`0x205`）。 */
  mapCamera = { x: 160, y: 120 };
  /** `STG g2` 的重入守卫：EnterMapMoveCamera 用同一个 g2。 */
  mapPanGuard = false;

  weather: Weather = 0 as Weather;
  weatherObjects: SysoSpawn[] = [];
  /** 所有生成过的物件，按顺序。 */
  spawns: SysoSpawn[] = [];

  cameraTrace: Array<{ x: number; y: number }> = [];
  mapCameraTrace: Array<{ x: number; y: number }> = [];
  resources: string[] = [];
  scriptCalls: Array<{ name: string; args: number[] }> = [];
  texts: Array<{ speaker: number; line: string; general: number }> = [];
  sounds: Array<{ name: string; volume: number }> = [];
  hpDeltas: Array<{ handle: number; delta: number }> = [];
  events: SysoEvent[] = [];

  /** R84 `0xA` 的记录：`{ layer, general, id, text }`（`text` 是端口查表结果，查不到为空）。 */
  lines: Array<{ layer: number; general: number; id: number; text: string }> = [];
  /** R84 `0x6` 的记录：5 槽对象表里的动作派发。 */
  acts: Array<{ layer: number; action: number; general: number }> = [];
  /** R84 `0x211` 的记录：招降确认。 */
  yields: number[] = [];
  /** R84 `WAIT n` 的累计帧数（SearchTalk/ChildGenTalkNew 的握手段也要算进去）。 */
  waits = 0;
  /** R84 的 6 个引擎全局格（地址见 `ENGINE_*` 常量），不占脚本内存窗口。 */
  readonly engineState = new Map<number, number>();

  private readonly rng: () => number;
  private nextHandle: number;
  /** 未接引擎时的本地字表（`engineGet/engineSet` 由调用方给的时候不用它）。 */
  private readonly fallback = new SparseWordStore();

  constructor(ports: SysoPorts = {}, opts: { seed?: number; nextHandle?: number; store?: SysoWordStore } = {}) {
    this.ports = ports;
    this.rng = makeRng(opts.seed ?? 0x51c0);
    this.nextHandle = opts.nextHandle ?? 1;
    this.mem = new SysoMemory(opts.store ?? this.fallback);
  }

  /** 随机整数（闭区间）。有 `ports.rand` 就走引擎的 RNG，保证与脚本同源。 */
  rand(min: number, max: number): number {
    if (this.ports.rand) return this.ports.rand(min, max);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  }

  /** 脚本全局槽（`LDG n`）。 */
  global(index: number): number {
    return this.ports.global?.(index) ?? 0;
  }

  /** 该名字是否由本文件接管。 */
  has(name: string): boolean {
    return HOST_NAMES.has(name);
  }

  /**
   * 主入口：按名字派发。
   *
   * `args` 按**脚本压栈顺序**：`args[0]` 是源码里的第一个实参 = 函数体内的 `argN`
   * （`arg1` 是最后压的那个，在栈顶）。所以 `SetInt_Old(addr, value)` 传
   * `[addr, value]`——字节码里用 `arg2` 当地址、`arg1` 当值，
   * 与原作调用点 `PUSHI addr; PUSHI value; CALL SetInt_Old` 对得上。
   */
  call(name: string, args: readonly SysoArg[] = []): SysoCallResult {
    if (!HOST_NAMES.has(name)) return { handled: false };
    switch (name) {
      case 'GetByte_Old':
        return { handled: true, value: this.mem.readByte(num(args, 0)) };
      case 'GetByte_Signed_Old':
        return { handled: true, value: this.mem.readByteSigned(num(args, 0)) };
      case 'GetShort_Old':
        return { handled: true, value: this.mem.readShort(num(args, 0)) };
      case 'GetShort_Signed_Old':
        return { handled: true, value: this.mem.readShortSigned(num(args, 0)) };
      case 'GetInt_Old':
        return { handled: true, value: this.mem.readInt(num(args, 0)) };
      case 'SetInt_Old':
        // 源序 `SetInt_Old(addr, value)`：字节码里 arg2 才是地址
        // （`loc1 = arg2 & 3`、`G[(arg2-base)>>2]`），而 arg1 是要写的值；
        // 与原作调用点 `PUSHI addr; PUSHI value; CALL SetInt_Old` 一致。
        this.mem.writeInt(num(args, 0), num(args, 1));
        this.events.push({ kind: 'memory-write', addr: num(args, 0), value: num(args, 1) });
        return { handled: true };
      case 'SetShort_Old':
        this.mem.writeShort(num(args, 0), num(args, 1));
        this.events.push({ kind: 'memory-write', addr: num(args, 0), value: num(args, 1) });
        return { handled: true };
      case 'SetByte_Old':
        this.mem.writeByte(num(args, 0), num(args, 1));
        this.events.push({ kind: 'memory-write', addr: num(args, 0), value: num(args, 1) });
        return { handled: true };
      case 'SetString_Old':
        this.setStringOld(num(args, 0), args[1]);
        return { handled: true };
      case 'MoveCamera':
        this.moveCamera(num(args, 0), num(args, 1), num(args, 2));
        return { handled: true };
      case 'EnterMapMoveCamera':
        this.enterMapMoveCamera(num(args, 0), num(args, 1), num(args, 2));
        return { handled: true };
      case 'WeatherObjectDeath':
        this.weatherObjectDeath();
        return { handled: true };
      case 'ProduceRain':
        this.produceRain();
        return { handled: true };
      case 'ProduceSnow':
        this.produceSnow();
        return { handled: true };
      case 'ProduceFog':
        this.produceFog();
        return { handled: true };
      case 'EnterWar4':
        this.enterWar4();
        return { handled: true };
      case 'EnterWar5':
        this.enterWar5();
        return { handled: true };
      case 'EnterWar7':
        this.enterWar7();
        return { handled: true };
      case 'KillGeneral':
        this.killGeneral();
        return { handled: true };
      case 'FreeGeneral':
        this.freeGeneral();
        return { handled: true };
      case 'Test01':
        this.test01();
        return { handled: true };
      case 'EnterWarprep':
        this.loadAll(['MENU\\D0_*', 'MENU\\D1_2A', 'MENU\\D1_2B', 'MENU\\D12*', 'MENU\\WARPREP*']);
        return { handled: true };
      case 'EnterMapmode':
        this.ports.setGlobal?.(2, 0);
        this.loadAll([
          'MENU\\D3*',
          'MENU\\D4*',
          'MENU\\D28',
          'MENU\\D1_2A',
          'MENU\\D1_2B',
          'MENU\\D12*',
        ]);
        return { handled: true };
      case 'EnterPolicy':
        this.loadAll(['MENU\\S0*', 'MENU\\C3_B*', 'MENU\\D1*']);
        return { handled: true };
      case 'EnterBattle':
        // 原作：PUSHS "InitializeBattle"; PUSHI 0 ×4; CALLS
        this.callScript('InitializeBattle', [0, 0, 0, 0]);
        return { handled: true };
      // ── R84：最后 9 条（字节码见 export/script/system_so.dis.txt 的 #10/#15/#20/#21/#23-#26/#29）──
      case 'CheckGround':
        // @0xA8C：首条就是 `RET 1`（清一个参数后返回）。后面 0xA94..0xB34 那 20 条
        // （`while (0x107(arg1) <= 0) WAIT 1` + 0x17/0x25/0x26）与 WeatherObjectDeath
        // 主体逐条同构，但函数已经返回，是死代码 ⇒ 宿主侧就是空函数。
        return { handled: true };
      case 'Battle2':
        // @0x10D8：`PUSHN 7; RET 0`——原作本身就是空壳，7 个局部变量一个都没用。
        return { handled: true };
      case 'BattleYield':
        // 7 参：args[6]=arg1 … args[0]=arg7（arg4/arg5 原作未用）
        this.battleYield(num(args, 6), num(args, 5), num(args, 4), num(args, 1), num(args, 0));
        return { handled: true };
      case 'StartBattle':
        this.startBattle(num(args, 0));
        return { handled: true };
      case 'BattleEndTalk':
        this.battleEndTalk(num(args, 0));
        return { handled: true };
      case 'ReportResult':
        this.reportResult(num(args, 0));
        return { handled: true };
      case 'SearchTalk':
        this.searchTalk(num(args, 0));
        return { handled: true };
      case 'ChildGenTalkNew':
        this.childGenTalkNew(num(args, 0));
        return { handled: true };
      case 'YieldGeneral':
        // 原作只读 arg2（`LDSL arg2` 判 0/1），arg1 在 51 条指令里一次都没读。
        this.yieldGeneral(num(args, 1));
        return { handled: true };
      case 'AllRush':
        // R137：全軍突擊（`system_so.dis.txt:1536-1585` 的 22 条指令逐条落在 allRushCommand）
        this.allRushCommand();
        return { handled: true };
      default:
        return { handled: false };
    }
  }

  // ── 内存族 ───────────────────────────────────────────────────────────

  /**
   * `SetString_Old(dest, src)` @0x830：
   * `SetInt_Old(0x4A71FC, 0x46DA60)` 把宿主 strcpy 的地址写进函数指针槽，
   * 再 `SYSCALL 0x213(dest, src)` 做逐字节拷贝。
   */
  setStringOld(dest: number, src: SysoArg | undefined): void {
    this.mem.writeInt(STRING_PTR_SLOT, STRCPY_STUB_ADDR);
    this.events.push({ kind: 'memory-write', addr: STRING_PTR_SLOT, value: STRCPY_STUB_ADDR });
    const text = typeof src === 'string' ? src : src === undefined ? '' : String(src);
    this.mem.writeString(dest, text);
  }

  // ── 镜头 ─────────────────────────────────────────────────────────────

  /**
   * `MoveCamera(x, y, frames)` @0x874。
   *
   * 原作把坐标放大 1000 倍做定长线性插值：`step = (target*1000 - cam*1000) / frames`，
   * 每步 `SYSCALL 0x100(cx/1000, cy/1000)` + `WAIT 1`，并用 `|cx/100 - tx/100|` 的
   * 比较做提前收尾（0xA3C 那段 `LAND/JNZ`）。
   * 重制版照抄千分位步长与提前收尾，[推测] 最后一步强制落到目标点，
   * 免得千分位整除的余数让镜头永远差几像素。
   */
  moveCamera(x: number, y: number, frames: number): void {
    const cur = this.cameraNow();
    const steps = Math.trunc(frames);
    if (!(steps > 0)) {
      this.setCamera(x, y);
      return;
    }
    const tx = x * 1000;
    const ty = y * 1000;
    let cx = cur.x * 1000;
    let cy = cur.y * 1000;
    const dx = Math.trunc((tx - cx) / steps);
    const dy = Math.trunc((ty - cy) / steps);
    for (let i = 0; i < steps; i++) {
      cx += dx;
      cy += dy;
      const last = i === steps - 1;
      this.setCamera(last ? x : Math.trunc(cx / 1000), last ? y : Math.trunc(cy / 1000));
      if (
        Math.trunc(cx / 100) === Math.trunc(tx / 100) &&
        Math.trunc(cy / 100) === Math.trunc(ty / 100)
      ) {
        break;
      }
    }
  }

  /**
   * `EnterMapMoveCamera(x, y, step)` @0x4580。
   *
   * 原作：`g2 != 0` 直接返回（重入守卫），`g2 = 1`；起点 `0x203/0x204`（160,120
   * 屏幕中心），步长 `min(|delta|/2, step)`，每步 `SYSCALL 0x205(cx, cy)` + `WAIT 1`。
   * [推测] 原作的循环条件只判步长是否为 0，而步长在循环里不变，所以永不退出；
   * 这里改成"走到目标就收"，并把 `g2` 清回去，好让下一次调用还能进来。
   */
  enterMapMoveCamera(x: number, y: number, step: number): void {
    if (this.mapPanGuard || this.global(2) !== 0) {
      this.events.push({ kind: 'map-camera', x: this.mapCamera.x, y: this.mapCamera.y });
      return;
    }
    this.mapPanGuard = true;
    let cx = 160;
    let cy = 120;
    const dxTotal = x - 160;
    const dyTotal = y - 120;
    const stepX = this.panStep(dxTotal, step);
    const stepY = this.panStep(dyTotal, step);
    for (let i = 0; i < 4096 && (cx !== x || cy !== y); i++) {
      cx = stepX > 0 ? Math.min(cx + stepX, x) : stepX < 0 ? Math.max(cx + stepX, x) : x;
      cy = stepY > 0 ? Math.min(cy + stepY, y) : stepY < 0 ? Math.max(cy + stepY, y) : y;
      this.ports.setMapCamera?.(cx, cy);
      this.ports.setTargetPx?.(cx, cy);
      this.mapCamera = { x: cx, y: cy };
      this.mapCameraTrace.push({ x: cx, y: cy });
      this.events.push({ kind: 'map-camera', x: cx, y: cy });
    }
    this.mapPanGuard = false;
  }

  /** `|d|/2 < step ? d/2 : (d>0 ? step : -step)`（0x4580 的两个分支）。 */
  private panStep(d: number, step: number): number {
    if (Math.floor(Math.abs(d) / 2) < step) return Math.trunc(d / 2);
    return d > 0 ? step : -step;
  }

  private cameraNow(): { x: number; y: number } {
    const p = this.ports.targetPx?.();
    if (p) return { x: p.x, y: p.y };
    return this.camera;
  }

  private setCamera(x: number, y: number): void {
    this.camera = { x, y };
    this.cameraTrace.push({ x, y });
    this.ports.setTargetPx?.(x, y);
    this.events.push({ kind: 'camera', x, y });
  }

  // ── 天气 ─────────────────────────────────────────────────────────────

  /**
   * `WeatherObjectDeath()` @0xB3C：`0xB` 取当前施法单位（天气系统里就是刚生成的
   * 天气物件句柄）→ `0x17(handle,0,0)` 归位 → `0x25(handle,4096)` +
   * `0x26(handle,16,1)` 交给引擎回收。重制版直接把最近一批天气物件标记为已回收。
   */
  weatherObjectDeath(): void {
    const last = this.weatherObjects[this.weatherObjects.length - 1];
    if (!last) return;
    this.ports.setObjectPx?.(last.handle, 0, 0, 0);
    this.weatherObjects = [];
    this.weather = WEATHER_NONE as Weather;
    this.events.push({ kind: 'weather', weather: WEATHER_NONE, count: 0 });
  }

  /**
   * `ProduceRain()` @0xBC4。
   *
   * 原作：`n = rand(3,10)`，循环 `n` 次生成 `9994+rand(0,2)` 物件，
   * `x = rand(0,1024)`、`y = rand(0,1024)`、速度 `rand(300,500)`，
   * `0x18(handle, ..., rand(2,5))` 设寿命。
   * 注意函数体开头是 `PUSHI 1; JNZ 结尾`（= `if (1) return`），所以这段在原作里
   * **永远不执行**——重制版按它写下的常量重建，标 [推测]。
   */
  produceRain(): void {
    const n = Math.max(1, Math.min(16, this.rand(3, 10)));
    const batch: SysoSpawn[] = [];
    for (let i = 0; i < n; i++) {
      const x = this.rand(0, 1024);
      const y = this.rand(0, 1024);
      const speed = this.rand(300, 500);
      const resource = WEATHER_RESOURCE_BASE + Math.abs(this.rand(0, 2));
      const frames = this.rand(2, 5);
      const handle = this.spawn(resource, x, y, 0, 'rain', { motion: speed, frames });
      batch.push(this.spawns[this.spawns.length - 1]);
      this.ports.setObjectPx?.(handle, x, y + speed, 0);
    }
    this.weatherObjects = batch;
    this.weather = WEATHER_RAIN as Weather;
    this.events.push({ kind: 'weather', weather: WEATHER_RAIN, count: n });
  }

  /**
   * `ProduceSnow()` @0xD48。比雨多三件事：全局风力 `rand(0,255)`、变体
   * `rand(1,3)`、以及每个粒子 `0x1C` 换 SHP（`MAGIC\M013WingA6.SHP`）、
   * `0x1D` 设速度 `rand(256,512)`、`0x1B(v,v)` 设运动 `rand(40960,65536)`。
   * 同样整段被 `PUSHI 1; JNZ` 短路，[推测]。
   */
  produceSnow(): void {
    const wind = this.rand(0, 255);
    const variant = this.rand(1, 3);
    const n = Math.max(1, Math.min(16, this.rand(3, 10)));
    const batch: SysoSpawn[] = [];
    for (let i = 0; i < n; i++) {
      const x = this.rand(0, 1024);
      const y = this.rand(0, 1024);
      const speed = this.rand(256, 512);
      const motion = this.rand(40960, 65536);
      const resource = WEATHER_RESOURCE_BASE + Math.abs(this.rand(0, 2));
      const frames = this.rand(2, 4);
      const handle = this.spawn(resource, x, y, 0, 'snow', { motion, frames });
      batch.push(this.spawns[this.spawns.length - 1]);
      this.ports.setObjectPx?.(handle, x, y + speed, 0);
    }
    this.snow = { wind, variant, animation: 'MAGIC\\M013WingA6.SHP' };
    this.weatherObjects = batch;
    this.weather = WEATHER_SNOW as Weather;
    this.events.push({ kind: 'weather', weather: WEATHER_SNOW, count: n });
  }

  /** 雪的全局参数（测试用）。 */
  snow = { wind: 0, variant: 0, animation: '' };

  /**
   * `ProduceFog()` @0xFE4：只生成一个物件，`9994+rand(0,2)`，
   * `x/y = rand(0,1024)`，第三参 `rand(300,500)`，并 `0x1C` 换成
   * `MENU\GAMEOVER.SHP`。这一段是**可达代码**（没有被短路），所以依据最硬。
   */
  produceFog(): void {
    const x = this.rand(0, 1024);
    const y = this.rand(0, 1024);
    const size = this.rand(300, 500);
    const resource = WEATHER_RESOURCE_BASE + Math.abs(this.rand(0, 2));
    const handle = this.spawn(resource, x, y, 0, 'fog', { motion: size, frames: 0 });
    this.ports.setObjectPx?.(handle, x, y, 0);
    this.fog = { animation: 'MENU\\GAMEOVER.SHP', size };
    this.weatherObjects = [this.spawns[this.spawns.length - 1]];
    this.weather = WEATHER_FOG as Weather;
    this.events.push({ kind: 'weather', weather: WEATHER_FOG, count: 1 });
  }

  /** 雾的资源（测试用）。 */
  fog = { animation: '', size: 0 };

  // ── 布景/阵型标记 ────────────────────────────────────────────────────

  /**
   * `EnterWar4()` @0x10E8：6 个定点 402 标记（列区间见 `WAR4_MARKERS`），
   * 再 `n = rand(6,9)` 个散布标记（列 `rand(9,47)`）。
   * 每个标记：`x = 0x103(col) + rand(0,96)`、`y = 0x104(row) + rand(0,72)`、
   * `0x1B(v,v)`，`v = rand(32768,65536)`。
   */
  enterWar4(): void {
    for (const m of WAR4_MARKERS) this.spawnWarMarker(m);
    const n = Math.max(1, Math.min(12, this.rand(6, 9)));
    for (let i = 0; i < n; i++) this.spawnWarMarker({ resource: 402, col: [9, 47], row: [14, 17] });
  }

  /**
   * `EnterWar5()` @0x1AA8：固定 11 组，行固定 15，列 `i*7`，
   * 组内两个标记：403 在 `(x, y)`，404 在 `(x, y+70)`。**无随机**。
   */
  enterWar5(): void {
    for (let i = 0; i < WAR5_ROWS; i++) {
      const x = colToPx(i * WAR5_COL_STEP);
      const y = rowToPx(WAR5_ROW);
      this.spawn(403, x, y, 0, 'war-marker', { motion: 0, frames: 0 });
      this.spawn(404, x, y + 70, 0, 'war-marker', { motion: 0, frames: 0 });
    }
  }

  /**
   * `EnterWar7()` @0x1BB0：60 个标记，`row = rand(14,17)`、`col = rand(0,71)`，
   * `x/y` 各加 `rand(0,96)/rand(0,72)` 抖动，资源 `400 + rand(0,1)`，
   * 运动 `rand(40960,65536)`。
   */
  enterWar7(): void {
    for (let i = 0; i < WAR7_COUNT; i++) {
      const row = this.rand(14, 17);
      const col = this.rand(0, 71);
      const x = colToPx(col) + this.rand(0, 96);
      const y = rowToPx(row) + this.rand(0, 72);
      const resource = 400 + Math.abs(this.rand(0, 1));
      const motion = this.rand(40960, 65536);
      this.spawn(resource, x, y, 0, 'war-marker', { motion, frames: 0 });
    }
  }

  private spawnWarMarker(m: WarMarkerRecipe): void {
    const row = this.rand(m.row[0], m.row[1]);
    const col = this.rand(m.col[0], m.col[1]);
    const x = colToPx(col) + this.rand(0, 96);
    const y = rowToPx(row) + this.rand(0, 72);
    const motion = this.rand(32768, 65536);
    this.spawn(m.resource, x, y, 0, 'war-marker', { motion, frames: 0 });
  }

  private spawn(
    resource: number,
    x: number,
    y: number,
    z: number,
    kind: SysoSpawn['kind'],
    extra: { motion: number; frames: number },
  ): number {
    const handle = this.ports.spawnObject?.(resource, x, y, z, 0) ?? this.nextHandle++;
    this.spawns.push({ handle, resource, x, y, z, motion: extra.motion, frames: extra.frames, kind });
    this.events.push({ kind: 'spawn', handle, resource, x, y });
    return handle;
  }

  // ── 武将生灭 ─────────────────────────────────────────────────────────

  /**
   * `KillGeneral()` @0x4100：`slot = rand(0,10)`，向 `0xA(0, g7, 910+2*slot)`
   * 与 `0xA(1, g8, 911+2*slot)` 两处写"死亡动画槽"，说一句 `%E%`（空台词），
   * `WAIT 20` 后 `0x209` 让引擎处理阵亡。
   * [推测] 0xA 的 3 个参数按"写引擎变量"理解；重制版只记录事件与槽号。
   */
  killGeneral(): void {
    const slot = Math.abs(this.rand(0, 10));
    const general = this.global(7);
    const paired = this.global(8);
    const slots: [number, number] = [910 + slot * 2, 911 + slot * 2];
    this.ports.engineWrite?.(0, general, slots[0]);
    this.ports.engineWrite?.(1, paired, slots[1]);
    this.pushText(0, '');
    this.events.push({ kind: 'general-kill', general, slot, slots });
  }

  /**
   * `FreeGeneral()` @0x41F4：`0xA(0, g7, rand(940,945))`，`WAIT 20`，`0x210`。
   * [推测] 同上，0xA 当"写引擎变量"。
   */
  freeGeneral(): void {
    const slot = Math.abs(this.rand(940, 945));
    const general = this.global(7);
    this.ports.engineWrite?.(0, general, slot);
    this.events.push({ kind: 'general-free', general, slot });
  }

  /** `Test01()` @0x4554：`0x125(g2, 0, 10000)` —— 调试用的"打 10000 伤害"。 */
  test01(): void {
    const handle = this.global(2);
    this.hpDeltas.push({ handle, delta: 10000 });
    this.ports.applyHpDelta?.(handle, 10000);
    this.events.push({ kind: 'hp-delta', handle, delta: 10000 });
  }

  /**
   * `0x43ED96` 伤害宿主函数（R67）——`SYSCALL 0x125` 的宿主侧入口。
   *
   * 与 `test01()` 的区别：`test01` 是写死的调试调用（`0x125(g2, 0, 10000)`），这条是
   * **通用**通道：普攻结算与 MAGIC.SO 里的 `Hurt` 都从这里进。参数语义同原作
   * （`docs/04b3:377`：`0x43ED96(objVictim, dmg, objSrc)`），
   * 返回实际写入的差值。夹 0..maxHP / 判死的那一半在 `damageHostApply()`。
   */
  hurt(handle: number, amount: number, src = 0): number {
    const got = this.ports.damage?.(handle, amount, src);
    const delta = typeof got === 'number' && Number.isFinite(got) ? got : amount;
    this.hpDeltas.push({ handle, delta });
    this.events.push({ kind: 'hp-delta', handle, delta });
    return delta;
  }

  // ── 战场台词族（R84）────────────────────────────────────────────────
  //
  // 这 9 条的字节码在 `export/script/system_so.dis.txt` 的 #10/#15/#20/#21/#23-#26/#29；
  // 它们卡住的 5 个宿主 syscall 已经在 `work/syso84/` 里读到了真身：
  //   0x200 @0x4209D4 恒等透传（原文记的"读战场统计"是误读）
  //   0x206 @0x420A8F 屏幕三档（0 出屏 / 1 边线 / 2 屏内）
  //   0x6   @0x41F9C1 → 0x434885 五槽对象表的动作派发
  //   0xA   @0x41FA3C → 0x43483A 按 `MSGnnn` 编号说话
  //   0x139 @0x443CF5 战场状态字 OR / 0x114 @0x44431C 清闪白 / 0x124 @0x444362 收尾
  //   0x211 @0x420B12 → 0x44EBE2 招降确认
  // 变量名照抄原作的 locN / argN，方便与反汇编逐行对照。

  /** `WAIT n`：重制版没有帧循环，只累计帧数（报告/测试靠它核对节奏）。 */
  private wait(frames: number): void {
    this.waits += Math.max(0, Math.trunc(frames));
  }

  /** 写一个引擎全局格（都在脚本内存窗口之外，见 `ENGINE_*`）。 */
  private engineSet(addr: number, value: number): void {
    this.engineState.set(addr, i32(value));
  }

  private engineGet(addr: number): number {
    return this.engineState.get(addr) ?? 0;
  }

  /** `0x301` @0x420B77 → `0x4699A0(name, vol)`：播放音效。 */
  private playSound(name: string, volume: number): void {
    this.sounds.push({ name, volume });
    this.events.push({ kind: 'sound', name, volume });
    this.ports.sound?.(name, volume);
  }

  /** `0x105`/`0x106`：武将像素坐标（端口查不到就 undefined，按"没有该物件"处理）。 */
  private unitPos(handle: number): SysoUnitPos | undefined {
    if (!handle) return undefined;
    return this.ports.unitAt?.(handle);
  }

  /**
   * `0x206` @0x420A8F：屏幕分区判定。
   *
   * ```
   * if (!obj) return 0;
   * if (short[obj+0x34] >= 0x5A || short[obj+0x36] >= 0x5A) return 0;  // 90 格：出屏
   * if (short[obj+0x34] >= 0x4B || short[obj+0x36] >= 0x4B) return 1;  // 75 格：边线
   * return 2;                                                        // 屏内
   * ```
   * `+0x34/+0x36` 是有符号 short 的格列/格行（反汇编里是 `movsx` 后 `cmp`）。
   */
  private screenRegion(handle: number): number {
    const pos = this.unitPos(handle);
    if (!pos) return 0;
    if (pos.col >= 0x5a || pos.row >= 0x5a) return 0;
    if (pos.col >= 0x4b || pos.row >= 0x4b) return 1;
    return 2;
  }

  /**
   * `0x6(layer, action, general)` @0x41F9C1 → `0x434885`。
   *
   * 原作：`if (layer < 5 && general != 0) { obj = *(0x4BC160 + layer*4); obj->vtbl[0x20](obj, action, general); }`
   * —— 五槽对象表按层取对象，让它对 `general` 播动作 `action`。SYSTEM.SO 的实参是
   * `(0|1|2|3, 1|2|3, 武将句柄)`（句柄取 g7/g8/g9 或 LDGIDX 出来的武将）。
   */
  private playAct(layer: number, action: number, general: number): void {
    if (layer < 0 || layer >= 5 || general === 0) return;
    this.acts.push({ layer, action, general });
    this.events.push({ kind: 'act', layer, action, general });
    this.ports.playAct?.(layer, action, general);
  }

  /**
   * `0xA(layer, general, id)` @0x41FA3C：**第三参是 `MESSAGE.INI` 的 `MSGnnn` 编号**。
   *
   * 原作 `if (*(0x4A64D4 + layer*4))` 取对象，把 `(general, id)` 交给 `0x43483A` →
   * `0x4347B6`（与 `0x6` 同一个落点），引擎按编号取原文渲染；号段见
   * `docs/03d-文本与配置.md:11-27`（200 险胜/平手、300 叫阵、400 接战、500 败逃、
   * 600-705 完胜、800 招降/加入、950+ 招降表）。
   * 重制版没有台词表端口时只发 `line` 事件（`text` 为空串），编号照样留证。
   */
  private sayMsg(layer: number, general: number, id: number): void {
    const text = this.ports.msg?.(id) ?? '';
    this.lines.push({ layer, general, id, text });
    this.events.push({ kind: 'line', layer, general, id, text });
    if (text) this.pushText(layer, text, general);
  }

  /**
   * `0x139(x)` @0x443CF5 → `0x443CA8`：往战场状态字 `0x4B4C34` 里 OR 标志位。
   *
   * ```
   * 0x443CA8(x == 0 ? 0x200 : 0x100);   // 0 = 敌方胜 / 非 0 = 我方胜
   * 0x443CA8(0x1000);                   // 收尾
   * // 0x443CA8(n): if ((n & 3) && (state & (4 | 8))) return;  state |= n;
   * ```
   * 三个传入值的低两位都是 0，所以那条"已经在 4/8 状态就别写"的守卫永远不会触发，
   * 等价于纯 OR（`work/syso84/sys139_443CA8.txt`）。
   */
  private orBattleFlag(x: number): void {
    for (const flag of [x === 0 ? 0x200 : 0x100, 0x1000]) {
      const state = this.engineGet(ENGINE_BATTLE_STATE) | flag;
      this.engineSet(ENGINE_BATTLE_STATE, state);
      this.events.push({ kind: 'battle-flag', flag, state });
    }
  }

  /**
   * `0x114(arg)` @0x420604 → `0x44431C`：清闪白 / 黑场，亮度复位到 `0x10`（满格 16）。
   *
   * 原作最后还有一句 `if ((!([0x4A79C8] & 0x100)) && arg != 0) 0x41C889(0x48F3F8)`
   * —— 投一条引擎消息给暗场淡入例程；重制版没有消息队列，按 [推测] 只记录条件。
   */
  private resetOverlay(arg: number): void {
    this.engineSet(ENGINE_FLASH, 0);
    this.engineSet(ENGINE_BLACK, 0);
    this.engineSet(ENGINE_BRIGHT, 0x10);
    const fade = (this.engineGet(ENGINE_BATTLE_MODE) & 0x100) === 0 && arg !== 0 ? 1 : 0;
    this.events.push({ kind: 'engine-reset', what: 'overlay', arg: fade });
  }

  /** `0x124()` @0x420763 → `0x444362`：清闪白/黑场 + 置 `0x4A8A28 = 1`（台词框收尾）。 */
  private resetTalk(): void {
    this.engineSet(ENGINE_FLASH, 0);
    this.engineSet(ENGINE_BLACK, 0);
    this.engineSet(ENGINE_INTRO, 1);
    this.events.push({ kind: 'engine-reset', what: 'talk', arg: 1 });
  }

  /**
   * `0x211` @0x420B12 → `0x44EBE2`：招降确认。
   *
   * 引擎侧是 `if ([0x4A8094] == 1) { entry[[0x4A8090]].status = 6; 0x44E820(); } 0x44E9B3();`
   * （`docs/04b2_招降斩首与战后结算.md:148-158`）——主语来自引擎的"待招降"状态，
   * 不在脚本参数里；[推测] 这里拿 `general` 当记录键，端口负责真落地。
   */
  private confirmYield(general: number): void {
    this.yields.push(general);
    this.events.push({ kind: 'general-yield', general });
    this.ports.confirmYield?.(general);
  }

  /**
   * `BattleYield(arg1..arg7)` @0x1F70（7 参，PUSHN 4）。
   *
   * 字节码（源序实参 → 局部）：
   * ```
   * loc1 = 0x105(arg7); loc2 = 0x106(arg7);    // 句柄 arg7 的像素坐标
   * loc3 = 0x105(arg6); loc4 = 0x106(arg6);    // 句柄 arg6 的像素坐标
   * MoveCamera(loc1, loc2 - 128, 60);  0x3(arg3, 0, "%S2%將軍，請加入我方，共創統一大業!!%k%%e%");
   * MoveCamera(loc3, loc4 - 128, 60);  0x3(arg2, 0, "就讓我們共創統一大業吧!!%k%%e%");
   * MoveCamera(loc1, loc2 - 128, 60);  0x3(arg3, 0, "將軍真是明智之舉!!%k%%e%");
   * 0x139(arg1);  0x114(0);
   * ```
   * `arg4`/`arg5`（调用点是 `2, 3`）在函数体里一次都没读。
   */
  battleYield(arg1: number, arg2: number, arg3: number, arg6: number, arg7: number): void {
    const target = this.unitPos(arg7);
    const caller = this.unitPos(arg6);
    // [推测] 句柄查不到坐标时跳过该段镜头（原作会拿 0 去推一个镜头，重制版不这么干）
    if (target) this.moveCamera(target.x, target.y - 128, 60);
    this.pushText(arg3, '%S2%將軍，請加入我方，共創統一大業!!%k%%e%', 0);
    if (caller) this.moveCamera(caller.x, caller.y - 128, 60);
    this.pushText(arg2, '就讓我們共創統一大業吧!!%k%%e%', 0);
    if (target) this.moveCamera(target.x, target.y - 128, 60);
    this.pushText(arg3, '將軍真是明智之舉!!%k%%e%', 0);
    this.orBattleFlag(arg1);
    this.resetOverlay(0);
  }

  /**
   * `StartBattle(arg1)` @0x2108（PUSHN 10）。
   *
   * ```
   * 0x6(3,1,g7); 0x6(2,1,g8); 0x6(3,2,g8); 0x6(2,2,g7);
   * if (arg1 == 1)  { BattleYield(g3,g2,g8,g7,2,3,1); return; }
   * if (arg1 == -1) { BattleYield(g2,g3,g7,g8,3,2,0); return; }
   * loc4 = 0x206(g7); loc5 = 0x206(g8);
   * MoveCamera(0x105(g3), 0x106(g3) - 128, 30);
   * loc3 = <第一段叫阵编号>;  0xA(2, 0, loc3);
   * MoveCamera(0x105(g2), 0x106(g2) - 128, 60);
   * do { loc4 = <第二段叫阵编号> } while (loc4 == loc3);
   * 0xA(3, 0, loc4);  0x114(1);
   * ```
   * 两段编号是 `MSG300-409`（叫阵/接战），第一条按 loc5 分档，第二条按 loc6 分档、
   * 只在 loc6==2 时才看 loc5（`export/script/system_so.dis.txt` 0x2108-0x2AF0）。
   */
  startBattle(arg1: number): void {
    const g2 = this.global(2);
    const g3 = this.global(3);
    const g7 = this.global(7);
    const g8 = this.global(8);
    this.playAct(3, 1, g7);
    this.playAct(2, 1, g8);
    this.playAct(3, 2, g8);
    this.playAct(2, 2, g7);
    if (arg1 === 1) {
      // 源序 (arg1..arg7) = (g3, g2, g8, g7, 2, 3, 1)
      this.battleYield(g3, g2, g8, 3, 1);
      return;
    }
    if (arg1 === -1) {
      // 源序 (arg1..arg7) = (g2, g3, g7, g8, 3, 2, 0)
      this.battleYield(g2, g3, g7, 2, 0);
      return;
    }
    const far = this.screenRegion(g7); // loc6
    const near = this.screenRegion(g8); // loc5
    const battlefield = this.unitPos(g3);
    if (battlefield) this.moveCamera(battlefield.x, battlefield.y - 128, 30);
    const loc3 = this.callLine(near, far);
    this.sayMsg(2, 0, loc3);
    const own = this.unitPos(g2);
    if (own) this.moveCamera(own.x, own.y - 128, 60);
    let loc4 = this.answerLine(near, far);
    // 原作 `do { ... } while (loc4 == loc3)`：撞号就重掷（无上限，重制版加 64 次保险）
    for (let guard = 0; loc4 === loc3 && guard < 64; guard++) loc4 = this.answerLine(near, far);
    this.sayMsg(3, 0, loc4);
    this.resetOverlay(1);
  }

  /** `StartBattle` 第一段叫阵编号（按 loc5 分档）。 */
  private callLine(near: number, far: number): number {
    if (near === 0) return this.rand(0, 1) === 0 ? this.rand(300, 319) : this.rand(380, 399);
    if (near === 1) return this.rand(0, 1) === 0 ? this.rand(320, 339) : this.rand(380, 399);
    if (near !== 2) return 0;
    if (far === 0) return this.rand(0, 1) === 0 ? this.rand(340, 359) : this.rand(380, 399);
    const pick = this.rand(0, 2);
    if (pick === 0) return this.rand(340, 359);
    if (pick === 1) return this.rand(380, 399);
    return this.rand(360, 379);
  }

  /** `StartBattle` 第二段叫阵编号（按 loc6 分档，loc6==2 时才看 loc5）。 */
  private answerLine(near: number, far: number): number {
    if (far === 0) {
      const pick = this.rand(0, 2);
      if (pick === 0) return this.rand(300, 319);
      return pick === 1 ? this.rand(380, 399) : this.rand(400, 409);
    }
    if (far === 1) {
      const pick = this.rand(0, 2);
      if (pick === 0) return this.rand(320, 339);
      return pick === 1 ? this.rand(380, 399) : this.rand(400, 409);
    }
    if (near === 0) {
      const pick = this.rand(0, 2);
      if (pick === 0) return this.rand(340, 359);
      return pick === 1 ? this.rand(380, 399) : this.rand(400, 409);
    }
    const pick = this.rand(0, 3);
    if (pick === 0) return this.rand(340, 359);
    if (pick === 1) return this.rand(380, 399);
    return pick === 2 ? this.rand(360, 379) : this.rand(400, 409);
  }

  /**
   * `BattleEndTalk(arg1)` @0x2C90（PUSHN 7）。
   *
   * ```
   * loc4 = 0x206(g7);  loc3 = 0x206(g8);       // 两个武将各自在屏幕哪一档
   * switch (arg1) {
   *   case 1:   loc1=2; loc6=g7; loc7=g8; loc2=1; if (!(loc3==2 && loc4==0)) loc2=3; break;
   *   case 2:   loc1=3; loc7=g7; loc6=g8; loc2=1; if (!(loc4==2 && loc3==0)) loc2=3; break;
   *   case 256: case 512: loc2 = -1; break;                  // 不发台词
   *   case 4:   loc1=2; loc2=2; loc6=g7; loc7=g8; break;
   *   case 8:   loc1=3; loc2=2; loc7=g7; loc6=g8; break;
   *   case 16:  loc1=3; loc2=0; loc7=g7; loc6=g8; break;
   *   default:  loc1=0; loc2=0;                              // PUSHN 清零 ⇒ 走 270-290 平手档
   * }
   * 0x6(loc1, 1, loc7);  0x6(loc1, 2, loc6);
   * switch (loc2) {
   *   0: 0xA(loc1, 0, rand(270, 290));   // 险胜/平手
   *   1: 0xA(loc1, 0, rand(500, 568));   // 追击败逃
   *   2: 0xA(loc1, 0, rand(600, 705));   // 完胜
   *   3: 0xA(loc1, 0, rand(240, 263));   // 惨败
   *  -1: 不发
   * }
   * 0x124();
   * ```
   */
  battleEndTalk(arg1: number): void {
    const g7 = this.global(7);
    const g8 = this.global(8);
    const far = this.screenRegion(g7); // loc4
    const near = this.screenRegion(g8); // loc3
    let layer = 0; // loc1
    let talk = 0; // loc2（PUSHN 清零 ⇒ 默认平手档）
    let first = 0; // loc7（0x6 的 action 1）
    let second = 0; // loc6（0x6 的 action 2）
    switch (arg1) {
      case 1:
        layer = 2;
        second = g7;
        first = g8;
        talk = near === 2 && far === 0 ? 1 : 3;
        break;
      case 2:
        layer = 3;
        first = g7;
        second = g8;
        talk = far === 2 && near === 0 ? 1 : 3;
        break;
      case 256:
      case 512:
        talk = -1;
        break;
      case 4:
        layer = 2;
        talk = 2;
        second = g7;
        first = g8;
        break;
      case 8:
        layer = 3;
        talk = 2;
        first = g7;
        second = g8;
        break;
      case 16:
        layer = 3;
        talk = 0;
        first = g7;
        second = g8;
        break;
      default:
        break;
    }
    this.playAct(layer, 1, first);
    this.playAct(layer, 2, second);
    if (talk === 0) this.sayMsg(layer, 0, this.rand(270, 290));
    else if (talk === 1) this.sayMsg(layer, 0, this.rand(500, 568));
    else if (talk === 2) this.sayMsg(layer, 0, this.rand(600, 705));
    else if (talk === 3) this.sayMsg(layer, 0, this.rand(240, 263));
    this.resetTalk();
  }

  /**
   * `ReportResult(arg1)` @0x3178（PUSHN 2）。
   *
   * 8 条战报原文都是函数内的 `PUSHS` 常量（不是 `MSGnnn`），所以这条**不依赖任何外部表**：
   * ```
   * WAIT 1; 0x6(0,1,g7); 0x6(0,2,g8); 0x6(0,3,g9);
   * switch (arg1) { 1, 2, 4, 8, 256, 512, 16, default } → 8 条 0x3(0, 武将, 原文)
   * ```
   * 三个武将槽：`g9` 是敌方（战败方），`g7` 是说话方（我方）。
   */
  reportResult(arg1: number): void {
    const g7 = this.global(7);
    const g8 = this.global(8);
    const g9 = this.global(9);
    this.wait(1);
    this.playAct(0, 1, g7);
    this.playAct(0, 2, g8);
    this.playAct(0, 3, g9);
    switch (arg1) {
      case 1:
        this.pushText(0, '很遺憾，我軍戰敗了....%K%%E%', g9);
        break;
      case 2:
        this.pushText(0, '我軍勝利!!%K%%E%', g7);
        break;
      case 4:
        this.pushText(0, '我軍戰敗，%S1%將軍被俘了....%K%%E%', g9);
        break;
      case 8:
        this.pushText(0, '我軍大勝!俘虜敵將%S2%!!%K%%E%', g7);
        break;
      case 256:
        this.pushText(0, '%S1%將軍投靠敵方了....%K%%E%', g9);
        break;
      case 512:
        this.pushText(0, '說服%S2%將軍加入我方!!%K%%E%', g7);
        break;
      case 16:
        this.pushText(0, '雙方平手....%K%%E%', g7);
        break;
      default:
        this.pushText(0, '結果不明.......%K%%E%', g7);
        break;
    }
  }

  /**
   * `SearchTalk(arg1)` @0x33E4（PUSHN 2）。
   *
   * ```
   * while (g1 == 0) WAIT 1;   g1 = 1;              // 与搜索动画的握手位
   * 0x6(0,1,g7); 0x6(0,3,g9);
   * switch (arg1) {
   *   0:  0x3(0,g7,"什麼都找不到....%k%%E%");
   *   1:  0x3(0,g7,"找到物品!!%k%%E%");
   *   16: … 17: … 18: … 19: … 20: …                // MSG800-907 三音效
   * }
   * g1 = 0;
   * ```
   * [推测] 重制版没有帧循环：握手最多等 64 帧就往下走（`waits` 记账），收尾照原作置 0。
   */
  searchTalk(arg1: number): void {
    const g7 = this.global(7);
    const g8 = this.global(8);
    const g9 = this.global(9);
    for (let guard = 0; this.global(1) === 0 && guard < 64; guard++) this.wait(1);
    this.ports.setGlobal?.(1, 1);
    this.playAct(0, 1, g7);
    this.playAct(0, 3, g9);
    switch (arg1) {
      case 0:
        this.pushText(0, '什麼都找不到....%k%%E%', g7);
        break;
      case 1:
        this.pushText(0, '找到物品!!%k%%E%', g7);
        break;
      case 16:
        if (g7 !== g8) this.sayMsg(0, g7, 800);
        this.sayMsg(0, g8, this.rand(801, 809));
        this.sayMsg(1, g9, 810);
        this.playSound('SUCCESS', 255);
        this.sayMsg(0, g8, 819);
        this.pushText(1, '%e%', g9);
        if (g7 === g8) {
          this.sayMsg(0, g8, 812);
          this.sayMsg(0, g7, 813);
        } else {
          this.pushText(0, '%e%', g8);
        }
        break;
      case 17:
        if (g7 !== g8) this.sayMsg(0, g7, 800);
        this.sayMsg(1, g9, this.rand(820, 826));
        this.sayMsg(0, g8, this.rand(830, 840));
        this.playSound('SUCCESS', 255);
        this.sayMsg(1, g9, 811);
        this.pushText(1, '%e%', g9);
        if (g7 === g8) {
          this.sayMsg(0, g8, 812);
          this.sayMsg(0, g7, 813);
        } else {
          this.pushText(0, '%e%', g8);
        }
        break;
      case 18:
        if (g7 !== g8) this.sayMsg(0, g7, 800);
        this.sayMsg(0, g8, this.rand(801, 809));
        this.sayMsg(1, g9, this.rand(851, 861));
        this.playSound('FAILURE2', 255);
        this.sayMsg(0, g8, 814);
        this.pushText(1, '%e%', g9);
        break;
      case 19:
        if (g7 !== g8) this.sayMsg(0, g7, 800);
        this.sayMsg(0, g8, this.rand(801, 809));
        this.sayMsg(1, g9, this.rand(850, 860));
        this.playSound('FAILURE2', 255);
        this.sayMsg(0, g8, 815);
        this.pushText(1, '%e%', g9);
        break;
      case 20:
        if (g7 === g8) {
          this.sayMsg(0, g7, 817);
          this.sayMsg(1, g9, 818);
          this.playSound('SUCCESS', 255);
          this.sayMsg(0, g8, this.rand(894, 899));
          this.sayMsg(1, g9, this.rand(900, 903));
          this.sayMsg(0, g8, 812);
          this.sayMsg(0, g7, this.rand(904, 907));
        } else {
          this.sayMsg(0, g7, 816);
          this.sayMsg(1, g9, this.rand(870, 874));
          this.playSound('SUCCESS', 255);
          this.sayMsg(0, g8, this.rand(875, 878));
          this.sayMsg(1, g9, this.rand(890, 893));
          this.pushText(0, '%e%', g8);
        }
        break;
      default:
        break;
    }
    this.ports.setGlobal?.(1, 0);
  }

  /**
   * `ChildGenTalkNew(arg1)` @0x3D40（PUSHN 5）。
   *
   * ```
   * while (g0 == 0) WAIT 1;                    // 子嗣生成完成的握手位
   * STGIDX(1, 1);                              // 数组 0 的第 1 个 = 标量 g1 = 1
   * loc3 = LDGIDX0(30 + arg1*2);               // 武将 A
   * loc4 = LDGIDX0(31 + arg1*2);               // 武将 B
   * loc5 = g9;                                 // 当前武将
   * 0x6(0,3,loc3); 0x6(0,1,loc4);
   * if (loc4 != loc5) { …816/870-874/875-878/890-893… } else { …817/818/894-907… }
   * WAIT 1; STGIDX(0, 1);                      // g1 = 0
   * ```
   * `STGIDX 0` / `LDGIDX 0` 的"数组 0"就是标量全局槽（起手 `(1,1)`、收尾 `(0,1)` 与
   * `SearchTalk` 的 `g1 = 1 / g1 = 0` 握手逐字相同），所以两个武将取
   * `global(30 + 2*arg1)` / `global(31 + 2*arg1)`（[推测]，数组基址口径待考）。
   */
  childGenTalkNew(arg1: number): void {
    const g9 = this.global(9);
    for (let guard = 0; this.global(0) === 0 && guard < 64; guard++) this.wait(1);
    this.ports.setGlobal?.(1, 1);
    const base = 30 + arg1 * 2;
    const who = this.global(base); // loc3
    const other = this.global(base + 1); // loc4
    this.playAct(0, 3, who);
    this.playAct(0, 1, other);
    if (other !== g9) {
      this.sayMsg(0, other, 816);
      this.sayMsg(1, who, this.rand(870, 874));
      this.playSound('SUCCESS', 255);
      this.sayMsg(0, g9, this.rand(875, 878));
      this.sayMsg(1, who, this.rand(890, 893));
      this.pushText(0, '%e', g9);
    } else {
      this.sayMsg(0, other, 817);
      this.sayMsg(1, who, 818);
      this.playSound('SUCCESS', 255);
      this.sayMsg(0, g9, this.rand(894, 899));
      this.sayMsg(1, who, this.rand(900, 903));
      this.sayMsg(0, g9, 812);
      this.sayMsg(0, other, this.rand(904, 907));
    }
    this.wait(1);
    this.ports.setGlobal?.(1, 0);
  }

  /**
   * `YieldGeneral(arg1, arg2)` @0x424C（PUSHN 2）。
   *
   * ```
   * 0x6(1, 2, g8); 0x6(0, 2, g8);
   * switch (arg2) {
   *   1: 0xA(0,g7,rand(950,966)); 音效 SUCCESS; 0xA(1,g8,rand(980,988)); 0x3(0,g7,"%E%");
   *   0: 0xA(0,g7,rand(950,966)); 0xA(1,g8,rand(970,978));               0x3(0,g7,"%E%");
   * }
   * WAIT 20; 0x211();
   * ```
   * `arg1` 在 51 条指令里一次都没读（原作就把它丢了）。
   */
  yieldGeneral(arg2: number): void {
    const g7 = this.global(7);
    const g8 = this.global(8);
    this.playAct(1, 2, g8);
    this.playAct(0, 2, g8);
    if (arg2 === 1) {
      this.sayMsg(0, g7, this.rand(950, 966));
      this.playSound('SUCCESS', 255);
      this.sayMsg(1, g8, this.rand(980, 988));
      this.pushText(0, '%E%', g7);
    } else if (arg2 === 0) {
      this.sayMsg(0, g7, this.rand(950, 966));
      this.sayMsg(1, g8, this.rand(970, 978));
      this.pushText(0, '%E%', g7);
    }
    this.wait(20);
    this.confirmYield(g7);
  }

  // ── 菜单/流程 ────────────────────────────────────────────────────────

  private loadAll(patterns: readonly string[]): void {
    for (const p of patterns) {
      this.resources.push(p);
      this.events.push({ kind: 'resource', pattern: p });
    }
    if (this.ports.loadResource) for (const p of patterns) this.ports.loadResource(p);
  }

  private callScript(name: string, args: number[]): void {
    this.scriptCalls.push({ name, args });
    this.events.push({ kind: 'script-call', name, args });
    this.ports.callScript?.(name, args);
  }

  /**
   * `0x3(speaker, general, line)` @0x41F950 —— 台词框。
   *
   * 三个实参是（台词层, 武将句柄, 原文）：层 0 是旁白，1/2/3 是双方阵容；
   * `%S1%`/`%S2%`/`%s1%` 这些占位符就是按 `general` 替换的。
   */
  private pushText(speaker: number, line: string, general = 0): void {
    this.texts.push({ speaker, line, general });
    this.events.push({ kind: 'text', speaker, line, general });
    this.ports.text?.(speaker, line);
  }

  // ── 全軍突擊（R137）────────────────────────────────────────────────

  /**
   * `AllRush()` @0x2B0C —— 全軍突擊。字节码见 `export/script/system_so.dis.txt:1536-1585`，
   * 22 条指令逐条对位：
   *
   * | 原作 | 宿主 |
   * | --- | --- |
   * | `0x131` | `ports.screenFlash(true)`（压暗括号开，与 `0x110` 成对） |
   * | `0x122` | 无对应（引擎侧未知，纯视觉，跳过） |
   * | `WAITFOR "MoveCamera"` | 宿主 `MoveCamera` 是一次推完的，没有等待语义，跳过 |
   * | `0x105/0x106(g2)` | 主将像素 x/y（`unitAt` 端口；查不到按 0） |
   * | `0x120(g2, 0x10000)` | **`ports.allRush()`**：该侧全体转突击命令 ← 本轮真正的 gameplay |
   * | `MoveCamera(x, y-128, 20)` | `moveCamera()`：镜头推到自己主将（-128 = 主将头顶） |
   * | `0x123` | 无对应（同上，跳过） |
   * | `0x10C(g5)` → `155 + 编制号/2` | 音量 155/156（见下） |
   * | `0x301 "Rush01"` | `ports.sound('Rush01', vol)` |
   * | `0x003(3-g5, 0, "全軍突擊!%k%%e%")` | `ports.text(speaker, '全軍突擊!%k%%e%')` |
   * | `WAIT 44` | 跳过（同步通道没有帧等待） |
   * | `0x110` | `ports.screenFlash(false)` |
   *
   * **幂等**：已经在突击态时 `allRush` 端口返回 false，但音频/台词照播 —— 原作每次调用都会播，
   * 幂等只体现在"不重复置位"。**不改伤害/攻击力/速率**：原作这条函数只切命令字，不碰 `+0x12`。
   */
  allRushCommand(): boolean {
    this.ports.screenFlash?.(true);
    this.events.push({ kind: 'screen-flash', on: true });

    const pos = this.unitPos(this.global(2));
    const px = pos?.x ?? 0;
    const py = pos?.y ?? 0;

    // `0x120(g2, 0x10000)`：★ 全体转突击命令。返回 false = 本来就在突击态。
    const applied = this.ports.allRush?.() ?? false;
    this.events.push({ kind: 'all-rush', applied });

    // `MoveCamera(x, y-128, 20)`：镜头推到自己主将。
    this.moveCamera(px, py - 128, 20);

    // `0x10C(g5)`：g5 是方向 0/1，原作折成阵营号 1/2 ⇒ 音量 = 155 + 阵营号/2 = 155 或 156，
    // 后面 `>255 取 255` 的分支永不触发。这里取 156（g5=1 那支），与 155 只差 1/255。
    const volume = 156;
    this.playSound('Rush01', volume);

    // `0x003(3-g5, 0, "全軍突擊!%k%%e%")`：g5=0 ⇒ speaker 3（`%k%%e%` 是原作的换行/停顿控制符）。
    this.pushText(3, '全軍突擊!%k%%e%', 0);

    this.ports.screenFlash?.(false);
    this.events.push({ kind: 'screen-flash', on: false });
    return applied;
  }
}

/** 建一个带默认种子的宿主（测试/临时调用方便）。 */
export function createSysoHost(ports: SysoPorts = {}, seed = 0x51c0): SysoHost {
  return new SysoHost(ports, { seed });
}

// ────────────────────────────────────────────────────────────────────────────
// R67：`0x43ED96` 伤害宿主函数（把「硬算伤害」换成「脚本调宿主函数」的落点）
// ────────────────────────────────────────────────────────────────────────────

/** 一次 `0x43ED96` 调用的结果（`DamageHost.calls` 的元素）。 */
export interface DamageHostResult {
  handle: number;
  /** 传进来的差值（负数 = 伤害，正数 = 治疗） */
  amount: number;
  /** 伤害来源单位句柄（0 = 无来源；脚本通道的 `Hurt` 走的就是 0） */
  src: number;
  /** 实际写进 `+0x12` 的差值（夹过 0..maxHP） */
  applied: number;
  /** 这一下把目标打到 `hp <= 0`（调用方负责 `alive = false`） */
  killed: boolean;
}

/**
 * `0x43ED96` 的纯计算部分 —— 宿主函数体里跟引擎无关的那三行：
 * ```
 * hp = hp + amount;            // word[obj+0x12] += dmg
 * if (hp > maxHp) hp = maxHp;  // word[obj+0x10]
 * if (hp <= 0)  { hp = 0; killed = 1; }
 * ```
 * 证据：`docs/04b3:377`（`0x43ED96(objVictim, dmg, objSrc)`，写全局 `[0x4B4C3C]`
 * 后发 `0x1000E` 给受害人，处理器 `0x43F41D` 做扣血/死亡判定）；`docs/04-脚本引擎:515`
 * 把 `0x125` 的 handler 记成 `0x43ED96(unit, a, b)`。返回值就是"实际掉了多少血"。
 */
export function damageHostApply(handle: number, amount: number, src: number, hp: number, maxHp: number): DamageHostResult {
  const cap = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 0;
  const before = Number.isFinite(hp) ? hp : 0;
  const d = Number.isFinite(amount) ? amount : 0;
  const next = Math.max(0, Math.min(cap, before + d));
  return { handle, amount, src, applied: next - before, killed: next <= 0 };
}

/**
 * 伤害宿主（R67）：把 `damageHostApply()` 接到真实血条上，并留下调用记录。
 *
 * `battle.ts` 每个 `World` 建一个：`read` 取当前 hp/maxHp（士兵无 HP 字段时给 1/1），
 * `write` 把结果落回 `Unit`/`GeneralState`（`killed` ⇒ `alive = false`）。
 * 这样普攻与 MAGIC.SO 的 `Hurt`（`SYSCALL 0x125`）走的是**同一条**结算路径。
 */
export class DamageHost {
  /** 每次调用的记录：测试用它断言"syscall 真被调用"与"数值正确"。 */
  readonly calls: DamageHostResult[] = [];
  private readonly read: (handle: number) => { hp: number; maxHp: number } | undefined;
  private readonly write: (handle: number, result: DamageHostResult) => void;

  constructor(
    read: (handle: number) => { hp: number; maxHp: number } | undefined,
    write: (handle: number, result: DamageHostResult) => void,
  ) {
    this.read = read;
    this.write = write;
  }

  /** `0x43ED96(handle, amount, src)`：返回实际写入的差值。句柄不认识时返 0（不抛）。 */
  hurt(handle: number, amount: number, src = 0): number {
    const cur = this.read(handle);
    if (!cur) return 0;
    const res = damageHostApply(handle, amount, src, cur.hp, cur.maxHp);
    this.write(handle, res);
    this.calls.push(res);
    return res.applied;
  }
}
