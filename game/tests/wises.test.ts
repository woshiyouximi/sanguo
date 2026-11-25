/**
 * 軍師技（core/wises.ts）自檢。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/wises.test.ts
 *
 * 這裡釘三層：
 *   1. 分類表不漏、不錯（R94 後 67 = 55 + 12 + 0，14 類）；
 *   2. 25 條「直接改數值」的效果真的改到世界裡的數值；
 *   3. R69 的 18 條「側表型」逐條量 battle.ts 的真實消費點（tickSkills / qiCostMul /
 *      powerOf / settle），外加 applyWiseOnBattleStart（AI 側自動發動）。
 * 不是覆蓋率。原表沒有強度字段，所以每一檔的數值只能由本作定死，測試就是那份契約。
 * R33（project/109）：troop_atk 的 6 條從「百分比」改成原作「點數」；舊的
 * `round(base*(1+d/100))` 已被 `0x44D450` exec 21-26（`army+0x70 += v`）推翻。
 * 其餘 3 個通道（qi_regen / qi_cost / exp_bonus）仍按百分比乘算，不是同一個口徑。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, EXPECT } from '../src/data.ts';
import {
  QI_MAX,
  QI_START,
  cast,
  createWorld,
  powerOf,
  qiCostMul,
  qiCostOf,
  qiRegenOf,
  settle,
  tickSkills,
} from '../src/core/battle.ts';
import type { Side, World } from '../src/core/battle.ts';
import {
  WISE_KIND_LABEL,
  WISE_SPECS,
  WISE_UNIMPLEMENTED,
  applyWise,
  applyWiseOnBattleStart,
  generalLevel,
  listWisdomChoices,
  parseWiseSkill,
  wiseBonus,
  wiseEffectOf,
  wiseHintOf,
  wiseModifiers,
} from '../src/core/wises.ts';
import type { WiseChannel } from '../src/core/wises.ts';
import type { General } from '../src/types.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function fresh(): World {
  return createWorld({ data, seed: 7 });
}

/** 造一個測試武將。WISESKILL 在數據裡是 ["1, 6"] 這種字符串，types.ts 卻聲明成 [number,number][]。 */
function fakeGeneral(wiseSkill: unknown[], level?: number): General {
  const g: General & { level?: number } = {
    NAME: '測試將',
    STR: 80,
    INT: 60,
    BaseHP: 100,
    BaseMP: 60,
    WISESKILL: wiseSkill as General['WISESKILL'],
  };
  if (level !== undefined) g.level = level;
  return g;
}

/** General 沒有 level 欄位（存檔也還沒記），測試裡顯式掛一個再傳進去。 */
function atLevel(g: General, level: number): General {
  return { ...g, level } as General;
}

// ---------------------------------------------------------------------------
// 分類表
// ---------------------------------------------------------------------------

test('分類表覆蓋 67 條：每條不是有實現，就是在 unimplemented', () => {
  const all = data.wises.map((w) => w.SEQUENCE).sort((a, b) => a - b);
  assert.equal(all.length, EXPECT.wises);
  assert.equal(all.length, 67);

  const implemented = Object.keys(WISE_SPECS).map(Number).sort((a, b) => a - b);
  const missing = WISE_UNIMPLEMENTED.slice().sort((a, b) => a - b);
  const union = [...implemented, ...missing].sort((a, b) => a - b);

  assert.deepEqual(union, all, '實現 + unimplemented 必須剛好等於 67 條');
  assert.equal(new Set(union).size, union.length, '不許重複歸類');
  assert.equal(implemented.length, 55);
  assert.equal(missing.length, 12);
});

test('分類表沒有臟 seq：實現和 unimplemented 的每一條都在 wises.json 裡', () => {
  const known = new Set(data.wises.map((w) => w.SEQUENCE));
  for (const seq of Object.keys(WISE_SPECS).map(Number)) assert.ok(known.has(seq), `未知 seq ${seq}`);
  for (const seq of WISE_UNIMPLEMENTED) assert.ok(known.has(seq), `未知 seq ${seq}`);
});

