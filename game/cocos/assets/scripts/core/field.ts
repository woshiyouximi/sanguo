/**
 * R198 · 战场几何：**唯一**一份数字源（格 ↔ 屏幕 / 可见行数 / 相机夹取）
 *
 * 为什么单开这个文件
 * ------------------
 * R193 把落屏改成透视后（`view/projection.ts`），「一屏看到几行」变成了两个数
 * （远 `ROWS_FAR`=7.434 + 近 `ROWS_NEAR`=5.894 = 13.327 行），可 `core/battle.ts:camera()`
 * 的夹取还写着常数投影时代的 `const half = 450 / ROW_PX`（= 6.3，合计 12.6 行）。
 * 两处各写一份 ⇒ 顶边界失配（`project/193_透视投影.md` §7.1 实测）：
 * camX=63.7 时最近一排（gx=70）落在 sy=1034.6，比 `FIELD_BOTTOM`(1000) 低 **34.6px**，
 * 脚被控制台盖住。
 *
 * 修法：把「格尺寸 / 战场带 / 两端标定 / 可见行数 / 相机夹取」全部搬进本文件，
 * `core/battle.ts` 与 `view/projection.ts` 都从这里取。`core` 不能 import `view`，
 * 所以数字源放在 core 这一侧、view 反过来 import core —— 这也正是依赖的本来方向。
 * **别处不许再出现第二份「几行 / 夹到哪」的数字**（`layout.ts` 的 CAM_* 已改为转出）。
 *
 * 相机夹取（R198 唯一的语义变更，取舍见 `project/198_透视边界与相机.md` §3）
 * ------------------------------------------------------------------------
 * 夹取范围不再「上下各 6.3 行」，而是由带沿 + 一段**精灵身位**反解：
 *
 *   CAM_MIN = −rowOfScreenY(FIELD_TOP + CAM_MARGIN_FAR_PX)                ≈ 6.29
 *   CAM_MAX =  GRID_W−1 − rowOfScreenY(FIELD_BOTTOM − CAM_MARGIN_NEAR_PX) ≈ 64.49
 *
 * 为什么不直接把网格端点压在带沿（那样 CAM_MIN=7.434 / CAM_MAX=64.106）：
 * 单位贴图的**底边**在 sy 下方 `26·scale`（`view/animSelect.ts:79` 的 `ACTION_FOOT_Y`；
 * 近排 26×1.183 = 30.8px），所以 sy 正好 1000 时脚还在带外 30px。近端留 32px ⇒
 * gx=70 的 sy=968、贴图底边 998.8 < 1000，整只脚都在控制台上沿之上（验收见
 * `tests/persp_edge.test.ts`）。远端留 62px 让最远一排的头顶不钻 HUD，并正好复刻
 * 旧 ±6.3 的实测端点（row0 sy=161.3，193 §7.1 判它正常）⇒ 远端观感与交付版一致。
 *
 * 本文件不 import 任何模块（core ↔ view 不能循环），也不碰 DOM / `cc`。
 */

// ---------------------------------------------------------------------------
// 格阵尺寸（原 `core/battle.ts:66-88`，R198 搬来；battle.ts 仍转出，外部 API 不变）
// ---------------------------------------------------------------------------

/** 纵深格数：0..70，我方在高端 */
export const GRID_W = 71;
/** 车道数：0..13 */
export const GRID_H = 14;
/** 竖屏缩放：1 格纵深 = 96 原作 px × 0.744 = 71.43 屏 px（见 docs/02） */
export const SCALE = 750 / 1008; // 0.7440
export const ROW_PX = 96 * SCALE; // 71.43 屏 px / 格纵深
/** 一条车道的屏宽：14 条正好 750 */
export const LANE_PX = 750 / GRID_H; // 53.57 屏 px / 车道

// ---------------------------------------------------------------------------
// 视口（战场带）。`layout.ts` / `projection.ts` 都从这里转出，只有这一个来源。
// ---------------------------------------------------------------------------

/** 设计分辨率宽（750×1334，与 layout.ts 同值） */
export const DESIGN_W = 750;
/** 战场带上沿：敌方最远排所在 */
export const FIELD_TOP = 100;
/** 战场带高（900px） */
export const FIELD_H = 900;
/** 战场带下沿：我方本阵所在 */
export const FIELD_BOTTOM = FIELD_TOP + FIELD_H;
/** 战场带中心线（550）：镜头所在行固定落在这里 */
export const FIELD_CENTER_Y = FIELD_TOP + FIELD_H / 2;
/** 中心线到上下沿的像素距离（450） */
const HALF_H = FIELD_H / 2;
/** 14 条车道的正中（6.5）：`sx` 的对称轴 */
export const CENTER_LANE = (GRID_H - 1) / 2;

