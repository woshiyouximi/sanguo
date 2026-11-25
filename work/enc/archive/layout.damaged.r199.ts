/*
 * ⚠ R198 事故说明（2026-11-25 19:23）
 *
 * 本文件的**代码部分完好**（tsc 通过、1544 测试通过、投影/命中数值未变），
 * 但 47 行**中文注释**在 19:23:25 被 `pwsh Set-Content`（PS 5.1 默认 ANSI/CP936）
 * 写坏成 U+FFFD。损坏只落在注释与字符串说明里，没有落在代码行（已逐行核对：
 * 含 FFFD 的 47 行全部是 `//`、`*`、`/*` 开头的注释行）。
 *
 * 处置：保留可运行代码，注释待重写。要读原始注释请看 `game/dist/view/layout.js`
 * （19:12:06 的编译产物，tsc 保留注释，是可读的干净副本），
 * 或 `project/193_透视投影.md` / `project/198_透视边界与相机.md`。
 */

/**
 * 750×1334 竖屏布局与坐标换算�? *
 * 三带划分（依据：project/02 §2.5）：
 *   HUD 100px（y 0..100�?/ 战场 900px（y 100..1000�?/ 控制�?334px（y 1000..1334�? *
 * 重要：坐标轴�?`game/src/core/battle.ts` 的实现为准，而不�?02 文档里的
 * 文字公式。core �?A 方（我方）落�?worldX 高位、`core.project()` �? * `sy = 550 + (worldX - camX) * ROW_PX`，所�?**worldX 越大 �?屏幕越靠�?*�? * 我方在下、敌方在上。视图层只做"包一�?，绝不反向�? *
 * R193：落屏不再用 core 的常数投影，改用 `projection.ts` 的透视投影
 * （近大远小，�?`project/193_透视投影.md`）；本文件的 `project` / `screenToCell` /
 * `cellCenter` / `cellRect` 全部转发过去�?*逻辑层（core）一行没�?*�? *
 * 本文件不引用 `cc`，也不引�?DOM�? */
import { GRID_H, GRID_W, LANE_PX, ROW_PX, SCALE } from '../core/battle.ts';
import {
  clampCameraX,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_H,
  FIELD_TOP,
  lanePitch,
  laneScreenX,
  projectCell,
  projectUnit,
  projectionInfo,
  rowEdgeX,
  rowPitch,
  rowScale,
  rowScreenY,
  screenToUnit,
} from './projection.ts';

/** 设计分辨率（依据：PROJECT_BRIEF §5�?*/
export const DESIGN_W = 750;
export const DESIGN_H = 1334;

/**
 * 三段带（依据：project/02 §2.5）�? *
 * 战场带的四个常量**�?`projection.ts` 转出**：透视投影才是「战场带 = 一格阵的可见窗口�? * 的唯一定义处，这里只做转发（值仍�?100 / 900 / 1000 / 550，外�?API 不变）�? */
export { FIELD_BOTTOM, FIELD_CENTER_Y, FIELD_H, FIELD_TOP };
export const HUD_H = 100;
export const CONSOLE_TOP = 1000;
export const CONSOLE_H = 334;

/** 安全区参考值（依据：PROJECT_BRIEF §5，真机由 wx.getWindowInfo 提供�?*/
export const SAFE_INSET = { top: 88, bottom: 88, left: 0, right: 0 };

/**
 * 一屏可见纵深（行）= 900 / 71.43 = 12.6（依据：project/02 §2.3）—�?*常数投影时代的数�?*�? *
 * R193 起落屏用透视（`projection.ROWS_VISIBLE` = 13.33 行），但本常量保留原值：
 * 它是「格�?71.43 时的朴素换算」，`tests/fidelity_net.test.ts` 也按这个口径钉着�? * 不代表现在的实际可见行数。要看真实值用 `projectionInfo(camX).rows`�? */
export const VISIBLE_ROWS = FIELD_H / ROW_PX;

/** 一屏可见车�?= 750 / 53.57 = 14（恰好全见） */
export const VISIBLE_LANES = DESIGN_W / LANE_PX;

/**
 * 镜头夹取范围（行）：**R198 起由 `core/field.ts` 反解**（带�?+ 两端精灵身位），
 * �?`core.camera()` 共用同一个函�?�?两边不可能再各写一份数字�? *
 * 旧�?`CAM_HALF_ROWS = FIELD_H/2/ROW_PX`�? 6.3）是**常数投影时代**的半窗，
 * 现在只作 `camera()` 的换镜判据（「两军是否相隔超过一屏」），不再是夹取范围�? * 新范�?�?[6.29, 64.49]（旧 ±6.3 �?[6.30, 63.70]），实测�? * `project/198_透视边界与相�?md` §3�? */
export { CAM_HALF_ROWS, CAM_MAX, CAM_MIN } from '../core/field.ts';

