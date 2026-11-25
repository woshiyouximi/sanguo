// @ts-nocheck —— 被测的是 web/*.html / web/*.js（浏览器端无类型 ESM，tsconfig 没有 allowJs）；
// 本文件按 node:test 跑运行时断言，断言一律 assert/strict。
//
// R86 web 侧三处断链的守护（project/116_全流程演练3.md 留下的真 bug）：
//   S1-1 敵軍抵達不驗歸屬：目標城丟了還被拉成「守城戰」，撤退後下一支又來。
//        修法：campaign.html 的 `[[MARCH_ARRIVE_CORE]]` 純函數 planEnemyArrivals()，
//        只有「城還是我方的」才進 battles，其餘走 passes（佔領/路過 + 一條戰報）。
//   S2-2 裝備孤島：items.html 寫 sanguo_items_v1，saves.js 的 equipOf() 全倉零調用。
//        修法：saves.js 的 equipSlotsOf/setEquipSlots（v3 可選 equip 欄 + weapon/horse/thing
//        鏡像）、items_model.js 的 equipNames/equipSeqs/bonusOfNames、campaign.html 的
//        `[[EQUIP_CORE]]` combatStatsOf()（戰鬥入口 `?astr=/?aint=`）。
//   S2-4 遷移提示死代碼：loadStore 內部已升級，campaign 再升一次 → from===3 → 提示段永不執行、
//        v2 老檔永不寫回。修法：loadStore 記 `store.upgraded`，boot 立刻 saveStore 寫回 + 提示一次。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Saves from '../web/saves.js';
import * as Items from '../web/items_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const ITEM_ROWS = readJson('../data/items.json');
const S0 = SCEN[0];

// 註冊表是 items.html / campaign.html 開頁時做的事；測試手動補上同一份
Items.registerItems(ITEM_ROWS);

const HTML = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

/** 從 campaign.html 抽 `[[NAME]] … [[/NAME]]` 段（與 tests/fatigue.test.ts 同一手法） */
function pickBlock(name) {
  const hit = HTML.match(new RegExp('/\\/ \\[\\[' + name + '\\]\\][^\\n]*\\n([\\s\\S]*?)\\/\\/ \\[\\[/' + name + '\\]\\]'));
  assert.ok(hit, 'campaign.html 裡找不到 [[' + name + ']] 段');
  return hit[1];
}

const MARCH = new Function(pickBlock('MARCH_ARRIVE_CORE') + '\nreturn { planEnemyArrivals };')();
const EQUIP = new Function('Saves', pickBlock('EQUIP_CORE') + '\nreturn { combatStatsOf };')(Saves);

/** 內存版 localStorage（saves.js 只要 getItem/setItem/removeItem） */
function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    raw: (k) => (map.has(k) ? map.get(k) : null),
    keys: () => [...map.keys()],
  };
}

/** 一份新存檔（v3 完整快照） */
function freshSnapshot(sc = S0) {
  return Saves.newCampaign(sc);
}

/** 把 v3 快照倒回 v2：刪掉 v3 才有的 7 個鍵（ledger 本來就可能不存在） */
function backToV2(snap) {
  const s = JSON.parse(JSON.stringify(snap));
  s.v = 2;
  for (const k of ['year', 'yearFlag', 'ledger', 'generalStatus', 'weapon', 'horse', 'thing']) delete s[k];
  return s;
}

/** 造一個「磁碟上是 rawSlots」的存檔容器（不經過 saveStore，才能模擬真的老檔） */
function diskWith(v2Snapshot, index = 0) {
  const slots = Array.from({ length: Saves.SLOT_COUNT }, () => null);
  slots[index] = { snapshot: v2Snapshot, ts: 1234 };
  return JSON.stringify({ v: Saves.STORE_VERSION, last: index + 1, slots });
}

