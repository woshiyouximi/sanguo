// R158 报告用数字：抽样分布 / 每行动 tick 位移分布 / 首接触 tick / 单局时长
import { loadData } from '../../game/src/data.ts';
import {
  createWorld,
  mulberry32,
  planDirected,
  sampleStepOffsets,
  step,
  unitCell,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
} from '../../game/src/core/battle.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

// 1) 2000 次 80/10/10 抽样实测
const plan = planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance');
const rng = mulberry32(0x43c2a5);
const cnt = { front: 0, nw: 0, sw: 0, other: 0 };
for (let i = 0; i < 2000; i++) {
  const d = sampleStepOffsets(plan.sx, plan.sy, plan.w1, plan.w2, rng).first[0];
  if (d.dx === -1 && d.dy === 0) cnt.front++;
  else if (d.dx === -1 && d.dy === -1) cnt.nw++;
  else if (d.dx === -1 && d.dy === 1) cnt.sw++;
  else cnt.other++;
}
console.log('cone 2000:', JSON.stringify(cnt), 'pct:', (cnt.front / 20).toFixed(2), (cnt.nw / 20).toFixed(2), (cnt.sw / 20).toFixed(2));

// 2) 100v100：每个"行动 tick"（发生过抽格的单位帧）的位移分布 + 首接触
function fresh(seed, soldiers) {
  return createWorld({ data, seed, a: { soldiers, troop: 2 }, b: { soldiers, troop: 10 } });
}

const w = fresh(7, 100);
const prev = new Map();
for (const u of w.units) prev.set(u, unitCell(u));
let acts = 0;
let zero = 0;
let one = 0;
let two = 0;
let maxStep = 0;
let firstHit = -1;
for (let t = 0; t < 900; t++) {
  step(w);
  if (firstHit < 0 && (w.stats.attacksA + w.stats.attacksB) > 0) firstHit = w.tick;
  for (const u of w.units) {
    if (!u.alive) continue;
    const c = unitCell(u);
    const p = prev.get(u) ?? c;
    const d = Math.max(Math.abs(c.gx - p.gx), Math.abs(c.gy - p.gy));
    if (d > 0) {
      acts++;
      if (d === 1) one++;
      else if (d === 2) two++;
      else maxStep = Math.max(maxStep, d);
    }
    prev.set(u, c);
  }
  // 被"抽中但位移 0"的帧难以直接观测（原地/被占）；用 cd 归零的帧数近似另算
  if (w.over) break;
}
console.log('100v100: firstContact=', firstHit, 'attackMoves=', acts, 'd1=', one, 'd2=', two, 'maxStep=', maxStep);

// 3) 六个种子单局时长（battle.test.ts 同配置：a.troop=2 vs b.troop=10, 100 兵）
for (const seed of [7, 1, 2, 3, 4, 5]) {
  const b = fresh(seed, 100);
  let guard = 0;
  while (!b.over && guard++ < 20000) step(b);
  console.log('seed', seed, 'tick', b.tick, 'sec', (b.tick / 30).toFixed(1), 'reason', b.endReason, 'winner', b.winner);
}

// 4) 60v60 时长
for (const seed of [11, 12]) {
  const b = fresh(seed, 60);
  let guard = 0;
  while (!b.over && guard++ < 20000) step(b);
  console.log('60v60 seed', seed, 'tick', b.tick, 'sec', (b.tick / 30).toFixed(1), 'attacks', b.stats.attacksA + b.stats.attacksB, 'hits', b.stats.hitsA + b.stats.hitsB, 'kills', b.stats.killsA + b.stats.killsB);
}
