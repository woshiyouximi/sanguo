/**
 * Exec34「後選出陣」——**反彙編真相測試**（R81）。
 *
 * 目的：把 `project/199` 第 139/222/244 行的 R81 從 [推測] 變 [反彙編]，
 * 並把「3 槽」這個說法釘死在代碼裏：原作的出陣位只有 **1** 個，沒有「前 3 槽」。
 *
 * 證據檔：`F:\sanguo\work\orig_numbers\text_dis.tsv`
 *   （5 列 TSV：位址 / 位元組 / 助記符 / 運算元 / 跳轉註記；例：`00450132\t55\tpush\tebp`）。
 *   該檔不在（例如只 checkout 了 `game/`）時，反彙編那幾條自動 `skip`，語義斷言照跑。
 *   逐條結論與位址見 `F:\sanguo\work\r81_exec34\REPORT.md`。
 *
 * 三條結論（每條都有下面的斷言背書）：
 *   1. Exec34 操作的是「每側唯一的出陣下標」`army->+0x04`（`0x446F45` 只取一個 entry），
 *      「3」不是原作的槽數 —— 全段沒有 `cmp ...,3`；3 是本重製版的戰場寬度
 *      （`DEPLOY_FIELD_SLOTS`，每側 3 個單位）。
 *   2. 「後選出陣」= **敵方先定、我方後選**（時點/順序），不是「選後面 3 位」。
 *      落地動作是 `army->+0x04 = 列表首行 + 光標`（`0x449853` / `0x4496D1`），
 *      界限是列表控件里的**條目總數**（`[0x491034]` / `[0x491094]`），可選任意一員。
 *   3. 隊列改動**不回寫存檔、也不碰 `soldiers`/站位**：`0x44DE44` 只有一句「成功」消息，
 *      零狀態寫入；重製版的回寫只有 `save.deployQueue` 這一個鍵（`saveQueue`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_FIELD_SLOTS,
  DEPLOY_SLOTS,
  ORIGINAL_DEPLOY_EVIDENCE,
  ORIGINAL_DEPLOY_PICK_SLOTS,
  canMove,
  chooseAfterFoe,
  fillQueue,
  hasQueue,
  makeQueue,
  moveSlot,
  normalizeQueue,
  pickDeploy,
  queueKey,
  queueOf,
  saveQueue,
  setTroop,
  swapSides,
} from '../src/core/deploy_queue.ts';

const NAMES = ['張飛', '關羽', '趙雲', '馬超', '黃忠'];
const FOE = ['敵甲', '敵乙', '敵丙', '敵丁', '敵戊'];
const names = (q: ReadonlyArray<{ general: string }>): string[] => q.map((s) => s.general);

// ---------------------------------------------------------------------------
// 反彙編索引（`text_dis.tsv` 只讀一次；缺檔就返回 null）
// ---------------------------------------------------------------------------

const TSV_URL = new URL('../../work/orig_numbers/text_dis.tsv', import.meta.url);
let TSV: Map<string, string> | null | undefined;

/** 位址（大寫十六進位，無 0x）→ 「助記符 運算元」。 */
function dis(): Map<string, string> | null {
  if (TSV !== undefined) return TSV;
  try {
    const text = readFileSync(fileURLToPath(TSV_URL), 'utf8');
    const map = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const cols = line.split('\t');
      if (cols.length < 4) continue;
      const addr = cols[0]!.trim().toUpperCase();
      const op = `${cols[2]!.trim()} ${cols[3]!.trim()}`.trim();
      if (addr) map.set(addr, op);
    }
    TSV = map.size > 0 ? map : null;
  } catch {
    TSV = null;
  }
  return TSV;
}

/** `[lo, hi)` 位址區間內的指令，按位址升序。 */
function between(lo: string, hi: string): Array<[string, string]> {
  const m = dis();
  if (!m) return [];
  const from = parseInt(lo, 16);
  const to = parseInt(hi, 16);
  const out: Array<[string, string]> = [];
  for (const [addr, op] of m) {
    const n = parseInt(addr, 16);
    if (n >= from && n < to) out.push([addr, op]);
  }
  out.sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16));
  return out;
}

const missing = (): string => '找不到 work/orig_numbers/text_dis.tsv，跳過反彙編斷言（語義斷言不受影響）';

// ---------------------------------------------------------------------------
// 一、3 槽的位置與順序
// ---------------------------------------------------------------------------