// 取一件真裝備（按 items.json 的欄位找，不寫死序號 —— 資料改版時測試不會假紅）
const firstWith = (pred) => ITEM_ROWS.find((it) => pred(it));
const weaponRow = firstWith((it) => Items.slotOf(it) === 'weapon' && Saves.num(it.STR) > 0);
const bookRow = firstWith((it) => Items.slotOf(it) === 'book' && Saves.num(it.INT) > 0);
const amuletRow = firstWith((it) => Items.slotOf(it) === 'amulet' && Saves.num(it.Loyal) > 0);
const horseRow = firstWith((it) => Items.slotOf(it) === 'horse');

const W_SEQ = weaponRow.Sequence;
const W_NAME = weaponRow.Name;
const W_STR = Saves.num(weaponRow.STR);
const B_SEQ = bookRow.Sequence;
const B_NAME = bookRow.Name;
const B_INT = Saves.num(bookRow.INT);
const A_SEQ = amuletRow.Sequence;
const A_NAME = amuletRow.Name;
const H_SEQ = horseRow.Sequence;
const H_NAME = horseRow.Name;

// ================================================================ S2-2 裝備進快照
test('S2-2 ①：setEquipSlots 寫入後四槽齊、equipOf() 三槽鏡像一致（equipOf 不再零調用）', () => {
  const snap = freshSnapshot();
  const got = Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME, horse: H_NAME, book: B_NAME, amulet: A_NAME });
  assert.deepEqual(got, { weapon: W_NAME, horse: H_NAME, book: B_NAME, amulet: A_NAME });
  // 舊接口只認三槽：book 落在 thing（原作 0x…THING 就是書），amulet 不進鏡像
  assert.deepEqual(Saves.equipOf(snap, '關羽'), { weapon: W_NAME, horse: H_NAME, thing: B_NAME });
  assert.deepEqual(snap.equip['關羽'], { weapon: W_NAME, horse: H_NAME, book: B_NAME, amulet: A_NAME });
});

test('S2-2 ②：equipSlotsOf 對沒裝備/不存在的武將回四空槽，不拋', () => {
  const snap = freshSnapshot();
  assert.deepEqual(Saves.equipSlotsOf(snap, '路人甲'), { weapon: '', horse: '', book: '', amulet: '' });
  assert.deepEqual(Saves.equipSlotsOf(null, '關羽'), { weapon: '', horse: '', book: '', amulet: '' });
});

test('S2-2 ③：卸下（給空字串）會同時清掉 equip 行與三槽鏡像，不留幽靈裝備', () => {
  const snap = freshSnapshot();
  Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME, horse: H_NAME });
  Saves.setEquipSlots(snap, '關羽', { weapon: '', horse: '' });
  assert.deepEqual(Saves.equipOf(snap, '關羽'), { weapon: '', horse: '', thing: '' });
  assert.equal(snap.equip['關羽'], undefined, '整行空了就該把 equip[名] 刪掉');
});

test('S2-2 ④：items_model 的 equipNames/equipSeqs 對真資料往返一致（四槽含 book/amulet）', () => {
  const eq = { weapon: W_SEQ, horse: H_SEQ, book: B_SEQ, amulet: A_SEQ };
  const names = Items.equipNames(eq);
  assert.deepEqual(names, { weapon: W_NAME, horse: H_NAME, book: B_NAME, amulet: A_NAME });
  assert.deepEqual(Items.equipSeqs(names), eq);
});

test('S2-2 ⑤：bonusOfNames 把兵器 STR / 書 INT / 飾品 Loyal 加起來（真 items.json）', () => {
  const bonus = Items.bonusOfNames({ weapon: W_NAME, book: B_NAME, amulet: A_NAME });
  assert.equal(bonus.STR, W_STR);
  assert.equal(bonus.INT, B_INT);
  assert.ok(bonus.Loyal > 0, '飾品應該帶忠誠');
  assert.ok(Items.bonusOfNames({}).STR === 0, '沒裝備就是 0');
  assert.ok(Items.bonusOfNames({ weapon: '不存在的神器' }).STR === 0, '未知名不拋、算 0');
});

