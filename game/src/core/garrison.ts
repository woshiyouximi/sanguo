/**
 * 守将 / 势力 / 太守 / 军师：把原作数据还原成"这座城归谁、谁在守、太守是谁"。
 *
 * 原作的守城战根本不是一个"守將"占位符：每座城有归属势力（`KING`）、太守
 * （`MAJOR`）、军师（`WISE`），以及一张按剧本变化的驻将名单。本模块就是
 * 那份名单的唯一读取口，数据来自 `game/data/garrison.json`
 * （由 `work/build_garrison.py` 从 `scenarios.json` + `generals.json` 生成，
 * 见 `project/30_敌我守将与势力还原.md`）。
 *
 * 约定：
 *  - 数据表 `data.garrison` 是**可选**的。旧的 `GameData`（没有这个字段）不会
 *    报错，也不会返回 null：现场按 `general.city_by_times[scenario]` +
 *    城名重新算一遍，算法与生成脚本逐条一致（同一个 `STR+INT` 降序）；
 *  - 所有函数**不抛异常**：脏数据、缺字段、空数组一律退化成 `""` / `0` / `[]`；
 *  - `garrisonOf()` 只在"这个剧本里根本没这座城"时返回 `null`；
 *  - `defendersOf()` 默认取前 3 人，**太守优先**：太守若不在前 3，就顶掉第 3
 *    名再按 `STR+INT` 重排，保证最终名单仍是降序（原作太守必在城内）；
 *  - 数值 `str` / `int` / `loyal` 就是武将表里的 `STR` / `INT` / `Loyal`，
 *    不再用城防 `DEFENSE` 代理。
 */
import type { GameData, General } from '../types.ts';
// 等级 / 帶兵上限的唯一口径（R84）。注意这里有 import 环：
// garrison → levels → battle → strategy → garrison；两边都只在函数体内用，
// `tests/levels.test.ts` 有一条专门实跑确认没有 TDZ。
import { TROOP_COLUMNS_MAX, cavalryCapOf, levelOf, troopCapOf, troopCapSumOf } from './levels.ts';

/** 名单里的一个守将。`status` 是原作同剧本的登/野/未 */
export type Officer = {
  name: string;
  str: number;
  int: number;
  loyal: number;
  status: string;
};

/** 一座城的守备情况 */
export type Garrison = {
  /** 归属势力名，`""` = 无主 */
  owner: string;
  /** 太守，`""` = 原作数据里没设 */
  major: string;
  /** 军师，`""` = 没设 */
  wise: string;
  /** 全部驻将，按 `STR+INT` 降序 */
  officers: Officer[];
  /** 守军数，`min(floor(POP/2500)+110, 600)` */
  garrison: number;
};

/** `garrison.json` 的一个剧本 */
export type GarrisonScenario = { scenario: number; cities: Record<string, Garrison> };

/** `garrison.json` 整张表（5 个剧本） */
export type GarrisonTable = GarrisonScenario[];

/**
 * `GameData` + 可选的守将表。
 *
 * `unknown` 而不是 `GarrisonTable`：这张表来自 `fetch()`，形状错了也不能让
 * 读取端崩，归一化在 `normalizeGarrison()` 里做。
 */
export interface GarrisonData extends GameData {
  garrison?: unknown;
}

/**
 * 守将 → 战斗参数的换算结果（纯函数 `defenderBattleParams()` 的返回）。
 *
 * 这一层在原作里**不存在**"武力/智力 → 兵种强度/技力"的折算（`docs/04b5` §3.1 [确认]：
 * `0x442EFA`/`0x443498` 只从 general 读士气 `+0x38`，武力/智力一个字节都没读）。
 * 真正由武将属性派生出来的只有下面这些，逐条给地址：
 *  - 等级：`0x409F73` 用经验 `+0x2A` 反推（`0x409EE0` 的经验表）；
 *  - 帶兵數上限 `0x409FB6` = `min(5×等级, 100)`；騎兵上限 `0x409FD8` = `clamp((等级−20)×5, 0, 100)`；
 *  - 體力上限 `0x40A020` = `BaseHP + 等级×2×武力/100`；
 *  - 技力上限 `0x40A098` = `BaseMP + 等级×2×t/100`（`t = 武力>智力 ? (武力+智力)/2 : 智力`）；
 *  - 命中：兵→将 `0x43D400` = `150 − 武力×20/100`；将→兵 `0x43D4CB` = `150 + 武力/2`；
 *    将→将 = `150 + (武力a − 武力b)/2`；
 *  - 战力基准 `unit+0x70` = **150 硬编码**（`0x43A3AD`/`0x43A3B7`），士气项 = `(士气 − 50)/5`。
 *
 * `unknown` 里列的是"原作确认没有换算"或"本仓库数据缺列"的项，调用方不许拿它当数值用。
 */
