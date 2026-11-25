/**
 * 战斗指令台（第一层 6 颗 + 第二层 6 行 + 左列 2 chip + 主将数值/行动条）的**纯数据层**。
 *
 * 为什么要独立一层：
 * - 版式基准是 web 版 `game/src/view/battleView.ts`（`cmd6Rects()` / `armyMenuRect()` /
 *   `armyCmdRects()` / `cmd6Defs()` / `cmd6Usable()` / `armyMenuItems()` / `vitalText()` /
 *   `actionGaugeOf()`），坐标一个数都不许重算——全都照抄进这里，绘制、命中、断言共用一个来源；
 * - **不 import `cc`**：`work/cocos_input/cmd_assert.mjs` 在 Node 里直接编译本文件跑断言，
 *   绘制留在 `BattleRoot.ts`（那里才有 UiSkin / Label）。
 * - 可用性**一律问内核**（`canUseArmyCmd()` / `battleCmdFlags()` / `armyOrderOf()`），
 *   本文件只做「取内核结论 + 拼文案」，不新增任何判定规则。
 *
 * 版式（设计坐标 750×1334，左上原点）：
 * ```
 *   16..104  头像           512..740  ┌ 第一层 6 颗 100×84 ┐
 *   116..488 8 格技能        1030..1114  第 0 行 (A S)
 *   116..358 主将三条 bar     1124..1208  第 1 行 (D F)
 *    18..106 突擊/撤退 chip    1218..1302  第 2 行 (G H)
 *                            1116..1332  第二层面板（盖住第 1/2 行）
 * ```
 */

import {
  ARMY_BTN,
  aliveSoldiersOf,
  armyCmdDefOf,
  armyCmdsOf,
  armyOrderOf,
  canUseArmyCmd,
} from './core/army_cmd';
import type { ArmyCmdKind } from './core/army_cmd';
import { ACTION_INTERVAL_TICKS, ATTACK_COOLDOWN, GENERAL_SLOW_INTERVAL } from './core/battle';
import type { Unit, World } from './core/battle';
import { contains } from './view/layout';
import type { Rect } from './view/layout';
import { COLORS } from './view/theme';

/* ------------------------------------------------------------------ *
 * 一、矩形（web `battleView.ts:392-537` 逐字）
 * ------------------------------------------------------------------ */

/** 第一层 6 颗：web `CMD6_BTN_W/H/X0/Y0/GAP_X/GAP_Y/CMD6_COUNT`（:392-398） */
export const CMD6_BTN_W = 100;
export const CMD6_BTN_H = 84;
export const CMD6_X0 = 524;
export const CMD6_Y0 = 1030;
export const CMD6_GAP_X = 8;
export const CMD6_GAP_Y = 10;
export const CMD6_COUNT = 6;

/** 6 颗按钮矩形（web `cmd6Rects()` :411-422）：列 x=524/632，行 y=1030/1124/1218 */
export function cmd6Rects(): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < CMD6_COUNT; i++) {
    out.push({
      x: CMD6_X0 + (i % 2) * (CMD6_BTN_W + CMD6_GAP_X),
      y: CMD6_Y0 + Math.floor(i / 2) * (CMD6_BTN_H + CMD6_GAP_Y),
      w: CMD6_BTN_W,
      h: CMD6_BTN_H,
    });
  }
  return out;
}

/** 左列 2 颗 chip（web `CHIP_ASSAULT` / `CHIP_RETREAT`，:407-408） */
export const CHIP_ASSAULT: Rect = { x: 18, y: 1128, w: 88, h: 84 };
export const CHIP_RETREAT: Rect = { x: 18, y: 1218, w: 88, h: 84 };

/** 第二层面板（web `ARMY_MENU_RECT` :518） */
export const ARMY_MENU_RECT: Rect = { x: 512, y: 1116, w: 228, h: 216 };

/** 面板拷贝（web `armyMenuRect()` :521-523：调用方改不动常量） */
export function armyMenuRect(): Rect {
  return { x: ARMY_MENU_RECT.x, y: ARMY_MENU_RECT.y, w: ARMY_MENU_RECT.w, h: ARMY_MENU_RECT.h };
}

