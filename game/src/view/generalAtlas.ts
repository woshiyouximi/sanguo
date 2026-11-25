/// <reference lib="dom" />
/**
 * 武将战场小人图集（`game/web/anim/general/`）—— A3 交付的 `index.json` + `sheet_00..34.png`。
 *
 * 与 `atlas`（老士兵图集）/ `units`（兵种图集）并列，互不干扰：本模块只负责
 * 「主将该画哪几帧、画在哪」，不碰 `World` 的逻辑字段，也不改绘制顺序。
 *
 * 三条硬约定（来自 project/48_武将小人装配.md §8.3，已用图集自证）：
 *   1. `SpriteCmd` 的 `(x, y)` 是**脚底地面点**，`execute()` 用 `(x - w/2, y - h)` 当左上角；
 *      图集帧的锚点是 `(ox, oy)`（帧内像素坐标），所以左上角必须落在 `(ax - ox, ay - oy)`。
 *   2. **主将必须连坐骑一起画**：BODY 的站立姿态整体在锚点上方 39–40px（鞍高），
 *      只画身体会浮空，只画马是空马。层次顺序固定为 坐骑 → 身体 → 武器。
 *   3. 动作**按 `groups` 的键选**（`Wait`/`Attack` 带 `:slot`，其余不带；`W{seq}:`/`H{seq}:` 前缀），
 *      帧序按 `actions[key].h`（每帧停留 tick）累计，用 `world.tick`（引擎 tick）而不是墙钟。
 *
 * 加载是**自给自足**的：`main.js` 不传图集进来（那个文件不在本任务范围），所以这里
 * 首次调用 `generalAtlasTick()` 时自己 `fetch('anim/general/index.json')` 并起图；
 * 拉不到 / 解析失败 / 图没解码完 → `generalLayers()` 返回 null，调用方退回矢量小人。
 * 调试开关：`?genbase=别的/路径/` 换 base（用来验 404 降级）、`?gen=off` 直接关掉。
 */

import { actionIntervalOf, type Unit, type World } from '../core/battle.ts';

// ---------------------------------------------------------------------------
// 图集结构（与 index.json 同形）
// ---------------------------------------------------------------------------

/** 图集里的一帧：`ox/oy` = 锚点在该帧内的像素坐标（脚底地面点） */
export interface GFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  page: string;
}

interface GAction {
  /** 缺省停帧（`h` 里的 null 用它兜底） */
  d: number | null;
  /** 每帧停留 tick；`null` = 用 `d` */
  h: (number | null)[];
  /** 1 = 循环，0 = 播完停最后一帧 */
  loop: number;
}

