/**
 * items_selftest.mjs — 物品/裝備純邏輯自檢（node 直接跑，不需要瀏覽器）。
 *
 *   node F:\sanguo\game\web\items_selftest.mjs
 *
 * 檢查三件事：
 *   ① 資料面：77 件的分組、Sequence 唯一、圖示檔齊全；
 *   ② 規則面：四槽判定、兵符不加屬性、同槽只能一件、卸下回原值；
 *   ③ 對拍面：關羽裝方天畫戟後 STR = 99 + 30 這類「照表加」。
 * 輸出最後一行固定是 "N 過 / M 敗"。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SLOTS, STAT_KEYS, num, bitsOf, typeOf, isTalisman, isFormBook, slotOf, isEquippable,
  groupOf, GROUP_ORDER, bonusOf, emptyBonus, registerItems, itemOf, normalizeEquips,
  equipItem, unequipSlot, equippedSlot, totalBonus, applyEquip, runtimeGeneral, bonusText,
} from './items_model.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const items = readJson(join(HERE, '..', 'data', 'items.json'));
const generals = readJson(join(HERE, '..', 'data', 'generals.json'));
const byName = new Map(generals.map((g) => [g.NAME, g]));
const G = (name) => runtimeGeneral(byName.get(name));
const I = (seq) => items.find((it) => it.Sequence === seq);

registerItems(items);

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); return; }
  fail += 1;
  failures.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''));
}
function eq(name, actual, expected) {
  const same = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  ok(name, same, `實際 ${JSON.stringify(actual)} / 期望 ${JSON.stringify(expected)}`);
}
function group(title) { console.log('\n· ' + title); }

/* ================= ① 資料面 ================= */
group('資料面');
eq('items.json 共 77 件', items.length, 77);
eq('Sequence 0..76 唯一不重複', new Set(items.map((i) => i.Sequence)).size, 77);
eq('TYPE 只有 4 類', [...new Set(items.map(typeOf))].sort().join(','),
  'JEWEL_HORSE,JEWEL_MISC,JEWEL_THING,JEWEL_WEAPON');

const counts = {};
for (const it of items) counts[groupOf(it)] = (counts[groupOf(it)] || 0) + 1;
eq('六組分佈 weapon34/horse8/book8/amulet5/talisman13/formation9',
  GROUP_ORDER.map((k) => counts[k]).join('/'), '34/8/8/5/13/9');
eq('可裝備合計 55 件（34+8+8+5）', items.filter(isEquippable).length, 55);
eq('不可裝備 22 件（兵符13 + 陣法9）',
  items.filter((i) => !isEquippable(i)).length, 22);

const missingIcons = items
  .map((it) => String(it.Sprite || '').split('\\').pop())
  .filter((stem) => !existsSync(join(HERE, 'assets', 'items', stem + '.png')));
eq('77 件的 Sprite 都能在 assets/items 找到 PNG', missingIcons.length, 0);
ok('圖示共用（57 張圖覆蓋 77 件）', new Set(items.map((i) => i.Sprite)).size === 57,
  `實際 ${new Set(items.map((i) => i.Sprite)).size} 張`);

/* ================= ② 規則面 ================= */
group('槽位判定');
eq('直劍 → weapon', slotOf(I(14)), 'weapon');
eq('黑鬃馬 → horse', slotOf(I(56)), 'horse');
eq('史記 → book', slotOf(I(49)), 'book');
eq('珠寶 → amulet', slotOf(I(77)), 'amulet');
eq('朴刀兵兵符 → null（使用品，不進槽）', slotOf(I(1)), null);
eq('方形陣法之書 → null（使用品，不進槽）', slotOf(I(64)), null);
eq('slotOf(null) 不炸', slotOf(null), null);
eq('四槽常數就是 4 個', SLOTS.length, 4);

group('兵符不加屬性');
const talisman = I(1);
ok('兵符被 isTalisman 認出', isTalisman(talisman) === true);
eq('兵符 Force = 1（位掩碼，只解鎖兵種）', num(talisman.Force), 1);
eq('bonusOf(兵符).STR = 0', bonusOf(talisman).STR, 0);
ok('bonusOf(兵符) 十項屬性全 0',
  STAT_KEYS.every((k) => bonusOf(talisman)[k] === 0));
eq('applyEquip(關羽, {amulet: 兵符}) 的 STR 仍是 99',
  applyEquip(G('關羽'), { amulet: 1 }).STR, 99);
eq('兵符塞進 equips 會被 normalizeEquips 丟掉',
  Object.keys(normalizeEquips({ amulet: 1 })).length, 0);
eq('兵符位掩碼解出 1 位', bitsOf(num(talisman.Force)).length, 1);
eq('女兵兵符 Force=4096 → 第 12 位', bitsOf(num(I(13).Force)).join(','), '4096');
eq('陣法之書 Battle 位掩碼 seq64=1', bitsOf(num(I(64).Battle)).join(','), '1');

