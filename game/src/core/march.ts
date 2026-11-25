/**
 * march.ts — 大地图行军（纯逻辑，不碰 DOM / localStorage）
 *
 * 原作里部队沿道路一城一城走，走到城下才开战，路上两支相向的部队会撞上。
 * 这里只负责“路、进度、坐标、相遇”四件事；谁出兵、打不打、怎么结算都在页面层。
 *
 * 速度：`MARCH_PER_MONTH = 1/3`，即标准速度下 **一个月走完整条路的三分之一**，
 * 3 个月到城下。页面会按道路 Length 把一条路分成 1/2/3 个月（近的 1 个月、
 * 远的 3 个月），用 `advance(armies, speed)` 的 `speed` 倍率表达：
 *   speed = 3 → 一个月到；speed = 1.5 → 两个月；speed = 1 → 三个月。
 * 所以核心的“一个月 1/3”不变，只是短路由页面加速。
 *
 * 约定：`Army.pathIndex` 指向 `scenario.paths` 里**一条可走的路**，`from`/`to`
 * 就是这条路的两端。一次只走一条路；多段路程＝到达后再出征，不在本模块里拼路径。
 */

/** 标准行军速度：一个月走完整条路的 1/3（3 个月到城下） */
export const MARCH_PER_MONTH = 1 / 3;

/** Length >= 30000 的路是“画了线但不可走”的哨兵，任何寻路/行军都要跳过 */
export const SENTINEL_LENGTH = 30000;

export type Army = {
  id: string;
  side: 'A' | 'B';
  from: string;
  to: string;
  /** scenario.paths 的下标（一条可走的路） */
  pathIndex: number;
  /** 0..1，沿折线从 from 走到 to 的进度 */
  progress: number;
  troops: number;
  general?: string;
};

export type MarchCity = {
  NAME: string;
  /** 地图像素坐标 [x, y]，与 paths[].points 同一坐标系 */
  pos_xy?: number[];
};

export type MarchPath = {
  Start: string;
  End: string;
  Length?: number;
  points?: number[][];
};

export type ScenarioLike = {
  cities: MarchCity[];
  paths: MarchPath[];
};

type Pt = [number, number];

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function cityPos(scenario: ScenarioLike, name: string): Pt | null {
  const c = scenario.cities.find((x) => x.NAME === name);
  if (!c || !Array.isArray(c.pos_xy) || c.pos_xy.length < 2) return null;
  const x = Number(c.pos_xy[0]);
  const y = Number(c.pos_xy[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/**
 * 找 a ↔ b 之间一条**可走**的路，返回 `scenario.paths` 下标；没有就 null。
 *
 * 跳过 Length >= SENTINEL_LENGTH 的哨兵（原作里 39 条“画了线但不通”的路）。
 * 只找相邻的一跳（等价于邻接表上的 BFS 深度 1）：Army 只存一个 pathIndex，
 * 多段路程要分多次出征；目标不是 a 的直接邻居时返回 null。
 */
export function pathBetween(scenario: ScenarioLike, a: string, b: string): number | null {
  if (!a || !b || a === b) return null;
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  // 出征目标只列相邻城，Army 只存一条路，所以这里只认“从 a 走一步就到 b”
  // （BFS 的深度 1）。多跳路线要分多次出征，不能用一个 pathIndex 表示。
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (!p || (Number(p.Length) || 0) >= SENTINEL_LENGTH) continue;
    if ((p.Start === a && p.End === b) || (p.Start === b && p.End === a)) return i;
  }
  return null;
}

/**
 * 推进一个月（原地改 `progress`）。`speed` 是倍率：
 * 1 = 标准（1/3 路程/月，3 个月到），3 = 急行（1 个月到）。
 * 已经到达（progress >= 1）的部队不再前进，原样归入 `arrived`。
 */
export function advance(armies: Army[], speed = 1): { arrived: Army[]; still: Army[] } {
  const mult = Number.isFinite(speed) && speed > 0 ? speed : 0;
  const step = MARCH_PER_MONTH * mult;
  const arrived: Army[] = [];
  const still: Army[] = [];
  for (const a of arrayOf(armies)) {
    if (!a || typeof a !== 'object') continue;
    const p = Number.isFinite(Number(a.progress)) ? clamp01(Number(a.progress)) : 0;
    if (p < 1) a.progress = clamp01(p + step);
    (a.progress >= 1 ? arrived : still).push(a);
  }
  return { arrived, still };
}

function arrayOf<T>(v: T[]): T[] {
  return Array.isArray(v) ? v : [];
}

/**
 * 两支**不同阵营**的部队在同一条路上相向而行、进度已经交错（和 >= 1）→ 相遇。
 * 同向、不同路、同一阵营、已经到城下（progress 到 1）都不算——到城下由页面按
 * “攻城/守城”处理，不再算路上遭遇。
 */
export function intercept(a: Army, b: Army): boolean {
  if (!a || !b || a.id === b.id) return false;
  if (a.side === b.side) return false;
  if (a.pathIndex !== b.pathIndex) return false;
  if (a.from !== b.to || a.to !== b.from) return false;
  const pa = clamp01(Number(a.progress));
  const pb = clamp01(Number(b.progress));
  if (pa <= 0 || pb <= 0 || pa >= 1 || pb >= 1) return false;
  return pa + pb >= 1;
}

/**
 * 部队在折线上的像素坐标：按 `progress` 沿 `points` 做等距插值。
 * 方向由 `army.from` 决定（from 是 path.End 时反向），所以从 B 城回 A 城
 * 也能画在正确的一侧。
 */
export function posOf(scenario: ScenarioLike, army: Army): [number, number] {
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  const path = paths[army?.pathIndex];
  if (!path) return [0, 0];

  const pts: Pt[] = [];
  for (const raw of Array.isArray(path.points) ? path.points : []) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  if (pts.length < 2) {
    const a = cityPos(scenario, path.Start);
    const b = cityPos(scenario, path.End);
    if (a) pts.push(a);
    if (b) pts.push(b);
  }
  if (!pts.length) return [0, 0];
  if (pts.length === 1) return pts[0];

  const t = clamp01(Number(army.progress));
  // from === End 表示从终点往起点走，位置取 1-t
  const along = army.from === path.End && army.from !== path.Start ? 1 - t : t;

  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return pts[0];

  let want = along * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? Math.min(1, want / segs[i]) : 0;
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k,
      ];
    }
    want -= segs[i];
  }
  return pts[pts.length - 1];
}
