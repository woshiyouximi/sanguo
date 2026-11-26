// @ts-nocheck
/**
 * F-09 / F-10 守門：Cocos 側「存檔容器遷移」+「手動存檔不改自動目標」。
 *
 * 對應 `work/parity_sweep/REPORT.md`：
 *  - F-09 [P1] 存檔容器/格式分裂且無版本遷移：web 單容器 `sanguo_saves_v1`（v3 快照），
 *    Cocos `sanguo_slots_v1` 索引 + `sanguo_slot_payload_v1_<n>` 每格本體；
 *    `SaveSlots.ts` 原本明寫「不做存檔格式遷移」。
 *  - F-10 [P1] 手動存檔語義相反：Cocos `saveToSlot` 存完把 `index.active` 改到該槽；
 *    web（`campaign.html:2003-2004`、project/89 4b）明確「手動存檔不改自動存檔目標」。
 *
 * 本輪改動（Cocos 側，給 lead 的 save_unify 任務）：
 *   · `SaveSlots.ts` 新增 `migrateLegacySaves()`：盤上只有 web 舊鍵時遷移成 Cocos 槽結構，
 *     舊鍵只讀不刪、冪等、壞檔不崩（回退空索引）；
 *   · `saveToSlot` 不再改 `active`；另加 `saveAutoSlot()`（自動存檔仍寫 active 槽、但不改它）。
 *
 * 基線（改動前 probe2 實測，已寫進 `work/save_unify/REPORT.md`）：空盤上
 * `saveToSlot(save, 2, { now: 123 })` 寫出 `sanguo_slots_v1 = {"active":2,...}` ——
 * 手動存檔把自動存檔目標帶到槽 2。第 6/7 條測試把新語義釘死。
 *
 * 跑法：`cd F:\sanguo\game; node --test tests/save_slots_unify.test.ts`
 *
 * 為什麼要 `registerHooks`：`SaveSlots.ts` 頂部 `import … from 'cc'`，類別前有
 * `@ccclass('SaveSlotsPanel')` 裝飾器（Node 24 的 type-strip 不解析裝飾器）。這裡：
 *   · resolve hook 把 `cc` 短路成 data: URL 空殼樁，並給無副檔名的相對 import 補 `.ts`；
 *   · load hook 只對 `SaveSlots.ts` 生效：剝掉唯一一行裝飾器再 `stripTypeScriptTypes`。
 * 本檔只測純邏輯，不建面板節點（與 `capture_gate_cocos.test.ts` 的載入套路同源）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SAVE_SLOTS_URL = new URL('../cocos/assets/scripts/SaveSlots.ts', import.meta.url).href;

/** `cc` 空殼樁：只要能解析 import / 裝飾器即可，面板節點邏輯不參與測試 */
const CC_STUB = `
export const _decorator = { ccclass: () => (target) => target, property: () => () => {} };
export class Component {
  node = { getChildByName: () => null, addChild: () => {}, children: [], layer: 0, active: true };
  getComponent() { return null; }
  addComponent() { return null; }
}
export class Node {}
export class Label {}
export class Color { constructor() {} }
export class Graphics {}
export class UITransform {}
export class Vec3 { constructor() {} }
export class EventTouch {}
export const input = { on: () => {}, off: () => {} };
export const Input = { EventType: {} };
export const director = { loadScene: () => {} };
export const game = { on: () => {}, off: () => {} };
export class Game { static EVENT_SHOW = 'game-show'; static EVENT_HIDE = 'game-hide'; static EVENT_HIDDEN = 'game-hidden'; static EVENT_GAME_INITED = 'game-inited'; }
export const sys = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
`;
const CC_URL = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(CC_STUB);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cc') return { url: CC_URL, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // Cocos 源內部 import 不帶 `.ts` 副檔名（Cocos/Babel 習慣），Node ESM 不補
      if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(specifier + '.ts', context);
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url === SAVE_SLOTS_URL) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      // 全檔只有類別前一行 `@ccclass('SaveSlotsPanel')`；stripTypeScriptTypes 不解析裝飾器
      const stripped = source.replace(/^\s*@ccclass\([^)]*\)\s*$/m, '');
      if (stripped === source) throw new Error('SaveSlots.ts 的 @ccclass 裝飾器行不見了，本檔載入方式要更新');
      return { format: 'module', source: stripTypeScriptTypes(stripped), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

/** Cocos 正式版存檔槽邏輯（純邏輯與面板同檔，本檔只碰純邏輯） */
const SaveSlots = await import(SAVE_SLOTS_URL);
/** 只為了拿 `SAVE_KEY`（'sanguo_campaign_v1'），避免測試裡散落魔法字串 */
const GameState = await import(new URL('../cocos/assets/scripts/GameState.ts', import.meta.url).href);

/** Map 假 storage（與 `SaveSlots.SlotStorage` 同構；`dump` 方便斷言盤上內容） */
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

/** web v3 快照的最小可用樣本（欄位名照 `game/web/saves.js` 的 SNAPSHOT_REQUIRED） */
function webSnapshot(extra = {}) {
  return {
    v: 3,
    scenario: 1,
    month: 13,
    gold: 500,
    wins: 4,
    losses: 2,
    owned: ['小沛', '下邳'],
    cities: {
      小沛: { troops: 300, pop: 12000, money: 80, major: '劉備', officers: [] },
      下邳: { troops: 200, pop: 9000, money: 60, major: '關羽', officers: ['張飛'] },
    },
    roster: { 小沛: ['關羽', '張飛'] },
    king: '劉備',
    ts: 1111,
    ...extra,
  };
}

/** web 舊容器 `sanguo_saves_v1 = { v:2, last, slots[10] }`（0 起陣列，空槽是 null） */
function webContainer(slots, last = 1) {
  const padded = slots.slice(0, 10);
  while (padded.length < 10) padded.push(null);
  return JSON.stringify({ v: 2, last, slots: padded });
}

/** 讀盤上的 Cocos 索引（沒有 → null） */
function storedIndex(storage) {
  const text = storage.getItem(SaveSlots.SLOTS_KEY);
  return text ? JSON.parse(text) : null;
}

/** 讀盤上某一格的本體（沒有 → null） */
function storedPayload(storage, slot) {
  const text = storage.getItem(SaveSlots.payloadKey(slot));
  return text ? JSON.parse(text) : null;
}

/** Cocos 側記憶體存檔（`saveToSlot` / `saveAutoSlot` 的 `save` 參數） */
function makeSave(extra = {}) {
  return {
    owned: ['小沛'],
    month: 3,
    wins: 2,
    losses: 1,
    roster: { 小沛: ['關羽', '張飛'] },
    ...extra,
  };
}

/* ==================================================================== */
/* F-09：web 舊鍵 → Cocos 槽結構                                        */
/* ==================================================================== */

test('F-09 舊鍵→Cocos 結構：web last→active、slots[i]→槽 i+1、payload 可讀', () => {
  const storage = memStorage({
    [SaveSlots.LEGACY_SAVES_KEY]: webContainer(
      [null, { snapshot: webSnapshot(), ts: 1111, slotName: '開局前' }],
      2,
    ),
  });
  const result = SaveSlots.migrateLegacySaves(storage);
  assert.deepEqual(result, { migrated: true, reason: 'ok', slots: 1, active: 2 });

  const index = storedIndex(storage);
  assert.equal(index.active, 2, 'web 的 last 就是 Cocos 的自動存檔目標');
  assert.deepEqual(Object.keys(index.slots), ['2'], 'web slots[1] → Cocos 槽 2');
  const record = index.slots['2'];
  assert.equal(record.at, 1111, 'entry.ts → SlotRecord.at');
  assert.equal(record.meta.name, '開局前', 'entry.slotName → meta.name');
  assert.equal(record.meta.monarch, '劉備', '快照沒 monarch 時回退 king');
  assert.equal(record.meta.cities, 2);
  assert.equal(record.meta.month, 13);
  assert.equal(record.meta.monthText, '第2年1月');
  assert.equal(record.meta.wins, 4);
  assert.equal(record.meta.losses, 2);
  assert.equal(record.meta.generals, 3, 'roster 關羽/張飛 + 太守 劉備/關羽(去重)');

  const payload = storedPayload(storage, 2);
  assert.deepEqual(Object.keys(payload), [GameState.SAVE_KEY]);
  const campaign = JSON.parse(payload[GameState.SAVE_KEY]);
  assert.deepEqual(campaign.owned, ['小沛', '下邳']);
  assert.equal(campaign.month, 13);
  assert.equal(campaign.wins, 4);
  assert.equal(campaign.losses, 2);
  assert.equal(campaign.seeded, true, '有 owned → 不能再被 initCampaign 當未開局送 3 座城');
  assert.deepEqual(Object.keys(campaign.cities), ['小沛', '下邳']);
  assert.deepEqual(Object.keys(campaign.roster), ['小沛']);
});

test('F-09 冪等：第二次遷移 no-op，索引與舊鍵逐字不變', () => {
  const legacyText = webContainer([{ snapshot: webSnapshot(), ts: 777 }], 1);
  const storage = memStorage({ [SaveSlots.LEGACY_SAVES_KEY]: legacyText });
  assert.equal(SaveSlots.migrateLegacySaves(storage).reason, 'ok');
  const indexAfterFirst = storage.getItem(SaveSlots.SLOTS_KEY);
  const legacyAfterFirst = storage.getItem(SaveSlots.LEGACY_SAVES_KEY);
  assert.equal(legacyAfterFirst, legacyText, '遷移不該改舊鍵');

  const second = SaveSlots.migrateLegacySaves(storage);
  assert.deepEqual(second, { migrated: false, reason: 'has-slots', slots: 0, active: 1 });
  assert.equal(storage.getItem(SaveSlots.SLOTS_KEY), indexAfterFirst);
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), legacyAfterFirst);

  // readIndex 也會觸發遷移，但同樣不能改寫既有索引
  assert.equal(SaveSlots.readIndex(storage).active, 1);
  assert.equal(storage.getItem(SaveSlots.SLOTS_KEY), indexAfterFirst);
});

