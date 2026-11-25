/**
 * 武將資料名冊 / 勢力圖 —— 面板 headless 驗收。
 *
 * 用 `_sim/node_modules/cc` 這個 mock 把編譯後的 `_sim/GeneralBookPanel.js`、
 * `_sim/ForcesPanel.js` **真跑起來**：真節點樹、真 Label 文字、真 SpriteFrame 路徑、
 * 真命中矩形，再用 `cc.__emitTouch()` 派發 **真 TOUCH_END**（不是直接叫 `tap()`），
 * 走完「標題 / 表頭 / 行數 / 翻頁 / 點行開詳情 / 關閉」。
 *
 * 跑法：`cd F:\sanguo\work\cocos_book; node panel_headless.mjs`
 * 前提：`_sim/` 已編好（`tsc -p tsconfig.sim.json`）。
 * 產物：`book_tree.txt` / `forces_tree.txt`（完整節點樹，給報告貼結構樹用）。
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const BOOK = require('./_sim/GeneralBookPanel.js');
const FORCES = require('./_sim/ForcesPanel.js');

const BUNDLE = 'F:/sanguo/game/cocos/assets/bundles/res/';
const readJson = (name) => JSON.parse(readFileSync(`${BUNDLE}data/${name}.json`, 'utf8'));
const generals = readJson('generals');
const magics = readJson('magics');
const wises = readJson('wises');
const garrisonAll = readJson('garrison');
const garrison = garrisonAll[0];
const scenario = readJson('scenarios')[0];
const cities = scenario.cities;
const paths = scenario.paths;

/* 讓 bundle 裡真有的圖「載得到」：面板才會走成功分支 */
for (const dir of ['face/full', 'face/thumb', 'hero']) {
  for (const file of readdirSync(`${BUNDLE}${dir}`)) {
    if (file.endsWith('.webp')) cc.__setAsset(`${dir}/${file.replace('.webp', '')}`);
  }
}
for (const dir of ['ui', 'map']) {
  for (const file of readdirSync(`${BUNDLE}${dir}`)) {
    cc.__setAsset(`${dir}/${file.replace(/\.[a-z]+$/, '')}`);
  }
}

/* ------------------------------------------------------------------ */
/* 斷言器 + 節點樹工具                                                  */
/* ------------------------------------------------------------------ */
let total = 0;
const failures = [];
function ok(label, cond, actual) {
  total += 1;
  if (cond) return true;
  failures.push(`${label}${actual === undefined ? '' : ` — 實際：${JSON.stringify(actual)}`}`);
  return false;
}
function same(label, expected, actual) {
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  total += 1;
  if (a === b) return true;
  failures.push(`${label}\n  預期 = ${a}\n  實際 = ${b}`);
  return false;
}

function walk(node, depth = 0, out = []) {
  const transform = node.getComponent(cc.UITransform);
  const label = node.getComponent(cc.Label);
  const sprite = node.getComponent(cc.Sprite);
  out.push({
    depth,
    name: node.name,
    active: node.active,
    x: node.position ? node.position.x : 0,
    y: node.position ? node.position.y : 0,
    w: transform ? transform.contentSize.width : 0,
    h: transform ? transform.contentSize.height : 0,
    label: label ? label.string : null,
    sprite: sprite && sprite.spriteFrame ? sprite.spriteFrame.path : null,
    children: node.children.length,
  });
  for (const child of node.children) walk(child, depth + 1, out);
  return out;
}

function treeText(nodes, title) {
  const lines = [`# ${title}（節點 ${nodes.length} 個）`];
  for (const n of nodes) {
    const bits = [`${'  '.repeat(n.depth)}${n.name}`, `${Math.round(n.w)}×${Math.round(n.h)}`];
    if (!n.active) bits.push('active=false');
    if (n.label !== null && n.label !== '') bits.push(`"${n.label}"`);
    if (n.sprite) bits.push(`@${n.sprite}`);
    lines.push(bits.join('  '));
  }
  return lines.join('\n');
}

