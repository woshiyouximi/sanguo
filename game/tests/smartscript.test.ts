/**
 * SmartScript 虚拟机 / MAGIC.SO 移植的回归测试。
 *
 * 覆盖：opcode 表完整性、未知 opcode 与死循环保护、20+ 技能能跑通并产出特效、
 * 3 个"金标准"（命療術回血 / 半月斬单向小范围 / 神鬼亂舞范围）、同 seed 可复现。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { loadData } from '../src/data.ts';
import { createWorld, type Side, type World } from '../src/core/battle.ts';
import { runSkill } from '../src/core/smartscript/runtime.ts';
import { ScriptVm, type VmHost } from '../src/core/smartscript/vm.ts';
import { OPCODES, SoProgram, type SoSymbols } from '../src/core/smartscript/so.ts';

const data = loadData();

/** 造一个"两军已接触"的战场：A 主将在 x=24，B 在 15..20；A 主将掉到 40% 血。 */
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
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
}

/** magics.json 里的 SEQUENCE → SCRIPT（脚本号 = 500 + MagicN 的 N，N 与 SEQUENCE 不总相等）。 */
function scriptOf(seq: number): number {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  assert.ok(m, `找不到第 ${seq} 号技能`);
  return m.SCRIPT;
}

function run(world: World, script: number, tx = 20, ty = 6.5) {
  return runSkill(world, 'A' as Side, script, tx, ty);
}

const HEAL_SKILLS = [1, 60];
const SINGLE_SKILLS = [2, 50, 14, 49];
const AOE_SKILLS = [3, 8, 7, 9];
const SUMMON_SKILLS = [5, 17, 19, 23];
const MIXED_SKILLS = [11, 13, 16, 21, 24, 27];

function expectAllRun(seqs: number[]): void {
  for (const seq of seqs) {
    const world = staged();
    const r = run(world, scriptOf(seq));
    const tag = `技能 ${seq}（脚本 ${scriptOf(seq)}）`;
    assert.equal(r.ok, true, `${tag} 应运行成功：${r.log.join(' | ')}`);
    assert.ok(world.fx.length > 0, `${tag} 应产出 world.fx`);
    assert.ok(r.stats.syscalls > 0, `${tag} 应至少执行过 syscall`);
  }
}

// ── 虚拟机本体 ──────────────────────────────────────────────────────────

test('opcode 表覆盖 0x00–0x59 共 90 项，且 vm.ts 每个都有实现分支', () => {
  assert.equal(OPCODES.length, 90);
  OPCODES.forEach((def, i) => assert.equal(def.op, i, `第 ${i} 项的 opcode 应为 0x${i.toString(16)}`));

  const source = readFileSync(new URL('../src/core/smartscript/vm.ts', import.meta.url), 'utf8');
  const handled = new Set(
    [...source.matchAll(/case 0x([0-9a-f]{2}):/g)].map((m) => Number.parseInt(m[1], 16)),
  );
  const missing = OPCODES.map((d) => d.op).filter((op) => !handled.has(op));
  assert.deepEqual(missing, [], `vm.ts 缺少这些 opcode 的实现：${missing.map((x) => `0x${x.toString(16)}`).join(' ')}`);
});

/** 造一个只有一条指令的假程序：code 在 0x40，符号表里一个函数。 */
function tinyProgram(word: number[], operand?: number): SoProgram {
  const bytes = new Uint8Array(0x48);
  word.forEach((w, i) => {
    const off = 0x40 + i * 4;
    bytes[off] = w & 0xff;
    bytes[off + 1] = (w >>> 8) & 0xff;
    bytes[off + 2] = (w >>> 16) & 0xff;
    bytes[off + 3] = (w >>> 24) & 0xff;
  });
  if (operand !== undefined) {
    const off = 0x40 + word.length * 4;
    bytes[off] = operand & 0xff;
    bytes[off + 1] = (operand >>> 8) & 0xff;
    bytes[off + 2] = (operand >>> 16) & 0xff;
    bytes[off + 3] = (operand >>> 24) & 0xff;
  }
  const sym: SoSymbols = {
    format: 'test',
    source: 'inline',
    bytes: bytes.length,
    version: 1,
    codeStart: 0x40,
    codeEnd: bytes.length,
    strOff: bytes.length,
    marker: 121,
    globalSlots: 121,
    functionCount: 1,
    stringCount: 0,
    instructionCount: 1,
    functions: [{ idx: 0, name: 'Spin', num: 0x1f5, off: 0x40, argc: 0 }],
    strings: [],
    opcodeHistogram: {},
    syscallHistogram: {},
    syscallSignatures: {},
  };
  return SoProgram.fromJson(bytes, sym);
}

const host: VmHost = {
  syscall: () => undefined,
  wait: () => undefined,
  waitFor: () => undefined,
};

test('未知 opcode 立即抛错，错误里带 opcode 号', () => {
  const vm = new ScriptVm(tinyProgram([0x5a]), host);
  assert.throws(() => vm.invoke(vm.program.functions[0], []), /未知 opcode 0x5a/);
});

