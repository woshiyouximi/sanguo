/**
 * panel_headless.mjs — EndingPanel / CityListPanel 走真節點樹（mock cc）。
 * 覆蓋：結局屏（統一 + 滅亡、重開按鈕、無資源降級、有資源路徑）；
 *       列表頁（60 城 4 頁、翻頁、篩選、排序、點行、關閉）。
 * 執行：node work/cocos_endlist/panel_headless.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc');
const { EndingPanel, ENDING_LAYOUT } = require('./_sim/EndingPanel.js');
const { CityListPanel, CITY_LIST_LAYOUT } = require('./_sim/CityListPanel.js');

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
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  let ja;
  let je;
  try {
    ja = JSON.stringify(actual);
    je = JSON.stringify(expected);
  } catch {
    ja = String(actual);
    je = String(expected);
  }
  ok(name, ja === je, `actual=${ja} expected=${je}`);
}

function includes(name, text, needle) {
  ok(name, typeof text === 'string' && text.includes(needle), `text=${JSON.stringify(text)}`);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeRoot(name) {
  const root = new cc.Node(name);
  root.setPosition(0, 0);
  const transform = root.addComponent(cc.UITransform);
  transform.setContentSize(750, 1334);
  return root;
}

function walkTexts(node, out = []) {
  const label = node.getComponent(cc.Label);
  if (label && label.string) out.push(label.string);
  for (const child of node.children) walkTexts(child, out);
  return out;
}

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

/* ------------------------------------------------------------------ */
/* 測試資料：60 城                                                     */
/* ------------------------------------------------------------------ */

const NAMES = [
  '許昌', '洛陽', '長安', '鄴', '宛', '濮陽', '小沛', '下邳', '壽春', '建業',
  '吳', '會稽', '廬江', '柴桑', '江夏', '襄陽', '新野', '江陵', '長沙', '武陵',
  '桂陽', '零陵', '成都', '梓潼', '漢中', '永安', '江州', '建寧', '雲南', '天水',
  '安定', '武威', '西涼', '上黨', '晉陽', '平原', '南皮', '北平', '薊', '遼東',
  '襄平', '代', '上谷', '漁陽', '河間', '渤海', '北海', '琅琊', '廣陵', '汝南',
  '陳留', '弘農', '河內', '上庸', '房陵', '巴西', '巴郡', '牂牁', '朱提', '交趾',
];

const sortedNames = NAMES.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const CITIES = NAMES.map((name, index) => ({
  NAME: name,
  KING: index < 20 ? '劉備' : index < 50 ? '曹操' : 0,
  MAJOR: index < 20 ? `太守${index}` : index < 50 ? `敵將${index}` : '',
  POPULATION: 10000 + index * 10,
  DEFENSE: 30 + (index % 20),
  MONEY: 900 + index,
}));

const RUNTIME = {};
NAMES.forEach((name, index) => {
  RUNTIME[name] = {
    owner: index < 20 ? '劉備' : index < 50 ? '曹操' : '',
    troops: 300 + index,
    prep: 100 + index,
    money: 500 + index,
  };
});

const save20 = {
  owned: NAMES.slice(0, 20),
  month: 28,
  force: '劉備',
  monarch: '劉備',
  cities: RUNTIME,
  forces: { 劉備: { alive: true }, 曹操: { alive: true }, 孫權: { alive: true } },
};

const save60 = { ...save20, owned: NAMES.slice() };
const save0 = {
  ...save20,
  owned: [],
  month: 5,
  forces: { 劉備: { alive: true }, 曹操: { alive: true }, 孫權: { alive: true } },
};

/* ------------------------------------------------------------------ */
/* 一、結局屏                                                          */
/* ------------------------------------------------------------------ */

