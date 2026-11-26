/**
 * R190 P0「不许穿阵」的钉子。
 *
 * 用户实机反馈（R190）：
 *  ①「我方武将前方没有敌方武将和小兵阻挡后，直接穿过去了」
 *  ②「两个小兵前方没有敌方的情况下，放着旁边的敌人不管直接跑过去了」
 *
 * 取证结论（见 `work/flow_block/REPORT.md`）：**原作没有这条规则**。
 * `project/155` §1.4 的 `0x43C4C0` 只判目标格（第一轮 `0x43B467` = 界内 + 该格无人；
 * 第二轮 `0x43C20D` = 敌格拒绝 / 本帧已动作的友军拒绝 / 其余请友军让位），从不看路径、
 * 车道或相邻格；`0x43BBE6` 的同排扫描也只沿 ±x。所以旧实现"贴着敌人身边擦过去"
 * 与原作一致 —— 这两条拦阻是**按用户观感新增**的（`[新设计]`），`world.blockPass = false`
 * 可一键退回。
 *
 * 规则本体 `passBlocked()`：
 *  A 斜穿禁止：1 格斜步跨过的两个正交拐角里有敌人 ⇒ 不许走（不跳过紧邻敌人）
 *  B 夹缝禁止：目标格在垂直于主轴的两侧都被敌人夹住 ⇒ 不许挤进去
 *  C 贴侧不许纵深：往纵深走一步，**当前格**或**落点**的侧翼有敌人 ⇒ 不许走
 *    （＝被敌人贴住时不许当他不存在直接走开；侧移仍然可以，所以不会永久卡死）
 * 例外：**只有溃逃**（`u.flee`，`0x4000` 退却态＝散开跑）豁免。突擊（`kind==='rush'`）与
 *       全軍突擊令（`world.rush[side]`）**都不豁免**——用户抱怨的正是「全軍突擊時穿過去」。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  GRID_W,
  chooseStepCell,
  createWorld,
  planDirected,
  step,
  unitCell,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
  STEP_W_STRAIGHT,
} from '../src/core/battle.ts';
import type { Side, StepPlan, Unit, World } from '../src/core/battle.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 1 兵 + 主将的小局；主将钉在角落、`cd=1e9`（不来抢格），每边 1 兵方便摆位 */
function mkWorld(seed = 1): World {
  const w = createWorld({
    data,
    seed,
    a: { soldiers: 1, troop: 2 },
    b: { soldiers: 1, troop: 10 },
  });
  for (const u of w.units) {
    if (u.isGeneral) {
      u.x = u.side === 'A' ? GRID_W - 2 : 1;
      u.y = 0;
      u.prevX = u.x;
      u.prevY = u.y;
      u.slide = undefined;
      u.cd = 1e9;
    }
  }
  return w;
}

function unitOf(w: World, side: Side, general = false): Unit {
  const u = w.units.find((x) => x.side === side && !!x.isGeneral === general && x.alive);
  assert.ok(u, `没有 ${side} 方${general ? '主将' : '士兵'}`);
  return u;
}

function place(u: Unit, gx: number, gy: number, cd = 0): Unit {
  u.x = gx;
  u.y = gy;
  u.prevX = gx;
  u.prevY = gy;
  u.slide = undefined;
  u.cd = cd;
  return u;
}

function straightAt(sx: number, sy: number, kind: StepPlan['kind'] = 'advance'): StepPlan {
  return planDirected(sx, sy, STEP_W_STRAIGHT, STEP_W_STRAIGHT, kind);
}

/** 只让 `mover` 有计划，其他单位一律待機 ⇒ `step()` 只有一个会动的单位 */
function driveOnly(w: World, mover: Unit, plan: StepPlan | null): void {
  w.armyStepPlan = (_w, u) => (u === mover ? plan : null);
}

/** 只跑一帧（`step()` 会推进 tick / 插值 / 结算），返回该单位在帧末的逻辑格 */
function tickOnce(w: World, u: Unit): { gx: number; gy: number } {
  step(w);
  return unitCell(u);
}

