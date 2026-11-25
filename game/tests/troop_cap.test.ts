/**
 * troop_cap.test.ts — 「步／騎 兩欄相加」兵力口徑的守門測試（project/170_步骑两栏兵力.md）
 *
 * 跑法：`cd game && node --test tests/troop_cap.test.ts`（或全量 `node --test tests/*.test.ts`）
 *
 * ---------------------------------------------------------------------------
 * 口徑來源（project/31 §口徑注釋的規矩：每條數字都要指到地址/文件，不許只寫結論）
 *
 * 原作是**兩欄相加**，不是「騎兵算在帶兵數裡」：
 *   - `0x443118` 寫 `unit+0x58` = 帶兵數 + 騎兵數（兩欄之和）；
 *   - `0x443124` 寫 `unit+0x5C` = 上陣總數；
 *   - 帶兵上限 `0x409FB6` = `min(5×等級, 100)`、騎兵上限 `0x409FD8` =
 *     `clamp((等級−20)×5, 0, 100)`，兩欄**各自獨立**，互不包含；
 *   - 士兵槽上限 `0x43AA44` 的 `0xC8` = 200 = 100 步 + 100 騎（滿級兩欄都滿編）。
 * 62 條地址逐條回比 EXE、0 處不符：`project/168_战场每侧单位数.md` §4。
 *
 * 本作落地的分工（`project/170` 有完整說明）：
 *   - `levels.troopCapOf()` / `cavalryCapOf()` 各自只管一欄，`troopCapSumOf()` 給兩欄之和；
 *   - `battle.createWorld()` 的 `soldiers` 是**上陣總兵數**（原作 `unit+0x5C`），
 *     `cavalry` 只是其中騎兵那一欄的計數（`unit+0x58` 的另一半）—— 場上單位數恆等於 `soldiers`；
 *   - `garrison.defenderBattleParams()` 的 `soldiers` = `troopsMax + cavalryMax`；
 *   - 編成頁（web `deploy.html` / Cocos `DeployRoot.ts`）給兩條滑桿，出陣時帶兩欄之和。
 * ---------------------------------------------------------------------------
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import * as B from '../src/core/battle.ts';
import * as G from '../src/core/garrison.ts';
import * as L from '../src/core/levels.ts';
import * as City from '../web/city_model.js';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** `defenderBattleParams(_, general)` 的第二參數型別（武將行 + 運行時 level） */
type GeneralRow = NonNullable<Parameters<typeof G.defenderBattleParams>[1]>;
const asRow = (row: object) => row as unknown as GeneralRow;

describe('兩欄口徑的常量（原作 0x409FB6 / 0x409FD8 / 0x43AA44）', () => {
  it('兩個上限各自 100，相加的士兵槽上限是 200（= 0xC8）', () => {
    assert.equal(L.TROOP_PER_LEVEL, 5);
    assert.equal(L.TROOP_CAP_MAX, 100, '0x409FB6: min(5×等級, 100)');
    assert.equal(L.CAVALRY_LV_BASE, 20, '0x409FD8: 20 級起算');
    assert.equal(L.CAVALRY_PER_LEVEL, 5);
    assert.equal(L.CAVALRY_CAP_MAX, 100);
    assert.equal(L.TROOP_COLUMNS_MAX, 200, '0x43AA44: 士兵槽 0xC8 = 100 步 + 100 騎');
    assert.equal(L.TROOP_COLUMNS_MAX, L.TROOP_CAP_MAX + L.CAVALRY_CAP_MAX);
  });
});

