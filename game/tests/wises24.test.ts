// R88 軍師技裁決 —— 67 條逐條落點、真缺口、差分量測。
//
// 依據：`work/dis_battle_B_44D450.txt`（67 分支派發器）+ `docs/04b5`（戰力/疲勞）+
// `work/wises24/probe_before.txt`（改前基線）+ `project/130_军师技24条裁决.md`。
// 每個新實裝至少一條「同 seed、改前/改後某個可觀測數字必須變」的差分量測。
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import {
  createWorld,
  powerOf,
  qiCostMul,
  requestRetreat,
  step,
} from '../src/core/battle.ts';
import { planStrategy, runStrategy } from '../src/core/strategy.ts';
import {
  applyWise,
  WISE_EXTRA_SPECS,
  WISE_SPECS,
  WISE_STRATEGY_HINTS,
  WISE_STRATEGY_ONLY,
  WISE_SYSO_UNSUPPORTED,
  WISE_UNIMPLEMENTED,
  wiseAppliedAtStart,
} from '../src/core/wises.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

type World = ReturnType<typeof createWorld>;
type Opts = Parameters<typeof createWorld>[0];

function mk(patch: Partial<Opts> = {}): World {
  return createWorld({ data, seed: 11, ...patch });
}

/** 把两侧各一个兵贴到一起（**同一排的相邻格**），越过 `STRATEGY_ENGAGE_RANGE`。
 *  m4：原作寻敌只沿同排 ±x 扫格，同一格不算接战；旧夹具把两人塞进同一格，
 *  在 `adjacentEnemy` 按 0x43BBE6 重写后不再成立。 */
function engage(w: World, side: 'A' | 'B' = 'A') {
  const unit = w.units.find((u) => u.side === side && u.alive && !u.isGeneral);
  const foe = w.units.find((u) => u.side !== side && u.alive && !u.isGeneral);
  assert.ok(unit && foe, '两侧都要有兵');
  const fx = Math.round(foe!.x);
  const tx = fx >= 1 ? fx - 1 : fx + 1;
  unit!.x = tx;
  unit!.y = foe!.y;
  return { unit: unit!, foe: foe! };
}

/** 讓 `step()` 走一輪：先接戰，再跑守衛 + 派發器。 */
function tickOnce(w: World, side: 'A' | 'B' = 'A'): void {
  engage(w, side);
  step(w);
}

/** 手動跑一次派發器（不經 `step()` 的守衛）＝「雙算」對照組。 */
function fire(w: World, side: 'A' | 'B', seq: number): void {
  const army = w.army[side]!;
  army.seq = seq;
  army.used = false;
  const { unit } = engage(w, side);
  const pick = planStrategy(w, side, unit);
  assert.ok(pick, `planStrategy(${side}, seq=${seq}) 应返回指令`);
  runStrategy(w, pick!);
}

/** 戰前 `applyWise` + 戰中再派發一次（R88 守衛之前的行為）。 */
function double(seq: number): World {
  const w = mk();
  applyWise(w, 'A', seq);
  fire(w, 'A', seq);
  return w;
}

// ---------------------------------------------------------------------------
// 一、67 條的分類帳（裁決表的可執行版）
// ---------------------------------------------------------------------------

test('裁決帳：67 = 55 戰前 + 12 戰中 + 0 阻塞，且逐條都有落點', () => {
  assert.equal(Object.keys(WISE_SPECS).length, 55);
  assert.equal(WISE_STRATEGY_ONLY.length, 12);
  // R94：最後一條佔位 `3 後選出陣` 已進 SPECS（deploy / choose_after_foe），佔位表清空。
  assert.equal(Object.keys(WISE_SYSO_UNSUPPORTED).length, 0);
  const seen = new Set<number>();
  for (let seq = 1; seq <= 67; seq++) {
    const inSpec = WISE_SPECS[seq] !== undefined;
    const inStrategy = WISE_STRATEGY_ONLY.includes(seq);
    // 佔位 0 條 → 每條 seq 必須恰好落在「戰前登記」或「戰中派發」其中一類。
    assert.equal((inSpec ? 1 : 0) + (inStrategy ? 1 : 0), 1, `seq ${seq} 應恰好落在一個分類`);
    seen.add(seq);
  }
  assert.equal(seen.size, 67);
});

