/**
 * 守将表自检：数据对不对得上 `scenarios.json` / `generals.json`，
 * 以及**旧数据兜底**（没有 `garrison` 字段）能不能算出同一份名单。
 *
 * 真数据不 mock：`garrison.json` 就是 `work/build_garrison.py` 的产物，
 * 这里顺手当成"上游数据没搬错"的回归测试。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import type { GarrisonData, GarrisonTable, Officer } from '../src/core/garrison.ts';
import {
  battleSetup,
  defenderBattleParams,
  defendersOf,
  expForLevel,
  garrisonOf,
  hitVsGeneral,
  levelFromExp,
  pickCommander,
} from '../src/core/garrison.ts';

const DIR = new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const base = loadData({ dir: DIR });
const TABLE = JSON.parse(
  readFileSync(new URL('../data/garrison.json', import.meta.url), 'utf8'),
) as GarrisonTable;

/** 带表的完整数据（正常路径） */
const data: GarrisonData = { ...base, garrison: TABLE };
/** 旧数据：字段不存在（兜底路径） */
const legacy: GarrisonData = { ...base, garrison: undefined };

/** 取 `scenarios.json` 里某剧本某城的原始行 */
function cityOf(index: number, name: string): Record<string, unknown> {
  const cities = base.scenarios[index].cities as Array<Record<string, unknown>>;
  const hit = cities.find((c) => c.NAME === name);
  assert.ok(hit, `scenarios.json 剧本 ${index} 里应有城 ${name}`);
  return hit;
}

/** 按 STR+INT 降序判定 */
function assertDescending(list: Officer[], label: string): void {
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1].str + list[i - 1].int;
    const cur = list[i].str + list[i].int;
    assert.ok(prev >= cur, `${label}: 第 ${i} 名 ${list[i].name}(${cur}) 高于前一名(${prev})`);
  }
}

// ---------------------------------------------------------------- 1. 城字段

test('第 1 剧本襄平：owner/major/wise 与 scenarios.json 逐字段一致', () => {
  const row = cityOf(0, '襄平');
  const g = garrisonOf(data, 0, '襄平');
  assert.ok(g, '襄平应查得到');
  assert.equal(g.owner, row.KING);
  assert.equal(g.major, row.MAJOR);
  assert.equal(g.wise, row.WISE);
  assert.equal(g.garrison, 141, 'POP 79500 → floor(79500/2500)+110 = 141');
  assert.equal(g.officers.length, 1, '第 1 剧本襄平只有閻圃在');
  assert.equal(g.officers[0].name, '閻圃');
});

test('第 4 剧本襄平：歸屬曹操、太守/軍師公孫康（不再是"守將"）', () => {
  const g = garrisonOf(data, 3, '襄平');
  assert.ok(g);
  assert.equal(g.owner, '曹操');
  assert.equal(g.major, '公孫康');
  assert.equal(g.wise, '公孫康', '原作 WISE 与 MAJOR 同人，照抄不修');
  assert.deepEqual(g.officers.map((o) => o.name), ['公孫恭', '公孫康', '傅幹']);
});

// ---------------------------------------------------------------- 2. 名单内容

test('北平（第 1 剧本）名单里能查到公孫瓚，且属性是武将表的真值', () => {
  const g = garrisonOf(data, 0, '北平');
  assert.ok(g);
  const gongsun = g.officers.find((o) => o.name === '公孫瓚');
  assert.ok(gongsun, '公孫瓚应在北平守将名单里');
  assert.deepEqual(gongsun, { name: '公孫瓚', str: 86, int: 70, loyal: 59, status: '登' });
  assert.equal(g.major, '公孫瓚', '他同时是北平太守');
});

test('南皮（第 1 剧本）11 人全收，与直接扫 generals.json 的名字集合一致', () => {
  const g = garrisonOf(data, 0, '南皮');
  assert.ok(g);
  assert.equal(g.officers.length, 11, '南皮野将也要收，不能只留前几个');
  const rows = base.generals as Array<{ NAME: string; city_by_times?: string[] }>;
  const direct = rows
    .filter((r) => Array.isArray(r.city_by_times) && r.city_by_times[0] === '南皮')
    .map((r) => r.NAME)
    .sort();
  assert.deepEqual(g.officers.map((o) => o.name).sort(), direct);
  assert.ok(g.officers.some((o) => o.name === '顏良' && o.str === 96));
  assert.ok(g.officers.some((o) => o.name === '田豐' && o.int === 95));
});