describe('三個定點（project/168 §4 的口徑直接算出來的數）', () => {
  it('Lv2（generals.json 的 BaseEXP=200 ⇒ 起始等級）：步 10 / 騎 0', () => {
    assert.equal(L.startLevelOf({ BaseEXP: 200 }), 2, '起始等級由 BaseEXP 反推');
    assert.deepEqual(L.troopColumnsOf(2), { inf: 10, cav: 0, total: 10 });
    assert.equal(L.troopCapOf(2), 10);
    assert.equal(L.cavalryCapOf(2), 0, '20 級前騎兵欄恆 0');
  });

  it('Lv26：步 100 / 騎 30，上陣 130', () => {
    assert.deepEqual(L.troopColumnsOf(26), { inf: 100, cav: 30, total: 130 });
  });

  it('Lv40：步 100 / 騎 100，上陣 200（兩欄同時滿編 = 士兵槽上限）', () => {
    assert.deepEqual(L.troopColumnsOf(40), { inf: 100, cav: 100, total: 200 });
    assert.equal(L.troopCapSumOf(40), L.TROOP_COLUMNS_MAX);
    assert.equal(L.troopCapSumOf(99), 200, '99 級也還是 200，不會爆槽');
  });
});

describe('兩欄互不包含、相加即總兵力', () => {
  it('1..99 全掃：總上限 = min(200, 步上限 + 騎上限)，且兩欄各自獨立', () => {
    for (let lv = 1; lv <= 99; lv++) {
      const inf = L.troopCapOf(lv);
      const cav = L.cavalryCapOf(lv);
      assert.equal(inf, Math.min(5 * lv, 100), `Lv${lv} 帶兵上限`);
      assert.equal(cav, Math.max(0, Math.min((lv - 20) * 5, 100)), `Lv${lv} 騎兵上限`);
      assert.equal(L.troopCapSumOf(lv), Math.min(200, inf + cav), `Lv${lv} 兩欄相加`);
      assert.deepEqual(L.troopColumnsOf(lv), { inf, cav, total: inf + cav }, `Lv${lv} 兩欄拆解`);
      assert.ok(inf + cav <= L.TROOP_COLUMNS_MAX, `Lv${lv} 不得超過士兵槽`);
    }
  });

  it('騎兵欄不為 0 時，步兵欄仍是完整帶兵上限（不是「總上限 − 騎」）', () => {
    for (let lv = 21; lv <= 99; lv++) {
      const cols = L.troopColumnsOf(lv);
      assert.ok(cols.cav > 0, `Lv${lv} 應有騎兵欄`);
      assert.equal(cols.inf, L.troopCapOf(lv), `Lv${lv} 步兵欄不被騎兵扣掉`);
      assert.equal(cols.total, cols.inf + cols.cav);
    }
    // 21 級：步 100 + 騎 5（舊口徑會算成「騎 5 佔用帶兵數 ⇒ 步 95」）
    assert.deepEqual(L.troopColumnsOf(21), { inf: 100, cav: 5, total: 105 });
  });

  it('等級髒值走同一套夾取（0/負數/NaN/超界都落到合法欄位）', () => {
    assert.equal(L.troopCapSumOf(0), 5, '0 級按 1 級算');
    assert.equal(L.troopCapSumOf(-7), 5);
    assert.equal(L.troopCapSumOf(undefined), 5);
    assert.equal(L.troopCapSumOf(999), 200);
    assert.equal(L.troopCapSumOf('30'), 150, "'30' 與 30 同值");
    assert.equal(L.troopCapSumOf(21.9), 105, 'trunc 到 21 級');
  });

  it('battle 的騎兵上限與 levels 同值（整數字段，兩份實作同式）', () => {
    for (let lv = 1; lv <= 99; lv++) assert.equal(B.cavalryCapOf(lv), L.cavalryCapOf(lv), `Lv${lv}`);
    assert.equal(B.cavalryCapOf(40), 100);
  });
});

