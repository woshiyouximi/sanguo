/**
 * 等级 → 帶兵 / 騎兵 / 體力 / 技力：把**两条口径**同时钉死。
 *
 * 仓库里有两份独立实现：
 *   - `core/battle.ts:1320 expToReach` / `:1325 levelFromExp`：战斗内升级用；
 *   - `core/garrison.ts:110 expForLevel` / `:122 levelFromExp`：守城方换算用。
 * 两份必须逐点一致（本文件用 0..7000 全量 + 大数采样对拍），否则同一个武将
 * 在"战斗里升到 X 级"和"守城时按经验算成 Y 级"会给出不同帶兵数 —— 玩家一眼能看出。
 *
 * 另外把 R23/R26/R42 的公式从 garrison 侧再钉一遍，并与 battle 的 `hpCapOf/mpCapOf/hitChance`
 * 交叉验证（同一个 BaseHP/STR/INT/Level 下两处必须同值）。
 *
 * 任务书给的口径（expToReach(2)=120、expToReach(3)=377、levelFromExp(200)=2、
 * levelFromExp(9999)=12、defenderBattleParams(2) 帶兵+騎=10、(12)=60+0）在本文件里全部原样断言；
 * 源码与 docs 无冲突，故无 `TODO(口径未定)`。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  cavalryCapOf,
  createWorld,
  expToReach,
  hitChance,
  hpCapOf,
  levelFromExp as battleLevelFromExp,
  mpCapOf,
} from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import {
  battleSetup,
  defenderBattleParams,
  expForLevel,
  garrisonOf,
  hitVsGeneral,
  levelFromExp as garrisonLevelFromExp,
} from '../src/core/garrison.ts';
import type { DefenderBattleParams } from '../src/core/garrison.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function rowOf(name: string) {
  const row = data.generals.find((g) => g.NAME === name);
  assert.ok(row, `generals.json 里找不到 ${name}`);
  return row;
}
/** 曹操 87/92、閻圃 42/80（str<int）、呂布 100/42（str>int，技力公式的怪处） */
const CAO = rowOf('曹操');
const YAN = rowOf('閻圃');
const LVBU = rowOf('呂布');

const officerOf = (row: typeof CAO) => ({ name: String(row.NAME), str: row.STR, int: row.INT });

/** 把静态命中惩罚清掉（prevX===x），拿纯公式值。 */
function standStill(world: World): void {
  for (const u of world.units) {
    u.prevX = u.x;
    u.prevY = u.y;
  }
}

describe('R26 升级经验表：battle.expToReach 与 garrison.expForLevel 同表', () => {
  it('任务书四个锚点 + 首项/末项', () => {
    assert.equal(expToReach(0), 0);
    assert.equal(expToReach(1), 0);
    assert.equal(expToReach(2), 120);
    assert.equal(expToReach(3), 377);
    assert.equal(expToReach(10), 6012);
    assert.equal(expToReach(99), 662921);
    assert.equal(expToReach(100), 676467, 'battle 侧不设 99 级上限，公式继续算');
  });

  it('公式逐点：n=2..99 全部等于 ((n−1)×137−34)×n/2+17', () => {
    for (let n = 2; n <= 99; n++) {
      assert.equal(expToReach(n), Math.trunc((((n - 1) * 137 - 34) * n) / 2 + 17), `expToReach(${n})`);
    }
  });

  it('garrison.expForLevel 在 1..99 与 battle.expToReach 完全一致', () => {
    for (let n = 1; n <= 99; n++) assert.equal(expForLevel(n), expToReach(n), `第 ${n} 级经验`);
    assert.equal(expForLevel(2), 120);
    assert.equal(expForLevel(3), 377);
  });

  it('口径差异（不可达）：expForLevel(100)=9999999 是查表哨兵，battle 侧没有这个哨兵', () => {
    assert.equal(expForLevel(100), 9999999);
    assert.equal(expToReach(100), 676467);
    // 等级上限 99（levelFromExp 两份都封 99），所以 100 级永远到不了，这不是行为分叉。
  });
});