// ---------------------------------------------------------------------------
// 标定：原作实测的「每格像素」两端（project/190 §3.2，全部 [确认]）
// ---------------------------------------------------------------------------

/** 原作最远排的每格像素（`y=94 → 53±5`，`pitch_B(y)=9170/(283−y)`） */
export const PITCH_FAR_PX = 53;
/** 原作主将排的每格像素（`y=164.5 → 84.5±8.5`） */
export const PITCH_NEAR_PX = 84.5;

/** 远端缩放 = 53 / 71.43 = 0.7420（远排比常数投影小 26%） */
export const SCALE_FAR = PITCH_FAR_PX / ROW_PX;
/** 近端缩放（未自适应前的实测值）= 84.5 / 71.43 = 1.1830 */
const SCALE_NEAR_MEASURED = PITCH_NEAR_PX / ROW_PX;

/** 允许的可见行数区间（用户给的硬约束：8..14 行） */
export const ROWS_MIN = 8;
export const ROWS_MAX = 14;

/**
 * 给定两端缩放，算一屏能看到多少行。
 *
 * 每行在屏幕上占的像素 = `ROW_PX·scale(r)`，沿纵深是指数分布，
 * 所以「行数」= 带高 ÷ 这些格距的**对数平均**：
 *
 *     rows = FIELD_H · ln(sNear/sFar) / (ROW_PX·(sNear − sFar))
 *
 * `sNear → sFar` 时退化成 `FIELD_H/(ROW_PX·sFar)`（等距 53px：能看 16.98 行）。
 * 对 `sNear` 单调**递减**：近端拉得越大，同屏行数越少。
 */
export function rowsForScales(sFar: number, sNear: number): number {
  const d = sNear - sFar;
  if (Math.abs(d) < 1e-9) return FIELD_H / (ROW_PX * sFar);
  return (FIELD_H * Math.log(sNear / sFar)) / (ROW_PX * d);
}

/**
 * 自适应保险丝：把可见行数拉回 `[ROWS_MIN, ROWS_MAX]`。
 *
 * 行数对 `sNear` 单调递减 ⇒ 行数太多（`> MAX`）就放大 `sNear`，太少（`< MIN`）就缩小它。
 * 二分 80 轮足够到 1e-12；无解（例如 `sFar` 本身就把上限顶爆）时返回最近的端点值，
 * 上层仍能画出画面，不会抛错。
 */
export function fitNearScale(
  sFar: number,
  sNear: number,
  min = ROWS_MIN,
  max = ROWS_MAX,
): { scale: number; changed: boolean; rows: number } {
  const rows = rowsForScales(sFar, sNear);
  if (rows <= max && rows >= min) return { scale: sNear, changed: false, rows };
  // 目标行数：多了收到上限，少了放到下限
  const target = rows > max ? max : min;
  // 行数在 (sFar, +∞) 上从 FIELD_H/(ROW_PX·sFar) 单调降到 0 ⇒ 用「够大」的右端：
  let lo = sFar * (1 + 1e-9);
  let hi = Math.max(sNear, sFar + 1) * 2 + 1;
  // 右端还不够低就一路放大，直到行数落进 target 之下（最多 64 次，防死循环）
  for (let i = 0; i < 64 && rowsForScales(sFar, hi) > target; i += 1) hi *= 2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (rowsForScales(sFar, mid) > target) lo = mid;
    else hi = mid;
  }
  const scale = (lo + hi) / 2;
  return { scale, changed: true, rows: rowsForScales(sFar, scale) };
}

const FITTED = fitNearScale(SCALE_FAR, SCALE_NEAR_MEASURED);

/** 近端缩放（实测值；若行数越界则已被自适应收/放） */
export const SCALE_NEAR = FITTED.scale;
/** 自适应是否动过标定值（false = 实测值本来就在 8..14 行内） */
export const SCALE_NEAR_FITTED = FITTED.changed;
/** 镜头行的缩放：两端中点（0.9625，比常数投影的 1.0 小 3.7%） */
export const SCALE_CENTER = (SCALE_FAR + SCALE_NEAR) / 2;
/**
 * 透视强度 k = ROW_PX·(S0 − S_far)/450 = 0.03500…
 * 由「远端正好在中心线上方 450px」解出；`k → 0` 退化成常数投影。
 */
