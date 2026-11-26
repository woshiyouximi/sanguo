// @ts-nocheck
// 理由：直接驅動 `cocos/assets/scripts/OfficersOfCity.ts` 與 `CityModel.ts`（兩個零 import 的
// Cocos 純邏輯模組）；斷言全在執行期由 node:test 驗，不背型別。
/**
 * panels_roster_source.test.ts — 「城市駐將 = 存檔運行時，劇本表只播種」回歸測試
 *
 * 跑法：  cd game && node --test tests/panels_roster_source.test.ts
 *
 * 背景（2026-11-26 用戶實機反饋）：平原／君主劉備開新局《討伐董卓》，內政頁「武將 8/10」正常，
 * 但「物品 裝備」頁上方武將卡卻是**黃巾之亂（劇本 0）的張角**，將列是
 * `張角、廖化、管輅、裴元紹、蔣義渠、杜遠` = 劇本 0 平原的守將。
 * 用戶原話：「这个和当前剧本有什么关系，不应该是当前选择势力吗？难道我不是刘备，
 * 曹操占领了这里，就变成看刘备的武将吗？」
 *
 * 根因：面板的武將名單有兩條「靜態」來源——
 *   a. `ItemsPanel.pickPool()` 用 `general.CITY`（靜態欄位 = 劇本 0 的所屬城）；
 *   b. `CampaignRoot` / `ForcesPanel` / `GeneralBookPanel` 用 `garrisonOf(data, 0, 城)`（劇本號恆 0）。
 *
 * 修法：新增 `OfficersOfCity.ts` 作唯一讀取口——
 *   我方城 → `save.roster`（`GameState` 存檔；內政頁任免/派遣/招降改這份）
 *            → 名單空才按 `city_by_times[scenIdx]` 播種（且只播「劇本開局屬玩家」的城）；
 *   其他城 → `save.cities[城].officers`（AI 月結/佔領寫入的運行時人事）→ 劇本表；
 *   `scenIdx` 只影響「還沒有任何人事紀錄的城」。
 * 本檔釘死：劇本 1 開局名單正確 / 默認選將不是張角 / 存檔播種與舊檔遷移 /
 * 曹操占平原後面板名單真的跟著變 / 占領城不被劇本表原守將頂回來 / 敵城運行時人事權威。
 *
 * 不變量：本檔**不** import 'cc'（`OfficersOfCity.ts` 與 `CityModel.ts` 都零 import）；
 * `ItemsPanel.ts` 會 import cc 不能直接載入，但它 `open()` 的武將池就是呼叫
 * `O.ownedOfficerPool()` + `O.pickDefaultIndex()`，本檔直接對這兩支斷言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../cocos/assets/scripts/CityModel.ts';
import * as O from '../cocos/assets/scripts/OfficersOfCity.ts';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');

const PLANE = '平原';
const SCEN_SANGUO = 1; // 《討伐董卓》

/** 面板取武將名單用的 ctx（`CampaignRoot.rosterCtx()` 的等價物） */
function ctxOf(scenIdx, playerForce, extra = {}) {
  return { generals: GENS, scenIdx, playerForce, scenarioCities: SCEN[scenIdx].cities, ...extra };
}

/** 最小存檔：`save.owned` + `save.cities`（`GameState.CampaignSave` 的最少欄位） */
function mockSave(owned, cities = {}, extra = {}) {
  const map = {};
  for (const name of owned) map[name] = { troops: 244, pop: 335000, money: 4762 };
  for (const [name, runtime] of Object.entries(cities)) map[name] = { ...(map[name] ?? {}), ...runtime };
  return { owned: owned.slice(), cities: map, roster: {}, ...extra };
}

// `OfficersOfCity.OfficerLike` 用小寫 `name`；`CityModel.rosterOf()` 回 `CityGeneral` 用 `NAME`
const nameSet = (rows) => rows.map((row) => (typeof row === 'string' ? row : row.name ?? row.NAME));
const sorted = (list) => list.slice().sort();