async function testEnding() {
  const root = makeRoot('EndingRoot');
  const storage = new FakeStorage([
    ['sanguo_campaign_v1', 'x'],
    ['sanguo_saves_v1', 'y'],
    ['sanguo_monarch_v1', 'm'],
    ['unrelated', 'keep'],
  ]);
  let restarts = 0;

  // 未結束：showIfEnded 回 null 且不建節點。
  const notEnded = EndingPanel.showIfEnded(root, save20, CITIES, [], {
    storage,
    onRestart: () => {
      restarts += 1;
    },
  });
  same('結局：未結束 showIfEnded 回 null', notEnded, null);
  same('結局：未結束不建節點', root.getChildByName('EndingPanel'), null);

  // 統一結局。
  const panel = EndingPanel.showIfEnded(root, save60, CITIES, [], {
    storage,
    onRestart: () => {
      restarts += 1;
    },
  });
  ok('結局：統一 showIfEnded 回面板', panel !== null && panel instanceof EndingPanel);
  await flush();
  await flush();
  await flush();
  let debug = panel.debug();
  same('結局：opened', debug.opened, true);
  same('結局：kind', debug.kind, 'unify');
  same('結局：reason', debug.reason, 'unify');
  same('結局：label', debug.label, '統一');
  same('結局：title', debug.title, '天下統一');
  ok('結局：kicker 非空', debug.kicker.length > 0, debug.kicker);
  ok('結局：正文非空', debug.body.length > 40, debug.body.length);
  same('結局：正文 3 段（換行分隔）', debug.body.split('\n').length, 3);
  ok(
    '結局：每段以全角縮排開頭',
    debug.body.split('\n').every((line) => line.startsWith('　　')),
    JSON.stringify(debug.body.split('\n').map((line) => line.slice(0, 2)))
  );
  ok('結局：epithet 非空', debug.epithet.length > 0, debug.epithet);
  same('結局：印章 統一', debug.seal, '統一');
  same('結局：4 個統計標題', debug.statLabels, ['用時', '城數', '武將', '擊破勢力']);
  same('結局：4 個統計值', debug.statValues.length, 4);
  ok('結局：統計值全非空', debug.statValues.every((text) => text.length > 0), JSON.stringify(debug.statValues));
  same('結局：城數 60 / 60', debug.statValues[1], '60 / 60');
  same('結局：擊破 1（曹操；孫權不在城池表）', debug.statValues[3], '1');
  same('結局：stats.cityCount', debug.stats?.cityCount, 60);
  same('結局：hitNames', debug.hitNames, ['restart']);
  ok('結局：節點數 > 25', debug.nodeCount > 25, String(debug.nodeCount));
  ok('結局：直接子節點 >= 10', debug.childCount >= 10, String(debug.childCount));
  same('結局：無圖時走剪影', debug.mapState, 'failed');
  const texts = walkTexts(panel.node);
  ok('結局：節點樹所有文字至少 10 條', texts.length >= 10, String(texts.length));
  ok('結局：文字含「終」', texts.some((text) => text.includes('終')), JSON.stringify(texts.slice(-4)));
  ok('結局：文字含「重新開始」', texts.some((text) => text.includes('重新開始')));

  // 重開按鈕：清 sanguo_*、回調一次、非 sanguo_ 保留。
  const hit = panel.tap(ENDING_LAYOUT.restart.x + 10, ENDING_LAYOUT.restart.y + 10);
  same('結局：點中重開', hit, true);
  same('結局：onRestart 回調一次', restarts, 1);
  same('結局：restarts 計數', panel.debug().restarts, 1);
  same('結局：清掉 3 個存檔鍵', panel.debug().clearedKeys, [
    'sanguo_campaign_v1',
    'sanguo_monarch_v1',
    'sanguo_saves_v1',
  ]);
  same('結局：存檔鍵已刪', storage.getItem('sanguo_campaign_v1'), null);
  same('結局：非存檔鍵保留', storage.getItem('unrelated'), 'keep');
  same('結局：重開後仍開著（等 lead 換場景）', panel.debug().opened, true);

  // 重複 show 同一父節點：重用節點，不重複。
  const again = EndingPanel.showIfEnded(root, save60, CITIES, []);
  same('結局：重複 show 重用同一面板', again, panel);
  same('結局：重複 show 不重複節點', root.children.filter((child) => child.name === 'EndingPanel').length, 1);

  panel.close();
  same('結局：close 後 opened=false', panel.debug().opened, false);

  // 滅亡（0 城）。
  const root2 = makeRoot('EndingRoot2');
  const fall = EndingPanel.show(root2, require('./_sim/EndingModel.js').endingOf(save0, CITIES, []), {
    storage,
  });
  await flush();
  const fallDebug = fall.debug();
  same('結局：滅亡 kind', fallDebug.kind, 'fall');
  same('結局：滅亡 reason', fallDebug.reason, 'no-city');
  same('結局：滅亡 title', fallDebug.title, '勢力滅亡');
  same('結局：滅亡印章', fallDebug.seal, '滅亡');
  same('結局：滅亡 label', fallDebug.label, '滅亡');
  same('結局：滅亡 stats 0 城', fallDebug.stats?.cityCount, 0);
  fall.close();
  same('結局：滅亡 close 後 opened=false', fall.debug().opened, false);

  // 有圖路徑：登記 bg/map_bg 後 mapState=ready，且背景載的是這個檔。
  cc.__setAsset('bg/map_bg');
  const root3 = makeRoot('EndingRoot3');
  const withArt = EndingPanel.show(root3, require('./_sim/EndingModel.js').endingOf(save60, CITIES, []));
  await flush();
  await flush();
  await flush();
  same('結局：有圖時 mapState=ready', withArt.debug().mapState, 'ready');
  const loadedBg = cc.__loadLog.filter((line) => line.includes('bg/map_bg'));
  ok('結局：確實載入 bg/map_bg', loadedBg.length >= 1, JSON.stringify(cc.__loadLog.slice(-3)));
  withArt.close();
}