test('S2-2 ⑥：normalizeBagEquip 只留四槽合法序號（items.html 的存檔可能很髒）', () => {
  const raw = { 關羽: { weapon: W_SEQ, book: B_SEQ, bag: 99 }, 張飛: { nope: 1 }, 趙雲: { weapon: 999999 } };
  const got = Items.normalizeBagEquip(raw);
  assert.deepEqual(Object.keys(got).sort(), ['關羽']);
  assert.deepEqual(got['關羽'], { weapon: W_SEQ, book: B_SEQ });
  assert.deepEqual(Items.normalizeBagEquip(null), {});
});

test('S2-2 ⑦：裝備寫進快照 → 存槽 → 讀回還在（槽快照自己帶裝備，換機也跟得走）', () => {
  const store = Saves.emptyStore();
  const snap = freshSnapshot();
  Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME, amulet: A_NAME });
  Saves.writeSlot(store, 0, snap, { ts: 111 });
  const back = Saves.getSnapshot(store, 0);
  assert.deepEqual(Saves.equipSlotsOf(back, '關羽'), { weapon: W_NAME, horse: '', book: '', amulet: A_NAME });
});

test('S2-2 ⑧：整份 store 過一次 JSON 磁碟往返，裝備仍在（equip 是可選欄，不是臨時欄）', () => {
  const mem = memStorage();
  const store = Saves.emptyStore();
  const snap = freshSnapshot();
  Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME, book: B_NAME });
  Saves.writeSlot(store, 0, snap, { ts: 222 });
  assert.ok(Saves.saveStore(store, mem));
  const disk = JSON.parse(mem.raw(Saves.SAVE_KEY));
  assert.equal(disk.slots[0].snapshot.equip['關羽'].weapon, W_NAME, '磁碟上的快照要帶 equip');
  const reloaded = Saves.loadStore(mem);
  assert.deepEqual(Saves.equipSlotsOf(Saves.getSnapshot(reloaded, 0), '關羽'),
    { weapon: W_NAME, horse: '', book: B_NAME, amulet: '' });
});

test('S2-2 ⑨：帶 equip 的 v3 快照仍是「當前版本」（不會因新欄位被判 changed、不回舊行為）', () => {
  const snap = freshSnapshot();
  Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME });
  const up = Saves.upgradeSnapshot(snap);
  assert.equal(up.changed, false);
  assert.equal(up.from, Saves.SNAPSHOT_VERSION);
  assert.equal(up.snapshot, snap, '當前版本原樣返回（不深拷貝）');
});

test('S2-2 ⑩：metaFromSnapshot 的 equipCount 把「只有飾品」的武將也算進去', () => {
  const store = Saves.emptyStore();
  const snap = freshSnapshot();
  Saves.setEquipSlots(snap, '關羽', { amulet: A_NAME });   // 只在 equip 欄、三槽鏡像全空
  Saves.writeSlot(store, 0, snap, { ts: 333 });
  const norm = Saves.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.equal(norm.slots[0].equipCount, 1);
});

test('S2-2 ⑪：combatStatsOf 基礎 + 裝備（純函數，戰鬥入口拿的就是它）', () => {
  const noEq = EQUIP.combatStatsOf({ str: 56, int: 40 }, Items.bonusOfNames({}));
  assert.deepEqual(noEq, { str: 56, int: 40, strBonus: 0, intBonus: 0 });
  const withEq = EQUIP.combatStatsOf({ str: 56, int: 40 }, Items.bonusOfNames({ weapon: W_NAME, book: B_NAME }));
  assert.equal(withEq.str, 56 + W_STR, '武力 = 基礎 + 裝備');
  assert.equal(withEq.int, 40 + B_INT, '智力 = 基礎 + 裝備');
  assert.equal(withEq.strBonus, W_STR);
  assert.equal(withEq.intBonus, B_INT);
  // 髒輸入不炸：缺欄位 / null / 字串
  assert.deepEqual(EQUIP.combatStatsOf(null, null), { str: 0, int: 0, strBonus: 0, intBonus: 0 });
  assert.equal(EQUIP.combatStatsOf({ str: '7', int: '' }, { STR: '3' }).str, 10);
  assert.equal(EQUIP.combatStatsOf({ str: -5 }, { STR: 2 }).str, 0, '夾到 0，不給負武力');
});

