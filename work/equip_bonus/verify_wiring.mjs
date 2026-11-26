/**
 * F-05 接線驗證（一次性腳本，不是測試套件的一部分）：
 *
 * 1. `GeneralBook.buildBook()`：在 node 裡用 `work/cocos_book/_sim` 的 mock `cc`
 *    塞入「物品表快照 + 物品存檔」，斷言名冊的武力/智力/生命/技力真的漲，且
 *    沒裝備的將不動、清空 localStorage 後回到原值（cold start 不拋錯）。
 * 2. `GameState.startBattle()`：用 `work/cocos_officers85/build` 的 `_cc.js` 內存
 *    `store` 塞同兩把鍵，斷言 `launch.genStr/genInt` 被覆寫成有效值，且
 *    `genStr: undefined` 的欄位保持 undefined（BattleRoot 的 80/60 回退不被改掉）。
 *
 * 前置：`tsc -p work/cocos_book/tsconfig.sim.json` 與 `node work/cocos_officers85/build.mjs`
 * 都跑過（兩個 harness 的產物要新）。用法：`node work/equip_bonus/verify_wiring.mjs`。
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);

const ITEM_ROWS = JSON.parse(readFileSync(new URL('game/data/items.json', root), 'utf8'));
const SLOT_OF_TYPE = { JEWEL_WEAPON: 'weapon', JEWEL_HORSE: 'horse', JEWEL_THING: 'book' };
const num = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const firstWith = (pred) => ITEM_ROWS.find(pred);
const bestBy = (field) =>
  ITEM_ROWS.slice().sort((a, b) => num(b[field]) - num(a[field]))[0];

const WEAPON = firstWith((it) => SLOT_OF_TYPE[it.TYPE] === 'weapon' && num(it.STR) === Math.max(...ITEM_ROWS.filter((r) => r.TYPE === 'JEWEL_WEAPON').map((r) => num(r.STR))));
const HORSE = firstWith((it) => SLOT_OF_TYPE[it.TYPE] === 'horse' && num(it.Speed) > 0);
const BOOK = bestBy('INT'); // 兵書給 INT
const BOOK_HP = firstWith((it) => SLOT_OF_TYPE[it.TYPE] === 'book' && num(it.MaxHP) > 0);
const BOOK_MP = firstWith((it) => SLOT_OF_TYPE[it.TYPE] === 'book' && num(it.MaxMP) > 0);
assert.ok(WEAPON && HORSE && BOOK && BOOK_HP && BOOK_MP, 'fixture 物品找不到（data/items.json 有變？）');

const CACHE_KEY = 'sanguo_equip_items_v1';
const BAG_KEY = 'sanguo_items_v1';
const CAMP_KEY = 'sanguo_campaign_v1';
const share = (store) => {
  // 兩套 harness 的 localStorage 都是內存 Map；這裡統一成 get/set 介面
  return {
    get: (k) => (store.has(k) ? store.get(k) : null),
    set: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };
};

let checks = 0;
const eq = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  checks += 1;
  console.log(`  ok ${checks}. ${label} = ${actual}`);
};

/* ── ① GeneralBook（_sim + mock cc） ────────────────────────────── */
console.log('\n[1] GeneralBook.buildBook：裝備生效（mock cc / _sim）');
{
  const cc = require('../cocos_book/_sim/node_modules/cc/index.js');
  const GB = require('../cocos_book/_sim/GeneralBook.js');
  const storage = share(cc.__storage ?? new Map());

  const GENERAL = {
    NAME: '關羽',
    STR: '80',
    INT: '70',
    BaseHP: 900,
    BaseMP: 100,
    Weapon: '',
    Horse: '',
    Thing: '',
  };
  const OTHER = { NAME: '呂布', STR: '60', INT: '40', BaseHP: 800, BaseMP: 60 };

  storage.clear();
  const cold = GB.buildBook({ generals: [GENERAL, OTHER], save: {} });
  const coldGuan = cold.find((r) => r.name === '關羽');
  eq(coldGuan.str, 80, '冷啟動（沒有物品表快照）名冊武力 = 原值 80');
  eq(coldGuan.int, 70, '冷啟動名冊智力 = 原值 70');

  storage.set(CACHE_KEY, JSON.stringify(ITEM_ROWS));
  const equip = (table) =>
    storage.set(BAG_KEY, JSON.stringify({ equip: { 關羽: table }, bag: [] }));

  equip({ weapon: Number(WEAPON.Sequence), horse: Number(HORSE.Sequence), book: Number(BOOK.Sequence) });
  const warm = GB.buildBook({ generals: [GENERAL, OTHER], save: {} });
  const guan = warm.find((r) => r.name === '關羽');
  const other = warm.find((r) => r.name === '呂布');
  eq(guan.str, 80 + num(WEAPON.STR), `名冊武力 = 80 + 兵器 STR ${num(WEAPON.STR)}`);
  eq(guan.int, 70 + num(BOOK.INT), `名冊智力 = 70 + 兵書 INT ${num(BOOK.INT)}`);
  eq(other.str, 60, '沒裝備的呂布武力不動');
  eq(equipLine(guan), equipLine(coldGuan), '兵/馬/書 靜態欄位不受影響（裝備名另在物品頁）');

  // 生命/技力上限分別用兩本兵書驗（同一槽一次只能穿一本）
  equip({ book: Number(BOOK_HP.Sequence) });
  const withHp = GB.buildBook({ generals: [GENERAL], save: {} }).find((r) => r.name === '關羽');
  eq(withHp.hp, 900 + num(BOOK_HP.MaxHP), `名冊生命 = 900 + 兵書 MaxHP ${num(BOOK_HP.MaxHP)}`);
  equip({ book: Number(BOOK_MP.Sequence) });
  const withMp = GB.buildBook({ generals: [GENERAL], save: {} }).find((r) => r.name === '關羽');
  eq(withMp.mp, 100 + num(BOOK_MP.MaxMP), `名冊技力 = 100 + 兵書 MaxMP ${num(BOOK_MP.MaxMP)}`);

  // 壞快照：不能拋錯、也不能把原值洗掉
  storage.set(CACHE_KEY, '{not json');
  const broken = GB.buildBook({ generals: [GENERAL], save: {} });
  eq(broken.find((r) => r.name === '關羽').str, 80, '快照壞檔 → 回落原值、不拋錯');
  storage.clear();
}

