/**
 * R83：部队指令「步长 / 时长」的反彙編真值测试。
 *
 * 与 `army_cmd.test.ts` 的分工：那边测**指令表与语义**（33 组 × 6 条、槽位、可用性），
 * 这里只钉**数字**，每条断言都对着一条反彙編指令（`work/orig_numbers/text_dis.tsv`，
 * 切片脚本 `work/r83_steps/dis_range.mjs`）：
 *
 *  - 行动间隔 40 帧：`0043B5DE c7 41 34 28 00 00 00`（`[u+0x34] = 0x28`）
 *  - 撤退间隔 46 帧：`0043B5FD c7 40 34 2e 00 00 00`（`[u+0x34] = 0x2e`）
 *  - 主将撤退追加：`0043B64A..0043B653`（`u+0x34 = 46 + 2*(F(敌)−F(己))`）
 *  - 滑动 40 帧：`0043BF5F 6a 28` → `0x43BE42` 内 `0043BEF9 idiv [ebp+0x14]`
 *  - 一步一格：方向表 `0x48E560` 8 项分量恒 ±1/0；`0043C52D add edx,[ebp-0x30]` 只试一格
 *  - 格像素 96×72：`0043A4E6 imul eax,eax,0x60` / `0043A4F1 imul edx,edx,0x48`，格心 0x30/0x24
 *  - 逐条 handler 的基向量与 desc 权重见 `army_cmd.ts` `cmdStepPlan()` 文档表
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadData } from '../src/data.ts';
import {
  ACTION_INTERVAL_TICKS,
  ACTION_SLIDE_TICKS,
  ATTACK_COOLDOWN,
  GENERAL_SLOW_INTERVAL,
  GRID_H,
  GRID_W,
  LANE_PX,
  ROW_PX,
  SCALE,
  STEP_W_CONE,
  STEP_W_CONE_WIDE,
  STEP_W_FOCUS_ROW,
  STEP_W_STRAIGHT,
  actionIntervalOf,
  createWorld,
  markRetreating,
  requestRetreat,
  step,
  unitCell,
  type Side,
  type Unit,
  type World,
} from '../src/core/battle.ts';
import {
  FOCUS_ROW,
  armyCmdsOf,
  armyGroupOf,
  armyOrderOf,
  cmdStepPlan,
  installArmyOrders,
} from '../src/core/army_cmd.ts';

const data = loadData();

/** 命令字：原 `0x43CF8D` / `0x43D0C9` 两张跳表的索引 */
const CMD = {
  hold: 0,
  advance: 1,
  back: 2,
  shiftUp: 3,
  shiftDown: 4,
  spread: 5,
  focus: 6,
  rush: 7,
  retreat: 8,
  regress: 9,
} as const;

function freshWorld(seed = 141, soldiers = 8): World {
  return createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } },
  });
}

function generalOf(w: World, side: Side): Unit {
  return w.units.find((u) => u.side === side && u.isGeneral && u.alive)!;
}

function soldiersOf(w: World, side: Side): Unit[] {
  return w.units.filter((u) => u.side === side && !u.isGeneral && u.alive);
}

/** 摆到指定逻辑格（同时清滑动状态，否则 `unitCell` 读的是滑动目标格） */
function placeAt(u: Unit, gx: number, gy: number): void {
  u.x = gx;
  u.y = gy;
  u.slide = null;
}

/**
 * 直接摆命令字并挂上钩子。
 *
 * 绕开 UI（`applyArmyCmd` 只写 ui 描出来的槽，主将槽 0 平时不会被「前軍前進」覆盖）；
 * 这里测的是 `cmdStepPlan()` 与 `step()` 的落地，命令字本来就是一个整数。
 */
function order(w: World, side: Side, slot: number, cmd: number): void {
  const st = armyOrderOf(w, side);
  st.cmds[slot] = cmd;
  if (st.last === null) st.last = 'unknown';
  installArmyOrders(w);
}

// ---------------------------------------------------------------------------
// ① 时长：40 / 46 / 滑动 40
// ---------------------------------------------------------------------------

