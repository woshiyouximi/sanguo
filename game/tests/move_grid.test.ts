/**
 * R158：原作「行动 tick 抽一格」步进模型（`project/155_部队指令语义.md`）的钉子。
 *
 * 证据链（全部 `[确认]`，地址见 project/155）：
 *   `0x43B574` 行动闸门：`--[u+0x34]`；>0 直接返回 0（这一帧不许行动）；归零那帧才放行，
 *              复位 `0x28`=40 帧（`0x4000` 退却态 `0x2e`=46 帧）⇒ **一个单位每 40 帧才动一次**。
 *   `0x43C2A5` 方位抽样：按权重**无放回**抽候选方位（`0x450117(n)=rand()%n`）。
 *   `0x43C4C0` 试落点：第一轮只收「界内 + 空格」(`0x43B467`)；第二轮过 `0x43C20D`
 *              （敌格拒绝、本帧刚动过的友军拒绝、`status&0x1001` 拒绝、其余请友军让位）。
 *   `0x43BF26` 落地：逻辑坐标**直接改一格**（`u+0x8/+0xc = 新格`），视觉用 `0x43BE42`
 *              在 40 帧里线性滑过去 ⇒ 逻辑位移永远是整数格，不是 0.09 这种连续速度。
 *
 * 本文件只测「内核抽格」，不测视图插值（那层保留 `x/y` 连续值给 `battleView.ts`）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  ACTION_INTERVAL_TICKS,
  ACTION_SLIDE_TICKS,
  GRID_H,
  GRID_W,
  allRush,
  chooseStepCell,
  createWorld,
  mulberry32,
  planDirected,
  rushTargetOf,
  sampleStepOffsets,
  step,
  unitCell,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
  STEP_W_STRAIGHT,
} from '../src/core/battle.ts';
import type { Side, StepPlan, Unit, World } from '../src/core/battle.ts';
import { FOCUS_ROW, cmdStepPlan, installArmyOrders } from '../src/core/army_cmd.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/**
 * 小局：每边 1 兵 + 主将（够跑抽格，又不让别的单位抢格）。`seed` 固定 ⇒ `world.rng` 可复现。
 * 主将放到角落，免得它的默认跟随行为撞到被测士兵。
 */
function mkWorld(seed = 1, opts: { aSoldiers?: number; bSoldiers?: number } = {}): World {
  const w = createWorld({
    data,
    seed,
    a: { soldiers: opts.aSoldiers ?? 1, troop: 2 },
    b: { soldiers: opts.bSoldiers ?? 1, troop: 10 },
  });
  installArmyOrders(w);
  for (const u of w.units) {
    if (u.isGeneral) {
      u.x = u.side === 'A' ? GRID_W - 2 : 1;
      u.y = 0;
      u.prevX = u.x;
      u.prevY = u.y;
      u.cd = 1e9; // 主将别来抢格/抢动作
      u.slide = undefined;
    }
  }
  return w;
}

function soldierOf(w: World, side: Side = 'A'): Unit {
  const u = w.units.find((x) => x.side === side && !x.isGeneral && x.alive);
  assert.ok(u, `没有 ${side} 方士兵`);
  return u;
}

/** 把单位钉在整数格（`u.x/y` 是渲染位置，逻辑格由 `x/y` 取整得到） */
function place(u: Unit, gx: number, gy: number): void {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = undefined;
  u.cd = 0;
}

/** 只有基向量一个候选的直进计划（用于把「唯一候选」钉死，避免 10% 斜向干扰断言） */
function straightAt(sx: number, sy: number): StepPlan {
  return planDirected(sx, sy, STEP_W_STRAIGHT, STEP_W_STRAIGHT, 'advance');
}

function occOf(units: Unit[]): Map<number, Unit> {
  const occ = new Map<number, Unit>();
  for (const u of units) {
    const c = unitCell(u);
    occ.set(c.gy * GRID_W + c.gx, u);
  }
  return occ;
}

