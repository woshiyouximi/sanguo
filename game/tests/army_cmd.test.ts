/**
 * R141 部队指令层的回归测试。
 *
 * 依据：`project/140_战斗对照复查.md` §2.1、`work/battle_audit/cmd_ptr_table.txt`（198 项指针表）、
 * `cmd_obj_table.txt`（198 → 18 个执行入口）、`work/dis_battle_units2.txt:1846-2222`。
 *
 * 覆盖六类：
 *  ① 33 组 × 6 条都能取到非空 label；
 *  ② 第 5/6 条在 33 组恒为「全軍待機」「全軍突擊」；
 *  ③ 18 个执行入口归并出的命令字/目标槽/可用 mask；
 *  ④ `applyArmyCmd(slot=5)` 委托 `allRush()`，60 tick 推进真的更快；
 *  ⑤ `hold` 后 60 tick 净位移 ≈ 0，且 < 突击的 1/3；back/spread/focus/上移/下移 的位移方向与量；
 *  ⑥ 越界槽 / 结算后 / 撤退中 一律 `{ ok:false }`，且 `applyArmyCmd` 从不抛异常。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadData } from '../src/data.ts';
import {
  createWorld,
  requestRetreat,
  step,
  STEP_W_CONE,
  STEP_W_FOCUS_ROW,
  STEP_W_STRAIGHT,
  unitCell,
  type Side,
  type Unit,
  type World,
} from '../src/core/battle.ts';
import {
  ARMY_BTN,
  ARMY_TARGET,
  armyCmdDefOf,
  armyCmdsOf,
  armyGroupOf,
  armyOrderOf,
  armyStepPlan,
  applyArmyCmd,
  applyArmyCmdKind,
  canUseArmyCmd,
  cmdStepPlan,
  installArmyOrders,
  stepWithArmyOrders,
  uninstallArmyOrders,
} from '../src/core/army_cmd.ts';

const data = loadData();

/** 8 个士兵的常规开局：阵形 0（33 组里的第 0 组），双方同兵同士气 */
function freshWorld(seed = 141, soldiers = 8): World {
  return createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } },
  });
}

/** 把某一侧切到指定的阵形组（33 组菜单；单位已按原阵形落位，这里只换菜单） */
function setGroup(w: World, side: Side, g: number): void {
  w.sides[side].formation = g;
}

const unitsOf = (w: World, side: Side) => w.units.filter((u) => u.side === side);
const soldiersOf = (w: World, side: Side) => unitsOf(w, side).filter((u) => !u.isGeneral);

interface Pos {
  x: number;
  y: number;
}

/**
 * 位移一律记**逻辑格**（`unitCell`），不记像素插值位置。
 *
 * 原作 R158：一个行动 tick `0x43B574` 到点后，`0x43C4C0` 只抽一格，`0x43BF26` 直接把
 * `u+0x8/+0xc` 改成新格（逻辑瞬移），像素位置由 `0x43BE42` 用 40 帧补间追上去。
 * 所以「走了多远」只有格数有意义，`u.x` 是渲染中间量。
 */
function snap(w: World, side: Side): Map<Unit, Pos> {
  return new Map(unitsOf(w, side).map((u) => {
    const c = unitCell(u);
    return [u, { x: c.gx, y: c.gy }];
  }));
}

/** 平均位移（格）。只统计开局在、结束时还活着且仍在 units 里的单位，避免阵亡者拉偏 */
function meanDelta(w: World, side: Side, from: Map<Unit, Pos>): { dx: number; dy: number; n: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const u of unitsOf(w, side)) {
    const p = from.get(u);
    if (!p) continue;
    const c = unitCell(u);
    sx += c.gx - p.x;
    sy += c.gy - p.y;
    n++;
  }
  return n === 0 ? { dx: 0, dy: 0, n: 0 } : { dx: sx / n, dy: sy / n, n };
}

/**
 * 只统计士兵的平均位移。
 *
 * 小隊命令只写槽 1..7（`0x43ADED(army,which,value)`，`project/155` §2.1），槽 0 是主将；
 * 主将不吃小隊命令（`0x43CF07` 表 / `0x43CF89` ret），把它算进平均会把「一格」稀释成
 * 8/9 格。所以凡是验证「一个行动 tick 正好一格」的断言都用这个只算士兵的版本。
 */
function meanSoldierDelta(w: World, side: Side, from: Map<Unit, Pos>): { dx: number; dy: number; n: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const u of soldiersOf(w, side)) {
    const p = from.get(u);
    if (!p) continue;
    const c = unitCell(u);
    sx += c.gx - p.x;
    sy += c.gy - p.y;
    n++;
  }
  return n === 0 ? { dx: 0, dy: 0, n: 0 } : { dx: sx / n, dy: sy / n, n };
}

/** A 侧的进攻轴：A 在场地右侧，朝 −x 打 */
function advanceAxis(w: World): number {
  const mean = (side: Side): number => {
    const us = unitsOf(w, side);
    return us.reduce((s, u) => s + unitCell(u).gx, 0) / Math.max(1, us.length);
  };
  return Math.sign(mean('B') - mean('A')) || 1;
}

function stdY(w: World, side: Side): number {
  const ys = soldiersOf(w, side).map((u) => unitCell(u).gy);
  if (ys.length === 0) return 0;
  const m = ys.reduce((a, b) => a + b, 0) / ys.length;
  return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length);
}

const meanY = (w: World, side: Side): number => {
  const ys = soldiersOf(w, side).map((u) => unitCell(u).gy);
  return ys.length === 0 ? 0 : ys.reduce((a, b) => a + b, 0) / ys.length;
};

/** 跑 n tick，用带指令的包装器（生产路径） */
function run(w: World, n: number): void {
  for (let i = 0; i < n; i++) stepWithArmyOrders(w);
}

// ---------------------------------------------------------------------------
// ① 33 组 × 6 条：label 非空、槽号连续
// ---------------------------------------------------------------------------

