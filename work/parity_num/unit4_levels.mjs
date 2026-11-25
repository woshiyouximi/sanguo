/**
 * unit4_levels.mjs — 等级与带兵对拍：web `game/src/core/levels.ts` vs Cocos `assets/scripts/core/levels.ts`
 *
 * 覆盖：
 *   A. 400 将（game/data/generals.json[1..400]）逐将：levelOf / startLevelOf / troopCapOf / cavalryCapOf
 *   B. 边界 SUM(STR+INT) = 0 / 184 / 760 / 9999（+ 若干中间值）
 *   C. override 边界 0 / 1 / 99 / 负数 / 小数 / NaN / '' / '42' / 100 / 9999
 *   D. troopCapOf / cavalryCapOf 直接入参扫描 0..99 + 越界 + 非数
 *   E. 常量表逐项
 *   F. 转出量 levelFromExp 抽样
 */
import {
  compile, loadCjs, loadSimEsm, readJson, diffDeep, makeResult, ser,
} from './build_sim.mjs';

const WEB_ENTRY = 'web/core/levels.js';
const COC_ENTRY = 'cocos/core/levels.js';

const CONST_NAMES = [
  'START_LEVEL_MIN', 'START_LEVEL_MAX', 'START_LEVEL_DIV',
  'LEVEL_MIN', 'LEVEL_MAX',
  'TROOP_PER_LEVEL', 'TROOP_CAP_MAX',
  'CAVALRY_LV_BASE', 'CAVALRY_PER_LEVEL', 'CAVALRY_CAP_MAX',
];

/** 直接入参扫描用的值（含 0/越界/非数/字符串） */
const RAW_LEVELS = [
  undefined, null, 0, 1, 2, 5, 6, 7, 19, 20, 21, 30, 40, 50, 60, 66, 79, 80, 98, 99, 100, 101, 999, 9999,
  -1, -20, 1.5, 19.9, 20.5, 99.9, NaN, Infinity, -Infinity, '', ' ' + '20', '42', '99', '100', 'abc', true, false,
];

const OVERRIDES = [
  undefined, null, 0, -1, -99, 1, 6, 20, 99, 100, 9999, 0.9, 1.5, 99.9, NaN, Infinity, '', ' ', '42', '99', 'abc', true, false,
];

/** SUM(STR+INT) 边界表 */
const SUM_ROWS = [
  { tag: 'sum 0 (0+0)', STR: 0, INT: 0 },
  { tag: 'sum 0 (缺字段)', STR: undefined, INT: undefined },
  { tag: 'sum 184 (99+85)', STR: 99, INT: 85 },
  { tag: 'sum 184 (小写 str/int)', str: 99, int: 85 },
  { tag: 'sum 760 (380+380)', STR: 380, INT: 380 },
  { tag: 'sum 760 (400+360)', STR: 400, INT: 360 },
  { tag: 'sum 9999 (5000+4999)', STR: 5000, INT: 4999 },
  { tag: 'sum 9999 (9999+0)', STR: 9999, INT: 0 },
  { tag: 'sum 239 → 6', STR: 120, INT: 119 },
  { tag: 'sum 240 → 7', STR: 120, INT: 120 },
  { tag: 'sum 758 → 19', STR: 379, INT: 379 },
  { tag: 'sum 759 → 19', STR: 379, INT: 380 },
  { tag: 'sum 760 → 20', STR: 380, INT: 380 },
  { tag: '字符串数字', STR: '99', INT: '85' },
  { tag: '非数', STR: 'abc', INT: null },
  { tag: '负数', STR: -50, INT: 10 },
  { tag: '小数', STR: 99.9, INT: 85.9 },
];

function snapLevels(M, gen, override) {
  const lv = M.levelOf(gen, override);
  return {
    levelOf: lv,
    startLevelOf: M.startLevelOf(gen),
    troopCapOf_levelOf: M.troopCapOf(lv),
    cavalryCapOf_levelOf: M.cavalryCapOf(lv),
  };
}

