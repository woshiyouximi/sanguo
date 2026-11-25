/**
 * 透视投影（R193）自检。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/projection.test.ts
 *
 * 这一轮把「格 → 屏幕」从 core 的常数投影（`sy = 550 + (gx−camX)·ROW_PX`，每行一样大）
 * 换成原作式的**透视投影**：远排（屏幕上方 = 敌方侧）压缩到 0.74×、近排（下方 = 我方侧）
 * 放大到 1.18×，见 `src/view/projection.ts` 与 `project/193_透视投影.md`。
 *
 * 这里钉的是**几何契约**，不是像素外观：
 *   1) 标定：两端缩放对得上 project/190 §3.2 的实测（53 / 84.5 px 每格）；
 *   2) 单调：屏幕 y 是行号的严格单调函数（否则点选会跳格、排序会错）；
 *   3) 中线不动：镜头所在那一行恒在 `FIELD_CENTER_Y`，与旧实现同锚点（画面不会整体漂移）；
 *   4) 同源：`screenToUnit(projectUnit(g)) ≈ g`，绘制与命中只有一条公式；
 *   5) 可见性：71 列 × 14 行在 900px 战场带内可见，行数落在 8..14 的硬区间；
 *   6) 脚底锚点：`buildFrame` 出的 sprite 底边（= `drawImage` 的 `dy + dh`）必须落在
 *      `projectUnit(...).sy + 26·scale` 上 —— 远排不许悬空、近排不许插进地里。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadData } from '../src/data.ts';
import { GRID_H, GRID_W, LANE_PX, ROW_PX, camera, createWorld, step } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { engage } from './_engage.ts';
import { ACTION_FOOT_Y } from '../src/view/animSelect.ts';
import { buildFrame, hitTest } from '../src/view/battleView.ts';
import {
  DESIGN_W,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_TOP,
  LANE_SQUEEZE,
  PITCH_FAR_PX,
  PITCH_NEAR_PX,
  ROWS_MAX,
  ROWS_MIN,
  ROWS_NEAR,
  ROWS_VISIBLE,
  ROW_K,
  SCALE_CENTER,
  SCALE_FAR,
  SCALE_NEAR,
  lanePitch,
  projectCell,
  projectUnit,
  projectionInfo,
  rowEdgeX,
  rowOfScreenY,
  rowPitch,
  rowScale,
  rowScreenY,
  screenToUnit,
} from '../src/view/projection.ts';
import type { UnitsAtlas, UnitFrameRect } from '../src/view/unitFrames.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const IMG = { tag: 'units' } as unknown as CanvasImageSource;
const IMG_ENEMY = { tag: 'units-enemy' } as unknown as CanvasImageSource;

/** 真 units.json → main.js loadUnits() 会产出的那坨东西（脚底锚点测试要用真图集才画得出 sprite） */
function realUnits(): UnitsAtlas {
  const j = JSON.parse(readFileSync(new URL('../web/anim/units.json', import.meta.url), 'utf8')) as {
    pages: { sprites: { name: string; x: number; y: number; w: number; h: number }[] }[];
    groups: UnitsAtlas['groups'];
  };
  const frames: Record<string, UnitFrameRect> = {};
  for (const sp of j.pages[0]!.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
  return { img: IMG, imgEnemy: IMG_ENEMY, frames, groups: j.groups };
}

function world(troopA = 0, troopB = 0, soldiers = 6): World {
  return createWorld({ data, seed: 7, a: { troop: troopA, soldiers }, b: { troop: troopB, soldiers } });
}

/** 跑到接触为止：默认镜头跟 A 前锋，只有接触后双方才同屏 */
function engaged(): World {
  const w = engage(world());
  for (let i = 0; i < 900 && w.stats.attacksA === 0 && w.stats.attacksB === 0; i += 1) step(w);
  return w;
}

/** 所有在 core 的镜头夹取范围内、值得抽查的镜头位置 */
const CAMS = [0, 6.3, 20.5, 35, 50.25, 63.7, 70];

// ---------------------------------------------------------------------------
// 1) 标定：两端缩放来自实测，不是拍脑袋给的
// ---------------------------------------------------------------------------

test('标定：远端 0.74× / 近端 1.18×，来自 project/190 §3.2 的 53px 与 84.5px', () => {
  assert.equal(SCALE_FAR, PITCH_FAR_PX / ROW_PX, '远端缩放 = 实测 53px ÷ 设计行距');
  assert.ok(Math.abs(SCALE_NEAR - PITCH_NEAR_PX / ROW_PX) < 0.005, `近端缩放 ${SCALE_NEAR} 应贴近实测 84.5/ROW_PX`);
  assert.ok(SCALE_FAR < 1, '远排必须比常數投影小');
  assert.ok(SCALE_NEAR > 1, '近排必须比常數投影大');
  assert.ok(ROW_K > 0, '透视强度必须为正（越近越大）');
  assert.ok(LANE_SQUEEZE > 0.5 && LANE_SQUEEZE <= 1, `车道压缩 ${LANE_SQUEEZE} 应在 (0.5,1]`);
  assert.equal(SCALE_CENTER, (SCALE_FAR + SCALE_NEAR) / 2, '镜头行 = 两端中点');
});

test('两端行缩放 == 两端的标定值（透视曲线两端对得上）', () => {
  // r = −farRows 是带顶那一行，r = +nearRows 是带底那一行
  const sFar = rowScale(-projectionInfo(0).farRows);
  const sNear = rowScale(projectionInfo(0).nearRows);
  assert.ok(Math.abs(sFar - SCALE_FAR) < 0.01, `带顶行缩放 ${sFar} 应贴近 SCALE_FAR ${SCALE_FAR}`);
  assert.ok(Math.abs(sNear - SCALE_NEAR) < 0.01, `带底行缩放 ${sNear} 应贴近 SCALE_NEAR ${SCALE_NEAR}`);
});

test('远排 < 1 < 近排（同一镜头下横跨整屏）', () => {
  const camX = 35;
  const far = projectUnit(camX - ROWS_NEAR - 1.5, 6, camX).scale;
  const near = projectUnit(camX + ROWS_NEAR - 0.5, 6, camX).scale;
  assert.ok(far < 1, `远排 scale ${far} 应 < 1`);
  assert.ok(near > 1, `近排 scale ${near} 应 > 1`);
  // 主将排（近端）÷ 最远排（远端）≈ 84.5/53 = 1.59，这就是原作「远小近大」的量
  assert.ok(Math.abs(SCALE_NEAR / SCALE_FAR - PITCH_NEAR_PX / PITCH_FAR_PX) < 0.005);
});

// ---------------------------------------------------------------------------
// 2) 单调性 + 中点锚定
// ---------------------------------------------------------------------------

test('屏幕 y 是行号的严格单调函数（远上近下，绝不回头）', () => {
  for (const camX of CAMS) {
    const info = projectionInfo(camX);
    // 只验真正会上屏的那几行（再远的行会被 drawActors 剔掉，格距小到几十 px 属正常）
    const lo = Math.max(0, Math.floor(info.farRow) - 1);
    const hi = Math.min(GRID_W - 1, Math.ceil(info.nearRow) + 1);
    let prev = -Infinity;
    for (let gx = lo; gx <= hi; gx += 1) {
      const y = projectUnit(gx, 6, camX).sy;
      assert.ok(y > prev, `camX=${camX}: 行 ${gx} 的 y=${y} 没有比上一行 ${prev} 更靠下`);
      // 带内相邻两行至少隔开 40px（远排 53、近排 84.5），别挤成一条线
      if (Number.isFinite(prev)) assert.ok(y - prev > 40, `camX=${camX}: 行 ${gx} 与上一行只差 ${y - prev}px`);
      prev = y;
    }
  }
});

test('中线不动：镜头所在那一行恒在 FIELD_CENTER_Y，横向中心恒在 375', () => {
  for (const camX of CAMS) {
    const p = projectUnit(camX, 6.5, camX);
    assert.ok(Math.abs(p.sy - FIELD_CENTER_Y) < 1e-9, `camX=${camX}: 镜头行 y=${p.sy} ≠ ${FIELD_CENTER_Y}`);
    assert.ok(Math.abs(p.sx - DESIGN_W / 2) < 1e-9, `camX=${camX}: 中央车道 x=${p.sx} ≠ 375`);
    assert.ok(Math.abs(p.scale - SCALE_CENTER) < 1e-9, `camX=${camX}: 镜头行 scale=${p.scale} ≠ ${SCALE_CENTER}`);
    assert.equal(projectionInfo(camX).rows, ROWS_VISIBLE);
  }
});

test('横向：车道 x 关于 375 对称，列宽随该行 scale 等比缩放', () => {
  const camX = 30;
  for (const r of [-6, -2, 0, 3, 5]) {
    const left = projectUnit(camX + r, 0, camX).sx;
    const right = projectUnit(camX + r, GRID_H - 1, camX).sx;
    assert.ok(Math.abs(left - DESIGN_W / 2 - (DESIGN_W / 2 - right)) < 1e-9, `行 r=${r} 的左右不对称`);
    // 列宽严格 ∝ 该行 scale
    assert.ok(Math.abs(lanePitch(r) / (LANE_PX * LANE_SQUEEZE) - rowScale(r)) < 1e-12, `lanePitch(r=${r}) 没跟 scale 走`);
    assert.ok(Math.abs(rowPitch(r) / ROW_PX - rowScale(r)) < 1e-12, `rowPitch(r=${r}) 没跟 scale 走`);
  }
  // 近排比远排宽：这才是「远处那排小」的横向体现
  assert.ok(lanePitch(5) > lanePitch(-6));
  assert.ok(rowPitch(5) > rowPitch(-6));
});

test('rowScreenY / rowOfScreenY 互为反函数（反解没有近似）', () => {
  for (let r = -9; r <= 9; r += 0.5) {
    const y = rowScreenY(r);
    assert.ok(Math.abs(rowOfScreenY(y) - r) < 1e-9, `r=${r} 反解出 ${rowOfScreenY(y)}`);
  }
});

// ---------------------------------------------------------------------------
// 3) 同源：绘制用的 projectUnit 与命中的 screenToUnit 是一条曲线
// ---------------------------------------------------------------------------

test('round-trip：screenToUnit(projectUnit(gx,gy,camX)) 回到原格（14 车道 × 可见行）', () => {
  for (const camX of [0, 20.5, 35, 63.7]) {
    const info = projectionInfo(camX);
    for (let gx = Math.max(0, Math.floor(info.farRow)); gx <= Math.min(GRID_W - 1, Math.ceil(info.nearRow)); gx += 1) {
      for (let gy = 0; gy < GRID_H; gy += 1) {
        const p = projectUnit(gx, gy, camX);
        if (p.sy < FIELD_TOP || p.sy > FIELD_BOTTOM) continue;
        const hit = screenToUnit(p.sx, p.sy, camX);
        assert.ok(hit, `camX=${camX} 格 (${gx},${gy}) 落屏后反解为 null`);
        assert.equal(hit.gx, gx, `camX=${camX} 格 (${gx},${gy}) 的 gx 反解成 ${hit.gx}`);
        assert.equal(hit.gy, gy, `camX=${camX} 格 (${gx},${gy}) 的 gy 反解成 ${hit.gy}`);
        assert.ok(Math.abs(hit.scale - p.scale) < 1e-9, '命中的 scale 必须与绘制一致');
      }
    }
  }
});

test('screenToUnit 在战场带外返回 null（与 R193 前的 screenToCell 语义一致）', () => {
  for (const [sx, sy] of [
    [-0.1, 550],
    [DESIGN_W + 0.1, 550],
    [375, FIELD_TOP - 0.1],
    [375, FIELD_BOTTOM + 0.1],
  ] as const) {
    assert.equal(screenToUnit(sx, sy, 35), null, `(${sx},${sy}) 应在战场带外`);
  }
  assert.ok(screenToUnit(375, FIELD_TOP, 35), '带顶那一行本身要算带内');
  assert.ok(screenToUnit(375, FIELD_BOTTOM, 35), '带底那一行本身要算带内');
});

test('hitTest 与 buildFrame 同源：点格中心一定命中同一格', () => {
  const w = engaged();
  const camX = camera(w);
  const info = projectionInfo(camX);
  for (let gx = Math.max(0, Math.ceil(info.farRow)); gx <= Math.min(GRID_W - 1, Math.floor(info.nearRow)); gx += 2) {
    for (let gy = 0; gy < GRID_H; gy += 3) {
      const p = projectUnit(gx, gy, camX);
      const hit = hitTest(w, { camX }, p.sx, p.sy);
      assert.ok(hit && hit.type === 'field', `格 (${gx},${gy}) 的格中心点不出战场`);
      if (!hit || hit.type !== 'field') continue;
      assert.equal(hit.gx, gx, `格 (${gx},${gy}) 点成 (${hit.gx},${hit.gy})`);
      assert.equal(hit.gy, gy, `格 (${gx},${gy}) 点成 (${hit.gx},${hit.gy})`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4) 可见性：行数在 8..14，71 列 × 14 车道都不裁边
// ---------------------------------------------------------------------------

test('可见行数落在 8..14，且 = 900px ÷ 对数平均格距', () => {
  assert.ok(ROWS_VISIBLE >= ROWS_MIN && ROWS_VISIBLE <= ROWS_MAX, `可见 ${ROWS_VISIBLE} 行，越出 [${ROWS_MIN},${ROWS_MAX}]`);
  for (const camX of CAMS) {
    const info = projectionInfo(camX);
    assert.equal(info.rows, ROWS_VISIBLE);
    assert.ok(Math.abs(info.farRows + info.nearRows - ROWS_VISIBLE) < 1e-9);
    assert.ok(info.rowsInt >= 12 && info.rowsInt <= ROWS_MAX + 1, `整数行 ${info.rowsInt} 反常`);
    // 两端加起来的屏幕高度必须正好是一整块战场带（不许漏出 FIELD_TOP/BOTTOM）
    assert.ok(Math.abs(rowScreenY(info.nearRows) - FIELD_BOTTOM) < 1e-6);
    assert.ok(Math.abs(rowScreenY(-info.farRows) - FIELD_TOP) < 1e-6);
  }
});

test('71 列全部能被看到：镜头跟着它时就在带中央，扫一遍镜头每列都进得来', () => {
  const seen = new Set<number>();
  for (let camX = 0; camX <= GRID_W - 1; camX += 0.5) {
    const info = projectionInfo(camX);
    for (let gx = Math.max(0, Math.ceil(info.farRow)); gx <= Math.min(GRID_W - 1, Math.floor(info.nearRow)); gx += 1) {
      if (projectUnit(gx, 6, camX).sy >= FIELD_TOP && projectUnit(gx, 6, camX).sy <= FIELD_BOTTOM) seen.add(gx);
    }
  }
  for (let gx = 0; gx <= GRID_W - 1; gx += 1) assert.ok(seen.has(gx), `第 ${gx} 列从来没进过画面`);
  // 镜头正好压在某列上时，该列在正中央（不会被 HUD / 控制台挡住半格）
  for (const gx of [0, 17, 35, 70]) {
    assert.ok(Math.abs(projectUnit(gx, 6, gx).sy - FIELD_CENTER_Y) < 1e-9);
  }
});

test('14 条车道在任意深度都完整可见（最近一排恰好铺满 750）', () => {
  for (const r of [-ROWS_VISIBLE, -5, -2, 0, 3, ROWS_NEAR]) {
    const left = rowEdgeX(r, -1);
    const right = rowEdgeX(r, 1);
    // 边界正好落在 0 / 750 上时允许 1e-9 的浮点误差（最近一排就是正好铺满）
    assert.ok(left >= -1e-9, `r=${r} 的左边界 ${left} 出画`);
    assert.ok(right <= DESIGN_W + 1e-9, `r=${r} 的右边界 ${right} 出画`);
    // 车道 0..13 的格子都在边界内
    assert.ok(projectUnit(0 + r, 0, 0).sx >= left - 1e-9);
    assert.ok(projectUnit(r, GRID_H - 1, 0).sx <= right + 1e-9);
  }
  // 最近一排的战场宽度（含最外两条半格）= 14 条车道 × 该行车距，正好铺满 750
  const widest = rowEdgeX(ROWS_NEAR, 1) - rowEdgeX(ROWS_NEAR, -1);
  assert.ok(Math.abs(widest - DESIGN_W) < 1e-6, `最近一排跨度 ${widest} 应正好 750`);
  // projectionInfo 报出来的 widestSpan 必须是同一个数（否则调用方读到的跨度和实际画的边不一致）
  assert.ok(Math.abs(projectionInfo(35).widestSpan - DESIGN_W) < 1e-6);
});

test('projectCell 的矩形 = 该行车距 × 该行格距（随 scale 变）', () => {
  const camX = 35;
  const far = projectCell(camX - 5, 6, camX);
  const near = projectCell(camX + 4, 6, camX);
  assert.ok(Math.abs(far.w - lanePitch(-5)) < 1e-9 && Math.abs(far.h - rowPitch(-5)) < 1e-9);
  assert.ok(near.w > far.w && near.h > far.h, '近排的格子必须比远排大');
  assert.ok(Math.abs(projectCell(camX, 6.5, camX).sx - DESIGN_W / 2) < 1e-9, '中央车道的格子 x 仍在 375');
});

// ---------------------------------------------------------------------------
// 5) 脚底锚点：sprite 的底边（drawImage 的 dy + dh）不许离开地面线
// ---------------------------------------------------------------------------

test('脚底锚点不悬空：sprite 的 dy+dh == projectUnit().sy + 26·scale', () => {
  const units = realUnits();
  const w = engaged();
  const camX = camera(w);
  // 允许的地面线：场上每个单位（含主将）按自己的行算出来的脚底线
  const grounds: number[] = [];
  for (const u of w.units) {
    const p = projectUnit(u.x, u.y, camX);
    grounds.push(p.sy + ACTION_FOOT_Y * p.scale);
  }
  const cmds = buildFrame(w, { units, camX }).filter((c) => c.kind === 'sprite') as unknown as {
    x: number;
    y: number;
    w: number;
    h: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  }[];
  assert.ok(cmds.length > 0, '一场接触中的仗应该有 sprite');
  let minGap = Infinity;
  for (const c of cmds) {
    // execute() 是 drawImage(img, sx, sy, sw, sh, x − w/2, y − h, w, h)
    const dy = c.y - c.h;
    const dh = c.h;
    const bottom = dy + dh;
    const gap = Math.min(...grounds.map((g) => Math.abs(bottom - g)));
    minGap = Math.min(minGap, gap);
    assert.ok(gap < 0.51, `sprite 底边 ${bottom} 不在任何单位的地面线上（最近差 ${gap}px）→ 悬空/插地`);
    // 画面高宽比必须还是帧的高宽比（只缩放、不拉伸）
    assert.ok(Math.abs(c.h / c.w - c.sh / c.sw) < 1e-9, 'sprite 被拉伸了');
  }
  assert.ok(minGap < 0.51);
});

test('远排的 sprite 真的更小、近排更大（同屏内有大小区分）', () => {
  const units = realUnits();
  const w = engaged();
  const camX = camera(w);
  const widths = buildFrame(w, { units, camX })
    .filter((c) => c.kind === 'sprite')
    .map((c) => (c as unknown as { w: number }).w);
  const lo = Math.min(...widths);
  const hi = Math.max(...widths);
  assert.ok(hi - lo > 8, `同屏 sprite 宽度跨度只有 ${hi - lo}px，透视没生效（远 ${lo} / 近 ${hi}）`);
  assert.ok(lo >= 0 && hi < 120, `sprite 宽度 ${lo}..${hi} 越界`);
});
