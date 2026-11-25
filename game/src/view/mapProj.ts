/**
 * 原作大地图投影（纯函数，无 DOM、无 fetch、可直接在 node 下 import）。
 *
 * 坐标系：`CHINAMAP.png` 是 1280×960 的整图；`game/data/scenarios.json` 里 60 城的
 * `pos_xy` 就是这张图的像素坐标（与烘进图里的橙色官道同一坐标系，实测 60/60 城
 * 打点到最近道路像素的中位距离 0.00px、最大 2.41px，见 project/58）。
 *
 * 因此本模块只做一件事：把"1280×960 的地图空间"等比摆进一个显示矩形（design px），
 * 以及反向反查。**任何情况下都不拉伸**——显示矩形的宽高比恒等于 1280:960。
 *
 * 约定：
 * - `MapBox` 是显示区，单位 design px，`left/top` 是它在可用区域里的偏移（可以是负数，
 *   `fitBox(..., 'cover')` 裁边时就会出现负偏移）。
 * - `mapToScreen` 收 `[x, y]`、`screenToMap` 返回 `[x, y]`，两者可互相嵌套跑往返；
 *   这是刻意的对称（便于 `mapToScreen(box, screenToMap(box, sx, sy))` 直接成立）。
 */

/** 原图宽（像素），与 `CHINAMAP.png` 实测一致 */
export const MAP_W = 1280;
/** 原图高（像素） */
export const MAP_H = 960;

/** 地图显示区（design px）。等比，宽高比恒为 {@link MAP_W}:{@link MAP_H} */
export type MapBox = { left: number; top: number; width: number; height: number };

/** 能被投影/命中的最小城池形状：只有 `pos_xy` 是必需的 */
export type CityPoint = { pos_xy: [number, number] };

/** 零尺寸 box（可用区非法时的返回值，避免下游出现 NaN 传染） */
const EMPTY_BOX: MapBox = { left: 0, top: 0, width: 0, height: 0 };

/**
 * 把 1280×960 等比摆进 `availW × availH`。
 * - `contain`：整图可见，短边留边，居中；
 * - `cover`：铺满可用区，长边被裁，居中（`left/top` 为负）。
 * 可用区非有限数或 ≤0 时返回 `{0,0,0,0}`。
 */
export function fitBox(availW: number, availH: number, mode: 'contain' | 'cover'): MapBox {
  if (!Number.isFinite(availW) || !Number.isFinite(availH) || availW <= 0 || availH <= 0) {
    return { ...EMPTY_BOX };
  }
  const s = mode === 'cover'
    ? Math.max(availW / MAP_W, availH / MAP_H)
    : Math.min(availW / MAP_W, availH / MAP_H);
  const width = MAP_W * s;
  const height = MAP_H * s;
  return { left: (availW - width) / 2, top: (availH - height) / 2, width, height };
}

/** 显示区相对原图的缩放比（= 一像素原图占几个 design px）。{@link fitBox} 的 box 恒等宽高比，取宽即可 */
export function mapScale(box: MapBox): number {
  return MAP_W > 0 ? box.width / MAP_W : 0;
}

/** 地图像素坐标 → 屏幕坐标（design px） */
export function mapToScreen(box: MapBox, pos: [number, number]): { x: number; y: number } {
  return {
    x: box.left + (pos[0] * box.width) / MAP_W,
    y: box.top + (pos[1] * box.height) / MAP_H,
  };
}

/**
 * 屏幕坐标（design px）→ 地图像素坐标。
 * box 宽或高为 0（例如地图区还没布局）时返回 `[NaN, NaN]`，让调用方一眼看出是"没得算"
 * 而不是拿到一个假的 [0,0]。`hitCity` 里 NaN 比较恒为 false，天然安全。
 */
export function screenToMap(box: MapBox, x: number, y: number): [number, number] {
  if (!(box.width > 0) || !(box.height > 0)) return [NaN, NaN];
  return [
    ((x - box.left) * MAP_W) / box.width,
    ((y - box.top) * MAP_H) / box.height,
  ];
}

/**
 * 命中检测：屏幕点 `(x, y)` 半径 `r`（design px）内最近的城。
 * 纯屏幕空间比较——`r` 是"手指半径"，与地图缩放无关，所以贴图元变小时命中区不必跟着缩。
 * 没命中返回 `null`；`r <= 0`、空数组、坐标非有限数一律 `null`。
 */
export function hitCity<T extends CityPoint>(
  box: MapBox,
  cities: readonly T[],
  x: number,
  y: number,
  r: number,
): T | null {
  // 退化 box（地图区还没布局）会把所有城折叠到同一点，必须先挡掉，否则一切皆命中
  if (!(box.width > 0) || !(box.height > 0)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(r > 0) || cities.length === 0) return null;
  const r2 = r * r;
  let best: T | null = null;
  let bestD2 = Infinity;
  for (const c of cities) {
    const p = c.pos_xy;
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const s = mapToScreen(box, p);
    const dx = s.x - x;
    const dy = s.y - y;
    const d2 = dx * dx + dy * dy;
    // 严格小于：等距时保留先出现的那个，保证结果可复现
    if (d2 <= r2 && d2 < bestD2) {
      best = c;
      bestD2 = d2;
    }
  }
  return best;
}
