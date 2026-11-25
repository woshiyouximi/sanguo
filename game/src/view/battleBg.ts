/// <reference lib="dom" />
/**
 * 原作战场背景（A2）：把 `export/png` 里抽出来的 12 套地形素材贴进 750×1334 的竖版战场。
 *
 * 素材真相（像素比对，见 project/47_原作战场背景.md §2）：
 *   - `tga/SHAPE_BG_FLOORnn.png` 512×512 地面，横向首末列差≈相邻列差 → 可无缝平铺；
 *   - `SHAPE/BG/{BG,MG,FG}nn{A,B}.png` 是 96px 高的**地平线景物条**，不是循环贴图
 *     （首末列差是相邻列差的 1.8–276 倍，硬平铺必有竖缝），单幅宽度 730/880/1000
 *     比 640 的横屏视口宽 90/240/360 → 原作是"整幅横移"的视差平面；
 *   - A/B 是同一地形的两种天光（A 白日、B 黄昏/夜），不是近景/远景两帧。
 *
 * 本模块的用法：
 *   - 地面：烘焙成 256×256 的贴图（512×0.5，一张 tile ≈ 3.6 行 ≈ 257px），用
 *     `CanvasPattern` 一次 `fillRect` 铺满场地，相位跟着镜头纵向滚动（俯视平面，
 *     镜头沿 worldX 前进 → 屏幕 y 方向滚动）。**每帧只有 1 次 fillRect**。
 *   - 远景带：BG/MG/FG 各一条 750+余量宽的带子贴在场地顶部 100px（FIELD_TOP..200），
 *     每层按自己的速率横向平移、在可用余量内饱和，永不露出空白也不循环 → 没有接缝。
 *     速率比 1 : 2.67 : 4 来自素材宽度反推（(730-640):(880-640):(1000-640)）。
 *
 * 只在 `render()` 里被调用，且只画 FIELD 矩形内的像素；HUD / 单位 / 特效 / 命中框
 * 的绘制顺序与坐标完全不受影响。
 */
import { DESIGN_W, FIELD, FIELD_TOP, GRID_W, ROW_PX, clamp } from './layout.ts';

/** 远景带的缩放（烘焙时已按 1.04 出图，运行时 1:1 贴） */
export const BAND_SCALE = 1.04;
/** 远景带高度（96 × 1.04 取整） */
export const BAND_H = 100;
/** 带的顶边：正好贴场地顶 */
export const BAND_TOP = FIELD_TOP;
/** 带的地平线基线：地面从这里往下全是平铺地面 */
export const BAND_BASE = FIELD_TOP + BAND_H;

/** 地面贴图边长（512 × FLOOR_SCALE 烘焙） */
export const FLOOR_PX = 256;
/** 地面缩放：512 的 tile → 256px ≈ 3.58 行（ROW_PX=71.43） */
export const FLOOR_SCALE = 0.5;

/**
 * 每层横向视差速率（px / 镜头 px）。先用素材宽度反推比值：
 * (730-640):(880-640):(1000-640) = 90:240:360 = 1:2.67:4，
 * 再乘 0.05 的公共系数，使整场战斗（镜头走 3–6 行）里远景带的横移落在 8–90px，
 * 既不静止也不侧滑。近景(FG)最快、远景(BG)最慢。
 */
const RATE_BG = 0.05;
const RATE_MG = 0.1333;
const RATE_FG = 0.2;

/** 美术方向（?bgmode=，只用于对比截图；默认 b） */
export type BgMode = 'a' | 'b' | 'b2' | 'c' | 'off';

const QUERY: string =
  typeof location === 'undefined' ? '' : typeof location.search === 'string' ? location.search : '';