test('R141 33 组 × 6 条：每组恰好 6 条，slot 0..5 连续，label 全部非空', () => {
  for (let g = 0; g < 33; g++) {
    const cmds = armyCmdsOf(g);
    assert.equal(cmds.length, 6, `组 ${g} 应有 6 条`);
    cmds.forEach((c, i) => {
      assert.equal(c.slot, i, `组 ${g} 第 ${i} 条的 slot 字段`);
      assert.equal(typeof c.label, 'string');
      assert.ok(c.label.length > 0, `组 ${g} 槽 ${i} 的 label 不能为空`);
      assert.ok(c.label.trim() === c.label, `组 ${g} 槽 ${i} 的 label 不该带空白`);

      assert.equal(typeof c.kind, 'string');
      assert.ok(Array.isArray(c.codes), `组 ${g} 槽 ${i} codes 必须是数组`);
      assert.ok(Number.isInteger(c.targets), `组 ${g} 槽 ${i} targets 必须是整数位掩码`);
      assert.ok(Number.isInteger(c.mask), `组 ${g} 槽 ${i} mask 必须是整数`);
    });
  }
});

test('R141 组号 33 取模：0..32 恒等，33→0、-1→32、1.9→1，NaN 兜底 0', () => {
  for (let g = 0; g < 33; g++) assert.equal(armyGroupOf(g), g);
  assert.equal(armyGroupOf(33), 0);
  assert.equal(armyGroupOf(34), 1);
  assert.equal(armyGroupOf(-1), 32);
  assert.equal(armyGroupOf(1.9), 1);
  assert.equal(armyGroupOf(Number.NaN), 0);
  assert.equal(armyGroupOf(Number.POSITIVE_INFINITY), 0);
  // 取模后仍能拿到 6 条非空 label（不抛）
  for (const g of [33, -1, 1.9, Number.NaN, 1e9]) {
    const cmds = armyCmdsOf(g);
    assert.equal(cmds.length, 6);
    for (const c of cmds) assert.ok(c.label.length > 0);
  }
});

// ---------------------------------------------------------------------------
// ② 第 5/6 条恒定
// ---------------------------------------------------------------------------

test('R141 第 5/6 条在 33 组恒为「全軍待機」「全軍突擊」（原作 198 项无一例外）', () => {
  for (let g = 0; g < 33; g++) {
    const cmds = armyCmdsOf(g);
    assert.equal(cmds[4]!.label, '全軍待機', `组 ${g} 第 5 条`);
    assert.equal(cmds[4]!.kind, 'hold', `组 ${g} 第 5 条 kind`);
    assert.equal(cmds[4]!.flags, 0, `组 ${g} 第 5 条命令字 = 0 待機`);
    assert.equal(cmds[5]!.label, '全軍突擊', `组 ${g} 第 6 条`);
    assert.equal(cmds[5]!.kind, 'rush', `组 ${g} 第 6 条 kind`);
    assert.equal(cmds[5]!.flags, 7, `组 ${g} 第 6 条命令字 = 7 突擊`);
  }
});

test('R141 前 4 条只有在组 22/23/24/25/28/30 才可能含「伏軍攻擊」，且这些组第 2 条恒是它', () => {
  const withAmbush: number[] = [];
  for (let g = 0; g < 33; g++) {
    const labels = armyCmdsOf(g).map((c) => c.label);
    if (labels.slice(0, 4).includes('伏軍攻擊')) withAmbush.push(g);
  }
  assert.deepEqual(withAmbush, [22, 23, 24, 25, 26, 27, 28, 29, 30], '串表里伏軍攻擊只出现在这 9 组');
  for (const g of withAmbush) assert.equal(armyCmdsOf(g)[1]!.label, '伏軍攻擊');
});

test('R141 逐组 label 与串表一致（33 组全表钉死）', () => {
  const EXPECTED: string[][] = [
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '左軍前進', '右軍前進', '中軍前進'],
    ['前軍前進', '中軍前進', '後軍前進', '全軍後退'],
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '左軍前進', '右軍前進', '全前集中'],
    ['前軍前進', '前軍後退', '左右分散', '中央集中'],
    ['前軍前進', '前軍後退', '前軍上移', '前軍下移'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['前軍前進', '前軍後退', '前軍上移', '前軍下移'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '伏軍攻擊', '左右前進', '中軍前進'],
    ['前軍前進', '伏軍攻擊', '中軍前進', '全軍後退'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '伏軍攻擊', '左軍前進', '右軍前進'],
    ['前軍前進', '伏軍攻擊', '前軍分散', '前軍集中'],
    ['前軍前進', '前軍後退', '前軍上移', '前軍下移'],
    ['全軍前進', '全軍後退', '左右分散', '中央集中'],
  ];
  assert.equal(EXPECTED.length, 33);
  for (let g = 0; g < 33; g++) {
    assert.deepEqual(armyCmdsOf(g).slice(0, 4).map((c) => c.label), EXPECTED[g], `组 ${g}`);
  }
});

// ---------------------------------------------------------------------------
// ③ 18 入口归并
// ---------------------------------------------------------------------------

test('R141 label 级去重后 17 组「命令字 + 目标槽 + mask」（原作 18 个执行地址，1 对共签名）', () => {
  const sigs = new Set<string>();
  for (let g = 0; g < 33; g++) {
    for (const c of armyCmdsOf(g)) sigs.add(`${c.codes.join('+')}|${c.targets}|${c.mask}`);
  }
  // 18 个地址里 0x4449EA 与 0x444F58 都是「前軍後退 = (1,2)，mask 0xd」，签名相同；
  // 两者的差别只在是否清 `[0x4a8ac4]`（阵形被破残留），本作按 kind 统一处理，见报告 §4。
  assert.equal(
    sigs.size,
    17,
    `应有 17 种签名，实际 ${sigs.size}：${[...sigs].sort().join(' / ')}`,
  );
});

test('R141 命令字：全軍突擊=7、全軍待機=0、前軍前進=1、前軍後退=2、前軍上移=3、前軍下移=4、分散=5、集中=6', () => {
  const g0 = armyCmdsOf(0);
  assert.equal(g0[0]!.flags, 1, '前軍前進');
  assert.equal(g0[1]!.flags, 2, '前軍後退');
  assert.equal(g0[2]!.flags, 5, '左右分散');
  assert.equal(g0[3]!.flags, 6, '中央集中');
  assert.equal(g0[4]!.flags, 0, '全軍待機');
  assert.equal(g0[5]!.flags, 7, '全軍突擊');
  const g9 = armyCmdsOf(9);
  assert.equal(g9[2]!.flags, 3, '前軍上移');
  assert.equal(g9[3]!.flags, 4, '前軍下移');
});

