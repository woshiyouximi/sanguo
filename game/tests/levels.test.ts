/**
 * levels.test.ts — R84/R85「等級與帶兵上限」的守門測試
 *
 * 跑法：`cd game && node --test tests/levels.test.ts`（或全量 `node --test tests/*.test.ts`）
 *
 * 釘死四件事：
 *  1. `startLevelOf()` = **由 `BaseEXP` 反推**（原作 `0x42D38B` → `0x409F73` → `0x42D39D`，
 *     門檻表 `0x409EE0` 與 `battle.expToReach` 逐字一致，見 `project/133` §3）；`[確認]`
 *  2. `levelOf()` 的來源優先序：呼叫方覆蓋（`?level=` / 存檔等級）> 武將行 `level` > 起始等級；
 *  3. `troopCapOf()` = `min(5L,100)`、`cavalryCapOf()` = `clamp((L−20)×5,0,100)`，
 *     且 **同參同值** 對拍 `game/web/city_model.js` 與 `game/src/core/battle.ts`（不許兩套算法）；
 *  4. `garrison.battleSetup()` 的守軍等級/兵力走 `levels.ts`（不是 `BaseEXP` 舊路）。
 *
 * 這份檔案只讀 `game/data/*.json` 與 `web/city_model.js`，不碰 DOM/localStorage。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import * as B from '../src/core/battle.ts';
import * as G from '../src/core/garrison.ts';
import * as L from '../src/core/levels.ts';
import * as City from '../web/city_model.js';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const rowOf = (name: string) => {
  const row = data.generals.find((g) => g.NAME === name);
  assert.ok(row, `generals.json 里找不到 ${name}`);
  return row;
};

/** `defenderBattleParams(_, general)` 的第二参数类型（武将行 + 运行时 level） */
type GeneralRow = NonNullable<Parameters<typeof G.defenderBattleParams>[1]>;
const asRow = (row: object) => row as unknown as GeneralRow;

/** 5 剧本 × 全部城的 `{ side, name }` 清单（城名来自 scenarios.json） */
function cityList(): Array<{ side: number; name: string }> {
  const list: Array<{ side: number; name: string }> = [];
  data.scenarios.forEach((scen, side) => {
    const cities = (scen as unknown as { cities?: Array<{ NAME?: unknown }> }).cities;
    if (!Array.isArray(cities)) return;
    for (const city of cities) {
      const name = typeof city?.NAME === 'string' ? city.NAME : '';
      if (name) list.push({ side, name });
    }
  });
  return list;
}

describe('startLevelOf：起始等级 = 门槛表反推(BaseEXP) [确认]', () => {
  it('常量就是口径（等级 1..99；門檻表來自 battle.ts，不複製第二份）', () => {
    assert.equal(L.LEVEL_MIN, 1);
    assert.equal(L.LEVEL_MAX, 99);
    assert.equal(L.levelFromExp, B.levelFromExp);
  });

  it('原作抽取值：BaseEXP 200 → Lv2；9999（盜賊）→ Lv12；与 project/133 §3 逐条对齐', () => {
    assert.equal(L.startLevelOf({ BaseEXP: 200 }), 2);
    assert.equal(L.startLevelOf({ BaseEXP: 9999 }), 12);
    // 门槛点：expToReach(2)=120、expToReach(3)=377
    assert.equal(L.startLevelOf({ BaseEXP: 119 }), 1);
    assert.equal(L.startLevelOf({ BaseEXP: 120 }), 2);
    assert.equal(L.startLevelOf({ BaseEXP: 376 }), 2);
    assert.equal(L.startLevelOf({ BaseEXP: 377 }), 3);
  });

  it('缺字段 / 0 / 脏值 → 按 200 兜底（= Lv2，全员同級是当前数据的事实）', () => {
    for (const bad of [{}, null, undefined, { BaseEXP: 0 }, { BaseEXP: '' }, { BaseEXP: 'x' }, { BaseEXP: Number.NaN }]) {
      assert.equal(L.startLevelOf(bad as never), 2, `${JSON.stringify(bad)} 应兜底 Lv2`);
    }
  });

  it('大小写 / 字符串数字都吃：baseExp:"9999" 与 BaseEXP:9999 同值', () => {
    assert.equal(L.startLevelOf({ baseExp: '9999' }), 12);
    assert.equal(L.startLevelOf({ BaseEXP: 9999 }), 12);
  });

  it('真数据：400 将的 BaseEXP 全是 200 → 全部 Lv2（带兵 10）；Lv2 是原作开局值不是 bug', () => {
    const rows = data.generals.filter((g) => g.NAME !== '盜賊');
    assert.equal(rows.length, 400, 'generals.json 应为 401 元素（[0]=盜賊 模板 + 400 真将）');
    const dist = new Map<number, number>();
    for (const g of rows) {
      const lv = L.startLevelOf(g);
      assert.ok(lv >= 1 && lv <= 99, `${g.NAME} 起始等级越界: ${lv}`);
      dist.set(lv, (dist.get(lv) ?? 0) + 1);
    }
    assert.deepEqual([...dist.entries()], [[2, 400]], '当前数据 400 将全 Lv2');
    assert.equal(L.troopCapOf(2), 10, 'Lv2 带兵上限 10（原作口径）');
  });
});