test('反彙編(1)：0x446F45 只取一個出陣下標 army+0x04；entries = army+0x1C、步長 0x48', (t) => {
  const m = dis();
  if (!m) return t.skip(missing());
  // 全程序只有兩個調用點，都在 0x448690（每側各一次）—— 說明「只有一個出陣位」。
  assert.equal(m.get('00446F48'), 'mov eax, dword ptr [ebp + 8]', 'arg = army');
  assert.equal(m.get('00446F4B'), 'mov ecx, dword ptr [eax + 4]', '★ 唯一的出陣下標');
  assert.equal(m.get('00446F4E'), 'imul ecx, ecx, 0x48', 'entry 步長 0x48');
  assert.equal(m.get('00446F54'), 'lea eax, [edx + ecx + 0x1c]', 'entries 基址 army+0x1C');
  // 常量表 ORIGINAL_DEPLOY_EVIDENCE 必須與原件逐條一致（防止註釋與代碼漂移）。
  assert.ok(ORIGINAL_DEPLOY_EVIDENCE.length >= 13);
  for (const [addr, op] of ORIGINAL_DEPLOY_EVIDENCE) {
    assert.equal(m.get(addr), op, `${addr} 的指令與 ORIGINAL_DEPLOY_EVIDENCE 不一致`);
  }
  // 常量面：5 個武將槽、1 個出陣位、3 是重製版戰場寬度。
  assert.equal(DEPLOY_SLOTS, 5);
  assert.equal(ORIGINAL_DEPLOY_PICK_SLOTS, 1);
  assert.equal(DEPLOY_FIELD_SLOTS, 3);
  assert.notEqual(ORIGINAL_DEPLOY_PICK_SLOTS, DEPLOY_FIELD_SLOTS, '「3 槽」= 重製版寬度，不是原作槽數');
});

test('反彙編(2)：「3」不是原作的槽數 —— 0x448690 只建 2 個單位、全段無 cmp 3', (t) => {
  const m = dis();
  if (!m) return t.skip(missing());
  // 兩側各一次 0x446F45，結果各存一個全局 —— 每側恰好 1 個單位。
  assert.equal(m.get('00448696'), 'mov eax, dword ptr [0x4a668c]', 'A 軍');
  assert.equal(m.get('0044869C'), 'call 0x446f45');
  assert.equal(m.get('004486A4'), 'mov dword ptr [0x4a8a24], eax', 'g_unitA');
  assert.equal(m.get('004486EC'), 'call 0x446f45');
  assert.equal(m.get('004486F4'), 'mov dword ptr [0x4a8a20], eax', 'g_unitB');
  assert.equal(m.get('0044873F'), 'call 0x43a1c4', '只初始化這兩個單位');
  // 0x448690 全長約 0xD0 字節：沒有任何「比較 3」「加 3」的立即數 —— 「3 槽」沒有出處。
  const body = between('00448690', '00448760');
  assert.ok(body.length > 40, '0x448690 應該是一段完整函數');
  for (const [addr, op] of body) {
    assert.ok(!/,\s*3$/.test(op), `${addr} 出現立即數 3：${op}`);
    assert.ok(!/^cmp\b/.test(op) || !/\b3\b/.test(op), `${addr} 出現與 3 的比較：${op}`);
  }
  // 出陣位取值函數同樣沒有 3：只是 base + idx*0x48。
  for (const [addr, op] of between('00446F45', '00446F5A')) {
    assert.ok(!/,\s*3$/.test(op), `${addr} 出現立即數 3：${op}`);
  }
});

test('反彙編(3)：編成頁點選寫 army->+0x04 = 光標，界限是列表長度欄位（不是 3）', (t) => {
  const m = dis();
  if (!m) return t.skip(missing());
  // B 側（0x4496D1）：[0x4a6690]+4 ← [0x49108c]（滾動首行）+ [win+0x20]（光標）
  assert.equal(m.get('004496B1'), 'mov edx, dword ptr [0x49108c]');
  assert.equal(m.get('004496B7'), 'add edx, dword ptr [ecx + 0x20]');
  assert.equal(m.get('004496C0'), 'cmp eax, dword ptr [0x491094]', '★ 界限 = 列表條目總數（不是立即數 3）');
  assert.equal(m.get('004496C8'), 'mov ecx, dword ptr [0x4a6690]');
  assert.equal(m.get('004496D1'), 'mov dword ptr [ecx + 4], edx', '★ 寫的正是那個唯一的出陣下標');
  // A 側（0x449853）：對稱，用 0x49102c / 0x491034。
  assert.equal(m.get('0044981A'), 'mov ecx, dword ptr [0x49102c]');
  assert.equal(m.get('00449829'), 'cmp edx, dword ptr [0x491034]');
  assert.equal(m.get('0044984B'), 'mov eax, dword ptr [0x4a668c]');
  assert.equal(m.get('00449853'), 'mov dword ptr [eax + 4], ecx');
});

