/**
 * 750×1334 竖屏布局与坐标换算。
 *
 * 三带划分（依据：project/02 §2.5）：
 *   HUD 100px（y 0..100） / 战场 900px（y 100..1000） / 控制台 334px（y 1000..1334）
 *
 * 重要：坐标轴以 `game/src/core/battle.ts` 的实现为准，而不是 02 文档里的
 * 文字公式。core 里 A 方（我方）落在 worldX 高位，`project()` 是
 * `sy = 550 + (worldX - camX) * ROW_PX`，所以 **worldX 越大 → 屏幕越靠下**，
 * 我方在下、敌方在上。视图层只做"包一层"，绝不反向。
 *
 * 本文件不引用 `cc`，也不引用 DOM。
 */
import {
  GRID_H,
  GRID_W,
  LANE_PX,
  ROW_PX,
  SCALE,
  project as coreProject,
} from '../core/battle';

/** 设计分辨率（依据：PROJECT_BRIEF §5） */
export const DESIGN_W = 750;
export const DESIGN_H = 1334;

/** 三段带（依据：project/02 §2.5） */
export const HUD_H = 100;
export const FIELD_TOP = 100;
export const FIELD_H = 900;
export const FIELD_BOTTOM = FIELD_TOP + FIELD_H;
export const CONSOLE_TOP = 1000;
export const CONSOLE_H = 334;

/** 战场带中心线：core 的投影以它为原点（100 + 900/2） */
export const FIELD_CENTER_Y = FIELD_TOP + FIELD_H / 2;

/** 安全区参考值（依据：PROJECT_BRIEF §5，真机由 wx.getWindowInfo 提供） */
export const SAFE_INSET = { top: 88, bottom: 88, left: 0, right: 0 };

/** 一屏可见纵深（行）= 900 / 71.43 = 12.6（依据：project/02 §2.3） */
export const VISIBLE_ROWS = FIELD_H / ROW_PX;

/** 一屏可见车道 = 750 / 53.57 = 14（恰好全见） */
export const VISIBLE_LANES = DESIGN_W / LANE_PX;

/** 镜头半窗（行）：core.camera 用 450/ROW_PX 夹取 */
export const CAM_HALF_ROWS = FIELD_H / 2 / ROW_PX;
export const CAM_MIN = CAM_HALF_ROWS;
export const CAM_MAX = GRID_W - 1 - CAM_HALF_ROWS;

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

/** 战况条内的双方兵力条（A 左 B 右） */
export const HUD_BAR_A: Rect = { x: 16, y: 56, w: 280, h: 11 };
export const HUD_BAR_B: Rect = { x: 454, y: 56, w: 280, h: 11 };

/** 主将体力 / 气力条 */
export const HUD_HP_A: Rect = { x: 16, y: 76, w: 180, h: 6 };
export const HUD_HP_B: Rect = { x: 554, y: 76, w: 180, h: 6 };
export const HUD_QI_A: Rect = { x: 16, y: 86, w: 180, h: 3 };
export const HUD_QI_B: Rect = { x: 554, y: 86, w: 180, h: 3 };

/** 控制台：主将头像 + 信息 + 4 技能格 + 突击/撤退 + 提示框 */
export const PORTRAIT: Rect = { x: 18, y: 1012, w: 86, h: 108 };
export const GENERAL_INFO: Rect = { x: 116, y: 1012, w: 250, h: 100 };
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

/** 小地图竖条：71 行压成 300 px（依据：project/02 §2.8） */
export const MINIMAP: Rect = { x: 706, y: 350, w: 24, h: 300 };

/** 开始 / 结算遮罩 */
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
 * 世界（格）→ 屏幕。直接包 core 的 project，保证视图与逻辑同源。
 * @param worldX 推进轴（0..70），我方在高端
 * @param worldY 车道（0..13）
 * @param camX   镜头中心（格）
 */
export function project(worldX: number, worldY: number, camX: number): Vec2 {
  const p = coreProject(camX, worldX, worldY);
  return { x: p.sx, y: p.sy };
}

/** 屏幕 → 格。战场带外返回 null（依据：project/02 §2.6） */
export function screenToCell(
  sx: number,
  sy: number,
  camX: number,
): { gx: number; gy: number; worldX: number; worldY: number } | null {
  if (!contains(FIELD, sx, sy)) return null;
  const worldY = (sx - LANE_PX / 2) / LANE_PX;
  const worldX = camX + (sy - FIELD_CENTER_Y) / ROW_PX;
  return {
    gx: clamp(Math.round(worldX), 0, GRID_W - 1),
    gy: clamp(Math.floor(worldY), 0, GRID_H - 1),
    worldX,
    worldY,
  };
}

/** 格中心在屏幕上的落点（注意 core 的车道坐标自带半格偏移） */
export function cellCenter(gx: number, gy: number, camX: number): Vec2 {
  return project(gx, gy, camX);
}

/** 以格为单位的矩形 → 屏幕矩形 */
export function cellRect(gx: number, gy: number, camX: number): Rect {
  const p = cellCenter(gx, gy, camX);
  return { x: p.x - LANE_PX / 2, y: p.y - ROW_PX / 2, w: LANE_PX, h: ROW_PX };
}

/** 当前镜头下可见的世界 X 范围（含 1 格余量） */
export function visibleWorldX(camX: number, pad = 1): { min: number; max: number } {
  const half = FIELD_H / 2 / ROW_PX;
  return { min: Math.floor(camX - half - pad), max: Math.ceil(camX + half + pad) };
}

/** 镜头夹取：与 core.camera 的边界一致 */
export function clampCam(camX: number): number {
  return clamp(camX, CAM_MIN, CAM_MAX);
}

/** 设计坐标 → Cocos 本地坐标（节点锚点 0.5,0.5，原点在屏幕中心） */
export function toLocal(sx: number, sy: number): Vec2 {
  return { x: sx - DESIGN_W / 2, y: DESIGN_H / 2 - sy };
}