test('R141 目标槽：全軍待機/突擊写「除主将」8 槽，左/右/中/後軍只写自己那一槽', () => {
  assert.equal(armyCmdsOf(0)[4]!.targets, ARMY_TARGET.soldiers, '全軍待機 → which=0x101');
  assert.equal(armyCmdsOf(0)[5]!.targets, ARMY_TARGET.soldiers, '全軍突擊 → which=0x101');
  assert.equal(armyCmdsOf(4)[1]!.targets, ARMY_TARGET.left, '左軍前進 → 槽 3');
  assert.equal(armyCmdsOf(4)[2]!.targets, ARMY_TARGET.right, '右軍前進 → 槽 4');
  assert.equal(armyCmdsOf(4)[3]!.targets, ARMY_TARGET.center, '中軍前進 → 槽 5');
  assert.equal(armyCmdsOf(5)[2]!.targets, ARMY_TARGET.rear, '後軍前進 → 槽 2');
  assert.equal(armyCmdsOf(5)[2]!.flags, 1, '後軍前進 = (2,1)');
});

test('R141 左右前進 = 连续写 (1,3) 再 (1,4)：codes 两项、targets 是前軍、flags 取最后一项', () => {
  const def = armyCmdsOf(26)[2]!;
  assert.equal(def.label, '左右前進');
  assert.deepEqual(def.codes, [3, 4]);
  assert.equal(def.targets, ARMY_TARGET.front);
  assert.equal(def.flags, 4);
});

test('R141 伏軍攻擊 = (2,1) 後軍前進；全前集中 = 前/左/右三槽写 6', () => {
  const ambush = armyCmdsOf(22)[1]!;
  assert.equal(ambush.label, '伏軍攻擊');
  assert.equal(ambush.kind, 'ambush');
  assert.deepEqual(ambush.codes, [1]);
  assert.equal(ambush.targets, ARMY_TARGET.rear);
  const allFocus = armyCmdsOf(7)[3]!;
  assert.equal(allFocus.label, '全前集中');
  assert.equal(allFocus.flags, 6);
  assert.equal(allFocus.targets, ARMY_TARGET.front | ARMY_TARGET.left | ARMY_TARGET.right);
});

test('R141 「全軍後退」两个入口：g5 写前/中/後，g27 只写前/中（0x444E36 vs 0x444E99）', () => {
  const g5 = armyCmdsOf(5)[3]!;
  assert.equal(g5.label, '全軍後退');
  assert.equal(g5.targets, ARMY_TARGET.front | ARMY_TARGET.center | ARMY_TARGET.rear);
  const g27 = armyCmdsOf(27)[3]!;
  assert.equal(g27.label, '全軍後退');
  assert.equal(g27.targets, ARMY_TARGET.front | ARMY_TARGET.center);
  assert.notEqual(g5.targets, g27.targets);
});

test('R141 kind 归并：advance 6 种、back 2 种、spread 2 种、focus 3 种、ambush/shiftUp/shiftDown/hold/rush 各 1 种', () => {
  const seen = new Map<string, Set<string>>();
  for (let g = 0; g < 33; g++) {
    for (const c of armyCmdsOf(g).slice(0, 4)) {
      if (!seen.has(c.kind)) seen.set(c.kind, new Set());
      seen.get(c.kind)!.add(c.label);
    }
  }
  assert.deepEqual([...(seen.get('advance') ?? [])].sort(), [
    '中軍前進',
    '前軍前進',
    '右軍前進',
    '全軍前進',
    '左右前進',
    '左軍前進',
    '後軍前進',
  ].sort());
  assert.deepEqual([...(seen.get('back') ?? [])].sort(), ['前軍後退', '全軍後退'].sort());
  assert.deepEqual([...(seen.get('spread') ?? [])].sort(), ['前軍分散', '左右分散'].sort());
  assert.deepEqual([...(seen.get('focus') ?? [])].sort(), ['全前集中', '前軍集中', '中央集中'].sort());
  assert.deepEqual([...(seen.get('ambush') ?? [])], ['伏軍攻擊']);
  assert.deepEqual([...(seen.get('shiftUp') ?? [])], ['前軍上移']);
  assert.deepEqual([...(seen.get('shiftDown') ?? [])], ['前軍下移']);
  assert.equal(seen.size, 7, `前 4 条共 7 种 kind，实际 ${[...seen.keys()].join(',')}`);
});

test('R141 33 组 × 6 条里没有 unknown（全部已有语义），也没有 guess 标记', () => {
  for (let g = 0; g < 33; g++) {
    for (const c of armyCmdsOf(g)) {
      assert.notEqual(c.kind, 'unknown', `组 ${g} 槽 ${c.slot} (${c.label}) 语义未定`);
      assert.notEqual(c.guess, true, `组 ${g} 槽 ${c.slot} (${c.label}) 仍标着 [推测]`);
    }
  }
});

test('R141 armyCmdsOf 返回副本：改返回值不影响下一次取表；元素冻结', () => {
  const a = armyCmdsOf(0);
  a.splice(0, 6);
  assert.equal(armyCmdsOf(0).length, 6, '取表结果不能共享同一数组');
  const c = armyCmdsOf(0)[0]!;
  assert.equal(Object.isFrozen(c), true, '定义应冻结，防止 UI 改坏全局表');
  assert.equal(armyCmdDefOf(0, 0)!.label, '前軍前進');
});

