// @ts-nocheck —— 被测的 web/items_model.js / web/saves.js 是浏览器端无类型 ESM
// （tsconfig 没有 allowJs），本文件按 node:test 跑运行时断言，断言一律 assert/strict。
//
// F-05「裝備加成不生效」的守護：`game/src/core/equip_bonus.ts` 是唯一的公式實現，
// Cocos 名冊（GeneralBook）與出征（GameState.startBattle）都調它。這裡做三件事：
//   1. 逐條驗口徑（無裝備 = 原值、單件、四槽疊加、上限/負數、裝備了才生效）；
//   2. **與 web 真源對拍**：同一份 `data/items.json`、同一組裝備，core 的五屬性加成 /
//      有效值要和 `web/items_model.js` 的 `bonusOf / bonusOfNames / applyEquip` 與
//      `campaign.html` 的 `combatStatsOf`（[[EQUIP_CORE]] 段）算出來的一模一樣；
//   3. 名冊/戰鬥用的「名字表」管線：物品存檔（Sequence）→ 名字 → 加成，逐個回落分支。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Items from '../web/items_model.js';
import * as Saves from '../web/saves.js';
import * as Equip from '../src/core/equip_bonus.ts';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const ITEM_ROWS = readJson('../data/items.json');
const HTML = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

// 註冊表是 items.html / campaign.html 開頁時做的事；測試手動補上同一份（webfix_r86 同法）
Items.registerItems(ITEM_ROWS);

/** 抽 campaign.html 的 `[[NAME]] … [[/NAME]]` 段（與 tests/fatigue.test.ts 同一手法） */
function pickBlock(name) {
  const hit = HTML.match(new RegExp('/\\/ \\[\\[' + name + '\\]\\][^\\n]*\\n([\\s\\S]*?)\\/\\/ \\[\\[/' + name + '\\]\\]'));
  assert.ok(hit, 'campaign.html 裡找不到 [[' + name + ']] 段');
  return hit[1];
}

/** web 的戰鬥口徑函數（真源，逐字抽出來跑） */
const EQUIP_CORE = new Function('Saves', pickBlock('EQUIP_CORE') + '\nreturn { combatStatsOf };')(Saves);

// 取真裝備（按 items.json 的欄位找，不寫死序號 —— 資料改版時測試不會假紅）
const firstWith = (pred) => ITEM_ROWS.find((it) => pred(it));
const weaponRow = firstWith((it) => Items.slotOf(it) === 'weapon' && Saves.num(it.STR) > 0);
const horseRow = firstWith((it) => Items.slotOf(it) === 'horse' && Saves.num(it.Speed) > 0);
const bookRow = firstWith((it) => Items.slotOf(it) === 'book' && Saves.num(it.INT) > 0);
const hpBookRow = firstWith((it) => Items.slotOf(it) === 'book' && Saves.num(it.MaxHP) > 0);
const mpBookRow = firstWith((it) => Items.slotOf(it) === 'book' && Saves.num(it.MaxMP) > 0);
const amuletRow = firstWith((it) => Items.slotOf(it) === 'amulet');
const talismanRow = firstWith((it) => Items.slotOf(it) === null && Saves.num(it.Force) > 0);
const bigWeaponRow = ITEM_ROWS.filter((it) => Items.slotOf(it) === 'weapon')
  .sort((a, b) => Saves.num(b.STR) - Saves.num(a.STR))[0];

/** 這五個屬性在 web 的 bonus 物件裡叫 STR/INT/MaxHP/MaxMP/Speed */
function webFiveStats(bonus) {
  return {
    str: Saves.num(bonus.STR),
    int: Saves.num(bonus.INT),
    hp: Saves.num(bonus.MaxHP),
    mp: Saves.num(bonus.MaxMP),
    speed: Saves.num(bonus.Speed),
  };
}

/** 造一件測試用物品（合成物品，不對應任何真資料） */
function fakeItem(sequence, name, type, stats, extra = {}) {
  return { Sequence: sequence, Name: name, TYPE: type, Sort: 97, Level: 1, Rate: 100, ...stats, ...extra };
}

// ================================================================ 1. 無裝備 = 原值 + 0