/* ============================================================================
 * ① 劇本 1（討伐董卓）平原：物品頁武將池 = 內政頁同一批人（關羽/劉備/張飛/簡雍，
 *    ＋（R224 起不再包含）因 `city_by_times[1]` 留空而按 `cityOf()` 回退靜態 `CITY` 的張角），
 *    不再是劇本 0 平原那批（廖化/裴元紹/管輅/蔣義渠/杜遠）
 * ========================================================================== */
test('劇本1平原：武將池含關羽/劉備，不含廖化/裴元紹（物品頁武將卡口徑）', () => {
  const save = mockSave([PLANE]);
  const ctx = ctxOf(SCEN_SANGUO, '劉備');
  const pool = O.ownedOfficerPool(save, save.owned, ctx, 12);

  assert.ok(pool.names.includes('關羽'), `武將池應含關羽，實際 ${JSON.stringify(pool.names)}`);
  assert.ok(pool.names.includes('劉備'), `武將池應含劉備，實際 ${JSON.stringify(pool.names)}`);
  assert.deepEqual(nameSet(pool.rows).length, pool.names.length);
  for (const wrong of ['廖化', '裴元紹', '管輅', '蔣義渠', '杜遠']) {
    assert.ok(!pool.names.includes(wrong), `武將池不應含劇本0平原守將「${wrong}」（已改成存檔口徑）`);
  }
  // 每一名「在池裡」的將都要有出處城，且就是我方城
  for (const name of pool.names) assert.equal(pool.cityOf[name], PLANE, `${name} 的所在城應是平原`);

  // 與內政頁顯示「武將 N/10」的清單同一個集合（CityModel.rosterOf 是內政頁的真源）
  const domestic = nameSet(M.rosterOf(save, PLANE, { generals: GENS, scenIdx: SCEN_SANGUO }));
  assert.equal(domestic.length, 4, `劇本1平原常駐將應 4 人，實際 ${JSON.stringify(domestic)}`);
  // R224：city_by_times[1] 空 = 189 劇本張角不在任何城，不再回退靜態 CITY 把他塞回平原
  assert.ok(!domestic.includes('張角'), `張角不該在劇本1平原：${JSON.stringify(domestic)}`);
  assert.deepEqual(sorted(pool.names), sorted(domestic), '物品頁武將池必須與內政頁武將清單同一批人');
});

/* ============================================================================
 * ② 默認選中將 = 當前城太守（劉備），不是列表第一個（關羽），更不是張角
 * ========================================================================== */
test('默認選中將是當前城太守劉備，不是列表第一個也不是張角', () => {
  const save = mockSave([PLANE]);
  const ctx = ctxOf(SCEN_SANGUO, '劉備');
  const pool = O.ownedOfficerPool(save, save.owned, ctx, 12);

  // 場景固定：按 STR+INT 排第一的是關羽（99+85），太守是劉備
  assert.equal(pool.names[0], '關羽');
  assert.equal(O.cityMajorNameOf(save, PLANE, ctx), '劉備');

  // ItemsPanel.open() 的候選序 = [存檔上次選的將, 當前城太守, 君主]
  const index = O.pickDefaultIndex(pool.names, ['', O.cityMajorNameOf(save, PLANE, ctx), '劉備']);
  assert.equal(pool.names[index], '劉備', `默認選中將應是劉備，實際 ${pool.names[index]}`);
  assert.notEqual(pool.names[index], '張角');
  assert.notEqual(pool.names[index], pool.names[0], '默認選將不能是列表第一個');

  // 沒有存檔/太守資料時仍要回合法索引（genIndex 必須可渲染，不能 -1）
  const fallback = O.pickDefaultIndex(pool.names, ['', '不存在的將']);
  assert.equal(fallback, 0);
});

/* ============================================================================
 * ③ 名冊（GeneralBookPanel）同口徑：所屬城 = 守將表反查 → city_by_times[scenIdx]
 * ========================================================================== */