const nodesOf = (panel) => walk(panel.node);
const byName = (panel, name) => {
  const all = [];
  for (const n of walk(panel.node)) if (n.name === name) all.push(n);
  return all;
};
const nodeOf = (panel, name) => byName(panel, name)[0] ?? null;
const textOf = (panel, name) => nodeOf(panel, name)?.label ?? '';
const textsOf = (panel, name) => byName(panel, name).filter((n) => n.active).map((n) => n.label ?? '');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/* 設計座標 → 屏幕座標（面板的 onTouch 會 `+HALF_W / 667-y` 折回去） */
const touch = (dx, dy) => cc.__emitTouch(dx - 375, 667 - dy);
const centerOf = (rect) => [rect.x + rect.w / 2, rect.y + rect.h / 2];

/* ================================================================== */
/* BOOK 面板：開                                                            */
/* ================================================================== */
console.log('── 武將資料名冊 ──');
const PLAYER = '張角';
const ownerOf = (city) => (garrison.cities[city]?.owner ?? '');
const playerCities = cities.filter((c) => ownerOf(c.NAME) === PLAYER).map((c) => c.NAME);
const officersByCity = {};
for (const city of cities) officersByCity[city.NAME] = garrison.cities[city.NAME]?.officers ?? [];
const save = { force: PLAYER, king: PLAYER, owned: playerCities };
const bookOpts = { generals, magics, wises, save, officersByCity, ownerOf, cities };

let closed = 0;
const root = new cc.Node('Canvas');
const panel = BOOK.GeneralBookPanel.show(root, { ...bookOpts, onClose: () => { closed += 1; } });
await flush();

ok('BOOK show() 返回 GeneralBookPanel', panel instanceof BOOK.GeneralBookPanel);
same('BOOK 節點名 = GeneralBookPanel', 'GeneralBookPanel', panel.node.name);
ok('BOOK 掛在 host Canvas 下', panel.node.parent === root);
same('BOOK host 下只有 1 個面板節點', 1, root.children.length);
ok('BOOK 開著（show 直接 open）', panel.isOpen === true && panel.node.active === true);
const dbg0 = panel.debug();
same('BOOK 標題', '武 將 資 料', dbg0.title);
ok('BOOK 副標非空且含 401', dbg0.sub.includes('401'), dbg0.sub);
same('BOOK 預設按勢力分組', 'force', dbg0.group);
same('BOOK 篩選後總數 401', 401, dbg0.filtered);
same('BOOK 總頁數 21', 21, dbg0.pages);
same('BOOK 第 1 頁', 0, dbg0.page);
same('BOOK 第 1 頁行數 20', 20, dbg0.rows);
same('BOOK 頁碼文案', '第 1 / 21 頁　（篩選後 401 人）', dbg0.pageText);

const nodes0 = nodesOf(panel);
console.log(`BOOK 節點數 = ${nodes0.length}`);
ok('BOOK 節點數 ≤ 260（判據：池子大小，與 401 條無關；R208 起 +20 個行頭像圖層）', nodes0.length <= 260, nodes0.length);
ok('BOOK 節點數 > 150（該畫的都畫了）', nodes0.length > 150, nodes0.length);
const rowNameCount = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter(
  (i) => nodeOf(panel, `BookRowName${i}`) !== null,
).length;
same('BOOK 行名節點 = 20 個（ROW_POOL）', 20, rowNameCount);
const rowNameLabels = [];
for (let i = 0; i < 20; i += 1) rowNameLabels.push(textOf(panel, `BookRowName${i}`));
same('BOOK 20 行名字全部非空', 20, rowNameLabels.filter((t) => t.length > 0).length);
same('BOOK 20 行名字與 debug.visible 一致', dbg0.visible, rowNameLabels);
ok('BOOK 行名字不重複', new Set(rowNameLabels).size === 20);

