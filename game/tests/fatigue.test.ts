/**
 * 疲勞（原作 general+0x3A）移植自檢。
 *
 * 原作事實（docs/04b5_战力基准与疲劳反汇编.md §Q2）：
 *   - 疲勞不進攻力/命中（0x442EFA / 0x443498 / 0x43D400 零命中）；
 *   - 戰後 0x41048D：雙方主將 += 15 + 秒數/10；秒數未知時 15 + rand()%8；上限 100；
 *   - 每月 0x41B1BF：先 -1（下限 0），再用「減後」的值判 ≥60 → 士氣 -1。
 *
 * 純邏輯寫在兩個頁面的 `// [[FATIGUE_CORE]]` 段裡（core 不許改、也不能讓 HTML import main.js）。
 * 這個測試直接從源碼抽段執行，順便比對兩份實作是否漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, mulberry32, powerOf, step } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

type FatigueApi = {
  TIRE_MAX: number;
  TIRE_HIGH: number;
  tireClamp(n: unknown): number;
  tireAdd(cur: unknown, gain: unknown): number;
  tireGain(sec: unknown, rng?: () => number): number;
  tireNormalize(raw: unknown): Record<string, number>;
  tireOf(save: unknown, name: string): number;
  tireBattle(
    save: unknown,
    aName: string,
    bName: string,
    sec: unknown,
    rng?: () => number,
  ): {
    gainA: number;
    gainB: number;
    beforeA: number;
    beforeB: number;
    afterA: number;
    afterB: number;
  };
  tireMonthly(
    save: unknown,
    officersByCity: Record<string, string[]>,
  ): { decayed: number; high: number; moraleLoss: number; moraleSkipped: number };
};

function pickBlock(file: 'main.js' | 'campaign.html'): FatigueApi {
  const text = readFileSync(new URL('../web/' + file, import.meta.url), 'utf8');
  const hit = text.match(
    /\/\/ \[\[FATIGUE_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/FATIGUE_CORE\]\]/,
  );
  assert.ok(hit, `${file} 裡找不到 [[FATIGUE_CORE]] 段`);
  const make = new Function(
    'mulberry32',
    `${hit[1]}
return { TIRE_MAX, TIRE_HIGH, tireClamp, tireAdd, tireGain, tireNormalize, tireOf, tireBattle, tireMonthly };`,
  );
  return make(mulberry32) as FatigueApi;
}

const main = pickBlock('main.js');
const camp = pickBlock('campaign.html');

const NEVER = () => {
  throw new Error('秒數已知時不該呼叫 rng');
};

test('戰後疲勞：15 + trunc(秒/10)，秒數已知時不碰 rng', () => {
  const cases: Array<[number, number]> = [[0, 15], [9, 15], [10, 16], [19, 16], [37, 18], [99, 24], [180, 33]];
  for (const [sec, want] of cases) {
    assert.equal(main.tireGain(sec, NEVER), want, `sec=${sec}`);
    assert.equal(camp.tireGain(sec, NEVER), want, `campaign sec=${sec}`);
  }
});

test('戰後疲勞：秒數未知 → 15 + rand()%8（15..22），同種子可復現', () => {
  const a = Array.from({ length: 24 }, () => main.tireGain(undefined, mulberry32(20261124)));
  assert.ok(a.every((n) => n >= 15 && n <= 22), `越界：${a.join(',')}`);
  const b = Array.from({ length: 24 }, () => main.tireGain(Number.NaN, mulberry32(20261124)));
  assert.deepEqual(a, b);
  const c = Array.from({ length: 24 }, () => camp.tireGain(undefined, mulberry32(20261124)));
  assert.deepEqual(a, c);
});

test('戰後疲勞：tireAdd 取整、下限 0、上限 100', () => {
  assert.equal(main.tireAdd(0, 15), 15);
  assert.equal(main.tireAdd(95, 20), 100);
  assert.equal(main.tireAdd(90, 17.9), 100);
  assert.equal(main.tireAdd(-10, 3), 3);
  assert.equal(main.tireAdd(50, -7), 50);
  assert.equal(main.tireAdd('37', '5'), 42);
  assert.equal(main.tireAdd(undefined, undefined), 0);
});

test('戰後疲勞：雙方主將各加一次，寫回 save.tire 且同種子逐位一致', () => {
  const a = main.tireBattle({ tire: { 關羽: 90 } }, '關羽', '張角', 37, mulberry32(7));
  assert.deepEqual(
    { ...a },
    { gainA: 18, gainB: 18, beforeA: 90, beforeB: 0, afterA: 100, afterB: 18 },
  );
  const save: any = { tire: { 關羽: 90 } };
  const b = main.tireBattle(save, '關羽', '張角', 37, mulberry32(7));
  assert.deepEqual(a, b);
  assert.deepEqual(save.tire, { 關羽: 100, 張角: 18 });

  // 秒數未知：兩個獨立的 rand()%8，仍可由種子復現
  const u1 = main.tireBattle({}, '關羽', '張角', undefined, mulberry32(99));
  const u2 = camp.tireBattle({}, '關羽', '張角', undefined, mulberry32(99));
  assert.deepEqual(u1, u2);
  assert.ok(u1.gainA >= 15 && u1.gainA <= 22);
  assert.ok(u1.gainB >= 15 && u1.gainB <= 22);
});

test('老檔缺 tire：補空物件，不因缺欄位崩潰', () => {
  assert.deepEqual(main.tireNormalize(undefined), {});
  assert.deepEqual(main.tireNormalize(null), {});
  assert.deepEqual(main.tireNormalize([]), {});
  assert.equal(main.tireOf({}, '關羽'), 0);
  assert.equal(camp.tireOf({ tire: null }, '關羽'), 0);

  const save: any = {};
  const r = main.tireMonthly(save, { 代縣: ['關羽'] });
  assert.deepEqual(save.tire, {});
  assert.deepEqual(r, { decayed: 0, high: 0, moraleLoss: 0, moraleSkipped: 0 });
});

test('存檔疲勞值容錯：字串/負數/超上限/壞值都夾成 0..100 整數', () => {
  assert.deepEqual(
    main.tireNormalize({ 關羽: '37.9', 張飛: -5, 趙雲: 250, 壞: 'x', '': 3 }),
    { 關羽: 37, 張飛: 0, 趙雲: 100 },
  );
  assert.equal(main.tireOf({ tire: { 關羽: 150 } }, '關羽'), 100);
});

test('每月疲勞：先 -1，下限 0，只計真的減了的', () => {
  const save: any = { tire: { 關羽: 2, 張飛: 0 }, cities: {} };
  const r = main.tireMonthly(save, { 代縣: ['關羽', '張飛'] });
  assert.equal(save.tire['關羽'], 1);
  assert.equal(save.tire['張飛'], 0);
  assert.equal(r.decayed, 1);
  assert.equal(r.high, 0);
});

test('每月疲勞：先減再判 ≥60（60→59 不觸發，61→60 觸發士氣 -1）', () => {
  const save: any = {
    tire: { 六十: 60, 六一: 61 },
    cities: { 代縣: { morale: 70 }, 鄴: { morale: 70 } },
  };
  const r = main.tireMonthly(save, { 代縣: ['六十'], 鄴: ['六一'] });
  assert.equal(save.tire['六十'], 59);
  assert.equal(save.tire['六一'], 60);
  assert.equal(r.high, 1);
  assert.equal(r.moraleLoss, 1);
  assert.equal(save.cities['代縣'].morale, 70);
  assert.equal(save.cities['鄴'].morale, 69);
});

test('每月疲勞：城池沒有 morale 欄位時只記 skipped，不憑空造士氣', () => {
  const save: any = { tire: { 關羽: 80 }, cities: { 代縣: { troops: 1200 } } };
  const r = main.tireMonthly(save, { 代縣: ['關羽'] });
  assert.equal(r.moraleSkipped, 1);
  assert.equal(r.moraleLoss, 0);
  assert.equal(save.tire['關羽'], 79);
  assert.equal(Object.prototype.hasOwnProperty.call(save.cities['代縣'], 'morale'), false);
});

test('每月疲勞：同城多名高疲勞武將 → 士氣按人數扣，且士氣不會扣成負數', () => {
  const save: any = {
    tire: { 關羽: 80, 張飛: 70, 趙雲: 5 },
    cities: { 代縣: { morale: 1 } },
  };
  const r = main.tireMonthly(save, { 代縣: ['關羽', '張飛', '趙雲'] });
  assert.equal(r.high, 2);
  assert.equal(r.moraleLoss, 2);
  assert.equal(save.cities['代縣'].morale, 0);
  assert.equal(save.tire['趙雲'], 4);
});

test('每月疲勞：save.tire 裡殘留的非在職名字也衰減，但不計入士氣', () => {
  const save: any = { tire: { 敵將: 5 }, cities: {} };
  const r = main.tireMonthly(save, { 代縣: ['關羽'] });
  assert.equal(save.tire['敵將'], 4);
  assert.equal(r.high, 0);
  assert.equal(r.moraleLoss, 0);
  assert.equal(r.moraleSkipped, 0);
});

test('疲勞不影響 powerOf()：同 seed 兩個世界，僅 tire 不同，逐位相等', () => {
  const data = loadData({
    dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  });
  const opts = {
    data,
    seed: 20261124,
    a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: { troop: 10, formation: 3, soldiers: 100, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
    aiSides: { B: true },
  };
  const fresh = createWorld(opts as any);
  const tired = createWorld(opts as any);
  (fresh.sides.A.general as any).tire = 0;
  (tired.sides.A.general as any).tire = 100;
  assert.equal(powerOf(fresh, 'A'), powerOf(tired, 'A'));
  assert.equal(powerOf(fresh, 'B'), powerOf(tired, 'B'));

  for (let i = 0; i < 300; i += 1) {
    step(fresh);
    step(tired);
  }
  assert.equal(powerOf(fresh, 'A'), powerOf(tired, 'A'));
  assert.equal(powerOf(fresh, 'B'), powerOf(tired, 'B'));
  assert.equal(fresh.sides.A.general.hp, tired.sides.A.general.hp);
  assert.equal(fresh.sides.B.general.hp, tired.sides.B.general.hp);
});

test('兩份 FATIGUE_CORE（main.js / campaign.html）行為一致，防漂移', () => {
  for (const sec of [undefined, 0, 9, 10, 37, 180]) {
    for (const seed of [1, 7, 99]) {
      const sa: any = { tire: { 關羽: 55, 張角: 95 }, cities: { 代縣: { morale: 70 } } };
      const sb: any = { tire: { 關羽: 55, 張角: 95 }, cities: { 代縣: { morale: 70 } } };
      const rb = main.tireBattle(sa, '關羽', '張角', sec, mulberry32(seed));
      const rc = camp.tireBattle(sb, '關羽', '張角', sec, mulberry32(seed));
      assert.deepEqual(rb, rc, `tireBattle sec=${sec} seed=${seed}`);
      assert.deepEqual(sa, sb);

      const ma = main.tireMonthly(sa, { 代縣: ['關羽', '張角'] });
      const mc = camp.tireMonthly(sb, { 代縣: ['關羽', '張角'] });
      assert.deepEqual(ma, mc, `tireMonthly sec=${sec} seed=${seed}`);
      assert.deepEqual(sa, sb);
    }
  }
  assert.equal(main.TIRE_MAX, camp.TIRE_MAX);
  assert.equal(main.TIRE_HIGH, camp.TIRE_HIGH);
});
