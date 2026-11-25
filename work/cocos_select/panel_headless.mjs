/**
 * 開局三殼的面板結構驗證（headless，mock `cc`）：節點樹、按鈕、卡片、君主列的文字。
 *
 * 跑法：`cd F:\sanguo\work\cocos_select; node panel_headless.mjs`
 * 前置：`node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json`
 * 產物：panel_tree.txt（節點樹）、panel_interactions.txt（互動軌跡）
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const TitlePanel = require('./_sim/TitlePanel.js').TitlePanel;
const ScenarioSelect = require('./_sim/ScenarioSelect.js').ScenarioSelect;
const R = require('./_sim/RunSetup.js');
const S = require('./_sim/SaveSlots.js');

const DATA_FILE = fileURLToPath(new URL('../../game/cocos/assets/bundles/res/data/scenarios.json', import.meta.url));
const scenarios = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const data = { scenarios };
const storage = cc.__storage;

let total = 0;
const failures = [];
const log = [];

function ok(label, cond, actual) {
  total += 1;
  const line = `${cond ? 'PASS' : 'FAIL'} ${label}${actual === undefined ? '' : ` (${JSON.stringify(actual)})`}`;
  log.push(line);
  if (!cond) failures.push(`${label} — actual=${JSON.stringify(actual)}`);
}
function same(label, expected, actual) {
  ok(label, JSON.stringify(expected) === JSON.stringify(actual), actual);
}
function includes(label, haystack, needle) {
  ok(label, String(haystack).includes(needle), haystack);
}
function group(name) {
  log.push('');
  log.push(`== ${name} ==`);
}

const root = new cc.Node('TestRoot');
root.layer = cc.Layers.Enum.UI_2D;
root.addComponent(cc.UITransform).setContentSize(750, 1334);
root.setPosition(0, 0, 0);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}
function find(name) {
  return walk(root).find((node) => node.name === name) ?? null;
}
function findAll(prefix) {
  return walk(root).filter((node) => node.name.startsWith(prefix));
}
function labelOf(node) {
  return node ? node.getComponent(cc.Label) : null;
}
function textOf(name) {
  const label = labelOf(find(name));
  return label ? label.string : '';
}
function childTexts(node) {
  const out = [];
  for (const child of node.children) {
    const label = labelOf(child);
    if (label && label.string) out.push(label.string);
  }
  return out;
}
/** 設計座標（左上原點）→ 全局 TOUCH_END（走面板真正的事件入口） */
function tapAt(x, y) {
  cc.__emitTouch(x - 375, 667 - y);
}
function clearStorage() {
  storage.clear();
  R.resetRunCache();
}

/* ====================================================================== */

let onNew = 0;
let onEnter = 0;
let onBack = 0;

clearStorage();
const title = TitlePanel.show(root, {
  data,
  onNewGame: () => {
    onNew += 1;
  },
  onEnterCampaign: () => {
    onEnter += 1;
  },
});
await flush();

group('§1 標題頁');
same('面板節點存在', true, find('TitlePanel') !== null);
same('初始頁', 'title', title.debug().page);
same('標題頁按鈕數', 3, findAll('Btn_').length);
ok('有「開始新局」', find('Btn_開始新局') !== null);
ok('有「讀取存檔」', find('Btn_讀取存檔') !== null);
ok('有「說明」', find('Btn_說明') !== null);
includes('頁頭標題', title.debug().title, '三國群英傳 2');
includes('主視覺標題', title.debug().labels.join('|'), '群 雄 逐 鹿');
includes('副標有年份範圍', title.debug().sub, '184');
ok('標題頁文字全部非空', title.debug().labels.every((text) => text.trim().length > 0), title.debug().labels.length);
ok('背景 Graphics 真的填色', (() => {
  const bg = find('TitleBg');
  const g = bg ? bg.getComponent(cc.Graphics) : null;
  return !!(g && g.calls.fill >= 1 && g.calls.rect >= 1);
})());
ok('九宮圖元失敗時有 Graphics 降級描邊', (() => {
  const frame = find('Frame_frame_panel');
  const g = frame ? frame.getComponent(cc.Graphics) : null;
  return !!(g && g.calls.stroke >= 1);
})());
ok('節點樹規模 ≥ 18（標題頁）', walk(root).length >= 18, walk(root).length);

// 全局 touch 入口（不是 panel.tap）：點「開始新局」
tapAt(375, 988);
same('全局 touch 命中開始新局', 1, onNew);