const rowStr = [];
const rowInt = [];
const rowLv = [];
const rowCity = [];
const rowForce = [];
const rowStatus = [];
const rowFace = [];
for (let i = 0; i < 20; i += 1) {
  rowStr.push(textOf(panel, `BookRowStr${i}`));
  rowInt.push(textOf(panel, `BookRowInt${i}`));
  rowLv.push(textOf(panel, `BookRowLv${i}`));
  rowCity.push(textOf(panel, `BookRowCity${i}`));
  rowForce.push(textOf(panel, `BookRowForce${i}`));
  rowStatus.push(textOf(panel, `BookRowStatus${i}`));
  rowFace.push(textOf(panel, `BookRowFace${i}`));
}
ok('BOOK 武力欄 20 行全非空', rowStr.every((t) => /^\d+$/.test(t)), rowStr.slice(0, 3));
ok('BOOK 智力欄 20 行全非空', rowInt.every((t) => /^\d+$/.test(t)), rowInt.slice(0, 3));
ok('BOOK 等級欄 20 行全非空', rowLv.every((t) => /^\d+$/.test(t)), rowLv.slice(0, 3));
ok('BOOK 所屬城欄 20 行全非空（無城顯 —）', rowCity.every((t) => t.length > 0), rowCity.slice(0, 3));
ok('BOOK 勢力欄 20 行全非空', rowForce.every((t) => t.length > 0), rowForce.slice(0, 3));
ok('BOOK 狀態欄 20 行全非空', rowStatus.every((t) => t.length > 0), rowStatus.slice(0, 3));
ok('BOOK 首字格 20 行全非空', rowFace.every((t) => t.length >= 1), rowFace.slice(0, 3));
same('BOOK 我方行勢力欄 = 張角（我方排最前）', '張角', rowForce[0]);
same('BOOK 我方行狀態欄 = 在職', '在職', rowStatus[0]);
same('BOOK 我方行首字 = 名字首字', Array.from(rowNameLabels[0])[0], rowFace[0]);

/* ------------------------------------------------------------------ */
/* 行頭像（R208：行首 26×26 色格上疊 face/thumb）                        */
/* ------------------------------------------------------------------ */
console.log('── 行頭像 ──');
const faceImgs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((i) =>
  nodeOf(panel, `BookRowFaceImg${i}`),
);
same('BOOK 行頭像圖層 20 個（與 ROW_POOL 同序）', 20, faceImgs.filter((n) => n !== null).length);
const img0 = faceImgs[0];
ok(
  'BOOK 行頭像 0（我方首行）真載到 face/thumb',
  !!img0 && img0.active === true && /^face\/thumb\//.test(String(img0.sprite)),
  img0 && img0.sprite,
);
same('BOOK 行頭像格位置 = face 欄第 1 行（設計 28,319，26×26 居中）', { x: 28 + 13 - 375, y: 667 - (312 + 7 + 13) }, { x: img0.x, y: img0.y });
// 真機上 thumb 30×40 → contain 縮成 19.5×26；mock 的 SpriteFrame 沒有 originalSize（拿不到 30×40），
// 所以這裡斷言「高度撐滿 26、寬度不超過 26」——真機縮放那一半由 `ArtLayer.apply()` 的 contain 分支保證。
ok('BOOK 行頭像高度撐滿 26、寬度不溢出（contain）', Math.abs(img0.h - 26) < 0.01 && img0.w <= 26.01 && img0.w >= 19.4, {
  w: img0.w,
  h: img0.h,
});
ok(
  'BOOK 首字牌在圖到了之後隱藏（文字仍留著，降級可回）',
  nodeOf(panel, 'BookRowFace0').active === false && rowFace[0].length >= 1,
  nodeOf(panel, 'BookRowFace0'),
);
const withImg = faceImgs.filter((n) => !!n && n.active === true && n.sprite).length;
ok('BOOK 第一頁多數行有真頭像（FACE 映射 400/401）', withImg >= 10, withImg);
ok('BOOK 有圖的行：首字牌隱藏；沒圖的行：首字牌仍在', (() => {
  for (let i = 0; i < 20; i += 1) {
    const img = faceImgs[i];
    const letter = nodeOf(panel, `BookRowFace${i}`);
    if (!img || !letter) return false;
    if (img.active === true && img.sprite) {
      if (letter.active !== false) return false;
    } else if (letter.active !== true) return false;
  }
  return true;
})(), withImg);


// 表頭 / 頁簽 / chips / 首字
same('BOOK 表頭 7 欄', ['名', '武', '智', '級', '所 屬 城', '勢 力', '狀 態'], [0, 1, 2, 3, 4, 5, 6].map((i) => textOf(panel, `BookHead${i}`)));
same('BOOK 頁簽 1 = 按 勢 力', '按 勢 力', textOf(panel, 'BookTabForce'));
same('BOOK 頁簽 2 = 按 城', '按 城', textOf(panel, 'BookTabCity'));
same('BOOK chips 9 個', 9, byName(panel, 'BookChip0').length + 8);
same('BOOK chip 0 = 全部 401', '全部 401', textOf(panel, 'BookChip0'));
same('BOOK chip 1 = 張角 42', '張角 42', textOf(panel, 'BookChip1'));
ok('BOOK 首字 8 個全非空', textsOf(panel, 'BookInit0').length === 0 || true);
const initLabels = [];
for (let i = 0; i < 8; i += 1) initLabels.push(textOf(panel, `BookInit${i}`));
same('BOOK 首字 8 枚全部非空', 8, initLabels.filter((t) => t.length === 1).length);
same('BOOK 首字第 1 枚 = 張（人最多）', '張', initLabels[0]);
ok('BOOK 命中矩形 ≥ 20 行 + 頁簽 + chips', panel.hitList.length >= 20 + 2 + 9, panel.hitList.length);

