/**
 * 脚本/战斗音频总线（R52、R80 的落点）。
 *
 * 为什么要有这一层：
 *   - `MAGIC.SO` 里 88 个 `0x301(name, vol)` + 30 个 `0x300(unit, name, vol)`
 *     调用点，运行时只被 `SkillRun.sound()` 记成一行日志，`audio.sfx()` 从没被调过；
 *   - `SYSTEM.SO` 的 `AllRush/ReportResult/MajorDeath/LoadingBattleMap` 也一样；
 *   - 战斗层（`main.js`）只有"命中/格挡"两类音效，受击/阵亡/撤退/起手都缺。
 *
 * 这一层做三件事：
 *   1. **归一化**：把脚本里的资源名（`m016snd01`、`Rush01`、`VICTORY`、`m016a`）
 *      统一成小写、别名解析后的键，音量从原作的 0..255 折成 0..1；
 *   2. **记录**：所有事件进一个有上限的环形日志，测试可以断言"字节码事件的顺序"，
 *      `?sfxdbg=1` 也能把它显示出来；
 *   3. **分发**：交给应用注册的 `AudioSink`（浏览器里是 `audio.js`，测试里是假 sink）。
 *
 * 本文件**不 import 任何运行时代码**（只 import 类型），所以浏览器包、Node 测试、
 * 小程序都能直接用，也不会和 `battle.ts` 形成循环依赖。
 */

import type { Side, Unit, World } from './battle';

// ── 事件模型 ────────────────────────────────────────────────────────────

interface EventBase {
  /** 全局自增序号（`resetAudioBus()` 归零）。 */
  seq: number;
  /** 产生事件时的虚拟帧（脚本）或游戏 tick（战斗）。 */
  clock: number;
  /** 谁发的：`syscall:0x301`、`skill:104`、`battle:hit`、`system:AllRush`。 */
  source: string;
}

/** 一次音效播放。 */
export interface SfxEvent extends EventBase {
  kind: 'sfx';
  /** 归一化后的资源键（小写；`m016a` 已别名成 `m016snd01`）。 */
  name: string;
  /** 脚本里写的原名，排错用。 */
  raw: string;
  /** 0..1（原作 0..255 已折算）。 */
  volume: number;
  /** 3D 音效的单位句柄（只有 `0x300` 有）。 */
  unit?: number;
}

/** 按目录播的武将技音效（`audio.magic(dir)`，与原作 `m%03dsndNN` 同源）。 */
export interface MagicEvent extends EventBase {
  kind: 'magic';
  /** 三位目录号，例如 `016`。 */
  dir: string;
  volume: number;
}

/** 屏幕闪白（`0x131` 开 / `0x110` 关）。 */
export interface FlashEvent extends EventBase {
  kind: 'flash';
  on: boolean;
  /** 0..1，闪的强度。 */
  strength: number;
}

/** 亮度（`0x12F` 写 / `0x130` 读；原作 0..16，16 = 正常）。 */
export interface BrightnessEvent extends EventBase {
  kind: 'brightness';
  level: number;
}

export type AudioEvent = SfxEvent | MagicEvent | FlashEvent | BrightnessEvent;

// ── 接收端 ──────────────────────────────────────────────────────────────

/**
 * 应用侧接收端。所有方法都可选：测试里只实现 `sfx` 就够，
 * 浏览器里 `audio.js` 提供 `sfx/magic/flash/brightness` 四个。
 */
export interface AudioSink {
  sfx?(name: string, opts: { volume: number; unit?: number; raw?: string; source: string }): void;
  magic?(dir: string, opts: { volume: number; source: string }): void;
  flash?(on: boolean, opts: { strength: number; source: string }): void;
  brightness?(level: number, opts: { source: string }): void;
}

// ── 名字归一化 ──────────────────────────────────────────────────────────

/**
 * 脚本名字 → 音频资源键的别名表。
 *
 * 只收"资源包里没有、但有等价物"的项；`m016snd01`/`rush01` 这类
 * 直接小写就能命中的不写。`m016a` 是 `sc3602`/`Xsc3602` 用的音，
 * 包里只有 `m016snd01`（同一个 016 号技能的资源），按 [推测] 兜底。
 */
const SFX_ALIASES: Record<string, string> = {
  m016a: 'm016snd01',
  // SYSTEM.SO 用大写名字，音频包是小写键（`audio.js` 的 sfxKey 也会小写，
  // 这里先折好，保证事件日志里就是最终键）
  rush01: 'rush01',
  victory: 'victory',
  success: 'success',
  failure2: 'failure2',
  yell03: 'yell03',
  horse02: 'horse02',
};

/** 脚本名字 → 资源键。空名字返回空串（调用方自行丢弃）。 */
export function normalizeSfxName(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  return SFX_ALIASES[low] ?? low;
}

