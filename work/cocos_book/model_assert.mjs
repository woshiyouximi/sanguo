/**
 * 武將資料名冊 / 勢力圖 —— 純邏輯斷言（不碰 `cc`，不建節點）。
 *
 * 跑法：`cd F:\sanguo\work\cocos_book; node model_assert.mjs`
 * 前提：`_sim/` 已由 `tsc -p tsconfig.sim.json` 編好（CommonJS）。
 *
 * 七類（任務書 §四·2）：
 *   ① 401 將全可枚舉、欄位無 undefined
 *   ② 按勢力分組求和 = 401
 *   ③ 按城分組與 `save.owned` 一致
 *   ④ 技能過濾（`level ≤ 當前等級`）在 5 個樣本上正確（含 關羽）
 *   ⑤ 分頁 20/頁、總頁數正確
 *   ⑥ 勢力色板 14 家 + 玩家金環取值唯一性
 *   ⑦ 城數求和 = 60
 *
 * fixture 全部取自真實資料檔（generals 401 / garrison[0] / scenarios[0]），
 * 唯一人造的是 `save`：`{force:'張角', king:'張角'}`（張角在 garrison[0] 有 6 城 42 將，
 * 是唯一「城多到能壓住列表首屏」的勢力，適合當我方樣本），`owned` 也取他那 6 城。
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = 'F:/sanguo/game/cocos/assets/bundles/res/data';

const GB = require('./_sim/GeneralBook.js');
const MM = require('./_sim/MonarchModel.js');
const FP = require('./_sim/ForcesPanel.js');

/* ------------------------------------------------------------------ */
/* 斷言器                                                              */
/* ------------------------------------------------------------------ */
let total = 0;
let failures = 0;
const failed = [];

function ok(label, cond, actual) {
  total += 1;
  if (cond) return true;
  failures += 1;
  failed.push(label);
  console.log(`  FAIL  ${label}${actual === undefined ? '' : `  → ${JSON.stringify(actual)}`}`);
  return false;
}

function same(label, expected, actual) {
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  return ok(`${label}（期望 ${a}）`, a === b, actual);
}

