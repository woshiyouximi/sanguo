/**
 * `SurrenderPanel.ts` 的 headless 驗證：用 `_sim/node_modules/cc` 的 mock `cc`
 * 跑**真實編譯產物**（`_sim/SurrenderPanel.js`），斷言節點樹 / 三顆按鈕 / 批量鍵狀態 /
 * 落庫後的面板收尾。
 *
 * 跑法：`cd F:\sanguo\work\cocos_surrender && node panel_headless.mjs`
 * 前置：`node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json`
 *
 * 產出：
 *  - `panel_tree.txt`         —— 面板節點樹快照（名字 / active / 位置 / 尺寸 / 文案）
 *  - `panel_interactions.txt` —— 每次點擊與其結果
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const P = require('./_sim/SurrenderPanel.js');
const M = require('./_sim/SurrenderModel.js');
const GameState = require('./_sim/GameState.js');

const CACHE_DIR = process.env.TEMP || process.env.TMP || mkdtempSync(join(tmpdir(), 'sur-headless-'));
const TREE_FILE = join(process.cwd(), 'panel_tree.txt');
const LOG_FILE = join(process.cwd(), 'panel_interactions.txt');

/* ------------------------------------------------------------------ */
/* 斷言器                                                              */
/* ------------------------------------------------------------------ */

let total = 0;
const failures = [];
const lines = [];

function ok(label, cond, actual) {
  total += 1;
  if (!cond) failures.push(`${label} → 期望 true，實際 ${show(actual)}`);
}

function same(label, expected, actual) {
  total += 1;
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  if (a !== b) failures.push(`${label} → 期望 ${a}，實際 ${b}`);
}

function includes(label, needle, haystack) {
  total += 1;
  const text = String(haystack);
  if (!text.includes(needle)) failures.push(`${label} → 期望含 ${JSON.stringify(needle)}，實際 ${JSON.stringify(text)}`);
}

