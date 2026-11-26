/**
 * R33：軍師技戰力加成「乘算 → 原作純加法」的差分量測。
 *
 * 依據（project/109）：
 *   · 原作 `0x44D450` exec 21-23：`ownArmy+0x70 += 10/20/30`
 *     exec 24-26：`foeArmy+0x70 -= 10/20/30`
 *   · `army+0x70` 就是 `0x43A3AD/0x43A3B7` 寫成 150 的那個「戰力和」，
 *     `0x442EFA`/`0x443498` 的五段加算裡沒有任何乘法指令（docs/04b5 §1.2/§1.3/§4.1）。
 * 所以 `powerOf` 必須是 `base + bonus`，不是 `round(base * (1 + bonus/100))`。
 *
 * 本檔用「同一局面、同一 seed、軍師技開/關」的差分寫死兩件事：
 *   1. 新口徑的數 = base + 點數，且與舊乘算數不同（口徑真的改了）；
 *   2. 同一個加成在命中判定與普攻傷害裡的落點，也跟著變成加法。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  basicDamage,
  createWorld,
  hitChance,
  powerOf,
  qiCostMul,
  qiRegenOf,
  settle,
  tickSkills,
} from '../src/core/battle.ts';
import type { Side, World } from '../src/core/battle.ts';
import { WISE_SPECS, applyWise } from '../src/core/wises.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const SEED = 42;

function fresh(): World {
  return createWorld({ data, seed: SEED });
}

interface Case {
  seq: number;
  /** 量哪一側的戰力（強化士兵打敵方，所以量 B） */
  side: Side;
  delta: number;
  label: string;
}

const CASES: readonly Case[] = [
  { seq: 17, side: 'A', delta: 10, label: '增強攻擊 L1' },
  { seq: 46, side: 'A', delta: 20, label: '增強攻擊 L2' },
  { seq: 64, side: 'A', delta: 30, label: '增強攻擊 L3' },
  { seq: 16, side: 'B', delta: -10, label: '強化士兵 L1' },
  { seq: 45, side: 'B', delta: -20, label: '強化士兵 L2' },
  { seq: 63, side: 'B', delta: -30, label: '強化士兵 L3' },
];

test('R33 差分表：同一局面/seed，troop_atk 舊乘算 vs 新加法', (t) => {
  for (const c of CASES) {
    const spec = WISE_SPECS[c.seq]!;
    assert.equal(spec.channel, 'troop_atk');
    assert.equal(spec.value, c.delta, `SPECS ${c.seq} 的點數`);
    assert.equal(spec.target, c.side === 'A' ? 'self' : 'enemy');

    const base = fresh();
    const p0 = powerOf(base, c.side);
    const oldP = Math.round(p0 * (1 + c.delta / 100));

    const w = fresh();
    assert.equal(applyWise(w, 'A', c.seq).ok, true);
    const p1 = powerOf(w, c.side);

    assert.equal(p1, p0 + c.delta, `${c.label}：新口徑必須是 base + 點數`);
    assert.notEqual(p1, oldP, `${c.label}：新舊口徑必須有差，否則測不到`);
    t.diagnostic(
      `${c.label} seq${c.seq}：base ${p0} | 舊乘算 ${oldP} | 新加法 ${p1} | 差 ${p1 - oldP}`,
    );
  }
});

test('R33 差分表：同一 seed 的命中值與普攻傷害（A 側增強攻擊）', (t) => {
  for (const c of CASES.filter((x) => x.side === 'A')) {
    const base = fresh();
    const p0 = powerOf(base, 'A');
    const oldP = Math.round(p0 * (1 + c.delta / 100));
    const oldHit = oldP; // 兵→兵、晴、目標未移動：p = 戰力
    const oldDmg = Math.trunc((oldP * 4) / 0xc0);

    const a0 = base.units.find((u) => u.side === 'A' && !u.isGeneral && u.kind === 'infantry')!;
    const b0 = base.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    assert.equal(hitChance(base, a0, b0), p0, '無軍師技時命中值 = 戰力');
    assert.equal(basicDamage(base, a0), Math.trunc((p0 * 4) / 0xc0));

    const w = fresh();
    applyWise(w, 'A', c.seq);
    const a1 = w.units.find((u) => u.side === 'A' && !u.isGeneral && u.kind === 'infantry')!;
    const b1 = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
    const p1 = p0 + c.delta;
    assert.equal(hitChance(w, a1, b1), p1, `${c.label}：命中值也是加法`);
    assert.equal(basicDamage(w, a1), Math.trunc((p1 * 4) / 0xc0), `${c.label}：傷害按新戰力算`);
    t.diagnostic(
      `${c.label}：戰力 ${p0}→${p1} | 舊命中/傷害 ${oldHit}/${oldDmg} | 新命中/傷害 ${p1}/${Math.trunc((p1 * 4) / 0xc0)}`,
    );
  }
});

test('R33 邊界：qi_regen / qi_cost / exp_bonus 仍是乘算，沒有被一起改成加法', () => {
  // qi_regen：+25% 仍是 ×1.25
  const w1 = fresh();
  applyWise(w1, 'A', 9);
  const g = w1.sides.A.general;
  g.qi = 0;
  const regen = qiRegenOf(g);
  tickSkills(w1);
  assert.equal(g.qi, Math.round(regen * 1.25), '集氣 +25% 仍是乘算');

  // qi_cost：−20% 仍是 ×0.8
  const w2 = fresh();
  applyWise(w2, 'A', 8);
  assert.equal(qiCostMul(w2, 'A'), 0.8);

  // exp_bonus：+15% 仍是 ×1.15
  const mk = () => {
    const w = createWorld({ data, seed: 9, a: { general: { str: 80, int: 80 } }, b: {} });
    w.over = true;
    w.winner = 'A';
    w.endReason = 'retreat';
    return w;
  };
  const plain = settle(mk()).expGain;
  const buffed = mk();
  applyWise(buffed, 'A', 21);
  assert.equal(settle(buffed).expGain, Math.round(plain * 1.15), '戰後經驗 +15% 仍是乘算');
});

test('R33 疊加：策略 atkMod 與軍師技點數都直接加，不互相乘', () => {
  const w = fresh();
  const p0 = powerOf(w, 'A');
  w.army.A.atkMod = 30;
  assert.equal(powerOf(w, 'A'), p0 + 30, '策略 atkMod 本來就是加法');
  applyWise(w, 'A', 17);
  assert.equal(powerOf(w, 'A'), p0 + 30 + 10, '軍師技 +10 點再直接加上去');
  w.army.A.atkMod = -10;
  assert.equal(powerOf(w, 'A'), p0 - 10 + 10, '負 atkMod 也是加法');
});
