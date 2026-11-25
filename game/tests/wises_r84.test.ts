// R84 軍師技補全 —— 第二批 11 條（疲勞 / 敵將忠誠 / 勸降 / 化解）的行為契約。
//
// 依据：
//   · `game/src/core/strategy.ts:STRATEGY_TABLE` —— `0x44D450` 那 66 條分支的強度
//     （Execute 9/10/11 → 敵軍 `army+0x38` 疲勞檔 +1/+2/+3；12/13/14 → 己軍 −1/−2/−3；
//      30/31/32 → 敵將忠誠 −8/15/25；33 → 勸降；57 → 化解）
//   · `work/dis_battle_B_44D450.txt`（0x44D70A/0x44D73E/0x44D772 打敵、0x44D7A6/0x44D7DA/
//     0x44D80E 打己）：六支分支只寫 `army+0x34 |= 0x1000` 與 `army+0x38 += ±1/2/3`
//   · `work/orig_numbers/text_dis.tsv`（0x41048D 消費點 / 0x4103DE 倍率表）：戰後
//     `tireGain` 再過 `trunc(v×K/100)`，K = 30/50/75/100/150/200/250（檔位 −3..+3）
//   · `docs/04b5 §2.2/§2.5` [确认]：疲勞在戰力與命中判定裡一次都沒被讀
//   · `docs/04b §4.3`：軍師技是「出征前寫 `unit+0x34` 位掩碼 / `unit+0x38` 數值」的一次性效果
//
// 每一條都給兩個斷言：
//   1. 開 → 可觀測量變化多少（消費點是 `settle()` 的 `tireAdded` / 派發事件，不是內部字段）；
//   2. 關 → 一位不變（含「打錯側不生效」「閘不滿足不寫字段」）。
//
// 跑法：cd F:\sanguo\game && node --test tests/wises_r84.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { createWorld, powerOf, settle, step } from '../src/core/battle.ts';
import type { Side } from '../src/core/battle.ts';
import {
  WISE_SPECS,
  WISE_STRATEGY_ONLY,
  WISE_SYSO_UNSUPPORTED,
  WISE_UNIMPLEMENTED,
  applyWise,
  wiseEffectOf,
  wiseHintOf,
} from '../src/core/wises.ts';
import { STRATEGY_TABLE } from '../src/core/strategy.ts';

import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

type World = ReturnType<typeof createWorld>;
type Opts = Parameters<typeof createWorld>[0];

function mk(patch: Partial<Opts> = {}): World {
  // m4：默认待機后要显式下令，军师技才会在 tick 循环里派发。
  return engage(createWorld({ data, seed: 11, ...patch }));
}

/** 用 generals.json 裡的真實武將當某一側主將（str/int 從數據抄，等級給 20）。 */
function gen(name: string): { name: string; str: number; int: number; level: number } {
  const row = data.generals.find((g) => g.NAME === name);
  assert.ok(row, `generals.json 裡沒有 ${name}`);
  return { name, str: row!.STR, int: row!.INT, level: 20 };
}

/** `settle()` 讀的就是這兩個字段（battle.ts:2062 / 2065）—— 用結算值當「可觀測量」。 */
function read(w: World): { tire: Record<Side, number>; loyal: Record<Side, number> } {
  const r = settle(w);
  return {
    tire: { A: r.tire.A.before, B: r.tire.B.before },
    loyal: { A: r.loyalty.A.before, B: r.loyalty.B.before },
  };
}

/** 快照：11 條可能碰到的全部字段 + 派發事件數。 */
function snapshot(w: World): unknown {
  return {
    aTire: w.sides.A.general.tire,
    aLoyal: w.sides.A.general.loyal,
    aHp: w.sides.A.general.hp,
    aMp: w.sides.A.general.mp,
    aMorale: w.sides.A.morale,
    bTire: w.sides.B.general.tire,
    bLoyal: w.sides.B.general.loyal,
    bHp: w.sides.B.general.hp,
    bMp: w.sides.B.general.mp,
    bMorale: w.sides.B.morale,
    aSeq: w.army.A.seq,
    bSeq: w.army.B.seq,
    aFatigue: w.army.A.fatigueIdx,
    bFatigue: w.army.B.fatigueIdx,
    aCancel: w.army.A.cancelPending,
    bCancel: w.army.B.cancelPending,
    aDefect: w.army.A.defectPending,
    bDefect: w.army.B.defectPending,
    events: w.strategyEvents.length,
    units: w.units.length,
  };
}