test('14 類都有條目，且 kind 都在 14 類裡', () => {
  const kinds = new Set(Object.values(WISE_SPECS).map((s) => s.kind));
  assert.deepEqual([...kinds].sort(), Object.keys(WISE_KIND_LABEL).sort());
  assert.equal(kinds.size, 14);
  for (const [seq, spec] of Object.entries(WISE_SPECS)) {
    assert.ok(spec.kind in WISE_KIND_LABEL, `seq ${seq} 的 kind ${spec.kind} 不在分類表`);
    assert.ok(spec.note.length > 0, `seq ${seq} 缺 UI 提示`);
  }
});

test('三檔（WiseLevel 1/2/3）的數值嚴格遞增：士氣/技力/體力', () => {
  // 每個技名在同一類裡必須是三檔遞增，否則「WiseLevel 當檔位」的假設不成立
  const groups: number[][] = [
    [1, 18, 38], // 鼓舞士氣
    [2, 19, 39], // 降敵士氣
    [13, 42, 60], // 增加技力
    [12, 41, 58], // 恢復技力
    [14, 43, 61], // 增加體力
    [11, 40, 57], // 恢復體力
    [22, 49, 67], // 強化武將
  ];
  for (const g of groups) {
    const vals = g.map((seq) => Math.abs(WISE_SPECS[seq]!.value));
    assert.ok(vals[0]! < vals[1]! && vals[1]! < vals[2]!, `檔位數值沒有遞增：${g.join(',')} = ${vals.join('/')}`);
  }
});

test('wiseEffectOf：已實現有名字/類/提示，未知返回 null', () => {
  const e = wiseEffectOf(data, 13);
  assert.ok(e);
  assert.equal(e.name, '增加技力');
  assert.equal(e.kind, 'mp');
  assert.equal(e.note, WISE_SPECS[13]!.note);

  // R94：3 後選出陣從「佔位」改成正規登記（kind: deploy / op: choose_after_foe）。
  // 依據 project/109 §5.3「使用方在敵方之後選將/兵種」+ 原作 0x44DE44 零狀態寫入。
  const d = wiseEffectOf(data, 3);
  assert.ok(d, '後選出陣已登記，不再回 null');
  assert.equal(d.name, '後選出陣');
  assert.equal(d.kind, 'deploy');
  assert.equal(d.note, WISE_SPECS[3]!.note);
  assert.equal(wiseEffectOf(data, 999), null, '未知 seq');
  assert.equal(wiseHintOf(3), WISE_SPECS[3]!.note);
  assert.equal(wiseHintOf(13), WISE_SPECS[13]!.note);
});

test('所有已實現條目都能 apply 到新世界，數值只動合理範圍', () => {
  for (const seq of Object.keys(WISE_SPECS).map(Number)) {
    const w = fresh();
    const r = applyWise(w, 'A', seq);
    // R84：勸降（32）帶兩道閘（忠誠 > 90 / 節操 > 5），fresh 世界裡敵將是真實武將，
    // 本來就可能招不動 —— 那不是 bug。gated 案例在 wises_r84.test.ts 裡正反各測一次。
    if (seq === 32) {
      assert.equal(typeof r.ok, 'boolean');
      continue;
    }
    assert.equal(r.ok, true, `seq ${seq} 應用的結果不是 ok`);
    assert.equal(r.kind, WISE_SPECS[seq]!.kind);
    // 不能把主將打殘、也不能把兵打光
    assert.ok(w.sides.A.general.hp > 0 && w.sides.B.general.hp > 0);
    assert.ok(w.sides.A.morale >= 0 && w.sides.A.morale <= 100);
    assert.ok(w.sides.B.morale >= 0 && w.sides.B.morale <= 100);
  }
});

// ---------------------------------------------------------------------------
// 代表效果：技力 / 士氣 / 體力 / 武力 / 伏兵
// ---------------------------------------------------------------------------

test('增加技力（13）：上限與當前技力一起 +12', () => {
  const w = fresh();
  const g = w.sides.A.general;
  // 0x40A098：智力 60 ≤ 武力 80 → t = INT，60 + 1×2×60/100 = 61
  assert.equal(g.mpMax, 61);
  const before = g.mpMax;
  assert.deepEqual(applyWise(w, 'A', 13), { ok: true, kind: 'mp', note: '技力上限 +12' });
  assert.equal(g.mpMax, before + 12);
  assert.equal(g.mp, g.mpMax);
});

