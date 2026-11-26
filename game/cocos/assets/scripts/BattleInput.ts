/**
 * 战场操作薄层：**技能格选中 → 選目标 → 施放**、**突擊**、**撤退** 的纯逻辑状态机。
 *
 * 为什么单独一层：
 * - `BattleRoot.ts` 是 `Component`（挂 `cc`），逻辑写进去就没法在 Node 里单测；
 * - 这里只 import `./view/layout`（纯数学校验）和 `./core/battle`（内核导出），
 *   **绝不 import `cc`**，所以 `work/cocos_binput/input_assert.mjs` 能直接编译本文件跑断言。
 *
 * 行为基准是 web 版（`game/web/main.js` 的 `onPointerDown`/`pickSkill`/`doCast` 与
 * `game/src/view/battleView.ts` 的 `castBlockReason`/`skillRadius`/`hitTest`）——
 * 内核同一套（`cast`/`requestRetreat`/`qiCostOf`），交互也照抄，只有"触摸没有右键/Esc"
 * 这一处文案改写成"再點技能格取消"。
 *
 * 硬约束：本文件**不新增任何战斗公式**，气力/技力/命中/伤害一律由内核算。
 */

import {
  DESIGN_H,
  FIELD,
  GRID_H,
  GRID_W,
  MESSAGE_BOX,
  SKILL_SLOT_GAP,
  SKILL_SLOT_W,
  SKILL_SLOT_X0,
  contains,
  project as projectCell,
  skillSlotRect,
  worldAt,
} from './view/layout';
import type { Rect } from './view/layout';
import {
  CHIP_ASSAULT,
  CHIP_RETREAT,
  armyMenuItems,
  armyMenuRect,
  armyRowAt,
  cmd6Controls,
  cmd6Defs,
  cmd6IndexAt,
  cmd6Usable,
  lordOrderKind,
} from './BattleCmdUi';
import type { Cmd6Kind } from './BattleCmdUi';
import { ARMY_RECTS, consoleHit, globalRects, skillCellRects } from './BattleConsoleUi';
import { applyArmyCmd, applyArmyCmdKind } from './core/army_cmd';
import type { ArmyCmdKind } from './core/army_cmd';
import {
  allRush,
  cast,
  defaultAim,
  fxTtlOf,
  isRushing,
  magicBySeq,
  qiCostOf,
  requestRetreat,
  skillKindOf,
} from './core/battle';
import type { World } from './core/battle';
// AllRush 的"宿主通道"（web main.js:806 同款）：按原作 22 条指令顺序演出，
// 没接线/抛异常时退回内核 allRush()。纯 TS，不碰 cc，所以本文件仍可在 Node 里单测。
import { createBattleSysoHost } from './core/smartscript/runtime';
import type { GameData } from './types';

/* ------------------------------------------------------------------ *
 * 常量（与 web 逐字对齐的文案集中在这里，报告里直接引行号）
 * ------------------------------------------------------------------ */

/**
 * 技能栏上限 = 8 格（原作武将资料 `general+0x54` 是 `byte[8]`，**不是 UI 取舍**）。
 *
 * 与 web `battleView.ts:316` 同一口径：技能格按「该将到该等级已习得」生成，
 * 不足 8 条就只画实际条数，不补空格。`SKILL_SEQ` 只是数据缺失时的兜底。
 */
export const MAX_SKILL_SLOTS = 8;

/** 兼容旧名（断言脚本/旧报告里还引 `SKILL_SLOTS`）：现在等于 `MAX_SKILL_SLOTS`。 */
export const SKILL_SLOTS = MAX_SKILL_SLOTS;

/**
 * 兜底技序：与 web `battleView.ts:306` 的 `DEFAULT_SKILL_SEQ` **同一份**。
 * 只在「数据里查不到这个将 / 没有 SKILL 表」时用；正常一局走 `learnedSkillSeqs()`。
 */
export const SKILL_SEQ: readonly number[] = [1, 50, 2, 104];

/** 8 格版式：4 列 × 2 行，行高 56（与 web `battleView.ts:323-325` 同值） */
export const SKILL_GRID_ROW2_Y = 1100;
export const SKILL_GRID_ROW_H = 56;
export const SKILL_GRID_ROW_GAP = 6;

/** 突擊成功 / 已在突擊中（web main.js:800/814 逐字） */
export const MSG_RUSH_OK = '全軍突擊！';
export const MSG_RUSHING = '全軍已在突擊中。';

/** 未选技就点战场（web main.js:1168 的原句在 R139 后已改口径，见下） */
export const MSG_PICK_FIRST = '先點下方技能格，再點戰場選目標。';
/**
 * 点战场时**没在瞄准**的提示（R139/R88 之后的主路径）。
 *
 * 原作引擎自己解析目标（`project/139`），所以"点技能格即放、不用选目标"才是正确体验；
 * 老文案 `先點下方技能格，再點戰場選目標` 只在调试瞄准相里还成立。
 */