describe('等级反推：battle.levelFromExp 与 garrison.levelFromExp 同解', () => {
  it('任务书锚点：200→2、9999→12', () => {
    assert.equal(battleLevelFromExp(200), 2);
    assert.equal(battleLevelFromExp(9999), 12);
    assert.equal(garrisonLevelFromExp(200), 2);
    assert.equal(garrisonLevelFromExp(9999), 12);
  });

  it('阈值两侧：119/120、376/377、6011/6012', () => {
    assert.equal(battleLevelFromExp(119), 1);
    assert.equal(battleLevelFromExp(120), 2);
    assert.equal(battleLevelFromExp(376), 2);
    assert.equal(battleLevelFromExp(377), 3);
    assert.equal(battleLevelFromExp(6011), 9);
    assert.equal(battleLevelFromExp(6012), 10);
    for (const exp of [119, 120, 376, 377, 6011, 6012]) {
      assert.equal(garrisonLevelFromExp(exp), battleLevelFromExp(exp), `exp=${exp}`);
    }
  });

  it('0..7000 全量对拍 + 大数采样：两套实现逐点相等', () => {
    for (let exp = 0; exp <= 7000; exp++) {
      assert.equal(garrisonLevelFromExp(exp), battleLevelFromExp(exp), `exp=${exp}`);
    }
    for (const exp of [8855, 10482, 20000, 100000, 662921, 9999999]) {
      assert.equal(garrisonLevelFromExp(exp), battleLevelFromExp(exp), `exp=${exp}`);
    }
    assert.equal(battleLevelFromExp(9999999), 99);
  });

  it('98/99 级边界：两套实现对拍（garrison 的 i<=99 已修正）', () => {
    // 回归背景：`garrison.ts` 的循环上界曾是 `i < 99`，只查到 f(98)，
    // 于是 exp ∈ [f(98), f(99)) = [649512, 662921) 时 battle=98、garrison=99。
    // 现在两处都是"查到 f(99)"，这一段必须一致。
    assert.equal(expToReach(98), 649512);
    assert.equal(expToReach(99), 662921);
    for (const exp of [649512, 650000, 662920, 662921, 700000]) {
      assert.equal(garrisonLevelFromExp(exp), battleLevelFromExp(exp), `exp=${exp}`);
    }
    assert.equal(battleLevelFromExp(649512), 98);
    assert.equal(garrisonLevelFromExp(649512), 98);
    assert.equal(battleLevelFromExp(662921), 99);
    assert.equal(garrisonLevelFromExp(662921), 99);
  });

  it('0 / 负数 / NaN 都夹到 1 级', () => {
    for (const exp of [0, -1, -99999, Number.NaN]) {
      assert.equal(battleLevelFromExp(exp), 1, `battle exp=${exp}`);
      assert.equal(garrisonLevelFromExp(exp), 1, `garrison exp=${exp}`);
    }
  });

  it('口径差异（不可达）：Infinity 时 garrison 归 0 经验→1 级，battle 直接当满经验→99 级', () => {
    // BaseEXP 来自 generals.json，永远是有限数；这里只把现状钉住，避免有人"顺手统一"时无声改行为。
    assert.equal(garrisonLevelFromExp(Number.POSITIVE_INFINITY), 1);
    assert.equal(battleLevelFromExp(Number.POSITIVE_INFINITY), 99);
  });
});

