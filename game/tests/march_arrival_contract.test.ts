// R212 出征经济契约：兵團抵達城下 → 編成頁，兵數與主將必須跟著 URL 走。
//
// 背景（affairs/marchflow 交接）：兵團的兵在 `dispatchArmy()` 時就已經從出發城扣掉，
// 抵達時 campaign 又先 `removeArmy()` 再跳 deploy —— deploy 在存檔裡已經找不到那支兵團，
// 沒有 `?troops=` 就只能退回 city 模式，拿「城裡剩下的兵」去打。
// 這支測試用源碼契約釘住四個參數（troops / a / officers / bsoldiers），
// 因為 campaign.html 是內嵌腳本，跑不到 DOM（與 webfix_r86 同一種做法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

/** 取「我軍抵達敵城下」那段（從註解到函式結尾前的 return true）。 */
function arrivalBlock() {
  const start = HTML.indexOf('// 3) 我軍抵達敵城下');
  assert.ok(start > 0, '找不到「3) 我軍抵達敵城下」段');
  const end = HTML.indexOf('return true;', start);
  assert.ok(end > start, '找不到該段結尾');
  return HTML.slice(start, end);
}

test('R212 ①：抵達城下的出征 URL 帶 troops（否則 deploy 會二次扣/拿錯兵）', () => {
  const seg = arrivalBlock();
  assert.match(seg, /q\.set\('troops', String\(Math\.max\(0, Math\.trunc\(Number\(a\.troops\) \|\| 0\)\)\)\);/);
  // 順序上必須在 removeArmy 之前組好（removeArmy 之後 save.armies 裡就沒這支了）
  assert.ok(seg.indexOf("q.set('troops'") < seg.indexOf('removeArmy(a.id)'), 'troops 必須在 removeArmy 之前寫進 URL');
});

test('R212 ②：主將用兵團自己那名，不讓編成頁重挑', () => {
  const seg = arrivalBlock();
  assert.match(seg, /const leader = \(a\.general \|\| \(mine && mine\.name\) \|\| ''\)\.trim\(\);/);
  assert.match(seg, /if \(leader\) q\.set\('a', leader\);/);
});

test('R212 ③：隨軍武將名單透傳（officers 用逗號連接）', () => {
  const seg = arrivalBlock();
  assert.match(seg, /const offs = \(Array\.isArray\(a\.officers\) \? a\.officers : \[\]\)\.filter\(Boolean\);/);
  assert.match(seg, /if \(offs\.length\) q\.set\('officers', offs\.join\(','\)\);/);
});

test('R212 ④：敵軍兵力/等級仍以兵團兵數為基數算', () => {
  const seg = arrivalBlock();
  assert.match(seg, /const enemy = enemySetup\(a\.to, a\.troops\);/);
});

test('R212 ⑤：deploy 側讀這四個參數（契約雙向）', () => {
  const deploy = readFileSync(new URL('../web/deploy.html', import.meta.url), 'utf8');
  assert.match(deploy, /const ARMY_QUERY = Math\.max\(0, Math\.trunc\(Number\(qs\.get\('troops'\)\) \|\| 0\)\);/);
  assert.match(deploy, /const MARCH_MODE = \(ARMY_QUERY > 0 \|\| MARCH_ARMY\) \? 'army' : 'city';/);
  assert.match(deploy, /MF\.parseOfficerList\(qs\.get\('officers'\)\)/);
  // army 模式不能再扣城兵（扣兵只在 city 模式的 confirm 分支）
  assert.match(deploy, /(?:let|const) MARCH_POOL = MARCH_MODE === 'army' \? ARMY_TROOPS : CITY_STATE\.pool;/);
});