test('F-05 ①：沒有裝備（空表 / null / 未知道具）時有效值 === 原值，加成全 0', () => {
  const base = { str: 97, int: 75, hp: 1200, mp: 140, speed: 5 };
  assert.deepEqual(Equip.emptyEquipStats(), { str: 0, int: 0, hp: 0, mp: 0, speed: 0 });
  assert.deepEqual(Equip.equipBonusOf(null), Equip.emptyEquipStats());
  assert.deepEqual(Equip.equipBonusOf(undefined), Equip.emptyEquipStats());
  assert.deepEqual(Equip.equipBonusOf({}, ITEM_ROWS), Equip.emptyEquipStats());
  assert.deepEqual(Equip.equipBonusOf({ weapon: '', horse: '', book: '', amulet: '' }, ITEM_ROWS), Equip.emptyEquipStats());
  assert.deepEqual(Equip.effectiveStatsOf(base, null, ITEM_ROWS), base);
  assert.deepEqual(Equip.effectiveStatsOf(base, {}, ITEM_ROWS), base);
  // 未知物品名 / 不存在的 Sequence 都不給加成（不拋錯）
  assert.deepEqual(Equip.equipBonusOf({ weapon: '不存在的神器' }, ITEM_ROWS), Equip.emptyEquipStats());
  assert.deepEqual(Equip.equipBonusOf({ weapon: 999999 }, ITEM_ROWS), Equip.emptyEquipStats());
  // 武將也可以是資料表形狀（STR/INT/BaseHP/BaseMP/Speed）——兩種鍵都吃
  assert.deepEqual(Equip.effectiveStatsOf({ STR: 97, INT: 75, BaseHP: 1200, BaseMP: 140, Speed: 5 }, {}, ITEM_ROWS), base);
});

// ================================================================ 2. 單件 +3

test('F-05 ②：單件兵器 STR+3 → 武力 97→100（物品物件 / 名字 / Sequence 三種吃法同值）', () => {
  const sword = fakeItem(9001, '測試直劍', 'JEWEL_WEAPON', { STR: 3 });
  const rows = ITEM_ROWS.concat([sword]);
  assert.deepEqual(Equip.equipBonusOf(sword), { str: 3, int: 0, hp: 0, mp: 0, speed: 0 }, '直接吃物品物件不用 items 表');
  assert.deepEqual(Equip.equipBonusOf({ weapon: sword }, rows), { str: 3, int: 0, hp: 0, mp: 0, speed: 0 });
  assert.deepEqual(Equip.equipBonusOf({ weapon: '測試直劍' }, rows), { str: 3, int: 0, hp: 0, mp: 0, speed: 0 });
  assert.deepEqual(Equip.equipBonusOf({ weapon: 9001 }, rows), { str: 3, int: 0, hp: 0, mp: 0, speed: 0 });
  assert.equal(Equip.effectiveStatsOf({ str: 97 }, { weapon: '測試直劍' }, rows).str, 100);
  // 只加武力，其餘不動
  assert.deepEqual(Equip.effectiveStatsOf({ str: 97, int: 75, hp: 1200, mp: 140, speed: 5 }, { weapon: sword }, rows), {
    str: 100,
    int: 75,
    hp: 1200,
    mp: 140,
    speed: 5,
  });
});

// ================================================================ 3. 四槽疊加

test('F-05 ③：四槽疊加（兵器武力 / 坐騎速度 / 兵書智力生命技力 / 寶物只給忠誠→五屬性 0）', () => {
  const names = { weapon: weaponRow.Name, horse: horseRow.Name, book: bookRow.Name, amulet: amuletRow.Name };
  const got = Equip.equipBonusOf(names, ITEM_ROWS);
  const web = webFiveStats(Items.bonusOfNames(names));
  assert.deepEqual(got, web, '四槽加成必須與 web bonusOfNames 同值');
  assert.equal(got.str, Saves.num(weaponRow.STR));
  assert.equal(got.speed, Saves.num(horseRow.Speed));
  assert.equal(got.int, Saves.num(bookRow.INT));
  // 飾品（珠寶）只帶 Loyal，五屬性必須是 0
  assert.deepEqual(Equip.equipBonusOf({ amulet: amuletRow.Name }, ITEM_ROWS), Equip.emptyEquipStats());
  // 逐槽加 = 各槽單獨加之和
  const solo = ['weapon', 'horse', 'book', 'amulet'].reduce((sum, slot) => {
    const one = Equip.equipBonusOf({ [slot]: names[slot] }, ITEM_ROWS);
    return { str: sum.str + one.str, int: sum.int + one.int, hp: sum.hp + one.hp, mp: sum.mp + one.mp, speed: sum.speed + one.speed };
  }, Equip.emptyEquipStats());
  assert.deepEqual(got, solo);
  // 生命/技力上限：兵書的 MaxHP / MaxMP 進 hp / mp
  assert.deepEqual(Equip.equipBonusOf({ book: hpBookRow.Name }, ITEM_ROWS).hp, Saves.num(hpBookRow.MaxHP));
  assert.deepEqual(Equip.equipBonusOf({ book: mpBookRow.Name }, ITEM_ROWS).mp, Saves.num(mpBookRow.MaxMP));
  // 有效值 = 原值 + 四槽合計
  const eff = Equip.effectiveStatsOf({ str: 50, int: 50, hp: 500, mp: 50, speed: 1 }, names, ITEM_ROWS);
  assert.equal(eff.str, 50 + got.str);
  assert.equal(eff.int, 50 + got.int);
  assert.equal(eff.hp, 500 + got.hp);
  assert.equal(eff.mp, 50 + got.mp);
  assert.equal(eff.speed, 1 + got.speed);
});

