/// <reference lib="dom" />
/**
 * 战斗视图层：`World` → 绘制指令列表 → Canvas2D。
 *
 * 这一层与引擎无关：`buildFrame()` 只产出纯数据指令，`render()` 是唯一接触
 * Canvas2D 的函数（Cocos 版以后用 Graphics 重写同一批指令的消费端，或直接按
 * 同一套布局重画）。**不引用 `cc`，也不读写 `World` 的任何逻辑字段**。
 *
 * 坐标口径以 `game/src/core/battle.ts` 的 `project()` 为准（依据：project/02 §2.2/§3.3）。
 * 注意 core 里我方 A 在 worldX 高位，所以"越靠下越是我方"，与 02 文档里
 * `1000 - (worldX - camX) * s` 的文字写法符号相反；视图层不纠正逻辑，只包一层。
 */
import {
  // R159：行动条量程改为只读 `actionIntervalOf()`（40 普通 / 46 撤退态），
  // 不再在本层引用这两个常量，避免两套口径。

  BATTLE_TICK_LIMIT,
  FX_TTL_DEFAULT,
  SKILL_MARK_TTL,
  TICK_HZ,
  actionIntervalOf,
  camera,
  expToReach,
  qiCostOf,
  skillKindOf,
  type GeneralState,
  type SettleResult,
  type Side,
  type SkillMark,
  type Unit,
  type World,
} from '../core/battle.ts';
/**
 * 武将技投射物事件（R187）：core 把「原作 `SYSCALL 0x11` 建的那个引擎物件」转成一条
 * `ProjectileFlight`，本层只按 tick 画，不参与命中判定。
 */
import { projectilesOf } from '../core/smartscript/runtime.ts';
/** 两层战斗指令界面的数据源：33 组子菜单表 + 可用性判定（g15 交付，本层只读不重抄） */
import {
  ARMY_BTN,
  aliveSoldiersOf,
  armyCmdsOf,
  armyOrderOf,
  canUseArmyCmd,
  type ArmyCmdDef,
  type ArmyCmdKind,
} from '../core/army_cmd.ts';
import type { GameData } from '../types.ts';
import {
  DEATH_TICKS,
  HIT_FLASH_TICKS,
  actionAtlas,
  attackAgeOf,
  deathAgeOf,
  hitAgeOf,
  pickActionFrame,
  pushActionSprite,
  usesActionFrames,
} from './animSelect.ts';
import { battleBgTick, bgReady, drawBattleBg } from './battleBg.ts';
import { generalAtlasTick, generalDying, generalLayers } from './generalAtlas.ts';
import { pickUnitFrames, type UnitsAtlas } from './unitFrames.ts';
import {
  CLOCK_PLAQUE,
  CONSOLE,
  DESIGN_H,
  DESIGN_W,
  FIELD,
  FIELD_BOTTOM,
  FIELD_TOP,
  GENERAL_CARD_B,
  GENERAL_CARD_BAR_H,
  GENERAL_CARD_COL,
  GENERAL_CARD_VITAL_W,
  GENERAL_CARD_VITAL_W_B,
  GENERAL_CARD_Y,
  GENERAL_INFO,
  GRID_H,
  GRID_W,
  HUD,
  HUD_BAR_A,
  HUD_BAR_B,
  HUD_HP_A,
  HUD_HP_B,
  HUD_QI_A,
  HUD_QI_B,
  MESSAGE_BOX,
  MINIMAP,
  PORTRAIT,
  READY_PANEL,
  SETTLE_PANEL,
  SKILL_SLOT_GAP,
  SKILL_SLOT_H,
  SKILL_SLOT_W,
  SKILL_SLOT_X0,
  START_BUTTON,
  AGAIN_BUTTON,
  clamp,
  contains,
  lanePitch,
  laneScreenX,
  projectUnit,
  projectionInfo,
  rowEdgeX,
  rowPitch,
  rowScale,
  rowScreenY,
  screenToCell,
  screenToUnit,
  skillSlotRect,
  type Rect,
  type UnitProjection,
} from './layout.ts';
import {
  COLORS,
  FONT,
  FONT_FAMILY,
  RADIUS,
  sideColor,
  sideDark,
  sideLight,
  withAlpha,
} from './theme.ts';

// ---------------------------------------------------------------------------
// 绘制指令
// ---------------------------------------------------------------------------

export type TextAlign = 'left' | 'center' | 'right';
export type TextBaseline = 'top' | 'middle' | 'alphabetic' | 'bottom';

export interface RectCmd {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  width?: number;
  radius?: number;
  alpha?: number;
}

export interface LineCmd {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  width?: number;
  dash?: number[];
  alpha?: number;
}

export interface PolyCmd {
  kind: 'poly';
  points: { x: number; y: number }[];
  fill?: string;
  stroke?: string;
  width?: number;
  close?: boolean;
  alpha?: number;
}

export interface EllipseCmd {
  kind: 'ellipse';
  x: number;
  y: number;
  rx: number;
  ry: number;
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
  alpha?: number;
}

export interface TextCmd {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  align?: TextAlign;
  baseline?: TextBaseline;
  bold?: boolean;
  stroke?: string;
  strokeWidth?: number;
  maxWidth?: number;
  alpha?: number;
}

export interface SpriteCmd {
  kind: 'sprite';
  img: CanvasImageSource;
  /** 源矩形（图集内像素） */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 目标矩形：x,y 是脚底中心（与色块单位同一锚点），w/h 是绘制尺寸 */
  x: number;
  y: number;
  w: number;
  h: number;
  alpha?: number;
  /** 合成模式：特效帧用 'lighter' 叠加发光；省略 = source-over */
  comp?: 'lighter';
  /**
   * 旋转（弧度，顺时针为正），绕 (x,y) 这个锚点转。
   * 只给武将技帧用：原作是横版（特效朝左画、动作沿横向），竖版战场的推进方向是纵向，
   * 所以帧要跟着战场转 90°（见 index.json 的 dirs[*].rot）。
   */
  rot?: number;
  /** 旋转模式下图片左上角相对锚点的偏移（未旋转坐标系里的像素），省略时按 rot 原点 = 锚点 */
  ox?: number;
  oy?: number;
}

export type DrawCmd = RectCmd | LineCmd | PolyCmd | EllipseCmd | TextCmd | SpriteCmd;

// ---------------------------------------------------------------------------
// 视图输入
// ---------------------------------------------------------------------------

export type ViewMode = 'ready' | 'fighting' | 'settled';

/**
 * 開場叫陣的台詞框（原作 `SYSTEM.SO#StartBattle` @0x2108 的兩段喊話）。
 * 時序全部由 web 層算好後傳進來，視圖層只負責畫——這裡不判斷「該誰說」。
 */
export interface TauntView {
  /** 說話方：A = 我軍（藍）、B = 敵軍（紅），與原作臺詞層 3/2 對應 */
  side: Side;
  /** 說話武將名；空時按 side 退回「我將 / 敵將」 */
  name?: string;
  /** 已填好 `%S1%/%S2%`、已剝尾碼的台詞 */
  text: string;
  /** 本句已停留秒數（只畫進度條，不參與任何判定） */
  t?: number;
  /** 本句總時長（秒）；省略按 1.5s 畫 */
  hold?: number;
}

export interface SkillSlot {
  seq: number;
  name: string;
  mp: number;
  qi: number;
  kind: 'heal' | 'strike' | 'aoe' | null;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  maxTtl: number;
  size: number;
}

export interface ViewOptions {
  /** 镜头中心（格）；省略时现算 core.camera(world) */
  camX?: number;
  /** 秒，用于呼吸 / 闪烁；不参与逻辑 */
  time?: number;
  skills?: SkillSlot[];
  selectedSkill?: number | null;
  /** 瞄准格（点地技能） */
  aim?: { gx: number; gy: number } | null;
  floaters?: Floater[];
  message?: string | null;
  mode?: ViewMode;
  settlement?: SettleResult | null;
  seed?: number;
  aLabel?: string;
  bLabel?: string;
  /** 序列帧图集（可选）。给了就用真序列帧画士兵，否则退回色块 */
  atlas?: SpriteAtlas | null;
  /** 兵种图集（可选）。units.json 里的兵种组：有就用兵种专用序列帧（弓兵拉弓等） */
  units?: UnitsAtlas | null;
  /** 武将技特效图集（可选）：有对应目录就画原作帧，没有就退回虚线圈 */
  fx?: FxAtlas | null;
  /** 主将立绘（可选）：有就画进头像框，没有就用「將」占位 */
  portrait?: { img: CanvasImageSource; w: number; h: number } | null;
  /**
   * 部队指令子菜单是否展开。省略时用视图层的模块状态（`armyMenuOpen()`），
   * 也就是「点部隊指令按钮自己开合」；给了值就以调用方为准（测试 / 将来的 main.js 接线）。
   */
  armyMenu?: boolean;
  /**
   * 開場叫陣台詞框：非空時畫在整幀最後（蓋住 HUD / 提示框）。
   * `null`/`undefined` = 沒在叫陣。
   */
  taunt?: TauntView | null;
}

/** 一帧特效：图集矩形 + 帧内热点（原作 SHP 头 +0x1C 的 offsetX/offsetY） */
export interface FxFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 热点：把该点对齐到 project(fx.x, fx.y) 的屏幕坐标 */
  ax: number;
  ay: number;
}

export interface FxDir {
  img: CanvasImageSource;
  frames: FxFrame[];
  /**
   * 帧的朝向修正（度）。原作是横版：特效按「战场推进方向 = 屏幕横向」画，
   * 竖版战场的推进方向是纵向，所以默认要转 90°。A 方用 rot，B 方用 -rot
   * （两边特效都朝着对方的阵地推进）。纯竖直的“天空系”特效（闪电、光柱）用 0。
   */
  rot?: number;
}

/**
 * 一技多目录里的一段：`dir` = MAGIC 目录号（"004"），`[from,to)` = 归一化时间片（0..1）。
 * `to <= from` 是「叠加」标记：这一段不占自己的时间窗，而是和相邻的非零段同窗并放
 * （原作里同一招既有「整目录载入」又有「单独 spawn 的部件」，例如刀劍亂的 036 劍 + 026 水柱）。
 */
export interface FxSeg {
  dir: string;
  from: number;
  to: number;
}

/**
 * `assets/fx/index.json` 的运行时形态（由 web/main.js 加载后传入）。
 * `map` 是技能 seq（字符串）→ MAGIC 目录；`dirs` 只放已经加载好的目录，
 * 所以缺图不会抛错，只是走虚线圈兜底。
 */
export interface FxAtlas {
  map: Record<string, string>;
  dirs: Record<string, FxDir>;
  /** 多目录技的分段表；缺项的技按 `map` 走单目录回退 */
  seqDirs?: Record<string, FxSeg[]>;
  /** core 的 Fx.ttl 初值，默认 `FX_TTL_DEFAULT`(60 tick = 1 秒 @60Hz，有 Fx.life 时以 fx.life 为准) */
  life?: number;
  /** 原尺寸 → 屏幕的缩放，默认 0.8（原作的 1 格 = 96 px） */
  scale?: number;
}

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteAtlas {
  img: CanvasImageSource;
  /** 敌方染色版图集（同一布局）。原作两军靠甲色区分，这里不重画、只换色 */
  imgEnemy?: CanvasImageSource;
  /** 'walk_back_00' ~ 'walk_front_16' 之类，键名与 atlas.json 一致 */
  frames: Record<string, SpriteFrame>;
  /** 我方用背视、敌方用正视 */
  back: string[];
  front: string[];
  /** 攻击动作帧（目前只有正视一套，两侧共用；没有就退回走路帧） */
  attack?: string[];
  /** 每帧停留的 tick 数（原作帧序，**不随 TICK_HZ 变**：5 tick @60Hz ≈ 12fps，是甲类字面值） */
  hold?: number;
}

export const DEFAULT_SKILL_SEQ: readonly number[] = [1, 50, 2, 104];

/**
 * 技能栏上限 = 8 格。
 *
 * 原作武将资料的技能栏 `general+0x54` 是 `byte[8]` —— **最多 8 格、没有翻页**
 * （g8 反汇编已确认，见 `work\dis_battle_units.txt` 的武將資料布局）。所以 8 是数据上限，
 * 不是 UI 取舍。本作 4→8 只改视图：`learnedSkillSeqs()` 按 `SKILL` 表的「习得等级」
 * 返回实际条数，**不足 8 就只画实际条数**，不补空格。
 */
export const MAX_SKILL_SLOTS = 8;

/**
 * 8 格版式：4 列 × 2 行，列宽/列间距沿用 layout 的 4 格节奏（88 + 10），行高压缩到 56。
 * 第一行 y=1100、第二行 y=1162（1100 + 56 + 6），底边 1218 < 提示框 y=1224。
 * 4 格及以下仍走 `layout.skillSlotRect()`（y=1124 / 88×88），老版式一格不动。
 */
export const SKILL_GRID_ROW2_Y = 1100;
export const SKILL_GRID_ROW_H = 56;
export const SKILL_GRID_ROW_GAP = 6;

/**
 * 技能格矩形：**绘制与命中区共用这一个函数**。
 *
 * - `count <= 4`：沿用 `layout.skillSlotRect(i)`（单行、88×88）；
 * - `5..8`：4×2 两行，88×56，第一行 y=1100 / 第二行 y=1162。
 *
 * 序号 `i` 与 `makeSkillBar()` 的数组下标一一对应，`castBlockReason()` 也只吃这个下标；
 * 任何一处另外算坐标都会让「画第 5 格、点第 5 格命中第 6 个技」。
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

// ---------------------------------------------------------------------------
// 两层战斗指令界面：第一层 6 大按钮 + 第二层 6 条部队指令子菜单
//
// 依据 `project/140 §2.1`（原作 6 大按钮）与 `project/147 §6.3`（视图层要点），
// 实际版式在 `project/151_战斗指令界面.md` §2 有坐标表。
//
// 三条纪律：
//  1) 子菜单的 label / 可用性**一律问 core**（`armyCmdsOf` / `canUseArmyCmd`），
//     视图层不抄表、不自己判"这条能不能下"；
//  2) 绘制矩形与命中矩形**共用同一个函数**（`cmd6Rects()` / `armyCmdRects()`），
//     任何一处另算坐标都会让"画第 3 颗、点第 3 颗命中第 4 颗"；
//  3) 4 格 / 8 格两套技能版式都不许被新按钮压住（`tests/battle_cmd_ui.test.ts`）。
// ---------------------------------------------------------------------------

/**
 * 第一层 6 大按钮：2 列 × 3 行，单钮 100×84。
 *
 * 版式：列 `x = 524 / 632`，行 `y = 1030 / 1124 / 1218`（底边 1302，留 32px 下边距）。
 * 右侧让出来之后，原来 R82 的 208×88 `.cmd` 装饰框换成 100×84：14px 的
 * border-image 依旧对得上（`web/index.html` 的 `.cmd6`）。
 *
 * 键位 `A/S/D/F/G/H` 是 `[推测]`：原作是光标 + 确认键，PC 版没有字母快捷键，
 * 这六个字母是我方自定（与技能格 `1-8` 不冲突）。
 */
export const CMD6_BTN_W = 100;
export const CMD6_BTN_H = 84;
export const CMD6_X0 = 524;
export const CMD6_Y0 = 1030;
export const CMD6_GAP_X = 8;
export const CMD6_GAP_Y = 10;
export const CMD6_COUNT = 6;

/**
 * 突擊 / 撤退两颗快捷钮搬到了最左列（头像正下方 18..106）。
 *
 * 这两颗是 R137/R38 的系统键（`allRush` / `requestRetreat`），不在原作 6 大按钮里；
 * 右列让给 6 大按钮后它们只能换位置。**`Hit` 的 `assault` / `retreat` 语义一个字节没改**，
 * 只是矩形搬家 —— `main.js` 的 `hit.type === 'assault' | 'retreat'` 分支不用动。
 */
export const CHIP_ASSAULT: Rect = { x: 18, y: 1128, w: 88, h: 84 };
export const CHIP_RETREAT: Rect = { x: 18, y: 1218, w: 88, h: 84 };

/** 第一层 6 钮的矩形（下标 = `Hit` 的 `cmd6.btn`，0..5） */
export function cmd6Rects(): Rect[] {
  const rects: Rect[] = [];
  for (let i = 0; i < CMD6_COUNT; i++) {
    rects.push({
      x: CMD6_X0 + (i % 2) * (CMD6_BTN_W + CMD6_GAP_X),
      y: CMD6_Y0 + Math.floor(i / 2) * (CMD6_BTN_H + CMD6_GAP_Y),
      w: CMD6_BTN_W,
      h: CMD6_BTN_H,
    });
  }
  return rects;
}

/** 第一层按钮的语义（`armyMenu` = 展开第二层；`skillPage` = 把视线引到技能格） */
export type Cmd6Kind = 'guardLord' | 'armyMenu' | 'skillPage' | 'sortie' | 'lordOrder' | 'retreat';

export interface Cmd6Def {
  /** 0..5，与 `cmd6Rects()` / `Hit.btn` 同下标 */
  btn: number;
  /** 键位（`[推测]` 我方自定） */
  key: string;
  /** 大按钮正题，照抄原作 */
  label: string;
  /** 小字：这一颗做什么 */
  sub: string;
  kind: Cmd6Kind;
}

