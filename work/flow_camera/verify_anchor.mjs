// 附录数值核算：现状镜头 vs 「锚我方主将」镜头，web 透视投影 + Cocos 线性投影两套口径。
// 纯离线，不起浏览器。跑： node work/flow_camera/verify_anchor.mjs
import {
  GRID_W, GRID_H, ROW_PX, LANE_PX, FIELD_TOP, FIELD_H, FIELD_BOTTOM, FIELD_CENTER_Y,
  ROWS_FAR, ROWS_NEAR, ROWS_VISIBLE, CAM_MIN, CAM_MAX, CAM_HALF_ROWS, clampCameraX, rowScreenY,
} from '../../game/src/core/field.ts';

const R = (v, n = 2) => Number(v.toFixed(n));
const lin = (gx, cam) => FIELD_CENTER_Y + (gx - cam) * ROW_PX;      // core/battle.ts project()
const per = (gx, cam) => rowScreenY(gx - cam);                        // view/projection.ts projectUnit（rowScreenY 自身已含 550）()
const inBand = (sy) => sy >= FIELD_TOP && sy <= FIELD_BOTTOM;
const fmt = (sy) => `${R(sy, 1)}${inBand(sy) ? ' ✓' : ' ✗'}`;

console.log('常 量', { GRID_W, GRID_H, ROW_PX: R(ROW_PX), LANE_PX: R(LANE_PX), ROWS_FAR: R(ROWS_FAR), ROWS_NEAR: R(ROWS_NEAR), ROWS_VISIBLE: R(ROWS_VISIBLE), CAM_MIN: R(CAM_MIN), CAM_MAX: R(CAM_MAX), CAM_HALF_ROWS: R(CAM_HALF_ROWS) });

// ---------- 1. 现状 camera() ----------
const oldCam = (aMin, bMax) => clampCameraX(aMin - bMax > 2 * CAM_HALF_ROWS ? aMin - 2.6 : (aMin + bMax) / 2);

// ---------- 2. 提议 camera()：锚我方主将 ----------
const GEN_BACK = 2.0;    // 主将放在屏幕 ~70% 高（r=+2）
const GEN_MIN_R = -7.0;  // 主将最多出上沿到 r=-7（留 0.434 行余量）
const GEN_MAX_R = 5.0;   // 主将最少留 r=+5（离下沿 0.894 行余量）
function newCam(genA, aMin) {
  let cam = genA - GEN_BACK;                 // 默认：主将在屏幕 70% 高
  cam = Math.min(cam, aMin + ROWS_FAR);      // 守 1：前锋别顶出上沿
  cam = Math.max(cam, genA - GEN_MAX_R);     // 守 2：主将别掉出下沿
  cam = Math.min(cam, genA - GEN_MIN_R);     // 守 3：主将别出上沿
  return clampCameraX(cam);
}
const oldCamFallback = (aMin, aMax) => clampCameraX((aMin + aMax) / 2);

// 场景：默认阵容 100v100（实测 CDP）
// A: 51..61, 将 58 ; B: 10..24, 将 13（开局）→ 前锋 27.76, 将 15.68（t=2.6s）
const scenes = [
  { name: 't0 暂停（实测）', aMin: 51, aMax: 61, genA: 58, bMin: 10, bMax: 24, genB: 13 },
  { name: 't=2.6s 敌前锋推进到 27.76', aMin: 51, aMax: 61, genA: 58, bMin: 13.13, bMax: 27.76, genB: 15.68 },
  { name: '换镜临界 bMax=38.4（现状跳变点）', aMin: 51, aMax: 61, genA: 58, bMin: 24, bMax: 38.4, genB: 26 },
  { name: '满员接战 bMax=50', aMin: 51, aMax: 61, genA: 58, bMin: 35, bMax: 50, genB: 37 },
  { name: '主将已前压 depth=7（genA=52,aMin=45）', aMin: 45, aMax: 55, genA: 52, bMin: 13, bMax: 27, genB: 16 },
  { name: '深阵 depth=13（genA=63,aMin=50）', aMin: 50, aMax: 60, genA: 63, bMin: 10, bMax: 24, genB: 13 },
  { name: '深阵 depth=15（genA=65,aMin=50，数学无解）', aMin: 50, aMax: 60, genA: 65, bMin: 10, bMax: 24, genB: 13 },
];