export type DefenderBattleParams = {
  name: string;
  str: number;
  int: number;
  level: number;
  /** 帶兵數上限 `min(5×等级, 100)`（`0x409FB6`）= **步兵那一栏**的上限 */
  troopsMax: number;
  /** 騎兵數上限 `clamp((等级−20)×5, 0, 100)`（`0x409FD8`）= **骑兵那一栏**的上限，与上面互不包含 */
  cavalryMax: number;
  /** 上阵兵数 = 帶兵數 + 騎兵數（两栏相加，`unit+0x5C`；`project/168` §4，`levels.troopCapSumOf()`） */
  soldiers: number;
  /** 體力上限（`0x40A020`）；缺 `BaseHP` 时为 0 */
  hpMax: number;
  /** 技力上限（`0x40A098`）；缺 `BaseMP` 时为 0 */
  mpMax: number;
  /** 将→兵的命中基准 `150 + 武力/2`（`0x43D4CB`） */
  hitVsSoldiers: number;
  /** 兵→将时被打的基准 `150 − 武力×20/100`（`0x43D400`） */
  hitFromSoldiers: number;
  /** 战力基准，原作硬编码 150（`0x43A3AD`） */
  powerBase: number;
  /** 士气（TIMES 装载默认 80，`0x42D468`） */
  morale: number;
  /** 士气对战力的一段加数 `trunc((士气 − 50)/5)`（`0x44302C`） */
  moraleTerm: number;
  /**
   * 等级来源（R84 起）：
   *  - `exe` = 运行时/存档给的等级（`general.level`，即 `save.generalLevel[名]` 或 `?level=`）；
   *  - `start` = 数据里没有等级，按 `levels.ts` 的 `startLevelOf()` 推 `[新设计]`。
   * 旧值 `default`（1 级兜底）已删：`startLevelOf()` 的下限是 6，不会再出现 1 级守将。
   */
  levelBasis: 'exe' | 'start';
  /** 原作没有映射（或本仓库缺数据）的字段，按原文列出 */
  unknown: string[];
};

/** 升到 `n` 级所需累计经验 `0x409EE0` [确认]（`docs/04b` §2.4） */
export function expForLevel(level: number): number {
  const n = intOf(level, 1);
  if (n > 99) return 9999999;
  return Math.trunc((((n - 1) * 137 - 34) * n) / 2 + 17);
}

/**
 * 由经验反推等级 `0x409F73` [确认]：`for (i=0;i<99;i++) if (exp < f(i)) return i−1;`
 *
 * 汇编里 `f(0)=17`（表首不单调），`exp < 17` 会返回 −1；这里夹到 1，
 * 因为 `+0x2E` 是"等级"字段，原作装载后不可能 ≤0（`[推测]`：夹下限）。
 *
 * R84 起 `defenderBattleParams()` **不再**用它反推守将等级（那份数据 `BaseEXP` 全 200，
 * 反推一律 Lv2 = 10 兵）；保留此导出给存档经验 / `tests/level_troop.test.ts` 对拍
 * `battle.ts` 的同名实现，两边必须逐点一致。
 */
export function levelFromExp(exp: number): number {
  const e = Math.max(0, numOf(exp, 0));
  // 上界必须是 `i <= 99`：`expForLevel(99)` 才是"满级门槛"，只查到 98 会在
  // `[f(98), f(99))` 这段漏掉 98 级直接跳 99，与 `battle.ts` 的 `levelFromExp` 分叉。
  for (let i = 0; i <= 99; i++) {
    if (e < expForLevel(i)) return Math.max(1, i - 1);
  }
  return 99;
}

