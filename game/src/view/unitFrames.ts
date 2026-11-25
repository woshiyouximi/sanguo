/// <reference lib="dom" />
/**
 * 兵种动作图集（`game/web/anim/units.json` + `units_00.png`）的「选哪一套帧」纯函数。
 *
 * 与 `animSelect.ts`（`actions.json` 的背视攻击 / 受击 / 阵亡）分工：
 *  - `animSelect` 管「瞬间动作覆盖」（出手、挨打、阵亡那几个 tick），只对我方 A 生效；
 *  - 本文件管「基础行走循环 + 攻击循环该用哪一组的帧」，两侧都管；
 *  - 两者都拿不到帧时，`battleView.drawSoldier` 退回旧的 `atlas.json`
 *    （`walk_back` / `walk_front`），再不行退色块 —— 三层降级，任何一层缺失都
 *    **不许白屏、不许抛错**（同 project/24 的「失败就 warn 然后退」）。
 *
 * 图集是**异步加载**的（`web/main.js` 的 `loadUnits()`）：拿不到 / 图没 onload /
 * 组缺失 时这里一律返回 `null`，调用方照原路走（见 `project/16` §兵种图集接入）。
 *
 * 2026-11：图集从「AI 画的弓兵 17 帧」换成**原作 `SHAPE\FORCE` 士兵造型**，13 个兵种
 * 全部接上（`project/63_士兵造型.md`）；本文件的对外接口没变，页面代码不需要改一行。
 */
import type { Side, Unit, World } from '../core/battle.ts';

/** 图集里的一帧（与 `battleView.SpriteFrame` 同形；不 import 它，避免和 battleView 循环依赖） */
export interface UnitFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `units.json` 的 `groups.<name>`：对象形式的组（`archer` / 今后的 `ride` …） */
export interface UnitsGroup {
  /** 我方（背视）走路循环 */
  back?: string[];
  /** 敌方（正视）走路循环 */
  front?: string[];
  /** 我方攻击循环；缺省时退回 `back` */
  attack?: string[];
  /** 敌方攻击循环（正视）；缺省时退回 `attack` */
  attackEnemy?: string[];
  /** 每帧停留 tick；缺省 {@link UNIT_HOLD} */
  hold?: number;
}

/**
 * `web/main.js` 的 `loadUnits()` 产出的运行时图集（`units.json` 的运行时形态）。
 * `groups` 里既有对象组（`archer` / `ride`），也有纯帧名数组（`walk_side`）。
 */
export interface UnitsAtlas {
  /** `anim/units_00.png` */
  img: CanvasImageSource;
  /** 敌方染色版（同一布局，`source-atop` 刷红）；缺省时用原图 */
  imgEnemy?: CanvasImageSource | null;
  /** sprite 名 → 图集矩形（`pages[].sprites`） */
  frames: Record<string, UnitFrameRect>;
  groups: Record<string, UnitsGroup | string[]>;
}

/** 选中后要画的东西：图源 + 走路帧名 + 攻击帧名 + 每帧停留 tick */
export interface UnitFrameSet {
  /** 已按阵营取好的图源（敌方是染色版） */
  img: CanvasImageSource;
  /** 走路循环帧名（我方 `back`、敌方 `front`） */
  frames: string[];
  /** 攻击循环帧名（我方 `attack`、敌方 `attackEnemy ?? attack`）；空数组 = 没有专门攻击帧 */
  attack: string[];
  /** 每帧停留 tick */
  hold: number;
  /**
   * 屏幕上该画多宽（设计像素）= 帧画布宽（`units.json` 的 `meta.canvas_w`，13 组都是 75）。
   *
   * 图集生成时已经按 `frame_scale_k=0.75` 从原作 100 宽窗口缩过一次（`work/soldier_gen/
   * build_atlas.py`），画的时候再按 66/75 缩第二次就是纯多做一道重采样：`battleView` 现在
   * 按这个宽度 1:1 落屏（project/189）。取不到矩形 / 脏数据 → 0，调用方退回旧口径 66。
   */
  w: number;
}

export interface UnitPickOptions {
  /** `units.json` 图集；没有 / 没加载完就是 `null` → 本函数一律返回 `null` */
  units?: UnitsAtlas | null;
}

/** 弓兵组的组名（`units.json` 的 `groups.archer`，原作 `FORCE` 的 `F` 造型） */
export const ARCHER_GROUP = 'archer';
/**
 * 组缺 `hold` 时的每帧停留 tick（旧弓兵组 `archer.hold` = 5 的口径）。
 *
 * R192：这是**动画帧序**（甲类字面值），不随 `TICK_HZ` 缩放 —— 60 Hz 下 5 tick ≈ 12fps
 * 的走路帧，与原件 66–79 Hz 的观感同量级。按秒换算会让走路滑步。
 */
export const UNIT_HOLD = 5;

/**
 * 兵种号 → 兵种图集组名。**13 个兵种全部接原作 `SHAPE\FORCE` 造型**（project/63）：
 * `data/troops.json` 的 `names` 下标 0–12 依次对应原作兵符字母 A/C/D/F/I/H/J/K/E/L/M/B/G，
 * 组名 = `units.json` 的 `groups.<name>`，每个兵种一套走/攻帧。
 *
 * 弓（3）与弩（11）**不再共用一组**：原作 `F`（弓箭兵）和 `B`（弩兵）是两套不同造型
 * （project/63 §2 的映射表），只有组名 `archer` 沿用了旧图集的命名。
 *
 * 骑乘（`units.json` 的 `ride` 组）仍未接：骑兵在原作里没有独立兵种号，
 * 它是「兵种造型 + 马」的变体，`world.sides[side].troop` 里没有它的下标。等
 * `General.Horse`（马）接进数据后，再在这里按「兵种 + 有无马」映射到 `ride`。
 */