console.log('\n=== A. 镜头目标值：现状 vs 提议 ===');
for (const s of scenes) {
  const co = oldCam(s.aMin, s.bMax);
  const cn = newCam(s.genA, s.aMin);
  console.log(`${s.name}\n  现状 cam=${R(co)} (我把 r=${R(s.genA - co)})  提议 cam=${R(cn)} (我把 r=${R(s.genA - cn)}, 我前锋 r=${R(s.aMin - cn)}, 敌将 r=${R(s.genB - cn)})`);
}

console.log('\n=== B. 开局逐目标屏幕 Y（设计 px，带 100..1000）：现状 cam=48.40 ===');
const cam0 = oldCam(51, 24);
console.log(`cam=${R(cam0)}`);
for (const [n, gx] of [['我将 genA', 58], ['我前 51', 51], ['我后 61', 61], ['敌将 genB', 13], ['敌前 24', 24]]) {
  console.log(`  ${n.padEnd(12)} gx=${gx}  r=${String(R(gx - cam0)).padStart(6)}  透视 ${fmt(per(gx, cam0)).padStart(12)}  线性(Cocos) ${fmt(lin(gx, cam0))}`);
}

console.log('\n=== C. 开局逐目标屏幕 Y：提议 cam=56.00 ===');
const cam1 = newCam(58, 51);
console.log(`cam=${R(cam1)}`);
for (const [n, gx] of [['我将 genA', 58], ['我前 51', 51], ['我后 61', 61], ['敌将 genB', 13], ['敌前 24', 24]]) {
  console.log(`  ${n.padEnd(12)} gx=${gx}  r=${String(R(gx - cam1)).padStart(6)}  透视 ${fmt(per(gx, cam1)).padStart(12)}  线性(Cocos) ${fmt(lin(gx, cam1))}`);
}

console.log('\n=== D. 验收断言数值 ===');
console.log(`主将入画下沿条件  camX >= genA - ROWS_NEAR = 58 - ${R(ROWS_NEAR, 3)} = ${R(58 - ROWS_NEAR, 3)}   （现状 48.40，差 ${R(58 - ROWS_NEAR - cam0, 2)} 行）`);
console.log(`前锋入画上沿条件  camX <= aMin + ROWS_FAR = 51 + ${R(ROWS_FAR, 3)} = ${R(51 + ROWS_FAR, 3)}`);
console.log(`敌将入画条件      camX <= genB + ROWS_FAR = 13 + ${R(ROWS_FAR, 3)} = ${R(13 + ROWS_FAR, 3)}   ⇒ 断言 camX > 25 即绝对安全，提议实测 56 有 ${R(56 - 20.434, 1)} 行余量`);
console.log(`提议主将屏幕 y（透视，设计 px）  r=+2 → ${fmt(per(58, cam1))}   设备 px ×0.9267 → ${R(per(58, cam1) * 0.9267, 1)}`);
console.log(`提议主将屏幕 y（线性/Cocos）    r=+2 → ${fmt(lin(58, cam1))}`);
console.log(`提议前锋屏幕 y（透视）          r=-5 → ${fmt(per(51, cam1))}`);
console.log(`提议后排屏幕 y（透视）          r=+5 → ${fmt(per(61, cam1))}`);
console.log(`敌将出下沿距离（透视）          sy=${R(per(13, cam1), 1)}  ⇒ 距下沿 ${R(per(13, cam1) - FIELD_BOTTOM, 0)} px`);

// 一屏行数（两套口径）
console.log(`\n一屏行数：透视 ROWS_VISIBLE=${R(ROWS_VISIBLE, 3)}（远 ${R(ROWS_FAR, 3)} / 近 ${R(ROWS_NEAR, 3)}）；线性 FIELD_H/ROW_PX=${R(FIELD_H / ROW_PX, 3)}`);

// 深度与一屏的可行性边界
const depthMax = ROWS_FAR + ROWS_NEAR - 0; // 13.327
console.log(`主将居中(r=+2)且前锋仍入画的最大阵深 = ROWS_FAR + GEN_BACK = ${R(ROWS_FAR + GEN_BACK, 3)} 行`);
console.log(`主将必须入画时可容忍的最大阵深        = (GEN_MAX_R + ROWS_FAR) = ${R(GEN_MAX_R + ROWS_FAR, 3)} 行`);
console.log(`\n现状 100v100 阵深（aMax-aMin+1）= 11，主将到前锋 7 行 ⇒ 远小于 ${R(ROWS_FAR + GEN_BACK, 2)}，守 1 永不触发`);
console.log(`CAM_MAX 端：genA=70 ⇒ anchor 68 > CAM_MAX(${R(CAM_MAX)}) ⇒ cam=${R(newCam(70, 63))}，主将 r=${R(70 - newCam(70, 63))} 仍在带内`);
