// @ts-nocheck
// 理由：本檔同時驅動 `src/core/**`（TS）與 `web/city_model.js`（瀏覽器端無型別 ESM，
// tsconfig 沒有 allowJs）；型別嚴格檢查留給 src/**。與 `rows85.test.ts` 同一處理方式。
/**
 * wises_r9.test.ts — R89 收口：軍師技 9 條「代理落點」轉正 + R9 開發三處未落地分支
 *
 * 跑法：  cd F:\sanguo\game && node --test tests/wises_r9.test.ts
 *
 * 兩組交付：
 *   A. 9 條代理落點（project/130 裁決：67 = 57 真 + 9 代理 + 1 阻塞，本檔把 9 條做成真落點）
 *      · 疲勞 6 條：seq 4/25/51（Execute 9/10/11）→ 敵軍 `army+0x38` +1/+2/+3；
 *                   seq 5/27/50（Execute 12/13/14）→ 己軍 −1/−2/−3；
 *                   戰後 `0x41048D` 消費：`tireGain` 再過 `0x4103DE` 的 `trunc(v×K/100)`。
 *      · 勸降 1 條：seq 32（Execute 33）→ 戰中只寫 `defectPending`，`settle()` 才動名單。
 *      · 化解 1 條：seq 24（Execute 57）→ `cancelPending`，被化解的一發照發事件但 ops 不落地。
 *      · 偷襲 1 條：seq 30（Execute 48）→ `posture` 打敵方（`0x44E183 foeArmy+0x68=4`）。
 *   B. R9 開發三處（project/133 真值，`0x427A84` / `0x427947` / `0x405499`）
 *      1. 執行武將 ≠ 太守：base 用執行武將 INT/STR，縮放用太守 INT。
 *      2. 關城前置 `0x405499(city)`：FLAGS==2 的 12 座關城禁止開發。
 *      3. `trunc(str*4/10)` 的取整點：向零截斷（不是四捨五入）。
 *
 * 每一條都是「同 seed、改前/改後某個可觀測數字必須變」的差分（console 印 `before → after`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadData } from '../src/data.ts';
import { createWorld, settle } from '../src/core/battle.ts';
import { planStrategy, runStrategy } from '../src/core/strategy.ts';
import { applyWise } from '../src/core/wises.ts';
import { markDefectedCapture } from '../src/core/roster.ts';

import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

type World = ReturnType<typeof createWorld>;
type Opts = Parameters<typeof createWorld>[0];

function mk(patch: Partial<Opts> = {}): World {
  return createWorld({ data, seed: 11, ...patch });
}

/** 差分量測的輸出格式：`[A1] tireAdded.B: 15 → 22`。 */
function dlog(id: string, label: string, before: unknown, after: unknown): void {
  console.log(`[${id}] ${label}: ${String(before)} → ${String(after)}`);
}

/** `0x4103DE` 的倍率表（檔位 −3..+3），[确认] 見 work/orig_numbers/text_dis.tsv。 */
const FATIGUE_PCT = [30, 50, 75, 100, 150, 200, 250] as const;
/** tick=0 時 `0x41048D` 的基值 = 15 + trunc(0/10)。 */
const BASE_GAIN = 15;

/** 把兩側各一個兵貼到一起，越過 `STRATEGY_ENGAGE_RANGE`（同 wises24 的寫法）。 */
function engage(w: World, side: 'A' | 'B' = 'A') {
  const unit = w.units.find((u) => u.side === side && u.alive && !u.isGeneral);
  const foe = w.units.find((u) => u.side !== side && u.alive && !u.isGeneral);
  assert.ok(unit && foe, '兩側都要有兵');
  unit!.x = foe!.x;
  unit!.y = foe!.y;
  return { unit: unit!, foe: foe! };
}

// ===========================================================================
// 一、疲勞 6 條：seq 4/25/51 打敵軍檔位、5/27/50 打己軍檔位
//    執行體：0x44D70A / 0x44D73E / 0x44D772（敵）、0x44D7A6 / 0x44D7DA / 0x44D80E（己）
//    消費：0x41048D（戰後 += base）＋ 0x4103DE（底數 ×K/100）
// ===========================================================================

