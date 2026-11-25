/**
 * 数据结构自检（R82）：formations / troops / terrains / generals / garrison 五张表。
 *
 * 这里只断言"表本身没被改坏"——维度、值域、反对称、引用完整性——不含任何玩法逻辑：
 *
 *   - 阵形 11×11 相克矩阵：`docs/04b_战斗系统.md` §3.3，VA `0x0048D2A0`，stride `0x2C`（11×int32）
 *   - 阵形 11 个站位槽：`docs/04b1_阵形站位表.md`（grid 71×14、cell 96×72）
 *   - 兵种 13×13 相克：VA `0x48CD88`，取值 ±68
 *   - 地形 12 条 × 13 兵种修正：`0x4307AE TerrainMod` 取 `[terrain*0x34 + thing*4 + 0x48D030]`
 *   - 武将 401 条：BaseEXP 只有 200 / 9999 两档 ⇒ 等级由 `0x409F73` 反推（见 `core/garrison.ts`）
 *   - 守将表：`work/build_garrison.py` 的生成物，5 剧本 × 60 城 × 1011 条，
 *     `garrison = min(floor(POPULATION / 2500) + 110, 600)`（`docs/04c_世界与内政.md` §2.2 的 `city+0x82`）
 *
 * 跑法：cd F:\sanguo\game && node --test tests/data_r82.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import { expForLevel, levelFromExp } from '../src/core/garrison.ts';
import type { FormationTable } from '../src/types.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** `types.ts` 的 `FormationTable` 只声明了 TS 侧用到的字段，数据文件里还有这三个 */
interface FormationEx extends FormationTable {
  matrix_names: string[];
  playable: number;
  matrix_source: { va: string; stride: string; range: string; note: string };
}
const formations = data.formations as FormationEx;

/** `garrison.json` 的形状（守将表是生成物，没有进 `GameData` 的类型） */
interface GarrisonOfficer {
  name: string;
  str: number;
  int: number;
  loyal: number;
  /** `general+0x91 & 1`：`登` = 在职（登用可能），`野` = 在野 */
  status: string;
}
interface GarrisonCity {
  owner: string;
  major: string;
  wise: string;
  officers: GarrisonOfficer[];
  garrison: number;
}
interface GarrisonScenario {
  scenario: number;
  cities: Record<string, GarrisonCity>;
}
const garrison = JSON.parse(
  readFileSync(new URL('../data/garrison.json', import.meta.url), 'utf8'),
) as GarrisonScenario[];

/** 剧本里的城池行（`Scenario.cities` 在类型里是 `unknown[]`） */
interface ScenarioCity {
  NAME: string;
  KING?: unknown;
  MAJOR?: unknown;
  WISE?: unknown;
  POPULATION?: unknown;
}

/** `generals.json` 里按剧本分列的两列（`types.ts` 的 `General` 只声明了 TS 侧用到的字段） */
interface GeneralTimes {
  city_by_times?: string[];
  status_by_times?: string[];
}

test('R82 formations：11×11 相克矩阵（0x0048D2A0，stride 0x2C）', () => {
  const f = formations;
  assert.equal(f.matrix.length, 11, '11 行：9 种玩家阵 + 特殊阵型 + 乱阵');
  assert.equal(f.matrix_names.length, 11);
  assert.deepEqual(
    f.matrix.map((row) => row.name),
    f.matrix_names,
    '行名必须等于 matrix_names（索引 9 = 特殊阵型、10 = 乱阵）',
  );

  for (const row of f.matrix) {
    assert.equal(row.vs.length, 11, `${row.name} 必须是 11 列`);
    for (const v of row.vs) {
      assert.ok(Number.isInteger(v), `${row.name} 的值必须是整数：${v}`);
      assert.ok(v >= -25 && v <= 25, `${row.name} 越界：${v}`);
    }
  }

  // 反对称 + 对角 0（原作表逐项相反）
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 11; j++) {
      // `-0 === 0` 在 assert/strict 下不成立，写成 `-(v) + 0` 归一到 +0
      assert.equal(f.matrix[i].vs[j], -f.matrix[j].vs[i] + 0, `matrix[${i}][${j}] 不反对称`);
      if (i === j) assert.equal(f.matrix[i].vs[j], 0, '对角必须是 0');
    }
  }

  // 亂陣（索引 10）：对任何阵 −25，任何阵对它 +25（对角仍是 0，保持反对称）
  const luan = f.matrix_names.indexOf('乱阵');
  assert.equal(luan, 10);
  f.matrix[luan].vs.forEach((v, j) => assert.equal(v, j === luan ? 0 : -25, `亂陣行第 ${j} 列应是 −25`));
  for (let i = 0; i < 11; i++) {
    assert.equal(f.matrix[i].vs[luan], i === luan ? 0 : 25, `第 ${i} 行对亂陣应 +25`);
  }

  // 玩家只有前 9 阵；特殊阵型/亂陣是变体，不算 playable
  assert.equal(f.names.length, 9);
  assert.equal(f.playable, 9);
  assert.equal(f.matrix_source.va, '0x0048D2A0');
  assert.equal(f.matrix_source.stride, '0x2C (11×int32)');
  assert.equal(f.matrix_source.range, '[-25, +25]');
});