test('降敵士氣（2）：只減敵方，不減自己，可疊加', () => {
  const w = fresh();
  assert.equal(w.sides.A.morale, 60);
  assert.equal(w.sides.B.morale, 60);
  applyWise(w, 'A', 2);
  assert.equal(w.sides.B.morale, 55);
  assert.equal(w.sides.A.morale, 60);
  applyWise(w, 'A', 19);
  assert.equal(w.sides.B.morale, 47, '−5 再 −8');
});

test('增加體力（14）：上限與當前體力一起 +15', () => {
  const w = fresh();
  const g = w.sides.A.general;
  // 0x40A020：100 + 1×2×80/100 = 101
  assert.equal(g.maxHp, 101);
  applyWise(w, 'A', 14);
  assert.equal(g.maxHp, 116);
  assert.equal(g.hp, 116);
});

// R88：原作 Execute 35-37 是「戰鬥中每 N 幀回復」的旗標 + 參數（`army+0x84 |= 1`、
// `+0x88 = 40/60/80`），不是瞬回；滿血開戰時瞬回等於沒寫（probe 證實 pre 無差量）。
test('恢復體力（11）：寫戰中持續回復 40，不動當前體力', () => {
  const w = fresh();
  const g = w.sides.A.general;
  g.hp = 50;
  applyWise(w, 'A', 11);
  assert.equal(g.hp, 50, '不再瞬回');
  assert.equal(g.maxHp, 101);
  assert.equal(w.army?.A?.hpRegen, 40);
  assert.equal(w.army?.A?.flags ?? 0, 0x1);
  applyWise(w, 'A', 11);
  assert.equal(g.hp, 50, '重複發動也不瞬回');
});

test('強化武將（22）：主將武力 +4（hitChance 實時讀 str）', () => {
  const w = fresh();
  assert.equal(w.sides.A.general.str, 80);
  applyWise(w, 'A', 22);
  assert.equal(w.sides.A.general.str, 84);
  assert.equal(w.sides.B.general.str, 80, '不能改到對面');
});

// R88：原作 Execute 44（`0x44E09D` 起）是 `foeArmy+0x84 |= 4`（敵方無法退兵），
// 不是「我方後排 +6 兵」（舊實作無原作依據）。這裡改成釘住狀態位與單位數不變。
test('十面埋伏（54）：敵方 noRetreat 位，兵數不變', () => {
  const w = fresh();
  const before = w.units.filter((u) => u.side === 'A' && !u.isGeneral);
  assert.equal(before.length, 100);

  assert.deepEqual(applyWise(w, 'A', 54), {
    ok: true,
    kind: 'ambush',
    note: '敵方無法退兵（十面埋伏）',
  });

  assert.equal(w.army?.B?.flags ?? 0, 0x4, '敵方 noRetreat 位');
  assert.equal(w.army?.A?.flags ?? 0, 0, '不能改到我方');
  const after = w.units.filter((u) => u.side === 'A' && !u.isGeneral);
  assert.equal(after.length, 100, '不再追加兵');
  assert.equal(w.sides.A.start, 100);
});

test('十面埋伏（54）：敵將有坐騎時破解，不置位（原作 0x40918A 分支）', () => {
  const horseRow = data.generals.find((x) => typeof x.Horse === 'string' && x.Horse.length > 0);
  assert.ok(horseRow, 'data 裡要有帶坐騎的武將');
  const w = createWorld({ data, seed: 7, b: { general: { name: horseRow.NAME, str: 70, int: 50, level: 1 } } });
  assert.deepEqual(applyWise(w, 'A', 54), { ok: false, kind: 'ambush', note: '條件不滿足，未生效' });
  assert.equal(w.army?.B?.flags ?? 0, 0, '有馬則埋伏被破解，不置位');
});

// ---------------------------------------------------------------------------
// mod 類：累積到 world.wises，等 battle.ts 主循環消費
// ---------------------------------------------------------------------------

test('快速集氣（9）：寫進 world.wises 的 qi_regen +25，不動 qi 本身', () => {
  const w = fresh();
  const qi = w.sides.A.general.qi;
  applyWise(w, 'A', 9);
  assert.equal(wiseBonus(w, 'A', 'qi_regen'), 25);
  assert.equal(wiseBonus(w, 'B', 'qi_regen'), 0);
  assert.equal(w.sides.A.general.qi, qi, '沒有主循環消費前 qi 不該被直接改');
  assert.deepEqual(wiseModifiers(w).map((m) => [m.side, m.kind, m.value, m.seq]), [['A', 'qi_regen', 25, 9]]);
});

