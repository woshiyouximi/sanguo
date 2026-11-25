#!/usr/bin/env node
// work/data_audit/gen_generals_era.mjs
// 生成 / 校验 game/data/generals.json 的 5 个「时代字段」：
//   BattleArray_by_times / Force_by_times / UseForce_by_times / LoyalKing_by_times / Weapon_by_times
// 每项 5 个值，`[s]` = TIMES(s+1).INI 的该将取值（与 city_by_times/status_by_times/pos_by_times 同风格）。
//
// 数据源：extract/json/times1..5.json 的 generals[]（已由 extract 解析成规范字段名）。
// 对齐方式：**按 NAME 匹配，不用数组下标**（401/401 全命中才算成功，任何一个人对不上直接失败退出）。
//
// 用法：
//   node work/data_audit/gen_generals_era.mjs           # 写回 game/data/generals.json
//   node work/data_audit/gen_generals_era.mjs --check    # 只校验现有文件是否已是最新产物（CI/自证用）
//
// 约定（报告 project/167_武将时代字段.md 里写明）：
//   - 列表字段（BattleArray/Force/UseForce）每项保持**本作既有单值字段的类型** string[]；
//     原作的 UseForce 是单 token 字符串，这里拆成 `["刀"]`，与 generals.json 的 UseForce 同形，
//     这样 `row.UseForce_by_times[s] ?? row.UseForce` 的类型一致（读取方直接当数组用）。
//   - 标量字段（LoyalKing/Weapon）每项是 string（`""` = 无君主/空，原作缺键按空串处理）。
//   - 原字段（BattleArray/Force/UseForce/LoyalKing/Weapon）一个字节都不动，仍表示 TIMES1。
//   - 输出必须与 `JSON.stringify(rows, null, 1) + '\n'` 字节一致（generals.json 的既有格式）。
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OURS_REL = 'game/data/generals.json';
const timesRel = (n) => `extract/json/times${n}.json`;

/** [本作字段, times json 字段, 形状] */
const FIELDS = [
  ['BattleArray', 'battle_array', 'list'],
  ['Force', 'force', 'list'],
  ['UseForce', 'use_force', 'tokens'],
  ['LoyalKing', 'loyal_king', 'scalar'],
  ['Weapon', 'weapon', 'scalar'],
];
/** 401 将 × 5 剧本 */
const SCENARIOS = [1, 2, 3, 4, 5];

const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

/** 空格分隔串 → token 数组；已是数组就原样返回（浅拷贝） */
function splitTokens(v) {
  if (Array.isArray(v)) return v.slice();
  const s = String(v ?? '').trim();
  return s === '' ? [] : s.split(/\s+/);
}

/** times json 的值 → 本作字段形状 */
function shape(value, kind) {
  if (kind === 'list') return splitTokens(value);
  if (kind === 'tokens') return splitTokens(value);
  return String(value ?? '');
}

function build() {
  const ours = readJson(OURS_REL);
  if (!Array.isArray(ours) || ours.length !== 401) {
    throw new Error(`${OURS_REL} 应为 401 行数组，实际 ${Array.isArray(ours) ? ours.length : typeof ours}`);
  }
  const times = SCENARIOS.map((n) => readJson(timesRel(n)).generals);
  for (let s = 0; s < times.length; s++) {
    if (!Array.isArray(times[s]) || times[s].length !== 401) {
      throw new Error(`times${s + 1}.json 的 generals 应为 401 人，实际 ${times[s]?.length}`);
    }
  }
  // 按 NAME 建索引；同名重复直接失败（下标匹配会悄悄错位，这里宁可不写）
  const byName = times.map((list, s) => {
    const m = new Map();
    for (const rec of list) {
      if (!rec || typeof rec.name !== 'string' || rec.name === '') throw new Error(`times${s + 1} 有记录缺 name`);
      if (m.has(rec.name)) throw new Error(`times${s + 1} 的 name「${rec.name}」重复`);
      m.set(rec.name, rec);
    }
    return m;
  });
  const ourNames = new Set();
  for (const g of ours) {
    if (typeof g.NAME !== 'string' || g.NAME === '') throw new Error('generals.json 有行缺 NAME');
    if (ourNames.has(g.NAME)) throw new Error(`generals.json 的 NAME「${g.NAME}」重复`);
    ourNames.add(g.NAME);
  }

  let matched = 0;
  for (const g of ours) {
    for (const [ourKey, srcKey, kind] of FIELDS) {
      const values = [];
      for (let s = 0; s < SCENARIOS.length; s++) {
        const rec = byName[s].get(g.NAME);
        if (!rec) throw new Error(`times${s + 1}.json 里找不到「${g.NAME}」（按 NAME 匹配失败）`);
        values.push(shape(rec[srcKey], kind));
      }
      // 原字段保持不动：这里只写新键
      g[`${ourKey}_by_times`] = values;
    }
    matched++;
  }
  if (matched !== 401) throw new Error(`只匹配到 ${matched}/401 人`);

  // 独立核对：新字段每项必须等于 times json 的对应值（防止 shape() 写歪）
  let checked = 0;
  for (const g of ours) {
    for (let s = 0; s < SCENARIOS.length; s++) {
      for (const [ourKey, srcKey, kind] of FIELDS) {
        const want = shape(byName[s].get(g.NAME)[srcKey], kind);
        const got = g[`${ourKey}_by_times`][s];
        if (JSON.stringify(want) !== JSON.stringify(got)) {
          throw new Error(`核对失败 ${g.NAME} S${s + 1} ${ourKey}: 期望 ${JSON.stringify(want)} 实际 ${JSON.stringify(got)}`);
        }
        checked++;
      }
    }
  }
  return { ours, checked };
}

/** 时代变化统计：相对 S1 有差异的（将,字段）对数 / 格数 */
function stats(ours) {
  const out = {};
  for (const [ourKey] of FIELDS) {
    let pairs = 0;
    let cells = 0;
    for (const g of ours) {
      const vals = g[`${ourKey}_by_times`].map((v) => JSON.stringify(v));
      if (new Set(vals).size > 1) {
        pairs++;
        for (const v of vals) if (v !== vals[0]) cells++;
      }
    }
    out[ourKey] = { pairs, cells };
  }
  return out;
}

function main(argv) {
  const check = argv.includes('--check');
  const { ours, checked } = build();
  const text = `${JSON.stringify(ours, null, 1)}\n`;
  const target = path.join(ROOT, OURS_REL);
  const before = readFileSync(target, 'utf8');
  const changed = before !== text;

  const st = stats(ours);
  const totalPairs = Object.values(st).reduce((a, v) => a + v.pairs, 0);
  const totalCells = Object.values(st).reduce((a, v) => a + v.cells, 0);
  console.log(`${OURS_REL}: 401 将 × 5 剧本 × 5 字段 = ${checked} 个值已核对（按 NAME 匹配）`);
  for (const [k, v] of Object.entries(st)) console.log(`  ${k.padEnd(10)} 变化的武将 ${v.pairs} 人 / 相对 S1 不同 ${v.cells} 格`);
  console.log(`  合计 ${totalPairs} 个（将,字段）组合 / ${totalCells} 格与 S1 不同`);

  if (check) {
    console.log(changed ? '❌ 文件不是最新产物（请不带 --check 重跑）' : '✅ 文件已是最新产物');
    return changed ? 1 : 0;
  }
  if (!changed) {
    console.log('✅ 无变化（幂等）');
    return 0;
  }
  writeFileSync(target, text, 'utf8');
  console.log(`✅ 已写回 ${OURS_REL}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