test('S2-2 ⑫：campaign 的三條戰鬥入口都把 astr/aint 寫進 query（裝備才進得了戰鬥）', () => {
  // defendUrl / marchDirectQuery / encounterUrl 各寫一組；少一條就有一條路徑漏裝備
  const hits = HTML.match(/q\.set\('astr', String\(st\.str\)\)/g) || [];
  assert.ok(hits.length >= 3, `astr 應該在 defendUrl/marchDirectQuery/encounterUrl 都出現，實際 ${hits.length}`);
  assert.ok((HTML.match(/q\.set\('aint', String\(st\.int\)\)/g) || []).length >= 3);
  assert.match(HTML, /const st = statsOf\(g, g\.name\);/);
});

test('S2-2 ⑬：campaign 的裝備鏡像是「先清空再重建」（卸下才會真的生效）', () => {
  assert.match(HTML, /function syncEquipFromBag\(\)/);
  assert.match(HTML, /save\.weapon = \{\};\s*\n\s*save\.horse = \{\};\s*\n\s*save\.thing = \{\};\s*\n\s*save\.equip = \{\};/);
  assert.match(HTML, /Saves\.setEquipSlots\(save, name, names\)/);
  // 三個入口都要鏡像：boot / snapshotForSave / render
  assert.ok((HTML.match(/syncEquipFromBag\(\)/g) || []).length >= 3, 'boot、寫檔前、每次 render 都要同步');
});

test('S2-2 ⑭：equipOf() 在大地圖有真實消費者（不再全倉零調用）', () => {
  // 修之前：grep "equipOf(" 在 web/*.html 一個都沒有，裝備寫進 sanguo_items_v1 就沉底。
  // 現在每次 render 的武將數值／戰鬥建局都經過 equipNamesOf → Saves.equipOf。
  assert.ok(HTML.includes('Saves.equipOf('), 'campaign.html 必須直接調 equipOf');
  const fn = HTML.slice(HTML.indexOf('function equipNamesOf'), HTML.indexOf('function equipBonusOf'));
  assert.match(fn, /Saves\.equipOf\(save, name\)/);
  assert.match(fn, /Saves\.equipSlotsOf\(save, name\)/);
  // 顯示鏈與戰鬥鏈都要經過它
  assert.match(HTML, /function equipBonusOf\(name\)[\s\S]*?equipNamesOf\(name\)/);
  assert.match(HTML, /function statsOf\(row, name\)[\s\S]*?equipBonusOf\(name\)/);
});

// ================================================================ S1-1 敵軍抵達驗歸屬
const ctxOf = (owned, ownerMap = {}, forceMap = {}, myForce = '') => ({
  owned,
  myForce,
  ownerOf: (n) => ownerMap[n] || '',
  forceOf: (n) => forceMap[n] || '',
});
const armyB = (from, to, troops = 120) => ({ id: 1, side: 'B', from, to, progress: 1, troops });