/** 第二层 6 行（web `armyCmdRects()` :526-537）：516,1119+i*36,220,33 */
export function armyCmdRects(): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < 6; i++) {
    out.push({
      x: ARMY_MENU_RECT.x + 4,
      y: ARMY_MENU_RECT.y + 3 + i * 36,
      w: ARMY_MENU_RECT.w - 8,
      h: 33,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 二、第一层 6 颗：定义 / 可用性
 * ------------------------------------------------------------------ */

/** web `Cmd6Kind`（:425） */
export type Cmd6Kind = 'guardLord' | 'armyMenu' | 'skillPage' | 'sortie' | 'lordOrder' | 'retreat';

/** web `cmd6Defs()` 的一条（键位/正题/小字） */
export interface Cmd6Def {
  key: string;
  label: string;
  sub: string;
  kind: Cmd6Kind;
}

/** 按钮序号 → 内核动作（`lordOrder` 在 tap 时再看 `ARMY_BTN.lordOrder` 决定待機/後退） */
export const CMD6_KINDS: readonly Cmd6Kind[] = [
  'guardLord',
  'armyMenu',
  'skillPage',
  'sortie',
  'lordOrder',
  'retreat',
];

/**
 * web `cmd6Defs(world)`（:444-461）逐字：
 * 第 4 颗（G）跟着 `ARMY_BTN.lordOrder` 在「主將待機 / 主將後退」之间切换。
 */
export function cmd6Defs(world: World | null | undefined): Cmd6Def[] {
  const lordWaiting = !!world && (armyOrderOf(world, 'A').buttons & ARMY_BTN.lordOrder) !== 0;
  return [
    { key: 'A', label: '保護主將', sub: '全軍護衛', kind: 'guardLord' },
    { key: 'S', label: '部隊指令', sub: '陣形六令', kind: 'armyMenu' },
    { key: 'D', label: '武將技', sub: '點技能格', kind: 'skillPage' },
    { key: 'F', label: '武將出擊', sub: '主將上陣', kind: 'sortie' },
    {
      key: 'G',
      label: lordWaiting ? '主將待機' : '主將後退',
      sub: lordWaiting ? '令：待機' : '令：後退',
      kind: 'lordOrder',
    },
    { key: 'H', label: '全軍撤退', sub: '全軍離場', kind: 'retreat' },
  ];
}

/** 一颗按钮的可用性（`ok=false` 时 `reason` 一定有值） */
export interface Cmd6Use {
  ok: boolean;
  reason: string | null;
}

/** `cmd6Usable()` 的上下文：web 用 `mode==='fighting'` 判「还在打」 */
export interface Cmd6Context {
  /** 战斗进行中（`world` 存在、未 over、未 settled、phase=fighting） */
  fighting: boolean;
  /** 技能格条数（给 D 颗判「無武將技」） */
  skillCount: number;
}

/**
 * web `cmd6Usable(world, btn, opts)`（:469-509）逐字移植。
 *
 * 与 web 的唯一差别：这里不判 `world.over/mode` 之外的东西，士兵数/按钮位一律问内核
 * （`aliveSoldiersOf()` / `armyOrderOf().buttons`），不自己记状态。
 */
export function cmd6Usable(world: World | null | undefined, btn: number, ctx: Cmd6Context): Cmd6Use {
  const live = !!world && ctx.fighting && !world.over && !world.settled;
  if (!live) return { ok: false, reason: '戰鬥已結束' };
  const w = world as World;
  const gen = w.sides.A.general;
  const buttons = armyOrderOf(w, 'A').buttons;
  const soldiers = aliveSoldiersOf(w, 'A');
  switch (btn) {
    case 0:
      if (!gen.alive) return { ok: false, reason: '主將陣亡' };
      if ((buttons & ARMY_BTN.guardLord) !== 0) return { ok: false, reason: '已下令護衛' };
      return { ok: true, reason: null };
    case 1:
      return { ok: true, reason: null };
    case 2:
      return ctx.skillCount > 0 ? { ok: true, reason: null } : { ok: false, reason: '無武將技' };
    case 3:
      if (!gen.alive) return { ok: false, reason: '主將陣亡' };
      if ((buttons & ARMY_BTN.sortie) !== 0) return { ok: false, reason: '已出擊' };
      if (soldiers <= 0) return { ok: false, reason: '已無士兵' };
      return { ok: true, reason: null };
    case 4:
      if (!gen.alive) return { ok: false, reason: '主將陣亡' };
      return { ok: true, reason: null };
    case 5:
      if (w.fled.A) return { ok: false, reason: '我軍已在撤退' };
      if (soldiers <= 0) return { ok: false, reason: '已無士兵' };
      return { ok: true, reason: null };
    default:
      return { ok: false, reason: '未知按鈕' };
  }
}

/** 「主將後退 / 待機」这一颗到底该发哪个 kind（web main.js `cmd6Act` 同式） */
export function lordOrderKind(world: World | null | undefined): 'lordWait' | 'lordBack' {
  if (!world) return 'lordBack';
  return (armyOrderOf(world, 'A').buttons & ARMY_BTN.lordOrder) !== 0 ? 'lordWait' : 'lordBack';
}

/* ------------------------------------------------------------------ *
 * 三、第二层 6 行菜单
 * ------------------------------------------------------------------ */

/** web `ArmyMenuItem`（:539-548） */
export interface ArmyMenuItem {
  slot: number;
  label: string;
  kind: ArmyCmdKind;
  ok: boolean;
  reason: string | null;
  ordered: boolean;
}

/**
 * web `armyMenuItems(world)`（:554-572）逐字：
 * 标签/命令字来自该阵形的 6 条子菜单，可用性来自 `canUseArmyCmd()`，
 * `ordered` = 这一槽已经下过令（`armyOrderOf().slots[i] !== null`）。
 *
 * 阵形里查不到那一槽时返回 `null`（web 同口径：hitTest 落到 `armyMenu`，即面板空白）。
 */
export function armyMenuItems(world: World | null | undefined): (ArmyMenuItem | null)[] {
  const out: (ArmyMenuItem | null)[] = [];
  if (!world) return out;
  const formation = world.sides.A.formation ?? 0;
  const defs = armyCmdsOf(formation);
  const ordered = armyOrderOf(world, 'A').slots;
  for (let i = 0; i < 6; i++) {
    const def = armyCmdDefOf(formation, i) ?? defs[i];
    if (!def) {
      out.push(null);
      continue;
    }
    const chk = canUseArmyCmd(world, 'A', i);
    out.push({
      slot: def.slot,
      label: def.label,
      kind: def.kind,
      ok: chk.ok,
      reason: chk.reason ?? null,
      ordered: (ordered[i] ?? null) !== null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 四、左列 2 颗 chip（突擊 / 撤退）
 * ------------------------------------------------------------------ */

export interface ChipState {
  label: string;
  sub: string;
  ok: boolean;
  reason: string | null;
}

/** 6 条子菜单里 `kind==='rush'` 的那一槽（阵形 0 = 槽 5；查不到给 -1） */
export function rushSlotOf(formationId: number): number {
  const defs = armyCmdsOf(formationId);
  for (let i = 0; i < defs.length; i++) if (defs[i]!.kind === 'rush') return i;
  return -1;
}

/**
 * 突擊 chip：`突 擊` / 副标题「突擊中」或「全軍突擊」。
 *
 * 可用性走内核 `canUseArmyCmd(rush 槽)`——「全軍突擊」本来就是第二层的第 6 条，
 * 它能不能下和 chip 能不能点必须是同一个判定（否则会出现按钮亮着但子菜单灰的矛盾）。
 */
export function assaultChip(world: World | null | undefined): ChipState {
  if (!world) return { label: '突 擊', sub: '全軍突擊', ok: false, reason: '戰鬥已結束' };
  const rushing = world.rush?.A === true;
  const sub = rushing ? '突擊中' : '全軍突擊';
  if (world.over || world.settled) return { label: '突 擊', sub, ok: false, reason: '戰鬥已結束' };
  if (rushing) return { label: '突 擊', sub, ok: false, reason: '全軍已在突擊中' };
  if (world.fled.A) return { label: '突 擊', sub, ok: false, reason: '我軍已在撤退' };
  const slot = rushSlotOf(world.sides.A.formation ?? 0);
  if (slot >= 0) {
    const chk = canUseArmyCmd(world, 'A', slot);
    return { label: '突 擊', sub, ok: chk.ok, reason: chk.reason ?? null };
  }
  if (aliveSoldiersOf(world, 'A') <= 0) return { label: '突 擊', sub, ok: false, reason: '已無士兵' };
  return { label: '突 擊', sub, ok: true, reason: null };
}

/**
 * 撤退 chip：`撤 退` / 副标题「撤退中」或「全軍離場」。
 *
 * 「全軍撤退」在第一层是第 6 颗（`applyArmyCmdKind('retreat')`），内核没有它的「查可用」
 * 入口（`canUseArmyCmd` 只查 6 条子菜单，阵形 0 里没有 retreat 槽），所以这里照抄内核
 * `canUseArmyCmd` 的 retreat 分支逐条比对，文案与内核**逐字相同**（不发明新词）。
 */
export function retreatChip(world: World | null | undefined): ChipState {
  if (!world) return { label: '撤 退', sub: '全軍離場', ok: false, reason: '戰鬥已結束' };
  const fled = world.fled.A === true;
  const sub = fled ? '撤退中' : '全軍離場';
  if (world.over || world.settled) return { label: '撤 退', sub, ok: false, reason: '戰鬥已結束' };
  if (fled || world.status.A === 2) return { label: '撤 退', sub, ok: false, reason: '我軍已在撤退' };
  if (world.fled.B || world.status.B === 2) {
    return { label: '撤 退', sub, ok: false, reason: '敵軍已在撤退' };
  }
  if (aliveSoldiersOf(world, 'A') <= 0) return { label: '撤 退', sub, ok: false, reason: '已無士兵' };
  return { label: '撤 退', sub, ok: true, reason: null };
}

/* ------------------------------------------------------------------ *
 * 五、主将数值 / 行动条（web `vitalText()` / `actionGaugeOf()`）
 * ------------------------------------------------------------------ */

/** web `vitalText()`（:688-692）：`體 123/456`（都向上取整、都夹到 ≥0） */
export function vitalText(label: string, cur: number, max: number): string {
  return `${label} ${Math.max(0, Math.ceil(cur))}/${Math.max(0, Math.ceil(max))}`;
}

/** web `ActionGauge`（:703-714） */
export interface ActionGauge {
  remain: number;
  interval: number;
  slow: number;
  ratio: number;
  mark: number;
}

/**
 * web `actionGaugeOf()`（:717-729）逐字：主将的行动间隔被拉慢到 46 帧，
 * `ratio` 是「这一轮走了多少」（0..1），`mark` 是 40/46 那道刻度线的位置。
 */
export function actionGaugeOf(u: Pick<Unit, 'cd' | 'isGeneral'>): ActionGauge {
  const interval = Math.max(1, u.isGeneral ? ACTION_INTERVAL_TICKS : ATTACK_COOLDOWN);
  const slow = Math.max(interval, u.isGeneral ? GENERAL_SLOW_INTERVAL : interval);
  const remain = Math.max(0, Math.min(interval, u.cd));
  const mark = interval / slow;
  const ratio = Math.max(0, Math.min(1, (interval - remain) / slow));
  return { remain, interval, slow, ratio, mark };
}

/** web `generalUnitOf()`（:732-734） */
export function generalUnitOf(world: World | null | undefined, side: 'A' | 'B'): Unit | null {
  if (!world) return null;
  return world.units.find((u) => u.side === side && u.isGeneral === true) ?? null;
}

/** 主将那一行「武 97 · 智 75 · 行 12/40」（`act` 缺席时不写行；web :1783 同式） */
export function generalStatLine(
  general: { str: number; int: number },
  act: ActionGauge | null,
): string {
  const base = `武 ${general.str} · 智 ${general.int}`;
  if (!act) return base;
  return `${base} · 行 ${act.interval - act.remain}/${act.interval}`;
}

/* ------------------------------------------------------------------ *
 * 六、绘制模型（供 BattleRoot 通用渲染）
 * ------------------------------------------------------------------ */

/** 底图规格：九宫皮肤 + 矩形 + 不透明度（0..255） */
export interface CmdBg {
  kind: 'bg';
  id: string;
  rect: Rect;
  skin: string;
  alpha: number;
  /**
   * 是否要一层**不透明底衬**（`fillAlpha` 给 0..255，`fillColor` 缺省深底）。
   *
   * 九宫皮肤的中间是镂空的（`plate_btn`/`frame_panel` 都只有边框+高光），
   * 面板若只铺九宫，底下的第一层第 2/3 行会透出来——web 的面板底是
   * `rgba(8,10,14,.96)` 的实色，所以这里补同口径的底衬。
   */
  fillAlpha?: number;
  /** 底衬颜色（web: 面板 `#080A0E`、行 `panelHi`/`panel`），缺省 `#0A0E14` */
  fillColor?: string;
}

/** 文字规格：绝对设计坐标（`x` 是锚点，`align` 决定它代表左/中/右） */
export interface CmdText {
  kind: 'text';
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
}

export type CmdItem = CmdBg | CmdText;

export interface CmdUiModel {
  /** 有序：先 bg 后它的 text，保证「面板盖住第一层第 2/3 行」= 绘制顺序也成立 */
  items: CmdItem[];
  /** 第二层是否展开（BattleRoot 据此决定要不要把面板建出来） */
  menuOpen: boolean;
}

/** `buildCmdUi()` 的上下文（`mode` 与 `skillCount` 决定可用性，`menuOpen` 决定要不要面板） */
export interface CmdUiOptions {
  menuOpen: boolean;
  mode: 'idle' | 'fighting' | 'settled';
  skillCount: number;
}

/**
 * web 的 `T(x,y,...)` 是**基线**坐标，Cocos 的 Label 用**盒中心**——
 * 这里统一换算（偏移 0.38×字号，实测与老 HUD 的 1066/1079 落点一致）。
 */
function baselineY(baseline: number, size: number): number {
  return baseline - size * 0.38;
}

/** 一颗 chip 的规格（突擊/撤退共用） */
function pushChip(items: CmdItem[], ns: string, rect: Rect, st: ChipState): void {
  items.push({
    kind: 'bg',
    id: `${ns}.bg`,
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    skin: 'plate_sq',
    alpha: st.ok ? 255 : 150,
  });
  items.push({
    kind: 'text',
    id: `${ns}.label`,
    text: st.label,
    x: rect.x + rect.w / 2,
    y: baselineY(rect.y + 36, 24),
    w: rect.w + 16,
    size: 24,
    color: st.ok ? COLORS.text : COLORS.textFaint,
    align: 'center',
    bold: true,
  });
  items.push({
    kind: 'text',
    id: `${ns}.sub`,
    text: st.ok ? st.sub : (st.reason ?? st.sub),
    x: rect.x + rect.w / 2,
    y: baselineY(rect.y + 62, 11),
    w: rect.w + 24,
    size: 11,
    color: COLORS.textFaint,
    align: 'center',
    bold: false,
  });
}

/**
 * 造一份完整的指令台绘制模型（**只读 world**，不产生任何副作用）。
 *
 * 顺序即 z 序：chips → 主将数值 → 第一层 6 颗 → （展开时）面板 + 6 行。
 * 所以第二层展开时，面板一定画在「第一层第 2/3 行」上面——与 web 的
 * 「面板优先命中」是同一件事的两种表述。
 */
export function buildCmdUi(world: World | null | undefined, opts: CmdUiOptions): CmdUiModel {
  const items: CmdItem[] = [];
  const fighting = opts.mode === 'fighting';
  const ctx: Cmd6Context = { fighting, skillCount: opts.skillCount };

  // --- 左列 chip ---------------------------------------------------------
  pushChip(items, 'chip.assault', CHIP_ASSAULT, assaultChip(world));
  pushChip(items, 'chip.retreat', CHIP_RETREAT, retreatChip(world));

  // --- 主将数值（web drawConsole :1783-1792 的口径） ----------------------
  if (world) {
    const g = world.sides.A.general;
    const gu = generalUnitOf(world, 'A');
    items.push({
      kind: 'text',
      id: 'gen.stats',
      text: generalStatLine(g, gu ? actionGaugeOf(gu) : null),
      x: 116,
      y: baselineY(1052, 12),
      w: 246,
      size: 12,
      color: COLORS.textDim,
      align: 'left',
      bold: false,
    });
    items.push({
      kind: 'text',
      id: 'gen.hp',
      text: vitalText('體', g.hp, g.maxHp),
      x: 358,
      y: baselineY(1070, 10),
      w: 70,
      size: 10,
      color: COLORS.heal,
      align: 'right',
      bold: false,
    });
    items.push({
      kind: 'text',
      id: 'gen.mp',
      text: vitalText('技', g.mp, g.mpMax),
      x: 358,
      y: baselineY(1083, 10),
      w: 70,
      size: 10,
      color: COLORS.oursLight,
      align: 'right',
      bold: false,
    });
  }

  // --- 第一层 6 颗 -------------------------------------------------------
  const rects = cmd6Rects();
  const defs = cmd6Defs(world);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    const d = defs[i]!;
    const use = cmd6Usable(world, i, ctx);
    const open = opts.menuOpen && d.kind === 'armyMenu';
    items.push({ kind: 'bg', id: `cmd6.${i}.bg`, rect: r, skin: 'plate_btn', alpha: use.ok ? 255 : 150 });
    if (open) {
      // 按下态/展开态：plate_sel 叠一层（web 用 gold 2.5px 描边表达同一件事）
      items.push({ kind: 'bg', id: `cmd6.${i}.sel`, rect: r, skin: 'plate_sel', alpha: 235 });
    }
    items.push({
      kind: 'text',
      id: `cmd6.${i}.key`,
      text: d.key,
      x: r.x + 16,
      y: baselineY(r.y + 24, 10),
      w: 24,
      size: 10,
      color: COLORS.textDim,
      align: 'left',
      bold: false,
    });
    items.push({
      kind: 'text',
      id: `cmd6.${i}.label`,
      text: d.label,
      x: r.x + r.w / 2,
      y: baselineY(r.y + 44, 19),
      w: r.w - 6,
      size: 19,
      color: use.ok ? COLORS.text : COLORS.textFaint,
      align: 'center',
      bold: true,
    });
    items.push({
      kind: 'text',
      id: `cmd6.${i}.sub`,
      text: use.ok ? d.sub : (use.reason ?? d.sub),
      x: r.x + r.w / 2,
      y: baselineY(r.y + 66, 10),
      w: r.w + 10,
      size: 10,
      color: COLORS.textFaint,
      align: 'center',
      bold: false,
    });
  }

  // --- 第二层：面板 + 6 行（只有展开时才建） ------------------------------
  if (opts.menuOpen) {
    // 面板底必须实色：web 是 `rgba(8,10,14,.96)`，否则第一层第 2/3 行会透出来
    items.push({
      kind: 'bg',
      id: 'army.panel',
      rect: armyMenuRect(),
      skin: 'frame_panel',
      alpha: 255,
      fillAlpha: 245,
      fillColor: '#080A0E',
    });
    const rows = armyCmdRects();
    const list = armyMenuItems(world);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const it = list[i] ?? null;
      const ok = !!it && it.ok;
      items.push({
        kind: 'bg',
        id: `army.${i}.bg`,
        rect: r,
        skin: 'plate_btn',
        alpha: 255,
        // 行底照 web `R(ok?panelHi:panel)`：实色，只靠文字颜色表达不可用
        fillAlpha: 255,
        fillColor: ok ? COLORS.panelHi : COLORS.panel,
      });
      if (it && it.ordered) {
        items.push({ kind: 'bg', id: `army.${i}.sel`, rect: r, skin: 'plate_sel', alpha: 190 });
      }
      items.push({
        kind: 'text',
        id: `army.${i}.no`,
        text: `${i + 1}`,
        x: r.x + 6,
        y: baselineY(r.y + 22, 10),
        w: 16,
        size: 10,
        color: COLORS.textFaint,
        align: 'left',
        bold: false,
      });
      items.push({
        kind: 'text',
        id: `army.${i}.label`,
        text: it ? it.label : '—',
        x: r.x + 22,
        y: baselineY(r.y + 23, 13),
        w: 104,
        size: 13,
        color: ok ? COLORS.text : COLORS.textFaint,
        align: 'left',
        bold: ok,
      });
      const right = it ? (it.ordered ? '已下令' : it.ok ? '' : (it.reason ?? '不可用')) : '不可用';
      items.push({
        kind: 'text',
        id: `army.${i}.right`,
        text: right,
        x: r.x + r.w - 6,
        y: baselineY(r.y + 22, 9),
        w: 86,
        size: 9,
        color: it && it.ordered ? COLORS.gold : COLORS.textFaint,
        align: 'right',
        bold: false,
      });
    }
  }

  return { items, menuOpen: opts.menuOpen };
}

/* ------------------------------------------------------------------ *
 * 七、几何小工具（hitTest / 断言共用）
 * ------------------------------------------------------------------ */

/** 面板里的第几行（不在行内 → -1）；第二层展开时的命中分流就用它 */
export function armyRowAt(tx: number, ty: number): number {
  const rows = armyCmdRects();
  for (let i = 0; i < rows.length; i++) if (contains(rows[i]!, tx, ty)) return i;
  return -1;
}

/** 点是否落在 6 颗按钮中某一颗上（不含第二层遮挡，遮挡由调用方顺序保证） */
export function cmd6IndexAt(tx: number, ty: number): number {
  const rects = cmd6Rects();
  for (let i = 0; i < rects.length; i++) if (contains(rects[i]!, tx, ty)) return i;
  return -1;
}

/** 指令台占的所有矩形（结算相「点控件不重开」的判据之一） */
export function cmd6Controls(): Rect[] {
  return [...cmd6Rects(), CHIP_ASSAULT, CHIP_RETREAT, armyMenuRect()];
}