test('A1 擾亂敵將 L1（seq 4）：敵軍档位 0→1，戰後疲勞 15→22', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.B;
  assert.equal(before, BASE_GAIN);
  assert.equal(applyWise(w, 'A', 4).ok, true);
  dlog('A1', 'B.fatigueIdx', 0, w.army.B.fatigueIdx);
  assert.equal(w.sides.B.general.tire, undefined, '戰中不再直接寫疲勞點數');
  const after = settle(w);
  dlog('A1', 'tireAdded.B', before, after.tireAdded.B);
  assert.equal(w.army.B.fatigueIdx, 1, 'Execute 9 的 `+0x38 += 1`');
  assert.equal(after.tireAdded.B, Math.trunc((BASE_GAIN * FATIGUE_PCT[4]!) / 100), '15×150/100=22');
  assert.equal(after.tireAdded.B, 22);
});

test('A2 擾亂敵將 L2（seq 25）：敵軍档位 0→2，戰後疲勞 15→30', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.B;
  assert.equal(applyWise(w, 'A', 25).ok, true);
  const after = settle(w);
  dlog('A2', 'B.fatigueIdx', 0, w.army.B.fatigueIdx);
  dlog('A2', 'tireAdded.B', before, after.tireAdded.B);
  assert.equal(w.army.B.fatigueIdx, 2);
  assert.equal(after.tireAdded.B, 30, '15×200/100');
});

test('A3 擾亂敵將 L3（seq 51）：敵軍档位 0→3，戰後疲勞 15→37', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.B;
  assert.equal(applyWise(w, 'A', 51).ok, true);
  const after = settle(w);
  dlog('A3', 'B.fatigueIdx', 0, w.army.B.fatigueIdx);
  dlog('A3', 'tireAdded.B', before, after.tireAdded.B);
  assert.equal(w.army.B.fatigueIdx, 3);
  assert.equal(after.tireAdded.B, 37, 'trunc(15×250/100)=trunc(37.5)');
  assert.equal(w.army.A.fatigueIdx, 0, '不該打到自己');
});

test('A4 減少疲勞 L1（seq 5）：己軍档位 0→−1，戰後疲勞 15→11', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.A;
  assert.equal(applyWise(w, 'A', 5).ok, true);
  const after = settle(w);
  dlog('A4', 'A.fatigueIdx', 0, w.army.A.fatigueIdx);
  dlog('A4', 'tireAdded.A', before, after.tireAdded.A);
  assert.equal(w.army.A.fatigueIdx, -1);
  assert.equal(after.tireAdded.A, 11, 'trunc(15×75/100)');
});

test('A5 減少疲勞 L2（seq 27）：己軍档位 0→−2，戰後疲勞 15→7', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.A;
  assert.equal(applyWise(w, 'A', 27).ok, true);
  const after = settle(w);
  dlog('A5', 'A.fatigueIdx', 0, w.army.A.fatigueIdx);
  dlog('A5', 'tireAdded.A', before, after.tireAdded.A);
  assert.equal(w.army.A.fatigueIdx, -2);
  assert.equal(after.tireAdded.A, 7, 'trunc(15×50/100)=trunc(7.5)');
});

test('A6 減少疲勞 L3（seq 50）：己軍档位 0→−3，戰後疲勞 15→4', () => {
  const w = mk();
  const before = settle(mk()).tireAdded.A;
  assert.equal(applyWise(w, 'A', 50).ok, true);
  const after = settle(w);
  dlog('A6', 'A.fatigueIdx', 0, w.army.A.fatigueIdx);
  dlog('A6', 'tireAdded.A', before, after.tireAdded.A);
  assert.equal(w.army.A.fatigueIdx, -3);
  assert.equal(after.tireAdded.A, 4, 'trunc(15×30/100)=trunc(4.5)');
  assert.equal(w.army.B.fatigueIdx, 0, '減疲勞只對自己');
});