describe('等级→帶兵/騎兵（0x409FB6 / 0x409FD8）', () => {
  const paramsAt = (level: number, row = CAO): DefenderBattleParams => defenderBattleParams(officerOf(row), { ...row, level });

  it('任务书口径：2 级 帶兵+騎兵 === 10；12 级 === 60+0', () => {
    const lv2 = paramsAt(2);
    assert.equal(lv2.troopsMax, 10);
    assert.equal(lv2.cavalryMax, 0);
    assert.equal(lv2.soldiers, 10);
    assert.equal(lv2.troopsMax + lv2.cavalryMax, 10);

    const lv12 = paramsAt(12);
    assert.equal(lv12.troopsMax, 60);
    assert.equal(lv12.cavalryMax, 0);
    assert.equal(lv12.soldiers, 60);
    assert.equal(lv12.troopsMax + lv12.cavalryMax, 60);
  });

  it('等级阶梯：1/2/19/20/21/25/45/60 的帶兵、騎兵、上阵兵', () => {
    const table: [number, number, number, number][] = [
      // level, troopsMax, cavalryMax, soldiers
      [1, 5, 0, 5],
      [2, 10, 0, 10],
      [19, 95, 0, 95],
      [20, 100, 0, 100],
      [21, 100, 5, 105],
      [25, 100, 25, 125],
      [45, 100, 100, 200],
      [60, 100, 100, 200],
    ];
    for (const [level, troopsMax, cavalryMax, soldiers] of table) {
      const p = paramsAt(level);
      assert.equal(p.level, level);
      assert.equal(p.troopsMax, troopsMax, `lv${level} 帶兵`);
      assert.equal(p.cavalryMax, cavalryMax, `lv${level} 騎兵`);
      assert.equal(p.soldiers, soldiers, `lv${level} 上阵兵`);
      assert.equal(p.levelBasis, 'exe');
    }
  });

  it('1..99 级：soldiers === troopsMax+cavalryMax，且與 battle.cavalryCapOf 同式', () => {
    for (let level = 1; level <= 99; level++) {
      const p = paramsAt(level);
      assert.equal(p.troopsMax, level >= 20 ? 100 : level * 5, `lv${level} 帶兵`);
      assert.equal(p.cavalryMax, cavalryCapOf(level), `lv${level} 騎兵与 cavalryCapOf 不一致`);
      assert.equal(p.soldiers, p.troopsMax + p.cavalryMax, `lv${level} 上阵兵不等于两者之和`);
    }
  });

  it('无经验、无武将行 → 起始等级兜底且 levelBasis=start（R85 口径：BaseEXP 兜底 200 → Lv2）', () => {
    const p = defenderBattleParams({ name: '無名', str: 50, int: 50 });
    // R85（f2 取证 0x42D38B→0x409F73→0x42D39D）：等级由 BaseEXP 反推，缺行按 200 ⇒ Lv2 ⇒ 10 兵。
    assert.equal(p.level, 2);
    assert.equal(p.levelBasis, 'start');
    assert.equal(p.troopsMax, 10);
    assert.equal(p.cavalryMax, 0);
    assert.equal(p.soldiers, 10);
    assert.equal(p.hpMax, 2, '没有 BaseHP 时按 0 + trunc(2×2×50/100) = 2');
    assert.equal(p.mpMax, 2, '没有 BaseMP 时按 0 + trunc(2×2×50/100) = 2');
  });

  it('25 级的 125 落在 battleSetup 的 [1, 200] 区间内（并等于其夹取结果）', () => {
    const p25 = paramsAt(25);
    assert.equal(p25.soldiers, 125);
    // battleSetup 的 exe 分支：`max(1, min(200, params.soldiers || 1))`
    const clamped = Math.max(1, Math.min(200, p25.soldiers || 1));
    assert.equal(clamped, 125);
    assert.ok(clamped >= 1 && clamped <= 200);

    const setup = battleSetup(data, 0, '襄平', 100);
    assert.ok(setup.enemyTroops >= 1 && setup.enemyTroops <= 200, `battleSetup 给出 ${setup.enemyTroops}`);
    assert.ok(setup.enemyParams);
    assert.equal(setup.enemyTroops, Math.max(1, Math.min(200, setup.enemyParams.soldiers || 1)));
    assert.equal(setup.enemyParams.soldiers, setup.enemyParams.troopsMax + setup.enemyParams.cavalryMax);
  });
});