/**
 * 6 大按钮的文案。**第 5 颗按 world 状态二选一**（原作 `[0x4a8ae0] & 0x10`）：
 * `主將後退` 下过令（`armyOrderOf().buttons & ARMY_BTN.lordOrder`）之后翻成 `主將待機`
 * —— 与 `applyArmyCmdKind('lordWait' | 'lordBack')` 的清位/置位方向一致。
 */
export function cmd6Defs(world: World): Cmd6Def[] {
  const st = armyOrderOf(world, 'A');
  const lordWaiting = (st.buttons & ARMY_BTN.lordOrder) !== 0;
  return [
    { btn: 0, key: 'A', label: '保護主將', sub: '全軍護衛', kind: 'guardLord' },
    { btn: 1, key: 'S', label: '部隊指令', sub: '陣形六令', kind: 'armyMenu' },
    { btn: 2, key: 'D', label: '武將技', sub: '點技能格', kind: 'skillPage' },
    { btn: 3, key: 'F', label: '武將出擊', sub: '主將上陣', kind: 'sortie' },
    {
      btn: 4,
      key: 'G',
      label: lordWaiting ? '主將待機' : '主將後退',
      sub: lordWaiting ? '令：待機' : '令：後退',
      kind: 'lordOrder',
    },
    { btn: 5, key: 'H', label: '全軍撤退', sub: '全軍離場', kind: 'retreat' },
  ];
}

/**
 * 某一颗大按钮当前能不能点（纯函数，`Hit.canUse` 与置灰绘制都走这一个出口）。
 *
 * 可用性判据与 core 保持一致：`world.over/settled` → 结束；主将阵亡 → 不能出击/待機；
 * 士兵清空 → 不能下令（`aliveSoldiersOf`，与原作 `[0x4a8abc]` 同义）。
 */
export function cmd6Usable(
  world: World,
  btn: number,
  opts: ViewOptions = {},
): { ok: boolean; reason: string | null } {
  const mode = opts.mode ?? 'fighting';
  const live = mode === 'fighting' && !world.over && !world.settled;
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
  if (!live) return fail('戰鬥已結束');
  const st = armyOrderOf(world, 'A');
  const g = world.sides.A.general;
  const soldiers = aliveSoldiersOf(world, 'A');
  const fled = world.fled?.A === true || world.status?.A === 2;
  switch (btn) {
    case 0:
      if (!g.alive) return fail('主將陣亡');
      if ((st.buttons & ARMY_BTN.guardLord) !== 0) return fail('已下令護衛');
      return { ok: true, reason: null };
    case 1:
      // 第二层永远能展开：即使 6 条全灰，也应该让玩家看见"为什么灰"（原作同样可翻页）
      return { ok: true, reason: null };
    case 2: {
      const n = (opts.skills ?? []).length;
      return n > 0 ? { ok: true, reason: null } : fail('無武將技');
    }
    case 3:
      if (!g.alive) return fail('主將陣亡');
      if ((st.buttons & ARMY_BTN.sortie) !== 0) return fail('已出擊');
      if (soldiers <= 0) return fail('已無士兵');
      return { ok: true, reason: null };
    case 4:
      if (!g.alive) return fail('主將陣亡');
      return { ok: true, reason: null };
    case 5:
      if (fled) return fail('我軍已在撤退');
      if (soldiers <= 0) return fail('已無士兵');
      return { ok: true, reason: null };
    default:
      return fail('未知按鈕');
  }
}

/**
 * 第二层子菜单面板：就地盖在 6 大按钮下方那一片（`y = 1116..1332`），
 * **不越出 `CONSOLE_TOP`（1000），也不碰技能栏（x ≤ 498）与提示框（≤ 508）**。
 *
 * 面板从 1116 起是因为第 2 颗「部隊指令」的底边是 1114：把它露在外面，
 * 才能实现「再点一次收起」（`hitTest` 里 btn1 先于面板判定）。
 */
export const ARMY_MENU_RECT: Rect = { x: 512, y: 1116, w: 228, h: 216 };

/** 面板矩形（拷贝，防外部改常量） */
export function armyMenuRect(): Rect {
  return { ...ARMY_MENU_RECT };
}

/** 面板里 6 条子菜单的矩形（每条 220×33，行距 36） */
export function armyCmdRects(): Rect[] {
  const rects: Rect[] = [];
  for (let i = 0; i < 6; i++) {
    rects.push({
      x: ARMY_MENU_RECT.x + 4,
      y: ARMY_MENU_RECT.y + 3 + i * 36,
      w: ARMY_MENU_RECT.w - 8,
      h: 33,
    });
  }
  return rects;
}

export interface ArmyMenuItem {
  /** 子菜单槽号 0..5（= `applyArmyCmd(world, side, slot)` 的 slot） */
  slot: number;
  label: string;
  kind: ArmyCmdKind;
  ok: boolean;
  reason: string | null;
  /** 本槽当前是否已有生效指令（`armyOrderOf().slots[slot] != null`） */
  ordered: boolean;
}

/**
 * 第二层的 6 条：label 取 `armyCmdsOf(formation)`、可用性取 `canUseArmyCmd()`。
 * **视图层不抄任何一条表** —— 33 组阵形 × 6 条全在 core 里（g15）。
 */
export function armyMenuItems(world: World): ArmyMenuItem[] {
  const defs: ArmyCmdDef[] = armyCmdsOf(world.sides.A.formation ?? 0);
  const ordered = armyOrderOf(world, 'A').slots;
  const items: ArmyMenuItem[] = [];
  for (let i = 0; i < 6; i++) {
    const def = defs[i];
    if (!def) continue;
    const chk = canUseArmyCmd(world, 'A', i);
    items.push({
      slot: def.slot,
      label: def.label,
      kind: def.kind,
      ok: chk.ok,
      reason: chk.reason ?? null,
      ordered: (ordered[i] ?? null) !== null,
    });
  }
  return items;
}

/**
 * 面板开合状态。
 *
 * 为什么放在视图层的模块变量里：`main.js` 本轮不归我改（另一个 agent 在动），
 * 而「点部隊指令 → 展开」必须在**不接线**的情况下也能跑通（截图 03/04 就是靠它）。
 * `hitTest` 在点中第 2 颗钮 / 面板外时顺手置位，`buildFrame` 直接读它；
 * `ViewOptions.armyMenu` 可以显式覆盖（测试与将来的 `main.js` 接线都走这条）。
 */
let armyMenuOpened = false;

export function armyMenuOpen(): boolean {
  return armyMenuOpened;
}

/** 显式开合（截图脚本 / 测试 / 将来的 main.js 用） */
export function setArmyMenuOpen(open: boolean): boolean {
  armyMenuOpened = open === true;
  return armyMenuOpened;
}

export function toggleArmyMenu(): boolean {
  armyMenuOpened = !armyMenuOpened;
  return armyMenuOpened;
}

/** 第一层 6 钮的绘制（填充 + 键位 + 正题 + 小字；装饰框由 `web/index.html` 的 `.cmd6` 叠） */
function drawCmd6Bar(out: DrawCmd[], world: World, opts: ViewOptions, menuOpen: boolean): void {
  const defs = cmd6Defs(world);
  const rects = cmd6Rects();
  for (let i = 0; i < CMD6_COUNT; i++) {
    const r = rects[i]!;
    const d = defs[i]!;
    const use = cmd6Usable(world, i, opts);
    const open = i === 1 && menuOpen;
    R(out, r.x, r.y, r.w, r.h, use.ok ? COLORS.panelHi : COLORS.panel, {
      radius: RADIUS.md,
      stroke: open ? COLORS.gold : withAlpha(use.ok ? COLORS.gold : COLORS.white, use.ok ? 0.5 : 0.1),
      width: open ? 2.5 : 1.5,
      alpha: use.ok ? 1 : 0.55,
    });
    // 键位：缩进到内框里（DOM 的 `.cmd6` 有 14px 边，贴角写会被图元压住）
    T(out, r.x + 16, r.y + 24, d.key, 10, COLORS.textDim);
    T(out, r.x + r.w / 2, r.y + 44, d.label, 19, use.ok ? COLORS.text : COLORS.textFaint, {
      align: 'center',
      bold: true,
      maxWidth: r.w - 10,
    });
    T(out, r.x + r.w / 2, r.y + 66, use.ok ? d.sub : (use.reason ?? d.sub), 10, COLORS.textFaint, {
      align: 'center',
      maxWidth: r.w - 8,
    });
  }
}

/** 第二层子菜单的绘制（面板 + 6 行；不可用的整行置灰并在右侧写原因） */
function drawArmyMenu(out: DrawCmd[], world: World): void {
  const panel = ARMY_MENU_RECT;
  // 小尖角指向「部隊指令」那颗钮（第一层第 2 颗）
  const cx = CMD6_X0 + (CMD6_BTN_W + CMD6_GAP_X) + CMD6_BTN_W / 2;
  P(
    out,
    [
      { x: cx - 9, y: panel.y + 1 },
      { x: cx + 9, y: panel.y + 1 },
      { x: cx, y: panel.y - 8 },
    ],
    'rgba(8,10,14,.96)',
    { stroke: COLORS.gold, width: 1, close: true },
  );
  R(out, panel.x, panel.y, panel.w, panel.h, 'rgba(8,10,14,.96)', {
    radius: RADIUS.md,
    stroke: COLORS.gold,
    width: 1.5,
  });
  const rows = armyCmdRects();
  const items = armyMenuItems(world);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const it = items[i];
    if (!it) continue;
    R(out, r.x, r.y, r.w, r.h, withAlpha(it.ok ? COLORS.panelHi : COLORS.panel, it.ok ? 0.92 : 0.82), {
      radius: RADIUS.sm ?? 4,
      stroke: it.ordered ? COLORS.gold : withAlpha(COLORS.white, 0.06),
      width: it.ordered ? 1.5 : 1,
    });
    T(out, r.x + 6, r.y + 22, `${i + 1}`, 10, COLORS.textFaint);
    T(out, r.x + 22, r.y + 23, it.label, 13, it.ok ? COLORS.text : COLORS.textFaint, {
      bold: it.ok,
      maxWidth: 104,
    });
    const right = it.ordered ? '已下令' : it.ok ? '' : (it.reason ?? '不可用');
    if (right) {
      T(out, r.x + r.w - 6, r.y + 22, right, 9, it.ordered ? COLORS.gold : COLORS.textFaint, {
        align: 'right',
        maxWidth: 74,
      });
    }
  }
}

/** 命中 → `cmd6` 结果（把可用性一起带出去，`main.js` 不用再问一次 core） */
function cmd6Hit(world: World, btn: number, opts: ViewOptions): Hit {
  const defs = cmd6Defs(world);
  const d = defs[btn] ?? defs[0]!;
  const use = cmd6Usable(world, btn, opts);
  return { type: 'cmd6', btn, kind: d.kind, label: d.label, canUse: use.ok, reason: use.reason };
}

/**
 * HUD / 控制台的主将数值文本。
 *
 * 原作 HUD（`0x4412C0`）体力/技力都画 `%d/%d`（当前/上限），本作以前只画单值。
 * 这里只做格式化，数值全部来自 core 的 `GeneralState`（`hp/maxHp`、`mp/mpMax`）。
 */
export function vitalText(label: string, cur: number, max: number): string {
  const c = Math.max(0, Math.ceil(Number.isFinite(cur) ? cur : 0));
  const m = Math.max(0, Math.ceil(Number.isFinite(max) ? max : 0));
  return `${label} ${c}/${m}`;
}

/**
 * 行动条的量程**只读 core**（`actionIntervalOf`）：普通 40 帧、撤退/溃退态（`0x4000`）46 帧。
 *
 * R159 修正（`project/160_撤退态0x4000.md`）：旧实现在这一层给**所有主将**把量程拉到 46 并画一根
 * 40/46 的白刻度，那是基于「46 是主将专属档位」的误读 —— 46 与 40 是同一字段 `[u+0x34]`
 * （`0x43B5DE …28` / `0x43B5FD …2e`），只有撤退态才走 46。旧画法的后果是**非撤退主将的条永远
 * 停在 87% 就复位**，属真 bug，已删掉这层抬升。
 *
 * `GENERAL_SLOW_INTERVAL` 保留导出：它是 core 那个常量的镜像，测试与 HUD 刻度仍要引用。
 */
export const GENERAL_SLOW_INTERVAL = 46;

export interface ActionGauge {
  /** core 的 `u.cd`（距下次行动还剩几 tick） */
  remain: number;
  /** core `actionIntervalOf(u)` */
  interval: number;
  /** 显示量程：与 `interval` 同值（撤退态 46 / 普通 40） */
  slow: number;
  /** 0..1：进度 */
  ratio: number;
  /** 复位刻度位置，恒为 1（量程就是本单位的真实间隔） */
  mark: number;
}

/** 行动条的数据模型：数值只读 core 的 `u.cd` 与 `actionIntervalOf()`。 */
export function actionGaugeOf(u: Pick<Unit, 'cd' | 'isGeneral' | 'status'> & { flee?: boolean }): ActionGauge {
  const slow = Math.max(1, actionIntervalOf(u as Unit));
  const interval = slow;
  const remain = clamp(u.cd, 0, interval);
  const mark = interval / slow;
  return {
    remain,
    interval,
    slow,
    ratio: clamp((interval - remain) / slow, 0, 1),
    mark,
  };
}

/** 找一侧的主将单位（`world.sides[side].general` 是数据快照，`cd` 在单位上） */
export function generalUnitOf(world: World, side: Side): Unit | undefined {
  return world.units.find((u) => u.side === side && u.isGeneral === true);
}

/** 从数据表生成技能栏（最多 8 格，表现层新增，不改消耗与冷却） */
export function makeSkillBar(data: GameData, seqs: readonly number[] = DEFAULT_SKILL_SEQ): SkillSlot[] {
  return seqs.slice(0, MAX_SKILL_SLOTS).map((seq) => {
    const m = data.magics.find((x) => x.SEQUENCE === seq);
    return {
      seq,
      name: m?.NAME ?? `技能${seq}`,
      mp: m?.MP ?? 0,
      qi: qiCostOf(data, seq),
      kind: skillKindOf(data, seq),
    };
  });
}

export type CastReason = 'over' | 'dead' | 'mp' | 'qi';

/**
 * 该武将「到 `level` 为止已习得」的武将技 seq（数据 `general.SKILL` 的 `[习得等级, 技seq]` 对）。
 *
 * 为什么需要它：`DEFAULT_SKILL_SEQ` 是与上阵者无关的写死 4 格（`[1, 50, 2, 104]`），而
 * 104=神鬼亂舞(MP47) 只有少数武将学得到（張飛 Lv39 才有；張角的 SKILL 表里根本没有 104）。
 * 第 4 格对張角曾经永远是死的 —— 这是"技能栏不是按将生成的"造成的，**不是 MP 门槛**造成的
 * （MP 门槛的账单独算，见 `project/105_战斗反馈与节奏.md` §3）。
 *
 * 8 格：原作技能栏是 `byte[8]`，所以 `max` 默认取 `MAX_SKILL_SLOTS`。`web/main.js:718`
 * 已经是 `makeSkillBar(d, learnedSkillSeqs(d, name, level))`，本函数放宽到 8 后线上自动
 * 跟着变成「按将、按等级、最多 8 格」；不足 8 条就返回几条（绘制端也不补空格）。
 */
export function learnedSkillSeqs(
  data: GameData,
  name: string | undefined,
  level = 1,
  max = MAX_SKILL_SLOTS,
): number[] {
  const fallback = DEFAULT_SKILL_SEQ.slice(0, max);
  if (!name) return fallback;
  const row = data.generals.find((g) => g.NAME === name);
  if (!row?.SKILL || row.SKILL.length === 0) return fallback;
  // 数据层把 `SKILL` 声明成 `[number, number][]`（types.ts:80），实际 JSON 里是
  // `["1, 49", "7, 56", …]` 这种字符串（`game/data/generals.json`）。两种都吃。
  const pairs: Array<[number, number]> = [];
  for (const raw of row.SKILL as unknown as Array<[number, number] | string>) {
    const p = typeof raw === 'string' ? raw.split(',').map((x) => Number(x.trim())) : raw;
    const need = p[0];
    const seq = p[1];
    if (Number.isFinite(need) && Number.isFinite(seq)) pairs.push([need as number, seq as number]);
  }
  if (pairs.length === 0) return fallback;
  const lv = Math.max(1, Math.floor(level));
  const learned = pairs.filter(([need]) => lv >= need).map(([, seq]) => seq);
  if (learned.length === 0) return pairs.slice(0, max).map(([, seq]) => seq);
  // 只留最新 max 条：等级越高，技位越满
  return learned.slice(-max);
}
/** 技能格置灰判定（合法性仍由 core.cast 最终决定） */
export function castBlockReason(world: World, slot: SkillSlot): CastReason | null {
  if (world.over) return 'over';
  const g = world.sides.A.general;
  if (!g.alive) return 'dead';
  // 与 core.cast 的判定顺序保持一致：先 MP，再气力
  if (g.mp < slot.mp) return 'mp';
  if (!Number.isFinite(slot.qi) || g.qi < slot.qi) return 'qi';
  return null;
}