test('GeneralBookPanel 口徑：劇本1平原守將表不是劇本0名單，張角不是平原太守', () => {
  const save = mockSave([PLANE]);
  const ctx = ctxOf(SCEN_SANGUO, '劉備');
  const byCity = O.officersByCity(save, SCEN[SCEN_SANGUO].cities, ctx);

  const planeNames = sorted(nameSet(byCity[PLANE]));
  assert.deepEqual(planeNames, sorted(['關羽', '劉備', '張飛', '簡雍']));
  assert.ok(!planeNames.includes('張角'), '張角不該在劇本1平原名冊');
  for (const wrong of ['廖化', '裴元紹', '管輅', '蔣義渠', '杜遠']) {
    assert.ok(!planeNames.includes(wrong), `名冊的平原不應有劇本0守將「${wrong}」`);
  }

  // GeneralBook.mergeRow 的所屬城：守將表反查優先，查不到才退回 city_by_times[scenIdx]
  assert.equal(M.cityOf(GENS.find((g) => g.NAME === '關羽'), SCEN_SANGUO), PLANE);
  assert.equal(M.cityOf(GENS.find((g) => g.NAME === '廖化'), SCEN_SANGUO), '濮陽');
  // R224：`city_by_times[1]` 留空 = 這劇本不在任何城（舊碼回退靜態 CITY=平原，是 189 劇本復活死人的根因）
  assert.equal(M.cityOf(GENS.find((g) => g.NAME === '張角'), SCEN_SANGUO), '');
  // 但張角在劇本 1 的狀態是「未」、不是平原太守/君主 → 名冊城/勢力欄與物品頁默認選將都不看他
  assert.equal(M.statusOf(GENS.find((g) => g.NAME === '張角'), SCEN_SANGUO), '未');
  assert.equal(O.cityMajorNameOf(save, PLANE, ctx), '劉備');

  // 反向：劇本表裡 status 非「野」且 city=平原 的將，與名冊平原名單同集合
  const tableNames = GENS.filter(
    (g) => g.NAME !== '盜賊' && M.cityOf(g, SCEN_SANGUO) === PLANE && M.statusOf(g, SCEN_SANGUO) !== '野',
  ).map((g) => g.NAME);
  assert.deepEqual(sorted(tableNames), planeNames);
});

/* ============================================================================
 * ④ 開局播種（舊檔遷移）：roster 與 cities.officers 都寫回；之後 scenIdx 不再影響名單
 * ========================================================================== */
test('舊檔播種：seedCityOfficers 寫回 roster 與 cities.officers，之後換劇本號名單不變', () => {
  const save = mockSave([PLANE]);
  const ctx = ctxOf(SCEN_SANGUO, '劉備');
  assert.deepEqual(save.roster[PLANE] ?? [], [], '前提：舊檔沒有 roster');

  const result = O.seedCityOfficers(save, SCEN[SCEN_SANGUO].cities, ctx);
  assert.equal(result.owned, 1);
  assert.ok(result.seeded >= 50, `敵城應按劇本表播種（實際 ${result.seeded} 座）`);

  assert.deepEqual(sorted(save.roster[PLANE]), sorted(['關羽', '劉備', '張飛', '簡雍']));
  assert.equal(save.cities[PLANE].officers.length, 4);
  assert.equal(save.cities[PLANE].owner, '劉備');
  assert.equal(save.cities[PLANE].major, '劉備');

  // 存檔有 roster 之後：scenIdx 換成 0（黃巾之亂）也不再改這座城的名單
  const asScen0 = O.officerNamesOfCity(save, PLANE, { ...ctx, scenIdx: 0 });
  assert.deepEqual(sorted(asScen0), sorted(['關羽', '劉備', '張飛', '簡雍']));
});

/* ============================================================================
 * ⑤ 模擬「曹操占平原」：改存檔歸屬/名單後，面板名單必須全變（用戶原話場景）
 * ========================================================================== */