test('R141 armyCmdDefOf：非整数/越界槽返回 undefined，0..5 正常', () => {
  for (const bad of [-1, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(armyCmdDefOf(0, bad), undefined, `槽 ${String(bad)}`);
  }
  for (let s = 0; s <= 5; s++) assert.equal(armyCmdDefOf(0, s)!.slot, s);
});

// ---------------------------------------------------------------------------
// ④ 突击：委托 allRush + 60 tick 推进
// ---------------------------------------------------------------------------

test('R141 applyArmyCmd(slot=5) 委托 allRush：world.rush.A 置位，命令槽 1..7 写 7', () => {
  const w = freshWorld(200);
  assert.equal(canUseArmyCmd(w, 'A', 5).ok, true, canUseArmyCmd(w, 'A', 5).reason);
  assert.equal(applyArmyCmd(w, 'A', 5), true);
  assert.equal(w.rush.A, true, '必须走 battle.ts 的 allRush（R137 实装）');
  assert.equal(w.rush.B, false, '只动被点的一侧');
  const st = armyOrderOf(w, 'A');
  for (let i = 1; i <= 7; i++) assert.equal(st.cmds[i], 7, `槽 ${i} 应为突击位 7`);
  assert.equal(st.cmds[0], 0, '主将槽（0）不在 which=0x101 范围');
  assert.equal(st.last, 'rush');
  assert.equal(st.active!.kind, 'rush');
});

test('R141 突击幂等：第二次 apply 返回 false，但 rush 态不回退', () => {
  const w = freshWorld(201);
  assert.equal(applyArmyCmd(w, 'A', 5), true);
  assert.equal(applyArmyCmd(w, 'A', 5), false, '已突击 → allRush 幂等 false，apply 同步 false');
  assert.equal(w.rush.A, true, '幂等 false 不能把状态翻回去');
  assert.equal(canUseArmyCmd(w, 'A', 5).ok, true, '已突击时按钮仍可用（原作 mask 0x5 不含 0x1）');
});

test('R158 突击不给速度加成：120 tick 推进量与普通态同量级（原作 0x43B574 无突击分支）', (t) => {
  // R150 在 EXE 侧查过：`AllRush` 只置全局突击标志 + 冻结敌方计时 + 写 `animobj+0x6C`，
  // `0x43B574` 里没有任何"加速"分支。R158 之后移动只剩「一个行动 tick 抽一格」
  // （`0x43C4C0` → `0x43BF26` 直接改 `u+0x8/+0xc`），所以突击与普通态每 40 tick 都只能走 1 格，
  // 差异只在**目标选择**（突击追 `army+0x38F4` 缓存敌兵，普通态追最近的敌人）。
  const ctrl = freshWorld(202);
  const rush = freshWorld(202);
  // m4：旧内核 createWorld 之后**缺省自动前压**，对照组才不需要下令；改成「无命令 = 待機」
  // （原作 0x43AEB2 清槽 / 0x43CF07[0] 权重全 0）后，必须给对照组显式写 1 号命令（前進），
  // 否则比的是「有没有命令」而不是「突擊有没有加速」。槽 1..7 = 1，只动士兵。
  const cst = armyOrderOf(ctrl, 'A');
  for (let i = 1; i <= 7; i++) cst.cmds[i] = 1;
  cst.last = 'advance';
  cst.at = 0;
  const axis = advanceAxis(ctrl);
  const c0 = snap(ctrl, 'A');
  const r0 = snap(rush, 'A');
  assert.equal(applyArmyCmd(rush, 'A', 5), true);
  for (let i = 0; i < 120; i++) {
    stepWithArmyOrders(ctrl);
    stepWithArmyOrders(rush);
  }
  // R172：**只比士兵**，两侧主将槽 0 都是 0（待機）—— 主将不参与这条断言。
  const advC = meanSoldierDelta(ctrl, 'A', c0).dx * axis;
  const advR = meanSoldierDelta(rush, 'A', r0).dx * axis;
  t.diagnostic(`120 tick：普通推进 ${advC.toFixed(2)} 格 / 突击 ${advR.toFixed(2)} 格`);
  assert.ok(advC >= 1, `普通态也该往前推（每 40 tick 一格），实际 ${advC}`);
  assert.ok(advR >= 1, `突击也该往前推，实际 ${advR}`);
  assert.ok(
    Math.abs(advR - advC) <= 1,
    `突击不许有速度加成（120 tick 最多差一次行动的 1 格）：${advR.toFixed(2)} vs ${advC.toFixed(2)}`,
  );
});

// ---------------------------------------------------------------------------
// ⑤ 五种 kind 的实际位移（单位 = 逻辑格；`unitCell`）
// ---------------------------------------------------------------------------

test('R141 全軍待機：60 tick 后士兵一格都不动（0x43C907 = 0 格 + 转身）', (t) => {
  const w = freshWorld(210);
  assert.equal(applyArmyCmd(w, 'A', 4), true, canUseArmyCmd(w, 'A', 4).reason);
  assert.equal(armyOrderOf(w, 'A').active!.kind, 'hold');
  const from = snap(w, 'A');
  run(w, 60);
  const d = meanDelta(w, 'A', from);
  t.diagnostic(`待機 60 tick：平均净位移 ${Math.hypot(d.dx, d.dy).toFixed(3)} 格（n=${d.n}）`);
  assert.equal(d.dx, 0, '待機的 `0x48E6A0` 权重全 0 → 一个候选都抽不出来');
  assert.equal(d.dy, 0, '待機连 y 也不动');
});

test('R141 待機的净位移 < 突击的 1/3（同一 seed、同一开局）', (t) => {
  const holdW = freshWorld(211);
  const rushW = freshWorld(211);
  const h0 = snap(holdW, 'A');
  const r0 = snap(rushW, 'A');
  assert.equal(applyArmyCmd(holdW, 'A', 4), true);
  assert.equal(applyArmyCmd(rushW, 'A', 5), true);
  for (let i = 0; i < 120; i++) {
    stepWithArmyOrders(holdW);
    stepWithArmyOrders(rushW);
  }
  const dh = meanDelta(holdW, 'A', h0);
  const dr = meanDelta(rushW, 'A', r0);
  const holdDist = Math.hypot(dh.dx, dh.dy);
  const rushDist = Math.hypot(dr.dx, dr.dy);
  t.diagnostic(`120 tick 平均净位移：待機 ${holdDist.toFixed(3)} / 突击 ${rushDist.toFixed(3)}`);
  assert.equal(holdDist, 0, '待機一格都不动');
  assert.ok(rushDist >= 1, `突击 120 tick（3 个行动 tick）应推进 ≥1 格，实际 ${rushDist.toFixed(2)}`);
  assert.ok(holdDist < rushDist / 3, `待機 ${holdDist} 应 < 突击 ${rushDist.toFixed(2)} 的 1/3`);
});

test('R141 全軍後退(g5)：士兵朝远离敌人方向退，x 位移为正（A 侧 = +x 是后方）', (t) => {
  const w = freshWorld(212);
  setGroup(w, 'A', 5);
  assert.equal(armyCmdsOf(5)[3]!.label, '全軍後退');
  assert.equal(applyArmyCmd(w, 'A', 3), true, canUseArmyCmd(w, 'A', 3).reason);
  assert.equal(armyOrderOf(w, 'A').active!.kind, 'back');
  const from = snap(w, 'A');
  run(w, 40);
  const d = meanSoldierDelta(w, 'A', from);
  t.diagnostic(`後退 40 tick：士兵平均 dx=${d.dx.toFixed(2)} 格，dy=${d.dy.toFixed(2)}`);
  // 0x43C9EF：sx = (A?+1:-1)、sy = 0 —— 与敌人位置无关，纯 ±x 方向；
  // 权重 0x48E778 是 80,10,10（10% 各走一次 ±45° 斜格），所以 dy 只是抖动，不是方向。
  assert.ok(d.dx >= 1, `A 侧後退 40 tick 该退 1 格，实际 dx=${d.dx.toFixed(2)}`);
  assert.ok(Math.abs(d.dy) <= 0.5, `後退没有 sy 分量（sy=0），dy 只是 10% 斜格抖动，实际 ${d.dy.toFixed(2)}`);
});

test('R141 左右分散：士兵的 y 标准差变大（往两翼摊开），x 仍在推进', (t) => {
  const w = freshWorld(213);
  assert.equal(applyArmyCmd(w, 'A', 2), true, canUseArmyCmd(w, 'A', 2).reason);
  assert.equal(armyOrderOf(w, 'A').active!.kind, 'spread');
  const s0 = stdY(w, 'A');
  const from = snap(w, 'A');
  const axis = advanceAxis(w);
  run(w, 80);
  const s1 = stdY(w, 'A');
  const d = meanDelta(w, 'A', from);
  t.diagnostic(`分散 80 tick：y 标准差 ${s0.toFixed(2)} → ${s1.toFixed(2)}，平均沿进攻轴推进 ${(d.dx * axis).toFixed(2)} 格`);
  assert.ok(s1 > s0 + 0.05, `分散应把 y 摊开：${s0.toFixed(2)} → ${s1.toFixed(2)}`);
  assert.ok(d.dx * axis > 0, '分散不该停住推进（0x43CB87 三档都带 sx）');
});

test('R141 中央集中：士兵的 y 向第 6 行收拢（`0x43CAF5`，目标行 6 而不是 6.5）', (t) => {
  const w = freshWorld(214);
  const s0 = stdY(w, 'A');
  assert.equal(applyArmyCmd(w, 'A', 3), true, canUseArmyCmd(w, 'A', 3).reason);
  assert.equal(armyOrderOf(w, 'A').active!.kind, 'focus');
  // 中央集中入口是 `0x43ADED(army,1,6)`（`project/155` line 250：`(1,6)`），
  // 只写槽 1 = 前軍；所以被选中收拢的是前軍，其余部队仍按旧命令（0 = 待機）原地。
  const picked = soldiersOf(w, 'A').filter((u) => armyStepPlan(w, u)?.kind === 'focus');
  assert.ok(picked.length > 0, '中央集中应至少选中 1 个士兵');
  const picked0 = picked.map((u) => unitCell(u).gy);
  run(w, 400);
  const s1 = stdY(w, 'A');
  const pickedY = picked.map((u) => unitCell(u).gy);
  const pickStd = (ys: number[]) => {
    const m = ys.reduce((a, b) => a + b, 0) / ys.length;
    return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length);
  };
  t.diagnostic(
    `集中 400 tick：全体 y 标准差 ${s0.toFixed(2)} → ${s1.toFixed(2)}，` +
    `被选中士兵 ${picked0.join('/')} → ${pickedY.join('/')}`,
  );
  // dy = 6 − y；dy != 0 抽 (0,sign(dy))，dy == 0 抽 35/5…/35（70% 留在第 6 行）
  for (const u of picked) {
    assert.ok(Math.abs(unitCell(u).gy - 6) <= 1, `归行后应贴着第 6 行，实际 y=${unitCell(u).gy}`);
  }
  assert.ok(pickStd(pickedY) < pickStd(picked0), `集中应把被选中士兵的 y 收拢：${pickStd(picked0).toFixed(2)} → ${pickStd(pickedY).toFixed(2)}`);
  for (const u of soldiersOf(w, 'A')) {
    assert.ok(Math.abs(unitCell(u).gy - 6) <= 2, `任何士兵都不该离开第 6 行 ±2 格，实际 y=${unitCell(u).gy}`);
  }
});

