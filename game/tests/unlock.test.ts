/**
 * 兵符 / 阵法书解锁自检（原作 `SANGO.INI [ITEM]`）。
 *
 * 口径：兵符 = `TYPE==='JEWEL_MISC' && Force>0`（`Force` 是 `1<<兵种号`）；
 *       阵法书 = `Battle>0`（`Battle` 是 `1<<阵形号`）；判定只看 `ownedIds` 里有没有。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  ERA_SCENARIO_COUNT,
  FORMATION_COUNT,
  FORMATION_TOKENS,
  LEARN_MAX_LEVEL,
  MAGIC_SLOTS,
  TROOP_COUNT,
  TROOP_TOKENS,
  WISE_SLOTS,
  allTroopsOf,
  applyLearn,
  createLearnState,
  defaultFormationOf,
  defaultTroopOf,
  eraFieldOf,
  formationIndexOf,
  formationsOf,
  isFormationUnlocked,
  isTroopUnlocked,
  learnTableOf,
  learnable,
  learnableWise,
  monthlyLearnCheck,
  onLevelUp,
  pendingLearn,
  troopIndexOf,
  troopsOf,
  unlockedFormations,
  unlockedTroops,
} from '../src/core/unlock.ts';
import type { GameData, General } from '../src/types.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 按名字取物品 id（全仓口径：`String(Sequence)`） */
function itemId(name: string): string {
  const it = data.items.find((x) => x.Name === name);
  assert.ok(it, `items.json 里找不到「${name}」`);
  return String(it.Sequence);
}

/** 该数组里为 true 的下标 */
const trues = (arr: boolean[]): number[] => arr.flatMap((v, i) => (v ? [i] : []));

test('空持有：兵种/阵形全 false，且长度是 13 / 9', () => {
  for (let i = 0; i < TROOP_COUNT; i++) assert.equal(isTroopUnlocked(data.items, [], i), false);
  for (let i = 0; i < FORMATION_COUNT; i++) assert.equal(isFormationUnlocked(data.items, [], i), false);

  const troops = unlockedTroops(data.items, []);
  const forms = unlockedFormations(data.items, []);
  assert.equal(troops.length, 13);
  assert.equal(forms.length, 9);
  assert.deepEqual(trues(troops), []);
  assert.deepEqual(trues(forms), []);
});

test('只持朴刀兵符 → 只有兵种 0 解锁', () => {
  const owned = [itemId('朴刀兵兵符')];
  assert.equal(isTroopUnlocked(data.items, owned, 0), true);
  for (let i = 1; i < TROOP_COUNT; i++) assert.equal(isTroopUnlocked(data.items, owned, i), false, `兵种 ${i} 不该解锁`);
  assert.deepEqual(trues(unlockedTroops(data.items, owned)), [0]);
});

test('持两个兵符（朴刀 + 長槍）→ 兵种 0、1 解锁', () => {
  const owned = [itemId('朴刀兵兵符'), itemId('長槍兵兵符')];
  const t = unlockedTroops(data.items, owned);
  assert.deepEqual(trues(t), [0, 1]);
  assert.equal(t[2], false);
  // 顺序无关
  assert.deepEqual(trues(unlockedTroops(data.items, [...owned].reverse())), [0, 1]);
  // 越界的兵种号直接 false，不抛异常
  assert.equal(isTroopUnlocked(data.items, owned, 13), false);
  assert.equal(isTroopUnlocked(data.items, owned, -1), false);
});

test('阵法书：方形 → 阵形 0；方形 + 圓形 → 0、1', () => {
  const one = [itemId('方形陣法之書')];
  assert.equal(isFormationUnlocked(data.items, one, 0), true);
  for (let i = 1; i < FORMATION_COUNT; i++) assert.equal(isFormationUnlocked(data.items, one, i), false);
  assert.deepEqual(trues(unlockedFormations(data.items, one)), [0]);

  const two = [itemId('方形陣法之書'), itemId('圓形陣法之書')];
  assert.deepEqual(trues(unlockedFormations(data.items, two)), [0, 1]);
  // 兵符不该解锁阵形，反之亦然（两类掩码同在 TYPE=JEWEL_MISC 上，串了就废）
  assert.deepEqual(trues(unlockedFormations(data.items, [itemId('朴刀兵兵符')])), []);
  assert.deepEqual(trues(unlockedTroops(data.items, one)), []);
});