test('曹操占平原：存檔人事一改，物品頁池/名冊/太守全部跟著變', () => {
  // 玩家是曹操，平原在劇本 1 裡開局屬劉備 → 這是「占領來的城」，不能被劇本表頂回劉備的將
  const save = mockSave([PLANE], {
    [PLANE]: {
      owner: '曹操',
      major: '曹操',
      officers: [
        { name: '曹操', str: 96, int: 92, loyal: 100, status: '登' },
        { name: '夏侯惇', str: 92, int: 62, loyal: 100, status: '登' },
      ],
    },
  });
  save.roster[PLANE] = ['曹操', '夏侯惇'];
  const ctx = ctxOf(SCEN_SANGUO, '曹操');

  assert.equal(O.isScenarioHome(PLANE, ctx), false, '劇本1的平原開局屬劉備，曹操是佔領');

  const pool = O.ownedOfficerPool(save, save.owned, ctx, 12);
  assert.deepEqual(sorted(pool.names), sorted(['曹操', '夏侯惇']));
  for (const wrong of ['劉備', '關羽', '張角']) {
    assert.ok(!pool.names.includes(wrong), `曹操占平原後不應再看到「${wrong}」`);
  }
  assert.equal(pool.cityOf['曹操'], PLANE);

  // 默認選將 = 曹操（太守），不是劉備也不是張角
  const index = O.pickDefaultIndex(pool.names, ['', O.cityMajorNameOf(save, PLANE, ctx), '曹操']);
  assert.equal(pool.names[index], '曹操');
  assert.notEqual(pool.names[index], '劉備');

  // 名冊/勢力頁同一個存檔口徑：平原的守將是曹操的人
  const byCity = O.officersByCity(save, SCEN[SCEN_SANGUO].cities, ctx);
  assert.deepEqual(sorted(nameSet(byCity[PLANE])), sorted(['曹操', '夏侯惇']));
  assert.equal(O.cityOwnerOf(save, PLANE), '曹操');
  assert.equal(O.cityMajorNameOf(save, PLANE, ctx), '曹操');
});

/* ============================================================================
 * ⑥ 占領城名單空 → 空名單，不拿劇本表原守將冒充自己的
 * ========================================================================== */
test('占領城名單空：顯示空城，而不是劇本表原守將（張角/劉備）', () => {
  const save = mockSave([PLANE]); // roster 空、無 runtime officers
  const caoCtx = ctxOf(SCEN_SANGUO, '曹操');
  assert.deepEqual(O.officerNamesOfCity(save, PLANE, caoCtx), [], '曹操剛打下平原、還沒任命 → 空名單');
  assert.deepEqual(
    sorted(O.officerNamesOfCity(save, PLANE, ctxOf(SCEN_SANGUO, '劉備'))),
    sorted(['關羽', '劉備', '張飛', '簡雍']),
  );
});

/* ============================================================================
 * ⑦ 敵城：save.cities[城].officers 是權威（空陣列也是，不再看劇本表）
 * ========================================================================== */
test('敵城運行時人事權威：有 officers 用它，空陣列就顯示空', () => {
  const withRuntime = mockSave([], {
    [PLANE]: {
      owner: '曹操',
      major: '曹操',
      officers: [
        { name: '曹操', str: 96, int: 92, loyal: 100, status: '登' },
        { name: '許褚', str: 96, int: 40, loyal: 100, status: '登' },
      ],
    },
  });
  const ctx = ctxOf(SCEN_SANGUO, '劉備');
  assert.deepEqual(sorted(O.officerNamesOfCity(withRuntime, PLANE, ctx)), sorted(['曹操', '許褚']));

  const emptyRuntime = mockSave([], { [PLANE]: { owner: '曹操', officers: [] } });
  assert.deepEqual(O.officerNamesOfCity(emptyRuntime, PLANE, ctx), [], '空陣列是權威：這座城真的沒人');
});

/* ============================================================================
 * ⑧ 完全沒有存檔人事紀錄的舊檔：才回落劇本表，且按 scenIdx 取，不是恆 0
 * ========================================================================== */
test('舊檔無人事紀錄：回落劇本表且按 scenIdx 取（劇本0 ≠ 劇本1）', () => {
  const legacy = { owned: [PLANE], cities: {}, roster: {} };

  const scen1 = O.officerNamesOfCity(legacy, PLANE, ctxOf(SCEN_SANGUO, '劉備'));
  assert.deepEqual(sorted(scen1), sorted(['關羽', '劉備', '張飛', '簡雍']));

  const scen0 = O.officerNamesOfCity(legacy, PLANE, ctxOf(0, '張角'));
  for (const name of ['張角', '廖化', '裴元紹']) assert.ok(scen0.includes(name), `劇本0平原應有 ${name}`);
  for (const name of ['關羽', '劉備']) assert.ok(!scen0.includes(name), `劇本0平原不應有 ${name}`);
});