test('減緩集氣（7）：打在敵方通道上（A 發動 → 記在 B 頭上，−25）', () => {
  const w = fresh();
  applyWise(w, 'A', 7);
  assert.equal(wiseBonus(w, 'B', 'qi_regen'), -25);
  assert.equal(wiseBonus(w, 'A', 'qi_regen'), 0);
});

test('同通道可疊加：增強攻擊 10 點 + 20 點 = 30 點（R33 純加法）', () => {
  const w = fresh();
  applyWise(w, 'A', 17);
  applyWise(w, 'A', 46);
  assert.equal(wiseBonus(w, 'A', 'troop_atk'), 30);
  assert.equal(wiseModifiers(w).length, 2);
});

test('增加經驗（21）：戰後經驗 +15%，走 exp_bonus 通道', () => {
  const w = fresh();
  applyWise(w, 'A', 21);
  assert.equal(wiseBonus(w, 'A', 'exp_bonus'), 15);
});

// ---------------------------------------------------------------------------
// 空選 / 未知 / 未實現
// ---------------------------------------------------------------------------

test('applyWise(null)：空選不報錯、不碰世界', () => {
  const w = fresh();
  const snapshot = {
    aHp: w.sides.A.general.hp, aMp: w.sides.A.general.mp, aMorale: w.sides.A.morale,
    bMorale: w.sides.B.morale, units: w.units.length,
  };
  assert.deepEqual(applyWise(w, 'A', null), { ok: true });
  assert.deepEqual(
    {
      aHp: w.sides.A.general.hp, aMp: w.sides.A.general.mp, aMorale: w.sides.A.morale,
      bMorale: w.sides.B.morale, units: w.units.length,
    },
    snapshot,
  );
});

test('applyWise：未知 seq 和派發型 seq 都是 ok:false（呼叫方靜默跳過）', () => {
  assert.equal(applyWise(fresh(), 'A', 999).ok, false);
  // R94：3 後選出陣已不是佔位 —— 戰前 applyWise 只立 army.chooseAfterFoe，不動任何數值。
  const w = fresh();
  const r = applyWise(w, 'A', 3);
  assert.equal(r.ok, true, '後選出陣已登記在 SPECS 裡');
  assert.equal(r.kind, 'deploy');
  assert.equal(w.army.A.chooseAfterFoe, true, '戰前只立「敵後選將」旗標');
  assert.equal(w.army.B.chooseAfterFoe, undefined, '不碰敵方');
  assert.equal(applyWise(fresh(), 'A', 10).ok, false, '詐敗只在戰中派發器生效，戰前路徑不登記');
});

// ---------------------------------------------------------------------------
// WISESKILL / 等級
// ---------------------------------------------------------------------------

test('WISESKILL 兩種寫法都解析得出來（字符串 + 數組）', () => {
  assert.deepEqual(parseWiseSkill(fakeGeneral(['1, 6', '10, 18'])), [[1, 6], [10, 18]]);
  assert.deepEqual(parseWiseSkill(fakeGeneral([[1, 6], [10, 18]])), [[1, 6], [10, 18]]);
  assert.deepEqual(parseWiseSkill(fakeGeneral(['壞數據', '3'])), []);
  assert.deepEqual(parseWiseSkill({ ...fakeGeneral([]), WISESKILL: undefined }), []);
});

test('listWisdomChoices 按 WISESKILL 的學習等級過濾', () => {
  const g = fakeGeneral(['1, 6', '10, 18', '20, 22']);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 1)), [6]);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 10)), [6, 18]);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 19)), [6, 18]);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 30)), [6, 18, 22]);
});

test('listWisdomChoices 也卡 WiseLevel 檔次（1 級用不了 2 檔技）', () => {
  // seq 18 = 鼓舞士氣 2 檔（WiseLevel 2），學習等級 1
  const g = fakeGeneral(['1, 18']);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 1)), []);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 2)), [18]);
});

test('listWisdomChoices 濾掉 wises.json 裡不存在的 seq，並按原順序去重', () => {
  const g = fakeGeneral(['1, 6', '1, 6', '1, 999', '1, 13']);
  assert.deepEqual(listWisdomChoices(data, atLevel(g, 5)), [6, 13]);
});

