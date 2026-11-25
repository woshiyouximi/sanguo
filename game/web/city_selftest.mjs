/**
 * city_selftest.mjs — 城池內政八命令自測（純 Node，不需要瀏覽器）
 *
 * 跑法：  cd game/web && node city_selftest.mjs
 * 覆蓋：8 條命令各 ≥2 條斷言 ＋ 存檔兼容 3 條 ＋ 八命令齊備 2 條。
 * 只用 game/data/*.json 與 saves.js / city_model.js，不碰 DOM。
 */
import { readFileSync } from 'node:fs';
import * as Saves from './saves.js';
import * as M from './city_model.js';

/* ---------- 迷你斷言框架 ---------- */
let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); } else { fails.push(label); console.log(`  ✗ ${label}`); }
}
function group(title) { console.log(`\n[${title}]`); }
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/* ---------- 資料 ---------- */
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const HTML = readFileSync(new URL('./city.html', import.meta.url), 'utf8');
const S0 = SCEN[0];
const ctx = { generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES };
const cdef = (n) => S0.cities.find((c) => c.NAME === n);
const clone = (v) => JSON.parse(JSON.stringify(v));

function fresh() {
  const save = Saves.newCampaign(S0);
  M.ensureExtras(save);
  for (const c of S0.cities) M.ensureCityState(save, c);
  return save;
}
const st = (save, city) => save.cities[city];

/* ======================================================================
 * 0. 八條命令齊備
 * ==================================================================== */
group('八條命令');
const WANT = ['開發', '徵兵', '搜索', '移動', '任命', '物品', '情報', '出征'];
ok(WANT.every((c) => M.CMD_ORDER.includes(c)) && M.CMD_ORDER.length === 8,
  `CMD_ORDER 恰為 8 條（${M.CMD_ORDER.join('、')}）`);
ok(WANT.every((c) => HTML.includes(`>${c}<`) || HTML.includes(`'${c}'`)),
  'city.html 真的渲染/處理了這 8 條命令');

/* ======================================================================
 * 1. 開發（依據：docs/04c §2.3 0x427A84「人口增加%d人 / 防禦力增加%d。」）
 * ==================================================================== */
group('開發');
{
  const save = fresh();
  const before = { ...st(save, '代縣') };
  const gold0 = save.gold;
  const r = M.develop(save, cdef('代縣'), ctx);
  const after = st(save, '代縣');
  ok(r.ok && save.gold === gold0 && after.pop > before.pop && after.def > before.def,
    `開發不耗金（原作 0x427B9E 不動 +0x92），人口 +${after.pop - before.pop}、防禦 +${after.def - before.def}（同一次開發兩者都加）`);
  const poor = fresh();
  poor.gold = 0; // R85：開發 0 金，沒錢也照做
  const snap = JSON.stringify(st(poor, '代縣'));
  const r2 = M.develop(poor, cdef('代縣'), ctx);
  ok(r2.ok && JSON.stringify(st(poor, '代縣')) !== snap,
    '金 0 也能開發（原作免費），且城池狀態有變');
}

/* ======================================================================
 * 2. 徵兵（依據：docs/04c §2.3 面板「總兵數 %d」；上限 §2.2 +0x82）
 * ==================================================================== */
group('徵兵');
{
  const save = fresh();
  const before = { ...st(save, '代縣') };
  const r = M.recruit(save, cdef('代縣'), ctx);
  const cap = M.RECRUIT.CAP;
  ok(r.ok && st(save, '代縣').troops > before.troops && st(save, '代縣').troops <= cap
    && save.gold === 1200 - M.RECRUIT.COST,
    `花 ${M.RECRUIT.COST} 金，兵 ${before.troops}→${st(save, '代縣').troops}（部隊兵上限 ${cap}）`);
  const full = fresh();
  const cap2 = M.RECRUIT.CAP;
  st(full, '代縣').troops = cap2;
  const r2 = M.recruit(full, cdef('代縣'), ctx);
  ok(!r2.ok && r2.reason === 'full' && st(full, '代縣').troops === cap2,
    '兵已達 600 上限時拒絕且不扣金');
}

/* ======================================================================
 * 3. 搜索（依據：docs/04c §2.3 0x426F81「找到物品%s」/ 0x427009「%s將軍加入我方」）
 * ==================================================================== */