function near(label, expected, actual, tol = 1e-6) {
  return ok(`${label}（期望 ${expected}）`, Math.abs(expected - actual) <= tol, actual);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/* ------------------------------------------------------------------ */
/* fixture                                                             */
/* ------------------------------------------------------------------ */
const readJson = (name) => JSON.parse(readFileSync(join(DATA, `${name}.json`), 'utf8'));
const generals = readJson('generals');
const magics = readJson('magics');
const wises = readJson('wises');
const garrison = readJson('garrison')[0];
const scenario = readJson('scenarios')[0];
const cities = scenario.cities;
const paths = scenario.paths;

const PLAYER = '張角';
const garrisonOwner = (city) => {
  const rec = garrison.cities[city];
  return rec && typeof rec.owner === 'string' ? rec.owner : '';
};
const officersByCity = {};
for (const city of cities) officersByCity[city.NAME] = garrison.cities[city.NAME]?.officers ?? [];

const playerCities = cities.filter((c) => garrisonOwner(c.NAME) === PLAYER).map((c) => c.NAME);
const save = { force: PLAYER, king: PLAYER, owned: playerCities.slice() };

const rows = GB.buildBook({ generals, magics, wises, save, officersByCity, ownerOf: garrisonOwner });
const rowOf = new Map(rows.map((r) => [r.name, r]));
const rawOf = new Map(generals.map((g) => [g.NAME, g]));

console.log(`fixture：generals ${generals.length} / cities ${cities.length} / paths ${paths.length} / 我方 ${PLAYER} ${playerCities.length} 城`);
console.log(`buildBook → ${rows.length} 行`);

/* ================================================================== */
/* ① 401 將全可枚舉、欄位無 undefined                                  */
/* ================================================================== */
section('① 401 將全可枚舉、欄位無 undefined');
same('① 名冊行數 = 401', 401, rows.length);
same('① 原始資料 401 條', 401, generals.length);
ok('① 每條原始資料都產出一行（無被 mergeRow 丟掉）', rows.length === generals.length);

const FIELDS = [
  'id', 'name', 'str', 'int', 'level', 'hp', 'mp', 'troopCap',
  'loyal', 'spirit', 'tire', 'status', 'statusText', 'city', 'force',
  'forceLabel', 'color', 'mine', 'face', 'faceNo', 'type', 'weapon',
  'horse', 'thing', 'skill', 'wise', 'loyalKing', 'constancy', 'sortKey',
];
for (const field of FIELDS) {
  const bad = rows.filter((r) => {
    const v = r[field];
    if (v === undefined || v === null) return true;
    if (typeof v === 'number' && !Number.isFinite(v)) return true;
    if (typeof v === 'string' && v.length === 0 && field !== 'city' && field !== 'force' && field !== 'face' && field !== 'weapon' && field !== 'horse' && field !== 'thing' && field !== 'loyalKing') return true;
    return false;
  });
  ok(`① 欄位 ${field} 無 undefined/NaN/空字串`, bad.length === 0, bad.slice(0, 3).map((r) => r.name));
}

same('① 名字唯一（無重複武將）', 401, new Set(rows.map((r) => r.name)).size);
same('① 每將都有必殺技（skill 非 null）', 401, rows.filter((r) => r.skill).length);
same('① 每將都有軍師技（wise 非 null）', 401, rows.filter((r) => r.wise).length);
ok('① 技能名全部由 magics.json 解出（不是 #id 兜底）', rows.every((r) => r.skill && !/^#/.test(r.skill.name)));
ok('① 軍師技名全部由 wises.json 解出', rows.every((r) => r.wise && !/^#/.test(r.wise.name)));
ok('① 等級全部落在 1..99', rows.every((r) => r.level >= 1 && r.level <= 99));
ok('① 武力/智力落在 0..999', rows.every((r) => r.str >= 0 && r.str <= 999 && r.int >= 0 && r.int <= 999));
ok('① 帶兵上限 > 0（troopCapOf）', rows.every((r) => r.troopCap > 0));
ok('① 狀態只會是 登/俘/野/未', rows.every((r) => ['登', '俘', '野', '未'].includes(r.status)));
ok('① statusText 與 status 對應', rows.every((r) => r.statusText === GB.BOOK_STATUS_TEXT[r.status]));
ok('① 排序鍵：我方（mine）全部排在最前', (() => {
  const firstOther = rows.findIndex((r) => !r.mine);
  if (firstOther < 0) return true;
  return rows.slice(firstOther).every((r) => !r.mine);
})());
same('① 我方 42 人（張角 6 城在職）', 42, rows.filter((r) => r.mine).length);
same('① 在職數 = 79（garrison 的「登」）', 79, rows.filter((r) => r.status === '登').length);
same('① 在野數 = 63（garrison 的「野」）', 63, rows.filter((r) => r.status === '野').length);
same('① 未登場數 = 259（CITY 為空）', 259, rows.filter((r) => r.status === '未').length);
same('① 俘虜數 = 0（本劇本無「俘」）', 0, rows.filter((r) => r.status === '俘').length);
same('① 有城的行數 = 142（garrison 有守將的城）', 142, rows.filter((r) => r.city).length);

const sum = GB.summarize(rows);
same('① summarize.total', 401, sum.total);
same('① summarize.employed', 79, sum.employed);
same('① summarize.wild', 63, sum.wild);
same('① summarize.absent', 259, sum.absent);
same('① summarize.mine', 42, sum.mine);
same('① summarize.forces = 14 家（garrison 的 owner 就這 14 家）', 14, sum.forces);
same('① summarize.cities = 34 座（有將的城）', 34, sum.cities);
ok('① summaryText 含人數與家數', GB.summaryText(sum).includes('401') && GB.summaryText(sum).includes('14'));

/* ================================================================== */
/* ② 按勢力分組求和 = 401                                              */
/* ================================================================== */
section('② 按勢力分組求和 = 401');
const byForce = GB.groupByForce(rows);
same('② 分組數 = 16（14 家 + 在野 + 未登場）', 16, byForce.length);
same('② 各組 count 求和 = 401', 401, byForce.reduce((n, g) => n + g.count, 0));
same('② 各組 rows 求和 = 401', 401, byForce.reduce((n, g) => n + g.rows.length, 0));
ok('② 每組 count 與 rows.length 一致', byForce.every((g) => g.count === g.rows.length));
ok('② 每組 key 非空', byForce.every((g) => typeof g.key === 'string' && g.key.length > 0));
same('② 分組鍵不重複', byForce.length, new Set(byForce.map((g) => g.key)).size);
same('② 我方（張角）排第一', PLAYER, byForce[0].key);
ok('② 第一組被標 mine', byForce[0].mine === true);
same('② 未登場（NO_CITY_KEY）一定排最後', GB.NO_CITY_KEY, byForce[byForce.length - 1].key);
same('② 未登場組 259 人', 259, byForce.find((g) => g.key === GB.NO_CITY_KEY).count);
same('② 在野組（WILD_KEY）22 人', 22, byForce.find((g) => g.key === GB.WILD_KEY).count);
same('② 張角 42 人', 42, byForce.find((g) => g.key === PLAYER).count);
same('② 何進 21 人（3 城）', 21, byForce.find((g) => g.key === '何進').count);
same('② 董卓 11 人', 11, byForce.find((g) => g.key === '董卓').count);
ok('② 只有我方那一組 mine=true', byForce.filter((g) => g.mine).length === 1);
ok('② 未登場組 label = 「未登場」', byForce.find((g) => g.key === GB.NO_CITY_KEY).label === GB.NO_CITY_LABEL);
ok('② 在野組 label = 「在野」', byForce.find((g) => g.key === GB.WILD_KEY).label === GB.WILD_LABEL);
ok('② 每組都有非空 label', byForce.every((g) => typeof g.label === 'string' && g.label.length > 0));
ok('② 在野組用中性色', byForce.find((g) => g.key === GB.WILD_KEY).color === MM.FORCE_COLOR_NEUTRAL);
ok('② 張角組用色板色', byForce.find((g) => g.key === PLAYER).color === MM.FORCE_COLOR_OFF_PALETTE || byForce.find((g) => g.key === PLAYER).color === MM.forceColorOf(PLAYER));

/* ================================================================== */
/* ③ 按城分組與 save.owned 一致                                        */
/* ================================================================== */
section('③ 按城分組與 save.owned 一致');
const byCity = GB.groupByCity(rows, save.owned);
same('③ 各組求和 = 401', 401, byCity.reduce((n, g) => n + g.count, 0));
same('③ 城組數 = 34 + 未登場 = 35', 35, byCity.length);
same('③ 未登場組 259 人', 259, byCity.find((g) => g.key === GB.NO_CITY_KEY).count);
const ownedSet = new Set(save.owned);
ok('③ 每組 mine ⟺ owned.includes(城)', byCity.every((g) => g.mine === (g.key !== GB.NO_CITY_KEY && ownedSet.has(g.key))), byCity.filter((g) => g.mine !== (g.key !== GB.NO_CITY_KEY && ownedSet.has(g.key))).map((g) => g.key));
same('③ 我方城組數 = 6（張角 6 城）', 6, byCity.filter((g) => g.mine).length);
same('③ save.owned 長度 = 6', 6, save.owned.length);
ok('③ 每個 owned 城都出現在城組裡', save.owned.every((city) => byCity.some((g) => g.key === city)));
ok('③ 城組的 key 都是真正的城名（或 NO_CITY_KEY）', byCity.every((g) => g.key === GB.NO_CITY_KEY || cities.some((c) => c.NAME === g.key)));
ok('③ 未登場組不是 mine', byCity.find((g) => g.key === GB.NO_CITY_KEY).mine === false);
ok('③ 未登場組排在最後', byCity[byCity.length - 1].key === GB.NO_CITY_KEY);
same('③ 城組平均人數 = 142/34 四捨五入不是必要，改成總和檢查', 142, byCity.filter((g) => g.key !== GB.NO_CITY_KEY).reduce((n, g) => n + g.count, 0));
ok('③ 每組 label 非空', byCity.every((g) => typeof g.label === 'string' && g.label.length > 0));
ok('③ 我方城組全部排在其他城組前面', (() => {
  const lastMine = byCity.map((g) => g.mine).lastIndexOf(true);
  const firstOther = byCity.findIndex((g, i) => !g.mine && g.key !== GB.NO_CITY_KEY);
  if (firstOther < 0) return true;
  return lastMine < firstOther;
})());
// 反向：owned 給空 → 一組都不是 mine
const byCityNoOwn = GB.groupByCity(rows, []);
ok('③ owned 傳空陣列時沒有任何 mine 組', byCityNoOwn.every((g) => g.mine === false));
same('③ owned 傳空不影響分組求和', 401, byCityNoOwn.reduce((n, g) => n + g.count, 0));

/* ================================================================== */
/* ④ 技能過濾（level ≤ 當前等級）5 樣本含關羽                          */
/* ================================================================== */
section('④ 技能過濾（level ≤ 當前等級）');
const SAMPLES = [
  { name: '關羽', skill: [40, 110], wise: [39, 54] },
  { name: '張飛', skill: [39, 104], wise: [24, 13] },
  { name: '呂布', skill: [39, 110], wise: [1, 9] },
  { name: '諸葛亮', skill: [40, 44], wise: [37, 67] },
  { name: '盜賊', skill: [8, 22], wise: [8, 8] },
];
for (const sample of SAMPLES) {
  const raw = rawOf.get(sample.name);
  ok(`④ 樣本 ${sample.name} 存在於 generals.json`, !!raw);
  same(`④ ${sample.name} 的 SKILL 解析出 1 對`, [[...sample.skill]], GB.parseSkillPairs(raw.SKILL));
  same(`④ ${sample.name} 的 WISESKILL 解析出 1 對`, [[...sample.wise]], GB.parseSkillPairs(raw.WISESKILL));
  // 解鎖邊界：剛好等於等級 → 解鎖；差 1 級 → 未解鎖
  const atSkill = GB.skillOf(raw.SKILL, sample.skill[0], magics);
  ok(`④ ${sample.name} 必殺技在等級 ${sample.skill[0]} 解鎖（level ≤ 當前等級）`, atSkill.unlocked === true);
  const belowSkill = GB.skillOf(raw.SKILL, sample.skill[0] - 1, magics);
  ok(`④ ${sample.name} 必殺技在等級 ${sample.skill[0] - 1} 未解鎖`, belowSkill.unlocked === false);
  const atWise = GB.skillOf(raw.WISESKILL, sample.wise[0], wises);
  ok(`④ ${sample.name} 軍師技在等級 ${sample.wise[0]} 解鎖`, atWise.unlocked === true);
  const belowWise = GB.skillOf(raw.WISESKILL, sample.wise[0] - 1, wises);
  ok(`④ ${sample.name} 軍師技在等級 ${sample.wise[0] - 1} 未解鎖`, belowWise.unlocked === false);
  ok(`④ ${sample.name} 技能 id 解出真名（不是 #id）`, !!atSkill.name && !/^#/.test(atSkill.name) && !!atWise.name && !/^#/.test(atWise.name));
}
same('④ 關羽必殺技名 = 鬼哭神號（magic 110）', '鬼哭神號', GB.skillOf(rawOf.get('關羽').SKILL, 40, magics).name);
same('④ 關羽軍師技名 = 十面埋伏（wise 54）', '十面埋伏', GB.skillOf(rawOf.get('關羽').WISESKILL, 39, wises).name);
same('④ 諸葛亮必殺技名 = 天地無用（magic 44）', '天地無用', GB.skillOf(rawOf.get('諸葛亮').SKILL, 40, magics).name);
same('④ 呂布軍師技名 = 快速集氣（wise 9）', '快速集氣', GB.skillOf(rawOf.get('呂布').WISESKILL, 1, wises).name);
// 名冊預設等級（無存檔 → 20 級）：關羽 40 級必殺技應為未解鎖
const rowGuan = rowOf.get('關羽');
same('④ 名冊裡關羽等級 = 20（新檔無 generalLevel）', 20, rowGuan.level);
ok('④ 20 級的關羽必殺技顯示未解鎖（level 40 > 20）', rowGuan.skill.unlocked === false);
ok('④ 20 級的關羽軍師技也未解鎖（level 39 > 20）', rowGuan.wise.unlocked === false);
// 存檔覆蓋：generalLevel 給 40 → 解鎖
const rows40 = GB.buildBook({ generals, magics, wises, save: { ...save, generalLevel: { 關羽: 40 } }, officersByCity, ownerOf: garrisonOwner });
const guan40 = rows40.find((r) => r.name === '關羽');
same('④ 存檔 generalLevel 覆蓋後關羽 40 級', 40, guan40.level);
ok('④ 40 級的關羽必殺技解鎖', guan40.skill.unlocked === true);
ok('④ 40 級的關羽軍師技仍解鎖（39 ≤ 40）', guan40.wise.unlocked === true);
// 20 級時全體解鎖數（報告要寫的兩個數）
const unlockedSkill20 = rows.filter((r) => r.skill.unlocked).length;
const unlockedWise20 = rows.filter((r) => r.wise.unlocked).length;
same('④ 新檔 20 級：必殺技只 4 人解鎖（級別 8 的 1 人 + 20 的 3 人）', 4, unlockedSkill20);
same('④ 新檔 20 級：軍師技 103 人解鎖（級別 1 的 102 + 8 的 1）', 103, unlockedWise20);
ok('④ skillLine 未解鎖時帶等級標註', /Lv\s?40/.test(GB.skillLine(rowGuan.skill, '必殺技')), GB.skillLine(rowGuan.skill, '必殺技'));
ok('④ skillLine 解鎖時不帶等級', !/Lv/.test(GB.skillLine(guan40.skill, '必殺技')), GB.skillLine(guan40.skill, '必殺技'));
ok('④ 舊式「級別,技id」字串以外的輸入安全回空', GB.parseSkillPairs('').length === 0 && GB.parseSkillPairs(null).length === 0 && GB.parseSkillPairs('abc').length === 0);
ok('④ 技能表缺資料時回 #id 兜底而不是崩', GB.skillOf('40, 110', 40, null).name === '#110');

/* ================================================================== */
/* ⑤ 分頁 20/頁、總頁數                                                */
/* ================================================================== */
section('⑤ 分頁 20/頁');
const pages = GB.paginateBook(rows);
same('⑤ 401 人 → 21 頁', 21, pages.length);
same('⑤ pageCountOf(401) = 21', 21, GB.pageCountOf(401));
same('⑤ 第 1 頁 20 行', 20, pages[0].length);
same('⑤ 第 20 頁 20 行', 20, pages[19].length);
same('⑤ 第 21 頁（末頁）1 行', 1, pages[20].length);
same('⑤ 20 頁前總行數 = 400', 400, pages.slice(0, 20).reduce((n, p) => n + p.length, 0));
same('⑤ 全頁行數求和 = 401', 401, pages.reduce((n, p) => n + p.length, 0));
ok('⑤ 每頁不超過 20 行', pages.every((p) => p.length <= 20));
ok('⑤ 第 1 頁第 1 行 = 全表第 1 行', pages[0][0].name === rows[0].name);
ok('⑤ 第 2 頁第 1 行 = 全表第 21 行', pages[1][0].name === rows[20].name);
ok('⑤ 末頁第 1 行 = 全表第 401 行', pages[20][0].name === rows[400].name);
same('⑤ 空表也給 1 頁（面板永遠有頁可畫）', 1, GB.paginateBook([]).length);
same('⑤ pageCountOf(0) = 1', 1, GB.pageCountOf(0));
same('⑤ pageCountOf(20) = 1', 1, GB.pageCountOf(20));
same('⑤ pageCountOf(21) = 2', 2, GB.pageCountOf(21));
same('⑤ 自訂每頁 50 → 9 頁', 9, GB.paginateBook(rows, 50).length);
same('⑤ pageCountOf(401, 50) = 9', 9, GB.pageCountOf(401, 50));

/* ================================================================== */
/* ⑥ 勢力色板 14 家 + 玩家金環取值唯一性                                */
/* ================================================================== */
section('⑥ 勢力色板 + 玩家金環');
same('⑥ FORCE_PALETTE 14 家', 14, MM.FORCE_PALETTE.length);
same('⑥ FORCE_RESERVE 14 備色', 14, MM.FORCE_RESERVE.length);
const PALETTE_COLORS = MM.FORCE_PALETTE.map((p) => p.color);
const PALETTE_FORCES = MM.FORCE_PALETTE.map((p) => p.force);
same('⑥ 14 家色板取值互不相同', 14, new Set(PALETTE_COLORS).size);
same('⑥ 14 家名字互不相同', 14, new Set(PALETTE_FORCES).size);
same('⑥ 14 備色取值互不相同', 14, new Set(MM.FORCE_RESERVE).size);
same('⑥ 色板 + 備色共 28 色互不相同', 28, new Set([...PALETTE_COLORS, ...MM.FORCE_RESERVE]).size);
ok('⑥ 玩家金環 FORCE_GOLD 不等於任何色板色', !PALETTE_COLORS.includes(MM.FORCE_GOLD) && !MM.FORCE_RESERVE.includes(MM.FORCE_GOLD));
ok('⑥ 玩家金環 FORCE_GOLD 不等於中性色', MM.FORCE_GOLD !== MM.FORCE_COLOR_NEUTRAL);
same('⑥ 張角 → 色板第 3 色 #C9A82E', '#C9A82E', MM.forceColorOf(PLAYER));
same('⑥ 公孫瓚 → #6E8FBF', '#6E8FBF', MM.forceColorOf('公孫瓚'));
same('⑥ 嚴白虎 → #5E7D5A（色板最後一色）', '#5E7D5A', MM.forceColorOf('嚴白虎'));
same('⑥ 空字串 → 中性色', MM.FORCE_COLOR_NEUTRAL, MM.forceColorOf(''));
// 色板外的勢力（袁紹/曹操/劉備…）走備色：索引 14..27，不落中性色，且同名恆定
const unknownForces = ['袁紹', '曹操', '劉備', '馬騰'];
ok('⑥ 色板外勢力走備色（index 14..27）', unknownForces.every((f) => {
  const i = MM.forceColorIndex(f);
  return i >= 14 && i < 28;
}), unknownForces.map((f) => [f, MM.forceColorIndex(f)]));
ok('⑥ 色板外勢力的色都取自備色', unknownForces.every((f) => MM.FORCE_RESERVE.includes(MM.forceColorOf(f))));
ok('⑥ 色板外勢力同名同色（FNV 穩定）', MM.forceColorOf('袁紹') === MM.forceColorOf('袁紹') && MM.forceColorOf('曹操') === MM.forceColorOf('曹操'));
ok('⑥ 備色與色板色不衝突（共 28 唯一）', new Set([...PALETTE_COLORS, ...MM.FORCE_RESERVE]).size === 28);
ok('⑥ forceColorIndex 對空字串回 -1', MM.forceColorIndex('') === -1);
const owners = [...new Set(cities.map((c) => garrisonOwner(c.NAME)).filter(Boolean))];
same('⑥ garrison 的 owner 就是那 14 家', 14, owners.length);
ok('⑥ 14 家的 forceColorOf 取值全不同', new Set(owners.map((o) => MM.forceColorOf(o))).size === 14);
ok('⑥ 14 家的顏色全在色板裡（0..13 固定色）', owners.every((o) => PALETTE_COLORS.includes(MM.forceColorOf(o))), owners.filter((o) => !PALETTE_COLORS.includes(MM.forceColorOf(o))));
ok('⑥ 14 家全部剛好落在色板索引 0..13', owners.every((o) => MM.forceColorIndex(o) >= 0 && MM.forceColorIndex(o) < 14));
// 城點 / 金環
const DOT_VIEW = { x: 18, y: 132, w: 714, h: 536 };
const dots = FP.forceDots(cities, garrisonOwner, PLAYER);
same('⑥ 城點 60 個', 60, dots.length);
same('⑥ 金環（我方）城點 6 個', 6, dots.filter((d) => d.ring).length);
same('⑥ 我方城點恰好是張角那 6 城', playerCities.slice().sort(), dots.filter((d) => d.mine).map((d) => d.name).sort());
ok('⑥ 金環只出現在我方城點', dots.every((d) => d.ring === d.mine));
ok('⑥ 我方城點色 = 張角的勢力色', dots.filter((d) => d.mine).every((d) => d.color === MM.forceColorOf(PLAYER)));
same('⑥ 無主城點 39 個', 39, dots.filter((d) => !d.force).length);
ok('⑥ 無主城點用中性色', dots.filter((d) => !d.force).every((d) => d.color === MM.FORCE_COLOR_NEUTRAL));
same('⑥ 半徑：我方 5 / 有主 4 / 無主 3', [5, 4, 3], [...new Set(dots.map((d) => d.radius))].sort((a, b) => b - a));
ok('⑥ 半徑與歸屬一致', dots.every((d) => d.radius === (d.mine ? 5 : d.force ? 4 : 3)));
ok('⑥ 所有城點投影都落在地圖框內', dots.every((d) => {
  const p = FP.projectCity(DOT_VIEW, d.x, d.y);
  return p.x >= DOT_VIEW.x - 1 && p.x <= DOT_VIEW.x + DOT_VIEW.w + 1 && p.y >= DOT_VIEW.y - 1 && p.y <= DOT_VIEW.y + DOT_VIEW.h + 1;
}));
// 投影公式必須與 CampaignRoot.baseMapRect 同式
const rect = FP.mapRectOf(DOT_VIEW);
const k = DOT_VIEW.w / 1280;
near('⑥ 地圖底圖寬 = 視圖寬', DOT_VIEW.w, rect.w);
near('⑥ 地圖底圖高 = 960 × k', 960 * k, rect.h);
near('⑥ 地圖底圖 y = view.y + (view.h - h)/2', DOT_VIEW.y + (DOT_VIEW.h - 960 * k) / 2, rect.y);
const origin = FP.projectCity(DOT_VIEW, 0, 0);
near('⑥ 原圖 (0,0) 投影到 mapRect 左上 x', rect.x, origin.x);
near('⑥ 原圖 (0,0) 投影到 mapRect 左上 y', rect.y, origin.y);
const corner = FP.projectCity(DOT_VIEW, 1280, 960);
near('⑥ 原圖 (1280,960) 投影到 mapRect 右下 x', rect.x + rect.w, corner.x);
near('⑥ 原圖 (1280,960) 投影到 mapRect 右下 y', rect.y + rect.h, corner.y);

/* ================================================================== */
/* ⑦ 城數求和 = 60                                                     */
/* ================================================================== */
section('⑦ 城數求和 = 60');
same('⑦ scenarios[0] 城數 = 60', 60, cities.length);
const listRows = FP.forceListRows({ save, cities, ownerOf: garrisonOwner, officersByCity, paths, player: PLAYER });
same('⑦ 勢力行 = 14 家 + 無主 1 = 15', 15, listRows.length);
same('⑦ 城數求和 = 60', 60, FP.sumCityCount(listRows));
same('⑦ 無主行 cityCount = 39', 39, listRows.find((r) => r.neutral).cityCount);
same('⑦ 有主城數 = 21', 21, listRows.filter((r) => !r.neutral).reduce((n, r) => n + r.cityCount, 0));
same('⑦ 我方（張角）cityCount = 6', 6, listRows.find((r) => r.player).cityCount);
same('⑦ 我方 officerCount = 17（在職才算，42 人裡 17 登）', 17, listRows.find((r) => r.player).officerCount);
ok('⑦ 我方行排第一', listRows[0].player === true);
ok('⑦ 無主行排最後', listRows[listRows.length - 1].neutral === true);
same('⑦ 14 家全部存活（有城）', 14, listRows.filter((r) => !r.neutral && r.alive).length);
same('⑦ 14 家全部 declared', 14, listRows.filter((r) => !r.neutral && r.declared).length);
ok('⑦ 沒滅亡的月文案全是 —', listRows.every((r) => r.monthText === '—'));
ok('⑦ 狀態文案：我方/存續/無主', FP.stateTextOf(listRows[0]) === '我方' && FP.stateTextOf(listRows[1]) === '存續' && FP.stateTextOf(listRows[listRows.length - 1]) === '無主');
same('⑦ 每行都有勢力色', 15, listRows.filter((r) => /^#[0-9A-F]{6}$/i.test(r.color)).length);
ok('⑦ 無主行用中性色', listRows.find((r) => r.neutral).color === MM.FORCE_COLOR_NEUTRAL);
ok('⑦ rosterSubText 帶城總數 60', FP.rosterSubText(listRows, 60).includes('城 60'), FP.rosterSubText(listRows, 60));
ok('⑦ rosterSubText 帶有主 21 / 無主 39', /有主 21/.test(FP.rosterSubText(listRows, 60)) && /無主 39/.test(FP.rosterSubText(listRows, 60)));
// 鄰接圖
const adj = FP.adjacencyOf(paths);
same('⑦ paths 116 條', 116, paths.length);
same('⑦ 鄰接圖節點 = 60 城', 60, adj.size);
ok('⑦ 每座城至少 1 條路', [...adj.values()].every((l) => l.length >= 1));
same('⑦ 最大度數 = 9', 9, Math.max(...[...adj.values()].map((l) => l.length)));
ok('⑦ 鄰接是無向的（A 連 B ⇒ B 連 A）', [...adj.entries()].every(([a, list]) => list.every((b) => (adj.get(b) ?? []).includes(a))));
ok('⑦ 沒有自環', [...adj.entries()].every(([a, list]) => !list.includes(a)));
same('⑦ 路徑折線 116 條（每條 ≥2 點）', 116, FP.pathPolylines(paths, DOT_VIEW).length);
ok('⑦ 路徑折線每條都 ≥ 2 點', FP.pathPolylines(paths, DOT_VIEW).every((l) => l.length >= 2));
// 接壤
const bordered = listRows.filter((r) => r.border);
ok('⑦ 至少 1 家與我方接壤', bordered.length >= 1, bordered.length);
ok('⑦ 我方自己不標接壤', listRows.find((r) => r.player).border === false);
ok('⑦ 無主行不標接壤', listRows.find((r) => r.neutral).border === false);
ok('⑦ 接壤的家其 borderCount 真指向我方城', bordered.every((r) => r.borderCount >= 1 && FP.neighborCities(adj, r.cities, playerCities).length === r.borderCount));
// 空城 / 數字 KING 歸一
same('⑦ normOwnerId("") = ""', '', FP.normOwnerId(''));
same('⑦ normOwnerId("1") = ""（12 座空城的數字 KING 佔位）', '', FP.normOwnerId('1'));
same('⑦ normOwnerId("12") = ""', '', FP.normOwnerId('12'));
same('⑦ normOwnerId("公孫瓚") 原樣', '公孫瓚', FP.normOwnerId('公孫瓚'));
const makeOwner = FP.makeOwnerOf(cities, save);
same('⑦ makeOwnerOf 優先吃 given', '丁原', FP.makeOwnerOf(cities, save, () => '丁原')('襄平'));
same('⑦ makeOwnerOf 吃 save.cities[x].owner', '曹操', FP.makeOwnerOf(cities, { cities: { 襄平: { owner: '曹操' } } })('襄平'));
same('⑦ makeOwnerOf 退回 city.KING（數字佔位 → 空）', '', makeOwner('易京') || '');
same('⑦ 空城 39 座的 KING 都是空或數字', 0, cities.filter((c) => {
  const id = FP.normOwnerId(c.KING);
  const gar = garrisonOwner(c.NAME);
  return !gar && id;
}).length);

/* ================================================================== */
/* 組字（面板文字非空的純邏輯部分）                                    */
/* ================================================================== */
section('⑧ 文字組裝（面板每欄都有字）');
const row0 = rows[0];
ok('⑧ rowTitle 非空且含名字', GB.rowTitle(row0).includes(row0.name));
ok('⑧ rowStatText 含武/智/級三個數', /武\s?\d+/.test(GB.rowStatText(row0)) && /智\s?\d+/.test(GB.rowStatText(row0)) && /級\s?\d+/.test(GB.rowStatText(row0)));
ok('⑧ rowForceText 非空', GB.rowForceText(row0).length > 0);
ok('⑧ vitalLine 含體/技/兵', /體/.test(GB.vitalLine(row0)) && /技/.test(GB.vitalLine(row0)) && /兵/.test(GB.vitalLine(row0)), GB.vitalLine(row0));
ok('⑧ moodLine 含忠/氣/疲', /忠/.test(GB.moodLine(row0)) && /氣/.test(GB.moodLine(row0)) && /疲/.test(GB.moodLine(row0)), GB.moodLine(row0));
ok('⑧ equipLine 含兵/馬', /兵/.test(GB.equipLine(row0)) && /馬/.test(GB.equipLine(row0)), GB.equipLine(row0));
ok('⑧ 書欄永遠 —（Thing 全空，見報告 [推測]）', /書\s?[—\-]/.test(GB.equipLine(row0)), GB.equipLine(row0));
ok('⑧ 401 行的 equipLine 都不含 undefined', rows.every((r) => !/undefined|NaN/.test(GB.equipLine(r))));
ok('⑧ 401 行的 vitalLine/moodLine 都不含 undefined', rows.every((r) => !/undefined|NaN/.test(GB.vitalLine(r) + GB.moodLine(r))));
ok('⑧ 401 行都有武器（Weapon 全非空）', rows.every((r) => r.weapon.length > 0));
ok('⑧ 401 行都有馬（Horse 全非空）', rows.every((r) => r.horse.length > 0));
same('⑧ 書（Thing）非空的行數 = 0', 0, rows.filter((r) => r.thing.length > 0).length);
// 首字索引
const initials = GB.initialsOf(rows);
same('⑧ 首字種類 = 138', 138, initials.length);
same('⑧ 首字人數求和 = 401', 401, initials.reduce((n, it) => n + it.count, 0));
same('⑧ 人最多的首字 = 張（28 人）', ['張', 28], [initials[0].ch, initials[0].count]);
ok('⑧ 首字清單按人數降序', initials.every((it, i) => i === 0 || initials[i - 1].count >= it.count));
// 篩選
const onlyZhang = GB.filterBook(rows, { force: PLAYER });
same('⑧ 篩勢力 張角 → 42 行', 42, onlyZhang.length);
same('⑧ 篩首字 張 → 28 行', 28, GB.filterBook(rows, { initial: '張' }).length);
const both = GB.filterBook(rows, { force: PLAYER, initial: '張' });
ok('⑧ 勢力 + 首字可疊加（張角裡姓張的更少）', both.length <= 42 && both.every((r) => r.force === PLAYER && Array.from(r.name)[0] === '張'));
same('⑧ 空篩選回全部 401', 401, GB.filterBook(rows, {}).length);
ok('⑧ filterBook 不改輸入陣列', rows.length === 401);

/* ------------------------------------------------------------------ */
console.log('\n==============================================');
console.log(`斷言 ${total} 條，通過 ${total - failures}，失敗 ${failures}`);
if (failures) {
  console.log('失敗清單：');
  for (const f of failed) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('全部通過 ✅');
}
