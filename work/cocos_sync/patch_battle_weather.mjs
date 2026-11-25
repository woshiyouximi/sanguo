#!/usr/bin/env node
/**
 * 给 Cocos 的 `core/battle.ts` 打「天气」补丁（C7 的一部分）。
 *
 * 为什么要用脚本而不是手改：
 *   - `core/battle.ts` 是 web 侧 `game/src/core/battle.ts` 的旧 fork（820 行 vs 1532 行），
 *     s1-strategy 正在改 web 侧那份。这个补丁必须**极小**、**可重放**，将来如果拿 web 版
 *     整份覆盖过来，重跑一次本脚本就知道哪些补丁还在、哪些已被覆盖掉。
 *   - 幂等：每个补丁先找 `find`；找不到但能找到 `done` 标记 → 视为已打过，跳过；
 *     两个都找不到 → 报错并退出 1（说明上游文本变了，需要人工重定锚点）。
 *
 * 只加 5 处（全部是「加字段/加一行」，不改既有逻辑与既有数值）：
 *   1. import `./weather`
 *   2. `CreateOptions.weather?` / `.month?`
 *   3. `World.weather`
 *   4. `createWorld` 里初始化 `weather`
 *   5. `hitChance()` 里 `p += weatherHitMod(world.weather)`（在「位移 ×2/3」之前，与
 *      `game/src/core/battle.ts:825` 同位置）
 *
 * 用法：node work/cocos_sync/patch_battle_weather.mjs [--dry-run]
 */
import fs from 'node:fs';

const FILE = 'F:/sanguo/game/cocos/assets/scripts/core/battle.ts';
const DRY = process.argv.includes('--dry-run');

/** 每个补丁：find 命中即打；只剩 done 已存在即视为已打过。 */
const PATCHES = [
  {
    name: 'import-weather',
    find: `import { wiseBonus } from './wises';`,
    done: `import { normalizeWeather, weatherHitMod, weatherOf } from './weather';`,
    replace: `import { wiseBonus } from './wises';
import { normalizeWeather, weatherHitMod, weatherOf } from './weather';`,
  },
  {
    name: 'CreateOptions.weather/month',
    find: `  terrain?: number;
  a?: Partial<SideConfig>;`,
    done: `  /** 出阵月份 1..12：只参与天气推导，不影响别的数值。 */`,
    replace: `  terrain?: number;
  /**
   * R39 天气 0..3（0 晴 / 1 雨 / 2 雪 / 3 雾）。不传时按 \`month\` + \`terrain\` 推（\`weatherOf\`）；
   * 两者都不传 = 晴（0）。它只进命中判定（\`hitChance()\`），不碰伤害公式。
   */
  weather?: number;
  /** 出阵月份 1..12：只参与天气推导，不影响别的数值。 */
  month?: number;
  a?: Partial<SideConfig>;`,
  },
  {
    name: 'World.weather',
    find: `  /** 本场地形 id 0..11（原作 \`[0x4A6694]\`）；越界值在 \`terrainBonus()\` 里一律按 0 处理 */
  terrain: number;`,
    done: `  weather: number;`,
    replace: `  /** 本场地形 id 0..11（原作 \`[0x4A6694]\`）；越界值在 \`terrainBonus()\` 里一律按 0 处理 */
  terrain: number;
  /** R39 天气 0..3（见 \`core/weather.ts\`）；命中判定在 \`hitChance()\` 里加 \`weatherHitMod()\` */
  weather: number;`,
  },
  {
    name: 'createWorld 初始化 weather',
    find: `    terrain: opts.terrain ?? 0,
    over: false,`,
    done: `weather: normalizeWeather(`,
    replace: `    terrain: opts.terrain ?? 0,
    weather: normalizeWeather(
      opts.weather ?? (opts.month !== undefined ? weatherOf(opts.month, opts.terrain ?? 0) : 0),
    ),
    over: false,`,
  },
  {
    name: 'hitChance 天气修正',
    find: `  if (to.x !== to.prevX || to.y !== to.prevY) p = Math.trunc((p * 2) / 3);
  return p;`,
    done: `  p += weatherHitMod(world.weather);`,
    replace: `  // R39 天气：命中判定值加一个绝对修正（晴 0 / 雨 −10 / 雪 −15 / 雾 −20，[推测]）。
  // 位置在「目标位移 → p×2/3」之前，与 \`game/src/core/battle.ts:825\` 一致。
  p += weatherHitMod(world.weather);
  if (to.x !== to.prevX || to.y !== to.prevY) p = Math.trunc((p * 2) / 3);
  return p;`,
  },
];

function count(hay, needle) {
  if (!needle) return 0;
  return hay.split(needle).length - 1;
}

let src = fs.readFileSync(FILE, 'utf8');
const before = src;
let applied = 0;
let already = 0;
const failed = [];

for (const p of PATCHES) {
  const n = count(src, p.find);
  if (n === 1) {
    src = src.replace(p.find, p.replace);
    applied += 1;
    console.log(`[patch] ${p.name}`);
    continue;
  }
  if (n > 1) {
    failed.push(`${p.name}：find 命中 ${n} 次（应为 1）`);
    continue;
  }
  if (count(src, p.done) >= 1) {
    already += 1;
    console.log(`[ok]    ${p.name}（已打过）`);
    continue;
  }
  failed.push(`${p.name}：find 与 done 都找不到，上游文本变了`);
}

console.log('');
console.log(`应用 ${applied} / 已存在 ${already} / 失败 ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.error(`  ✗ ${f}`);
  process.exit(1);
}
if (applied === 0) {
  console.log('无需写文件');
  process.exit(0);
}
if (DRY) {
  console.log('DRY-RUN：未写文件');
  process.exit(0);
}
fs.writeFileSync(FILE, src, 'utf8');
console.log(`写入 ${FILE}  ${before.length} → ${src.length} 字符`);
