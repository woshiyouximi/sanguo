// 只读取证探针 2：量化「兵与兵 / 兵与将叠在一起」。
//   ① 车道节距随行的变化（屏幕 px）
//   ② 抖动后「偏离车道中心」的真实分布（换算成屏幕 px）
//   ③ 躯干级重叠：|Δsx|<20 且 |Δsy|<30 的对数（同侧/异侧分开）
//   ④ 完全叠死：|Δsx|<10 且 |Δsy|<12 的对数，并检查双方是否正在 slide（换道穿透）
// 跑法： node F:\sanguo\work\anim_fix\probe_sep.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const proj = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { projectUnit, lanePitch, rowPitch, rowScale } = proj;
const field = await import(pathToFileURL(path.join(GAME, 'src/core/field.ts')).href);

const LANE_PX = field.LANE_PX;
const SQ = lanePitch(0) / (LANE_PX * rowScale(0));
console.log('LANE_PX=%s  LANE_SQUEEZE=%s', LANE_PX.toFixed(3), SQ.toFixed(4));
for (const r of [-6, -4, -2, 0, 2, 4, 6]) {
  console.log('  r=%+d  rowScale=%.3f  lanePitch=%.2fpx  rowPitch=%.2fpx  lanePx/rowScale=%.2f',
    r, rowScale(r), lanePitch(r), rowPitch(r), lanePitch(r) / rowScale(r));
}

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data, seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const TICKS = 900, SAMPLE = 3;   // 每 3 tick 采样一次（900 tick 的 1/3），省时间
const latDevs = [];              // 车道中心偏移（格）→ 后面按屏幕 px 统计
const depthDevs = [];
const sameLaneGaps = [];         // 同车道纵深远近相邻两兵的屏幕竖直间隙（px）
let bodyPairs = 0, bodyPairsCross = 0, samples = 0;
let stacked = 0, stackedCross = 0, stackedGen = 0;
const stackSamples = [];
let minDist = 1e9, minRec = null;
const perTick = [];

for (let t = 0; t < TICKS; t += 1) {
  step(world);
  if (t % SAMPLE !== 0) continue;
  const camX = camera(world).x ?? camera(world);
  const pts = [];
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = projectUnit(u.x, u.y, camX);
    pts.push({ u, sx: p.sx, sy: p.sy, sc: p.scale });
    latDevs.push(u.y - Math.round(u.y * 2) / 2);   // 相对最近半格（阵型半格排布）的偏移
    depthDevs.push(u.x - Math.round(u.x * 2) / 2); // 同上：阵型沿纵深也是半格排布
  }
  samples += 1;
  let tp = 0, tpc = 0, ts = 0, tsc = 0;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const A = pts[i], B = pts[j];
      const dx = Math.abs(A.sx - B.sx), dy = Math.abs(A.sy - B.sy);
      const d = Math.hypot(dx, dy);
      if (d < minDist) { minDist = d; minRec = { tick: world.tick, a: [A.u.side, A.u.x.toFixed(2), A.u.y.toFixed(2), !!A.u.slide], b: [B.u.side, B.u.x.toFixed(2), B.u.y.toFixed(2), !!B.u.slide] }; }
      const cross = A.u.side !== B.u.side;
      // 同车道、纵深远近相邻（阵型排队）：看竖直间隙够不够，够不上就是「前面那个站在后面那个身上」
      if (Math.abs(A.u.y - B.u.y) < 0.6 && Math.abs(A.u.x - B.u.x) < 1.6 && Math.abs(A.u.x - B.u.x) > 0.2) {
        sameLaneGaps.push(dy);
      }
      if (dx < 20 && dy < 30) { tp += 1; if (cross) tpc += 1; }
      if (dx < 10 && dy < 12) {
        ts += 1; if (cross) tsc += 1;
        if (A.u.isGeneral || B.u.isGeneral) stackedGen += 1;
        if (stackSamples.length < 24) {
          stackSamples.push({
            tick: world.tick, cross,
            a: { side: A.u.side, gen: !!A.u.isGeneral, x: +A.u.x.toFixed(3), y: +A.u.y.toFixed(3), slide: !!A.u.slide, sx: +A.sx.toFixed(1), sy: +A.sy.toFixed(1) },
            b: { side: B.u.side, gen: !!B.u.isGeneral, x: +B.u.x.toFixed(3), y: +B.u.y.toFixed(3), slide: !!B.u.slide, sx: +B.sx.toFixed(1), sy: +B.sy.toFixed(1) },
            d: +d.toFixed(1),
          });
        }
      }
    }
  }
  bodyPairs += tp; bodyPairsCross += tpc; stacked += ts; stackedCross += tsc;
  perTick.push({ tick: world.tick, n: pts.length, body: tp, stacked: ts });
}

const stat = (arr) => {
  const s = arr.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { n: s.length, min: +s[0]?.toFixed(3), p05: +q(0.05)?.toFixed(3), p50: +q(0.5)?.toFixed(3), p95: +q(0.95)?.toFixed(3), max: +s[s.length - 1]?.toFixed(3), mean: +mean.toFixed(3) };
};
const latPx = latDevs.map((d) => Math.abs(d) * lanePitch(0));
const depthPx = depthDevs.map((d) => Math.abs(d) * rowPitch(0));

const out = {
  lane_squeeze: +SQ.toFixed(4),
  lanePitch: { r0: +lanePitch(0).toFixed(2), far: +lanePitch(-6).toFixed(2), near: +lanePitch(6).toFixed(2) },
  rowPitch: { r0: +rowPitch(0).toFixed(2) },
  ticks: TICKS, samples,
  lateral_dev_grid: stat(latDevs),
  lateral_dev_screen_px: stat(latPx),
  depth_dev_grid: stat(depthDevs),
  depth_dev_screen_px: stat(depthPx),
  same_lane_vertical_gap_px: stat(sameLaneGaps),
  body_pairs_total: bodyPairs, body_pairs_cross: bodyPairsCross,
  body_pairs_per_sample: +(bodyPairs / samples).toFixed(2),
  body_pairs_cross_per_sample: +(bodyPairsCross / samples).toFixed(2),
  stacked_total: stacked, stacked_cross: stackedCross, stacked_gen: stackedGen,
  stacked_per_sample: +(stacked / samples).toFixed(3),
  min_screen_dist_px: +minDist.toFixed(2), min_rec: minRec,
  stackSamples,
  perTickWorst: perTick.slice().sort((a, b) => b.stacked - a.stacked).slice(0, 5),
};
fs.writeFileSync(path.join(HERE, 'probe_sep.json'), JSON.stringify(out, null, 1), 'utf8');
console.log(JSON.stringify({ ...out, stackSamples: out.stackSamples.slice(0, 6) }, null, 1));