test('R82 formations：11 个站位槽 + slot_rule（04b1）', () => {
  const f = formations;
  assert.equal(f.slots.length, 11, '9 种玩家阵 + 亂陣 + 特殊陣型');
  for (let i = 0; i < f.slots.length; i++) {
    const s = f.slots[i];
    assert.equal(s.a, i, 'slots 必须按 a 升序，a 就是索引');
    assert.ok(s.name.length > 0, `槽 ${i} 缺 name`);
    assert.ok(Number.isInteger(s.anchorX) && s.anchorX >= 0, `槽 ${i} 的 anchorX 非法：${s.anchorX}`);
    for (const k of ['1', '2', '3', '4', '5']) {
      const w = s.weights[k];
      assert.equal(typeof w, 'number', `槽 ${i} weights[${k}] 必须是数字`);
      assert.ok(Number.isInteger(w) && w >= 0, `槽 ${i} weights[${k}] 非法：${w}`);
    }
    const modes = s.modes as Record<string, unknown>;
    assert.ok(Array.isArray(modes['1']) && modes['1'].length > 0, `槽 ${i} 缺 mode 1`);
    const bbox = s.bbox as Record<string, number[]>;
    assert.equal(bbox['1']?.length, 4, `槽 ${i} bbox[1] 应是 4 个数 [x0,y0,x1,y1]`);
    for (const n of ['10', '50', '100', '200']) {
      const fill = s.fill[n];
      assert.ok(Array.isArray(fill) && fill.length > 0, `槽 ${i} 缺 ${n} 人落位`);
      for (const cell of fill) {
        assert.equal(typeof cell.mode, 'number');
        assert.ok(Number.isInteger(cell.x) && Number.isInteger(cell.y), `槽 ${i} 落位坐标必须是整数`);
      }
    }
  }
  // 0..9 有 A/B 两侧的镜像 mode；10「特殊陣型」只有 mode 1（04b1:666-744）
  for (const s of f.slots.slice(0, 10)) {
    const modes = s.modes as Record<string, unknown>;
    assert.ok(Array.isArray(modes['2']) && (modes['2'] as unknown[]).length > 0, `槽 ${s.a} 缺镜像 mode 2`);
  }
  assert.deepEqual(Object.keys(f.slots[10].modes as object), ['1'], '特殊陣型 只有 mode 1');

  assert.deepEqual(f.slot_rule.grid, [71, 14], '格数 71×14');
  assert.deepEqual(f.slot_rule.cell_px, [96, 72], '格宽 96×72 像素');
  assert.ok(f.slot_rule.formula.includes('anchorX'));
  assert.equal(f.slot_rule.source, 'docs/04b1_阵形站位表.md');
});