describe('抽格是离散的：40 tick 内要么 0 格、要么正好 1 格', () => {
  it('一个行动 tick = 1 格（`0x43BF26` 逻辑瞬移），40 帧内不出现 0.09 这种连续速度', () => {
    const w = mkWorld(3);
    const u = soldierOf(w);
    place(u, 40, 7);
    // m4：内核默认待機（0x43AEB2 清槽）后，这里要给被测单位一条显式计划才能验「抽格/闸门」。
    // 只给这一格单位接计划，其余仍是待機，避免别的单位抢格。
    w.armyStepPlan = (ww, uu) => (uu === u ? straightAt(-1, 0) : null);
    const start = unitCell(u);
    let prevCell = start;
    const increments: number[] = [];
    for (let t = 0; t < ACTION_INTERVAL_TICKS; t++) {
      const beforeX = u.x;
      const beforeY = u.y;
      step(w);
      const cell = unitCell(u);
      const dc = Math.max(Math.abs(cell.gx - prevCell.gx), Math.abs(cell.gy - prevCell.gy));
      assert.ok(dc === 0 || dc === 1, `第 ${t} tick 逻辑位移 ${dc} 格，只允许 0 或 1（0x43B574 门 + 0x43BF26 一格）`);
      // 渲染层：滑动时每帧只走 1/40 格（`0x43BE42`），停下时 0 —— 绝不会是 0.09/帧。
      // m4：落点像素带抖动 ±0x18px / ±0x12px（= ±0.25 格 / ±0.25 格），所以单帧位移是
      //     0 ≤ d ≤ 1.25/40（横向）或 ≤ 18/72/40（纵向 1px 抖动）。0.09 仍然被挡在外。
      const dx = Math.abs(u.x - beforeX);
      const dy = Math.abs(u.y - beforeY);
      for (const d of [dx, dy]) {
        assert.ok(
          d === 0 || d <= 1.25 / ACTION_SLIDE_TICKS + 1e-9 || Math.abs(d - 1) < 1e-9,
          `第 ${t} tick 单帧渲染位移 dx=${dx} dy=${dy} 超出抖动上限（连续速度模型才会出现 0.09）`,
        );
      }
      if (dc === 1) increments.push(t);
      prevCell = cell;
    }
    const end = unitCell(u);
    const moved = Math.max(Math.abs(end.gx - start.gx), Math.abs(end.gy - start.gy));
    assert.equal(moved, 1, `40 tick 内应正好走 1 格（实际 ${moved}）`);
    assert.deepEqual(increments, [0], '行动必须发生在闸门归零的那一帧（这里 cd=0 ⇒ 第 1 tick）');
    assert.equal(u.cd, ACTION_INTERVAL_TICKS - (ACTION_INTERVAL_TICKS - 1), '行动后 cd 复位到行动间隔');
    assert.ok(u.slide || moved === 1);
  });

  it('闸门没到期就不许动（阴性对照：去掉 `0x43B574` 的 40 帧门，这条会红）', () => {
    const w = mkWorld(4);
    const u = soldierOf(w);
    place(u, 40, 7);
    // 同上一测：默认待機后，闸门测试也要自带一条计划。
    w.armyStepPlan = (ww, uu) => (uu === u ? straightAt(-1, 0) : null);
    u.cd = 20; // 还在冷却里
    const start = unitCell(u);
    for (let t = 0; t < 20; t++) step(w);
    assert.deepEqual(unitCell(u), start, 'cd>0 期间一格都不许走');
    assert.equal(u.cd, 0, '20 次递减后 cd 应归零（下一 tick 才放行）');
    step(w);
    assert.notDeepEqual(unitCell(u), start, '归零后那一帧必须动');
  });
});

