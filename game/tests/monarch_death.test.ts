import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * monarch_death.test.ts — 「我方战死/被俘要落状态，君主战死要能触发失败」回归测试（R242）
 *
 * 跑法：cd game && node --test tests/monarch_death.test.ts
 *
 * 背景（2026-11-26 製作人實機回報）：
 *   「我派出君主等人去战斗，他们撤离不知道是死亡还是被俘了，后续这些人还能搜索，
 *     关键在于这样的话，我岂不永远不会触发失败？因为君主死了也不会更新状态」
 *
 * 根因三处：
 *   a. `core/capture.ts` 的 `resolvePostBattle()` 对 `alive === false` 的人直接 `continue`
 *      （原作只处置 status==3 被俘者）⇒ 阵亡的人没有任何记录；
 *   b. 整个工程**从没写过** `save.generalStatus`（只有读），所以阵亡/被俘不进名册状态；
 *   c. `CampaignRoot.detectMonarchDeath()` 只从「君主不在任何城的太守位」推断死亡，
 *      君主在战场上死了、城还在，就永远判不出来 ⇒ 永不灭国。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const READ = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const GS = READ('cocos/assets/scripts/GameState.ts');
const BR = READ('cocos/assets/scripts/BattleRoot.ts');
const CR = READ('cocos/assets/scripts/CampaignRoot.ts');

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

const GONE = bodyOf(GS, 'export function markGeneralGone(');
const SET = bodyOf(GS, 'export function setGeneralStatus(');
const SETTLE = BR.slice(BR.indexOf('if (!this.nextBout) {'), BR.indexOf('// 结算相：技能格/突擊/撤退不再有战斗语义'));
const DETECT = CR.slice(CR.indexOf('private detectMonarchDeath(): string {'), CR.indexOf('private detectMonarchDeath(): string {') + 1800);

test('[R242] markGeneralGone 同时写 generalStatus 与摘名册', () => {
  assert.ok(GONE.length > 0, '找不到 markGeneralGone');
  assert.ok(GONE.includes("fate[name] = status;"), '要写 generalStatus[名] = 死/俘');
  assert.ok(GONE.includes('roster[key] = row.filter('), '要从各城名册摘掉（否则还能被派出去搜索）');
  assert.ok(GONE.includes('delete moved[name]'), '要清 _moved 印記');
  assert.ok(SET.length > 0 && SET.includes('delete fate[n]'), 'setGeneralStatus 空 token 要能清除');
});

test('[R242] 战斗结算把「阵亡」与「我方被俘/被斩」写进存档', () => {
  assert.ok(SETTLE.includes("markGeneralGone(dead, '死')"), '阵亡要落状态');
  assert.ok(SETTLE.includes('aSide.general.alive === false'), '要检查主将阵亡');
  assert.ok(SETTLE.includes("markGeneralGone(captured, '俘')"), '我方战败被俘要落状态');
  assert.ok(SETTLE.includes("markGeneralGone(executed, '死')"), '被斩首要落状态');
  assert.ok(SETTLE.includes("this.settlement.winner === 'B'"), '只有我方战败时 captures 才是我们的人');
});

test('[R242] 君主死亡/被俘直接判死，不再只靠「丢了太守位」', () => {
  assert.ok(DETECT.includes('save.generalStatus'), 'detectMonarchDeath 要看 generalStatus');
  assert.ok(DETECT.includes("=== '死'"), "要看 '死'");
  assert.ok(DETECT.includes("=== '俘'"), "要看 '俘'（被俘的君主同样算失败起点）");
  assert.ok(
    DETECT.indexOf('generalStatus') < DETECT.indexOf('const seat = this.monarchSeat;'),
    '状态判定要排在座位推断之前（君主死了就不该再看城）',
  );
});

test('[R242] CampaignSave 两个声明都带上 generalStatus（web/Cocos 存档通道一致）', () => {
  assert.ok(GS.includes('generalStatus?: Record<string, string>;'), 'GameState.ts 的 CampaignSave 要声明');
  const TYPES = READ('cocos/assets/scripts/types.ts');
  assert.ok(TYPES.includes('generalStatus?: Record<string, string>;'), 'types.ts 的 CampaignSave 要声明');
});