test('不存在的物品 id 不报错、也不解锁任何东西', () => {
  const bogus = ['not-an-item', '99999', ''];
  for (const id of bogus) {
    for (let i = 0; i < TROOP_COUNT; i++) assert.equal(isTroopUnlocked(data.items, [id], i), false);
    for (let i = 0; i < FORMATION_COUNT; i++) assert.equal(isFormationUnlocked(data.items, [id], i), false);
  }
  assert.deepEqual(trues(unlockedTroops(data.items, bogus)), []);
  assert.deepEqual(trues(unlockedFormations(data.items, bogus)), []);
  // 未知 id 混在真 id 里不影响真 id 的结果
  assert.deepEqual(trues(unlockedTroops(data.items, ['bogus', itemId('朴刀兵兵符')])), [0]);
});

test('13 个兵符 / 9 本阵法书逐一对应（数据完整性 + 数组长度）', () => {
  // 13 个兵符各自只点亮自己那一位；也顺带证明 Force 是 1<<兵种号 而不是序号
  const troopItems = data.items.filter((it) => it.TYPE === 'JEWEL_MISC' && typeof it.Force === 'number' && it.Force > 0);
  assert.equal(troopItems.length, 13, `兵符应 13 件，实际 ${troopItems.length}`);
  for (const it of troopItems) {
    const bit = Math.log2(Number(it.Force));
    assert.ok(Number.isInteger(bit) && bit >= 0 && bit < 13, `${it.Name} 的 Force=${it.Force} 不是 1<<兵种号`);
    assert.deepEqual(trues(unlockedTroops(data.items, [String(it.Sequence)])), [bit], `${it.Name} 应只解锁兵种 ${bit}`);
  }

  const bookItems = data.items.filter((it) => typeof it.Battle === 'number' && it.Battle > 0);
  assert.equal(bookItems.length, 9, `阵法书应 9 本，实际 ${bookItems.length}`);
  for (const it of bookItems) {
    const bit = Math.log2(Number(it.Battle));
    assert.ok(Number.isInteger(bit) && bit >= 0 && bit < 9, `${it.Name} 的 Battle=${it.Battle} 不是 1<<阵形号`);
    assert.deepEqual(trues(unlockedFormations(data.items, [String(it.Sequence)])), [bit]);
  }
  assert.equal(unlockedTroops(data.items, []).length, 13);
  assert.equal(unlockedFormations(data.items, []).length, 9);
});

// ---------------------------------------------------------------------------
// 第一层：武将白名单（原作 UseForce / BattleArray）

function generalByName(name: string): General {
  const g = data.generals.find((x) => x.NAME === name);
  assert.ok(g, `generals.json 里找不到「${name}」`);
  return g;
}

function fakeGeneral(extra: Partial<General>): General {
  return { NAME: '測試', STR: 50, INT: 50, BaseHP: 100, BaseMP: 50, ...extra };
}

/**
 * R167 时代字段的测试行。`types.ts` 的 `General` 故意不加这 5 个字段
 * （见 `src/core/unlock.ts` 里 `EraFieldRow` 的注释），测试里用交叉类型补上。
 */
type EraGeneral = General & {
  BattleArray_by_times?: string[][];
  Force_by_times?: string[][];
  UseForce_by_times?: string[][];
  LoyalKing_by_times?: string[];
  Weapon_by_times?: string[];
};

test('白名单：關羽 UseForce=[刀] → 兵种 0，默认也是 0', () => {
  const g = generalByName('關羽');
  assert.deepEqual(g.UseForce, ['刀']);
  assert.equal(data.troops.names[0], '朴刀');
  assert.deepEqual(troopsOf(g), [0]);
  assert.equal(defaultTroopOf(g), 0);
});

