/**
 * R193 · 原作式透视投影（战场唯一的一套「格 → 屏幕」公式）
 *
 * 为什么要有这个文件
 * ------------------
 * 原作（`0x43AF54` 断言 `0<=x<71 && 0<=y<14`，`0x43A4E0` 格→像素 `px=x*96+48, py=y*72+36`）
 * 的格阵本身是等距的，但**屏幕上每格占的像素随纵深变化**：
 * `project/190_主将与士兵速度裁决.md` §3.2 从录像逐帧量出同屏队中心的水平间距
 * `pitch_B(y) = 9170/(283−y)`，`y=94 → 53±5`、`y=164.5 → 84.5±8.5`（主将排），
 * 主将/弓兵比 84.5/53 = 1.59。也就是说原作是**近大远小**的透视，
 * 而我们 R193 之前是常数投影（`ROW_PX=71.43`、`LANE_PX=53.57`，见 `core/battle.ts:3070`
 * 的 `project()`），于是士兵偏小、远排和近排一样大、主将「不动」。
 *
 * 本文件只做一件事：把「世界格 (gx, gy) + 镜头 camX」这一组输入，映射成
 * `{ sx, sy, scale }`；**绘制、命中测试、弹道、特效锚点、小地图窗口条全部只认它**
 * （`battleView.ts` 里不再有任何第二套换算）。`core.project()` 仍是逻辑层的线性投影，
 * 只是视图层不再用它来落屏。
 *
 * R198：**数字全部搬去 `core/field.ts`**（格尺寸、战场带、两端标定、可见行数、相机夹取），
 * 本文件只留「行 → 屏幕」的公式并把那批数字转出。原因见 `project/198_透视边界与相机.md`：
 * `core.camera()` 也要用「可见几行」，而 core 不能 import view ⇒ 数字源必须落在 core 侧，
 * view 与 core 两边都从 `field.ts` 取，**禁止再各写一份**（旧代码就是两处各写一份，
 * 于是夹取范围停在 6.3 行、顶边界时最近一排沉到控制台底下）。
 *
 * 模型
 * ----
 * 纵深轴（gx，0..70，我方在高端）走**指数拉伸**：
 *
 *     scale(r) = S0 · e^(k·r)                      r = gx − camX（行，远离镜头为正）
 *     sy(r)    = 550 + ROW_PX·S0·(e^(k·r) − 1)/k   ← 550 = FIELD_TOP + FIELD_H/2
 *
 * - 严格单调（sy' = ROW_PX·S0·e^(k·r) > 0），所以**屏幕 y 是行号的单调函数**，
 *   命中测试可以精确反解（`screenToUnit`），不会出现「往前一点跳到后一排」。
 * - `sy(0) = 550`：镜头所在行固定在战场带正中（`FIELD_TOP + FIELD_H/2`），
 *   这条是用户明确要求的「中线不动」。
 * - `k → 0` 时 `sy → 550 + ROW_PX·r`，即**退化成 R193 之前的常数投影**：
 *   新公式是旧公式的连续推广，不是另起一套。
 *
 * 标定（只有两个自由度，都来自实测，不许拍脑袋）
 * ----------------------------------------------
 * 远端：战场带上沿（`FIELD_TOP`）= 原作最远排 ⇒ 该行的每格像素 = 53 → `S_far = 53/ROW_PX`。
 * 近端：战场带下沿（`FIELD_BOTTOM`）= 原作主将排 ⇒ 每格像素 = 84.5 → `S_near = 84.5/ROW_PX`。
 * 中间：`S0 = (S_far + S_near)/2`（让镜头行的 scale 落在两端的中点，等价于
 * 「远半屏抬 1/2、近半屏压 1/2」的对称解），于是
 *
 *     k = ROW_PX·(S0 − S_far)/450        ← 450 = FIELD_H/2，由「远端正好落 450px」解出
 *     ROWS_FAR  = −rowOfScreenY(FIELD_TOP)     ≈ 7.43 行
 *     ROWS_NEAR =  rowOfScreenY(FIELD_BOTTOM)  ≈ 5.90 行
 *
 * `ROWS_FAR ≠ ROWS_NEAR`（7.43 vs 5.90）不是 bug：透视把远半屏塞进更多行、近半屏摊开更少行，
 * 而总像素仍是 450+450。总可见行数 13.33（R193 之前是 12.6），仍在 [8, 14] 内。
 *
 * 横轴（gy，0..13 车道）**没有透视**（无灭点，`sx` 对 gy 线性），
 * 但**列宽随该行的 scale 等比缩放**：`lanePitch(r) = LANE_PX·scale(r)·LANE_SQUEEZE`，
 * 其中 `LANE_SQUEEZE` 让**最近那一排的 14 条车道正好铺满 750px**，
 * 于是「71 列 × 14 行车道的格子」在整条带内完整可见、不裁边（远端排自然变窄成梯形）。
 *
 * 自适应（用户要求的「救回可见性」）
 * --------------------------------
 * `fitNearScale()` 是一根保险丝：标定完先算总可见行数，若跑出 [8, 14]
 * 就二分收紧/放宽近端 scale，把行数拉回区间内。本次实测 13.33 行已达标，
 * 函数原值返回（`SCALE_NEAR_FITTED = false`），但换个标定参数时它会自动兜住。
 *
 * 本文件不引用 `cc` / DOM / `layout.ts`；数字只从 `core/field.ts` 来
 * （field 不 import 任何模块 ⇒ 没有 core ↔ view 的循环）。
 */