function equipLine(row) {
  return `${row.weapon}/${row.horse}/${row.thing}`;
}

/* ── ② GameState.startBattle（officers85 build + _cc store） ───── */
console.log('\n[2] GameState.startBattle：有效值寫進出征參數（officers85 build）');
{
  const { store } = await import('../cocos_officers85/build/_cc.js');
  const GS = await import('../cocos_officers85/build/GameState.js');
  const storage = share(store);

  const loadout = {
    gen: '關羽',
    troop: 1,
    form: 1,
    soldiers: 100,
    btroop: 1,
    bform: 1,
    bsoldiers: 100,
    bstr: 70,
    bint: 88,
    genStr: 80,
    genInt: 70,
    genLevel: 6,
  };

  storage.clear();
  storage.set(CAMP_KEY, JSON.stringify({}));
  const cold = GS.startBattle('南皮', { ...loadout });
  eq(cold.genStr, 80, '冷啟動出征 genStr = 原值 80');
  eq(cold.genInt, 70, '冷啟動出征 genInt = 原值 70');

  // 重設存檔快取（loadSave 有模組級 cached，換 localStorage 後要 resetCache）
  if (typeof GS.resetCache === 'function') GS.resetCache();
  storage.set(CACHE_KEY, JSON.stringify(ITEM_ROWS));
  storage.set(BAG_KEY, JSON.stringify({ equip: { 關羽: { weapon: Number(WEAPON.Sequence), book: Number(BOOK.Sequence) } }, bag: [] }));
  const warm = GS.startBattle('南皮', { ...loadout });
  eq(warm.genStr, 80 + num(WEAPON.STR), `出征 genStr = 80 + 兵器 STR ${num(WEAPON.STR)}`);
  eq(warm.genInt, 70 + num(BOOK.INT), `出征 genInt = 70 + 兵書 INT ${num(BOOK.INT)}`);
  eq(warm.bstr, 70, 'B 方武力不被波及');
  eq(warm.btroop, 1, '其它 loadout 欄位原樣帶過');

  if (typeof GS.resetCache === 'function') GS.resetCache();
  const noStats = GS.startBattle('南皮', { ...loadout, genStr: undefined, genInt: undefined });
  eq(noStats.genStr, undefined, 'genStr 本來 undefined → 保持 undefined（BattleRoot 的 80 回退仍在）');
  eq(noStats.genInt, undefined, 'genInt 本來 undefined → 保持 undefined');

  storage.clear();
}

console.log(`\n全部通過：${checks} 條斷言 ✅`);
