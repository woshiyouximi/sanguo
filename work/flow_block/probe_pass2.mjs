/**
 * block 探针 2：规则开关 A/B 对照（最小场景）
 *
 * 同一批最小场景跑两遍：`blockPass=false`（= R189 旧行为，原作只判目标格）与
 * `blockPass=true`（R190 新拦阻）。只为回答一件事：**单位还会不会擦着敌人走过去**。
 *
 * 跑法：node work/flow_block/probe_pass2.mjs
 */
import { createWorld, planDirected, step, unitCell, STEP_W_CONE, STEP_W_CONE_WIDE, STEP_W_STRAIGHT } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

function mk(seed = 7) {
  return createWorld({
    data,
    seed,
    a: { soldiers: 1, troop: 2, formation: 0, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { soldiers: 1, troop: 10, formation: 3, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  });
}
const place = (u, gx, gy, cd = 0) => {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = undefined;
  u.cd = cd;
  return u;
};
const gen = (w, s) => w.units.find((u) => u.isGeneral && u.side === s);
const sold = (w, s) => w.units.find((u) => u.side === s && !u.isGeneral);

/** 场景定义：摆位 + 给 mover 的计划 */
const SCENES = [
  {
    name: '① 主将穿过「两侧都有敌人」的缝（用户反馈①）',
    setup(w) {
      const me = place(gen(w, 'A'), 50, 6);
      place(sold(w, 'B'), 49, 5, 1e9);
      place(gen(w, 'B'), 49, 7, 1e9);
      place(sold(w, 'A'), 1, 13, 1e9);
      return me;
    },
    plan: planDirected(-1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance'),
    probeCell: { gx: 49, gy: 6 },
  },
  {
    name: '② 小兵擦着旁边的敌人前进（用户反馈②）',
    setup(w) {
      const me = place(sold(w, 'A'), 50, 6);
      place(sold(w, 'B'), 49, 5, 1e9);
      place(gen(w, 'B'), 1, 13, 1e9);
      place(gen(w, 'A'), 0, 13, 1e9);
      return me;
    },
    plan: planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance'),
    probeCell: { gx: 49, gy: 6 },
  },
  {
    name: '③ 斜步从敌人拐角抄过去',
    setup(w) {
      const me = place(sold(w, 'A'), 50, 6);
      place(sold(w, 'B'), 49, 6, 1e9);
      place(gen(w, 'B'), 1, 13, 1e9);
      place(gen(w, 'A'), 0, 13, 1e9);
      return me;
    },
    plan: planDirected(-1, 1, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance'),
    probeCell: { gx: 49, gy: 7 },
  },
  {
    name: '④ 敌人正贴在旁边（同 gx、相邻车道）还要沿纵深推进',
    setup(w) {
      const me = place(sold(w, 'A'), 50, 6);
      place(sold(w, 'B'), 50, 5, 1e9);
      place(gen(w, 'B'), 1, 13, 1e9);
      place(gen(w, 'A'), 0, 13, 1e9);
      return me;
    },
    plan: planDirected(-1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance'),
    probeCell: { gx: 49, gy: 6 },
  },
];

const TICKS = 400;
for (const sc of SCENES) {
  const rows = [];
  for (const on of [false, true]) {
    const w = mk(7);
    w.blockPass = on;
    const me = sc.setup(w);
    w.armyStepPlan = (_w, u) => (u === me ? sc.plan : null);
    let hitProbe = false;
    let crossed = false;
    const startGx = unitCell(me).gx;
    for (let t = 0; t < TICKS && !w.over; t++) {
      step(w);
      const c = unitCell(me);
      if (c.gx === sc.probeCell.gx && c.gy === sc.probeCell.gy) hitProbe = true;
      if (c.gx < sc.probeCell.gx) crossed = true; // 越过目标列 = 已经穿过去了
    }
    const c = unitCell(me);
    rows.push({ on, hitProbe, crossed, from: startGx, to: c.gx, gy: c.gy, attacks: w.stats.attacksA });
  }
  console.log(`\n${sc.name}`);
  for (const r of rows) {
    const tag = r.on ? 'blockPass=true ' : 'blockPass=false';
    console.log(
      `  ${tag}  起点gx=${r.from} 终点(${r.to},${r.gy})  踩过目标格=${r.hitProbe ? 'YES' : 'no '}` +
        `  越过目标列=${r.crossed ? 'YES' : 'no '}  我方出手=${r.attacks}`,
    );
  }
}