describe('battle.splitTroops：總兵力 → 兩欄', () => {
  it('缺省按等級推騎兵欄，步兵欄 = 總數 − 騎兵欄', () => {
    assert.deepEqual(B.splitTroops(25, 100), { total: 100, inf: 75, cav: 25 });
    assert.deepEqual(B.splitTroops(2, 10), { total: 10, inf: 10, cav: 0 });
    assert.deepEqual(B.splitTroops(40, 200), { total: 200, inf: 100, cav: 100 });
  });

  it('顯式騎兵數以呼叫方為準，但不得多於總兵力（原作 min(騎兵數, 騎兵上限) 的下界保護）', () => {
    assert.deepEqual(B.splitTroops(25, 100, 30), { total: 100, inf: 70, cav: 30 });
    assert.deepEqual(B.splitTroops(25, 30, 40), { total: 30, inf: 0, cav: 30 }, '騎兵不能多於總數');
    assert.deepEqual(B.splitTroops(25, 100, 0), { total: 100, inf: 100, cav: 0 }, '顯式 0 = 全步兵');
    assert.deepEqual(B.splitTroops(25, 100, -5), { total: 100, inf: 100, cav: 0 });
  });
});

describe('createWorld：舊呼叫行為一位不變，新口徑下總數仍等於 soldiers', () => {
  it('不傳 cavalry（舊 SideConfig）：騎兵按等級推，單位數仍是 soldiers', () => {
    const w = B.createWorld({ data, seed: 3, b: { soldiers: 100, general: { str: 70, int: 88, level: 25 } } });
    assert.equal(w.sides.B.cavalry, 25, '25 級 ⇒ 25 騎（預設口徑）');
    assert.equal(w.sides.B.soldiers, 100);
    assert.equal(w.sides.B.startInf, 75);
    assert.equal(w.sides.B.startCav, 25);
    assert.equal(w.sides.B.start, 100);
    // 場上單位數 = 總兵力（主將單位 `isGeneral` 另算，不佔士兵槽）
    assert.equal(w.units.filter((u) => u.side === 'B' && !u.isGeneral).length, 100, '場上單位數 = 總兵力');
    assert.equal(w.units.filter((u) => u.side === 'B' && u.kind === 'cavalry').length, 25);
  });

  it('兩欄相加的總數（130 = 100 步 + 30 騎）直接當 soldiers 傳進來：步兵/騎兵各就各位', () => {
    const w = B.createWorld({
      data,
      seed: 3,
      b: { soldiers: 130, cavalry: 30, general: { str: 70, int: 88, level: 26 } },
    });
    assert.equal(w.sides.B.soldiers, 130, 'soldiers = 上陣總數（unit+0x5C）');
    assert.equal(w.sides.B.cavalry, 30, 'cavalry = 其中騎兵欄（unit+0x58 的另一半）');
    assert.equal(w.sides.B.startInf, 100);
    assert.equal(w.sides.B.startCav, 30);
    assert.equal(w.sides.B.aliveInf, 100);
    assert.equal(w.sides.B.aliveCav, 30);
    assert.equal(w.units.filter((u) => u.side === 'B' && !u.isGeneral).length, 130);
    assert.equal(w.units.filter((u) => u.side === 'B' && u.kind === 'infantry').length, 100);
    assert.equal(w.units.filter((u) => u.side === 'B' && u.kind === 'cavalry').length, 30);
  });

  it('滿編兩欄（200）：戰場上就是 200 個單位，步兵 100 + 騎兵 100', () => {
    const w = B.createWorld({
      data,
      seed: 5,
      b: { soldiers: L.troopCapSumOf(40), cavalry: 100, general: { str: 90, int: 70, level: 40 } },
    });
    assert.equal(w.sides.B.soldiers, 200);
    assert.equal(w.sides.B.startInf, 100);
    assert.equal(w.sides.B.startCav, 100);
    assert.equal(w.units.filter((u) => u.side === 'B' && !u.isGeneral).length, 200, '站位表最後一檔就是 200');
  });
});