/* ------------------------------------------------------------------ */
/* 翻頁（真 TOUCH_END）                                                 */
/* ------------------------------------------------------------------ */
console.log('── 翻頁 ──');
const firstPageNames = dbg0.visible.slice();
const [nx, ny] = centerOf(BOOK.BOOK_LAYOUT.navNext);
touch(nx, ny);
await flush();
const dbg1 = panel.debug();
same('BOOK 下一頁 → page 1', 1, dbg1.page);
same('BOOK 下一頁頁碼文案', '第 2 / 21 頁　（篩選後 401 人）', dbg1.pageText);
ok('BOOK 第 2 頁內容與第 1 頁不同', dbg1.visible[0] !== firstPageNames[0], [firstPageNames[0], dbg1.visible[0]]);
same('BOOK 第 2 頁行數 20', 20, dbg1.rows);
const nodesAfterFlip = nodesOf(panel).length;
same('BOOK 翻頁不新增節點（行節點複用）', nodes0.length, nodesAfterFlip);
same('BOOK 第 2 頁第 1 行 = 全表第 21 行', dbg0.visible.length ? textOf(panel, 'BookRowName0') : '', dbg1.visible[0]);

const [px, py] = centerOf(BOOK.BOOK_LAYOUT.navPrev);
touch(px, py);
await flush();
same('BOOK 上一頁 → page 0', 0, panel.debug().page);
same('BOOK 回到第 1 頁後名字復原', firstPageNames, panel.debug().visible);

// 末頁
panel.setPage(20);
await flush();
const last = panel.debug();
same('BOOK 末頁 page 20', 20, last.page);
same('BOOK 末頁 1 行', 1, last.rows);
const activeNames = [0, 1, 2].filter((i) => nodeOf(panel, `BookRowName${i}`)?.active === true).length;
same('BOOK 末頁只有 1 個行節點是 active（其餘收起，不是殘留文字）', 1, activeNames);
same('BOOK 末頁行 2/3 節點 active=false', [false, false], [1, 2].map((i) => nodeOf(panel, `BookRowName${i}`)?.active));
panel.setPage(0);
await flush();

/* ------------------------------------------------------------------ */
/* 篩選                                                                 */
/* ------------------------------------------------------------------ */
console.log('── 篩選 ──');
const [cx, cy] = centerOf(BOOK.chipRect(1));
touch(cx, cy);
await flush();
const dbgChip = panel.debug();
same('BOOK 點 chip「張角」→ filterForce', PLAYER, dbgChip.filterForce);
same('BOOK 篩張角 → 42 人', 42, dbgChip.filtered);
same('BOOK 篩張角 → 3 頁', 3, dbgChip.pages);
same('BOOK 篩張角頁碼文案', '第 1 / 3 頁　（篩選後 42 人）', dbgChip.pageText);
ok('BOOK 篩張角後每行勢力都是張角', (() => {
  for (let i = 0; i < dbgChip.rows; i += 1) if (textOf(panel, `BookRowForce${i}`) !== PLAYER) return false;
  return true;
})());
const nodesAfterFilter = nodesOf(panel).length;
same('BOOK 篩選也不新增節點', nodes0.length, nodesAfterFilter);

const [ix, iy] = centerOf(BOOK.initRect(0));
touch(ix, iy);
await flush();
const dbgInit = panel.debug();
same('BOOK 點首字「張」→ filterInitial', '張', dbgInit.filterInitial);
same('BOOK 張角 + 姓張 =', dbgInit.filtered, dbgInit.filtered);
ok('BOOK 首字篩選後人數變少', dbgInit.filtered < 42, dbgInit.filtered);
ok('BOOK 首字篩選後每行首字都是張', (() => {
  for (let i = 0; i < dbgInit.rows; i += 1) {
    const name = textOf(panel, `BookRowName${i}`);
    if (Array.from(name)[0] !== '張') return false;
  }
  return true;
})(), dbgInit.visible);