// ================================================================ 4. 上限 / 負數 / 非數值

test('F-05 ④：上限/負數口徑同 web——沒有上夾、加法後下夾 0、空字串與非數字算 0', () => {
  const plus30 = fakeItem(9002, '測試巨刀', 'JEWEL_WEAPON', { STR: 30 });
  const minus5 = fakeItem(9003, '測試鈍刀', 'JEWEL_WEAPON', { STR: -5 });
  const rows = ITEM_ROWS.concat([plus30, minus5]);
  // 沒有上夾：999 + 30 = 1029（web combatStatsOf 只做 trunc + max(0)，上夾在 UI 層）
  assert.equal(Equip.effectiveStatsOf({ str: 999 }, { weapon: plus30.Sequence }, rows).str, 1029);
  // 負加成照加，但結果下夾 0
  assert.equal(Equip.equipBonusOf({ weapon: minus5.Sequence }, rows).str, -5);
  assert.equal(Equip.effectiveStatsOf({ str: 10 }, { weapon: minus5.Sequence }, rows).str, 5);
  assert.equal(Equip.effectiveStatsOf({ str: 2 }, { weapon: minus5.Sequence }, rows).str, 0);
  assert.equal(Equip.effectiveStatsOf({ hp: 0 }, { book: '測試無名' }, ITEM_ROWS).hp, 0);
  // 非數值 / 空字串 / 布林都不算（web num() 同口徑）
  assert.equal(Equip.numOf(''), 0);
  assert.equal(Equip.numOf('abc'), 0);
  assert.equal(Equip.numOf(Number.NaN), 0);
  assert.equal(Equip.numOf(undefined), 0);
  assert.equal(Equip.numOf('12'), 12);
  const junk = fakeItem(9004, '測試破刀', 'JEWEL_WEAPON', { STR: 'abc', INT: '', MaxHP: null, MaxMP: [] });
  assert.deepEqual(Equip.bonusOfItem(junk), Equip.emptyEquipStats());
  // 兵符（Force 位掩碼）不給五屬性加成，且不進任何槽
  assert.ok(talismanRow, '真資料裡應該找得到兵符');
  assert.equal(Equip.itemSlotOf(talismanRow), null);
  assert.deepEqual(Equip.bonusOfItem(talismanRow), Equip.emptyEquipStats());
  assert.deepEqual(Equip.equipBonusOf({ amulet: talismanRow.Name }, ITEM_ROWS), Equip.emptyEquipStats());
  // 上限：名冊若要顯示，由 UI 再夾（core 不夾），這裡確認 core 的 raw 值就是 1029
  assert.equal(Equip.effectiveStatsOf({ str: 999 }, { weapon: plus30.Sequence }, rows).str, Math.trunc(999 + 30));
});

// ================================================================ 5. 與 web 同值對拍