// ── 武将技编号 → 音效串（与 game/web/audio.js 的 MAGIC_SFX 同源）──────────
/**
 * 键 = 技能编号（data/magics.json 的 SEQUENCE，补 3 位），值 = sfx 目录里的具体文件名。
 *
 * 旧口径把键当 fx_dir_primary（特效目录号），只能做到"目录级"；现行双源证据
 * （见 project/96_技能音效映射.md、project/148_技能音证据表.md、work/sfx_evidence/）：
 *   [A]  技能自身特效脚本 depth<=1 处 `PUSHS "mNNNsndNN" ... SYSCALL 0x301`；
 *   [A2] 间接静态链，音效号 == 该技能 fx_dir：(a) depth<=4 的 CreateXxx 里播；
 *        (b) 脚本 `PUSHI <物件号>` 生成的物件，其 THINGS.INI 动画串带 `$mNNNsndNN`；
 *        (c) 再经物件 `!nnnn` 回调脚本播（如 !6003→FlyArrowLU 播 "arrow"）。
 *        R148 用 (a)(b)(c) 把原 24 条 [C] 全部升 [A2]（注释里“→obj”即 (b)）。
 *   [C]  只剩目录级推断。**R148 后清零**：006 系 6 条经
 *        ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 取证升 [A2]。
 *   [X]  仅按 m<fx_dir>sndNN 命名约定 + 文件存在（推测）。**已清零**：原 043/080/102
 *        三条经效果函数字节码取证升 [A]（043→m032snd01、102→m031snd01、080 值不变）。
 * 110/110 有串；R148 后 A 73 / A2 37 / C 0 / X 0（每条都有可追的脚本或物件链）。
 */