function param(name: string): string | null {
  if (!QUERY) return null;
  const m = new RegExp(`[?&]${name}=([^&]*)`).exec(QUERY);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

function readMode(): BgMode {
  const v = param('bgmode');
  return v === 'a' || v === 'b2' || v === 'c' || v === 'off' ? v : 'b';
}

const MODE: BgMode = readMode();

// ---------------------------------------------------------------------------
// 资源
// ---------------------------------------------------------------------------

export interface TerrainBg {
  floor: HTMLImageElement | null;
  bg: HTMLImageElement | null;
  mg: HTMLImageElement | null;
  fg: HTMLImageElement | null;
  floorPattern: CanvasPattern | null;
  patternBroken: boolean;
}

const TERRAIN_COUNT = 12;
const cache: Array<TerrainBg | null> = new Array<TerrainBg | null>(TERRAIN_COUNT).fill(null);

function urlFor(kind: 'floor' | 'bg' | 'mg' | 'fg', terrain: number): string {
  const nn = String(terrain).padStart(2, '0');
  return `assets/bg/orig/${kind}${nn}.png`; // 与 web/main.js 的 'assets/hero/...' 同口径
}

function loadInto(st: TerrainBg, key: 'floor' | 'bg' | 'mg' | 'fg', url: string): void {
  if (st[key]) return;
  const img = new Image();
  st[key] = img;
  img.decoding = 'async';
  img.onload = () => {
    st[key] = img;
  };
  img.onerror = () => {
    st[key] = null;
  };
  img.src = url;
}

function ensure(terrain: number): TerrainBg | null {
  if (typeof Image === 'undefined') return null; // node / tsc 环境下静默降级
  const t = clamp(Math.round(terrain) || 0, 0, TERRAIN_COUNT - 1);
  let st = cache[t];
  if (!st) {
    st = { floor: null, bg: null, mg: null, fg: null, floorPattern: null, patternBroken: false };
    cache[t] = st;
    loadInto(st, 'floor', urlFor('floor', t));
    loadInto(st, 'bg', urlFor('bg', t));
    loadInto(st, 'mg', urlFor('mg', t));
    loadInto(st, 'fg', urlFor('fg', t));
  }
  return st;
}

function isReady(img: HTMLImageElement | null): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** 该地形的背景是否可以画（地面或任意一层景物到位即可，逐层降级） */
export function bgReady(terrain: number): boolean {
  if (MODE === 'off') return false; // 只用于"改造前"对照截图
  const st = ensure(terrain);
  if (!st) return false;
  return isReady(st.floor) || isReady(st.bg) || isReady(st.fg);
}

/** 这些地形是否已经全部就绪（给裁缝/调试用） */
export function bgReadyCount(): number {
  let n = 0;
  for (let t = 0; t < TERRAIN_COUNT; t++) if (bgReady(t)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// 绘制
// ---------------------------------------------------------------------------

function patternOf(ctx: CanvasRenderingContext2D, st: TerrainBg): CanvasPattern | null {
  if (st.floorPattern || st.patternBroken) return st.floorPattern;
  if (!isReady(st.floor)) return null;
  const p = ctx.createPattern(st.floor, 'repeat');
  if (!p) {
    st.patternBroken = true;
    return null;
  }
  st.floorPattern = p;
  return p;
}

function layerX(img: HTMLImageElement, rate: number, camPx: number): number {
  const slack = Math.max(0, img.naturalWidth - DESIGN_W);
  const pan = clamp(rate * camPx, -slack / 2, slack / 2);
  return -slack / 2 + pan;
}

/**
 * 场地内边框压暗（上下各一道 60/110px 的黑色渐变，最深处 0.18/0.30）。
 * 只压边缘、不动中间，让亮地形（雪原/沙地）不至于和深色 HUD/控制台割裂；
 * 中间一块保持原图颜色，不做整体调色。
 */
const frameGrads = new WeakMap<CanvasRenderingContext2D, { top: CanvasGradient; bot: CanvasGradient }>();

function frameGradient(ctx: CanvasRenderingContext2D): { top: CanvasGradient; bot: CanvasGradient } {
  let g = frameGrads.get(ctx);
  if (!g) {
    const top = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_TOP + 60);
    top.addColorStop(0, 'rgba(8,10,14,0.30)');
    top.addColorStop(1, 'rgba(8,10,14,0)');
    const bot = ctx.createLinearGradient(0, FIELD.y + FIELD.h - 110, 0, FIELD.y + FIELD.h);
    bot.addColorStop(0, 'rgba(8,10,14,0)');
    bot.addColorStop(1, 'rgba(8,10,14,0.30)');
    g = { top, bot };
    frameGrads.set(ctx, g);
  }
  return g;
}

/**
 * 画地面 + 远景带（只覆盖 FIELD）。返回 true 表示"这一帧已经画过底色"，
 * 调用方（battleView.js 的 drawField）就应该省掉那层纯色底。
 */
export function drawBattleBg(
  ctx: CanvasRenderingContext2D,
  terrain: number,
  camX: number,
  mode: BgMode = MODE,
): boolean {
  if (MODE === 'off') return false; // 改造前的纯色底，仅用于对照截图
  const st = ensure(terrain);
  if (!st) return false;
  const hasFloor = isReady(st.floor);
  const hasBand = isReady(st.bg) || isReady(st.mg) || isReady(st.fg);
  if (!hasFloor && !hasBand) return false;

  const camPx = camX * ROW_PX;
  ctx.save();
  ctx.beginPath();
  ctx.rect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
  ctx.clip();

  // 1) 地面：一次 fillRect（pattern 相位 = 镜头纵向位移）
  if (hasFloor) {
    const pat = patternOf(ctx, st);
    if (pat) {
      const py = -((camPx % FLOOR_PX + FLOOR_PX) % FLOOR_PX);
      pat.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 0, f: py });
      ctx.fillStyle = pat;
    } else {
      ctx.fillStyle = '#2a2f2a';
    }
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
  }

  // 2) 远景带
  if (mode === 'b' || mode === 'b2') {
    if (mode === 'b' && isReady(st.bg)) ctx.drawImage(st.bg, layerX(st.bg, RATE_BG, camPx), BAND_TOP);
    if (isReady(st.mg)) ctx.drawImage(st.mg, layerX(st.mg, RATE_MG, camPx), BAND_TOP);
    if (isReady(st.fg)) ctx.drawImage(st.fg, layerX(st.fg, RATE_FG, camPx), BAND_TOP);
  } else if (mode === 'c' && isReady(st.fg)) {
    // (c) 边缘框景：近景条的两端压在场地四角
    const img = st.fg;
    const sw = 240;
    const bottomY = FIELD.y + FIELD.h - BAND_H;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, 0, 0, sw, BAND_H, 0, FIELD.y, sw, BAND_H);
    ctx.drawImage(img, img.naturalWidth - sw, 0, sw, BAND_H, DESIGN_W - sw, FIELD.y, sw, BAND_H);
    ctx.drawImage(img, 0, 0, sw, BAND_H, 0, bottomY, sw, BAND_H);
    ctx.drawImage(img, img.naturalWidth - sw, 0, sw, BAND_H, DESIGN_W - sw, bottomY, sw, BAND_H);
    ctx.globalAlpha = 1;
  }

  // 3) 场地上下边缘压暗（与 HUD / 控制台衔接，中间不动）
  const g = frameGradient(ctx);
  ctx.fillStyle = g.top;
  ctx.fillRect(0, FIELD_TOP, DESIGN_W, 60);
  ctx.fillStyle = g.bot;
  ctx.fillRect(0, FIELD.y + FIELD.h - 110, DESIGN_W, 110);

  drawBenchTag(ctx);

  ctx.restore();
  return true;
}

