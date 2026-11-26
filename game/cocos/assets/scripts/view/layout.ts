/**
 * 750×1334 竖屏布局与坐标换算。
 *
 * 三带划分（依据：project/02 §2.5）：
 *   HUD 100px（y 0..100） / 战场 900px（y 100..1000） / 控制台 334px（y 1000..1334）
 *
 * 投影口径（R215 起）：**全图战场**。整幅 71 行 × 14 车道一次画进 750×900，
 * 不再有跟随镜头 —— 相当于把旧版的镜头拉到最远。core 的逻辑坐标一个不改：
 *
 *   sy = MAP_TOP + (worldX + 0.5) * MAP_ROW_PX   // 行距 ≈ 11.94px
 *   sx = (worldY + 0.5) * LANE_PX                // 车道 53.57px，14 条铺满 750
 *
 * 方向沿用 core：A 方（我方）落在 worldX 高位 → 屏幕下方；B 方在上。
 * `camX` 参数保留只为兼容旧调用点（BattleInput / 指令台），**已不参与投影**。
 *
 * 本文件不引用 `cc`，也不引用 DOM。
 */
import { GRID_H, GRID_W, LANE_PX, ROW_PX, SCALE } from '../core/battle';

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

/** 战场带中心线（全图投影不再以它为原点，保留给旧的布局断言/控件定位） */
export const FIELD_CENTER_Y = FIELD_TOP + FIELD_H / 2;

/** 安全区参考值（依据：PROJECT_BRIEF §5，真机由 wx.getWindowInfo 提供） */
export const SAFE_INSET = { top: 88, bottom: 88, left: 0, right: 0 };

/**
 * 全图战场的上下留白：主将头像牌半径 38px + 名字，必须完整落在带内。
 * 71 行铺进 `FIELD_H - 2 * MAP_PAD` 后，每行 11.94px。
 */
export const MAP_PAD = 26;
export const MAP_TOP = FIELD_TOP + MAP_PAD;
export const MAP_BOTTOM = FIELD_BOTTOM - MAP_PAD;
export const MAP_H = MAP_BOTTOM - MAP_TOP;

/** 一格纵深（worldX +1）在屏幕上的高度：848 / 71 ≈ 11.944px */
export const MAP_ROW_PX = MAP_H / GRID_W;

/** 全图下 71 行 × 14 车道全部可见（旧「一屏 12.6 行」已不适用） */
export const VISIBLE_ROWS = GRID_W;
export const VISIBLE_LANES = GRID_H;

/** 镜头半窗（行）：R215 起不再用镜头；保留导出只为旧脚本不炸。 */
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

/** 小地图竖条：全图后不再需要（保留常量给旧布局断言） */
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
 * 世界（格）→ 屏幕。全图投影：不依赖镜头，71 行全部落在战场带内。
 * @param worldX 推进轴（0..70），我方在高端（屏幕下方）
 * @param worldY 车道（0..13）
 * @param _camX  兼容参数，已不参与投影
 */
export function project(worldX: number, worldY: number, _camX = 0): Vec2 {
  return {
    x: (worldY + 0.5) * LANE_PX,
    y: MAP_TOP + (worldX + 0.5) * MAP_ROW_PX,
  };
}

/** 屏幕 → 世界（不做战场带门禁）：`project` 的解析反函数。 */
export function worldAt(sx: number, sy: number): { worldX: number; worldY: number } {
  return {
    worldX: (sy - MAP_TOP) / MAP_ROW_PX - 0.5,
    worldY: sx / LANE_PX - 0.5,
  };
}

/** 屏幕 → 格。战场带外返回 null（依据：project/02 §2.6） */
export function screenToCell(
  sx: number,
  sy: number,
  _camX = 0,
): { gx: number; gy: number; worldX: number; worldY: number } | null {
  if (!contains(FIELD, sx, sy)) return null;
  const w = worldAt(sx, sy);
  return {
    gx: clamp(Math.round(w.worldX), 0, GRID_W - 1),
    gy: clamp(Math.floor(w.worldY), 0, GRID_H - 1),
    worldX: w.worldX,
    worldY: w.worldY,
  };
}

/** 格中心在屏幕上的落点（注意 core 的车道坐标自带半格偏移） */
export function cellCenter(gx: number, gy: number, camX = 0): Vec2 {
  return project(gx, gy, camX);
}

/** 以格为单位的矩形 → 屏幕矩形 */
export function cellRect(gx: number, gy: number, camX = 0): Rect {
  const p = cellCenter(gx, gy, camX);
  return { x: p.x - LANE_PX / 2, y: p.y - MAP_ROW_PX / 2, w: LANE_PX, h: MAP_ROW_PX };
}

/** 全图模式下整幅战场都可见 */
export function visibleWorldX(_camX = 0, _pad = 1): { min: number; max: number } {
  return { min: 0, max: GRID_W - 1 };
}

/** 镜头夹取（兼容旧调用；全图下已无意义） */
export function clampCam(camX: number): number {
  return clamp(camX, CAM_MIN, CAM_MAX);
}

/** 设计坐标 → Cocos 本地坐标（节点锚点 0.5,0.5，原点在屏幕中心） */
export function toLocal(sx: number, sy: number): Vec2 {
  return { x: sx - DESIGN_W / 2, y: DESIGN_H / 2 - sy };
}