test('S1-1 ①：抵達但城已不是自己的 → 不產生戰鬥、產生一條戰報', () => {
  const plan = MARCH.planEnemyArrivals([armyB('汝南', '宛')], ctxOf(['北平'], { 宛: '' }));
  assert.equal(plan.battles.length, 0, '不能拉守城戰');
  assert.equal(plan.passes.length, 1);
  assert.equal(plan.logs.length, 1, '剛好一條戰報');
  assert.equal(plan.logs[0].kind, 'lost');
  assert.match(plan.logs[0].text, /敵 軍 佔 領：汝南 → 宛/);
  assert.match(plan.logs[0].text, /不進戰鬥/);
});

test('S1-1 ②：抵達且城還是自己的 → 產生戰鬥、不寫佔領戰報', () => {
  const plan = MARCH.planEnemyArrivals([armyB('汝南', '北平')], ctxOf(['北平'], { 北平: '袁紹' }, { 汝南: '袁術' }, '劉備'));
  assert.equal(plan.battles.length, 1);
  assert.equal(plan.battles[0].to, '北平');
  assert.equal(plan.passes.length, 0);
  assert.equal(plan.logs.length, 0, '守城戰由調用方寫「敵軍抵達」那條，這裡不重複');
});

test('S1-1 ③：城已被**別家勢力**佔著 → 敵軍佔領（換 owner），仍然不進戰鬥', () => {
  const plan = MARCH.planEnemyArrivals([armyB('汝南', '宛')], ctxOf(['北平'], { 宛: '劉表' }, { 汝南: '袁術' }));
  assert.equal(plan.battles.length, 0);
  assert.equal(plan.passes[0].kind, 'occupy');
  assert.equal(plan.passes[0].owner, '劉表');
  assert.equal(plan.passes[0].force, '袁術');
});

test('S1-1 ④：敵軍只是穿過自己家的城（owner === 出發勢力）→ 記「路過」，不改歸屬', () => {
  const plan = MARCH.planEnemyArrivals([armyB('汝南', '壽春')], ctxOf(['北平'], { 壽春: '袁術' }, { 汝南: '袁術' }));
  assert.equal(plan.battles.length, 0);
  assert.equal(plan.passes[0].kind, 'pass');
  assert.equal(plan.logs[0].kind, 'atk');
  assert.match(plan.logs[0].text, /敵 軍 路 過：汝南 → 壽春/);
});

test('S1-1 ⑤：owner 已被記成我方勢力（只是沒進 owned 的殘狀態）→ 仍算我的城，要打', () => {
  const plan = MARCH.planEnemyArrivals([armyB('汝南', '北平')], ctxOf([], { 北平: '劉備' }, { 汝南: '袁術' }, '劉備'));
  assert.equal(plan.battles.length, 1);
  assert.equal(plan.logs.length, 0);
});

test('S1-1 ⑥：空目標 / 缺欄位 / 非陣列輸入 → 不拋，且不產生戰鬥', () => {
  assert.deepEqual(MARCH.planEnemyArrivals(null, null), { battles: [], passes: [], logs: [] });
  const noTarget = MARCH.planEnemyArrivals([{ id: 9, side: 'B', from: '汝南', progress: 1 }], ctxOf(['北平']));
  assert.equal(noTarget.battles.length, 0);
  assert.equal(noTarget.passes.length, 1);
  assert.equal(noTarget.passes[0].kind, 'pass');
  assert.equal(noTarget.logs.length, 1);
});

test('S1-1 ⑦：同一批裡「一支打守城、一支只是路過」→ 分開處理（互不影響）', () => {
  const plan = MARCH.planEnemyArrivals(
    [armyB('汝南', '北平'), armyB('汝南', '宛')],
    ctxOf(['北平'], { 北平: '劉備', 宛: '' }, { 汝南: '袁術' }, '劉備'),
  );
  assert.equal(plan.battles.length, 1);
  assert.equal(plan.battles[0].to, '北平');
  assert.equal(plan.passes.length, 1);
  assert.equal(plan.passes[0].to, '宛');
  assert.equal(plan.logs.length, 1);
});