/** 11 條新登記的 SEQUENCE。 */
const R84_SPECS: readonly number[] = [4, 5, 6, 24, 25, 27, 32, 34, 50, 51, 55];

// ---------------------------------------------------------------------------
// 一、三分法：55 登記 + 12 派發 + 0 佔位 = 67（R94 把最後一條佔位落地）
// ---------------------------------------------------------------------------

test('R84 三分法：67 = 55 登記 + 12 戰中派發 + 0 顯式佔位', () => {
  const implemented = Object.keys(WISE_SPECS).map(Number).sort((a, b) => a - b);
  const missing = WISE_UNIMPLEMENTED.slice().sort((a, b) => a - b);
  assert.equal(implemented.length, 55);
  assert.equal(missing.length, 12);
  assert.equal(WISE_STRATEGY_ONLY.length, 12);
  assert.equal(Object.keys(WISE_SYSO_UNSUPPORTED).length, 0);

  // 12 條派髮型不在登記表裡 —— 否則出征頁一次 + 戰中一次 = 雙倍
  for (const seq of WISE_STRATEGY_ONLY) {
    assert.ok(missing.includes(seq), `seq ${seq} 應在 unimplemented 名單裡`);
    assert.equal(WISE_SPECS[seq], undefined, `seq ${seq} 不能同時登記`);
  }
  // R94：3 後選出陣已從佔位改成正規登記（deploy / choose_after_foe），不再在 missing 裡。
  assert.deepEqual(Object.keys(WISE_SYSO_UNSUPPORTED).map(Number), [], '不再有真佔位');
  assert.ok(!missing.includes(3), '3 已落地，不該再進 unimplemented');
  assert.equal(WISE_SPECS[3]?.kind, 'deploy');
  assert.equal(WISE_SPECS[3]?.op, 'choose_after_foe');

  // 12 條派髮型在派發器裡都有真分支（不是 reserve 那種只有日誌的）
  for (const seq of WISE_STRATEGY_ONLY) {
    const row = data.wises.find((w) => w.SEQUENCE === seq);
    assert.ok(row, `wises.json 裡沒有 seq ${seq}`);
    const def = STRATEGY_TABLE.find((d) => d.exec === row!.Execute);
    assert.ok(def, `seq ${seq}（Execute ${row!.Execute}）在 STRATEGY_TABLE 裡沒有分支`);
    assert.notEqual(def!.kind, 'reserve', `seq ${seq} 的分支應有真實改動`);
  }

  // 覆蓋完整：登記 + 未登記 = 全部 67 條，且不重疊（R94 後 missing 就是那 12 條派髮型）
  const union = [...implemented, ...missing].sort((a, b) => a - b);
  assert.deepEqual(union, data.wises.map((w) => w.SEQUENCE).sort((a, b) => a - b));
  assert.equal(new Set(union).size, union.length);
});

test('R84 12 條派髮型走戰前 applyWise 一律 skip（避免雙算）', () => {
  for (const seq of WISE_STRATEGY_ONLY) {
    const w = mk();
    const before = snapshot(w);
    assert.equal(applyWise(w, 'A', seq).ok, false, `seq ${seq} 不該在戰前路徑生效`);
    assert.deepEqual(snapshot(w), before, `seq ${seq} 被 skip 時不能改世界`);
  }
});

test('R84 11 條 + R94 的 3 都能被 wiseEffectOf 描述（不再返回 null）', () => {
  for (const seq of [...R84_SPECS, 3]) {
    const e = wiseEffectOf(data, seq);
    assert.ok(e, `seq ${seq} 應該有實現`);
    assert.equal(e!.seq, seq);
    assert.equal(e!.kind, WISE_SPECS[seq]!.kind);
    assert.equal(e!.note, WISE_SPECS[seq]!.note);
    assert.ok(wiseHintOf(seq), `seq ${seq} 應有 UI 提示`);
  }
  // R94：3 後選出陣落地後，唯一「有數據但無實現」的路徑只剩未知 seq。
  assert.equal(wiseEffectOf(data, 999), null, '未知 seq 仍回 null');
  assert.equal(wiseHintOf(999), null);
});

