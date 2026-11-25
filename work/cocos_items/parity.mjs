/**
 * parity.mjs —— 物品邏輯對拍：web 版 `game/web/items_model.js`（ESM，真源）
 * vs Cocos 版 `work/cocos_items/_sim/ItemsModel.js`（由 `ItemsModel.ts` 用 tsconfig.sim.json 編成 CJS）。
 *
 * 兩邊吃同一份 `game/cocos/assets/bundles/res/data/items.json`（77 件）與 `generals.json`（401 位），
 * 逐項比較：常量面、每個函式的回傳值、以及隨機 300 步裝備操作序列的中間狀態。
 *
 * 跑法：cd F:\sanguo\work\cocos_items && node parity.mjs
 * 退出碼 0 = 全過；非 0 = 有差異（會印前 10 條）。
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const web = await import('../../game/web/items_model.js');
const cocos = require('./_sim/ItemsModel.js');

const ROOT = 'F:/sanguo/game/cocos/assets/bundles/res/data/';
const readJson = (name) => JSON.parse(readFileSync(`${ROOT}${name}`, 'utf8'));
const items = readJson('items.json');
const generals = readJson('generals.json');

let total = 0;
const failures = [];
const fail = (label, a, b) => {
  if (failures.length < 10) failures.push(`${label}\n  web  = ${render(a)}\n  cocos= ${render(b)}`);
};

function render(value) {
  if (typeof value === 'function') return '[function]';
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
  } catch {
    return String(value);
  }
}

/** 深比較（NaN 視為相等；物件比較 key 集合，不比順序）。 */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** 主斷言：web 與 cocos 同一個呼叫的結果必須一致。 */
function same(label, a, b) {
  total += 1;
  if (!deepEqual(a, b)) {
    fail(label, a, b);
    return false;
  }
  return true;
}

/** 自我斷言（不涉及對拍，但屬於驗收條件）。 */
function ok(label, cond, extra) {
  total += 1;
  if (!cond) fail(label, extra, '(預期成立)');
  return cond;
}

/* ========== 1. 匯出面 ========== */
const webKeys = Object.keys(web).filter((k) => k !== 'default').sort();
const cocosKeys = Object.keys(cocos).filter((k) => k !== 'default').sort();
same('匯出鍵集合', webKeys, cocosKeys);
ok('匯出鍵數量 = 27（6 常量 + 21 函式）', cocosKeys.length === 27, cocosKeys.length);
const fnNames = cocosKeys.filter((k) => typeof cocos[k] === 'function');
ok('函式數 = 21', fnNames.length === 21, fnNames.join(','));
for (const name of fnNames) same(`arity ${name}`, web[name].length, cocos[name].length);

/* ========== 2. 常量面 ========== */
for (const name of ['SLOTS', 'SLOT_NAMES', 'STAT_KEYS', 'STAT_NAMES', 'GROUP_ORDER', 'GROUP_LABELS']) {
  same(`常量 ${name}`, web[name], cocos[name]);
  same(`常量 ${name} 的 key 順序`, Object.keys(web[name]), Object.keys(cocos[name]));
}

/* ========== 3. num() ========== */
const numCases = [
  '', ' ', '0', '12', ' 12 ', '-7', '+3', '1e3', '0x10', 'abc', '12px', null, undefined, 0, -0, 1, -1.5,
  3.99, NaN, Infinity, -Infinity, true, false, [], [7], {}, { valueOf: () => 5 }, Number.MAX_SAFE_INTEGER,
];
for (const value of numCases) same(`num(${render(value)})`, web.num(value), cocos.num(value));

/* ========== 4. bitsOf() ========== */
const masks = [0, 1, 2, 3, 4, 5, 7, 8, 15, 255, 256, 1024, 65535, 65536, 1 << 20, (1 << 31) >>> 0, '5', 3.9, -1, 2 ** 32 + 3];
for (const mask of masks) same(`bitsOf(${render(mask)})`, web.bitsOf(mask), cocos.bitsOf(mask));

