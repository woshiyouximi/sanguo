/**
 * model_assert.mjs — EndingModel / CityList 純邏輯斷言（不載入 cc）。
 * 執行：node work/cocos_endlist/model_assert.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('./_sim/EndingModel.js');
const L = require('./_sim/CityList.js');

let passed = 0;
const failures = [];

function ok(name, condition, extra = '') {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${extra ? ` :: ${extra}` : ''}`);
  }
}

function same(name, actual, expected) {
  const ja = JSON.stringify(actual);
  const je = JSON.stringify(expected);
  ok(name, ja === je, `actual=${ja} expected=${je}`);
}

/* ------------------------------------------------------------------ */
/* 60 城測試資料                                                       */
/* ------------------------------------------------------------------ */

const NAMES = [
  '許昌', '洛陽', '長安', '鄴', '宛', '濮陽', '小沛', '下邳', '壽春', '建業',
  '吳', '會稽', '廬江', '柴桑', '江夏', '襄陽', '新野', '江陵', '長沙', '武陵',
  '桂陽', '零陵', '成都', '梓潼', '漢中', '永安', '江州', '建寧', '雲南', '天水',
  '安定', '武威', '西涼', '上黨', '晉陽', '平原', '南皮', '北平', '薊', '遼東',
  '襄平', '代', '上谷', '漁陽', '河間', '渤海', '北海', '琅琊', '廣陵', '汝南',
  '陳留', '弘農', '河內', '上庸', '房陵', '巴西', '巴郡', '牂牁', '朱提', '交趾',
];

const CITIES = NAMES.map((name, index) => {
  let king = 0;
  if (index < 20) king = '劉備';
  else if (index < 40) king = '曹操';
  else if (index < 50) king = '孫權';
  return {
    NAME: name,
    KING: king,
    MAJOR: index < 20 ? `太守${index}` : index < 50 ? `敵將${index}` : '',
    POPULATION: index < 20 ? 12000 + index * 100 : index < 50 ? 8000 + index * 50 : 3000,
    DEFENSE: index < 20 ? 40 + index : index < 50 ? 30 + (index % 20) : 10,
    MONEY: index < 20 ? 1000 + index : index < 50 ? 700 + index : 200,
  };
});

const GENERALS = NAMES.map((name, index) => ({
  NAME: `武將${String(index).padStart(2, '0')}`,
  CITY: name,
  STR: 60 + (index % 30),
  INT: 50 + (index % 35),
}));

const RUNTIME = {};
NAMES.forEach((name, index) => {
  RUNTIME[name] = {
    owner: index < 20 ? '劉備' : index < 40 ? '曹操' : index < 50 ? '孫權' : '',
    troops: 300 + index,
    prep: 100 + index,
    money: 500 + index,
    pop: 10000 + index * 10,
    def: 30,
  };
});

const ROSTER = {};
NAMES.slice(0, 20).forEach((name, index) => {
  ROSTER[name] = [`武將${String(index).padStart(2, '0')}`];
});

