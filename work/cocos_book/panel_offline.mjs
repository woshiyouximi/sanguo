/**
 * 無資源降級驗收：**一張圖都不註冊**就跑兩個面板。
 *
 * 驗的是任務書 §三 的硬約束：
 *   · UiSkin 載不到九宮 → 退 Graphics 描邊（不是白屏、不是拋錯）
 *   · 頭像載不到 → 顯名字首字色塊（單將卡）
 *   · chinamap 載不到 → 地圖底板仍是深色塊（勢力圖）
 *
 * 必須是**獨立進程**：UiSkin / ArtLayer 的圖框快取是模組級的，同一個進程裡
 * 先註冊過圖就測不到失敗分支。
 *
 * 跑法：`cd F:\sanguo\work\cocos_book; node panel_offline.mjs`
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const BOOK = require('./_sim/GeneralBookPanel.js');
const FORCES = require('./_sim/ForcesPanel.js');

const BUNDLE = 'F:/sanguo/game/cocos/assets/bundles/res/';
const readJson = (name) => JSON.parse(readFileSync(`${BUNDLE}data/${name}.json`, 'utf8'));
const generals = readJson('generals');
const magics = readJson('magics');
const wises = readJson('wises');
const garrisonAll = readJson('garrison');
const garrison = garrisonAll[0];
const scenario = readJson('scenarios')[0];
const cities = scenario.cities;

let total = 0;
const failures = [];
function ok(label, cond, actual) {
  total += 1;
  if (cond) return true;
  failures.push(`${label}${actual === undefined ? '' : ` — 實際：${JSON.stringify(actual)}`}`);
  return false;
}
function same(label, expected, actual) {
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  total += 1;
  if (a === b) return true;
  failures.push(`${label}\n  預期 = ${a}\n  實際 = ${b}`);
  return false;
}

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}
const nodesOf = (panel) => walk(panel.node);
const byName = (panel, name) => nodesOf(panel).filter((n) => n.name === name);
const nodeOf = (panel, name) => byName(panel, name)[0] ?? null;
const textOf = (panel, name) => nodeOf(panel, name)?.getComponent(cc.Label)?.string ?? '';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const touch = (dx, dy) => cc.__emitTouch(dx - 375, 667 - dy);
const centerOf = (rect) => [rect.x + rect.w / 2, rect.y + rect.h / 2];

/** 這個節點樹上所有 Graphics 累計的繪製次數（九宮降級描邊就是靠它） */
function drawCalls(panel) {
  let calls = 0;
  for (const node of nodesOf(panel)) {
    const g = node.getComponent(cc.Graphics);
    if (!g || !g.calls) continue;
    for (const key of Object.keys(g.calls)) calls += g.calls[key];
  }
  return calls;
}

/* ------------------------------------------------------------------ */
console.log('── 無資源：武將資料名冊 ──');
const PLAYER = '張角';
const ownerOf = (city) => (garrison.cities[city]?.owner ?? '');
const officersByCity = {};
for (const city of cities) officersByCity[city.NAME] = garrison.cities[city.NAME]?.officers ?? [];
const save = { force: PLAYER, king: PLAYER, owned: cities.filter((c) => ownerOf(c.NAME) === PLAYER).map((c) => c.NAME) };
const opts = { generals, magics, wises, save, officersByCity, ownerOf, cities };

const root = new cc.Node('CanvasOffline');
const panel = BOOK.GeneralBookPanel.show(root, opts);
await flush();
const d0 = panel.debug();