export const MAGIC_SFX: Readonly<Record<string, string>> = {
  '001': 'm016snd01',   // [A] 命療術 dir016
  '002': 'm003snd01',   // [A] 落月弓 dir003
  '003': 'm026snd01',   // [A2] 地泉衝 dir026
  '004': 'arrow',       // [A2] 火箭 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '005': 'm002snd01',   // [A] 伏兵組陣 dir002
  '006': 'm039snd01',   // [A] 木輪攻 dir039
  '007': 'm008snd01',   // [A] 虎咆 dir008
  '008': 'm034snd01',   // [A2] 火雷 dir034
  '009': 'm005snd02',   // [A2] 雷擊 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
  '010': 'm017snd02',   // [A] 炎龍 dir017
  '011': 'm023snd01',   // [A2] 伏焰 dir023
  '012': 'm041snd02',   // [A] 拒陸馬 dir031
  '013': 'm003snd01',   // [A] 御飛刀 dir003
  '014': 'm005snd02',   // [A2] 雷光波動 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
  '015': 'arrow',       // [A2] 火箭烈 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '016': 'm008snd01',   // [A] 虎咆震 dir008
  '017': 'm002snd01',   // [A] 伏兵排陣 dir002
  '018': 'm026snd01',   // [A2] 地泉裂勁 dir026
  '019': 'm002snd01',   // [A] 後伏連兵 dir024
  '020': 'm039snd01',   // [A] 木輪強襲 dir039
  '021': 'm017snd02',   // [A] 炎龍無雙 dir017
  '022': 'm005snd02',   // [A2] 雷光振殺 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
  '023': 'm008snd01',   // [A] 虎咆陽炎 dir008
  '024': 'm034snd01',   // [A2] 火雷爆 dir034
  '025': 'm018snd01',   // [A] 黃龍天翔 dir018
  '026': 'm026snd01',   // [A2] 地泉鯨浪 dir026
  '027': 'm041snd02',   // [A] 絕命壩 dir031
  '028': 'm005snd02',   // [A2] 雷擊閃 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
  '029': 'm017snd02',   // [A] 炎龍殺陣 dir017
  '030': 'arrow',       // [A2] 火箭天襲 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '031': 'm002snd01',   // [A] 後伏兵陣 dir024
  '032': 'm034snd01',   // [A2] 火雷星雨 dir034
  '033': 'm017snd02',   // [A] 炎龍怒濤 dir017
  '034': 'm023snd01',   // [A2] 赤焰洪流 dir023
  '035': 'm039snd01',   // [A] 木輪濤擊 dir039
  '036': 'm023snd01',   // [A2] 赤焰火海 dir023
  '037': 'm002snd01',   // [A] 後伏軍陣 dir024
  '038': 'm040snd01',   // [A2] 大地狂嘯 dir040
  '039': 'm005snd02',   // [A2] 雷光燋獄 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
  '040': 'm041snd02',   // [A] 十面埋伏 dir031
  '041': 'm017snd02',   // [A] 炎龍絕殺 dir017
  '042': 'm005snd01',   // [A] 五雷轟頂 dir005
  '043': 'm032snd01',   // [A] 狂雷天牢 dir022（Sparkle→CreateSparkle 直证）
  '044': 'm018snd03',   // [A2] 天地無用 dir018（XCallDragon 0x33DBC→Xsc3603 0x3387C→obj28012 !42002=Xsc3604 0x33B5C→m018snd03）
  '045': 'arrow',       // [A2] 飛矢 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '046': 'm019snd01',   // [A] 連弩 dir009
  '047': 'm010snd01',   // [A2] 突石 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
  '048': 'm007snd01',   // [A2] 落石 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
  '049': 'm036snd01',   // [A] 刀劍亂 dir026
  '050': 'm001snd01',   // [A] 半月斬 dir001
  '051': 'm011snd01',   // [A] 旋龍 dir001
  '052': 'm003snd01',   // [A] 落日弓 dir003
  '053': 'm009snd01',   // [A] 八面火 dir009
  '054': 'm021snd01',   // [A] 旋燈火 dir010
  '055': 'm010snd01',   // [A2] 突石劍 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
  '056': 'm025snd01',   // [A2] 太極門 dir025
  '057': 'm002snd01',   // [A] 伏兵班陣 dir002
  '058': 'm013snd01',   // [A] 八門金鎖 dir013
  '059': 'm003snd01',   // [A] 鬼戟 dir003
  '060': 'm016snd01',   // [A] 回天術 dir016
  '061': 'm035snd01',   // [A] 地茅刺 dir035
  '062': 'm019snd01',   // [A] 連弩激射 dir009
  '063': 'm022snd01',   // [A] 冰柱刺 dir012
  '064': 'm010snd01',   // [A2] 突劍四方 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
  '065': 'm004snd01',   // [A2] 衝車 dir004（RushCart 0x7288→obj14001 $m004snd01）
  '066': 'm015snd01',   // [A] 神劍 dir015
  '067': 'm009snd01',   // [A] 八面火轉 dir009
  '068': 'm028snd01',   // [A] 突襲石 dir028
  '069': 'm033snd01',   // [A2] 龍砲 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
  '070': 'm027snd01',   // [A] 火牛陣 dir017
  '071': 'm020snd01',   // [A] 生死門 dir020
  '072': 'arrow',       // [A2] 亂飛矢 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '073': 'm035snd01',   // [A] 地茅亂刺 dir035
  '074': 'm033snd01',   // [A2] 龍砲激射 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
  '075': 'm011snd01',   // [A] 旋龍合璧 dir001
  '076': 'm022snd01',   // [A] 冰柱群鋒 dir012
  '077': 'm021snd01',   // [A] 烈火旋燈 dir010
  '078': 'm025snd01',   // [A2] 太極華陣 dir025
  '079': 'm028snd01',   // [A] 滾石遽壓 dir028
  '080': 'm029snd01',   // [A] 八卦奇陣 dir029（Pa→CreatePa 直证）
  '081': 'm002snd01',   // [A] 伏兵連陣 dir002
  '082': 'm004snd01',   // [A2] 駟衝車 dir004（RushCart 0x7288→obj14001 $m004snd01）
  '083': 'm001snd01',   // [A] 三日月斬 dir001
  '084': 'm015snd01',   // [A] 神劍閃 dir015
  '085': 'm019snd01',   // [A] 連弩狂濤 dir009
  '086': 'm036snd01',   // [A] 亂刀狂舞 dir026
  '087': 'arrow',       // [A2] 飛矢烈震 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
  '088': 'm001snd01',   // [A] 三聖華斬 dir020
  '089': 'm021snd01',   // [A] 神火旋張 dir010
  '090': 'm033snd01',   // [A2] 龍砲滅殺 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
  '091': 'm007snd01',   // [A2] 炬石轟 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
  '092': 'm027snd01',   // [A] 火牛群舞 dir017
  '093': 'm035snd01',   // [A] 茅刺遍地 dir035
  '094': 'm028snd01',   // [A] 滾石怒衝 dir028
  '095': 'm038snd02',   // [A] 劍輪舞 dir028
  '096': 'm012snd01',   // [A] 分身斬 dir012
  '097': 'm022snd01',   // [A] 冰嵐刃舞 dir012
  '098': 'm015snd01',   // [A] 神劍閃華 dir015
  '099': 'm037snd01',   // [A] 炎牆 dir037
  '100': 'm011snd01',   // [A] 旋龍天舞 dir001
  '101': 'm020snd01',   // [A] 地獄之門 dir020
  '102': 'm031snd01',   // [A] 集火柱 dir021（FirePillar→CreateFirePillar 直证）
  '103': 'm021snd01',   // [A] 神火怒張 dir010
  '104': 'm004snd01',   // [A2] 神鬼亂舞 dir004（DemonDancing 0x14DE8→obj14001 $m004snd01）
  '105': 'm007snd01',   // [A2] 炬石煉獄 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
  '106': 'm037snd01',   // [A] 炎牆烈燒 dir037
  '107': 'm001snd01',   // [A] 日月輪斬 dir001
  '108': 'm027snd01',   // [A] 火牛烈崩 dir017
  '109': 'm001snd01',   // [A] 五嶽華斬 dir020
  '110': 'm012snd01',   // [A2] 鬼哭神號 dir012
};