// ---------------------------------------------------------------------------
// 二、擾亂敵將 4/25/51：敵軍疲勞檔 +1/+2/+3（戰後 ×1.5/×2/×2.5）
// ---------------------------------------------------------------------------

/** `0x4103DE` 的倍率表（檔位 −1..−3 與 +1..+3），[确认] 见 text_dis.tsv。 */
const FATIGUE_PCT = [30, 50, 75, 100, 150, 200, 250] as const;

test('R84 擾亂敵將 4/25/51：敵軍档位 +1/+2/+3，戰後實得疲勞 ×1.5/×2/×2.5', () => {
  const baseGain = settle(mk()).tireGain;
  assert.equal(baseGain, 15, 'tick=0 時 `0x41048D` 基值 15');
  for (const [seq, idx] of [[4, 1], [25, 2], [51, 3]] as const) {
    const w = mk();
    assert.equal(applyWise(w, 'A', seq).ok, true);
    assert.equal(w.army.B.fatigueIdx, idx, `seq ${seq} 寫入檔位`);
    assert.equal(w.sides.B.general.tire, undefined, '不再直接改疲勞點數');
    assert.equal(w.army.A.fatigueIdx, 0, '不該打到自己');
    const expect = Math.trunc((baseGain * FATIGUE_PCT[idx + 3]!) / 100);
    const r = settle(w);
    assert.equal(r.tireAdded.B, expect, `seq ${seq} 的戰後實得增量（base ${baseGain}）`);
    assert.equal(r.tireIdx.B, idx, '結算讀到同一個檔位');
    assert.equal(r.tireAdded.A, baseGain, '我方沒被擾亂，仍是基值');
    assert.equal(r.tire.A.after, baseGain);
  }
});

test('R84 擾亂敵將 反向：三檔都不碰自己、關掉時敵軍檔位不變', () => {
  for (const seq of [4, 25, 51] as const) {
    const w = mk();
    w.sides.A.general.tire = 20;
    w.army.A.fatigueIdx = -2;
    applyWise(w, 'A', seq);
    assert.equal(w.sides.A.general.tire, 20, `seq ${seq} 不能打自己`);
    assert.equal(w.army.A.fatigueIdx, -2, `seq ${seq} 不能改我方檔位`);
  }
  const w = mk();
  const before = snapshot(w);
  assert.deepEqual(applyWise(w, 'A', null), { ok: true });
  assert.deepEqual(snapshot(w), before, '空選不改世界');
  assert.equal(w.army.B.fatigueIdx, 0, '預設檔位 0');
  assert.equal(w.sides.B.general.tire, undefined, '預設不寫 tire');
});

// ---------------------------------------------------------------------------
// 三、減少疲勞 5/27/50：我軍疲勞檔 −1/−2/−3（戰後 ×0.75/×0.5/×0.3）
// ---------------------------------------------------------------------------

test('R84 減少疲勞 5/27/50：我軍档位 −1/−2/−3，戰後實得疲勞 ×0.75/×0.5/×0.3', () => {
  const baseGain = settle(mk()).tireGain;
  for (const [seq, idx] of [[5, -1], [27, -2], [50, -3]] as const) {
    const w = mk();
    w.sides.A.general.tire = 40;
    assert.equal(applyWise(w, 'A', seq).ok, true);
    assert.equal(w.army.A.fatigueIdx, idx, `seq ${seq} 寫入檔位`);
    assert.equal(w.sides.A.general.tire, 40, '不再直接改疲勞點數');
    const expect = Math.trunc((baseGain * FATIGUE_PCT[idx + 3]!) / 100);
    const r = settle(w);
    assert.equal(r.tireAdded.A, expect, `seq ${seq} 的戰後實得增量（base ${baseGain}）`);
    assert.equal(r.tire.A.before, 40);
    assert.equal(r.tire.A.after, 40 + expect);
  }
});