test('白名单：諸葛亮只带弓（Force 里的刀是「未学」）', () => {
  const g = generalByName('諸葛亮');
  assert.deepEqual(g.UseForce, ['弓']);
  assert.equal(data.troops.names[3], '弓箭');
  assert.deepEqual(troopsOf(g), [3]);
  assert.equal(defaultTroopOf(g), 3);
  // Force 是「全部可带」，含未学的刀 → 两层字段不能混用
  assert.deepEqual(allTroopsOf(g), [0, 3]);
});

test('白名单：張飛 UseForce=[槍] → 兵种 1', () => {
  const g = generalByName('張飛');
  assert.deepEqual(g.UseForce, ['槍']);
  assert.equal(data.troops.names[1], '长枪');
  assert.deepEqual(troopsOf(g), [1]);
  assert.equal(defaultTroopOf(g), 1);
});

test('白名单：關羽 BattleArray 含方与雁 → 阵形 [0,3]，默认方；諸葛亮默认圓', () => {
  const guan = generalByName('關羽');
  assert.deepEqual(guan.BattleArray, ['方', '雁']);
  assert.deepEqual(formationsOf(guan), [0, 3]);
  assert.equal(formationIndexOf('方'), 0);
  assert.equal(formationIndexOf('雁'), 3);
  assert.equal(defaultFormationOf(guan), 0, 'UseBattleArray=方');

  const zhuge = generalByName('諸葛亮');
  assert.deepEqual(formationsOf(zhuge), [0, 1, 4, 5], '方/圓/玄/魚');
  assert.equal(defaultFormationOf(zhuge), 1, 'UseBattleArray=圓 → 圆形');
});

test('白名单：未知名缩写不抛错，返回空数组；缺字段时默认值兜底', () => {
  const odd = fakeGeneral({ UseForce: ['騎', '', '弓兵'], BattleArray: ['亂陣', ''] });
  assert.deepEqual(troopsOf(odd), []);
  assert.deepEqual(formationsOf(odd), []);
  assert.equal(troopIndexOf('騎'), -1, '原作 13 兵种里没有骑兵（骑兵只是造型变体）');
  assert.equal(formationIndexOf('亂陣'), -1, '亂陣是引擎内部阵，不在玩家 9 阵里');

  assert.equal(defaultTroopOf(fakeGeneral({})), 0, '什么都没有 → 朴刀');
  assert.equal(defaultFormationOf(fakeGeneral({})), 0, '什么都没有 → 方');
  // UseForce 无效时退到 Force（含未学）
  assert.equal(defaultTroopOf(fakeGeneral({ UseForce: ['騎'], Force: ['弩'] })), 11);
  assert.equal(defaultFormationOf(fakeGeneral({ UseBattleArray: '亂陣', BattleArray: ['鉤'] })), 6);
});

// ── R167 时代字段：同一武将的兵种/阵形/君主/武器随剧本变 ──────────────────
// 数据：generals.json 每行 `*_by_times[5]`（生成器 work/data_audit/gen_generals_era.mjs，
// 审计表 generals_era 逐剧本 0 差异）。单值字段仍 = TIMES1，`[0]` 与它逐值相等。