export function skillRadius(kind: SkillSlot['kind']): number {
  if (kind === 'aoe') return 3.6;
  if (kind === 'strike') return 1.8;
  return 1.2;
}

// ---------------------------------------------------------------------------
// 指令构造小工具
// ---------------------------------------------------------------------------

interface RectOpts {
  stroke?: string;
  width?: number;
  radius?: number;
  alpha?: number;
}

function R(
  out: DrawCmd[],
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: string,
  o: RectOpts = {},
): void {
  out.push({
    kind: 'rect',
    x,
    y,
    w,
    h,
    fill,
    stroke: o.stroke,
    width: o.width,
    radius: o.radius,
    alpha: o.alpha,
  });
}

function LN(
  out: DrawCmd[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width = 1,
  alpha = 1,
  dash?: number[],
): void {
  out.push({ kind: 'line', x1, y1, x2, y2, stroke, width, alpha, dash });
}

function P(
  out: DrawCmd[],
  points: { x: number; y: number }[],
  fill?: string,
  o: { stroke?: string; width?: number; close?: boolean; alpha?: number } = {},
): void {
  out.push({
    kind: 'poly',
    points,
    fill,
    stroke: o.stroke,
    width: o.width,
    close: o.close ?? true,
    alpha: o.alpha,
  });
}

function E(
  out: DrawCmd[],
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill?: string,
  o: { stroke?: string; width?: number; dash?: number[]; alpha?: number } = {},
): void {
  out.push({
    kind: 'ellipse',
    x,
    y,
    rx,
    ry,
    fill,
    stroke: o.stroke,
    width: o.width,
    dash: o.dash,
    alpha: o.alpha,
  });
}

interface TextOpts {
  align?: TextAlign;
  baseline?: TextBaseline;
  bold?: boolean;
  stroke?: string;
  strokeWidth?: number;
  maxWidth?: number;
  alpha?: number;
}

function T(
  out: DrawCmd[],
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
  o: TextOpts = {},
): void {
  out.push({
    kind: 'text',
    x,
    y,
    text,
    size,
    color,
    align: o.align,
    baseline: o.baseline,
    bold: o.bold,
    stroke: o.stroke,
    strokeWidth: o.strokeWidth,
    maxWidth: o.maxWidth,
    alpha: o.alpha,
  });
}

/** 进度条：底 + 填充 + 细边 */
function bar(
  out: DrawCmd[],
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
  o: { mirror?: boolean; alpha?: number; bg?: string } = {},
): void {
  const r = clamp(ratio, 0, 1);
  R(out, x, y, w, h, o.bg ?? 'rgba(255,255,255,0.10)', { radius: h / 2, alpha: o.alpha });
  const fw = w * r;
  if (fw > 0.5) {
    R(out, o.mirror ? x + w - fw : x, y, fw, h, color, { radius: h / 2, alpha: o.alpha });
  }
  R(out, x, y, w, h, undefined, {
    stroke: withAlpha(COLORS.white, 0.14),
    width: 1,
    radius: h / 2,
    alpha: o.alpha,
  });
}

// ---------------------------------------------------------------------------
// 帧构建
// ---------------------------------------------------------------------------

export function buildFrame(world: World, opts: ViewOptions = {}): DrawCmd[] {
  const camX = opts.camX ?? camera(world);
  const out: DrawCmd[] = [];

  drawField(out, camX, opts.time ?? 0, bgReady(world.terrain ?? 0));
  drawAim(out, world, camX, opts);
  drawActors(out, world, camX, opts.atlas ?? null, opts.units ?? null);
  // 特效画在兵之上：原作里武将技是盖在战场上的，叠在最底层会被 100 个兵挡住
  drawFx(out, world, camX, opts.fx ?? null);
  // R187：投射物画在特效之后（箭要压在爆点上），只读 core 的事件，不碰命中
  drawProjectiles(out, world, camX, opts.fx ?? null);
  drawFloaters(
    out,
    opts.floaters ?? [],
    camX,
    world.skillMarks ?? [],
    world.tick,
    world.sessions.length > 0,
  );
  drawMinimap(out, world, camX);
  drawHud(out, world);

  const mode = opts.mode ?? 'fighting';
  drawConsole(out, world, opts);
  if (mode === 'ready') drawReady(out, world, opts);
  else if (mode === 'settled') drawSettle(out, world, opts);
  // 開場叫陣：最後畫，蓋在 HUD/提示框之上（原作叫陣時台詞優先，其餘讓位）
  drawTaunt(out, opts.taunt);
  return out;
}

/**
 * 战场底纹（R193 透视版）。
 *
 * 格阵本身仍是 71 列 × 14 行（`core.battle` 的 GRID_W/GRID_H），但落屏要跟
 * `projection.ts` 的透视走：**横线随深度变宽变密、竖线向上收敛**，
 * 于是整块战场读起来是「一条向远方收窄的路」，而不是 R193 之前的等距方格纸。
 *
 * 关键：这里的每条线都从 `rowScreenY` / `rowEdgeX` / `laneScreenX` 取坐标，
 * 与单位、命中测试共用同一套公式（`drawField` 里不再出现 `ROW_PX` / `LANE_PX` 的线性换算）。
 */
function drawField(out: DrawCmd[], camX: number, time: number, bgPainted = false): void {
  // 原作战场贴图已经画在 Canvas 底上了（render() 里 drawBattleBg 先画），这里再铺纯色
  // 会把它整块盖掉 —— 贴图没解码完的那几帧才回退纯色，所以不会闪黑。
  if (!bgPainted) R(out, FIELD.x, FIELD.y, FIELD.w, FIELD.h, COLORS.field);

  // 上沿 = 可见的最远行、下沿 = 可见的最近行（透视两端不对称，不能再按 ±450/ROW_PX 算）
  const info = projectionInfo(camX);
  const rFar = info.farRow - camX; // = −ROWS_FAR ≈ −7.43
  const rNear = info.nearRow - camX; // = +ROWS_NEAR ≈ +5.90
  const leftFar = rowEdgeX(rFar, -1);
  const rightFar = rowEdgeX(rFar, 1);
  const leftNear = rowEdgeX(rNear, -1);
  const rightNear = rowEdgeX(rNear, 1);

  // 车道底色：奇偶交替，给 14 条车道一点可读性。透视后每条车道是上窄下宽的梯形。
  for (let lane = 0; lane < GRID_H; lane++) {
    if (lane % 2 === 0) continue;
    P(
      out,
      [
        { x: laneScreenX(lane - 0.5, rFar), y: FIELD_TOP },
        { x: laneScreenX(lane + 0.5, rFar), y: FIELD_TOP },
        { x: laneScreenX(lane + 0.5, rNear), y: FIELD_BOTTOM },
        { x: laneScreenX(lane - 0.5, rNear), y: FIELD_BOTTOM },
      ],
      COLORS.white,
      { alpha: 0.012 },
    );
  }

  // 车道分隔线（14 条车道 → 13 根内线）：屏幕上是向远方收敛的斜线
  for (let lane = 1; lane < GRID_H; lane++) {
    const strong = lane === 7;
    LN(
      out,
      laneScreenX(lane - 0.5, rFar),
      FIELD_TOP,
      laneScreenX(lane - 0.5, rNear),
      FIELD_BOTTOM,
      strong ? withAlpha(COLORS.gold, 0.16) : withAlpha(COLORS.white, 0.055),
      strong ? 1.5 : 1,
    );
  }
  // 两侧边线（最外沿）：把「路」的两条边画出来，透视才读得出来
  LN(out, leftFar, FIELD_TOP, leftNear, FIELD_BOTTOM, withAlpha(COLORS.gold, 0.10), 1);
  LN(out, rightFar, FIELD_TOP, rightNear, FIELD_BOTTOM, withAlpha(COLORS.gold, 0.10), 1);

  // 推进轴横线：只画可见范围，每 5 行加重；每条横线的左右端点都按**它自己那一行**的宽度取
  const min = Math.max(0, Math.floor(info.farRow));
  const max = Math.min(GRID_W - 1, Math.ceil(info.nearRow));
  for (let gx = min; gx <= max; gx++) {
    const r = gx - camX;
    const y = rowScreenY(r);
    if (y < FIELD_TOP - 2 || y > FIELD_BOTTOM + 2) continue;
    const strong = gx % 5 === 0;
    LN(
      out,
      rowEdgeX(r, -1),
      y,
      rowEdgeX(r, 1),
      y,
      strong ? withAlpha(COLORS.white, 0.10) : withAlpha(COLORS.white, 0.035),
      strong ? 1.2 : 1,
    );
    if (strong) {
      T(out, 4, y - 3, String(gx), 10, COLORS.textFaint, { alpha: 0.75 });
    }
  }

  // 中线（纯视觉参照，不参与规则）
  const midR = GRID_W / 2 - camX;
  const midY = rowScreenY(midR);
  if (midY > FIELD_TOP && midY < FIELD_BOTTOM) {
    LN(
      out,
      rowEdgeX(midR, -1),
      midY,
      rowEdgeX(midR, 1),
      midY,
      withAlpha(COLORS.gold, 0.10),
      1,
      1,
      [7, 9],
    );
    T(out, DESIGN_W - 16, midY - 6, '中線', 10, withAlpha(COLORS.gold, 0.38), {
      align: 'right',
    });
  }

  // 上下沿 + 阵营方向提示（沿梯形上/下边画，宽度不同）
  LN(out, leftFar, FIELD_TOP + 0.5, rightFar, FIELD_TOP + 0.5, withAlpha(COLORS.gold, 0.32), 1.5);
  LN(out, leftNear, FIELD_BOTTOM - 0.5, rightNear, FIELD_BOTTOM - 0.5, withAlpha(COLORS.ours, 0.42), 1.5);
  T(out, DESIGN_W / 2, FIELD_TOP + 15, '敵 方 · 前 線', 11, withAlpha(COLORS.enemyLight, 0.65), {
    align: 'center',
  });
  T(out, DESIGN_W / 2, FIELD_BOTTOM - 8, '我 方 · 本 陣', 11, withAlpha(COLORS.oursLight, 0.75), {
    align: 'center',
  });

  // 极轻的呼吸暗角，避免战场带与 HUD 生硬拼接
  const pulse = 0.02 + 0.01 * Math.sin(time * 1.3);
  R(out, 0, FIELD_TOP, DESIGN_W, 54, COLORS.bgDeep, { alpha: pulse + 0.10 });
  R(out, 0, FIELD_BOTTOM - 54, DESIGN_W, 54, COLORS.bgDeep, { alpha: pulse + 0.10 });
}

function drawActors(
  out: DrawCmd[],
  world: World,
  camX: number,
  atlas: SpriteAtlas | null,
  units: UnitsAtlas | null,
): void {
  const actors: Actor[] = [];
  for (const u of world.units) {
    // R194：阵亡窗口两侧都放行 —— 我方朴刀兵有 death_back 帧，其余兵种 / 敵方走
    // 「冻结当时那一帧 + 程序化倒地」，否则敵兵是「原地消失」（用户反馈之一）。
    const dyingAge = deathAgeOf(u, world);
    if (!u.alive && dyingAge === null && !generalDying(world, u)) continue;
    // R193：一次投影拿齐 (sx, sy, scale)，后面绘制/缩放都不再自己换算
    const p = projectUnit(u.x, u.y, camX);
    if (p.sy < FIELD_TOP - 80 || p.sy > FIELD_BOTTOM + 80) continue;
    actors.push({ u, p, dyingAge, sx0: p.sx });
  }
  // 远者（worldX 小，屏幕上方）先画；同深度时士兵先、主将后
  actors.sort((a, b) => {
    if (a.u.x !== b.u.x) return a.u.x - b.u.x;
    if (a.u.y !== b.u.y) return a.u.y - b.u.y;
    return uGeneral(a.u) === uGeneral(b.u) ? 0 : uGeneral(a.u) ? 1 : -1;
  });
  spreadSlidingActors(actors);
  for (const a of actors) {
    const mark = out.length;
    if (uGeneral(a.u)) drawGeneral(out, world, a.u, a.p);
    else drawSoldier(out, world, a.u, a.p, atlas, units, a.dyingAge);
    // R194：受击反馈（后仰 + 白闪 + 冲击星）压在该单位刚画出来的指令之后，
    // 所以三条降级路径（兵种图集 / 老图集 / 色块）都能吃到。
    pushHitFlash(out, world, a.u, a.p, mark);
  }
}

/**
 * R194：滑行对穿「错位」—— 40 tick 的线性滑行只在**落点格**做占位校验（`commitStep`），
 * 两个单位沿同一车道对穿时中途会重合到同一个像素上（实测最小中心距 0.14px），
 * 这是「兵与兵叠在一起」最刺眼的一档（>75% 完全重合 1.03 对/帧）。
 *
 * 不做逻辑阻挡（原作本来就允许换位，禁止会让包抄卡住），只在绘制前做一次横向松弛：
 * 脚底 y 相差 24px 以内、横向不足 `MIN_BODY_GAP` 的一对，**谁在滑谁让开**
 * （单方滑最多让 12px，双方都滑各让一半最多 6px）。静止阵型一个像素都不动，
 * 所以站位、点选命中都不受影响；主将只被让路、自己不位移（点将不能飘）。
 *
 * 要迭代 6 轮：两人已经**交叉过去**时第一轮只把它们分开 12px，仍可能贴在一起
 * （实测 tick 763 两个 B 骑兵正好卡在「分开 1px」），3 轮能到 10px、6 轮 20px。
 * 每轮结束把每个演员的横向位移夹在 ±`MAX_SPREAD` 内：密集挤在一起时松弛可能把
 * 某个人推到离真实位置很远的地方，夹住上限保证「最多偏半条车道」。
 */
const MIN_BODY_GAP = 22; // 躯干宽 28px 的一半，够把「叠死」压成「肩并肩」
const MAX_SPREAD = 20; // 单个演员最多被推开 20px（≈半条车道）；正常只有 6~9px，
// 这个上限是防「一堆人挤成一坨」时松弛把人推到离格子太远的地方

type Actor = { u: Unit; p: UnitProjection; dyingAge: number | null; sx0: number };

function spreadSlidingActors(actors: Actor[]): void {
  for (let iter = 0; iter < 6; iter += 1) {
    for (let i = 0; i < actors.length; i += 1) {
      const a = actors[i]!;
      for (let j = i + 1; j < actors.length; j += 1) {
        const b = actors[j]!;
        if (Math.abs(a.p.sy - b.p.sy) > 24) continue; // 不同排，各画各的
        const dx = b.p.sx - a.p.sx;
        const need = MIN_BODY_GAP - Math.abs(dx);
        if (need <= 0) continue;
        const slideA = a.u.slide != null && !uGeneral(a.u);
        const slideB = b.u.slide != null && !uGeneral(b.u);
        if (!slideA && !slideB) continue;
        const dir = dx >= 0 ? 1 : -1;
        const push = slideA && slideB ? Math.min(need / 2, 6) : Math.min(need, 12);
        if (slideA) a.p.sx -= dir * push;
        if (slideB) b.p.sx += dir * push;
      }
    }
    for (const a of actors) {
      a.p.sx = Math.max(a.sx0 - MAX_SPREAD, Math.min(a.sx0 + MAX_SPREAD, a.p.sx));
    }
  }
}

/**
 * R194：受击反馈 —— 命中后 `HIT_FLASH_TICKS`(6) tick 内，把该单位刚画出的 sprite
 * 整体后仰 3px、头 2 tick 叠一层 `lighter` 白闪，并在胸口高度画一个「冲击星」。
 *
 * 为什么不用 `hit_back` 帧：士兵一击必死，「活着且刚挨打」这个状态不存在；
 * `actions.json` 也只有背视素材，敵方用不上。程序化反馈两侧、全兵种统一生效，0 素材依赖。
 *
 * 为什么在 `drawActors` 里做而不是 `drawSoldier` 里：`drawSoldier` 有 4 条提前 return
 * 的降级路径，放在外面只写一次；`from` 之后的指令全部属于这个单位，不会误伤。
 */
function pushHitFlash(
  out: DrawCmd[],
  world: World,
  u: Unit,
  p: UnitProjection,
  from: number,
): void {
  const age = hitAgeOf(u, world);
  if (age === null) return;
  const s = p.scale;
  const k = 1 - age / HIT_FLASH_TICKS; // 1 → 0
  // 1) 后仰：朝自己背后（远离敌人）推 3px，影子不跟着动（脚还踩在地上）
  const back = (u.side === 'A' ? 1 : -1) * 3 * k;
  let lastSprite = -1;
  for (let i = from; i < out.length; i += 1) {
    const c = out[i]!;
    if (c.kind !== 'sprite') continue;
    c.y += back;
    lastSprite = i;
  }
  // 2) 白闪：头 2 tick 用 lighter 再叠一层（不新增素材，纯合成）
  if (age <= 1 && lastSprite >= 0) {
    const c = out[lastSprite]!;
    if (c.kind === 'sprite') out.push({ ...c, comp: 'lighter', alpha: 0.55 });
  }
  // 3) 冲击星：胸口高度画三条短线（"米"字），随年龄缩小、变淡
  const cx = Math.round(p.sx);
  const cy = Math.round(p.sy) - 40 * s;
  const r = (6 + 4 * k) * s;
  const col = withAlpha(COLORS.goldLight, 0.9 * k);
  LN(out, cx - r, cy - r * 0.55, cx + r, cy + r * 0.55, col, 1.6 * s);
  LN(out, cx - r, cy + r * 0.55, cx + r, cy - r * 0.55, col, 1.6 * s);
  LN(out, cx, cy - r * 0.85, cx, cy + r * 0.85, withAlpha(COLORS.white, 0.7 * k), 1.2 * s);
}

function uGeneral(u: Unit): boolean {
  return (u as unknown as { isGeneral?: boolean }).isGeneral === true;
}

/**
 * 把「刚压进去的 sprite 指令」按该行的透视缩放 `s` 缩放（R193）。
 *
 * 为什么是后处理而不是给 `animSelect.ts` / `pushSpriteFrames` 加个 scale 参数：
 * 这两个模块不在本次可改范围（只许动 layout / battleView / projection / projection.test），
 * 而它们把锚点写死成「底边中点 = (x, y + 26)」。这里在它们之后再缩放一次：
 * 尺寸 ×s、底边相对**地面点** `(gx, gy)` 的偏移也 ×s ⇒ 脚底仍踩在同一条地面线上，
 * 远排不会悬空、近排也不会插进地里。
 */
function scaleSpriteCmds(
  out: DrawCmd[],
  from: number,
  s: number,
  groundX: number,
  groundY: number,
): void {
  if (!(s > 0) || Math.abs(s - 1) < 1e-9) return;
  for (let i = from; i < out.length; i += 1) {
    const c = out[i]!;
    if (c.kind !== 'sprite') continue;
    c.x = groundX + (c.x - groundX) * s;
    c.y = groundY + (c.y - groundY) * s;
    c.w *= s;
    c.h *= s;
  }
}

function drawSoldier(
  out: DrawCmd[],
  world: World,
  u: Unit,
  p: UnitProjection,
  atlas: SpriteAtlas | null,
  units: UnitsAtlas | null,
  dyingAge: number | null = null,
): void {
  const dir = u.side === 'A' ? -1 : 1; // 我方朝上（屏幕 y 减小），敌方朝下
  const s = p.scale; // 该行的透视缩放（远排 0.74、近排 1.18）
  const fx = Math.round(p.sx);
  const fy = Math.round(p.sy);
  // R194：尸体冻结在阵亡那一 tick 的帧（否则倒地过程里还在原地踏步），再叠程序化倒地。
  const animTick = dyingAge === null ? world.tick : world.tick - dyingAge;

  // 影子贴地：半径和「下沉 13px」都跟着行缩放走，否则远排影子飘、近排影子陷
  E(out, fx, fy + 13 * s, 12 * s, 4 * s, COLORS.shadow);

  // 兵种图集（units.json）先选套：弓/弩 → archer 组（拉弓），其余兵种返回 null。
  // 图集没拉下来 / 图没 onload / 组缺失时这里同样是 null，下面老路径原样兜底。
  const set = pickUnitFrames(world, u, { units });

  // 背视动作帧（攻击/受击/死亡）：有就画完直接返回，否则退回走路序列 / 色块。
  // 例外：弓兵自带拉弓帧，而 animSelect 的 attack_back 是朴刀挥砍的背视帧，
  // 让它接管出手后的 10 tick 就成「拉弓拉到一半突然换刀」——所以有自有攻击帧时
  // 让开攻击窗口（受击 / 阵亡仍走动作帧）。
  const act0 = pickActionFrame(u, world, actionAtlas);
  const act = set && set.attack.length > 0 && act0?.key === 'attack_back' ? null : act0;
  let mark = out.length;
  if (pushActionSprite(out, act, fx, fy)) {
    scaleSpriteCmds(out, mark, s, fx, fy);
    return;
  }
  if (!u.alive && dyingAge === null) return; // 死亡窗口外 / 没有尸体系：别画站着的尸体

  // 画真序列帧，三级降级：兵种图集 → 老图集（walk_back / walk_front）→ 色块。
  // 我方=背视、敌方=正视；同一 tick 内按单位格位错开相位，否则 100 个兵会完全同步
  // 踏步（一眼假）。
  mark = out.length;
  if (
    set &&
    pushSpriteFrames(
      out,
      set.img,
      units?.frames ?? {},
      set.frames,
      set.attack,
      u,
      animTick,
      set.hold,
      fx,
      fy,
      true,
      set.w,
    )
  ) {
    scaleSpriteCmds(out, mark, s, fx, fy);
    if (dyingAge !== null) toppleCorpse(out, mark, u.side, dyingAge);
    return;
  }
  if (atlas) {
    const img = u.side === 'A' ? atlas.img : (atlas.imgEnemy ?? atlas.img);
    const walk = u.side === 'A' ? atlas.back : atlas.front;
    // 老图集的攻击帧只有正视一套、两侧共用；A 侧出手那段已被 animSelect 的动作帧接管
    const hold = atlas.hold ?? 5;
    mark = out.length;
    if (
      pushSpriteFrames(out, img, atlas.frames, walk, atlas.attack ?? [], u, animTick, hold, fx, fy, !usesActionFrames(u))
    ) {
      scaleSpriteCmds(out, mark, s, fx, fy);
      if (dyingAge !== null) toppleCorpse(out, mark, u.side, dyingAge);
      return;
    }
  }

  // 色块降级：所有尺寸/偏移都 ×s（同一套透视，不搞两套口径）
  R(out, fx - 11 * s, fy - 16 * s, 22 * s, 32 * s, sideDark(u.side), {
    radius: 3 * s,
    stroke: withAlpha(COLORS.black, 0.55),
    width: 1,
  });
  R(out, fx - 8 * s, fy - 13 * s, 16 * s, 26 * s, sideColor(u.side), { radius: 2 * s });
  R(out, fx - 8 * s, fy - 13 * s, 16 * s, 6 * s, sideLight(u.side), { radius: 2 * s, alpha: 0.38 });
  // 朝向缺口：三角形永远在"朝前"的那条边上
  P(
    out,
    [
      { x: fx - 5 * s, y: fy + dir * 16 * s },
      { x: fx + 5 * s, y: fy + dir * 16 * s },
      { x: fx, y: fy + dir * 23 * s },
    ],
    sideLight(u.side),
    { alpha: 0.95 },
  );
  // 武器：一根短斜线，横屏/竖屏都不改逻辑，只增加剪影辨识
  LN(out, fx + 9 * s, fy - 2 * s, fx + 14 * s, fy - 18 * s, withAlpha(COLORS.goldLight, 0.55), 1.5);
}

/**
 * R194：程序化倒地 —— 把刚画出来的尸体镜头按阵亡年龄「放倒 + 淡出」。
 *
 * 为什么不用帧：`actions.json` 只有一套朴刀兵的背视阵亡帧，13 个兵种共用它会出现
 * 「骑兵用朴刀的倒地姿势」；敵方更是连背视都没有（正视素材缺失）。
 * 这里绕开素材：**冻结阵亡那一 tick 的帧**（`drawSoldier` 的 `animTick`），
 * 然后绕脚底点旋转到 立→倒，最后 45% 的窗口淡出——三个数字就能读出「被打倒了」。
 *
 * 旋转由渲染层的 `SpriteCmd.rot` 支持（绕 (x,y) 锚点转），不需要新原语。
 */
function toppleCorpse(out: DrawCmd[], from: number, side: 'A' | 'B', age: number): void {
  const k = Math.min(1, age / Math.max(1, DEATH_TICKS - 1)); // 0 → 1
  const rot = (side === 'A' ? 1 : -1) * (0.10 + 1.25 * k);
  // 前 55% 窗口保持不透明，后 45% 淡出（0 时直接消失，不留「半透明站尸」）
  const fade = Math.max(0, 1 - Math.max(0, k - 0.55) / 0.45);
  for (let i = from; i < out.length; i += 1) {
    const c = out[i]!;
    if (c.kind !== 'sprite') continue;
    c.rot = rot;
    if (fade < 1) c.alpha = Math.min(c.alpha ?? 1, fade);
  }
}

/**
 * 从一组帧名里挑这一 tick 的那一帧并压入一条 sprite 指令。
 *
 * 出手后的一小段窗口播攻击帧：由 `attackAgeOf()` 读 core 写在**真出手那一 tick** 的
 * `u.lastAttackTick`（`battle.ts:2515`），把攻击帧均匀铺满 24 tick（≈0.4s @60Hz），
 * 播完自动回到走路帧。
 * 其余时间按「初始格位 + tick」算走路相位（`Unit` 没有 id，同一格永远同一相位）。
 * （R84 起这里曾用 `u.cd > interval-24` 近似「刚出手」，但 `cd` 在移动/待機分支也会
 *  被重置，等于全员一直在空挥；R194 改成事件驱动。）
 *
 * 帧名在 `rects` 里查不到（图集是半成品）就返回 false，让调用方继续往下降级 ——
 * 绝不把 NaN 塞进 drawImage。
 *
 * 屏幕宽度 `designW`：兵种图集按**帧画布宽 1:1** 落屏（`units.json` 的 75 = 原作 100 × 0.75），
 * 图集生成时已经缩过一次，再按 66/75 缩第二次就是白白多一道重采样 —— 士兵会糊，
 * 而且比原作小（project/189 §5）。老 `atlas.json`（80 宽画布）/ 脏数据仍按 66 的老口径。
 */
function pushSpriteFrames(
  out: DrawCmd[],
  img: CanvasImageSource,
  rects: Record<string, SpriteFrame>,
  walk: string[],
  atk: string[],
  u: Unit,
  tick: number,
  hold: number,
  fx: number,
  fy: number,
  allowSwing: boolean,
  designW = 66,
): boolean {
  if (walk.length === 0) return false;
  // R194：攻击帧窗口改由**真实出手事件**驱动（`lastAttackTick`），不再看 `u.cd`。
  // 旧的 `u.cd > interval - 24` 看上去等价，实际上 `cd` 在**移动/待機分支也会被重置**
  // （`battle.ts:2534`），于是每个兵每个行动周期都有 24/40 tick 在空挥：行军、站桩、
  // 待機都在砍空气，真正那一刀反而没有任何额外表现（用户反馈「攻击没有动作」）。
  const swingTicks = 24; // 24 tick @60Hz ≈ 0.4s，10 帧播完 ≈ 25fps
  const age = allowSwing && atk.length > 0 ? attackAgeOf(u, tick, swingTicks) : null;
  const swinging = age !== null;
  const seq = swinging ? atk : walk;
  let idx: number;
  if (swinging) {
    idx = Math.min(atk.length - 1, Math.max(0, Math.floor(age / (swingTicks / atk.length))));
  } else {
    const phase = Math.floor(u.x * 7 + u.y * 13) + Math.floor(tick / Math.max(1, hold));
    idx = ((phase % seq.length) + seq.length) % seq.length;
  }
  const name = seq[idx];
  if (name === undefined) return false;
  const f = rects[name];
  if (!f) return false;
  // 屏幕宽度：兵种图集用帧画布宽 1:1（75），老图集 / 脏数据退回 66（80 宽画布时代的口径）。
  const w = designW > 0 ? designW : 66;
  const h = (f.h / f.w) * w;
  out.push({
    kind: 'sprite',
    img,
    sx: f.x, sy: f.y, sw: f.w, sh: f.h,
    x: fx, y: fy + 26,
    w, h,
  });
  return true;
}

function drawGeneral(out: DrawCmd[], world: World, u: Unit, p: UnitProjection): void {
  const s = p.scale; // R193：该行的透视缩放，主将也吃同一套，不许例外
  const fx = Math.round(p.sx);
  const fy = Math.round(p.sy);
  const side = u.side;
  const g = world.sides[side].general;
  const dir = side === 'A' ? -1 : 1;
  const name = g.name || (side === 'A' ? '我軍主將' : '敵軍主將');
  // 主将与士兵共用同一条地面线：士兵贴图底边在「地面点 + 26·scale」（见 drawSoldier）
  const gy = fy + 26 * s;

  // 原作武将小人（坐骑 → 身体 → 兵器）。图集没就绪 / 造型缺失 / 页面没解码完 → null，
  // 下面整块退回原来的矢量小人，画面不会空。
  // `generalLayers` 自带 scale 参数（锚点 = 脚底地面点），直接吃透视缩放。
  const layers = generalLayers(world, u, fx, gy, s);

  // 脚下光环 + 阴影（半径 /= 偏移都按 s 缩放）
  E(out, fx, gy + 2 * s, (layers ? 66 : 28) * s, (layers ? 15 : 9) * s, withAlpha(COLORS.black, 0.35));
  E(out, fx, gy, (layers ? 64 : 26) * s, (layers ? 14 : 9) * s, undefined, {
    stroke: withAlpha(COLORS.gold, 0.55),
    width: 1.5,
  });
  // 旗（有图集时挪到坐骑外侧，不然会插在马身上）
  const flagX = fx + (layers ? 64 : 25) * s;
  const flagTop = gy - (layers ? 104 : 50) * s;
  LN(out, flagX, flagTop, flagX, gy - 6 * s, withAlpha(COLORS.gold, 0.65), 2);
  P(
    out,
    [
      { x: flagX, y: flagTop },
      { x: flagX + 14 * s, y: flagTop + 6 * s },
      { x: flagX, y: flagTop + 12 * s },
    ],
    sideColor(side),
    { alpha: 0.9 },
  );

  if (layers) {
    // 三层 sprite：`(x, y)` 是脚底锚点，execute() 会按 (x - w/2, y - h) 贴左上角
    for (const L of layers) {
      out.push({
        kind: 'sprite',
        img: L.img,
        sx: L.sx,
        sy: L.sy,
        sw: L.sw,
        sh: L.sh,
        x: L.x,
        y: L.y,
        w: L.w,
        h: L.h,
      });
    }
  } else {
    // ---- 降级：原来的矢量小人（图集 404 / 未解码 / 无此造型时才走到这里） ----
    // 身体
    R(out, fx - 18 * s, fy - 24 * s, 36 * s, 48 * s, sideDark(side), {
      radius: 4 * s,
      stroke: withAlpha(COLORS.gold, 0.75),
      width: 2,
    });
    R(out, fx - 14 * s, fy - 20 * s, 28 * s, 40 * s, sideColor(side), { radius: 3 * s });
    // 朝向缺口
    P(
      out,
      [
        { x: fx - 7 * s, y: fy + dir * 24 * s },
        { x: fx + 7 * s, y: fy + dir * 24 * s },
        { x: fx, y: fy + dir * 33 * s },
      ],
      COLORS.gold,
      { alpha: 0.95 },
    );
    // 胸前菱形将徽
    P(
      out,
      [
        { x: fx, y: fy - 12 * s },
        { x: fx + 7 * s, y: fy },
        { x: fx, y: fy + 12 * s },
        { x: fx - 7 * s, y: fy },
      ],
      withAlpha(COLORS.goldLight, 0.9),
    );
  }

  // 名字：**锚点**跟着透视走（远排更靠上、近排更靠下），字号仍固定 13px ——
  // 标签是给人读的，跟着缩会在远排糊成一条（有意偏离"全等比"，见 project/193 报告）。
  T(out, fx, layers ? gy - 158 * s : fy - 36 * s, name, 13, COLORS.gold, {
    align: 'center',
    stroke: withAlpha(COLORS.black, 0.8),
    strokeWidth: 3,
    bold: true,
  });
  const barY = layers ? gy + 10 * s : fy + 28 * s;
  bar(out, fx - 25 * s, barY, 50 * s, 4 * s, g.maxHp > 0 ? g.hp / g.maxHp : 0, COLORS.heal);

  // 行动条（冷却指示）：进度只读 core 的 `u.cd` / `actionIntervalOf()`，本层不推进它。
  // 量程按原作的 46 帧画（`0x4000` 状态位分支），40 帧普通分支的复位点用一根白刻度标出；
  // 于是「普通 40 帧走到刻度、慢速 46 帧才走到条尾」在画面上一眼能区分。
  const gauge = actionGaugeOf(u);
  const gaugeY = barY + 7 * s;
  bar(out, fx - 25 * s, gaugeY, 50 * s, 3 * s, gauge.ratio, COLORS.gold, { bg: 'rgba(255,255,255,0.12)' });
  const markX = fx - 25 * s + 50 * s * gauge.mark;
  LN(out, markX, gaugeY - 1, markX, gaugeY + 4, withAlpha(COLORS.white, 0.8), 1);
}

/** 特效碎片的生效窗口；`overlay` = 这条没给区间，借用相邻有区间的片段 */
interface FxSlice {
  dir: string;
  from: number;
  to: number;
  overlay: boolean;
}

/** 帧目录没写 life 时，特效在屏上的默认存活 tick（= core 的 `FX_TTL_DEFAULT`，1 秒） */
const FX_LIFE = FX_TTL_DEFAULT;

function resolveFxSlices(segs: FxSeg[]): FxSlice[] {
  const raw: { dir: string; from: number; to: number }[] = [];
  for (const s of segs) {
    if (!s || typeof s.dir !== 'string') continue;
    const from = clamp(Number(s.from) || 0, 0, 1);
    const to = clamp(Number(s.to) || 0, 0, 1);
    raw.push({ dir: s.dir, from, to });
  }
  const out: FxSlice[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]!;
    if (s.to > s.from) {
      out.push({ dir: s.dir, from: s.from, to: s.to, overlay: false });
      continue;
    }
    let win: { from: number; to: number } | null = null;
    for (let j = i - 1; j >= 0 && !win; j--) {
      const o = raw[j]!;
      if (o.to > o.from) win = { from: o.from, to: o.to };
    }
    for (let j = i + 1; j < raw.length && !win; j++) {
      const o = raw[j]!;
      if (o.to > o.from) win = { from: o.from, to: o.to };
    }
    out.push({ dir: s.dir, from: win?.from ?? 0, to: win?.to ?? 1, overlay: true });
  }
  return out;
}

