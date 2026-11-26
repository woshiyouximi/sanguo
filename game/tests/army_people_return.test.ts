import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * army_people_return.test.ts — 「兵團落城要連人一起還原進名冊」回歸測試（R241）
 *
 * 跑法：cd game && node --test tests/army_people_return.test.ts
 *
 * 背景（2026-11-26 製作人實機回報）：
 *   「派出去的队伍，如果直接点返回没打，后续这些武将也再也不会回来出现在出征列表了」
 *   「战斗失败也是如此」
 *
 * 根因：`march()` 派兵時把將從 `save.roster[出發城]` 摘掉、記進兵團的 `general/officers`；
 * 但 `enterCityWithArmy()` / `occupyCity()` / `recordBattleResult()` 只搬兵、清兵團，
 * 從來沒有把將寫回名冊。而面板（出征候選、名冊、搜索執行人）唯一讀 `save.roster`，
 * 於是這批人就成了「活著但不存在」的幽靈將。
 *
 * 修法：`GameState.ts` 新增 `absorbArmyPeople()`（把主將 + 隨軍寫回 `roster[城]`、
 * 從別城摘掉、清 `_moved` 印記），三個落城/戰後入口都調它。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'cocos/assets/scripts/GameState.ts'), 'utf8');

/** 抽出某個函式的本文（大括號配對） */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

const ABSORB = bodyOf(GS, 'function absorbArmyPeople(');
/** 取「從簽名到 1400 字」的窗口：這幾支的返回型別是大括號字面量，bodyOf 的括號配對會提早結束 */
function windowOf(src: string, name: string, size = 1400): string {
  const at = src.indexOf(name);
  return at < 0 ? '' : src.slice(at, at + size);
}
const ENTER = windowOf(GS, 'export function enterCityWithArmy(');
const OCCUPY = windowOf(GS, 'export function occupyCity(');
const RECORD = windowOf(GS, 'export function recordBattleResult(', 3200);

test('[R241] absorbArmyPeople 把主将 + 随军写回 roster[城]，并清掉 _moved 印記', () => {
  assert.ok(ABSORB.length > 0, '找不到 absorbArmyPeople（R241 helper）');
  assert.ok(ABSORB.includes('army.general'), '要收主将');
  assert.ok(ABSORB.includes('army.officers'), '要收随军武将');
  assert.ok(ABSORB.includes('roster[city]'), '要写回目标城名册');
  assert.ok(ABSORB.includes("'_moved'"), '要跳过 _moved 键（它不是城名）');
  assert.ok(ABSORB.includes('delete moved[name]'), '要清 _moved 印記，否则原城仍不列他');
  // 先从其他城摘掉，避免同一人挂在两座城
  assert.ok(
    ABSORB.indexOf('names.indexOf(n) < 0') >= 0,
    '要从别的城名册里摘掉同一个人',
  );
});

test('[R241] 三个落城/戰後入口都要調用 absorbArmyPeople', () => {
  assert.ok(ENTER.includes('absorbArmyPeople(save, army, city)'), 'enterCityWithArmy（回城/增援）要还原');
  assert.ok(OCCUPY.includes('absorbArmyPeople(save, army, city)'), 'occupyCity（占空城）要还原');
  assert.ok(RECORD.includes('absorbArmyPeople(save, fought, home)'), 'recordBattleResult（战后）要还原');
});

test('[R241] 戰後還原去向：贏了進佔下的城，輸了退回出發城（還在我方手裡時）', () => {
  assert.ok(
    RECORD.includes("const home = won ? city : save.owned.includes(fought.from) ? fought.from : '';"),
    '战后落点判定要区分胜负',
  );
  // 舊病根：只清兵团、不还原任何人
  assert.equal(
    RECORD.replace(/\/\/[^\n]*/g, '').includes('if (armyId) save.armies = save.armies.filter((army) => army.id !== armyId);'),
    false,
    '不得只清兵团而不还原武将（R241 前的写法）',
  );
});

test('[R241] 返回没打的路径：abandonSiege 派返程兵团，返程到城由 enterCityWithArmy 收人', () => {
  const DR = readFileSync(join(ROOT, 'cocos/assets/scripts/DeployRoot.ts'), 'utf8');
  const ABANDON = bodyOf(DR, 'private abandonSiege(): void');
  assert.ok(ABANDON.includes('pushReturnArmy('), '返回要派返程兵团（R234b）');
  assert.ok(
    ABANDON.indexOf('pushReturnArmy(') < ABANDON.indexOf("director.loadScene('Campaign')"),
    '先登记返程兵团再切场景，否则中途异常就丢人',
  );
});