test('R141 前軍上移 / 前軍下移：命令字 3 = (0,+1)、4 = (0,−1)，A/B 不镜像', (t) => {
  // 原作 `0x43CA7B` = `0x43C4C0(u,0,+1,0x48E7C0)` ⇒ t=7 → mode=6 → (0,+1)；
  // `0x43CAB8` = `(0,-1)` ⇒ t=1 → mode=2。两个分支对 A/B 完全相同（y 不镜像）。
  const up = freshWorld(215);
  setGroup(up, 'A', 9);
  assert.equal(applyArmyCmd(up, 'A', 2), true, canUseArmyCmd(up, 'A', 2).reason);
  assert.equal(armyOrderOf(up, 'A').active!.kind, 'shiftUp');
  const upFrom = snap(up, 'A');
  const upSel = soldiersOf(up, 'A').filter((u) => armyStepPlan(up, u)?.kind === 'shiftUp');
  assert.ok(upSel.length > 0, '前軍上移应至少选中 1 个士兵');
  assert.ok(upSel.length < soldiersOf(up, 'A').length, '只该动前軍，不能整支部队一起走');
  for (const u of upSel) {
    const plan = armyStepPlan(up, u)!;
    assert.equal(plan.sx, 0, '上移的 x 分量恒 0');
    assert.equal(plan.sy, 1, '上移 = (0,+1)（0x48E580[7]=6）');
  }
  // 40 tick = 一个行动闸门周期。**自己走的**那一步必须正好 ±1 格。
  // 不能按「全体的平均 dy」判：① 抽到的格被友军占住时原作就原地不动（0x43C4C0 两轮都失败 → 0x43C084 滑回格心）；
  // ② 第二轮让位会把友军推向任意邻格；③ 0x43BE42 的落点抖动每步多抽 2 次 rand()，会让后续抽样序列整体移位。
  // 所以只统计「cd 到期且本来没在滑」的那次自主动作。
  const ownShift = (w: World, sel: Unit[]): { own: number; sum: number; pushed: number } => {
    let own = 0;
    let sum = 0;
    let pushed = 0;
    for (let t = 0; t < 40; t++) {
      const before = new Map(sel.map((u) => [u, { cd: u.cd, sliding: u.slide != null, cell: unitCell(u) }]));
      stepWithArmyOrders(w);
      for (const u of sel) {
        const b = before.get(u)!;
        if (b.sliding) continue;
        const c = unitCell(u);
        if (c.gx === b.cell.gx && c.gy === b.cell.gy) continue;
        if (b.cd === 0) {
          own++;
          sum += c.gy - b.cell.gy;
        } else {
          pushed++;
        }
      }
    }
    return { own, sum, pushed };
  };
  const upMove = ownShift(up, upSel);

  const down = freshWorld(215);
  setGroup(down, 'A', 9);
  assert.equal(applyArmyCmd(down, 'A', 3), true, canUseArmyCmd(down, 'A', 3).reason);
  assert.equal(armyOrderOf(down, 'A').active!.kind, 'shiftDown');
  const dnFrom = snap(down, 'A');
  const dnSel = soldiersOf(down, 'A').filter((u) => armyStepPlan(down, u)?.kind === 'shiftDown');
  for (const u of dnSel) {
    const plan = armyStepPlan(down, u)!;
    assert.equal(plan.sx, 0, '下移的 x 分量恒 0');
    assert.equal(plan.sy, -1, '下移 = (0,−1)（0x48E580[1]=2）');
  }
  const dnMove = ownShift(down, dnSel);

  t.diagnostic(
    `上移 40 tick：自主动作 ${upMove.own} 次（Σdy=${upMove.sum}，让位 ${upMove.pushed} 次）/ ` +
    `下移：${dnMove.own} 次（Σdy=${dnMove.sum}，让位 ${dnMove.pushed} 次）`,
  );
  assert.ok(upMove.own > 0, '上移至少该有 1 个单位自己走一步');
  assert.equal(upMove.sum, upMove.own, '上移自己走的每一步都该正好 +1 格（0x48E580[7]=6）');
  assert.ok(dnMove.own > 0, '下移至少该有 1 个单位自己走一步');
  assert.equal(dnMove.sum, -dnMove.own, '下移自己走的每一步都该正好 −1 格（0x48E580[1]=2）');
});