export const MSG_NO_AIM_NEEDED = '點技能格即可施放，不用選目標。';
/** 选中技后点战场（Cocos 无右键，改为再点技能格取消） */
export const MSG_AIM = '點戰場選目標（再點技能格取消）。';
/** 再点同一格取消瞄准（web main.js:1102） */
export const MSG_CANCEL_AIM = '已取消瞄準。';
/** 撤退成功（web main.js:1177） */
export const MSG_RETREAT_OK = '全軍撤退。';
/** 撤退失败（web main.js:1186） */
export const MSG_RETREAT_FAIL = '撤退失敗。';
/** 战斗已结束（web main.js:961） */
export const MSG_OVER = '戰鬥已結束。';
/** 撤退标记：内核 `requestRetreat()` **不写 world.log**，HUD 消息栏不会自己长出来，得视图自己画 */
export const BANNER_RETREAT = '全軍撤退';

/** 第一层/第二层下令成功的尾巴（web main.js `cmd6Act`/`armyCmd` 分支同款句式） */
export const MSG_ORDERED = '已下令。';
/** 第二层展开后点面板空白：只是把菜单留在原地 */
export const MSG_MENU_HINT = '部隊指令：點一行下達。';
/** 第二层收起（点面板外 / 再点一次 S） */
export const MSG_MENU_CLOSED = '已收起部隊指令。';
/** D 颗只是切焦点，真正施放在技能格 */
export const MSG_SKILL_PAGE = '武將技：點下方技能格施放。';
/** 结构上没有这一槽（阵形表异常）时的兜底 */
export const MSG_NO_ORDER = '當前狀態不可下令。';

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** web `battleView.ts:184-190` 的同形结构，多带两个"施放要用的内核参数" */
export interface SkillSlot {
  seq: number;
  name: string;
  /** 技力消耗（`MAGIC.MP`） */
  mp: number;
  /** 气力消耗（`qiCostOf()`，**不乘** `qiCostMul` ——与 web `makeSkillBar` 一致） */
  qi: number;
  kind: 'heal' | 'strike' | 'aoe' | null;
  /** `MAGIC.fx_dir_primary`：Cocos 的 `AudioHost.playMagic()` 按**目录号**查表（web 按 seq） */
  dir: string;
  /** `fxTtlOf()`：`cast()` 的第六参（web `doCast` 逐字相同） */
  ttl: number;
}

/** web `battleView.ts:315` */
export type CastReason = 'over' | 'dead' | 'mp' | 'qi';

/** 飘字色调（颜色由 BattleRoot 映射到 `COLORS`） */
export type FloatTone = 'heal' | 'hit' | 'miss';

/** 一条飘字（web `battleView.ts:192-198` 的 Floater 的"逻辑部分"，ttl 交给视图） */
export interface Floater {
  x: number;
  y: number;
  text: string;
  tone: FloatTone;
}

/**
 * 一次操作对视图层的副作用：视图只会"放音 / 出飘字"，不会反过来改 world。
 * （气力下降、fx 入队、hit 记账全是 `cast()` 干的。）
 */
export type BattleEffect =
  | { kind: 'magic'; dir: string }
  | { kind: 'floater'; floater: Floater };

/** web `battleView.ts:1539-1545` 的 Hit，字段一一对应 */
export type BattleHit =
  | { type: 'restart' }
  | { type: 'skill'; index: number; seq: number; canCast: boolean; reason: CastReason | null }
  | { type: 'assault' }
  | { type: 'retreat' }
  | { type: 'cmd6'; btn: number; kind: Cmd6Kind; label: string; canUse: boolean; reason: string | null }
  | { type: 'armyMenu'; row: number }
  | {
      type: 'armyCmd';
      slot: number;
      label: string;
      kind: ArmyCmdKind;
      canUse: boolean;
      reason: string | null;
    }
  | { type: 'field'; gx: number; gy: number; worldX: number; worldY: number };

/** 当前处于哪一相（`settled` 只在 `BattleRoot.update()` 里 `settle()` 之后设置） */
export type BattleMode = 'idle' | 'fighting' | 'settled';

/** `hitTest()` 的上下文（BattleRoot 每帧都持有这些字段） */
export interface HitContext {
  world: World | null;
  slots: readonly SkillSlot[];
  mode: BattleMode;
  camX: number;
  /** 第二层菜单是否展开（web 里是模块变量 `armyMenuOpened`，这里由 `BattleInput` 注入） */
  menuOpen?: boolean;
}

/** `hitTest()` 的副作用出口：菜单开合是命中测试的一部分（web 也是这么写的） */
export interface HitOptions {
  /** 开合第二层（`true`=展开）；不传则只返回命中结果、不改状态（断言用） */
  onMenuOpen?: (open: boolean) => void;
}

/* ------------------------------------------------------------------ *
 * 技能格数据
 * ------------------------------------------------------------------ */

/**
 * 技能格 → 数据（web `makeSkillBar` 的移植）。
 *
 * 与 web 的唯一差别：这里多取 `fx_dir_primary` / `fxTtlOf`，因为 Cocos 侧放技能音
 * 走的是 `AudioHost.playMagic(dir)`（按目录号查 31 条表），不像 web 的 `skillSfx(seq)`。
 */
