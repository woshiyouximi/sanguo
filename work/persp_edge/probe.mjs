// 只读探针：把 persp_edge 测试与报告要用的实测数字打出来（不改任何源文件）
import {
  CAM_FAR_SY, CAM_MAX, CAM_MIN, CAM_NEAR_SY, CAM_HALF_ROWS,
  FIELD_BOTTOM, FIELD_TOP, GRID_W, ROW_PX, ROWS_FAR, ROWS_NEAR, ROWS_VISIBLE,
  SCALE_FAR, SCALE_NEAR, SCALE_CENTER, ROW_K, clampCameraX, rowOfScreenY, rowScale, rowScreenY,
} from '../../game/src/core/field.ts';
import { projectUnit, projectionInfo, screenToUnit } from '../../game/src/view/projection.ts';
import { ACTION_FOOT_Y } from '../../game/src/view/animSelect.ts';

const f = (n, d = 4) => Number(n).toFixed(d);
console.log('--- 常量 ---');
console.log('ROW_PX', f(ROW_PX), 'SCALE_CENTER', f(SCALE_CENTER), 'ROW_K', f(ROW_K, 6));
console.log('ROWS_FAR', f(ROWS_FAR), 'ROWS_NEAR', f(ROWS_NEAR), 'ROWS_VISIBLE', f(ROWS_VISIBLE));
console.log('CAM_FAR_SY', f(CAM_FAR_SY), 'CAM_NEAR_SY', f(CAM_NEAR_SY));
console.log('CAM_MIN', f(CAM_MIN), 'CAM_MAX', f(CAM_MAX), 'CAM_HALF_ROWS', f(CAM_HALF_ROWS));
console.log('ACTION_FOOT_Y', ACTION_FOOT_Y);
console.log('旧夹取端点 6.3 /', f(GRID_W - 1 - 450 / ROW_PX), '（= GRID_W-1-6.3）');

console.log('\n--- 五个 camX ---');
for (const camX of [6.3, 20, 35.5, 50, 63.7]) {
  const info = projectionInfo(camX);
  const first = Math.max(0, Math.ceil(info.farRow - 1e-9));
  const last = Math.min(GRID_W - 1, Math.floor(info.nearRow + 1e-9));
  const rows = [];
  for (let gx = first; gx <= last; gx += 1) rows.push(gx);
  const syFirst = projectUnit(first, 6, camX).sy;
  const syLast = projectUnit(last, 6, camX).sy;
  const sLast = projectUnit(last, 6, camX).scale;
  const footLast = syLast + ACTION_FOOT_Y * sLast;
  console.log(
    `camX=${camX}: farRow=${f(info.farRow, 3)} nearRow=${f(info.nearRow, 3)} rows=${f(info.rows, 3)} rowsInt=${info.rowsInt}` +
    ` 整数行 ${first}..${last} (${rows.length} 行)` +
    ` syFirst=${f(syFirst, 2)} syLast=${f(syLast, 2)} scaleLast=${f(sLast, 4)} 脚底=${f(footLast, 2)}`,
  );
}

console.log('\n--- 端点细节 ---');
const lastRow = GRID_W - 1;
const syAtCamMax = projectUnit(lastRow, 6, CAM_MAX).sy;
const sAtCamMax = projectUnit(lastRow, 6, CAM_MAX).scale;
const syAt637 = projectUnit(lastRow, 6, 63.7).sy;
const sAt637 = projectUnit(lastRow, 6, 63.7).scale;
console.log(`CAM_MAX=${f(CAM_MAX, 6)}: row70 sy=${f(syAtCamMax, 3)} scale=${f(sAtCamMax, 4)} 脚底=${f(syAtCamMax + ACTION_FOOT_Y * sAtCamMax, 3)}`);
console.log(`camX=63.7: row70 sy=${f(syAt637, 3)} scale=${f(sAt637, 4)} 脚底=${f(syAt637 + ACTION_FOOT_Y * sAt637, 3)} 超出带底=${f(syAt637 - FIELD_BOTTOM, 3)}`);
const syAtCamMin = projectUnit(0, 6, CAM_MIN).sy;
const sAtCamMin = projectUnit(0, 6, CAM_MIN).scale;
const headOffset = (106 - 19.3) * sAtCamMin;
console.log(`CAM_MIN=${f(CAM_MIN, 6)}: row0 sy=${f(syAtCamMin, 3)} scale=${f(sAtCamMin, 4)} 头顶(−${f(headOffset, 2)})=${f(syAtCamMin - headOffset, 3)}`);
console.log(`camX=6.3: row0 sy=${f(projectUnit(0, 6, 6.3).sy, 3)}`);
console.log('r(70)@63.7 =', f(lastRow - 63.7, 3), ' > ROWS_NEAR ?', lastRow - 63.7 > ROWS_NEAR);
console.log('r(70)@CAM_MAX =', f(lastRow - CAM_MAX, 3), ' < ROWS_NEAR ?', lastRow - CAM_MAX < ROWS_NEAR);

console.log('\n--- 夹取 ---');
for (const v of [-5, 0, 3, CAM_MIN, 6.3, 63.7, CAM_MAX, 70, 99]) console.log(`clamp(${f(v, 3)}) = ${f(clampCameraX(v), 6)}`);

console.log('\n--- 反解往返（screenToUnit → projectUnit）---');
let worst = 0;
for (const camX of [6.3, 20, 35.5, 50, 63.7]) {
  for (let sy = FIELD_TOP + 3; sy < FIELD_BOTTOM; sy += 37.7) {
    for (let sx = 5; sx < 750; sx += 61.3) {
      const h = screenToUnit(sx, sy, camX);
      if (!h) continue;
      // 用未取整的 worldX / worldY 回投影
      const p = projectUnit(h.worldX, h.worldY, camX);
      worst = Math.max(worst, Math.hypot(p.sx - sx, p.sy - sy));
    }
  }
}
console.log('浮点格往返最大误差 px =', worst);
console.log('rowScreenY(ROWS_NEAR) - FIELD_BOTTOM =', rowScreenY(ROWS_NEAR) - FIELD_BOTTOM);
console.log('rowScreenY(-ROWS_FAR) - FIELD_TOP =', rowScreenY(-ROWS_FAR) - FIELD_TOP);
console.log('rowOfScreenY(968) =', rowOfScreenY(968), ' rowOfScreenY(162) =', rowOfScreenY(162));