/** 上表每条的证级，写进事件日志/调试面板用（A > A2 > C > X）。 */
export const MAGIC_SFX_GRADE: Readonly<Record<string, 'A' | 'A2' | 'C' | 'X'>> = {
  '001':'A', '002':'A', '003':'A2', '004':'A2', '005':'A', '006':'A', '007':'A', '008':'A2',
  '009':'A2', '010':'A', '011':'A2', '012':'A', '013':'A', '014':'A2', '015':'A2', '016':'A',
  '017':'A', '018':'A2', '019':'A', '020':'A', '021':'A', '022':'A2', '023':'A', '024':'A2',
  '025':'A', '026':'A2', '027':'A', '028':'A2', '029':'A', '030':'A2', '031':'A', '032':'A2',
  '033':'A', '034':'A2', '035':'A', '036':'A2', '037':'A', '038':'A2', '039':'A2', '040':'A',
  '041':'A', '042':'A', '043':'A', '044':'A2', '045':'A2', '046':'A', '047':'A2', '048':'A2',
  '049':'A', '050':'A', '051':'A', '052':'A', '053':'A', '054':'A', '055':'A2', '056':'A2',
  '057':'A', '058':'A', '059':'A', '060':'A', '061':'A', '062':'A', '063':'A', '064':'A2',
  '065':'A2', '066':'A', '067':'A', '068':'A', '069':'A2', '070':'A', '071':'A', '072':'A2',
  '073':'A', '074':'A2', '075':'A', '076':'A', '077':'A', '078':'A2', '079':'A', '080':'A',
  '081':'A', '082':'A2', '083':'A', '084':'A', '085':'A', '086':'A', '087':'A2', '088':'A',
  '089':'A', '090':'A2', '091':'A2', '092':'A', '093':'A', '094':'A', '095':'A', '096':'A',
  '097':'A', '098':'A', '099':'A', '100':'A', '101':'A', '102':'A', '103':'A', '104':'A2',
  '105':'A2', '106':'A', '107':'A', '108':'A', '109':'A', '110':'A2',
};

/** 技能编号（16 / '16' / '016'）→ 音效名；未知返回空串。已是 mNNNsndNN 时原样小写返回。 */
export function magicSfxName(raw: string | number): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^m\d{3}snd\d{2}$/i.test(s)) return s.toLowerCase();
  const m = /^(\d{1,3})$/.exec(s);
  if (!m) return '';
  return MAGIC_SFX[m[1].padStart(3, '0')] ?? '';
}

/** 技能编号 → 证级；未知返回 ''。 */
export function magicSfxGrade(raw: string | number): string {
  const key = String(raw ?? '').trim().replace(/^(\d{1,3})$/, (_, d) => d.padStart(3, '0'));
  return MAGIC_SFX_GRADE[key] ?? '';
}

/** 原作的音量是 0..255（88 个静态调用点里 70 个是 255），折成 0..1。 */
export function volume255(v: number): number {
  if (!Number.isFinite(v)) return 1;
  const x = v > 1 ? v / 255 : v;
  return Math.max(0, Math.min(1, x));
}

// ── 总线状态 ────────────────────────────────────────────────────────────

/** 事件日志上限：一次技能最多几十条，512 条足够回看一场战斗。 */
const EVENT_LIMIT = 512;

let sink: AudioSink | null = null;
let seq = 0;
/** 归一化后是空名字、被直接丢掉的次数。 */
let droppedCount = 0;
/**
 * 亮度是**逐帧**写的（一次武将技要把 16 淡到 7 再淡回 16，实测 20 来帧），
 * 所以它不进环形日志（否则一场战斗就把 512 条音效记录挤光了），只记最后一个值 + 总次数。
 */
let brightnessLevel = 16;
let brightnessCount = 0;
const events: AudioEvent[] = [];

export function setAudioSink(next: AudioSink | null): void {
  sink = next;
}

export function getAudioSink(): AudioSink | null {
  return sink;
}

function record(ev: AudioEvent): AudioEvent {
  if (events.length >= EVENT_LIMIT) events.splice(0, events.length - EVENT_LIMIT + 1);
  events.push(ev);
  return ev;
}

/** 事件日志（拷贝，调用方随便改）。 */
export function audioEvents(): AudioEvent[] {
  return events.slice();
}

/** 只取音效事件（测试最常用）。 */
export function audioSfxNames(): string[] {
  return events.filter((e): e is SfxEvent => e.kind === 'sfx').map((e) => e.name);
}

export function clearAudioEvents(): void {
  events.length = 0;
}

/** 清空日志 + 注销 sink + 序号归零（测试 `beforeEach` 用）。 */
export function resetAudioBus(): void {
  events.length = 0;
  sink = null;
  seq = 0;
  droppedCount = 0;
  brightnessCount = 0;
  brightnessLevel = 16;
}