const GROUP_BY_TROOP: Readonly<Record<number, string>> = {
  0: 'podao', // 朴刀（原作 A）
  1: 'changqiang', // 長槍（C）
  2: 'dadao', // 大刀（D）
  3: ARCHER_GROUP, // 弓箭（F）
  4: 'lianchui', // 鍊錘（I）
  5: 'feidao', // 飛刀（H）
  6: 'wudou', // 武鬥（J）
  7: 'manzu', // 蠻族（K）
  8: 'tiechui', // 鐵鎚（E）
  9: 'tengjia', // 籐甲（L）
  10: 'huangjin', // 黃巾（M）
  11: 'nu', // 弩兵（B）
  12: 'nvbing', // 女兵（G）
};

/**
 * 给一个单位挑「这一 tick 该画哪套帧」。
 *
 * 规则（project/63 §3）：
 *  - 13 个兵种都有各自的组；我方 A 用 `back`、敌方 B 用 `front`；
 *    攻击帧 A 用 `attack`、B 用 `attackEnemy ?? attack`。
 *  - 组缺失 / 帧名不在页里 → 过滤；连走路帧都空了 → `null`，调用方继续用
 *    `atlas.json` 的 walk_back / walk_front，再不行退色块（三层降级不变）。
 *
 * 只读 `world` 的兵种号与 `unit.side`，不改任何字段；任何输入缺失都返回 `null`。
 * `walk_side`（侧向移动）素材已备但**这一轮不接**：还没有「侧向移动」的判定。
 */
export function pickUnitFrames(
  world: World | null | undefined,
  unit: Unit | null | undefined,
  opts: UnitPickOptions = {},
): UnitFrameSet | null {
  const atlas = opts.units;
  if (!atlas || !atlas.img) return null;
  const side = sideOf(unit);
  if (!side) return null;
  const troop = troopOf(world, unit, side);
  if (troop === null) return null;
  const groupName = GROUP_BY_TROOP[troop];
  if (!groupName) return null;
  const group = groupOf(atlas, groupName);
  if (!group) return null;

  // 组缺失 / 帧名不在页里 → 过滤；过滤完连走路帧都没有就只能降级，交给 atlas.json
  const frames = resolveNames(atlas, side === 'A' ? group.back : group.front);
  if (frames.length === 0) return null;
  const attack = resolveNames(atlas, side === 'A' ? group.attack : (group.attackEnemy ?? group.attack));
  return {
    img: side === 'A' ? atlas.img : (atlas.imgEnemy ?? atlas.img),
    frames,
    attack,
    hold: positiveInt(group.hold) ?? UNIT_HOLD,
    w: canvasWidthOf(atlas, frames[0]),
  };
}

function sideOf(unit: Unit | null | undefined): Side | null {
  const s = (unit as { side?: unknown } | null | undefined)?.side;
  return s === 'A' || s === 'B' ? s : null;
}

/**
 * 取单位的兵种号。`core` 的 `Unit` 目前**不带**兵种号（兵种是每侧的
 * `world.sides[side].troop`），所以先看单位自己有没有（留给「骑兵按单位带兵种」
 * 这种改法），没有再退回本侧兵种。缺字段 / 非法值一律 `null`。
 */
function troopOf(
  world: World | null | undefined,
  unit: Unit | null | undefined,
  side: Side,
): number | null {
  const own = (unit as { troop?: unknown } | null | undefined)?.troop;
  if (isTroopIndex(own)) return own;
  const sideTroop = world?.sides?.[side]?.troop;
  return isTroopIndex(sideTroop) ? sideTroop : null;
}

function isTroopIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function groupOf(atlas: UnitsAtlas, name: string): UnitsGroup | null {
  const g = atlas.groups?.[name];
  // `walk_side` 这种纯帧名数组不是「选套」组（侧向朝向还没接），当缺组处理
  if (!g || Array.isArray(g)) return null;
  return g;
}

/**
 * 只留「图集里真有矩形」的帧名：缺帧就当没有，绝不让 drawImage 拿到 NaN。
 * 顺序保持 `units.json` 里的顺序（走路相位靠数组下标，顺序变了会跳帧）。
 */
function resolveNames(atlas: UnitsAtlas, list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const name of list) {
    if (typeof name !== 'string' || name.length === 0) continue;
    const f = atlas.frames?.[name];
    if (!f || !positiveInt(f.w) || !positiveInt(f.h)) continue;
    out.push(name);
  }
  return out;
}

function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/**
 * 帧画布宽（设计像素）：`units.json` 的 13 组每帧都是 `meta.canvas_w`（= 100 × 0.75 = 75），
 * `battleView.pushSpriteFrames` 按它 1:1 落屏，不再二次缩放（project/189）。
 * 注意走的是**第一帧**的矩形 —— `soldiers.test.ts` 钉了「同一组所有帧画布宽相同」，
 * 宽不一致会先在那里红，这里取谁都一样。取不到 → 0（调用方退回旧口径 66）。
 */
function canvasWidthOf(atlas: UnitsAtlas, name: string | undefined): number {
  const rect = name === undefined ? undefined : atlas.frames?.[name];
  return positiveInt(rect?.w) ?? 0;
}