export const ROW_K = (ROW_PX * (SCALE_CENTER - SCALE_FAR)) / HALF_H;
/**
 * 车道横向压缩系数：让**最近一排**的 14 条车道正好铺满 750px（= LANE_PX/1 行的格距），
 * 于是任何一行都不裁边，远端排自然收窄成梯形。
 */
export const LANE_SQUEEZE = Math.min(1, DESIGN_W / (GRID_H * LANE_PX * SCALE_NEAR));

// ---------------------------------------------------------------------------
// 行 ↔ 屏幕 y（严格单调，所以可以精确反解）
// ---------------------------------------------------------------------------

/** 一行的透视缩放：远排 < 1 < 近排 */
export function rowScale(r: number): number {
  return SCALE_CENTER * Math.exp(ROW_K * r);
}

/** 一行的屏幕 y（严格单调递增：远排在 100 附近、近排在 1000 附近） */
export function rowScreenY(r: number): number {
  return FIELD_CENTER_Y + (ROW_PX * SCALE_CENTER * Math.expm1(ROW_K * r)) / ROW_K;
}

/** `rowScreenY` 的精确反函数：屏幕 y → 行偏移 r（`FIELD_TOP`..`FIELD_BOTTOM` 之外也照算） */
export function rowOfScreenY(sy: number): number {
  const q = ((sy - FIELD_CENTER_Y) * ROW_K) / (ROW_PX * SCALE_CENTER);
  // q <= -1 时对数无定义（对应 sy <= 550 − ROW_PX·S0/k ≈ −1413，早就在画面外了）
  if (q <= -1) return Number.NEGATIVE_INFINITY;
  return Math.log1p(q) / ROW_K;
}

/** 可见行数（远端部分 / 近端部分 / 合计）——**唯一**一份 */
export const ROWS_FAR = -rowOfScreenY(FIELD_TOP);
export const ROWS_NEAR = rowOfScreenY(FIELD_BOTTOM);
export const ROWS_VISIBLE = ROWS_FAR + ROWS_NEAR;

// ---------------------------------------------------------------------------
// 相机夹取（R198）：由带沿 + 精灵身位反解，不再写死 450/ROW_PX
// ---------------------------------------------------------------------------

/**
 * 远端身位（px）：最远一排的地面点至少要离带上沿这么远。
 *
 * 依据是**实测的最髙帧**：`units.json` 里贴图比例最大的是 `tiechui_atk_04`（75×106），
 * 远排 scale 0.742 ⇒ 贴图高 78.6、脚底锚点在底边上方 19.3 ⇒ 头顶离地面点 59.3px。
 * 取 62（59.3 + 2.7 余量）后，CAM_MIN 下 row0 的 sy=162、最髙帧头顶 100.25 ⇒ 整张图都在带内。
 * 顺带把旧 ±6.3 的端点复刻回来（新 CAM_MIN=6.29，差 0.7px）⇒ 远端观感与交付版一致。
 */
export const CAM_MARGIN_FAR_PX = 62;
/**
 * 近端身位（px）：最近一排的地面点至少要离带下沿这么远。
 *
 * 32 = ⌈26 × SCALE_NEAR⌉ = ⌈30.76⌉ 再留 1px：贴图**底边**在 sy 下方 26·scale，
 * 留 32 后 gx=70 的底边 = 968 + 30.76 = 998.8 < FIELD_BOTTOM，脚不会落到控制台下面。
 */
export const CAM_MARGIN_NEAR_PX = 32;

/** 夹取允许的最远/最近屏幕 y（都在带内，且各留一段精灵身位） */
export const CAM_FAR_SY = FIELD_TOP + CAM_MARGIN_FAR_PX;
export const CAM_NEAR_SY = FIELD_BOTTOM - CAM_MARGIN_NEAR_PX;

/**
 * 相机夹取的**行**范围：由 `rowOfScreenY` 反解，改 `ROWS_*` / 身位常数会同时变。
 * ≈ [6.29, 64.49]（旧 ±6.3 ⇒ [6.30, 63.70]）。
 */
export const CAM_MIN = -rowOfScreenY(CAM_FAR_SY);
export const CAM_MAX = GRID_W - 1 - rowOfScreenY(CAM_NEAR_SY);

/** 常数投影时代的「半屏行数」= 450/ROW_PX = 6.3：只用于 `camera()` 的换镜距离判据，**不是**夹取范围 */
export const CAM_HALF_ROWS = HALF_H / ROW_PX;

/** 把任意 camX 夹进 `[CAM_MIN, CAM_MAX]`（core.camera / layout.clampCam 共用） */
export function clampCameraX(camX: number): number {
  return Math.max(CAM_MIN, Math.min(CAM_MAX, camX));
}