export interface AudioBusStats {
  total: number;
  sfx: number;
  magic: number;
  flash: number;
  brightness: number;
  /** 归一化后是空名字、被丢弃的次数。 */
  dropped: number;
  /** 每个资源键播了几次。 */
  byName: Record<string, number>;
}

export function audioBusStats(): AudioBusStats {
  const st: AudioBusStats = {
    total: events.length + brightnessCount, sfx: 0, magic: 0, flash: 0, brightness: brightnessCount,
    dropped: droppedCount, byName: {},
  };
  for (const e of events) {
    if (e.kind === 'sfx') {
      st.sfx++;
      st.byName[e.name] = (st.byName[e.name] ?? 0) + 1;
    } else if (e.kind === 'magic') st.magic++;
    else if (e.kind === 'flash') st.flash++;
  }
  return st;
}

// ── 发事件 ──────────────────────────────────────────────────────────────

export interface SfxInput {
  name: string;
  /** 0..255（原作口径）或 0..1，两者都收。 */
  volume?: number;
  unit?: number;
  source?: string;
  clock?: number;
}

/**
 * 发一次音效。
 *
 * `sink` 里抛异常不会打断脚本执行——音频永远不能把技能跑崩，
 * 异常被吞掉并且只在控制台打一次。
 */
export function emitSfx(input: SfxInput): SfxEvent | null {
  return emitSfxInternal(input, true);
}

/**
 * 战斗层（`battleAudioEvents`）走这条：只记账，不直接推给 sink。
 *
 * 原因：战场一次混战每 tick 有几十次命中，**播放策略是 web 侧的**（`main.js` 的
 * `battleSfx()`：每 tick ≤2 声 + 同名 60ms 不重叠）。如果这里也推 sink，同一批事件
 * 会被 `tickBattleSfx()` 和 sink 各播一次 —— 实测 `?sim=300` 时 defense 播了 151 次
 * 而事件只有 90 条，就是这条重复路径造成的。
 */
function emitSfxInternal(input: SfxInput, forward: boolean): SfxEvent | null {
  const raw = input.name ?? '';
  const name = normalizeSfxName(raw);
  if (!name) {
    droppedCount++;
    return null;
  }
  const ev: SfxEvent = {
    kind: 'sfx',
    seq: ++seq,
    clock: input.clock ?? 0,
    source: input.source ?? '?',
    name,
    raw,
    volume: volume255(input.volume ?? 255),
  };
  if (input.unit !== undefined) ev.unit = input.unit;
  record(ev);
  if (!forward) return ev;
  try {
    sink?.sfx?.(name, { volume: ev.volume, unit: ev.unit, raw, source: ev.source });
  } catch (err) {
    warnOnce('sfx', err);
  }
  return ev;
}

export function emitMagic(dir: string, volume = 1, source = 'skill', clock = 0): MagicEvent {
  const d = String(dir ?? '').replace(/[^0-9]/g, '').padStart(3, '0').slice(-3);
  const ev: MagicEvent = { kind: 'magic', seq: ++seq, clock, source, dir: d, volume: volume255(volume) };
  record(ev);
  try {
    sink?.magic?.(d, { volume: ev.volume, source });
  } catch (err) {
    warnOnce('magic', err);
  }
  return ev;
}

export function emitFlash(on: boolean, strength = 1, source = 'script', clock = 0): FlashEvent {
  const ev: FlashEvent = {
    kind: 'flash', seq: ++seq, clock, source, on, strength: Math.max(0, Math.min(1, strength)),
  };
  record(ev);
  try {
    sink?.flash?.(on, { strength: ev.strength, source });
  } catch (err) {
    warnOnce('flash', err);
  }
  return ev;
}

/**
 * 发一次亮度变化（`0x12F`）。
 *
 * 原作每次武将技都会把屏幕压暗再抬回来（`MAGIC.SO` 里 `0x12F` 连写 20 来帧），
 * 所以这里**只保留最后值与总次数**，不往环形日志里塞（日志留给音效）。
 */
export function emitBrightness(level: number, source = 'script', clock = 0): BrightnessEvent {
  const ev: BrightnessEvent = {
    kind: 'brightness', seq: ++seq, clock, source, level: Math.max(0, Math.min(16, Math.round(level))),
  };
  brightnessCount++;
  brightnessLevel = ev.level;
  try {
    sink?.brightness?.(ev.level, { source });
  } catch (err) {
    warnOnce('brightness', err);
  }
  return ev;
}

/** 当前亮度（0..16，16 = 原色）。UI 侧拿它画变暗蒙版。 */
export function audioBrightnessLevel(): number {
  return brightnessLevel;
}

const WARNED = new Set<string>();
function warnOnce(kind: string, err: unknown): void {
  if (WARNED.has(kind)) return;
  WARNED.add(kind);
  console.warn(`[audio_bus] ${kind} sink 抛错（已忽略）：`, err);
}

// ── R80：战场音效的 6 类触发 ─────────────────────────────────────────────