test('R82 troops：13×13 兵种相克（0x48CD88，±68）', () => {
  const t = data.troops;
  assert.equal(t.matrix.length, 13, '13 个兵种');
  assert.equal(t.names.length, 13);
  assert.equal(new Set(t.names).size, 13, '兵种名不能重复');
  for (const row of t.matrix) {
    assert.equal(row.vs.length, 13, `${row.name} 必须是 13 列`);
    for (const v of row.vs) {
      assert.ok(Number.isInteger(v) && v >= -68 && v <= 68, `${row.name} 越界：${v}`);
    }
  }
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      assert.equal(t.matrix[i].vs[j], -t.matrix[j].vs[i] + 0, `troops[${i}][${j}] 不反对称`);
      if (i === j) assert.equal(t.matrix[i].vs[j], 0, '同兵种相克必须是 0');
    }
  }
});

test('R82 terrains：12 条地形 × 13 兵种修正（0x4307AE）', () => {
  const ts = data.terrains;
  assert.equal(ts.length, 12, '原作 12 条地形（索引即 id，Name 可重名）');
  assert.deepEqual(
    ts.map((t) => t.Sequence),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'Sequence 必须是 0..11 且唯一（索引即地形 id）',
  );
  const troopCount = data.troops.matrix.length;
  for (const t of ts) {
    assert.ok(Array.isArray(t.vs), `${t.Name} 缺 vs 行`);
    assert.equal(t.vs!.length, troopCount, `${t.Name} 的 vs 必须覆盖 ${troopCount} 个兵种`);
    for (const v of t.vs!) {
      assert.ok(Number.isInteger(v) && v >= -25 && v <= 25, `${t.Name} 修正值越界：${v}`);
    }
  }
});

test('R82 generals：401 条 + 字段值域 + BaseEXP→等级', () => {
  const gs = data.generals;
  assert.equal(gs.length, 401);
  assert.equal(new Set(gs.map((g) => g.NAME)).size, 401, 'NAME 必须唯一（立绘/查表都按 NAME）');

  for (const g of gs) {
    for (const [key, v] of Object.entries({ STR: g.STR, INT: g.INT, BaseHP: g.BaseHP, BaseMP: g.BaseMP })) {
      assert.ok(Number.isInteger(v), `${g.NAME}.${key} 必须是整数：${v}`);
      assert.ok(v >= 1 && v <= 100, `${g.NAME}.${key} 越界：${v}`);
    }
    if (typeof g.CONSTANCY === 'number') {
      assert.ok(g.CONSTANCY >= 1 && g.CONSTANCY <= 9, `${g.NAME}.CONSTANCY 越界：${g.CONSTANCY}`);
    }
    if (typeof g.Loyal === 'number') {
      assert.ok(g.Loyal >= 0 && g.Loyal <= 100, `${g.NAME}.Loyal 越界：${g.Loyal}`);
    }
  }

  // 原作的 BaseEXP 只有两档：普通武将 200、盜賊 9999（docs/03c:210）
  const hist: Record<string, number> = {};
  for (const g of gs) hist[String(g.BaseEXP)] = (hist[String(g.BaseEXP)] ?? 0) + 1;
  assert.deepEqual(hist, { '200': 400, '9999': 1 });

  // 等级由 0x409F73 从 BaseEXP 反推：200 → 2 级，9999 → 12 级。
  // 这决定了守军兵力（帶兵 = min(等级×5, 100)）：400 人 10 兵、盜賊 60 兵。
  assert.equal(expForLevel(2), 120);
  assert.equal(expForLevel(3), 377);
  assert.equal(levelFromExp(200), 2);
  assert.equal(levelFromExp(9999), 12);
  const levels: Record<string, number> = {};
  for (const g of gs) {
    const lv = levelFromExp(Number(g.BaseEXP ?? 0));
    assert.ok(lv >= 1 && lv <= 99, `${g.NAME} 等级越界：${lv}`);
    levels[String(lv)] = (levels[String(lv)] ?? 0) + 1;
  }
  assert.deepEqual(levels, { '2': 400, '12': 1 });
});

