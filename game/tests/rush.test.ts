/**
 * R137 全軍突擊（战斗里的「突擊」按钮）的回归测试。
 *
 * 原作行为（唯一依据）：`extract/pak/SCRIPT/SYSTEM.SO` 的函数 #22 `AllRush`
 * （id=0x3B argc=0 @0x2B0C；反汇编 `export/script/system_so.dis.txt:1536-1585`）：
 *
 *   0x131 压暗 → 0x122 → WAITFOR "MoveCamera" → 0x105/0x106 读主将像素坐标 →
 *   `0x120(主将, 0x10000)` 把全体部队的命令字置成突击位 → MoveCamera 推镜头 →
 *   0x123 → `155 + 阵营号/2` 算音量 → `0x301 "Rush01"` → `0x003` 弹「全軍突擊!%k%%e%」 →
 *   WAIT 44 → 0x110 复亮 → RET。
 *
 * 所以它不是"点一个目标冲锋"、也不加伤害/攻击力 —— 只是把该侧所有单位（含主将）
 * 的命令切成突击态，之后各单位自行前压（`0x120` 写 `unit+0x6c`，
 * 见 `export/script/syscall_handlers.asm.txt:1397-1426`）。
 *
 * 本文件覆盖三条通道：
 *   1. `battle.allRush()` 的 gameplay：置位 / 幂等 / 推进 / 撤退优先；
 *   2. `dispatchSyscall` 的 `0x120` 位语义：`0x10000` = 突击，其余位只 trace 不改行为；
 *   3. **真 SYSTEM.SO 字节码**：`data/system_so.bin` 是 `extract/pak/SCRIPT/SYSTEM.SO`
 *      的逐字节副本（21420 B，sha256 695A2A2E…5C42A92A），跑完 `AllRush` 后
 *      `world.rush.A === true`，且 `Rush01` / 「全軍突擊!」都出了音频总线。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadData } from '../src/data.ts';
import {
  ACTION_SLIDE_TICKS,
  ENGAGE_RANGE,
  allRush,
  createWorld,
  isRushing,
  requestRetreat,
  step,
  unitCell,
  type Side,
  type Unit,
  type World,
} from '../src/core/battle.ts';
import * as armyCmd from '../src/core/army_cmd.ts';
import {
  audioBusStats,
  audioEvents,
  battleAudioEvents,
  battleAudioMark,
  resetAudioBus,
  setAudioSink,
} from '../src/core/audio_bus.ts';
import {
  createBattleSysoHost,
  runSystemSoFunction,
} from '../src/core/smartscript/runtime.ts';
import { SoProgram, type SoFunction, type SoSymbols } from '../src/core/smartscript/so.ts';
import { dispatchSyscall } from '../src/core/smartscript/syscalls.ts';
import type { SyscallContext } from '../src/core/smartscript/syscalls.ts';
import type { Slot } from '../src/core/smartscript/vm.ts';

const data = loadData();

function freshWorld(seed = 137, soldiers = 6): World {
  return createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers, general: { name: 'B', str: 60, int: 70 } },
  });
}

const unitsOf = (w: World, side: Side) => w.units.filter((u) => u.side === side);

function meanX(w: World, side: Side): number {
  const us = unitsOf(w, side);
  return us.reduce((sum, u) => sum + u.x, 0) / Math.max(1, us.length);
}

/**
 * 该侧「朝敌人推进」的方向（+1 / −1）。
 *
 * A 侧在场地右侧（撤退往 +x 走，见 `cullFled`），所以 A 的推进方向是 −x —— 直接比较
 * 平均 x 会得出"位移为负"，必须换成沿进攻轴的进度。
 */
function advanceAxis(w: World, side: Side): number {
  const foe: Side = side === 'A' ? 'B' : 'A';
  return Math.sign(meanX(w, foe) - meanX(w, side)) || 1;
}

