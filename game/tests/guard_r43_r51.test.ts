/**
 * R43 / R51 假绿守护（37a 的 ✅ 当年没有任何直接断言）。
 *
 * R43：`docs/04b4:173` / `0x43BE08` —— 命中判定里「目标本 tick 未站定（有位移）→ p×2/3」。
 *      battle.ts:770 就是这一行；旧测试只测过 gen→gen 的基础值 150，从未让目标移动过。
 * R51：`docs/04b_战斗系统.md:266` —— `[0x4A6888] = MagicDef_Attack` 存全局供特效读；
 *      runtime.ts:341 `this.vm.setEngineValue(4, this.valueFor())`。旧测试没有任何一条读过 g4。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/guard_r43_r51.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { createWorld, hitChance, type Side, type Unit, type World } from '../src/core/battle.ts';
import { runSkill } from '../src/core/smartscript/runtime.ts';
import { ScriptVm } from '../src/core/smartscript/vm.ts';

const data = loadData();

/** 两军接触、双方武力同为 60（命中基础值 150），seed 固定 */
function mkWorld(): World {
  return createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
}

function unitOf(w: World, side: Side, general: boolean): Unit {
  const u = w.units.find((x) => x.side === side && Boolean(x.isGeneral) === general);
  if (!u) throw new Error(`${side} 侧找不到${general ? '主将' : '士兵'}单位`);
  return u;
}

/** 站定：上一 tick 位置 = 当前位置（清掉 p×2/3 修正） */
function standStill(u: Unit): Unit {
  u.prevX = u.x;
  u.prevY = u.y;
  return u;
}

// ---------------------------------------------------------------- R43
test('R43 目標本 tick 有位移 → p×2/3；攻方移動不罰（150 → 100）', () => {
  const w = mkWorld();
  const a = standStill(unitOf(w, 'A', true));
  const b = standStill(unitOf(w, 'B', true));

  assert.equal(hitChance(w, a, b), 150, '雙方站定、武力相等 → 150');

  // 攻方移動：命中目標沒動 → 不罰（這條是「只罰目標」的反向斷言）
  a.x += 1;
  assert.equal(hitChance(w, a, b), 150, '攻方移動不該吃 ×2/3');
  standStill(a);

  // 目標移動：trunc(150*2/3) = 100
  b.x += 1;
  assert.equal(hitChance(w, a, b), 100, '目標移動 → p×2/3');
  // 再站定 → 回到 150（修正只看「這一 tick」）
  standStill(b);
  assert.equal(hitChance(w, a, b), 150);

  // 只有 y 位移也要罰；位移再小（1e-9）也算「未站定」（原作是 != 比較）
  b.y += 0.5;
  assert.equal(hitChance(w, a, b), 100, '只 y 位移也要罰');
  standStill(b);
  b.x += 1e-9;
  assert.equal(hitChance(w, a, b), 100, '位移 1e-9 也算未站定');
});

test('R43 兵→將分支也吃 ×2/3：150−武力20% = 138 → 92（含 trunc）', () => {
  const w = mkWorld();
  const soldier = standStill(unitOf(w, 'A', false));
  const general = standStill(unitOf(w, 'B', true));

  assert.equal(hitChance(w, soldier, general), 138, '150 − trunc(60*20/100) = 138');
  general.x += 1;
  assert.equal(hitChance(w, soldier, general), 92, 'trunc(138*2/3) = 92');
  standStill(general);
  assert.equal(hitChance(w, soldier, general), 138);

  // 反向：兵移動不罰
  soldier.x += 1;
  assert.equal(hitChance(w, soldier, general), 138, '攻方（兵）移動不該吃 ×2/3');
});

// ---------------------------------------------------------------- R51
/** 在原型上挂一次钩子，记录 vm.setEngineValue(index, value) 的每一次调用 */
function captureEngine(script: number): { calls: Array<{ index: number; value: number }>; ok: boolean } {
  const proto = ScriptVm.prototype as unknown as { setEngineValue(index: number, value: number): void };
  const orig = proto.setEngineValue;
  const calls: Array<{ index: number; value: number }> = [];
  proto.setEngineValue = function (this: unknown, index: number, value: number) {
    calls.push({ index, value });
    orig.apply(this, [index, value]);
  };
  try {
    const r = runSkill(mkWorld(), 'A' as Side, script, 20, 6.5);
    return { calls, ok: r.ok };
  } finally {
    proto.setEngineValue = orig;
  }
}

const g4 = (calls: Array<{ index: number; value: number }>): number[] =>
  calls.filter((c) => c.index === 4).map((c) => c.value);

test('R51 全局 g4 = 技能 ATTACK：537→40 / ATTACK=0→1 / 治癒 501→50 / 563→55', () => {
  // 五雷轟頂 SCRIPT=537, ATTACK=40
  const hit = captureEngine(537);
  assert.equal(hit.ok, true);
  assert.deepEqual(g4(hit.calls), [40], 'g4 就是 magics.json 的 ATTACK=40');

  // 地泉衝 SCRIPT=504, ATTACK=0 → Math.max(1, 0) = 1（不是 0）
  assert.deepEqual(g4(captureEngine(504).calls), [1], 'ATTACK=0 時 g4 下限 1');

  // 治癒：命療術 SCRIPT=501, ATTACK=30 → 20+30 = 50
  assert.deepEqual(g4(captureEngine(501).calls), [50], '治癒技 g4 = 20+ATTACK');
  // 回天術 SCRIPT=563, ATTACK=35 → 55
  assert.deepEqual(g4(captureEngine(563).calls), [55]);

  // 反向：非治癒技不得被當成治癒（537 若是 20+40=60 就說明 isHeal 誤判）
  assert.notEqual(g4(captureEngine(537).calls)[0], 60);
});

test('R51 g4 每次施法只寫一次；缺技能 → 20；施法者/目標 handle 一併寫入', () => {
  const heal = captureEngine(501);
  assert.equal(heal.calls.filter((c) => c.index === 4).length, 1, '每次施法 g4 只寫一次');
  const idx = new Set(heal.calls.map((c) => c.index));
  for (const i of [2, 3, 4, 5]) assert.ok(idx.has(i), `g2/g3/g4/g5 都要寫（缺 ${i}）`);
  // g2=施法者 handle、g3=对面主将 handle（`0x43BA9D`），两者都是有效正整数。
  // g5 不是句柄：原作 `0x43BA59` 在 `0x43BAA2-0x43BAB7` 里按"本方是不是 0x4A8A60 那个
  // 阵营结构"写 **0 / 1**（R163 修正，旧断言按 handle 判会红）。
  for (const i of [2, 3]) {
    const v = heal.calls.find((c) => c.index === i)?.value ?? 0;
    assert.ok(Number.isInteger(v) && v > 0, `g${i} 應為有效 handle（實際 ${v}）`);
  }
  {
    const g5 = heal.calls.find((c) => c.index === 5)?.value;
    assert.ok(g5 === 0 || g5 === 1, `g5 應為陣營 0/1（實際 ${g5}）`);
  }

  // 找不到技能（SCRIPT 99999）→ 走 m?.ATTACK ?? 20 的預設 20，且腳本應失敗
  const missing = captureEngine(99999);
  assert.equal(missing.ok, false, '不存在的技能腳本應回 ok=false');
  assert.deepEqual(g4(missing.calls), [20], '缺技能時 g4 預設 20');
});