describe('garrison：守將的上陣兵就是兩欄相加', () => {
  const row = data.generals.find((g) => g.NAME && g.NAME !== '盜賊');
  assert.ok(row, 'generals.json 至少要有一位武將');

  it('defenderBattleParams().soldiers === troopsMax + cavalryMax === troopCapSumOf(等級)', () => {
    for (const level of [2, 25, 26, 40]) {
      const p = G.defenderBattleParams({ name: String(row!.NAME), str: 80, int: 70 }, asRow({ ...row!, level }));
      assert.equal(p.troopsMax, L.troopCapOf(level), `Lv${level} 帶兵欄`);
      assert.equal(p.cavalryMax, L.cavalryCapOf(level), `Lv${level} 騎兵欄`);
      assert.equal(p.soldiers, p.troopsMax + p.cavalryMax, `Lv${level} 兩欄相加`);
      assert.equal(p.soldiers, L.troopCapSumOf(level), `Lv${level} 與 core 口徑同值`);
    }
    const at26 = G.defenderBattleParams({ name: String(row!.NAME), str: 80, int: 70 }, asRow({ ...row!, level: 26 }));
    assert.equal(at26.soldiers, 130, 'Lv26 ⇒ 100 步 + 30 騎');
    const at40 = G.defenderBattleParams({ name: String(row!.NAME), str: 80, int: 70 }, asRow({ ...row!, level: 40 }));
    assert.equal(at40.soldiers, 200, 'Lv40 ⇒ 100 步 + 100 騎');
  });

  it('battleSetup 的敵方上陣兵 = 守將兩欄之和，且夾在 1..200', () => {
    // 襄平 = 劇本 1 有守將的城（與 tests/level_troop.test.ts:315-321 同一個用例）
    const city = '襄平';
    const setup = G.battleSetup(data, 0, city, 100, { troopMode: 'exe' });
    const p = setup.enemyParams;
    if (p) {
      assert.equal(setup.enemyTroops, Math.max(1, Math.min(L.TROOP_COLUMNS_MAX, p.soldiers)));
      assert.equal(p.soldiers, p.troopsMax + p.cavalryMax);
    }
    assert.ok(setup.enemyTroops >= 1 && setup.enemyTroops <= L.TROOP_COLUMNS_MAX);
  });
});

describe('兩端編成頁都給兩欄（web deploy.html / Cocos DeployRoot.ts）', () => {
  it('web：兩條滑桿 + 兩欄上限 + 出陣帶兩欄之和', () => {
    const html = read('web/deploy.html');
    assert.match(html, /id="cavrange" min="0" max="100" step="1"/, '騎兵欄滑桿');
    assert.match(html, /let CAV_CAP = cavalryCapOf\(GEN_LEVEL\)/, '騎兵欄上限走 core/levels.ts');
    assert.match(html, /let SOLDIER_CAP = troopCapOf\(GEN_LEVEL\)/, '步兵欄上限走 core/levels.ts');
    assert.match(html, /soldiers: String\(soldiers \+ cavalry\)/, '出陣帶兩欄之和（main.js 只認總數）');
    assert.match(html, /const BS_MAX = 200;/, '敵方上陣兵上限仍是 200 = 100 步 + 100 騎');
  });

  it('cocos：DeployRoot.ts 也有騎兵欄與兩欄相加（與 web 同一份 core 口徑）', () => {
    const ts = read('cocos/assets/scripts/DeployRoot.ts');
    assert.match(ts, /cavalryCapOf/, 'Cocos 端必須從 core 取騎兵上限');
    assert.match(ts, /cavalry/, 'Cocos 端必須有騎兵欄');
  });

  it('city_model.armCaps 的騎兵欄 = Σ cavalryCapOf（不再被帶兵上限截斷）', () => {
    const save = { gold: 0, cities: {}, roster: {}, generals: {} } as Record<string, unknown>;
    const def = { NAME: '代縣', POPULATION: 50000 };
    const ctx = { level: 45 };
    // 名單空 ⇒ 騎兵上限 0；這裡只驗公式本身與 core 同值（名單/存檔細節由 city_rules.test.ts 守）
    const caps = City.armCaps(save, def, ctx);
    assert.equal(caps.total, 600);
    assert.equal(caps.inf + caps.cav, caps.total);
    assert.equal(City.cavalryCapOf(45), L.cavalryCapOf(45));
    assert.equal(City.troopMaxOf(45), L.troopCapOf(45));
    assert.ok(caps.cav <= caps.total);
  });
});