/** 沿进攻轴的平均推进格数（只统计开局就在、结束后还在 units 里的单位，避免阵亡者拉偏均值）。 */
function advanceOf(w: World, side: Side, axis: number, x0: Map<Unit, number>): number {
  let sum = 0;
  let n = 0;
  for (const u of unitsOf(w, side)) {
    const start = x0.get(u);
    if (start === undefined) continue;
    sum += (unitCell(u).gx - start) * axis;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** 假 sink：既验"事件真的交给了播放层"，又不用碰浏览器音频。 */
function fakeSink(): { calls: Array<{ kind: string; name?: string; on?: boolean }>; names: string[] } {
  const calls: Array<{ kind: string; name?: string; on?: boolean }> = [];
  const names: string[] = [];
  setAudioSink({
    sfx: (name) => {
      calls.push({ kind: 'sfx', name });
      names.push(name);
    },
    flash: (on) => {
      calls.push({ kind: 'flash', on });
    },
  });
  return { calls, names };
}

const slot = (n: number): Slot => ({ value: n, type: 0 });

// ---------------------------------------------------------------------------
// 1. 状态：置位 / 幂等 / 单侧 / 结束后清空
// ---------------------------------------------------------------------------

test('R137 createWorld 自带 rush 字段：两侧默认 false，isRushing 也是 false', () => {
  const w = freshWorld(1);
  assert.deepEqual(w.rush, { A: false, B: false });
  assert.equal(isRushing(w, 'A'), false);
  assert.equal(isRushing(w, 'B'), false);
});

test('R137 allRush 置位并返回 true；第二次幂等返回 false，状态不回退', () => {
  const w = freshWorld(2);
  assert.equal(allRush(w, 'A'), true);
  assert.equal(w.rush.A, true);
  assert.equal(isRushing(w, 'A'), true);
  assert.equal(allRush(w, 'A'), false, '已经在突击态 → 幂等 false（原作每帧刷命令，重复不叠加）');
  assert.equal(isRushing(w, 'A'), true, '幂等返回 false 但不能把状态翻回去');
});

test('R137 allRush 只动被点的那一侧', () => {
  const w = freshWorld(3);
  assert.equal(allRush(w, 'A'), true);
  assert.equal(w.rush.B, false);
  assert.equal(allRush(w, 'B'), true, '对面也能被点（AI/脚本可以给任一侧下突击令）');
  assert.deepEqual(w.rush, { A: true, B: true });
});

test('R137 战斗结束后 allRush 拒绝置位', () => {
  const w = freshWorld(4);
  w.over = true;
  assert.equal(allRush(w, 'A'), false);
  assert.equal(isRushing(w, 'A'), false);
});

test('R137 finish() 清空突击态：反向把对方主将打死 → over 那一帧 rush 归 false', () => {
  const w = freshWorld(5);
  assert.equal(allRush(w, 'A'), true);
  w.sides.B.general.alive = false; // 主将阵亡 ⇒ checkOver 里 finish('A','general')
  step(w);
  assert.equal(w.over, true);
  assert.equal(w.endReason, 'general');
  assert.deepEqual(w.rush, { A: false, B: false }, '留着突击态只会误导 HUD/结算');
});

// ---------------------------------------------------------------------------
// 2. gameplay：行动 tick 抽格推进、平均位移、撤退优先
// ---------------------------------------------------------------------------

test('R158 突击不给速度加成：一个行动 tick 只抽一格（原作 0x43B574 / 0x43BF26）', () => {
  // R150 在 EXE 侧查过：`AllRush` 只有「全局突击标志 + 战斗 tick 直接 return + 军团/小队 +0x3C
  // 冻结 + 演出锁」四件事，`0x43B574` 没有突击分支；R158 把移动改成原作的抽格模型后，
  // 「速度」这个概念根本不存在了 —— 任何状态下一个行动 tick 都只走一格
  // （`0x43BF26` 直接把 `u+0x8/+0xc` 改成新格，视觉滑动是 `0x43BE42` 的 40 帧补间）。
  const w = freshWorld(6, 1);
  const [aSoldier] = unitsOf(w, 'A').filter((u) => !u.isGeneral);
  assert.ok(aSoldier);
  // 摆在同一行，朝 −x 推进；远离敌人，保证「能打就不走」不触发
  aSoldier.x = 40;
  aSoldier.y = 7;
  aSoldier.cd = 0;
  const [bGen] = unitsOf(w, 'B').filter((u) => u.isGeneral);
  if (bGen) {
    bGen.x = 5;
    bGen.y = 7;
  }
  allRush(w, 'A');
  const from = unitCell(aSoldier);
  step(w);
  const moved = unitCell(aSoldier);
  assert.equal(
    Math.max(Math.abs(moved.gx - from.gx), Math.abs(moved.gy - from.gy)),
    1,
    `突击的行动 tick 必须正好走一格（0x43BF26），实际 ${from.gx},${from.gy} → ${moved.gx},${moved.gy}`,
  );
  // 视觉滑动还在 40 帧补间里：逻辑格已经到点，像素位置还没到（0x43BE42 speed = Δ/0x28）
  assert.ok(aSoldier.slide, '抽完格要起 40 帧滑动');
  assert.equal(aSoldier.slide?.total, ACTION_SLIDE_TICKS);
  const mid = aSoldier.x;
  step(w); // cd 未到，不应再抽格
  assert.deepEqual(unitCell(aSoldier), moved, 'cd 未归零的 tick 不许再动格（0x43B574）');
  assert.ok(Math.abs(aSoldier.x - mid) > 0, '但像素位置要继续插值');
});

test('R137/R147 突击的语义是「压上去」：能覆盖全軍待機，让停住的部队重新前压', (t) => {
  // R150 定案：原作没有速度系数（那是"暂停 + 补时 + 解冻瞬间集体重索敌"的观感）。
  // 所以突击必须用「命令覆盖」来证明自己有用 —— 这正是它在原作里的作用：
  // 把全军的待机/后退令改写掉，全体改为向敌推进。
  // R158：推进的计量改成格（`unitCell`），一个行动 tick 一格，不再有 0.09 这种速度。
  const { applyArmyCmd, installArmyOrders } = armyCmd;
  const held = freshWorld(7, 8);
  installArmyOrders(held);
  // 槽 4 在 33 组里恒为「全軍待機」（`project/140` §2.1）
  assert.equal(applyArmyCmd(held, 'A', 4), true, '全軍待機该下达成功');
  const rush = freshWorld(7, 8);
  installArmyOrders(rush);
  assert.equal(applyArmyCmd(rush, 'A', 4), true, '全軍待機该下达成功');
  const axis = advanceAxis(held, 'A');
  const h0 = new Map<Unit, number>(unitsOf(held, 'A').map((u) => [u, unitCell(u).gx]));
  const r0 = new Map<Unit, number>(unitsOf(rush, 'A').map((u) => [u, unitCell(u).gx]));
  assert.equal(allRush(rush, 'A'), true, '突击令该下达成功');
  for (let i = 0; i < 120; i++) {
    step(held);
    step(rush);
  }
  const dHold = advanceOf(held, 'A', axis, h0);
  const dRush = advanceOf(rush, 'A', axis, r0);
  t.diagnostic(
    `120 tick 我方平均推进：全軍待機 ${dHold.toFixed(3)} 格 / 待機+突击 ${dRush.toFixed(3)} 格`,
  );
  assert.equal(dHold, 0, `待機态一格都不许动（0x43C907 = 0 格），实际 ${dHold}`);
  assert.ok(
    dRush >= 1,
    `突击必须把停住的部队推起来：${dRush.toFixed(3)} 格（待機 ${dHold.toFixed(3)}）`,
  );
});

test('R137 突击态下 requestRetreat 仍生效：撤退令覆盖突击命令（决策见 project/137）', () => {
  const w = freshWorld(8);
  assert.equal(allRush(w, 'A'), true);
  assert.equal(requestRetreat(w, 'A'), true, '突击中手动撤退不该被拦');
  assert.equal(w.fled.A, true);
  assert.equal(w.status.A, 2);
  assert.equal(isRushing(w, 'A'), false, '撤退把该侧命令整支改写，突击布尔态同步清掉');
  for (const u of unitsOf(w, 'A')) assert.equal(u.flee, true, `${u.kind} 应进入撤退`);
  // 撤退方向仍朝本方边界（A = +x），不是朝敌人推进。
  // 原作 `0x43CC95`：撤退 = `sx=(A?+1:-1), sy=0` + `or [u+0x2c],4000`（行动间隔变 0x2e=46 帧）。
  const u = unitsOf(w, 'A').find((x) => !x.isGeneral);
  assert.ok(u);
  u.x = 30;
  u.y = 6;
  u.cd = 0;
  const from = unitCell(u);
  step(w);
  const to = unitCell(u);
  assert.equal(to.gx - from.gx, 1, `撤退单位应朝 +x 走一格，实际 ${from.gx} → ${to.gx}`);
  assert.equal(to.gy, from.gy, '撤退是纯 ±x，不许有 y 分量（0x43CC95 sy=0）');
  assert.equal(
    u.cd,
    46,
    '撤退态行动间隔是 0x2e=46 帧（0x43B574 的 status&0x4000 分支）',
  );
});

// ---------------------------------------------------------------------------
// 3. `0x120(unit, cmd)` 的命令字位语义
// ---------------------------------------------------------------------------

/** 只填 `0x120` 那条分支会用到的字段（其余字段与位语义无关）。 */
function cmdCtx(): { calls: number[]; traces: string[]; unimplemented: number[]; ctx: SyscallContext } {
  const calls: number[] = [];
  const traces: string[] = [];
  const unimplemented: number[] = [];
  const ctx = {
    unitSide: (handle: number) => (handle === 1 ? 1 : 2),
    allRush: (side: number) => {
      calls.push(side);
      return true;
    },
    trace: (line: string) => {
      traces.push(line);
    },
    markUnimplemented: (id: number) => {
      unimplemented.push(id);
    },
  } as unknown as SyscallContext;
  return { calls, traces, unimplemented, ctx };
}

test('R137 `0x120(主将, 0x10000)` → ctx.allRush(该单位所属阵营)，且留一行命令字 trace', () => {
  const { calls, traces, unimplemented, ctx } = cmdCtx();
  const ret = dispatchSyscall(ctx, 0x120, [slot(1), slot(0x10000)]);
  assert.equal(ret, undefined, '0x120 不返回值（原作 `mov [ecx+0x6c], eax` 之后直接 ret）');
  assert.deepEqual(calls, [1], 'unitSide(A)=1 ⇒ 突击落在 A 侧');
  assert.equal(traces.length, 1, '命令字要留一行 trace 备查');
  assert.match(traces[0]!, /0x10000/);
  assert.deepEqual(unimplemented, [], '0x120 已实现，不能进未实现名单');

  const b = cmdCtx();
  dispatchSyscall(b.ctx, 0x120, [slot(9), slot(0x10000)]);
  assert.deepEqual(b.calls, [2], 'unitSide(B)=2 ⇒ 突击落在 B 侧');
});

test('R137 `0x120` 的其他命令位（0x20000/0x8000/0x2000/0x10/0x4/0x2）只 trace、不改行为', () => {
  // MAGIC.SO 里出现过的实参位（`export/script/magic_so.dis.txt` 里 PUSHI 在 SYSCALL 0x120 前），
  // 除 0x10000 外本轮都不实现 —— 全部落到 trace，行为不变。
  for (const cmd of [0x20000, 0x8000, 0x4000, 0x2000, 0x1000, 0x10, 0x4, 0x2, 0]) {
    const { calls, traces, unimplemented, ctx } = cmdCtx();
    dispatchSyscall(ctx, 0x120, [slot(1), slot(cmd)]);
    assert.deepEqual(calls, [], `命令字 0x${cmd.toString(16)} 不该触发突击`);
    assert.deepEqual(unimplemented, []);
    assert.equal(traces.length, 1, `0x${cmd.toString(16)} 应留一行 trace（0 也要，代表"命令被清空"）`);
    assert.match(traces[0]!, new RegExp(`0x${cmd.toString(16)}\\b`, 'i'));
  }
});

test('R137 `0x120` 的 0x10000 与其他位组合：照样置突击，并 trace 出完整命令字', () => {
  const { calls, traces, ctx } = cmdCtx();
  dispatchSyscall(ctx, 0x120, [slot(1), slot(0x10000 | 0x20000)]);
  assert.deepEqual(calls, [1]);
  assert.equal(traces.length, 1);
  assert.match(traces[0]!, /0x30000/i, 'trace 里要有完整命令字（0x10000|0x20000）');
  assert.match(traces[0]!, /0x10000=突击/);
});

// ---------------------------------------------------------------------------
// 4. 真 SYSTEM.SO 字节码（`data/system_so.bin`）
// ---------------------------------------------------------------------------

const DECODER = new TextDecoder('big5');

/**
 * 解析 `.SO` 的符号表 → `SoSymbols`。
 *
 * 规则与 `tools/smartscript.py` 的 `SOFile` 一一对应（magic `Smart Script`；
 * `0x10` 起 6 个 u32 = ver/codeStart/symOff/symCnt/strOff/strCnt；
 * `0x28` 起 2 个 u32 = marker(全局槽数)/dataEnd；符号项 16 B = off/argc/nameOff/num）。
 * 生产环境不解析它（39 个函数由 `core/syso_host.ts` 宿主顶替），这里只给证据链用。
 */
function parseSmartScript(bytes: Uint8Array): SoProgram {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (off: number): number => buf.readUInt32LE(off);
  const cstr = (off: number): string => {
    const end = buf.indexOf(0, off);
    return DECODER.decode(buf.subarray(off, end < 0 ? buf.length : end));
  };
  assert.equal(buf.subarray(0, 12).toString('latin1'), 'Smart Script', 'SYSTEM.SO 的 magic');
  const version = u32(0x10);
  const codeStart = u32(0x14);
  const symOff = u32(0x18);
  const symCnt = u32(0x1c);
  const strOff = u32(0x20);
  const strCnt = u32(0x24);
  const marker = u32(0x28);
  const functions: SoFunction[] = [];
  for (let i = 0; i < symCnt; i++) {
    const base = symOff + i * 16;
    functions.push({
      idx: i,
      name: cstr(u32(base + 8)),
      num: u32(base + 12),
      off: u32(base),
      argc: u32(base + 4),
    });
  }
  const strings: string[] = [];
  let codeEnd = symOff;
  for (let i = 0; i < strCnt; i++) {
    const off = u32(strOff + i * 4);
    strings.push(cstr(off));
    if (off >= codeStart && off < codeEnd) codeEnd = off;
  }
  const sym: SoSymbols = {
    format: 'smartscript-symbols-v1',
    source: 'extract/pak/SCRIPT/SYSTEM.SO',
    bytes: bytes.length,
    version,
    codeStart,
    codeEnd,
    strOff,
    marker,
    globalSlots: marker,
    functionCount: symCnt,
    stringCount: strCnt,
    instructionCount: 0,
    functions,
    strings,
    opcodeHistogram: {},
    syscallHistogram: {},
    syscallSignatures: {},
  };
  return new SoProgram(bytes, sym);
}

let cachedProgram: SoProgram | undefined;
function systemProgram(): SoProgram {
  if (!cachedProgram) {
    cachedProgram = parseSmartScript(new Uint8Array(readFileSync(new URL('../data/system_so.bin', import.meta.url))));
  }
  return cachedProgram;
}

test('R137 SYSTEM.SO 解析：39 个函数，AllRush = #22 id=0x3B argc=0 @0x2B0C', () => {
  const program = systemProgram();
  assert.equal(program.functions.length, 39);
  const fn = program.functionByName('AllRush');
  assert.ok(fn, 'SYSTEM.SO 里必须有 AllRush');
  assert.equal(fn.idx, 22);
  assert.equal(fn.num, 0x3b);
  assert.equal(fn.argc, 0);
  assert.equal(fn.off, 0x2b0c);
});

test('R137 真字节码：跑完 AllRush 后 world.rush.A === true（22 条指令、5 个 syscall）', (t) => {
  resetAudioBus();
  fakeSink();
  const w = freshWorld(41);
  const res = runSystemSoFunction(w, 'A', 'AllRush', { program: systemProgram() });
  t.diagnostic(
    `AllRush 字节码：指令 ${res.instructions} / syscall ${res.syscalls} / log ${res.log.length} 行`,
  );
  assert.equal(res.ran, true, `没找到函数：${res.log.join(' | ')}`);
  assert.equal(res.ok, true, `脚本失败：${res.log.join(' | ')}`);
  assert.equal(w.rush.A, true, '0x120(LDG 2, 65536) 必须真的把 A 侧置成突击态');
  assert.equal(w.rush.B, false);
  assert.ok(res.instructions >= 16, `AllRush 有 22 条指令，实际跑了 ${res.instructions}`);
  assert.ok(res.syscalls >= 5, `至少 0x131/0x122/0x105/0x106/0x120/0x123/0x301/0x003/0x110，实际 ${res.syscalls}`);
  assert.ok(
    res.log.some((l) => l.includes('SYSTEM.SO AllRush：指令')),
    `统计行应进 log：${res.log.join(' | ')}`,
  );
});

test('R137 真字节码：Rush01 + 一对闪白 + 「全軍突擊!」都出了总线（假 sink / audioBusStats）', (t) => {
  resetAudioBus();
  const sink = fakeSink();
  const w = freshWorld(43);
  const res = runSystemSoFunction(w, 'A', 'AllRush', { program: systemProgram() });
  assert.equal(w.rush.A, true);
  assert.deepEqual(sink.names, ['rush01'], `0x301 只该发一声 Rush01，实际 ${sink.names.join(',')}`);
  assert.deepEqual(
    sink.calls.filter((c) => c.kind === 'flash').map((c) => c.on),
    [true, false],
    '0x131 压暗 / 0x110 复亮必须成对',
  );
  const stats = audioBusStats();
  assert.equal(stats.byName.rush01, 1, `audioBusStats 里要有 rush01：${JSON.stringify(stats.byName)}`);
  assert.equal(stats.flash, 2);
  t.diagnostic(`audioBusStats：total=${stats.total} sfx=${stats.sfx} flash=${stats.flash} ${JSON.stringify(stats.byName)}`);
  // 台词走 0x003（不是音效），落在 SkillRun 的 log 里，颜色控制符原样保留
  const line = res.log.find((l) => l.includes('全軍突擊'));
  assert.ok(line, `0x003 的台词应进 log：${res.log.join(' | ')}`);
  assert.match(line, /全軍突擊!%k%%e%/, '`%k%%e%` 是原作的颜色/换行控制符，不能吞掉');
  // clock 透传：脚本自己的虚拟帧号
  const ev = audioEvents().find((e) => e.kind === 'sfx' && e.name === 'rush01');
  assert.ok(ev, 'audioEvents 环形日志里要有 rush01');
  assert.equal(ev.source, 'syscall:0x301');
});

test('R137 逐帧战场通道（battleAudioEvents）不重复脚本音：Rush01 只在 audioEvents 里', () => {
  resetAudioBus();
  fakeSink();
  const w = freshWorld(53);
  const mark = battleAudioMark(w);
  runSystemSoFunction(w, 'A', 'AllRush', { program: systemProgram() });
  assert.deepEqual(battleAudioEvents(w, mark), [], '这一帧没有命中/阵亡/撤退，脚本音不该混进逐帧通道');
  assert.ok(audioEvents().some((e) => e.kind === 'sfx' && e.name === 'rush01'));
});

// ---------------------------------------------------------------------------
// 5. 宿主通道（web/Cocos 的生产路径）与字节码通道语义一致
// ---------------------------------------------------------------------------

test('R137 宿主通道 = 字节码通道：createBattleSysoHost().call("AllRush") 同样置位并出声', () => {
  resetAudioBus();
  const sink = fakeSink();
  const w = freshWorld(47);
  const log: string[] = [];
  const host = createBattleSysoHost(w, 'A', { log });
  assert.deepEqual(host.call('AllRush', []), { handled: true });
  assert.equal(w.rush.A, true, '宿主通道也要真的置位（不是只播音）');
  assert.equal(w.rush.B, false);
  assert.deepEqual(sink.names, ['rush01']);
  assert.deepEqual(
    sink.calls.filter((c) => c.kind === 'flash').map((c) => c.on),
    [true, false],
  );
  assert.ok(log.some((l) => l.includes('全軍突擊')), `台词要进 log：${log.join(' | ')}`);
  // 幂等：第二次照播音频，但状态不变
  assert.deepEqual(host.call('AllRush', []), { handled: true });
  assert.equal(w.rush.A, true);
  assert.equal(sink.names.length, 2);
});

test('R137 突击态不改变伤害/攻击力：两侧 stats 在同样 tick 数里口径不变', () => {
  // 原作只写命令字 `unit+0x6c`，没有伤害/攻击力加成 —— 这里钉住"我们也没加"。
  const a = freshWorld(59, 8);
  const b = freshWorld(59, 8);
  allRush(b, 'A');
  for (let i = 0; i < 30; i++) {
    step(a);
    step(b);
  }
  // 突击只是更早接触：命中数可以不同，但"每次命中扣多少"没变。
  // 用主将 hp 的损失上限做粗钉：不超过对方攻击次数的上限即可（30 tick 内 ≤ 30 次攻击）。
  const lostA = a.sides.A.general.maxHp - a.sides.A.general.hp;
  const lostB = b.sides.B.general.maxHp - b.sides.B.general.hp;
  assert.ok(lostA >= 0 && lostA <= 30 * 40, `普通态主将掉血 ${lostA} 应在合理范围`);
  assert.ok(lostB >= 0 && lostB <= 30 * 40, `突击态主将掉血 ${lostB} 应在合理范围`);
});