test('F-05 ⑤：與 web items_model / campaign.html[[EQUIP_CORE]] 逐件逐槽對拍（真 items.json）', () => {
  // ① 77 件物品的五屬性投影，逐件與 web bonusOf 對拍
  for (const row of ITEM_ROWS) {
    assert.deepEqual(Equip.bonusOfItem(row), webFiveStats(Items.bonusOf(row)), `物品 ${row.Sequence}/${row.Name} 加成不同`);
    assert.equal(Equip.itemSlotOf(row), Items.slotOf(row), `物品 ${row.Sequence}/${row.Name} 槽位不同`);
    assert.equal(Equip.isTalismanOf(row), Items.isTalisman(row), `物品 ${row.Sequence}/${row.Name} 兵符判據不同`);
  }

  // ② 四槽組合：core equipBonusOf 必須 === web bonusOfNames
  const combos = [
    { weapon: weaponRow.Name },
    { weapon: weaponRow.Name, horse: horseRow.Name },
    { weapon: weaponRow.Name, horse: horseRow.Name, book: bookRow.Name },
    { weapon: weaponRow.Name, horse: horseRow.Name, book: bookRow.Name, amulet: amuletRow.Name },
    { book: hpBookRow.Name, amulet: amuletRow.Name },
    { weapon: bigWeaponRow.Name, book: mpBookRow.Name },
    {},
  ];
  for (const names of combos) {
    assert.deepEqual(Equip.equipBonusOf(names, ITEM_ROWS), webFiveStats(Items.bonusOfNames(names)), `装备表 ${JSON.stringify(names)} 不同`);
  }

  // ③ 有效值：core effectiveStatsOf 必須 === web applyEquip + combatStatsOf 的口徑
  const bases = [
    { str: 97, int: 75, hp: 1200, mp: 140, speed: 5 },
    { str: 50, int: 50, hp: 500, mp: 50, speed: 1 },
    { str: 999, int: 999, hp: 9999, mp: 9999, speed: 99 },
    { str: 0, int: 0, hp: 0, mp: 0, speed: 0 },
  ];
  for (const base of bases) {
    for (const names of combos) {
      const webBonus = Items.bonusOfNames(names);
      const webBase = { str: base.str, int: base.int, MaxHP: base.hp, MaxMP: base.mp, Speed: base.speed };
      const webApplied = Items.applyEquip(webBase, Items.equipSeqs(names));
      const webFight = EQUIP_CORE.combatStatsOf({ str: base.str, int: base.int }, webBonus);
      const got = Equip.effectiveStatsOf(base, names, ITEM_ROWS);
      assert.deepEqual(
        got,
        {
          str: webFight.str,
          int: webFight.int,
          hp: Math.max(0, Math.trunc(Saves.num(webApplied.MaxHP))),
          mp: Math.max(0, Math.trunc(Saves.num(webApplied.MaxMP))),
          speed: Math.max(0, Math.trunc(Saves.num(webApplied.Speed))),
        },
        `有效值不同 base=${JSON.stringify(base)} names=${JSON.stringify(names)}`,
      );
    }
  }
});

// ================================================================ 6. 裝備了才生效（名字表管線）

test('F-05 ⑥：只有裝了裝備的那名武將漲——物品存檔（Sequence）→ 名字 → 加成，錯將/錯槽/兵符不生效', () => {
  const itemsSave = {
    bag: [weaponRow.Sequence, horseRow.Sequence, bookRow.Sequence, amuletRow.Sequence],
    equip: { [weaponRow.Sequence]: null, 關羽: { weapon: weaponRow.Sequence, horse: horseRow.Sequence, book: bookRow.Sequence, amulet: amuletRow.Sequence } },
  };
  // 有紀錄的武將：Sequence 解成名字
  assert.deepEqual(Equip.equipNamesFromBag(itemsSave, '關羽', ITEM_ROWS), {
    weapon: weaponRow.Name,
    horse: horseRow.Name,
    book: bookRow.Name,
    amulet: amuletRow.Name,
  });
  // 沒紀錄的武將：回 null（呼叫端回落存檔名表），不是「一律沒裝」
  assert.equal(Equip.equipNamesFromBag(itemsSave, '呂布', ITEM_ROWS), null);
  // 管線：關羽漲、呂布不漲
  const base = { str: 97, int: 75, hp: 1200, mp: 140, speed: 5 };
  const guanyu = Equip.effectiveStatsOf(base, Equip.equipNamesForGeneral('關羽', {}, ITEM_ROWS, itemsSave), ITEM_ROWS);
  const lubu = Equip.effectiveStatsOf(base, Equip.equipNamesForGeneral('呂布', {}, ITEM_ROWS, itemsSave), ITEM_ROWS);
  assert.equal(guanyu.str, 97 + Saves.num(weaponRow.STR));
  assert.equal(guanyu.speed, 5 + Saves.num(horseRow.Speed));
  assert.deepEqual(lubu, base);
  // 錯槽不生效：兵器 Sequence 塞進馬槽 → 不算速度
  const wrong = { 關羽: { horse: weaponRow.Sequence } };
  assert.deepEqual(Equip.equipNamesFromBag({ equip: wrong }, '關羽', ITEM_ROWS), { weapon: '', horse: '', book: '', amulet: '' });
  assert.deepEqual(Equip.effectiveStatsOf(base, Equip.equipNamesForGeneral('關羽', {}, ITEM_ROWS, { equip: wrong }), ITEM_ROWS), base);
  // 兵符（slotOf=null）放進寶物槽 → 丟掉
  assert.deepEqual(Equip.equipNamesFromBag({ equip: { 關羽: { amulet: talismanRow.Sequence } } }, '關羽', ITEM_ROWS), Equip.emptyEquipNames());
  // 空表 `{}`（Cocos 的「卸下」會留一行）＝ 權威的「沒裝」，不回落存檔的舊名字
  const staleSave = { equip: { 關羽: { weapon: bigWeaponRow.Name } } };
  assert.deepEqual(Equip.equipNamesForGeneral('關羽', staleSave, ITEM_ROWS, { equip: { 關羽: {} } }), Equip.emptyEquipNames());
  // 物品表快照缺失（cold start）→ 回 null，而不是把「解不開」當「沒裝」
  assert.equal(Equip.equipNamesFromBag(itemsSave, '關羽', []), null);
});