group('加成照表算');
const guanyu = G('關羽');
eq('關羽基礎 STR 99 / INT 85', [guanyu.STR, guanyu.INT].join('/'), '99/85');
eq('方天畫戟 STR = 30', num(I(45).STR), 30);
eq('關羽裝方天畫戟 → STR 129', applyEquip(guanyu, { weapon: 45 }).STR, 129);
eq('關羽裝孫子兵法 → INT 105', applyEquip(guanyu, { book: 52 }).INT, 105);
eq('裝兵書不動武力', applyEquip(guanyu, { book: 52 }).STR, 99);
eq('赤兔 Speed 6 → 關羽速度 6', applyEquip(guanyu, { horse: 63 }).Speed, 6);
eq('關羽基礎忠誠 100（generals.json 的 Loyal 欄位）', num(guanyu.Loyal), 100);
eq('珠寶 Loyal 12 → 忠誠 100+12=112', applyEquip(guanyu, { amulet: 77 }).Loyal, 112);
eq('四槽疊加 STR/INT/Speed/Loyal = 129/105/6/112',
  (() => {
    const g = applyEquip(guanyu, { weapon: 45, horse: 63, book: 52, amulet: 77 });
    return [g.STR, g.INT, g.Speed, g.Loyal].join('/');
  })(), '129/105/6/112');
eq('四槽 _bonus 標記齊全', Object.keys(
  applyEquip(guanyu, { weapon: 45, horse: 63, book: 52, amulet: 77 })._equips).length, 4);
eq('bonusText(方天畫戟)', bonusText(I(45)), '武力 +30');
eq('bonusText(兵符)', bonusText(I(1)), '無屬性加成');
ok('bonusOf(null) 全 0', Object.values(bonusOf(null)).every((v) => v === 0));

/* ================= ③ 同槽 / 卸下 / 存檔 ================= */
group('同槽只能一件 · 卸下回原值');
const one = equipItem({}, 14);                       // 直劍 STR+1
const two = equipItem(one, 45);                      // 換方天畫戟 STR+30
eq('換刀後 weapon 槽只剩 45', two.weapon, 45);
eq('換刀後 STR = 129（不是 +1+30=130）', applyEquip(guanyu, two).STR, 129);
eq('同槽數量恆為 1', Object.keys(two).filter((k) => k === 'weapon').length, 1);
eq('卸下兵器後回 99', applyEquip(guanyu, unequipSlot(two, 'weapon')).STR, 99);
eq('卸下後裝備表為空', Object.keys(unequipSlot(two, 'weapon')).length, 0);
eq('equippedSlot(two, 45) = weapon', equippedSlot(two, 45), 'weapon');
eq('equippedSlot(two, 14) = null', equippedSlot(two, 14), null);
eq('槽位不匹配（武器塞 horse 槽）被丟掉',
  Object.keys(normalizeEquips({ horse: 45 })).length, 0);
eq('不存在的 Sequence 被丟掉',
  Object.keys(normalizeEquips({ weapon: 999 })).length, 0);
eq('垃圾輸入 normalizeEquips(null) → {}', JSON.stringify(normalizeEquips(null)), '{}');
eq('applyEquip 不修改傳入武將', (() => {
  const before = JSON.stringify(guanyu);
  applyEquip(guanyu, { weapon: 45, book: 52 });
  return JSON.stringify(guanyu) === before;
})(), true);

group('存檔 roundtrip');
const saved = JSON.stringify({ equip: { 關羽: { weapon: 45, book: 52 }, 張飛: { horse: 63 } },
  bag: [1, 4, 14, 45, 49, 52, 56, 57, 63, 73, 76, 77] });
const back = JSON.parse(saved);
eq('存檔 equip 兩名武將', Object.keys(back.equip).length, 2);
eq('存檔 bag 12 件', back.bag.length, 12);
eq('讀回後關羽 STR 仍 129', applyEquip(G('關羽'), back.equip['關羽']).STR, 129);
eq('讀回後張飛速度 6', applyEquip(G('張飛'), back.equip['張飛']).Speed, 6);
eq('存入的裝備 Sequence 都能在 items 找到',
  Object.values(back.equip).flatMap((e) => Object.values(e))
    .every((seq) => itemOf(seq) !== null), true);
eq('totalBonus(關羽裝備) = 武力30 / 智力20',
  (() => { const t = totalBonus(back.equip['關羽']); return `${t.STR}/${t.INT}`; })(), '30/20');

group('全表掃描');
eq('55 件可裝備的總加成向量與欄位一致', (() => {
  const bad = items.filter(isEquippable).filter((it) => {
    const b = bonusOf(it);
    return STAT_KEYS.some((k) => b[k] !== num(it[k]));
  });
  return bad.length;
})(), 0);
eq('沒有任何可裝備品帶 Force 位掩碼（兵符才帶）',
  items.filter(isEquippable).filter((it) => num(it.Force) > 0).length, 0);

/* ================= 收尾 ================= */
console.log('\n' + '='.repeat(56));
if (fail) {
  console.log('失敗項：');
  for (const f of failures) console.log('  - ' + f);
}
console.log(`${pass} 過 / ${fail} 敗`);
process.exit(fail ? 1 : 0);