test('S1-1 ⑧：純函數 —— 不改行軍、不改 ctx（調用方自己 removeArmy/寫 owner）', () => {
  const army = armyB('汝南', '宛');
  const owned = ['北平'];
  const ownerMap = { 宛: '' };
  const plan = MARCH.planEnemyArrivals([army], ctxOf(owned, ownerMap, { 汝南: '袁術' }));
  assert.equal(plan.battles.length + plan.passes.length, 1);
  assert.deepEqual(army, { id: 1, side: 'B', from: '汝南', to: '宛', progress: 1, troops: 120 });
  assert.deepEqual(owned, ['北平']);
  assert.deepEqual(ownerMap, { 宛: '' });
});

test('S1-1 ⑨：campaign 的敵抵段真的接上了 planEnemyArrivals（源碼契約）', () => {
  assert.match(HTML, /const plan = planEnemyArrivals\(bArr, \{/);
  assert.match(HTML, /for \(const p of plan\.passes\) \{/);
  assert.match(HTML, /removeArmy\(p\.army\.id\);/);
  assert.match(HTML, /for \(const l of plan\.logs\) pushLog\(l\.text, l\.kind\);/);
  // defendUrl 只能出現在「真的還有城要守」的分支裡
  const seg = HTML.slice(HTML.indexOf('const plan = planEnemyArrivals(bArr'), HTML.indexOf('// 3) 我軍抵達敵城下'));
  assert.ok(seg.length > 200, '找不到敵抵段的邊界');
  assert.ok(seg.indexOf('plan.battles.length') >= 0);
  assert.ok(seg.indexOf('defendUrl(atk)') > seg.indexOf('plan.battles.length'));
});

// ================================================================ S2-4 遷移只升一次 + 寫回 + 提示一次
test('S2-4 ⑭：v2 老檔載入 → 升級清單有那格（from 2 / to 3），快照已是 v3', () => {
  const mem = memStorage();
  mem.setItem(Saves.SAVE_KEY, diskWith(backToV2(freshSnapshot())));
  const store = Saves.loadStore(mem);
  assert.deepEqual(store.upgraded, [{ slot: 1, from: 2, to: 3 }]);
  assert.equal(Saves.getSnapshot(store, 0).v, Saves.SNAPSHOT_VERSION);
});

test('S2-4 ⑮：升級後立刻 saveStore 寫回 → 再載入就沒有升級了（提示只出現一次）', () => {
  const mem = memStorage();
  mem.setItem(Saves.SAVE_KEY, diskWith(backToV2(freshSnapshot())));
  const first = Saves.loadStore(mem);
  assert.equal(first.upgraded.length, 1);
  assert.ok(Saves.saveStore(first, mem), '寫回必須成功');
  const disk = JSON.parse(mem.raw(Saves.SAVE_KEY));
  assert.equal(disk.slots[0].snapshot.v, Saves.SNAPSHOT_VERSION, '磁碟上那格要變成 v3');
  const second = Saves.loadStore(mem);
  assert.deepEqual(second.upgraded, [], '第二次開頁不該再提示');
  assert.equal(Saves.getSnapshot(second, 0).v, Saves.SNAPSHOT_VERSION);
});

test('S2-4 ⑯：v3 當前檔載入 → 完全沒有升級記錄（不提示）', () => {
  const mem = memStorage();
  const store = Saves.emptyStore();
  Saves.writeSlot(store, 0, freshSnapshot(), { ts: 1 });
  Saves.saveStore(store, mem);
  const loaded = Saves.loadStore(mem);
  assert.deepEqual(loaded.upgraded, []);
  assert.equal(Saves.emptyStore().upgraded.length, 0);
});

test('S2-4 ⑰：無版本老檔（v0）→ 一跳記到 v3，from 記 0（不是 2）', () => {
  const mem = memStorage();
  const old = backToV2(freshSnapshot());
  delete old.v;                                   // 真的老檔：連 v 都沒有
  mem.setItem(Saves.SAVE_KEY, diskWith(old));
  const store = Saves.loadStore(mem);
  assert.deepEqual(store.upgraded, [{ slot: 1, from: 0, to: 3 }]);
});

test('S2-4 ⑱：升級記錄的槽號是 1 基（第 3 槽 → slot 3）', () => {
  const mem = memStorage();
  mem.setItem(Saves.SAVE_KEY, diskWith(backToV2(freshSnapshot()), 2));
  const store = Saves.loadStore(mem);
  assert.deepEqual(store.upgraded, [{ slot: 3, from: 2, to: 3 }]);
});

test('S2-4 ⑲：upgraded 是瞬時欄 —— 絕不寫進磁碟 JSON', () => {
  const mem = memStorage();
  mem.setItem(Saves.SAVE_KEY, diskWith(backToV2(freshSnapshot())));
  const store = Saves.loadStore(mem);
  Saves.saveStore(store, mem);
  assert.ok(!('upgraded' in JSON.parse(mem.raw(Saves.SAVE_KEY))), '磁碟 store 不該有 upgraded');
  assert.ok('upgraded' in store, '記憶體裡的 store 仍有（boot 要用）');
});

test('S2-4 ⑳：campaign boot 用 bootUpgrades 寫回並提示一次（源碼契約 + 文案 v{n}→v{m}）', () => {
  assert.match(HTML, /const bootUpgrades = Array\.isArray\(store\.upgraded\) \? store\.upgraded\.slice\(\) : \[\];/);
  assert.match(HTML, /else if \(bootUpgrades\.length\) \{/);
  assert.match(HTML, /Saves\.saveStore\(store, storage\);/);
  assert.match(HTML, /notice\(`舊存檔格式已自動升級：v\$\{up0\.from\} → v\$\{up0\.to\}（槽 \$\{up0\.slot\}）\$\{more\}`/);
  // 死代碼檢查：snapshotUpgrade 這段仍然在，但只在「手動讀槽」時當兜底（不能是唯一分支）
  assert.match(HTML, /else if \(snapshotUpgrade\) \{/);
  assert.ok(HTML.indexOf('bootUpgrades.length') < HTML.indexOf('snapshotUpgrade) {'));
});

// ================================================================ 交叉：三條修復互不破壞
test('R86 收尾：裝備 + v2 升級同時發生時，兩件事都成立', () => {
  const mem = memStorage();
  const snap = backToV2(freshSnapshot());
  Saves.setEquipSlots(snap, '關羽', { weapon: W_NAME });
  mem.setItem(Saves.SAVE_KEY, diskWith(snap));
  const store = Saves.loadStore(mem);
  assert.equal(store.upgraded.length, 1, '版本照樣要升');
  const loaded = Saves.getSnapshot(store, 0);
  assert.equal(loaded.v, Saves.SNAPSHOT_VERSION);
  assert.equal(Saves.equipSlotsOf(loaded, '關羽').weapon, W_NAME, '升級不能把裝備弄丟');
});

test('R86 收尾：items.html 那份存檔能整段搬進快照（bag → equip → 加成）', () => {
  const bag = { equip: { 關羽: { weapon: W_SEQ, book: B_SEQ, amulet: A_SEQ } }, bag: [W_SEQ, B_SEQ] };
  const equips = Items.normalizeBagEquip(bag.equip);
  const snap = freshSnapshot();
  for (const name of Object.keys(equips)) Saves.setEquipSlots(snap, name, Items.equipNames(equips[name]));
  assert.deepEqual(Saves.equipSlotsOf(snap, '關羽'),
    { weapon: W_NAME, horse: '', book: B_NAME, amulet: A_NAME });
  const bonus = Items.bonusOfNames(Saves.equipSlotsOf(snap, '關羽'));
  assert.equal(bonus.STR, W_STR);
  assert.equal(bonus.INT, B_INT);
});
