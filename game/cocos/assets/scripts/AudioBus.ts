/**
 * 音效总线（Cocos 侧）—— 移植自 `F:\sanguo\game\src\core\audio_bus.ts`（547 行，2026-11-25 版）。
 *
 * 为什么 Cocos 也要有这根总线：Cocos 版此前**全程无声** —— `core/smartscript/runtime.ts:823`
 * 的 `sound()` 只把 `名字:音量` 塞进 `sounds[]` 日志，没有任何播放器；战斗里的命中/死亡/
 * 技能也从来没有「事件」这个概念。web 侧的 R79/R80 已经把「谁该响、多响、什么顺序」定完了，
 * 这里原样搬过来，只换掉播放端（`AudioHost.ts` 用 `AudioSource` 池来接 sink）。
 *
 * 与 web 版的差异（只有 3 处，都是因为 Cocos 的 `core/battle.ts` 是旧 fork）：
 *  1. `world.fled` / `world.stats.blocks` 在这个 fork 里不存在 → 用**可选读取**，缺了就不发
 *     这两类事件（`defense`、撤退的 `yell03/horse02`）。补上字段后本文件无需再改。
 *  2. `Unit.hurtTroop` 不存在 → 用「本 tick 该侧 aliveCount 的减少量」代替它做音量分档
 *     （≥3 → 大声），语义一致（都是"这一 tick 打掉了几个兵"）。
 *  3. 事件里的 `unit` 直接存 `Unit` 引用（与 web 一致），但 Cocos 的 `Unit` 没有 `id` 字段，
 *     所以 `unit` 只用来给宿主选音色，不做键。
 *
 * 不变的部分（契约）：`setAudioSink / emitSfx / emitMagic / emitFlash / emitBrightness /
 * callSystemSo / battleAudioMark / battleAudioEvents` 的签名与语义与 web 版一致；
 * 事件环形日志上限 512；`SFX_ALIASES` / `volume255` / `normalizeSfxName` 逐字相同。
 *
 * 播放策略**不在**这里：`battleAudioEvents()` 只记账不推 sink（一批事件同时出，宿主自己
 * 决定丢谁），这与 web 版一致 —— 见 `AudioHost.pump()`。
 */
import type { Side, Unit, World } from './core/battle';

// ── 事件类型 ──────────────────────────────────────────────────────────────

export interface EventBase {
  /** 全局自增序号：宿主可以据此去重/排序 */
  seq: number;
  /** 逻辑时钟（战斗里是 tick，UI 里是秒）；只用于日志回放 */
  clock: number;
  /** 谁发的：'battle' / 'skill' / 'system:AllRush' / 业务自定义 */
  source: string;
}

export interface SfxEvent extends EventBase {
  kind: 'sfx';
  /** 归一化后的名字（小写、别名已展开），就是资源名 */
  name: string;
  /** 调用方原始名字（`m016a` 这类别名保留原样，便于日志对照） */
  raw: string;
  /** 0..1 */
  volume: number;
  unit?: Unit;
}

export interface MagicEvent extends EventBase {
  kind: 'magic';
  /** 3 位特效目录号（`fx_dir_primary`），如 `'016'` */
  dir: string;
  volume: number;
}

export interface FlashEvent extends EventBase {
  kind: 'flash';
  on: boolean;
  /** 0..1 */
  strength: number;
}

export interface BrightnessEvent extends EventBase {
  kind: 'brightness';
  /** 0..16（原作 `0x48E520` 的上限） */
  level: number;
}

export type AudioEvent = SfxEvent | MagicEvent | FlashEvent | BrightnessEvent;

/** 宿主实现这个接口就能拿到全部声音/画面事件；每个方法都是可选的。 */
export interface AudioSink {
  sfx?(name: string, opts: { volume: number; unit?: Unit; raw?: string; source?: string }): void;
  magic?(dir: string, opts: { volume: number; source?: string }): void;
  flash?(on: boolean, opts: { strength: number; source?: string }): void;
  brightness?(level: number, opts: { source?: string }): void;
}

export interface SfxInput {
  name: string;
  /** 0..1，或 0..255（>1 视为 0..255） */
  volume?: number;
  unit?: Unit;
  source?: string;
  clock?: number;
}

export interface AudioBusStats {
  total: number;
  sfx: number;
  magic: number;
  flash: number;
  brightness: number;
  dropped: number;
  byName: Record<string, number>;
}

// ── 名字归一化 ────────────────────────────────────────────────────────────