group('搜索');
{
  const a = fresh();
  const b = fresh();
  const ra = M.search(a, cdef('代縣'), ctx);
  const rb = M.search(b, cdef('代縣'), ctx);
  ok(ra.ok && ra.kind === rb.kind && ra.text === rb.text && ra.seed === rb.seed,
    `同城同月同次數 → 同結果（${ra.text}，seed=${ra.seed}，可復現）`);

  const c = fresh();
  const n0 = M.searchCount(c, '代縣');
  M.search(c, cdef('代縣'), ctx);
  M.search(c, cdef('代縣'), ctx);
  const logs = c.searchLog.filter((e) => e.city === '代縣' && e.cmd === '搜索');
  ok(M.searchCount(c, '代縣') === n0 + 2 && logs.length === 2 && c.gold === 1200 - 2 * M.SEARCH.COST,
    '每次搜索都自己記一條日誌（count 遞增 → 種子會變）、金逐次扣');

  const t = fresh();
  t.gold = 400000;
  let got = null;
  for (let i = 0; i < 300 && !got; i += 1) {
    const r = M.search(t, cdef('襄平'), ctx);
    if (r.kind === 'talent') got = r;
  }
  ok(!!got && (t.roster['襄平'] || []).includes(got.general.NAME)
    && M.rosterOf(t, '襄平', ctx).some((g) => g.NAME === got.general.NAME),
    `搜到在野武將真的進池：${got ? got.text : '（300 次內沒抽到人才）'} → roster[襄平]=${JSON.stringify(t.roster['襄平'] || [])}`);

  const it = M.withBagItem(null, 1);
  ok(it.bag.includes(1) && it.bag.length === M.DEFAULT_BAG.length && M.withBagItem(it, 1).bag.length === it.bag.length,
    '寶物寫進 items.html 的背包（有預設底、重複不重加）');
}

/* ======================================================================
 * 4. 移動（依據：docs/04c §2.3 移動武將 / §5.2 可通行路徑）
 * ==================================================================== */
group('移動');
{
  const save = fresh();
  const t0 = st(save, '北平').troops;
  const t1 = st(save, '襄平').troops;
  const r = M.move(save, cdef('北平'), { to: '襄平', troops: 60 }, ctx);
  ok(r.ok && st(save, '北平').troops === t0 - 60 && st(save, '襄平').troops === t1 + 60,
    `北平→襄平（相鄰我方）成功：兵 ${t0}→${st(save, '北平').troops} / ${t1}→${st(save, '襄平').troops}`);

  const s2 = fresh();
  const bad = M.move(s2, cdef('代縣'), { to: '襄平', troops: 10 }, ctx);
  const bad2 = M.move(s2, cdef('代縣'), { to: '晉陽', troops: 10 }, ctx);
  ok(!bad.ok && bad.reason === 'not-adjacent' && !bad2.ok && bad2.reason === 'not-owned',
    '不相鄰 / 非我方城池都拒絕（代縣↛襄平、代縣↛晉陽）');

  const s3 = fresh();
  const g = M.move(s3, cdef('北平'), { to: '襄平', general: '公孫瓚' }, ctx);
  ok(g.ok && M.rosterOf(s3, '襄平', ctx).some((x) => x.NAME === '公孫瓚')
    && !M.rosterOf(s3, '北平', ctx).some((x) => x.NAME === '公孫瓚'),
    '調將：公孫瓚離開北平、出現在襄平名單');
}

/* ======================================================================
 * 5. 任命（依據：docs/04c §2.2 +0x14 太守 / +0x18 軍師）
 * ==================================================================== */
group('任命');
{
  const save = fresh();
  const eff0 = M.efficiencyOf(save, cdef('代縣'), ctx);
  const r = M.appoint(save, cdef('代縣'), 'major', '劉備', ctx);
  const eff1 = M.efficiencyOf(save, cdef('代縣'), ctx);
  ok(r.ok && M.majorOf(save, cdef('代縣')) === '劉備' && eff1 !== eff0,
    `太守 ${r.general ? r.general.NAME : ''} 生效：效率 ×${eff0.toFixed(3)} → ×${eff1.toFixed(3)}`);
  const before = JSON.stringify(save.appointed);
  const r2 = M.appoint(save, cdef('代縣'), 'wise', '不存在的人', ctx);
  ok(!r2.ok && r2.reason === 'absent' && JSON.stringify(save.appointed) === before,
    '任命不在本城的將 → 拒絕且不動存檔');
}

/* ======================================================================
 * 6. 物品（連結既有 items.html）
 * ==================================================================== */