/** 在 [from,to) 窗口里取该目录的帧；帧数多就自然抽到更多画面 */
function fxFrameAt(dir: FxDir | undefined, t: number, from: number, to: number): FxFrame | null {
  const n = dir?.frames.length ?? 0;
  if (!dir || n === 0) return null;
  const span = to - from;
  const u = span > 0 ? clamp((t - from) / span, 0, 1) : 0;
  return dir.frames[Math.min(n - 1, Math.floor(u * n))] ?? dir.frames[0] ?? null;
}

/** 有原作帧就画帧，没素材/没加载好/没映射就退回原来的虚线圈 */
function drawFx(out: DrawCmd[], world: World, camX: number, fxAtlas: FxAtlas | null): void {
  for (const fx of world.fx) {
    let wx = fx.x;
    let wy = fx.y;
    let r = fx.r;
    if (fx.kind === 'heal') {
      // core 现有的 heal fx 把 x 填成了 HP（不是世界坐标）；视图层特判到主将脚下，
      // 不改 core。详见 project/11 "已知未做/怪异点"。
      const gen = world.units.find((u) => u.side === fx.side && uGeneral(u));
      if (!gen) continue;
      wx = gen.x;
      wy = gen.y;
      r = 1.3;
    }
    // R193：特效锚点也过同一套透视；`scale` 顺手带出该行的缩放
    const p = projectUnit(wx, wy, camX);
    if (p.sy < FIELD_TOP - 260 || p.sy > FIELD_BOTTOM + 260) continue;
    const k = clamp(fx.ttl / FX_LIFE, 0, 1);
    const magic = world.data.magics.find((m) => m.SEQUENCE === fx.seq);

    // ---- 原作序列帧：先算时间轴，再决定这一段用哪个目录 ----
    // 图集自身的缩放 × 该行的透视缩放：远排特效应比近排小
    const s = (fxAtlas?.scale ?? 0.8) * p.scale;
    const life = Math.max(1, fx.life ?? fxAtlas?.life ?? FX_LIFE);
    const elapsed = clamp(life - fx.ttl, 0, life);
    const t = elapsed / life; // 0..1，永远 < 1（ttl 最小 1）
    const draws: { dir: FxDir; frame: FxFrame }[] = [];
    const segs = fxAtlas?.seqDirs?.[String(fx.seq)];
    const slices = segs && segs.length ? resolveFxSlices(segs) : null;
    if (slices && slices.length) {
      // 落在哪一段就画哪一段；同窗的段全部画（叠加）。段间切换不闪白：
      // 段内目录没加载好时先借一个已加载的目录顶上，绝不空一帧。
      let pick = slices.filter((sl) => t >= sl.from && t < sl.to);
      if (!pick.length) pick = [slices[slices.length - 1]!];
      for (const sl of pick) {
        let dir = fxAtlas?.dirs[sl.dir];
        if (!dir || !dir.frames.length) {
          for (const o of slices) {
            const d = fxAtlas?.dirs[o.dir];
            if (d && d.frames.length) { dir = d; break; }
          }
        }
        const frame = fxFrameAt(dir, t, sl.from, sl.to);
        if (dir && frame) draws.push({ dir, frame });
      }
    } else {
      // 单目录回退（与接入前一致）：map[seq] 一个目录放满整个 life
      const dirId = fxAtlas?.map[String(fx.seq)];
      const dir = dirId ? fxAtlas?.dirs[dirId] : undefined;
      const frame = fxFrameAt(dir, t, 0, 1);
      if (dir && frame) draws.push({ dir, frame });
    }

    if (draws.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const d of draws) {
        const f = d.frame;
        const w = f.w * s;
        const h = f.h * s;
        // 原作横版 → 竖版战场：整帧绕「帧内热点」转 90°（A 方顺时针、B 方逆时针），
        // 这样特效的推进方向就和战场一致（朝对方阵地）。天空系（rot=0）保持竖直。
        const deg = d.dir.rot ?? 0;
        const rot = (deg * (fx.side === 'B' ? -1 : 1) * Math.PI) / 180;
        // 旋转后让帧内热点 (ax,ay) 落在 p 上：本地坐标里图片左上角相对锚点的偏移
        const ox = -f.ax * s;
        const oy = -f.ay * s;
        // 旋转后的屏幕包围盒（只用来放技名/裁剪判断）
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (const lx of [ox, ox + w]) {
          for (const ly of [oy, oy + h]) {
            const rx = lx * cosR - ly * sinR;
            const ry = lx * sinR + ly * cosR;
            bx0 = Math.min(bx0, rx); bx1 = Math.max(bx1, rx);
            by0 = Math.min(by0, ry); by1 = Math.max(by1, ry);
          }
        }
        if (p.sy + by1 < FIELD_TOP - 300 || p.sy + by0 > FIELD_BOTTOM + 300) continue;
        minX = Math.min(minX, bx0);
        maxX = Math.max(maxX, bx1);
        minY = Math.min(minY, by0);
        maxY = Math.max(maxY, by1);
        out.push({
          kind: 'sprite',
          img: d.dir.img,
          sx: f.x, sy: f.y, sw: f.w, sh: f.h,
          x: p.sx,
          y: p.sy,
          w,
          h,
          alpha: Math.min(1, fx.ttl / 6),
          comp: 'lighter',
          rot: rot || undefined,
          ox,
          oy,
        });
      }
      if (!Number.isFinite(minY)) continue;
      if (magic) {
        // 技名浮在（旋转后的）帧盒上方，别压在特效本体上；多段同屏只画一次
        const top = p.sy + minY;
        T(out, p.sx + (minX + maxX) / 2, top - 10, magic.NAME, 13, withAlpha(COLORS.goldLight, 0.5 + 0.5 * k), {
          align: 'center',
          stroke: withAlpha(COLORS.bgDeep, 0.8),
          strokeWidth: 3,
        });
      }
      continue;
    }

    // ---- 兜底：虚线圈（与接入前完全一致）----
    const pulse = 1 + (1 - k) * 0.18;
    // R193：兜底线圈也吃透视 —— 半宽 = r 条车道在该行的实际像素宽，半高 = r 行在该行的屏幕距离
    const rr = wx - camX;
    const rx = r * lanePitch(rr) * pulse;
    const ry = ((rowScreenY(rr + r) - rowScreenY(rr - r)) / 2) * pulse;
    const c =
      fx.kind === 'heal'
        ? COLORS.heal
        : fx.kind === 'aoe'
          ? COLORS.gold
          : fx.side === 'A'
            ? COLORS.oursLight
            : COLORS.enemyLight;
    E(out, p.sx, p.sy, rx, ry, withAlpha(c, 0.10 + 0.16 * k));
    E(out, p.sx, p.sy, rx, ry, undefined, {
      stroke: withAlpha(c, 0.35 + 0.5 * k),
      width: 2.5,
      dash: fx.kind === 'aoe' ? [10, 7] : undefined,
    });
    E(out, p.sx, p.sy, rx * 0.62, ry * 0.62, undefined, {
      stroke: withAlpha(c, 0.22 * k),
      width: 1,
    });
    if (magic) {
      T(out, p.sx, p.sy - ry - 8, magic.NAME, 13, withAlpha(c, 0.5 + 0.5 * k), {
        align: 'center',
        stroke: withAlpha(COLORS.bgDeep, 0.8),
        strokeWidth: 3,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 武将技投射物（R187）
// ---------------------------------------------------------------------------

/**
 * 一个特效目录里「哪几帧是弹丸本体」的对照表。
 *
 * `web/assets/fx/index.json` 的 `list` 是按帧**尺寸降序**打包的（见 `tools/export_magic_fx.py`
 * 的 `order = sorted(..., key=lambda i: (-h, -w))`），帧名丢了，所以「BALL / 箭矢」这些帧的
 * 下标只能靠 `export/png/SHAPE/MAGIC/<dir>/*.png` 的原始尺寸反查（PNG 头 w/h 对 atlas 条目 w/h）。
 * 对照明细见 `project/187_武将技投射物.md` §帧来源。
 */
interface ProjectileArt {
  /** 弹丸本体帧（atlas 下标，按飞行进度轮播） */
  body: number[];
  /** 拖尾帧（可选，画在本体后方一小段行程上） */
  tail?: number;
}

const PROJECTILE_ART: Record<string, ProjectileArt> = {
  // 003：M003BALLB1..6 = 弹丸（61×65 / 71×79 / 97×92 / 118×122 / 116×119 / 94×86）
  //      M003FIRETAIL = 48×149 拖尾 —— 落月弓(2) / 落日弓(52) / 御飛刀(13) / 鬼戟(59)
  '003': { body: [0, 1, 2, 3, 4, 5], tail: 12 },
  // 001：M001BALLY1..6 = 弹丸 —— 半月斬(50) / 三日月斬(83)
  '001': { body: [0, 1, 2, 3, 4, 5] },
  // 009：M009EIGHTWAY01A/B = 细长箭矢（27×132 / 27×153），rot=0 竖直 —— 連弩系列(46/62/85)
  '009': { body: [0, 1] },
  // 028：小尺寸刀刃帧 20×19 / 19×20 —— 劍輪舞(95)
  '028': { body: [24, 25, 26, 27] },
};

/** 表里没写到的目录：取「最小的那批帧」（原作里弹丸/光点总是这些帧集里尺寸最小的） */
function fallbackProjectileArt(dir: FxDir): ProjectileArt {
  const n = dir.frames.length;
  if (n === 0) return { body: [] };
  let smallest = Infinity;
  for (const f of dir.frames) smallest = Math.min(smallest, f.w * f.h);
  const body: number[] = [];
  for (let i = 0; i < n && body.length < 6; i++) {
    const f = dir.frames[i]!;
    if (f.w < 8 || f.h < 8) continue; // 跳过 NULSHAPE 这类 1×1/3×3 占位帧
    if (f.w * f.h > smallest * 6) continue;
    body.push(i);
  }
  if (!body.length) body.push(0);
  return { body };
}

/**
 * 画投射物：起点→目标点按 `world.tick - bornTick` 线性插值，帧按进度轮播。
 *
 * 事件由 core 的 `SkillRun.emitProjectileFlights()` 产生（`SYSCALL 0x11` 建件、`0x18` 给寿命、
 * `0x2C` 挂碰撞回调 3001 的那个物件），寿命 `lifeTick` 与「弹丸飞到目标需要的 tick 数」一致，
 * 所以箭到人到 = 事件窗口结束，和原作 dis:4106-4130 的轮询收尾同拍。
 */
function drawProjectiles(out: DrawCmd[], world: World, camX: number, fxAtlas: FxAtlas | null): void {
  if (!fxAtlas) return;
  const flights = projectilesOf(world);
  if (!flights.length) return;
  for (const f of flights) {
    const life = Math.max(1, Math.round(f.lifeTick));
    const age = world.tick - f.bornTick;
    if (age < 0 || age >= life) continue; // 还没出生 / 已经落地
    const dirId = f.dir || fxAtlas.map[String(f.seq)] || '';
    const dir = dirId ? fxAtlas.dirs[dirId] : undefined;
    if (!dir || !dir.frames.length) continue;
    const art = PROJECTILE_ART[dirId] ?? fallbackProjectileArt(dir);
    if (!art.body.length) continue;
    const u = life <= 1 ? 1 : clamp(age / (life - 1), 0, 1);
    // 两头淡入淡出：起手别硬闪、落地别留残影
    const alpha = Math.min(1, (age + 1) / 3, (life - age) / 2);
    const deg = dir.rot ?? 0;
    const rot = (deg * (f.side === 'B' ? -1 : 1) * Math.PI) / 180;
    const parts: { at: number; idx: number; a: number }[] = [
      { at: u, idx: art.body[Math.min(art.body.length - 1, Math.floor(u * art.body.length))]!, a: alpha },
    ];
    if (art.tail !== undefined) {
      // 拖尾慢半拍（0.18 的行程），跟在本体后面
      parts.push({ at: clamp(u - 0.18, 0, 1), idx: art.tail, a: alpha * 0.6 });
    }
    for (const part of parts) {
      const frame = dir.frames[part.idx];
      if (!frame || part.a <= 0) continue;
      // R193：弹道中点也要过同一套透视 —— 只投两端、中间线性插值会飞在空中
      // （透视下「屏幕 y 对行号」是非线性的，所以必须对**每个采样点的世界坐标**做投影）
      const p = projectUnit(f.fromX + (f.toX - f.fromX) * part.at, f.fromY + (f.toY - f.fromY) * part.at, camX);
      if (p.sy < FIELD_TOP - 260 || p.sy > FIELD_BOTTOM + 260) continue;
      const ps = (fxAtlas.scale ?? 0.8) * p.scale;
      out.push({
        kind: 'sprite',
        img: dir.img,
        sx: frame.x,
        sy: frame.y,
        sw: frame.w,
        sh: frame.h,
        x: p.sx,
        y: p.sy,
        w: frame.w * ps,
        h: frame.h * ps,
        alpha: part.a,
        comp: 'lighter',
        rot: rot || undefined,
        ox: -frame.ax * ps,
        oy: -frame.ay * ps,
      });
    }
  }
}

function drawAim(out: DrawCmd[], world: World, camX: number, opts: ViewOptions): void {
  const idx = opts.selectedSkill;
  if (idx === null || idx === undefined || !opts.aim) return;
  const slot = (opts.skills ?? [])[idx];
  if (!slot || slot.kind === 'heal') return;
  // R193：瞄准圈也吃透视 —— 半径按「r 条车道 / r 行」在该行的实际像素算，别再用常数 LANE_PX/ROW_PX
  const p = projectUnit(opts.aim.gx, opts.aim.gy, camX);
  const r = skillRadius(slot.kind);
  const rr = opts.aim.gx - camX;
  const rx = r * lanePitch(rr);
  const ry = (rowScreenY(rr + r) - rowScreenY(rr - r)) / 2;
  E(out, p.sx, p.sy, rx, ry, withAlpha(COLORS.gold, 0.07), {
    stroke: withAlpha(COLORS.goldLight, 0.85),
    width: 2,
    dash: [8, 6],
  });
  E(out, p.sx, p.sy, 5, 5, withAlpha(COLORS.goldLight, 0.9));
  T(out, p.sx, p.sy - ry - 10, `${slot.name} · 點擊施放`, 14, COLORS.goldLight, {
    align: 'center',
    stroke: withAlpha(COLORS.bgDeep, 0.9),
    strokeWidth: 4,
  });
  // 让 world 参与签名，避免调用方误以为瞄准与 World 无关
  void world;
}

/**
 * 技能战果标记 → 飘字文本/颜色（R84）。
 *
 * 这一层就是"看到即发生"的落点：内核 `world.skillMarks` 每有一条真实效果，视图就飘一条；
 * `miss` 标记是内核在对账后确认真没打中才补的，所以 `MISS` 只可能来自这里，不再来自
 * web 那句 `killed > 0 ? '-'+killed : 'MISS'`（`game/web/main.js:1115`，冻结文件）。
 */
function markVisual(m: SkillMark): { text: string; color: string } {
  if (m.miss) return { text: 'MISS', color: COLORS.textDim };
  if (m.kills > 0 && m.damage > 0) return { text: `-${m.kills}/-${m.damage}`, color: COLORS.enemyLight };
  if (m.kills > 0) return { text: `-${m.kills}`, color: COLORS.enemyLight };
  if (m.damage > 0) return { text: `-${m.damage}`, color: COLORS.enemyLight };
  if (m.healed > 0) return { text: `+${m.healed}`, color: COLORS.heal };
  if (m.summoned > 0) return { text: `+${m.summoned}`, color: COLORS.oursLight };
  return { text: 'MISS', color: COLORS.textDim };
}

/**
 * 提示栏文案纠偏（R84）。
 *
 * web 的 `doCast()` 用 `CastResult.killed`（=打死敵兵數）当命中判据，法術打在主將身上時它恆為 0，
 * 于是提示欄寫「XX：擊殺 0 名敵兵。」——與血條實際掉血矛盾（`game/web/main.js:1113`）。
 * `game/web/**` 冻结，所以在这里用内核对账过的 `world.skillMarks` 把"0 擊殺"的那一句改写成真实战果。
 * 只认这一种句形；文案一旦改版就不匹配、原样返回（宁可不变，也不会乱改别的消息）。
 */
function battleMessage(world: World, text: string | null | undefined): string | null | undefined {
  if (!text) return text;
  const m = /^(.*?)：擊殺 0 名敵兵。$/.exec(text.trim());
  if (!m) return text;
  let kills = 0;
  let damage = 0;
  for (const k of world.skillMarks) {
    if (k.miss || k.side !== 'A') continue;
    if (world.tick - k.tick > SKILL_MARK_TTL) continue;
    kills += k.kills;
    damage += k.damage;
  }
  if (kills <= 0 && damage <= 0) return text;
  const parts: string[] = [];
  if (kills > 0) parts.push(`擊殺 ${kills} 名敵兵`);
  if (damage > 0) parts.push(`敵將 −${damage} 點體力`);
  return `${m[1]}：${parts.join('，')}。`;
}

function drawFloaters(
  out: DrawCmd[],
  floaters: Floater[],
  camX: number,
  marks: readonly SkillMark[] = [],
  tick = 0,
  skillPending = false,
): void {
  // web 的 MISS 是"击杀兵数 = 0"的猜测（打中主将、多帧技后续击杀都会被误判成 MISS）。
  // 内核现在逐帧对账并记 `skillMarks`，所以：
  //  - 还有技能在解算（`world.sessions` 非空）→ web 那句 MISS 一定是抢跑，丢掉；
  //  - 刚有过任何标记（含真的 miss 标记）→ MISS 由标记来画，避免同一发画两次。
  const freshMark = marks.some((m) => tick - m.tick >= 0 && tick - m.tick <= SKILL_MARK_TTL);
  const dropWebMiss = skillPending || freshMark;
  for (const f of floaters) {
    if (dropWebMiss && f.text === 'MISS') continue;
    // R193：飘字锚点过透视；上升量与起始抬升都乘该行 scale，远排别飘得太高
    const p = projectUnit(f.x, f.y, camX);
    if (p.sy < FIELD_TOP - 40 || p.sy > FIELD_BOTTOM + 40) continue;
    const k = clamp(f.ttl / f.maxTtl, 0, 1);
    const rise = (1 - k) * 28 * p.scale;
    T(out, p.sx, p.sy - 26 * p.scale - rise, f.text, f.size, f.color, {
      align: 'center',
      bold: true,
      alpha: Math.min(1, k * 2.2),
      stroke: withAlpha(COLORS.bgDeep, 0.9),
      strokeWidth: 4,
    });
  }
  // 技能战果标记：越新越靠下、越亮，1.5 s 内淡出上浮，与 web 的 Floater 同一套观感
  for (const m of marks) {
    const age = tick - m.tick;
    if (age < 0 || age > SKILL_MARK_TTL) continue;
    const p = projectUnit(m.x, m.y, camX);
    if (p.sy < FIELD_TOP - 40 || p.sy > FIELD_BOTTOM + 40) continue;
    const k = clamp(1 - age / SKILL_MARK_TTL, 0, 1);
    const v = markVisual(m);
    T(out, p.sx, p.sy - 40 * p.scale - (1 - k) * 22, v.text, FONT.float, v.color, {
      align: 'center',
      bold: true,
      alpha: Math.min(1, k * 2.2),
      stroke: withAlpha(COLORS.bgDeep, 0.9),
      strokeWidth: 4,
    });
  }
}

function drawMinimap(out: DrawCmd[], world: World, camX: number): void {
  const { x, y, w, h } = MINIMAP;
  R(out, x, y, w, h, COLORS.bgDeep, { radius: 3, alpha: 0.82 });
  R(out, x, y, w, h, undefined, {
    stroke: withAlpha(COLORS.gold, 0.45),
    width: 1,
    radius: 3,
  });
  T(out, x + w / 2, y - 9, '敵', 11, withAlpha(COLORS.enemyLight, 0.85), { align: 'center' });
  T(out, x + w / 2, y + h + 14, '我', 11, withAlpha(COLORS.oursLight, 0.9), { align: 'center' });

  // 视野窗：透视后两端不对称（远 7.43 行 / 近 5.90 行），直接取 projectionInfo 的量，
  // 不能再按 450/ROW_PX 算 —— 否则小地图的框和战场里实际看到的范围对不上。
  const info = projectionInfo(camX);
  const winTop = y + (info.farRow / (GRID_W - 1)) * h;
  const winH = ((info.nearRow - info.farRow) / (GRID_W - 1)) * h;
  R(out, x - 1, winTop, w + 2, winH, withAlpha(COLORS.gold, 0.10), {
    stroke: withAlpha(COLORS.gold, 0.85),
    width: 1,
  });

  for (const u of world.units) {
    if (!u.alive) continue;
    const my = y + (clamp(u.x, 0, GRID_W - 1) / (GRID_W - 1)) * h;
    const mx = x + 4 + (clamp(u.y, 0, GRID_H - 1) / (GRID_H - 1)) * (w - 8);
    const size = uGeneral(u) ? 4 : 2;
    R(out, mx - size / 2, my - size / 2, size, size, sideColor(u.side), {
      alpha: uGeneral(u) ? 1 : 0.85,
    });
  }
}

function sideMeta(world: World, side: Side): { troop: string; formation: string } {
  const rt = world.sides[side];
  return {
    troop: world.data.troops.names[rt.troop] ?? '?',
    formation: world.data.formations.names[rt.formation] ?? '?',
  };
}

// ---------------------------------------------------------------------------
// 顶部金牌：战场剩余时间（原作是中文数字倒计时，不是 MM:SS）
// ---------------------------------------------------------------------------
//
// 语义 [确认]，不是推测：
//   · 原作 `[0x4AC35C]` 初值 `0x2E68` = 11880，战场初始化时写（`0x4442AC` / `0x444614` /
//     `0x444459`，见 `docs/04b3_单挑流程.md:474`）；
//   · 主循环 `0x444126`：`mov eax,[0x4ac35c]` / `sub eax,1` / `mov [..],eax` /
//     `cmp [..],0` / `jg` ⇒ 每帧 −1，夹 0，到 0 时 `push 0x1000; call 0x443CA8` 置「时间到」结束位
//     （反汇编片段见 `work/dis_battle_units2.txt:1029-1041`，xref：`work/units_per_side/refs_4A8_4B7.txt:389-398`）；
//   · 显示量纲：`0x443F2A() = (0x2E68 − [0x4AC35C]) / 0x78`，即 120 帧 = 1 个显示单位
//     （`docs/04b_战斗系统.md:516` 拿它当「战斗时长」）⇒ 金牌 = `ceil(剩余帧 / 120)`，
//     起始 11880/120 = 99，60fps 下每 2 秒掉 1（0.5/秒）；
//   · 录像逐帧核对：0842「六十七」→ 0900「五十八」，18 秒掉 9 点 = 0.5/秒，与上式逐点吻合。
// 换算到我们引擎（`TICK_HZ = 60`，`src/core/battle.ts`）：R192 起与原件同频
// （原作实测 66–79 Hz，取 60 是最保守的一档，见 `project/190`/`192`）⇒ 11880 tick
// 仍然 = 198 秒，但 1 个显示单位 = 120 tick（30 Hz 时代是 60 tick）。
/** 战场时限（tick）：直接读内核的 `BATTLE_TICK_LIMIT`（原作 11880 帧 @60Hz = 198 s） */
const BATTLE_TIME_TICKS = BATTLE_TICK_LIMIT;
/** 一个显示单位 = 2 秒 = `2 * TICK_HZ` tick（60 Hz ⇒ 120 tick，即 0.5 单位/秒） */
const CLOCK_UNIT_TICKS = 2 * TICK_HZ;
/** 起始显示值：99（11880 / 120；录像第一帧是 98，只是录到开战后 2 秒，不是固定初值） */
const BATTLE_TIME_UNITS = BATTLE_TIME_TICKS / CLOCK_UNIT_TICKS;

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/** 0..99 → 中文数字：99 `九十九`、60 `六十`、58 `五十八`、10 `十`、5 `五`。 */
export function chineseNumber(n: number): string {
  const v = Math.min(99, Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)));
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  if (tens === 0) return CN_DIGIT[ones]!;
  const head = tens === 1 ? '' : CN_DIGIT[tens]!;
  return ones === 0 ? `${head}十` : `${head}十${CN_DIGIT[ones]!}`;
}

/**
 * 金牌显示的战场剩余时间（0..99）：起始 99，每 `CLOCK_UNIT_TICKS`(120) tick 掉 1，到 0 停住。
 *
 * 与原作 `0x443F2A` 的 `ceil(剩余帧 / 0x78)` 同一口径（`project/180_战斗HUD对齐.md`）：
 * `ceil((BATTLE_TICK_LIMIT − tick) / CLOCK_UNIT_TICKS)`。在 0..11880 区间上与旧写法
 * `99 − floor(tick/CLOCK_UNIT_TICKS)` 逐点相等（11880 = 99×120），但**别再写死 `/60`**，
 * 那是 30 Hz 时代的遗留（R192 已经把 `TICK_HZ` 提到 60）。
 */
export function clockUnitsLeft(tick: number): number {
  const left = Math.ceil((BATTLE_TIME_TICKS - Math.max(0, tick)) / CLOCK_UNIT_TICKS);
  return Math.min(BATTLE_TIME_UNITS, Math.max(0, left));
}

/** 顶部中央的金牌：木纹底 + 金边 + 中文数字（原作最大的一处 HUD 字）。 */
function drawClockPlaque(out: DrawCmd[], world: World): void {
  const p = CLOCK_PLAQUE;
  R(out, p.x - 4, p.y - 4, p.w + 8, p.h + 8, '#241610', {
    radius: 6,
    stroke: withAlpha(COLORS.gold, 0.85),
    width: 2,
  });
  R(out, p.x, p.y, p.w, p.h, '#b08a4e', { radius: 4 });
  R(out, p.x + 3, p.y + 3, p.w - 6, p.h - 6, '#f2e4bf', { radius: 3 });
  // 木纹：三条很淡的横线
  for (let i = 1; i <= 3; i++) {
    const y = p.y + (p.h / 4) * i;
    LN(out, p.x + 8, y, p.x + p.w - 8, y, '#8a6f3e', 1, 0.18);
  }
  T(out, p.x + p.w / 2, p.y + 33, chineseNumber(clockUnitsLeft(world.tick)), 26, '#2a1c0c', {
    align: 'center',
    bold: true,
  });
}

function drawHud(out: DrawCmd[], world: World): void {
  const a = world.sides.A;
  const b = world.sides.B;
  const ma = sideMeta(world, 'A');
  const mb = sideMeta(world, 'B');
  R(out, HUD.x, HUD.y, HUD.w, HUD.h, COLORS.bgDeep);
  LN(out, 0, HUD_H_LINE, DESIGN_W, HUD_H_LINE, withAlpha(COLORS.gold, 0.22), 1);

  T(out, 16, 22, `我軍 · ${ma.troop} · ${ma.formation}`, FONT.small, COLORS.oursLight);
  T(out, 734, 22, `敵軍 · ${mb.troop} · ${mb.formation}`, FONT.small, COLORS.enemyLight, {
    align: 'right',
  });
  T(out, 16, 51, `${a.aliveCount} / ${a.start}`, FONT.num, COLORS.ours, { bold: true });
  T(out, 734, 51, `${b.aliveCount} / ${b.start}`, FONT.num, COLORS.enemy, {
    align: 'right',
    bold: true,
  });

  bar(out, HUD_BAR_A.x, HUD_BAR_A.y, HUD_BAR_A.w, HUD_BAR_A.h, a.start ? a.aliveCount / a.start : 0, COLORS.ours);
  bar(out, HUD_BAR_B.x, HUD_BAR_B.y, HUD_BAR_B.w, HUD_BAR_B.h, b.start ? b.aliveCount / b.start : 0, COLORS.enemy, {
    mirror: true,
  });

  // 顶部中央的金牌 = 战场剩余时间（中文数字）。原作用它替代我们的 `00:08` 时钟。
  // 士氣不再写在这儿：原作它是底部左右两块主将卡里的四个裸数字之一（见 drawGeneralCard）。
  drawClockPlaque(out, world);

  // 双方主将体力 / 技力 / 气力。
  // 原作 `0x4412C0` 的 HUD 把体力与技力都写成 `%d/%d`（当前/上限）；本作以前只画单值，
  // 这里补上 `/max`，数值直接取 `GeneralState.hp/maxHp`、`mp/mpMax`。
  // 版式不动：仍用 `HUD_HP_*` / `HUD_QI_*` 三条 bar 的既有 y，文字贴在 y=72 那一行。
  const ga = a.general;
  const gb = b.general;
  T(out, 16, 72, '將', 10, COLORS.textDim);
  T(out, 30, 72, vitalText('體', ga.hp, ga.maxHp), 10, COLORS.heal);
  T(out, 196, 72, vitalText('技', ga.mp, ga.mpMax), 10, COLORS.oursLight, { align: 'right' });
  bar(out, HUD_HP_A.x, HUD_HP_A.y, HUD_HP_A.w, HUD_HP_A.h, ga.maxHp ? ga.hp / ga.maxHp : 0, COLORS.heal);
  bar(out, HUD_QI_A.x, HUD_QI_A.y, HUD_QI_A.w, HUD_QI_A.h, ga.qi / 120000, COLORS.gold);
  T(out, 734, 72, '將', 10, COLORS.textDim, { align: 'right' });
  T(out, 720, 72, vitalText('體', gb.hp, gb.maxHp), 10, COLORS.heal, { align: 'right' });
  T(out, 554, 72, vitalText('技', gb.mp, gb.mpMax), 10, COLORS.oursLight);
  bar(out, HUD_HP_B.x, HUD_HP_B.y, HUD_HP_B.w, HUD_HP_B.h, gb.maxHp ? gb.hp / gb.maxHp : 0, COLORS.heal, {
    mirror: true,
  });
  bar(out, HUD_QI_B.x, HUD_QI_B.y, HUD_QI_B.w, HUD_QI_B.h, gb.qi / 120000, COLORS.gold, {
    mirror: true,
  });
}

const HUD_H_LINE = 99;

/** 某一侧主将的行动条数据（拿不到主将单位时返回 null） */
function actionGaugeAt(world: World, side: Side): ActionGauge | null {
  const u = generalUnitOf(world, side);
  return u ? actionGaugeOf(u) : null;
}

interface GeneralCardOpts {
  general: GeneralState;
  /** 武将级士气（`general+0x38`）；core 只在 settle 写这个镜像，战斗中落回本侧士气 */
  morale: number;
  /** 兵力（=`sides[side].aliveCount / start`，不是武将身上的字段） */
  troops: { cur: number; max: number };
  /** 兵/技文本的强调色（我方蓝、敌方红） */
  light: string;
  /** 活着时的状态字：我方「在陣」、敌方「敵將」 */
  aliveText: string;
  /** true = 右块（整块镜像：名字靠右、两列 x 反过来） */
  mirror: boolean;
  action: ActionGauge | null;
}

/**
 * 底部主将卡。原作底部是左右各一块，每块「立绘 / LV / 名字 / 兵+条 / 體+条 + 四个裸数字」。
 *
 * **兵 / 體 两条横条**（`project/188_录像逐项复核.md` §7，0842 帧左赵云 `兵 65/96`、`體 10/54`，
 * 右曹豹 `44/96`、`5/49`）：原作条在数值上方、数值在条下；我们这块只有 86px 高（技能格从 1100
 * 起），所以条画在数值同一行的外侧，两条的上下顺序与原作一致（兵在上、體在下）。
 * `技`（MP）原作没有独立行 —— 技能格上已有 `技20` 成本，这里只在名字行的内列留 10px 小字。
 *
 * 四个裸数字 = **疲勞 / 士氣 / 武力 / 智力**（`project/178_全系统界面差异_B组.md` §HUD）。
 * 证据：`work/video_ui_b/B_surrender_0905.png` 的招降面板把赵云写成
 * `忠誠度78 等級6 武力100 智力88 士氣64 疲勞度19`，而 08:42 的 HUD 左块是 `0/84/88/100`
 * ⇒ 疲勞 0、士氣 84（被俘后 −20 → 64）、智力 88、武力 100，逐位吻合。
 *
 * 排布：外侧列（贴立绘 / 贴屏边）= 疲勞、智力；内侧列（朝画面中心）= 士氣、武力。
 * 右块整块镜像 ⇒ 两列的 x 与对齐方向都翻过来，读数顺序与原作右块
 * `78 | 20 / 100 | 66`（士｜疲 / 武｜智）一致。
 */
function drawGeneralCard(out: DrawCmd[], c: GeneralCardOpts): void {
  const g = c.general;
  const card = c.mirror ? GENERAL_CARD_B : GENERAL_INFO;
  // 右块（敌方）是整块镜像：外侧列贴屏边（右）、内侧列朝画面中心（左），对齐方向也翻过来。
  const outerX = c.mirror ? card.x + card.w : card.x;
  const innerX = c.mirror ? card.x + 4 : card.x + GENERAL_CARD_COL;
  // 外侧列：我方靠左、敌方靠右（贴屏边）；内侧列两边都靠左起笔（朝画面中心方向长）
  const outerAlign: TextAlign = c.mirror ? 'right' : 'left';
  const innerAlign: TextAlign = 'left';
  // 状态字写在本块靠画面中心的一侧（我方右、敌方左），别让两块的状态字挨在一起。
  const statusX = c.mirror ? card.x + 4 : card.x + GENERAL_CARD_COL + 100;
  const nameColor = !g.alive ? COLORS.textFaint : c.mirror ? COLORS.enemyLight : COLORS.text;
  // 右块只有 151 宽（5 列 cmd6 面板占了原作右块的位置），名字与 兵/技 用小一号字才不打架。
  const nameSize = c.mirror ? FONT.small : FONT.h2;
  const numSize = c.mirror ? 13 : FONT.small;
  // 兵 / 體 的横条：贴着数值文本的外侧（我方文本在左、条在右；敌方整块镜像 ⇒ 条在文本左）。
  // 条宽 = 卡宽 − 文本预留宽（`GENERAL_CARD_VITAL_W*`，`兵 100/100` 实测 16px≈79 / 13px≈63）；
  // 靠画面中心那一侧再让 4px，两块卡的条不会连成一条线（两块卡正好在 x=366 相接）。
  const vitalW = c.mirror ? GENERAL_CARD_VITAL_W_B : GENERAL_CARD_VITAL_W;
  const barX = c.mirror ? card.x + 4 : card.x + vitalW;
  const barW = card.w - vitalW - 4;
  // 技力（MP）不占行位：技能格上已经有 `技20` 成本，名字这一行的内列留一行 10px 小字就够。
  // 右块 151 宽：名字占右半边、狀態占左侧 32px，小字贴在两者之间的空档。
  const mpX = c.mirror ? card.x + 48 : card.x + GENERAL_CARD_COL;

  // 名字 + 在陣/陣亡（敌方那块没有立绘，用「敵將」标明这是对方主将）
  T(out, outerX, GENERAL_CARD_Y.name, g.name, nameSize, nameColor, { align: outerAlign, bold: true });
  T(
    out,
    statusX,
    GENERAL_CARD_Y.name,
    g.alive ? c.aliveText : '陣亡',
    FONT.small,
    g.alive ? COLORS.ok : COLORS.danger,
    { align: c.mirror ? 'left' : 'right' },
  );
  T(out, mpX, GENERAL_CARD_Y.mp, vitalText('技', g.mp, g.mpMax), 10, COLORS.textDim);

  // 兵 / 體：原作每侧**各一条横条** + `当前/上限`（`project/188_录像逐项复核.md` §7：0842 帧
  // 左赵云 `兵 65/96` + `體 10/54`、右曹豹 `44/96` + `5/49`）。口径：兵 = 本侧存活/起始
  // （`sides[side].aliveCount/start`），體 = 主将 `hp/maxHp`。条色沿用顶栏：兵 = 本侧色、
  // 體 = 体力绿（原作条是红/蓝，但同屏顶栏已用本侧色，控制台跟着顶栏更好认）。
  T(out, outerX, GENERAL_CARD_Y.troopText, vitalText('兵', c.troops.cur, c.troops.max), numSize, c.light, {
    align: outerAlign,
  });
  bar(
    out,
    barX,
    GENERAL_CARD_Y.troopBar,
    barW,
    GENERAL_CARD_BAR_H,
    c.troops.max ? c.troops.cur / c.troops.max : 0,
    c.light,
    { mirror: c.mirror },
  );
  T(out, outerX, GENERAL_CARD_Y.hpText, vitalText('體', g.hp, g.maxHp), numSize, COLORS.heal, {
    align: outerAlign,
  });
  bar(out, barX, GENERAL_CARD_Y.hpBar, barW, GENERAL_CARD_BAR_H, g.maxHp ? g.hp / g.maxHp : 0, COLORS.heal, {
    mirror: c.mirror,
  });

  // 四个裸数字：上排 疲勞 | 士氣，下排 智力 | 武力（外侧列 = 疲/智，内侧列 = 士/武）。
  // 加了 兵/體 两行之后只剩 14px 行距，字号从 FONT.small(16) 收到 13 才不叠字。
  const rows: [string, number, string, number][] = [
    ['疲', g.tire ?? 0, '士', c.morale],
    ['智', g.int, '武', g.str],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [outerLabel, outerVal, innerLabel, innerVal] = rows[i]!;
    const y = i === 0 ? GENERAL_CARD_Y.statA : GENERAL_CARD_Y.statB;
    T(out, outerX, y, `${outerLabel} ${outerVal}`, 13, COLORS.textDim, { align: outerAlign });
    T(out, innerX, y, `${innerLabel} ${innerVal}`, 13, COLORS.textDim, { align: innerAlign });
  }

  // 行动条：原作没有，我们保留但压成块内一条细 bar —— 不再占四个字段位。
  // 进度仍只读 core 的 `u.cd`（`actionGaugeOf` → `actionIntervalOf`），视图不自己推 40/46。
  // y=1094：技能格第一行从 1100 起（`SKILL_GRID_ROW2_Y` / `skillSlotRects` 8 格版式），
  // 再往下压就会画到格子上。敌方块只有 151 宽、还要放名字，这条 bar 只画我方那块。
  if (c.action && !c.mirror) {
    const w = card.w - 12;
    bar(out, card.x, GENERAL_CARD_Y.actionBar, w, 3, c.action.ratio, COLORS.gold);
    T(out, card.x + card.w, GENERAL_CARD_Y.actionBar, '行', 9, COLORS.textFaint, { align: 'right' });
  }
}

function drawConsole(out: DrawCmd[], world: World, opts: ViewOptions): void {
  const g = world.sides.A.general;
  R(out, CONSOLE.x, CONSOLE.y, CONSOLE.w, CONSOLE.h, COLORS.bgDeep);
  LN(out, 0, CONSOLE.y, DESIGN_W, CONSOLE.y, withAlpha(COLORS.gold, 0.28), 1.5);

  // 头像框
  R(out, PORTRAIT.x, PORTRAIT.y, PORTRAIT.w, PORTRAIT.h, COLORS.panel, {
    radius: RADIUS.md,
    stroke: withAlpha(COLORS.ours, 0.65),
    width: 2,
  });
  if (opts.portrait) {
    const pr = opts.portrait;
    const scale = Math.max(PORTRAIT.w / pr.w, PORTRAIT.h / pr.h);
    const sw = PORTRAIT.w / scale;
    const sh = PORTRAIT.h / scale;
    out.push({
      kind: 'sprite',
      img: pr.img,
      sx: Math.max(0, (pr.w - sw) / 2),
      sy: (pr.h - sh) * 0.16,   // 立绘人物通常从 15% 处开始，锚在头顶会让框里全是背景
      sw,
      sh,
      // sprite 命令的 (x,y) 是「底部中心」锚点：这里换算成头像框中心 + 底边
      x: PORTRAIT.x + PORTRAIT.w / 2,
      y: PORTRAIT.y + PORTRAIT.h,
      w: PORTRAIT.w,
      h: PORTRAIT.h,
    });
  } else {
    E(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 46, 25, 30, withAlpha(COLORS.ours, 0.28));
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 50, '將', 32, COLORS.oursLight, {
      align: 'center',
      bold: true,
    });
  }
  if (opts.portrait) {
    // 立绘盖住框底，Lv 标签改成右下角的小徽章
    R(out, PORTRAIT.x + PORTRAIT.w - 40, PORTRAIT.y + PORTRAIT.h - 20, 40, 20, 'rgba(10,12,16,.78)', {
      radius: RADIUS.sm ?? 4,
    });
    T(out, PORTRAIT.x + PORTRAIT.w - 20, PORTRAIT.y + PORTRAIT.h - 16, `Lv.${g.level}`, 12, COLORS.gold, {
      align: 'center',
    });
  }
  if (!opts.portrait) {
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 92, `Lv.${g.level}`, 14, COLORS.gold, {
      align: 'center',
    });
  }

  // 主将卡：原作底部是**左右各一块**，我们照这个语义画两块的四个字段（左我方、右敌方镜像）。
  // 四字段 = 疲勞 / 士氣 / 武力 / 智力；「行 a/b」不再占字段位，缩成块内一条细 bar。
  const ga = g;
  const gb = world.sides.B.general;
  drawGeneralCard(out, {
    general: ga,
    morale: ga.morale ?? world.sides.A.morale,
    troops: { cur: world.sides.A.aliveCount, max: world.sides.A.start },
    light: COLORS.oursLight,
    aliveText: '在陣',
    mirror: false,
    action: actionGaugeAt(world, 'A'),
  });
  drawGeneralCard(out, {
    general: gb,
    morale: gb.morale ?? world.sides.B.morale,
    troops: { cur: world.sides.B.aliveCount, max: world.sides.B.start },
    light: COLORS.enemyLight,
    aliveText: '敵將',
    mirror: true,
    action: actionGaugeAt(world, 'B'),
  });

  // 技能格：最多 8 格（原作 `general+0x54` byte[8]）。只画实际有的条数，不补空格。
  // 序号 / 命中区 / 置灰判定统一走 skillSlotRects(i) + castBlockReason()，不许另算坐标。
  const skills = (opts.skills ?? []).slice(0, MAX_SKILL_SLOTS);
  const rects = skillSlotRects(skills.length);
  for (let i = 0; i < skills.length; i++) {
    const r = rects[i]!;
    const slot = skills[i]!;
    const selected = opts.selectedSkill === i;
    const reason = castBlockReason(world, slot);
    const disabled = reason !== null || (opts.mode ?? 'fighting') !== 'fighting';
    R(out, r.x, r.y, r.w, r.h, disabled ? COLORS.panel : COLORS.panelHi, {
      radius: RADIUS.md,
      stroke: selected ? COLORS.gold : withAlpha(COLORS.white, 0.10),
      width: selected ? 2.5 : 1,
      alpha: disabled ? 0.55 : 1,
    });
    const kindLabel = slot.kind === 'heal' ? '療' : slot.kind === 'aoe' ? '範圍' : '單體';
    if (r.h < SKILL_SLOT_H) {
      // 4×2 两行版：名字保持 13px（88px 宽放得下 4 个汉字），砍掉独立费用行的一半留白
      T(out, r.x + 7, r.y + 14, `${i + 1}`, 10, COLORS.textFaint);
      T(out, r.x + r.w - 7, r.y + 14, kindLabel, 9, COLORS.textDim, { align: 'right' });
      T(out, r.x + r.w / 2, r.y + 31, slot.name, 13, disabled ? COLORS.textFaint : COLORS.text, {
        align: 'center',
        bold: true,
        maxWidth: r.w - 8,
      });
      T(out, r.x + r.w / 2, r.y + 49, `技${slot.mp} · 氣${Math.round(slot.qi / 1200)}%`, 10, disabled ? COLORS.textFaint : COLORS.gold, {
        align: 'center',
      });
    } else {
      T(out, r.x + 8, r.y + 16, `${i + 1}`, 11, COLORS.textFaint);
      T(out, r.x + r.w / 2, r.y + 38, slot.name, 15, disabled ? COLORS.textFaint : COLORS.text, {
        align: 'center',
        bold: true,
        maxWidth: r.w - 10,
      });
      T(out, r.x + r.w / 2, r.y + 58, kindLabel, 11, COLORS.textDim, { align: 'center' });
      T(out, r.x + r.w / 2, r.y + 76, `技${slot.mp} · 氣${Math.round(slot.qi / 1200)}%`, 11, disabled ? COLORS.textFaint : COLORS.gold, {
        align: 'center',
      });
    }
  }

  const fledA = world.fled?.A === true;

  // 第一层：原作 6 大指令钮（2 列 × 3 行，x524..732）。坐标表见 `project/151` §2。
  // `menuOpen` 走 `ViewOptions.armyMenu ?? armyMenuOpen()`：将来 main.js 想接管开合状态，
  // 只要在 `viewOptions()` 里塞一个键，本层不用再改。
  const menuOpen = opts.armyMenu ?? armyMenuOpen();
  drawCmd6Bar(out, world, opts, menuOpen);

  // 突 擊（全軍突擊）：R137 接上了 core `battle.ts allRush(world, side)`。
  //   原作 `SYSTEM.SO#22 AllRush`（id=0x3B @0x2B0C，`export\script\system_so.dis.txt:1536-1585`）
  //   第 9 条指令就是 `LDG 2; PUSHI 65536; SYSCALL 0x120, 0x2` —— 把主将的命令字写成
  //   `0x10000`（突击位），全体部队自行前压。它不是选目标冲锋，也不加伤害。
  //   所以：开战中可点一次；已在突击态 / 已撤 / 已结束 / 非战斗态置灰，小字给状态。
  //
  //   `[版式]` 右列让给 6 大按钮之后，这颗系统键从 (528,1124,204,84) 搬到最左列
  //   头像下方 (18,1128,88,84)。`Hit` 仍是 `{ type: 'assault' }` —— main.js 的
  //   `rushCommand()` 分支一个字都不用改（`tests/battle_cmd_ui.test.ts` 有断言）。
  const rushingA = world.rush?.A === true;
  const canAssault = !world.over && !rushingA && !fledA && (opts.mode ?? 'fighting') === 'fighting';
  drawCommandButton(out, CHIP_ASSAULT, '突 擊', rushingA ? '突擊中' : '全軍突擊', canAssault);

  // 撤 退：R38 已经落地，**不再是预览**。
  //   core  `battle.ts:1056 requestRetreat(world, side)`（AI 侧 `maybeRetreat:1075` 自动撤），
  //         结束原因 `world.endReason === 'retreat'`，败方状态码 2=撤退 / 3=被俘；
  //   main.js 已把按钮接到 `requestRetreat(state.world, 'A')`，本层只负责画样子与命中框
  //         （`hitTest` 的 `{ type: 'retreat' }` 在两者之上，不用动）。
  // 所以：开战中可点；已撤 / 已结束 / 非战斗态置灰，并把小字换成状态。
  const canRetreat = !world.over && !fledA && (opts.mode ?? 'fighting') === 'fighting';
  drawCommandButton(out, CHIP_RETREAT, '撤 退', fledA ? '撤退中' : '全軍離場', canRetreat);

  // 第二层：部队指令子菜单。展开时整块盖在按钮区右侧（面板 x512..740），
  // 顶边 1116 > FIELD_BOTTOM(1000)，**不遮战场**。
  if (menuOpen) drawArmyMenu(out, world);

  // 提示框
  R(out, MESSAGE_BOX.x, MESSAGE_BOX.y, MESSAGE_BOX.w, MESSAGE_BOX.h, COLORS.panel, {
    radius: RADIUS.md,
    stroke: withAlpha(COLORS.white, 0.07),
    width: 1,
  });
  // R139：武将技不再需要点战场选目标（原作点技能格即放），兜底文案同步改口
  const msg = battleMessage(world, opts.message) ?? '點技能格即施放，不用選目標。';
  const lines = wrapCJK(msg, 22, 2);
  lines.forEach((line, i) => {
    T(out, MESSAGE_BOX.x + 12, MESSAGE_BOX.y + 26 + i * 22, line, 14, i === 0 ? COLORS.text : COLORS.textDim);
  });
  // 键位图例：往上 4px 收进提示框图元的内框（`.msg` 有 10px 边）
  T(out, MESSAGE_BOX.x + MESSAGE_BOX.w - 10, MESSAGE_BOX.y + MESSAGE_BOX.h - 16, '1-8 · A-H · R', 9, COLORS.textFaint, {
    align: 'right',
  });
}

