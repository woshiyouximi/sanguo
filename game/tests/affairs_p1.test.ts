// @ts-nocheck
// 理由：本測試直接驅動 web/saves.js、web/city_model.js、web/era.js（瀏覽器端 JS，無 .ts 型別來源），
// 再加 campaign.html / city.html 的內聯 module 源碼掃描；斷言全在執行期由 node:test 驗。
/**
 * affairs_p1.test.ts — 內政／大地圖 P1 批次（F4/F5/F7/F10/F16/F19/F28）
 *
 * 差異清單：`F:\sanguo\work\flow_audit\内政大地图_差异.md`
 *   行 57  F4  內政終了 = 結束本年窗口 → 大地圖跑一年（advanceMonth(12)），保留 ?adv=1 單月調試
 *   行 58  F5  save.startYear 入檔，顯示 startYear + yearOf - 1；yearOf 只做年內換算；舊檔 184 兜底
 *   行 88  F7  內政指令按原作 7 項（指南 L96-105）；移動併入兵團、情報降二級（仍可用、不占令）
 *   行 91  F10 自治每城加一次 search；只有 kind==='talent' 才出日誌（指南 L103-104）
 *   行 125 F16 錢的口徑統一：國庫 = Σ 每城 money；花錢落當前城；save.gold 只做遷移相容
 *   行 156 F19 CITY_OFFICER_CAP（原作 10，[待證]）+ N/10；劇本超編城載入標紅不裁切
 *   行 229 F28 城上畫小旗（旗形 FLAGS、旗色勢力色）；色板扩到 ≥28 家固定（禁哈希）
 *
 * 跑法：cd F:\sanguo\game && node --test tests/affairs_p1.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Saves from '../web/saves.js';
import * as M from '../web/city_model.js';
import * as era from '../web/era.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const readWeb = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const S0 = SCEN[0];

const CAMPAIGN = readWeb('campaign.html');
const CITY = readWeb('city.html');

const ctx = (extra = {}) => ({ generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES, ...extra });
const cdef = (name, sc = S0) => sc.cities.find((c) => c.NAME === name);

function fresh(sc = S0) {
  const save = Saves.newCampaign(sc);
  M.ensureExtras(save);
  for (const c of sc.cities) M.ensureCityState(save, c);
  return save;
}

/** 取某個頂層函式的 body（到下一行首 `function` 為止；repo 既有測試同款） */
function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `原始碼應有 function ${name}(`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end >= 0 ? rest.slice(0, end) : rest;
}

/** 只留非 ONLYONE，避免把池子抽空後影響分布 */
const REPEATABLE = ITEMS.filter((it) => String(it.Attrib || '') !== 'ONLYONE');

/* ======================================================================
 * F4 內政終了 → 結束本年窗口並跑完一年
 * ==================================================================== */
