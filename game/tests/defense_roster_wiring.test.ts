// @ts-nocheck
/**
 * [R246] 源碼契約：守城戰的名冊接線不能又被「defend !== true」擋掉。
 *
 * 這一條只用來釘「寫法」，行為由 `defense_battle_runtime.test.ts` 真跑存檔驗證。
 * 兩者都要，是因為 R245 正是「台账 API 都對、但 BattleRoot 的還人塊用 defend 擋掉」
 * 這種接線級失誤，只讀 API 測試看不出來。
 *
 * 跑法：`cd F:\sanguo\game; node --test tests/defense_roster_wiring.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function src(rel) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const BATTLE_ROOT = src('../cocos/assets/scripts/BattleRoot.ts');
const GAME_STATE = src('../cocos/assets/scripts/GameState.ts');
const RUN_SCOPED = src('../src/core/run_scoped.ts');

test('[R246] recordBattleResult：守城勝利不再 markCityTaken', () => {
  const idx = GAME_STATE.indexOf('if (!defend) markCityTaken(save, city);');
  assert.ok(idx > 0, '必須有 `if (!defend) markCityTaken(...)`：守城贏不是打下城');
  const plain = GAME_STATE.indexOf('\n    markCityTaken(save, city);');
  assert.equal(plain, -1, '不能保留無條件 markCityTaken（會整城刪名冊）');
});

test('[R246] recordBattleResult：守城敗要清該城名冊與守將快照', () => {
  assert.match(GAME_STATE, /else if \(defend\) \{[\s\S]{0,1200}?delete lostRoster\[city\]/);
  assert.match(GAME_STATE, /else if \(defend\) \{[\s\S]{0,1200}?lostState\.officers = \[\]/);
});

test('[R246] absorbArmyPeople：落城時撤掉舊的「死/俘」判定', () => {
  assert.match(
    GAME_STATE,
    /if \(save\.generalStatus && typeof save\.generalStatus === 'object'\) \{\s*for \(const name of names\) delete save\.generalStatus\[name\];/,
  );
});

test('[R246] handoffCapture：Ledger 過濾之前先撤存活者的舊生死判定', () => {
  const fn = GAME_STATE.slice(GAME_STATE.indexOf('export function handoffCapture('));
  const clear = fn.indexOf('delete fate[');
  const ledger = fn.indexOf('Ledger.handoffCapture(');
  assert.ok(clear > 0 && ledger > 0, '兩個調用都要在 handoffCapture 裡');
  assert.ok(clear < ledger, '必須先撤 fate 再交給 Ledger（Ledger 會用 isGone 過濾存活者）');
});

test('[R246] BattleRoot：守城勝負都還人，攻城走 handoffCapture', () => {
  assert.ok(
    BATTLE_ROOT.includes('const defend = this.launch?.defend === true;'),
    '要先取 defend 布林，不能在 if 條件裡臨時判',
  );
  const guard = BATTLE_ROOT.indexOf('if (defend) {');
  const refuge = BATTLE_ROOT.indexOf("const refuge = String(loadSave().owned?.[0] ?? '');");
  const keep = BATTLE_ROOT.indexOf('if (target) returnGeneralsToCity(target, alive);');
  const handoff = BATTLE_ROOT.indexOf('if (won) handoffCapture(target, alive);');
  assert.ok(guard > 0 && refuge > 0 && keep > 0 && handoff > 0, '四段都要存在');
  assert.ok(refuge > guard && keep > guard, '守城勝還人 / 守城敗避難都在 defend 分支內');
  assert.ok(keep < refuge, 'if (won) 還人在前，else 避難在後');
  assert.ok(handoff > guard, 'handoffCapture 屬於非守城（攻城）分支');
  assert.equal(
    BATTLE_ROOT.includes('if (target && this.launch?.defend !== true)'),
    false,
    '不能再用 `defend !== true` 把守城戰整塊跳過',
  );
});

test('[R246] 換局清庫名單含 generalStatus / takenOver / siege', () => {
  for (const key of ['generalStatus', 'takenOver', 'siege']) {
    assert.ok(RUN_SCOPED.includes(`'${key}'`), `RUN_SCOPED_KEYS 要含 ${key}`);
  }
});
