/**
 * work/persp_edge/table.mjs —— 报告要贴的「五个 camX 实测表」，全部取**页面同一份**编译产物
 * game/dist/view/projection.js + game/dist/core/field.js，不另抄常数。
 * 口径：sy = 地面点（脚踩的位置）；frameBottom = sy + ACTION_FOOT_Y*scale（贴图底边，含脚下阴影 padding）；
 *       headTop = frameBottom - TALLEST*scale（场上最高帧 106px 的头顶上界）。
 * 可见行 = 可见窗 [farRow, nearRow] ∩ 网格 [0, GRID_H? 不，行号是 gx 方向 → 0..GRID_W-1] 的整数行。
 */
import {
  FIELD_BOTTOM, FIELD_TOP, GRID_W, ROWS_FAR, ROWS_NEAR, ROWS_VISIBLE,
} from '../../game/dist/core/field.js';
import { ACTION_FOOT_Y } from '../../game/dist/view/animSelect.js';
import { projectionInfo, projectUnit, screenToUnit } from '../../game/dist/view/projection.js';

const TALLEST = 106;
const CAMS = [6.3, 20, 35.5, 50, 63.7];
const f2 = (v) => v.toFixed(2);
const f4 = (v) => v.toFixed(4);

console.log(`FIELD_TOP=${FIELD_TOP} FIELD_BOTTOM=${FIELD_BOTTOM} GRID_W=${GRID_W} ROWS_FAR=${f4(ROWS_FAR)} ROWS_NEAR=${f4(ROWS_NEAR)} ROWS_VISIBLE=${f4(ROWS_VISIBLE)} ACTION_FOOT_Y=${ACTION_FOOT_Y}\n`);
console.log('| camX | 可见窗 farRow..nearRow | 带内整数行 | 行数 | 最远行 sy / 帧底 / 头顶上界 | 最近行 sy / 帧底 | 带内最大屏幕误差 |');
console.log('|---|---|---|---|---|---|---|');
for (const camX of CAMS) {
  const info = projectionInfo(camX);
  const rows = [];
  for (let gx = 0; gx < GRID_W; gx += 1) {
    const p = projectUnit(gx, 6, camX);
    if (p.sy >= FIELD_TOP && p.sy <= FIELD_BOTTOM) rows.push({ gx, sy: p.sy, scale: p.scale });
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  let worst = 0;
  for (const r of rows) {
    const p = projectUnit(r.gx, 6, camX);
    const hit = screenToUnit(p.sx, p.sy, camX);
    if (!hit) { worst = Infinity; continue; }
    const q = projectUnit(hit.gx, hit.gy, camX);
    worst = Math.max(worst, Math.hypot(q.sx - p.sx, q.sy - p.sy));
  }
  const fb = (sy, s) => sy + ACTION_FOOT_Y * s;
  console.log(`| ${camX} | ${f2(info.farRow)}..${f2(info.nearRow)} | ${first.gx}..${last.gx} | ${rows.length} | ${f2(first.sy)} / ${f2(fb(first.sy, first.scale))} / ${f2(fb(first.sy, first.scale) - TALLEST * first.scale)} | ${f2(last.sy)} / ${f2(fb(last.sy, last.scale))} | ${worst === 0 ? '0' : worst.toExponential(2)} |`);
}

console.log('\n== 夹取端点 ==');
for (const camX of [6.287355, 63.7, 64.487665]) {
  const a = projectUnit(0, 0, camX);
  const b = projectUnit(GRID_W - 1, 0, camX);
  console.log(`camX=${camX.toFixed(6)}: gx=0 sy=${f2(a.sy)} scale=${f4(a.scale)} 帧底=${f2(a.sy + ACTION_FOOT_Y * a.scale)} 头顶上界=${f2(a.sy + ACTION_FOOT_Y * a.scale - TALLEST * a.scale)} | gx=${GRID_W - 1} sy=${f2(b.sy)} scale=${f4(b.scale)} 帧底=${f2(b.sy + ACTION_FOOT_Y * b.scale)}`);
}
