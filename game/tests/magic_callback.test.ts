/**
 * R163：物件碰撞回调通路 + 引擎变量（G5）语义的回归测试。
 *
 * 三件事各自钉一根桩：
 *   1. `obj[+0x98]` 碰撞回调（原作 `0x40AA82..0x40ABC5` → `0x41F740(owner, obj[+0x98], obj, victim)`）
 *      真的被逐次触发：神鬼亂舞(104) 的 `DemonDancingCallback`（`func #147 @0x14C70`）会反复
 *      `CALL Hurt`，命中数因此回到多目标。
 *   2. G5 = **施法方阵营 0/1**（原作 `0x43BA59`@`0x43BAA2-0x43BAB7`），不是句柄、不是朝向。
 *      同一技法从 A 侧打 g5=0、从 B 侧打 g5=1。
 *   3. `0x12A`/`0x12B` = 矩形内阵营单位计数 / 第 i 个（原作 `0x43EEA9`→`0x402920`、
 *      `0x43EEE8`→`0x4029CB`），不再是"造一个物件返回 1"。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/magic_callback.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { createWorld, type Side, type World } from '../src/core/battle.ts';
import { runSkill } from '../src/core/smartscript/runtime.ts';
import { ScriptVm, type Slot, type SlotType } from '../src/core/smartscript/vm.ts';
import { dispatchSyscall, type SkillObject, type SyscallContext } from '../src/core/smartscript/syscalls.ts';
import { resetAudioBus, setAudioSink } from '../src/core/audio_bus.ts';

const data = loadData();

/** 同 smartscript.test.ts 的 `staged()`：A 主将贴到 (24,6.5)，双方各 20 兵，seed 固定。 */
function staged(seed = 7): World {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g);
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

/**
 * 让 `DemonDancing` 走**主段**（原作 `magic_so.dis.txt:15108-1511C` 的门：落点前方那格
 * 必须是 `g3` = 对面主将）。端口把 G3 定义成对面主将，所以把 B 主将摆到 A 主将正前方
 * 一格（x=23, y=6）即可进门；门内才有 20 次 `0x314 LockTargetXY` + 收尾 1 次，共 21 个
 * 挂了 `14001` 回调的物件。
 */
function stagedMainBranch(seed = 7): World {
  const world = staged(seed);
  const b = world.units.find((u) => u.isGeneral && u.side === 'B');
  assert.ok(b);
  b.x = 23;
  b.y = 6.5;
  b.prevX = b.x;
  b.prevY = b.y;
  return world;
}

function scriptOf(seq: number): number {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `找不到第 ${seq} 号技能`);
  return m.SCRIPT;
}

/** `runSkill` 的 trace 钩子（`SkillWorldOptions.trace`，`vm.ts:389` 对每次 CALL 打一行）。 */
function traced(world: World, side: Side, script: number): { lines: string[]; run: ReturnType<typeof runSkill> } {
  const lines: string[] = [];
  const run = runSkill(world, side, script, 20, 6.5, { trace: (t) => lines.push(t) });
  return { lines, run };
}

// ── 1. 碰撞回调通路 ────────────────────────────────────────────────────