describe('等级→體力/技力（0x40A020 / 0x40A098）：garrison 与 battle 同值', () => {
  const paramsAt = (row: typeof CAO, level: number): DefenderBattleParams =>
    defenderBattleParams(officerOf(row), { ...row, level });

  it('曹操 2 级：體力 86 / 技力 47（逐项按公式）', () => {
    const p = paramsAt(CAO, 2);
    assert.equal(p.hpMax, 83 + Math.trunc((2 * 2 * 87) / 100));
    assert.equal(p.hpMax, 86);
    assert.equal(p.mpMax, 44 + Math.trunc((2 * 2 * 92) / 100));
    assert.equal(p.mpMax, 47);
  });

  it('曹操 12 级 / 45 级：體力與技力逐点', () => {
    assert.equal(paramsAt(CAO, 12).hpMax, 103); // 83 + trunc(24×87/100)=20
    assert.equal(paramsAt(CAO, 12).mpMax, 66); // 44 + trunc(24×92/100)=22
    assert.equal(paramsAt(CAO, 45).hpMax, 161); // 83 + trunc(90×87/100)=78
    assert.equal(paramsAt(CAO, 45).mpMax, 126); // 44 + trunc(90×92/100)=82
  });

  it('技力的 t 口径：str>int 时取 (str+int)/2 —— 呂布 45 级技力 99 而不是 73', () => {
    const p = paramsAt(LVBU, 45); // str 100,int 42 → t=trunc(142/2)=71
    assert.equal(p.mpMax, 36 + Math.trunc((90 * 71) / 100));
    assert.equal(p.mpMax, 99);
    assert.notEqual(p.mpMax, 36 + Math.trunc((90 * 42) / 100), '不能退回"只看 INT"的旧口径');
  });

  it('三行武将 × 1..99 级：garrison.hpMax/mpMax 与 battle.hpCapOf/mpCapOf 逐点相等', () => {
    for (const row of [CAO, YAN, LVBU]) {
      for (let level = 1; level <= 99; level++) {
        const p = paramsAt(row, level);
        assert.equal(p.hpMax, hpCapOf(row.BaseHP, row.STR, level), `${row.NAME} lv${level} 體力`);
        assert.equal(p.mpMax, mpCapOf(row.BaseMP, row.STR, row.INT, level), `${row.NAME} lv${level} 技力`);
        assert.ok(p.hpMax >= row.BaseHP && p.mpMax >= row.BaseMP);
      }
    }
  });

  it('命中基准三项：150+STR/2、150−STR×20/100、战力 150/士气 80', () => {
    const p = paramsAt(CAO, 2);
    assert.equal(p.hitVsSoldiers, 150 + Math.trunc(87 / 2));
    assert.equal(p.hitVsSoldiers, 193);
    assert.equal(p.hitFromSoldiers, 150 - Math.trunc((87 * 20) / 100));
    assert.equal(p.hitFromSoldiers, 133);
    assert.equal(p.powerBase, 150);
    assert.equal(p.morale, 80);
    assert.equal(p.moraleTerm, 6);
    assert.ok(p.unknown.length > 0, 'unknown 必须明确列出"没有映射"的字段');
  });
});

describe('R42 四条命中式交叉：garrison 静态基准 === battle.hitChance', () => {
  it('将→将：hitVsGeneral(87,92)=148 === hitChance(将 87 → 将 92)', () => {
    const w = createWorld({
      data,
      seed: 1,
      a: { soldiers: 4, general: { str: 87, int: 92 } },
      b: { soldiers: 4, general: { str: 92, int: 80 } },
    });
    standStill(w);
    const aGen = w.units.find((u) => u.side === 'A' && u.isGeneral)!;
    const bGen = w.units.find((u) => u.side === 'B' && u.isGeneral)!;
    assert.equal(w.weather, 0);
    assert.equal(hitVsGeneral({ str: 87 }, 92), 148);
    assert.equal(hitChance(w, aGen, bGen), hitVsGeneral({ str: 87 }, 92));
  });

  it('将→兵：defenderBattleParams.hitVsSoldiers === hitChance(将 → 步兵)', () => {
    const w = createWorld({ data, seed: 2, a: { soldiers: 4, general: { str: 87, int: 92 } }, b: { soldiers: 6 } });
    standStill(w);
    const aGen = w.units.find((u) => u.side === 'A' && u.isGeneral)!;
    const bSol = w.units.find((u) => u.side === 'B' && !u.isGeneral && u.alive)!;
    const p = defenderBattleParams(officerOf(CAO), { ...CAO, level: 2 });
    assert.equal(hitChance(w, aGen, bSol), p.hitVsSoldiers);
    assert.equal(hitChance(w, aGen, bSol), 150 + Math.trunc(87 / 2));
  });

  it('兵→将：defenderBattleParams.hitFromSoldiers === hitChance(兵 → 将 STR=92)', () => {
    const w = createWorld({ data, seed: 3, a: { soldiers: 6 }, b: { soldiers: 4, general: { str: 92, int: 80 } } });
    standStill(w);
    const aSol = w.units.find((u) => u.side === 'A' && !u.isGeneral && u.alive)!;
    const bGen = w.units.find((u) => u.side === 'B' && u.isGeneral)!;
    const p = defenderBattleParams({ name: '某', str: 92, int: 80 }, { ...CAO, level: 2 });
    assert.equal(hitChance(w, aSol, bGen), p.hitFromSoldiers);
    assert.equal(hitChance(w, aSol, bGen), 150 - Math.trunc((92 * 20) / 100));
  });
});