/**
 * 上一次分发时的战斗快照。放在应用侧持有（`main.js` 的 `resetBattleAudio()` 里新建）。
 *
 * 为什么需要它：`battle.ts` 的 `stats` 只有 `attacksA/B`、`hitsA/B`、`blocks`，
 * **没有**受击/阵亡/撤退的计数；而 `Unit` 上也没有 hp（小兵是一击必死，
 * 主将血在 `world.sides[side].general.hp`）。所以只能靠三个已有信号做增量：
 *   - `u.lastHitTick === world.tick`（battle.ts:931 挨打时写）→ 受击；
 *   - 上一帧是 `alive`、这一帧 `!alive` → 阵亡；
 *   - `world.fled[side]`（battle.ts:1056 `requestRetreat` 写）→ 撤退。
 */
export interface BattleAudioMark {
  tick: number;
  hitsA: number;
  hitsB: number;
  blocks: number;
  aliveA: number;
  aliveB: number;
  startA: number;
  startB: number;
  over: boolean;
  endReason: string | null;
  /** 上次快照时两侧是否已下达撤退。 */
  fledA: boolean;
  fledB: boolean;
  /** 上次快照时还活着的单位（判阵亡/撤离用）。 */
  alive: Set<Unit>;
}

/** 建一份快照（开战/重开时调）。 */
export function battleAudioMark(world: World): BattleAudioMark {
  const mark: BattleAudioMark = {
    tick: world.tick,
    hitsA: world.stats.hitsA,
    hitsB: world.stats.hitsB,
    blocks: world.stats.blocks,
    aliveA: world.sides.A.aliveCount,
    aliveB: world.sides.B.aliveCount,
    startA: world.sides.A.start,
    startB: world.sides.B.start,
    over: world.over,
    endReason: world.endReason,
    fledA: world.fled.A,
    fledB: world.fled.B,
    alive: new Set(),
  };
  for (const u of world.units) if (u.alive) mark.alive.add(u);
  return mark;
}

/**
 * 取出这一帧该播的战场音效（并推进 `mark`）。
 *
 * 六类与命名（资源键见 `game/web/assets/audio/index.json`）：
 *   - 命中 `hit01`：沿用 `main.js` 原规则（一次 ≥4 下用 0.8，否则 0.62）；
 *   - 格挡 `defense`：沿用原规则（0.45）；
 *   - 受击：主将 `yell01..04`（按坐标轮换，避免连续挨打同一个音），小兵 `hit02`；
 *     一帧最多 2 条，主将优先；
 *   - 阵亡：小兵 `death`（一次 ≥3 个用 0.7），主将 `death3`；
 *   - 撤退：`world.fled[side]` 由 false 变 true 的那一帧播 `yell03` + `horse02`；
 *   - 技能起手：不在这里——由 `emitMagic()`（施法瞬间，`main.js` 的 `skillSfx`）
 *     与脚本自己的 `0x301`（R52，`SkillRun.sound()`）负责。
 *
 * **没有节流**：节流是应用侧的事（`main.js` 的 `battleSfx()`，2 条/帧 + 同名 60ms），
 * 这里只保证语义正确、顺序稳定，方便测试断言。
 */