import {
  CENTER_LANE,
  DESIGN_W,
  FIELD_BOTTOM,
  FIELD_TOP,
  GRID_H,
  GRID_W,
  LANE_PX,
  LANE_SQUEEZE,
  ROW_K,
  ROW_PX,
  ROWS_FAR,
  ROWS_NEAR,
  ROWS_VISIBLE,
  rowOfScreenY,
  rowScale,
  rowScreenY,
  SCALE_CENTER,
} from '../core/field.ts';

/**
 * R198：下面这批数字的**定义**在 `core/field.ts`（唯一来源），本文件只转出，
 * 让 `view/**` 与既有测试的 import 路径不用改。`core/battle.ts` 转出同一批
 * （GRID_* / ROW_PX / LANE_PX / SCALE / CAM_*），公共 API 一个都没动。
 */
export {
  CAM_FAR_SY,
  CAM_HALF_ROWS,
  CAM_MARGIN_FAR_PX,
  CAM_MARGIN_NEAR_PX,
  CAM_MAX,
  CAM_MIN,
  CENTER_LANE,
  clampCameraX,
  DESIGN_W,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_H,
  FIELD_TOP,
  fitNearScale,
  GRID_H,
  GRID_W,
  LANE_PX,
  LANE_SQUEEZE,
  PITCH_FAR_PX,
  PITCH_NEAR_PX,
  ROW_K,
  ROW_PX,
  ROWS_FAR,
  ROWS_MAX,
  ROWS_MIN,
  ROWS_NEAR,
  ROWS_VISIBLE,
  rowOfScreenY,
  rowScale,
  rowScreenY,
  rowsForScales,
  SCALE,
  SCALE_CENTER,
  SCALE_FAR,
  SCALE_NEAR,
  SCALE_NEAR_FITTED,
} from '../core/field.ts';

// ---------------------------------------------------------------------------
// 横轴（车道）+ 单行像素（公式留在本文件，数字来自 field.ts）
// ---------------------------------------------------------------------------

/** 该行的纵格距（像素）：远排 53、镜头行 68.75、近排 84.5 */
export function rowPitch(r: number): number {
  return ROW_PX * rowScale(r);
}

/** 该行的横向车道距（像素）：随 scale 等比缩放，近排正好 53.57 */
export function lanePitch(r: number): number {
  return LANE_PX * rowScale(r) * LANE_SQUEEZE;
}

/** 某条车道中心在该行的屏幕 x（gy 中心 = 6.5 时恒为 375） */
export function laneScreenX(gy: number, r: number): number {
  return DESIGN_W / 2 + (gy - CENTER_LANE) * lanePitch(r);
}

/** 该行战场的左/右边界（含半格：车道 0 / 13 的**外沿**）：`dir=-1` 左、`+1` 右 */
export function rowEdgeX(r: number, dir: -1 | 1): number {
  return DESIGN_W / 2 + dir * (CENTER_LANE + 0.5) * lanePitch(r);
}

/** 投影结果：屏幕点 + 该行的缩放（锚点由调用方决定，见 battleView） */
export interface UnitProjection {
  /** 屏幕 x */
  sx: number;
  /** 屏幕 y（格的地面线；单位贴图以它为**底边**再按 scale 下移 26·scale） */
  sy: number;
  /** 该行的透视缩放（远排 ~0.74、近排 ~1.18） */
  scale: number;
}