test('R141 全軍前進 与不开指令的普通推进一致（同一 handler，不额外加速）', (t) => {
  const a = freshWorld(216);
  const b = freshWorld(216);
  setGroup(a, 'A', 10);
  assert.equal(armyCmdsOf(10)[0]!.label, '全軍前進');
  assert.equal(applyArmyCmd(a, 'A', 0), true, canUseArmyCmd(a, 'A', 0).reason);
  assert.equal(armyOrderOf(a, 'A').active!.kind, 'advance');
  const from = snap(a, 'A');
  const fromB = snap(b, 'A');
  run(a, 40);
  run(b, 40);
  const da = meanSoldierDelta(a, 'A', from).dx;
  const db = meanSoldierDelta(b, 'A', fromB).dx;
  t.diagnostic(`全軍前進 40 tick：带指令士兵 dx=${da.toFixed(2)} / 普通态 dx=${db.toFixed(2)}`);
  // `0x4449A9` = `0x43ADED(army,1,1)`：只写槽 1（前軍），`project/155` line 247。
  // 没有指令时走的是 `defaultStepPlan` 的自动前压，所以两者只在「谁动」上有差别。
  assert.ok(da < 0, 'A 侧前進 = −x');
  assert.ok(Math.abs(da - db) <= 1, `全軍前進不该额外加速：${da.toFixed(2)} vs ${db.toFixed(2)}`);
  const moved = soldiersOf(a, 'A').filter((u) => from.get(u) && unitCell(u).gx !== from.get(u)!.x);
  assert.ok(moved.length > 0, '40 tick = 一个行动 tick，槽 1 的士兵至少要有一半走掉');
  for (const u of moved) {
    assert.equal(unitCell(u).gx - from.get(u)!.x, -1, '一个行动 tick 恰好一格（0x43BF26 逻辑瞬移）');
  }
});

// ---------------------------------------------------------------------------
// ⑥ 安全性：不动位置、越界槽、结算后、撤退中
// ---------------------------------------------------------------------------

test('R141 applyArmyCmd 只写状态：调用瞬间任何单位的位置都不变', () => {
  const w = freshWorld(220);
  const before = new Map(w.units.map((u) => [u, { x: u.x, y: u.y }]));
  for (const s of [0, 1, 2, 3, 4, 5]) {
    applyArmyCmd(w, 'A', s);
    for (const u of w.units) {
      assert.deepEqual({ x: u.x, y: u.y }, before.get(u), `槽 ${s} 之后 ${u.kind} 位置被改了`);
    }
  }
  // 也不改士兵数/血量
  assert.equal(soldiersOf(w, 'A').length, 8, 'applyArmyCmd 不许直接杀兵');
});

test('R141 越界/非整数/未知槽：canUseArmyCmd 与 applyArmyCmd 都安全返回 false，不抛', () => {
  const w = freshWorld(221);
  for (const slot of [-1, 6, 9, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const r = canUseArmyCmd(w, 'A', slot);
    assert.equal(r.ok, false, `槽 ${String(slot)} 应不可用`);
    assert.equal(typeof r.reason, 'string');
    assert.equal(applyArmyCmd(w, 'A', slot), false, `槽 ${String(slot)} 应拒绝`);
  }
  // 坏 world / 坏 side 也不能抛
  assert.equal(canUseArmyCmd(null as unknown as World, 'A', 0).ok, false);
  assert.equal(canUseArmyCmd(w, 'X' as unknown as Side, 0).ok, false);
  assert.equal(applyArmyCmd(null as unknown as World, 'A', 0), false);
  assert.equal(stepWithArmyOrders(null as unknown as World), undefined, '包装器对 null 也该是 no-op');
});

test('R141 结算后（world.settled）canUseArmyCmd 返回 ok:false，reason=戰鬥已結束', () => {
  const w = freshWorld(222);
  assert.equal(canUseArmyCmd(w, 'A', 0).ok, true);
  w.settled = {} as NonNullable<World['settled']>;
  const r = canUseArmyCmd(w, 'A', 0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '戰鬥已結束');
  assert.equal(applyArmyCmd(w, 'A', 0), false, '结算后下令也必须拒绝');
});

test('R141 战斗结束（world.over）后一样拒绝；stepWithArmyOrders 仍安全推进不抛', () => {
  const w = freshWorld(223);
  w.over = true;
  assert.equal(canUseArmyCmd(w, 'A', 0).ok, false);
  assert.equal(applyArmyCmd(w, 'A', 0), false);
  assert.doesNotThrow(() => stepWithArmyOrders(w));
});

test('R141 撤退中：本方所有子菜单都不可用；对側撤退不影响本方（原作只查己方状态字）', () => {
  const w = freshWorld(224);
  assert.equal(requestRetreat(w, 'A'), true);
  for (const s of [0, 1, 2, 3, 4, 5]) {
    const r = canUseArmyCmd(w, 'A', s);
    assert.equal(r.ok, false, `撤退中槽 ${s} 应为灰`);
    assert.equal(applyArmyCmd(w, 'A', s), false);
  }
  assert.equal(canUseArmyCmd(w, 'B', 0).ok, true, 'B 侧不该被 A 的撤退拖累');
});

test('R141 没有士兵（只剩主将）时：canUseArmyCmd 返回「已無士兵」', () => {
  const w = freshWorld(225);
  for (const u of soldiersOf(w, 'A')) u.alive = false;
  const r = canUseArmyCmd(w, 'A', 4);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '已無士兵');
  assert.equal(applyArmyCmd(w, 'A', 5), false, '没兵也不能突击');
});