/**
 * 開場叫陣台詞框：底部橫幅（戰場帶下緣，不遮主將）。
 *
 * 版式對齊 `view/theme.ts`：面板色 `COLORS.panelAlpha`、陣營色 `sideColor()`、
 * 台詞用 `wrapCJK` 折 3 行（原作一句最長 23 字，24 字/行足夠）。
 * 說話方名牌壓在邊框上緣，左側色條 + 小三角指明「現在是誰在喊」。
 */
const TAUNT_BANNER = { x: 40, y: 790, w: 670, h: 138 } as const;

function drawTaunt(out: DrawCmd[], taunt?: TauntView | null): void {
  if (!taunt || !taunt.text) return;
  const accent = sideColor(taunt.side);
  const light = sideLight(taunt.side);
  const { x, y, w, h } = TAUNT_BANNER;
  // 陰影 + 底板：RGB 半透明，背後的戰場仍可見，但字要夠清楚
  R(out, x + 3, y + 5, w, h, COLORS.black, { radius: RADIUS.md, alpha: 0.32 });
  R(out, x, y, w, h, COLORS.panelAlpha, { radius: RADIUS.md });
  R(out, x, y, w, h, undefined, { radius: RADIUS.md, stroke: withAlpha(accent, 0.9), width: 2 });
  // 左側陣營色條
  R(out, x, y + 12, 5, h - 24, accent, { radius: 2.5 });
  // 名牌：壓在邊框上緣（不佔台詞版面）
  const name = (taunt.name ?? '').trim() || (taunt.side === 'A' ? '我將' : '敵將');
  const tag = taunt.side === 'A' ? '接 戰' : '叫 陣';
  R(out, x + 18, y - 16, 176, 32, accent, { radius: RADIUS.pill });
  T(out, x + 34, y, name, FONT.small, COLORS.white, { baseline: 'middle', bold: true, maxWidth: 110 });
  T(out, x + 162, y, tag, 11, withAlpha(COLORS.white, 0.72), { align: 'right', baseline: 'middle' });
  // 台詞：最多 3 行；第一行加粗提亮
  const lines = wrapCJK(taunt.text, 24, 3);
  lines.forEach((line, i) => {
    T(out, x + 24, y + 34 + i * 30, line, FONT.body + 4, i === 0 ? COLORS.text : withAlpha(COLORS.text, 0.92), {
      bold: i === 0,
    });
  });
  // 進度條：本句停留到哪（原作是固定停留，這裡給玩家一個「還要多久」的讀數）
  const hold = Math.max(0.2, taunt.hold ?? 1.5);
  const ratio = clamp((taunt.t ?? 0) / hold, 0, 1);
  R(out, x + 24, y + h - 12, w - 48, 3, withAlpha(COLORS.white, 0.12), { radius: 1.5 });
  R(out, x + 24, y + h - 12, (w - 48) * ratio, 3, withAlpha(light, 0.85), { radius: 1.5 });
  // 說話方小三角：指向台詞第一行
  P(
    out,
    [
      { x: x + 30, y: y + 22 },
      { x: x + 42, y: y + 22 },
      { x: x + 36, y: y + 31 },
    ],
    accent,
    { alpha: 0.9 },
  );
}