/**
 * `data/magics.json` / 脚本里写的音名不一定是资源名：原作 `MAGIC.SO` 用的是
 * `m016a` 这种"目录号 + 子序号字母"，资源文件叫 `m016snd01`。这张表是实测出来的别名。
 */
export const SFX_ALIASES: Record<string, string> = {
  m016a: 'm016snd01',
  rush01: 'rush01',
  victory: 'victory',
  success: 'success',
  failure2: 'failure2',
  yell03: 'yell03',
  horse02: 'horse02',
};

/** 原始音名 → 资源名（小写、查别名、去空白）。空名返回 ''（调用方据此丢弃）。 */
export function normalizeSfxName(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  return SFX_ALIASES[s] ?? s;
}

/**
 * 音频资源在 bundle / CDN 里的逻辑路径 —— **唯一拼法**。
 *
 * `AudioHost` 用它当 `clips` 缓存的键、当 `bundle.load()` 的路径，也当
 * `dist/audio-cdn/audio-manifest.json` 的键（`audio/sfx/hit01`）。所以改动这里
 * 等于改动远端清单的键，出包脚本与运行时要一起改（见 `project/77_音频CDN通道.md`）。
 */
export function audioPath(kind: 'sfx' | 'bgm', name: string): string {
  const dir = kind === 'bgm' ? 'audio/bgm' : 'audio/sfx';
  return `${dir}/${name}`;
}

/** 音量：>1 视为 0..255 口径（原作 `0x301(name, 255)`），统一 clamp 到 0..1。 */
export function volume255(v: number | undefined): number {
  if (v === undefined) return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const scaled = n > 1 ? n / 255 : n;
  return scaled < 0 ? 0 : scaled > 1 ? 1 : scaled;
}

// ── 总线状态 ──────────────────────────────────────────────────────────────

/** 环形日志上限：调试面板只显示最近若干条，但事件对象要留住供审计。 */
export const EVENT_LIMIT = 512;

interface BusState {
  events: AudioEvent[];
  seq: number;
  sink: AudioSink | null;
  brightnessLevel: number;
  brightnessCount: number;
  dropped: number;
  byName: Record<string, number>;
}

const state: BusState = {
  events: [],
  seq: 0,
  sink: null,
  brightnessLevel: 16,
  brightnessCount: 0,
  dropped: 0,
  byName: {},
};

const WARNED = new Set<string>();

function warnOnce(kind: string, err: unknown): void {
  if (WARNED.has(kind)) return;
  WARNED.add(kind);
  console.warn(`[AudioBus] ${kind} sink 抛错（已忽略，后续同类不再刷屏）：`, err);
}

/** 注册播放端（传 `null` 摘掉）。只允许一个：后注册的覆盖前一个。 */
export function setAudioSink(next: AudioSink | null): void {
  state.sink = next;
}

export function getAudioSink(): AudioSink | null {
  return state.sink;
}

function record(ev: AudioEvent): void {
  state.events.push(ev);
  if (state.events.length > EVENT_LIMIT) state.events.splice(0, state.events.length - EVENT_LIMIT);
  if (ev.kind === 'sfx') state.byName[ev.name] = (state.byName[ev.name] ?? 0) + 1;
}

export function audioEvents(): AudioEvent[] {
  return state.events.slice();
}

/** 日志里出现过的音名（去重、按首次出现排序）。验收/自检用。 */
export function audioSfxNames(): string[] {
  const seen = new Set<string>();
  for (const ev of state.events) if (ev.kind === 'sfx') seen.add(ev.name);
  // 必须 Array.from：Creator 的 Babel(loose) 会把 [...set] 编成 [].concat(set)（保留迭代器本身）。
  return Array.from(seen);
}

export function clearAudioEvents(): void {
  state.events.length = 0;
}

/** 清空一切（含 sink 与亮度）：单测/重开一局用。 */
export function resetAudioBus(): void {
  state.events.length = 0;
  state.seq = 0;
  state.sink = null;
  state.brightnessLevel = 16;
  state.brightnessCount = 0;
  state.dropped = 0;
  state.byName = {};
  WARNED.clear();
}

export function audioBusStats(): AudioBusStats {
  const stats: AudioBusStats = {
    total: state.events.length,
    sfx: 0,
    magic: 0,
    flash: 0,
    brightness: state.brightnessCount,
    dropped: state.dropped,
    byName: { ...state.byName },
  };
  for (const ev of state.events) {
    if (ev.kind === 'sfx') stats.sfx += 1;
    else if (ev.kind === 'magic') stats.magic += 1;
    else if (ev.kind === 'flash') stats.flash += 1;
  }
  return stats;
}

