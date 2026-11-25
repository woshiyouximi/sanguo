// @ts-nocheck
// 理由：直接驅動 web/saves.js、web/city_model.js（瀏覽器端 JS，無 .ts 型別來源）。
/**
 * affairs_f2f3.test.ts — F2「逐將年令」＋ F3「在路上的將不能內政」回歸測試
 *
 * 原作（project/210_原作战斗流程规格.md §1）：
 *   · 每将一年只能搜索或开发一次；
 *   · 在该年「在路上的部队」里的武将，当年不能做内政。
 *
 * 覆蓋：
 *   F2  年序定義、記一次、同年再記回 false、跨年自動解鎖、逐將互不影響、壞值清理
 *   F3  syncAway 從兵團重算 save.away、rosterOf 濾掉在路上的將、回城後歸還
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const S0 = SCEN[0];
const ctx = () => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES });

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}

/* ======================================================================
 * F2 逐將年令
 * ==================================================================== */
test('F2 年序：1 月 = 第 1 年、12 月還是第 1 年、13 月 = 第 2 年（與 saves.yearOf 同式）', () => {
  const save = fresh();
  for (const [m, y] of [[1, 1], [7, 1], [12, 1], [13, 2], [24, 2], [25, 3]]) {
    save.month = m;
    assert.equal(M.yearIndexOf(save), y, `month ${m} → 年序 ${y}`);
    assert.equal(M.yearIndexOf(save), Saves.yearOf(m));
  }
});

test('F2 每將每年只能行動一次：第一次 true，同年再記 false，別的將不受影響', () => {
  const save = fresh();
  save.month = 5;
  assert.equal(M.actedLocked(save, '甲'), false, '沒行動過不該鎖');
  assert.equal(M.markActed(save, '甲'), true, '第一次要記成功');
  assert.equal(M.actedLocked(save, '甲'), true, '同年要鎖住');
  assert.equal(M.markActed(save, '甲'), false, '同年不能重複記');
  assert.equal(M.actedLocked(save, '乙'), false, '逐將獨立：乙還沒行動');
  save.month = 6; // 同一年換月不解除
  assert.equal(M.actedLocked(save, '甲'), true, '換月不解除，要等明年');
});

test('F2 跨年自動解鎖（不用每年清表）', () => {
  const save = fresh();
  save.month = 3;
  M.markActed(save, '甲');
  save.month = 15; // 第 2 年 3 月
  assert.equal(M.actedLocked(save, '甲'), false, '去年行動不鎖今年');
  assert.equal(M.actedNames(save).length, 0);
  assert.equal(M.markActed(save, '甲'), true, '今年可以再行動');
});

test('F2 ensureExtras：壞值（0/負/非數字）清掉，有效年序保留', () => {
  const save = fresh();
  save.month = 2;
  save.acted = { 甲: 1, 乙: 0, 丙: -3, 丁: 'x', 戊: 1.9 };
  M.ensureExtras(save);
  assert.deepEqual(Object.keys(save.acted).sort(), ['戊', '甲'].sort(), '只留年序 > 0 的');
  assert.equal(save.acted['甲'], 1);
  assert.equal(save.acted['戊'], 1, '小數截斷為 1');
  assert.equal(save.acted['丁'], undefined, '非數字丟掉');
});

/* ======================================================================
 * F3 在路上的將不能內政
 * ==================================================================== */
test('F3 syncAway：兵團的 general/officers 進 save.away，removeArmy 後歸還', () => {
  const save = fresh();
  const city = S0.cities.map((c) => c.NAME).find((n) => M.rosterOf(save, n, ctx()).length >= 2);
  assert.ok(city, '劇本 1 至少要有一座城有 2 名將');
  const before = M.rosterOf(save, city, ctx()).map((g) => g.NAME);
  const [a, b] = before;

  save.armies.push({ id: 'A1', side: 'A', from: city, to: city, pathIndex: 0, progress: 0, troops: 10, general: a, officers: [a, b] });
  M.syncAway(save);
  assert.deepEqual(Object.keys(save.away).sort(), [a, b].sort(), 'syncAway 要重算 save.away');
  const onRoad = M.rosterOf(save, city, ctx()).map((g) => g.NAME);
  assert.equal(onRoad.includes(a), false, '在路上的主將不該出現在城內名冊');
  assert.equal(onRoad.includes(b), false, '在路上的隨軍將也不該出現');
  assert.equal(onRoad.length, before.length - 2);

  save.armies = save.armies.filter((x) => x.id !== 'A1');
  M.syncAway(save);
  assert.deepEqual(Object.keys(save.away), [], '兵團沒了 → away 清空');
  assert.equal(M.rosterOf(save, city, ctx()).length, before.length, '回城後名冊歸還');
});

test('F3 away 也能直接挡住（老存檔只寫了 save.away 的情況）', () => {
  const save = fresh();
  const city = S0.cities.map((c) => c.NAME).find((n) => M.rosterOf(save, n, ctx()).length >= 1);
  const name = M.rosterOf(save, city, ctx())[0].NAME;
  save.away = { [name]: 'OLD' };
  assert.equal(M.rosterOf(save, city, ctx()).map((g) => g.NAME).includes(name), false);
  delete save.away[name];
  assert.equal(M.rosterOf(save, city, ctx()).map((g) => g.NAME).includes(name), true);
});