test('F-09 舊鍵只讀不刪：遷移後 web 仍能讀；之後刪槽/存槽都不動它', () => {
  const legacyText = webContainer(
    [{ snapshot: webSnapshot(), ts: 1 }, null, { snapshot: webSnapshot({ month: 20 }), ts: 2 }],
    3,
  );
  const storage = memStorage({ [SaveSlots.LEGACY_SAVES_KEY]: legacyText });
  assert.equal(SaveSlots.migrateLegacySaves(storage).slots, 2);
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), legacyText);

  SaveSlots.deleteSlot(1, storage);
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), legacyText, '刪槽不該動 web 舊鍵');
  SaveSlots.saveToSlot(makeSave(), 5, { now: 5 }, storage);
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), legacyText, '存槽不該動 web 舊鍵');
  assert.deepEqual(Object.keys(storedIndex(storage).slots).sort(), ['3', '5']);
});

test('F-09 壞 JSON：不崩、不寫索引、readIndex 回空檔', () => {
  const bad = '{ 這不是 JSON';
  const storage = memStorage({ [SaveSlots.LEGACY_SAVES_KEY]: bad });
  const result = SaveSlots.migrateLegacySaves(storage);
  assert.deepEqual(result, { migrated: false, reason: 'bad-json', slots: 0, active: 1 });
  assert.equal(storage.getItem(SaveSlots.SLOTS_KEY), null, '壞檔不該寫索引');

  assert.deepEqual(SaveSlots.readIndex(storage), { active: 1, slots: {} }, '遷移失敗 → 回退空檔');
  assert.equal(storage.getItem(SaveSlots.SLOTS_KEY), null, 'readIndex 觸發遷移也不能寫');
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), bad, '壞掉的舊鍵也原樣保留');
});