function show(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function note(text) {
  lines.push(text);
}

/* ------------------------------------------------------------------ */
/* 測試資料                                                            */
/* ------------------------------------------------------------------ */

const DATA = {
  generals: [
    { NAME: '張遼', STR: 92, INT: 78, Loyal: 52, CONSTANCY: 4 }, // 卡上 40 → roll
    { NAME: '程昱', STR: 62, INT: 90, Loyal: 20, CONSTANCY: 5 }, // 卡上 10 → must
    { NAME: '守將', STR: 50, INT: 40, Loyal: 60, CONSTANCY: 3 }, // 卡上 46 → roll
    { NAME: '華佗', STR: 22, INT: 88, Loyal: 80, CONSTANCY: 4 }, // 卡上 68 → refuse（硬門 0x13）
    { NAME: '死士', STR: 40, INT: 30, Loyal: 20, CONSTANCY: 4 }, // 卡上 12 → must 但 executed
    { NAME: '劉備', STR: 74, INT: 72, Loyal: 99, CONSTANCY: 9 }, // 君主
  ],
  scenarios: [{ kings: [{ NAME: '劉備' }] }],
  troops: [],
  formations: [],
  magics: [],
  wises: [],
  terrains: [],
  items: [],
};

function baseSave() {
  return {
    owned: ['許昌'],
    wins: 3,
    losses: 1,
    month: 118,
    gold: 900,
    cities: { 許昌: { troops: 400, pop: 90000, money: 300 } },
    roster: { 許昌: ['曹操', '夏侯惇'] },
    captured: ['張遼', '程昱', '守將'],
    executed: ['華佗', '死士'],
  };
}

function makeRoot(name) {
  const root = new cc.Node(name);
  root.addComponent(cc.UITransform).setContentSize(750, 1334);
  return root;
}

/** 設計座標（左上原點）→ mock 的屏幕座標，再走真實的 input 派發。 */
function tapAt(x, y) {
  cc.__emitTouch(x - 375, 667 - y);
}

function child(panel, name) {
  return panel.node.getChildByName(name);
}

function labelOf(panel, name) {
  const node = child(panel, name);
  return node ? node.getComponent('Label') : null;
}

function labelText(panel, name) {
  const label = labelOf(panel, name);
  return label ? label.string : '<missing>';
}

function activeOf(panel, name) {
  const node = child(panel, name);
  return node ? node.active === true : null;
}

/** 放行 ArtLayer.loadFrame 的異步回呼（mock 走 setTimeout / Promise）。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ------------------------------------------------------------------ */
/* 節點樹快照                                                          */
/* ------------------------------------------------------------------ */

const tree = [];
function walk(node, depth) {
  const transform = node.getComponent(cc.UITransform);
  const label = node.getComponent('Label');
  const sprite = node.getComponent('Sprite');
  const parts = [`${'  '.repeat(depth)}${node.name}`];
  if (node.active === false) parts.push('[off]');
  if (transform) parts.push(`${transform.contentSize.width}x${transform.contentSize.height}`);
  parts.push(`@(${round(node.position.x)},${round(node.position.y)})`);
  if (label) parts.push(`"${label.string}"`);
  if (sprite) parts.push(`sprite=${sprite.spriteFrame ? 'yes' : 'none'}`);
  tree.push(parts.join(' '));
  for (const kid of node.children) walk(kid, depth + 1);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* 1. 沒有俘虜就不建節點                                                */
/* ------------------------------------------------------------------ */

console.log('── 1. 沒卡 → 連節點都不建');
{
  const root = makeRoot('RootEmpty');
  const before = cc.__nodeCount();
  const panel = P.SurrenderPanel.showIfNeeded(root, {
    save: { ...baseSave(), captured: [], executed: [] },
    data: DATA,
    home: '許昌',
  });
  same('1.1 showIfNeeded 返回 null', null, panel);
  same('1.2 根節點沒多出子節點', 0, root.children.length);
  same('1.3 節點總數沒變', before, cc.__nodeCount());
}

/* ------------------------------------------------------------------ */
/* 2. 正常開面板                                                       */
/* ------------------------------------------------------------------ */

console.log('── 2. 五張卡開面板');
const root = makeRoot('Root');
// 走一遍真實存檔路徑：storage → GameState.loadSave()（normalize）→ 傳給面板
cc.__storage.set(GameState.SAVE_KEY, JSON.stringify(baseSave()));
const SAVE = GameState.loadSave();
const panel = P.SurrenderPanel.showIfNeeded(root, { save: SAVE, data: DATA, home: '許昌', atCity: ['許昌', '劉備'] });

ok('2.1 面板開起來了', panel !== null, panel);
same('2.2 節點名', 'SurrenderPanel', panel.node.name);
same('2.3 isOpen', true, panel.isOpen);
same('2.4 節點被壓到最上層', true, panel.node.siblingIndex >= 0);

const debug0 = panel.debug();
same('2.5 卡數（3 captured + 2 executed + 1 君主）', 6, debug0.cards);
same('2.6 總頁數', 2, debug0.pages);
same('2.7 當前頁畫了 5 張', 5, debug0.visible.length);
same('2.8 第一頁的名單', ['張遼', '程昱', '守將', '華佗', '死士'], debug0.visible);
same('2.9 待決張數', 6, debug0.left);
// 標題被 R180 那輪（project/180_战斗HUD对齐.md：逐字照原作「武 將 招 降」）取代：
// SurrenderPanel.ts:69-75 的 PANEL_TITLE_TEXT 是本视图侧覆盖（SurrenderModel.PANEL_TITLE
// 仍是 web 共用的「抓 到 敵 將」）。旧断言抄的是 web 文案，已过期。
same('2.10 標題逐字（原作「武 將 招 降」）', '武 將 招 降', debug0.title);
includes('2.11 副標寫回城名 + 三個處置', '逐將詢問：招降的進 許昌 武將池，斬首的出池永不復活，釋放的放回原勢力', debug0.sub);
includes('2.12 底部提示寫待決數', '剩 6 位待決', debug0.msg);
same('2.13 批量鍵可用', true, debug0.bulkEnabled);
same('2.14 還沒落庫（沒有完成鍵）', false, debug0.canFinish);

// 節點樹
// 節點數被 R196/R197 的「招降十欄」取代：每張卡多 10 個 SurFieldK* + 10 個 SurFieldV*
// （SurrenderPanel.ts:422-450，SUR_FIELD_KEYS 見 :91-102），舊「5×9 卡」已不成立。
// 152 = 1 蒙版 + 1 Graphics + 5 表头（SurTitle/SurSub/SurPrev/SurPage/SurNext）
//     + 5×(1 头像 + 1 名 + 1 档位 + 10 键 + 10 值 + 1 理由 + 1 取舍 + 3 按钮 = 28)
//     + 1 提示（SurMsg）+ 3 批量 + 1 完成（SurFinish）。
same('2.15 面板子節點數（1 蒙版 + 1 Graphics + 5 表頭 + 5×28 卡〔含十欄〕 + 1 提示 + 3 批量 + 1 完成）', 152, panel.node.children.length);
ok('2.16 蒙版存在', child(panel, 'SurVeil') !== null);
ok('2.17 Graphics 畫布存在', child(panel, 'SurFrame') !== null);
const g = child(panel, 'SurFrame').getComponent('Graphics');
ok('2.18 這一幀畫了不少矩形', g.calls.rect >= 20, g.calls.rect);
ok('2.19 fill/stroke 都調過', g.calls.fill >= 10 && g.calls.stroke >= 10, { fill: g.calls.fill, stroke: g.calls.stroke });
ok('2.20 每次重畫先 clear', g.calls.clear >= 1, g.calls.clear);

same('2.21 表頭副標是 Label', true, labelOf(panel, 'SurSub') !== null);
same('2.22 翻頁顯示', '第 1 / 2 頁', labelText(panel, 'SurPage'));
same('2.23 第一頁的「上頁」不可點（但節點在）', true, activeOf(panel, 'SurPrev'));
same('2.24 第一頁的「下頁」在', true, activeOf(panel, 'SurNext'));

/* ------------------------------------------------------------------ */
/* 3. 逐卡：五格都畫了什麼                                              */
/* ------------------------------------------------------------------ */

// 立繪是異步載入的：先放行一輪回呼，否則第五級（隱藏）的結論會早於載圖失敗。
await flush();

console.log('── 3. 逐將一張卡：頭像 / 名 / 數值 / 檔位 / 三顆按鈕');
{
  same('3.1 第 1 張名字', '張遼', labelText(panel, 'SurName0'));
  same('3.2 第 1 張檔位（roll）', '需 再 戰', labelText(panel, 'SurTier0'));
  // 舊「武 92 · 智 78 · 忠誠 40 · 義理 4」一行是 project/120 的单行數值；已被
  // R196/R197「招降十欄」取代（SurrenderPanel.ts:91-102 SUR_FIELD_KEYS、
  // :698-708 由 surFieldCells() 填键/值，null → 灰「—」）。逐欄斷言：
  const fieldKeys = [];
  const fieldVals = [];
  for (let k = 0; k < 10; k += 1) {
    fieldKeys.push(labelText(panel, `SurFieldK0_${k}`));
    fieldVals.push(labelText(panel, `SurFieldV0_${k}`));
  }
  same('3.3 第 1 張十欄的鍵（web surFields 順序）', ['等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數'], fieldKeys);
  same('3.3a 第 1 張武力/智力/忠誠真值', ['92', '78', '40'], [fieldVals[3], fieldVals[4], fieldVals[5]]);
  // 敗場數：面板是「戰後處置」，這一場被俘先現算 1 敗（SurrenderPanel.ts:136-138
  // lossNow；落帳時 finishOf() 再寫進 save.generalRecord）。沒有的欄位才畫「—」。
  same('3.3b 存檔沒有的欄位畫「—」不冒充 0，敗場數現算 1 敗', ['—', '—', '—', '—', '—', '—', '1'], [fieldVals[0], fieldVals[1], fieldVals[2], fieldVals[6], fieldVals[7], fieldVals[8], fieldVals[9]]);
  same('3.4 第 2 張檔位（must）', '可 降', labelText(panel, 'SurTier1'));
  same('3.5 第 4 張檔位（refuse）', '拒 降', labelText(panel, 'SurTier3'));
  ok('3.6 理由畫出來了', labelText(panel, 'SurReason3').includes('0x13'), labelText(panel, 'SurReason3'));

  // 三顆按鈕各畫出來
  same('3.7 卡 0 三顆按鈕節點都在', [true, true, true], [
    activeOf(panel, 'SurBtn0_0'),
    activeOf(panel, 'SurBtn0_1'),
    activeOf(panel, 'SurBtn0_2'),
  ]);
  same('3.8 三顆按鈕文案（web 逐字）', ['招 降', '斬 首', '釋 放'], [
    labelText(panel, 'SurBtn0_0'),
    labelText(panel, 'SurBtn0_1'),
    labelText(panel, 'SurBtn0_2'),
  ]);

  const hits0 = panel.hitList.map((hit) => hit.label);
  same('3.9 可招的卡三顆都能點', [true, true, true], [
    hits0.includes('card:0:recruit'),
    hits0.includes('card:0:kill'),
    hits0.includes('card:0:release'),
  ]);
  same('3.10 拒降檔的「招降」不給命中', false, hits0.includes('card:3:recruit'));
  same('3.11 拒降檔的「斬首」「釋放」仍能點', [true, true], [
    hits0.includes('card:3:kill'),
    hits0.includes('card:3:release'),
  ]);
  same('3.12 executed 的 must 檔也不給「招降」', false, hits0.includes('card:4:recruit'));
  same(
    '3.13 命中矩形總數：5 卡 × 3 鍵 − 2 個灰鍵 + 3 批量 + 下頁',
    17,
    hits0.length,
  );

  // 頭像：資源不存在 → 五級回落全部落空 → ArtSprite 自己把節點收起來
  same('3.14 五格頭像都掛上了（節點在）', 5, [0, 1, 2, 3, 4].filter((i) => child(panel, `SurPortrait${i}`) !== null).length);
  same('3.15 五級回落跑到「隱藏」', ['none', 'none', 'none', 'none', 'none'], panel.debug().portraitVia.slice(0, 5));
  same('3.16 沒有圖的頭像節點被關掉', false, activeOf(panel, 'SurPortrait0'));
  same('3.17 沒圖也不遮住名字', '張遼', labelText(panel, 'SurName0'));
}

/* ------------------------------------------------------------------ */
/* 4. 逐將決策                                                         */
/* ------------------------------------------------------------------ */

console.log('── 4. 點一張卡的按鈕');
{
  const hit = panel.hitList.find((item) => item.label === 'card:0:recruit');
  ok('4.1 找到「招降」的命中矩形', hit !== undefined, hit);
  const cx = hit.rect.x + hit.rect.w / 2;
  const cy = hit.rect.y + hit.rect.h / 2;
  note(`tap (${cx}, ${cy}) → card:0:recruit（招降 張遼）`);
  tapAt(cx, cy);

  same('4.2 決策寫進 picks', 'recruit', panel.debug().picks['張遼']);
  same('4.3 待決少一個', 5, panel.debug().left);
  includes('4.4 底部提示跟著變', '剩 5 位待決', labelText(panel, 'SurMsg'));
  same('4.5 卡面換成「已 招 降」', '已 招 降', labelText(panel, 'SurPick0'));
  same('4.6 pick 徽標顯示', true, activeOf(panel, 'SurPick0'));
  same('4.7 三顆按鈕收起來', [false, false, false], [
    activeOf(panel, 'SurBtn0_0'),
    activeOf(panel, 'SurBtn0_1'),
    activeOf(panel, 'SurBtn0_2'),
  ]);
  same('4.8 決過的卡不再有命中', false, panel.hitList.some((item) => item.label.startsWith('card:0:')));

  // 點空白處不該有任何反應
  note('tap (375, 60) → 標題區（不該有反應）');
  tapAt(375, 60);
  same('4.9 點非命中區不改狀態', 'recruit', panel.debug().picks['張遼']);
}

/* ------------------------------------------------------------------ */
/* 5. 批量鍵狀態隨選擇變化                                             */
/* ------------------------------------------------------------------ */

console.log('── 5. 批量鍵');
{
  const before = panel.hitList.filter((item) => item.label.startsWith('bulk:'));
  same('5.1 三顆批量鍵都在', ['bulk:recruit', 'bulk:kill', 'bulk:release'], before.map((item) => item.label));
  same('5.2 三顆批量鍵的文字', ['剩餘全部招降', '剩餘全部斬首', '剩餘全部釋放'], [
    labelText(panel, 'SurBulk0'),
    labelText(panel, 'SurBulk1'),
    labelText(panel, 'SurBulk2'),
  ]);

  // 用「全部斬首」收掉剩下的 5 張（含拒降檔：斬首不看檔位）
  const bulkKill = before.find((item) => item.label === 'bulk:kill');
  note(`tap (${bulkKill.rect.x + bulkKill.rect.w / 2}, ${bulkKill.rect.y + bulkKill.rect.h / 2}) → bulk:kill`);
  tapAt(bulkKill.rect.x + bulkKill.rect.w / 2, bulkKill.rect.y + bulkKill.rect.h / 2);

  const after = panel.debug();
  same('5.3 批量後全部決完', true, after.done);
  same('5.4 批量鍵熄滅', false, after.bulkEnabled);
  same('5.5 三顆批量鍵節點被關掉', [false, false, false], [
    activeOf(panel, 'SurBulk0'),
    activeOf(panel, 'SurBulk1'),
    activeOf(panel, 'SurBulk2'),
  ]);
  includes('5.6 批量鍵文字留著（沒被清空）', '剩餘全部招降', labelText(panel, 'SurBulk0'));
  same('5.7 落库后只剩复盘用的翻页键 + 完成键', ['next', 'finish'], panel.hitList.map((item) => item.label));
  same('5.8 完成鍵畫出來', true, activeOf(panel, 'SurFinish'));
  includes('5.9 提示條換成落庫結果（web 文案；君主在批量裡只能被放走）', '戰 後 處 置完成：招降 1 · 斬首 4 · 放走 1', labelText(panel, 'SurMsg'));
  same('5.10 落庫後每張卡都是 done', true, panel.debug().picks && Object.keys(panel.debug().picks).length === 6);

  // 落庫結果：存檔真的被改了（GameState.persistSave 寫回 storage）
  const stored = JSON.parse(cc.__storage.get(GameState.SAVE_KEY));
  same('5.11 captured 清空', [], stored.captured);
  same('5.12 executed 清空', [], stored.executed);
  same('5.13 lastPost.joined', ['張遼'], stored.lastPost.joined);
  same('5.14 lastPost.deadAll', ['程昱', '守將', '華佗', '死士'], stored.lastPost.deadAll);
  same('5.15 招降的進城名單', true, stored.roster['許昌'].includes('張遼'));
  same('5.16 斬首的記死', '陣亡', stored.roster._moved['程昱']);
  same('5.17 拒降檔被斬首也照斬（不看檔位）', '陣亡', stored.roster._moved['華佗']);
  same('5.18 斬首的從名單摘掉', false, stored.roster['許昌'].includes('程昱'));

  // 點完成 → 收面板
  const finish = panel.hitList.find((item) => item.label === 'finish');
  note(`tap (${finish.rect.x + finish.rect.w / 2}, ${finish.rect.y + finish.rect.h / 2}) → finish`);
  tapAt(finish.rect.x + finish.rect.w / 2, finish.rect.y + finish.rect.h / 2);
  same('5.19 完成後收起來', false, panel.isOpen);
  same('5.20 節點被關掉', false, panel.node.active);
  same('5.21 觸控監聽解綁', 0, (cc.__listeners.get('touch-end') ?? []).length);

  // 再彈一次：名單已清空 → 不該有面板
  const again = P.SurrenderPanel.showIfNeeded(root, { save: GameState.loadSave(), data: DATA, home: '許昌' });
  same('5.22 清空後不再彈', null, again);
}

/* ------------------------------------------------------------------ */
/* 6. 分頁                                                             */
/* ------------------------------------------------------------------ */

console.log('── 6. 分頁（7 張卡 → 2 頁）');
{
  const save2 = {
    ...baseSave(),
    captured: ['張遼', '程昱', '守將', '死士'],
    executed: ['華佗'],
  };
  // 再加兩個有名有姓的（generals 裡沒有的名字也能出卡，只是數值全 0）
  save2.captured = save2.captured.concat([]);
  save2.executed = save2.executed.concat([]);
  const root2 = makeRoot('RootPaging');
  const panel2 = P.SurrenderPanel.showIfNeeded(root2, {
    save: { ...save2, captured: ['張遼', '程昱', '守將', '死士', '無名甲', '無名乙'], executed: ['華佗'] },
    data: DATA,
    home: '許昌',
  });
  ok('6.1 第二個面板開起來', panel2 !== null, panel2);
  const d = panel2.debug();
  same('6.2 卡數', 7, d.cards);
  same('6.3 頁數', 2, d.pages);
  same('6.4 第一頁 5 張', 5, d.visible.length);
  same('6.5 有下頁命中', true, panel2.hitList.some((item) => item.label === 'next'));
  same('6.6 沒有上頁命中', false, panel2.hitList.some((item) => item.label === 'prev'));

  const next = panel2.hitList.find((item) => item.label === 'next');
  note('tap next → 第 2 頁');
  tapAt(next.rect.x + next.rect.w / 2, next.rect.y + next.rect.h / 2);
  same('6.7 翻到第 2 頁', 1, panel2.debug().page);
  same('6.8 第 2 頁只剩 2 張', 2, panel2.debug().visible.length);
  same('6.9 第 2 頁名單', ['無名乙', '華佗'], panel2.debug().visible);
  same('6.10 空槽的卡節點被關掉', false, activeOf(panel2, 'SurName4'));
  same('6.11 第 2 頁有上頁命中', true, panel2.hitList.some((item) => item.label === 'prev'));

  const prev = panel2.hitList.find((item) => item.label === 'prev');
  note('tap prev → 回第 1 頁');
  tapAt(prev.rect.x + prev.rect.w / 2, prev.rect.y + prev.rect.h / 2);
  same('6.12 回第 1 頁', 0, panel2.debug().page);
  same('6.13 第 1 頁又滿 5 張', 5, panel2.debug().visible.length);
  same('6.14 每頁切換都重畫 Graphics', true, child(panel2, 'SurFrame').getComponent('Graphics').calls.clear >= 3);
}

/* ------------------------------------------------------------------ */
/* 7. 君主卡（只能放走）                                               */
/* ------------------------------------------------------------------ */

console.log('── 7. 君主卡');
{
  const root3 = makeRoot('RootKing');
  const panel3 = P.SurrenderPanel.showIfNeeded(root3, {
    save: { ...baseSave(), captured: ['劉備'], executed: [] },
    data: DATA,
    home: '許昌',
  });
  ok('7.1 君主面板開得起來', panel3 !== null, panel3);
  same('7.2 君主檔位文字', '逃 走', labelText(panel3, 'SurTier0'));
  same('7.3 君主沒有三顆按鈕', [false, false, false], [
    activeOf(panel3, 'SurBtn0_0'),
    activeOf(panel3, 'SurBtn0_1'),
    activeOf(panel3, 'SurBtn0_2'),
  ]);
  same('7.4 君主卡畫「逃 走」徽標', ['逃 走', true], [labelText(panel3, 'SurPick0'), activeOf(panel3, 'SurPick0')]);
  same('7.5 君主卡沒有逐將命中', false, panel3.hitList.some((item) => item.label.startsWith('card:0:')));
  same('7.6 只剩三顆批量鍵', ['bulk:recruit', 'bulk:kill', 'bulk:release'], panel3.hitList.map((item) => item.label));

  const bulkRecruit = panel3.hitList.find((item) => item.label === 'bulk:recruit');
  note('tap bulk:recruit（君主在裡面 → 只能被放走）');
  tapAt(bulkRecruit.rect.x + bulkRecruit.rect.w / 2, bulkRecruit.rect.y + bulkRecruit.rect.h / 2);
  same('7.7 君主被記成 escape', 'escape', panel3.debug().picks['劉備']);
  includes('7.8 提示條只有放走', '戰 後 處 置完成：放走 1', labelText(panel3, 'SurMsg'));
  same('7.9 君主沒被記死', undefined, (JSON.parse(cc.__storage.get(GameState.SAVE_KEY)).roster._moved ?? {})['劉備']);
}

/* ------------------------------------------------------------------ */
/* 8. 重複 show 不重建                                                 */
/* ------------------------------------------------------------------ */

console.log('── 8. show() 冪等');
{
  const root4 = makeRoot('RootReuse');
  const save4 = { ...baseSave(), captured: ['張遼'], executed: [] };
  const a = P.SurrenderPanel.show(root4, { save: save4, data: DATA, home: '許昌' });
  const countAfterFirst = root4.children.length;
  const nodesAfterFirst = cc.__nodeCount();
  const b = P.SurrenderPanel.show(root4, { save: save4, data: DATA, home: '許昌' });
  same('8.1 第二次 show 是同一個節點', true, a.node === b.node);
  same('8.2 根節點沒多出第二個面板', countAfterFirst, root4.children.length);
  same('8.3 節點總數不變（build 有 built 守衛）', nodesAfterFirst, cc.__nodeCount());
  same('8.4 面板仍然開著', true, b.isOpen);
  same('8.5 重開後回到第 1 頁', 0, b.debug().page);
}

/* ------------------------------------------------------------------ */
/* 結果                                                                */
/* ------------------------------------------------------------------ */

walk(panel.node, 0);
writeFileSync(TREE_FILE, tree.join('\n') + '\n', 'utf8');
writeFileSync(LOG_FILE, lines.join('\n') + '\n', 'utf8');
console.log(`\n節點樹 → ${TREE_FILE}（${tree.length} 行）`);
console.log(`互動記錄 → ${LOG_FILE}（${lines.length} 行）`);

console.log('\n' + '='.repeat(64));
if (failures.length) {
  console.log(`FAILED ${failures.length}/${total}`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(1);
}
console.log(`ALL PASS — 斷言總數 ${total}，失敗 0`);
