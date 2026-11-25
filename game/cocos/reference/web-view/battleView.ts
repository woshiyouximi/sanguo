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
  TICK_HZ,
  camera,
  expToReach,
  qiCostOf,
  skillKindOf,
  type SettleResult,
  type Side,
  type Unit,
  type World,
} from '../core/battle.ts';
import type { GameData } from '../types.ts';
import { actionAtlas, isDying, pickActionFrame, pushActionSprite, usesActionFrames } from './animSelect.ts';
import {
  BTN_ASSAULT,
  BTN_RETREAT,
  CONSOLE,
  DESIGN_H,
  DESIGN_W,
  FIELD,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_TOP,
  GRID_H,
  GRID_W,
  HUD,
  HUD_BAR_A,
  HUD_BAR_B,
  HUD_HP_A,
  HUD_HP_B,
  HUD_QI_A,
  HUD_QI_B,
  LANE_PX,
  MESSAGE_BOX,
  MINIMAP,
  PORTRAIT,
  READY_PANEL,
  ROW_PX,
  SETTLE_PANEL,
  START_BUTTON,
  AGAIN_BUTTON,
  cellCenter,
  clamp,
  contains,
  project,
  screenToCell,
  skillSlotRect,
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
  /** 武将技特效图集（可选）：有对应目录就画原作帧，没有就退回虚线圈 */
  fx?: FxAtlas | null;
  /** 主将立绘（可选）：有就画进头像框，没有就用「將」占位 */
  portrait?: { img: CanvasImageSource; w: number; h: number } | null;
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
  /** core 的 Fx.ttl 初值，默认 30 tick（有 Fx.life 时以 fx.life 为准） */
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
  /** 每帧停留的 tick 数（30Hz 下 5 ≈ 6fps） */
  hold?: number;
}

export const DEFAULT_SKILL_SEQ: readonly number[] = [1, 50, 2, 104];