describe('levelOf：覆盖 > 武将行 level > 起始等级', () => {
  it('优先级三段都通', () => {
    const gen = { BaseEXP: 9999, level: 25 } as const;
    assert.equal(L.levelOf(gen, 40), 40); // 覆盖优先
    assert.equal(L.levelOf(gen), 25); // 其次武将行 level
    assert.equal(L.levelOf({ BaseEXP: 200 }), 2); // 都没有 → 起始等级
  });

  it('非法覆盖（0 / 负数 / NaN / 空串 / null）回落，不把等级打成 0', () => {
    const gen = { STR: 99, INT: 85, level: 25 };
    for (const bad of [0, -3, Number.NaN, '', null, undefined, 'abc', {}]) {
      assert.equal(L.levelOf(gen, bad), 25, `bad override ${String(bad)} 应回落`);
    }
    assert.equal(L.levelOf({ STR: 99, INT: 85 }, 0), 2);
  });

  it('覆盖值夹到 1..99 并 trunc：200 → 99，20.9 → 20，99 → 99；0.9 截成 0 = 没指定 → 回落', () => {
    assert.equal(L.levelOf({}, 200), 99);
    assert.equal(L.levelOf({}, 20.9), 20);
    assert.equal(L.levelOf({}, 99), 99);
    assert.equal(L.levelOf({ BaseEXP: 9999 }, 0.9), 12); // 0.9 → trunc 0 → 视同没给
  });

  it('武将行 level 也夹：level 0 视为没有，level 120 → 99', () => {
    assert.equal(L.levelOf({ level: 0, BaseEXP: 200 }), 2);
    assert.equal(L.levelOf({ level: 120 }), 99);
  });
});

describe('troopCapOf：min(5×等级, 100)（0x409FB6）', () => {
  it('边界：Lv1=5 / Lv2=10 / Lv6=30 / Lv19=95 / Lv20=100 / Lv30=100 / Lv99=100', () => {
    assert.equal(L.troopCapOf(1), 5);
    assert.equal(L.troopCapOf(2), 10);
    assert.equal(L.troopCapOf(6), 30);
    assert.equal(L.troopCapOf(19), 95);
    assert.equal(L.troopCapOf(20), 100);
    assert.equal(L.troopCapOf(30), 100);
    assert.equal(L.troopCapOf(99), 100);
  });

  it('非法/越界：0、-5、NaN、空串、undefined → 5（1 级）；1000 → 100；\'12\' → 60', () => {
    assert.equal(L.troopCapOf(0), 5);
    assert.equal(L.troopCapOf(-5), 5);
    assert.equal(L.troopCapOf(Number.NaN), 5);
    assert.equal(L.troopCapOf(''), 5);
    assert.equal(L.troopCapOf(undefined), 5);
    assert.equal(L.troopCapOf(1000), 100);
    assert.equal(L.troopCapOf('12'), 60);
  });

  it('与 city_model.troopMaxOf 同参同值（1..99 全扫）', () => {
    for (let lv = 1; lv <= 99; lv++) {
      assert.equal(L.troopCapOf(lv), City.troopMaxOf(lv), `troopCapOf(${lv}) 与 city_model 分叉`);
    }
  });
});

