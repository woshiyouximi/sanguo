/**
 * `SaveSlots.ts` 的 node 斷言：純邏輯（索引 / meta / 四個操作）+ 面板（mock `cc`）。
 *
 * 跑法：`cd F:\sanguo\work\cocos_surrender && node slot_assert.mjs`
 * 前置：`node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json`
 *
 * 這裡的 storage 直接用 mock `cc` 的 `sys.localStorage`（背後是一個 Map），
 * 所以「讀檔要換掉 `sanguo_*_v1` 幾把鍵」是真的在 storage 上驗的，不是靠假物件。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const S = require('./_sim/SaveSlots.js');
const GameState = require('./_sim/GameState.js');

const storage = cc.sys.localStorage;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ------------------------------------------------------------------ */
/* 斷言器                                                              */
/* ------------------------------------------------------------------ */

let total = 0;
const failures = [];

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

function resetStorage() {
  cc.__storage.clear();
}

function get(key) {
  return storage.getItem(key);
}

function set(key, value) {
  storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* 測試資料                                                            */
/* ------------------------------------------------------------------ */

const GAME_A = {
  owned: ['許昌', '洛陽'],
  wins: 7,
  losses: 2,
  month: 118,
  gold: 500,
  monarch: '曹操',
  cities: { 許昌: { troops: 1200 }, 洛陽: { troops: 800 } },
  roster: { 許昌: ['曹操', '夏侯惇'], 洛陽: ['張遼', '夏侯惇'] },
};
const CITY_A = { 許昌: { pop: 90000 }, 洛陽: { pop: 70000 } };

const GAME_B = {
  owned: ['鄴'],
  wins: 1,
  losses: 5,
  month: 60,
  gold: 10,
  monarch: '袁紹',
  cities: { 鄴: { troops: 100 } },
  roster: { 鄴: ['袁紹'] },
};
const CITY_B = { 鄴: { pop: 40000 } };

/* ------------------------------------------------------------------ */
/* 1. 常量與小工具                                                     */
/* ------------------------------------------------------------------ */

console.log('── 1. 常量與小工具');
{
  same('1.1 索引鍵', 'sanguo_slots_v1', S.SLOTS_KEY);
  same('1.2 槽數', 10, S.SLOT_COUNT);
  same('1.3 槽名上限', 20, S.SLOT_NAME_MAX);
  same('1.4 本體鍵前綴', 'sanguo_slot_payload_v1_', S.SLOT_PAYLOAD_PREFIX);
  same('1.5 payloadKey(3)', 'sanguo_slot_payload_v1_3', S.payloadKey(3));
  same('1.6 payloadKey(越界) 收斂到 1', 'sanguo_slot_payload_v1_1', S.payloadKey(99));
  same('1.7 四個必換鍵都在', true, ['sanguo_campaign_v1', 'sanguo_city_v1', 'sanguo_items_v1', 'sanguo_monarch_v1'].every((key) => S.CAMPAIGN_KEYS.includes(key)));

  same('1.8 numOf(null)', 0, S.numOf(null));
  same('1.9 numOf("12")', 12, S.numOf('12'));
  same('1.10 numOf(NaN)', 0, S.numOf(Number.NaN));
  same('1.11 textOf(物件) 不吐 [object Object]', '', S.textOf({ a: 1 }));
  same('1.12 textOf 去空白', '曹操', S.textOf('  曹操  '));
  same('1.13 slotOrZero(0)', 0, S.slotOrZero(0));
  same('1.14 slotOrZero(11)', 0, S.slotOrZero(11));
  same('1.15 slotOrZero("10")', 10, S.slotOrZero('10'));
  same('1.16 monthLabel(1)', '第1年1月', S.monthLabel(1));
  same('1.17 monthLabel(118)', '第10年10月', S.monthLabel(118));
  same('1.18 monthLabel(0) 夾到 1', '第1年1月', S.monthLabel(0));
  same('1.19 dateText(0) 空字串', '', S.dateText(0));
  ok('1.20 dateText(有值) 有年月日', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(S.dateText(1700000000000)), S.dateText(1700000000000));
  same('1.21 emptyMeta().monthText', '第1年1月', S.emptyMeta().monthText);
  same('1.22 normalizeMeta 髒資料', { monarch: '', cities: 0, month: 1, monthText: '第1年1月', wins: 0, losses: 0, generals: 0, scenario: '', name: '' }, S.normalizeMeta('不是物件'));
  same('1.23 normalizeMeta 槽名截 20 字', 20, S.normalizeMeta({ name: '一二三四五六七八九十一二三四五六七八九十多出來' }).name.length);
}

/* ------------------------------------------------------------------ */
/* 2. 索引讀寫                                                         */
/* ------------------------------------------------------------------ */

console.log('── 2. 索引讀寫');
{
  resetStorage();
  const empty = S.readIndex();
  same('2.1 空盤 → active 1', 1, empty.active);
  same('2.2 空盤 → 沒有槽', 0, S.filledCount(empty));
  same('2.3 空盤 → 讀不到槽 1', null, S.slotRecord(empty, 1));

  set(S.SLOTS_KEY, '這不是 JSON');
  same('2.4 壞 JSON → 回預設', 1, S.readIndex().active);

  set(S.SLOTS_KEY, JSON.stringify({ active: 99, slots: { 3: { at: 5, meta: { monarch: '劉備' } }, 0: { at: 1 }, x: { at: 2 } } }));
  const repaired = S.readIndex();
  same('2.5 越界 active 夾到 1', 1, repaired.active);
  same('2.6 只留 1..10 的槽', ['3'], Object.keys(repaired.slots));
  same('2.7 缺欄位補齊', { monarch: '劉備', cities: 0, month: 1, monthText: '第1年1月', wins: 0, losses: 0, generals: 0, scenario: '', name: '' }, repaired.slots['3'].meta);

  repaired.active = 4;
  S.writeIndex(repaired);
  const raw = JSON.parse(get(S.SLOTS_KEY));
  same('2.8 寫回的形狀', { active: 4, slots: { 3: true } }.active, raw.active);
  same('2.9 寫回只帶 3 號槽', ['3'], Object.keys(raw.slots));
  same('2.10 往返一致', 4, S.readIndex().active);
}

/* ------------------------------------------------------------------ */
/* 3. metaOfSave                                                       */
/* ------------------------------------------------------------------ */

console.log('── 3. metaOfSave');
{
  const meta = S.metaOfSave(GAME_A);
  same('3.1 君主', '曹操', meta.monarch);
  same('3.2 城數', 2, meta.cities);
  same('3.3 年月', [118, '第10年10月'], [meta.month, meta.monthText]);
  same('3.4 勝敗', [7, 2], [meta.wins, meta.losses]);
  same('3.5 將數（跨城去重）', 3, meta.generals);
  same('3.6 預設沒有槽名', '', meta.name);

  same('3.7 沒有 owned 時用 cities 數', 1, S.metaOfSave(GAME_B).cities);
  same('3.8 君主可從 king 取', '孫權', S.metaOfSave({ king: '孫權' }).monarch);
  same('3.9 劇本名可傳', '官渡', S.metaOfSave({}, '官渡').scenario);
  same('3.10 空物件不炸', '第1年1月', S.metaOfSave({}).monthText);
}

/* ------------------------------------------------------------------ */
/* 4. saveToSlot                                                       */
/* ------------------------------------------------------------------ */

console.log('── 4. saveToSlot');
{
  resetStorage();
  set('sanguo_campaign_v1', GAME_A);
  set('sanguo_city_v1', CITY_A);
  set('sanguo_monarch_v1', { king: '曹操', force: '魏' });

  let persisted = 0;
  const record = S.saveToSlot(GAME_A, 2, { persist: () => { persisted += 1; }, now: 1700000000000 });
  same('4.1 先刷盤', 1, persisted);
  same('4.2 回傳的記錄時間戳', 1700000000000, record.at);
  same('4.3 meta 君主', '曹操', record.meta.monarch);
  same('4.4 active 指向剛存的槽', 2, S.readIndex().active);
  same('4.5 索引裡有 2 號槽', true, S.slotRecord(S.readIndex(), 2) !== null);

  const payload = S.readPayload(storage, 2);
  same('4.6 本體帶了 campaign', true, typeof payload['sanguo_campaign_v1'] === 'string');
  same('4.7 本體帶了 city', true, typeof payload['sanguo_city_v1'] === 'string');
  same('4.8 本體帶了 monarch', true, typeof payload['sanguo_monarch_v1'] === 'string');
  same('4.9 沒有 items 就不寫空鍵', undefined, payload['sanguo_items_v1']);
  same('4.10 JSON 進 JSON 出（存的內容沒被改）', GAME_A.owned, JSON.parse(payload['sanguo_campaign_v1']).owned);

  // 存回同一格不該洗掉改名
  S.renameSlot(2, '官渡');
  const again = S.saveToSlot(GAME_A, 2, { now: 1700000001000 });
  same('4.11 重存保留槽名', '官渡', again.meta.name);
  same('4.12 重存更新時間戳', 1700000001000, again.at);

  same('4.13 非法槽位回 null', null, S.saveToSlot(GAME_A, 0));
  same('4.14 非法槽位不寫索引', 1, S.filledCount(S.readIndex()));
}

/* ------------------------------------------------------------------ */
/* 5. loadFromSlot（核心：整組換鍵 + resetCache）                       */
/* ------------------------------------------------------------------ */

console.log('── 5. loadFromSlot');
{
  resetStorage();
  // 先玩 A 局，存到槽 1
  set('sanguo_campaign_v1', GAME_A);
  set('sanguo_city_v1', CITY_A);
  S.saveToSlot(GAME_A, 1, { now: 1700000000000 });
  same('5.1 槽 1 存好了', true, S.slotRecord(S.readIndex(), 1) !== null);

  // 換成 B 局（含 A 沒有的 items / battlelog）
  set('sanguo_campaign_v1', GAME_B);
  set('sanguo_city_v1', CITY_B);
  set('sanguo_items_v1', { bag: ['青龍偃月刀'] });
  set('sanguo_battlelog_v1', '["B 局的戰報"]');
  GameState.resetCache();
  same('5.2 現在盤面上是 B 局', ['鄴'], GameState.loadSave().owned);

  const result = S.loadFromSlot(1);
  same('5.3 讀檔成功', true, result.ok);
  same('5.4 回報的槽號', 1, result.slot);
  same('5.5 回報的鍵含 campaign', true, result.keys.includes('sanguo_campaign_v1'));
  same('5.6 回報的 meta 年月', '第10年10月', result.meta.monthText);

  same('5.7 campaign 鍵換回 A', GAME_A.owned, JSON.parse(get('sanguo_campaign_v1')).owned);
  same('5.8 city 鍵換回 A', CITY_A.許昌.pop, JSON.parse(get('sanguo_city_v1')).許昌.pop);
  same('5.9 A 沒有的 items 被刪掉', null, get('sanguo_items_v1'));
  same('5.10 A 沒有的 battlelog 被刪掉', null, get('sanguo_battlelog_v1'));
  same('5.11 active 改成 1', 1, S.readIndex().active);

  // 這一行是重點：loadFromSlot 內部 resetCache 了，所以 loadSave 會重新讀盤
  same('5.12 GameState 讀到 A（沒 resetCache 就會是 B）', ['許昌', '洛陽'], GameState.loadSave().owned);
  same('5.13 讀到的年月也是 A 的', 118, GameState.loadSave().month);

  // 失敗路徑
  const emptySlot = S.loadFromSlot(4);
  same('5.14 空槽不 ok', false, emptySlot.ok);
  same('5.15 空槽有中文原因', '槽 4 是空的', emptySlot.reason);
  same('5.16 非法槽號', '槽位不存在', S.loadFromSlot(0).reason);

  set(S.payloadKey(5), JSON.stringify({ sanguo_campaign_v1: '{壞掉的' }));
  const broken = S.loadFromSlot(5);
  same('5.17 壞檔不 ok', false, broken.ok);
  includes('5.18 壞檔原因寫損壞', '損壞', broken.reason);
  same('5.19 壞檔不動盤面', ['許昌', '洛陽'], GameState.loadSave().owned);
}

/* ------------------------------------------------------------------ */
/* 6. deleteSlot / setActiveSlot / renameSlot                          */
/* ------------------------------------------------------------------ */

console.log('── 6. 刪 / 換槽 / 改名');
{
  resetStorage();
  set('sanguo_campaign_v1', GAME_A);
  S.saveToSlot(GAME_A, 1);
  S.saveToSlot(GAME_A, 3);

  same('6.1 刪掉有的槽回 true', true, S.deleteSlot(1));
  same('6.2 索引少一格', 1, S.filledCount(S.readIndex()));
  same('6.3 本體也刪了', null, get(S.payloadKey(1)));
  same('6.4 再刪回 false', false, S.deleteSlot(1));
  same('6.5 別的槽沒事', true, S.slotRecord(S.readIndex(), 3) !== null);

  same('6.6 換槽回新槽號', 5, S.setActiveSlot(5));
  same('6.7 索引的 active 改了', 5, S.readIndex().active);
  same('6.8 換槽不動槽數', 1, S.filledCount(S.readIndex()));

  same('6.9 改名成功', true, S.renameSlot(3, '  合肥之戰  '));
  same('6.10 改名去空白', '合肥之戰', S.slotRecord(S.readIndex(), 3).meta.name);
  same('6.11 改名留空＝回自動名', true, S.renameSlot(3, '   '));
  same('6.12 名字清空', '', S.slotRecord(S.readIndex(), 3).meta.name);
  same('6.13 改空槽回 false', false, S.renameSlot(8, 'x'));
  same('6.14 改非法槽回 false', false, S.renameSlot(0, 'x'));
}

/* ------------------------------------------------------------------ */
/* 7. 文案                                                             */
/* ------------------------------------------------------------------ */

console.log('── 7. 面板文案');
{
  resetStorage();
  const emptyLine = S.slotLines(null, 2, 1);
  same('7.1 空槽第一行', '槽 2', emptyLine.l1);
  same('7.2 空槽第二行', '空槽 · 可存入目前進度', emptyLine.l2);
  same('7.3 空槽第三行空白', '', emptyLine.l3);

  set('sanguo_campaign_v1', GAME_A);
  S.saveToSlot(GAME_A, 2, { now: 1700000000000 });
  S.renameSlot(2, '官渡');
  const index = S.readIndex();
  const filledLine = S.slotLines(S.slotRecord(index, 2), 2, 2);
  same('7.4 有檔第一行（槽名 + 使用中）', '槽 2 · 官渡 · 使用中', filledLine.l1);
  includes('7.5 第二行有年月/城/勝敗', '第10年10月 · 城2 · 7勝2敗', filledLine.l2);
  includes('7.6 第二行有時間', '20', filledLine.l2);
  same('7.7 第三行君主 + 將數', '君主曹操 · 將3', filledLine.l3);

  const notActive = S.slotLines(S.slotRecord(index, 2), 2, 5);
  same('7.8 不是使用中就不加 tag', '槽 2 · 官渡', notActive.l1);
  same('7.9 副標寫目標槽與已用數', true, S.subText(index).includes('槽 2') && S.subText(index).includes('1 / 10'));
  same('7.10 副標提到切換', true, S.subText(index).includes('切換'));
}

/* ------------------------------------------------------------------ */
/* 8. 面板（mock cc）                                                  */
/* ------------------------------------------------------------------ */

console.log('── 8. 面板');
{
  resetStorage();
  set('sanguo_campaign_v1', GAME_A);
  set('sanguo_city_v1', CITY_A);
  GameState.resetCache();
  GameState.loadSave();

  const root = new cc.Node('Root');
  root.addComponent(cc.UITransform).setContentSize(750, 1334);

  const loads = [];
  const closes = [];
  const panel = S.SaveSlotsPanel.show(root, {
    save: GAME_A,
    onLoad: (result) => loads.push(result.slot),
    onClose: () => closes.push(1),
  });

  same('8.1 節點名', 'SaveSlotsPanel', panel.node.name);
  same('8.2 開著', true, panel.isOpen);
  same('8.3 面板子節點數（2 畫布 + 3 表頭 + 10×6 + 2 底鍵）', 67, panel.node.children.length);
  same('8.4 空盤：已用 0 槽', 0, panel.debug().filled);
  same('8.5 預設目標槽 1', 1, panel.debug().active);
  includes('8.6 底部說明是操作提示', '存＝寫入該槽', panel.debug().msg);
  includes('8.7 副標寫目標槽', '存檔目標：槽 1', panel.debug().sub);
  same('8.8 十行都在', 10, panel.debug().rows.length);
  same('8.9 第一行沒有檔', '槽 1', panel.debug().rows[0]);
  same('8.10 第十行沒有檔', '槽 10', panel.debug().rows[9]);

  const frame = panel.node.getChildByName('SlotFrame').getComponent('Graphics');
  ok('8.11 有畫圓角矩形', frame.calls.roundRect >= 20, frame.calls.roundRect);
  ok('8.12 有描邊', frame.calls.stroke >= 10, frame.calls.stroke);
  ok('8.13 重畫前先 clear', frame.calls.clear >= 1, frame.calls.clear);

  const hits0 = panel.hitList.map((hit) => hit.label);
  same('8.14 空盤命中：10 存 + 10 列 + 2 底鍵', 22, hits0.length);
  same('8.15 空盤沒有讀/刪命中', false, hits0.some((label) => label.endsWith(':load') || label.endsWith(':del')));
  same('8.16 有底部存檔鍵', true, hits0.includes('foot:save'));
  same('8.17 有底部關閉鍵', true, hits0.includes('foot:close'));

  // 底部「存到當前槽」
  const footSave = panel.hitList.find((hit) => hit.label === 'foot:save');
  cc.__emitTouch(footSave.rect.x + footSave.rect.w / 2 - 375, 667 - (footSave.rect.y + footSave.rect.h / 2));
  same('8.18 存成功：已用 1 槽', 1, panel.debug().filled);
  includes('8.19 提示條回報槽號與年月', '已存入當前槽 1 · 第10年10月', panel.debug().msg);
  same('8.20 第 1 行變有檔', true, panel.debug().rows[0].startsWith('槽 1'));
  includes('8.21 使用中 tag 出現', '使用中', panel.debug().rows[0]);
  same('8.22 有檔的列多出讀/刪命中（存/讀/刪 + 整列 = 4）', 24, panel.hitList.length);
  same('8.23 存檔本體真的寫進 storage', true, typeof get(S.payloadKey(1)) === 'string');
  await flush();

  // 點第 3 列 = 換槽
  const row3 = panel.hitList.find((hit) => hit.label === 'slot:3:row');
  cc.__emitTouch(row3.rect.x + 20 - 375, 667 - (row3.rect.y + row3.rect.h / 2));
  same('8.24 換槽：目標變槽 3', 3, panel.debug().active);
  includes('8.25 提示條說換到槽 3', '存檔目標改為槽 3', panel.debug().msg);
  same('8.26 槽 1 的「使用中」標記消失', false, panel.debug().rows[0].includes('使用中'));

  // 讀檔（槽 1）→ onLoad + 收面板
  const slot1Load = panel.hitList.find((hit) => hit.label === 'slot:1:load');
  cc.__emitTouch(slot1Load.rect.x + slot1Load.rect.w / 2 - 375, 667 - (slot1Load.rect.y + slot1Load.rect.h / 2));
  same('8.27 讀檔回呼收到槽 1', [1], loads);
  same('8.28 讀完就收面板（同 web 的 closeOverlays）', false, panel.isOpen);
  same('8.29 收面板回呼一次', 1, closes.length);
  same('8.30 觸控監聽解綁', 0, (cc.__listeners.get('touch-end') ?? []).length);
  same('8.31 讀完 active 回到 1', 1, S.readIndex().active);
  same('8.32 GameState 也能讀到（resetCache 生效）', ['許昌', '洛陽'], GameState.loadSave().owned);

  // 重開：同一個節點，不重建
  const nodesBefore = cc.__nodeCount();
  const again = S.SaveSlotsPanel.show(root, { save: GAME_A, onLoad: (result) => loads.push(result.slot) });
  same('8.33 重開復用同一個節點', true, again.node === panel.node);
  same('8.34 沒有重建節點', nodesBefore, cc.__nodeCount());
  same('8.35 重開時資料還在', 1, again.debug().filled);
  same('8.36 重開後有人監聽', 1, (cc.__listeners.get('touch-end') ?? []).length);

  // 刪掉槽 1
  const del1 = again.hitList.find((hit) => hit.label === 'slot:1:del');
  cc.__emitTouch(del1.rect.x + del1.rect.w / 2 - 375, 667 - (del1.rect.y + del1.rect.h / 2));
  same('8.37 刪完變 0 槽', 0, again.debug().filled);
  includes('8.38 提示條說刪了槽 1', '已刪除槽 1', again.debug().msg);
  same('8.39 刪完那行回到空槽', '槽 1', again.debug().rows[0]);
  same('8.40 本體鍵也清了', null, get(S.payloadKey(1)));

  // 存到槽 2（用列上的「存」鍵）
  const save2 = again.hitList.find((hit) => hit.label === 'slot:2:save');
  cc.__emitTouch(save2.rect.x + save2.rect.w / 2 - 375, 667 - (save2.rect.y + save2.rect.h / 2));
  same('8.41 槽 2 存好', true, S.slotRecord(S.readIndex(), 2) !== null);
  same('8.42 active 跟到槽 2', 2, again.debug().active);
  includes('8.43 提示條寫槽 2 與年月', '已存入槽 2 · 第10年10月', again.debug().msg);

  // 關閉
  const close = again.hitList.find((hit) => hit.label === 'foot:close');
  cc.__emitTouch(close.rect.x + close.rect.w / 2 - 375, 667 - (close.rect.y + close.rect.h / 2));
  same('8.44 關閉後 isOpen=false', false, again.isOpen);
  same('8.45 節點收起', false, again.node.active);
  same('8.46 關閉解綁觸控', 0, (cc.__listeners.get('touch-end') ?? []).length);

  // 讀一個被刪掉的槽 → 面板不該收、要顯示原因
  const reopened = S.SaveSlotsPanel.show(root, { save: GAME_A });
  const staleLoad = { rect: S.btnRect(0, 1), act: 'load', slot: 1, label: 'slot:1:load' };
  reopened.tap(staleLoad.rect.x + staleLoad.rect.w / 2, staleLoad.rect.y + staleLoad.rect.h / 2);
  same('8.47 點到空槽的「讀」不會收面板', true, reopened.isOpen);
  same('8.48 直接把 tap 打進去也不炸', true, typeof reopened.debug().msg === 'string');
}

/* ------------------------------------------------------------------ */
/* 結果                                                                */
/* ------------------------------------------------------------------ */

console.log('\n' + '='.repeat(64));
if (failures.length) {
  console.log(`FAILED ${failures.length}/${total}`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(1);
}
console.log(`ALL PASS — 斷言總數 ${total}，失敗 0`);
