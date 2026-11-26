/**
 * Execute 34「後選出陣」——**落地測試**（R94 改寫；改前是「證據測試，不是實作」）。
 *
 * 原作事實（project/109，兩次獨立複核）：
 *   1. `3` 是 `wises.json` 的 `SEQUENCE`，不是第 3 回合；`Execute=34` 才是 `0x44D450` 的分支號。
 *   2. 分支 `0x44DE44` 只有 `push 0x491900("成功")` → `call 0x46dae0`（消息欄）→ 函數尾，
 *      **零狀態寫入**（work/dis_battle_B_44D450.txt:763）。
 *   3. `ATTRIB=1`（戰前選擇）＋ 多源攻略：真實效果是「使用方在敵方之後選將/兵種」，
 *      需要戰役編成層的 5 將出陣隊列與開戰前重排（project/52:172、docs/07b §6 的 Obj3 部隊池）。
 *
 * R94 的落地方式（project/162）：
 *   · 戰前 `applyWise(w,'A',3)` 只把 `army.chooseAfterFoe` 立起來，數值一律不動；
 *   · 戰中派發器照舊只打那句「成功」日誌，ops 從 `['note']` 變成 `['afterfoe','note']`；
 *   · 真正的「敵方之後選出陣武將」由 `deploy_queue.ts:chooseAfterFoe()` / `pickDeploy()`
 *     在編成頁消費。
 *
 * R81 反彙編更正（`work/r81_exec34/REPORT.md`）：原作**沒有「前 3 槽」**——
 *   · `0x446F45` は `army->entries[army->+0x04]` だけ、`+0x04` は初始化時 0（`0x446EE8`）；
 *   · `0x448690` 每側只建 1 個單位，沒有循環、沒有 `cmp ...,3`；
 *   · `0x449853` / `0x4496D1` 點選時寫 `army->+0x04 = 列表首行 + 光標`，界限是列表總數；
 *   · `0x44DE44`（Execute 34）零狀態寫入。
 *   → 「3 槽可重排」是 [推測]，本檔原本那兩條斷言已被證偽（見檔尾）。
 *
 * 本檔仍釘死「不許做成第 3 回合憑空補 1 隊」：跑滿一場 unit 只減不增。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { createWorld, powerOf, step } from '../src/core/battle.ts';
import {
  STRATEGY_TABLE,
  planStrategy,
  runStrategy,
  strategyDefOf,
  tickStrategy,
} from '../src/core/strategy.ts';
import { applyWise, WISE_SPECS, WISE_SYSO_UNSUPPORTED, wiseAppliedAtStart } from '../src/core/wises.ts';
import { engage } from './_engage.ts';
import {
  DEPLOY_FIELD_SLOTS,
  ORIGINAL_DEPLOY_PICK_SLOTS,
  chooseAfterFoe,
  makeQueue,
  moveSlot,
  pickDeploy,
} from '../src/core/deploy_queue.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const SEQ = 3;

function mk(patch: Partial<Parameters<typeof createWorld>[0]> = {}): ReturnType<typeof createWorld> {
  // m4：默认待機后要显式下令，否则 Execute 34 这类「局内事件」永远不触发。
  return engage(createWorld({ data, seed: 11, ...patch }));
}

test('Execute 34 的資料列：SEQUENCE=3 / Execute=34 / ATTRIB=1 / ACTIVE=8（敵將）', () => {
  const row = data.wises.find((w) => w.SEQUENCE === SEQ)!;
  assert.ok(row, 'wises.json 應有 SEQUENCE=3');
  assert.equal(row.Execute, 34);
  assert.equal(row.WiseLevel, 0);
  assert.equal(row.NAME, '後選出陣');
  assert.equal(row.ATTRIB, 1, 'ATTRIB=1 = 戰前選擇');
  assert.equal(row.ACTIVE, 8, 'ACTIVE=8 = 目標敵將');
});

test('Execute 34 在策略表仍是 reserve（原作只有一句日誌）；佔位表已清空，SPECS[3] 是 deploy', () => {
  assert.equal(STRATEGY_TABLE[33]!.exec, 34);
  const def = strategyDefOf(34)!;
  assert.equal(def.kind, 'reserve');
  assert.equal(def.text, '成功');
  // R94：3 已從「顯式佔位」移出，改登記成編成層的 deploy / choose_after_foe。
  assert.equal(WISE_SYSO_UNSUPPORTED[SEQ], undefined, '不再有 [阻塞] 佔位條目');
  assert.equal(Object.keys(WISE_SYSO_UNSUPPORTED).length, 0);
  assert.equal(WISE_SPECS[SEQ]!.kind, 'deploy');
  assert.equal(WISE_SPECS[SEQ]!.op, 'choose_after_foe');
  // R81：`wises.ts` 的 value 是本重製版上陣區寬度（3，給 UI/cocos 用），
  // 不是原作槽數 —— 原作每側只有 1 個出陣位（見 exec34_truth.test.ts）。
  assert.equal(WISE_SPECS[SEQ]!.value, DEPLOY_FIELD_SLOTS, '重製版上陣區寬度（UI 用，非原作槽數）');
  assert.equal(ORIGINAL_DEPLOY_PICK_SLOTS, 1, '原作可決定的出陣位 = 1');
});

test('戰前 applyWise(3)：只立 chooseAfterFoe，不動戰力/部隊/士氣，且記進生效清單', () => {
  const w = mk();
  const sig = JSON.stringify({
    a: powerOf(w, 'A'),
    b: powerOf(w, 'B'),
    aMorale: w.sides.A.morale,
    bMorale: w.sides.B.morale,
    units: w.units.map((u) => [u.side, u.kind, u.alive, u.x, u.y]),
  });
  const r = applyWise(w, 'A', SEQ);
  assert.equal(r.ok, true, 'R94 後不再是 ok:false');
  assert.equal(r.kind, 'deploy');
  assert.equal(w.army.A.chooseAfterFoe, true);
  assert.equal(w.army.B.chooseAfterFoe, undefined, '不碰敵方');
  assert.deepEqual(wiseAppliedAtStart(w, 'A'), [SEQ], '旗標變化也算生效 → 戰中不再重複派發');
  assert.equal(
    JSON.stringify({
      a: powerOf(w, 'A'),
      b: powerOf(w, 'B'),
      aMorale: w.sides.A.morale,
      bMorale: w.sides.B.morale,
      units: w.units.map((u) => [u.side, u.kind, u.alive, u.x, u.y]),
    }),
    sig,
    '後選出陣在戰場內核不該改任何數值/部隊（原作 0x44DE44 零狀態寫入）',
  );
});

test('Execute 34 派發：ops = [afterfoe, note]，文字「成功」，不動戰力、不動部隊', () => {
  const w = mk({ a: { strategy: SEQ } });
  w.army.A.used = false;
  const unit = w.units.find((u) => u.side === 'A' && u.alive && !u.isGeneral)!;
  const foe = w.units.find((u) => u.side === 'B' && u.alive && !u.isGeneral)!;
  unit.x = foe.x; // 先接戰，再拍快照；派發本身不該再動任何東西
  unit.y = foe.y;
  const sig = JSON.stringify({
    a: powerOf(w, 'A'),
    b: powerOf(w, 'B'),
    units: w.units.map((u) => [u.side, u.kind, u.alive, u.x, u.y]),
  });
  const pick = planStrategy(w, 'A', unit);
  assert.ok(pick, 'planStrategy 應回傳指令');
  const ev = runStrategy(w, pick!);
  assert.equal(ev.exec, 34);
  assert.equal(ev.kind, 'reserve');
  // 改前：`ops.length === 1`、只有 `note`。改後：多一個 `afterfoe`（立旗標），
  // 依據 project/109 §5.3 + R94 的編成層落地點；原作那句「成功」日誌原樣保留。
  assert.deepEqual(ev.ops.map((o) => o.op), ['afterfoe', 'note']);
  assert.equal(ev.text, '成功');
  assert.equal(w.army.A.chooseAfterFoe, true);
  assert.equal(
    JSON.stringify({
      a: powerOf(w, 'A'),
      b: powerOf(w, 'B'),
      units: w.units.map((u) => [u.side, u.kind, u.alive, u.x, u.y]),
    }),
    sig,
    '後選出陣在戰場內核不該改任何數值/部隊',
  );
});

test('Execute 34 跑滿一場也不會補兵：unit 只減不增，第 3 回合也沒有新部隊', () => {
  const w = mk({ a: { strategy: SEQ, soldiers: 60 }, b: { soldiers: 60 } });
  const initial = new Set(w.units);
  const initialCount = initial.size;
  let countAt3 = -1;

  for (let i = 0; i < 1200 && !w.over; i++) {
    step(w);
    if (w.tick >= 3 && countAt3 < 0) countAt3 = w.units.length;
    assert.ok(w.units.length <= initialCount, `tick ${w.tick} 部隊數變多了`);
    for (const u of w.units) {
      assert.ok(initial.has(u), `tick ${w.tick} 出現了原本不存在的 unit`);
    }
  }

  // 這條分支確實有被派發到（否則上面的「不補兵」等於沒測）
  assert.ok(w.strategyEvents.some((e) => e.exec === 34), '本局應派發過 Execute 34');
  for (const e of w.strategyEvents.filter((x) => x.exec === 34)) {
    assert.deepEqual(e.ops.map((o) => o.op), ['afterfoe', 'note']);
  }
  assert.ok(countAt3 >= 3, '應跑到第 3 tick 之後');
  assert.ok(countAt3 <= initialCount, '第 3 回合的部隊數不應超過開局');
});

test('tickStrategy 派發 reserve 與直接 runStrategy 相同：afterfoe + note，旗標立起來', () => {
  const w = mk({ a: { strategy: SEQ, soldiers: 60 }, b: { soldiers: 60 } });
  const unit = w.units.find((u) => u.side === 'A' && !u.isGeneral)!;
  const foe = w.units.find((u) => u.side === 'B' && !u.isGeneral)!;
  unit.x = foe.x;
  unit.y = foe.y;
  tickStrategy(w);
  const ev = w.strategyEvents.find((e) => e.exec === 34);
  assert.ok(ev, 'tickStrategy 應派發 Execute 34');
  assert.deepEqual(ev!.ops.map((o) => o.op), ['afterfoe', 'note']);
  assert.equal(w.army.A.chooseAfterFoe, true);
});

test('旗標的消費點：chooseAfterFoe 只給 1 個出陣位，pickDeploy 把第 3 位提到出陣位', () => {
  const foe = makeQueue(['敵甲', '敵乙', '敵丙', '敵丁', '敵戊']);
  const mine = makeQueue(['我甲', '我乙', '我丙', '我丁', '我戊']);
  const plan = chooseAfterFoe(foe, mine);
  // 舊斷言「fieldSlots === 3 / reorderable === [0,1,2]」已被 R81 反彙編證偽。
  assert.equal(plan.fieldSlots, ORIGINAL_DEPLOY_PICK_SLOTS);
  assert.deepEqual(plan.reorderable, [0], '只有出陣位（第 0 槽）可決定');
  assert.deepEqual(plan.pickable, [0, 1, 2, 3, 4], '列表裏 5 員任選一員');
  assert.equal(plan.pickOrder, 'foe-first');
  assert.deepEqual(plan.foe.map((s) => s.general), ['敵甲', '敵乙', '敵丙', '敵丁', '敵戊']);
  const picked = pickDeploy(mine, 2);
  assert.deepEqual(picked.map((s) => s.general), ['我丙', '我甲', '我乙', '我丁', '我戊']);
  assert.deepEqual(mine.map((s) => s.general), ['我甲', '我乙', '我丙', '我丁', '我戊'], '純函式不改原陣列');
  // 用 fieldSlots 當 limit 的舊寫法仍受限於 1 槽 —— 這正是被收窄的部分。
  assert.deepEqual(moveSlot(mine, 2, 0, plan.fieldSlots).map((s) => s.general), ['我甲', '我乙', '我丙', '我丁', '我戊']);
});