describe('cavalryCapOf：clamp((等级−20)×5, 0, 100)（0x409FD8）', () => {
  it('边界：Lv6=0 / Lv20=0 / Lv21=5 / Lv24=20 / Lv25=25 / Lv40=100 / Lv55=100', () => {
    assert.equal(L.cavalryCapOf(6), 0);
    assert.equal(L.cavalryCapOf(20), 0);
    assert.equal(L.cavalryCapOf(21), 5);
    assert.equal(L.cavalryCapOf(24), 20);
    assert.equal(L.cavalryCapOf(25), 25);
    assert.equal(L.cavalryCapOf(40), 100);
    assert.equal(L.cavalryCapOf(55), 100);
  });

  it('与 city_model.cavalryCapOf 同参同值（-5..120 全扫 + 非整数 + 字符串 + 脏值）', () => {
    for (let lv = -5; lv <= 120; lv++) {
      assert.equal(L.cavalryCapOf(lv), City.cavalryCapOf(lv), `cavalryCapOf(${lv}) 与 city_model 分叉`);
    }
    for (const v of [20.4, 21.6, 39.9, 40.1, -0.5, '21', '40.9', 'x', '', null, undefined, Number.NaN, Infinity]) {
      assert.equal(L.cavalryCapOf(v), City.cavalryCapOf(v), `cavalryCapOf(${String(v)}) 与 city_model 分叉`);
    }
  });

  it('整数 1..99 与 battle.cavalryCapOf 同值；非整数按 floor（21.6 → 5，battle 侧 round 会给 10）', () => {
    for (let lv = 1; lv <= 99; lv++) {
      assert.equal(L.cavalryCapOf(lv), B.cavalryCapOf(lv), `cavalryCapOf(${lv}) 与 battle 分叉`);
    }
    assert.equal(L.cavalryCapOf(21.6), 5);
    assert.equal(B.cavalryCapOf(21.6), 10); // 说明差异来源：levels 跟 city_model 用 floor
  });
});

describe('levelFromExp：不复制第二份，直接转出 battle.ts 的实现', () => {
  it('与 battle.ts 是同一个函数对象（不是复制品）', () => {
    assert.equal(L.levelFromExp, B.levelFromExp);
  });

  it('抽样行为与经验表一致（120→2、9999→12、662921→99）', () => {
    assert.equal(L.levelFromExp(0), 1);
    assert.equal(L.levelFromExp(120), 2);
    assert.equal(L.levelFromExp(200), 2);
    assert.equal(L.levelFromExp(9999), 12);
    assert.equal(L.levelFromExp(662921), 99);
  });
});

describe('garrison.defenderBattleParams：改用 levels.ts（BaseEXP 反推）', () => {
  it('无武将行 → 起始等级 Lv2、10 兵、levelBasis=start', () => {
    const p = G.defenderBattleParams({ name: '無名', str: 50, int: 50 });
    assert.equal(p.level, 2);
    assert.equal(p.levelBasis, 'start');
    assert.equal(p.troopsMax, 10);
    assert.equal(p.cavalryMax, 0);
    assert.equal(p.soldiers, 10);
  });

  it('BaseEXP 9999（盜賊）→ Lv12 = 60 兵；与 133 报告「盜賊 Lv12」一致', () => {
    const p = G.defenderBattleParams({ name: '盜賊', str: 40, int: 40 }, asRow({ NAME: '盜賊', STR: 40, INT: 40, BaseEXP: 9999 }));
    assert.equal(p.level, 12);
    assert.equal(p.levelBasis, 'start');
    assert.equal(p.soldiers, 60);
  });

  it('运行时 level 25 → levelBasis=exe、帶兵 100 + 騎兵 25 = 125', () => {
    const p = G.defenderBattleParams({ name: '關羽', str: 99, int: 85 }, asRow({ NAME: '關羽', STR: 99, INT: 85, level: 25 }));
    assert.equal(p.level, 25);
    assert.equal(p.levelBasis, 'exe');
    assert.equal(p.troopsMax, 100);
    assert.equal(p.cavalryMax, 25);
    assert.equal(p.soldiers, 125);
  });

  it('等级/带兵与 levels.ts 同值：10 名将 × 3 种 level 覆盖全扫', () => {
    const names = ['關羽', '張飛', '呂布', '諸葛亮', '曹仁', '嚴白虎', '張角', '華佗', '兀突骨', '張英'];
    for (const name of names) {
      const row = rowOf(name);
      for (const override of [0, 1, 26]) {
        const p = G.defenderBattleParams({ name, str: row.STR, int: row.INT }, asRow({ ...row, level: override }));
        const lv = L.levelOf({ BaseEXP: row.BaseEXP }, override);
        assert.equal(p.level, lv, `${name}@${override} 等级与 levels.ts 分叉`);
        assert.equal(p.troopsMax, L.troopCapOf(lv));
        assert.equal(p.cavalryMax, L.cavalryCapOf(lv));
        assert.equal(p.soldiers, p.troopsMax + p.cavalryMax);
      }
    }
  });
});