/* ------------------------------------------------------------------ */
/* 二、城池列表                                                        */
/* ------------------------------------------------------------------ */

async function testList() {
  const root = makeRoot('ListRoot');
  const picked = [];
  const panel = CityListPanel.show(root, {
    save: save20,
    cities: CITIES,
    generals: [],
    onPick: (name) => picked.push(name),
  });
  await flush();

  let debug = panel.debug();
  same('列表：opened', debug.opened, true);
  same('列表：總數 60', debug.total, 60);
  same('列表：4 頁', debug.pages, 4);
  same('列表：第 0 頁', debug.page, 0);
  same('列表：每頁 15 行', debug.pageRows.length, 15);
  same('列表：15 行可見', debug.visibleRows, 15);
  ok('列表：rowTexts 15×7', debug.rowTexts.length === 15 && debug.rowTexts.every((row) => row.length === 7));
  ok(
    '列表：每格都有字',
    debug.rowTexts.every((row) => row.every((text) => typeof text === 'string' && text.length > 0)),
    JSON.stringify(debug.rowTexts[0])
  );
  same('列表：預設城名遞增', debug.sort, 'name');
  same('列表：預設方向', debug.dir, 1);
  const firstRowName = debug.pageRows[0];
  const firstRow = panel.list.rowOf(firstRowName);
  ok('列表：第 1 行城名在 60 城內', NAMES.includes(firstRowName), firstRowName);
  same('列表：第 1 行城名與 model 一致', debug.rowTexts[0][0], firstRowName);
  same('列表：第 1 行勢力', debug.rowTexts[0][1], firstRow?.force);
  same('列表：第 1 行關係', debug.rowTexts[0][6], firstRow?.relationText);
  same('列表：第 1 行是排序後首城', firstRowName, sortedNames[0]);
  includes('列表：副標含共 60 城', debug.sub, '共 60 城');
  includes('列表：副標含己方 20', debug.sub, '己方 20');
  includes('列表：副標含敵方 30', debug.sub, '敵方 30');
  includes('列表：副標含無主 10', debug.sub, '無主 10');
  includes('列表：頁碼第 1/4 頁', debug.pageText, '第 1 / 4 頁');
  same('列表：4 個篩選 tab', debug.tabLabels, ['全部', '己方', '敵方', '無主']);
  same('列表：2 個排序 chip', debug.sortLabels, ['城名 ↑', '勢力']);
  ok('列表：節點數 > 120', debug.nodeCount > 120, String(debug.nodeCount));
  for (const name of ['filter:all', 'filter:ours', 'filter:enemy', 'filter:neutral', 'sort:name', 'sort:force', 'prev', 'next', 'close', 'back']) {
    ok(`列表：hit 有 ${name}`, debug.hitNames.includes(name), JSON.stringify(debug.hitNames.slice(0, 6)));
  }
  ok('列表：hit 有 row:' + firstRowName, debug.hitNames.includes('row:' + firstRowName));

  // 下一頁。
  const firstPageText = debug.pageText;
  panel.tap(CITY_LIST_LAYOUT.next.x + 10, CITY_LIST_LAYOUT.next.y + 10);
  debug = panel.debug();
  same('列表：下一頁到第 2 頁', debug.page, 1);
  includes('列表：頁碼第 2/4 頁', debug.pageText, '第 2 / 4 頁');
  ok('列表：翻頁後頁碼文字改變', debug.pageText !== firstPageText);
  same('列表：第 2 頁 15 行', debug.pageRows.length, 15);
  same('列表：第 2 頁首行', debug.pageRows[0], sortedNames[15]);

  // 上一頁回第 1 頁。
  panel.tap(CITY_LIST_LAYOUT.prev.x + 10, CITY_LIST_LAYOUT.prev.y + 10);
  same('列表：上一頁回第 1 頁', panel.debug().page, 0);

  // 篩選：己方 20（2 頁）。tab 中心 x = 18 + i*174 + 82。
  panel.tap(18 + 174 + 82, 158);
  debug = panel.debug();
  same('列表：篩選己方 tab', debug.filter, 'ours');
  same('列表：己方 20 列', panel.list.state.rows.length, 20);
  same('列表：己方 2 頁', debug.pages, 2);
  same('列表：己方第 1 頁 15 行', debug.pageRows.length, 15);

  // 篩選：敵方 30（2 頁）。
  panel.tap(18 + 174 * 2 + 82, 158);
  debug = panel.debug();
  same('列表：篩選敵方 tab', debug.filter, 'enemy');
  same('列表：敵方 30 列', panel.list.state.rows.length, 30);
  same('列表：敵方 2 頁', debug.pages, 2);
  same('列表：敵方第 1 頁 15 行', debug.pageRows.length, 15);

  // 篩選：無主 10（1 頁）。
  panel.tap(18 + 174 * 3 + 82, 158);
  debug = panel.debug();
  same('列表：篩選無主 tab', debug.filter, 'neutral');
  same('列表：無主 10 列', panel.list.state.rows.length, 10);
  same('列表：無主 1 頁', debug.pages, 1);
  same('列表：無主 10 行可見', debug.visibleRows, 10);
  includes('列表：無主頁碼 1/1', debug.pageText, '第 1 / 1 頁');

  // 點一行：回傳城名、selected 落地、onPick 收到。
  const neutralFirst = debug.pageRows[0];
  panel.tap(CITY_LIST_LAYOUT.table.x + 20, CITY_LIST_LAYOUT.rowY0 + 28);
  debug = panel.debug();
  same('列表：點行回傳城名', picked[0], neutralFirst);
  same('列表：selected 落地', debug.selected, neutralFirst);
  ok('列表：selected 在 60 城內', NAMES.includes(neutralFirst));
  ok('列表：hit 有 row:' + neutralFirst, debug.hitNames.includes('row:' + neutralFirst));

  // 全部分頁回到 60，點第 4 行。
  panel.tap(18 + 82, 158);  debug = panel.debug();
  same('列表：回全部 60', debug.total, 60);
  const row3 = debug.pageRows[3];
  panel.tap(CITY_LIST_LAYOUT.table.x + 20, CITY_LIST_LAYOUT.rowY0 + 3 * 56 + 28);
  debug = panel.debug();
  same('列表：點第 4 行回傳', picked[1], row3);
  same('列表：selected 更新', debug.selected, row3);

  // 排序：點「勢力」切換方向，同勢力仍按城名。
  panel.tap(CITY_LIST_LAYOUT.sortForce.x + 10, CITY_LIST_LAYOUT.sortForce.y + 10);
  debug = panel.debug();
  same('列表：排序鍵 force', debug.sort, 'force');
  same('列表：預設升冪', debug.dir, 1);
  includes('列表：勢力排序標籤', debug.sortLabels[1], '勢力 ↑');
  const firstForceRows = debug.pageRows.slice();
  panel.tap(CITY_LIST_LAYOUT.sortForce.x + 10, CITY_LIST_LAYOUT.sortForce.y + 10);
  debug = panel.debug();
  same('列表：再點切降冪', debug.dir, -1);
  includes('列表：勢力降冪標籤', debug.sortLabels[1], '勢力 ↓');
  ok('列表：降冪換頁首行不同', debug.pageRows[0] !== firstForceRows[0], `${debug.pageRows[0]} vs ${firstForceRows[0]}`);

  // 無效 pick 不改選中、不觸發 onPick。
  const beforePick = picked.length;
  same('列表：pick 無效回 null', panel.pick('不存在城'), null);
  same('列表：pick 無效不改 selected', panel.debug().selected, row3);
  same('列表：pick 無效不觸發 onPick', picked.length, beforePick);

  // 上一頁/下一頁在末頁與首頁夾住。
  panel.setFilter('all');
  panel.nextPage();
  panel.nextPage();
  panel.nextPage();
  panel.nextPage();
  same('列表：末頁夾住', panel.debug().page, 3);
  panel.prevPage();
  same('列表：回第 3 頁', panel.debug().page, 2);

  // 關閉。
  panel.tap(CITY_LIST_LAYOUT.close.x + 10, CITY_LIST_LAYOUT.close.y + 10);
  same('列表：close 後 opened=false', panel.debug().opened, false);
  same('列表：close 後節點隱藏', panel.node.active, false);
  same('列表：close 後移除 input 監聽', (cc.__listeners.get('touch-end') ?? []).length, 0);

  // 60 城分 4 頁由 model 保證；這裡再用 row 節點數核對「複用」。
  same('列表：固定 15 組行節點', panel.debug().rowTexts.length, 15);
}

/* ------------------------------------------------------------------ */

await testEnding();
await testList();

if (failures.length > 0) {
  console.error(`FAIL ${failures.length} / ${passed + failures.length}`);
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}
console.log(`PASS ${passed} / ${passed}`);