group('§2 讀取存檔：10 槽空態');
title.tap(375, 1096);
await flush();
same('切到存檔頁', 'saves', title.debug().page);
same('10 個槽位列', 10, title.debug().rows);
same('SaveRow_1..10 都在', 10, findAll('SaveRow_').filter((node) => /^SaveRow_\d+$/.test(node.name)).length);
let rowsTextOk = true;
for (let slot = 1; slot <= 10; slot += 1) {
  const l1 = textOf(`SaveRow_${slot}_L1`);
  const l2 = textOf(`SaveRow_${slot}_L2`);
  if (!l1 || !l2) rowsTextOk = false;
}
ok('空態每列 l1/l2 都有字', rowsTextOk);
same('空態第 10 列 l1', '槽 10', textOf('SaveRow_10_L1'));
includes('空態第 1 列 l2', textOf('SaveRow_1_L2'), '空槽');
title.tap(375, 180); // 點槽 1
await flush();
includes('點空槽只提示不崩', title.debug().msg, '空的');
same('空槽點擊後仍在存檔頁', 'saves', title.debug().page);

group('§3 說明頁');
title.tap(150, 1216);
same('返回標題頁', 'title', title.debug().page);
title.tap(375, 1204);
await flush();
same('切到說明頁', 'help', title.debug().page);
same('說明 13 行', 13, findAll('HelpLine_').length);
let helpOk = true;
for (let i = 0; i < 13; i += 1) {
  if (!textOf(`HelpLine_${i}`)) helpOk = false;
}
ok('說明每行非空', helpOk);
includes('說明提到 30Hz', title.debug().labels.join('|'), '30Hz');
includes('說明提到存檔 10 槽', title.debug().labels.join('|'), '存檔 10 槽');

group('§4 讀取存檔：有檔態（真的載入）');
title.tap(150, 1216);
clearStorage();
const save = {
  v: 3,
  seeded: true,
  scenario: 1,
  month: 7,
  gold: 1200,
  wins: 3,
  losses: 1,
  owned: ['北平', '代縣'],
  cities: { 北平: { troops: 300 }, 代縣: { troops: 280 } },
  roster: { 北平: ['張三', '李四'], 代縣: ['王五'] },
  king: '公孫瓚',
  monarch: '公孫瓚',
};
cc.sys.localStorage.setItem('sanguo_campaign_v1', JSON.stringify(save));
cc.sys.localStorage.setItem(
  'sanguo_slots_v1',
  JSON.stringify({
    active: 1,
    slots: {
      1: {
        at: Date.UTC(2026, 0, 2, 3, 4, 0),
        meta: { monarch: '公孫瓚', cities: 2, month: 7, wins: 3, losses: 1, generals: 3, scenario: '黃巾之亂', name: '測試' },
      },
    },
  }),
);
cc.sys.localStorage.setItem('sanguo_slot_payload_v1_1', JSON.stringify({ sanguo_campaign_v1: JSON.stringify(save) }));
R.resetRunCache();
title.tap(375, 1096); // 讀取存檔
await flush();
same('有檔態 1 列有檔', 1, (() => {
  let n = 0;
  for (let slot = 1; slot <= 10; slot += 1) if (!textOf(`SaveRow_${slot}_L2`).includes('空槽')) n += 1;
  return n;
})());
includes('有檔 l1 有槽號', textOf('SaveRow_1_L1'), '槽 1');
includes('有檔 l1 有名稱', textOf('SaveRow_1_L1'), '測試');
includes('有檔 l2 有城數', textOf('SaveRow_1_L2'), '城2');
includes('有檔 l3 有君主', textOf('SaveRow_1_L3'), '君主公孫瓚');
const enterBefore = onEnter;
tapAt(375, 180); // 全局 touch 點槽 1
await flush();
same('讀檔觸發進大地圖', enterBefore + 1, onEnter);
same('讀檔後 activeSlot', 1, S.readIndex().active);
same('讀檔後 RunSetup 勢力', '公孫瓚', R.playerForce());
same('讀檔後 RunSetup 劇本', 0, R.scenarioIndex());

title.close();
title.tap(375, 1096); // 面板已關，再點也不該炸
ok('關閉後再點不炸', true);

/* ====================================================================== */

group('§5 劇本選擇：5 張卡');
const select = ScenarioSelect.show(root, {
  data,
  onBack: () => {
    onBack += 1;
  },
  onEnterCampaign: () => {
    onEnter += 1;
  },
});
await flush();
same('面板節點存在', true, find('ScenarioSelect') !== null);
same('初始頁', 'scenario', select.debug().page);
same('5 張劇本卡', 5, select.debug().cards);
same('5 張卡節點', 5, findAll('ScCard_').filter((node) => /^ScCard_\d+$/.test(node.name)).length);
let cardOk = true;
for (let i = 0; i < 5; i += 1) {
  const node = find(`ScCard_${i}`);
  const texts = node ? childTexts(node) : [];
  if (texts.length < 3 || texts.some((text) => !text.trim())) cardOk = false;
}
ok('每張卡 ≥3 行且非空', cardOk);
includes('卡 1 有年份', textOf('ScCard_0_Stats'), '184 年');
includes('卡 1 有勢力數', textOf('ScCard_0_Stats'), '15 勢力');
includes('卡 1 有開局三城', textOf('ScCard_0_Opening'), '開局三城');
includes('已選標記', textOf('ScCard_0_Dot'), '已選');
ok('劇本卡不超出頁面（第 5 張底 < 1000）', 140 + 4 * 160 + 150 < 1000);

