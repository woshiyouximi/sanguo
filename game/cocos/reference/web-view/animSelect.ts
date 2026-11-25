/// <reference lib="dom" />
/**
 * `animSelect.ts` —— 单位动作帧选帧（纯函数 + 动作图集自加载）。
 *
 * 现有 `battleView.drawSoldier()` 只会选「走路 / 攻击」两套正视+背视序列，本文件
 * 把另外三套背视素材（`attack_back` / `hit_back` / `death_back`）接进同一套
 * `SpriteCmd` 绘制管线。设计约束（依据：project/12_单位动作接入.md §1）：
 *
 * - **不改 battleView / main.js**：图集自己 `fetch` + `Image` 加载，挂在本模块的
 *   可变单例 `actionAtlas` 上；`pickActionFrame()` 是纯函数，可单测。
 * - **字段容错**：`Unit` 目前没有 `lastAttackTick` / `lastHitTick`（合并时才加），
 *   所以每次读都先 `in` 判断、再取 number，缺字段时退化为「没有动作」。
 * - **优先级**：阵亡 > 受击 > 攻击。士兵挨打即死，受击窗口与死亡窗口重叠，
 *   死亡必须优先，否则尸体会站着挥刀。
 *
 * 帧映射：把动作窗口 `[0, ticks)` 均匀铺到整套帧上，窗口最后一 tick 落末帧
 * （`idx = floor(t * (n-1) / (ticks-1))`）。所以 attack 17 帧 / 10 tick、hit 10 帧 /
 * 8 tick、death 17 帧 / 12 tick 都会「完整播完」，不会卡在中段。
 *
 * 依据：project/11_客户端工程与视图层.md §12.4（序列帧管线）、§12.5（图集异步加载坑）；
 * 窗口长度与优先级为（新设计）。
 */
import type { Side, Unit, World } from '../core/battle.ts';

/** 图集帧矩形（atlas.json 的 x/y/w/h，不是 DOM Rect 的 left/top/right/bottom）。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 动作图集：`img` 未加载完时为 null；`frames` 以动作名为 key（`attack_back`…），
 * 每个 key 是一套按播放顺序排好的帧。
 */
export type ActionAtlas = {
  img: HTMLImageElement | null;
  frames: Record<string, Rect[]>;
};

/** `pickActionFrame()` 的返回值：动作名 + 该动作内的帧序号。 */
export interface ActionPick {
  key: string;
  index: number;
}

/** 三套背视动作的 key，同时也是 actions.json 里 sprite 名的前缀。 */
export const ACTION_KEYS = ['attack_back', 'hit_back', 'death_back'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/**
 * 哪些阵营用这套背视动作帧。素材只有背视（依据：project/PROJECT_BRIEF.md 的
 * 「我方差背视、敌方正视」），所以默认只接我方 A；敌方继续用 walk_front /
 * attack_front。等正视动作帧（actions_front）做好后，把 'B' 加进来，
 * battleView 里旧的攻击分支会通过 `usesActionFrames()` 自动让位。
 */
export const ACTION_SIDES: readonly Side[] = ['A'];

/** 攻击窗口：出手后 0..9 tick（10 tick @30Hz ≈ 0.33s，17 帧 ≈ 51fps，偏快但刀刀见血）。 */
export const ATTACK_TICKS = 10;
/** 受击窗口：挨打后 0..7 tick。 */
export const HIT_TICKS = 8;
/** 死亡窗口：阵亡后 0..11 tick；窗口结束即不再绘制（尸体消失，同旧行为）。 */
export const DEATH_TICKS = 12;

/** 图集文件名固定，由 work 打包脚本从 pack_atlas.py 的 atlas_00.png 改名而来。 */
export const ACTION_JSON_URL = 'anim/actions.json';
export const ACTION_IMG_URL = 'anim/actions_00.png';

/** 绘制宽度，与 battleView 现有序列帧的 66px 保持一致。 */
export const ACTION_DRAW_W = 66;
/** sprite 锚点：battleView 口径是「脚底 y + 26」（80×104 帧、脚底线 y=100）。 */
export const ACTION_FOOT_Y = 26;

/** 可变单例：battleView 直接 import 这个对象即可，不用改 main.js 的 ViewOptions。 */
export const actionAtlas: ActionAtlas = { img: null, frames: {} };

let pending: Promise<ActionAtlas> | null = null;

/**
 * 加载 `anim/actions.json` + `anim/actions_00.png`，成功后写进 `actionAtlas`。
 * 重复调用共享同一个 Promise；失败会清空 `pending` 以便下次重试。
 */
export function loadActionAtlas(
  jsonUrl: string = ACTION_JSON_URL,
  imgUrl: string = ACTION_IMG_URL,
): Promise<ActionAtlas> {
  if (pending) return pending;
  pending = (async (): Promise<ActionAtlas> => {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`[animSelect] ${jsonUrl} HTTP ${res.status}`);
    const meta: unknown = await res.json();
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`[animSelect] 图片加载失败：${imgUrl}`));
      img.src = imgUrl;
    });
    actionAtlas.frames = collectFrames(meta);
    actionAtlas.img = img;
    return actionAtlas;
  })().catch((err: unknown) => {
    pending = null;
    throw err;
  });
  return pending;
}

