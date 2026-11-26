// @ts-nocheck
// 理由：CampaignRoot.ts import 'cc'，node 載不進來 → 源碼契約（與 `march_deploy_ctx.test.ts`、
// `march_arrival_contract.test.ts` 同一種做法）；`MonarchModel.ts` / `core/wises.ts` 是零依賴純模組，
// 可以直接 import 跑真實公式，不需要 mock。
/**
 * 出征帶兵數契約（原生包實機 Bug B）。
 *
 * 實機（MuMu `127.0.0.1:16384`，`com.sanguo.sango2`）復現：
 *   平原城內 244 兵，出征後部隊只有 `5 兵`。
 *
 * 根因：`generals.json` 的 401 條武將**沒有 `level` 欄位**，而 `CampaignRoot.armyGeneralLevel()`
 * 走 `core/wises.generalLevel()`，它對沒有 level 的武將回 `1`；`MonarchModel.troopCapOf(1)`
 * = `min(1×5, 100)` = **5** ⇒ 每次出征都只帶 5 兵。
 * 原作口徑（web `campaign.html:dispatchCapOf()`）是「主將等級 × 5，上限 100」，等級本身取
 * `generalLevelOf()` → `scenarioLevelOf()` 的分劇本起始等級表（TIMES1..5 的 BaseEXP 反推）。
 * 討伐董卓（劇本 1）劉備 = Lv2 ⇒ 上限 10 兵；劇本 0/1 的預設等級同為 2。
 *
 * 修法與本檔釘住的契約：
 *   · `armyGeneralLevel()` 改走 `scenarioLevelOf(gen.NAME, Math.max(1, own))`；
 *   · `dispatchArmyTo()` 出兵數 = **min(出發城現有守軍, 主將帶兵上限)**，城兵不足時全帶，
 *     只有 0 兵才拒絕（web 是「城兵 < 上限直接禁用出征」，本作比 web 寬容，方便小城出征）；
 *   · 扣兵只扣實際帶走的 `taken`，戰報/提示顯示 `taken`；
 *   · 預備兵不計入出征池（與 web `troopsOf()` 同口徑：只看 `save.cities[name].troops`）。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/march_troops.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as MM from '../cocos/assets/scripts/MonarchModel.ts';
// `core/wises.ts` 內部 import 沒帶 `.ts`（Cocos 打包器吃、node ESM 不吃），所以不 import，
// 改讀源碼釘住它的 fallback；`MonarchModel.ts` 是零 import 純模組，可以直接跑真實公式。

const readText = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

// 一律讀**打包進 APK 的資料**（Cocos `DataLoader` 載的那份），不是 game/data 的開發副本
const GENERALS = readJson('../cocos/assets/bundles/res/data/generals.json');
const GARRISON = readJson('../cocos/assets/bundles/res/data/garrison.json');
const LEVELS = readJson('../cocos/assets/bundles/res/data/levels_by_scenario.json');

const CAMPAIGN = readText('../cocos/assets/scripts/CampaignRoot.ts');
const WISES = readText('../cocos/assets/scripts/core/wises.ts');
const WEB_CAMPAIGN = readText('../web/campaign.html');

const SCEN = 1; // 《討伐董卓》（189 年，劉備）
const HOME = '平原';
const CITY_TROOPS = 244; // 實機存檔 + garrison.json 劇本 1 平原

/** 取兩段標記之間的源碼（標記找不到就讓測試紅，避免「改完程式但契約跑空」） */
function slice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `找不到起點標記：${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `找不到終點標記：${endMarker}`);
  return src.slice(start, end);
}

const DISPATCH_SRC = slice(
  CAMPAIGN,
  'private dispatchArmyTo(target: string): void {',
  '  // [F-06] 路上遭遇戰',
);
const LEVEL_SRC = slice(
  CAMPAIGN,
  'private armyGeneralLevel(name: string): number {',
  'private armyWiseSeq(name: string): number {',
);

/** `MonarchModel.troopCapOf()` 的實際回傳（取整、至少 1），= 主將等級決定的帶兵上限 */
const capOfLevel = (level) => Math.max(1, Math.round(MM.troopCapOf(level)));

/** `CampaignRoot.dispatchArmyTo()` 修好後的出兵數公式：min(上限, 城兵)，沒兵回 0 */
const dispatchTroops = (cityTroops, level) =>
  Math.min(capOfLevel(level), Math.max(0, Math.round(cityTroops)));

/* ============================================================================
 * ① 根因：generals.json 沒有 level 欄位 → core 的 generalLevel() 只能回 1 → 上限 5 兵
 * ========================================================================== */
test('根因：generals.json 沒有 level 欄位，generalLevel() 回 1，舊上限 = 5 兵', () => {
  assert.equal(GENERALS.length, 401, 'generals.json 應是 401 條武將的陣列');
  const withLevel = GENERALS.filter((gen) => typeof gen.level === 'number');
  assert.deepEqual(withLevel.map((gen) => gen.NAME), [], '官方 generals.json 沒有任何 level 欄位');

  const liubei = GENERALS.find((gen) => gen.NAME === '劉備');
  assert.ok(liubei, '應找得到劉備');
  assert.equal(typeof liubei.level, 'undefined', '劉備這條也沒有 level 欄位');
  // core/wises.generalLevel() 的 fallback（node 載不進這支純模組，改讀源碼契約）：
  // 沒有 level 就回 1 —— 這就是舊碼把主將等級當 Lv1 的來源。
  assert.match(WISES, /const lv = \(general as General & \{ level\?: number \}\)\.level;/);
  assert.match(
    WISES,
    /return typeof lv === 'number' && Number\.isFinite\(lv\) && lv > 0 \? Math\.floor\(lv\) : 1;/,
    'core/wises.generalLevel() 對沒有 level 的武將回 1',
  );
  assert.equal(MM.troopCapOf(1), 5, 'troopCapOf(1) = min(1×5,100) = 5（實機「只帶 5 兵」真兇）');
  assert.equal(capOfLevel(1), 5);
  assert.notEqual(capOfLevel(1), 10);
});

/* ============================================================================
 * ② 分劇本起始等級：討伐董卓的劉備是 Lv2 → 上限 10 兵（不是 5）
 * ========================================================================== */
test('分劇本起始等級：討伐董卓劉備 Lv2 ⇒ 帶兵上限 10 兵', () => {
  const scenario = LEVELS.scenarios[SCEN];
  assert.ok(scenario, 'levels_by_scenario 應有劇本 1');
  assert.equal(scenario.defaultLevel, 2, '劇本 1 預設起始等級 Lv2');
  const liubei = scenario.levels['劉備'];
  assert.ok(liubei, '劇本 1 應有劉備的等級');
  assert.equal(liubei.level, 2, '討伐董卓劉備 Lv2');
  assert.equal(liubei.deployed, true, '劉備在劇本 1 登場');

  assert.equal(MM.troopCapOf(2), 10, 'troopCapOf(2) = min(2×5,100) = 10');
  assert.equal(capOfLevel(2), 10);
  // 實機回報的 5 = troopCapOf(1)，修好後應是 10
  assert.notEqual(capOfLevel(2), 5);
});

/* ============================================================================
 * ③ armyGeneralLevel 改走 scenarioLevelOf（與 DeployRoot.levelOf / web generalLevelOf 同口徑）
 * ========================================================================== */
test('armyGeneralLevel 走 scenarioLevelOf，不再直接回 core 的 1', () => {
  assert.match(LEVEL_SRC, /const own = generalLevel\(gen\);/, '仍保留 core 的 level 欄位當下限');
  assert.match(
    LEVEL_SRC,
    /return scenarioLevelOf\(gen\.NAME, Math\.max\(1, own\)\);/,
    '等級要改用分劇本起始等級表',
  );
  assert.doesNotMatch(LEVEL_SRC, /return generalLevel\(gen\);/, '不能直接回 core 的 generalLevel()（=1）');
});

/* ============================================================================
 * ④ dispatchArmyTo：troops = min(cap, 城兵)，城兵不足全帶，只有 0 兵才拒絕
 * ========================================================================== */
test('dispatchArmyTo：帶兵 = min(上限, 城兵)，扣兵/戰報都用實際帶走的 taken', () => {
  assert.match(DISPATCH_SRC, /const cap = Math\.max\(1, Math\.round\(M\.troopCapOf\(this\.armyGeneralLevel\(leader\)\)\)\);/);
  assert.match(DISPATCH_SRC, /const taken = Math\.min\(cap, Math\.max\(0, Math\.round\(garrison\)\)\);/);
  assert.match(DISPATCH_SRC, /if \(taken < 1\) \{/, '只有真的沒兵才拒絕出征');
  assert.match(DISPATCH_SRC, /troops: taken,/, '部隊兵力是 taken，不是上限 cap');
  assert.match(DISPATCH_SRC, /state\.troops = Math\.max\(0, Math\.round\(state\.troops - taken\)\);/);
  assert.match(DISPATCH_SRC, /（\$\{taken\} 兵/, '戰報/提示要顯示實際帶走的兵數');

  // 舊 bug 的兩個特徵不能再回來
  assert.doesNotMatch(DISPATCH_SRC, /troops: cap,/);
  assert.doesNotMatch(DISPATCH_SRC, /if \(garrison < cap\)/, '不能再「城兵 < 上限就拒絕出征」');
  assert.doesNotMatch(DISPATCH_SRC, /守軍不足 \$\{cap\} 兵/);
});

/* ============================================================================
 * ⑤ 數字口徑：實機 244 兵 + Lv2 劉備 ⇒ 10 兵（舊碼 5）；城兵不足全帶；0 兵拒絕
 * ========================================================================== */
test('數字口徑：244 兵 + Lv2 ⇒ 10 兵（不是 5）；城兵不足全帶；城兵 0 拒絕', () => {
  const g1 = GARRISON.find((row) => row.scenario === SCEN);
  assert.ok(g1, 'garrison.json 應有劇本 1');
  assert.equal(g1.cities[HOME].garrison, CITY_TROOPS, '劇本 1 平原城兵 244（與實機存檔一致）');

  // 實機主案例：城 244 兵、主將劉備 Lv2 → 帶 10 兵（不是常量 5，也不是全城 244）
  assert.equal(dispatchTroops(CITY_TROOPS, 2), 10);
  assert.equal(dispatchTroops(CITY_TROOPS, 2), Math.min(CITY_TROOPS, MM.troopCapOf(2)));
  assert.notEqual(dispatchTroops(CITY_TROOPS, 2), 5);

  // 等級越高帶越多，上限 100（原作 min(等級×5,100)）
  assert.equal(dispatchTroops(CITY_TROOPS, 10), 50);
  assert.equal(dispatchTroops(CITY_TROOPS, 20), 100);
  assert.equal(dispatchTroops(CITY_TROOPS, 99), 100);

  // 城兵不足上限 → 全帶（web 會直接禁用出征；本作改成寬容版）
  assert.equal(dispatchTroops(7, 2), 7);
  assert.equal(dispatchTroops(7, 20), 7);

  // 真的沒兵 → 0（呼叫端 `taken < 1` 拒絕）
  assert.equal(dispatchTroops(0, 2), 0);
  assert.equal(dispatchTroops(0, 99), 0);

  // 等級退化（表沒載入時 core 值 1）→ 上限 5，是 fallback 不是常數
  assert.equal(dispatchTroops(CITY_TROOPS, 1), 5);

  // 不變量：帶兵永遠不超過城兵、也不超過上限
  for (const [cityTroops, level] of [[244, 2], [7, 2], [244, 20], [0, 99]]) {
    const taken = dispatchTroops(cityTroops, level);
    assert.ok(taken <= cityTroops, `帶兵 ${taken} 不可超過城兵 ${cityTroops}`);
    assert.ok(taken <= capOfLevel(level), `帶兵 ${taken} 不可超過上限 ${capOfLevel(level)}`);
  }
});

/* ============================================================================
 * ⑥ 預備兵不計入（與 web 出征 `troopsOf()` 同口徑：只看城內部隊）
 * ========================================================================== */
test('預備兵不計入出征池（web troopsOf 只讀 city.troops）', () => {
  // web 出征的城兵口徑：只算 save.cities[name].troops（不含預備兵）
  assert.ok(
    WEB_CAMPAIGN.includes('function troopsOf(name) { return save.cities[name]?.troops ?? 0; }'),
    'web campaign.html 出征城兵只讀 city.troops',
  );
  // Cocos 出征同樣只讀 this.troopsOf(from)（= save.cities[from].troops），沒有把預備兵加進去
  assert.match(DISPATCH_SRC, /const garrison = this\.troopsOf\(from\);/);
  assert.doesNotMatch(DISPATCH_SRC, /prep/i, '出征帶兵不看預備兵');
  // web 的上限口徑也是 troopCapOf(主將等級)；本作只是把「不足就拒絕」改成「全帶」
  assert.match(WEB_CAMPAIGN, /function dispatchCapOf\(name\)/);
  assert.match(WEB_CAMPAIGN, /MM\.troopCapOf\(/);
});