// ================================================================ 7. 存檔名表回落（web saves.js 口徑）

test('F-05 ⑦：存檔名表回落——save.equip 優先、舊表 weapon/horse/thing 兜底（book←thing）、空/--- 算沒裝', () => {
  const save = {
    equip: { 關羽: { horse: horseRow.Name, amulet: amuletRow.Name } },
    weapon: { 關羽: weaponRow.Name, 張飛: bigWeaponRow.Name },
    horse: { 張飛: horseRow.Name },
    thing: { 關羽: bookRow.Name, 張飛: mpBookRow.Name },
  };
  // 新格式有的槽用新格式，缺的回落三張舊表，且 amulet 只認新格式
  assert.deepEqual(Equip.equipNamesOfSave(save, '關羽'), {
    weapon: weaponRow.Name,
    horse: horseRow.Name,
    book: bookRow.Name,
    amulet: amuletRow.Name,
  });
  assert.deepEqual(Equip.equipNamesOfSave(save, '張飛'), {
    weapon: bigWeaponRow.Name,
    horse: horseRow.Name,
    book: mpBookRow.Name,
    amulet: '',
  });
  assert.deepEqual(Equip.equipNamesOfSave(save, '路人甲'), Equip.emptyEquipNames());
  assert.deepEqual(Equip.equipNamesOfSave(null, '關羽'), Equip.emptyEquipNames());
  // 空字串 / --- / — 都算沒裝（web saves.js equipText 同口徑）
  const dashed = { equip: { 關羽: { weapon: '', horse: '---', book: '—' } } };
  assert.deepEqual(Equip.equipNamesOfSave(dashed, '關羽'), Equip.emptyEquipNames());
  // 名表 → 加成：與 web bonusOfNames 同值
  const names = Equip.equipNamesOfSave(save, '關羽');
  assert.deepEqual(Equip.equipBonusOf(names, ITEM_ROWS), webFiveStats(Items.bonusOfNames(names)));
});

// ================================================================ 8. 儲存字串解析容錯

test('F-05 ⑧：物品快照 / 物品存檔的 JSON 解析容錯（壞 JSON、null、非陣列都降級不拋）', () => {
  const raw = JSON.stringify(ITEM_ROWS);
  assert.equal(Equip.equipRowsFromJson(raw).length, ITEM_ROWS.length);
  assert.deepEqual(Equip.equipRowsFromJson('not json'), []);
  assert.deepEqual(Equip.equipRowsFromJson(null), []);
  assert.deepEqual(Equip.equipRowsFromJson('{"a":1}'), []);
  assert.deepEqual(Equip.equipRowsFromJson('[1,"x",null]'), [], '非物件行濾掉');
  const bagRaw = JSON.stringify({ equip: { 關羽: { weapon: weaponRow.Sequence } }, bag: [1] });
  assert.equal(typeof Equip.equipBagFromJson(bagRaw), 'object');
  assert.equal(Equip.equipBagFromJson('broken'), null);
  assert.equal(Equip.equipBagFromJson(null), null);
  assert.equal(Equip.equipBagFromJson('[1,2]'), null);
  // 完整管線：JSON 字串 → 表 → 名字 → 有效值（名冊/戰鬥實際走的路）
  const rows = Equip.equipRowsFromJson(raw);
  const bag = Equip.equipBagFromJson(bagRaw);
  const names = Equip.equipNamesForGeneral('關羽', {}, rows, bag);
  assert.equal(names.weapon, weaponRow.Name);
  const eff = Equip.effectiveStatsOf({ str: 97, int: 75, hp: 1200, mp: 140, speed: 5 }, names, rows);
  assert.equal(eff.str, 97 + Saves.num(weaponRow.STR));
});