describe('R190 不许穿阵：目标格有敌（原作 `0x43B467`/`0x43C20D` 本来就这么拦）', () => {
  it('目标格被敌人占据 ⇒ `chooseStepCell` 返回 null，绝不落进敌格', () => {
    const w = mkWorld(3);
    const me = place(unitOf(w, 'A'), 50, 6);
    const foe = place(unitOf(w, 'B'), 49, 6, 1e9);
    const occ = new Map<number, Unit>();
    for (const u of w.units) if (u.alive) {
      const c = unitCell(u);
      occ.set(c.gy * GRID_W + c.gx, u);
    }
    assert.equal(chooseStepCell(w, me, straightAt(-1, 0), occ), null, '敌格必须拒');
    assert.deepEqual(unitCell(foe), { gx: 49, gy: 6 }, '敌人自己不动');
  });

  it('目标格有敌时整帧不位移，改为同排攻击（能打就不走）', () => {
    const w = mkWorld(4);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 6, 1e9);
    driveOnly(w, me, straightAt(-1, 0)); // 有走位计划，但敌格不可进 ⇒ 只能打
    assert.deepEqual(tickOnce(w, me), { gx: 50, gy: 6 }, '不许走进敌格');
    assert.ok(w.stats.attacksA > 0, '应该就地出手（`0x43BCA7` 先扫同排）');
  });
});

describe('R190 不许穿阵：贴侧 / 夹缝 / 斜穿（`[新设计]`，原作无此规则）', () => {
  it('夹缝：正前方一格两侧都是敌人 ⇒ 主将不挤进去，也不换道（原作主将锁本道）', () => {
    const w = mkWorld(7);
    const me = place(unitOf(w, 'A', true), 50, 6);
    const foeG = unitOf(w, 'B', true);
    const foeS = unitOf(w, 'B');
    place(foeG, 49, 7, 1e9);
    place(foeS, 49, 5, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.notDeepEqual(unitCell(me), { gx: 49, gy: 6 }, '不许走进 (49,6) 那条缝');
    // R216：原作主将攻击只取 (x+dir, y)（`0x43D76C`），换道会永远对不上敌将；
    // 所以夹缝时主将停在原地等正面，不再「插进敌兵那条车道」。
    assert.deepEqual(unitCell(me), { gx: 50, gy: 6 }, '主将锁本道，原地等正面');
    assert.deepEqual(unitCell(foeG), { gx: 49, gy: 7 }, '敌将原地');
    assert.deepEqual(unitCell(foeS), { gx: 49, gy: 5 }, '敌兵原地');
  });

  it('贴侧单侧：侧翼（相邻车道）有一个敌人 ⇒ 也不许沿纵深走过去', () => {
    const w = mkWorld(8);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 5, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 50, gy: 5 }, '一侧有敌人就不许贴着他前进（规则 C）⇒ v3 改为插进敌车道');
  });

  it('敌人正贴在旁边（同 gx、相邻车道）⇒ 不许沿纵深走开（用户反馈②的字面场景）', () => {
    const w = mkWorld(11);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 50, 5, 1e9); // 就在正侧翼，既不挡目标格也不进同排扫描
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 50, gy: 6 }, '旁边贴着敌人时不许当他不存在直接走开（规则 C 的 from 侧）');
  });

  it('斜穿：两个拐角都被敌人占住 ⇒ 不许钻对角缝', () => {
    const w = mkWorld(9);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 6, 1e9); // 斜步 (50,6)→(49,7) 的拐角 cx=(49,6)
    place(unitOf(w, 'B', true), 50, 7, 1e9); // 另一个拐角 cy=(50,7)
    const occ = new Map<number, Unit>();
    for (const u of w.units) if (u.alive) {
      const c = unitCell(u);
      occ.set(c.gy * GRID_W + c.gx, u);
    }
    // 只给斜前一个候选（100% 权重），否则会被正前的空格接走
    assert.equal(chooseStepCell(w, me, straightAt(-1, 1), occ), null, '两拐角都被占 ⇒ 不许钻对角缝');
  });

  it('斜穿：只占一个拐角 ⇒ 仍可斜插（贴侧被堵时的唯一脱身口，禁死会锁成死局）', () => {
    const w = mkWorld(9);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 6, 1e9); // 只堵住 cx 拐角
    const occ = new Map<number, Unit>();
    for (const u of w.units) if (u.alive) {
      const c = unitCell(u);
      occ.set(c.gy * GRID_W + c.gx, u);
    }
    assert.deepEqual(
      chooseStepCell(w, me, straightAt(-1, 1), occ),
      { gx: 49, gy: 7 },
      '单侧拐角有敌不拦：这是「被侧翼敌人贴住 → 斜插进敌人那条车道 → 下一手同排攻击」的唯一入口',
    );
  });

  it('周边无敌人时正常前进一格（拦阻不能把所有人冻住）', () => {
    const w = mkWorld(5);
    const me = place(unitOf(w, 'A'), 50, 6);
    const foe = place(unitOf(w, 'B'), 20, 12, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 49, gy: 6 }, '空场照常前进');
    assert.deepEqual(unitCell(foe), { gx: 20, gy: 12 }, '远处敌人不受影响');
  });

  it('总开关：`world.blockPass = false` 退回 R189 行为（贴侧能过去）', () => {
    const w = mkWorld(8);
    w.blockPass = false;
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 5, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 49, gy: 6 }, '关掉拦阻后恢复原作的"只判目标格"');
  });

  it('突擊（rush）不豁免：冲锋路线同样不许从两敌夹缝里穿过去', () => {
    const w = mkWorld(10);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 5, 1e9);
    place(unitOf(w, 'B', true), 49, 7, 1e9);
    driveOnly(w, me, straightAt(-1, 0, 'rush'));
    step(w);
    assert.notDeepEqual(unitCell(me), { gx: 49, gy: 6 }, '全軍突擊时也不许踩过敌阵（用户抱怨的就是这个按钮）');
    assert.deepEqual(unitCell(me), { gx: 50, gy: 6 }, '突擊不插队贴打（拉直冲），但也不许从缝里过去');
  });
});