export { GRID_H, GRID_W, LANE_PX, ROW_PX, SCALE };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** 常用区域 */
export const HUD: Rect = { x: 0, y: 0, w: DESIGN_W, h: HUD_H };
export const FIELD: Rect = { x: 0, y: FIELD_TOP, w: DESIGN_W, h: FIELD_H };
export const CONSOLE: Rect = { x: 0, y: CONSOLE_TOP, w: DESIGN_W, h: CONSOLE_H };

/** 战况条内的双方兵力条（A �?B 右） */
export const HUD_BAR_A: Rect = { x: 16, y: 56, w: 280, h: 11 };
export const HUD_BAR_B: Rect = { x: 454, y: 56, w: 280, h: 11 };

/** 主将体力 / 气力�?*/
export const HUD_HP_A: Rect = { x: 16, y: 76, w: 180, h: 6 };
export const HUD_HP_B: Rect = { x: 554, y: 76, w: 180, h: 6 };
export const HUD_QI_A: Rect = { x: 16, y: 86, w: 180, h: 3 };
export const HUD_QI_B: Rect = { x: 554, y: 86, w: 180, h: 3 };

/**
 * 顶部中央的「战场剩余时间」金牌�? *
 * 依据 `work/video_ui_b/B_battle_0842.png`�?280×720）：金牌在顶栏正中，木纹�?+ 金边�? * 里面是中文数字（那一帧是「六十七」）。原尺寸�?100×40 @1280×720 �?竖屏�?HUD 高（100�? * 放大�?214×48，左右不压双方兵种文字（左字�?x�?00，右字起�?x�?50）�? */
export const CLOCK_PLAQUE: Rect = { x: 268, y: 6, w: 214, h: 48 };

/** 控制台：主将头像 + 信息 + 4 技能格 + 突击/撤退 + 提示�?*/
export const PORTRAIT: Rect = { x: 18, y: 1012, w: 86, h: 108 };
export const GENERAL_INFO: Rect = { x: 116, y: 1012, w: 250, h: 100 };
/**
 * 控制台里的敌方主将卡（原作底部是**左右两块**，右块整块镜像：立绘在右、字段列反过来）�? *
 * 原作右块能占 x�?80..640，是因为它的下半屏只有「立�?+ 两块卡」；我们的控制台�? * x524..732 / y1030..1302 摆了 5 �?cmd6 面板（`CMD6_X0`），直接照抄会压在上面�? * 所以敌将卡只取两块之间的空档：x366..517（我方卡 `GENERAL_INFO` 右边�?�?cmd6 左边界）�? * 一�?151 宽的紧凑卡。两块的语义仍按原作镜像：外侧列 = 疲勞/智力，内侧列 = 士氣/武力�? */
export const GENERAL_CARD_B: Rect = { x: 366, y: 1012, w: 151, h: 100 };
/** 主将卡里两列字段的列距（外侧�?�?内侧列） */
export const GENERAL_CARD_COL = 124;

/**
 * 主将卡内的行位（`*Text` = 文本 alphabetic baseline；`*Bar` = 横条的顶边）�? *
 * 原作每侧�?**「兵 + 體」两条横�?+ 两行裸数�?*（`project/188_录像逐项复核.md` §7�? * `work/video_ui_b/B_battle_0842.png` 左赵�?`�?65/96` + `�?10/54`、右曹豹 `44/96` + `5/49`�? * 条在数值上方、右块整块镜像）。我们这块只�?1012..1098 �?86px 高（技能格第一行从 1100 起，
 * `SKILL_GRID_ROW2_Y`），放不下「条在上 + 数在下」的两层，所以把条压到数值同一行的外侧�? *   名字 1028 / �?1046 + �?1034 / �?1062 + �?1050 / 技 10px 小字 1028（内列）/
 *   疲·士 1076 / 智·武 1090 / 行动�?1094（`project/180_战斗HUD对齐.md` §6 的硬约束）�? */
export const GENERAL_CARD_Y = {
  name: 1028,
  /** 技力（MP）小字：和名字同一行，落在内侧�?*/
  mp: 1028,
  troopText: 1046,
  troopBar: 1034,
  hpText: 1062,
  hpBar: 1050,
  /** 四个裸数字：上排 疲勞|士氣、下�?智力|武力（行�?14，字号收�?13 才不叠字�?*/
  statA: 1076,
  statB: 1090,
  actionBar: 1094,
} as const;

/** 主将卡里 �?/ �?横条的高度（控制台里�?3px 行动条之外唯一的第二种条） */
export const GENERAL_CARD_BAR_H = 8;
/**
 * �?/ �?数值文本的预留宽度：`�?100/100` �?16px �?�?9px�?3px �?�?3px�? * 条从预留宽度的外侧起画，一路画到卡的另一边（右块镜像 �?条在文本左边）�? */