function baseSave(over = {}) {
  return {
    owned: NAMES.slice(0, 20),
    month: 28,
    force: '劉備',
    monarch: '劉備',
    roster: ROSTER,
    cities: RUNTIME,
    forces: {
      劉備: { alive: true },
      曹操: { alive: true },
      孫權: { alive: true },
    },
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* ① 四種結局判定 × 各 3 個邊界樣本                                     */
/* ------------------------------------------------------------------ */

same('測試資料 60 城', NAMES.length, 60);

const unifySave = baseSave({ owned: NAMES.slice() });
const unify = M.endingOf(unifySave, CITIES, GENERALS);
ok('統一：60 城非 null', unify !== null);
same('統一：kind', unify?.kind, 'unify');
same('統一：reason', unify?.reason, 'unify');
same('統一：label', unify?.label, '統一');
same('統一：title', unify?.title, '天下統一');
same('統一：3 段正文', unify?.paragraphs.length, 3);
ok('統一：正文非空', (unify?.paragraphs ?? []).every((text) => typeof text === 'string' && text.length > 0));
same('統一：城數 60', unify?.stats.cityCount, 60);
same('統一：武將 20', unify?.stats.generalCount, 20);
same('統一：擊破 2 勢力', unify?.stats.brokenForces, 2);
same('統一：用時 2 年 3 月', unify?.stats.durationText, '2 年 3 月');
same('統一：monarch', unify?.monarch, '劉備');
same('統一：owned 60', unify?.owned.length, 60);
ok('統一：signature 非空', (unify?.signature ?? '').length > 0);
same('統一：endingSignature 一致', M.endingSignature(unify), unify?.signature);

const unifyDup = M.endingOf(baseSave({ owned: NAMES.concat(['許昌']) }), CITIES, GENERALS);
same('統一：重複城名仍 60', unifyDup?.stats.cityCount, 60);
same('統一：重複城名 kind', unifyDup?.kind, 'unify');

const unifyUnknown = M.endingOf(
  baseSave({ owned: NAMES.concat(['不存在城']) }),
  CITIES,
  GENERALS
);
same('統一：未知城名不計入', unifyUnknown?.stats.cityCount, 60);
same('統一：未知城名仍統一', unifyUnknown?.kind, 'unify');

const monarchFlag = M.endingOf(baseSave({ monarchExtinct: true }), CITIES, GENERALS);
same('君主亡：monarchExtinct kind', monarchFlag?.kind, 'fall');
same('君主亡：monarchExtinct reason', monarchFlag?.reason, 'monarch');
same('君主亡：label', monarchFlag?.label, '滅亡');
same('君主亡：title', monarchFlag?.title, '勢力滅亡');

const monarchAliveFalse = M.endingOf(
  baseSave({ forces: { 劉備: { alive: false }, 曹操: { alive: true }, 孫權: { alive: true } } }),
  CITIES,
  GENERALS
);
same('君主亡：forces.alive=false', monarchAliveFalse?.reason, 'monarch');

const monarchDeadFlag = M.endingOf(baseSave({ monarchDead: true }), CITIES, GENERALS);
same('君主亡：monarchDead 旗標', monarchDeadFlag?.reason, 'monarch');

const kingDeadFlag = M.endingOf(baseSave({ kingDead: true }), CITIES, GENERALS);
same('君主亡：kingDead 旗標', kingDeadFlag?.reason, 'monarch');

const noCity = M.endingOf(baseSave({ owned: [] }), CITIES, GENERALS);
same('0 城：kind', noCity?.kind, 'fall');
same('0 城：reason', noCity?.reason, 'no-city');
same('0 城：城數 0', noCity?.stats.cityCount, 0);
same('0 城：擊破 0', noCity?.stats.brokenForces, 0);

const noCityUnknown = M.endingOf(baseSave({ owned: ['不存在城'] }), CITIES, GENERALS);
same('0 城：只有未知城名 → no-city', noCityUnknown?.reason, 'no-city');

const noCityBlank = M.endingOf(baseSave({ owned: [] }), [], []);
same('0 城：無城池資料仍 no-city', noCityBlank?.reason, 'no-city');

const alive20 = M.endingOf(baseSave(), CITIES, GENERALS);
same('未結束：20 城 → null', alive20, null);

const alive1 = M.endingOf(baseSave({ owned: NAMES.slice(0, 1) }), CITIES, GENERALS);
same('未結束：1 城 → null', alive1, null);

const alive59 = M.endingOf(baseSave({ owned: NAMES.slice(0, 59) }), CITIES, GENERALS);
same('未結束：59 城 → null', alive59, null);

const noSave = M.endingOf(null, CITIES, GENERALS);
same('未結束：null 存檔 → null', noSave, null);

same('未結束：undefined 存檔 → null', M.endingOf(undefined, CITIES, GENERALS), null);

/* ------------------------------------------------------------------ */
/* ② 優先級：統一壓過滅亡；君主亡壓過 0 城                              */
/* ------------------------------------------------------------------ */

const unifyAndDead = M.endingOf(
  baseSave({ owned: NAMES.slice(), monarchExtinct: true }),
  CITIES,
  GENERALS
);
same('優先級：60 城 + 君主亡 → 統一', unifyAndDead?.kind, 'unify');
same('優先級：60 城 + 君主亡 reason', unifyAndDead?.reason, 'unify');

const unifyAndForceDead = M.endingOf(
  baseSave({
    owned: NAMES.slice(),
    forces: { 劉備: { alive: false }, 曹操: { alive: true }, 孫權: { alive: true } },
  }),
  CITIES,
  GENERALS
);
same('優先級：60 城 + forces.alive=false → 統一', unifyAndForceDead?.kind, 'unify');

const zeroAndDead = M.endingOf(baseSave({ owned: [], monarchExtinct: true }), CITIES, GENERALS);
same('優先級：0 城 + 君主亡 → 君主亡', zeroAndDead?.reason, 'monarch');
same('優先級：0 城 + 君主亡 kind', zeroAndDead?.kind, 'fall');

const zeroNoFlag = M.endingOf(baseSave({ owned: [] }), CITIES, GENERALS);
same('優先級：0 城無旗標 → no-city', zeroNoFlag?.reason, 'no-city');

/* ------------------------------------------------------------------ */
/* ③ 統計輔助函式                                                       */
/* ------------------------------------------------------------------ */

same('durationTextOf(1)', M.durationTextOf(1), '不足一月');
same('durationTextOf(2)', M.durationTextOf(2), '1 個月');
same('durationTextOf(13)', M.durationTextOf(13), '1 年');
same('durationTextOf(14)', M.durationTextOf(14), '1 年 1 月');
same('durationTextOf(28)', M.durationTextOf(28), '2 年 3 月');
same('durationTextOf(0)', M.durationTextOf(0), '不足一月');
same('formatDuration 走 durationText', M.formatDuration({ durationText: '7 個月' }), '7 個月');

const stats20 = M.endingStatsOf(baseSave(), CITIES, GENERALS);
same('統計：20 城', stats20.cityCount, 20);
same('統計：20 武將', stats20.generalCount, 20);
same('統計：3 初始勢力', stats20.startForces, 3);
same('統計：3 存活勢力', stats20.aliveForces, 3);
same('統計：0 擊破', stats20.brokenForces, 0);
same('統計：month 28', stats20.month, 28);
same('統計：elapsed 27', stats20.elapsedMonths, 27);

const valid = M.validOwnedOf(baseSave({ owned: NAMES.slice(0, 20).concat(['不存在城']) }), CITIES);
same('validOwnedOf 過濾未知城', valid.length, 20);
same('validOwnedOf 無城池資料不過濾', M.validOwnedOf({ owned: ['甲', '乙'] }, []).length, 2);

const rosterFallback = M.endingOf(
  baseSave({ roster: undefined, owned: NAMES.slice(0, 20) }),
  CITIES,
  GENERALS
);
same('武將 fallback：generals.CITY ∈ owned', rosterFallback, null);
const statsFallback = M.endingStatsOf(baseSave({ roster: undefined }), CITIES, GENERALS);
same('武將 fallback 計數 20', statsFallback.generalCount, 20);

same('isMonarchLost 空存檔', M.isMonarchLost({}), false);
same('isMonarchLost monarchExtinct', M.isMonarchLost({ monarchExtinct: true }), true);
same('isMonarchLost forces 已滅', M.isMonarchLost({ force: '甲', forces: { 甲: { alive: false } } }), true);
same('isMonarchLost 別的勢力死不影響', M.isMonarchLost({ force: '甲', forces: { 乙: { alive: false } } }), false);

const before = JSON.stringify(baseSave());
M.endingOf(baseSave(), CITIES, GENERALS);
same('endingOf 不就地改存檔', JSON.stringify(baseSave()), before);

/* ------------------------------------------------------------------ */
/* ④ 城池列表：60 城 4 頁、每頁 15、末頁 15                            */
/* ------------------------------------------------------------------ */

const SAVE = baseSave();
const list = new L.CityList(SAVE, CITIES, GENERALS);

same('列表：60 列', list.allRows.length, 60);
same('列表：總數 60', list.state.total, 60);
same('列表：4 頁', list.state.pages, 4);
same('列表：pageSize 15', list.state.pageSize, 15);
same('列表：頁碼從 0 起', list.state.page, 0);

for (let page = 0; page < 4; page += 1) {
  list.setPage(page);
  same(`列表：第 ${page + 1} 頁 15 行`, list.state.pageRows.length, 15);
  same(`列表：第 ${page + 1} 頁頁碼`, list.state.page, page);
}
same('列表：末頁仍 15 行', list.state.pageRows.length, 15);
same('列表：翻過頭夾到末頁', list.setPage(99).state.page, 3);
same('列表：負頁夾到 0', list.setPage(-1).state.page, 0);

list.setPage(0);
same('列表：nextPage 到第 2 頁', list.nextPage().state.page, 1);
list.setPage(3);
same('列表：末頁 nextPage 不動', list.nextPage().state.page, 3);
list.setPage(0);
same('列表：首頁 prevPage 不動', list.prevPage().state.page, 0);

/* ------------------------------------------------------------------ */
/* ⑤ 三種篩選結果數之和 = 60；排序穩定（同勢力按城名）                  */
/* ------------------------------------------------------------------ */

const counts = list.counts();
same('篩選：己方 20', counts.ours, 20);
same('篩選：敵方 30', counts.enemy, 30);
same('篩選：無主 10', counts.neutral, 10);
same('篩選：總數 60', counts.total, 60);
same('篩選：三種之和 = 60', counts.ours + counts.enemy + counts.neutral, 60);

list.setFilter('ours');
same('篩選己方：列數 20', list.state.rows.length, 20);
same('篩選己方：第 1 頁 15 行', list.state.pageRows.length, 15);
list.setPage(1);
same('篩選己方：第 2 頁 5 行', list.state.pageRows.length, 5);

list.setFilter('enemy');
same('篩選敵方：列數 30', list.state.rows.length, 30);
list.setPage(1);
same('篩選敵方：第 2 頁 15 行', list.state.pageRows.length, 15);

list.setFilter('neutral');
same('篩選無主：列數 10', list.state.rows.length, 10);
same('篩選無主：第 1 頁 10 行', list.state.pageRows.length, 10);

list.setFilter('all');
same('篩選全部：回 60', list.state.rows.length, 60);

// 城名排序（code-point，遞增）。
list.setSort('name', 1);
const nameAsc = list.allRows.map((row) => row.name);
const nameAscOk = nameAsc.every((name, index) => index === 0 || nameAsc[index - 1] <= name);
ok('排序：城名遞增', nameAscOk, JSON.stringify(nameAsc.slice(0, 5)));
same('排序：城名反向簽名', list.setSort('name', -1).allRows[0].name, nameAsc[nameAsc.length - 1]);

// 勢力排序：同勢力內按城名。
list.setSort('force', 1);
const forceRows = list.allRows;
const forceOrderOk = forceRows.every((row, index) => {
  if (index === 0) return true;
  const prev = forceRows[index - 1];
  if (prev.force !== row.force) return prev.force < row.force;
  return prev.name <= row.name;
});
ok('排序：勢力遞增 + 同勢力按城名', forceOrderOk);
const caoCaoNames = forceRows.filter((row) => row.force === '曹操').map((row) => row.name);
ok(
  '排序：曹操 20 城按城名遞增',
  caoCaoNames.length === 20 &&
    caoCaoNames.every((name, index) => index === 0 || caoCaoNames[index - 1] <= name)
);

const forceAscNames = forceRows.map((row) => row.name);
list.toggleSort('force');
same('排序：再點勢力翻成遞減', list.allRows.map((row) => row.name), forceAscNames.slice().reverse());
same('排序：遞減方向', list.currentDir, -1);

// 同勢力 tie-break 在遞減時也保持反向的城名順序（穩定、可預測）。
const caoDesc = list.allRows.filter((row) => row.force === '曹操').map((row) => row.name);
ok(
  '排序：曹操遞減仍由城名反向決定',
  caoDesc.every((name, index) => index === 0 || caoDesc[index - 1] >= name)
);

/* ------------------------------------------------------------------ */
/* ⑥ onPick 回傳城名在 60 城內；無效輸入不改 selected                   */
/* ------------------------------------------------------------------ */

list.setFilter('all');
const pickTarget = list.allRows[7].name;
same('onPick：回傳同一城名', list.pick(pickTarget), pickTarget);
same('onPick：selected 落地', list.selectedName, pickTarget);
ok('onPick：城名在 60 城內', NAMES.includes(pickTarget));
same('onPick：無效城名回 null', list.pick('不存在城'), null);
same('onPick：無效城名不改 selected', list.selectedName, pickTarget);
same('onPick：空字串回 null', list.pick(''), null);
same('onPick：空白字串回 null', list.pick('   '), null);

/* ------------------------------------------------------------------ */
/* ⑦ 列內容：己方/敵方/無主 + 數字欄位                                  */
/* ------------------------------------------------------------------ */

const row0 = list.rowOf('許昌');
same('列：許昌 relation', row0?.relation, 'ours');
same('列：許昌 relationText', row0?.relationText, '己方');
same('列：許昌 force', row0?.force, '劉備');
same('列：許昌 troops', row0?.troops, 300);
same('列：許昌 prep', row0?.prep, 100);
same('列：許昌 money', row0?.money, 500);
same('列：許昌 major', row0?.major, '太守0');

const rowEnemy = list.rowOf('桂陽');
same('列：桂陽 relation', rowEnemy?.relation, 'enemy');
same('列：桂陽 force', rowEnemy?.force, '曹操');
same('列：桂陽 relationText', rowEnemy?.relationText, '敵方');

const rowNeutral = list.rowOf('陳留');
same('列：陳留 relation', rowNeutral?.relation, 'neutral');
same('列：陳留 force', rowNeutral?.force, '無主');
same('列：陳留 relationText', rowNeutral?.relationText, '無主');
same('列：陳留 major 佔位', rowNeutral?.major, '—');
same('列：陳留 gate', rowNeutral?.gate, true);

same('篩選 tab 文字', L.CITY_FILTERS.map((item) => item.label), ['全部', '己方', '敵方', '無主']);
same('filterLabelOf(enemy)', L.filterLabelOf('enemy'), '敵方');
same('sortLabelOf(name,1)', L.sortLabelOf('name', 1), '城名 ↑');
same('sortLabelOf(force,-1)', L.sortLabelOf('force', -1), '勢力 ↓');

// 沒有 save.cities 時用劇本 DEF 補，不能整排 0。
const bare = new L.CityList({ owned: [] }, CITIES, []);
const bareRow = bare.rowOf('許昌');
ok('列：runtime 缺值時用劇本補', (bareRow?.troops ?? 0) > 0);
same('列：runtime 缺值 prep 補', bareRow?.prep, L.prepCapOf(12000));
same('列：runtime 缺值 money 補', bareRow?.money, 1000);

/* ------------------------------------------------------------------ */
/* ⑧ 重開：清 sanguo_* 存檔                                            */
/* ------------------------------------------------------------------ */

class FakeStorage {
  constructor(entries) {
    this.map = new Map(entries);
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

const fake = new FakeStorage([
  ['sanguo_campaign_v1', 'x'],
  ['sanguo_saves_v1', 'y'],
  ['sanguo_monarch_v1', 'm'],
  ['other_setting', 'z'],
]);
same('重開：刪除排序後的 sanguo_*', M.clearRunStorage(fake), [
  'sanguo_campaign_v1',
  'sanguo_monarch_v1',
  'sanguo_saves_v1',
]);
same('重開：保留非 sanguo_ 鍵', fake.getItem('other_setting'), 'z');
same('重開：sanguo_ 已空', fake.getItem('sanguo_campaign_v1'), null);

const map = new Map([
  ['sanguo_campaign_v1', 'x'],
  ['sanguo_saves_v1', 'y'],
]);
const mapOnly = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  removeItem: (key) => map.delete(key),
};
same('重開：無 length/key 時刪已知鍵', M.clearRunStorage(mapOnly), [
  'sanguo_campaign_v1',
  'sanguo_saves_v1',
]);
same('重開：map 已清空', [...map.keys()].length, 0);
same('重開：null storage 回空陣列', M.clearRunStorage(null), []);

/* ------------------------------------------------------------------ */

if (failures.length > 0) {
  console.error(`FAIL ${failures.length} / ${passed + failures.length}`);
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}
console.log(`PASS ${passed} / ${passed}`);