describe('R190 v3 贴住就插进去：斜前的邻道敌人先横移进它那条车道（`[新设计]`）', () => {
  it('斜前单敌 ⇒ 第一步横移进敌人车道，下一手同排相邻并开打', () => {
    const w = mkWorld(12);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 5, 1e9); // 敌在斜前（车道 5），正前 (49,6) 是空的
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 50, gy: 5 }, '先横移插进敌人那条车道（不是直冲 (49,6) 跑过去）');
    for (let i = 0; i < 41 && !w.over; i++) step(w); // 下一个行动周期（40 帧间隔）
    assert.ok(w.stats.attacksA >= 1, '插进去之后同排相邻 ⇒ 必须打得到（`0x43BBE6` 只扫同排）');
  });

  it('横移落点被友军占 ⇒ 不插（也不会因此踩过敌人）', () => {
    const w = mkWorld(13);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'A', true), 50, 5, 1e9); // 目标车道那一格被自己人（主将）占着
    place(unitOf(w, 'B'), 49, 5, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 50, gy: 6 }, '插不进去（落点非空）⇒ 老实待着，不许绕过敌人');
  });

  it('周边无敌人 ⇒ 不介入，仍按原 plan 走一格', () => {
    const w = mkWorld(14);
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 20, 12, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 49, gy: 6 }, '空场行为与 v2 完全一致');
  });

  it('`blockPass = false` ⇒ 插桩一并关闭，恢复旧路线', () => {
    const w = mkWorld(15);
    w.blockPass = false;
    const me = place(unitOf(w, 'A'), 50, 6);
    place(unitOf(w, 'B'), 49, 5, 1e9);
    driveOnly(w, me, straightAt(-1, 0));
    step(w);
    assert.deepEqual(unitCell(me), { gx: 49, gy: 6 }, '总开关关掉后就是 R189 只判目标格');
  });
});

describe('R190 回归：一场仗打下来，两个存活单位永不同格', () => {
  it('100v100 前進 400 tick：任意时刻占格互斥（含让位推动）', () => {
    const w = createWorld({
      data,
      seed: 7,
      a: { soldiers: 100, troop: 2, formation: 0, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
      b: { soldiers: 100, troop: 10, formation: 3, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
      aiSides: { B: true },
    });
    w.blockPass = true;
    // 双方都朝对方压上去（锥形前進计划，不用突击，保证拦阻真的在生效）
    w.armyStepPlan = (_ww, u) => planDirected(u.side === 'A' ? -1 : 1, 0, STEP_W_CONE, STEP_W_CONE_WIDE, 'advance');
    for (let t = 0; t < 400 && !w.over; t++) {
      step(w);
      const seen = new Map<number, Unit>();
      for (const u of w.units) {
        if (!u.alive) continue;
        const c = unitCell(u);
        const k = c.gy * GRID_W + c.gx;
        const other = seen.get(k);
        assert.equal(other, undefined, `tick ${w.tick}：${u.side} 与 ${other?.side} 同格 (${c.gx},${c.gy})`);
        seen.set(k, u);
      }
    }
  });
});