export function makeSkillBar(data: GameData, seqs: readonly number[] = SKILL_SEQ): SkillSlot[] {
  const out: SkillSlot[] = [];
  for (const seq of seqs.slice(0, MAX_SKILL_SLOTS)) {
    const m = magicBySeq(data, seq);
    out.push({
      seq,
      name: m?.NAME ?? `技能${seq}`,
      mp: m?.MP ?? 0,
      qi: qiCostOf(data, seq),
      kind: skillKindOf(data, seq),
      dir: m?.fx_dir_primary ?? '',
      ttl: fxTtlOf(data, seq),
    });
  }
  return out;
}

/**
 * 技能格矩形：**绘制、命中区、金框共用这一个函数**（web `battleView.ts:336` 逐行移植）。
 *
 * - `count <= 4`：沿用 `layout.skillSlotRect(i)`（单行 88×88，老版式一格不动）；
 * - `5..8`：4 列 × 2 行，88×56，第一行 y=1100、第二行 y=1162。
 *
 * 序号 `i` 与 `makeSkillBar()` 的数组下标一一对应；任何一处另算坐标都会造成
 * 「画第 5 格、点第 5 格命中第 6 个技」，所以 BattleHud/BattleRoot 都必须调这里。
 */
export function skillSlotRects(count: number): Rect[] {
  const raw = Number.isFinite(count) ? Math.floor(count) : 0;
  const n = Math.max(0, Math.min(MAX_SKILL_SLOTS, raw));
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    if (n <= 4) {
      rects.push(skillSlotRect(i));
      continue;
    }
    rects.push({
      x: SKILL_SLOT_X0 + (i % 4) * (SKILL_SLOT_W + SKILL_SLOT_GAP),
      y: SKILL_GRID_ROW2_Y + Math.floor(i / 4) * (SKILL_GRID_ROW_H + SKILL_GRID_ROW_GAP),
      w: SKILL_SLOT_W,
      h: SKILL_GRID_ROW_H,
    });
  }
  return rects;
}

/**
 * 该武将「到 `level` 为止已习得」的武将技 seq（web `battleView.ts:437` 逐行移植）。
 *
 * 数据层把 `SKILL` 声明成 `[number, number][]`，实际 JSON 却是 `["1, 49", "7, 56"]`
 * 这种字符串（`game/data/generals.json`），两种都要吃。查不到将/表就退回 `SKILL_SEQ`。
 * 只留最新 `max` 条：等级越高，技位越满（与 web 一致）。
 */
export function learnedSkillSeqs(
  data: GameData,
  name: string | undefined,
  level = 1,
  max = MAX_SKILL_SLOTS,
): number[] {
  const fallback = SKILL_SEQ.slice(0, max);
  if (!name) return fallback;
  const row = data.generals.find((g) => g.NAME === name);
  const rawAny = row?.SKILL as unknown;
  if (rawAny === undefined || rawAny === null) return fallback;
  // 四种落盘形状都吃：["1, 50", ...]（规范）、"40, 110"（旧内置包只留最后一对）、
  // [[1, 50], ...]（二维）、[1, 50]（扁平一对，旧盗贼模板的 Skill 键）。
  const rawItems: unknown[] = Array.isArray(rawAny) ? rawAny : [rawAny];
  const flatPair = rawItems.length === 2 && rawItems.every((x) => typeof x === 'number');
  const items: unknown[] = flatPair ? [rawItems] : rawItems;
  if (items.length === 0) return fallback;
  const pairs: Array<[number, number]> = [];
  for (const item of items) {
    let nums: number[];
    if (typeof item === 'string') nums = item.split(',').map((x) => Number(x.trim()));
    else if (Array.isArray(item)) nums = item.map((x) => Number(x));
    else continue;
    const need = Number(nums[0]);
    const seq = Number(nums[1]);
    if (Number.isFinite(need) && Number.isFinite(seq)) pairs.push([need, seq]);
  }
  if (pairs.length === 0) return fallback;
  const lv = Math.max(1, Math.floor(level));
  const learned = pairs.filter(([need]) => lv >= need).map(([, seq]) => seq);
  if (learned.length === 0) return pairs.slice(0, max).map(([, seq]) => seq);
  return learned.slice(-max);
}

/**
 * 这一格为什么不能放（web `castBlockReason` 逐行移植，**只有这四种**）。
 *
 * 注意 web 侧**没有**"冷却 / 未习得"两种原因，Cocos 也不加——HUD 的
 * `usable` 判据（`!over && alive && mp>=MP && qi>=qiCost*mul`）比这里多乘一个
 * `qiCostMul`，两者在带"气力消耗"军师技时会差一点点，但按钮亮 != 可放，
 * 真正的门仍是 `cast()` 自己那道 `g.qi < qi`。
 */