test('F4 內政終了：只把 T 重設 3600（原作 0x41BBF5），不跑月份模擬', () => {
  const body = fnBody(CAMPAIGN, 'endMonth');
  assert.doesNotMatch(body, /advanceMonth\(/, '內政終了不得跑月份模擬（原作 0x41BBF5 只重設 T）');
  assert.match(body, /clockT = CLOCK_TICKS_PER_YEAR;/, '要重設 T=3600');
  assert.match(body, /clockAcc = 0;/, '要清 clockAcc');
  assert.match(body, /內 政 終 了/, '要有「內政終了」這筆日誌');
  assert.match(body, /時間正在流動/, '時間流動中按它只提示（對齊 Cocos doAction）');
});

test('F4 保留單月調試路徑：?adv=N 仍走 advanceMonth(N)，主玩法改逐幀時鐘', () => {
  assert.match(CAMPAIGN, /const bootAdv = Number\(qs\.get\('adv'\) \|\| 0\);/);
  assert.match(CAMPAIGN, /if \(bootAdv > 0 && gameStarted\) advanceMonth\(bootAdv\);/);
  // 大地圖時間：requestAnimationFrame 裡按 60Hz 固定步長 T−1
  assert.match(CAMPAIGN, /requestAnimationFrame\(clockFrame\);/, '要有逐幀時鐘');
  assert.match(CAMPAIGN, /clockAcc \+= Math\.min\(dt, 0\.25\);/, '固定步長累加器');
  assert.match(CAMPAIGN, /clockT = Math\.max\(0, clockT - n\);/, '每 tick T−1');
  // 批量與行軍的閘門：n>1 → batch（整年就地在结算，不逐月跳守城页）
  const body = fnBody(CAMPAIGN, 'advanceMonth');
  assert.match(body, /const batch = n > 1 \|\| fast;/, '批量闸门');
  assert.match(body, /const marchMode = MARCH_ON && !fast;/, '行軍模式只看 ?auto=1，不看批量');
  assert.match(body, /if \(!clockMode\) syncClockTFromMonth\(\);/, '手動推月後鐘要對齊月份');
});

test('F4 年推進的月份算術：12 個月正好回到次年 1 月（Saves 年內換算）', () => {
  const start = 1;
  const after = start + 12;
  assert.equal(Saves.monthOfYear(after), 1, '12 個月後必須是 1 月');
  assert.equal(Saves.yearOf(after), 2, '年序 +1');
  assert.equal(Saves.isYearStart(after), true);
});

/* ======================================================================
 * F5 劇本起始年入檔
 * ==================================================================== */
test('F5 startYearFrom：5 個劇本各自取 YEAR（184/189/200/208/219）', () => {
  assert.deepEqual(SCEN.map((sc) => Saves.startYearFrom(sc)), [184, 189, 200, 208, 219]);
  assert.equal(Saves.startYearFrom(null), Saves.START_YEAR_FALLBACK, '缺劇本 → 184 兜底');
  assert.equal(Saves.startYearFrom({ year: 99999 }), Saves.START_YEAR_FALLBACK, '離譜年份不採信');
});

test('F5 newCampaign 把 startYear 寫進檔；舊檔/缺欄位按 184 兜底', () => {
  for (let i = 0; i < SCEN.length; i += 1) {
    const save = Saves.newCampaign(SCEN[i]);
    assert.equal(save.startYear, Number(SCEN[i].system.YEAR), `劇本${i + 1} 起始年`);
  }
  assert.equal(Saves.startYearOf({}), 184);
  assert.equal(Saves.startYearOf({ startYear: 0 }), 184, '0 不是合法年份');
  assert.equal(Saves.startYearOf({ startYear: 189 }), 189);
  // yearOf 只做年內換算，沒有被起始年污染（差異行 58 明令「只做年內換算」）
  assert.equal(Saves.yearOf(1), 1);
  assert.equal(Saves.yearOf(13), 2);
  assert.equal(Saves.yearOf(303), 26);
});

test('F5 顯示層：era anchor = 起始年 ⇒ 西元 startYear + yearOf - 1', () => {
  const old = era.getAnchor();
  try {
    era.setAnchor(189);
    assert.equal(era.eraTextOfMonth(1), '西元 189年 1月');
    assert.equal(era.eraTextOfMonth(12), '西元 189年 12月');
    assert.equal(era.eraTextOfMonth(13), '西元 190年 1月');
    era.setAnchor(219);
    assert.equal(era.yearFieldOfMonth(1), '219年');
    assert.equal(era.eraTextOfMonth(303), '西元 244年 3月');   // 219 + 26 - 1
    assert.equal(era.yearOfMonth(303), 26, 'era 的年序仍是純年內換算');
  } finally {
    era.resetAnchor();
  }
  assert.equal(era.getAnchor(), old);
  assert.equal(era.eraTextOfMonth(1), '西元 184年 1月', 'reset 後回到預設 184');
});

test('F5 兩個頁面都在 boot 用存檔自己的起始年設錨，且頂欄年月走 era', () => {
  assert.match(CAMPAIGN, /Era\.setAnchor\(Saves\.startYearOf\(save\)\);/, 'campaign boot 設錨');
  const anchors = (CAMPAIGN.match(/Era\.setAnchor\(Saves\.startYearOf\(save\)\);/g) || []).length;
  assert.ok(anchors >= 3, `boot / 讀檔 / 新局三個入口都要設錨（實測 ${anchors}）`);
  assert.match(CITY, /era\.setAnchor\(Saves\.startYearOf\(save\)\);/, 'city 頁也要設錨');
  assert.match(CAMPAIGN, /\$\('ym'\)\.textContent = Era\.eraTextOfMonth\(save\.month\);/);
  assert.match(CITY, /era\.eraTextOfMonth\(save\.month\)/);
});

/* ======================================================================
 * F7 內政指令集 = 原作 7 項
 * ==================================================================== */
test('F7 CMD_ORDER 恰好 7 條且順序同原作（指南 L96-105）', () => {
  assert.deepEqual(M.CMD_ORDER, ['搜索', '開發', '徵兵', '任命', '武將資料', '自治', '出征']);
  assert.deepEqual(M.CMD_SECONDARY, ['情報', '移動'], '情報降二級、移動併入兵團');
  assert.deepEqual(M.CMD_EXTRA, [], '自治已進主表，不再有額外鍵');
});

test('F7 CMD_META：9 條都有說明，主表 7 條不再有物品/情報', () => {
  for (const cmd of [...M.CMD_ORDER, ...M.CMD_SECONDARY]) {
    assert.ok(M.CMD_META[cmd], `缺 ${cmd} 的說明`);
  }
  assert.ok(M.CMD_META['武將資料'], '武將資料要含使用物品');
  assert.ok(!('物品' in M.CMD_META), '物品已併入武將資料');
  assert.ok(!M.CMD_ORDER.includes('情報') && !M.CMD_ORDER.includes('移動'));
});

test('F7 city.html：主區 7 鍵 + 副區 2 鍵，武將資料含「使用物品」入口', () => {
  assert.match(CITY, /M\.CMD_ORDER/, '主區照 CMD_ORDER 生成');
  assert.match(CITY, /M\.CMD_SECONDARY/, '副區照 CMD_SECONDARY 生成');
  assert.match(CITY, /id="subgrid"/, '副令區塊');
  assert.match(CITY, /function openGeneralData\(/, '武將資料面板');
  assert.match(CITY, /武將資料 · 數值與裝備|武將資料/, '面板標題');
  assert.match(CITY, /使用物品/, '面板內要有使用物品按鈕（原作「武將資料·使用物品」）');
  // 物品不再一路直跳 items.html：先進武將資料，再從那裡去使用物品
  assert.match(fnBody(CITY, 'onCmd'), /cmd === '武將資料'/, 'onCmd 要認武將資料');
  assert.match(fnBody(CITY, 'openGeneralData'), /M\.itemsUrl\(/, '使用物品才去 items.html');
});

test('F7 內政鍵文案改「七命令」；情報仍可用（副令、只讀、不占令）', () => {
  assert.match(CAMPAIGN, /正月 · 內政七命令/);
  assert.ok(!CAMPAIGN.includes('正月 · 內政八命令'), '舊的八命令文案應已改掉');
  assert.match(CITY, /副令 · 本城\/鄰城（只讀）/, '情報副標要寫明只讀');
  assert.match(fnBody(CITY, 'openIntel'), /body\.__noOk = true;/, '情報面板只讀');
  assert.match(fnBody(CITY, 'openIntel'), /afterCommand\(false\)/, '情報不占令');
});

/* ======================================================================
 * F10 自治：每城一次搜索、只報人才
 * ==================================================================== */
test('F10 runAutonomy 每城擲一次搜索（searchSeq +1），但不代行展示寶物', () => {
  const save = fresh();
  M.setAuto(save, '襄平', true);
  M.setAuto(save, '代縣', true);
  const before = { 襄平: M.searchCount(save, '襄平'), 代縣: M.searchCount(save, '代縣') };
  M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
  assert.equal(M.searchCount(save, '襄平'), before['襄平'] + 1, '自治城要擲一次搜索');
  assert.equal(M.searchCount(save, '代縣'), before['代縣'], '當前城不代行自己');
  const logs = M.recentLog(save, 40, '襄平').filter((e) => e.cmd === '自治');
  assert.ok(logs.every((e) => !/找到物品|寶物|獲得/.test(e.text)), '寶物/空手不留痕（指南 L103-104）');
});

test('F10 只有搜到人才補一條自治日誌（kind=talent）', () => {
  const save = fresh();
  M.setAuto(save, '襄平', true);
  let talent = 0;
  // 每次 runAutonomy 都會推進 searchSeq ⇒ 種子不同；20 個月足夠撞到人才（單次約 1/2）
  for (let i = 0; i < 20; i += 1) {
    save.month = Number(save.month) + 1;
    M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
    const hits = M.recentLog(save, 60, '襄平').filter((e) => e.cmd === '自治' && e.kind === 'talent');
    talent = Math.max(talent, hits.length);
  }
  assert.ok(talent >= 1, '20 次代行至少該搜到過一次人才');
  const logs = M.recentLog(save, 60, '襄平').filter((e) => e.cmd === '自治');
  for (const e of logs) {
    if (e.kind === 'talent') assert.match(e.text, /^自治搜索：.+加入我方。/, '人才日誌格式');
    else assert.match(e.text, /^襄平城自治：開墾 \+\d+ 人口、\+\d+ 防禦。$/, '其餘只能是開墾那條');
  }
});

test('F10 自治搜索免費：金 0 也照樣代行（與 R10 的「自治不扣金」一致）', () => {
  const save = fresh();
  save.gold = 0;
  save.goldMigrated = true;
  for (const c of S0.cities) if (save.cities[c.NAME]) save.cities[c.NAME].money = 0;
  M.setAuto(save, '襄平', true);
  const r = M.runAutonomy(save, S0.cities, ctx(), { from: '代縣' });
  assert.equal(r.ok, true, '金 0 也要能代行');
  assert.equal(r.ran.length, 1);
  assert.equal(save.gold, 0);
});

/* ======================================================================
 * F16 錢的口徑：國庫 = Σ 每城 money
 * ==================================================================== */
test('F16 migrateGold：舊單錢包只併一次，之後國庫只看每城 money', () => {
  const save = { gold: 1000, month: 1, owned: ['襄平', '代縣'], cities: { 襄平: {}, 代縣: {} } };
  const r = M.migrateGold(save, S0.cities);
  assert.equal(r.moved, 1000);
  assert.equal(r.to, '襄平', '併進我方首城');
  assert.equal(save.gold, 0, '遷移後舊錢包歸 0');
  assert.equal(save.goldMigrated, true);
  assert.equal(save.cities['襄平'].money, Number(cdef('襄平').MONEY) + 1000, '首城 = 劇本 MONEY + 舊錢包');
  const again = M.migrateGold(save, S0.cities);
  assert.equal(again.moved, 0, '第二次不再搬（不重複計錢）');
  // 沒被實體化的城按劇本 MONEY 起算（國庫口徑一致，不會突然變 0）
  const expect = save.cities['襄平'].money + Number(cdef('代縣').MONEY);
  assert.equal(M.nationalGold(save, S0.cities), expect);
});

test('F16 未遷移的舊檔：cityMoneyOf 讀同一口 save.gold（不是第二套錢包）', () => {
  const save = { gold: 777, month: 1, owned: ['襄平'], cities: { 襄平: { money: 5 } } };
  assert.equal(M.cityMoneyOf(save, cdef('襄平')), 777, '遷移前以舊錢包為權威');
  assert.equal(M.nationalGold(save, S0.cities), 777);
  assert.equal(M.spendCityMoney(save, cdef('襄平'), 277), true);
  assert.equal(save.gold, 500, '扣的就是那唯一一筆');
  assert.equal(save.cities['襄平'].money, 5, '不會雙扣到城 money');
});

test('F16 遷移後：花錢只落當前城，別城與 save.gold 都不動', () => {
  const save = fresh();
  M.migrateGold(save, S0.cities);          // 新局每城已有 money ⇒ 舊錢包直接作廢
  const owned = save.owned.slice(0, 2);
  assert.equal(owned.length, 2, '新局至少兩座城');
  const [aName, bName] = owned;
  const a = cdef(aName);
  for (const n of save.owned) save.cities[n].money = 0;
  save.cities[aName].money = 5000;
  save.cities[bName].money = 3000;
  assert.equal(M.nationalGold(save, S0.cities), 8000);
  assert.equal(M.spendCityMoney(save, a, 200), true);
  assert.equal(save.cities[aName].money, 4800);
  assert.equal(save.cities[bName].money, 3000, '別城的錢不能被扣');
  assert.equal(save.gold, 0, 'save.gold 不再是錢包');
  assert.equal(M.spendCityMoney(save, a, 999999), false, '不夠就拒絕');
  assert.equal(save.cities[aName].money, 4800, '拒絕時不能動餘額');
});

test('F16 搜索扣當前城 money：本城 -200、國庫同步、舊錢包不動', () => {
  const save = fresh();
  M.migrateGold(save, S0.cities);
  save.cities['襄平'].money = 1000;
  save.cities['代縣'].money = 1000;
  const sum0 = M.nationalGold(save, S0.cities);
  const r = M.search(save, cdef('襄平'), ctx({ items: REPEATABLE }));
  assert.equal(r.ok, true);
  assert.equal(save.cities['襄平'].money, 800);
  assert.equal(save.cities['代縣'].money, 1000);
  assert.equal(save.gold, 0);
  assert.equal(M.nationalGold(save, S0.cities), sum0 - M.SEARCH.COST);
});

test('F16 源碼：歲入不再寫 save.gold；頂欄/軍情/內政欄都讀國庫；兩條金標籤寫明口徑', () => {
  // 只看程式行（註解可以提到舊碼，不能真的再扣一次）
  const codeLines = fnBody(CAMPAIGN, 'advanceMonth')
    .split(/\r?\n/)
    .filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln));
  assert.ok(!codeLines.some((ln) => /save\.gold\s*\+=/.test(ln)), '歲入不得再寫舊錢包（差異行 125）');
  assert.match(CAMPAIGN, /\$\('gold'\)\.textContent = CM\.nationalGold\(/, '頂欄讀國庫');
  assert.match(CAMPAIGN, /CM\.nationalGold\(save, scenario\?\.cities \|\| ALL\)/, '軍情/提示同口徑');
  assert.match(CAMPAIGN, /本城金/, '列表行與城市卡要標「本城金」');
  assert.match(CAMPAIGN, /國庫/, '提示要能對照國庫');
  assert.match(CITY, /本城金/, 'city.html 的 HUD chip 標明本城金');
  assert.match(CITY, /國庫/, 'city.html 的內政欄標明國庫');
  assert.match(CITY, /\$\('vGold'\)\.textContent = st \? fmt\(st\.money\)/, 'HUD 讀本城 money');
});

/* ======================================================================
 * F19 武將數上限
 * ==================================================================== */
test('F19 CITY_OFFICER_CAP = 10（原作 [待證]）+ N/10 狀態', () => {
  assert.equal(M.CITY_OFFICER_CAP, 10);
  assert.deepEqual(M.officerCapState(9), { n: 9, cap: 10, over: false });
  assert.deepEqual(M.officerCapState(10), { n: 10, cap: 10, over: false });
  assert.deepEqual(M.officerCapState(11), { n: 11, cap: 10, over: true });
});

test('F19 劇本超編城照原樣載入（不裁切），只標 over', () => {
  // 實測：劇本 3 的西涼在 generals.json 口徑下有 18 名 → 遠超上限，仍要完整保留
  let worst = { n: 0, city: '', sc: -1 };
  SCEN.forEach((sc, i) => {
    const save = fresh(sc);
    for (const c of sc.cities) {
      const n = M.rosterOf(save, c.NAME, { generals: GENS, scenIdx: i }).length;
      if (n > worst.n) worst = { n, city: c.NAME, sc: i };
    }
  });
  assert.ok(worst.n > M.CITY_OFFICER_CAP, `劇本本身有超編城（實測 ${worst.city} ${worst.n} 人 @劇本${worst.sc + 1}）`);
  const save = fresh(SCEN[worst.sc]);
  const roster = M.rosterOf(save, worst.city, { generals: GENS, scenIdx: worst.sc });
  assert.equal(roster.length, worst.n, '載入不得裁切');
  assert.equal(M.officerCapState(roster.length).over, true, '超編要能標紅');
});

test('F19 兩個頁面都顯示 N/CAP，且超編有紅色標記（不是硬編碼 /10）', () => {
  assert.match(CAMPAIGN, /CM\.officerCapState\(/, 'campaign 城市卡用 cap');
  assert.match(CAMPAIGN, /超編/, '超編要標字');
  assert.match(CAMPAIGN, /E2554B/, '超編用紅字');
  assert.ok(!/gens\.length\} \/ 10/.test(CAMPAIGN), '不能再有硬編碼 / 10');
  assert.match(CITY, /cap\.n\} \/ \$\{cap\.cap\}/, 'city.html 顯示 N / CAP');
  assert.match(CITY, /classList\.toggle\('hot', cap\.over\)/, '超編標紅');
});

/* ======================================================================
 * F28 城旗 + 固定色板
 * ==================================================================== */
test('F28 色板 ≥28 家固定：劇本裡每一家都落固定表，不靠哈希', () => {
  const PAL = Saves.FORCE_PALETTE.length;
  assert.ok(PAL >= 28, `差異行 229 要求 ≥28 家，實測 ${PAL}`);
  const forces = new Set();
  for (const sc of SCEN) {
    for (const c of sc.cities) if (typeof c.KING === 'string' && c.KING) forces.add(c.KING.trim());
  }
  assert.equal(forces.size, 29, '5 個劇本的勢力并集');
  for (const f of forces) {
    assert.ok(Saves.forceColorIndex(f) < PAL, `${f} 必須在固定色板內（不得走哈希）`);
  }
  assert.equal(new Set([...forces].map((f) => Saves.forceColorOf(f))).size, forces.size, '29 家 29 色');
});

test('F28 色值彼此差距夠大（不撞色）：29 色兩兩 RGB 曼哈頓距離 ≥ 40', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const list = Saves.FORCE_PALETTE.map((e) => ({ force: e.force, v: rgb(e.color) }));
  let worst = { d: Infinity, pair: '' };
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const d = list[i].v.reduce((s, x, k) => s + Math.abs(x - list[j].v[k]), 0);
      if (d < worst.d) worst = { d, pair: `${list[i].force}/${list[j].force}` };
    }
  }
  assert.ok(worst.d >= 40, `最接近的一對 ${worst.pair} 距離只有 ${worst.d}`);
});

test('F28 大地圖城上插旗：旗形取 FLAGS、旗色取勢力色，空城不插', () => {
  const body = fnBody(CAMPAIGN, 'drawMap');
  assert.match(CAMPAIGN, /const cityFlag = \(x, y, color, flags\) =>/, '要有 drawMap 內的插旗函式');
  assert.match(CAMPAIGN, /const pennant = Number\(flags\) === 2;/, '旗形依劇本 FLAGS（2=關=三角旗）');
  assert.match(CAMPAIGN, /cityFlag\(sx - \(ready \? 25 : 18\), sy, color, c\.FLAGS\)/, '旗色吃勢力色、位置在城左');
  assert.match(body, /if \(force\) cityFlag\(/, '空城（無勢力）不插旗');
  // 劇本資料旗標只有 2/4
  const flags = new Set();
  for (const sc of SCEN) for (const c of sc.cities) flags.add(Number(c.FLAGS));
  assert.deepEqual([...flags].sort((a, b) => a - b), [2, 4]);
});

test('F28 圖例明說「小旗＝勢力」與固定色板家數', () => {
  assert.match(CAMPAIGN, /小旗＝勢力/);
  assert.match(CAMPAIGN, /固定 29 家色板/);
});