describe('battleSetup：exe（原作帶兵數）vs reserve（旧网页守軍/6）两条口径', () => {
  const CITY = '襄平';
  const SCENARIO = 0; // 剧本 1

  it('exe：上阵兵 = 帶兵數+騎兵數（襄平 守将 BaseEXP 200 → Lv2 → 10）', () => {
    const g = garrisonOf(data, SCENARIO, CITY);
    assert.ok(g, '襄平 应有守军数据');
    const setup = battleSetup(data, SCENARIO, CITY, 100);
    assert.ok(setup.enemyParams);
    // R85：等级来源 = BaseEXP 反推（原作 0x42D38B→0x409F73→0x42D39D），200 ⇒ Lv2。
    assert.equal(setup.enemyTroopsBasis, 'estimate:帶兵數@起始等級');
    assert.equal(setup.enemyParams.level, 2);
    assert.equal(setup.enemyTroops, 10);
    assert.equal(setup.enemyTroops, setup.enemyParams.troopsMax + setup.enemyParams.cavalryMax);
    assert.equal(setup.enemyParams.soldiers, 10);
  });

  it('reserve：旧网页估值 守軍/6 夹 60..100（襄平 守軍 139 → 60），与 exe 差 50', () => {
    const g = garrisonOf(data, SCENARIO, CITY);
    assert.ok(g);
    const total = g.garrison;
    const exe = battleSetup(data, SCENARIO, CITY, 100);
    const reserve = battleSetup(data, SCENARIO, CITY, 100, { troopMode: 'reserve' });
    assert.equal(reserve.enemyTroopsBasis, 'estimate:守軍/6');
    const expected = Math.max(1, Math.min(100, Math.max(60, Math.round(total / 6)), total));
    assert.equal(reserve.enemyTroops, expected, `守軍 ${total} → 期望 ${expected}`);
    assert.equal(reserve.enemyTroops, 60);
    assert.equal(exe.enemyTroops, 10);
    assert.equal(reserve.enemyTroops - exe.enemyTroops, 50);
    // 两种口径的"守将换算参数"是同一份，差别只在上阵兵数。
    assert.deepEqual(reserve.enemyParams, exe.enemyParams);
    assert.equal(reserve.enemyGeneral.name, exe.enemyGeneral.name);
  });

  it('两条口径都可复现：同参数调两次 deepEqual', () => {
    for (const troopMode of ['exe', 'reserve'] as const) {
      const a = battleSetup(data, SCENARIO, CITY, 100, { troopMode });
      const b = battleSetup(data, SCENARIO, CITY, 100, { troopMode });
      assert.deepEqual(b, a, `${troopMode} 不可复现`);
    }
  });

  it('我軍兵力被夹到 1..100（reserve 空守軍时的"我軍六成"分支不会越界）', () => {
    const tiny = battleSetup(data, SCENARIO, CITY, -5);
    const huge = battleSetup(data, SCENARIO, CITY, 9999);
    assert.ok(tiny.enemyTroops >= 1);
    assert.ok(huge.enemyTroops <= 200);
  });
});