export function castBlockReason(world: World | null, slot: SkillSlot): CastReason | null {
  if (!world) return 'over';
  if (world.over) return 'over';
  const g = world.sides.A.general;
  if (!g.alive) return 'dead';
  if (g.mp < slot.mp) return 'mp';
  if (!Number.isFinite(slot.qi) || g.qi < slot.qi) return 'qi';
  return null;
}

/**
 * 原因 → 文案（web `main.js:959-972` 逐字）。
 *
 * 内核 `CastResult.reason` 还多 `general-dead`/`sealed`/`no-target`/`no-magic`，
 * web 同样落到 default「無法施放。」，这里保持一致的兜底行为（不额外发明文案）。
 */
export function reasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'over':
      return '戰鬥已結束。';
    case 'dead':
      return '主將已陣亡，無法施放。';
    case 'mp':
      return '技力不足。';
    case 'qi':
      return '氣力不足（每 tick 回复，等一會）。';
    default:
      return '無法施放。';
  }
}

/** 瞄准半径（格）：web `skillRadius` 逐字 */
export function skillRadius(kind: 'heal' | 'strike' | 'aoe' | null): number {
  if (kind === 'aoe') return 3.6;
  if (kind === 'strike') return 1.8;
  return 1.2;
}

/* ------------------------------------------------------------------ *
 * 坐标：屏幕（750×1334 设计坐标）↔ 战场世界坐标
 * ------------------------------------------------------------------ */

/**
 * 触摸点 → 世界坐标（`layout.worldAt` 的反向，**不做战场带门禁**）。
 *
 * R215 全图投影后不再有镜头：`camX` 只为兼容旧调用点保留，算式与 `view/layout.worldAt`
 * 必须同一份（71 行整幅映射）。
 */
export function screenToWorld(_camX: number, tx: number, ty: number): { worldX: number; worldY: number } {
  return worldAt(tx, ty);
}

/**
 * `EventTouch.getUILocation()`（设计单位、**左下**原点）→ `view/layout` 的屏幕坐标（**左上**原点）。
 *
 * Cocos 3.8 web 实测（876×1368 canvas / 750×1334 设计分辨率）：
 * 点设计点 (sx,sy) 拿到 `ux = sx`、`uy = DESIGN_H - sy`；宽屏多出来的左右黑边
 * 落在负 x 上，不需要再加 offset。这条换算以前写成 `x + 375 / 667 - y`，
 * 真机上所有点击会右移 375、纵向翻到 HUD/战场对面（点技能格落进战场）。
 * 所以单独提成纯函数，交给 `work/cocos_input/input_assert.mjs` 的 G14 锁住。
 */
export function uiToScreen(ux: number, uy: number): { sx: number; sy: number } {
  return { sx: ux, sy: DESIGN_H - uy };
}

/** 世界坐标 → 触摸点（`layout.project` 的别名，参数顺序摆正，方便往返断言） */
export function worldToScreen(camX: number, worldX: number, worldY: number): { sx: number; sy: number } {
  const p = projectCell(worldX, worldY, camX);
  return { sx: p.x, sy: p.y };
}

/**
 * 触摸点 → 格（带战场带门禁，`layout.screenToCell` 的本地版）。
 * 不用 import 那个函数只是为了把 `GRID_W/GRID_H` 的夹取写在一处，两处公式必须同式。
 */