function forward(ev: AudioEvent): void {
  const sink = state.sink;
  if (!sink) return;
  try {
    if (ev.kind === 'sfx') sink.sfx?.(ev.name, { volume: ev.volume, unit: ev.unit, raw: ev.raw, source: ev.source });
    else if (ev.kind === 'magic') sink.magic?.(ev.dir, { volume: ev.volume, source: ev.source });
    else if (ev.kind === 'flash') sink.flash?.(ev.on, { strength: ev.strength, source: ev.source });
    else sink.brightness?.(ev.level, { source: ev.source });
  } catch (e) {
    warnOnce(ev.kind, e);
  }
}

// ── 发送 ──────────────────────────────────────────────────────────────────

function emitSfxInternal(input: SfxInput, forwardToSink: boolean): SfxEvent | null {
  const raw = String(input?.name ?? '');
  const name = normalizeSfxName(raw);
  if (!name) {
    state.dropped += 1;
    return null;
  }
  const ev: SfxEvent = {
    kind: 'sfx',
    seq: state.seq++,
    clock: input.clock ?? 0,
    source: input.source ?? 'script',
    name,
    raw,
    volume: volume255(input.volume),
  };
  if (input.unit) ev.unit = input.unit;
  record(ev);
  if (forwardToSink) forward(ev);
  return ev;
}

/** 发一个音效事件。名字为空 → 返回 `null` 并计入 `dropped`。 */
export function emitSfx(input: SfxInput): SfxEvent | null {
  return emitSfxInternal(input, true);
}

/** 技能音：`dir` 是 `fx_dir_primary`（数字或 `'016'` 都行），补成 3 位。 */
export function emitMagic(dir: string | number, volume = 1, source = 'skill', clock = 0): MagicEvent {
  const key = String(dir)
    .replace(/[^0-9]/g, '')
    .padStart(3, '0')
    .slice(-3);
  const ev: MagicEvent = { kind: 'magic', seq: state.seq++, clock, source, dir: key, volume: volume255(volume) };
  record(ev);
  forward(ev);
  return ev;
}

/** 闪白开关（`0x131` / `0x110`）：`on=true` 开、`on=false` 关。 */
export function emitFlash(on: boolean, strength = 1, source = 'script', clock = 0): FlashEvent {
  const s = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const ev: FlashEvent = { kind: 'flash', seq: state.seq++, clock, source, on: on === true, strength: s };
  record(ev);
  forward(ev);
  return ev;
}

/** 画面亮度（0 黑 .. 16 正常）。只保留最后一次值，不进事件日志（否则每帧一条）。 */
export function emitBrightness(level: number, source = 'script', clock = 0): BrightnessEvent {
  const n = Number.isFinite(level) ? Math.round(level) : 16;
  const lv = n < 0 ? 0 : n > 16 ? 16 : n;
  state.brightnessLevel = lv;
  state.brightnessCount += 1;
  const ev: BrightnessEvent = { kind: 'brightness', seq: state.seq++, clock, source, level: lv };
  forward(ev);
  return ev;
}

/** 当前画面亮度 0..16（渲染层每帧读一次）。 */
export function audioBrightnessLevel(): number {
  return state.brightnessLevel;
}

// ── R80：战场音频事件（按 tick 差分）─────────────────────────────────────

/**
 * 战场音频的「上一帧快照」。`battleAudioEvents()` 靠它做差分：
 * 命中数涨了 → 打命中声；有人死了 → 死亡声；有人被移出 → 马蹄声。
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
  fledA: boolean;
  fledB: boolean;
  /** 上一帧还活着的单位（`Unit` 引用，用来发现"这一帧没了"） */
  alive: Set<Unit>;
}

/** 拍一张快照：开战时 `mark = battleAudioMark(world)`，之后每帧交给 `battleAudioEvents` 推进。 */
export function battleAudioMark(world: World): BattleAudioMark {
  const mark: BattleAudioMark = {
    tick: world.tick,
    hitsA: world.stats.hitsA,
    hitsB: world.stats.hitsB,
    blocks: blocksOf(world),
    aliveA: world.sides.A.aliveCount,
    aliveB: world.sides.B.aliveCount,
    startA: world.sides.A.start,
    startB: world.sides.B.start,
    over: world.over,
    endReason: world.endReason,
    fledA: fledOf(world, 'A'),
    fledB: fledOf(world, 'B'),
    alive: new Set<Unit>(),
  };
  for (const u of world.units) if (u.alive) mark.alive.add(u);
  return mark;
}