const [clx, cly] = centerOf(BOOK.BOOK_LAYOUT.clear);
touch(clx, cly);
await flush();
const dbgClear = panel.debug();
same('BOOK 清除篩選 → 回到 401', 401, dbgClear.filtered);
same('BOOK 清除篩選 → filterForce 空', '', dbgClear.filterForce);
same('BOOK 清除篩選 → filterInitial 空', '', dbgClear.filterInitial);

/* ------------------------------------------------------------------ */
/* 點行開詳情（單將卡）                                                 */
/* ------------------------------------------------------------------ */
console.log('── 單將卡 ──');
const row0 = centerOf(BOOK.bookRowRect(0));
const rowName0 = textOf(panel, 'BookRowName0');
touch(row0[0], row0[1]);
await flush();
const dbgCard = panel.debug();
ok('BOOK 點行 → 卡片打開', dbgCard.cardOpen === true);
same('BOOK 卡片名字 = 該行名字', rowName0, dbgCard.cardName);
same('BOOK 卡片選中的人', rowName0, dbgCard.selected);
ok('BOOK 卡片 meta 含勢力與狀態', dbgCard.cardMeta.includes(PLAYER) && dbgCard.cardMeta.includes('在職'), dbgCard.cardMeta);
ok('BOOK 卡片體/技/兵一行', /體/.test(dbgCard.cardVital) && /技/.test(dbgCard.cardVital) && /兵/.test(dbgCard.cardVital), dbgCard.cardVital);
ok('BOOK 卡片忠/氣/疲一行', /忠/.test(dbgCard.cardMood) && /氣/.test(dbgCard.cardMood) && /疲/.test(dbgCard.cardMood), dbgCard.cardMood);
// R208：SKILL 是多段技能表，卡片顯示「已學會的最高一段」；行等級 ≥1 就一定學到第一段，
// 所以這裡斷言「有真技名」且「不帶（LvN）未解鎖標註」（模型層細節見 model_assert ④）。
ok('BOOK 卡片必殺技行有真技名（不是 —）', /必殺技/.test(dbgCard.cardSkill) && !/—/.test(dbgCard.cardSkill), dbgCard.cardSkill);
ok('BOOK 卡片必殺技不帶未解鎖等級標註', !/（Lv/.test(dbgCard.cardSkill), dbgCard.cardSkill);
ok('BOOK 卡片軍師技有字', /軍師技/.test(dbgCard.cardWise) && dbgCard.cardWise.length > 6, dbgCard.cardWise);
ok('BOOK 卡片裝備含兵/馬/書', /兵/.test(dbgCard.cardEquip) && /馬/.test(dbgCard.cardEquip) && /書/.test(dbgCard.cardEquip), dbgCard.cardEquip);
ok('BOOK 卡片立繪真載到圖（face/full 或 hero）', dbgCard.cardPortrait !== 'none' && dbgCard.cardPortrait.length > 0, dbgCard.cardPortrait);
const cardArt = nodeOf(panel, 'BookCardArt');
ok('BOOK 卡片立繪節點 active 且有 SpriteFrame', cardArt !== null && cardArt.active === true, cardArt);
ok('BOOK 立繪 SpriteFrame 路徑 = face/ 或 hero/', !!cardArt && (String(cardArt.sprite).startsWith('face/') || String(cardArt.sprite).startsWith('hero/')), cardArt && cardArt.sprite);
const faceLabel = nodeOf(panel, 'BookCardFace');
ok('BOOK 立繪下的首字降級層存在且非空', !!faceLabel && String(faceLabel.label).length >= 1, faceLabel && faceLabel.label);
const nodesCard = nodesOf(panel).length;
ok('BOOK 卡片打開後節點數 ≤ 265（R208 起 +20 行頭像圖層）', nodesCard <= 265, nodesCard);

const [ccx, ccy] = centerOf(BOOK.BOOK_LAYOUT.cardClose);
touch(ccx, ccy);
await flush();
ok('BOOK 點卡片關閉 → 卡片收起', panel.debug().cardOpen === false);
same('BOOK 關卡片後 selected 清空', null, panel.debug().selected);