test('JMP 到自己的死循环桩会被 200000 条指令预算拦下', () => {
  // 0x3B = JMP，操作数是绝对文件偏移 0x40（自己）
  const program = tinyProgram([0x3b], 0x40);
  const vm = new ScriptVm(program, host);
  assert.throws(() => vm.invoke(program.functions[0], []), /疑似死循环.*200000/);
  assert.ok(vm.steps > 200_000);
});

// ── 20 个技能跑通并产出特效 ─────────────────────────────────────────────

test('治疗类技能能跑通并产出 fx', () => expectAllRun(HEAL_SKILLS));
test('单体/单向技能能跑通并产出 fx', () => expectAllRun(SINGLE_SKILLS));
test('范围技能能跑通并产出 fx', () => expectAllRun(AOE_SKILLS));
test('召唤类技能能跑通并产出 fx', () => expectAllRun(SUMMON_SKILLS));
test('混合类技能能跑通并产出 fx', () => expectAllRun(MIXED_SKILLS));

// ── 三个金标准 ──────────────────────────────────────────────────────────

test('金标准：命療術(1) 应回血并产出 heal 特效', () => {
  const world = staged();
  const before = world.sides.A.general.hp;
  const r = run(world, scriptOf(1));
  assert.equal(r.ok, true);
  assert.ok(r.stats.healed > 0, `应统计到治疗量：${r.log.join(' | ')}`);
  assert.ok(world.sides.A.general.hp > before, `HP 应上升：${before} → ${world.sides.A.general.hp}`);
  const healFx = world.fx.filter((f) => f.kind === 'heal');
  assert.equal(healFx.length, 1);
  assert.equal(healFx[0].x, Math.round(world.sides.A.general.hp));
});

test('金标准：半月斬(50) 只打施法者正前方一小片', () => {
  const world = staged();
  const r = run(world, scriptOf(50));
  assert.equal(r.ok, true);
  assert.ok(r.stats.hits >= 1, `应至少命中 1 个目标：${r.log.join(' | ')}`);
  const fx = world.fx.at(-1);
  assert.ok(fx, '应有 fx');
  // A 主将在 x=24、敌人在 15..20，方向朝左：特效落点必须在施法者左边，且半径是单体级
  assert.ok(fx.x < 24, `特效应落在施法者左侧，实际 x=${fx.x}`);
  assert.ok(fx.r <= 3.6, `半径不应超过范围技，实际 r=${fx.r}`);
  // 只打一个方向：命中点（由 fx 质心近似）不能横跨施法者
  assert.ok(Math.abs(fx.y - 6.5) < 3, `纵向不应跨全屏，实际 y=${fx.y}`);
});

test('金标准：神鬼亂舞(104) 应打出范围伤害', () => {
  const world = staged();
  const aliveBefore = world.units.filter((u) => u.side === 'B' && u.alive).length;
  const r = run(world, scriptOf(104));
  assert.equal(r.ok, true);
  // R163 修复（project/163 §1.1）：旧断言 `hits >= 3` + `fx.kind === 'aoe'` + `fx.r >= 3.6`
  // 在 159 单被放宽成 `>= 1` / `strike|aoe` / `>= 1.8`，理由是"端口还没接物件碰撞回调"。
  // 本单把回调接上了：`DemonDancing #149` 主段循环 20 次 + 收尾 1 次，每次 `0x314` 调
  // `LockTargetXY #16` 造一个资源 2501 的物件并 `0x2C(obj, 14001)` 挂上
  // `DemonDancingCallback #147`（= `func` 号 0x36B1）；端口在「物件所在格有敌方单位」时
  // 按 `0x40AA82..0x40ABC5` 起回调，`Hurt(g16, 受害主将, obj)` 逐次结算 ⇒ 命中数回到
  // 多目标。断言恢复成范围伤害的原始口径。
  assert.ok(r.stats.hits >= 3, `范围技至少要命中 3 个目标，实际 ${r.stats.hits}`);
  const fx = world.fx.at(-1);
  assert.ok(fx, '应有 fx');
  assert.ok(fx.kind === 'aoe', `fx.kind 应为范围（hits>=2 时 pushFx 归 aoe），实际 ${fx.kind}`);
  assert.ok(fx.r >= 3.6, `范围半径应为 3.6，实际 r=${fx.r}`);
  const aliveAfter = world.units.filter((u) => u.side === 'B' && u.alive).length;
  assert.ok(aliveAfter <= aliveBefore, '不应复活敌人');
});

// ── 可复现性与错误路径 ──────────────────────────────────────────────────

test('同一 seed、同一技能重复执行结果一致', () => {
  const first = staged(11);
  const r1 = run(first, scriptOf(104));
  const second = staged(11);
  const r2 = run(second, scriptOf(104));
  assert.deepEqual(r2.stats, r1.stats);
  assert.deepEqual(second.fx, first.fx);
  assert.deepEqual(r2.objects, r1.objects);
});

test('不存在的脚本号返回 ok=false 而不是抛异常', () => {
  const world = staged();
  const r = runSkill(world, 'A', 9999, 20, 6.5);
  assert.equal(r.ok, false);
  assert.match(r.log.join('\n'), /找不到脚本函数/);
});