/** `stats.blocks` 在 Cocos 这个 fork 里没有 → 缺省 0（= 永远不发格挡声）。 */
function blocksOf(world: World): number {
  const stats = world.stats as unknown as { blocks?: number };
  return Number.isFinite(stats.blocks) ? (stats.blocks as number) : 0;
}

/** `world.fled` 在 Cocos 这个 fork 里没有 → 缺省 false（= 永远不发撤退声）。 */
function fledOf(world: World, side: Side): boolean {
  const fled = (world as unknown as { fled?: Partial<Record<Side, boolean>> }).fled;
  return fled?.[side] === true;
}

/**
 * 推进一帧，返回这一帧发生的音频事件（**不推 sink**）。
 *
 * 六类，顺序即优先级（宿主按顺序逐条播，额度用完后剩下的自然丢弃）：
 *  1. 命中：`hit01`，本帧命中 ≥4 声 → 0.8，否则 0.62；
 *  2. 格挡：`defense` 0.45（Cocos 侧暂无 `stats.blocks`，见文件头）；
 *  3. 受击：主将 `yell0{1..4}` 0.5；小兵 `hit02`，本侧本帧损失 ≥3 → 0.42，否则 0.32；
 *  4. 阵亡：小兵 `death`（≥3 → 0.7 / 0.55）；主将 `death3` 0.85；
 *  5. 离场（被 cull）：`horse02` 0.35；
 *  6. 撤退令（`fled` false→true 那一帧）：`yell03` 0.6 + `horse02` 0.45。
 *
 * 注意：调用一次就**推进** mark 到当前 world，所以每帧只能调一次。
 */
export function battleAudioEvents(world: World, mark: BattleAudioMark): AudioEvent[] {
  const out: AudioEvent[] = [];
  const emit = (input: SfxInput): void => {
    const ev = emitSfxInternal(input, false);
    if (ev) out.push(ev);
  };
  const tick = world.tick;
  const blocks = blocksOf(world);
  const dHits = world.stats.hitsA + world.stats.hitsB - (mark.hitsA + mark.hitsB);
  const fledA = fledOf(world, 'A');
  const fledB = fledOf(world, 'B');

  // 1) 命中声：一次 tick 里可能同时有多组对打，用命中数分档压住频率
  if (dHits > 0) emit({ name: 'hit01', volume: dHits >= 4 ? 0.8 : 0.62, source: 'battle', clock: tick });

  // 2) 格挡
  if (blocks > mark.blocks) emit({ name: 'defense', volume: 0.45, source: 'battle', clock: tick });

  // 3) 受击：`lastHitTick === tick` 的单位本帧刚挨打
  const lossA = Math.max(0, mark.aliveA - world.sides.A.aliveCount);
  const lossB = Math.max(0, mark.aliveB - world.sides.B.aliveCount);
  for (const u of world.units) {
    if (!u.alive || u.lastHitTick !== tick) continue;
    if (u.isGeneral === true) {
      const name = `yell0${1 + (Math.abs(Math.trunc(u.x * 7 + u.y * 13)) % 4)}`;
      emit({ name, volume: 0.5, source: 'battle', clock: tick, unit: u });
    } else {
      const loss = u.side === 'A' ? lossA : lossB;
      emit({ name: 'hit02', volume: loss >= 3 ? 0.42 : 0.32, source: 'battle', clock: tick, unit: u });
    }
  }

  // 4) 阵亡：上一帧活着、这一帧死了
  for (const u of mark.alive) {
    if (u.alive) continue;
    if (u.isGeneral === true) {
      emit({ name: 'death3', volume: 0.85, source: 'battle', clock: tick, unit: u });
    } else {
      const loss = u.side === 'A' ? lossA : lossB;
      emit({ name: 'death', volume: loss >= 3 ? 0.7 : 0.55, source: 'battle', clock: tick, unit: u });
    }
  }

  // 5) 离场：上一帧活着、这一帧已经不在 units 里（被 cull 掉）
  for (const u of mark.alive) {
    if (!world.units.includes(u)) emit({ name: 'horse02', volume: 0.35, source: 'battle', clock: tick });
  }

  // 6) 撤退令：fled 由 false 变 true 的那一帧
  if ((fledA && !mark.fledA) || (fledB && !mark.fledB)) {
    emit({ name: 'yell03', volume: 0.6, source: 'battle', clock: tick });
    emit({ name: 'horse02', volume: 0.45, source: 'battle', clock: tick });
  }

  // 推进快照
  mark.tick = tick;
  mark.hitsA = world.stats.hitsA;
  mark.hitsB = world.stats.hitsB;
  mark.blocks = blocks;
  mark.aliveA = world.sides.A.aliveCount;
  mark.aliveB = world.sides.B.aliveCount;
  mark.over = world.over;
  mark.endReason = world.endReason;
  mark.fledA = fledA;
  mark.fledB = fledB;
  const nowAlive = new Set<Unit>();
  for (const u of world.units) if (u.alive) nowAlive.add(u);
  mark.alive = nowAlive;
  return out;
}