export async function run({ negative = false } = {}) {
  compile('tsconfig.cocos.json');
  compile('tsconfig.web.json');
  const WEB = await loadSimEsm(WEB_ENTRY);
  const COC = loadCjs(COC_ENTRY);

  if (negative) {
    const before = COC.TROOP_PER_LEVEL;
    COC.TROOP_PER_LEVEL = before + 1;
    // 记在闭包外，供最后打印
    run._neg = `把 Cocos 侧 TROOP_PER_LEVEL 由 ${before} 改成 ${COC.TROOP_PER_LEVEL}（web 仍为 ${WEB.TROOP_PER_LEVEL}）`;
  }

  const gens = readJson('game/data/generals.json');
  const res = makeResult('unit4-levels', `400 将 + 边界表 + ${OVERRIDES.length} 组 override + ${RAW_LEVELS.length} 组直接入参`);
  const seen = new Set();

  const add = (tag, web, coc) => {
    res.cases += 1;
    const box = diffDeep(web, coc);
    res.fields += box.fields;
    if (!box.misses.length) return 0;
    res.missesCount = (res.missesCount ?? 0) + box.misses.length;
    for (const m of box.misses) {
      const k = `${tag.split(' ')[0]}:${m.path}`;
      if (seen.has(k) || res.misses.length >= 24) continue;
      seen.add(k);
      res.misses.push({ path: `${tag} ${m.path}`, web: m.web, cocos: m.cocos });
    }
    return box.misses.length;
  };

  // A. 400 将
  const pool = gens.slice(1);
  res.notes.push(`generals.json 共 ${gens.length} 项，取 [1..${gens.length - 1}] 共 ${pool.length} 将`);
  for (const g of pool) add(`将 ${g.NAME ?? g.name}`, snapLevels(WEB, g), snapLevels(COC, g));

  // A2. 400 将 × 每个 override 边界（只比 levelOf，避免刷爆条目）
  for (const ov of OVERRIDES) {
    for (const tag of ['将 關羽', '将 呂布', '将 張飛']) {
      const g = pool.find((x) => (x.NAME ?? x.name) === tag.slice(2));
      if (!g) continue;
      add(`override ${ser(ov)} @${tag.slice(2)}`, { levelOf: WEB.levelOf(g, ov) }, { levelOf: COC.levelOf(g, ov) });
    }
  }

  // B. SUM 边界
  for (const row of SUM_ROWS) {
    const { tag, ...gen } = row;
    add(tag, { ...snapLevels(WEB, gen), ...snapLevels(WEB, gen, 0) }, { ...snapLevels(COC, gen), ...snapLevels(COC, gen, 0) });
  }

  // C. override 全表（固定将一个 400 将池里的普通将 + 一个带 level 字段的行）
  const withLevel = { NAME: '合成·带 level', STR: 50, INT: 50, level: 33 };
  for (const ov of OVERRIDES) {
    add(`override ${ser(ov)} @无level`, { levelOf: WEB.levelOf({ STR: 50, INT: 50 }, ov) }, { levelOf: COC.levelOf({ STR: 50, INT: 50 }, ov) });
    add(`override ${ser(ov)} @gen.level=33`, { levelOf: WEB.levelOf(withLevel, ov) }, { levelOf: COC.levelOf(withLevel, ov) });
  }
  // gen.level 自身边界（override 不传 → 落到 gen.level）
  for (const lv of RAW_LEVELS) {
    const row = { STR: 50, INT: 50, level: lv };
    add(`gen.level ${ser(lv)}`, { levelOf: WEB.levelOf(row) }, { levelOf: COC.levelOf(row) });
  }

  // D. 直接入参
  for (const lv of RAW_LEVELS) {
    add(`troopCapOf(${ser(lv)})`, { troopCapOf: WEB.troopCapOf(lv) }, { troopCapOf: COC.troopCapOf(lv) });
    add(`cavalryCapOf(${ser(lv)})`, { cavalryCapOf: WEB.cavalryCapOf(lv) }, { cavalryCapOf: COC.cavalryCapOf(lv) });
  }

  // E. 常量表
  const wc = {}; const cc = {};
  for (const n of CONST_NAMES) { wc[n] = WEB[n]; cc[n] = COC[n]; }
  add('常量表', wc, cc);

  // F. 转出的 levelFromExp
  const expSamples = [0, 1, 119, 120, 200, 662, 6629, 66292, 662921, 1000000];
  for (const e of expSamples) add(`levelFromExp(${e})`, { v: WEB.levelFromExp(e) }, { v: COC.levelFromExp(e) });

  res.notes.push(`常量：${CONST_NAMES.map((n) => `${n}=${WEB[n]}`).join(' ')}`);

  if (negative) {
    res.notes.push(`阴性对照：${run._neg}`);
    res.notes.push(`阴性对照结论：${(res.missesCount ?? 0) > 0 ? 'RED（按预期转红）' : 'GREEN —— 对拍恒真，无效！'}`);
    res.extra.negativeRed = (res.missesCount ?? 0) > 0;
  }
  res.missesCount = res.missesCount ?? 0;
  return res;
}

if (process.argv[1]?.endsWith('unit4_levels.mjs')) {
  const { report } = await import('./build_sim.mjs');
  const negative = process.argv.includes('--negative');
  const r = await run({ negative });
  report(r, { show: 20 });
  process.exitCode = negative ? (r.extra.negativeRed ? 0 : 1) : (r.missesCount === 0 ? 0 : 1);
}
