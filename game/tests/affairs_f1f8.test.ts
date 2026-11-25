// @ts-nocheck
// 理由：本檔只做原始碼掃描（campaign.html / city.html 是單檔 HTML，沒有 .ts 型別來源），
// 斷言全在執行期驗。F1 的「正月門」與 F8/F9 的「必須選將、無將拒絕」都是 UI 層規則，
// 真正的行為在瀏覽器裏，node 測試只能釘住入口與文案不被改回去。
/**
 * affairs_f1f8.test.ts — F1「正月內政窗口」+ F8/F9「搜索/開發必須選將」回歸測試
 *
 * 原作（work/flow_audit/内政大地图_差异.md F1/F2/F8/F9、project/210 §1）：
 *   - 一年只有 1 月能下內政命令；其餘 11 個月時間流動，內政鍵只能「查看」。
 *   - 搜索/開發要指定一名今年還沒行動過的武將；名冊為空或今年已行動 → 拒絕。
 *   - 沒有太守不能開發（原作不允許無太守代行，舊碼用 ×0.53 效率糊過去）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const campaign = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');
const city = readFileSync(new URL('../web/city.html', import.meta.url), 'utf8');

/** 取 `function 名(` 到該函式結尾（用下一個頂格 `function ` 或檔尾當邊界） */
function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `原始碼應有 function ${name}(`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end >= 0 ? rest.slice(0, end) : rest;
}

test('F1 大地圖：內政鍵按月份分流（正月=內政，其餘=只讀查看）', () => {
  const body = fnBody(campaign, 'render');
  assert.match(body, /const inAffairs = Saves\.monthOfYear\(save\.month\) === 1;/, '窗口判斷要用 monthOfYear');
  assert.ok(body.includes('正月 · 內政八命令'), '正月按鈕文案');
  assert.ok(body.includes('非正月 · 只讀'), '非正月降級成只讀');
  // 進城頁的連結：非正月帶 &view=1（city.html 據此只讀）
  assert.ok(
    campaign.includes("(Saves.monthOfYear(save.month) === 1 ? '' : '&view=1')"),
    '非正月進城要帶 &view=1',
  );
});

test('F1 內政終了：非正月不能收束窗口，正月那行 markMonthActed 仍在', () => {
  const body = fnBody(campaign, 'endMonth');
  assert.match(body, /Saves\.monthOfYear\(save\.month\) !== 1/, '非正月要直接拒絕');
  assert.match(body, /CM\.markMonthActed\(save, UNLIMITED\);/, 'rows85 釘死的收束行不能動');
});

test('F1 城內頁：?view=1 / 非正月 / 窗口已終了 → readOnly', () => {
  assert.match(city, /const VIEW = qs\.get\('view'\) === '1';/, 'view 參數');
  assert.match(city, /const inAffairsMonth = \(\) => Saves\.monthOfYear\(save\.month\) === 1;/, '正月判斷');
  const body = fnBody(city, 'readOnly');
  assert.match(body, /if \(VIEW\) return true;/, 'view=1 直接只讀');
  assert.match(body, /!inAffairsMonth\(\)/, '非正月只讀');
  assert.match(body, /M\.monthLocked\(save, UNLIMITED\)/, '窗口已終了也只讀');
  const cmd = fnBody(city, 'onCmd');
  assert.match(cmd, /readOnly\(\)/, '命令入口要兜住只讀');
  assert.ok(cmd.includes('readOnlyHint()'), '拒絕時要說清楚原因');
});

test('F8 搜索：先選將，選中才執行，且寫進 ctx.exec', () => {
  const body = fnBody(city, 'doSearch');
  assert.match(body, /pickExec\('搜索',/, '沒帶 exec 時要先彈選將抽屜');
  assert.match(body, /M\.actedLocked\(save, execName\)/, '要擋「該將今年已行動」');
  assert.match(body, /exec: execName/, '執行武將要交給 city_model');
  assert.match(body, /M\.search\(save, cityDef, \{ \.\.\.ctx, exec: execName \}\)/, '不要只傳 ctx 本體');
});

test('F9 開發：無太守直接拒絕，有太守也要先選將並校驗年令', () => {
  const body = fnBody(city, 'doDevelop');
  assert.match(body, /if \(!M\.majorOf\(save, cityDef\)\)/, '先查太守');
  assert.ok(body.includes('需先任命太守'), '拒絕文案');
  assert.match(body, /pickExec\('開發',/, '要選執行武將');
  assert.match(body, /M\.actedLocked\(save, execName\)/, '要擋「該將今年已行動」');
  assert.match(body, /exec: execName/, '執行武將要交給 city_model');
  // 舊的 ×0.53 糊弄路徑：develop 本體仍保留 fallback（測試釘死），但 UI 不得再無將直呼
  assert.ok(!body.includes('M.develop(save, cityDef, ctx)'), '不得沿用無 exec 的呼叫');
});

test('F8/F9 選將抽屜：排除在路上的、排除今年已行動的，不選就取消', () => {
  const body = fnBody(city, 'pickExec');
  assert.match(body, /M\.rosterOf\(save, cityDef\.NAME, ctx\)/, '名冊走 rosterOf（已過濾 away）');
  assert.match(body, /M\.actedLocked\(save, g\.NAME\)/, '要排除今年已行動的將');
  assert.ok(body.includes('沒有可用的武將'), '全員已行動 → 拒絕');
  assert.ok(body.includes('沒選執行武將'), '抽屜沒選人 → 命令取消');
  assert.match(body, /cb\(picked\)/, '選中才回調');
});