test('F-09 空容器→empty（不寫索引、可重試）；非物件 snapshot 跳過', () => {
  const empty = memStorage({ [SaveSlots.LEGACY_SAVES_KEY]: webContainer([], 1) });
  assert.deepEqual(SaveSlots.migrateLegacySaves(empty), {
    migrated: false,
    reason: 'empty',
    slots: 0,
    active: 1,
  });
  assert.equal(empty.getItem(SaveSlots.SLOTS_KEY), null);

  const mixed = memStorage({
    [SaveSlots.LEGACY_SAVES_KEY]: webContainer(
      [
        null,
        { snapshot: 42 },
        {
          snapshot: webSnapshot({ owned: ['小沛'], cities: {}, roster: { 小沛: ['關羽'] }, month: 2 }),
          ts: 5,
        },
      ],
      3,
    ),
  });
  const result = SaveSlots.migrateLegacySaves(mixed);
  assert.deepEqual(result, { migrated: true, reason: 'ok', slots: 1, active: 3 });
  assert.deepEqual(Object.keys(storedIndex(mixed).slots), ['3'], '非物件 snapshot 的空槽跳過');
});

test('F-09 遷移意外拋錯：吞掉回 error，不影響呼叫端', () => {
  const storage = {
    getItem: (key) => {
      if (key === SaveSlots.LEGACY_SAVES_KEY) throw new Error('storage 壞了');
      return null;
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(SaveSlots.migrateLegacySaves(storage), {
    migrated: false,
    reason: 'error',
    slots: 0,
    active: 1,
  });
});

test('F-09 已有 Cocos 索引時絕不覆蓋（舊鍵壞掉也不影響）', () => {
  const existing = JSON.stringify({
    active: 4,
    slots: {
      '4': {
        at: 1,
        meta: { monarch: '孫權', cities: 1, month: 5, wins: 0, losses: 0, generals: 0, scenario: '', name: '' },
      },
    },
  });
  const legacyText = webContainer([{ snapshot: webSnapshot(), ts: 2 }], 1);
  const storage = memStorage({
    [SaveSlots.SLOTS_KEY]: existing,
    [SaveSlots.LEGACY_SAVES_KEY]: legacyText,
  });
  const result = SaveSlots.migrateLegacySaves(storage);
  assert.deepEqual(result, { migrated: false, reason: 'has-slots', slots: 0, active: 1 });
  assert.equal(storage.getItem(SaveSlots.SLOTS_KEY), existing);

  const index = SaveSlots.readIndex(storage);
  assert.equal(index.active, 4);
  assert.deepEqual(Object.keys(index.slots), ['4']);
  assert.equal(storage.getItem(SaveSlots.LEGACY_SAVES_KEY), legacyText, '舊鍵原樣保留（web 還能讀）');
});

test('F-09 跨端欄位：owns→owned、month 字串轉整數、roster 武將數、entry 摘要覆蓋', () => {
  const longName = '繁體槽名'.repeat(6); // 24 字 > SLOT_NAME_MAX
  const snapshot = {
    owns: ['小沛', ' 下邳 ', ''],
    month: '27',
    wins: '3',
    losses: '1',
    scenario: 2,
    roster: { 小沛: ['關羽', '張飛', '張飛'] },
    cities: {},
  };
  const storage = memStorage({
    [SaveSlots.LEGACY_SAVES_KEY]: webContainer(
      [{ snapshot, ts: 9, slotName: longName, monarch: '曹操', scenarioName: '討伐董卓' }],
      1,
    ),
  });
  assert.equal(SaveSlots.migrateLegacySaves(storage).slots, 1);

  const campaign = JSON.parse(storedPayload(storage, 1)[GameState.SAVE_KEY]);
  assert.deepEqual(campaign.owned, ['小沛', '下邳'], 'owns 收斂成 owned、去空去重');
  assert.equal(Object.prototype.hasOwnProperty.call(campaign, 'owns'), false, '舊別名不留在主檔');
  assert.equal(campaign.month, 27);
  assert.equal(typeof campaign.month, 'number', 'month 字串要轉成數字');
  assert.equal(campaign.wins, 3);
  assert.equal(campaign.losses, 1);
  assert.equal(campaign.seeded, true);

  const meta = storedIndex(storage).slots['1'].meta;
  assert.equal(meta.monarch, '曹操', 'entry.monarch 優先於快照');
  assert.equal(meta.scenario, '討伐董卓', 'entry.scenarioName → meta.scenario');
  assert.equal(meta.month, 27);
  assert.equal(meta.monthText, '第3年3月');
  assert.equal(meta.cities, 2);
  assert.equal(meta.generals, 2, 'roster 去重後 2 人');
  assert.equal(meta.name, longName.slice(0, SaveSlots.SLOT_NAME_MAX));
});

test('F-09 遷移後的槽可讀：loadFromSlot 寫回 live 鍵、active 指到讀槽（web loadSlot 同款）', () => {
  const storage = memStorage({
    [SaveSlots.LEGACY_SAVES_KEY]: webContainer([null, { snapshot: webSnapshot(), ts: 1111 }], 2),
  });
  assert.equal(SaveSlots.migrateLegacySaves(storage).active, 2);

  const result = SaveSlots.loadFromSlot(2, storage);
  assert.equal(result.ok, true);
  assert.equal(result.slot, 2);
  assert.deepEqual(result.keys, [GameState.SAVE_KEY]);

  const live = JSON.parse(storage.getItem(GameState.SAVE_KEY));
  assert.deepEqual(live.owned, ['小沛', '下邳']);
  assert.equal(live.month, 13);
  // web `loadSlot` 讀完會把 `store.last` 指到讀的那格（campaign.html:2032-2035），Cocos 同語義；
  // F-10 只要求「手動存檔」不改 active。
  assert.equal(SaveSlots.readIndex(storage).active, 2);
});

/* ==================================================================== */
/* F-10：手動存檔不改自動目標；自動存檔仍寫 active 槽                    */
/* ==================================================================== */

test('F-10 手動存檔不改 active：連存多格、換目標後再存都不動自動目標', () => {
  const storage = memStorage();
  const save = makeSave();
  assert.ok(SaveSlots.saveToSlot(save, 1, { now: 10 }, storage));
  assert.equal(SaveSlots.readIndex(storage).active, 1, '首次存檔建立索引，active 預設 1');

  SaveSlots.saveToSlot(save, 5, { now: 20 }, storage);
  SaveSlots.saveToSlot(save, 9, { now: 30 }, storage);
  const index = SaveSlots.readIndex(storage);
  assert.equal(index.active, 1, '手動存檔不該把 active 帶到槽 9（F-10 病灶）');
  assert.deepEqual(Object.keys(index.slots).sort(), ['1', '5', '9']);

  SaveSlots.setActiveSlot(3, storage);
  SaveSlots.saveToSlot(save, 1, { now: 40 }, storage);
  assert.equal(SaveSlots.readIndex(storage).active, 3, '手動存檔不該把 active 帶回槽 1');
});

test('F-10 自動存檔仍寫 active 槽、且不改 active', () => {
  const storage = memStorage();
  SaveSlots.saveToSlot(makeSave({ month: 3 }), 1, { now: 10 }, storage);
  SaveSlots.setActiveSlot(3, storage);

  const auto = SaveSlots.saveAutoSlot(makeSave({ month: 7, wins: 9 }), { now: 20 }, storage);
  assert.ok(auto);
  assert.equal(auto.meta.month, 7);

  const index = SaveSlots.readIndex(storage);
  assert.equal(index.active, 3, '自動存檔不該改 active');
  assert.equal(index.slots['3'].meta.month, 7, '自動存檔要寫 active 槽');
  assert.equal(index.slots['1'].meta.month, 3, '非 active 槽不動');
  assert.deepEqual(Object.keys(index.slots).sort(), ['1', '3']);
});
