// camera 子智能体：战场几何参数扫描（不改生产代码，复刻 core/field.ts 的同一套公式）
//   node work/flow_camera/scan_geo.mjs
//
// 结论要点（脚本输出会打印，报告里引用）：
//   · 一屏行数只由 FIELD_H 与「每格格距标定 (53..84.5px)」的乘积决定，
//     与 ROW_PX / SCALE 无关 —— 因为 sNear/sFar = 84.5/53 是常数、sNear−sFar = 31.5/ROW_PX，
//     代入 rowsForScales 后 ROW_PX 被约掉：rows = FIELD_H·ln(84.5/53)/31.5 = 13.32。
//   · 想改行数只有一条路：把整条纵向投影放大 z 倍（= 镜头拉近），rows = 13.32 / z。
//   · 横向 14 条车道由 LANE_SQUEEZE 自适应铺满 750px，不受 z 影响（始终 14/14 车道满屏）。
import * as F from '../../game/src/core/field.ts';

const FIELD_TOP = 100;
const FIELD_BOTTOM = 1000;
const CEN = 550;

/** 缩放 z 之后的纵向投影（z=1 与 field.ts 逐位一致） */
function model(z) {
  const pFar = 53 * z;
  const pNear = 84.5 * z;
  const sFar = pFar / F.ROW_PX;
  const sNear = pNear / F.ROW_PX;
  const s0 = (sFar + sNear) / 2;
  const k = (F.ROW_PX * (s0 - sFar)) / 450;
  const sy = (r) => CEN + (F.ROW_PX * s0 * Math.expm1(k * r)) / k;
  const rOf = (y) => Math.log1p(((y - CEN) * k) / (F.ROW_PX * s0)) / k;
  const far = -rOf(FIELD_TOP);
  const near = rOf(FIELD_BOTTOM);
  const rows = (900 * Math.log(sNear / sFar)) / (F.ROW_PX * (sNear - sFar));
  return { z, pFar, pNear, sFar, sNear, s0, k, sy, far, near, rows, scaleAt: (r) => s0 * Math.exp(k * r) };
}

// ---------- 开局阵容（work/battle_flow/probe_layout.mjs 实测 + CDP 复核） ----------
const OPEN = {
  A: { front: 51, rear: 61, gen: 58, gy: 6, n: 101 },   // 我方（高位 x 大），guan yu / 方形 / 100 兵
  B: { front: 24, rear: 10, gen: 13, gy: 6, n: 101 },   // 敌方（低位 x 小），zhang jiao / 雁形
};
const CONTACT = { A: { ...OPEN.A, front: 50 }, B: { front: 50, rear: 36, gen: 39 } }; // 敌军推到接战

/** 四种镜头锚点策略 */
const CAM = {
  'S0 现状：我方前锋 − 2.6 行': (m, s) => s.A.front - 2.6,
  'S1 主将居中': (m, s) => s.A.gen,
  'S2 主将 − 2 行': (m, s) => s.A.gen - 2,
  'S3 全阵居中（主将与前锋都在屏内的中点）': (m, s) =>
    (s.A.gen - m.near + s.A.front + m.far) / 2,
};

const fx = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : String(v));

function evalState(m, cam, s) {
  const at = (gx) => {
    const r = gx - cam;
    const y = m.sy(r);
    return { r, y, in: y >= FIELD_TOP && y <= FIELD_BOTTOM };
  };
  return {
    cam: +fx(cam),
    win: [+fx(cam - m.far), +fx(cam + m.near)],
    A_gen: at(s.A.gen), A_front: at(s.A.front), A_rear: at(s.A.rear),
    B_gen: at(s.B.gen), B_front: at(s.B.front),
    gap: Math.abs(s.A.gen - s.B.gen),
    same: Math.abs(s.A.gen - s.B.gen) <= m.rows,
  };
}

const mark = (o) => `${fx(o.y, 0)}px${o.in ? '✓' : '✗'}(r=${fx(o.r, 1)})`;

console.log('=== 0. 生产常数复核（z=1）===');
const m1 = model(1);
console.log(`ROWS_FAR=${fx(m1.far, 3)} ROWS_NEAR=${fx(m1.near, 3)} ROWS_VISIBLE=${fx(m1.rows, 3)}`
  + `（field.ts 导出 ${fx(F.ROWS_FAR, 3)} / ${fx(F.ROWS_NEAR, 3)} / ${fx(F.ROWS_VISIBLE, 3)}）`);
console.log(`CAM_HALF_ROWS=${fx(F.CAM_HALF_ROWS, 3)}  = 900/2/71.429（换镜判据，不是夹取）`);
console.log(`一屏纵向占战场纵深 = ${fx(100 * m1.rows / 71, 1)}% ; 横向 14/14 车道 = 100%`);
const pxPerRowMid = F.ROW_PX * m1.scaleAt(0);
console.log(`中心行每行 ${fx(pxPerRowMid, 1)} 设计px = ${fx(pxPerRowMid * 0.9267, 1)} 设备px（876×1368 页、canvas 695×1236 实测缩放 0.9267）`);
console.log(`整屏 1368px 高 ⇒ 战场带只占 ${fx(900 / 1334 * 100, 1)}% 画布高，其余为 HUD/边框`);
console.log(`\n【判据】两将同屏 ⇔ |Δx| ≤ ROWS_VISIBLE = ${fx(m1.rows, 2)} 行 且 |Δy| ≤ GRID_H = 14 车道`);
console.log(`       开局 Δx = |58−13| = 45 行 ⇒ 超限 ${fx(45 / m1.rows, 2)} 倍；Δy = 0 ⇒ 车道维恒真`);