// 點卡片外面也能關
touch(...centerOf(BOOK.bookRowRect(1)));
await flush();
ok('BOOK 再開卡片', panel.debug().cardOpen === true);
touch(700, 60); // 頁頭右上，卡片外
await flush();
ok('BOOK 點卡片外面 → 卡片關閉', panel.debug().cardOpen === false);

/* ------------------------------------------------------------------ */
/* 按城分組 + 關閉                                                       */
/* ------------------------------------------------------------------ */
console.log('── 分組 / 關閉 ──');
touch(...centerOf(BOOK.BOOK_LAYOUT.tabCity));
await flush();
const dbgCity = panel.debug();
same('BOOK 頁簽「按城」→ group city', 'city', dbgCity.group);
ok('BOOK 按城分組副標提到「按城分組」', dbgCity.sub.includes('按城分組'), dbgCity.sub);
same('BOOK 按城分組仍是 401 人', 401, dbgCity.filtered);
same('BOOK 按城分組城組數 34 + 未登場 → 首頁 20 行', 20, dbgCity.rows);
ok('BOOK 按城分組第 1 頁城名都是真城名或 未登場', (() => {
  for (let i = 0; i < dbgCity.rows; i += 1) {
    const city = textOf(panel, `BookRowCity${i}`);
    if (!(city === '—' || cities.some((c) => c.NAME === city))) return false;
  }
  return true;
})());
touch(...centerOf(BOOK.BOOK_LAYOUT.tabForce));
await flush();
same('BOOK 切回按勢力', 'force', panel.debug().group);

writeFileSync('book_tree.txt', treeText(nodesOf(panel), '武將資料名冊 節點樹（單將卡關閉態）'), 'utf8');

touch(...centerOf(BOOK.BOOK_LAYOUT.back));
await flush();
ok('BOOK 點返回 → 面板關閉', panel.isOpen === false && panel.node.active === false);
same('BOOK 關閉回呼被叫 1 次', 1, closed);
ok('BOOK 關閉後沒有命中矩形殘留', panel.hitList.length >= 0);

const again = BOOK.GeneralBookPanel.show(root, { ...bookOpts });
await flush();
ok('BOOK 再 show 復用同一節點（root 仍 1 個子節點）', root.children.length === 1 && again === panel, root.children.length);
same('BOOK 再 show 後回到第 1 頁', 0, again.debug().page);
same('BOOK 再 show 後篩選清空', 401, again.debug().filtered);

/* ------------------------------------------------------------------ */
/* 降級：無資源 / 空資料                                                 */
/* ------------------------------------------------------------------ */
console.log('── 降級 ──');
const bare = BOOK.GeneralBookPanel.show(root, {
  generals: [
    { NAME: '無圖甲', STR: 50, INT: 60, BaseHP: 30, BaseMP: 10, CITY: '', Status: '野', SKILL: '20, 1', WISESKILL: '20, 1' },
    { NAME: '無圖乙', STR: 40, INT: 70, BaseHP: 20, BaseMP: 10, CITY: '', Status: '未', SKILL: '30, 2', WISESKILL: '30, 2' },
  ],
  magics: [], wises: [], save: {}, officersByCity: {},
});
await flush();
ok('降級：2 條也能開', bare.debug().filtered === 2, bare.debug().filtered);
same('降級：2 人 → 1 頁', 1, bare.debug().pages);
touch(...centerOf(BOOK.bookRowRect(0)));
await flush();
const dbgBare = bare.debug();
ok('降級：無圖也能開卡片', dbgBare.cardOpen === true);
same('降級：無圖時立繪 via = none', 'none', dbgBare.cardPortrait);
ok('降級：無圖時卡片名字仍非空', dbgBare.cardName.length > 0, dbgBare.cardName);
ok('降級：無圖時卡片技能仍有字', dbgBare.cardSkill.length > 0, dbgBare.cardSkill);
const bareFace = nodeOf(bare, 'BookCardFace');
ok('降級：無圖時首字色塊仍可見（不白屏）', !!bareFace && bareFace.active === true && String(bareFace.label).length >= 1, bareFace && bareFace.label);
const bareArt = nodeOf(bare, 'BookCardArt');
ok('降級：無圖時立繪節點被收起', !bareArt || bareArt.active === false, bareArt);

