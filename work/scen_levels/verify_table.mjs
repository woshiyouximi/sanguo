#!/usr/bin/env node
/**
 * 校验 game/data/levels_by_scenario.json（每剧本 × 每武将的 BaseEXP / 起始等级）
 *
 * 用法： node F:\sanguo\work\scen_levels\verify_table.mjs
 * 退出码：0 = 全部通过；1 = 任一 FAIL
 *
 * 三项必查（用户验收项）：
 *   ① 5 个剧本的等级直方图
 *   ② 与 project/133 §3.3 的 Lv2/2/4/6/8 结论逐条对齐
 *   ③ 名字交集校验（表内名字 ⊆ generals.json 的 NAME；反向统计 generals 里没进表的将）
 * 另加的自检：字段形状 / 等级按 expToReach 重算 / deployed 与 generals.json 的
 *   status_by_times 独立对拍 / levels 内是否有重复键 / 与 battle.ts 的公式同源核对。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..'); // F:\sanguo
const TABLE = path.join(ROOT, 'game', 'data', 'levels_by_scenario.json');
const GENS = path.join(ROOT, 'game', 'data', 'generals.json');
const SCEN = path.join(ROOT, 'game', 'data', 'scenarios.json');
const BATTLE = path.join(ROOT, 'game', 'src', 'core', 'battle.ts');

const fails = [];
const passes = [];
function check(label, cond, detail) {
  if (cond) {
    passes.push(label);
    console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`);
  } else {
    fails.push(label);
    console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`);
  }
  return cond;
}
/** 控制台表格用：CJK 字符按 2 列宽算，避免列错位 */
const cw = (s) => [...String(s)].reduce((n, c) => n + (c.codePointAt(0) > 0x2e7f ? 2 : 1), 0);
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - cw(s)));
const padS = (s, w) => ' '.repeat(Math.max(0, w - cw(s))) + String(s);

function head(t) {
  console.log('');
  console.log('='.repeat(92));
  console.log(t);
  console.log('='.repeat(92));
}

/* ---------------------------------------------------------------- 原作门槛表 */
/** game/src/core/battle.ts:2163 expToReach —— 原作 0x409EE0，逐字一致 */
export function expToReach(n) {
  if (n <= 1) return 0;
  return (((n - 1) * 137 - 34) * n) / 2 + 17;
}
/** game/src/core/battle.ts:2168 levelFromExp —— 原作 0x409F73 */
function levelFromExp(exp) {
  let n = 1;
  while (n < 99 && exp >= expToReach(n + 1)) n++;
  return n;
}

/* ---------------------------------------------------------------- 载入 */
for (const p of [TABLE, GENS, SCEN]) {
  if (!fs.existsSync(p)) {
    console.error('缺少文件：' + p);
    process.exit(1);
  }
}
const rawTable = fs.readFileSync(TABLE, 'utf8');
const table = JSON.parse(rawTable);
const generals = JSON.parse(fs.readFileSync(GENS, 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(SCEN, 'utf8'));
const genNames = generals.map((g) => g.NAME);

head('0. 表文件基本信息');
const bytes = fs.statSync(TABLE).size;
console.log(`  文件      : ${TABLE}`);
console.log(`  字节数    : ${bytes}`);
console.log(`  行数      : ${rawTable.split('\n').length}`);
console.log(`  schema    : ${table.schema}   source: ${table.source}`);
console.log(`  expToLevel: ${table.expToLevel}   levelFromExp: ${table.levelFromExp}`);
console.log(`  剧本条数  : ${table.scenarios.length}`);
check('schema === 1', table.schema === 1, `实际 ${table.schema}`);
check('scenarios 恰好 5 条', table.scenarios.length === 5, `实际 ${table.scenarios.length}`);
check('source === "TIMES"', table.source === 'TIMES', String(table.source));

head('1. 五个剧本的等级直方图（只统计该剧本登场武将 deployed=true）');
console.log(
  '  ' +
    pad('剧本', 12) +
    padS('id', 3) +
    padS('年份', 7) +
    pad(' 文件', 14) +
    padS('统一BaseEXP', 12) +
    padS('默认等级', 9) +
    padS('将', 5) +
    padS('登场', 6) +
    padS('未登场', 8) +
    '  登场等级直方图'
);
for (const sc of table.scenarios) {
  const lv = Object.keys(sc.levels).map((k) => sc.levels[k]);
  const dep = lv.filter((v) => v.deployed);
  const hist = {};
  for (const v of dep) hist[v.level] = (hist[v.level] || 0) + 1;
  const histStr = Object.keys(hist)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => `Lv${k}×${hist[k]}`)
    .join('  ');
  console.log(
    '  ' +
      pad(sc.name, 12) +
      padS(sc.id, 3) +
      padS(sc.year, 7) +
      pad(sc.file, 14) +
      padS(sc.baseExpCommon, 12) +
      padS('Lv' + sc.defaultLevel, 9) +
      padS(sc.counts.total, 5) +
      padS(sc.counts.deployed, 6) +
      padS(sc.counts.absent, 8) +
      '  ' +
      histStr
  );
}