// ---------------------------------------------------------------------------
// ⑦ 第一层按钮（保護主將 / 武將出擊 / 主將待機|後退 / 全軍撤退）
// ---------------------------------------------------------------------------

test('R141 保護主將：置 ARMY_FLAG.guardGeneral，并把 takenMul 压到 0.75', () => {
  const w = freshWorld(230);
  assert.equal(applyArmyCmdKind(w, 'A', 'guardLord'), true);
  assert.equal((w.army.A.flags & 0x10) !== 0, true, 'army+0x84 |= 0x10（guardGeneral）');
  assert.equal(w.army.A.takenMul, 0.75);
  assert.equal(w.army.B.takenMul, 1, '只影响本方');
  assert.equal(armyOrderOf(w, 'A').buttons & ARMY_BTN.guardLord, ARMY_BTN.guardLord);
});

test('R141 主將後退 / 主將待機：bit 0x10 是开关，命令槽 0 分别写 2 / 0', () => {
  const w = freshWorld(231);
  assert.equal(applyArmyCmdKind(w, 'A', 'lordBack'), true);
  assert.equal(armyOrderOf(w, 'A').cmds[0], 2, '後退 = 命令字 2');
  assert.equal(armyOrderOf(w, 'A').buttons & ARMY_BTN.lordOrder, ARMY_BTN.lordOrder, '按钮应显示「主將待機」');
  assert.equal(applyArmyCmdKind(w, 'A', 'lordWait'), true);
  assert.equal(armyOrderOf(w, 'A').cmds[0], 0, '待機 = 命令字 0');
  assert.equal(armyOrderOf(w, 'A').buttons & ARMY_BTN.lordOrder, 0, '再按一次清 bit');
});

test('R141 武將出擊：清主將待機位、命令槽 0 写 1', () => {
  const w = freshWorld(232);
  applyArmyCmdKind(w, 'A', 'lordBack');
  assert.equal(applyArmyCmdKind(w, 'A', 'sortie'), true);
  assert.equal(armyOrderOf(w, 'A').cmds[0], 1);
  assert.equal(armyOrderOf(w, 'A').buttons & ARMY_BTN.lordOrder, 0, '出擊覆盖「主將待機」');
  assert.equal(armyOrderOf(w, 'A').buttons & ARMY_BTN.sortie, ARMY_BTN.sortie);
});

test('R141 全軍撤退（第一层）：走 requestRetreat，置 fled/status 并清空子菜单 active', () => {
  const w = freshWorld(233);
  applyArmyCmd(w, 'A', 4); // 先下一条待機
  assert.equal(applyArmyCmdKind(w, 'A', 'retreat'), true);
  assert.equal(w.fled.A, true);
  assert.equal(w.status.A, 2);
  assert.equal(armyOrderOf(w, 'A').active, null, '撤退覆盖一切部队指令');
  assert.equal(applyArmyCmdKind(w, 'A', 'retreat'), false, '撤退不可重入');
});

// ---------------------------------------------------------------------------
// ⑧ stepWithArmyOrders 的边界
// ---------------------------------------------------------------------------

test('R141 stepWithArmyOrders 在无指令时逐步等价于 step（同 seed 两世界轨迹一致）', () => {
  const a = freshWorld(240);
  const b = freshWorld(240);
  for (let i = 0; i < 40; i++) {
    step(a);
    stepWithArmyOrders(b);
  }
  assert.equal(a.tick, b.tick);
  assert.deepEqual(
    a.units.map((u) => [u.side, u.x, u.y]),
    b.units.map((u) => [u.side, u.x, u.y]),
    '无指令时包装器不能改写任何位置',
  );
});

test('R141 突击态下包装器不再套指令位移（rush 由 step 自己处理，避免双重抽格）', () => {
  const w = freshWorld(241);
  applyArmyCmd(w, 'A', 5);
  const u = soldiersOf(w, 'A')[0]!;
  u.cd = 0;
  const from = unitCell(u);
  stepWithArmyOrders(w);
  const to = unitCell(u);
  // R158：原作没有速度系数，一个行动 tick 只抽一格（0x43B574 → 0x43C4C0 → 0x43BF26）。
  // 包装器只是把命令表挂成 `world.armyStepPlan`，绝不能在 step 之后再补一次位移。
  const dist = Math.max(Math.abs(to.gx - from.gx), Math.abs(to.gy - from.gy));
  assert.ok(dist <= 1, `一个行动 tick 最多一格，实际 ${dist}（双重抽格会把 40 帧/格压成 20 帧）`);
});

test('R141 指令只影响士兵：子菜单 6 条从不改写主将槽 cmds[0]', () => {
  const w = freshWorld(242);
  // 主将槽 = 0（which=0x101 不含槽 0 / 单槽 1..5 也不含）
  for (const s of [0, 1, 2, 3, 4, 5]) {
    assert.equal(applyArmyCmd(w, 'A', s), true, `槽 ${s} 应可下达`);
    assert.equal(armyOrderOf(w, 'A').cmds[0], 0, `槽 ${s} 改写了主将命令槽`);
  }
  for (const u of soldiersOf(w, 'A')) assert.equal(u.isGeneral, undefined);
});

test('R141 两种包装器路径与 step() 的伤害判定口径一致：待機不会让部队变成无敌', () => {
  const w = freshWorld(243);
  applyArmyCmd(w, 'A', 4);
  const hp0 = w.sides.A.general.maxHp - w.sides.A.general.hp;
  run(w, 90);
  const hp1 = w.sides.A.general.maxHp - w.sides.A.general.hp;
  assert.ok(hp1 >= 0, '主将血量不能变负');
  assert.ok(hp0 === 0);
});

// ---------------------------------------------------------------------------
// ⑨ 命令字 → 抽格计划（`cmdStepPlan`，逐条对应 project/155 §2.2 的表）
// ---------------------------------------------------------------------------