describe('`0x43C2A5` 权重抽样：80/10/10 锥形', () => {
  it('2000 次抽样：正前 80%±3%，两个 ±45° 各 10%±3%', () => {
    const plan = planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance');
    const rng = mulberry32(0x43c2a5);
    const N = 2000;
    let front = 0;
    let diagUp = 0;
    let diagDown = 0;
    for (let i = 0; i < N; i++) {
      const { first } = sampleStepOffsets(plan.sx, plan.sy, plan.w1, plan.w2, rng);
      const d = first[0];
      assert.ok(d, '锥形权重下第一轮至少有 1 个候选');
      // 基向量 sx=-1（A 方朝 −x 推进）：权重桶 0=正前(W)、1=NW、2=SW
      if (d.dx === -1 && d.dy === 0) front++;
      else if (d.dx === -1 && d.dy === -1) diagUp++;
      else if (d.dx === -1 && d.dy === 1) diagDown++;
      else assert.fail(`出现了锥形以外的方位：(${d.dx},${d.dy})`);
    }
    const pct = (n: number): number => (n / N) * 100;
    assert.ok(Math.abs(pct(front) - 80) <= 3, `正前 ${pct(front).toFixed(2)}% 应 ≈80%±3`);
    assert.ok(Math.abs(pct(diagUp) - 10) <= 3, `NW ${pct(diagUp).toFixed(2)}% 应 ≈10%±3`);
    assert.ok(Math.abs(pct(diagDown) - 10) <= 3, `SW ${pct(diagDown).toFixed(2)}% 应 ≈10%±3`);
  });
});

describe('`0x43C4C0` 试落点：界内 + 格占位互斥（含请友军让位）', () => {
  it('敌格一律拒绝（`0x43C20D` 比 +0x40 阵营）：正前方被敌占住就原地不动', () => {
    const w = mkWorld(5);
    const me = soldierOf(w, 'A');
    const foe = soldierOf(w, 'B');
    place(me, 30, 7);
    place(foe, 29, 7);
    const straight = straightAt(-1, 0);
    // 用「只有正前」的直进权重，确保第一轮唯一候选就是敌格
    const occ = occOf([me, foe]);
    assert.equal(chooseStepCell(w, me, straight, occ), null, '敌格必须被拒，且没有别的候选 ⇒ 不动');
    // 阴性对照：把敌格从占位表里拿掉（模拟"看不见敌人"），同一计划就会走进去
    assert.deepEqual(chooseStepCell(w, me, straight, occOf([me])), { gx: 29, gy: 7 });
  });

  it('己方空闲单位会被告知让位（`vcall[0x4c](obj,2,0)`），让位后落点原格', () => {
    const w = mkWorld(6);
    const me = soldierOf(w, 'A');
    const mate = w.units.find((x) => x.side === 'A' && x !== me && !x.isGeneral) ?? null;
    // 只有 1 个兵，手工造一个友军占住正前方
    const friend: Unit = { side: 'A', x: 29, y: 7, prevX: 29, prevY: 7, alive: true, cd: 2, lastActTick: -99 };
    if (mate) {
      Object.assign(mate, friend);
    } else {
      w.units.push(friend);
    }
    place(me, 30, 7);
    const straight = straightAt(-1, 0);
    const occ = occOf([me, friend]);
    const pick = chooseStepCell(w, me, straight, occ);
    assert.deepEqual(pick, { gx: 29, gy: 7 }, '友军让位后请位者应落到原友军格');
    const moved = unitCell(friend);
    assert.notDeepEqual(moved, { gx: 29, gy: 7 }, '让位的友军必须真的挪到别的格');
    assert.ok(friend.slide, '让位也要走 40 帧滑动（0x43BF26 + 0x43BE42）');
  });

  it('本帧刚动过的友军不逼它让位（`other+0x30 == 当前帧` ⇒ 返回 0）', () => {
    const w = mkWorld(7);
    const me = soldierOf(w, 'A');
    const friend: Unit = { side: 'A', x: 29, y: 7, prevX: 29, prevY: 7, alive: true, cd: 5, lastActTick: 0 };
    w.units.push(friend);
    place(me, 30, 7);
    w.tick = 0;
    const straight = straightAt(-1, 0);
    const occ = occOf([me, friend]);
    assert.equal(chooseStepCell(w, me, straight, occ), null, '刚行动过的友军不让位 ⇒ 请位失败');
  });
});

