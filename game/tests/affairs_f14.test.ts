// @ts-nocheck
// 理由：本檔只做原始碼掃描（campaign.html 是單檔 HTML，沒有 .ts 型別來源），斷言全在執行期驗。
/**
 * affairs_f14.test.ts — F14「刪守軍每月白補 2%」回歸測試
 *
 * 原作換月不補守軍（project/210_原作战斗流程规格.md §1；差异表 F14）：
 * 兵只能由「部隊徵兵」把預備兵換成兵、出征帶回的倖存兵、或 AI ACT 補兵而來。
 * 舊碼在 campaign.html advanceMonth() 裏：
 *   const step = Math.max(1, Math.ceil(cap * 0.02));
 *   st.troops = cur + add;
 * 每月讓每座城憑空漲兵（600 上限 → +12/月），與錢變兵重複發兵。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

/** 取 `function 名(` 到該函式結尾（用下一個頂格 `function ` 或檔尾當邊界） */
function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `campaign.html 應有 function ${name}(`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end >= 0 ? rest.slice(0, end) : rest;
}

test('F14 換月不再白補守軍：advanceMonth 內沒有 2% 回補', () => {
  const body = fnBody(src, 'advanceMonth');
  assert.ok(!body.includes('Math.ceil(cap * 0.02)'), '2% 公式必須刪掉');
  assert.ok(!body.includes('守 軍 回 補'), '回補日誌必須刪掉');
  assert.ok(!/st\.troops\s*=\s*cur\s*\+/.test(body), '不得再直接加城兵');
  // 城兵唯一的正當入帳是「部隊徵兵」與出征返還，換月不該碰 st.troops
  assert.ok(!/st\.troops\s*\+=/.test(body), '換月不得 += 城兵');
});

test('F14 錢變兵仍在換月路徑上（autonomyTick 呼叫保留）', () => {
  const body = fnBody(src, 'advanceMonth');
  assert.match(body, /CM\.autonomyTick\(save, scenario\.cities/, 'F13 的錢變兵靠這行結算');
});
