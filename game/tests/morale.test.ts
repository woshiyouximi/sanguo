/**
 * 士氣（原作 general+0x38）武將級自檢。
 *
 * 原作事實：
 *   - 武將結構 +0x38 是士氣 0..100（docs/04b5 §Q2：新將 0x42D468 mov word [..+0x38],0x50 = 80）；
 *   - 戰力第 5 段 (士氣−50)/5，idiv 向零截斷（docs/04b §2.5，0x44302C..0x44303C）；
 *   - 每月 0x41B1BF：疲勞 ≥60 → 士氣 −1（下限 0）。
 *   - 士氣 <30 自然 +1、戰敗 −10：本作 [新設計]（原作未確認；原作只有被俘 status=3 → −20）。
 *
 * 純邏輯寫在兩個頁面的 `// [[MORALE_CORE]]` 段裡（core 不許改，也不能讓 HTML import main.js）。
 * 這個測試直接從源碼抽段執行，順便比對兩份實作是否漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, moraleTerm, powerOf } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

type MoraleApi = {
  MORALE_MAX: number;
  MORALE_DEFAULT: number;
  MORALE_LOW: number;
  MORALE_DEFEAT_LOSS: number;
  moraleClamp(n: unknown): number;
  moraleNormalize(raw: unknown): Record<string, number>;
  moraleOf(save: unknown, name: string): number;
  moraleSet(save: unknown, name: string, value: unknown): number;
  moraleApply(world: unknown, side: string, value: unknown): number;
  moraleMonthly(
    save: unknown,
    officersByCity: Record<string, string[]>,
  ): { high: number; loss: number; recovered: number };
  moraleDefeat(save: unknown, names: string | string[]): number;
  moraleMigrateCities(save: unknown): number;
};

function pickBlock(file: 'main.js' | 'campaign.html'): MoraleApi {
  const text = readFileSync(new URL('../web/' + file, import.meta.url), 'utf8');
  const hit = text.match(
    /\/\/ \[\[MORALE_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/MORALE_CORE\]\]/,
  );
  assert.ok(hit, `${file} 裡找不到 [[MORALE_CORE]] 段`);
  const make = new Function(
    `${hit[1]}
return { MORALE_MAX, MORALE_DEFAULT, MORALE_LOW, MORALE_DEFEAT_LOSS, moraleClamp, moraleNormalize,
  moraleOf, moraleSet, moraleApply, moraleMonthly, moraleDefeat, moraleMigrateCities };`,
  );
  return make() as MoraleApi;
}

const main = pickBlock('main.js');
const camp = pickBlock('campaign.html');

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

function worldWith(morale: number) {
  return createWorld({
    data,
    seed: 20261124,
    a: {
      troop: 2,
      formation: 0,
      soldiers: 100,
      morale,
      general: { name: '關羽', str: 97, int: 75, level: 6 },
    },
    b: {
      troop: 10,
      formation: 3,
      soldiers: 100,
      morale: 60,
      general: { name: '張角', str: 70, int: 88, level: 5 },
    },
    aiSides: { B: true },
  } as any);
}

test('老檔遷移：沒有 morale 欄位 → 讀出來是缺省 60，normalize 不憑空造名冊', () => {
  for (const api of [main, camp]) {
    assert.equal(api.MORALE_DEFAULT, 60);
    assert.equal(api.moraleOf({}, '關羽'), 60);
    assert.equal(api.moraleOf({ morale: {} }, '關羽'), 60);
    assert.equal(api.moraleOf({ morale: { 關羽: 42 } }, '關羽'), 42);
    assert.deepEqual(api.moraleNormalize(undefined), {});
    assert.deepEqual(api.moraleNormalize({ 關羽: 42, 張飛: 'x', 趙雲: null }), { 關羽: 42 });
  }
});

test('城池級 morale 遷移：改名 cityMorale、保留數值，絕不搬成武將士氣', () => {
  for (const api of [main, camp]) {
    const save: any = {
      cities: { 代縣: { troops: 1200, morale: 72 }, 鄴: { troops: 800 } },
      tire: { 關羽: 63 },
    };
    const moved = api.moraleMigrateCities(save);
    assert.equal(moved, 1);
    assert.equal(save.cities['代縣'].cityMorale, 72);
    assert.equal(Object.prototype.hasOwnProperty.call(save.cities['代縣'], 'morale'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(save.cities['鄴'], 'cityMorale'), false);
    // 將領士氣仍是缺省 60（沒有把城士氣搬過來）
    assert.equal(save.morale, undefined);
    assert.equal(api.moraleOf(save, '關羽'), 60);
    // 遷移不碰疲勞
    assert.deepEqual(save.tire, { 關羽: 63 });
    // 重複遷移是無操作（不會把 cityMorale 又搬一次）
    assert.equal(api.moraleMigrateCities(save), 0);
    assert.equal(save.cities['代縣'].cityMorale, 72);
  }
});

test('每月：疲勞 ≥60 → 該武將士氣 -1（只在職武將）', () => {
  for (const api of [main, camp]) {
    const save: any = { tire: { 關羽: 63, 敵將: 99 }, morale: { 關羽: 55, 敵將: 55 } };
    const r = api.moraleMonthly(save, { 代縣: ['關羽'] });
    assert.deepEqual({ ...r }, { high: 1, loss: 1, recovered: 0 });
    assert.equal(save.morale['關羽'], 54);
    // 不在職的名字不因疲勞掉士氣
    assert.equal(save.morale['敵將'], 55);
    // 疲勞本身不被士氣邏輯改動
    assert.equal(save.tire['關羽'], 63);
    assert.equal(save.tire['敵將'], 99);
  }
});

test('每月：疲勞 59 不扣士氣；士氣下限 0，扣到 0 記 loss 0', () => {
  for (const api of [main, camp]) {
    const s1: any = { tire: { 關羽: 59 }, morale: { 關羽: 60 } };
    assert.deepEqual({ ...api.moraleMonthly(s1, { 代縣: ['關羽'] }) }, { high: 0, loss: 0, recovered: 0 });
    assert.equal(s1.morale['關羽'], 60);

    const s2: any = { tire: { 關羽: 60 }, morale: { 關羽: 0 } };
    const r2 = api.moraleMonthly(s2, { 代縣: ['關羽'] });
    assert.equal(r2.high, 1);
    assert.equal(r2.loss, 0);
    assert.equal(s2.morale['關羽'], 0);

    const s3: any = { tire: { 關羽: 60 }, morale: { 關羽: 1 } };
    const r3 = api.moraleMonthly(s3, { 代縣: ['關羽'] });
    assert.equal(r3.loss, 1);
    assert.equal(s3.morale['關羽'], 0);
  }
});

test('每月：士氣 <30 自然 +1（[新設計]），≥30 不恢復', () => {
  for (const api of [main, camp]) {
    assert.equal(api.MORALE_LOW, 30);
    const low: any = { tire: { 關羽: 10 }, morale: { 關羽: 20 } };
    const r1 = api.moraleMonthly(low, { 代縣: ['關羽'] });
    assert.equal(r1.recovered, 1);
    assert.equal(low.morale['關羽'], 21);

    const mid: any = { tire: { 關羽: 10 }, morale: { 關羽: 30 } };
    const r2 = api.moraleMonthly(mid, { 代縣: ['關羽'] });
    assert.equal(r2.recovered, 0);
    assert.equal(mid.morale['關羽'], 30);

    // 疲勞 ≥60 的扣減優先於自然恢復（不會同時 +1/-1）
    const highLow: any = { tire: { 關羽: 70 }, morale: { 關羽: 20 } };
    const r3 = api.moraleMonthly(highLow, { 代縣: ['關羽'] });
    assert.equal(r3.high, 1);
    assert.equal(r3.recovered, 0);
    assert.equal(highLow.morale['關羽'], 19);
  }
});

test('戰敗：主將士氣 -10（[新設計]），下限 0；不碰疲勞', () => {
  for (const api of [main, camp]) {
    assert.equal(api.MORALE_DEFEAT_LOSS, 10);
    const save: any = { morale: { 關羽: 55, 張飛: 5 }, tire: { 關羽: 40 } };
    assert.equal(api.moraleDefeat(save, '關羽'), 10);
    assert.equal(save.morale['關羽'], 45);
    assert.equal(api.moraleDefeat(save, ['關羽', '張飛']), 15); // 10 + 只扣得到 5
    assert.equal(save.morale['關羽'], 35);
    assert.equal(save.morale['張飛'], 0);
    assert.equal(api.moraleDefeat(save, '關羽'), 10);
    assert.equal(api.moraleDefeat(save, '關羽'), 10);
    assert.equal(save.morale['關羽'], 15);
    // 名冊外的名字按缺省 60 算，戰敗照樣扣（武將換城/改名不影響懲罰）
    assert.equal(api.moraleDefeat(save, ['不存在']), 10);
    assert.equal(save.morale['不存在'], 50);
    assert.deepEqual(save.tire, { 關羽: 40 });
  }
});

test('越界夾取：0..100 整數，NaN → 缺省 60', () => {
  for (const api of [main, camp]) {
    assert.equal(api.moraleClamp(150), 100);
    assert.equal(api.moraleClamp(-5), 0);
    assert.equal(api.moraleClamp(33.9), 33);
    assert.equal(api.moraleClamp('70'), 70);
    assert.equal(api.moraleClamp(Number.NaN), 60);
    assert.equal(api.moraleClamp(undefined), 60);
    assert.deepEqual(api.moraleNormalize({ 關羽: 150, 張飛: -5, 趙雲: 33.9 }), {
      關羽: 100,
      張飛: 0,
      趙雲: 33,
    });
    const save: any = {};
    assert.equal(api.moraleSet(save, '關羽', 150), 100);
    assert.equal(save.morale['關羽'], 100);
    assert.equal(api.moraleSet(save, '張飛', -1), 0);
    assert.equal(save.morale['張飛'], 0);
  }
});

test('戰力第 5 段：士氣 20 / 50 / 100 的士氣項 = −6 / 0 / +10（原作 (士氣−50)/5）', () => {
  // 原作 `((short)g->+0x38 - 0x32) / 5`（`idiv 5`，0x44302C），基線是士氣 50。
  // 我们一度把 MORALE_DAMP 設成 2（除以 10）压跨度，已回退成 1（docs/04b5 Q1）。
  assert.equal(moraleTerm(20), -6);
  assert.equal(moraleTerm(50), 0);
  assert.equal(moraleTerm(100), 10);
  // 60 是常见初始值，等于 +2（不是 0）——这一点以前被基线写错过。
  assert.equal(moraleTerm(60), 2);
});



test('出戰寫入：moraleApply 同時寫 side.morale 與 general.morale，powerOf 立即反映', () => {
  const w: any = worldWith(60);
  assert.equal(w.sides.A.morale, 60);
  assert.equal(main.moraleApply(w, 'A', 20), 20);
  assert.equal(w.sides.A.morale, 20);
  assert.equal(w.sides.A.general.morale, 20);
  assert.equal(powerOf(w, 'A'), powerOf(worldWith(20), 'A'));
  assert.equal(main.moraleApply(w, 'A', 999), 100);
  assert.equal(w.sides.A.morale, 100);
  assert.equal(w.sides.A.general.morale, 100);
  // 沒帶 morale 的 world 不會炸
  assert.equal(main.moraleApply({ sides: {} }, 'A', 33), 33);
});

test('與 tire 互不污染：士氣邏輯不寫 tire，疲勞欄位原樣保留', () => {
  for (const api of [main, camp]) {
    const save: any = {
      tire: { 關羽: 63, 張飛: 59 },
      morale: { 關羽: 55, 張飛: 20 },
    };
    const before = JSON.stringify(save.tire);
    api.moraleMonthly(save, { 代縣: ['關羽', '張飛'] });
    api.moraleDefeat(save, '關羽');
    api.moraleMigrateCities(save);
    assert.equal(JSON.stringify(save.tire), before);
    assert.notEqual(save.morale, undefined);
  }
});

test('兩份 MORALE_CORE（main.js / campaign.html）行為一致，防漂移', () => {
  assert.equal(main.MORALE_MAX, camp.MORALE_MAX);
  assert.equal(main.MORALE_DEFAULT, camp.MORALE_DEFAULT);
  assert.equal(main.MORALE_LOW, camp.MORALE_LOW);
  assert.equal(main.MORALE_DEFEAT_LOSS, camp.MORALE_DEFEAT_LOSS);
  for (const seed of [1, 7, 99]) {
    const sa: any = { tire: { 關羽: 63, 張飛: 10 }, morale: { 關羽: 55, 張飛: 20 } };
    const sb: any = { tire: { 關羽: 63, 張飛: 10 }, morale: { 關羽: 55, 張飛: 20 } };
    assert.deepEqual(
      { ...main.moraleMonthly(sa, { 代縣: ['關羽', '張飛'], 鄴: ['趙雲'] }) },
      { ...camp.moraleMonthly(sb, { 代縣: ['關羽', '張飛'], 鄴: ['趙雲'] }) },
      `seed=${seed}`,
    );
    assert.deepEqual(sa, sb, `seed=${seed}`);
    assert.equal(main.moraleDefeat(sa, '關羽'), camp.moraleDefeat(sb, '關羽'));
    assert.deepEqual(main.moraleNormalize(sa.morale), camp.moraleNormalize(sb.morale));
  }
});
