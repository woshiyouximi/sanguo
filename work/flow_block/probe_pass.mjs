/**
 * block 探针 1：复现用户报的两种「穿阵」
 *
 *   ① 我方武将前方没有敌方单位占格 → 直接从敌阵里穿过去（敌人分布在相邻车道）
 *   ② 小兵正前方无敌人 → 对旁边（相邻车道）的敌人视而不见，直接走过去
 *
 * 同时扫一场 100v100 全速对局，找三类逻辑异常：
 *   (V1) 结束态两个存活单位同格（lead 已测过，这里复核）
 *   (V2) 单 tick 逻辑格位移 > 1 格（「跳跃」）
 *   (V3) 一个单位单 tick 被推 > 1 次
 *
 * 只读 battle.ts / army_cmd.ts，不改任何源码。
 * 跑法：node work/flow_block/probe_pass.mjs
 */
import {
  GRID_W,
  GRID_H,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
  STEP_W_STRAIGHT,
  createWorld,
  planDirected,
  step,
  unitCell,
} from '../../game/src/core/battle.ts';
import { armyOrderOf, installArmyOrders } from '../../game/src/core/army_cmd.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });

const key = (gx, gy) => gy * GRID_W + gx;

function mk({ aSoldiers = 1, bSoldiers = 1, seed = 7, orders = false } = {}) {
  const w = createWorld({
    data,
    seed,
    a: { soldiers: aSoldiers, troop: 2, formation: 0, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { soldiers: bSoldiers, troop: 10, formation: 3, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  });
  if (orders) installArmyOrders(w);
  return w;
}

function place(u, gx, gy, cd = 0) {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = undefined;
  u.cd = cd;
  return u;
}
const genOf = (w, s) => w.units.find((u) => u.isGeneral && u.side === s);
const soldierOf = (w, s) => w.units.find((u) => u.side === s && !u.isGeneral && u.alive);
const park = (u) => place(u, 0, 13, 1e9);

/** 8 邻格里的敌人（含斜） */
function nearEnemies(w, u) {
  const c = unitCell(u);
  const out = [];
  for (const v of w.units) {
    if (!v.alive || v.side === u.side) continue;
    const t = unitCell(v);
    const d = Math.max(Math.abs(t.gx - c.gx), Math.abs(t.gy - c.gy));
    if (d <= 1) out.push({ side: v.side, isGeneral: !!v.isGeneral, gx: t.gx, gy: t.gy, d });
  }
  return out;
}

function trace(title, w, mover, ticks) {
  const rows = [];
  let prev = unitCell(mover);
  for (let t = 0; t < ticks; t++) {
    const a0 = w.stats.attacksA;
    const b0 = w.stats.attacksB;
    step(w);
    const c = unitCell(mover);
    const moved = c.gx !== prev.gx || c.gy !== prev.gy;
    if (moved || w.stats.attacksA !== a0 || w.stats.attacksB !== b0) {
      rows.push({
        tick: w.tick,
        from: `${prev.gx},${prev.gy}`,
        to: `${c.gx},${c.gy}`,
        d: `${c.gx - prev.gx},${c.gy - prev.gy}`,
        hit: w.stats.attacksA !== a0 || w.stats.attacksB !== b0,
        near: nearEnemies(w, mover).map((e) => `${e.side}${e.isGeneral ? '*' : ''}@${e.gx},${e.gy}`).join(' ') || '-',
      });
    }
    prev = c;
  }
  console.log(`\n=== ${title} ===`);
  for (const r of rows) console.log(JSON.stringify(r));
  return rows;
}

// ── 场景 1：我方武将正前方一格是空的，敌人在相邻车道排成一道墙 ─────────────
{
  const w = mk();
  const me = place(genOf(w, 'A'), 50, 6);
  const foeGen = place(genOf(w, 'B'), 49, 7, 1e9); // 相邻车道，挡在侧后
  const foe = place(soldierOf(w, 'B'), 49, 5, 1e9); // 相邻车道，挡在侧前
  park(soldierOf(w, 'A'));
  w.armyStepPlan = (ww, uu) => (uu === me ? planDirected(-1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance') : null);
  const rows = trace('场景1 我方主将 (50,6) 前进，敌将(49,7)/敌兵(49,5) 分居两侧 — 正前方(49,6)空', w, me, 2000);
  const passed = rows.some((r) => unitCell(me).gx < 49);
  console.log(`# 结论：主将是否越过 x=49 这道「墙」= ${passed}；敌将格 = ${JSON.stringify(unitCell(foeGen))}，敌兵格 = ${JSON.stringify(unitCell(foe))}`);
}

// ── 场景 2：小兵旁边（相邻车道）有敌人，正前方空 ───────────────────────────
{
  const w = mk();
  park(genOf(w, 'A'));
  park(genOf(w, 'B'));
  const me = place(soldierOf(w, 'A'), 50, 6);
  const foe = place(soldierOf(w, 'B'), 49, 5, 1e9); // 斜前 / 之后变成旁边的敌人
  w.armyStepPlan = (ww, uu) => (uu === me ? planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance') : null);
  const rows = trace('场景2 我方小兵 (50,6) 前进，敌兵在 (49,5) 相邻车道', w, me, 2000);
  const c = unitCell(me);
  console.log(`# 结论：小兵终点 ${c.gx},${c.gy}；是否与敌兵同格过/交过手 = ${rows.some((r) => r.hit)}；全程攻击次数 A=${w.stats.attacksA} B=${w.stats.attacksB}`);
}

// ── 场景 3：同排正前方 1 格被敌占（原作 0x43C4C0 第一轮正前被拒后走斜前）─────
{
  const w = mk();
  park(genOf(w, 'A'));
  park(genOf(w, 'B'));
  const me = place(soldierOf(w, 'A'), 50, 6);
  const foe = place(soldierOf(w, 'B'), 49, 6, 1e9); // 同排正前
  w.armyStepPlan = (ww, uu) => (uu === me ? planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance') : null);
  const rows = trace('场景3 我方小兵 (50,6) 前进，敌兵正前 (49,6)', w, me, 2000);
  console.log(`# 结论：正前被敌占后第一步 d = ${rows[0] ? rows[0].d : '无动作'}（原作应 100% 走斜前 ±1 格）；敌兵格未变 = ${JSON.stringify(unitCell(foe)) === '{"gx":49,"gy":6}'}；A 攻击次数 = ${w.stats.attacksA}`);
}

// ── 场景 4：100v100 全速对局，扫逻辑异常 ─────────────────────────────────
{
  const w = mk({ aSoldiers: 100, bSoldiers: 100, seed: 11, orders: true });
  for (const side of ['A', 'B']) {
    const st = armyOrderOf(w, side);
    for (let i = 0; i < 8; i++) st.cmds[i] = 1; // 全军「前進」
  }
  const v1 = [];
  const v2 = [];
  const v3 = [];
  let diagPass = 0; // 斜步绕过同排正前敌人的次数
  const prevCell = new Map();
  const actCount = new Map();
  const TICKS = 3000;
  for (let t = 0; t < TICKS && !w.over; t++) {
    const before = new Map();
    for (const u of w.units) if (u.alive) before.set(u, unitCell(u));
    step(w);
    const seen = new Map();
    for (const u of w.units) {
      if (!u.alive) continue;
      const c = unitCell(u);
      const k = key(c.gx, c.gy);
      if (seen.has(k)) v1.push({ tick: w.tick, a: seen.get(k), b: [u.side, c.gx, c.gy] });
      else seen.set(k, [u.side, c.gx, c.gy]);
      // 同一 tick 内位移量（含被让位推动）
      const b0 = before.get(u) ?? c;
      const d = Math.max(Math.abs(c.gx - b0.gx), Math.abs(c.gy - b0.gy));
      if (d > 1) v2.push({ tick: w.tick, side: u.side, gen: !!u.isGeneral, from: [b0.gx, b0.gy], to: [c.gx, c.gy] });
      // 斜步：dx=-1(A)/+1(B) 且 dy≠0，且正前那格在 tick 开始时是敌人
      if (d === 1 && c.gy !== b0.gy && c.gx !== b0.gx) {
        const fy = b0.gy;
        const fx = u.side === 'A' ? b0.gx - 1 : b0.gx + 1;
        let blocker = null;
        for (const v of w.units) if (v.alive && v.side !== u.side) {
          const vc = before.get(v);
          if (vc && vc.gx === fx && vc.gy === fy) { blocker = v; break; }
        }
        if (blocker) diagPass++;
      }
      if (c.gx !== b0.gx || c.gy !== b0.gy) actCount.set(u, (actCount.get(u) ?? 0) + 1);
    }
    for (const [u, c] of before) prevCell.set(u, c);
  }
  console.log('\n=== 场景4 100v100「全軍前進」3000 tick ===');
  console.log(`tick=${w.tick} over=${w.over} 存活 A=${w.units.filter((u) => u.side === 'A' && u.alive).length} B=${w.units.filter((u) => u.side === 'B' && u.alive).length} attacks A=${w.stats.attacksA} B=${w.stats.attacksB}`);
  console.log(`V1 同格重叠 = ${v1.length}` + (v1.length ? ` 首例 ${JSON.stringify(v1[0])}` : ''));
  console.log(`V2 单 tick 位移 >1 格 = ${v2.length}` + (v2.length ? ` 首例 ${JSON.stringify(v2[0])}` : ''));
  console.log(`V3 单 tick 被推 >1 次 = ${v3.length}`);
  console.log(`斜步绕过「同排正前有敌」的次数 = ${diagPass}`);
  // 主将轨迹：看它是不是从敌兵队列里穿过去
  const g = w.units.find((u) => u.isGeneral && u.side === 'A');
  if (g) {
    const c = unitCell(g);
    const near = w.units.filter((v) => v.alive && v.side === 'B').map((v) => unitCell(v)).filter((t) => Math.abs(t.gx - c.gx) <= 2 && Math.abs(t.gy - c.gy) <= 2);
    console.log(`A 主将终点 ${c.gx},${c.gy}，2 格内敌人数 = ${near.length}`);
  }
}

// ── 场景 5：主将 vs 兵，同一条车道正面对撞（用户说的「一条线上」）─────────
{
  const w = mk();
  park(soldierOf(w, 'A'));
  const me = place(genOf(w, 'A'), 50, 6);
  const foeGen = place(genOf(w, 'B'), 40, 6, 1e9);
  const foe = place(soldierOf(w, 'B'), 45, 6, 1e9); // 同排挡在主将前面
  w.armyStepPlan = (ww, uu) => (uu === me ? planDirected(-1, 0, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance') : null);
  const rows = trace('场景5 我方主将 (50,6) 前进，敌兵 (45,6) 同排拦路', w, me, 2000);
  console.log(`# 结论：主将终点 ${JSON.stringify(unitCell(me))}，敌兵格 ${JSON.stringify(unitCell(foe))}，敌将格 ${JSON.stringify(unitCell(foeGen))}，A 攻击 ${w.stats.attacksA}`);
}