test('A7 疲勞檔位與 0x4103DE 邊界：idx<−3 回 100%、idx>3 也回 100%、戰後仍夾 100', () => {
  // 兩發 L3 = −6 檔 ⇒ `cmp idx+3,6; ja` 是無符號比較 ⇒ 回到原值
  const w = mk();
  for (let i = 0; i < 2; i++) assert.equal(applyWise(w, 'A', 50).ok, true);
  assert.equal(w.army.A.fatigueIdx, -6);
  const low = settle(w).tireAdded.A;
  dlog('A7', 'tireAdded.A(−6 檔)', BASE_GAIN, low);
  assert.equal(low, BASE_GAIN, 'idx < −3 ⇒ 無倍率');

  // 3 發 L3 = +9 檔 ⇒ 同上（`ja` 無符號比較），疲勞點數只受 100 上限夾制
  const w2 = mk();
  w2.sides.B.general.tire = 95;
  for (let i = 0; i < 3; i++) assert.equal(applyWise(w2, 'A', 51).ok, true);
  assert.equal(w2.army.B.fatigueIdx, 9);
  const r2 = settle(w2);
  dlog('A7', 'tireAdded.B(+9 檔)', 37, r2.tireAdded.B);
  dlog('A7', 'tire.B.after(95,+15)', 95, r2.tire.B.after);
  assert.equal(r2.tireAdded.B, BASE_GAIN, 'idx > 3 ⇒ 無倍率，回到 base 15');
  assert.equal(r2.tire.B.after, 100, '0x4108DA 只夾上限 100（95+15→100）');
});

test('A8 戰中派發走同一通道：Execute 9 的 op 是 `fatigue`/敵方，不是舊 `tire`', () => {
  const w = mk({ a: { strategy: 4, soldiers: 40 }, b: { soldiers: 40 } });
  const { unit } = engage(w, 'A');
  const pick = planStrategy(w, 'A', unit);
  assert.ok(pick, '應該派發得出');
  assert.equal(pick!.kind, 'tire-enemy', 'seq 4（Execute 9）');
  const op = pick!.ops.find((o: { op: string }) => o.op === 'fatigue');
  assert.ok(op, '必須是 fatigue op');
  assert.equal(op!.side, 'B', 'Execute 9 的 `[ebp+0x10]` 是敵 army');
  assert.equal(op!.delta, 1);
  dlog('A8', 'B.fatigueIdx', w.army.B.fatigueIdx, w.army.B.fatigueIdx + op!.delta);
  runStrategy(w, pick!);
  assert.equal(w.army.B.fatigueIdx, 1);
  assert.equal(w.sides.B.general.tire, undefined, '戰中不碰疲勞點數');
});

// ===========================================================================
// 二、勸降轉將（seq 32 / Execute 33）：戰中標記 → 戰後才動名單
// ===========================================================================

/** 呂布（33/節操1，勸降閘都過得了）當敗方主將；seed 1 時他在對照組會「逃脫」。 */
function lvbuWorld(seed = 1): World {
  return createWorld({ data, seed, b: { general: { name: '呂布', str: 100, int: 42, level: 20 } } });
}

test('B1 勸降（32）：戰中只寫 defectPending，settle() 才把敵將記進名單', () => {
  // 對照：同 seed 不放技 ⇒ 呂布逃脫，名單裡沒有他
  const ctrl = lvbuWorld(1);
  ctrl.winner = 'A';
  const ctrlReport = settle(ctrl);
  assert.equal(ctrlReport.post!.captures.some((c: { name: string }) => c.name === '呂布'), false);

  const w = lvbuWorld(1);
  assert.equal(applyWise(w, 'A', 32).ok, true);
  dlog('B1', 'B.defectPending', false, w.army.B.defectPending);
  assert.equal(w.army.B.defectPending, true);
  assert.equal(w.sides.B.general.name, '呂布', '戰中不改名單（還在敵方）');
  assert.equal(w.sides.B.general.loyal, 18, '勸降的忠誠 −15');

  w.winner = 'A';
  const r = settle(w);
  dlog('B1', 'settled.defected', null, r.defected);
  assert.equal(r.defected, '呂布');
  const cap = r.post!.captures.find((c: { name: string }) => c.name === '呂布');
  assert.ok(cap, '戰後名單裡要有呂布');
  assert.equal(cap!.recruited, true, '記為「已招降」交給 roster');
});