test('裁決帳：12 條戰中派發都有 UI 提示（此前 wiseHintOf 返回 null → 看起來像未實作）', () => {
  assert.equal(Object.keys(WISE_STRATEGY_HINTS).length, 12);
  for (const seq of WISE_STRATEGY_ONLY) {
    assert.ok(WISE_STRATEGY_HINTS[seq], `seq ${seq} 缺提示`);
  }
  // R94：3 已不是佔位，提示走 SPECS[3].note（`wiseHintOf` 先查 SPECS），不進這張戰中派發表。
  assert.equal(WISE_STRATEGY_HINTS[3], undefined);
});

test('裁決帳：WISE_UNIMPLEMENTED 精確等於 12 條戰中派發（0 條阻塞）', () => {
  assert.deepEqual([...WISE_UNIMPLEMENTED].sort((a, b) => a - b), [...WISE_STRATEGY_ONLY].sort((a, b) => a - b));
});

// ---------------------------------------------------------------------------
// 二、十面埋伏（54）：舊的「後排 +6 兵」→ 原作 noRetreat 位
// ---------------------------------------------------------------------------

test('十面埋伏（54）差量：B.flags 0→4（我方 0），單位數 100→100（不再 +6）', () => {
  const w = mk();
  assert.equal(w.army['A']!.flags, 0);
  assert.equal(w.army['B']!.flags, 0);
  assert.equal(w.units.filter((u) => u.side === 'A' && !u.isGeneral).length, 100);

  assert.deepEqual(applyWise(w, 'A', 54), { ok: true, kind: 'ambush', note: '敵方無法退兵（十面埋伏）' });

  assert.equal(w.army['B']!.flags, 0x4, 'stderr 差量＝4');
  assert.equal(w.army['A']!.flags, 0, '不能改到我方');
  assert.equal(w.units.filter((u) => u.side === 'A' && !u.isGeneral).length, 100, '兵數不變');
});

test('十面埋伏（54）：敵將有坐騎 → 破解，flags 0→0（原作 0x40918A 分支）', () => {
  const row = data.generals.find((x) => typeof x.Horse === 'string' && x.Horse.length > 0);
  assert.ok(row, 'data 裡要有帶坐騎的武將');
  const w = createWorld({ data, seed: 11, b: { general: { name: row!.NAME, str: 80, int: 60, level: 1 } } });
  assert.equal(applyWise(w, 'A', 54).ok, false);
  assert.equal(w.army['B']!.flags, 0);
});

test('十面埋伏（54）差量：requestRetreat(B) true→false', () => {
  const control = mk();
  assert.equal(requestRetreat(control, 'B'), true, '對照組可以退');

  const w = mk();
  applyWise(w, 'A', 54);
  assert.equal(requestRetreat(w, 'B'), false, '十面埋伏後不能退');
});

// ---------------------------------------------------------------------------
// 三、一場只結算一次：戰前已生效的 seq 不再進戰中派發器
// ---------------------------------------------------------------------------