test('R83 真值·时长：普通 40 帧/格（0043B5DE）、撤退 46 帧（0043B5FD）、滑动 40 帧（0043BF5F）', () => {
  assert.equal(ACTION_INTERVAL_TICKS, 0x28, '`0043B5DE c7 41 34 28 00 00 00` ⇒ [u+0x34] = 0x28 = 40');
  assert.equal(ACTION_SLIDE_TICKS, 0x28, '`0043BF5F 6a 28` ⇒ 0x43BE42 的 speed=40，一格滑 40 帧');
  assert.equal(ATTACK_COOLDOWN, 0x28, '`0x43BD64` 攻击同样占一个 40 帧行动周期（能打就不走）');
  assert.equal(GENERAL_SLOW_INTERVAL, 0x2e, '`0043B5FD c7 40 34 2e 00 00 00` ⇒ [u+0x34] = 0x2e = 46');

  const w = freshWorld(301);
  const gen = generalOf(w, 'A');
  const sol = soldiersOf(w, 'A')[0]!;
  assert.equal(actionIntervalOf(gen), 40, '主将普通状态 40（0043B656：只有 0x4000 才加帧）');
  assert.equal(actionIntervalOf(sol), 40, '士兵普通状态 40（0043B5DE 是唯一写点）');
  markRetreating(sol);
  assert.equal(actionIntervalOf(sol), 46, '0x4000 撤退态 ⇒ 46 帧');
  markRetreating(gen);
  // 原作主将撤退是 46 + 2*(F(敌军团) − F(己军团))：`0043B618..0043B653`。
  // `F(x) = (x+0x40)->[0x48]->int16[+0x40]`，该字段语义【仍未定】，本作只落 46（报告 §4 偏差③）。
  assert.equal(actionIntervalOf(gen), 46, '本作主力撤退只实装 46 帧主值（追加项未定）');
});

test('R83 真值·格尺寸：一格 = 96×72 px、格心 (0x30,0x24)（0043A4E6 / 0043A4F1）', () => {
  assert.equal(ROW_PX, 96 * SCALE, '`0043A4E6 6bc060 imul eax,eax,0x60` ⇒ 纵深 0x60 = 96 px');
  assert.equal(SCALE, 750 / 1008, '竖屏只压 y：1 格纵深 = 96 × 750/1008 ≈ 71.4 屏 px');
  assert.equal(GRID_W, 0x47, '`0x43AF54` 上界 `cmp x,0x47` ⇒ 71 列');
  assert.equal(GRID_H, 0xe, '`0x43AF54` 上界 `cmp y,0xe` ⇒ 14 行');
  assert.equal(LANE_PX, 750 / GRID_H, '车道像素 = 屏高 / 14，格数不变');
  // 逻辑格像素恒 96×72，格心 (0x30,0x24) = (48,36)；竖屏压缩的是像素不是格数
  assert.equal(0x30, 96 / 2);
  assert.equal(0x24, 72 / 2);
});

// ---------------------------------------------------------------------------
// ② 步长：一步一格（8 邻域）
// ---------------------------------------------------------------------------