test('5 个剧本 × 60 城：每座城的 officers 都按 STR+INT 降序', () => {
  assert.equal(TABLE.length, 5, 'garrison.json 应有 5 个剧本');
  for (const scenario of TABLE) {
    const names = Object.keys(scenario.cities);
    assert.equal(names.length, 60, `剧本 ${scenario.scenario} 应有 60 城`);
    for (const name of names) {
      const g = scenario.cities[name];
      assertDescending(g.officers, `剧本 ${scenario.scenario} ${name}`);
    }
  }
});

// ---------------------------------------------------------------- 3. defendersOf

test('defendersOf 默认取 3 人，且结果是 STR+INT 降序', () => {
  const top = defendersOf(data, 0, '洛陽');
  assert.equal(top.length, 3);
  assertDescending(top, '洛陽前 3');
  assert.equal(top[0].name, '曹操', '曹操 87+92 是洛陽最高');
  const all = garrisonOf(data, 0, '洛陽')!.officers;
  assert.equal(all.length, 10, '洛陽 10 人全收');
  // 默认参数等价于显式 3
  assert.deepEqual(top, defendersOf(data, 0, '洛陽', 3));
});

test('defendersOf 的 count 边界：0 返回空、1 返回最强、超过名单长度就返回全部', () => {
  assert.deepEqual(defendersOf(data, 0, '洛陽', 0), []);
  assert.deepEqual(defendersOf(data, 0, '洛陽', 1).map((o) => o.name), ['曹操']);
  assert.equal(defendersOf(data, 0, '洛陽', 99).length, 10);
  assert.deepEqual(defendersOf(data, 0, '北平', 3).length, 3);
});

test('太守优先：太守不在前 3 时仍顶上阵，且最终顺序不乱', () => {
  // 南皮前 3 是 沮授156 / 逢紀148 / 田豐147，太守程遠志只有 122
  const plain = garrisonOf(data, 0, '南皮')!.officers.slice(0, 3).map((o) => o.name);
  assert.deepEqual(plain, ['沮授', '逢紀', '田豐']);
  const withMajor = defendersOf(data, 0, '南皮');
  assert.equal(withMajor.length, 3);
  assert.ok(withMajor.some((o) => o.name === '程遠志'), '太守必须上阵');
  assert.deepEqual(withMajor.map((o) => o.name), ['沮授', '逢紀', '程遠志']);
  assertDescending(withMajor, '南皮太守优先后');
});

// ---------------------------------------------------------------- 4. 无主城 / 空城

test('无主空城（KING=""、无将）不崩：officers 空、battleSetup 退化成"守將"', () => {
  const g = garrisonOf(data, 0, '晉陽');
  assert.ok(g, '城在剧本里就该有 garrison 对象，哪怕没人');
  assert.equal(g.owner, '');
  assert.equal(g.major, '');
  assert.deepEqual(g.officers, []);
  assert.deepEqual(defendersOf(data, 0, '晉陽'), []);
  const setup = battleSetup(data, 0, '晉陽', 100);
  assert.deepEqual(setup.enemyGeneral, { name: '守將', str: 0, int: 0 });
  assert.deepEqual(setup.enemyOfficers, []);
  assert.ok(setup.enemyTroops >= 1);
});

test('5 个剧本各抽 1 城：garrison > 0 且等于 min(floor(pop/2500)+110, 600)', () => {
  const samples: Array<[number, string]> = [
    [0, '襄平'],
    [1, '陳留'],
    [2, '濮陽'],
    [3, '襄平'],
    [4, '北平'],
  ];
  for (const [index, name] of samples) {
    const g = garrisonOf(data, index, name);
    assert.ok(g, `${index} ${name}`);
    const pop = Number(cityOf(index, name).POPULATION) || 0;
    assert.equal(g.garrison, Math.min(Math.floor(pop / 2500) + 110, 600));
    assert.ok(g.garrison > 0);
  }
});

// ---------------------------------------------------------------- 5. 旧数据兜底

test('旧数据（无 garrison 字段）：北平仍能现算出公孫瓚', () => {
  const g = garrisonOf(legacy, 0, '北平');
  assert.ok(g, '兜底路径不许返回 null');
  assert.equal(g.owner, '公孫瓚');
  const gongsun = g.officers.find((o) => o.name === '公孫瓚');
  assert.ok(gongsun);
  assert.equal(gongsun.str, 86);
  assert.equal(gongsun.int, 70);
  assert.deepEqual(g.officers.map((o) => o.name), ['公孫瓚', '嚴綱', '公孫越']);
});