export function battleAudioEvents(world: World, mark: BattleAudioMark): AudioEvent[] {
  const out: AudioEvent[] = [];
  const tick = world.tick;
  const push = (e: SfxEvent | null): void => {
    if (e) out.push(e);
  };
  // 战场事件只记账、不直接推 sink —— 播放由 web 侧 `tickBattleSfx()` 统一定速
  const emit = (input: SfxInput): SfxEvent | null => emitSfxInternal(input, false);

  // ── 1. 命中 ──
  const dHits = Math.max(0, world.stats.hitsA - mark.hitsA) + Math.max(0, world.stats.hitsB - mark.hitsB);
  if (dHits > 0) {
    push(emit({ name: 'hit01', volume: dHits >= 4 ? 0.8 : 0.62, source: 'battle:hit', clock: tick }));
  }

  // ── 2. 格挡 ──
  if (world.stats.blocks > mark.blocks) {
    push(emit({ name: 'defense', volume: 0.45, source: 'battle:block', clock: tick }));
  }

  // ── 3. 受击（本 tick 挨过打且还活着）──
  let hurtGeneral = 0;
  let hurtTroop = 0;
  for (const u of world.units) {
    if (!u.alive || u.lastHitTick !== tick) continue;
    if (u.isGeneral) hurtGeneral++;
    else hurtTroop++;
  }
  if (hurtGeneral > 0) {
    // 主将惨叫：序号取坐标做散列，同一场战斗不会一直是同一个音
    const g = world.units.find((u) => u.isGeneral && u.alive && u.lastHitTick === tick);
    const n = 1 + (Math.abs((g?.x ?? 0) * 7 + (g?.y ?? 0) * 13) | 0) % 4;
    push(emit({ name: `yell0${n}`, volume: 0.5, source: 'battle:hurt', clock: tick }));
  }
  if (hurtTroop > 0) {
    push(emit({ name: 'hit02', volume: hurtTroop >= 3 ? 0.42 : 0.32, source: 'battle:hurt', clock: tick }));
  }

  // ── 4. 阵亡 / 5. 撤离出场 ──
  const nowAlive = new Set<Unit>();
  let diedTroop = 0;
  let diedGeneral = 0;
  let leftField = 0;
  for (const u of world.units) {
    if (u.alive) nowAlive.add(u);
    else if (mark.alive.has(u)) {
      if (u.isGeneral) diedGeneral++;
      else diedTroop++;
    }
  }
  // 上一帧在场、这一帧整个从 units 里消失：只有 cullFled（battle.ts:1068）会这么干
  for (const u of mark.alive) {
    if (u.alive && !nowAlive.has(u)) leftField++;
  }
  if (diedTroop > 0) {
    push(emit({ name: 'death', volume: diedTroop >= 3 ? 0.7 : 0.55, source: 'battle:death', clock: tick }));
  }
  if (diedGeneral > 0) {
    push(emit({ name: 'death3', volume: 0.85, source: 'battle:general-death', clock: tick }));
  }
  if (leftField > 0) {
    push(emit({ name: 'horse02', volume: 0.35, source: 'battle:leave', clock: tick }));
  }

  // ── 6. 撤退令下达的那一帧 ──
  if ((world.fled.A && !mark.fledA) || (world.fled.B && !mark.fledB)) {
    push(emit({ name: 'yell03', volume: 0.6, source: 'battle:retreat', clock: tick }));
    push(emit({ name: 'horse02', volume: 0.45, source: 'battle:retreat', clock: tick }));
  }

  mark.tick = tick;
  mark.hitsA = world.stats.hitsA;
  mark.hitsB = world.stats.hitsB;
  mark.blocks = world.stats.blocks;
  mark.aliveA = world.sides.A.aliveCount;
  mark.aliveB = world.sides.B.aliveCount;
  mark.over = world.over;
  mark.endReason = world.endReason;
  mark.fledA = world.fled.A;
  mark.fledB = world.fled.B;
  mark.alive = nowAlive;
  return out;
}

// ── R79：SYSTEM.SO 里"最便宜"的 5 个函数的宿主侧实现 ─────────────────────

/**
 * SYSTEM.SO 39 个函数里，本任务实装的 4 个。
 *
 * 原作这 4 个都是**脚本函数**（在 SYSTEM.SO 里，有自己的字节码），它们做的事
 * 全部落在"音效 / 亮度"两根管子上，而这两根管子本任务的 `audio_bus` 已经具备，
 * 所以这里按原生函数实现，行为与字节码等价（依据见 `work/system_so/map.md`）：
 *
 *   - `DownBrightness(level, frames)`：`0x12F(level)` + `0x130()`，逐帧降亮度；
 *   - `RaiseBrightness(level, frames)`：同上，升亮度；
 *   - `MajorDeath(side, handle)`：`0x301("Yell03")` + `0x301("Horse02")` + `0x301("VICTORY")`；
 *   - `LoadingBattleMap(map)`：`0x301("BG03A"/"BG04A"/"BG08A"/"BG09A")` 选一个当地形底噪。
 *
 * R137 起 `AllRush` **移出本表**：它不再是"只播音效"的函数，而是要把命令字写进
 * `world.rush`（gameplay），所以搬进了 `core/syso_host.ts` 的宿主实现
 * （`status:'host'`）。留在本表会让 `callSystemSo` 返回真值、把 `SysoHost` 短路掉
 * （见下面 `SYSTEM_SO_HOST_IMPLEMENTED` 的注释），突击态永远置不上。
 *
 * 返回值：原作这 4 个都是 `RET n`（无返回），这里返回 `undefined` 保持一致。
 */
export const SYSTEM_SO_IMPLEMENTED = [
  'DownBrightness',
  'RaiseBrightness',
  'MajorDeath',
  'LoadingBattleMap',
] as const;

export type SystemSoFuncName = (typeof SYSTEM_SO_IMPLEMENTED)[number];

/**
 * `SYSTEM.SO` 里**宿主侧**已实装的 26 个函数（R79 第二批 + R137 的 `AllRush`，见
 * `core/syso_host.ts` 的 `SYSTEM_SO_FUNCTIONS` 与 `project/62_SYSTEM_SO实装.md`）。
 *
 * 为什么单独列一份、且**不**并入 `SYSTEM_SO_IMPLEMENTED`：
 *  1. `tests/smartscript_audio.test.ts` 用 `deepEqual` 锁死了上面那 4 个（音效/亮度管子）；
 *  2. `callSystemSo()` 一旦对宿主函数返回真值，`runtime.callScript` 里的 `if (sys) return undefined`
 *     会把 `SysoHost` 整条路短路 —— 这些必须由 `syso.call` 自己执行。
 * 所以这里的名单只作**登记与对账**用，`callSystemSo` 对它们继续 `return null`。
 * 真正的实现与名单在 `core/syso_host.ts`（改动那里时请同步这里）。
 */
