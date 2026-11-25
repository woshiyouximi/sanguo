/**
 * L0：并发脚本实例（`0x312 延迟调用 / 0x314 到点唤醒`）的回归测试。
 *
 * 原作里 object 可以各自挂脚本：`0x312` 是"延迟调用"——把一条脚本挂到目标身上、
 * 当场返回，之后每条脚本各跑各的（`0x4653F0` 派发、`0x467490` 建实例；
 * 见 `project/154_Hurt门与补兵语义.md` §1.5 与 `export/script/magic_so.dis.txt`
 * 的 `SYSCALL 0x312, 0x8` / `SYSCALL 0x314, 0xA`）。我们原来的 VM 是单实例顺序跑，
 * `0x312` 被降级成 `ctx.callScript()` 同步内联，于是 `LockTargetXY` 这类
 * "自己先 WAIT 随机帧、再造物件"的脚本就完全失效——受害者是 R87 旋龍、
 * 神鬼亂舞的 `LockTargetXY` 子脚本这一批（注意：7 条補兵技不走 `0x312/0x314`，
 * 它们出兵靠的是 `0x3C/0x3D` 极性与 binop 左操作数，见 `project/159` §3）。
 *
 * 这个文件用一份**手写字节码**（不依赖真技能的时序）验证四件事：
 *   1. `0x312` 真的新起一条实例，且新实例从**下一 tick** 才开始跑；
 *   2. 两条脚本能在**同一 tick** 各自推进（根实例与子实例各跑各的 WAIT）；
 *   3. `WAIT n` 在实例队列上是"挂起 n 帧后在正确 tick 唤醒"，逐 tick 递减；
 *   4. 一条脚本结束时其它脚本不受影响（根实例跑完、子实例继续跑到自己结束）。
 *
 * 顺带覆盖 `0x314`（到点唤醒，与 `0x312` 同一条宿主通路，只是 EXE 里多两个实参）。
 */
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { loadData } from '../src/data.ts';
import { createWorld, type World } from '../src/core/battle.ts';
import { setMagicProgram, startSkill, type SkillSession } from '../src/core/smartscript/runtime.ts';
import { SoProgram, type SoSymbols } from '../src/core/smartscript/so.ts';

const data = loadData();

// ── 合成程序 ────────────────────────────────────────────────────────────
//
// 手工汇编：每条指令 = 1 个 opcode 词 + 操作数词（`so.ts` 的 OPERAND_WORDS）。
// 三个入口函数都按 `scriptNum - 500` 命名，`startSkill()` 靠这个找 `MagicN`。

const OP = {
  RET: 0x02,
  SYSCALL: 0x05,
  PUSHI: 0x06,
  PUSHS: 0x07,
  POP: 0x0e,
  WAIT: 0x42,
} as const;

/** 把 `[op, ...operands]` 列表摊平成词序列。 */
function words(ops: Array<[number, ...number[]]>): number[] {
  const out: number[] = [];
  for (const [op, ...operands] of ops) out.push(op, ...operands);
  return out;
}

/**
 * Magic37（`SYSCALL 0x312` 起子脚本）：
 *   push "Child"; push 5; syscall 0x312(argc=2)  ← 名字 + 1 个实参
 *   push 2; wait                                  ← 根实例挂起 2 帧
 *   push 1; pop; ret
 * Child：
 *   push 2; wait; push 3; wait; push 1; pop; ret  ← 两段 WAIT，跨 6 个 tick
 * Magic38：同 Magic37 但走 `0x314`（到点唤醒），验证两条通路都接到实例队列。
 * Magic39：不调 `0x312`，用来证明"单实例技能仍然只有 1 条实例"。
 */
