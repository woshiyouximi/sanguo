// @ts-nocheck
// 理由：CampaignRoot.ts / DeployRoot.ts 都 import 'cc'，node 載不進來（與
// `panels_roster_source.test.ts`、`march_arrival_contract.test.ts` 同一種做法）；
// 這裡用「源碼契約 + 純資料行為斷言」釘住出征編成屏的上下文，斷言全在執行期由 node:test 驗。
/**
 * 出征編成屏「出發城 vs 目標城」上下文契約（原生包實機 Bug A）。
 *
 * 實機（MuMu `127.0.0.1:16384`，`com.sanguo.sango2`）復現：
 *   開始新局 → 討伐董卓 → 劉備 → 內政頁 → 出征 → 選樂陵 → 推進一月 → 攻城戰
 *   進「出征編成」後主將卡是 `張角 · 黃巾 · 守軍 110 兵`，將列是**守城守將**
 *   （張角/廖化/管輅/裴元紹/蔣義渠/杜遠）；出發城其實是平原，我方主將應是劉備。
 *
 * 根因（兩層，見 work/march_deploy/REPORT.md）：
 *   ① 舊版 DeployRoot 恆取 `scenarios[0]`（P0-2 前殘留），《討伐董卓》讀到黃巾之亂的劇本 0；
 *   ② 我方主將候選池用 `generals.json` 的靜態 `CITY`（第 1 劇本快照）與 `owned` 過濾，
 *      不用存檔運行時人事 → 靜態 `CITY==='平原'` 的黃巾將（張角/廖化/管輅/裴元紹/蔣義渠/杜遠）
 *      被判成平原守將；再加上 `majorOf()` 讀**目標城**（樂陵，太守空串）讓「太守優先」失效，
 *      主將退化成 STR+INT 最高的關羽（更舊的版本就是張角）。
 *
 * 本檔釘住的契約：
 *   · `CampaignRoot` 的 `if (kind === 'march')` 分支把**出發城**傳給 Deploy
 *     （`setDeployFrom(siege.from)`）、目標城傳 `setDeployTarget(selected)`，且在 loadScene 之前；
 *   · `DeployRoot` 读 `takeDeployFrom()` → `this.home`，我方池走
 *     `OfficersOfCity.officerNamesOfCity(save, this.home, ctx)`（存檔運行時人事；與物品頁/內政頁
 *     同一個唯一入口），不再有靜態 `gen.CITY` 的 `owned` fallback；
 *   · 太守（主將優先）取出發城（`cityMajorNameOf(save, this.home, ctx)` / garrison.json 出發城列），
 *     不是目標城；
 *   · 敵方守將/守軍/敵情仍從目標城算（`cityGarrisonTroops` / `resolveEnemyIntel` / `targetCity`）。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/march_deploy_ctx.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as O from '../cocos/assets/scripts/OfficersOfCity.ts';

const readText = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

// 一律讀**打包進 APK 的資料**（Cocos `DataLoader` 載的那份），不是 game/data 的開發副本
const GENERALS = readJson('../cocos/assets/bundles/res/data/generals.json');
const SCENARIOS = readJson('../cocos/assets/bundles/res/data/scenarios.json');
const GARRISON = readJson('../cocos/assets/bundles/res/data/garrison.json');

const SCEN = 1; // 《討伐董卓》（189 年，玩家君主劉備）
const HOME = '平原'; // 出發城（我方）
const TARGET = '樂陵'; // 目標城（關卡，守軍 110）

const CAMPAIGN = readText('../cocos/assets/scripts/CampaignRoot.ts');
const DEPLOY = readText('../cocos/assets/scripts/DeployRoot.ts');

/** 取兩段標記之間的源碼（標記找不到就讓測試紅，避免「改完程式但契約跑空」） */
function slice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `找不到起點標記：${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `找不到終點標記：${endMarker}`);
  return src.slice(start, end);
}

/** 實機存檔（work/march_deploy/probe_device.mjs 從 MuMu 的 jsb.sqlite 抽出來的平原 runtime） */
function deviceSave() {
  return {
    owned: [HOME],
    // 我方城駐將的權威來源：存檔運行時 roster（不是 generals.json 的靜態 CITY）
    roster: { [HOME]: ['關羽', '劉備', '張角', '張飛', '簡雍'] },
    cities: {
      [HOME]: {
        troops: 244,
        pop: 335000,
        money: 4762,
        owner: '劉備',
        major: '劉備',
        officers: [
          { name: '關羽', str: 99, int: 85, loyal: 90, status: '登' },
          { name: '劉備', str: 82, int: 79, loyal: 90, status: '登' },
          { name: '張角', str: 56, int: 95, loyal: 90, status: '未' },
          { name: '張飛', str: 99, int: 51, loyal: 90, status: '登' },
          { name: '簡雍', str: 45, int: 80, loyal: 90, status: '登' },
        ],
      },
      [TARGET]: { troops: 110, pop: 0, money: 0, owner: '', major: '', officers: [] },
    },
  };
}

/** `CampaignRoot.rosterCtx()` / `DeployRoot.start()` 的等價 ctx */
function ctxOf(save) {
  return {
    generals: GENERALS,
    scenIdx: SCEN,
    roster: save.roster,
    playerForce: '劉備',
    scenarioCities: SCENARIOS[SCEN].cities,
  };
}

/** DeployRoot 主將排序：太守優先、再 STR+INT 降序（start() 的 pool sort 同款） */
function pickMainGeneral(names, major) {
  const rows = names.map((name) => GENERALS.find((gen) => gen.NAME === name)).filter(Boolean);
  rows.sort((a, b) => {
    const aMajor = a.NAME === major ? 1 : 0;
    const bMajor = b.NAME === major ? 1 : 0;
    if (aMajor !== bMajor) return bMajor - aMajor;
    return b.STR + b.INT - (a.STR + a.INT);
  });
  return rows.length > 0 ? rows[0].NAME : '';
}

/* ============================================================================
 * ① 劇本/存檔前提：出發城平原（我方，244 兵）、目標城樂陵（關卡，守軍 110）
 * ========================================================================== */
test('實機存檔前提：劇本 1 的平原屬劉備、樂陵是關卡守軍 110', () => {
  const scen = SCENARIOS[SCEN];
  const plane = scen.cities.find((city) => city.NAME === HOME);
  const leling = scen.cities.find((city) => city.NAME === TARGET);
  assert.ok(plane, '劇本 1 應有平原');
  assert.ok(leling, '劇本 1 應有樂陵');
  assert.equal(plane.KING, '劉備', '平原在討伐董卓劇本屬劉備');
  assert.equal(plane.MAJOR, '劉備', '平原太守是劉備');
  assert.equal(leling.KING, '', '樂陵是關卡/空城（沒有君主）');
  assert.equal(leling.MAJOR, '', '樂陵沒有太守（所以舊碼 majorOf(target) 永遠是空串）');

  const g1 = GARRISON.find((row) => row.scenario === SCEN);
  assert.ok(g1, 'garrison.json 應有劇本 1 的表');
  assert.equal(g1.cities[HOME].garrison, 244, '平原城兵 244（實機存檔 troops 也是 244）');
  assert.equal(g1.cities[TARGET].garrison, 110, '樂陵守軍 110（實機主將卡上的「守軍 110 兵」）');
});

/* ============================================================================
 * ② CampaignRoot march 分支：from=出發城、target=目標城、敵情=目標城，且在 loadScene 之前
 * ========================================================================== */
test('CampaignRoot march 分支：setDeployFrom(出發城 siege.from)、setDeployTarget(目標 selected)', () => {
  const branch = slice(CAMPAIGN, "if (kind === 'march') {", '  // 行軍（web campaign.html');
  assert.match(branch, /GameState\.setDeployFrom\(siege\.from\);/, '出發城要傳 siege.from（平原）');
  assert.match(branch, /GameState\.setDeployTarget\(selected\);/, '目標城要傳 selected（樂陵）');
  // 敵情是**目標城**的守將（不是出發城），否則編成屏的敵方卡會變我方
  assert.match(branch, /const intel = this\.enemyIntelOf\(selected\);/, '敵情要從目標城算');
  // 兩個 setDeploy 必須在 loadScene 之前；takeDeploy* 都是「取一次即清」，順序顛倒會拿到 null
  // （march 分支現在有兩條進 Deploy 的路：無部隊的「先編成」+ 城下已有部隊的「攻城」，
  //   所以取最後一個 loadScene，避免被前面那條擋住）
  const load = branch.lastIndexOf("director.loadScene('Deploy')");
  assert.ok(load > 0, 'march 分支要進 Deploy 場景');
  assert.ok(branch.indexOf('setDeployFrom(siege.from)') < load, 'setDeployFrom 要在 loadScene 之前');
  assert.ok(branch.indexOf('setDeployTarget(selected)') < load, 'setDeployTarget 要在 loadScene 之前');
  // 無部隊出征：先記下編成態（出發城/目標/路徑），再由編成屏派兵團
  assert.match(branch, /GameState\.setDeployMarch\(\{ from, target: selected, pathIndex \}\);/, '無部隊出征要先進編成');
  // 攻城的 Deploy 語義是「我方進攻」：不能走 setDeployArmy（DeployRoot 會當守城戰）
  assert.match(branch, /GameState\.setDeployArmy\(null\);/);
});

/* ============================================================================
 * ③ DeployRoot：home 來自 takeDeployFrom()，我方池走「出發城運行時人事」，敵方仍從目標城
 * ========================================================================== */
test('DeployRoot：我方池讀 this.home 的存檔運行時人事（OfficersOfCity），敵方從目標城', () => {
  const start = slice(DEPLOY, 'protected async start(): Promise<void> {', '  onEnable(): void {');
  // from → home（與 web `HOME = qs.from || save.owned[0] || target` 同口徑）
  assert.match(start, /const from = GameState\.takeDeployFrom\(\);/, '要讀 takeDeployFrom()');
  assert.match(start, /this\.home = from \?\? save\.owned\[0\] \?\? targetName;/);
  // 我方名單 = 出發城（this.home）的運行時人事，且必須在 home 決定之後才算
  assert.match(start, /O\.officerNamesOfCity\(save, this\.home, ctx\)/, '我方池要走 OfficersOfCity 的出發城名單');
  assert.ok(
    start.indexOf('this.home = from') < start.indexOf('O.officerNamesOfCity(save, this.home'),
    '先決定 home，再算出發城名單',
  );
  // 舊 bug：靜態 CITY 的 owned fallback 會把黃巾之亂的將當成我方（已經移除）
  assert.doesNotMatch(
    start,
    /typeof gen\.CITY === 'string' && save\.owned\.includes\(gen\.CITY\)/,
    '不能再有「靜態 CITY ∈ save.owned」的我方池 fallback',
  );
  // 敵方：守軍/敵情一律用目標城
  assert.match(start, /cityGarrisonTroops\(data, this\.scenIdx, this\.targetCity\.NAME\)/);
  assert.match(start, /resolveEnemyIntel\(data, this\.scenIdx, this\.targetCity\.NAME, 100\)/);
});

/* ============================================================================
 * ④ DeployRoot 太守（主將優先）取出發城，不讀目標城
 * ========================================================================== */
test('DeployRoot majorOf：太守取出發城（this.home），不是目標城（targetCity）', () => {
  const major = slice(DEPLOY, 'private majorOf(data: GameData, save: unknown, ctx: O.OfficersCtx): string {', '  /** 换将/首次进屏');
  assert.match(major, /O\.cityMajorNameOf\(save, this\.home, ctx\)/, '太守優先走「出發城」的運行時 major');
  assert.match(major, /scenario\?\.cities\?\.\[this\.home\]/, 'garrison.json fallback 也要讀出發城');
  assert.doesNotMatch(major, /this\.targetCity/, '太守/主將優先級不能讀目標城（那是守方）');
});

/* ============================================================================
 * ⑤ 資料層行為（實機同一支 OfficersOfCity）：出發城平原名單＝劉備組、主將＝劉備
 * ========================================================================== */
test('資料層：出發城平原的名單是劉備/關羽/張飛，主將（太守優先）是劉備，不是張角那組', () => {
  const save = deviceSave();
  const ctx = ctxOf(save);
  const homeNames = O.officerNamesOfCity(save, HOME, ctx);
  const major = O.cityMajorNameOf(save, HOME, ctx);

  assert.equal(major, '劉備', '出發城平原的太守是劉備');
  for (const want of ['劉備', '關羽', '張飛']) {
    assert.ok(homeNames.includes(want), `出發城名單應含 ${want}，實際 ${JSON.stringify(homeNames)}`);
  }
  // 黃巾之亂（劇本 0）平原那批守將不可以出現在我方名單裡
  for (const wrong of ['廖化', '裴元紹', '杜遠']) {
    assert.ok(!homeNames.includes(wrong), `出發城名單不應含守方黃巾將「${wrong}」，實際 ${JSON.stringify(homeNames)}`);
  }
  assert.equal(pickMainGeneral(homeNames, major), '劉備', '主將＝太守劉備（不是 STR+INT 最高的關羽）');
  // 反證舊 bug：太守取錯（空串）時主將就變關羽；取錯城市（劇本 0 平原）時主將變張角
  assert.equal(pickMainGeneral(homeNames, ''), '關羽', '太守優先失效時會退化成關羽（舊碼的次要問題）');

  // 目標城樂陵：關卡沒有守將，官方表也是空的 → 它的名單不能冒充我方
  assert.deepEqual(O.officerNamesOfCity(save, TARGET, ctx), [], '樂陵（目標城）沒有駐將名單');
  assert.equal(O.cityMajorNameOf(save, TARGET, ctx), '', '樂陵沒有太守（舊碼 majorOf(target) 因此回空串）');
});

/* ============================================================================
 * ⑥ 舊檔沒有 roster：按「本局劇本」播種，也不能回到劇本 0 的黃巾名單
 * ========================================================================== */
test('沒有存檔 roster 的舊檔：按劇本 1 播種（劉備組），不是劇本 0 的黃巾將', () => {
  const save = { owned: [HOME], roster: {}, cities: { [HOME]: { troops: 244 } } };
  const ctx = ctxOf(save);
  const names = O.officerNamesOfCity(save, HOME, ctx);
  for (const want of ['劉備', '關羽', '張飛']) {
    assert.ok(names.includes(want), `劇本 1 播種的平原名單應含 ${want}，實際 ${JSON.stringify(names)}`);
  }
  for (const wrong of ['廖化', '裴元紹', '杜遠']) {
    assert.ok(!names.includes(wrong), `不應播種劇本 0 平原守將「${wrong}」，實際 ${JSON.stringify(names)}`);
  }
  // 播種用的存檔 owner/major 也要是劉備（不然太守優先還是失效）
  assert.equal(O.cityMajorNameOf(save, HOME, ctx), '劉備');
});