test('eraFieldOf：by_times 优先，越界/缺项回落单值，返回类型与单值一致', () => {
  const row = {
    BattleArray: ['方', '雁'],
    UseForce: ['刀'],
    Force: ['刀', '弓'],
    LoyalKing: '曹操',
    Weapon: '直劍',
    BattleArray_by_times: [['方', '雁'], ['圓'], ['方', '雁'], ['方', '雁'], ['方', '雁', '魚']],
    UseForce_by_times: [['刀'], ['槍'], ['刀'], ['刀'], ['刀']],
    Force_by_times: [['刀', '弓'], ['槍'], ['刀', '弓'], ['刀', '弓'], ['刀', '弓']],
    LoyalKing_by_times: ['曹操', '劉備', '曹操', '曹操', '曹操'],
    Weapon_by_times: ['直劍', '短錐槍', '直劍', '直劍', '直劍'],
  };
  assert.equal(ERA_SCENARIO_COUNT, 5);
  assert.deepEqual(eraFieldOf(row, 'BattleArray', 1), ['圓']);
  assert.deepEqual(eraFieldOf(row, 'UseForce', 1), ['槍']);
  assert.deepEqual(eraFieldOf(row, 'Force', 1), ['槍']);
  assert.equal(eraFieldOf(row, 'LoyalKing', 1), '劉備');
  assert.equal(eraFieldOf(row, 'Weapon', 1), '短錐槍');
  // 第 0 剧本与单值相同（单值字段的口径就是 TIMES1）
  assert.deepEqual(eraFieldOf(row, 'BattleArray', 0), row.BattleArray);
  assert.equal(eraFieldOf(row, 'Weapon', 0), row.Weapon);
  // 越界 / 缺字段 / 非有限下标 → 回落单值，不抛错（旧存档与未建模剧本不能炸）
  assert.deepEqual(eraFieldOf(row, 'BattleArray', 9), row.BattleArray);
  assert.deepEqual(eraFieldOf(row, 'Force', -1), row.Force);
  assert.equal(eraFieldOf(row, 'Weapon', Number.NaN), row.Weapon);
  assert.equal(eraFieldOf({ Weapon: '直劍' }, 'Weapon', 3), '直劍');
  assert.equal(eraFieldOf({}, 'LoyalKing', 0), undefined);
  // 空串是有意义的「时代值」（无君主），不能被当成缺项回落
  assert.equal(eraFieldOf({ LoyalKing: '曹操', LoyalKing_by_times: ['', '曹操'] }, 'LoyalKing', 0), '');
  // 空位（null）当缺项处理
  assert.equal(eraFieldOf({ Weapon: '直劍', Weapon_by_times: ['直劍', null as unknown as string] }, 'Weapon', 1), '直劍');
});

test('白名单按剧本取：troopsOf / allTroopsOf / formationsOf / default* 都用时代值', () => {
  const row = fakeGeneral({
    UseForce: ['刀'],
    Force: ['刀', '弓'],
    BattleArray: ['方', '雁'],
    UseBattleArray: '方',
    UseForce_by_times: [['刀'], ['槍'], ['刀'], ['刀'], ['騎']],
    Force_by_times: [['刀', '弓'], ['槍'], ['刀', '弓'], ['刀', '弓'], ['刀', '弓']],
    BattleArray_by_times: [['方', '雁'], ['圓'], ['方', '雁'], ['方', '雁'], ['方', '雁', '魚']],
  } as unknown as Partial<General>) as EraGeneral;
  assert.deepEqual(troopsOf(row, 1), [1], 'S2 用槍（1）');
  assert.deepEqual(troopsOf(row, 0), [0], 'S1 用刀（0）');
  assert.deepEqual(troopsOf(row), [0], '省略剧本 = S1，旧调用不变');
  assert.deepEqual(troopsOf(row, 4), [], 'S5 的 騎 不是 13 兵种之一 → 空（不抛错）');
  assert.equal(defaultTroopOf(row, 1), 1, 'S2 默认槍；S5 UseForce 无效 → 退 Force 的刀 0');
  assert.equal(defaultTroopOf(row, 4), 0);
  assert.deepEqual(allTroopsOf(row, 1), [1], 'S2 Force 只有槍');
  assert.deepEqual(allTroopsOf(row, 0), [0, 3], 'S1 Force 刀/弓');
  assert.deepEqual(formationsOf(row, 1), [1], 'S2 只有圓（1）');
  assert.deepEqual(formationsOf(row, 4), [0, 3, 5], 'S5 方/雁/魚');
  // UseBattleArray（当前阵形）原作 5 剧本 0 变化，仍是单值且优先于时代 BattleArray
  assert.equal(defaultFormationOf(row, 1), 0, 'UseBattleArray=方（单值）');
  assert.equal(defaultFormationOf(row, 4), 0, 'UseBattleArray 优先于 S5 的 BattleArray');
  const noCurrent = fakeGeneral({
    BattleArray_by_times: [['方'], ['圓'], ['方'], ['方'], ['魚']],
  } as unknown as Partial<General>) as EraGeneral;
  assert.equal(defaultFormationOf(noCurrent, 1), 1, '没有 UseBattleArray → 退时代 BattleArray 第一個圓');
  assert.equal(defaultFormationOf(noCurrent, 4), 5, '…S5 第一個魚（5）');
});

