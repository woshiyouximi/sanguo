/**
 * 出陣隊列（core/deploy_queue.ts）自檢。跑法：
 *   cd F:\sanguo\game
 *   node --test tests/deploy_queue.test.ts
 *
 * 這一層存在的理由：軍師技 `3 後選出陣`（`Execute 34`）的 `0x44DE44` 零狀態寫入，
 * `ATTRIB=1` 表明它是戰前選擇 —— 真實語義「使用方在敵方之後選出陣武將」落在
 * 原作 Obj3 部隊池的 5 個武將槽（`docs/07b` §6），不在戰場內核（project/109 §5.3、
 * project/162）。所以這裡釘的是編成層契約：槽數、順序、兵種/兵力、存檔往返、舊檔兼容。
 *
 * R81 反彙編更正：原作每側只有 **1 個出陣位**（`0x446F45` 的 `[eax+4]` 單一下標），
 * 「前 3 槽可重排」是 [推測]、已被證偽 —— 見 `work/r81_exec34/REPORT.md`。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TROOP,
  DEFAULT_TROOPS,
  DEPLOY_FIELD_SLOTS,
  DEPLOY_SLOTS,
  ORIGINAL_DEPLOY_PICK_SLOTS,
  canMove,
  chooseAfterFoe,
  fillQueue,
  hasQueue,
  makeQueue,
  makeSlot,
  moveDown,
  moveSlot,
  moveUp,
  normalizeQueue,
  parseQueueKey,
  pickDeploy,
  queueKey,
  queueOf,
  sameQueue,
  saveQueue,
  setGeneral,
  setTroop,
  setTroops,
  swapSides,
} from '../src/core/deploy_queue.ts';

const NAMES = ['張飛', '關羽', '趙雲', '馬超', '黃忠'];
const names = (q: ReturnType<typeof makeQueue>): string[] => q.map((s) => s.general);

// ---------------------------------------------------------------------------
// 一、建隊列 / 槽位
// ---------------------------------------------------------------------------

test('makeQueue：保序、去重、截到 5 槽（原作 Obj3 每隊 5 個武將槽）', () => {
  const q = makeQueue(['張飛', '關羽', '張飛', '趙雲', '馬超', '黃忠', '魏延', '']);
  assert.equal(DEPLOY_SLOTS, 5);
  assert.deepEqual(names(q), NAMES, '重複的張飛只留第一槽，魏延被 5 槽上限截掉');
  assert.ok(q.every((s) => s.troop === DEFAULT_TROOP && s.troops === DEFAULT_TROOPS));
});

test('makeQueue：troopOf / troopsOf 逐將給值，兵力夾 1..100', () => {
  const q = makeQueue(['張飛', '關羽'], {
    troopOf: (n) => (n === '張飛' ? '槍' : '弓'),
    troopsOf: (n) => (n === '張飛' ? 250 : 0),
  });
  assert.deepEqual(q.map((s) => [s.general, s.troop, s.troops]), [
    ['張飛', '槍', 100],
    ['關羽', '弓', 1],
  ]);
});

test('makeSlot：缺省兵種/兵力，壞值回缺省而不是 NaN', () => {
  assert.deepEqual(makeSlot('張飛'), { general: '張飛', troop: '刀', troops: 100 });
  assert.deepEqual(makeSlot('  ', '槍'), { general: '', troop: '槍', troops: 100 });
  const bad = makeSlot('關羽', '', Number.NaN);
  assert.equal(bad.troop, '刀');
  assert.equal(bad.troops, 100);
});

// ---------------------------------------------------------------------------
// 二、順序移動（驗收核心：第 3 槽 → 第 1 槽）
// ---------------------------------------------------------------------------

test('moveSlot：第 3 槽上移到第 1 槽，其餘相對順序不變', () => {
  const q = makeQueue(NAMES);
  const moved = moveSlot(q, 2, 0);
  assert.deepEqual(names(moved), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
  assert.deepEqual(names(q), NAMES, '純函式：原陣列不動');
  assert.deepEqual(moved[0], { general: '趙雲', troop: '刀', troops: 100 });
});

test('moveSlot / moveUp / moveDown：越界與同槽都是原樣返回（不拋異常）', () => {
  const q = makeQueue(NAMES);
  assert.deepEqual(names(moveSlot(q, 0, 0)), NAMES);
  assert.deepEqual(names(moveSlot(q, -1, 2)), NAMES);
  assert.deepEqual(names(moveSlot(q, 2, 5)), NAMES);
  assert.deepEqual(names(moveSlot(q, 9, 0)), NAMES);
  assert.deepEqual(names(moveUp(q, 0)), NAMES);
  assert.deepEqual(names(moveDown(q, 4)), NAMES);
  assert.deepEqual(names(moveUp(q, 3)), ['張飛', '關羽', '馬超', '趙雲', '黃忠']);
  assert.deepEqual(names(moveDown(q, 1)), ['張飛', '趙雲', '關羽', '馬超', '黃忠']);
});

test('canMove：只認整數下標，且受 limit 限制', () => {
  assert.equal(canMove(2, 0), true);
  assert.equal(canMove(2, 2), false);
  assert.equal(canMove(1.5, 0), false);
  assert.equal(canMove(0, 3, DEPLOY_FIELD_SLOTS), false, '重製版 3 行上陣區之外的槽不給拖');
  assert.equal(canMove(2, 0, DEPLOY_FIELD_SLOTS), true);
  assert.equal(canMove(0, 4, DEPLOY_SLOTS), true);
  assert.equal(canMove(0, 5), false);
});

// ---------------------------------------------------------------------------
// 三、5 槽上限
// ---------------------------------------------------------------------------

test('5 槽上限：normalizeQueue / fillQueue / makeQueue 都不會超過 5', () => {
  const eight = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];
  assert.equal(normalizeQueue(eight).length, 5);
  assert.equal(makeQueue(eight).length, 5);
  assert.equal(fillQueue([], eight).length, 5);
  assert.equal(fillQueue(makeQueue(['甲', '乙']), eight).length, 5);
  assert.equal(moveSlot(eight, 0, 4, 99).length, 5, 'limit 再大也截 5');
});

test('normalizeQueue：壞槽/字符串槽/重複槽全部清掉，永遠回新陣列', () => {
  const raw = [
    '張飛',
    { general: '關羽', troop: '弓', troops: 30 },
    { general: '', troop: '槍' },
    { name: '沒有 general 欄' },
    '張飛',
    null,
    42,
    { general: ' 趙雲 ', troops: 999 },
  ];
  const q = normalizeQueue(raw);
  assert.deepEqual(q, [
    { general: '張飛', troop: '刀', troops: 100 },
    { general: '關羽', troop: '弓', troops: 30 },
    { general: '趙雲', troop: '刀', troops: 100 },
  ]);
  assert.notEqual(q, raw);
  assert.deepEqual(normalizeQueue('不是陣列'), []);
  assert.deepEqual(normalizeQueue(undefined), []);
});

// ---------------------------------------------------------------------------
// 四、換兵種 / 兵力 / 武將
// ---------------------------------------------------------------------------

test('setTroop：只改指定槽的兵種，空串回缺省', () => {
  const q = setTroop(makeQueue(NAMES), 1, '弩');
  assert.equal(q[1]!.troop, '弩');
  assert.equal(q[0]!.troop, '刀');
  assert.equal(setTroop(q, 1, '')![1]!.troop, '刀');
  assert.deepEqual(names(setTroop(q, 99, '槍')), NAMES, '越界原樣返回');
});

test('setTroops：夾 1..100，NaN 原樣返回', () => {
  const q = makeQueue(NAMES);
  assert.equal(setTroops(q, 0, 0)![0]!.troops, 1);
  assert.equal(setTroops(q, 0, 250)![0]!.troops, 100);
  assert.equal(setTroops(q, 0, 37)![0]!.troops, 37);
  assert.equal(setTroops(q, 0, Number.NaN)![0]!.troops, 100);
});

test('setGeneral：新名字已在別槽 → 兩槽互換（同一人不能佔兩槽）', () => {
  const q = makeQueue(NAMES);
  const swapped = setGeneral(q, 0, '黃忠');
  assert.deepEqual(names(swapped), ['黃忠', '關羽', '趙雲', '馬超', '張飛']);
  const replaced = setGeneral(q, 0, '魏延');
  assert.deepEqual(names(replaced), ['魏延', '關羽', '趙雲', '馬超', '黃忠']);
  assert.deepEqual(names(setGeneral(q, 0, '  ')), NAMES);
});

// ---------------------------------------------------------------------------
// 五、序列化往返 + 舊檔缺字段兼容
// ---------------------------------------------------------------------------

test('saveQueue → JSON → queueOf：往返一致，且只碰 deployQueue 一個鍵', () => {
  const save: { gold: number; owned: string[]; deployQueue?: unknown } = {
    gold: 1200,
    owned: ['下邳'],
  };
  const q = makeQueue(NAMES, { troopOf: (n) => (n === '張飛' ? '槍' : '刀'), troopsOf: () => 60 });
  const written = saveQueue(save, q);
  assert.deepEqual(names(written), NAMES);
  assert.equal(save.gold, 1200, '不碰別的欄位');
  assert.deepEqual(save.owned, ['下邳']);

  const parsed = JSON.parse(JSON.stringify(save)) as typeof save;
  const back = queueOf(parsed, ['不該用到']);
  assert.deepEqual(back, q, '存檔往返後槽序/兵種/兵力全等');
  assert.equal(hasQueue(parsed), true);
});

test('舊檔缺 deployQueue：queueOf 按「當前出戰 5 將」即時生成，不寫檔、不拋異常', () => {
  const legacy: { owned: string[]; deployQueue?: unknown } = { owned: ['下邳'] };
  assert.equal(hasQueue(legacy), false);
  const q = queueOf(legacy, NAMES);
  assert.deepEqual(names(q), NAMES);
  assert.ok(q.every((s) => s.troop === '刀' && s.troops === 100));
  assert.equal('deployQueue' in legacy, false, 'queueOf 是唯讀的，不會偷偷塞字段');
  assert.deepEqual(queueOf(null, NAMES), makeQueue(NAMES));
  assert.deepEqual(queueOf({}, []), []);
});

test('舊檔字段壞掉：能讀的槽留下、其餘按 fallback 5 將補齊', () => {
  const save = { deployQueue: [{ general: '關羽', troop: '弓' }, { general: '' }, { general: '關羽' }, 42] };
  const q = queueOf(save, NAMES);
  assert.deepEqual(names(q), ['關羽', '張飛', '趙雲', '馬超', '黃忠'], '已有順序保留，缺的按 fallback 補');
  assert.equal(q[0]!.troop, '弓');
  assert.equal(q[0]!.troops, 100);
});

test('queueKey / parseQueueKey：緊湊串往返，缺兵數按缺省補、空片段丟掉', () => {
  const q = makeQueue(['張飛', '關羽'], { troopOf: (n) => (n === '張飛' ? '槍' : '刀'), troopsOf: () => 80 });
  const key = queueKey(q);
  assert.equal(key, '張飛:槍:80;關羽:刀:80');
  assert.deepEqual(parseQueueKey(key), q);
  assert.deepEqual(parseQueueKey(';;張飛:槍:80;;'), [q[0]]);
  // 缺兵數的片段仍可讀（兵數回缺省 100）：URL 手寫 `?dq=張飛,槍` 不該整條丟掉。
  assert.deepEqual(parseQueueKey('壞:片段'), [{ general: '壞', troop: '片段', troops: 100 }]);
  assert.deepEqual(parseQueueKey(42), []);
  assert.equal(queueKey([]), '');
});

// ---------------------------------------------------------------------------
// 六、chooseAfterFoe 語義（seq 3 的落地契約）
// ---------------------------------------------------------------------------

test('chooseAfterFoe：敵方先定不得再改，我方只有 1 個出陣位、可從任一槽挑', () => {
  const foe = makeQueue(['敵甲', '敵乙', '敵丙', '敵丁', '敵戊']);
  const mine = makeQueue(NAMES);
  const plan = chooseAfterFoe(foe, mine);
  assert.equal(plan.fieldSlots, ORIGINAL_DEPLOY_PICK_SLOTS, '原作每側只有 1 個出陣位');
  assert.deepEqual(plan.reorderable, [0], '可決定的槽只有出陣位（第 0 槽）');
  assert.deepEqual(plan.pickable, [0, 1, 2, 3, 4], '列表裏 5 員任選一員當出陣武將');
  assert.equal(plan.pickOrder, 'foe-first', '敵方先定、我方後選');
  assert.equal(plan.foeLeader, '敵甲');
  assert.equal(plan.mineLeader, '張飛');
  assert.deepEqual(plan.foe, foe, '敵方隊列原樣帶出');
  assert.deepEqual(plan.mine, mine);

  // 第 3 槽（趙雲）→ 出陣位：原作列表點選就是 `army->+0x04 = 光標`，任意一員都行。
  assert.deepEqual(names(pickDeploy(plan.mine, 2)), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
  // 出陣位只有 1 個，所以 moveSlot 用 fieldSlots 當 limit 時第 4/5 槽不給動（與舊行為一致）。
  assert.deepEqual(names(moveSlot(plan.mine, 3, 0, plan.fieldSlots)), NAMES);
  assert.equal(canMove(0, 1, plan.fieldSlots), false, '重排範圍只有 1 槽');
  // 敵方是輸入，函式不會改它。
  assert.deepEqual(names(plan.foe), ['敵甲', '敵乙', '敵丙', '敵丁', '敵戊']);
});

test('chooseAfterFoe：fieldSlots 一律夾到 0..1（舊的「3 槽」入參被證偽），空隊列也不炸', () => {
  assert.equal(chooseAfterFoe([], [], 99).fieldSlots, ORIGINAL_DEPLOY_PICK_SLOTS);
  assert.deepEqual(chooseAfterFoe([], [], 99).reorderable, [0]);
  assert.equal(chooseAfterFoe([], [], 3).fieldSlots, 1, '傳 3 也夾到 1');
  assert.equal(chooseAfterFoe([], [], -1).fieldSlots, 0);
  assert.deepEqual(chooseAfterFoe([], [], -1).reorderable, []);
  assert.deepEqual(chooseAfterFoe([], []).pickable, []);
  assert.equal(chooseAfterFoe([], []).foeLeader, null);
  assert.equal(chooseAfterFoe([], []).mineLeader, null);
  assert.deepEqual(pickDeploy([], 0), []);
  assert.deepEqual(pickDeploy([], 9), []);
});

test('swapSides：兩份隊列對調，且不共享槽對象引用', () => {
  const a = makeQueue(['甲', '乙']);
  const b = makeQueue(['丙', '丁']);
  const out = swapSides(a, b);
  assert.deepEqual(names(out.a), ['丙', '丁']);
  assert.deepEqual(names(out.b), ['甲', '乙']);
  out.a[0]!.general = '改過';
  assert.equal(b[0]!.general, '丙', '改回傳值不影響來源');
});

test('sameQueue：順序算差異，兵種/兵力也算', () => {
  const q = makeQueue(NAMES);
  assert.equal(sameQueue(q, makeQueue(NAMES)), true);
  assert.equal(sameQueue(q, moveSlot(q, 2, 0)), false, '順序不同就不等');
  assert.equal(sameQueue(q, setTroop(q, 0, '槍')), false);
  assert.equal(sameQueue(q, setTroops(q, 0, 50)), false);
  assert.equal(sameQueue([], []), true);
});