function buildProgram(): SoProgram {
  const magic37 = words([
    [OP.PUSHS, 0],
    [OP.PUSHI, 5],
    [OP.SYSCALL, 0x312, 2],
    [OP.PUSHI, 2],
    [OP.WAIT],
    [OP.PUSHI, 1],
    [OP.POP],
    [OP.RET, 0],
  ]);
  const magic38 = words([
    [OP.PUSHS, 0],
    [OP.PUSHI, 5],
    [OP.SYSCALL, 0x314, 2],
    [OP.PUSHI, 1],
    [OP.WAIT],
    [OP.PUSHI, 1],
    [OP.POP],
    [OP.RET, 0],
  ]);
  const magic39 = words([
    [OP.PUSHI, 1],
    [OP.WAIT],
    [OP.PUSHI, 1],
    [OP.POP],
    [OP.RET, 0],
  ]);
  const child = words([
    [OP.PUSHI, 2],
    [OP.WAIT],
    [OP.PUSHI, 3],
    [OP.WAIT],
    [OP.PUSHI, 1],
    [OP.POP],
    [OP.RET, 0],
  ]);

  const codeStart = 0x40;
  const bodies = [magic37, magic38, magic39, child];
  const names = ['Magic37', 'Magic38', 'Magic39', 'Child'];
  const nums = [0x1f5 + 37, 0x1f5 + 38, 0x1f5 + 39, 0];
  const bytes = new Uint8Array(codeStart + 4 * bodies.reduce((n, b) => n + b.length, 0));
  const functions: SoSymbols['functions'] = [];
  let off = codeStart;
  bodies.forEach((body, i) => {
    body.forEach((w, k) => {
      const p = off + k * 4;
      bytes[p] = w & 0xff;
      bytes[p + 1] = (w >>> 8) & 0xff;
      bytes[p + 2] = (w >>> 16) & 0xff;
      bytes[p + 3] = (w >>> 24) & 0xff;
    });
    functions.push({ idx: i, name: names[i], num: nums[i], off, argc: 0 });
    off += body.length * 4;
  });
  const sym: SoSymbols = {
    format: 'test',
    source: 'inline',
    bytes: bytes.length,
    version: 1,
    codeStart,
    codeEnd: bytes.length,
    strOff: bytes.length,
    marker: 121,
    globalSlots: 121,
    functionCount: functions.length,
    stringCount: 1,
    instructionCount: 1,
    functions,
    strings: ['Child'],
    opcodeHistogram: {},
    syscallHistogram: {},
    syscallSignatures: {},
  };
  return SoProgram.fromJson(bytes, sym);
}

/** 一片 20v20 的战场（双方主将、各 20 兵），A 主将摆在 x=24。 */
function staged(seed = 7): World {
  const world = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  assert.ok(g, 'A 方应有主将单位');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  return world;
}

/** 取一条实例的快照（按函数名找，缺了就是 bug）。 */
function inst(s: SkillSession, fn: string) {
  const found = s.instancesSnapshot().find((x) => x.fn === fn);
  assert.ok(found, `实例列表里应有 ${fn}：${JSON.stringify(s.instancesSnapshot())}`);
  return found;
}

beforeEach(() => setMagicProgram(buildProgram()));
afterEach(() => setMagicProgram(undefined));

// ── 1. 0x312 真的新起一条实例，且新实例下一 tick 才跑 ──────────────────

test('0x312 起一条子实例：当场返回、子实例从下一 tick 才开始跑', () => {
  const world = staged();
  const s = startSkill(world, 'A', 537, 24, 6.5);

  assert.equal(s.instanceCount, 2, '根实例 + 0x312 起的 Child');
  const root = inst(s, 'Magic37');
  const child = inst(s, 'Child');
  assert.equal(root.started, true, '根实例第 0 帧必须已经跑过');
  assert.equal(root.pending, 2, '根脚本 push 2 / wait ⇒ 挂起 2 帧');
  assert.equal(child.started, false, '新起的实例不在同一 tick 里跑（原作的 0x312 只是挂脚本）');
  assert.equal(child.steps, 0);
  // 子实例待唤醒 0 帧 ⇒ 整个会话本 tick 不等，下一 tick 立刻推进
  assert.equal(s.pendingFrames, 0);

  const childSteps0 = child.steps;
  s.advance();
  const child2 = inst(s, 'Child');
  assert.equal(child2.started, true, '下一 tick 子实例开跑');
  assert.ok(child2.steps > childSteps0, '子实例应执行了指令');
  assert.equal(child2.pending, 2, 'Child 的第一段 push 2 / wait');
  assert.equal(inst(s, 'Magic37').steps, root.steps, '根实例这 tick 还在挂起，指令数不变');
  assert.equal(s.pendingFrames, 2);
});

// ── 2. 两条脚本同 tick 各自推进 ────────────────────────────────────────