test('listWisdomChoices：真實武将（姜維 12 級只會前三條）', () => {
  const jiang = data.generals.find((g) => g.NAME === '姜維');
  assert.ok(jiang, '數據裡應該有姜維');
  // 姜維 WISESKILL = ["1, 24", "7, 47", "12, 43", "18, 32", …]
  assert.deepEqual(listWisdomChoices(data, atLevel(jiang, 6)), [24]);
  assert.deepEqual(listWisdomChoices(data, atLevel(jiang, 12)), [24, 47, 43]);
});

test('listWisdomChoices：同名技多檔只留最高檔（原作列表裡同名技只佔一格）', () => {
  // 張角 WISESKILL = ["1, 12", "7, 13", "12, 37", "18, 41", "23, 42", "29, 56", "34, 58", "40, 60"]
  // 12/41/58 都是「恢復技力」的三檔，13/42/60 都是「增加技力」的三檔。
  const zhang = data.generals.find((g) => g.NAME === '張角');
  assert.ok(zhang, '數據裡應該有張角');
  const l20 = listWisdomChoices(data, atLevel(zhang, 20));
  assert.deepEqual(
    l20.map((seq) => data.wises.find((w) => w.SEQUENCE === seq)?.NAME),
    ['恢復技力', '增加技力', '快速集氣'],
    '同名只留一條，順序按第一次學到的等級',
  );
  assert.deepEqual(l20, [41, 13, 37], '留已練到的最高檔（恢復技力是 18 級的 41 檔，不是 1 級的 12）');
  assert.deepEqual(listWisdomChoices(data, atLevel(zhang, 40)), [58, 60, 37, 56]);
});

test('generalLevel：缺省 1 級，顯式 level 優先', () => {
  assert.equal(generalLevel(fakeGeneral(['1, 6'])), 1);
  assert.equal(generalLevel(fakeGeneral(['1, 6'], 12)), 12);
  assert.equal(generalLevel(Object.assign(fakeGeneral(['1, 6']), { level: 0 })), 1);
});

// ---------------------------------------------------------------------------
// R69：18 條「登記了沒人用」的軍師技 → 逐條量真實消費點
//
// 這 18 條都是 op:'mod'：applyWise 只往 world.wises 側表寫一行，真正生效在 battle.ts
// 的 4 個函數裡。所以不能只斷言側表（那正是 R69 的老毛病「登記了沒人用」），要量這些
// 函數的輸出。全部用差分量測（對照組 = 同一個 fresh world），battle.ts 日後改基值公式
// 也不會把這裡的斷言弄壞。
//   · qi_regen  → tickSkills（每 tick 氣力增量）
//   · qi_cost   → qiCostMul（技能氣力倍率；cast 用它算實扣）
//   · troop_atk → powerOf（士兵攻擊力）
//   · exp_bonus → settle（戰後經驗）
// ---------------------------------------------------------------------------

/** 量一條消費點在該側的輸出。注意 qi_regen 會把氣力歸零再跑一 tick，只看增量。 */
function measure(w: World, side: Side, channel: WiseChannel): number {
  switch (channel) {
    case 'qi_regen': {
      const g = w.sides[side].general;
      g.qi = QI_START;
      tickSkills(w);
      return g.qi - QI_START;
    }
    case 'qi_cost':
      return qiCostMul(w, side);
    case 'troop_atk':
      return powerOf(w, side);
    case 'exp_bonus':
      return settle(w).expGain;
  }
}

/**
 * 消費點期望值。**量綱按通道分**（R33 / project/109）：
 *   · troop_atk 是**點**：`powerOf = base + delta`（原作 0x44D450 exec 21-26 加 army+0x70）
 *   · qi_cost 是倍率（不取整）
 *   · 其餘是百分比
 */
function expectedValue(base: number, delta: number, channel: WiseChannel): number {
  if (channel === 'troop_atk') return base + delta;
  const raw = base * (1 + delta / 100);
  return channel === 'qi_cost' ? raw : Math.round(raw);
}

interface ModCase {
  seq: number;
  /** 效果記在哪一側（原作 target=enemy 的技記在敵方頭上） */
  side: Side;
  channel: WiseChannel;
  delta: number;
}

