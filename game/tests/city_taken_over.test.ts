// @ts-nocheck
/**
 * [R244] 打下的城不能再冒前主人的將。
 *
 * 製作人實機回報（七條）：
 *   ① 佔樂陵（沒武將的城），劉備關羽張飛三個人去；
 *   ② 劉備先上、輸了，沒觸發輪戰，直接回大地圖；
 *   ③ 但顯示樂陵已經是我方的；
 *   ④ 之後 AI 來攻打；
 *   ⑤ 我點守城戰，守城隊伍卻是袁紹的人；
 *   ⑥ 只能選 2 人出戰；
 *   ⑦ 第一個袁紹撤離後，輪戰第二個上場的卻是關羽。
 *
 * 根因（本輪定位）：
 *   a. `OfficersOfCity.ownedCityNames()` 在 `roster[城]` 為空時回落劇本表 —— 那是「新局首播」的
 *      保底，但打下的城也被套用，於是樂陵的守將＝劇本裏的袁紹駐將；
 *   b. `recordBattleResult()` 的 `armyId` 在守城戰指向**來犯的敵軍**，舊碼照樣把人
 *      `absorbArmyPeople()` 進我方城的名冊 ⇒ 敵將變成我方守將；
 *   c. 攻城戰的兵團抵達時已被 `removeArmy()`，`armyId` 找不到兵團 ⇒ 這批將打完就人間蒸發
 *      （所以「沒觸發輪戰」之後連人都沒了）。
 *
 * 這裡只做靜態源碼斷言：`GameState` 依賴 `sys.localStorage`，跑不起來純 Node runtime。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const gameState = read('../cocos/assets/scripts/GameState.ts');
const officersOfCity = read('../cocos/assets/scripts/OfficersOfCity.ts');
const deployRoot = read('../cocos/assets/scripts/DeployRoot.ts');
const battleRoot = read('../cocos/assets/scripts/BattleRoot.ts');

/** 取 `name` 之後 `size` 個字的窗口（大括號配對在返回型別字面量上會誤截，見 R241 的坑） */
function windowOf(src: string, name: string, size: number): string {
  const at = src.indexOf(name);
  assert.ok(at >= 0, `找不到 ${name}`);
  return src.slice(at, at + size);
}

test('[R244] 接管一座城會記月份、清舊守將與舊名冊', () => {
  const body = windowOf(gameState, 'function markCityTaken(', 1400);
  assert.match(body, /save\.takenOver\[name\] = Math\.max\(0, Math\.floor\(numberOr\(save\.month, 0\)\)\)/, '要記接管月份');
  assert.match(body, /state\.officers = \[\]/, '要清掉前主人的守將快照');
  assert.match(body, /delete roster\[name\]/, '要清掉名冊裏這座城的舊主名單');
  assert.match(gameState, /export interface CampaignSave \{[\s\S]*?takenOver\?: Record<string, number>;/, 'CampaignSave 要有 takenOver');
});

test('[R244] 佔城與打勝都會記接管（occupyCity / recordBattleResult）', () => {
  const occupy = windowOf(gameState, 'export function occupyCity(', 900);
  assert.match(occupy, /markCityTaken\(save, city\)/, 'occupyCity 要記接管');
  const record = windowOf(gameState, 'export function recordBattleResult(', 2400);
  assert.match(record, /markCityTaken\(save, city\)/, '打勝占城要記接管');
});

test('[R244] 我方打下來的城不再回落劇本表找人', () => {
  const body = windowOf(officersOfCity, 'function ownedCityNames(', 600);
  const taken = body.indexOf('takenOverOf(save, city)');
  const scen = body.indexOf('isScenarioHome(city, ctx)');
  assert.ok(taken >= 0, 'ownedCityNames 要判 takenOver');
  assert.ok(taken < scen, 'takenOver 判定必須在劇本表回落之前');
  assert.match(officersOfCity, /function takenOverOf\(save: unknown, city: string\): boolean/, '要有 takenOverOf 助手');
});

test('[R244] 守城戰的敵方名冊以來犯兵團為準，不再用本城守軍快照', () => {
  const body = windowOf(deployRoot, 'private enemyRoster(', 900);
  assert.match(body, /this\.defenseArmyId/, '要先看是不是守城戰');
  assert.match(body, /GameState\.armies\(\)\.find\(\(row\) => row\.id === this\.defenseArmyId\)/, '要從來犯兵團取將');
  const launches = deployRoot.split('this.enemyRoster(intel)').length - 1;
  assert.ok(launches >= 2, '攻城與守城兩條起戰路徑都要用 enemyRoster');
  assert.doesNotMatch(deployRoot, /const rosterB = \[intel\?\.name \?\? '守備隊'/, '舊的 intel 取敵將寫法要清乾淨');
});

test('[R244] 戰後只還原我方兵團的人，敵軍的將不能寫進我方名冊', () => {
  assert.match(gameState, /if \(fought && fought\.side === 'A'\)/, 'absorb 要判兵團是不是我方的');
});

test('[R244] 攻城戰打完，活著的參戰將要還回城（贏了進佔下的城、輸了回出發城）', () => {
  const body = windowOf(battleRoot, 'const deadSet = new Set(', 1200);
  assert.match(body, /this\.launch\?\.rosterA/, '要用參戰名冊');
  assert.match(body, /returnGeneralsToCity\(target, alive\)/, '要把活著的將還回城');
  assert.match(body, /this\.settlement\.winner === 'A'/, '贏了進佔下的城');
  assert.match(gameState, /export function returnGeneralsToCity\(city: string, names: readonly string\[\]\): void/, '要有 returnGeneralsToCity');
});

test('[R244] 戰鬥結果要留取證日誌（製作人說「打輸了城卻變我的」）', () => {
  const body = windowOf(gameState, "console.log('[R244] battle result'", 240);
  assert.match(body, /winner/, '日誌要帶 winner');
  assert.match(body, /defend/, '日誌要帶 defend');
  assert.match(body, /owned: save\.owned\.includes\(city\)/, '日誌要帶結算後該城是否屬我方');
});
