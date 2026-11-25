#!/usr/bin/env node
/**
 * `CampaignRoot.ts` 版式純函數區的回歸守衛（v16-cocos-monarch 加）。
 *
 * 為什麼需要它：本任務改的 `CampaignRoot.ts` 有一個硬契約 ——
 * `// #region 版式純函數` … `// #endregion` 這一段會被 `work/cocos_map84/probe.mjs`
 * **逐字節抽出去**，去型別後在 node 裡 import 斷言。也就是說這段裡：
 *   ① 不許 import 'cc'；② 不許碰 Node/Component/Color 這些引擎型別；
 *   ③ 對外簽名（`cityIconSize` / `layoutCityLabels` / `planBaseMap` / `bandColorAt`）
 *      一旦改了，探針就抓不到 / 型別對不上。
 *
 * 本任務只在這段**外面**動刀（`lighten()` 加在 `rgba()` 之後、region 之前，
 * 見 CampaignRoot.ts:131），並在 region 之後改 drawMap/placeCityLabels/onTouch。
 * 這個守衛做四件事，跑一次就知道契約還在：
 *   1. 用與 probe.mjs 相同的「按標記抽段」把 region 抽出來；
 *   2. 檢查段內沒有 'cc' 依賴 / 沒有 Node/Component；
 *   3. 用 `ts.transpileModule` 去型別 → import（能 import = 純函數，無引擎依賴）；
 *   4. 對四個導出跑一組已知答案的斷言（含 60 城標籤避讓）。
 *
 * 產物：work/cocos_monarch84/_unit_layout.mjs（與 cocos_map84 的探針同名但**不同目錄**，
 * 避免動到別人的 work 目錄）。
 *
 * 用法：node work/cocos_monarch84/layout_guard.mjs
 * 退出碼：0 = 契約完好；1 = 契約被破壞（會印出具體哪條）。
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GAME = path.join(ROOT, 'game');
const SRC = path.join(GAME, 'cocos', 'assets', 'scripts', 'CampaignRoot.ts');
const OUT = path.join(HERE, '_unit_layout.mjs');
const DATA = path.join(GAME, 'cocos', 'assets', 'bundles', 'res', 'data');

const require = createRequire(import.meta.url);
const ts = require(path.join(GAME, 'node_modules', 'typescript', 'lib', 'typescript.js'));

const text = readFileSync(SRC, 'utf8');
const lines = text.split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('#region 版式纯函数'));
const end = lines.findIndex((l) => l.includes('#endregion'));

const failures = [];
const check = (label, cond, detail = '') => {
  if (!cond) failures.push(`${label}${detail ? `：${detail}` : ''}`);
};

check('找不到 // #region 版式纯函数 標記', start >= 0);
check('找不到 // #endregion 標記', end > start);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const region = lines.slice(start + 1, end).join('\n');
console.log(`region：CampaignRoot.ts:${start + 1}–${end + 1}（${end - start - 1} 行）`);

// ② 段內依賴檢查：只准用純 JS + 段內自己宣告的東西。
//    檢查對象是「去註釋後的編譯產物」，否則契約說明本身（「不许碰 Node/Component」）
//    會被自己的正則誤判 —— 第一版就踩過這個坑。
const codeOnly = ts.transpileModule(region, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
  fileName: 'CampaignRootRegionCode.ts',
}).outputText;
check("region 內出現 import 'cc'（契約：純函數區不許碰引擎）", !/from\s+['"]cc['"]/.test(codeOnly) && !/require\(['"]cc['"]\)/.test(codeOnly));
check('region 內出現引擎型別（契約：不許碰 Node/Component/Color…）', !/\b(Node|Component|Color|Label|Graphics|Sprite|UITransform|Vec3|Layers)\b/.test(codeOnly));
check('region 內出現 require(', !/\brequire\s*\(/.test(codeOnly));
check('region 內出現 new (引擎物件)', !/\bnew\s+(Node|Component|Color|Label|Graphics|Sprite)\b/.test(codeOnly));

// ③ 去型別 → import
const js = ts.transpileModule(region, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
  fileName: 'CampaignRootRegion.ts',
}).outputText;
writeFileSync(OUT, js, 'utf8');
const U = await import(pathToFileURL(OUT).href);

const exported = ['cityIconSize', 'cityLabelWidth', 'layoutCityLabels', 'bandColorAt', 'planBaseMap', 'CITY_ICON_K', 'CITY_LABEL_FONT', 'HUD_TOP'];
for (const name of exported) {
  check(`region 少了導出 ${name}`, name in U);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

// ④ 已知答案斷言
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('CITY_ICON_K 應為 0.65', U.CITY_ICON_K === 0.65, String(U.CITY_ICON_K));
check('CITY_LABEL_FONT 應為 14', U.CITY_LABEL_FONT === 14, String(U.CITY_LABEL_FONT));
check('HUD_TOP 應為 124', U.HUD_TOP === 124, String(U.HUD_TOP));

check('cityIconSize(null) 應夾到 10×10', eq(U.cityIconSize(null), { width: 10, height: 10 }), JSON.stringify(U.cityIconSize(null)));
check(
  'cityIconSize(49×35) 應為 32×23',
  eq(U.cityIconSize({ originalSize: { width: 49, height: 35 }, rect: { width: 49, height: 35 } }), { width: 32, height: 23 }),
  JSON.stringify(U.cityIconSize({ originalSize: { width: 49, height: 35 }, rect: { width: 49, height: 35 } })),
);
check(
  'cityIconSize(2048) 應夾到 64',
  U.cityIconSize({ originalSize: { width: 2048, height: 2048 }, rect: { width: 2048, height: 2048 } }).width === 64,
);
check("cityLabelWidth('洛陽', 14) 應為 30", U.cityLabelWidth('洛陽', 14) === 30, String(U.cityLabelWidth('洛陽', 14)));

const stops = [U.bandColorAt(0), U.bandColorAt(0.55), U.bandColorAt(1), U.bandColorAt(-1), U.bandColorAt(2)];
check('bandColorAt(0) 應為 29/23/16', eq(stops[0], { r: 29, g: 23, b: 16 }), JSON.stringify(stops[0]));
check('bandColorAt(0.55) 應為 21/17/12', eq(stops[1], { r: 21, g: 17, b: 12 }), JSON.stringify(stops[1]));
check('bandColorAt(1) 應為 16/13/9', eq(stops[2], { r: 16, g: 13, b: 9 }), JSON.stringify(stops[2]));
check('bandColorAt 越界應夾住', eq(stops[3], stops[0]) && eq(stops[4], stops[2]));

const plan = U.planBaseMap({ x: -32, y: 279.994, w: 813.6, h: 610.2 }, 750, 1334);
check('planBaseMap 應只載 1 張圖', plan.images.length === 1, String(plan.images.length));
check("planBaseMap 的圖應為 map/chinamap", plan.images[0].path === 'map/chinamap', plan.images[0].path);
check('planBaseMap 上帶應 ceil 蓋住圖邊', plan.bands.top.h === 280, String(plan.bands.top.h));
check('planBaseMap 下帶應 floor', plan.bands.bottom.y === 890, String(plan.bands.bottom.y));
check('planBaseMap 金線應在 HUD 內側', eq(plan.rails.top, [276, 126]) && eq(plan.rails.bottom, [891, 1072]), JSON.stringify(plan.rails));

// 60 城標籤避讓（真資料座標）
const scenarios = JSON.parse(readFileSync(path.join(DATA, 'scenarios.json'), 'utf8'));
const cities = scenarios[0].cities.map((c) => ({
  name: String(c.NAME),
  // 與 CampaignRoot.toScreen 同一套 world→screen（MAP_WORLD → MAP_VIEW）
  x: 20 + ((Number(c.pos_xy[0]) - 88) / (1138 - 88)) * 710,
  y: 130 + ((Number(c.pos_xy[1]) - 84) / (860 - 84)) * 900,
  iconH: 23,
}));
const boxes = U.layoutCityLabels(cities, { fontSize: 14, gap: 3, top: 130, bottom: 1030, screenW: 750 });
check('layoutCityLabels 應與輸入同長', boxes.length === cities.length, `${boxes.length}/${cities.length}`);
let outOfBounds = 0;
let overlaps = 0;
for (let i = 0; i < boxes.length; i += 1) {
  const b = boxes[i];
  if (b.y - b.h / 2 < 130 - 0.5 || b.y + b.h / 2 > 1030 + 0.5) outOfBounds += 1;
  for (let j = i + 1; j < boxes.length; j += 1) {
    const o = boxes[j];
    const ox = Math.min(b.x + b.w / 2, o.x + o.w / 2) - Math.max(b.x - b.w / 2, o.x - o.w / 2);
    const oy = Math.min(b.y + b.h / 2, o.y + o.h / 2) - Math.max(b.y - b.h / 2, o.y - o.h / 2);
    if (ox > 0 && oy > 0) overlaps += 1;
  }
}
check('60 城標籤有出界的', outOfBounds === 0, `${outOfBounds} 個`);
check('60 城標籤有重疊的', overlaps === 0, `${overlaps} 對`);

if (failures.length) {
  console.error('\n✗ 版式純函數區契約被破壞：');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`  標籤：60 城 / 出界 0 / 重疊 ${overlaps} 對`);
console.log('  ✓ 版式純函數區契約完好（仍可獨立 import，四個導出答案不變）');