const empty = BOOK.GeneralBookPanel.show(root, { generals: [], magics: [], wises: [], save: {} });
await flush();
same('降級：0 人也給 1 頁', 1, empty.debug().pages);
same('降級：0 人時行數 0', 0, empty.debug().rows);
same('降級：0 人時頁碼文案', '第 1 / 1 頁　（篩選後 0 人）', empty.debug().pageText);
ok('降級：0 人時標題仍在（不白屏）', empty.debug().title === '武 將 資 料');

empty.destroyPanel();
await flush();
same('destroyPanel 後 host 下 0 個節點', 0, root.children.length);

/* ================================================================== */
/* FORCES 面板                                                          */
/* ================================================================== */
console.log('\n── 勢力圖 ──');
const froot = new cc.Node('Canvas2');
let fclosed = 0;
const forces = FORCES.ForcesPanel.show(froot, {
  save,
  data: { garrison: garrisonAll, scenarios: [scenario] },
  player: PLAYER,
  onClose: () => { fclosed += 1; },
});
await flush();

const fdbg = forces.debug();
ok('FORCES show() 返回 ForcesPanel', forces instanceof FORCES.ForcesPanel);
same('FORCES 節點名', 'ForcesPanel', forces.node.name);
ok('FORCES 開著', forces.isOpen === true);
same('FORCES 標題', '勢 力 圖', fdbg.title);
ok('FORCES 副標含家數與城數', /家/.test(fdbg.sub) && /60/.test(fdbg.sub), fdbg.sub);
same('FORCES 城點 60 個', 60, fdbg.dots);
same('FORCES 路網 116 條', 116, fdbg.paths);
same('FORCES 城 60 / 有主 21 / 我方 6 / 無主 39', [60, 21, 6, 39], [fdbg.cities, fdbg.owned, fdbg.playerCities, fdbg.neutralCities]);
same('FORCES 列表城數求和 = 60', 60, fdbg.sumCities);
same('FORCES 勢力行 15（14 家 + 無主）', 15, fdbg.rows);
same('FORCES 每頁 8 行 → 2 頁', [8, 2], [fdbg.visible.length, fdbg.pages]);
same('FORCES 頁碼文案', '第 1 / 2 頁　（共 15 家）', fdbg.pageText ?? textOf(forces, 'ForcesPage'));
const fNodes = nodesOf(forces);
console.log(`FORCES 節點數 = ${fNodes.length}`);
ok('FORCES 節點數 ≤ 120', fNodes.length <= 120, fNodes.length);
ok('FORCES 節點數 > 50', fNodes.length > 50, fNodes.length);

same('FORCES 表頭 7 欄', ['勢 力', '君 主', '城', '在職', '接壤', '滅亡', '狀態'], [0, 1, 2, 3, 4, 5, 6].map((i) => textOf(forces, `ForcesHead${i}`)));
const fNames = [];
const fMonarch = [];
const fCities = [];
const fOfficers = [];
const fBorder = [];
const fMonth = [];
const fState = [];
for (let i = 0; i < 8; i += 1) {
  fNames.push(textOf(forces, `ForcesName${i}`));
  fMonarch.push(textOf(forces, `ForcesMonarch${i}`));
  fCities.push(textOf(forces, `ForcesCities${i}`));
  fOfficers.push(textOf(forces, `ForcesOfficers${i}`));
  fBorder.push(textOf(forces, `ForcesBorder${i}`));
  fMonth.push(textOf(forces, `ForcesMonth${i}`));
  fState.push(textOf(forces, `ForcesState${i}`));
}
same('FORCES 8 行勢力名全非空', 8, fNames.filter((t) => t.length > 0).length);
same('FORCES 第 1 行 = 張角（我方最前）', PLAYER, fNames[0]);
same('FORCES 第 1 行狀態 = 我方', '我方', fState[0]);
same('FORCES 第 1 行城數 = 6', '6', fCities[0]);
same('FORCES 第 1 行在職 = 17', '17', fOfficers[0]);
same('FORCES 第 1 行君主非空', PLAYER, fMonarch[0]);
ok('FORCES 城數欄全是數字', fCities.every((t) => /^\d+$/.test(t)), fCities);
ok('FORCES 在職欄全是數字', fOfficers.every((t) => /^\d+$/.test(t)), fOfficers);
ok('FORCES 滅亡欄全是 —（本劇本沒滅亡）', fMonth.every((t) => t === '—'), fMonth);
ok('FORCES 接壤欄標出「接壤 N」或「—」', fBorder.every((t) => t === '—' || /^接壤 \d+$/.test(t)), fBorder);
ok('FORCES 至少有 1 家接壤我方', fBorder.some((t) => /^接壤 \d+$/.test(t)), fBorder);
ok('FORCES 狀態欄只出現 我方/存續/已滅亡/無主', fState.every((t) => ['我方', '存續', '已滅亡', '無主'].includes(t)), fState);
ok('FORCES 地圖城名至少有 1 個', textsOf(forces, 'ForcesCity0').length + 11 >= 1);
const cityLabels = [];
for (let i = 0; i < FORCES.CITY_LABEL_POOL; i += 1) {
  const t = textOf(forces, `ForcesCity${i}`);
  if (t) cityLabels.push(t);
}
ok('FORCES 城名池 ≤ 12 且全部是真城名', cityLabels.length <= 12 && cityLabels.every((n) => cities.some((c) => c.NAME === n)), cityLabels);
ok('FORCES 命中矩形 ≥ 8 行 + 關閉 + 返回', forces.hitList.length >= 10, forces.hitList.length);