test('R83 真值·步长：一步 = 一格（0x48E560 八方向恒 ±1/0；0043C52D 只试一格）', () => {
  const w = freshWorld(302);
  const u = soldiersOf(w, 'A')[0]!;
  placeAt(u, 40, 6);
  for (const cmd of [CMD.advance, CMD.back, CMD.shiftUp, CMD.shiftDown, CMD.spread, CMD.focus, CMD.regress]) {
    const p = cmdStepPlan(w, 'A', u, cmd);
    assert.ok(p, `cmd ${cmd} 应有抽格计划`);
    assert.ok(Math.abs(p!.sx) <= 1 && Math.abs(p!.sy) <= 1, `cmd ${cmd}：基向量分量只能是 0/±1`);
    assert.ok(p!.sx !== 0 || p!.sy !== 0, `cmd ${cmd}：不能是 (0,0)（那走的是兜底 0x43C084）`);
  }

  // 真跑：任何一次逻辑格变化都必须是 Chebyshev 距离 1（含斜向、含被友军挤位）
  for (const cmd of [CMD.advance, CMD.shiftUp, CMD.shiftDown, CMD.spread, CMD.focus]) {
    const w2 = freshWorld(303 + cmd);
    const st = armyOrderOf(w2, 'A');
    for (let s = 1; s < 8; s++) st.cmds[s] = cmd;
    st.last = 'unknown';
    installArmyOrders(w2);
    const prev = new Map<Unit, { gx: number; gy: number }>();
    for (const x of w2.units) if (x.side === 'A') prev.set(x, unitCell(x));
    for (let t = 0; t < 120; t++) {
      step(w2);
      for (const x of w2.units) {
        if (x.side !== 'A' || !x.alive) continue;
        const p = prev.get(x)!;
        const c = unitCell(x);
        if (p.gx === c.gx && p.gy === c.gy) continue;
        const dist = Math.max(Math.abs(c.gx - p.gx), Math.abs(c.gy - p.gy));
        assert.equal(
          dist,
          1,
          `cmd ${cmd}：一个行动 tick 恰好一格（0x48E560），实际 (${p.gx},${p.gy}) → (${c.gx},${c.gy})`,
        );
        prev.set(x, c);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// ③ 时序：N 帧后位移
// ---------------------------------------------------------------------------

test('R83 时序·前進：第 1 帧起步、40 帧内最多一格；引擎实测节奏 = 40+1（报告 §4 偏差④）', () => {
  const w = freshWorld(311);
  const gen = generalOf(w, 'A');
  placeAt(gen, 60, 7);
  order(w, 'A', 0, CMD.advance);
  const gx: number[] = [unitCell(gen).gx];
  for (let t = 1; t <= 84; t++) {
    step(w);
    gx.push(unitCell(gen).gx);
  }
  assert.equal(gx[0], 60);
  assert.equal(gx[1], 59, '主将 cd 初值 0 ⇒ 下令后第 1 帧就出第一步');
  assert.equal(gx[41], 59, '40 帧里只允许走一格（0043B5DE = 0x28）');
  // battle.ts 是 `if (u.cd > 0) { u.cd--; continue; } u.cd = interval`：值 40 要 41 帧才归零，
  // 比原作 `if (--[u+0x34] > 0) return 0` 多 1 帧。battle.ts 本轮禁改，登记为偏差④。
  assert.equal(gx[42], 58, '第二格出现在第 42 帧：40（真值）+1（引擎实现差）');
  assert.equal(gx[83], 57, '之后稳定 41 帧一格：第 1/42/83 帧');
});

test('R83 时序·撤退：46 帧一格（0043B5FD），实测 46+1', () => {
  const w = freshWorld(312);
  const gen = generalOf(w, 'A');
  placeAt(gen, 60, 7);
  requestRetreat(w, 'A');
  installArmyOrders(w);
  const gx: number[] = [unitCell(gen).gx];
  for (let t = 1; t <= 50; t++) {
    step(w);
    gx.push(unitCell(gen).gx);
  }
  assert.equal(gx[1], 61, 'A 侧撤退 = +x（0x43C7E3 A 分支 push 1）');
  assert.equal(gx[47], 61, '46 帧里只走一格');
  assert.equal(gx[48], 62, '第二格在第 48 帧：46（真值）+1（同偏差④）');
});

test('R83 时序·待機：0x48E6A0 权重全 0 ⇒ 180 帧一格不走', () => {
  const w = freshWorld(313);
  const st = armyOrderOf(w, 'A');
  for (let s = 0; s < 8; s++) st.cmds[s] = CMD.hold;
  st.last = 'unknown';
  installArmyOrders(w);
  const before = new Map<Unit, { gx: number; gy: number }>();
  for (const x of w.units) before.set(x, unitCell(x));
  for (let t = 0; t < 180; t++) step(w);
  for (const x of w.units) {
    if (!x.alive) continue;
    assert.deepEqual(unitCell(x), before.get(x)!, `待機不许动：${x.side}/${x.isGeneral ? '主将' : '士兵'}`);
  }
});

// ---------------------------------------------------------------------------
// ④ 逐条基向量与 desc 权重
// ---------------------------------------------------------------------------

test('R83 基向量：士兵逐条 (sx,sy) 与 desc 权重（0043C907..0043CC95）', () => {
  const w = freshWorld(314);
  const u = soldiersOf(w, 'A')[0]!;
  placeAt(u, 40, 6);
  const plan = (cmd: number) => cmdStepPlan(w, 'A', u, cmd);

  assert.equal(plan(CMD.hold), null, '待機 0x43C907 ⇒ 0x48E6A0 全 0');

  const adv = plan(CMD.advance)!;
  assert.deepEqual([adv.sx, adv.sy], [-1, 0], '0043C988：A 側前進 = −x');
  assert.deepEqual(adv.w1, STEP_W_CONE, '0x48E6E8 第一组 = 80,10,10');
  assert.deepEqual(adv.w2, STEP_W_CONE_WIDE, '0x48E6E8 第二组 = 60,15,15,5,5（挤友军）');

  const back = plan(CMD.back)!;
  assert.deepEqual([back.sx, back.sy], [1, 0], '0043CA4D：士兵後退 = +x（A 側）');
  assert.deepEqual(back.w1, STEP_W_CONE, '士兵後退 0x48E778 = 80,10,10');

  const up = plan(CMD.shiftUp)!;
  assert.deepEqual([up.sx, up.sy], [0, 1], '0043CA8A：上移 (0,+1)');
  assert.deepEqual(up.w1, STEP_W_STRAIGHT, '0x48E7C0 = 100,0');

  const down = plan(CMD.shiftDown)!;
  assert.deepEqual([down.sx, down.sy], [0, -1], '0043CAC7：下移 (0,−1)');

  // 分散三档（0043CBCD / 0043CBD6 / 0043CC19）
  placeAt(u, 40, 2);
  assert.deepEqual([plan(CMD.spread)!.sx, plan(CMD.spread)!.sy], [-1, 0], 'y=2 ∉(3,10) ⇒ (sx,0)');
  placeAt(u, 40, 6);
  assert.deepEqual([plan(CMD.spread)!.sx, plan(CMD.spread)!.sy], [-1, -1], 'y=6 <7 ⇒ (sx,−1)');
  placeAt(u, 40, 8);
  assert.deepEqual([plan(CMD.spread)!.sx, plan(CMD.spread)!.sy], [-1, 1], 'y=8 ≥7 ⇒ (sx,+1)');

  // 集中：先归第 6 行（0043CAFE 读 0x48E4D0 = 6），到行上才是 35/5/…/5/35
  placeAt(u, 40, 6);
  const focus = plan(CMD.focus)!;
  assert.deepEqual([focus.sx, focus.sy], [-1, 0], '已在第 6 行 ⇒ 可以前压');
  assert.deepEqual(focus.w1, STEP_W_FOCUS_ROW, '0x48E898 = 35,5,5,5,5,5,5,35');
  placeAt(u, 40, 12);
  assert.deepEqual([plan(CMD.focus)!.sx, plan(CMD.focus)!.sy], [0, -1], 'y=12 ⇒ 向 −y 归行');

  // 歸陣（0043D072）：朝己方军团（主将格）
  placeAt(u, 40, 6);
  const reg = plan(CMD.regress)!;
  assert.ok(reg.sx > 0, 'A 側主将在 +x，歸陣 dx>0');
});

test('R83 基向量：主将 0..8（0x43CF8D 跳表）——3..7 空操作、後退是直线', () => {
  const w = freshWorld(315);
  const gen = generalOf(w, 'A');
  placeAt(gen, 60, 6);
  const plan = (cmd: number) => cmdStepPlan(w, 'A', gen, cmd);

  for (const cmd of [CMD.shiftUp, CMD.shiftDown, CMD.spread, CMD.focus, CMD.rush]) {
    assert.equal(plan(cmd), null, `cmd ${cmd}：0x43CF8D[3..7] 全指向 0x43CF89 直接 ret`);
  }
  const adv = plan(CMD.advance)!;
  assert.deepEqual([adv.sx, adv.sy], [-1, 0], '0043C767：主将前進 = −x');
  assert.deepEqual(adv.w1, STEP_W_STRAIGHT, '0x48E5C8 = 100,0（直线）');
  const back = plan(CMD.back)!;
  assert.deepEqual([back.sx, back.sy], [1, 0], '0043C7B5：主将後退 = +x');
  assert.deepEqual([back.w1, back.w2], [STEP_W_STRAIGHT, STEP_W_STRAIGHT], '主将後退也是 0x48E5C8 直线（R83 修正锥形误用）');
  const ret = plan(CMD.retreat)!;
  assert.equal(ret.kind, 'retreat');
});

// ---------------------------------------------------------------------------
// ⑤ 朝目标一步：两轴独立取符号（0x43C888）—— 可斜走
// ---------------------------------------------------------------------------

test('R83 0x43C888：dx、dy 各自取符号（0043C894..0043C8E1），可斜走一格', () => {
  const w = freshWorld(316);
  const u = soldiersOf(w, 'A')[0]!;
  // 前线（0x43C831：u.gx <= 敌军团.gx + 3）；敌主将在 (16,6)
  placeAt(u, 19, 9);
  const adv = cmdStepPlan(w, 'A', u, CMD.advance)!;
  assert.deepEqual([adv.sx, adv.sy], [-1, -1], '前線前進：dx=−3、dy=−3 ⇒ 斜向一格');
  assert.deepEqual(adv.w1, STEP_W_CONE, '0x48E808 第一组 = 80,10,10');

  // 歸陣同样两轴取符号：己方主将在 (55,6)
  placeAt(u, 40, 10);
  const reg = cmdStepPlan(w, 'A', u, CMD.regress)!;
  assert.deepEqual([reg.sx, reg.sy], [1, -1], '歸陣：dx=+15、dy=−4 ⇒ 斜向一格');

  // 已在目标格：0x43C2A5 索引 4、0x48E580[4] = −1 ⇒ 一项都不抽
  placeAt(u, 55, 6);
  assert.equal(cmdStepPlan(w, 'A', u, CMD.regress), null, '站在军团格上 ⇒ 无步可走');
});

// ---------------------------------------------------------------------------
// ⑥ 33 组 × 6 条表完整性（0x48EE78 执行表 198 项 / 0x48EB60 指针表 198 项）
// ---------------------------------------------------------------------------

test('R83 33 组 × 6 条：198 项、每组 6 条、第 5/6 恒全軍待機/全軍突擊', () => {
  assert.equal(FOCUS_ROW, 6, '`0043CAFE mov ecx,[0x48e4d0]`；0x48E4D0 = 6（不是 6.5）');
  let total = 0;
  for (let g = 0; g < 33; g++) {
    assert.equal(armyGroupOf(g), g, `组 ${g}：armyGroupOf 必须回同样组号`);
    const defs = armyCmdsOf(g);
    assert.equal(defs.length, 6, `组 ${g} 必须 6 条`);
    assert.deepEqual(defs.map((d) => d.slot), [0, 1, 2, 3, 4, 5], `组 ${g} 槽号 0..5`);
    for (let s = 0; s < 4; s++) assert.ok(defs[s]!.label.length > 0, `组 ${g} 槽 ${s} label 非空`);
    assert.equal(defs[4]!.label, '全軍待機', `组 ${g} 第 5 条`);
    assert.deepEqual([...defs[4]!.codes], [0], '第 5 条命令字恒 0（0x48E6A0 全 0 权重）');
    assert.equal(defs[5]!.label, '全軍突擊', `组 ${g} 第 6 条`);
    assert.deepEqual([...defs[5]!.codes], [7], '第 6 条命令字恒 7（0x444B0F）');
    total += defs.length;
  }
  assert.equal(total, 198, '33 × 6 = 198 = 0x948 / 12（串表长度）');
});

test('R83 33 组 label 直方图 = 原作串表 198 项（Big5，0x48F94C 起）', () => {
  const expected: Record<string, number> = {
    前軍前進: 21,
    全軍前進: 12,
    前軍後退: 9,
    全軍後退: 14,
    左軍前進: 3,
    右軍前進: 3,
    中軍前進: 4,
    後軍前進: 1,
    伏軍攻擊: 9,
    左右分散: 18,
    前軍分散: 6,
    前軍集中: 6,
    中央集中: 18,
    全前集中: 1,
    左右前進: 1,
    前軍上移: 3,
    前軍下移: 3,
    全軍待機: 33,
    全軍突擊: 33,
  };
  const actual = new Map<string, number>();
  for (let g = 0; g < 33; g++) {
    for (const d of armyCmdsOf(g)) actual.set(d.label, (actual.get(d.label) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries([...actual.entries()].sort()), expected);
  const sum = [...actual.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, 198);
  // 执行表 0x48EE78 的 slot0 全是 0x4449A9（33 个），但串表把其中 12 组写成「全軍前進」；
  // 本文件按串表建表，命令字相同（codes=[1]），所以行为不受影响。
  assert.equal((actual.get('前軍前進') ?? 0) + (actual.get('全軍前進') ?? 0), 33, 'slot0 33 组全是前進系');
});

// ---------------------------------------------------------------------------
// ⑦ A/B 不镜像的两种（0x43CA7B / 0x43CAB8 字节级相同）
// ---------------------------------------------------------------------------

test('R83 上移/下移在 A/B 两侧向量相同，後退互相镜像', () => {
  const w = freshWorld(317);
  const a = soldiersOf(w, 'A')[0]!;
  const b = soldiersOf(w, 'B')[0]!;
  placeAt(a, 40, 6);
  placeAt(b, 30, 6);
  for (const cmd of [CMD.shiftUp, CMD.shiftDown]) {
    const pa = cmdStepPlan(w, 'A', a, cmd)!;
    const pb = cmdStepPlan(w, 'B', b, cmd)!;
    assert.deepEqual(
      [pa.sx, pa.sy],
      [pb.sx, pb.sy],
      `cmd ${cmd}：0043CA8A / 0043CAA1 字节级相同 ⇒ A/B 不镜像`,
    );
  }
  assert.deepEqual([cmdStepPlan(w, 'A', a, CMD.back)!.sx, cmdStepPlan(w, 'B', b, CMD.back)!.sx], [1, -1], '後退 A=+x / B=−x');
  assert.deepEqual(
    [cmdStepPlan(w, 'A', a, CMD.advance)!.sx, cmdStepPlan(w, 'B', b, CMD.advance)!.sx],
    [-1, 1],
    '前進 A=−x / B=+x',
  );
});