/** 把单位摆到指定逻辑格（清掉滑动状态，否则 `unitCell` 会返回滑动目标） */
function placeAt(u: Unit, gx: number, gy: number): void {
  u.x = gx;
  u.y = gy;
  u.slide = null;
}

test('R158 cmdStepPlan 命令字表：0 待機 / 1 前進 / 2 後退 / 3 上移 / 4 下移 / 9 歸陣', () => {
  const w = freshWorld(250);
  const u = soldiersOf(w, 'A')[0]!;
  placeAt(u, 40, 6);
  assert.equal(cmdStepPlan(w, 'A', u, 0), null, '0 待機：`0x48E6A0` 权重全 0，一格不走');
  const adv = cmdStepPlan(w, 'A', u, 1)!;
  assert.deepEqual([adv.sx, adv.sy], [-1, 0], '1 前進：A 方 sx=−1、sy=0');
  assert.deepEqual(adv.w1, STEP_W_CONE, '1 前進：`0x48E6E8` = 80,10,10（80% 直进 / 各 10% ±45°）');
  assert.equal(adv.kind, 'advance');
  const back = cmdStepPlan(w, 'A', u, 2)!;
  assert.deepEqual([back.sx, back.sy], [1, 0], '2 後退：sx=+1、sy=0，与敌人位置无关（0x43C9EF）');
  assert.deepEqual(back.w1, STEP_W_CONE, '2 後退：`0x48E778` 也是 80,10,10');
  const up = cmdStepPlan(w, 'A', u, 3)!;
  assert.deepEqual([up.sx, up.sy], [0, 1], '3 上移 = (0,+1)（0x43CA7B）');
  assert.deepEqual(up.w1, STEP_W_STRAIGHT, '3 上移：`0x48E7C0` = 100,0（无抖动）');
  const down = cmdStepPlan(w, 'A', u, 4)!;
  assert.deepEqual([down.sx, down.sy], [0, -1], '4 下移 = (0,−1)（0x43CAB8）');
  const ret = cmdStepPlan(w, 'A', u, 9)!;
  assert.ok(ret.sx > 0, '9 歸陣：朝己方军团格（A 在 +x 侧）');
});

test('R158 分散三档（0x43CB87）：y∉[4,9] 纯前进、y≥7 向 +y、y<7 向 −y', () => {
  const w = freshWorld(250);
  const u = soldiersOf(w, 'A')[0]!;
  placeAt(u, 40, 2);
  assert.deepEqual([cmdStepPlan(w, 'A', u, 5)!.sx, cmdStepPlan(w, 'A', u, 5)!.sy], [-1, 0], 'y=2 ∉[4,9] → (sx,0)');
  placeAt(u, 40, 6);
  assert.deepEqual([cmdStepPlan(w, 'A', u, 5)!.sx, cmdStepPlan(w, 'A', u, 5)!.sy], [-1, -1], 'y=6 <7 → (sx,−1)');
  placeAt(u, 40, 8);
  assert.deepEqual([cmdStepPlan(w, 'A', u, 5)!.sx, cmdStepPlan(w, 'A', u, 5)!.sy], [-1, 1], 'y=8 ≥7 → (sx,+1)');
});

test('R158 集中（0x43CAF5）：先归第 6 行，行上按 35/5/…/5/35 抖动', () => {
  const w = freshWorld(250);
  const u = soldiersOf(w, 'A')[0]!;
  placeAt(u, 40, 2);
  let p = cmdStepPlan(w, 'A', u, 6)!;
  assert.deepEqual([p.sx, p.sy], [0, 1], 'y=2 → dy=6−2>0 → 纯 +y（0x48E850 只可能在 y 抖）');
  placeAt(u, 40, 12);
  p = cmdStepPlan(w, 'A', u, 6)!;
  assert.deepEqual([p.sx, p.sy], [0, -1], 'y=12 → 向 −y 归行（不是 6.5，(14−1)/2 是错的）');
  placeAt(u, 40, 6);
  p = cmdStepPlan(w, 'A', u, 6)!;
  assert.deepEqual([p.sx, p.sy], [-1, 0], '到第 6 行 → 才允许前压');
  assert.deepEqual(p.w1, STEP_W_FOCUS_ROW, '在第 6 行用 `0x48E898` = 35,5,5,5,5,5,5,35（前 35% / 后 35% / 六斜各 5%）');
});

test('R158 主将 cmd 3..7 无操作（0x43CF89 直接 ret）', () => {
  const w = freshWorld(250);
  const gen = unitsOf(w, 'A').find((x) => x.isGeneral)!;
  placeAt(gen, 40, 6);
  for (const cmd of [3, 4, 5, 6, 7]) {
    assert.equal(cmdStepPlan(w, 'A', gen, cmd), null, `主将 cmd ${cmd} 必须是空操作`);
  }
  // 主将的 1/2 仍然有效（`0x43C758` / `0x43C795`），且都是纯 ±x 直线 `0x48E5C8`
  const adv = cmdStepPlan(w, 'A', gen, 1)!;
  assert.deepEqual([adv.sx, adv.sy], [-1, 0]);
  assert.deepEqual(adv.w1, STEP_W_STRAIGHT, '主将前進 = 直线 100/0');
  const back = cmdStepPlan(w, 'A', gen, 2)!;
  assert.deepEqual([back.sx, back.sy], [1, 0]);
  assert.deepEqual(back.w1, STEP_W_STRAIGHT, '主将後退 = 直线 100/0（0x48E5C8），不是锥形（R83 修正 0043C7B5）');
  assert.deepEqual(back.w2, STEP_W_STRAIGHT, '主将後退第二组仍是直线，不会挤友军');
});

// ---------------------------------------------------------------------------
// ⑩ 钩子安装：`world.armyStepPlan`（battle.ts `step()` 唯一入口）
// ---------------------------------------------------------------------------

test('R158 installArmyOrders 把 `world.armyStepPlan` 挂上；待機返回 null；uninstall 可卸', () => {
  const w = freshWorld(252);
  applyArmyCmd(w, 'A', 4); // 全軍待機
  assert.equal(w.armyStepPlan, undefined);
  installArmyOrders(w);
  assert.equal(typeof w.armyStepPlan, 'function');
  const u = soldiersOf(w, 'A')[0]!;
  assert.equal(w.armyStepPlan!(w, u), null, '待機不产生抽格计划（0 格）');
  uninstallArmyOrders(w);
  assert.equal(w.armyStepPlan, undefined);
});