test('两条脚本在同一 tick 各自推进（不是一条跑完再跑下一条）', () => {
  const world = staged();
  const s = startSkill(world, 'A', 537, 24, 6.5);

  // tick 1：只有 Child 在跑（根实例 wait 2 跳过）⇒ 两边 pending 都归到 2
  s.advance();
  const frameAfterFirst = s.frames.length;
  assert.equal(inst(s, 'Magic37').pending, 2);
  assert.equal(inst(s, 'Child').pending, 2);

  // tick 2 只递减等待计数，不跑脚本
  s.advance();
  assert.equal(inst(s, 'Magic37').pending, 1);
  assert.equal(inst(s, 'Child').pending, 1);
  assert.equal(s.frames.length, frameAfterFirst, '还在 WAIT 挂起中，本 tick 不应产出新帧');

  // tick 3：两边 pending 同时归零 ⇒ 同一次 advance() 里两条实例各推进一步
  const before = { root: inst(s, 'Magic37').steps, child: inst(s, 'Child').steps };
  s.advance();
  const rootAfter = inst(s, 'Magic37');
  const childAfter = inst(s, 'Child');
  assert.ok(rootAfter.steps > before.root, '根实例这一 tick 应推进');
  assert.ok(childAfter.steps > before.child, '子实例同一 tick 也应推进');
  assert.equal(s.frames.length, frameAfterFirst + 1, '同 tick 的两条实例只产出一帧统计');
});

// ── 3. WAIT n = 挂起 n 帧，到点唤醒 ────────────────────────────────────

test('0x312 起的子实例：WAIT 3 之后在第 3 个 tick 唤醒', () => {
  const world = staged();
  const s = startSkill(world, 'A', 537, 24, 6.5);

  s.advance(); // Child 开跑 → 第一段 wait 2
  assert.equal(inst(s, 'Child').pending, 2);
  s.advance(); // → 1
  s.advance(); // → 0，本 tick 跑第二段：push 3 / wait ⇒ 3
  const afterWake = inst(s, 'Child');
  assert.equal(afterWake.pending, 3, '第二段 wait 3');
  const stepsAtWake = afterWake.steps;

  // 接下来 3 个 tick 只递减，不跑
  for (const expect of [2, 1]) {
    s.advance();
    assert.equal(inst(s, 'Child').pending, expect, `等待计数应逐 tick 递减到 ${expect}`);
    assert.equal(inst(s, 'Child').steps, stepsAtWake, '挂起期间不执行指令');
  }
  s.advance();
  assert.equal(inst(s, 'Child').pending, 0);
  assert.ok(inst(s, 'Child').steps > stepsAtWake, '归零那一 tick 必须真的跑起来（到点唤醒）');
});

// ── 4. 一条脚本结束，其它脚本不受影响 ──────────────────────────────────

test('根实例跑完不影响子实例，会话要等最后一条实例结束', () => {
  const world = staged();
  const s = startSkill(world, 'A', 537, 24, 6.5);

  s.advance();
  s.advance();
  const framesBefore = s.frames.length;
  s.advance(); // 两边同时醒来：根实例 ret 结束，子实例进第二段 wait 3
  assert.equal(inst(s, 'Magic37').done, true, '根实例应已结束');
  assert.equal(inst(s, 'Child').done, false, '子实例不受影响，仍在跑');
  assert.equal(s.done, false, '还有子实例 ⇒ 会话不能结束');
  assert.equal(s.frames.length, framesBefore + 1, '根实例结束那一 tick 仍然记一帧');

  // 子实例自己再走完：wait 3 → 收尾
  let guard = 0;
  while (!s.done && guard++ < 32) s.advance();
  assert.equal(s.done, true, '子实例跑完后会话才结束');
  assert.equal(s.ok, true, `会话不应带错误：${s.reason}`);
  assert.equal(inst(s, 'Child').done, true);
});

// ── 5. 0x314 与 0x312 走同一条宿主通路 ─────────────────────────────────

test('0x314（到点唤醒）同样接到实例队列', () => {
  const world = staged();
  const s = startSkill(world, 'A', 538, 24, 6.5);
  assert.equal(s.instanceCount, 2, '0x314 也应新起一条实例');
  assert.equal(inst(s, 'Child').started, false);
  s.advance();
  assert.equal(inst(s, 'Child').started, true);
});

// ── 6. 不调 0x312 的技能仍然是单实例（旧行为不变） ────────────────────

test('不调 0x312/0x314 的技能恒为单实例，WAIT 语义与旧单实例一致', () => {
  const world = staged();
  const s = startSkill(world, 'A', 539, 24, 6.5);
  assert.equal(s.instanceCount, 1);
  assert.equal(inst(s, 'Magic39').pending, 1, 'push 1 / wait');
  assert.equal(s.pendingFrames, 1);
  const steps0 = inst(s, 'Magic39').steps;
  s.advance(); // 递减到 0
  s.advance(); // 醒来跑完
  assert.ok(inst(s, 'Magic39').steps > steps0);
  assert.equal(s.done, true);
});