describe('命令字的方向表（`0x43C4C0` 的 sx,sy 参数）', () => {
  it('後退 = 纯 ±x、sy 恒 0，与敌人位置无关（`0x43C9EF`：A→+1 / B→−1）', () => {
    const w = mkWorld(8);
    const u = soldierOf(w, 'A');
    place(u, 30, 7);
    const p = cmdStepPlan(w, 'A', u, 2) as StepPlan;
    assert.ok(p, '後退该有计划');
    assert.equal(p.sx, 1, 'A 方後退朝 +x（后方）');
    assert.equal(p.sy, 0, '後退不许有 y 分量');
    // 把敌人挪到完全相反的方向，计划不变 ⇒ 与敌人位置无关
    const foe = soldierOf(w, 'B');
    place(foe, 30, 0);
    const p2 = cmdStepPlan(w, 'A', u, 2) as StepPlan;
    assert.equal(p2.sx, 1);
    assert.equal(p2.sy, 0);
  });

  it('分散：y∉[4,9] 纯前进；y≥7 带 +y；y<7 带 −y（`0x43CB87`）', () => {
    const w = mkWorld(9);
    const u = soldierOf(w, 'A');
    const at = (gy: number): StepPlan => {
      place(u, 30, gy);
      const p = cmdStepPlan(w, 'A', u, 5) as StepPlan;
      assert.ok(p, `分散在 y=${gy} 该有计划`);
      return p;
    };
    let p = at(2);
    assert.equal(p.sx, -1, 'A 方前进 = −x');
    assert.equal(p.sy, 0, 'y=2 不在 [4,9] ⇒ 纯前进（`!(y>3 && y<10)` 成立）');
    p = at(3);
    assert.equal(p.sy, 0, 'y=3 仍不在 [4,9] ⇒ 纯前进（下边界）');
    p = at(10);
    assert.equal(p.sy, 0, 'y=10 不在 [4,9] ⇒ 纯前进（上边界）');
    p = at(9);
    assert.equal(p.sy, 1, 'y=9 已在 [4,9] 内且 y≥7 ⇒ (sx,+1)');
    p = at(7);
    assert.equal(p.sy, 1, 'y=7 ⇒ (sx,+1)');
    p = at(5);
    assert.equal(p.sy, -1, 'y=5 < 7 ⇒ (sx,−1)');
    p = at(4);
    assert.equal(p.sy, -1, 'y=4 是带内下沿 ⇒ (sx,−1)');
  });

  it('中央集中：先归第 6 行（`dy = 6 − y`，0x48E4D0=6），归行时 x 分量为 0', () => {
    const w = mkWorld(10);
    const u = soldierOf(w, 'A');
    place(u, 30, 2);
    let p = cmdStepPlan(w, 'A', u, 6) as StepPlan;
    assert.equal(FOCUS_ROW, 6, '目标行是第 6 行（不是 (14−1)/2=6.5）');
    assert.equal(p.sx, 0, '归行阶段 x 分量必须为 0');
    assert.equal(p.sy, 1, 'y=2 < 6 ⇒ +y');
    place(u, 30, 12);
    p = cmdStepPlan(w, 'A', u, 6) as StepPlan;
    assert.equal(p.sx, 0);
    assert.equal(p.sy, -1, 'y=12 > 6 ⇒ −y');
    place(u, 30, 6);
    p = cmdStepPlan(w, 'A', u, 6) as StepPlan;
    assert.deepEqual(p.w1, [35, 5, 5, 5, 5, 5, 5, 35], '归行后权重 35/5/…/35（0x48E898）');
    assert.equal(p.sy, 0, '归行后不再有 y 基向量');
  });

  it('上移/下移：x 分量恒 0，A/B 不镜像（`0x43CA7B` = (0,+1)、`0x43CAB8` = (0,−1)）', () => {
    const w = mkWorld(11);
    const a = soldierOf(w, 'A');
    place(a, 30, 7);
    let p = cmdStepPlan(w, 'A', a, 3) as StepPlan;
    assert.deepEqual([p.sx, p.sy], [0, 1], '上移 = (0,+1)');
    p = cmdStepPlan(w, 'A', a, 4) as StepPlan;
    assert.deepEqual([p.sx, p.sy], [0, -1], '下移 = (0,−1)');
    const b = soldierOf(w, 'B');
    place(b, 30, 7);
    p = cmdStepPlan(w, 'B', b, 3) as StepPlan;
    assert.deepEqual([p.sx, p.sy], [0, 1], 'B 方上移同样是 (0,+1)，不镜像');
  });

  it('主将的 3..7 号命令 = 无操作（`0x43CF07` 表 → `0x43CF89` ret）', () => {
    const w = mkWorld(12);
    const g = w.units.find((x) => x.isGeneral && x.side === 'A')!;
    place(g, 60, 7);
    for (const cmd of [3, 4, 5, 6, 7]) assert.equal(cmdStepPlan(w, 'A', g, cmd), null, `主将 cmd ${cmd} 应无操作`);
  });
});