test('R84 減少疲勞 反向：檔位 < −3 回到 100%（無符號比較）、也不打敵方', () => {
  const baseGain = settle(mk()).tireGain;
  const w = mk();
  for (let i = 0; i < 2; i++) assert.equal(applyWise(w, 'A', 50).ok, true);
  assert.equal(w.army.A.fatigueIdx, -6, '兩發 −3 累到 −6');
  assert.equal(settle(w).tireAdded.A, baseGain, 'idx < −3 回到原值（0x4103DE 的 ja 是無符號比較）');
  assert.equal(w.army.B.fatigueIdx, 0, '減疲勞只對自己');

  const off = mk();
  off.sides.A.general.tire = 40;
  const before = snapshot(off);
  applyWise(off, 'A', null);
  assert.deepEqual(snapshot(off), before, '關掉時疲勞一位不變');
});

// ---------------------------------------------------------------------------
// 四、離間計 6/34/55：敵將忠誠 −8/15/25（基準 = generals.json 的 Loyal）
// ---------------------------------------------------------------------------

test('R84 離間計 6/34/55：呂布(33) 忠誠 → 25/18/8', () => {
  const cases = [[6, 25], [34, 18], [55, 8]] as const;
  for (const [seq, expect] of cases) {
    const w = mk({ b: { general: gen('呂布') } });
    assert.equal(applyWise(w, 'A', seq).ok, true);
    assert.equal(w.sides.B.general.loyal, expect, `seq ${seq} 寫入值`);
    assert.equal(read(w).loyal.B, expect, `seq ${seq} 的結算忠誠（battle.ts:2062）`);
  }
  // 對照：不施放時結算讀的是 generals.json 的 33
  assert.equal(read(mk({ b: { general: gen('呂布') } })).loyal.B, 33);
});

test('R84 離間計 反向：不打自己那側、關掉時忠誠一位不變', () => {
  const w = mk({ b: { general: gen('呂布') } });
  applyWise(w, 'B', 55);
  assert.equal(w.sides.B.general.loyal, undefined, 'B 打的是 A，不能改自己');
  assert.equal(typeof w.sides.A.general.loyal, 'number', '被離間的是 A 的主將');
  // 注意顺序：settle() 會把 g.loyal 改寫成「戰後忠誠」，所以先取快照再結算
  const written = w.sides.A.general.loyal;
  assert.equal(read(w).loyal.A, written, '結算讀同一個字段');

  const off = mk({ b: { general: gen('呂布') } });
  const before = snapshot(off);
  applyWise(off, 'A', null);
  assert.deepEqual(snapshot(off), before);
  assert.equal(off.sides.B.general.loyal, undefined, '關掉時不寫 g.loyal');
});

// ---------------------------------------------------------------------------
// 五、勸降 32：忠誠 > 90 或節操 > 5 招不動（strategy.ts:483-495 的兩道閘）
// ---------------------------------------------------------------------------

test('R84 勸降 32：呂布(33/節操1) 招得動 → 忠誠 18，結算讀得到', () => {
  const w = mk({ b: { general: gen('呂布') } });
  const r = applyWise(w, 'A', 32);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'loyal');
  assert.equal(w.sides.B.general.loyal, 18);
  assert.equal(read(w).loyal.B, 18);
});

test('R84 勸降 反向：忠誠>90 / 節操>5 兩個閘各自都能擋住，且不寫字段', () => {
  // 閘一：忠誠 95
  const w1 = mk({ b: { general: gen('呂布') } });
  w1.sides.B.general.loyal = 95;
  assert.equal(applyWise(w1, 'A', 32).ok, false, '忠誠 > 90 應失敗');
  assert.equal(w1.sides.B.general.loyal, 95, '失敗時不能改忠誠');

  // 閘二：節操 6（忠誠只有 33，單獨命中節操閘）
  const w2 = mk({ b: { general: gen('呂布') } });
  w2.sides.B.general.constancy = 6;
  assert.equal(applyWise(w2, 'A', 32).ok, false, '節操 > 5 應失敗');
  assert.equal(w2.sides.B.general.loyal, undefined, '失敗時不能寫 g.loyal');

  // 真實數據：關羽 忠誠 100 / 節操 6，兩道閘都命中
  const guan = data.generals.find((g) => g.NAME === '關羽');
  assert.ok(guan);
  assert.ok((guan!.Loyal ?? 0) > 90 && (guan!.CONSTANCY ?? 0) > 5, '關羽應同時觸發兩道閘');
  const w3 = mk({ b: { general: gen('關羽') } });
  assert.equal(applyWise(w3, 'A', 32).ok, false);
  assert.equal(w3.sides.B.general.loyal, undefined);
});