group('物品');
{
  ok(M.itemsUrl('代縣') === './items.html?city=' + encodeURIComponent('代縣'),
    `物品連結帶城名：${M.itemsUrl('代縣')}`);
  const bagged = M.withBagItem(M.parseItemsSave({ equip: { 關羽: { weapon: 1 } }, bag: [3, 3, 4] }), 9);
  ok(bagged.bag.join(',') === '3,4,9' && bagged.equip['關羽'].weapon === 1,
    '背包去重且不弄壞既有裝備（{equip,bag} 形狀不變）');
}

/* ======================================================================
 * 7. 情報（只讀）
 * ==================================================================== */
group('情報');
{
  const save = fresh();
  const before = JSON.stringify(save);
  const info = M.intel(save, cdef('代縣'), ctx);
  ok(info.self && info.self.name === '代縣' && info.rows.length >= 1
    && info.rows.some((r) => r.name === '易京' && r.gate === true),
    `本城＋${info.rows.length} 座鄰城（含關卡易京 gate=true）`);
  ok(JSON.stringify(save) === before, '情報是只讀面板：整份存檔完全沒變');
}

/* ======================================================================
 * 8. 出征（跳 deploy.html?city=）
 * ==================================================================== */
group('出征');
{
  const save = fresh();
  const targets = M.deployTargets(save, cdef('代縣'), ctx).map((t) => t.name);
  ok(targets.length === 1 && targets[0] === '晉陽',
    `代縣可出征目標 = [${targets.join(', ')}]（關卡易京被排除、自家城不算）`);
  ok(M.deployUrl('晉陽') === './deploy.html?city=' + encodeURIComponent('晉陽'),
    `出征連結：${M.deployUrl('晉陽')}`);
}

/* ======================================================================
 * 9. 存檔兼容（老存檔 / 壞資料都不能炸）
 * ==================================================================== */
group('存檔兼容');
{
  const old = { seeded: true, scenario: 1, month: 3, gold: 900, owned: ['代縣'], cities: { 代縣: { troops: 100, pop: 100000, money: 500 } }, log: [] };
  let threw = '';
  try {
    M.ensureExtras(old);
    for (const c of S0.cities) M.ensureCityState(old, c);
  } catch (e) { threw = String(e && e.message); }
  ok(!threw && JSON.stringify(old.roster) === '{}' && JSON.stringify(old.appointed) === '{}'
    && Array.isArray(old.searchLog) && old.searchLog.length === 0,
    '老存檔沒有 roster/appointed/searchLog → 自動補空、不拋錯');
  ok(st(old, '代縣').def === Number(cdef('代縣').DEFENSE) && st(old, '代縣').troops === 100
    && st(old, '代縣').money === 500,
    `缺 def 的城補成劇本 DEFENSE=${cdef('代縣').DEFENSE}，既有 troops/money 不被覆蓋`);

  const junk = { roster: 'x', appointed: [], searchLog: 5, cities: 'oops', gold: NaN, owned: 'bad' };
  let threw2 = '';
  let after = null;
  try {
    M.ensureExtras(junk);
    M.ensureCityState(junk, cdef('代縣'));
    M.searchCount(junk, '代縣');
    after = junk;
  } catch (e) { threw2 = String(e && e.message); }
  ok(!threw2 && after && JSON.stringify(after.roster) === '{}' && Array.isArray(after.searchLog)
    && after.appointed && typeof after.appointed === 'object',
    '型別全錯的存檔也只是被歸零，不會丟例外（roster=字串、appointed=陣列、searchLog=5）');

  // 舊版單檔（sanguo_campaign_v1）→ 讀進本頁後八條命令照樣能跑
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  Saves.writeLegacy({ seeded: true, scenario: 1, month: 2, gold: 1500, owned: ['襄平', '北平'], cities: { 襄平: { troops: 200, pop: 79500, money: 2846 } }, ts: 1 }, storage);
  const back = Saves.readLegacy(storage);
  M.ensureExtras(back);
  const r = M.develop(back, cdef('襄平'), ctx);
  ok(!!back && r.ok && back.gold === 1500, 'sanguo_campaign_v1 舊單檔讀回後可直接開發（開發免費，金 1500 不變）');
}

/* ---------- 收尾 ---------- */
const total = pass + fails.length;
console.log(`\n${pass} 过 / ${fails.length} 敗（共 ${total} 條）`);
if (fails.length) {
  console.log('失敗項：');
  for (const f of fails) console.log(' - ' + f);
  process.exitCode = 1;
}