describe('garrison.battleSetup：守军等级/兵力走 levels.ts', () => {
  const all = cityList();

  it('5 剧本 300 城全扫：有守将的城池等级 = BaseEXP 反推、兵力 = 帶兵數+騎兵數', () => {
    assert.equal(all.length, 300, '5 剧本 × 60 城');
    let withChief = 0;
    for (const { side, name } of all) {
      const setup = G.battleSetup(data, side, name, 100);
      assert.ok(setup.enemyTroops >= 1 && setup.enemyTroops <= 200, `${name} 兵力越界: ${setup.enemyTroops}`);
      const p = setup.enemyParams;
      if (!p) {
        assert.equal(setup.enemyTroopsBasis, 'estimate:我軍六成');
        assert.equal(setup.enemyTroops, 60); // round(100 × 0.6)
        continue;
      }
      withChief++;
      assert.ok(p.level >= 1, `${name} 守将等级 ${p.level} 越界`);
      assert.equal(p.troopsMax, L.troopCapOf(p.level));
      assert.equal(p.cavalryMax, L.cavalryCapOf(p.level));
      assert.equal(setup.enemyTroops, p.soldiers, `${name} 兵力应等于帶兵數+騎兵數`);
      assert.equal(
        setup.enemyTroopsBasis,
        p.levelBasis === 'exe' ? 'exe:帶兵數' : 'estimate:帶兵數@起始等級',
        `${name} 的 enemyTroopsBasis 与 levelBasis 不一致`,
      );
    }
    assert.ok(withChief > 0, '至少要有几座城有守将');
  });

  it('守军兵仍走旧网页口径 round(守军/6)（reserve 模式不受等级改动影响）', () => {
    const setup = G.battleSetup(data, 0, '襄平', 100, { troopMode: 'reserve' });
    assert.equal(setup.enemyTroopsBasis, 'estimate:守軍/6');
    assert.equal(setup.enemyTroops, 60); // max(60, round(141/6)) 夹到 60
    assert.equal(setup.enemyParams?.level, 2); // 等级是新的（Lv2），兵力不是
    assert.notEqual(setup.enemyTroops, setup.enemyParams?.soldiers);
  });

  it('空城 → 我军六成、1..100 之间，且没有 enemyParams', () => {
    const setup = G.battleSetup(data, 0, '不存在的城', 100);
    assert.equal(setup.enemyTroopsBasis, 'estimate:我軍六成');
    assert.equal(setup.enemyTroops, 60);
    assert.equal(setup.enemyParams, null);
    assert.equal(setup.enemyOfficers.length, 0);
  });

  it('export 循环（garrison → levels → battle → strategy → garrison）在运行期没有 TDZ', () => {
    // 三个模块的顶层函数都能调；任何一个环上的绑定进了 TDZ 这里就会抛 ReferenceError
    assert.equal(typeof G.battleSetup, 'function');
    assert.equal(typeof G.defenderBattleParams, 'function');
    assert.equal(typeof L.levelOf, 'function');
    assert.equal(typeof B.createWorld, 'function');
    assert.equal(L.levelFromExp(120), 2);
  });
});