test('旧数据兜底与 garrison.json 全表逐城等价（5 剧本 × 60 城）', () => {
  let cities = 0;
  let officers = 0;
  for (const scenario of TABLE) {
    for (const name of Object.keys(scenario.cities)) {
      const baked = garrisonOf(data, scenario.scenario, name);
      const computed = garrisonOf(legacy, scenario.scenario, name);
      assert.deepEqual(computed, baked, `剧本 ${scenario.scenario} ${name} 兜底结果应一致`);
      cities += 1;
      officers += computed ? computed.officers.length : 0;
    }
  }
  assert.equal(cities, 300);
  assert.equal(officers, 1011, '5 个剧本的武将记录合计');
});

// ---------------------------------------------------------------- 6. battleSetup

test('battleSetup 的 enemyGeneral 就是该城最强守将（不再是 DEFENSE/8 代理）', () => {
  const row = cityOf(2, '濮陽');
  const proxy = Math.min(100, 50 + Math.floor((Number(row.DEFENSE) || 0) / 8));
  assert.equal(proxy, 78, '旧算法在濮陽给 78');
  const setup = battleSetup(data, 2, '濮陽', 100);
  assert.deepEqual(setup.enemyGeneral, { name: '張郃', str: 93, int: 67 });
  assert.notEqual(setup.enemyGeneral.str, proxy, '必须脱离 DEFENSE 代理');
  assert.equal(setup.enemyGeneral.str, garrisonOf(data, 2, '濮陽')!.officers[0].str);
});

test('battleSetup 的 enemyTroops 默认走原作口径：守将帶兵數 + 騎兵數（0x409FB6/0x409FD8）', () => {
  const g = garrisonOf(data, 2, '濮陽')!;
  assert.equal(g.garrison, 180, '城内守军（预备兵上限）仍然是 180');
  const setup = battleSetup(data, 2, '濮陽', 100);
  // R85 口径（f2 取证 0x42D38B→0x409F73→0x42D39D）：等级由 BaseEXP 反推，400 将全是 200 ⇒ Lv2。
  // 等级→帶兵仍是原作 min(5L,100) ⇒ 10 兵；「10 兵太少」的补偿在守军池（round(守軍/6)）与 reserve 模式。
  assert.equal(setup.enemyParams!.level, 2);
  assert.equal(setup.enemyParams!.levelBasis, 'start');
  assert.equal(setup.enemyParams!.troopsMax, 10);
  assert.equal(setup.enemyParams!.cavalryMax, 0);
  assert.equal(setup.enemyTroops, 10, '上阵的是守将的兵，不是守军/6');
  assert.equal(setup.enemyTroopsBasis, 'estimate:帶兵數@起始等級');
  // 城内守军是补兵池（0x401910），不直接上战场：180 只影响补给，不影响 enemyTroops
  assert.notEqual(setup.enemyTroops, 60);

  for (const [index, name] of [[0, '洛陽'], [3, '襄平'], [4, '北平']] as Array<[number, string]>) {
    const s = battleSetup(data, index, name, 50);
    assert.ok(s.enemyTroops >= 1 && s.enemyTroops <= 200, `${index} ${name} 上阵数应在 1..200`);
    assert.ok(s.enemyTroops <= garrisonOf(data, index, name)!.garrison, '上阵数不该超过守军池');
    assert.ok(s.enemyOfficers.length >= 1 && s.enemyOfficers.length <= 3);
    assert.equal(s.enemyTroopsBasis, 'estimate:帶兵數@起始等級');
  }
});

test('battleSetup 的 reserve 开关回退到旧网页估值 min(100, max(60, round(守军/6)))', () => {
  const g = garrisonOf(data, 2, '濮陽')!;
  assert.equal(g.garrison, 180);
  const setup = battleSetup(data, 2, '濮陽', 100, { troopMode: 'reserve' });
  assert.equal(setup.enemyTroops, 60, 'round(180/6)=30，抬到下限 60');
  assert.equal(setup.enemyTroopsBasis, 'estimate:守軍/6');
});

test('battleSetup 空城：没有守将就用我军六成，并写明来路', () => {
  const setup = battleSetup(data, 0, '晉陽', 100);
  assert.equal(setup.enemyParams, null);
  assert.equal(setup.enemyTroops, 60);
  assert.equal(setup.enemyTroopsBasis, 'estimate:我軍六成');
});

// ------------------------------------------------- 6b. 等级 / 守将参数（project/31 第 14 项）