head('2. 与 project/133 §3.3 的结论逐条对齐（Lv2 / 2 / 4 / 6 / 8）');
const EXPECT = [
  { name: '黃巾之亂', year: 184, baseExp: 200, level: 2, note: '400 将 = 200；盜賊 = 9999 → Lv12' },
  { name: '討伐董卓', year: 189, baseExp: 200, level: 2, note: '400 将 = 200' },
  { name: '群雄割據', year: 200, baseExp: 800, level: 4, note: '400 将 = 800（771 ≤ 800 < 1302）' },
  { name: '赤壁之戰', year: 208, baseExp: 2000, level: 6, note: '400 将 = 2000（1970 ≤ 2000 < 2775）' },
  { name: '三國鼎立', year: 219, baseExp: 3800, level: 8, note: '400 将 = 3800（3717 ≤ 3800 < 4796）' },
];
console.log(
  '  ' +
    pad('剧本', 12) +
    pad('133 期望', 26) +
    pad('表内 400 将实际', 26) +
    pad('表内 盜賊实际', 24) +
    '结论'
);
EXPECT.forEach((e, i) => {
  const sc = table.scenarios[i];
  const rows = Object.entries(sc.levels);
  const thief = sc.levels['盜賊'];
  const others = rows.filter(([n]) => n !== '盜賊').map(([, v]) => v);
  const expSet = [...new Set(others.map((v) => v.baseExp))].sort((a, b) => a - b);
  const lvSet = [...new Set(others.map((v) => v.level))].sort((a, b) => a - b);
  const act = `exp ${expSet.join('/')} -> Lv ${lvSet.join('/')}`;
  const thiefAct = thief ? `exp ${thief.baseExp} -> Lv ${thief.level}` : '(表里没有盜賊)';
  const okName = sc.name === e.name;
  const okYear = Number(sc.year) === e.year;
  const okExp = expSet.length === 1 && expSet[0] === e.baseExp;
  const okLv = lvSet.length === 1 && lvSet[0] === e.level;
  const okThief = !!thief && thief.baseExp === 9999 && thief.level === 12;
  const okCount = others.length === 400;
  const ok = okName && okYear && okExp && okLv && okThief && okCount;
  console.log(
    '  ' +
      pad(e.name, 12) +
      pad(`年${e.year} exp${e.baseExp} -> Lv${e.level}`, 26) +
      pad(act, 26) +
      pad(thiefAct, 24) +
      (ok ? 'PASS' : 'FAIL')
  );
  console.log(`        备注：${e.note}`);
  check(`133 §3.3 对齐：${e.name}（年 ${e.year}）`, ok,
    `名字=${okName} 年=${okYear} 400将exp=${okExp}(${expSet}) 400将Lv=${okLv}(${lvSet}) ` +
    `盜賊=${okThief} 非盜賊条数=${others.length}`);
  check(`  默认等级 = Lv${e.level} 且 expToReach 复核一致`, sc.defaultLevel === e.level &&
    levelFromExp(e.baseExp) === e.level, `defaultLevel=${sc.defaultLevel} levelFromExp(${e.baseExp})=${levelFromExp(e.baseExp)}`);
});

head('3. 名字交集校验（表 ↔ generals.json）');
const genSet = new Set(genNames);
let badTotal = 0;
const tableUnion = new Set();
for (const sc of table.scenarios) {
  const names = Object.keys(sc.levels);
  names.forEach((n) => tableUnion.add(n));
  const notInGen = names.filter((n) => !genSet.has(n));
  const genNotInTable = genNames.filter((n) => !(n in sc.levels));
  badTotal += notInGen.length + genNotInTable.length;
  console.log(
    `  ${pad(sc.name, 12)} 表内 ${padS(names.length, 3)} 名  ` +
      `generals 里找不到 ${notInGen.length}  ` +
      `generals 有但表里没有 ${genNotInTable.length}  ` +
      `${notInGen.length === 0 && genNotInTable.length === 0 ? '-> 完全对齐' : '-> ' + JSON.stringify({ notInGen, genNotInTable })}`
  );
  check(`名字交集：${sc.name}`, notInGen.length === 0 && genNotInTable.length === 0,
    `表外名=${notInGen.length} 漏将=${genNotInTable.length}`);
}
const genNotInAnyTable = genNames.filter((n) => !tableUnion.has(n));
console.log(`  表内名字并集 = ${tableUnion.size} / generals.json = ${genNames.length}`);
console.log(`  generals.json 里有多少将完全没进表：${genNotInAnyTable.length}  ${JSON.stringify(genNotInAnyTable.slice(0, 20))}`);
console.log(`  表里有多少名字在 generals.json 找不到：${[...tableUnion].filter((n) => !genSet.has(n)).length}`);
check('generals.json 全部 401 将都进了表（无遗漏）', genNotInAnyTable.length === 0, `漏 ${genNotInAnyTable.length}`);
check('表内无 generals.json 之外的名字', [...tableUnion].every((n) => genSet.has(n)));