// ---------------------------------------------------------------------------
// 六、化解計策 24：給敵軍記一次「待取消的派發」（seq 不動）
// ---------------------------------------------------------------------------

test('R84 化解計策 24：敵軍 cancelPending +1，seq 不再被清掉', () => {
  const w = mk({ b: { strategy: 1 } });
  assert.equal(w.army.B.seq, 1);
  const r = applyWise(w, 'A', 24);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'dispel');
  assert.equal(w.army.B.cancelPending, 1, '記一次待取消');
  assert.equal(w.army.B.seq, 1, '原作 0x44E34C 只打日誌；本作只取消一次，不清 seq');
});

test('R84 化解計策 反向：關掉時不記、記的是敵方不是自己', () => {
  const off = mk({ b: { strategy: 1 } });
  applyWise(off, 'A', null);
  assert.equal(off.army.B.cancelPending, 0, '關掉時不能記');
  assert.equal(off.army.B.seq, 1, '關掉時不能清');

  const self = mk({ a: { strategy: 2 }, b: { strategy: 1 } });
  applyWise(self, 'B', 24); // B 放化解 → 記 A
  assert.equal(self.army.A.cancelPending, 1, 'A 被記一次');
  assert.equal(self.army.B.cancelPending, 0, 'B 自己的不能被自己記');
});

test('R84 化解計策 24 行為差量：B 仍派發一次，但那一發被取消（ops 空、cancelled）', () => {
  const run = (dispel: boolean): World => {
    const w = mk({ a: { strategy: 2, soldiers: 40 }, b: { strategy: 1, soldiers: 40 } });
    if (dispel) assert.equal(applyWise(w, 'A', 24).ok, true);
    for (let i = 0; i < 900 && !w.over; i++) step(w);
    return w;
  };

  const control = run(false);
  const cb = control.strategyEvents.filter((e) => e.side === 'B');
  assert.ok(cb.length >= 1, `對照組裡 B 應派發過軍師技，實際 ${cb.length}`);
  assert.ok(cb.every((e) => !e.cancelled), '對照組不該有 cancelled 事件');

  const w = run(true);
  const eb = w.strategyEvents.filter((e) => e.side === 'B');
  assert.equal(eb.length, 1, '事件照發：不是整場不派發，而是派發被取消一次');
  assert.equal(eb[0]!.cancelled, true, 'B 那一發被化解');
  assert.deepEqual(eb[0]!.ops, [], '被化解的一發 ops 一條都不落地');
  assert.equal(w.army.B.cancelPending, 0, '取消額度用完');
  assert.equal(w.army.B.used, true, '派發仍然消耗掉了');
  assert.ok(w.strategyEvents.some((e) => e.side === 'A'), '化解不影響自己派發');
});

// ---------------------------------------------------------------------------
// 七、疲勞不進戰力（防止未來有人把它接成係數）
// ---------------------------------------------------------------------------

test('R84 疲勞不進戰力/命中（docs/04b5 §2.2 [确认]）：+3 檔不改 powerOf', () => {
  const base = powerOf(mk(), 'B');
  const w = mk();
  assert.equal(applyWise(w, 'A', 51).ok, true);
  assert.equal(w.army.B.fatigueIdx, 3);
  assert.equal(w.sides.B.general.tire, undefined, '戰中不寫疲勞點數');
  assert.equal(powerOf(w, 'B'), base, '疲勞不是戰力係數');
  // 自己那側同理
  const w2 = mk();
  w2.sides.A.general.tire = 90;
  assert.equal(powerOf(w2, 'A'), powerOf(mk(), 'A'));
});

// ---------------------------------------------------------------------------
// 八、逐條「關掉時不生效」總表
// ---------------------------------------------------------------------------

test('R84 11 條逐條對照：開 → 世界變了；關 → 一位不變', () => {
  for (const seq of R84_SPECS) {
    const off = mk({ b: { general: gen('呂布') } });
    const before = snapshot(off);
    assert.equal(applyWise(off, 'A', null).ok, true);
    assert.deepEqual(snapshot(off), before, `seq ${seq}：關掉時不能有任何改動`);
  }
});