function drawCommandButton(
  out: DrawCmd[],
  r: { x: number; y: number; w: number; h: number },
  label: string,
  sub: string,
  enabled: boolean,
): void {
  R(out, r.x, r.y, r.w, r.h, enabled ? COLORS.panelHi : COLORS.panel, {
    radius: RADIUS.md,
    stroke: withAlpha(enabled ? COLORS.gold : COLORS.white, enabled ? 0.55 : 0.08),
    width: 1.5,
    alpha: enabled ? 1 : 0.55,
  });
  T(out, r.x + r.w / 2, r.y + 36, label, 24, enabled ? COLORS.text : COLORS.textFaint, {
    align: 'center',
    bold: true,
  });
  T(out, r.x + r.w / 2, r.y + 62, sub, 11, COLORS.textFaint, { align: 'center' });
}

// ---------------------------------------------------------------------------
// 遮罩：开战 / 结算
// ---------------------------------------------------------------------------

function drawReady(out: DrawCmd[], world: World, opts: ViewOptions): void {
  R(out, 0, 0, DESIGN_W, DESIGN_H, COLORS.overlay);
  R(out, READY_PANEL.x, READY_PANEL.y, READY_PANEL.w, READY_PANEL.h, COLORS.panelAlpha, {
    radius: RADIUS.lg,
    stroke: withAlpha(COLORS.gold, 0.72),
    width: 2,
  });
  const cx = DESIGN_W / 2;
  T(out, cx, 206, '三 國 群 英 傳 2', 40, COLORS.gold, { align: 'center', bold: true });
  T(out, cx, 246, '豎屏重製 · Canvas2D 預覽', 18, COLORS.textDim, { align: 'center' });
  LN(out, 150, 276, 600, 276, withAlpha(COLORS.gold, 0.28), 1);

  T(out, cx, 310, '邏輯核心 15/15 測試通過 · 戰鬥規則零改動', 15, COLORS.ok, {
    align: 'center',
  });

  const a = opts.aLabel ?? `我軍 · ${sideMeta(world, 'A').troop} · ${sideMeta(world, 'A').formation}`;
  const b = opts.bLabel ?? `敵軍 · ${sideMeta(world, 'B').troop} · ${sideMeta(world, 'B').formation}`;
  T(out, 118, 362, a, 18, COLORS.oursLight, { bold: true });
  T(out, cx, 362, 'VS', 18, COLORS.gold, { align: 'center', bold: true });
  T(out, 632, 362, b, 18, COLORS.enemyLight, { align: 'right', bold: true });

  T(out, cx, 398, `我方 ${world.sides.A.start} 兵 · 敵方 ${world.sides.B.start} 兵 · 種子 ${opts.seed ?? 1}`, 14, COLORS.textDim, {
    align: 'center',
  });

  const bullets = [
    '· 點「開戰」進入 100 人實時兵戰（固定 60 Hz 邏輯）',
    '· 點技能格即施放（原作同：不用選目標）',
    '· 打完自動出結算；按 R 或「再戰」重開',
  ];
  bullets.forEach((s, i) => {
    T(out, 128, 448 + i * 28, s, 15, COLORS.text);
  });

  R(out, START_BUTTON.x, START_BUTTON.y, START_BUTTON.w, START_BUTTON.h, COLORS.gold, {
    radius: RADIUS.md,
    stroke: COLORS.goldLight,
    width: 2,
  });
  T(out, cx, START_BUTTON.y + 38, '開 戰', 32, COLORS.bgDeep, { align: 'center', bold: true });
  T(out, cx, START_BUTTON.y + 68, '點擊 / 空格', 12, withAlpha(COLORS.bgDeep, 0.75), {
    align: 'center',
  });

  T(out, cx, 748, '配置在頁面上方切換（我方兵種 / 陣形 / 種子）', 12, COLORS.textFaint, {
    align: 'center',
  });
}