// R33：troop_atk 從「百分比」改成原作口徑「點數」（project/109 與 lead 裁決）。
// 增強攻擊 17/46/64 = 我方 +10/+20/+30；強化士兵 16/45/63 = 敵方 −10/−20/−30
// （0x44D450 exec 21-23 `ownArmy+0x70 +=`、exec 24-26 `foeArmy+0x70 -=`）。
// 原斷言 `round(base*(1+d/100))` 已被反彙編推翻，改成 `base + d`；1/2/3 檔仍各留一條。
const MOD_CASES: readonly ModCase[] = [
  { seq: 9, side: 'A', channel: 'qi_regen', delta: 25 }, // 快速集氣 一檔
  { seq: 37, side: 'A', channel: 'qi_regen', delta: 40 },
  { seq: 52, side: 'A', channel: 'qi_regen', delta: 60 },
  { seq: 8, side: 'A', channel: 'qi_cost', delta: -20 }, // 保留氣力 一檔
  { seq: 36, side: 'A', channel: 'qi_cost', delta: -30 },
  { seq: 56, side: 'A', channel: 'qi_cost', delta: -45 },
  { seq: 7, side: 'B', channel: 'qi_regen', delta: -25 }, // 減緩集氣（打敵方）
  { seq: 35, side: 'B', channel: 'qi_regen', delta: -40 },
  { seq: 53, side: 'B', channel: 'qi_regen', delta: -60 },
  { seq: 16, side: 'B', channel: 'troop_atk', delta: -10 }, // 強化士兵 一檔（敵方）
  { seq: 45, side: 'B', channel: 'troop_atk', delta: -20 },
  { seq: 63, side: 'B', channel: 'troop_atk', delta: -30 },
  { seq: 17, side: 'A', channel: 'troop_atk', delta: 10 }, // 增強攻擊 一檔（我方）
  { seq: 46, side: 'A', channel: 'troop_atk', delta: 20 },
  { seq: 64, side: 'A', channel: 'troop_atk', delta: 30 },
  { seq: 21, side: 'A', channel: 'exp_bonus', delta: 15 }, // 增加經驗 一檔
  { seq: 47, side: 'A', channel: 'exp_bonus', delta: 25 },
  { seq: 65, side: 'A', channel: 'exp_bonus', delta: 40 },
];

for (const c of MOD_CASES) {
  test(`R69 消費點 #${c.seq} ${WISE_SPECS[c.seq]!.note} → ${c.channel}`, () => {
    const spec = WISE_SPECS[c.seq]!;
    assert.equal(spec.op, 'mod', `#${c.seq} 應是側表型`);
    assert.equal(spec.channel, c.channel);

    const base = measure(fresh(), c.side, c.channel);
    const w = fresh();
    assert.equal(applyWise(w, 'A', c.seq).ok, true);
    assert.deepEqual(wiseModifiers(w), [{ side: c.side, kind: c.channel, value: c.delta, seq: c.seq }]);
    assert.equal(wiseBonus(w, c.side, c.channel), c.delta);
    assert.equal(wiseBonus(w, c.side === 'A' ? 'B' : 'A', c.channel), 0, '不該影響另一側');
    assert.equal(measure(w, c.side, c.channel), expectedValue(base, c.delta, c.channel), '真實消費點輸出');
  });
}

test('R69 18 條 mod 技全在逐條清單裡，且 4 個通道都有消費點測試', () => {
  const allMods = Object.entries(WISE_SPECS)
    .filter(([, s]) => s.op === 'mod')
    .map(([seq]) => Number(seq))
    .sort((a, b) => a - b);
  assert.equal(allMods.length, 18);
  assert.deepEqual(MOD_CASES.map((c) => c.seq).sort((a, b) => a - b), allMods);
  assert.deepEqual(
    [...new Set(MOD_CASES.map((c) => c.channel))].sort(),
    ['exp_bonus', 'qi_cost', 'qi_regen', 'troop_atk'],
  );
});

test('R69 保留氣力 8/36/56 真的省氣：cast 實扣 = round(qiCostOf × qiCostMul)', () => {
  for (const seq of [8, 36, 56]) {
    const w = fresh();
    assert.equal(applyWise(w, 'A', seq).ok, true);
    const a = w.sides.A.general;
    a.mp = 9999;
    a.qi = QI_MAX;
    const target = w.units.find((u) => u.isGeneral && u.side === 'B')!;
    const r = cast(w, 'A', 1, target.x, target.y);
    assert.equal(r.ok, true, `#${seq} 應該放得出`);
    const cost = Math.round(qiCostOf(data, 1) * qiCostMul(w, 'A'));
    assert.equal(QI_MAX - a.qi, cost, `#${seq} 的實扣氣力`);
    assert.ok(cost < QI_MAX, `#${seq} 應該比沒掛軍師技省`);
  }
});