test('B2 勸降（32）反向：沒放技、或閘擋住時 defectPending 一位不動', () => {
  const off = lvbuWorld(1);
  off.winner = 'A';
  assert.equal(off.army.B.defectPending, false);
  const r0 = settle(off);
  dlog('B2', 'settled.defected（未放技）', '呂布', r0.defected);
  assert.equal(r0.defected, null);
  assert.equal(r0.post!.captures.some((c: { name: string }) => c.name === '呂布'), false);

  // 閘：忠誠 > 90
  const w = mk({ b: { general: { name: '關羽', str: 99, int: 85, level: 20 } } });
  assert.equal(applyWise(w, 'A', 32).ok, false);
  assert.equal(w.army.B.defectPending, false);

  // 輸的那側才處理：A 輸時 B 的標記不生效
  const w2 = lvbuWorld(1);
  assert.equal(applyWise(w2, 'A', 32).ok, true);
  w2.winner = 'B';
  assert.equal(settle(w2).defected, null, 'B 沒輸，A 身上也沒有標記');
});

test('B3 markDefectedCapture：同名條目只翻 recruited、新條目補齊、重複呼叫冪等', () => {
  const post: { captures: Array<Record<string, unknown>> } = { captures: [] };
  assert.equal(markDefectedCapture(post, { name: '呂布', str: 100, int: 42, loyal: 18 }), '呂布');
  assert.deepEqual(post.captures, [{ name: '呂布', str: 100, int: 42, loyal: 18, recruited: true }]);
  assert.equal(markDefectedCapture(post, { name: '呂布' }), null, '第二次不能再記一次');
  assert.equal(post.captures.length, 1);

  const post2: { captures: Array<Record<string, unknown>> } = { captures: [{ name: '呂布', recruited: false }] };
  assert.equal(markDefectedCapture(post2, { name: '呂布', loyal: 18 }), '呂布');
  assert.equal(post2.captures.length, 1, '不能重複 push');
  assert.equal(post2.captures[0]!.recruited, true);
});

// ===========================================================================
// 三、化解（seq 24 / Execute 57）：記一次待取消，被化解的一發照發事件但 ops 空
// ===========================================================================

test('C1 化解（24）：cancelPending 0→1，敵方那一發被取消（事件仍發、ops 空）', () => {
  const w = mk({ a: { strategy: 4, soldiers: 40 }, b: { strategy: 4, soldiers: 40 } });
  assert.equal(w.army.B.cancelPending, 0);
  assert.equal(applyWise(w, 'A', 24).ok, true);
  dlog('C1', 'B.cancelPending', 0, w.army.B.cancelPending);
  assert.equal(w.army.B.cancelPending, 1);
  assert.equal(w.army.B.seq, 4, '不再清 seq');

  const { unit } = engage(w, 'B');
  const pick = planStrategy(w, 'B', unit);
  assert.ok(pick);
  assert.equal(pick!.kind, 'tire-enemy');
  const ev = runStrategy(w, pick!);
  dlog('C1', 'event.cancelled', false, ev.cancelled);
  assert.equal(ev.cancelled, true);
  assert.deepEqual(ev.ops, [], '被化解 ⇒ 一條 op 都沒落地');
  assert.equal(w.army.B.used, true, '派發額度仍然消耗');
  assert.equal(w.army.A.fatigueIdx, 0, 'A 沒吃到 Execute 9（ops 被取消）');
  assert.equal(w.army.B.fatigueIdx, 0, 'B 自己也不動');
  assert.equal(w.strategyEvents.at(-1), ev, '事件進 strategyEvents');
});

test('C2 化解（24）反向：沒放技時不取消，ops 正常落地', () => {
  const w = mk({ a: { strategy: 4, soldiers: 40 }, b: { strategy: 4, soldiers: 40 } });
  const { unit } = engage(w, 'B');
  const pick = planStrategy(w, 'B', unit);
  assert.equal(pick!.kind, 'tire-enemy');
  const ev = runStrategy(w, pick!);
  dlog('C2', 'event.cancelled', false, ev.cancelled ?? false);
  assert.equal(ev.cancelled, undefined);
  assert.ok(ev.ops.length >= 1, '沒被化解 ⇒ ops 落地');
  assert.equal(w.army.A.fatigueIdx, 1, 'B 的 tire-enemy 打 A');
});

