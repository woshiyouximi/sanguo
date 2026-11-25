/**
 * 透视边界与摄像机夹取（R198 / `project/201_透视边界与摄像机.md`）自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/persp_edge.test.ts
 *
 * 背景：R193 把「格 → 屏幕」从等距常数投影换成原作式透视后，`core/battle.ts:camera()`
 * 的夹取还留在旧口径 `±450/ROW_PX = ±6.3 行`。透视下一屏是 **13.327 行**（远 7.434 / 近 5.894，
 * 两端不等），夹取端点必须由「战场带沿 ± 精灵身位」反解，否则**夹取端点自己就越界**：
 * camX=63.7 时最后一排（gx=70）的 sy=1034.589，比 `FIELD_BOTTOM` 低 34.589px、脚被控制台盖住。
 *
 * 这里钉的是**边界契约**，不是像素外观：
 *   1) 端点标定：CAM_MIN / CAM_MAX 由带沿 + 身位反解（6.2874 / 64.4877），不再是 6.3 / 63.7；
 *   2) 五个 camX（6.3 / 20 / 35.5 / 50 / 63.7）下，**窗口内每个整数行**的地面点都在带内；
 *   3) 可见行数恒为 13.327±0.05 —— 夹取不许靠「把行数压到 12 点几」来让端点过关；
 *   4) 端点处两端精灵都不出带：CAM_MAX 下 gx=70 的脚底 998.35 < 1000，
 *      CAM_MIN 下 gx=0 的最高帧头顶 100.21 > 100；
 *   5) `clampCameraX()` 是唯一真源：`camera()` 只做「算位置 + 夹」，夹取前后同值；
 *   6) 命中同源：`hitTest` / `screenToUnit` 与 `projectUnit` 互为反解，往返误差 <1px（实测 1e-13）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { GRID_H, GRID_W, camera, createWorld } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import {
  CAM_FAR_SY,
  CAM_HALF_ROWS,
  CAM_MAX,
  CAM_MIN,
  CAM_NEAR_SY,
  FIELD_BOTTOM,
  FIELD_TOP,
  ROW_PX,
  ROWS_FAR,
  ROWS_NEAR,
  ROWS_VISIBLE,
  clampCameraX,
  rowOfScreenY,
  rowScale,
  rowScreenY,
} from '../src/core/field.ts';
import { projectUnit, projectionInfo, screenToUnit } from '../src/view/projection.ts';
import { hitTest } from '../src/view/battleView.ts';
import { ACTION_FOOT_Y } from '../src/view/animSelect.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 验收指定的五个镜头位置（旧夹取端点是 6.3 / 63.7，新端点是 6.2874 / 64.4877） */
const CAMS = [6.3, 20, 35.5, 50, 63.7] as const;

/** `units.json` 里最高的帧 `tiechui_atk_04` = 75×106：头顶离地面点 (106−ACTION_FOOT_Y)·scale */
const TALLEST_FRAME_H = 106;

const near2 = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

function newWorld(): World {
  return createWorld({ data, seed: 7, a: { troop: 0, soldiers: 6 }, b: { troop: 0, soldiers: 6 } });
}

/**
 * 把两侧单位按给定的 worldX 列表摆好（多余的打死）：`u.x` 既是 core 的逻辑坐标，
 * 也是 `battleView` 直接拿去 `projectUnit` 的绘制坐标（battleView.ts:1143），所以改它就是改画面。
 */
function layout(w: World, aRows: readonly number[], bRows: readonly number[]): World {
  let ai = 0;
  let bi = 0;
  for (const u of w.units) {
    if (u.side === 'A') {
      if (ai < aRows.length) { u.x = aRows[ai]!; u.y = ai % GRID_H; ai += 1; } else u.alive = false;
    } else if (bi < bRows.length) { u.x = bRows[bi]!; u.y = bi % GRID_H; bi += 1; } else u.alive = false;
  }
  return w;
}

/** 与 `camera()` 内部同式的未夹取位置（两侧都有兵时取双方前锋中点 / 超一屏时跟我方前锋） */
function rawCam(w: World): number {
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
  let aN = 0, bN = 0;
  for (const u of w.units) {
    if (!u.alive) continue;
    if (u.side === 'A') { aN++; aMin = Math.min(aMin, u.x); aMax = Math.max(aMax, u.x); }
    else { bN++; bMin = Math.min(bMin, u.x); bMax = Math.max(bMax, u.x); }
  }
  if (aN && bN) {
    const mid = (aMin + bMax) / 2;
    return aMin - bMax > 2 * CAM_HALF_ROWS ? aMin - 2.6 : mid;
  }
  if (aN) return (aMin + aMax) / 2;
  if (bN) return (bMin + bMax) / 2;
  return GRID_W / 2;
}