// ---------------------------------------------------------------------------
// applyWiseOnBattleStart：補「AI 側從來沒發動過軍師技」的缺口
// ---------------------------------------------------------------------------

test('applyWiseOnBattleStart：默認替 AI 側（B）按 WISESKILL 挑最新一條，A 側留給出征頁', () => {
  const zhang = data.generals.find((g) => g.NAME === '張角');
  assert.ok(zhang);
  const w = createWorld({
    data,
    seed: 1,
    b: { general: { name: '張角', str: zhang.STR, int: zhang.INT, level: 20 } },
  });
  const out = applyWiseOnBattleStart(w, data);
  assert.deepEqual(out.map((x) => [x.side, x.seq, x.name]), [['B', 37, '快速集氣']]);
  assert.equal(wiseBonus(w, 'B', 'qi_regen'), 40);
  assert.equal(wiseBonus(w, 'A', 'qi_regen'), 0, 'A 側不能被自動套');
  assert.deepEqual(applyWiseOnBattleStart(w, data), out, '同一 world 冪等');
  assert.equal(wiseBonus(w, 'B', 'qi_regen'), 40, '重複呼叫不能 +80');
});

test('applyWiseOnBattleStart：humanSides 清空後兩側都自動挑（按各自等級）', () => {
  const zhang = data.generals.find((g) => g.NAME === '張角');
  const guan = data.generals.find((g) => g.NAME === '關羽');
  assert.ok(zhang && guan);
  const w = createWorld({
    data,
    seed: 2,
    a: { general: { name: '關羽', str: guan.STR, int: guan.INT, level: 12 } },
    b: { general: { name: '張角', str: zhang.STR, int: zhang.INT, level: 20 } },
  });
  const out = applyWiseOnBattleStart(w, data, { humanSides: [] });
  assert.deepEqual(out.map((x) => x.side), ['A', 'B']);

  const guanSeq = listWisdomChoices(data, { ...guan, level: 12 } as General).at(-1)!;
  const zhangSeq = listWisdomChoices(data, { ...zhang, level: 20 } as General).at(-1)!;
  assert.equal(out[0]!.seq, guanSeq, '關羽 12 級挑已練到的最新一條');
  assert.equal(out[1]!.seq, zhangSeq);
  assert.equal(w.sides.A.general.str, guan.STR + WISE_SPECS[guanSeq]!.value);
});

test('applyWiseOnBattleStart：prefer 指定 / null 禁用，數值型效果照套', () => {
  const zhang = data.generals.find((g) => g.NAME === '張角');
  assert.ok(zhang);
  const w = createWorld({
    data,
    seed: 3,
    b: { general: { name: '張角', str: zhang.STR, int: zhang.INT, level: 20 } },
  });
  const mpBefore = w.sides.A.general.mpMax;
  const out = applyWiseOnBattleStart(w, data, { prefer: { A: 13, B: null } });
  assert.deepEqual(out.map((x) => [x.side, x.seq, x.name]), [['A', 13, '增加技力']]);
  assert.equal(w.sides.A.general.mpMax, mpBefore + 12, '英雄側指定數值型軍師技');
  assert.equal(wiseModifiers(w).length, 0, 'B 被明確禁用');
});

test('applyWiseOnBattleStart：查不到的武將 / 已有人套過的側 → 不重複發動', () => {
  assert.deepEqual(applyWiseOnBattleStart(fresh(), data), []);
  const w = createWorld({
    data,
    seed: 4,
    b: { general: { name: '查無此人', str: 80, int: 60, level: 30 } },
  });
  assert.deepEqual(applyWiseOnBattleStart(w, data), [], '武將不在 generals.json 就跳過');

  const w2 = createWorld({
    data,
    seed: 5,
    b: { general: { name: '張角', str: 99, int: 99, level: 20 } },
  });
  assert.equal(applyWise(w2, 'B', 9).ok, true, '先手動掛一條');
  assert.deepEqual(applyWiseOnBattleStart(w2, data), [], '已有側表就讓給呼叫方');
  assert.equal(wiseBonus(w2, 'B', 'qi_regen'), 25, '沒有被覆蓋成兩條');
});