/**
 * **唯一**的「格 → 屏幕」函数。
 * @param gx   推进轴（0..70，我方在高端）
 * @param gy   车道（0..13）
 * @param camX 镜头中心行（可以是小数；`core.camera()` 给的）
 */
export function projectUnit(gx: number, gy: number, camX: number): UnitProjection {
  const r = gx - camX;
  return { sx: laneScreenX(gy, r), sy: rowScreenY(r), scale: rowScale(r) };
}

/** 反投影结果（命中测试用） */
export interface UnitHit {
  gx: number;
  gy: number;
  /** 未取整的世界行（格）：`camX + r` */
  worldX: number;
  /** 未取整的车道（格） */
  worldY: number;
  /** 命中点所在行的缩放 */
  scale: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 屏幕 → 格（`projectUnit` 的精确反解，绘制与命中同源的保证）。
 *
 * 战场带以外返回 null（与 R193 之前 `layout.screenToCell` 的语义一致）。
 * 车道取整用 `floor`（点落在车道内就算该车道），`+1e-6` 是为了让
 * 「正好点在车道中心」经浮点往返后仍落回原车道，不会掉到上一条。
 */
export function screenToUnit(sx: number, sy: number, camX: number): UnitHit | null {
  if (!(sx >= 0 && sx <= DESIGN_W)) return null;
  if (!(sy >= FIELD_TOP && sy <= FIELD_BOTTOM)) return null;
  const r = rowOfScreenY(sy);
  if (!Number.isFinite(r)) return null;
  const worldY = (sx - DESIGN_W / 2) / lanePitch(r) + CENTER_LANE;
  return {
    gx: Math.round(clamp(camX + r, 0, GRID_W - 1)),
    gy: clamp(Math.floor(worldY + 1e-6), 0, GRID_H - 1),
    worldX: camX + r,
    worldY,
    scale: rowScale(r),
  };
}

/** 一格在屏幕上的外接矩形（宽 = 该行车距，高 = 该行格距） */
export interface CellProjection extends UnitProjection {
  w: number;
  h: number;
}

/** 一格的屏幕矩形（左上角 + 宽高），供框选/特效用 */
export function projectCell(gx: number, gy: number, camX: number): CellProjection {
  const p = projectUnit(gx, gy, camX);
  const r = gx - camX;
  return { ...p, w: lanePitch(r), h: rowPitch(r) };
}

/** 一屏的透视参数快照（测试断言 + 小地图窗口条用） */
export interface FieldProjection {
  camX: number;
  /** 带内最远的世界行（= camX − farRows） */
  farRow: number;
  /** 带内最近的世界行（= camX + nearRows） */
  nearRow: number;
  /** 远端可见行数（7.43） */
  farRows: number;
  /** 近端可见行数（5.90） */
  nearRows: number;
  /** 可见行数合计（13.33） */
  rows: number;
  /** 完整落在带内的整数行数 */
  rowsInt: number;
  /** 远端 / 近端 / 镜头行的缩放 */
  farScale: number;
  nearScale: number;
  centerScale: number;
  /** 透视强度 */
  k: number;
  /** 车道压缩系数 */
  laneSqueeze: number;
  /** 最近一排的横向跨度（恰好 750） */
  widestSpan: number;
}

/** 取当前镜头的透视快照 */
export function projectionInfo(camX: number): FieldProjection {
  const farRow = camX - ROWS_FAR;
  const nearRow = camX + ROWS_NEAR;
  const rowsInt = Math.floor(nearRow + 1e-9) - Math.ceil(farRow - 1e-9) + 1;
  return {
    camX,
    farRow,
    nearRow,
    farRows: ROWS_FAR,
    nearRows: ROWS_NEAR,
    rows: ROWS_VISIBLE,
    rowsInt: Math.max(0, rowsInt),
    farScale: rowScale(-ROWS_FAR),
    nearScale: rowScale(ROWS_NEAR),
    centerScale: SCALE_CENTER,
    k: ROW_K,
    laneSqueeze: LANE_SQUEEZE,
    // 最近一排的战场宽度 = 两条外沿之距 = 14 条车道 × 该行车距（= 750，恰好铺满）
    widestSpan: rowEdgeX(ROWS_NEAR, 1) - rowEdgeX(ROWS_NEAR, -1),
  };
}