export function screenToCell(
  camX: number,
  tx: number,
  ty: number,
): { gx: number; gy: number; worldX: number; worldY: number } | null {
  if (!contains(FIELD, tx, ty)) return null;
  const w = screenToWorld(camX, tx, ty);
  return {
    gx: clampInt(Math.round(w.worldX), 0, GRID_W - 1),
    gy: clampInt(Math.floor(w.worldY), 0, GRID_H - 1),
    worldX: w.worldX,
    worldY: w.worldY,
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ *
 * 命中测试（触摸分流）
 * ------------------------------------------------------------------ */

/**
 * 触摸点落在哪个控件上（web `battleView.hitTest` 的移植，:2068-2131 同顺序）。
 *
 * 顺序就是「谁盖住谁」：
 * ```
 *   idle → 空   settled → 结算重开（控制台控件吃掉）
 *   第二层展开：6 行 → armyCmd；面板空白 → armyMenu；面板外 → 先收起再往下判
 *   技能格 → skill
 *   第一层 6 颗 → cmd6（第 2 颗 S = 开合第二层）
 *   突擊 / 撤退 chip → assault / retreat
 *   战场 → field
 * ```
 * 注意「第二层展开时第一层第 2/3 行被盖住」是由**这个顺序**保证的，不是靠矩形裁掉——
 * web 同样如此（面板 x512..740 y1116..1332 压住 cmd6 的 y1124/y1218 两行）。
 */
export function hitTest(ctx: HitContext, tx: number, ty: number, opts?: HitOptions): BattleHit | null {
  if (ctx.mode === 'idle') return null;

  if (ctx.mode === 'settled') {
    if (isConsoleControl(tx, ty, ctx.slots.length)) return null;
    return { type: 'restart' };
  }

  // R218 底栏重排：技能格 / 常显部队 6 条 / 全局 4 颗优先（旧的 cmd6/chip 路径保留给老断言）
  const ch = consoleHit(ctx.world, tx, ty, ctx.slots.length);
  if (ch) {
    if (ch.type === 'skill') {
      const slot = ctx.slots[ch.index ?? -1];
      if (!slot) return null;
      const reason = castBlockReason(ctx.world, slot);
      return { type: 'skill', index: ch.index ?? 0, seq: slot.seq, canCast: reason === null, reason };
    }
    if (ch.type === 'armyCmd') {
      const item = armyMenuItems(ctx.world)[ch.index ?? -1];
      if (!item) return null;
      return {
        type: 'armyCmd',
        slot: item.slot,
        label: item.label,
        kind: item.kind,
        canUse: item.ok,
        reason: item.reason,
      };
    }
    const def = cmd6Defs(ctx.world).find((d) => d.kind === ch.kind);
    return {
      type: 'cmd6',
      btn: ch.index ?? -1,
      kind: ch.kind ?? 'guardLord',
      label: def?.label ?? '',
      canUse: ctx.mode === 'fighting',
      reason: null,
    };
  }

  let justClosed = false;
  if (ctx.menuOpen === true) {
    const row = armyRowAt(tx, ty);
    if (row >= 0) {
      const item = armyMenuItems(ctx.world)[row];
      if (item) {
        return {
          type: 'armyCmd',
          slot: item.slot,
          label: item.label,
          kind: item.kind,
          canUse: item.ok,
          reason: item.reason,
        };
      }
      return { type: 'armyMenu', row };
    }
    if (contains(armyMenuRect(), tx, ty)) return { type: 'armyMenu', row: -1 };
    // 面板外：先收起（web `setArmyMenuOpen(false)`），再继续往下判
    opts?.onMenuOpen?.(false);
    justClosed = true;
  }

  const rects = skillSlotRects(ctx.slots.length);
  for (let i = 0; i < rects.length; i++) {
    if (!contains(rects[i], tx, ty)) continue;
    const slot = ctx.slots[i];
    if (!slot) return null;
    const reason = castBlockReason(ctx.world, slot);
    return { type: 'skill', index: i, seq: slot.seq, canCast: reason === null, reason };
  }

  const idx = cmd6IndexAt(tx, ty);
  if (idx >= 0) {
    const def = cmd6Defs(ctx.world)[idx];
    const use = cmd6Usable(ctx.world, idx, {
      fighting: ctx.mode === 'fighting',
      skillCount: ctx.slots.length,
    });
    if (idx === 1 && !justClosed) opts?.onMenuOpen?.(ctx.menuOpen !== true);
    return {
      type: 'cmd6',
      btn: idx,
      kind: def ? def.kind : 'guardLord',
      label: def ? def.label : '',
      canUse: use.ok,
      reason: use.reason,
    };
  }

  if (contains(CHIP_ASSAULT, tx, ty)) return { type: 'assault' };
  if (contains(CHIP_RETREAT, tx, ty)) return { type: 'retreat' };

  const cell = screenToCell(ctx.camX, tx, ty);
  if (!cell) return null;
  return { type: 'field', gx: cell.gx, gy: cell.gy, worldX: cell.worldX, worldY: cell.worldY };
}

/** 消息栏（web 里是控制台底部的 log 条；点它不许触发"结算重开"） */
const CONSOLE_CHROME = [MESSAGE_BOX] as const;

/** 是否落在技能格 / 指令台 / 消息栏上 */
export function isConsoleControl(tx: number, ty: number, skillCount = SKILL_SLOTS): boolean {
  for (const r of skillCellRects(skillCount)) {
    if (contains(r, tx, ty)) return true;
  }
  for (const r of ARMY_RECTS) {
    if (contains(r, tx, ty)) return true;
  }
  for (const r of globalRects()) {
    if (contains(r, tx, ty)) return true;
  }
  for (const r of skillSlotRects(skillCount)) {
    if (contains(r, tx, ty)) return true;
  }
  for (const r of cmd6Controls()) {
    if (contains(r, tx, ty)) return true;
  }
  for (const r of CONSOLE_CHROME) {
    if (contains(r, tx, ty)) return true;
  }
  return false;
}

/** 撤退标记（`requestRetreat()` 成功、全軍還在往外走的那段显示） */
export function retreatBanner(world: World | null): string | null {
  if (!world) return null;
  return world.fled.A === true ? BANNER_RETREAT : null;
}

/* ------------------------------------------------------------------ *
 * 状态机
 * ------------------------------------------------------------------ */

/**
 * ```
 *   idle ──bind(world)──────────────────────────────▶ fighting
 *   fighting ──點技能格(可放,非heal)──▶ aiming(i)  （再點同格 → 取消）
 *   aiming(i) ──點技能格(j)──────────▶ aiming(j)
 *   aiming(i) ──點戰場───────────────▶ cast() → 成功/失败都回 fighting
 *   fighting ──點heal格(可放)────────▶ cast(主将位置) → fighting（不进入瞄准）
 *   fighting ──點突擊───────────────▶ fighting（只改 message，world 不动）
 *   fighting ──點撤退成功───────────▶ fighting（world.fled.A=true + 標記）
 *   world.over ──setSettled(true)───▶ settled ──點畫面(非控件)──▶ restart
 * ```
 */
export class BattleInput {
  private world: World | null = null;
  private bar: SkillSlot[] = [];
  private mode: BattleMode = 'idle';
  /** 第二层「部隊指令」是否展开（web `armyMenuOpened`） */
  private menu = false;

  /** 当前瞄准的技能格下标（null = 未瞄准） */
  selected: number | null = null;
  /** 当前瞄准落点（格；null = 鼠标在战场外或未瞄准） */
  aim: { gx: number; gy: number } | null = null;
  /** 最近一次提示（视图显示在战场下沿；空串 = 没话说） */
  message = '';

  /** 开新一场：技能格按「该将到该等级已习得」重算（最多 8 格，与 web 同口径） */
  bind(world: World): void {
    this.world = world;
    const gen = world.sides.A.general;
    // 玩家可释放的武将技上限 6 格（R218：8 格是内存容量，不是 UI 槽位）
    this.bar = makeSkillBar(world.data, learnedSkillSeqs(world.data, gen.name, gen.level, 6));
    this.mode = 'fighting';
    this.menu = false;
    this.selected = null;
    this.aim = null;
    this.message = '';
  }

  /** 卸载（重开前 / 载入失败） */
  clear(): void {
    this.world = null;
    this.bar = [];
    this.mode = 'idle';
    this.menu = false;
    this.selected = null;
    this.aim = null;
    this.message = '';
  }

  /** `settle()` 之后调用；结算相里技能格/按钮不再有战斗语义 */
  setSettled(settled: boolean): void {
    this.mode = settled ? 'settled' : 'fighting';
    if (settled) {
      this.menu = false;
      this.selected = null;
      this.aim = null;
    }
  }

  /** 第二层是否展开（`BattleRoot` 每帧拿它决定要不要画面板） */
  get armyMenuNow(): boolean {
    return this.menu;
  }

  /** 直接设定第二层开合（键盘/调试入口用；触摸走 `hitTest` 的副作用） */
  setArmyMenuOpen(open: boolean): void {
    this.menu = !!open;
  }

  /** 开合切换，返回新状态 */
  toggleArmyMenu(): boolean {
    this.menu = !this.menu;
    return this.menu;
  }

  get modeNow(): BattleMode {
    return this.mode;
  }

  /**
   * 对外口径的三相：`idle / aiming / fighting / settled`。
   *
   * 任务书写的 `idle / aiming / cast` 是交互相；`cast` 是 `castAt()` 的瞬时动作
   * （成功失败都立刻回 `fighting`，不驻留），所以能观测的是这三个驻留相 +
   * `settled`。`aiming` 只是 `fighting` 的子相（`selected !== null`），
   * 这样 `hitTest`/`tap` 仍按 web 的 `mode` 分流，不用两套枚举。
   */
  get phase(): 'idle' | 'aiming' | 'fighting' | 'settled' {
    if (this.mode === 'idle') return 'idle';
    if (this.mode === 'settled') return 'settled';
    return this.selected === null ? 'fighting' : 'aiming';
  }

  get worldNow(): World | null {
    return this.world;
  }

  get slots(): readonly SkillSlot[] {
    return this.bar;
  }

  get selectedSlot(): SkillSlot | null {
    if (this.selected === null) return null;
    return this.bar[this.selected] ?? null;
  }

  /** 撤退标记文案（HUD 区自绘用） */
  get banner(): string | null {
    return retreatBanner(this.world);
  }

  /** 触摸落点 → 控件（`BattleRoot` 用它决定是重开还是下令/施放） */
  hitTest(tx: number, ty: number, camX: number): BattleHit | null {
    return hitTest(
      { world: this.world, slots: this.bar, mode: this.mode, camX, menuOpen: this.menu },
      tx,
      ty,
      { onMenuOpen: (open) => this.setArmyMenuOpen(open) },
    );
  }

  /** TOUCH_END 的总入口：命中什么就干什么，返回给视图的副作用 */
  tap(tx: number, ty: number, camX: number): BattleEffect[] {
    const hit = this.hitTest(tx, ty, camX);
    if (!hit) return [];
    switch (hit.type) {
      case 'skill':
        return this.tapSkill(hit.index);
      case 'assault':
        return this.tapAssault();
      case 'retreat':
        return this.tapRetreat();
      case 'cmd6':
        return this.tapCmd6(hit.btn, hit.kind, hit.label, hit.reason);
      case 'armyCmd':
        return this.tapArmyCmd(hit.slot, hit.label, hit.reason);
      case 'armyMenu':
        return this.tapArmyMenuBlank();
      case 'field':
        return this.tapField(hit.worldX, hit.worldY);
      default:
        return [];
    }
  }

  /**
   * 第一层 6 颗（web main.js `cmd6Act` 逐条对齐）：
   * `armyMenu` 只开合（已在 `hitTest` 里做了）、`skillPage` 只切焦点、
   * `lordOrder` 看 `ARMY_BTN.lordOrder` 决定「待機 / 後退」，其余一律 `applyArmyCmdKind()`。
   * **可用性/成败都由内核给**，这里只把结论翻译成一句提示。
   */
  tapCmd6(btn: number, kind: Cmd6Kind, label: string, reason: string | null): BattleEffect[] {
    const world = this.world;
    if (!world || this.mode !== 'fighting') {
      this.message = MSG_OVER;
      return [];
    }
    if (kind === 'armyMenu') {
      this.message = this.menu ? MSG_MENU_HINT : MSG_MENU_CLOSED;
      return [];
    }
    if (kind === 'skillPage') {
      this.message = MSG_SKILL_PAGE;
      return [];
    }
    // 原作每颗全局按钮都有自己的「查可用」（0x444C37/0x444BA6/0x444B4C），这里统一走 cmd6Usable，
    // 不满足就只出提示、不写命令槽。
    const idx = kind === 'guardLord' ? 0 : kind === 'sortie' ? 3 : kind === 'lordOrder' ? 4 : kind === 'retreat' ? 5 : -1;
    if (idx >= 0) {
      const use = cmd6Usable(world, idx, { fighting: this.mode === 'fighting', skillCount: this.bar.length });
      if (!use.ok) {
        this.message = `${label}：${use.reason ?? MSG_NO_ORDER}`;
        return [];
      }
    }
    const act = kind === 'lordOrder' ? lordOrderKind(world) : (kind as ArmyCmdKind);
    const ok = applyArmyCmdKind(world, 'A', act);
    if (act === 'retreat') {
      this.message = ok ? MSG_RETREAT_OK : `${label}：${reason ?? MSG_NO_ORDER}`;
      return [];
    }
    this.message = ok ? `${label}：${MSG_ORDERED}` : `${label}：${reason ?? MSG_NO_ORDER}`;
    return [];
  }

  /** 第二层 6 行：`applyArmyCmd(slot)` 的下令口径与内核一致（先查可用再写命令字） */
  tapArmyCmd(slot: number, label: string, reason: string | null): BattleEffect[] {
    const world = this.world;
    if (!world || this.mode !== 'fighting') {
      this.message = MSG_OVER;
      return [];
    }
    const ok = applyArmyCmd(world, 'A', slot);
    this.message = ok ? `${label}：${MSG_ORDERED}` : `${label}：${reason ?? MSG_NO_ORDER}`;
    return [];
  }

  /** 点面板空白：什么都不做（web `armyMenu` 分支同样是空操作），只留一句提示 */
  tapArmyMenuBlank(): BattleEffect[] {
    if (this.mode !== 'fighting') return [];
    this.message = MSG_MENU_HINT;
    return [];
  }

  /**
   * 点技能格：不可放 → 出原因；可放 → **立刻施放，不再进入瞄准相**。
   *
   * R88（`project/139`）：原作引擎按 `MagicDef+0x10` 自己解析目标句柄 `g3`，落点只用于选 `g3`，
   * 伤害路径从来不读 `targetPoint`（110 条脚本里 65 条用 g3 / 11 条读了即丢 / 34 条完全不读）。
   * 所以 web 已改成「点格子即放」，Cocos 这里同步 —— 瞄准相只保留给 `?dev=1` 的调试路径。
   */
  tapSkill(index: number): BattleEffect[] {
    const world = this.world;
    if (!world || this.mode !== 'fighting') return [];
    const slot = this.bar[index];
    if (!slot) return [];

    const reason = castBlockReason(world, slot);
    if (reason) {
      this.message = `${slot.name}：${reasonText(reason)}`;
      return [];
    }
    this.selected = null;
    this.aim = null;
    return this.castAt(index);
  }

  /** 点战场：原作不需要选目标，只提示；瞄准相（调试）下才是施放 */
  tapField(worldX: number, worldY: number): BattleEffect[] {
    if (!this.world || this.mode !== 'fighting') return [];
    if (this.selected === null) {
      this.message = MSG_NO_AIM_NEEDED;
      return [];
    }
    return this.castAt(this.selected, worldX, worldY);
  }

  /**
   * 突擊：跑原作 `SYSTEM.SO#22 AllRush`（web `main.js:789-816` 的 `rushCommand()` 同款）。
   *
   * 优先走**宿主通道** `createBattleSysoHost(world,'A',...)`：按 22 条指令的顺序重放
   * （压暗 → 镜头推主将 → Rush01 → 「全軍突擊!」→ 复亮）；`handled !== true` 或抛异常时
   * 退化成内核 `allRush(world,'A')`（玩法一致，少一段演出）。已在突擊态 → 幂等返回 false。
   *
   * 内核没有"选目标冲锋"：`allRush()` 只把 `world.rush.A` 置真，单位自行前压，
   * 伤害/攻击力都不变。这里不新增任何战斗公式。
   */
  tapAssault(): BattleEffect[] {
    const world = this.world;
    if (!world || this.mode !== 'fighting') return [];
    if (world.over) {
      this.message = MSG_OVER;
      return [];
    }
    if (isRushing(world, 'A')) {
      this.message = MSG_RUSHING;
      return [];
    }
    let applied = false;
    try {
      const host = createBattleSysoHost(world, 'A', {});
      const res = host.call('AllRush', []);
      applied = isRushing(world, 'A');
      if (!res || res.handled !== true) applied = allRush(world, 'A') || applied;
    } catch {
      applied = allRush(world, 'A') || applied;
    }
    this.message = applied ? MSG_RUSH_OK : MSG_RUSHING;
    return [];
  }

  /** 撤 退：调内核 `requestRetreat()`，成功则 HUD 出现标记 */
  tapRetreat(): BattleEffect[] {
    const world = this.world;
    if (!world || this.mode !== 'fighting') return [];
    if (world.over) {
      this.message = MSG_OVER;
      return [];
    }
    if (requestRetreat(world, 'A')) {
      this.message = MSG_RETREAT_OK;
      return [];
    }
    this.message = MSG_RETREAT_FAIL;
    return [];
  }

  /** TOUCH_START / TOUCH_MOVE：只在瞄准相、且点在战场带里才更新落点（web `onPointerMove`） */
  moveAim(tx: number, ty: number, camX: number): void {
    if (!this.world || this.mode !== 'fighting' || this.selected === null) {
      this.aim = null;
      return;
    }
    if (!contains(FIELD, tx, ty)) {
      this.aim = null;
      return;
    }
    const cell = screenToCell(camX, tx, ty);
    this.aim = cell ? { gx: cell.gx, gy: cell.gy } : null;
  }

  /** 取消瞄准（点同格时可调；与 `tapSkill` 的取消分支等价） */
  cancelAim(): void {
    if (this.selected === null) return;
    this.selected = null;
    this.aim = null;
    this.message = MSG_CANCEL_AIM;
  }

  /**
   * 真正施放：只调内核 `cast()`，气力/技力/飘字数值全部取 `CastResult`。
   * 失败时不清选中（web `doCast` 的 `return` 就在 `selectedSkill=null` 之前）。
   */
  private castAt(index: number, tx?: number, ty?: number): BattleEffect[] {
    const world = this.world;
    const slot = this.bar[index];
    if (!world || !slot) return [];

    // 不传落点 = 交给内核 `defaultAim()`（R139 的自动落点）；调试路径才传显式坐标。
    const result = cast(world, 'A', slot.seq, tx, ty, slot.ttl);
    const fx: BattleEffect[] = [];
    if (!result.ok) {
      this.message = `${slot.name}：${reasonText(result.reason)}`;
      return fx;
    }
    // 飘字位置：治疗落在主将身上；其余按"引擎解析出来的落点"落在对方主将附近，
    // 这样玩家点哪儿都不影响它出现在被打的目标身上（与 web 同观感）。
    const aim = defaultAim(world, 'A', slot.seq);
    if (slot.dir) fx.push({ kind: 'magic', dir: slot.dir });

    if (slot.kind === 'heal') {
      const healed = result.healed ?? 0;
      const g = generalPos(world);
      fx.push({ kind: 'floater', floater: { x: g.x, y: g.y, text: `+${healed}`, tone: 'heal' } });
      this.message = `${slot.name}：回復 ${healed} 點體力。`;
    } else {
      const killed = result.killed ?? 0;
      const damage = result.damage ?? 0;
      const hit = result.hit === true || (result.hits ?? 0) > 0;
      // 原作武將技没有命中率，飘 MISS 会让人以为被闪避；只在确实打空时提示「範圍內無敵」。
      const text = killed > 0 ? `-${killed}` : damage > 0 ? `-${damage}` : hit ? '命中' : '';
      if (text) {
        fx.push({ kind: 'floater', floater: { x: aim.x, y: aim.y, text, tone: 'hit' } });
      }
      this.message = `${slot.name}：${
        killed > 0 ? `擊殺 ${killed} 名敵兵` : hit ? '命中敵將' : '範圍內無敵'
      }${damage > 0 ? `，敵將 −${damage} 點體力` : ''}。`;
    }

    this.selected = null;
    this.aim = null;
    return fx;
  }
}

/**
 * 主将单位的位置（`GeneralState` 只有 hp/mp/qi，坐标在 `units` 里那个 `isGeneral`）。
 * 主将单位不在场时返回 `(0,0)`：`cast()` 对纯己方技会自己改写成主将位置，
 * 所以这个兜底值只影响"真的没有主将"那种已判 `dead` 的路径。
 */
export function generalPos(world: World): { x: number; y: number } {
  const g = world.units.find((u) => u.side === 'A' && u.isGeneral === true);
  return g ? { x: g.x, y: g.y } : { x: 0, y: 0 };
}