test('R163 神鬼亂舞(104) 靠物件碰撞回调打出多目标（Hurt 被逐次调用）', () => {
  const world = stagedMainBranch();
  const hp0 = world.sides.B.general.hp;

  const { lines, run } = traced(world, 'A' as Side, scriptOf(104));
  assert.equal(run.ok, true, `104 应运行成功：${run.log.join(' | ')}`);

  // 回调脚本 `DemonDancingCallback`（func #147 @0x14C70）的体是
  // `LDSL arg2 / LDSL arg1 / LDSG g16 / CALL Hurt` ⇒ 每触发一次就有一行 `CALL Hurt`。
  const hurts = lines.filter((l) => l.startsWith('CALL Hurt'));
  assert.ok(hurts.length >= 3, `碰撞回调应至少触发 3 次，实际 ${hurts.length} 次 CALL Hurt`);
  assert.equal(hurts.length, 21, `主段共 21 个挂了 14001 回调的物件，每次命中调一次 Hurt（实际 ${hurts.length}）`);

  assert.ok(run.stats.hits >= 3, `多目标命中应 >= 3，实际 ${run.stats.hits}`);

  const fx = world.fx.at(-1);
  assert.ok(fx);
  assert.equal(fx.kind, 'aoe', `多目标命中应归 aoe，实际 ${fx.kind}`);
  assert.ok(fx.r >= 3.6, `aoe 半径应 3.6，实际 ${fx.r}`);

  // 回调走的是伤害而不是治疗（`0x125` 的实参是正伤害量，端口按负数差值结算）
  assert.equal(run.stats.healed, 0, `碰撞回调不该产生治疗，实际 healed=${run.stats.healed}`);
  // 20 次 × 2 点 + 收尾 1 次 × 20 点 = 60（g16 在 0x2C 挂回调那一刻被冻结成 cbDamage）
  assert.equal(hp0 - world.sides.B.general.hp, 60, `B 主将应掉 60 点（20×2 + 20）`);
});

test('R163 碰撞回调只结算敌方单位（友军不会被回调打）', () => {
  const world = stagedMainBranch();
  const aGeneralHp0 = world.sides.A.general.hp;
  const aSoldiers = world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length;
  const run = runSkill(world, 'A' as Side, scriptOf(104), 20, 6.5);
  assert.equal(run.ok, true);
  assert.equal(world.sides.A.general.hp, aGeneralHp0, '施法方主将不该被自己的回调打');
  assert.equal(
    world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length,
    aSoldiers,
    '施法方士兵不该被自己的回调打',
  );
});

// ── 2. G5 = 阵营 0/1 ───────────────────────────────────────────────────

function g5Writes(side: Side, seq: number, world = staged()): number[] {
  const proto = ScriptVm.prototype as unknown as { setEngineValue(i: number, v: number): void };
  const orig = proto.setEngineValue;
  const writes: number[] = [];
  proto.setEngineValue = function (this: unknown, i: number, v: number) {
    if (i === 5) writes.push(v);
    orig.apply(this, [i, v]);
  };
  try {
    const r = runSkill(world, side, scriptOf(seq), 20, 6.5);
    assert.equal(r.ok, true, `技能 ${seq} 应跑通：${r.log.join(' | ')}`);
  } finally {
    proto.setEngineValue = orig;
  }
  return writes;
}

test('R163 G5 在伤害路径上取 0/1（A 方 0、B 方 1），不是句柄也不是朝向', () => {
  const a = g5Writes('A', 104);
  const b = g5Writes('B', 104);
  assert.deepEqual([...new Set(a)], [0], `A 方 g5 应恒为 0（原作 0x43BAAB），实际 ${a.join(',')}`);
  assert.deepEqual([...new Set(b)], [1], `B 方 g5 应恒为 1（原作 0x43BAB7），实际 ${b.join(',')}`);
});

test('R163 G5 恰好是 0/1：治疗技与伤害技取同一口径（不再写施法者句柄）', () => {
  const seen: number[] = [];
  for (const seq of [1, 60, 104, 49]) seen.push(...g5Writes('A', seq));
  assert.ok(seen.length > 0, '应有 g5 写入');
  for (const v of seen) assert.ok(v === 0 || v === 1, `g5 只能是 0/1，实际 ${v}`);
  assert.deepEqual([...new Set(seen)], [0], 'A 方施法全程 g5 恒 0');
});

// ── 3. 0x12A / 0x12B = 矩形内阵营单位计数 / 第 i 个 ─────────────────────