test('经验表 0x409EE0 与文档 f(n) 逐点一致', () => {
  const points: Array<[number, number]> = [
    [1, 0],
    [2, 120],
    [3, 377],
    [10, 6012],
    [13, 10482],
    [20, 25707],
  ];
  for (const [level, exp] of points) assert.equal(expForLevel(level), exp, `f(${level})`);
  assert.equal(expForLevel(100), 9999999, 'n > 99 的硬编码返回值');
});

test('等级反推 0x409F73：边界 + 真实数据只有 200/9999 两种经验', () => {
  assert.equal(levelFromExp(0), 1, '[推测] 汇编在 exp<17 时会返回 −1，这里夹到 1');
  assert.equal(levelFromExp(119), 1);
  assert.equal(levelFromExp(120), 2);
  assert.equal(levelFromExp(200), 2);
  assert.equal(levelFromExp(376), 2);
  assert.equal(levelFromExp(377), 3);
  assert.equal(levelFromExp(6011), 9);
  assert.equal(levelFromExp(6012), 10);
  assert.equal(levelFromExp(9999), 12, '盜賊 BaseEXP=9999 → 12 级');
  assert.equal(levelFromExp(9999999), 99, '封顶');

  const hist = new Map<number, number>();
  for (const g of base.generals) {
    const exp = Number(g.BaseEXP) || 0;
    hist.set(exp, (hist.get(exp) ?? 0) + 1);
  }
  assert.deepEqual(
    [...hist.entries()].sort((a, b) => a[0] - b[0]),
    [[200, 400], [9999, 1]],
    'docs/03c:210 记「初始经验只有 200（盜賊 9999）」',
  );
  for (const g of base.generals) {
    const level = levelFromExp(Number(g.BaseEXP) || 0);
    assert.ok(level >= 1 && level <= 99, `${g.NAME} 等级 ${level} 越界`);
  }
});

test('defenderBattleParams：曹操（87/92，BaseHP 83，BaseMP 44，BaseEXP 200）逐项对地址', () => {
  const cao = base.generals.find((g) => g.NAME === '曹操')!;
  const p = defenderBattleParams({ name: '曹操', str: 87, int: 92 }, cao);
  // 等级来源 = BaseEXP 反推（R85 取证）；带上限与 HP/MP 的换算仍是原作地址口径。
  assert.equal(p.level, 2, 'BaseEXP 200 → 0x409F73 反推 Lv2');
  assert.equal(p.troopsMax, 10, '0x409FB6：min(5×2, 100)');
  assert.equal(p.cavalryMax, 0, '0x409FD8：等级 < 20 → 0');
  assert.equal(p.soldiers, 10, 'unit+0x58 = 帶兵 + 騎兵');
  assert.equal(p.hpMax, 83 + 3, '0x40A020：BaseHP + 等级×2×武力/100 = 83 + trunc(2×2×87/100)=83+3');
  assert.equal(p.mpMax, 44 + 3, '0x40A098：t = 智力（武力 87 不 > 智力 92），44 + trunc(2×2×92/100)=44+3');
  assert.equal(p.hitVsSoldiers, 193, '0x43D4CB：150 + 87/2');
  assert.equal(p.hitFromSoldiers, 133, '0x43D400：150 − 87×20/100');
  assert.equal(p.powerBase, 150, '0x43A3AD 硬编码');
  assert.equal(p.morale, 80, 'TIMES 默认士气');
  assert.equal(p.moraleTerm, 6, 'trunc((80 − 50)/5)');
  assert.equal(p.levelBasis, 'start');
  assert.ok(p.unknown.length >= 4, '必须带"原作无映射"清单');
});

test('defenderBattleParams：等级 20/25/45 的帶兵与骑兵上限', () => {
  const at = (level: number) =>
    defenderBattleParams(
      { name: '測試', str: 70, int: 60 },
      { NAME: '測試', STR: 70, INT: 60, BaseHP: 100, BaseMP: 50, level },
    );
  assert.equal(at(19).troopsMax, 95);
  assert.equal(at(20).troopsMax, 100);
  assert.equal(at(20).cavalryMax, 0);
  assert.equal(at(25).cavalryMax, 25);
  assert.equal(at(25).soldiers, 125, '100 步 + 25 骑');
  assert.equal(at(45).cavalryMax, 100);
  assert.equal(at(45).soldiers, 200, '上限 100 步 + 100 骑');
});