describe('全軍突擊：朝缓存的敌 unit 一格一格走，敌将死了换下一个（`0x43CDD3`）', () => {
  it('突击目标 = 敌方单位；目标阵亡后轮换到下一个活的', () => {
    const w = mkWorld(13, { aSoldiers: 2, bSoldiers: 3 });
    allRush(w, 'A');
    const t1 = rushTargetOf(w, 'A');
    assert.ok(t1 && t1.side === 'B', '突击目标必须是 B 方单位');
    t1.alive = false; // 目标阵亡
    const t2 = rushTargetOf(w, 'A');
    assert.ok(t2, '轮换后还得有目标');
    assert.notEqual(t2, t1, '阵亡的目标不能再用');
    assert.equal(t2.alive, true);
    assert.equal(t2.side, 'B');
  });

  it('突击单位朝目标格逼近（`0x43C888` 的 sign 步进）', () => {
    const w = mkWorld(14);
    const me = soldierOf(w, 'A');
    const foe = soldierOf(w, 'B');
    place(me, 40, 7);
    place(foe, 20, 7);
    allRush(w, 'A');
    w.units.find((x) => x.isGeneral && x.side === 'B')!.alive = false; // 只剩这 1 个兵当目标
    const from = unitCell(me);
    step(w);
    const to = unitCell(me);
    assert.equal(to.gx - from.gx, -1, '朝目标（−x 方向）走 1 格');
    assert.equal(to.gy, from.gy);
  });
});

describe('能打就不走：同一 tick 有目标在攻击范围里 ⇒ 不动（`0x43BD64` == 1 才走）', () => {
  it('贴身时只出手、不位移', () => {
    const w = mkWorld(15);
    const me = soldierOf(w, 'A');
    const foe = soldierOf(w, 'B');
    place(me, 30, 7);
    place(foe, 29, 7);
    const at = unitCell(me);
    step(w);
    assert.ok(w.stats.attacksA + w.stats.attacksB > 0, '贴身必须打起来');
    assert.deepEqual(unitCell(me), at, '能打就不许走');
  });
});

describe('阴性对照：把关键规则改坏要能红', () => {
  it('非撤退单位不会从边界"离场"（`0x43BFE7` 只在 0x4000 撤退态发生）', () => {
    const w = mkWorld(16);
    const u = soldierOf(w, 'A');
    place(u, 0, 7);
    // 站在 x=0，唯一候选在 x=−1（界外）：撤退态才走 `0x43BFE7` 离场
    const out = straightAt(-1, 0);
    const pick = chooseStepCell(w, u, out, occOf([u]));
    assert.equal(pick, null, '非撤退态：越界候选直接丢弃 ⇒ 不动（绝不返回 exit）');
    const fleeing = { ...u, flee: true } as Unit;
    const pick2 = chooseStepCell(w, fleeing, out, occOf([fleeing]));
    assert.deepEqual(pick2, { exit: true }, '撤退态才允许从 x 越界处离场');
  });

  it('打不动的局面不许"偷偷挤过去"：唯一候选被敌占 ⇒ 位移 0（阴性对照：放宽占位互斥就变 1）', () => {
    const w = mkWorld(17);
    const me = soldierOf(w, 'A');
    const foe = soldierOf(w, 'B');
    place(me, 30, 7);
    place(foe, 29, 7);
    // 只允许正前（STRAIGHT）⇒ 候选唯一，且被敌占（`0x43C20D` 见敌即拒）
    assert.equal(chooseStepCell(w, me, straightAt(-1, 0), occOf([me, foe])), null);
    // 阴性对照：同一格若换成「空格」，这一步就该走成
    assert.deepEqual(chooseStepCell(w, me, straightAt(-1, 0), occOf([me])), { gx: 29, gy: 7 });
  });
});