/** `battleSetup()` 的返回值，字段名对齐 `game/web/main.js` 的 world 配置 */
export type BattleSetup = {
  enemyGeneral: { name: string; str: number; int: number };
  enemyTroops: number;
  enemyOfficers: Officer[];
  /**
   * `enemyTroops` 的来路，**不许**让调用方猜：
   *  - `exe:帶兵數` = 原作口径（`0x409FB6`/`0x409FD8`，见 `defenderBattleParams`），等级来自存档/运行时；
   *  - `estimate:帶兵數@起始等級` = 有守将但数据里没有等级，按 `startLevelOf()` 推的起始等级 `[新设计]`；
   *  - `estimate:守軍/6` = 旧网页公式 `min(100, max(60, round(守軍/6)))`（根 `project/32` §5.2，`[新设计]`）；
   *  - `estimate:我軍六成` = 空城/无守军时的兜底。
   */
  enemyTroopsBasis: TroopBasis;
  /** 主将的换算参数（没有守将时为 `null`） */
  enemyParams: DefenderBattleParams | null;
};

/** `enemyTroops` 的来路（见 `BattleSetup.enemyTroopsBasis`） */
export type TroopBasis =
  | 'exe:帶兵數'
  | 'estimate:帶兵數@起始等級'
  | 'estimate:守軍/6'
  | 'estimate:我軍六成';

/** 武将行的真实形状：`city_by_times` / `status_by_times` 没进 `types.ts` 的 `General` */
type GeneralRow = General & {
  city_by_times?: unknown;
  status_by_times?: unknown;
};

/** 城市行的真实形状（`Scenario.cities` 在 `types.ts` 里只是 `unknown[]`） */
type CityRow = {
  NAME?: unknown;
  KING?: unknown;
  MAJOR?: unknown;
  WISE?: unknown;
  POPULATION?: unknown;
};