ok('無資源：面板照樣開（不白屏）', panel.isOpen === true && panel.node.active === true);
same('無資源：標題仍在', '武 將 資 料', d0.title);
same('無資源：仍是 401 人 / 21 頁', [401, 21], [d0.filtered, d0.pages]);
same('無資源：第 1 頁 20 行', 20, d0.rows);
ok('無資源：20 行名字都有字', (() => {
  for (let i = 0; i < 20; i += 1) if (textOf(panel, `BookRowName${i}`).length === 0) return false;
  return true;
})());
ok('無資源：仍有 Graphics 繪製（底板/行底色/降級描邊）', drawCalls(panel) > 30, drawCalls(panel));
const plateNodes = ['BookPlate', 'BookG', 'BookTabForcePlate', 'BookClearPlate', 'BookBackPlate'].map((n) => nodeOf(panel, n));
ok('無資源：九宮底板節點都存在（降級成 Graphics 描邊，不是缺節點）', plateNodes.every((n) => n !== null));
ok('無資源：節點數與有資源時同量級（≤ 240）', nodesOf(panel).length <= 240, nodesOf(panel).length);

// 開單將卡：沒圖也要看到首字色塊
const row0 = centerOf(BOOK.bookRowRect(0));
const name0 = textOf(panel, 'BookRowName0');
touch(row0[0], row0[1]);
await flush();
const d1 = panel.debug();
ok('無資源：點行仍能開卡片', d1.cardOpen === true);
same('無資源：卡片名字對得上', name0, d1.cardName);
same('無資源：立繪 via = none（五級回落全失敗）', 'none', d1.cardPortrait);
const art = nodeOf(panel, 'BookCardArt');
ok('無資源：立繪節點被收起（不擋住色塊）', !art || art.getComponent(cc.Sprite).spriteFrame === null || art.active === false);
const face = nodeOf(panel, 'BookCardFace');
ok('無資源：首字色塊顯示且非空', !!face && face.active === true && String(face.getComponent(cc.Label).string).length >= 1, face && face.getComponent(cc.Label).string);
ok('無資源：卡片技能/裝備/體技兵仍有字', d1.cardSkill.length > 4 && d1.cardEquip.length > 4 && d1.cardVital.length > 4);
ok('無資源：卡片關閉鈕的命中項存在', panel.tap(...centerOf(BOOK.BOOK_LAYOUT.cardClose)) === true && panel.debug().cardOpen === false);

/* ------------------------------------------------------------------ */
console.log('── 無資源：勢力圖 ──');
const froot = new cc.Node('CanvasOffline2');
const forces = FORCES.ForcesPanel.show(froot, {
  save,
  data: { garrison: garrisonAll, scenarios: [scenario] },
  player: PLAYER,
});
await flush();
const f0 = forces.debug();
ok('無資源：勢力圖照樣開（不白屏）', forces.isOpen === true);
same('無資源：標題仍在', '勢 力 圖', f0.title);
same('無資源：60 城點 / 116 路網 / 15 行', [60, 116, 15], [f0.dots, f0.paths, f0.rows]);
same('無資源：城數求和仍 60', 60, f0.sumCities);
ok('無資源：勢力圖仍有 Graphics 繪製（城點/路網/行底色）', drawCalls(forces) > 60, drawCalls(forces));
const mapArt = nodeOf(forces, 'ForcesMapArt');
ok('無資源：chinamap 缺席 → 底圖節點收起（底板仍在）', !mapArt || mapArt.active === false, mapArt && mapArt.active);
const mapPlate = nodeOf(forces, 'ForcesPlate');
ok('無資源：地圖底板節點存在', mapPlate !== null);
ok('無資源：8 行勢力名都有字', (() => {
  for (let i = 0; i < 8; i += 1) if (textOf(forces, `ForcesName${i}`).length === 0) return false;
  return true;
})());
ok('無資源：節點數 ≤ 120', nodesOf(forces).length <= 120, nodesOf(forces).length);

/* ------------------------------------------------------------------ */
console.log('\n==============================================');
console.log(`降級斷言 ${total} 條，通過 ${total - failures.length}，失敗 ${failures.length}`);
if (failures.length) {
  console.log('失敗：');
  for (const f of failures) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('全部通過 ✅（零圖片資源，兩個面板都畫出來了）');
}