export const GENERAL_CARD_VITAL_W = 88;
export const GENERAL_CARD_VITAL_W_B = 72;
export const SKILL_SLOT_W = 88;
export const SKILL_SLOT_H = 88;
export const SKILL_SLOT_GAP = 10;
export const SKILL_SLOT_Y = 1124;
export const SKILL_SLOT_X0 = 116;

export function skillSlotRect(index: number): Rect {
  return {
    x: SKILL_SLOT_X0 + index * (SKILL_SLOT_W + SKILL_SLOT_GAP),
    y: SKILL_SLOT_Y,
    w: SKILL_SLOT_W,
    h: SKILL_SLOT_H,
  };
}

export const BTN_ASSAULT: Rect = { x: 528, y: 1124, w: 204, h: 84 };
export const BTN_RETREAT: Rect = { x: 528, y: 1220, w: 204, h: 84 };
export const MESSAGE_BOX: Rect = { x: 116, y: 1224, w: 392, h: 84 };

/** 小地图竖条：71 行压�?300 px（依据：project/02 §2.8�?*/
export const MINIMAP: Rect = { x: 706, y: 350, w: 24, h: 300 };

/** 开�?/ 结算遮罩 */
export const READY_PANEL: Rect = { x: 60, y: 150, w: 630, h: 620 };
export const START_BUTTON: Rect = { x: 225, y: 640, w: 300, h: 88 };
export const SETTLE_PANEL: Rect = { x: 55, y: 120, w: 640, h: 800 };
export const AGAIN_BUTTON: Rect = { x: 250, y: 838, w: 250, h: 72 };

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 };
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 世界（格）→ 屏幕�?*转发 `projection.projectUnit`**（透视：远排小、近排大），
 * 绘制与命中都只认这一条公式�? * @param worldX 推进轴（0..70），我方在高�? * @param worldY 车道�?..13�? * @param camX   镜头中心（格�? */
export function project(worldX: number, worldY: number, camX: number): Vec2 {
  const p = projectUnit(worldX, worldY, camX);
  return { x: p.sx, y: p.sy };
}

/**
 * 屏幕 �?格。战场带外返�?null（依据：project/02 §2.6）�? *
 * R193：改�?`projection.screenToUnit`（`projectUnit` 的精确反解）—�? * 透视后同一屏幕行在不同深度对应的世界行不同，只有反解才能让点击落回正确的格子�? */
export function screenToCell(
  sx: number,
  sy: number,
  camX: number,
): { gx: number; gy: number; worldX: number; worldY: number } | null {
  const hit = screenToUnit(sx, sy, camX);
  if (!hit) return null;
  return { gx: hit.gx, gy: hit.gy, worldX: hit.worldX, worldY: hit.worldY };
}

/** 格中心在屏幕上的落点（注�?core 的车道坐标自带半格偏移） */
export function cellCenter(gx: number, gy: number, camX: number): Vec2 {
  const p = projectUnit(gx, gy, camX);
  return { x: p.sx, y: p.sy };
}

/** 以格为单位的矩形 �?屏幕矩形（宽高随该行的透视缩放：远排更窄更扁） */
export function cellRect(gx: number, gy: number, camX: number): Rect {
  const c = projectCell(gx, gy, camX);
  return { x: c.sx - c.w / 2, y: c.sy - c.h / 2, w: c.w, h: c.h };
}

/** 当前镜头下可见的世界 X 范围（含 1 格余量）—�?透视两端不对称，别再�?450/ROW_PX �?*/
export function visibleWorldX(camX: number, pad = 1): { min: number; max: number } {
  const info = projectionInfo(camX);
  return { min: Math.floor(info.farRow - pad), max: Math.ceil(info.nearRow + pad) };
}

/** 镜头夹取：与 `core.camera()` **同一个函�?*（field.clampCameraX），別再自己 max/min */
export function clampCam(camX: number): number {
  return clampCameraX(camX);
}

/** 设计坐标 �?Cocos 本地坐标（节点锚�?0.5,0.5，原点在屏幕中心�?*/
export function toLocal(sx: number, sy: number): Vec2 {
  return { x: sx - DESIGN_W / 2, y: DESIGN_H / 2 - sy };
}

/**
 * 透视投影的公开入口（R193）�? *
 * 需�?`scale`（贴图缩�?/ 命中半径折算）的调用方直接用这些�?*不要**再自�? * �?`ROW_PX` / `LANE_PX` 线性换算——那就是 R193 之前的常数投影，是这次要消灭的�? */
export {
  lanePitch,
  laneScreenX,
  projectCell,
  projectUnit,
  projectionInfo,
  rowEdgeX,
  rowPitch,
  rowScale,
  rowScreenY,
  screenToUnit,
};
export type { CellProjection, FieldProjection, UnitHit, UnitProjection } from './projection.ts';