/** 从数据表生成 4 格常用技能栏（表现层新增，不改消耗与冷却） */
export function makeSkillBar(data: GameData, seqs: readonly number[] = DEFAULT_SKILL_SEQ): SkillSlot[] {
  return seqs.map((seq) => {
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

  drawField(out, camX, opts.time ?? 0);
  drawAim(out, world, camX, opts);
  drawActors(out, world, camX, opts.atlas ?? null);
  // 特效画在兵之上：原作里武将技是盖在战场上的，叠在最底层会被 100 个兵挡住
  drawFx(out, world, camX, opts.fx ?? null);
  drawFloaters(out, opts.floaters ?? [], camX);
  drawMinimap(out, world, camX);
  drawHud(out, world);

  const mode = opts.mode ?? 'fighting';
  drawConsole(out, world, opts);
  if (mode === 'ready') drawReady(out, world, opts);
  else if (mode === 'settled') drawSettle(out, world, opts);
  return out;
}

function drawField(out: DrawCmd[], camX: number, time: number): void {
  R(out, FIELD.x, FIELD.y, FIELD.w, FIELD.h, COLORS.field);

  // 车道底色：奇偶交替，给 14 条车道一点可读性
  for (let lane = 0; lane < GRID_H; lane++) {
    if (lane % 2 === 0) continue;
    R(out, lane * LANE_PX, FIELD_TOP, LANE_PX, FIELD.h, COLORS.white, { alpha: 0.012 });
  }

  // 车道分隔线（14 条车道 → 13 根内线）
  for (let lane = 1; lane < GRID_H; lane++) {
    const x = lane * LANE_PX;
    const strong = lane === 7;
    LN(
      out,
      x,
      FIELD_TOP,
      x,
      FIELD_BOTTOM,
      strong ? withAlpha(COLORS.gold, 0.16) : withAlpha(COLORS.white, 0.055),
      strong ? 1.5 : 1,
    );
  }

  // 推进轴横线：只画可见范围，每 5 行加重
  const half = FIELD.h / 2 / ROW_PX;
  const min = Math.max(0, Math.floor(camX - half - 1));
  const max = Math.min(GRID_W - 1, Math.ceil(camX + half + 1));
  for (let gx = min; gx <= max; gx++) {
    const y = FIELD_CENTER_Y + (gx - camX) * ROW_PX;
    if (y < FIELD_TOP - 2 || y > FIELD_BOTTOM + 2) continue;
    const strong = gx % 5 === 0;
    LN(
      out,
      0,
      y,
      DESIGN_W,
      y,
      strong ? withAlpha(COLORS.white, 0.10) : withAlpha(COLORS.white, 0.035),
      strong ? 1.2 : 1,
    );
    if (strong) {
      T(out, 4, y - 3, String(gx), 10, COLORS.textFaint, { alpha: 0.75 });
    }
  }

  // 中线（纯视觉参照，不参与规则）
  const midY = FIELD_CENTER_Y + (GRID_W / 2 - camX) * ROW_PX;
  if (midY > FIELD_TOP && midY < FIELD_BOTTOM) {
    LN(out, 0, midY, DESIGN_W, midY, withAlpha(COLORS.gold, 0.10), 1, 1, [7, 9]);
    T(out, DESIGN_W - 16, midY - 6, '中線', 10, withAlpha(COLORS.gold, 0.38), {
      align: 'right',
    });
  }

  // 上下沿 + 阵营方向提示
  LN(out, 0, FIELD_TOP + 0.5, DESIGN_W, FIELD_TOP + 0.5, withAlpha(COLORS.gold, 0.32), 1.5);
  LN(out, 0, FIELD_BOTTOM - 0.5, DESIGN_W, FIELD_BOTTOM - 0.5, withAlpha(COLORS.ours, 0.42), 1.5);
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

function drawActors(out: DrawCmd[], world: World, camX: number, atlas: SpriteAtlas | null): void {
  const actors: { u: Unit; x: number; y: number }[] = [];
  for (const u of world.units) {
    // 只有「有动作帧的那一侧」才画死亡窗口，否则尸体只剩一个影子
    if (!u.alive && !(isDying(u, world) && usesActionFrames(u))) continue;
    const p = project(u.x, u.y, camX);
    if (p.y < FIELD_TOP - 80 || p.y > FIELD_BOTTOM + 80) continue;
    actors.push({ u, x: p.x, y: p.y });
  }
  // 远者（worldX 小，屏幕上方）先画；同深度时士兵先、主将后
  actors.sort((a, b) => {
    if (a.u.x !== b.u.x) return a.u.x - b.u.x;
    if (a.u.y !== b.u.y) return a.u.y - b.u.y;
    return uGeneral(a.u) === uGeneral(b.u) ? 0 : uGeneral(a.u) ? 1 : -1;
  });
  for (const a of actors) {
    if (uGeneral(a.u)) drawGeneral(out, world, a.u, a.x, a.y);
    else drawSoldier(out, world, a.u, a.x, a.y, atlas);
  }
}

function uGeneral(u: Unit): boolean {
  return (u as unknown as { isGeneral?: boolean }).isGeneral === true;
}

function drawSoldier(
  out: DrawCmd[],
  world: World,
  u: Unit,
  x: number,
  y: number,
  atlas: SpriteAtlas | null,
): void {
  const dir = u.side === 'A' ? -1 : 1; // 我方朝上（屏幕 y 减小），敌方朝下
  const fx = Math.round(x);
  const fy = Math.round(y);

  E(out, fx, fy + 13, 12, 4, COLORS.shadow);

  // 背视动作帧（攻击/受击/死亡）：有就画完直接返回，否则退回走路序列 / 色块
  const act = pickActionFrame(u, world, actionAtlas);
  if (pushActionSprite(out, act, fx, fy)) return;
  if (!u.alive) return; // 死亡窗口内但图集没加载好：别画站着的尸体


  // 有图集就画真序列帧：我方=背视、敌方=正视；同一 tick 内按单位 id 错开相位，
  // 否则 100 个兵会完全同步踏步（一眼假）。
  if (atlas) {
    const set = u.side === 'A' ? atlas.back : atlas.front;
    if (set.length > 0) {
      const hold = atlas.hold ?? 5;
      // 出手后的一小段窗口播攻击帧：cd 是从 ATTACK_COOLDOWN 递减的，
      // 用「剩余 cd」把 17 帧均匀铺开，播完自动回到走路帧。
      const atk = atlas.attack ?? [];
      const swinging = atk.length > 0 && u.cd > 96 && !usesActionFrames(u);
      const seq = swinging ? atk : set;
      let idx: number;
      if (swinging) {
        const k = Math.min(atk.length - 1, Math.max(0, Math.floor((120 - u.cd) / (24 / atk.length))));
        idx = k;
      } else {
        // Unit 没有 id：用初始格位派生一个稳定的相位偏移（同一格永远同一相位）
        const phase = Math.floor(u.x * 7 + u.y * 13) + Math.floor(world.tick / hold);
        idx = ((phase % seq.length) + seq.length) % seq.length;
      }
      const name = seq[idx]!;
      const f = atlas.frames[name];
      if (f) {
        const w = 66;
        const h = (f.h / f.w) * w;
        out.push({
          kind: 'sprite',
          img: u.side === 'A' ? atlas.img : (atlas.imgEnemy ?? atlas.img),
          sx: f.x, sy: f.y, sw: f.w, sh: f.h,
          x: fx, y: fy + 26,
          w, h,
        });
        return;
      }
    }
  }
  R(out, fx - 11, fy - 16, 22, 32, sideDark(u.side), {
    radius: 3,
    stroke: withAlpha(COLORS.black, 0.55),
    width: 1,
  });
  R(out, fx - 8, fy - 13, 16, 26, sideColor(u.side), { radius: 2 });
  R(out, fx - 8, fy - 13, 16, 6, sideLight(u.side), { radius: 2, alpha: 0.38 });
  // 朝向缺口：三角形永远在"朝前"的那条边上
  P(
    out,
    [
      { x: fx - 5, y: fy + dir * 16 },
      { x: fx + 5, y: fy + dir * 16 },
      { x: fx, y: fy + dir * 23 },
    ],
    sideLight(u.side),
    { alpha: 0.95 },
  );
  // 武器：一根短斜线，横屏/竖屏都不改逻辑，只增加剪影辨识
  LN(out, fx + 9, fy - 2, fx + 14, fy - 18, withAlpha(COLORS.goldLight, 0.55), 1.5);
}

function drawGeneral(out: DrawCmd[], world: World, u: Unit, x: number, y: number): void {
  const fx = Math.round(x);
  const fy = Math.round(y);
  const side = u.side;
  const g = world.sides[side].general;
  const dir = side === 'A' ? -1 : 1;
  const name = g.name || (side === 'A' ? '我軍主將' : '敵軍主將');

  // 脚下光环 + 阴影
  E(out, fx, fy + 22, 28, 9, withAlpha(COLORS.black, 0.35));
  E(out, fx, fy + 20, 26, 9, undefined, {
    stroke: withAlpha(COLORS.gold, 0.55),
    width: 1.5,
  });
  // 旗
  LN(out, fx + 25, fy - 50, fx + 25, fy - 8, withAlpha(COLORS.gold, 0.65), 2);
  P(
    out,
    [
      { x: fx + 25, y: fy - 50 },
      { x: fx + 39, y: fy - 44 },
      { x: fx + 25, y: fy - 38 },
    ],
    sideColor(side),
    { alpha: 0.9 },
  );

  // 身体
  R(out, fx - 18, fy - 24, 36, 48, sideDark(side), {
    radius: 4,
    stroke: withAlpha(COLORS.gold, 0.75),
    width: 2,
  });
  R(out, fx - 14, fy - 20, 28, 40, sideColor(side), { radius: 3 });
  // 朝向缺口
  P(
    out,
    [
      { x: fx - 7, y: fy + dir * 24 },
      { x: fx + 7, y: fy + dir * 24 },
      { x: fx, y: fy + dir * 33 },
    ],
    COLORS.gold,
    { alpha: 0.95 },
  );
  // 胸前菱形将徽
  P(
    out,
    [
      { x: fx, y: fy - 12 },
      { x: fx + 7, y: fy },
      { x: fx, y: fy + 12 },
      { x: fx - 7, y: fy },
    ],
    withAlpha(COLORS.goldLight, 0.9),
  );

  T(out, fx, fy - 36, name, 13, COLORS.gold, {
    align: 'center',
    stroke: withAlpha(COLORS.black, 0.8),
    strokeWidth: 3,
    bold: true,
  });
  bar(out, fx - 25, fy + 28, 50, 4, g.maxHp > 0 ? g.hp / g.maxHp : 0, COLORS.heal);
}

/**
 * core 的 `Fx.ttl` 从 `Fx.life` 起、每 tick -1（见 battle.ts 的 cast/tickSkills），
 * 视图层不改逻辑，只把「已过 tick / 总时长」换算成帧号：
 *   t = (life - ttl) / life;  idx = floor(t * frames)
 * 于是「一帧 ≈ life/frames tick」——life 由 core 按帧数推（fxTtlOf），
 * 152 帧的技就有 132 tick 可放，不会像以前那样 30 tick 只能抽 30 帧。
 */
const FX_LIFE = 30;

/** 解析后的一段（from/to 已归一化，叠加段已换成共享时间窗） */
interface FxSlice {
  dir: string;
  from: number;
  to: number;
  /** 叠加段（原 index.json 里写成 from==to） */
  overlay: boolean;
}

/**
 * `seqDirs[seq]` → 可直接求值的段表。
 *  - 正常段：`to > from`，自己占一个时间窗；
 *  - 叠加段：`to <= from`，窗口 = 最近的正常段（先往前找、找不到再往后找、都没有就整段 0..1）。
 */
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
    const p = project(wx, wy, camX);
    if (p.y < FIELD_TOP - 260 || p.y > FIELD_BOTTOM + 260) continue;
    const k = clamp(fx.ttl / FX_LIFE, 0, 1);
    const magic = world.data.magics.find((m) => m.SEQUENCE === fx.seq);

    // ---- 原作序列帧：先算时间轴，再决定这一段用哪个目录 ----
    const s = fxAtlas?.scale ?? 0.8;
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
        if (p.y + by1 < FIELD_TOP - 300 || p.y + by0 > FIELD_BOTTOM + 300) continue;
        minX = Math.min(minX, bx0);
        maxX = Math.max(maxX, bx1);
        minY = Math.min(minY, by0);
        maxY = Math.max(maxY, by1);
        out.push({
          kind: 'sprite',
          img: d.dir.img,
          sx: f.x, sy: f.y, sw: f.w, sh: f.h,
          x: p.x,
          y: p.y,
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
        const top = p.y + minY;
        T(out, p.x + (minX + maxX) / 2, top - 10, magic.NAME, 13, withAlpha(COLORS.goldLight, 0.5 + 0.5 * k), {
          align: 'center',
          stroke: withAlpha(COLORS.bgDeep, 0.8),
          strokeWidth: 3,
        });
      }
      continue;
    }

    // ---- 兜底：虚线圈（与接入前完全一致）----
    const pulse = 1 + (1 - k) * 0.18;
    const rx = r * LANE_PX * pulse;
    const ry = r * ROW_PX * pulse;
    const c =
      fx.kind === 'heal'
        ? COLORS.heal
        : fx.kind === 'aoe'
          ? COLORS.gold
          : fx.side === 'A'
            ? COLORS.oursLight
            : COLORS.enemyLight;
    E(out, p.x, p.y, rx, ry, withAlpha(c, 0.10 + 0.16 * k));
    E(out, p.x, p.y, rx, ry, undefined, {
      stroke: withAlpha(c, 0.35 + 0.5 * k),
      width: 2.5,
      dash: fx.kind === 'aoe' ? [10, 7] : undefined,
    });
    E(out, p.x, p.y, rx * 0.62, ry * 0.62, undefined, {
      stroke: withAlpha(c, 0.22 * k),
      width: 1,
    });
    if (magic) {
      T(out, p.x, p.y - ry - 8, magic.NAME, 13, withAlpha(c, 0.5 + 0.5 * k), {
        align: 'center',
        stroke: withAlpha(COLORS.bgDeep, 0.8),
        strokeWidth: 3,
      });
    }
  }
}

function drawAim(out: DrawCmd[], world: World, camX: number, opts: ViewOptions): void {
  const idx = opts.selectedSkill;
  if (idx === null || idx === undefined || !opts.aim) return;
  const slot = (opts.skills ?? [])[idx];
  if (!slot || slot.kind === 'heal') return;
  const p = cellCenter(opts.aim.gx, opts.aim.gy, camX);
  const r = skillRadius(slot.kind);
  E(out, p.x, p.y, r * LANE_PX, r * ROW_PX, withAlpha(COLORS.gold, 0.07), {
    stroke: withAlpha(COLORS.goldLight, 0.85),
    width: 2,
    dash: [8, 6],
  });
  E(out, p.x, p.y, 5, 5, withAlpha(COLORS.goldLight, 0.9));
  T(out, p.x, p.y - r * ROW_PX - 10, `${slot.name} · 點擊施放`, 14, COLORS.goldLight, {
    align: 'center',
    stroke: withAlpha(COLORS.bgDeep, 0.9),
    strokeWidth: 4,
  });
  // 让 world 参与签名，避免调用方误以为瞄准与 World 无关
  void world;
}

function drawFloaters(out: DrawCmd[], floaters: Floater[], camX: number): void {
  for (const f of floaters) {
    const p = project(f.x, f.y, camX);
    if (p.y < FIELD_TOP - 40 || p.y > FIELD_BOTTOM + 40) continue;
    const k = clamp(f.ttl / f.maxTtl, 0, 1);
    const rise = (1 - k) * 28;
    T(out, p.x, p.y - 26 - rise, f.text, f.size, f.color, {
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

  const half = FIELD.h / 2 / ROW_PX;
  const winTop = y + ((camX - half) / (GRID_W - 1)) * h;
  const winH = ((half * 2) / (GRID_W - 1)) * h;
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

function formatClock(tick: number): string {
  const total = Math.floor(tick / TICK_HZ);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
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

  // 计时 / 士气
  T(out, DESIGN_W / 2, 34, formatClock(world.tick), FONT.num, COLORS.gold, {
    align: 'center',
    bold: true,
  });
  T(out, DESIGN_W / 2, 55, `士氣 ${a.morale} · ${b.morale}`, 12, COLORS.textDim, {
    align: 'center',
  });

  // 双方主将体力 / 气力
  const ga = a.general;
  const gb = b.general;
  T(out, 16, 72, '將', 10, COLORS.textDim);
  bar(out, HUD_HP_A.x, HUD_HP_A.y, HUD_HP_A.w, HUD_HP_A.h, ga.maxHp ? ga.hp / ga.maxHp : 0, COLORS.heal);
  bar(out, HUD_QI_A.x, HUD_QI_A.y, HUD_QI_A.w, HUD_QI_A.h, ga.qi / 120000, COLORS.gold);
  T(out, 734, 72, '將', 10, COLORS.textDim, { align: 'right' });
  bar(out, HUD_HP_B.x, HUD_HP_B.y, HUD_HP_B.w, HUD_HP_B.h, gb.maxHp ? gb.hp / gb.maxHp : 0, COLORS.heal, {
    mirror: true,
  });
  bar(out, HUD_QI_B.x, HUD_QI_B.y, HUD_QI_B.w, HUD_QI_B.h, gb.qi / 120000, COLORS.gold, {
    mirror: true,
  });
}

const HUD_H_LINE = 99;

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

  // 主将信息
  T(out, 116, 1036, g.name, FONT.h2, g.alive ? COLORS.text : COLORS.textFaint, { bold: true });
  T(out, 366, 1036, g.alive ? '在陣' : '陣亡', FONT.small, g.alive ? COLORS.ok : COLORS.danger, {
    align: 'right',
  });
  T(out, 116, 1052, `武 ${g.str} · 智 ${g.int}`, FONT.small, COLORS.textDim);
  bar(out, 116, 1062, 238, 9, g.maxHp ? g.hp / g.maxHp : 0, COLORS.heal);
  T(out, 358, 1070, `體 ${Math.max(0, Math.ceil(g.hp))}`, 10, COLORS.textDim, { align: 'right' });
  bar(out, 116, 1076, 238, 6, g.mpMax ? g.mp / g.mpMax : 0, COLORS.oursLight);
  T(out, 358, 1083, `技 ${g.mp}`, 10, COLORS.textDim, { align: 'right' });
  bar(out, 116, 1087, 238, 4, g.qi / 120000, COLORS.gold);
  T(out, 358, 1094, `氣 ${Math.round(g.qi / 1200)}%`, 10, COLORS.textDim, { align: 'right' });

  // 技能格
  const skills = opts.skills ?? [];
  for (let i = 0; i < 4; i++) {
    const r = skillSlotRect(i);
    const slot = skills[i];
    const selected = opts.selectedSkill === i;
    const reason = slot ? castBlockReason(world, slot) : 'mp';
    const disabled = !slot || reason !== null || (opts.mode ?? 'fighting') !== 'fighting';
    R(out, r.x, r.y, r.w, r.h, disabled ? COLORS.panel : COLORS.panelHi, {
      radius: RADIUS.md,
      stroke: selected ? COLORS.gold : withAlpha(COLORS.white, 0.10),
      width: selected ? 2.5 : 1,
      alpha: disabled ? 0.55 : 1,
    });
    if (!slot) continue;
    T(out, r.x + 8, r.y + 16, `${i + 1}`, 11, COLORS.textFaint);
    T(out, r.x + r.w / 2, r.y + 38, slot.name, 15, disabled ? COLORS.textFaint : COLORS.text, {
      align: 'center',
      bold: true,
      maxWidth: r.w - 10,
    });
    const kindLabel = slot.kind === 'heal' ? '療' : slot.kind === 'aoe' ? '範圍' : '單體';
    T(out, r.x + r.w / 2, r.y + 58, kindLabel, 11, COLORS.textDim, { align: 'center' });
    T(out, r.x + r.w / 2, r.y + 76, `技${slot.mp} · 氣${Math.round(slot.qi / 1200)}%`, 11, disabled ? COLORS.textFaint : COLORS.gold, {
      align: 'center',
    });
  }

  // 突击 / 撤退：core 目前没有这两条指令的 API，只画出来并明确置灰
  drawCommandButton(out, BTN_ASSAULT, '突 擊', 'v1 預覽未接', false);
  drawCommandButton(out, BTN_RETREAT, '撤 退', 'v1 預覽未接', false);

  // 提示框
  R(out, MESSAGE_BOX.x, MESSAGE_BOX.y, MESSAGE_BOX.w, MESSAGE_BOX.h, COLORS.panel, {
    radius: RADIUS.md,
    stroke: withAlpha(COLORS.white, 0.07),
    width: 1,
  });
  const msg = opts.message ?? '點技能格 → 點戰場施放；命療術直接施放。';
  const lines = wrapCJK(msg, 22, 2);
  lines.forEach((line, i) => {
    T(out, MESSAGE_BOX.x + 12, MESSAGE_BOX.y + 26 + i * 22, line, 14, i === 0 ? COLORS.text : COLORS.textDim);
  });
  T(out, MESSAGE_BOX.x + MESSAGE_BOX.w - 10, MESSAGE_BOX.y + MESSAGE_BOX.h - 10, '1-4 / R', 10, COLORS.textFaint, {
    align: 'right',
  });
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
    '· 點「開戰」進入 100 人實時兵戰（固定 30 Hz 邏輯）',
    '· 點技能格 → 點戰場施放；命療術點技能格即放',
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
  | { type: 'field'; gx: number; gy: number; worldX: number; worldY: number };

export function hitTest(world: World, opts: ViewOptions, sx: number, sy: number): Hit | null {
  const mode = opts.mode ?? 'fighting';
  if (mode === 'ready') {
    return contains(START_BUTTON, sx, sy) ? { type: 'start' } : null;
  }
  if (mode === 'settled') {
    return contains(AGAIN_BUTTON, sx, sy) ? { type: 'restart' } : null;
  }
  const skills = opts.skills ?? [];
  for (let i = 0; i < skills.length && i < 4; i++) {
    if (!contains(skillSlotRect(i), sx, sy)) continue;
    const slot = skills[i];
    if (!slot) return null;
    const reason = castBlockReason(world, slot);
    return { type: 'skill', index: i, seq: slot.seq, canCast: reason === null, reason };
  }
  if (contains(BTN_ASSAULT, sx, sy)) return { type: 'assault' };
  if (contains(BTN_RETREAT, sx, sy)) return { type: 'retreat' };

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

/** 唯一接触 Canvas2D 的入口：清屏 + 顺序执行指令 */
export function render(ctx: CanvasRenderingContext2D, world: World, opts: ViewOptions = {}): void {
  const cmds = buildFrame(world, opts);
  ctx.save();
  ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
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