head('4. 附加自检：字段形状 / 等级重算 / deployed 与 generals.json 对拍 / 重复键');
// 4.1 字段形状
let shapeBad = [];
for (const sc of table.scenarios) {
  for (const [n, v] of Object.entries(sc.levels)) {
    const keys = Object.keys(v).sort().join(',');
    if (keys !== 'baseExp,deployed,level') shapeBad.push(`${sc.name}/${n}: keys=${keys}`);
    if (typeof v.baseExp !== 'number' || typeof v.level !== 'number' || typeof v.deployed !== 'boolean')
      shapeBad.push(`${sc.name}/${n}: types`);
  }
}
check('每个 levels 条目形状 = {baseExp:number, level:number, deployed:boolean}', shapeBad.length === 0, shapeBad.slice(0, 5).join(' | '));

// 4.2 等级重算
const lvBad = [];
for (const sc of table.scenarios) {
  for (const [n, v] of Object.entries(sc.levels)) {
    const want = levelFromExp(v.baseExp);
    if (v.level !== want) lvBad.push(`${sc.name}/${n}: exp=${v.baseExp} 表=${v.level} 算=${want}`);
  }
}
check('全部 2005 条的 level 都能由 baseExp 用 expToReach 重算出来', lvBad.length === 0, lvBad.slice(0, 5).join(' | '));

// 4.3 deployed 与 generals.json 的 status_by_times 独立对拍
let depBad = [];
for (const sc of table.scenarios) {
  const i = sc.index;
  for (const g of generals) {
    const st = (g.status_by_times || [])[i];
    const wantDep = !!st && st !== '未';
    const got = sc.levels[g.NAME]?.deployed;
    if (got !== wantDep) depBad.push(`${sc.name}/${g.NAME}: 表=${got} status_by_times=${JSON.stringify(st)}`);
  }
}
check('deployed 与 generals.json.status_by_times[index] !== "未" 逐将一致', depBad.length === 0, depBad.slice(0, 5).join(' | '));

// 4.4 重复键（JSON.parse 会静默去重，故按原文数行）
const rawLevelsBlocks = rawTable.split('"levels": {').slice(1);
const dupBad = [];
rawLevelsBlocks.forEach((blk, i) => {
  const body = blk.split('\n      }')[0];
  const lineCount = body.split('\n').filter((ln) => /^ {8}"/.test(ln)).length;
  const keyCount = Object.keys(table.scenarios[i].levels).length;
  if (lineCount !== keyCount) dupBad.push(`${table.scenarios[i].name}: 原文 ${lineCount} 行 vs 解析 ${keyCount} 键`);
});
check('levels 内无重复键（原文行数 = 解析键数）', dupBad.length === 0, dupBad.join(' | '));

// 4.5 与 battle.ts 的公式同源
if (fs.existsSync(BATTLE)) {
  const ts = fs.readFileSync(BATTLE, 'utf8');
  const hasExp = /export function expToReach\(n: number\): number \{\s*if \(n <= 1\) return 0;\s*return \(\(\(n - 1\) \* 137 - 34\) \* n\) \/ 2 \+ 17;/.test(ts);
  const hasLv = /export function levelFromExp\(exp: number\): number \{\s*let n = 1;\s*while \(n < 99 && exp >= expToReach\(n \+ 1\)\) n\+\+;\s*return n;/.test(ts);
  check('game/src/core/battle.ts 的 expToReach / levelFromExp 与本脚本同式（= 原作 0x409EE0 / 0x409F73）',
    hasExp && hasLv, `expToReach=${hasExp} levelFromExp=${hasLv}`);
} else {
  check('找到 game/src/core/battle.ts', false, BATTLE);
}

// 4.6 剧本 name/year 与 scenarios.json 一致
const scenBad = [];
table.scenarios.forEach((sc, i) => {
  const s = scenarios[i] || {};
  const t = (s.system || {}).TIME;
  if (sc.name !== t || Number(sc.year) !== Number((s.system || {}).YEAR)) scenBad.push(`${i}: 表=${sc.name}/${sc.year} 项目=${t}/${(s.system || {}).YEAR}`);
  if (sc.id !== s.id) scenBad.push(`${i}: id 表=${sc.id} 项目=${s.id}`);
});
check('剧本 name / year / id 与 scenarios.json 逐条一致', scenBad.length === 0, scenBad.join(' | '));

/* ---------------------------------------------------------------- 汇总 */
head('汇总');
console.log(`  PASS ${passes.length}   FAIL ${fails.length}`);
if (fails.length) {
  console.log('');
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
  console.log('结论：FAIL —— 表与真值/项目数据不一致，见上。');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('结论：PASS —— 5 个剧本等级 = Lv2 / Lv2 / Lv4 / Lv6 / Lv8，与 project/133 §3.3 一致；');
  console.log('      401 将名字全部匹配，无遗漏、无重复键，等级可由 baseExp 独立重算。');
  console.log(`      表文件 ${bytes} 字节。`);
  process.exitCode = 0;
}