test('C3 化解（24）只取消額度內的發數：用完後下一發照常落地', () => {
  const w = mk({ a: { strategy: 4, soldiers: 40 }, b: { strategy: 4, soldiers: 40 } });
  assert.equal(applyWise(w, 'A', 24).ok, true);
  w.army.B.cancelPending = 2; // 兩發額度
  const first = runStrategy(w, planStrategy(w, 'B', engage(w, 'B').unit)!);
  assert.equal(first.cancelled, true);
  assert.equal(w.army.B.cancelPending, 1);
  w.army.B.used = false;
  const second = runStrategy(w, planStrategy(w, 'B', engage(w, 'B').unit)!);
  assert.equal(second.cancelled, true, '第二發也被取消（額度 2）');
  w.army.B.used = false;
  const third = runStrategy(w, planStrategy(w, 'B', engage(w, 'B').unit)!);
  dlog('C3', '第三發 cancelled', true, third.cancelled ?? false);
  assert.equal(third.cancelled, undefined, '額度用完 ⇒ 照常落地');
  assert.equal(w.army.B.cancelPending, 0);
});

// ===========================================================================
// 四、偷襲方向（seq 30 / Execute 48）：posture 寫敵方 `foeArmy+0x68=4`
// ===========================================================================

test('D1 偷襲（30）：posture 打敵方，我方 moveMul 不動', () => {
  const w = mk({ a: { strategy: 30, soldiers: 40 }, b: { soldiers: 40 } });
  const before = { A: w.army.A.moveMul, B: w.army.B.moveMul };
  const pick = planStrategy(w, 'A', engage(w, 'A').unit);
  assert.ok(pick);
  assert.equal(pick!.kind, 'raid', 'seq 30 = Execute 48');
  const op = pick!.ops.find((o: { op: string }) => o.op === 'posture');
  assert.ok(op);
  dlog('D1', 'posture.side', 'A（舊）', op!.side);
  assert.equal(op!.side, 'B', '0x44E183 寫的是 foeArmy+0x68');
  assert.equal(op!.value, 4);
  runStrategy(w, pick!);
  dlog('D1', 'B.moveMul', before.B, w.army.B.moveMul);
  assert.equal(w.army.B.posture, 4);
  assert.equal(w.army.B.moveMul, 0.9);
  assert.equal(w.army.A.moveMul, before.A, '我方不能加移速（舊實作打錯側）');
  assert.equal(w.army.A.posture, 0);
});

test('D2 偷襲（30）反向：不派發時兩側 posture/moveMul 都是預設', () => {
  const w = mk({ a: { soldiers: 40 }, b: { soldiers: 40 } });
  assert.equal(w.army.A.posture, 0);
  assert.equal(w.army.B.posture, 0);
  assert.equal(w.army.A.moveMul, 1);
  assert.equal(w.army.B.moveMul, 1);
});

// ===========================================================================
// 五、Execute 34（seq 3 `後選出陣`）：R94 已落地，戰前只立 chooseAfterFoe
// ===========================================================================

test('E1 Execute 34（seq 3）已落地：applyWise 立 chooseAfterFoe，不動疲勞', () => {
  const w = mk({ a: { strategy: 3 } });
  // 改前斷言：`assert.equal(r.ok, false, '[阻塞]：見 project/109')`（本檔 R9 寫「本輪不碰」）。
  // 改後：spec 進 SPECS[3]（kind deploy / op choose_after_foe），applyWise 回 ok 並只立旗標。
  // 依據：wises.ts SPECS[3]；strategy.ts ArmyStatus.chooseAfterFoe；project/109 §5.3
  //       「使用方在敵方之後選將/兵種」；project/162 §1。
  const r = applyWise(w, 'A', 3);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'deploy');
  assert.equal(w.army.A.chooseAfterFoe, true);
  assert.equal(w.army.A.fatigueIdx, 0, '後選出陣不碰疲勞（原作 0x44DE44 零狀態寫入）');
  assert.deepEqual(applyWise(mk(), 'A', null), { ok: true }, '空選照舊');
});

// ===========================================================================
// 六、R9 開發三處（web/city_model.js）—— 0x427A84 / 0x427947 / 0x405499
// ===========================================================================

