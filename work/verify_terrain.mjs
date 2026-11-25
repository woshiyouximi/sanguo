/**
 * 地形 × 兵种相克表校验（`docs/04b_战斗系统.md` §3.2，EXE VA `0x0048D030`）。
 *
 * 跑法（在 F:\sanguo 下）：
 *   node work/verify_terrain.mjs            # 校验 game/data/terrains.json
 *   node work/verify_terrain.mjs --patch    # 一次性把下表写进 JSON（之后仍要跑一次纯校验）
 *
 * 表的口径：行 = 地形 id 0..11，列 = 兵种 0..12
 * （0 朴刀 / 1 長槍 / 2 大刀 / 3 弓箭 / 4 鏈錘 / 5 飛刀 / 6 武鬥 / 7 蠻族 /
 *   8 鐵鎚 / 9 藤甲 / 10 黃巾 / 11 弩兵 / 12 女兵）。
 * 下面这份是 §3.2 的原表硬编码，用来和 JSON 里的 `vs` 逐格比对 —— 抄错一格就报错。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'game', 'data', 'terrains.json');

/** docs/04b §3.2 12×13 地形×兵种表（行=地形，列=兵种，单位=战力点） */
const EXPECTED = [
  [0, 0, 0, 10, 0, 0, 0, -8, 0, -5, 0, 0, 0], // 0 平地类
  [0, 0, 0, 10, 0, 0, 0, -8, 0, -5, 0, 0, 0], // 1 平地类
  [0, 0, 0, 10, 0, 0, 0, -8, 0, -5, 0, 0, 0], // 2 平地类
  [0, -2, -5, 25, -5, 15, 5, -24, -5, 0, 0, 10, 6], // 3 森林类
  [2, 15, 13, 4, 9, 6, -6, 12, 13, -5, 6, 3, 5], // 4
  [3, 13, 12, 5, 10, 6, -9, 7, 12, -4, 5, 3, 5], // 5
  [7, -8, -3, -15, -5, -11, 4, 12, -6, 13, 7, -5, -11], // 6
  [5, -4, -3, -25, -10, -12, 4, 10, -9, 11, 14, -10, -13], // 7
  [-14, -7, -6, -21, 11, -11, -18, 14, 6, 24, -10, -8, 12], // 8
  [-8, -6, -7, -5, -10, -5, 12, -15, -10, -25, -14, -5, -12], // 9
  [3, 0, 0, 10, 0, 7, 4, 0, 0, 0, 2, 5, 7], // 10
  [0, 0, 0, 12, 0, 5, 2, -9, 0, -9, -9, 7, 0], // 11
];

const TROOP_NAMES = [
  '朴刀', '長槍', '大刀', '弓箭', '鏈錘', '飛刀', '武鬥',
  '蠻族', '鐵鎚', '藤甲', '黃巾', '弩兵', '女兵',
];

const rows = JSON.parse(readFileSync(JSON_PATH, 'utf8'));

if (process.argv.includes('--patch')) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED.length) {
    throw new Error(`terrains.json 不是 ${EXPECTED.length} 条地形数组（实际 ${Array.isArray(rows) ? rows.length : typeof rows}）`);
  }
  EXPECTED.forEach((vs, i) => {
    rows[i].vs = vs.slice();
  });
  writeFileSync(JSON_PATH, `${JSON.stringify(rows, null, 1)}\n`, 'utf8');
  console.log(`已把 ${EXPECTED.length}×${EXPECTED[0].length} 地形表写入 ${JSON_PATH}`);
}

let bad = 0;
const fail = (msg) => {
  bad++;
  console.log(`✗ ${msg}`);
};

if (!Array.isArray(rows)) {
  console.log('✗ terrains.json 顶层必须是数组');
  process.exit(1);
}
if (rows.length !== EXPECTED.length) {
  fail(`地形条数 ${rows.length} != ${EXPECTED.length}`);
}

// 逐格比对 12×13（比三条点名检查更严：任何一格抄错都会被抓到）
for (let t = 0; t < EXPECTED.length; t++) {
  const vs = rows[t]?.vs;
  if (!Array.isArray(vs)) {
    fail(`地形 ${t}（${rows[t]?.Name ?? '?'}）缺 vs 数组`);
    continue;
  }
  if (vs.length !== EXPECTED[t].length) {
    fail(`地形 ${t} 列数 ${vs.length} != ${EXPECTED[t].length}`);
    continue;
  }
  for (let c = 0; c < vs.length; c++) {
    if (vs[c] !== EXPECTED[t][c]) {
      fail(`地形 ${t} × ${TROOP_NAMES[c]}（列 ${c}）= ${vs[c]}，应为 ${EXPECTED[t][c]}`);
    }
  }
}

// 三条点名检查（验收要求的三行输出）
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
if (same(rows[0]?.vs ?? [], rows[1]?.vs ?? []) && same(rows[1]?.vs ?? [], rows[2]?.vs ?? [])) {
  console.log('行 0/1/2 一致 ✓');
} else {
  fail('行 0/1/2 应完全相同（平地类）');
}

if (rows[3]?.vs?.[3] === 25) console.log('森林弓箭 +25 ✓');
else fail(`地形 3 × 弓箭 应为 +25，实际 ${rows[3]?.vs?.[3]}`);

if (rows[3]?.vs?.[7] === -24) console.log('森林蠻族 −24 ✓');
else fail(`地形 3 × 蠻族 应为 −24，实际 ${rows[3]?.vs?.[7]}`);

if (bad > 0) {
  console.log(`\n共 ${bad} 处不符 ✗`);
  process.exit(1);
}
console.log('\n12×13 地形表逐格核对通过 ✓');