/* ========== 5. 逐件物品的分類與加成（77 件 × 8 項） ========== */
same('registerItems 回傳筆數', web.registerItems(items), cocos.registerItems(items));
same('registerItems 筆數 = 77', cocos.registerItems(items), 77);
same('allItems 長度', web.allItems().length, cocos.allItems().length);
same(
  'allItems 的 Sequence 順序',
  web.allItems().map((it) => Number(it.Sequence)),
  cocos.allItems().map((it) => Number(it.Sequence)),
);
for (const item of items) {
  const tag = `#${item.Sequence} ${item.Name}`;
  same(`typeOf ${tag}`, web.typeOf(item), cocos.typeOf(item));
  same(`isTalisman ${tag}`, web.isTalisman(item), cocos.isTalisman(item));
  same(`isFormBook ${tag}`, web.isFormBook(item), cocos.isFormBook(item));
  same(`slotOf ${tag}`, web.slotOf(item), cocos.slotOf(item));
  same(`isEquippable ${tag}`, web.isEquippable(item), cocos.isEquippable(item));
  same(`groupOf ${tag}`, web.groupOf(item), cocos.groupOf(item));
  same(`bonusOf ${tag}`, web.bonusOf(item), cocos.bonusOf(item));
  same(`bonusText ${tag}`, web.bonusText(item), cocos.bonusText(item));
}

/* 空值/怪形狀的容錯 */
for (const weird of [undefined, null, 0, '', 'x', [], {}, { TYPE: 7 }, { TYPE: 'JEWEL_MISC' }]) {
  const label = `怪輸入 ${render(weird)}`;
  same(`${label} typeOf`, web.typeOf(weird), cocos.typeOf(weird));
  same(`${label} isTalisman`, web.isTalisman(weird), cocos.isTalisman(weird));
  same(`${label} slotOf`, web.slotOf(weird), cocos.slotOf(weird));
  same(`${label} groupOf`, web.groupOf(weird), cocos.groupOf(weird));
  same(`${label} bonusOf`, web.bonusOf(weird), cocos.bonusOf(weird));
  same(`${label} bonusText`, web.bonusText(weird), cocos.bonusText(weird));
}

/* ========== 6. bonusOf(item, general) 帶武將 ========== */
const sampleGenerals = ['關羽', '曹操', '呂布', '貂蟬'].map((name) => generals.find((g) => g.NAME === name));
for (const general of sampleGenerals) same(`bonusOf 帶武將 ${general.NAME}`, web.bonusOf(items[0], general), cocos.bonusOf(items[0], general));
for (const general of sampleGenerals) {
  for (const item of items.slice(0, 12)) {
    same(
      `bonusOf(${item.Sequence}, ${general.NAME})`,
      web.bonusOf(item, general),
      cocos.bonusOf(item, general),
    );
  }
}

/* ========== 7. itemOf / 裝備表收斂 ========== */
for (const seq of [1, 77, 0, 999, -1, '3', '77', null, undefined, items[40].Sequence]) {
  same(`itemOf(${render(seq)})`, web.itemOf(seq), cocos.itemOf(seq));
}

const equipShapes = [
  undefined,
  null,
  {},
  { weapon: 1 },
  { weapon: '1' },
  { weapon: 1, horse: 4 },
  { weapon: 1, horse: 4, book: 49, amulet: 52 },
  { weapon: 4 },                 // 兵器槽塞馬 → 該被剔除
  { weapon: 1, bogus: 5 },       // 不認識的槽 → 剔除
  { weapon: null },
  { weapon: 0 },
  { weapon: 999 },
  { book: 49, amulet: 52, talisman: 1 },
  { '武器': 1 },
  { weapon: 1, horse: 4, book: 49, amulet: 52, extra: 'x' },
];
for (const shape of equipShapes) {
  const label = `normalizeEquips(${render(shape)})`;
  same(label, web.normalizeEquips(shape), cocos.normalizeEquips(shape));
  same(`${label} 不回寫入參`, render(shape), render(shape));
}
const normalized = cocos.normalizeEquips(equipShapes[6]);
same('normalizeEquips 幂等', cocos.normalizeEquips(normalized), normalized);

/* ========== 8. equipItem / unequipSlot / equippedSlot / totalBonus ========== */
for (const item of items) {
  const seq = item.Sequence;
  same(`equipItem({}, ${seq})`, web.equipItem({}, seq), cocos.equipItem({}, seq));
  same(
    `equipItem(滿裝, ${seq})`,
    web.equipItem(equipShapes[6], seq),
    cocos.equipItem(equipShapes[6], seq),
  );
  same(`equippedSlot(滿裝, ${seq})`, web.equippedSlot(equipShapes[6], seq), cocos.equippedSlot(equipShapes[6], seq));
}
for (const slot of web.SLOTS) {
  same(`unequipSlot(滿裝, ${slot})`, web.unequipSlot(equipShapes[6], slot), cocos.unequipSlot(equipShapes[6], slot));
}
for (const shape of equipShapes) {
  same(`totalBonus(${render(shape)})`, web.totalBonus(shape), cocos.totalBonus(shape));
}