for (const label of ['开局 face-off（朝敌）', '接战后（敌前锋推到 50）']) {
  const st = label.startsWith('开局') ? OPEN : CONTACT;
  console.log(`\n=== 1. ${label} · z=1（现状几何）===`);
  for (const [name, f] of Object.entries(CAM)) {
    const cam = Math.max(F.CAM_MIN, Math.min(F.CAM_MAX, f(m1, st)));
    const e = evalState(m1, cam, st);
    console.log(`  ${name}
    cam=${e.cam} 窗口=[${e.win[0]}, ${e.win[1]}]
    我将 ${mark(e.A_gen)} | 我前锋 ${mark(e.A_front)} | 我后排 ${mark(e.A_rear)}
    敌将 ${mark(e.B_gen)} | 敌前锋 ${mark(e.B_front)}  ⇒ 同屏=${e.same}`);
  }
}

console.log('\n=== 2. 「一屏行数」参数扫描（z = 纵向投影放大倍数）===');
console.log('  z     行/屏   我方将(前锋后 7 行)入画条件       前锋+主将同时入画   敌将(45 行外)入画');
for (const z of [1, 1.15, 1.25, 1.4, 1.666, 2]) {
  const m = model(z);
  // 主将入画：cam ≥ gen − near
  const camNeed = OPEN.A.gen - m.near;
  // 前锋+主将同时入画：gen − near ≤ front + far
  const fitAll = OPEN.A.gen - m.near <= OPEN.A.front + m.far;
  const gapNeed = 45 <= m.rows;
  console.log(`  ${fx(z, 3)}  ${fx(m.rows, 2)}   cam ≥ ${fx(camNeed, 2)}（现状 48.40，差 ${fx(Math.max(0, camNeed - 48.4), 2)} 行）`
    + `   ${fitAll ? '可行' : '不可行'}            ${gapNeed ? '可能' : '不可能'}`);
}

console.log('\n=== 3. 三组候选（镜头 + 投影）在开局/接战的实际取景 ===');
const CAND = [
  { name: 'A 保守：几何不动，镜头钉我主将 + 开局两段喊话运镜', z: 1, cam: (m, s) => s.A.gen },
  { name: 'B 中等：镜头钉我主将，一屏压到 8.0 行（z=1.666，用户下限）', z: 1.666, cam: (m, s) => s.A.gen },
  { name: 'C 激进：一屏 6.67 行（z=2，原作 640×480/96×72 实测）', z: 2, cam: (m, s) => s.A.gen },
];
for (const c of CAND) {
  const m = model(c.z);
  console.log(`\n  ▶ ${c.name}   （行/屏 ${fx(m.rows, 2)}，可视 ${fx(100 * m.rows / 71, 1)}% 纵深）`);
  for (const [tag, st] of [['开局', OPEN], ['接战', CONTACT]]) {
    const cam = Math.max(F.CAM_MIN, Math.min(F.CAM_MAX, c.cam(m, st)));
    const e = evalState(m, cam, st);
    console.log(`    ${tag}: cam=${e.cam} 窗口=[${e.win[0]},${e.win[1]}]`
      + ` 我将 ${mark(e.A_gen)} 我前锋 ${mark(e.A_front)} 我后排 ${mark(e.A_rear)}`
      + ` | 敌将 ${mark(e.B_gen)} 敌前锋 ${mark(e.B_front)} ⇒ 两将同屏=${e.same}`);
  }
  // 屏幕上「我方阵占几行」
  const rowsOfArmy = Math.min(OPEN.A.rear, 48.4 + 99) - OPEN.A.front + 1;
  console.log(`    我方 11 行纵深阵在 ${fx(m.rows, 2)} 行窗口里能露出 ${Math.min(11, m.rows)} 行`
    + ` ⇒ 视野/阵深 = ${fx(m.rows / 11, 2)} 屏`);
}

console.log('\n=== 4. 接战瞬间的镜头跳变（现状 S0 的换镜点）===');
{
  // aMin 固定 51；bMax 从 24 涨到 51，cam 在 aMin-bMax>12.6 时=aMin-2.6，否则 (aMin+bMax)/2
  const rows = [];
  for (let bMax = 24; bMax <= 51; bMax += 1) {
    const cam = 51 - bMax > 2 * F.CAM_HALF_ROWS ? 51 - 2.6 : (51 + bMax) / 2;
    rows.push({ bMax, cam });
  }
  const first = rows.find((r) => r.cam !== 48.4);
  console.log(`  换镜发生在 bMax=${first.bMax}（敌前锋推进到第 ${first.bMax} 行），cam 从 48.40 跳到 ${fx(first.cam)}`);
  const last = rows[rows.length - 1];
  console.log(`  接战满员（bMax=51）cam=${fx(last.cam)} ⇒ 我主将 r=${fx(58 - last.cam, 2)}（ROWS_NEAR=5.894 ⇒ ${58 - last.cam <= 5.894 ? '入画' : '仍出画'}）`);
  console.log(`  ⇒ 现状镜头「从跟前锋到跟中点」，两档都只保证前锋，不保证主将`);
}