// ================================================================ 9. 接線（三處消費點 + mirror）

/**
 * 來源檔文字斷言（repo 既有 `deploy_cols_cocos.test.ts` / `panels_roster_source.test.ts`
 * 同款做法）：core 的公式有單元測試了，這裡只釘住「三處消費點真的接上 core、且沒有
 * 偷偷把 cc 導入加到 GameState.ts 第二條」——`work/cocos_officers85/build.mjs`
 * 要求全庫只有 GameState.ts 碰 `from 'cc'`（ccFixed===1），破了會讓 parity harness 崩。
 */
test('F-05 ⑨：接線——ItemsPanel 寫快照、名冊/出征讀快照、GameState 仍只有一條 cc 導入', () => {
  const readSource = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const itemsPanel = readSource('../cocos/assets/scripts/ItemsPanel.ts');
  const generalBook = readSource('../cocos/assets/scripts/GeneralBook.ts');
  const gameState = readSource('../cocos/assets/scripts/GameState.ts');

  // ① ItemsPanel：唯一的物品表持有者，open() 裡寫快照（形狀 = JSON.stringify(items)）
  assert.match(itemsPanel, /import \{ EQUIP_ITEMS_CACHE_KEY \} from '\.\/core\/equip_bonus';/);
  assert.match(itemsPanel, /function writeEquipItemsCache\(items: readonly Item\[\]\): void/);
  assert.match(itemsPanel, /JSON\.stringify\(items\)/);
  const openCall = itemsPanel.indexOf('writeEquipItemsCache(items)');
  assert.ok(openCall > 0, 'open() 必須呼叫 writeEquipItemsCache(items)');
  assert.ok(openCall > itemsPanel.indexOf('registerItems(items as readonly unknown[])'), '寫快照要在 registerItems 之後');
  // ② GameState：startBattle 覆寫有效值，但 cc 導入只能有原本那一條
  assert.match(gameState, /applyEquipBonus\(launch\);/);
  assert.match(gameState, /launch\.genStr = stats\.str;/);
  assert.match(gameState, /launch\.genInt = stats\.int;/);
  // 只算真正的 import 語句（build.mjs 也是逐行只改 import/export 行；註釋裡提到不算）
  const ccImports = gameState.match(/^\s*import\b[^;\n]*from 'cc'/gm) || [];
  assert.equal(ccImports.length, 1, "GameState.ts 只能有一條 from 'cc'（officers85 build 的 ccFixed===1）");
  // ③ GeneralBook：名冊每行換有效值、items/bag 由 buildBook 一次讀入
  assert.match(generalBook, /import \{ sys \} from 'cc';/);
  assert.match(generalBook, /effectiveRowStats\(/);
  assert.match(generalBook, /effectiveStatsOf\(/);
  assert.match(generalBook, /equipItems,/);
  assert.match(generalBook, /equipBagSave,/);
  // ④ mirror：同步腳本後的 cocos core 必須與 web 源逐字一致（equip_bonus 零 import，不會被 strip 改）
  const src = readSource('../src/core/equip_bonus.ts');
  const mirror = readSource('../cocos/assets/scripts/core/equip_bonus.ts');
  assert.equal(mirror, src, 'game/cocos/assets/scripts/core/equip_bonus.ts 需先跑 sync_core3.mjs');
  // ⑤ core 兩把鍵名與 ItemsPanel/GeneralBook/GameState 用的是同一份常量（不是各自寫死）
  assert.match(itemsPanel, /EQUIP_ITEMS_CACHE_KEY/);
  assert.match(generalBook, /EQUIP_ITEMS_CACHE_KEY/);
  assert.match(gameState, /EQUIP_ITEMS_CACHE_KEY/);
  assert.equal(Equip.EQUIP_SAVE_KEY, 'sanguo_items_v1');
  assert.equal(Equip.EQUIP_ITEMS_CACHE_KEY, 'sanguo_equip_items_v1');
});