test('R82 garrison：5 剧本 × 60 城 × 1011 守将，与 scenarios 逐城对齐', () => {
  assert.equal(garrison.length, 5, '5 个剧本');
  assert.deepEqual(garrison.map((s) => s.scenario), [0, 1, 2, 3, 4]);

  let officerTotal = 0;
  let numericKings = 0;
  for (let i = 0; i < 5; i++) {
    const table = garrison[i];
    const scenario = data.scenarios[i];
    assert.equal(scenario.id, i + 1, 'scenarios.json 的 id 是 1-based，数组下标才是剧本号');
    const cities = table.cities;
    assert.equal(Object.keys(cities).length, 60, `剧本 ${i} 应有 60 城`);

    const byName = new Map<string, ScenarioCity>();
    for (const raw of scenario.cities as ScenarioCity[]) byName.set(String(raw.NAME), raw);

    // 每个武将行都要能在 generals.json 找到，且城/身份/忠诚逐项对得上
    const generalByName = new Map<string, (typeof data.generals)[number] & GeneralTimes>(
      data.generals.map((g) => [String(g.NAME), g]),
    );
    for (const [cityName, city] of Object.entries(cities)) {
      const src = byName.get(cityName);
      assert.ok(src, `剧本 ${i} 的 ${cityName} 在 scenarios.json 里不存在`);

      // owner/major/wise 原样搬 city 字段；唯一例外是剧本 0 里 12 座 KING 为数字的城
      // （转换残渣 1..12），生成器把它们写成空串，等于无主城。
      const king = src!.KING;
      if (typeof king === 'number') {
        numericKings++;
        assert.equal(city.owner, '', `${cityName} 的 KING=${king} 是数字残渣，owner 必须是空串`);
      } else {
        assert.equal(city.owner, String(king ?? ''), `${cityName} 的 owner 与 KING 不一致`);
      }
      assert.equal(city.wise, String(src!.WISE ?? ''), `${cityName} 的 wise 与 WISE 不一致`);
      assert.equal(city.major, String(src!.MAJOR ?? ''), `${cityName} 的 major 与 MAJOR 不一致`);

      // 守军数 = min(floor(POPULATION/2500)+110, 600)（city+0x82 预备兵上限）
      const pop = Number(src!.POPULATION);
      assert.equal(Number.isFinite(pop), true, `${cityName} 缺 POPULATION`);
      const expect = Math.min(Math.floor(pop / 2500) + 110, 600);
      assert.equal(city.garrison, expect, `${cityName} 守军数不符：POP=${pop}`);

      // 守将按 STR+INT 降序排（生成器保证，pickCommander 也依赖这一顺序）
      for (let k = 1; k < city.officers.length; k++) {
        const a = city.officers[k - 1];
        const b = city.officers[k];
        assert.ok(a.str + a.int >= b.str + b.int, `${cityName} 守将未按 STR+INT 降序：${a.name} < ${b.name}`);
      }
      // 太守必须在守将名单里（有太守的城）
      if (city.major) {
        assert.ok(
          city.officers.some((o) => o.name === city.major),
          `${cityName} 的太守 ${city.major} 不在守将名单里`,
        );
      }

      for (const o of city.officers) {
        officerTotal++;
        assert.ok(Number.isInteger(o.str) && o.str >= 1 && o.str <= 100, `${o.name}.str 越界`);
        assert.ok(Number.isInteger(o.int) && o.int >= 1 && o.int <= 100, `${o.name}.int 越界`);
        assert.ok(Number.isInteger(o.loyal) && o.loyal >= 0 && o.loyal <= 100, `${o.name}.loyal 越界`);
        assert.ok(o.status === '登' || o.status === '野', `${o.name} 的身份非法：${o.status}`);

        const g = generalByName.get(o.name);
        assert.ok(g, `剧本 ${i} 的守将 ${o.name} 在 generals.json 里不存在`);
        assert.equal(String(g!.city_by_times?.[i] ?? ''), cityName, `${o.name} 的 city_by_times[${i}] 对不上`);
        assert.equal(String(g!.status_by_times?.[i] ?? ''), o.status, `${o.name} 的 status_by_times[${i}] 对不上`);
        assert.equal(g!.Loyal, o.loyal, `${o.name} 的忠诚与 generals.json 的 Loyal 对不上`);
      }
    }
  }
  assert.equal(officerTotal, 1011, '5 剧本合计 1011 条守将记录');
  assert.equal(numericKings, 12, '剧本 0 有 12 座城的 KING 是数字残渣');
});