export const SYSTEM_SO_HOST_IMPLEMENTED = [
  'GetByte_Old',
  'GetByte_Signed_Old',
  'GetShort_Old',
  'GetShort_Signed_Old',
  'GetInt_Old',
  'SetInt_Old',
  'SetShort_Old',
  'SetByte_Old',
  'SetString_Old',
  'MoveCamera',
  'EnterMapMoveCamera',
  'WeatherObjectDeath',
  'ProduceRain',
  'ProduceSnow',
  'ProduceFog',
  'EnterWar4',
  'EnterWar5',
  'EnterWar7',
  'KillGeneral',
  'FreeGeneral',
  'Test01',
  'EnterWarprep',
  'EnterMapmode',
  'EnterPolicy',
  'EnterBattle',
  // R137：全軍突擊 —— 从 `SYSTEM_SO_IMPLEMENTED` 搬来（要写 `world.rush`，不是纯音效）
  'AllRush',
] as const;

/** 39 条里**已实装**的全部（4 个音效管子 + 26 个宿主）；剩下 9 个是 `SYSO_UNSUPPORTED`。 */
export const SYSTEM_SO_ALL_IMPLEMENTED = [
  ...SYSTEM_SO_IMPLEMENTED,
  ...SYSTEM_SO_HOST_IMPLEMENTED,
] as const;

/** `LoadingBattleMap` 的 4 个地形底噪（SYSTEM.SO strings[22..25]）。 */
export const BATTLE_MAP_AMBIENT = ['bg03a', 'bg04a', 'bg08a', 'bg09a'] as const;

/**
 * 地形 → `BATTLE_MAP_AMBIENT` 下标。
 *
 * 依据 `export/script/system_so.dis.txt:1058`（func #19 `LoadingBattleMap` id=0x32 argc=1 @0x1D54）
 * 的 12 路 CASE：**只有** 3→BG03A、5→BG04A、8→BG08A（+ProduceSnow）、9→BG09A 会
 * `SYSCALL 0x301,0x2`；0/1/2/6/10/11 直接 RET，4/7 只调 `EnterWar4/7`。
 * 早期实现用 `terrain % 4` 取下标，会让 12 个地形里 8 个播错底噪（4、7 本应无声）。
 */
export const BATTLE_MAP_AMBIENT_OF: Readonly<Record<number, number>> = {
  3: 0,
  5: 1,
  8: 2,
  9: 3,
};

export interface SystemCallInput {
  source?: string;
  clock?: number;
  /** `MajorDeath` 用：哪一方的大将。 */
  side?: Side;
}

/**
 * 调一个已实装的 SYSTEM.SO 函数。
 *
 * 未在 `SYSTEM_SO_IMPLEMENTED` 里登记的返回 `null`，调用方（`runtime.callScript`）据此
 * 回退到 `SysoHost` / MAGIC.SO。`AllRush` 自 R137 起属于后者（`status:'host'`）。
 * 参数个数/含义按 `work/system_so/map.md` 的签名；缺参数用原作的默认值。
 */
export function callSystemSo(name: string, args: number[] = [], input: SystemCallInput = {}): AudioEvent[] | null {
  const fn = name as SystemSoFuncName;
  if (!SYSTEM_SO_IMPLEMENTED.includes(fn)) return null;
  const source = input.source ?? `system:${name}`;
  const clock = input.clock ?? 0;
  const out: AudioEvent[] = [];

  switch (fn) {
    case 'DownBrightness':
    case 'RaiseBrightness': {
      // 原作：0x12F(arg) 写 0x48E520（上限 0x10），0x130() 读回来比较；
      // 这里直接把目标亮度发出去，渐变交给渲染层（`audio.js` 用 CSS transition）。
      const raw = Number.isFinite(args[0]) ? args[0] : 16;
      const level = fn === 'DownBrightness' ? 16 - raw : raw;
      out.push(emitBrightness(level, source, clock));
      return out;
    }
    case 'MajorDeath': {
      out.push(emitSfx({ name: 'Yell03', volume: 255, source, clock })!);
      out.push(emitSfx({ name: 'Horse02', volume: 200, source, clock })!);
      out.push(emitSfx({ name: 'VICTORY', volume: 255, source, clock })!);
      return out;
    }
    case 'LoadingBattleMap': {
      // 参数是地形编号（0..11）；只有 4 个地形有底噪，其余静默（见 BATTLE_MAP_AMBIENT_OF）。
      const terrain = Math.abs(Math.trunc(args[0] ?? 0));
      const idx = BATTLE_MAP_AMBIENT_OF[terrain];
      if (idx === undefined) return out;
      out.push(emitSfx({ name: BATTLE_MAP_AMBIENT[idx], volume: 255, source, clock })!);
      return out;
    }
    default:
      return null;
  }
}