// ---------------------------------------------------------------------------
// 性能自测（?bgbench=1）：300 帧实测，结果写进 <html data-bgbench> 与 document.title
// ---------------------------------------------------------------------------

let benchStarted = false;
let benchTag = '';

function benchOnce(terrain: number): void {
  if (benchStarted || typeof document === 'undefined') return;
  if (!bgReady(terrain)) return;
  benchStarted = true;
  const c = document.createElement('canvas');
  c.width = DESIGN_W;
  c.height = 1334;
  const g = c.getContext('2d');
  if (!g) return;
  const N = 300;
  // 预热 20 帧，避免把首次建 pattern / 首次解码算进去
  for (let i = 0; i < 20; i++) drawBattleBg(g, terrain, 20 + i * 0.1);
  g.getImageData(0, 0, 1, 1); // 清空预热积压的绘制指令
  const t0 = performance.now();
  for (let i = 0; i < N; i++) drawBattleBg(g, terrain, 20 + (i % 60) * 0.35);
  const t1 = performance.now();
  // 强制 flush：Canvas2D 的绘制是排队的，不读回就只量到"提交指令"的时间。
  // getImageData 1x1 会把 300 帧的光栅化全部做完，得到真实每帧成本。
  g.getImageData(0, 0, 1, 1);
  const t2 = performance.now();
  const per = (t2 - t0) / N;
  const submit = (t1 - t0) / N;
  benchTag =
    `frames=${N} wall=${(t2 - t0).toFixed(1)}ms perFrame=${per.toFixed(3)}ms ` +
    `submit=${submit.toFixed(3)}ms budget16_7=${((per / 16.666) * 100).toFixed(1)}% terrain=${terrain}`;
  try {
    document.documentElement.dataset.bgbench = benchTag;
    document.title = benchTag;
  } catch {
    /* 忽略 */
  }
}

/** ?bgbench=1 时把实测结果画在场地左上角（截图即可取证，不依赖 DOM 取数） */
function drawBenchTag(ctx: CanvasRenderingContext2D): void {
  if (!benchTag) return;
  ctx.font = '600 20px monospace';
  const w = ctx.measureText(benchTag).width + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(4, FIELD_TOP + 4, w, 30);
  ctx.fillStyle = '#8ef58e';
  ctx.fillText(benchTag, 12, FIELD_TOP + 26);
}

/** 由 render() 每帧调用一次；?bgbench=1 时跑一次 300 帧实测 */
export function battleBgTick(terrain: number): void {
  if (MODE === 'a') return;
  if (QUERY.indexOf('bgbench=1') < 0) return;
  benchOnce(terrain);
}

/** 调试：把 12 个地形的地面/带子就绪情况打印出来（控制台） */
export function debugBgState(): string {
  const parts: string[] = [];
  for (let t = 0; t < TERRAIN_COUNT; t++) {
    const st = ensure(t);
    const f = st && isReady(st.floor) ? 'F' : '-';
    const b = st && isReady(st.bg) ? 'B' : '-';
    const m = st && isReady(st.mg) ? 'M' : '-';
    const g = st && isReady(st.fg) ? 'G' : '-';
    parts.push(`${String(t).padStart(2, '0')}:${f}${b}${m}${g}`);
  }
  return `mode=${MODE} ${parts.join(' ')} (grid ${GRID_W})`;
}