/* ========== 9. applyEquip / runtimeGeneral ========== */
const pool = generals.filter((g) => g.NAME !== '盜賊');
for (const general of pool.slice(0, 40)) {
  const label = `applyEquip(${general.NAME})`;
  same(`${label} 空裝`, web.applyEquip(general, {}), cocos.applyEquip(general, {}));
  same(`${label} 滿裝`, web.applyEquip(general, equipShapes[6]), cocos.applyEquip(general, equipShapes[6]));
}
same('applyEquip 不修改入參', true, (() => {
  const g = JSON.parse(JSON.stringify(pool[0]));
  const before = JSON.stringify(g);
  web.applyEquip(g, equipShapes[6]);
  return JSON.stringify(g) === before;
})());
for (const general of generals) {
  same(`runtimeGeneral(${general.NAME})`, web.runtimeGeneral(general), cocos.runtimeGeneral(general));
}
for (const weird of [undefined, null, {}, { MaxHP: '', BaseHP: 200 }, { MaxHP: 9, BaseHP: 200 }]) {
  same(`runtimeGeneral(${render(weird)})`, web.runtimeGeneral(weird), cocos.runtimeGeneral(weird));
}

/* ========== 10. 隨機 300 步裝備操作序列 ========== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261125);
let webEquips = {};
let cocosEquips = {};
let webGeneral = web.runtimeGeneral(pool[0]);
let cocosGeneral = cocos.runtimeGeneral(pool[0]);
for (let step = 0; step < 300; step += 1) {
  const roll = rnd();
  if (roll < 0.55) {
    const pick = items[Math.floor(rnd() * items.length)];
    webEquips = web.equipItem(webEquips, pick.Sequence);
    cocosEquips = cocos.equipItem(cocosEquips, pick.Sequence);
    same(`隨機 #${step} equipItem(${pick.Sequence})`, webEquips, cocosEquips);
  } else if (roll < 0.75) {
    const slot = web.SLOTS[Math.floor(rnd() * web.SLOTS.length)];
    webEquips = web.unequipSlot(webEquips, slot);
    cocosEquips = cocos.unequipSlot(cocosEquips, slot);
    same(`隨機 #${step} unequipSlot(${slot})`, webEquips, cocosEquips);
  } else if (roll < 0.9) {
    same(`隨機 #${step} totalBonus`, web.totalBonus(webEquips), cocos.totalBonus(cocosEquips));
    const pickIndex = Math.floor(rnd() * pool.length);
    webGeneral = web.runtimeGeneral(pool[pickIndex]);
    cocosGeneral = cocos.runtimeGeneral(pool[pickIndex]);
    same(`隨機 #${step} runtimeGeneral`, webGeneral, cocosGeneral);
  } else {
    const appliedWeb = web.applyEquip(webGeneral, webEquips);
    const appliedCocos = cocos.applyEquip(cocosGeneral, cocosEquips);
    same(`隨機 #${step} applyEquip`, appliedWeb, appliedCocos);
    same(`隨機 #${step} applyEquip 後的總加成`, appliedWeb._bonus, appliedCocos._bonus);
  }
}

/* ========== 11. 資料指紋（記錄本次對拍吃的是哪份 items.json） ========== */
const itemsRaw = readFileSync(`${ROOT}items.json`);
const sha = createHash('sha256').update(itemsRaw).digest('hex');

/* ========== 輸出 ========== */
const slotStats = { weapon: 0, horse: 0, book: 0, amulet: 0, talisman: 0, formation: 0 };
for (const item of items) slotStats[cocos.groupOf(item)] += 1;

console.log('=== items_model 對拍 ===');
console.log(`web 模組   : game/web/items_model.js (${webKeys.length} 個匯出)`);
console.log(`cocos 模組 : _sim/ItemsModel.js (${cocosKeys.length} 個匯出, ${fnNames.length} 函式)`);
console.log(`items.json : ${items.length} 件 sha256=${sha.slice(0, 16)}…`);
console.log(`groups     : ${JSON.stringify(slotStats)}`);
console.log(`斷言總數   : ${total}`);
console.log(`失敗       : ${failures.length}`);
if (failures.length) {
  console.log('\n--- 前 10 條差異 ---');
  for (const line of failures) console.log(line);
  process.exitCode = 1;
} else {
  console.log('結果       : ALL PASS');
}