/** 手动确保图集在加载（幂等）；返回单例，方便调用方立即使用。 */
export function ensureActionAtlas(): ActionAtlas {
  autoLoad();
  return actionAtlas;
}

/** 浏览器里模块加载即预热；Node（无 document/Image）静默跳过，单测不受影响。 */
function autoLoad(): void {
  if (pending) return;
  if (typeof document === 'undefined') return;
  if (typeof Image !== 'function' || typeof fetch !== 'function') return;
  void loadActionAtlas().catch((err: unknown) => {
    console.warn('[animSelect] actions 图集不可用，回退走路帧：', err);
  });
}

/** 把 actions.json 的 `pages[].sprites[]` 拆成 key → 有序帧表（不信任分页顺序）。 */
function collectFrames(meta: unknown): Record<string, Rect[]> {
  const frames: Record<string, Rect[]> = {};
  const pages = (meta as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(pages)) return frames;
  for (const page of pages) {
    const sprites = (page as { sprites?: unknown } | null)?.sprites;
    if (!Array.isArray(sprites)) continue;
    for (const raw of sprites) {
      const s = raw as { name?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown };
      const name = s.name;
      if (typeof name !== 'string') continue;
      if (typeof s.x !== 'number' || typeof s.y !== 'number') continue;
      if (typeof s.w !== 'number' || typeof s.h !== 'number') continue;
      const key = ACTION_KEYS.find((k) => name.startsWith(`${k}_`));
      if (!key) continue;
      const seq = frames[key] ?? (frames[key] = []);
      seq.push({ x: s.x, y: s.y, w: s.w, h: s.h });
    }
  }
  // 单页内按行优先排过，双保险：再按 y/x 排一次，避免跨页/乱序。
  for (const key of ACTION_KEYS) frames[key]?.sort((a, b) => a.y - b.y || a.x - b.x);
  return frames;
}