test('去重（55 離間計 L3）差量：B.loyal 25 vs 0', () => {
  const control = double(55);
  assert.equal(control.sides.B.general.loyal, 0, '對照組：−25（戰前）再 −25（戰中）');

  const w = mk({ a: { strategy: 55, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 55);
  assert.equal(w.sides.B.general.loyal, 25);
  tickOnce(w);
  assert.equal(w.army['A']!.used, false, 'seq 已被守衛摘掉，不派發');
  assert.equal(w.army['A']!.seq, null);
  assert.equal(w.sides.B.general.loyal, 25, '只算一次');
});

test('去重（61 增加體力 L3）差量：maxHp 141 vs 211', () => {
  const control = double(61);
  assert.equal(control.sides.A.general.maxHp, 211, '對照組 +40 再 +50%');

  const w = mk({ a: { strategy: 61, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 61);
  assert.equal(w.sides.A.general.maxHp, 141);
  tickOnce(w);
  assert.equal(w.sides.A.general.maxHp, 141, '只算一次');
});

test('去重（60 增加技力 L3）差量：mpMax 91 vs 145', () => {
  const control = double(60);
  assert.equal(control.sides.A.general.mpMax, 145);

  const w = mk({ a: { strategy: 60, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 60);
  tickOnce(w);
  assert.equal(w.sides.A.general.mpMax, 91);
});

test('去重（39 降敵士氣 L3）差量：B.morale 48 vs 8', () => {
  const control = double(39);
  assert.equal(control.sides.B.morale, 8, '對照組 −12 再 −40');

  const w = mk({ a: { strategy: 39, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 39);
  tickOnce(w);
  assert.equal(w.sides.B.morale, 48);
});

test('去重（17 增強攻擊）差量：powerOf 增量 +10 vs +20', () => {
  const base = mk();
  const p0 = powerOf(base, 'A');

  const control = double(17);
  assert.equal(powerOf(control, 'A') - p0, 20, '對照組：mod +10 與 atkMod +10 疊加');

  const w = mk({ a: { strategy: 17, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 17);
  tickOnce(w);
  assert.equal(powerOf(w, 'A') - p0, 10, '只留戰前那一份');
});

test('去重（8 保留氣力 L1）差量：qiCostMul 0.8 vs 0.528', () => {
  const control = double(8);
  assert.ok(Math.abs(qiCostMul(control, 'A') - 0.528) < 1e-9, '對照組 ×0.66');

  const w = mk({ a: { strategy: 8, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 8);
  tickOnce(w);
  assert.ok(Math.abs(qiCostMul(w, 'A') - 0.8) < 1e-9, '只剩 −20%');
});

test('去重（21 增加經驗 L1）差量：expPct 0 vs 30（經驗倍率 1.15 vs 1.495）', () => {
  const control = double(21);
  assert.equal(control.army['A']!.expPct, 30);

  const w = mk({ a: { strategy: 21, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 21);
  tickOnce(w);
  assert.equal(w.army['A']!.expPct, 0);
});

test('去重（6 離間計 L1）差量：B.loyal 42 vs 34', () => {
  const control = double(6);
  assert.equal(control.sides.B.general.loyal, 34);

  const w = mk({ a: { strategy: 6, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 6);
  tickOnce(w);
  assert.equal(w.sides.B.general.loyal, 42);
});

test('去重（7 減緩集氣 L1）差量：B.qiTier 0 vs −1', () => {
  const control = double(7);
  assert.equal(control.army['B']!.qiTier, -1);

  const w = mk({ a: { strategy: 7, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 7);
  tickOnce(w);
  assert.equal(w.army['B']!.qiTier, 0);
});

test('去重（20 喝阻敵軍 L1）差量：B 兵數 90 vs 100', () => {
  const control = double(20);
  assert.equal(control.units.filter((u) => u.side === 'B' && !u.isGeneral).length, 90, '對照組：戰前士氣 −4、戰中抽 10 兵');

  const w = mk({ a: { strategy: 20, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 20);
  tickOnce(w);
  assert.equal(w.units.filter((u) => u.side === 'B' && !u.isGeneral).length, 100, '只留戰前士氣 −4，不再抽兵');
});

test('去重是分側的：A 已生效不妨礙 B 派發（B.atkMod 0→10）', () => {
  const w = mk({
    a: { strategy: 6, general: { str: 80, int: 60, level: 1 } },
    b: { strategy: 17, general: { str: 80, int: 60, level: 1 } },
  });
  applyWise(w, 'A', 6);
  tickOnce(w);
  assert.equal(w.army['A']!.used, false);
  assert.equal(w.army['B']!.used, true);
  assert.equal(w.army['B']!.atkMod, 10);
});

// ---------------------------------------------------------------------------
// 四、滿血時戰前等於沒生效的恢復類：不能被守衛誤殺
// ---------------------------------------------------------------------------

test('恢復體力（11）：戰前寫 hpRegen 0→40（不再瞬回），守衛因此不再派發', () => {
  const w = mk({ a: { strategy: 11, general: { str: 80, int: 60, level: 1 } } });
  const g = w.sides.A.general;
  assert.equal(g.hp, g.maxHp);
  assert.equal(w.army['A']!.hpRegen, 0);
  assert.equal(applyWise(w, 'A', 11).ok, true);
  assert.equal(w.army['A']!.hpRegen, 40, 'stderr 差量＝40');
  assert.equal(w.army['A']!.flags, 0x1);
  assert.deepEqual(wiseAppliedAtStart(w, 'A'), [11], '有觀測差量 → 記入');
  tickOnce(w);
  assert.equal(w.army['A']!.used, false, '不重複派發');
});

test('恢復技力（12）：戰前寫 mpRegen 0→30（不再瞬回），守衛因此不再派發', () => {
  const w = mk({ a: { strategy: 12, general: { str: 80, int: 60, level: 1 } } });
  assert.equal(w.army['A']!.mpRegen, 0);
  assert.equal(applyWise(w, 'A', 12).ok, true);
  assert.equal(w.army['A']!.mpRegen, 30);
  assert.equal(w.army['A']!.flags, 0x2);
  tickOnce(w);
  assert.equal(w.army['A']!.used, false);
});

// ---------------------------------------------------------------------------
// 五、勸降（32）：補原作 0x400 投靠位（忠誠 −15 保留為戰後招降代理）
// ---------------------------------------------------------------------------

test('勸降（32）差量：B.flags 0→0x400，B.loyal 50→35', () => {
  const w = mk();
  assert.equal(w.army['B']!.flags, 0);
  assert.ok(!w.sides.B.general.loyal, '出戰時未寫忠誠');
  assert.equal(applyWise(w, 'A', 32).ok, true);
  assert.equal(w.army['B']!.flags, 0x400, '原作 foeArmy+0x84 |= 0x400');
  assert.equal(w.sides.B.general.loyal, 35);
});

test('勸降（32）：忠誠 99 時閘擋住，flags 0→0', () => {
  const w = mk();
  w.sides.B.general.loyal = 99;
  assert.equal(applyWise(w, 'A', 32).ok, false);
  assert.equal(w.army['B']!.flags, 0);
  assert.equal(w.sides.B.general.loyal, 99);
});

// ---------------------------------------------------------------------------
// 六、化解計策（24）：記一次「待取消的派發」，並被守衛記住
// ---------------------------------------------------------------------------

test('化解計策（24）差量：B.cancelPending 0→1，B 的第一發派發被取消', () => {
  const w = mk({
    a: { strategy: 24, general: { str: 80, int: 60, level: 1 } },
    b: { strategy: 7, general: { str: 80, int: 60, level: 1 } },
  });
  assert.equal(w.army['B']!.seq, 7);
  assert.equal(w.army['B']!.cancelPending, 0);
  assert.equal(applyWise(w, 'A', 24).ok, true);
  assert.equal(w.army['B']!.seq, 7, '不再清 seq（只取消一次）');
  assert.equal(w.army['B']!.cancelPending, 1, '敵方被記一次');
  assert.deepEqual(wiseAppliedAtStart(w, 'A'), [24]);
  tickOnce(w);
  assert.equal(w.army['A']!.used, false);
  assert.equal(w.army['B']!.used, true, '派發仍然發生，只是被取消');
  assert.equal(w.army['B']!.cancelPending, 0, '額度用完');
  const ev = w.strategyEvents.filter((e) => e.side === 'B');
  assert.equal(ev.length, 1);
  assert.equal(ev[0]!.cancelled, true);
  assert.deepEqual(ev[0]!.ops, []);
});

// ---------------------------------------------------------------------------
// 七、Execute 34（seq 3）：R94 落地 —— 戰前立旗標、戰中一句日誌，數值不動
// ---------------------------------------------------------------------------

test('後選出陣（3）：applyWise 立 chooseAfterFoe 並記生效；派發器 ops = [afterfoe, note]，數值不動', () => {
  // 戰前那一手：只立旗標，不碰任何戰場數值。
  const w = mk({ a: { strategy: 3, general: { str: 80, int: 60, level: 1 } } });
  const before = {
    aHp: w.sides.A.general.hp,
    bHp: w.sides.B.general.hp,
    aMorale: w.sides.A.morale,
    units: w.units.length,
    powerA: powerOf(w, 'A'),
  };
  const r = applyWise(w, 'A', 3);
  assert.equal(r.ok, true, 'R94 後不再是 ok:false');
  assert.equal(r.kind, 'deploy');
  assert.equal(w.army['A']!.chooseAfterFoe, true, '戰前只立「敵後選將」旗標');
  assert.equal(w.army['B']!.chooseAfterFoe, undefined, '不碰敵方');
  assert.deepEqual(wiseAppliedAtStart(w, 'A'), [3], '旗標變化也算生效，記進 START_APPLIED');
  assert.deepEqual(
    {
      aHp: w.sides.A.general.hp,
      bHp: w.sides.B.general.hp,
      aMorale: w.sides.A.morale,
      units: w.units.length,
      powerA: powerOf(w, 'A'),
    },
    before,
    '戰場數值一律不動（原作 0x44DE44 零狀態寫入）',
  );
  // 已記進 START_APPLIED → step() 會把 seq 摘掉，不重複派發（與 R88 守衛一致）。
  tickOnce(w);
  assert.equal(w.army['A']!.used, false, 'seq 已被守衛摘掉');
  assert.equal(w.army['A']!.seq, null);

  // 不走戰前那一手、直接派發：ops = [afterfoe, note] —— 旗標 + 原作那一句「成功」日誌。
  const w2 = mk({ a: { strategy: 3 } });
  fire(w2, 'A', 3);
  const ev = w2.strategyEvents[w2.strategyEvents.length - 1]!;
  assert.equal(ev.exec, 34);
  assert.equal(ev.kind, 'reserve');
  assert.deepEqual(ev.ops.map((o) => o.op), ['afterfoe', 'note']);
  assert.equal(w2.army['A']!.chooseAfterFoe, true);
});

// ---------------------------------------------------------------------------
// 八、疲勞類（4/25/51 有差量；5/27/50 降檔）
// ---------------------------------------------------------------------------

test('擾亂敵將（4）差量：B.fatigueIdx 0→1，且戰中不再被派發成 2 檔', () => {
  const control = double(4);
  assert.equal(control.army['B']!.fatigueIdx, 2, '對照組戰前 +1 檔、戰中再 +1 檔');
  assert.equal(control.sides.B.general.tire, undefined, '戰中不改疲勞點數');

  const w = mk({ a: { strategy: 4, general: { str: 80, int: 60, level: 1 } } });
  applyWise(w, 'A', 4);
  assert.equal(w.army['B']!.fatigueIdx, 1);
  tickOnce(w);
  assert.equal(w.army['B']!.fatigueIdx, 1, '守衛攔住重複派發');
});

test('減少疲勞（5）：0 疲勞也要降一檔（有觀測：戰後 ×0.75）', () => {
  const w = mk();
  applyWise(w, 'A', 5);
  assert.equal(w.army['A']!.fatigueIdx, -1);
  assert.deepEqual(wiseAppliedAtStart(w, 'A'), [5], '檔位變了就是有效差量');
});

// ---------------------------------------------------------------------------
// 九、登記表本身的形狀
// ---------------------------------------------------------------------------

test('WISE_EXTRA_SPECS 由 11 條變 12 條，且 54 的 op 是 no_retreat', () => {
  assert.equal(Object.keys(WISE_EXTRA_SPECS).length, 12);
  assert.equal(WISE_EXTRA_SPECS[54]!.op, 'no_retreat');
  assert.equal(WISE_EXTRA_SPECS[54]!.target, 'enemy');
  assert.equal(WISE_SPECS[54]!.op, 'no_retreat', '已並進 SPECS');
});

test('舊的「後排伏兵 +6」規格已不存在（units op 不再被 54 使用）', () => {
  assert.notEqual(WISE_SPECS[54]!.op, 'units');
  assert.equal(WISE_SPECS[54]!.value, 0);
});