function fakeCtx(rectUnits: number[]): {
  ctx: SyscallContext;
  spawned: number[];
  rectCalls: Array<[number, number, number, number, number]>;
} {
  const spawned: number[] = [];
  const rectCalls: Array<[number, number, number, number, number]> = [];
  const ctx = {
    unitsInRect: (camp: number, x0: number, y0: number, x1: number, y1: number) => {
      rectCalls.push([camp, x0, y0, x1, y1]);
      return rectUnits;
    },
    spawnObject: (resource: number) => {
      spawned.push(resource);
      return { handle: 999, resource, x: 0, y: 0, z: 0 } as unknown as SkillObject;
    },
    trace: () => {},
    markUnimplemented: () => {},
  } as unknown as SyscallContext;
  return { ctx, spawned, rectCalls };
}

const slot = (value: number): Slot => ({ value, type: 0 as SlotType });
const val = (s: unknown) => (s as { value: number }).value;

test('R163 0x12A 返回矩形内阵营单位数（原作 0x43EEA9 → 0x402920），不造物件', () => {
  const { ctx, spawned, rectCalls } = fakeCtx([11, 22, 33]);
  const ret = val(dispatchSyscall(ctx, 0x12a, [slot(1), slot(20), slot(6), slot(4), slot(2)]));
  assert.equal(ret, 3, `0x12A 应返回矩形内单位个数 3，实际 ${ret}`);
  assert.deepEqual(rectCalls, [[1, 16, 4, 24, 8]], '矩形 = (cx±hw, cy±hh)，camp 原样透传');
  assert.deepEqual(spawned, [], '0x12A 不该造物件（旧实现 spawnObject + return 1）');
});

test('R163 0x12B 返回矩形内第 i 个单位（原作 0x43EEE8 → 0x4029CB），下标越界给 0', () => {
  const { ctx, spawned } = fakeCtx([7, 8, 9]);
  const base = [slot(1), slot(20), slot(6), slot(4), slot(2)];
  assert.equal(val(dispatchSyscall(ctx, 0x12b, [...base, slot(0)])), 7);
  assert.equal(val(dispatchSyscall(ctx, 0x12b, [...base, slot(2)])), 9);
  assert.equal(val(dispatchSyscall(ctx, 0x12b, [...base, slot(3)])), 0, '越界应回落 0');
  assert.equal(val(dispatchSyscall(ctx, 0x12b, [...base, slot(-1)])), 0, '负数下标应回落 0');
  assert.deepEqual(spawned, [], '0x12B 不该造物件');
});

test('R163 0x12A 在真实战场上真的数到敌方单位（地泉系列 230 档靠它进循环）', () => {
  // `CreateSpoutAround`（`func #222 @0x23438`）里 `loc6 = 0x12A(g5^1, ...)`；loc6>0 才走
  // 「对每个单位 CreateSpout」的分支，230 音量（dis:20222）就在那条分支里。
  // 用 seq 18（脚本 516 = Magic16 → Spout(1) ⇒ CreateSpoutAround 主循环 2 趟）钉住这点：
  // 只要矩形计数回归成 0，这条技能就再也发不出 230（见 work/163_probe_seq3_volume.mjs）。
  const { resetAudioBus: resetBus, setAudioSink: sink } = { resetAudioBus, setAudioSink };
  const vols: number[] = [];
  resetBus();
  sink({
    sfx: (name: string, opts?: { volume?: number }) => {
      if (name === 'm026snd01') vols.push(Math.round((opts?.volume ?? 0) * 255));
    },
    magic: () => {},
    flash: () => {},
    brightness: () => {},
  } as never);
  const run = runSkill(staged(), 'A' as Side, scriptOf(18), 20, 6.5);
  assert.equal(run.ok, true);
  assert.ok(vols.length >= 2, `seq 18 应发出多档 m026snd01，实际 ${vols.join(',')}`);
  assert.ok(vols.includes(230), `seq 18 应出现 230 档（CreateSpoutAround 主循环内），实际 ${vols.join(',')}`);
  assert.ok(vols.includes(200), `入口的 200 档也应保留，实际 ${vols.join(',')}`);
});