function drawSettle(out: DrawCmd[], world: World, opts: ViewOptions): void {
  R(out, 0, 0, DESIGN_W, DESIGN_H, COLORS.overlay);
  R(out, SETTLE_PANEL.x, SETTLE_PANEL.y, SETTLE_PANEL.w, SETTLE_PANEL.h, COLORS.panelAlpha, {
    radius: RADIUS.lg,
    stroke: withAlpha(COLORS.gold, 0.72),
    width: 2,
  });
  const s = opts.settlement;
  const cx = DESIGN_W / 2;
  if (!s) {
    T(out, cx, 420, '結算數據缺失', FONT.h1, COLORS.danger, { align: 'center' });
    drawAgainButton(out);
    return;
  }
  const title = s.winner === 'A' ? '大 勝' : s.winner === 'B' ? '敗 走' : '平 手';
  const color = s.winner === 'A' ? COLORS.gold : s.winner === 'B' ? COLORS.danger : COLORS.text;
  T(out, cx, 198, title, FONT.hero, color, { align: 'center', bold: true });
  T(out, cx, 238, `${s.modeName} · 用時 ${s.durationSec} 秒 · ${s.kills} 擊殺`, FONT.body, COLORS.textDim, {
    align: 'center',
  });
  LN(out, 120, 270, 630, 270, withAlpha(COLORS.gold, 0.30), 1);

  const rows: [string, string, string][] = [
    ['敵將等級', `Lv.${s.enemyLevel}`, COLORS.text],
    ['戰功', `+${s.score}`, COLORS.gold],
    ['經驗', `+${s.expGain}`, COLORS.ok],
    ['功勳', `+${s.meritGain}`, COLORS.goldLight],
    ['等級', `Lv.${s.level}${s.levelUp > 0 ? `  (+${s.levelUp})` : ''}`, s.levelUp > 0 ? COLORS.gold : COLORS.text],
    ['戰績', `${s.record.wins} 勝 / ${s.record.losses} 負`, COLORS.textDim],
  ];
  rows.forEach(([k, v, c], i) => {
    const y = 316 + i * 42;
    R(out, 118, y - 20, 514, 34, i % 2 === 0 ? COLORS.white : 'transparent', { alpha: 0.022, radius: 4 });
    T(out, 132, y, k, 16, COLORS.textDim);
    T(out, 618, y, v, 19, c, { align: 'right', bold: true });
  });

  // 经验条
  const floor = expToReach(s.level);
  const span = Math.max(1, s.nextLevelAt - floor);
  const ratio = clamp((s.exp - floor) / span, 0, 1);
  bar(out, 132, 600, 486, 12, ratio, COLORS.gold);
  T(out, 132, 634, `EXP ${Math.round(s.exp)} / ${Math.round(s.nextLevelAt)}`, 12, COLORS.textDim);
  T(out, 618, 634, `距下一級 ${Math.max(0, Math.round(s.nextLevelAt - s.exp))}`, 12, COLORS.textDim, {
    align: 'right',
  });

  T(out, cx, 690, '本局結果只存在內存，不寫存檔（預覽版）', 12, COLORS.textFaint, {
    align: 'center',
  });
  drawAgainButton(out);
}