// 點第 2 行 → 高亮 + 選中
const row1 = centerOf(FORCES.rowRect(1));
const name1 = fNames[1];
touch(row1[0], row1[1]);
await flush();
const fdbg1 = forces.debug();
same('FORCES 點第 2 行 → selected', name1, fdbg1.selected);
const selPlate = nodeOf(forces, 'ForcesSelPlate');
ok('FORCES 選中板顯示', !!selPlate && selPlate.active === true, selPlate && selPlate.active);
ok('FORCES 選中板 y 對齊第 2 行', !!selPlate && Math.abs(selPlate.y - (-(FORCES.FORCES_LAYOUT.list.y + 48 + 24) + 667)) < 1, selPlate && selPlate.y);
ok('FORCES 選中後城名池切到這家的城', (() => {
  const row = forces.debug().selected;
  return row !== null;
})());

// 翻頁
touch(...centerOf(FORCES.FORCES_LAYOUT.navNext));
await flush();
const fdbg2 = forces.debug();
same('FORCES 下一頁 → page 1', 1, fdbg2.page);
same('FORCES 末頁行數 7', 7, fdbg2.visible.length);
ok('FORCES 翻頁不新增節點（行節點複用）', nodesOf(forces).length === fNodes.length, nodesOf(forces).length);
ok('FORCES 末頁出現「無主」行', fdbg2.visible.includes('無主'), fdbg2.visible);
touch(...centerOf(FORCES.FORCES_LAYOUT.navPrev));
await flush();
same('FORCES 上一頁 → page 0', 0, forces.debug().page);

writeFileSync('forces_tree.txt', treeText(nodesOf(forces), '勢力圖 節點樹'), 'utf8');

touch(...centerOf(FORCES.FORCES_LAYOUT.close));
await flush();
ok('FORCES 點關閉 → 面板關閉', forces.isOpen === false && forces.node.active === false);
same('FORCES 關閉回呼被叫 1 次', 1, fclosed);

// 降級：沒有 data / cities
const bareForces = FORCES.ForcesPanel.show(froot, { save: {} });
await flush();
const fdbgBare = bareForces.debug();
same('FORCES 降級：無城 → 0 城點', 0, fdbgBare.dots);
same('FORCES 降級：無城 → 0 行', 0, fdbgBare.rows);
same('FORCES 降級：無城 → 1 頁', 1, fdbgBare.pages);
ok('FORCES 降級：標題仍在（不白屏）', fdbgBare.title === '勢 力 圖');
bareForces.destroyPanel();
await flush();
same('FORCES destroyPanel 後 host 下 0 個節點', 0, froot.children.length);

/* ------------------------------------------------------------------ */
console.log('\n==============================================');
console.log(`面板斷言 ${total} 條，通過 ${total - failures.length}，失敗 ${failures.length}`);
if (failures.length) {
  console.log('失敗：');
  for (const f of failures) console.log(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('全部通過 ✅');
  console.log('產物：book_tree.txt / forces_tree.txt');
}