// ── R79：SYSTEM.SO 里"最便宜"的 5 个函数的宿主侧实现 ─────────────────────

/**
 * SYSTEM.SO 39 个函数里，本任务实装的 5 个。原作这 5 个都是**脚本函数**，
 * 做的事全部落在"音效 / 亮度"两根管子上（依据 `work/system_so/map.md`）：
 *
 *   - `DownBrightness(arg)`：`0x12F(16 - arg)` + `0x130()`，逐帧降亮度；
 *   - `RaiseBrightness(arg)`：同上，升亮度；
 *   - `AllRush()`：`0x301("Rush01", 255)` + `0x131`（闪白）+ `0x110`；
 *   - `MajorDeath(side, handle)`：`Yell03` + `Horse02` + `VICTORY`；
 *   - `LoadingBattleMap(map)`：按 `map % 4` 选一个地形底噪。
 */
export const SYSTEM_SO_IMPLEMENTED = [
  'DownBrightness',
  'RaiseBrightness',
  'AllRush',
  'MajorDeath',
  'LoadingBattleMap',
] as const;

export type SystemSoFuncName = (typeof SYSTEM_SO_IMPLEMENTED)[number];

/** `LoadingBattleMap` 的 4 个地形底噪（SYSTEM.SO strings[22..25]）。 */
export const BATTLE_MAP_AMBIENT = ['bg03a', 'bg04a', 'bg08a', 'bg09a'] as const;

/** 地形 → 底噪下标；SYSTEM.SO #19 只有 3/5/8/9 四个地形发底噪，其余静默。 */
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
 * 调一个已实装的 SYSTEM.SO 函数；未实装的 34 个返回 `null`（调用方回退到旧行为）。
 * 与 web 版一致：这里的音效事件**会**推 sink（不是批量记账）。
 */
export function callSystemSo(name: string, args: number[] = [], input: SystemCallInput = {}): AudioEvent[] | null {
  if (!(SYSTEM_SO_IMPLEMENTED as readonly string[]).includes(name)) return null;
  const fn = name as SystemSoFuncName;
  const source = input.source ?? `system:${name}`;
  const clock = input.clock ?? 0;
  const out: AudioEvent[] = [];

  switch (fn) {
    case 'DownBrightness':
    case 'RaiseBrightness': {
      const raw = Number.isFinite(args[0]) ? (args[0] as number) : 16;
      const level = fn === 'DownBrightness' ? 16 - raw : raw;
      out.push(emitBrightness(level, source, clock));
      return out;
    }
    case 'AllRush': {
      out.push(emitSfx({ name: 'Rush01', volume: 255, source, clock })!);
      // 一对闪白开关：原作在突击瞬间打一次白闪
      out.push(emitFlash(true, 0.55, source, clock));
      out.push(emitFlash(false, 0, source, clock));
      return out;
    }
    case 'MajorDeath': {
      out.push(emitSfx({ name: 'Yell03', volume: 255, source, clock })!);
      out.push(emitSfx({ name: 'Horse02', volume: 200, source, clock })!);
      out.push(emitSfx({ name: 'VICTORY', volume: 255, source, clock })!);
      return out;
    }
    case 'LoadingBattleMap': {
      // 参数是地形编号（0..11）；只有 3/5/8/9 有底噪，其余静默（SYSTEM.SO #19 的 12 路 CASE）。
      const terrain = Math.abs(Math.trunc(args[0] ?? 0));
      const idx = BATTLE_MAP_AMBIENT_OF[terrain];
      if (idx === undefined) return out;
      out.push(emitSfx({ name: BATTLE_MAP_AMBIENT[idx] as string, volume: 255, source, clock })!);
      return out;
    }
    default:
      return null;
  }
}