function drawAgainButton(out: DrawCmd[]): void {
  R(out, AGAIN_BUTTON.x, AGAIN_BUTTON.y, AGAIN_BUTTON.w, AGAIN_BUTTON.h, COLORS.gold, {
    radius: RADIUS.md,
    stroke: COLORS.goldLight,
    width: 2,
  });
  T(out, AGAIN_BUTTON.x + AGAIN_BUTTON.w / 2, AGAIN_BUTTON.y + 46, '再 戰', 28, COLORS.bgDeep, {
    align: 'center',
    bold: true,
  });
}

// ---------------------------------------------------------------------------
// 交互命中
// ---------------------------------------------------------------------------

export type Hit =
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'skill'; index: number; seq: number; canCast: boolean; reason: CastReason | null }
  | { type: 'assault' }
  | { type: 'retreat' }
  /** 第一层 6 大按钮（`btn` 0..5，与 `cmd6Rects()` 同下标；`canUse` 已问过 core） */
  | { type: 'cmd6'; btn: number; kind: Cmd6Kind; label: string; canUse: boolean; reason: string | null }
  /** 子菜单面板的空白处：吃掉（既不开火也不收起，只有面板外的点击才收起） */
  | { type: 'armyMenu' }
  /** 第二层 6 条部队指令（`slot` 直接可以喂 `applyArmyCmd(world, 'A', slot)`） */
  | {
      type: 'armyCmd';
      slot: number;
      label: string;
      kind: ArmyCmdKind;
      canUse: boolean;
      reason: string | null;
    }
  | { type: 'field'; gx: number; gy: number; worldX: number; worldY: number };

/**
 * 命中判定。
 *
 * 顺序是**叠层顺序倒过来**：子菜单（最上）→ 技能格 → 6 大按钮 → 突擊/撤退 → 战场。
 * 旧返回值 `skill` / `assault` / `retreat` / `field` 的名字与语义**一个都没动**
 * （`main.js` 的 6 个 `hit.type` 分支与 `tests/hud_slots.test.ts` 依赖它们）。
 */
export function hitTest(world: World, opts: ViewOptions, sx: number, sy: number): Hit | null {
  const mode = opts.mode ?? 'fighting';
  if (mode === 'ready') {
    return contains(START_BUTTON, sx, sy) ? { type: 'start' } : null;
  }
  if (mode === 'settled') {
    return contains(AGAIN_BUTTON, sx, sy) ? { type: 'restart' } : null;
  }

  // ---- 第二层：子菜单（展开时它就是最上面那层）-----------------------------
  const menuOpen = opts.armyMenu ?? armyMenuOpened;
  let closedByThisClick = false;
  if (menuOpen) {
    const rows = armyCmdRects();
    const items = armyMenuItems(world);
    for (let i = 0; i < rows.length; i++) {
      if (!contains(rows[i]!, sx, sy)) continue;
      const it = items[i];
      if (!it) return { type: 'armyMenu' };
      return {
        type: 'armyCmd',
        slot: it.slot,
        label: it.label,
        kind: it.kind,
        canUse: it.ok,
        reason: it.reason,
      };
    }
    // 面板内的空白（边框留白）→ 吞掉，别让它漏到战场变成"点地移动"
    if (contains(armyMenuRect(), sx, sy)) return { type: 'armyMenu' };
    // 面板外任何一点 → 收起，然后继续走正常命中（点技能格照样能放技）
    if (opts.armyMenu === undefined) {
      setArmyMenuOpen(false);
      closedByThisClick = true;
    }
  }

  const skills = (opts.skills ?? []).slice(0, MAX_SKILL_SLOTS);
  // 命中区与绘制共用 skillSlotRects()：8 格时第 5..8 格在第二行，这里绝不能再写死 4。
  const rects = skillSlotRects(skills.length);
  for (let i = 0; i < rects.length; i++) {
    if (!contains(rects[i]!, sx, sy)) continue;
    const slot = skills[i];
    if (!slot) return null;
    const reason = castBlockReason(world, slot);
    return { type: 'skill', index: i, seq: slot.seq, canCast: reason === null, reason };
  }

  // ---- 第一层：6 大按钮（点中「部隊指令」顺手开合子菜单）---------------------
  const six = cmd6Rects();
  for (let i = 0; i < six.length; i++) {
    if (!contains(six[i]!, sx, sy)) continue;
    if (i === 1 && !closedByThisClick) toggleArmyMenu();
    return cmd6Hit(world, i, opts);
  }

  if (contains(CHIP_ASSAULT, sx, sy)) return { type: 'assault' };
  if (contains(CHIP_RETREAT, sx, sy)) return { type: 'retreat' };

  const camX = opts.camX ?? camera(world);
  const cell = screenToCell(sx, sy, camX);
  if (!cell) return null;
  return { type: 'field', gx: cell.gx, gy: cell.gy, worldX: cell.worldX, worldY: cell.worldY };
}

// ---------------------------------------------------------------------------
// 飘字辅助
// ---------------------------------------------------------------------------

export function pushFloater(
  list: Floater[],
  x: number,
  y: number,
  text: string,
  color: string,
  ttl = 45,
  size = FONT.float,
): void {
  if (list.length >= 40) list.shift();
  list.push({ x, y, text, color, ttl, maxTtl: ttl, size });
}

/** 每个逻辑 tick 调一次；原地删过期项，保持数组引用不变 */
export function tickFloaters(list: Floater[]): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i]!;
    f.ttl -= 1;
    if (f.ttl <= 0) list.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Canvas2D 执行器
// ---------------------------------------------------------------------------

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (rr <= 0.01) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function execute(ctx: CanvasRenderingContext2D, c: DrawCmd): void {
  ctx.save();
  ctx.globalAlpha = c.alpha ?? 1;
  if (c.kind === 'sprite') {
    ctx.globalCompositeOperation = c.comp ?? 'source-over';
    if (c.rot) {
      // 绕锚点 (x,y) 旋转后绘制：图片左上角在旋转坐标系里位于 (ox,oy)
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, c.ox ?? -c.w / 2, c.oy ?? -c.h, c.w, c.h);
    } else {
      // x,y 是脚底中心：绘制矩形左上角 = (x - w/2, y - h)
      ctx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, c.x - c.w / 2, c.y - c.h, c.w, c.h);
    }
    ctx.restore();
    return;
  }
  if (c.kind === 'text') {
    ctx.font = `${c.bold ? '700 ' : '400 '}${c.size}px ${FONT_FAMILY}`;
    ctx.textAlign = c.align ?? 'left';
    ctx.textBaseline = c.baseline ?? 'alphabetic';
    if (c.stroke) {
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = c.strokeWidth ?? 3;
      if (c.maxWidth !== undefined) ctx.strokeText(c.text, c.x, c.y, c.maxWidth);
      else ctx.strokeText(c.text, c.x, c.y);
    }
    ctx.fillStyle = c.color;
    if (c.maxWidth !== undefined) ctx.fillText(c.text, c.x, c.y, c.maxWidth);
    else ctx.fillText(c.text, c.x, c.y);
    ctx.restore();
    return;
  }
  if (c.kind === 'line') {
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = c.width ?? 1;
    ctx.setLineDash(c.dash ?? []);
    ctx.beginPath();
    ctx.moveTo(c.x1, c.y1);
    ctx.lineTo(c.x2, c.y2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (c.kind === 'rect') {
    roundRectPath(ctx, c.x, c.y, c.w, c.h, c.radius ?? 0);
    if (c.fill) {
      ctx.fillStyle = c.fill;
      ctx.fill();
    }
    if (c.stroke) {
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = c.width ?? 1;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (c.kind === 'poly') {
    ctx.beginPath();
    c.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (c.close !== false) ctx.closePath();
    if (c.fill) {
      ctx.fillStyle = c.fill;
      ctx.fill();
    }
    if (c.stroke) {
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = c.width ?? 1;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // ellipse
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, Math.max(0.1, c.rx), Math.max(0.1, c.ry), 0, 0, Math.PI * 2);
  if (c.fill) {
    ctx.fillStyle = c.fill;
    ctx.fill();
  }
  if (c.stroke) {
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = c.width ?? 1;
    ctx.setLineDash(c.dash ?? []);
    ctx.stroke();
  }
  ctx.restore();
}

/** 唯一接触 Canvas2D 的入口：清屏 + 地形背景 + 顺序执行指令 */
export function render(ctx: CanvasRenderingContext2D, world: World, opts: ViewOptions = {}): void {
  const camX = opts.camX ?? camera(world);
  const terrain = world.terrain ?? 0;
  const cmds = buildFrame(world, opts);
  ctx.save();
  ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  // 原作战场背景：地面平铺 + 地平线三层视差带（只覆盖 FIELD，画在单位/特效之下）
  drawBattleBg(ctx, terrain, camX);
  battleBgTick(terrain);
  generalAtlasTick();
  for (const c of cmds) execute(ctx, c);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 杂项
// ---------------------------------------------------------------------------

/** 中文按字宽粗略折行（Canvas 的 fillText 不会自动换行） */
export function wrapCJK(text: string, maxChars: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > 0 && lines.length < maxLines) {
    if (rest.length <= maxChars) {
      lines.push(rest);
      rest = '';
      break;
    }
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest.length > 0 && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines;
}

/** 测试 / 调试用：把 100×14 的可见范围压缩成一行文字 */
export function debugSummary(world: World): string {
  const a = world.sides.A;
  const b = world.sides.B;
  return `tick=${world.tick} A=${a.aliveCount} B=${b.aliveCount} over=${world.over} winner=${world.winner ?? '-'}`;
}