// ---------------------------------------------------------------------------
// 二、「後選出陣」的具體排序規則
// ---------------------------------------------------------------------------

test('語義：後選出陣 = 敵方先定、我方後選；選中者插到出陣位（第 0 槽），其餘相對順序不變', () => {
  const foe = makeQueue(FOE);
  const mine = makeQueue(NAMES);
  const plan = chooseAfterFoe(foe, mine);
  assert.equal(plan.pickOrder, 'foe-first', '敵方先定');
  assert.equal(plan.foeLeader, '敵甲');
  assert.equal(plan.mineLeader, '張飛');
  assert.deepEqual(plan.reorderable, [0], '可決定的只有出陣位本身');
  assert.deepEqual(plan.pickable, [0, 1, 2, 3, 4], '列表裏 5 員任選一員當出陣武將');

  // 排序規則 = stable move-to-front：把第 i 位抽出來插到最前，其餘保持原相對順序。
  assert.deepEqual(names(pickDeploy(mine, 2)), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
  assert.deepEqual(names(pickDeploy(mine, 4)), ['黃忠', '張飛', '關羽', '趙雲', '馬超']);
  assert.deepEqual(names(pickDeploy(mine, 1)), ['關羽', '張飛', '趙雲', '馬超', '黃忠']);
  // 不是「選後面 3 位」、不是倒序、不是排序：
  assert.deepEqual(names(pickDeploy(mine, 4)), ['黃忠', '張飛', '關羽', '趙雲', '馬超']);
  assert.notDeepEqual(names(pickDeploy(mine, 2)), [...NAMES].reverse(), '不是倒序');
  // 純函數：入參不動。
  assert.deepEqual(names(mine), NAMES);
  assert.deepEqual(names(foe), FOE);
  // 「先選的敵方不得再改」——plan 的 foe 是原件拷貝，改 mine 不影響 foe。
  assert.deepEqual(names(plan.foe), FOE);
});

test('語義：3 個上陣槽（重製版）是戰場寬度，與 Exec34 的授權無關', () => {
  const plan = chooseAfterFoe(makeQueue(FOE), makeQueue(NAMES), DEPLOY_FIELD_SLOTS);
  assert.equal(plan.fieldSlots, 1, '傳 3 也夾到 1：舊的「前 3 槽可重排」已被反彙編證偽');
  assert.deepEqual(plan.reorderable, [0]);
  assert.equal(canMove(0, 1, plan.fieldSlots), false);
  assert.equal(canMove(0, 2, DEPLOY_FIELD_SLOTS), true, '3 行上陣區的拖動範圍仍由 UI 自己用');
  // 舊寫法（limit = fieldSlots = 3）在 deploy.html 裏仍然工作，只是不再由 Exec34 授權。
  assert.deepEqual(names(moveSlot(NAMES, 2, 0, DEPLOY_FIELD_SLOTS)), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
});

// ---------------------------------------------------------------------------
// 三、越界 / 不足 3 人
// ---------------------------------------------------------------------------

test('邊界：不足 3 人、0 人、越界下標都不拋異常，也不會憑空造人', () => {
  // 1 人 / 2 人：只有出陣位可挑，pickDeploy 原樣。
  assert.deepEqual(names(pickDeploy(['獨'], 0)), ['獨']);
  assert.deepEqual(names(pickDeploy(['甲', '乙'], 1)), ['乙', '甲']);
  assert.deepEqual(names(pickDeploy(['甲', '乙'], 2)), ['甲', '乙'], '越界原樣');
  // 0 人 / 壞輸入。
  assert.deepEqual(pickDeploy([], 0), []);
  assert.deepEqual(pickDeploy([], 3), []);
  assert.deepEqual(pickDeploy(null, 1), []);
  assert.deepEqual(pickDeploy('壞', 1), []);
  // 非法下標。
  assert.deepEqual(names(pickDeploy(NAMES, -1)), NAMES);
  assert.deepEqual(names(pickDeploy(NAMES, 1.5)), NAMES);
  assert.deepEqual(names(pickDeploy(NAMES, Number.NaN)), NAMES);
  assert.deepEqual(names(pickDeploy(NAMES, 99)), NAMES);
  // 隊列永遠截到 5、去重（不因「3 槽」多造一條）。
  const eight = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];
  assert.equal(normalizeQueue(eight).length, DEPLOY_SLOTS);
  assert.equal(fillQueue([], eight).length, DEPLOY_SLOTS);
  // 空隊列的 plan 不炸。
  const empty = chooseAfterFoe([], []);
  assert.equal(empty.fieldSlots, 1);
  assert.deepEqual(empty.pickable, []);
  assert.equal(empty.foeLeader, null);
  assert.equal(empty.mineLeader, null);
});

// ---------------------------------------------------------------------------
// 四、回寫存檔
// ---------------------------------------------------------------------------

test('存檔：只回寫 save.deployQueue（camelCase 一個鍵），順序即出陣序，往返不變', () => {
  const save: Record<string, unknown> = { gold: 1234, version: 3 };
  const q = makeQueue(NAMES);
  const written = saveQueue(save, pickDeploy(q, 2));
  assert.deepEqual(Object.keys(save).sort(), ['deployQueue', 'gold', 'version'], '只多一個 deployQueue 鍵');
  assert.deepEqual(names(written), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
  assert.equal(queueKey(save.deployQueue as never), '趙雲:刀:100;張飛:刀:100;關羽:刀:100;馬超:刀:100;黃忠:刀:100');
  // 欄位名就是 deployQueue —— 不是 deploy_queue / deploySlots / afterFoe。
  assert.equal(hasQueue(save), true);
  assert.equal(hasQueue({}), false);
  // JSON 往返（存檔就是 JSON）。
  const back = JSON.parse(JSON.stringify(save)) as { deployQueue: unknown };
  assert.deepEqual(names(queueOf(back, NAMES)), ['趙雲', '張飛', '關羽', '馬超', '黃忠'], '順序即出陣序');
  assert.deepEqual(queueOf(back, NAMES), queueOf(save, NAMES));
  // 缺字段 → 用當前 5 將即時生成（舊檔零遷移）。
  assert.deepEqual(names(queueOf({}, NAMES)), NAMES);
  // 寫進存檔的是純數據（槽對象是新拷貝，不與調用方共享）。
  const src = makeQueue(NAMES);
  const s2: Record<string, unknown> = {};
  saveQueue(s2, src);
  src[0]!.general = '改過';
  assert.equal(names(queueOf(s2, NAMES))[0], '張飛', '存檔副本不受調用方後續改動影響');
});

// ---------------------------------------------------------------------------
// 五、與 deploy_queue 既有 API 一致（不破壞）
// ---------------------------------------------------------------------------

test('既有 API 不破壞：moveSlot / setTroop / swapSides / normalizeQueue / queueOf 契約照舊', () => {
  const q = makeQueue(NAMES);
  assert.deepEqual(names(moveSlot(q, 2, 0)), ['趙雲', '張飛', '關羽', '馬超', '黃忠']);
  assert.deepEqual(names(moveSlot(q, 0, 4, 99)), ['關羽', '趙雲', '馬超', '黃忠', '張飛']);
  assert.deepEqual(names(setTroop(q, 0, '槍')), ['張飛', '關羽', '趙雲', '馬超', '黃忠'], '換兵種不動順序');
  assert.equal(setTroop(q, 0, '槍')[0]!.troop, '槍');
  assert.deepEqual(names(swapSides(q, makeQueue(['甲'])).a), ['甲']);
  assert.deepEqual(names(normalizeQueue([{ general: '張飛' }, { general: '張飛' }, null])), ['張飛'], '去重丟壞槽');
  // chooseAfterFoe 是純函數、不改入參、可重複調用。
  const foe = makeQueue(FOE);
  const mine = makeQueue(NAMES);
  const a = chooseAfterFoe(foe, mine);
  const b = chooseAfterFoe(foe, mine);
  assert.deepEqual(a, b);
  assert.deepEqual(names(mine), NAMES);
  // 舊的兩欄位（fieldSlots/reorderable）仍在，只是值收窄成 1/[0]。
  assert.equal(typeof a.fieldSlots, 'number');
  assert.ok(Array.isArray(a.reorderable));
});

// ---------------------------------------------------------------------------
// 仍未定（不編）
// ---------------------------------------------------------------------------

test.todo('未定：兩張選將列表在同一個 WarPrep 裏一次打開（0x41c06c 0x491000 / 0x491060），'
  + '靜態代碼看不出玩家實際的點擊次序 —— 只能證明「敵方由 0x4042ED(army,1) 先自動選、'
  + '我方列表後開」，無法證明「後選的人先出陣」這句中文讀法。見 REPORT.md「仍未定」。');