const SCEN = JSON.parse(readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'));
const GENS = JSON.parse(readFileSync(new URL('../data/generals.json', import.meta.url), 'utf8'));
const ITEMS = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
const WISES = JSON.parse(readFileSync(new URL('../data/wises.json', import.meta.url), 'utf8'));
const S0 = SCEN[0];
const cdef = (n: string) => S0.cities.find((c: { NAME: string }) => c.NAME === n);

function freshSave() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}

/** 把 rng 注入成一串固定數（尾端重複最後一個），跑完還原真隨機。 */
function withRng<T>(values: number[], fn: () => T): T {
  let i = 0;
  const seq = values.slice();
  M.setRng(() => (i < seq.length ? seq[i++] : seq[seq.length - 1]));
  try {
    return fn();
  } finally {
    M.setRng(null);
  }
}

const ctxFor = (generals: unknown[], exec?: string) => ({ generals, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES, exec });

test('F1 R9 執行武將 ≠ 太守：base 用執行武將 INT/STR，縮放才用太守 INT', () => {
  const d = cdef('代縣');
  assert.equal(d.MAJOR, '劉焉');
  // 對照：不指定執行武將 ⇒ 執行武將 = 太守劉焉（INT 78 / STR 42）
  const base = withRng([0.5], () => M.develop(freshSave(), d, ctxFor(GENS)));
  // 指定張飛（INT 51 / STR 99）執行
  const exec = withRng([0.5], () => M.develop(freshSave(), d, ctxFor(GENS, '張飛')));
  dlog('F1', '人口增量（太守 vs 執行武將）', base.pop, exec.pop);
  dlog('F1', '防禦增量（太守 vs 執行武將）', base.def, exec.def);
  // 1500 + 51×100 = 6600 → 6600 + trunc(6600×8×2/300) = 6600+352 = 6952
  assert.equal(exec.pop, 6952, 'INT 來自執行武將（張飛 51），只有縮放用太守（劉焉 78）');
  // 6 + trunc(99×4/10) = 45 → 45 + trunc(45×8×2/300) = 45+2 = 47
  assert.equal(exec.def, 47, 'STR 來自執行武將（張飛 99）');
  assert.equal(base.pop, 9796, '未指定執行武將時回落太守，數字不變');
  assert.equal(base.def, 23);
  assert.equal(exec.eff, M.majorFactor(78), 'eff 仍是太守智力係數');
});

test('F2 R9 關城前置 0x405499：FLAGS==2 的關卡直接失敗，不動存檔', () => {
  const d = cdef('易京');
  assert.equal(d.FLAGS, 2);
  assert.equal(M.isGate(d), true);
  const save = freshSave();
  const st = M.ensureCityState(save, d);
  const snap = { pop: st.pop, def: st.def, gold: save.gold };
  const r = withRng([0.5], () => M.develop(save, d, ctxFor(GENS)));
  dlog('F2', 'develop(易京).ok', true, r.ok);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'gate', '0x405499 在擲骰前就 return 0');
  assert.deepEqual({ pop: st.pop, def: st.def, gold: save.gold }, snap, '關卡不產出、不扣金');
});

test('F3 R9 取整點：trunc(STR×4/10) 向零截斷，不是四捨五入', () => {
  const d = cdef('代縣');
  const gens = GENS.concat([{ NAME: '測試將', INT: 78, STR: 999 }]);
  // rng 0.99 → rand()%3000 = 2970、rand()%12 = 11
  const r = withRng([0.99], () => M.develop(freshSave(), d, ctxFor(gens, '測試將')));
  // trunc(999×4/10) = 399；defBase = 11+399 = 410；410 + trunc(410×16/300) = 410+21 = 431
  dlog('F3', 'def（trunc）', 432, r.def);
  assert.equal(Math.trunc((999 * 4) / 10), 399, 'shl 2; idiv 0xa');
  assert.equal(r.def, 431, '取整在加隨機數之前；四捨五入會是 432（400+11 → +21）');
  assert.equal(M.DEV_FORMULA.PER_STR, 0.4, '係數本身仍是 4/10 的文件值，只是不再用它做浮點乘法');
});