/** 窗口内（且落在网格里）的全部整数行 */
function rowsInBand(camX: number): number[] {
  const info = projectionInfo(camX);
  const out: number[] = [];
  for (let gx = Math.max(0, Math.ceil(info.farRow - 1e-9)); gx <= Math.min(GRID_W - 1, Math.floor(info.nearRow + 1e-9)); gx += 1) {
    out.push(gx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1) 端点标定：从带沿 + 身位反解，而不是 450/ROW_PX
// ---------------------------------------------------------------------------

test('端点标定：CAM_MIN/CAM_MAX 由带沿 + 精灵身位反解（6.2874 / 64.4877），旧 ±6.3 已废', () => {
  // 反解口径：camX − ROWS_FAR = 0 时 row0 在带顶；camX + ROWS_NEAR = GRID_W−1 时 row70 在带底
  assert.ok(Math.abs(CAM_MIN - 6.2874) < 0.001, `CAM_MIN=${CAM_MIN}，应 ≈6.2874（旧 6.3）`);
  assert.ok(Math.abs(CAM_MAX - 64.4877) < 0.001, `CAM_MAX=${CAM_MAX}，应 ≈64.4877（旧 63.7）`);
  // 与旧端点的关系：远端几乎复刻（差 0.013 行），近端**向外让出 0.788 行**——这就是本轮的修复量
  assert.ok(Math.abs(CAM_MIN - 6.3) < 0.02, `CAM_MIN 与旧 6.3 只该差一点点，实差 ${CAM_MIN - 6.3}`);
  assert.ok(CAM_MAX - 63.7 > 0.7 && CAM_MAX - 63.7 < 0.9, `CAM_MAX 应比旧 63.7 大 ~0.788，实差 ${CAM_MAX - 63.7}`);
  // CAM_HALF_ROWS 只是换镜判据（450/ROW_PX = 6.3），不许再被当成夹取范围
  assert.ok(Math.abs(CAM_HALF_ROWS - 450 / ROW_PX) < 1e-12);
  assert.ok(near2(CAM_HALF_ROWS, 6.3, 1e-12), `CAM_HALF_ROWS=${CAM_HALF_ROWS}`);
  // 端点与「带沿 ± 身位」是一一对应：CAM_FAR_SY / CAM_NEAR_SY 就是带内留白后的两条线
  assert.ok(near2(rowScreenY(-CAM_MIN), CAM_FAR_SY, 1e-9), `row0@CAM_MIN 应在 ${CAM_FAR_SY}，实为 ${rowScreenY(-CAM_MIN)}`);
  assert.ok(near2(rowOfScreenY(CAM_NEAR_SY), GRID_W - 1 - CAM_MAX, 1e-9));
});

test('clampCameraX：幂等、单调、五个 camX 都是不动点，越界值收敛到端点', () => {
  for (const camX of CAMS) assert.ok(near2(clampCameraX(camX), camX), `camX=${camX} 是合法位置，不该被夹`);
  for (const v of [-9, -0.1, 0, 1e-9, 6.2874, 70, 70.5, 1e6]) {
    const c = clampCameraX(v);
    assert.ok(c >= CAM_MIN - 1e-12 && c <= CAM_MAX + 1e-12, `clamp(${v})=${c} 出了 [${CAM_MIN},${CAM_MAX}]`);
    assert.ok(near2(clampCameraX(c), c), `clamp 不幂等：clamp(${c})=${clampCameraX(c)}`);
  }
  assert.ok(near2(clampCameraX(-5), CAM_MIN) && near2(clampCameraX(99), CAM_MAX));
  // 单调：夹取不许把顺序调头（否则镜头会抖动）
  let prev = -Infinity;
  for (let v = -2; v <= 72; v += 0.25) {
    const c = clampCameraX(v);
    assert.ok(c >= prev - 1e-12, `clamp 在 ${v} 处掉头：${prev} → ${c}`);
    prev = c;
  }
});

// ---------------------------------------------------------------------------
// 2) 五个 camX：窗口内每行的地面点都在带内，可见行数恒为 13.327
// ---------------------------------------------------------------------------

test('可见行数恒为 13.327±0.05：夹取没有靠「压行数」让端点过关', () => {
  assert.ok(Math.abs(ROWS_VISIBLE - 13.327) < 0.05, `ROWS_VISIBLE=${ROWS_VISIBLE}`);
  assert.ok(near2(ROWS_VISIBLE, ROWS_FAR + ROWS_NEAR), '合计 = 远端 + 近端');
  assert.ok(Math.abs(ROWS_FAR - 7.4339) < 0.001 && Math.abs(ROWS_NEAR - 5.8936) < 0.001, '两端行数没被改');
  // 夹取端点上测一遍：13.327 是**带**的行数，和镜头停在哪无关
  for (const camX of [...CAMS, CAM_MIN, CAM_MAX]) {
    const info = projectionInfo(camX);
    assert.ok(Math.abs(info.rows - 13.327) < 0.05, `camX=${camX}: 可见 ${info.rows} 行，被压到 12 点几了`);
    assert.ok(near2(info.rows, ROWS_VISIBLE), `camX=${camX}: rows 与 ROWS_VISIBLE 不一致`);
    assert.ok(info.rowsInt >= 12, `camX=${camX}: 完整落在带内的整数行只剩 ${info.rowsInt}`);
  }
});

test('五个 camX：窗口内最远/最近整数行的 sy 都在 [FIELD_TOP, FIELD_BOTTOM]，且两端留白', () => {
  for (const camX of CAMS) {
    const rows = rowsInBand(camX);
    assert.ok(rows.length >= 13, `camX=${camX}: 只看到 ${rows.length} 个整数行`);
    let prev = -Infinity;
    for (const gx of rows) {
      const sy = projectUnit(gx, 6, camX).sy;
      assert.ok(sy >= FIELD_TOP && sy <= FIELD_BOTTOM, `camX=${camX}: 行 ${gx} 的 sy=${sy} 出了带 [${FIELD_TOP},${FIELD_BOTTOM}]`);
      assert.ok(sy > prev, `camX=${camX}: 行 ${gx} 的 sy 没单调递增`);
      prev = sy;
    }
    const far = rows[0]!;
    const near = rows[rows.length - 1]!;
    assert.ok(projectUnit(far, 6, camX).sy > FIELD_TOP, `camX=${camX}: 最远行 ${far} 压在带沿上`);
    assert.ok(projectUnit(near, 6, camX).sy < FIELD_BOTTOM, `camX=${camX}: 最近行 ${near} 压在带沿上`);
    // 带沿本身由 ROWS_FAR / ROWS_NEAR 精确反解出来（0 误差），与镜头位置无关
    assert.ok(near2(rowScreenY(-ROWS_FAR), FIELD_TOP, 1e-9));
    assert.ok(near2(rowScreenY(ROWS_NEAR), FIELD_BOTTOM, 1e-9));
  }
});

test('窗外行确实越界：camX=63.7 时 gx=70 落在窗口外（r=6.3 > ROWS_NEAR=5.894）', () => {
  const info = projectionInfo(63.7);
  assert.ok(Math.abs(info.nearRow - 69.5936) < 0.01, `nearRow=${info.nearRow}`);
  const r = GRID_W - 1 - 63.7;
  assert.ok(r > ROWS_NEAR, `r=${r} 应该已经在近端窗口外`);
  const p = projectUnit(GRID_W - 1, 6, 63.7);
  assert.ok(p.sy > FIELD_BOTTOM, `gx=70 的 sy=${p.sy} 应在带底以下`);
  // 这条越界就是缺陷本体：旧夹取把它当成端点，于是「最近的合法镜头」本身就盖住了脚
  assert.ok(Math.abs(p.sy - 1034.589) < 0.01, `实测 sy=${p.sy}，project/193 §7.1 记的是 1034.6`);
  assert.ok(Math.abs(p.sy - FIELD_BOTTOM - 34.589) < 0.01, `越带 ${p.sy - FIELD_BOTTOM}px，应为 34.589`);
});

// ---------------------------------------------------------------------------
// 3) 端点处精灵不出带（这才是夹取端点该保证的事）
// ---------------------------------------------------------------------------

test('CAM_MAX 下最后一排（gx=70）的脚底 998.35 < 1000：脚不被控制台盖住', () => {
  const p = projectUnit(GRID_W - 1, 6, CAM_MAX);
  assert.ok(near2(p.sy, CAM_NEAR_SY, 1e-9), `sy=${p.sy} 应等于 CAM_NEAR_SY=${CAM_NEAR_SY}`);
  const foot = p.sy + ACTION_FOOT_Y * p.scale;
  assert.ok(foot < FIELD_BOTTOM, `脚底 ${foot} 已进控制台（FIELD_BOTTOM=${FIELD_BOTTOM}）`);
  assert.ok(foot > FIELD_BOTTOM - 3, `脚底 ${foot} 离带底太远，近端身位给多了`);
  // 旧的 63.7 做不到这点：同一格脚底 1065.79，比带底低 65.79px
  const oldFoot = projectUnit(GRID_W - 1, 6, 63.7);
  assert.ok(oldFoot.sy + ACTION_FOOT_Y * oldFoot.scale > FIELD_BOTTOM + 60, '旧端点应明显越界（对照组）');
});

test('CAM_MIN 下第一排（gx=0）的最高帧头顶 100.21 > 100：头顶不被 HUD 盖住', () => {
  const p = projectUnit(0, 6, CAM_MIN);
  assert.ok(near2(p.sy, CAM_FAR_SY, 1e-9), `sy=${p.sy} 应等于 CAM_FAR_SY=${CAM_FAR_SY}`);
  // 贴图底边在 sy 下方 ACTION_FOOT_Y·scale，顶边在 sy 上方 (帧高−ACTION_FOOT_Y)·scale
  const head = p.sy - (TALLEST_FRAME_H - ACTION_FOOT_Y) * p.scale;
  assert.ok(head > FIELD_TOP, `最高帧头顶 ${head} 出了带顶（FIELD_TOP=${FIELD_TOP}）`);
  // 留白很薄（0.2px 级）：身位常数 62 就是按这个几何反解出来的，改动它会立刻翻车
  assert.ok(head < FIELD_TOP + 2, `头顶留白 ${head - FIELD_TOP}px 与 CAM_MARGIN_FAR_PX 的设计不符`);
  // 最高帧在远端的缩放应该贴着 SCALE_FAR（0.742）而不是镜头行的 0.9625
  assert.ok(p.scale > 0.74 && p.scale < 0.79, `远端 scale=${p.scale}`);
  assert.ok(rowScale(-ROWS_FAR) < p.scale, '带顶那一行比 gx=0 更远，缩放应更小');
});

// ---------------------------------------------------------------------------
// 4) camera() 接上唯一真源：算位置 + 夹，别的都不改
// ---------------------------------------------------------------------------

test('camera() = clampCameraX(未夹取位置)：五种布局逐个对齐（含双方/单侧/空场）', () => {
  const cases: { a: number[]; b: number[] }[] = [
    { a: [40, 45], b: [10, 15] },          // 双方都在场中
    { a: [60, 70], b: [] },                 // 只剩我方（收尾）→ 会顶到近端
    { a: [], b: [0, 2] },                   // 只剩敌方（收尾）→ 会顶到远端
    { a: [68, 70], b: [0, 1] },             // 双方都在两端：超一屏，跟我方前锋
    { a: [], b: [] },                       // 空场 → GRID_W/2
  ];
  for (const c of cases) {
    const w = layout(newWorld(), c.a, c.b);
    const raw = rawCam(w);
    const got = camera(w);
    assert.ok(near2(got, clampCameraX(raw), 1e-12), `A=${c.a} B=${c.b}: camera()=${got} ≠ clamp(${raw})=${clampCameraX(raw)}`);
    assert.ok(got >= CAM_MIN - 1e-12 && got <= CAM_MAX + 1e-12, `camera()=${got} 越界`);
  }
});

test('收尾时镜头能推到 64.4877（旧实现死在 63.70）：gx=70 的脚因此留在带内', () => {
  const w = layout(newWorld(), [60, 70], []);
  const cam = camera(w);
  assert.ok(near2(cam, CAM_MAX, 1e-9), `只剩我方 [60,70] 时中点是 65，应夹到 CAM_MAX=${CAM_MAX}，实得 ${cam}`);
  assert.ok(cam > 63.7 + 0.7, `camera()=${cam} 仍被旧夹取卡在 63.7 附近`);
  // 旧口径（Math.min(GRID_W−1−6.3, 65)）在同一布局下会把 gx=70 推到带底以下
  const oldCam = Math.min(GRID_W - 1 - CAM_HALF_ROWS, 65);
  assert.ok(near2(oldCam, 63.7, 1e-9));
  const oldFoot = projectUnit(GRID_W - 1, 6, oldCam);
  const newFoot = projectUnit(GRID_W - 1, 6, cam);
  assert.ok(oldFoot.sy + ACTION_FOOT_Y * oldFoot.scale > FIELD_BOTTOM + 60, '旧镜头下脚底应越界（对照）');
  assert.ok(newFoot.sy + ACTION_FOOT_Y * newFoot.scale < FIELD_BOTTOM, '新镜头下脚底必须在带内');
  // 远端同理：只剩敌人挤在 0..2 时夹到 CAM_MIN，gx=0 的头顶仍在带内
  const w2 = layout(newWorld(), [], [0, 2]);
  const cam2 = camera(w2);
  assert.ok(near2(cam2, CAM_MIN, 1e-9), `只剩敌方 [0,2] 时应夹到 CAM_MIN=${CAM_MIN}，实得 ${cam2}`);
  const head2 = projectUnit(0, 6, cam2);
  assert.ok(head2.sy - (TALLEST_FRAME_H - ACTION_FOOT_Y) * head2.scale > FIELD_TOP);
});

// ---------------------------------------------------------------------------
// 5) 命中同源：屏幕 → 格 → 投影回来 <1px
// ---------------------------------------------------------------------------

test('hitTest ↔ projectUnit 往返 <1px（五个 camX × 窗口内每行 × 每 3 条车道）', () => {
  const w = newWorld();
  let worst = 0;
  let n = 0;
  for (const camX of CAMS) {
    for (const gx of rowsInBand(camX)) {
      for (let gy = 0; gy < GRID_H; gy += 3) {
        const p = projectUnit(gx, gy, camX);
        // 点「格中心」：屏幕点 → 格 → 投回去，误差必须 <1px
        const hit = hitTest(w, { camX }, p.sx, p.sy);
        assert.ok(hit && hit.type === 'field', `camX=${camX} 格 (${gx},${gy}) 的格中心点不出战场`);
        if (!hit || hit.type !== 'field') continue;
        assert.equal(hit.gx, gx, `camX=${camX} 格 (${gx},${gy}) 点成 (${hit.gx},${hit.gy})`);
        assert.equal(hit.gy, gy, `camX=${camX} 格 (${gx},${gy}) 点成 (${hit.gx},${hit.gy})`);
        const back = projectUnit(hit.gx, hit.gy, camX);
        const err = Math.hypot(back.sx - p.sx, back.sy - p.sy);
        worst = Math.max(worst, err);
        assert.ok(err < 1, `camX=${camX} 格 (${gx},${gy}) 往返误差 ${err}px ≥ 1px`);
        n += 1;
      }
    }
  }
  assert.ok(n >= 13 * 5, `只验了 ${n} 个格`);
  assert.ok(worst < 1, `往返最差 ${worst}px`);
  // 注：车道中心的世界坐标恰好是整数（`laneScreenX(gy) = 375 + (gy−6.5)·lanePitch`），
  // screenToUnit 靠 `floor(worldY + 1e-6)` 才稳定落回本车道 —— 像素级抖动本来就该允许选到相邻车道，
  // 所以「<1px」这条按格中心验；任意带内点的浮点往返由上面 screenToUnit 那条单独钉死（1e-13）。
});

test('screenToUnit 是 projectUnit 的精确反解：任意带内点回投影误差 <1px（实测 1e-13）', () => {
  let worst = 0;
  for (const camX of [...CAMS, CAM_MIN, CAM_MAX]) {
    for (let sy = FIELD_TOP + 2; sy < FIELD_BOTTOM; sy += 41.3) {
      for (let sx = 6; sx < 750; sx += 57.7) {
        const hit = screenToUnit(sx, sy, camX);
        assert.ok(hit, `camX=${camX} 屏幕上 (${sx},${sy}) 落在带内却反解失败`);
        if (!hit) continue;
        const p = projectUnit(hit.worldX, hit.worldY, camX);
        const err = Math.hypot(p.sx - sx, p.sy - sy);
        worst = Math.max(worst, err);
        assert.ok(err < 1, `camX=${camX} 点 (${sx},${sy}) 往返误差 ${err}px`);
        assert.ok(near2(hit.scale, p.scale, 1e-12), '命中的 scale 必须与绘制同源');
      }
    }
  }
  assert.ok(worst < 1e-6, `反解往返最差 ${worst}px，应该只有浮点噪声`);
});