export interface GeneralAtlas {
  base: string;
  pages: Map<string, HTMLImageElement>;
  frames: Record<string, GFrame>;
  groups: Record<string, string[]>;
  actions: Record<string, GAction>;
  objects: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 自加载
// ---------------------------------------------------------------------------

function param(name: string): string | null {
  const s = typeof location === 'undefined' ? '' : location.search || '';
  const m = new RegExp(`[?&]${name}=([^&]*)`).exec(s);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

const BASE = param('genbase') ?? 'anim/general/';
const DISABLED = param('gen') === 'off';

let atlas: GeneralAtlas | null = null;
let started = false;
let failed = false;
/** 最近一次失败原因，`generalAtlasState()` 会报出来 */
let failWhy = '';

/** 图集是否已就绪（页面/图都解码完才算） */
export function generalAtlasReady(): boolean {
  return atlas !== null;
}

/**
 * 每帧调用一次（`render()` 里）：第一次进来就异步拉 `index.json`。
 * 拉回来后图集才可用；在那之前 `generalLayers()` 一直返回 null（= 矢量降级），
 * 所以永远不会出现"半张图"的中间态。
 */
export function generalAtlasTick(): void {
  if (started || DISABLED || typeof fetch !== 'function') return;
  started = true;
  void load();
}

async function load(): Promise<void> {
  try {
    const r = await fetch(BASE + 'index.json', { cache: 'no-store' });
    if (!r.ok) {
      failed = true;
      failWhy = `http ${r.status}`;
      return;
    }
    const j: {
      pages: { file: string; sprites: (Omit<GFrame, 'page'> & { name: string })[] }[];
      groups: Record<string, string[]>;
      actions: Record<string, GAction>;
      objects: Record<string, unknown>;
    } = await r.json();
    const frames: Record<string, GFrame> = {};
    const pages = new Map<string, HTMLImageElement>();
    for (const p of j.pages) {
      for (const s of p.sprites) {
        frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy, page: p.file };
      }
      const im = new Image();
      im.decoding = 'async';
      im.src = BASE + p.file;
      pages.set(p.file, im);
    }
    atlas = {
      base: BASE,
      pages,
      frames,
      groups: j.groups || {},
      actions: j.actions || {},
      objects: j.objects || {},
    };
  } catch (e) {
    failed = true;
    failWhy = e instanceof Error ? e.message : String(e);
  }
}

/** 调试：一行说明图集状态（控制台 / 截图取证用） */
export function generalAtlasState(): string {
  if (DISABLED) return 'general atlas: disabled (?gen=off)';
  if (atlas) return `general atlas: ok base=${atlas.base} pages=${atlas.pages.size} frames=${Object.keys(atlas.frames).length}`;
  if (failed) return `general atlas: FAILED (${failWhy}) — vector fallback`;
  return started ? 'general atlas: loading…' : 'general atlas: idle';
}

// ---------------------------------------------------------------------------
// 武将 → 造型 / 武器 / 坐骑（project/48 §6，数据闭合，非推测）
// ---------------------------------------------------------------------------

/** `generals.json` 的 `TYPE` 1..15 → 造型符号（第 15 个写作 `0`） */
const SHAPE_OF_TYPE = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', '0'];

function shapeSymbol(type: number | undefined): string {
  const n = Number(type);
  const i = Math.min(15, Math.max(1, Number.isFinite(n) && n >= 1 ? n : 2)) - 1;
  return SHAPE_OF_TYPE[i];
}

/** 武器类名 → BODY 槽位(:slot) + 默认武器图形序号（W{seq}:） */
const WEAPON_OF: Record<string, { slot: number; seq: number }> = {
  直劍: { slot: 1, seq: 700 },
  短錐槍: { slot: 2, seq: 720 },
  銅殳: { slot: 3, seq: 740 },
  眉尖刀: { slot: 4, seq: 760 },
};

/** 坐骑马名 → 坐骑图形序号（H{seq}:） */
const HORSE_OF: Record<string, number> = {
  黃鬃馬: 900,
  褐鬃馬: 901,
  黑鬃馬: 902,
  大宛馬: 903,
  鐵騎馬: 904,
  的盧: 905,
  爪黃飛電: 906,
  赤兔馬: 907,
};

interface GeneralRow {
  TYPE?: number;
  Weapon?: string;
  Horse?: string;
}

/** `world.data.generals` 按名字查一行（main.js:623 也是这么查的），结果缓存 */
const rowCache = new Map<string, GeneralRow | null>();

function rowOf(world: World, name: string): GeneralRow | null {
  if (!name) return null;
  const hit = rowCache.get(name);
  if (hit !== undefined) return hit;
  const all = (world.data?.generals ?? []) as GeneralRow[] & { NAME?: string }[];
  let found: GeneralRow | null = null;
  for (const g of all) {
    if ((g as unknown as { NAME?: string }).NAME === name) {
      found = g;
      break;
    }
  }
  rowCache.set(name, found);
  return found;
}

// ---------------------------------------------------------------------------
// 取帧
// ---------------------------------------------------------------------------

function holdOf(a: GeneralAtlas, key: string): number[] {
  const meta = a.actions[key];
  const nul = meta?.d ?? 8;
  return (meta?.h ?? []).map((v) => (v == null ? nul : v));
}

/**
 * `t` = **该动作自己的已过 tick**（不是全局 tick）：
 * 循环动作（Wait/Walk）可以随便传大数，非循环动作（Attack/Death）必须传动作内的相对时间，
 * 否则 `min(t, total-1)` 会把所有非循环动作永远钉在最后一帧。
 */
function frameIndexAt(a: GeneralAtlas, key: string, t: number): number {
  const h = holdOf(a, key);
  if (h.length === 0) return 0;
  const total = h.reduce((s, v) => s + v, 0);
  let left = a.actions[key]?.loop ? ((t % total) + total) % total : Math.max(0, Math.min(t, total - 1));
  for (let i = 0; i < h.length; i++) {
    if (left < h[i]) return i;
    left -= h[i];
  }
  return h.length - 1;
}

/** 一条 sprite 层（纯数据，由 battleView 转成 SpriteCmd —— 本模块不认识 DrawCmd） */
export interface GeneralLayer {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 与 SpriteCmd 同义：`(x, y)` 是脚底锚点，不是左上角 */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 出手动作长度（tick）。原作 `0x421E1B(obj,4)` 播 anim 4，共 10 帧、每帧停留 3 tick
 * ⇒ **30 tick**；行动间隔 40 tick ⇒ 动作占周期 **75%**（`project/173` Q4，`[确认]`）。
 * （旧实现按 1/4 = 10 tick 算，动画又短又晚。）
 */
const SWING_TICKS = 30;

/** 出手动作占多少 tick（动作长度，不是"什么时候开始挥"） */
function swingWindowOf(_u: Unit): number {
  return SWING_TICKS;
}

/**
 * 出手动作的**年龄**（tick）；没在出手返回 `null`。
 *
 * **R173 修正（用户反馈「武将没接触到敌方就在和敌方战斗」）**：旧实现拿 `u.cd` 落在行动
 * 间隔最后 1/4 当"正在挥砍"。但 `cd` 只是行动计时器 —— 单位**走路**时它照样在倒数，
 * 于是行军中的主将每隔 40 tick 就空挥一次。原作里出手动作只在「能打就不走」那一支
 * （`0x43BD64` 返回 0）才播，core 也只在那一支写 `lastAttackTick`（`battle.ts` 的
 * `u.lastAttackTick = world.tick`）。所以这里改成读真事件：**打过才播**。
 */
function attackAgeOf(world: World, u: Unit): number | null {
  const t0 = (u as unknown as { lastAttackTick?: number }).lastAttackTick;
  if (typeof t0 !== 'number' || !Number.isFinite(t0)) return null;
  const d = (world.tick ?? 0) - t0;
  return d >= 0 && d <= swingWindowOf(u) ? d : null;
}
/** 主将尸体的可见 tick 数（原作没给；本作按墙钟取 0.8 秒 = 48 tick @60Hz，旧值 24 @30Hz） */
const DEATH_TICKS = 48;

function lastHit(u: Unit): number | null {
  const v = (u as unknown as { lastHitTick?: number }).lastHitTick;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 主将是否还在死亡动画窗口内（`drawActors` 用它放行尸体） */
export function generalDying(world: World, u: Unit): boolean {
  if (u.alive || !generalAtlasReady()) return false;
  const t0 = lastHit(u);
  if (t0 === null) return false;
  const d = (world.tick ?? 0) - t0;
  return d >= 0 && d < DEATH_TICKS;
}

/**
 * 算出这一 tick 主将的 1–3 层 sprite。返回 `null` 表示"本模块画不了"
 * （图集没就绪 / 没有这个造型 / 页面图还没解码），调用方必须退回矢量小人。
 *
 * `ax, ay` = 脚底地面点（屏幕坐标）；调用方传士兵同一条地面线。
 */
export function generalLayers(world: World, u: Unit, ax: number, ay: number, scale = 1): GeneralLayer[] | null {
  const a = atlas;
  if (!a) return null;

  const gs = world.sides?.[u.side]?.general;
  if (!gs) return null;
  const row = rowOf(world, gs.name || '');
  const shape = shapeSymbol(row?.TYPE);
  const sideLetter = u.side === 'A' ? 'L' : 'R';
  const w = WEAPON_OF[row?.Weapon ?? ''] ?? WEAPON_OF['直劍'];
  const horseSeq = HORSE_OF[row?.Horse ?? ''] ?? 900;

  // 动作：死亡 → Death / 真出手窗口 → Attack / 在移动 → Walk / 否则 Wait
  const moving = u.x !== u.prevX || u.y !== u.prevY;
  const dead = !u.alive;
  const atkAge = dead ? null : attackAgeOf(world, u);
  const attack = atkAge !== null;
  const act = dead ? 'Death' : attack ? 'Attack' : moving ? 'Walk' : 'Wait';

  const withSlot = act === 'Wait' || act === 'Attack';
  const bodyKey = withSlot ? `${sideLetter}${shape}:${act}:${w.slot}` : `${sideLetter}${shape}:${act}`;
  const names = a.groups[bodyKey];
  if (!names || names.length === 0) return null;

  // 动作内相对 tick（见 frameIndexAt 的注释）
  const hitAt = lastHit(u);
  const t = dead
    ? (hitAt === null ? 0 : Math.max(0, (world.tick ?? 0) - hitAt))
    : attack
      ? (atkAge ?? 0)
      : (world.tick ?? 0);
  const bi = frameIndexAt(a, bodyKey, t);

  const out: GeneralLayer[] = [];

  const push = (key: string | null | undefined, idx = 0): boolean => {
    if (!key) return false;
    const seq = a.groups[key];
    if (!seq || seq.length === 0) return false;
    const f = a.frames[seq[Math.max(0, Math.min(idx, seq.length - 1))]];
    if (!f) return false;
    const im = a.pages.get(f.page);
    if (!im || !im.complete || im.naturalWidth === 0) return false;
    out.push({
      img: im,
      sx: f.x,
      sy: f.y,
      sw: f.w,
      sh: f.h,
      // 反解：让左上角落在 (ax - ox, ay - oy)，即图集锚点 = 脚底地面点
      x: ax + (f.w * scale) / 2 - f.ox * scale,
      y: ay + f.h * scale - f.oy * scale,
      w: f.w * scale,
      h: f.h * scale,
    });
    return true;
  };

  if (dead) {
    // 阵亡：只有落地的身体（Death 帧的 oy 已经贴地），不画马、不画兵器
    if (!push(bodyKey, bi)) return null;
    return out;
  }

  // 坐骑 → 身体 → 武器（顺序不能反：武器要压在身体上）
  const horseAct = act === 'Walk' ? 'Walk' : act === 'Attack' ? 'Attack' : 'Wait';
  push(`H${horseSeq}:${horseAct}`, 0);
  if (!push(bodyKey, bi)) return null;
  // 武器只有 Wait / Attack 两套：走路 / 受击时借 Wait 第 1 帧（project/48 §7.3）
  push(`W${w.seq}:${attack ? 'Attack' : 'Wait'}`, attack ? bi : 0);
  return out;
}