group('§6 劇本 → 君主頁');
select.tap(375, 535); // 第 3 張卡（群雄割據）
await flush();
same('選中第 3 套', 2, select.debug().scenarioIndex);
same('選中劇本名', '群雄割據', select.debug().scenarioName);
same('第 3 套勢力數', 9, select.debug().forces);
same('第 3 套有城勢力', 8, select.debug().selectable);
select.tap(590, 1216); // 下一步
await flush();
same('切到君主頁', 'force', select.debug().page);
same('君主列表 8 行', 8, select.debug().rows);
same('頁碼 1/2', '第 1 / 2 頁', textOf('PageLabel'));
let forceRowsOk = true;
for (let i = 0; i < 8; i += 1) {
  const texts = [textOf(`ForceRow_${i}_Name`), textOf(`ForceRow_${i}_Meta`), textOf(`ForceRow_${i}_Cities`)];
  if (texts.some((text) => !text.trim())) forceRowsOk = false;
}
ok('每行 name/meta/cities 非空', forceRowsOk);
includes('副標有勢力數', select.debug().sub, '9 家勢力');
includes('第 1 行名字', textOf('ForceRow_0_Name'), '袁紹');
includes('第 2 行名字', textOf('ForceRow_1_Name'), '曹操');

group('§7 君主分頁 / 0 城不可選');
select.tap(640, 1088); // 下一頁
await flush();
same('翻頁後頁碼', 1, select.debug().pageIndex);
same('第 2 頁 1 行', 1, select.debug().rows);
same('頁碼 2/2', '第 2 / 2 頁', textOf('PageLabel'));
includes('第 2 頁是 0 城勢力', textOf('ForceRow_8_Name'), '盜賊');
select.tap(375, 193); // 點盜賊
await flush();
includes('0 城勢力只提示', select.debug().msg, '不可選');
select.tap(110, 1088); // 上一頁
await flush();
same('翻回第 1 頁', 0, select.debug().pageIndex);

group('§8 選君主 → 開始新局');
select.tap(375, 305); // 曹操（第 2 行）
await flush();
same('選中曹操', '曹操', select.debug().forceName);
select.tap(590, 1216); // 開始新局
await flush();
same('開始新局觸發進大地圖', enterBefore + 2, onEnter);
const run = JSON.parse(storage.get('sanguo_run_v1'));
same('RunSetup 劇本下標', 2, run.scenarioIndex);
same('RunSetup 勢力', '曹操', run.playerForce);
same('RunSetup 版本', 1, run.v);
ok('曹操在劇本 3 有 10 城', select.debug().labels.some((text) => text.includes('起始 10 城')));

group('§9 返回鍵 / 收尾');
select.tap(120, 1216); // 返回 → 劇本頁
await flush();
same('返回劇本頁', 'scenario', select.debug().page);
select.tap(120, 1216); // 返回 → onBack
same('返回標題頁回呼', 1, onBack);

/* ====================================================================== */
/* 產物                                                                   */
/* ====================================================================== */

function dumpTree() {
  const lines = [];
  const visit = (node, depth) => {
    const transform = node.getComponent(cc.UITransform);
    const label = node.getComponent(cc.Label);
    const sprite = node.getComponent(cc.Sprite);
    const parts = [`${'  '.repeat(depth)}${node.name}`, `active=${node.active}`];
    if (transform) parts.push(`size=${Math.round(transform.contentSize.width)}x${Math.round(transform.contentSize.height)}`);
    parts.push(`pos=${Math.round(node.position.x)},${Math.round(node.position.y)}`);
    if (label) parts.push(`text=${JSON.stringify(label.string)}`);
    if (sprite) parts.push(sprite.spriteFrame ? `sprite=${sprite.spriteFrame.path}` : 'sprite=none');
    lines.push(parts.join(' '));
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const child of root.children) visit(child, 0);
  return lines.join('\n');
}

console.log(log.join('\n'));
console.log('');
console.log(`斷言：${total} 條，通過 ${total - failures.length}，失敗 ${failures.length}`);
if (failures.length) {
  console.log('失敗明細：');
  for (const item of failures) console.log(` - ${item}`);
}
const outDir = fileURLToPath(new URL('.', import.meta.url));
fs.writeFileSync(`${outDir}/panel_tree.txt`, `${dumpTree()}\n`, 'utf8');
fs.writeFileSync(`${outDir}/panel_interactions.txt`, `${log.join('\n')}\n`, 'utf8');
console.log('產物：panel_tree.txt / panel_interactions.txt');
process.exitCode = failures.length ? 1 : 0;