test('defenderBattleParams：缺武将行时按起始等级兜底并标 start；不抛异常', () => {
  const p = defenderBattleParams({ name: '無此人', str: 0, int: 0 });
  assert.equal(p.level, 2, '缺行 → BaseEXP 兜底 200 → Lv2');
  assert.equal(p.levelBasis, 'start');
  assert.equal(p.troopsMax, 10);
  assert.equal(p.soldiers, 10);
  assert.equal(p.hpMax, 0);
  assert.equal(p.mpMax, 0);
  assert.equal(p.hitVsSoldiers, 150);
  assert.equal(p.hitFromSoldiers, 150);
});

test('将→将命中 0x43D4CB：150 + trunc((武力a − 武力b)/2)', () => {
  assert.equal(hitVsGeneral({ str: 93 }, 67), 163);
  assert.equal(hitVsGeneral({ str: 67 }, 93), 137);
  assert.equal(hitVsGeneral({ str: 71 }, 70), 150);
  assert.equal(hitVsGeneral({ str: 70 }, 71), 150, 'trunc(−0.5) = −0');
});

test('5 剧本 × 60 城：两个口径都落在 1..200 / 1..100，且 exe 口径 = params.soldiers', () => {
  let cities = 0;
  for (const scenario of TABLE) {
    for (const name of Object.keys(scenario.cities)) {
      const exe = battleSetup(data, scenario.scenario, name, 100);
      assert.ok(
        Number.isInteger(exe.enemyTroops) && exe.enemyTroops >= 1 && exe.enemyTroops <= 200,
        `${scenario.scenario} ${name} exe=${exe.enemyTroops}`,
      );
      if (exe.enemyParams) {
        assert.equal(exe.enemyTroops, exe.enemyParams.soldiers);
        // R84：守将有兵就按守将帶兵數上阵，等级来源是起始等级而非 BaseEXP 反推
        assert.equal(
          exe.enemyTroopsBasis,
          exe.enemyParams.levelBasis === 'exe' ? 'exe:帶兵數' : 'estimate:帶兵數@起始等級',
        );
      } else {
        assert.equal(exe.enemyTroopsBasis, 'estimate:我軍六成');
      }
      const reserve = battleSetup(data, scenario.scenario, name, 100, { troopMode: 'reserve' });
      assert.ok(reserve.enemyTroops >= 1 && reserve.enemyTroops <= 100);
      cities += 1;
    }
  }
  assert.equal(cities, 300);
});

// ---------------------------------------------------------------- 7. 边界 / 不抛异常

test('未知城 / 越界剧本：garrisonOf 返回 null，其余函数返回空而不报错', () => {
  assert.equal(garrisonOf(data, 0, '不存在城'), null);
  assert.equal(garrisonOf(data, 9, '洛陽'), null);
  assert.equal(garrisonOf(data, -1, '洛陽'), null);
  assert.deepEqual(defendersOf(data, 0, '不存在城'), []);
  assert.deepEqual(defendersOf(data, 9, '洛陽'), []);
  const setup = battleSetup(data, 9, '洛陽', 80);
  assert.deepEqual(setup.enemyGeneral, { name: '守將', str: 0, int: 0 });
  assert.deepEqual(setup.enemyOfficers, []);
  assert.ok(setup.enemyTroops >= 1);
});

test('空数据 / 脏字段：四个 API 都不抛异常', () => {
  const empty = {} as GarrisonData;
  assert.equal(garrisonOf(empty, 0, '洛陽'), null);
  assert.deepEqual(defendersOf(empty, 0, '洛陽'), []);
  assert.equal(pickCommander([]), null);
  assert.equal(pickCommander(undefined as unknown as Officer[]), null);
  assert.deepEqual(battleSetup(empty, 0, '洛陽', 100).enemyGeneral, { name: '守將', str: 0, int: 0 });
  // 表里条目是垃圾也不炸
  const junk: GarrisonData = { ...base, garrison: [{ scenario: 0, cities: { 洛陽: 'oops' } }, null, 42] };
  assert.equal(garrisonOf(junk, 0, '洛陽')!.officers.length, 10, '坏表退回现算');
});

test('pickCommander：取 STR+INT 最高、exclude 生效、空名单给 null', () => {
  const luoyang = garrisonOf(data, 0, '洛陽')!.officers;
  assert.deepEqual(pickCommander(luoyang), luoyang.find((o) => o.name === '曹操'));
  assert.equal(pickCommander(luoyang, ['曹操'])!.name, '袁紹', '去掉曹操后 袁紹 81+77 最高');
  assert.equal(pickCommander(luoyang, ['曹操', '袁紹', '盧植'])!.name, '袁術');
  assert.equal(pickCommander([], []), null);
});