/** 容错读数字段：字段不存在 / 类型不对 / NaN 一律当「没有」。 */
function numField(obj: unknown, key: string): number | null {
  if (typeof obj !== 'object' || obj === null) return null;
  if (!(key in obj)) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 该单位当前是否由本模块接管动作帧。battleView 用它关掉旧的 `u.cd > 96` 攻击分支，
 * 否则我方会先播 10 tick 背视挥刀、再跳回 14 tick 的正视挥刀（attack_front）——
 * 朝向会闪一下。图集没加载好时返回 false，旧逻辑照常工作。
 */
export function usesActionFrames(u: Unit): boolean {
  if (!u || actionAtlas.img === null) return false;
  return ACTION_SIDES.includes(u.side);
}

/** 该单位是否仍在死亡动画窗口内（battleView.drawActors 用来放行尸体 12 tick）。 */
export function isDying(u: Unit, world: World): boolean {
  if (!u || (u as unknown as { alive?: boolean }).alive !== false) return false;
  if (!ACTION_SIDES.includes(u.side)) return false;
  // 主将不走 drawSoldier（没有 death_back 素材），保持旧行为：阵亡立即从演员表剔除。
  if ((u as unknown as { isGeneral?: boolean }).isGeneral === true) return false;
  const hitAt = numField(u, 'lastHitTick');
  if (hitAt === null) return false;
  const t = (numField(world, 'tick') ?? 0) - hitAt;
  return t >= 0 && t < DEATH_TICKS;
}

/**
 * 选帧。返回 null 表示「没有动作要播，调用方沿用走路序列」。
 *
 * - `!alive` 且 `lastHitTick` 在 0..11 tick 内 → `death_back`（士兵挨打即死，
 *   `lastHitTick` 就是阵亡 tick）；窗口外返回 null，调用方应跳过不画。
 * - 活着且 `lastHitTick` 在 0..7 tick 内 → `hit_back`。
 * - `attackAnimT` 在 0..9 内，或 `tick - lastAttackTick` 在 0..9 内 → `attack_back`。
 * - 其余 → null。
 *
 * 字段全部可能缺失（`Unit` 现在还没有这两个 tick 字段），缺失即视为无动作。
 */
export function pickActionFrame(u: Unit, world: World, atlas: ActionAtlas): ActionPick | null {
  if (!u || !world || !atlas) return null;
  if (!ACTION_SIDES.includes(u.side)) return null;
  const frames = atlas.frames ?? {};
  const tick = numField(world, 'tick') ?? 0;
  const alive = (u as unknown as { alive?: boolean }).alive !== false;
  const hitAt = numField(u, 'lastHitTick');
  const attackAt = numField(u, 'lastAttackTick');
  const animT = numField(u, 'attackAnimT');

  // 1) 阵亡优先：死人不该再播受击/攻击。
  if (!alive) {
    if (hitAt === null) return null;
    const t = tick - hitAt;
    if (t < 0 || t >= DEATH_TICKS) return null;
    return pickFrame(frames, 'death_back', t, DEATH_TICKS);
  }

  // 2) 受击：活着但刚挨打（目前只有主将会出现；主将另走 drawGeneral，保留给后续接入）。
  if (hitAt !== null) {
    const t = tick - hitAt;
    if (t >= 0 && t < HIT_TICKS) {
      const hit = pickFrame(frames, 'hit_back', t, HIT_TICKS);
      if (hit) return hit;
    }
  }

  // 3) 攻击：优先用逻辑层直接推的 attackAnimT，否则用 tick - lastAttackTick 推。
  const t = animT !== null ? animT : attackAt !== null ? tick - attackAt : null;
  if (t !== null && t >= 0 && t < ATTACK_TICKS) {
    return pickFrame(frames, 'attack_back', t, ATTACK_TICKS);
  }
  return null;
}

/** 窗口内帧序号：把 `[0, ticks)` 均匀铺满 `n` 帧，末 tick 一定落末帧。 */
function pickFrame(
  frames: Record<string, Rect[]>,
  key: ActionKey,
  t: number,
  ticks: number,
): ActionPick | null {
  const seq = frames[key];
  if (!seq || seq.length === 0) return null;
  const span = Math.max(1, ticks - 1);
  const n = seq.length;
  const index = Math.min(n - 1, Math.max(0, Math.floor((t * (n - 1)) / span)));
  return { key, index };
}

/** 与 battleView 的 `SpriteCmd` 结构兼容（kind/img/sx/sy/sw/sh/x/y/w/h）。 */
export interface ActionSpriteCmd {
  kind: 'sprite';
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 把一帧动作包成绘制指令；图集未加载 / 帧缺失时返回 null。 */
export function actionSpriteCmd(
  act: ActionPick | null,
  x: number,
  y: number,
  atlas: ActionAtlas = actionAtlas,
): ActionSpriteCmd | null {
  const img = atlas?.img;
  if (!act || !img) return null;
  const seq = atlas.frames?.[act.key];
  const f = seq?.[act.index];
  if (!f || !f.w || !f.h) return null;
  const w = ACTION_DRAW_W;
  return {
    kind: 'sprite',
    img,
    sx: f.x,
    sy: f.y,
    sw: f.w,
    sh: f.h,
    x,
    y: y + ACTION_FOOT_Y,
    w,
    h: (f.h / f.w) * w,
  };
}

/**
 * 画一帧动作：成功 push 返回 true，调用方 `return` 即可；返回 false 表示
 * 「没有动作帧」或图集没加载好，调用方继续走原来的走路/色块逻辑。
 * 这样 battleView 里只需要 3 行。
 */
export function pushActionSprite(
  out: { push(cmd: ActionSpriteCmd): void },
  act: ActionPick | null,
  x: number,
  y: number,
): boolean {
  const cmd = actionSpriteCmd(act, x, y);
  if (!cmd) return false;
  out.push(cmd);
  return true;
}