test('真实数据：丁奉 S1 无圓阵、S4 学会圓；袁術武器 S1 短錐槍、S2 起直劍', () => {
  const ding = generalByName('丁奉');
  assert.deepEqual(formationsOf(ding, 0), [0, 3, 5], 'S1/TIMES1：方/雁/魚');
  assert.deepEqual(formationsOf(ding, 3), [0, 1, 3, 5], 'S4 多一个圓（1）');
  assert.deepEqual(formationsOf(ding), formationsOf(ding, 0), '省略剧本仍有 TIMES1 行为');
  const yuan = generalByName('袁術');
  assert.equal(eraFieldOf(yuan, 'Weapon', 0), '短錐槍');
  assert.equal(eraFieldOf(yuan, 'Weapon', 1), '直劍');
  assert.equal(eraFieldOf(yuan, 'Weapon', 4), '直劍');
});

test('缩写表与数据 names 逐项对字，13/9 个索引不重复且全覆盖', () => {
  assert.equal(TROOP_TOKENS.length, TROOP_COUNT);
  assert.equal(new Set(TROOP_TOKENS).size, TROOP_COUNT, '兵种缩写不能重复');
  assert.deepEqual([...TROOP_TOKENS].map((t) => troopIndexOf(t)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // 官方编号 1..13 与 troops.json names 同序（docs/05b §4.1；这里直接钉住数据）
  assert.deepEqual(data.troops.names, [
    '朴刀', '长枪', '大刀', '弓箭', '链锤', '飞刀', '武斗', '蛮族', '铁缒', '藤甲', '黄巾', '弩兵', '女兵',
  ]);
  // 繁简对字：缩写是繁体、名字是简体，两个特例 關=大刀（關刀）/ 賊=黃巾（黃巾賊）
  assert.equal(data.troops.names[troopIndexOf('槍')!], '长枪');
  assert.equal(data.troops.names[troopIndexOf('鍊')!], '链锤');
  assert.equal(data.troops.names[troopIndexOf('飛')!], '飞刀');
  assert.equal(data.troops.names[troopIndexOf('蠻')!], '蛮族');
  assert.equal(data.troops.names[troopIndexOf('鐵')!], '铁缒');
  assert.equal(data.troops.names[troopIndexOf('籐')!], '藤甲');
  assert.equal(data.troops.names[troopIndexOf('關')!], '大刀');
  assert.equal(data.troops.names[troopIndexOf('賊')!], '黄巾');

  assert.equal(FORMATION_TOKENS.length, FORMATION_COUNT);
  assert.equal(new Set(FORMATION_TOKENS).size, FORMATION_COUNT, '阵形缩写不能重复');
  assert.deepEqual([...FORMATION_TOKENS].map((t) => formationIndexOf(t)), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(data.formations.names, ['方形', '圆形', '锥形', '雁形', '玄襄', '鱼丽', '钩形', '冲锋', '箭矢']);
  assert.equal(data.formations.names[formationIndexOf('圓')!], '圆形');
  assert.equal(data.formations.names[formationIndexOf('錐')!], '锥形');
  assert.equal(data.formations.names[formationIndexOf('魚')!], '鱼丽');
  assert.equal(data.formations.names[formationIndexOf('鉤')!], '钩形');
  assert.equal(data.formations.names[formationIndexOf('衝')!], '冲锋');
});

// ---------------------------------------------------------------------------
// R68 武将技 / 军师技学习门槛（`0x40A183` / `0x40A227`）
//
// 口径：学习表 = `SKILL`（武将技）/ `WISESKILL`（军师技），每行「习得等级, 序号」；
// 判定只有「等级到了 + 8 槽没满」，原作没有武力/智力门槛（见 unlock.ts 段首注释）。

test('R68 学习表：關羽 SKILL 8 行 / WISESKILL 7 行，等级与序号逐项对表', () => {
  const magic = learnTableOf(data, '關羽', 'SKILL');
  assert.deepEqual(magic.map((r) => r.level), [1, 6, 11, 17, 22, 29, 35, 40]);
  assert.deepEqual(magic.map((r) => r.seq), [50, 63, 69, 77, 84, 88, 102, 110]);
  assert.equal(magic.length, MAGIC_SLOTS, '正好 8 条 = 8 槽');
  for (const row of magic) {
    const def = data.magics.find((m) => m.SEQUENCE === row.seq);
    assert.ok(def, `magics.json 里没有序号 ${row.seq}`);
    assert.equal(row.name, def.NAME, '名字要从 magics.json 查，不能从表里猜');
  }

  const wise = learnTableOf(data, '關羽', 'WISESKILL');
  assert.deepEqual(wise.map((r) => r.level), [1, 6, 12, 19, 26, 32, 39]);
  assert.deepEqual(wise.map((r) => r.seq), [8, 16, 22, 32, 38, 51, 54]);
  for (const row of wise) assert.equal(row.name, data.wises.find((w) => w.SEQUENCE === row.seq)!.NAME);

  assert.deepEqual(learnTableOf(data, '沒這個人', 'SKILL'), []);
});

test('R68 学习表：字符串/元组两种形态都吃，脏行丢弃', () => {
  // generals.json 里是 "6, 63"；types.ts 声明的是 [6, 63]。两种都要能解析，坏行不能变成 0 级技。
  const fake = {
    generals: [
      {
        NAME: '測試',
        SKILL: [[3, 50], '5, 63', 'x, y', '9,', '', '7, 69'],
        WISESKILL: ['2, 1'],
      },
    ],
    magics: data.magics,
    wises: data.wises,
  } as unknown as GameData;
  assert.deepEqual(
    learnTableOf(fake, '測試', 'SKILL').map((r) => [r.level, r.seq]),
    [[3, 50], [5, 63], [7, 69]],
  );
  assert.deepEqual(learnTableOf(fake, '測試', 'WISESKILL').map((r) => [r.level, r.seq]), [[2, 1]]);
});

test('R68 createLearnState：等级归一、已知列表去重去脏、未知武将空表', () => {
  const st = createLearnState(data, '關羽', 41.9, { magic: [50, 50, 0, Number.NaN], wise: [8, -1] });
  assert.equal(st.level, 41, '41.9 → 41');
  assert.deepEqual(st.magic, [50], '重复/0/NaN 都丢掉');
  assert.deepEqual(st.wise, [8], '负序号丢掉');
  assert.equal(st.magicTable.length, 8);
  assert.equal(st.wiseTable.length, 7);

  const unknown = createLearnState(data, '沒這個人', 7);
  assert.equal(unknown.level, 7);
  assert.deepEqual([unknown.magicTable.length, unknown.wiseTable.length], [0, 0]);
  assert.deepEqual(pendingLearn(unknown), []);
  assert.equal(monthlyLearnCheck(unknown).length, 0);
});

test('R68 learnable：等级门槛 / 表外 / 已学 / 槽满 四种 false', () => {
  const st = createLearnState(data, '關羽', 1);
  assert.equal(learnable(st, 50), true, '1 级学第一条');
  assert.equal(learnable(st, 63), false, '6 级才学');
  assert.equal(learnable(st, 63, 6), true, '传未来等级可以预览');
  assert.equal(learnable(st, 1), false, '不在關羽的学习表里');
  assert.equal(learnable(st, 999), false, '数据里没有的序号');
  assert.equal(learnable(st, 50, 0), true, '等级 0 归一成 1');
  assert.equal(learnable(st, 63, Number.NaN), false, 'NaN 归一成 1');

  st.magic.push(50);
  assert.equal(learnable(st, 50), false, '已学');

  // 8 槽塞满（放表外的序号，绕开"表里最多 8 条"）
  const packed = createLearnState(data, '關羽', 41, { magic: [1, 2, 3, 4, 5, 6, 7, 9] });
  assert.equal(packed.magic.length, MAGIC_SLOTS);
  assert.equal(learnable(packed, 50), false, '槽满就学不进去');
});

test('R68 learnable/learnableWise 接受 data 行对象；军师技走 WISE_SLOTS', () => {
  const st = createLearnState(data, '關羽', 1);
  const m = data.magics.find((x) => x.SEQUENCE === 50)!;
  const w = data.wises.find((x) => x.SEQUENCE === 8)!;
  assert.equal(learnable(st, m), true);
  assert.equal(learnableWise(st, w), true);
  assert.equal(learnableWise(st, 16), false, '6 级才学');
  assert.equal(learnableWise(st, 16, 6), true);
  assert.equal(learnableWise(st, 50), false, '武将技序号不是军师技');
  assert.equal(learnable(st, 8), false, '军师技序号不是武将技');
});

test('R68 pendingLearn：1 级 2 条、6 级 4 条，按习得等级排序且武将技在前', () => {
  const st = createLearnState(data, '關羽', 1);
  assert.deepEqual(
    pendingLearn(st).map((p) => [p.kind, p.seq, p.learn]),
    [['magic', 50, 1], ['wise', 8, 1]],
  );
  st.level = 6;
  assert.deepEqual(
    pendingLearn(st).map((p) => [p.kind, p.seq]),
    [['magic', 50], ['wise', 8], ['magic', 63], ['wise', 16]],
    '先按习得等级，同级武将技在前',
  );
  st.level = 41;
  assert.equal(pendingLearn(st).length, 15, '8 条武将技 + 7 条军师技');
  assert.deepEqual(
    pendingLearn(st).map((p) => p.learn),
    [...pendingLearn(st).map((p) => p.learn)].sort((a, b) => a - b),
    '整体按习得等级升序',
  );
});

test('R68 applyLearn：写进已学表、幂等、跳过重复/表外/未到级条目', () => {
  const st = createLearnState(data, '關羽', 1);
  const m50 = data.magics.find((x) => x.SEQUENCE === 50)!;
  const w8 = data.wises.find((x) => x.SEQUENCE === 8)!;
  const got = applyLearn(st);
  assert.deepEqual(got, [
    { kind: 'magic', seq: 50, name: m50.NAME, learn: 1 },
    { kind: 'wise', seq: 8, name: w8.NAME, learn: 1 },
  ]);
  assert.deepEqual(st.magic, [50]);
  assert.deepEqual(st.wise, [8]);

  assert.deepEqual(applyLearn(st), [], '第二次幂等');
  const junk = [
    { kind: 'magic' as const, seq: 1, name: 'x', learn: 1 }, // 表外
    { kind: 'magic' as const, seq: 63, name: 'x', learn: 6 }, // 等级没到
    { kind: 'magic' as const, seq: 50, name: 'x', learn: 1 }, // 已学
    { kind: 'magic' as const, seq: 50, name: 'x', learn: 1 }, // 批内重复
  ];
  assert.deepEqual(applyLearn(st, junk), []);
  assert.deepEqual(st.magic, [50]);
});

test('R68 onLevelUp：只补 (from,to]，1→6 只学 6 级那两条；to<=from 不动', () => {
  const st = createLearnState(data, '關羽', 1);
  const first = onLevelUp(st, 1, 6);
  assert.deepEqual(first.map((p) => [p.kind, p.seq, p.learn]), [['magic', 63, 6], ['wise', 16, 6]]);
  assert.equal(st.level, 6);
  assert.deepEqual(st.magic, [63], '升级只补区间内的，1 级那条不重复学');

  assert.deepEqual(onLevelUp(st, 6, 6), [], '同级不补');
  assert.deepEqual(onLevelUp(st, 6, 5), [], '降级不补');
  assert.equal(st.level, 6, '降级不改等级');

  const jumped = onLevelUp(st, 6, 22);
  assert.deepEqual(
    jumped.map((p) => [p.kind, p.seq, p.learn]),
    [['magic', 69, 11], ['wise', 22, 12], ['magic', 77, 17], ['wise', 32, 19], ['magic', 84, 22]],
    '一次升多级时按习得等级排好',
  );
  assert.equal(st.level, 22);
});

test('R68 monthlyLearnCheck：1 级补 2 条；41 级一次补齐 15 条且 8+7 槽够用', () => {
  const low = createLearnState(data, '關羽', 1);
  assert.deepEqual(monthlyLearnCheck(low).map((p) => p.seq), [50, 8]);
  assert.deepEqual(monthlyLearnCheck(low), [], '幂等');

  const top = createLearnState(data, '關羽', 41);
  assert.equal(monthlyLearnCheck(top).length, 15);
  assert.deepEqual(top.magic, [50, 63, 69, 77, 84, 88, 102, 110]);
  assert.deepEqual(top.wise, [8, 16, 22, 32, 38, 51, 54]);
  assert.equal(top.magic.length, MAGIC_SLOTS);
  assert.ok(top.wise.length <= WISE_SLOTS);
});

test('R68 月末兜底：升级时漏掉的、读档时等级已经涨上去的，都能补回来', () => {
  const st = createLearnState(data, '關羽', 1);
  monthlyLearnCheck(st); // 开局先补学（1 级那两条），之后升级才只补增量
  assert.deepEqual(st.magic, [50]);
  assert.deepEqual(st.wise, [8]);

  st.level = 12; // 模拟读档/事件：等级涨到 12，但没走补学
  const got = monthlyLearnCheck(st);
  assert.deepEqual(got.map((p) => p.seq), [63, 16, 69, 22], '一次补齐 6/11 级武将技与 6/12 级军师技');
  assert.deepEqual(st.magic, [50, 63, 69]);
  assert.deepEqual(st.wise, [8, 16, 22]);
});

test('R68 槽满：8 条武将技已占满时，applyLearn 只补军师技、不越界', () => {
  const packed = createLearnState(data, '關羽', 41, { magic: [1, 2, 3, 4, 5, 6, 7, 9] });
  const got = monthlyLearnCheck(packed);
  assert.equal(got.length, 7, '7 条军师技照补，8 条武将技因槽满全部跳过');
  assert.deepEqual(packed.magic, [1, 2, 3, 4, 5, 6, 7, 9], '已学列表不被顶掉');
  assert.equal(packed.wise.length, 7);
});

test('R68 全量数据：401 名武将都有表，行数 2..8、等级 1..41、无重号，41 级全表可学', () => {
  const withTable = data.generals.filter((g) => Array.isArray(g.SKILL) && g.SKILL.length > 0);
  assert.equal(withTable.length, 401, '含 id 0 的盜賊模板（它也有 8 行通用表）');

  let totalMagic = 0;
  let totalWise = 0;
  let maxLevel = 0;
  for (const g of withTable) {
    const magic = learnTableOf(data, g.NAME, 'SKILL');
    const wise = learnTableOf(data, g.NAME, 'WISESKILL');
    assert.ok(magic.length >= 2 && magic.length <= MAGIC_SLOTS, `${g.NAME} 武将技表 ${magic.length} 行`);
    assert.ok(wise.length >= 1 && wise.length <= WISE_SLOTS, `${g.NAME} 军师技表 ${wise.length} 行`);
    for (const row of [...magic, ...wise]) {
      assert.ok(row.level >= 1 && row.level <= LEARN_MAX_LEVEL, `${g.NAME} 习得等级 ${row.level}`);
      assert.ok(row.name.length > 0, `${g.NAME} 序号 ${row.seq} 查不到名字`);
      if (row.level > maxLevel) maxLevel = row.level;
    }
    assert.equal(new Set(magic.map((r) => r.seq)).size, magic.length, `${g.NAME} 武将技重号`);
    assert.equal(new Set(wise.map((r) => r.seq)).size, wise.length, `${g.NAME} 军师技重号`);
    totalMagic += magic.length;
    totalWise += wise.length;

    const st = createLearnState(data, g.NAME, LEARN_MAX_LEVEL);
    assert.equal(
      pendingLearn(st).length,
      magic.length + wise.length,
      `${g.NAME} 41 级应把整张表都学完（表最大 8 条 = 槽 8）`,
    );
  }
  assert.equal(totalMagic, 2061, 'SKILL 行数');
  assert.equal(totalWise, 1567, 'WISESKILL 行数');
  assert.equal(maxLevel, LEARN_MAX_LEVEL, '学习表上界正好 41 级');
});
