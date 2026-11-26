/**
 * web 時鐘平權（雙端一致性門禁）：campaign.html 的大地圖時間語義要與原作 / Cocos 一致。
 *
 * 原作證據（work/orig_time/REPORT.md，已核對）：
 *   - 大地圖時間 = 每幀 −1 的計數器 T；一年 3600 tick（0x41B849）、一月 300（0x41B855）、一日 10（0x41B879）。
 *   - 月份現算 floor((3600−T)/300)+1；年份只在「進內政」時 +1（0x4238C3）。
 *   - T==0（0x41B6C6）→ 自動切入內政場景，大地圖停更、時間凍結。
 *   - 「內政終了」只把 T 重設 3600 回大地圖（0x41BBF5），不跑任何月份模擬。
 *   - 兵團每幀推進（0x41B127），與日曆無關，抵達城下就進戰鬥。
 *   - 任一浮層面板開著時停錶（0x41BEC1）。
 * Cocos 對照：cocos/assets/scripts/CampaignRoot.ts 的 clockT/clockAcc/clockSpeed/clockPaused、
 * update(dt)、clockRunning()、stepClock(n)、monthTick()、enterInterior()、endInterior()、UI_PANEL_NODES。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const CAMPAIGN = read('../web/campaign.html');
const COCOS = read('../cocos/assets/scripts/CampaignRoot.ts');

/** 取 `function 名(` 到下一行首 `function ` 為止（repo 既有測試同款邊界） */
function fnBody(text: string, name: string): string {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `原始碼應有 function ${name}(`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end >= 0 ? rest.slice(0, end) : rest;
}

test('web 時鐘：常量＝原作 3600 / 300 / 10 tick', () => {
  assert.match(CAMPAIGN, /const CLOCK_TICKS_PER_YEAR = 3600;/);
  assert.match(CAMPAIGN, /const CLOCK_TICKS_PER_MONTH = 300;/);
  assert.match(CAMPAIGN, /const CLOCK_TICKS_PER_DAY = 10;/);
  assert.match(CAMPAIGN, /const CLOCK_STEP = 1 \/ 60;/);
});

test('web 時鐘：逐幀 requestAnimationFrame + 60Hz 固定步長 T−1', () => {
  assert.match(CAMPAIGN, /function clockFrame\(now\)/);
  assert.match(CAMPAIGN, /requestAnimationFrame\(clockFrame\);/);
  assert.match(CAMPAIGN, /clockAcc \+= Math\.min\(dt, 0\.25\);/);
  const body = fnBody(CAMPAIGN, 'stepClock');
  assert.match(body, /clockT = Math\.max\(0, clockT - n\);/, '每 tick T−1');
  assert.match(body, /advanceArmiesTick\(n\)/, '兵團每 tick 推進（原作 0x41B127）');
  assert.match(body, /CLOCK_TICKS_PER_MONTH/, '跨月判斷用 300 tick');
  assert.match(body, /enterInterior\(\)/, 'T 走到 0 → 進內政（0x41B6C6）');
});

test('web 時鐘：跨月只跑一次月度結算（advanceMonth(1)），不再一次跑 12 個月', () => {
  assert.doesNotMatch(CAMPAIGN, /advanceMonth\(12\)/, '不得再一次跑完 12 個月');
  const body = fnBody(CAMPAIGN, 'monthTick');
  assert.match(body, /advanceMonth\(1, \{ clock: true \}\)/, '跨月走原本的單月流水線，並標記 clock 模式');
  const adv = fnBody(CAMPAIGN, 'advanceMonth');
  assert.match(adv, /const clockMode = opts && opts\.clock === true;/, 'advanceMonth 要收 clock 模式');
  assert.match(adv, /if \(!clockMode\) \{\s*advanceArmies\(save\.armies\);/, '逐幀模式不再整月跳行軍');
});

test('web 時鐘：T==0 自動進內政並把年份 +1；內政終了只重設 T=3600', () => {
  const enter = fnBody(CAMPAIGN, 'enterInterior');
  assert.match(enter, /clockPaused = true;/);
  assert.match(enter, /clockT = 0;/);
  assert.match(enter, /Saves\.ensureYear\(save\)/, '年份 +1（原作 0x4238C3）');
  assert.match(enter, /showInteriorSheet\(\)/, '要打開「內政時間到了」浮層');
  const end = fnBody(CAMPAIGN, 'endMonth');
  assert.match(end, /clockT = CLOCK_TICKS_PER_YEAR;/, '原作 0x41BBF5 只把 T 重設 3600');
  assert.match(end, /clockAcc = 0;/);
  assert.doesNotMatch(end, /advanceMonth\(/, '不跑任何月份模擬');
  // 鎖住大地圖：內政浮層不可被一般關閉路徑關掉
  assert.match(CAMPAIGN, /if \(id !== 'interiorSheet' && clockInterior\) return;/, '內政期間別的抽屜不能頂掉它');
  assert.match(CAMPAIGN, /id="interiorSheet"/);
  assert.match(CAMPAIGN, /id="btnInteriorEnd"/);
});

test('web 時鐘：浮層開著停錶（原作 0x41BEC1）', () => {
  const running = fnBody(CAMPAIGN, 'clockRunning');
  assert.match(running, /overlayDepth > 0/, '浮層計數要讓時鐘停');
  assert.match(running, /document\.hidden/, '切到別的分頁也停');
  assert.match(CAMPAIGN, /overlayDepth = 1;/);
  assert.match(CAMPAIGN, /overlayDepth = keepInterior \? 1 : 0;/);
});

test('Cocos 對照：同一組時鐘欄位/函式存在（雙端一致性錨點）', () => {
  assert.match(COCOS, /private clockT = 3600;/);
  assert.match(COCOS, /update\(dt: number\): void \{/);
  assert.match(COCOS, /this\.stepClock\(this\.clockSpeed\)/);
  assert.match(COCOS, /this\.clockT = Math\.max\(0, this\.clockT - n\);/);
  assert.match(COCOS, /private monthTick\(\): boolean \{/);
  assert.match(COCOS, /private enterInterior\(\): void \{/);
  assert.match(COCOS, /private endInterior\(\): void \{/);
  assert.match(COCOS, /this\.clockT = 3600;/);
  assert.match(COCOS, /export const UI_PANEL_NODES/);
});