// ---------------------------------------------------------------- 小工具

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numOf(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function intOf(value: unknown, fallback = 0): number {
  return Math.trunc(numOf(value, fallback));
}

/** 剧本下标：负数 / NaN / 非数字一律 -1（调用方据此返回 null） */
function scenarioIndex(scenario: unknown): number {
  const i = Math.trunc(numOf(scenario, -1));
  return i >= 0 ? i : -1;
}

/**
 * 武将排序：`STR+INT` 降序，同分按名字的码位升序。
 *
 * 用码位比较而不是 `localeCompare`：生成脚本是 Python，两边要给出**同一份顺序**
 * （兜底路径算出来的名单必须和 `garrison.json` 里的逐条一致）。
 */
function sortOfficers(list: Officer[]): Officer[] {
  return list.sort((a, b) => {
    const d = b.str + b.int - (a.str + a.int);
    if (d !== 0) return d;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

function normalizeOfficer(raw: unknown): Officer | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<Officer>;
  return {
    name: textOf(row.name),
    str: intOf(row.str),
    int: intOf(row.int),
    loyal: intOf(row.loyal),
    status: textOf(row.status),
  };
}

function normalizeGarrison(raw: unknown): Garrison | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<Garrison> & { officers?: unknown };
  const officers: Officer[] = [];
  if (Array.isArray(row.officers)) {
    for (const item of row.officers) {
      const officer = normalizeOfficer(item);
      if (officer) officers.push(officer);
    }
  }
  return {
    owner: textOf(row.owner),
    major: textOf(row.major),
    wise: textOf(row.wise),
    officers: sortOfficers(officers),
    garrison: Math.max(0, intOf(row.garrison)),
  };
}

// ---------------------------------------------------------------- 读取

/** 取 `data.garrison` 里的表；支持 `[...]` 和 `{ scenarios: [...] }` 两种包装 */
function tableOf(data: GarrisonData): unknown[] | null {
  const raw = data.garrison;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const nested = (raw as { scenarios?: unknown }).scenarios;
    if (Array.isArray(nested)) return nested;
  }
  return null;
}

function bakedGarrison(data: GarrisonData, index: number, cityName: string): Garrison | null {
  const table = tableOf(data);
  if (!table) return null;
  for (const entry of table) {
    if (!entry || typeof entry !== 'object') continue;
    if (intOf((entry as { scenario?: unknown }).scenario, -1) !== index) continue;
    const cities = (entry as { cities?: unknown }).cities;
    if (!cities || typeof cities !== 'object') continue;
    const hit = (cities as Record<string, unknown>)[cityName];
    const garrison = normalizeGarrison(hit);
    if (garrison) return garrison;
  }
  return null;
}

function cityRow(data: GarrisonData, index: number, cityName: string): CityRow | null {
  const scenarios = data.scenarios;
  if (!Array.isArray(scenarios)) return null;
  const cities = scenarios[index]?.cities;
  if (!Array.isArray(cities)) return null;
  for (const item of cities) {
    if (!item || typeof item !== 'object') continue;
    const row = item as CityRow;
    if (textOf(row.NAME) === cityName) return row;
  }
  return null;
}

/** 旧数据兜底：直接扫 `generals.json`，按 `city_by_times[index]` 收人 */
function officersFromGenerals(data: GarrisonData, index: number, cityName: string): Officer[] {
  const rows = data.generals;
  if (!Array.isArray(rows)) return [];
  const out: Officer[] = [];
  for (const general of rows) {
    if (!general || typeof general !== 'object') continue;
    const row = general as GeneralRow;
    const cities = row.city_by_times;
    // 极老的存档只有第 1 剧本的冗余字段 CITY / Status
    const city = Array.isArray(cities) ? textOf(cities[index]) : (index === 0 ? textOf(row.CITY) : '');
    if (city !== cityName) continue;
    const statuses = row.status_by_times;
    const status = Array.isArray(statuses)
      ? textOf(statuses[index])
      : (index === 0 ? textOf(row.Status) : '');
    out.push({
      name: textOf(row.NAME),
      str: intOf(row.STR),
      int: intOf(row.INT),
      loyal: intOf(row.Loyal ?? row.LOYAL),
      status,
    });
  }
  return sortOfficers(out);
}

/** 在 `scenarios.json` 上现算一座城；城不在这个剧本里就 null */
function computeGarrison(data: GarrisonData, index: number, cityName: string): Garrison | null {
  const row = cityRow(data, index, cityName);
  if (!row) return null;
  return {
    owner: textOf(row.KING),
    major: textOf(row.MAJOR),
    wise: textOf(row.WISE),
    officers: officersFromGenerals(data, index, cityName),
    garrison: Math.min(Math.floor(numOf(row.POPULATION) / 2500) + 110, 600),
  };
}

/**
 * 取某剧本某城的守备情况。
 *
 * 有 `garrison.json` 就直接用（缺的字段用 `scenarios.json` 补）；
 * 没有就当旧数据现算。**只有"城不在这个剧本里"才返回 `null`**。
 */
export function garrisonOf(data: GameData, scenario: number, cityName: string): Garrison | null {
  try {
    if (!data || typeof data !== 'object') return null;
    const index = scenarioIndex(scenario);
    if (index < 0) return null;
    const name = textOf(cityName);
    if (!name) return null;

    const d = data as GarrisonData;
    const baked = bakedGarrison(d, index, name);
    const computed = computeGarrison(d, index, name);
    if (!baked) return computed;
    if (!computed) return baked;
    return {
      owner: computed.owner || baked.owner,
      major: computed.major || baked.major,
      wise: computed.wise || baked.wise,
      officers: baked.officers.length ? baked.officers : computed.officers,
      garrison: baked.garrison > 0 ? baked.garrison : computed.garrison,
    };
  } catch {
    return null;
  }
}

/**
 * 上阵的守将，默认 3 人。
 *
 * 取 `STR+INT` 前 N；**太守优先**（仅 N≥2）：太守不在前 N 就把第 N 名换掉，
 * 再重排成降序。N=1 时只给最强的那名（洛陽要出曹操，不是太守何進）。
 * 空城 / 未知城返回 `[]`。
 */
export function defendersOf(
  data: GameData,
  scenario: number,
  cityName: string,
  count = 3,
): Officer[] {
  try {
    const garrison = garrisonOf(data, scenario, cityName);
    if (!garrison) return [];
    const all = garrison.officers;
    const wanted = intOf(count, 3);
    const n = Math.max(0, Math.min(all.length, wanted));
    if (n === 0) return [];

    let picked = all.slice(0, n);
    const major = garrison.major;
    // 只叫 1 个人上阵时给最强的那个；N≥2 才留位置给太守（否则洛陽会派何進而不是曹操）
    if (n > 1 && major && !picked.some((o) => o.name === major)) {
      const chief = all.find((o) => o.name === major);
      // 太守必在城内（原作数据里 MAJOR 从不在城外），顶掉最弱的那名
      if (chief && picked.length > 0) {
        picked = sortOfficers([...picked.slice(0, n - 1), chief]);
      }
    }
    return picked;
  } catch {
    return [];
  }
}

/** `STR+INT` 最高的守将；`exclude` 里的名字跳过。空名单返回 `null`。 */
export function pickCommander(officers: Officer[], exclude?: string[]): Officer | null {
  try {
    if (!Array.isArray(officers)) return null;
    const banned = new Set<string>();
    if (Array.isArray(exclude)) {
      for (const name of exclude) banned.add(textOf(name));
    }
    let best: Officer | null = null;
    for (const raw of officers) {
      const officer = normalizeOfficer(raw);
      if (!officer || !officer.name || banned.has(officer.name)) continue;
      if (!best || officer.str + officer.int > best.str + best.int) best = officer;
    }
    return best;
  } catch {
    return null;
  }
}

/** 守将一行对应的 `generals.json` 行（按名查，401 条线性扫足够） */
function generalRowOf(data: GameData, name: string): General | undefined {
  const rows = data.generals;
  if (!Array.isArray(rows) || !name) return undefined;
  for (const row of rows) {
    if (row && typeof row === 'object' && textOf(row.NAME) === name) return row;
  }
  return undefined;
}

/** 原作确认"不存在"的映射，逐条列给调用方看（不是待办清单） */
const NO_MAPPING_FIELDS: string[] = [
  '武力/智力 → 兵种强度：原作无此换算；兵种强度 = 相克表 0x48CD88 + 地形表 0x48D030（04b5 §3.2）',
  '武力/智力 → 技力：原作无此换算；技力 = BaseMP + 等级成长 + 装备（0x40A098，04b5 §3.3）',
  '战力倍率：unit+0x70 五段全是加法，没有 STR/INT 乘数（04b5 §1.3）',
  '装备/武器/马匹的数值加成：generals.json 只有名字没有数值，未计入武力/智力（04c §3.2 说 +0x34/+0x36 才含装备）',
  '地形/阵形加成：查表得到（terrains.json / formations.json），与守将属性无关',
];

/**
 * 守将 → 战斗参数的纯函数（`project/31` 第 14 项"映射公式未定位"的收口）。
 *
 * 结论：原作**没有**"武力 → 兵种强度、智力 → 技力"的换算层（`docs/04b5` §3.1 [确认]）。
 * 这里只实现有地址的那几项，其余进 `unknown`。
 *
 * 等级（R84 定案）：走 `levels.ts` 的 `levelOf()` —— 运行时 `general.level`
 * （= `save.generalLevel[名]` / `?level=`）优先，否则 `startLevelOf()` 的起始等级 `[新设计]`。
 * **不再**用 `BaseEXP` 过经验表反推：`generals.json` 的 400 将 `BaseEXP` 全是 200，
 * 反推一律 Lv2 ⇒ 10 兵，出征滑杆只能拉到 10（R84 的头号卡点）。
 * `帶兵數` / `騎兵數` 也改成 `troopCapOf()` / `cavalryCapOf()`，与网页端同式。
 */
export function defenderBattleParams(officer: Pick<Officer, 'name' | 'str' | 'int'>, general?: General): DefenderBattleParams {
  const str = intOf(officer?.str);
  const int = intOf(officer?.int);
  const runtimeLevel = intOf(general?.level, 0);
  // R85：起始等级改由 `BaseEXP` 反推（原作 `0x42D38B→0x409F73→0x42D39D`，`project/133` §3），
  // 所以这里必须把武將行的 `BaseEXP` 一起交給 `levelOf()`，否则一律落到 200 的兜底值（Lv2）。
  const level = levelOf({ STR: str, INT: int, BaseEXP: intOf(general?.BaseEXP, 0) }, runtimeLevel);
  const levelBasis: DefenderBattleParams['levelBasis'] = runtimeLevel >= 1 ? 'exe' : 'start';

  const troopsMax = troopCapOf(level); // 0x409FB6
  const cavalryMax = cavalryCapOf(level); // 0x409FD8
  const baseHp = intOf(general?.BaseHP, 0);
  const baseMp = intOf(general?.BaseMP, 0);
  const hpMax = Math.max(baseHp, baseHp + Math.trunc((level * 2 * str) / 100)); // 0x40A020
  const t = str > int ? Math.trunc((str + int) / 2) : int; // 0x40A098 的 t
  const mpMax = Math.max(baseMp, baseMp + Math.trunc((level * 2 * t) / 100));
  const morale = 80; // TIMES 装载默认，0x42D468

  return {
    name: textOf(officer?.name),
    str,
    int,
    level,
    troopsMax,
    cavalryMax,
    soldiers: troopCapSumOf(level),
    hpMax: Math.min(hpMax, 0x7fff),
    mpMax: Math.min(mpMax, 0x7fff),
    hitVsSoldiers: 150 + Math.trunc(str / 2), // 0x43D4CB
    hitFromSoldiers: 150 - Math.trunc((str * 20) / 100), // 0x43D400
    powerBase: 150, // 0x43A3AD/0x43A3B7 硬编码
    morale,
    moraleTerm: Math.trunc((morale - 50) / 5), // 0x44302C，有符号除法向 0 截断
    levelBasis,
    unknown: [...NO_MAPPING_FIELDS],
  };
}

/** 将→将命中基准 `150 + trunc((武力a − 武力b)/2)`（`0x43D4CB` 的将→将分支） */
export function hitVsGeneral(attacker: Pick<DefenderBattleParams, 'str'>, otherStr: number): number {
  return 150 + Math.trunc((intOf(attacker?.str) - intOf(otherStr)) / 2);
}

/**
 * 守城战的敌方配置（给 `main.js` 的 `b` 侧用）。
 *
 * **原作口径**（默认 `troopMode: 'exe'`）：上阵兵数 = 守将 `帶兵數 + 騎兵數`
 * （`0x409FB6` / `0x409FD8`，`unit+0x58`）。城内"守军"（`garrison`）是**预备兵上限**
 * （`+0x82`），原作只在势力刷新时用它补将（`0x401910`），**不直接上战场**
 * （`docs/04b2` §4.2/§4.3）。
 *
 * 因此 `garrison/6` 只是旧网页的估计（根 `project/32` §5.2），保留成
 * `troopMode: 'reserve'` 供对照/回退，`enemyTroopsBasis` 会写明这次用的是哪条。
 */
export function battleSetup(
  data: GameData,
  scenario: number,
  cityName: string,
  soldiers: number,
  opts: { troopMode?: 'exe' | 'reserve' } = {},
): BattleSetup {
  try {
    const garrison = garrisonOf(data, scenario, cityName);
    const officers = garrison ? garrison.officers : [];
    const chief = pickCommander(officers);
    const row = chief ? generalRowOf(data, chief.name) : undefined;
    const params = chief ? defenderBattleParams(chief, row) : null;
    const mine = Math.max(1, Math.min(100, intOf(soldiers, 100) || 100));
    const total = garrison ? Math.max(0, intOf(garrison.garrison)) : 0;

    let enemyTroops: number;
    let basis: TroopBasis;
    if (opts.troopMode === 'reserve') {
      if (total > 0) {
        // 旧网页估算（[新设计]，根 project/32 §5.2）：守军/6 夹 60..100
        enemyTroops = Math.max(1, Math.min(100, Math.max(60, Math.round(total / 6)), total));
        basis = 'estimate:守軍/6';
      } else {
        enemyTroops = Math.max(1, Math.round(mine * 0.6));
        basis = 'estimate:我軍六成';
      }
    } else if (params) {
      // 原作：帶兵數 + 騎兵數（两栏相加，上夹 200 = 100 步 + 100 骑 = 士兵槽 `0xC8`，
      // `project/168` §4；常量见 levels.ts 的 `TROOP_COLUMNS_MAX`）
      enemyTroops = Math.max(1, Math.min(TROOP_COLUMNS_MAX, params.soldiers || 1));
      basis = params.levelBasis === 'exe' ? 'exe:帶兵數' : 'estimate:帶兵數@起始等級';
    } else {
      // 没有守将 = 空城，原作里不会发生守城战；沿用我军六成的兜底并写明来路
      enemyTroops = Math.max(1, Math.round(mine * 0.6));
      basis = 'estimate:我軍六成';
    }

    return {
      enemyGeneral: {
        name: chief?.name ?? '守將',
        str: chief?.str ?? 0,
        int: chief?.int ?? 0,
      },
      enemyTroops,
      enemyOfficers: defendersOf(data, scenario, cityName),
      enemyTroopsBasis: basis,
      enemyParams: params,
    };
  } catch {
    return {
      enemyGeneral: { name: '守將', str: 0, int: 0 },
      enemyTroops: 1,
      enemyOfficers: [],
      enemyTroopsBasis: 'estimate:我軍六成',
      enemyParams: null,
    };
  }
}
