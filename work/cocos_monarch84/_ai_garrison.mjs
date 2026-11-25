// 等级 / 帶兵上限的唯一口径（R84）。注意这里有 import 环：
// garrison → levels → battle → strategy → garrison；两边都只在函数体内用，
// `tests/levels.test.ts` 有一条专门实跑确认没有 TDZ。
import { cavalryCapOf, levelOf, troopCapOf } from './levels';
/** 升到 `n` 级所需累计经验 `0x409EE0` [确认]（`docs/04b` §2.4） */
export function expForLevel(level) {
    const n = intOf(level, 1);
    if (n > 99)
        return 9999999;
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
export function levelFromExp(exp) {
    const e = Math.max(0, numOf(exp, 0));
    // 上界必须是 `i <= 99`：`expForLevel(99)` 才是"满级门槛"，只查到 98 会在
    // `[f(98), f(99))` 这段漏掉 98 级直接跳 99，与 `battle.ts` 的 `levelFromExp` 分叉。
    for (let i = 0; i <= 99; i++) {
        if (e < expForLevel(i))
            return Math.max(1, i - 1);
    }
    return 99;
}
// ---------------------------------------------------------------- 小工具
function textOf(value) {
    return typeof value === 'string' ? value : '';
}
function numOf(value, fallback = 0) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function intOf(value, fallback = 0) {
    return Math.trunc(numOf(value, fallback));
}
/** 剧本下标：负数 / NaN / 非数字一律 -1（调用方据此返回 null） */
function scenarioIndex(scenario) {
    const i = Math.trunc(numOf(scenario, -1));
    return i >= 0 ? i : -1;
}
/**
 * 武将排序：`STR+INT` 降序，同分按名字的码位升序。
 *
 * 用码位比较而不是 `localeCompare`：生成脚本是 Python，两边要给出**同一份顺序**
 * （兜底路径算出来的名单必须和 `garrison.json` 里的逐条一致）。
 */
function sortOfficers(list) {
    return list.sort((a, b) => {
        const d = b.str + b.int - (a.str + a.int);
        if (d !== 0)
            return d;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}
function normalizeOfficer(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const row = raw;
    return {
        name: textOf(row.name),
        str: intOf(row.str),
        int: intOf(row.int),
        loyal: intOf(row.loyal),
        status: textOf(row.status),
    };
}
function normalizeGarrison(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const row = raw;
    const officers = [];
    if (Array.isArray(row.officers)) {
        for (const item of row.officers) {
            const officer = normalizeOfficer(item);
            if (officer)
                officers.push(officer);
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
function tableOf(data) {
    const raw = data.garrison;
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === 'object') {
        const nested = raw.scenarios;
        if (Array.isArray(nested))
            return nested;
    }
    return null;
}
function bakedGarrison(data, index, cityName) {
    const table = tableOf(data);
    if (!table)
        return null;
    for (const entry of table) {
        if (!entry || typeof entry !== 'object')
            continue;
        if (intOf(entry.scenario, -1) !== index)
            continue;
        const cities = entry.cities;
        if (!cities || typeof cities !== 'object')
            continue;
        const hit = cities[cityName];
        const garrison = normalizeGarrison(hit);
        if (garrison)
            return garrison;
    }
    return null;
}
function cityRow(data, index, cityName) {
    const scenarios = data.scenarios;
    if (!Array.isArray(scenarios))
        return null;
    const cities = scenarios[index]?.cities;
    if (!Array.isArray(cities))
        return null;
    for (const item of cities) {
        if (!item || typeof item !== 'object')
            continue;
        const row = item;
        if (textOf(row.NAME) === cityName)
            return row;
    }
    return null;
}
/** 旧数据兜底：直接扫 `generals.json`，按 `city_by_times[index]` 收人 */
function officersFromGenerals(data, index, cityName) {
    const rows = data.generals;
    if (!Array.isArray(rows))
        return [];
    const out = [];
    for (const general of rows) {
        if (!general || typeof general !== 'object')
            continue;
        const row = general;
        const cities = row.city_by_times;
        // 极老的存档只有第 1 剧本的冗余字段 CITY / Status
        const city = Array.isArray(cities) ? textOf(cities[index]) : (index === 0 ? textOf(row.CITY) : '');
        if (city !== cityName)
            continue;
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
function computeGarrison(data, index, cityName) {
    const row = cityRow(data, index, cityName);
    if (!row)
        return null;
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
export function garrisonOf(data, scenario, cityName) {
    try {
        if (!data || typeof data !== 'object')
            return null;
        const index = scenarioIndex(scenario);
        if (index < 0)
            return null;
        const name = textOf(cityName);
        if (!name)
            return null;
        const d = data;
        const baked = bakedGarrison(d, index, name);
        const computed = computeGarrison(d, index, name);
        if (!baked)
            return computed;
        if (!computed)
            return baked;
        return {
            owner: computed.owner || baked.owner,
            major: computed.major || baked.major,
            wise: computed.wise || baked.wise,
            officers: baked.officers.length ? baked.officers : computed.officers,
            garrison: baked.garrison > 0 ? baked.garrison : computed.garrison,
        };
    }
    catch {
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
export function defendersOf(data, scenario, cityName, count = 3) {
    try {
        const garrison = garrisonOf(data, scenario, cityName);
        if (!garrison)
            return [];
        const all = garrison.officers;
        const wanted = intOf(count, 3);
        const n = Math.max(0, Math.min(all.length, wanted));
        if (n === 0)
            return [];
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
    }
    catch {
        return [];
    }
}
/** `STR+INT` 最高的守将；`exclude` 里的名字跳过。空名单返回 `null`。 */
export function pickCommander(officers, exclude) {
    try {
        if (!Array.isArray(officers))
            return null;
        const banned = new Set();
        if (Array.isArray(exclude)) {
            for (const name of exclude)
                banned.add(textOf(name));
        }
        let best = null;
        for (const raw of officers) {
            const officer = normalizeOfficer(raw);
            if (!officer || !officer.name || banned.has(officer.name))
                continue;
            if (!best || officer.str + officer.int > best.str + best.int)
                best = officer;
        }
        return best;
    }
    catch {
        return null;
    }
}
/** 守将一行对应的 `generals.json` 行（按名查，401 条线性扫足够） */
function generalRowOf(data, name) {
    const rows = data.generals;
    if (!Array.isArray(rows) || !name)
        return undefined;
    for (const row of rows) {
        if (row && typeof row === 'object' && textOf(row.NAME) === name)
            return row;
    }
    return undefined;
}
/** 原作确认"不存在"的映射，逐条列给调用方看（不是待办清单） */
const NO_MAPPING_FIELDS = [
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
export function defenderBattleParams(officer, general) {
    const str = intOf(officer?.str);
    const int = intOf(officer?.int);
    const runtimeLevel = intOf(general?.level, 0);
    const level = levelOf({ STR: str, INT: int }, runtimeLevel);
    const levelBasis = runtimeLevel >= 1 ? 'exe' : 'start';
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
        soldiers: troopsMax + cavalryMax,
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
export function hitVsGeneral(attacker, otherStr) {
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
export function battleSetup(data, scenario, cityName, soldiers, opts = {}) {
    try {
        const garrison = garrisonOf(data, scenario, cityName);
        const officers = garrison ? garrison.officers : [];
        const chief = pickCommander(officers);
        const row = chief ? generalRowOf(data, chief.name) : undefined;
        const params = chief ? defenderBattleParams(chief, row) : null;
        const mine = Math.max(1, Math.min(100, intOf(soldiers, 100) || 100));
        const total = garrison ? Math.max(0, intOf(garrison.garrison)) : 0;
        let enemyTroops;
        let basis;
        if (opts.troopMode === 'reserve') {
            if (total > 0) {
                // 旧网页估算（[新设计]，根 project/32 §5.2）：守军/6 夹 60..100
                enemyTroops = Math.max(1, Math.min(100, Math.max(60, Math.round(total / 6)), total));
                basis = 'estimate:守軍/6';
            }
            else {
                enemyTroops = Math.max(1, Math.round(mine * 0.6));
                basis = 'estimate:我軍六成';
            }
        }
        else if (params) {
            // 原作：帶兵數 + 騎兵數（上限 200 = 100 步 + 100 骑，04b1 站位表 N 最大 200）
            enemyTroops = Math.max(1, Math.min(200, params.soldiers || 1));
            basis = params.levelBasis === 'exe' ? 'exe:帶兵數' : 'estimate:帶兵數@起始等級';
        }
        else {
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
    }
    catch {
        return {
            enemyGeneral: { name: '守將', str: 0, int: 0 },
            enemyTroops: 1,
            enemyOfficers: [],
            enemyTroopsBasis: 'estimate:我軍六成',
            enemyParams: null,
        };
    }
}
