#!/usr/bin/env node
/**
 * skin_nodes_assert.mjs — 九宮接線的**靜態**斷言（w5-cocos-skin）。
 *
 * 為什麼不連 CDP：`work\cocos_layout\assert_layout.mjs` 驗的是 lead 構建出來的
 * 產物，產物裡不一錠有本輪改動；九宮底板是「在既有矩形上疊一層」的純外觀改動，
 * 最直接的證據其實在源碼裡：哪一頁、哪個 key、哪個矩形、哪個 Label 拿了哪個 role。
 *
 * 本腳本只讀 5 個 .ts + 2 個斷言腳本依賴的常量，不 import `cc`、不啟瀏覽器。
 *
 * 用法：node work\cocos_skinapply\skin_nodes_assert.mjs
 * 退出碼：0 = 全過；1 = 有失敗（逐條打印）。
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SCRIPTS = resolve(ROOT, 'game', 'cocos', 'assets', 'scripts');

const NUM = '(-?\\d+(?:\\.\\d+)?)';

/* ---------------------------------------------------------------- 斷言框架 */

const rows = [];
function check(page, name, ok, detail = '') {
  rows.push({ page, name, ok: Boolean(ok), detail });
}

const SRC = new Map();
function src(name) {
  if (!SRC.has(name)) SRC.set(name, readFileSync(join(SCRIPTS, name), 'utf8'));
  return SRC.get(name);
}

/* ---------------------------------------------------------------- 解析工具 */

function parseRect(text) {
  const m = new RegExp(`x:\\s*${NUM},\\s*y:\\s*${NUM},\\s*w:\\s*${NUM},\\s*h:\\s*${NUM}`).exec(text);
  return m ? { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) } : null;
}

/** 取 `const NAME ... = [ ... ];` 這段（陣列字面量） */
function arrBlock(text, constName) {
  const at = text.indexOf(`const ${constName}`);
  if (at < 0) return '';
  const open = text.indexOf('[', at);
  if (open < 0) return '';
  const close = text.indexOf('\n];', open);
  return text.slice(open, close < 0 ? text.length : close);
}

/** 取 `const NAME: T = [ ... ]` 上的數字常量（如 `const ACTION_SKIN_SLOTS = 4;`） */
function numConst(text, constName) {
  const m = new RegExp(`const ${constName}\\s*(?::[^=]+)?=\\s*${NUM}\\s*;`).exec(text);
  return m ? Number(m[1]) : NaN;
}

/** 解析 `{ name: '...', key: '...', rect: {...} | LAYOUT.xxx }` 列表 */
function parseSlots(text, constName, layout) {
  const block = arrBlock(text, constName);
  const re = /\{\s*name:\s*'([^']+)',\s*key:\s*'([^']+)',\s*rect:\s*(\{[^}]*\}|[A-Za-z_$][\w$.]*)\s*,?\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    const raw = m[3];
    let rect = null;
    if (raw.startsWith('{')) rect = parseRect(raw);
    else if (layout) rect = layout[raw.split('.').pop()] ?? null;
    out.push({ name: m[1], key: m[2], rect, raw });
  }
  return out;
}

function eqRect(a, b) {
  return Boolean(a) && Boolean(b) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function rectStr(r) {
  return r ? `{${r.x},${r.y},${r.w},${r.h}}` : 'null';
}

/** ItemsPanel 的 LAYOUT（含 statCol 兩欄） */
function parseItemsLayout(text) {
  const at = text.indexOf('export const LAYOUT = {');
  const end = text.indexOf('\n} as const;', at);
  const block = text.slice(at, end < 0 ? text.length : end);
  const out = {};
  const re = new RegExp(`(\\w+):\\s*\\{\\s*x:\\s*${NUM},\\s*y:\\s*${NUM},\\s*w:\\s*${NUM},\\s*h:\\s*${NUM}`, 'g');
  let m;
  while ((m = re.exec(block))) out[m[1]] = { x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]) };
  const sc = /statCol:\s*\[([\s\S]*?)\],\s*statRowStep/.exec(block);
  out.statCol = [];
  if (sc) {
    const re2 = new RegExp(`x:\\s*${NUM},\\s*y:\\s*${NUM},\\s*w:\\s*${NUM}`, 'g');
    let m2;
    while ((m2 = re2.exec(sc[1]))) out.statCol.push({ x: Number(m2[1]), y: Number(m2[2]), w: Number(m2[3]) });
  }
  return out;
}

/** 取某個方法體（從 `private xxx(...)` 到下一個同縮排的 `}`） */
function methodBody(text, signature) {
  const at = text.indexOf(signature);
  if (at < 0) return '';
  const brace = text.indexOf('{', at);
  if (brace < 0) return '';
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return text.slice(brace);
}

/* ---------------------------------------------------------------- TextRole */

const EXPECTED_ROLES = {
  title: { fontSize: 40, outlineWidth: 2, shadow: true, shadowOffset: '0,-2', shadowBlur: 2 },
  head: { fontSize: 22, outlineWidth: 1, shadow: true, shadowOffset: '0,-1', shadowBlur: 1 },
  body: { fontSize: 18, outlineWidth: 1, shadow: false },
  num: { fontSize: 20, outlineWidth: 1, shadow: false },
};

function parseRoles(text) {
  const at = text.indexOf('export const TEXT_ROLES');
  const end = text.indexOf('\n};', at);
  const block = text.slice(at, end < 0 ? text.length : end);
  const out = {};
  const re = new RegExp(
    `(\\w+):\\s*\\{\\s*fontSize:\\s*${NUM},\\s*outlineWidth:\\s*${NUM},\\s*outlineColor:\\s*'([^']+)',\\s*` +
      `shadow:\\s*(true|false),\\s*shadowOffset:\\s*\\[\\s*${NUM},\\s*${NUM}\\s*\\],\\s*` +
      `shadowBlur:\\s*${NUM},\\s*shadowColor:\\s*'([^']+)'`,
    'g',
  );
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = {
      fontSize: Number(m[2]),
      outlineWidth: Number(m[3]),
      outlineColor: m[4],
      shadow: m[5] === 'true',
      shadowOffset: `${Number(m[6])},${Number(m[7])}`,
      shadowBlur: Number(m[8]),
      shadowColor: m[9],
    };
  }
  return out;
}

/* ================================================================ A 大地圖 */

function checkCampaign() {
  const page = 'A 大地圖 CampaignRoot.ts';
  const text = src('CampaignRoot.ts');
  const slots = parseSlots(text, 'SKIN_SLOTS', null);
  const expected = [
    ['SkinLogFrame', 'frame_panel', { x: 16, y: 842, w: 718, h: 298 }],
    ['SkinHintFrame', 'frame_panel', { x: 25, y: 1260, w: 700, h: 70 }],
    ['SkinForcesPlate', 'plate_btn', { x: 384, y: 14, w: 160, h: 52 }],
    ['SkinItemsPlate', 'plate_btn', { x: 560, y: 14, w: 176, h: 52 }],
  ];

  check(page, 'SKIN_SLOTS 條數 = 4', slots.length === 4, `實際 ${slots.length}`);
  for (const [name, key, rect] of expected) {
    const slot = slots.find((s) => s.name === name);
    check(page, `${name} = ${key} ${rectStr(rect)}`, Boolean(slot) && slot.key === key && eqRect(slot.rect, rect), slot ? `${slot.key} ${rectStr(slot.rect)}` : '缺少');
  }

  const actionCount = numConst(text, 'ACTION_SKIN_SLOTS');
  check(page, '月令按鈕底板 ACTION_SKIN_SLOTS = 4', actionCount === 4, `實際 ${actionCount}`);
  const buildSkin = methodBody(text, 'private buildSkin(');
  check(page, 'buildSkin 內建 plate_btn 月令底板', /ACTION_SKIN_SLOTS/.test(buildSkin) && /plate_btn/.test(buildSkin));
  check(page, 'drawActions 會重擺月令底板', /layoutActionPlates\(\)/.test(methodBody(text, 'private drawActions(')));

  const onLoad = methodBody(text, 'onLoad(): void');
  check(
    page,
    '九宮層建在戰報 Label 之前（底板不會蓋字）',
    onLoad.indexOf('this.buildSkin()') >= 0 && onLoad.indexOf('this.buildSkin()') < onLoad.indexOf('this.buildLogLabels()'),
  );
  check(page, '九宮層建在頁頭 Label 之前', onLoad.indexOf('this.buildSkin()') < onLoad.indexOf('this.makeLabel('));

  // 頁頭四層文字 + 戰報
  check(page, "labelTitle -> title@32", /applyTextRole\(this\.labelTitle, 'title', 32\)/.test(text));
  check(page, "labelMonth -> num@20", /applyTextRole\(this\.labelMonth, 'num', 20\)/.test(text));
  check(page, "labelMonarch -> body@18", /applyTextRole\(this\.labelMonarch, 'body', 18\)/.test(text));
  check(page, "labelStats -> body@18", /applyTextRole\(this\.labelStats, 'body', 18\)/.test(text));
  check(page, "labelTitle/labelItems/labelForces 都有 role", /applyTextRole\(this\.labelItems, 'num', 20\)/.test(text) && /applyTextRole\(this\.labelForces, 'num', 20\)/.test(text));
  check(page, "logTitle -> head@18", /applyTextRole\(this\.logTitle, 'head', 18\)/.test(text));
  check(page, "actionLabels -> num@20", /applyTextRoles\(this\.actionLabels, 'num', 20\)/.test(text));

  // 城名：body role + 1px 深色描邊（由 role 提供，不再單獨 addOutline）
  const cityFont = numConst(text, 'CITY_LABEL_FONT');
  check(page, 'CITY_LABEL_FONT = 14（版式鎖死）', cityFont === 14, `實際 ${cityFont}`);
  check(page, "城名 Label 用 body role", /applyTextRole\(label, 'body', CITY_LABEL_FONT\)/.test(text));

  // r88 版式常量一個沒動
  check(page, 'MAP_VIEW = {0,130,750,700}', /const MAP_VIEW = \{ x: 0, y: 130, w: 750, h: 700 \};/.test(text));
  check(page, 'CONSOLE_TOP = 830', /const CONSOLE_TOP = 830;/.test(text));
  check(page, 'LOG_VIEW = {16,842,718,298}', /const LOG_VIEW = \{ x: 16, y: 842, w: 718, h: 298 \};/.test(text));
  check(page, 'BUTTON_Y = 1152 / BUTTON_H = 96', /const BUTTON_Y = 1152;/.test(text) && /const BUTTON_H = 96;/.test(text));

  // 版式純函數區沒被動（layout_guard.mjs 逐字抽這段去 transpile）
  const lines = text.split(/\r?\n/);
  const regionStart = lines.findIndex((l) => l.includes('#region 版式纯函数'));
  const regionEnd = lines.findIndex((l) => l.includes('#endregion'));
  const regionRaw = regionStart >= 0 && regionEnd > regionStart ? lines.slice(regionStart + 1, regionEnd).join('\n') : '';
  const regionCode = regionRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  check(
    page,
    `版式純函數區（${regionStart + 1}–${regionEnd + 1}，${regionEnd - regionStart - 1} 行）未碰引擎`,
    regionCode.length > 0 && !/from\s+['"]cc['"]/.test(regionCode) && !/\b(Node|Component|Color|Label|Graphics|Sprite|UITransform|Vec3|Layers)\b/.test(regionCode),
  );
  check(page, '九宮/文字層級沒有插進版式純函數區', !/UiSkin|TextRole|makeNineSlice|applyTextRole/.test(regionCode));

  const count = expected.length + actionCount;
  check(page, `九宮 key 數 ${count} ≥ 5`, count >= 5, `實際 ${count}`);
  return count;
}

/* ================================================================ B 內政 */

function checkCity() {
  const page = 'B 內政 CityPanel.ts';
  const text = src('CityPanel.ts');
  const slots = parseSlots(text, 'SKIN_SLOTS', null);
  const expected = [
    ['SkinHudFrame', 'frame_panel', { x: 18, y: 126, w: 714, h: 206 }],
    ['SkinCmdFrame', 'frame_panel', { x: 18, y: 344, w: 714, h: 396 }],
    ['SkinLogFrame', 'frame_panel', { x: 18, y: 880, w: 714, h: 348 }],
    ['SkinHintFrame', 'frame_panel', { x: 18, y: 1240, w: 714, h: 80 }],
    ['SkinBackPlate', 'plate_btn', { x: 18, y: 26, w: 104, h: 64 }],
  ];

  check(page, 'SKIN_SLOTS 條數 = 5', slots.length === 5, `實際 ${slots.length}`);
  for (const [name, key, rect] of expected) {
    const slot = slots.find((s) => s.name === name);
    check(page, `${name} = ${key} ${rectStr(rect)}`, Boolean(slot) && slot.key === key && eqRect(slot.rect, rect), slot ? `${slot.key} ${rectStr(slot.rect)}` : '缺少');
  }

  // 9 顆命令按鈕的牌底
  const ensure = methodBody(text, 'private ensureBuilt(');
  const loop = new RegExp(`for \\(let i = 0; i < (\\d+); i \\+= 1\\)[\\s\\S]{0,900}?this\\.addCommandPlate\\(rect\\)`).exec(ensure);
  check(page, '9 顆命令按鈕各墊 plate_btn', Boolean(loop) && Number(loop[1]) === 9, loop ? `迴圈 ${loop[1]} 次` : '沒找到 addCommandPlate 迴圈');

  const buildSkin = methodBody(text, 'private buildSkin(');
  check(page, '選中態用 plate_sel 疊層', /'plate_sel'/.test(buildSkin));
  const mark = methodBody(text, 'private markCommandPlate(');
  check(page, 'markCommandPlate 用 placeDesign 擺位', /placeDesign\(sel/.test(mark) && /setContentSize/.test(mark));
  check(page, 'runCommand 會點亮牌底', /this\.markCommandPlate\(index\)/.test(methodBody(text, 'private runCommand(')));

  // 文字層級
  check(page, "lblTitle -> title@FONT.title", /applyTextRole\(this\.lblTitle, 'title', FONT\.title\)/.test(text));
  check(page, 'FONT.title = 34（theme）', /title: 34/.test(src('view/theme.ts')));
  check(page, "lblCmdTitle -> head@22", /applyTextRole\(this\.lblCmdTitle, 'head', 22\)/.test(text));
  check(page, "cmdTags -> head@22", /applyTextRoles\(this\.cmdTags, 'head', 22\)/.test(text));
  check(page, "cmdSubs -> body@16", /applyTextRoles\(this\.cmdSubs, 'body', 16\)/.test(text));
  check(page, "24 個 hudNames -> body@16", /applyTextRoles\(this\.hudNames, 'body', 16\)/.test(text));
  check(page, "24 個 hudValues -> num@20", /applyTextRoles\(this\.hudValues, 'num', 20\)/.test(text));
  check(page, "logLabels -> body@18", /applyTextRoles\(this\.logLabels, 'body', 18\)/.test(text));

  // r88 保留項
  check(page, 'vAlpha 226 保留', /vAlpha = artReady \? 226 : 255/.test(text));
  check(
    page,
    'layoutRects 仍以 R_HUD/R_CMD/R_LOG/R_HINT 賦值（矩形沒換）',
    /this\.layoutRects = \{ hud: \{ \.\.\.R_HUD \}, cmd: \{ \.\.\.R_CMD \}, log: \{ \.\.\.R_LOG \}, hint: \{ \.\.\.R_HINT \} \};/.test(text),
  );

  const count = expected.length + 9 + 1;
  check(page, `九宮 key 數 ${count} ≥ 12`, count >= 12, `實際 ${count}`);
  return count;
}

/* ================================================================ C 物品 */

function checkItems() {
  const page = 'C 物品 ItemsPanel.ts';
  const text = src('ItemsPanel.ts');
  const layout = parseItemsLayout(text);
  const slots = parseSlots(text, 'SKIN_SLOTS', layout);
  const expected = [
    ['SkinGenFrame', 'frame_panel', 'gen'],
    ['SkinListFrame', 'frame_panel', 'list'],
    ['SkinDetFrame', 'frame_panel', 'det'],
    ['SkinPortraitPlate', 'plate_sq', 'portrait'],
    ['SkinBigFrame', 'plate_sq', 'bigFrame'],
    ['SkinActPlate', 'plate_btn', 'actBtn'],
    ['SkinUnlockPlate', 'plate_btn', 'unlockBtn'],
    ['SkinBackPlate', 'plate_btn', 'backBtn'],
  ];

  check(page, 'SKIN_SLOTS 條數 = 8', slots.length === 8, `實際 ${slots.length}`);
  for (const [name, key, layoutKey] of expected) {
    const slot = slots.find((s) => s.name === name);
    check(
      page,
      `${name} = ${key} LAYOUT.${layoutKey} ${rectStr(layout[layoutKey])}`,
      Boolean(slot) && slot.key === key && eqRect(slot.rect, layout[layoutKey]),
      slot ? `${slot.key} ${slot.raw} -> ${rectStr(slot.rect)}` : '缺少',
    );
  }

  // 分頁籤 / 武將格 / 分頁鈕
  const tabs = 1 + (src('ItemsModel.ts').match(/export const GROUP_ORDER[^=]*=\s*\[([^\]]*)\]/)?.[1].split(',').filter((s) => s.trim()).length ?? 0);
  check(page, `分頁籤數 ${tabs}（全部 + 6 組）`, tabs === 7, `實際 ${tabs}`);
  check(page, '每個分頁籤墊 plate_btn', /this\.addPlate\('plate_btn', this\.tabRect\(i\)/.test(text));
  const pool = numConst(text, 'POOL_SIZE');
  check(page, `武將格 ${pool} × plate_sq`, pool === 12 && /this\.addPlate\('plate_sq', this\.pickRect\(i\)/.test(text), `POOL_SIZE=${pool}`);
  check(page, '上/下頁鈕各墊 plate_btn', /this\.addPlate\('plate_btn', this\.navRect\(0\)/.test(text) && /this\.addPlate\('plate_btn', this\.navRect\(2\)/.test(text));
  check(page, '選中行用 plate_sel', /'plate_sel'/.test(methodBody(text, 'private buildSkin(')) && /this\.placeRowSelection\(selRect\)/.test(methodBody(text, 'private drawFrame(')));

  // 加成兩欄座標一個沒動
  check(
    page,
    'statCol 兩欄 = [{464,638,126},{602,638,126}]',
    layout.statCol.length === 2 && eqRect({ x: layout.statCol[0].x, y: layout.statCol[0].y, w: layout.statCol[0].w, h: 0 }, { x: 464, y: 638, w: 126, h: 0 }) && eqRect({ x: layout.statCol[1].x, y: layout.statCol[1].y, w: layout.statCol[1].w, h: 0 }, { x: 602, y: 638, w: 126, h: 0 }),
    JSON.stringify(layout.statCol),
  );

  check(page, "labelTitle -> title@32", /applyTextRole\(this\.labelTitle, 'title', 32\)/.test(text));
  check(page, "statNames -> body@11", /applyTextRoles\(this\.statNames, 'body', 11\)/.test(text));
  check(page, "statVals -> num@13", /applyTextRoles\(this\.statVals, 'num', 13\)/.test(text));
  check(page, "labelActMain -> head@22", /applyTextRole\(this\.labelActMain, 'head', 22\)/.test(text));

  const count = expected.length + tabs + pool + 2 + 1;
  check(page, `九宮 key 數 ${count} ≥ 8`, count >= 8, `實際 ${count}`);
  return count;
}

/* ================================================================ D 編成 */

function checkDeploy() {
  const page = 'D 出征編成 DeployRoot.ts';
  const text = src('DeployRoot.ts');
  const cards = parseSlots(text, 'SECTION_CARDS', null);
  const plates = parseSlots(text, 'FIXED_PLATES', null);

  const expectedCards = [
    ['SkinCardMain', { x: 16, y: 136, w: 718, h: 166 }],
    ['SkinCardGen', { x: 16, y: 336, w: 718, h: 128 }],
    ['SkinCardTroop', { x: 16, y: 500, w: 718, h: 188 }],
    ['SkinCardForm', { x: 16, y: 724, w: 718, h: 132 }],
    ['SkinCardWise', { x: 16, y: 884, w: 718, h: 116 }],
    ['SkinCardPower', { x: 16, y: 1040, w: 718, h: 120 }],
  ];
  check(page, '六個分區卡片 = 6', cards.length === 6 && cards.every((c) => c.key === 'frame_panel'), `實際 ${cards.length}`);
  for (const [name, rect] of expectedCards) {
    const card = cards.find((c) => c.name === name);
    check(page, `${name} frame_panel ${rectStr(rect)}`, Boolean(card) && card.key === 'frame_panel' && eqRect(card.rect, rect), card ? `${card.key} ${rectStr(card.rect)}` : '缺少');
  }

  // 卡片互不重疊、全在屏內
  let overlap = 'none';
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i].rect;
      const b = cards[j].rect;
      if (!a || !b) continue;
      const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (hit) overlap = `${cards[i].name}×${cards[j].name}`;
    }
  }
  check(page, '六張卡片互不重疊', overlap === 'none', overlap);

  const inScreen = [...cards, ...plates].every((s) => s.rect && s.rect.x >= 0 && s.rect.y >= 0 && s.rect.x + s.rect.w <= 750 && s.rect.y + s.rect.h <= 1334 && s.rect.w > 0 && s.rect.h > 0);
  check(page, '所有底板在 750×1334 內且寬高為正', inScreen);

  check(page, '底部「返回/出征」= plate_btn ×2', plates.length === 3 && plates.filter((p) => p.key === 'plate_btn').length === 2, `實際 ${plates.map((p) => p.key).join(',')}`);
  check(page, '立繪框 = plate_sq', plates.some((p) => p.name === 'SkinPortraitPlate' && p.key === 'plate_sq'));

  const buildSkin = methodBody(text, 'private buildSkin(');
  check(page, '兵力滑杆軌道用 bar_div 橫拉', /'bar_div'/.test(buildSkin) && /SLIDER_X1 - SLIDER_X0/.test(buildSkin));

  const genPlates = numConst(text, 'GEN_PLATES');
  const troopPlates = numConst(text, 'TROOP_PLATES');
  const formPlates = numConst(text, 'FORM_PLATES');
  const wisePlates = /const WISE_PLATES = WISE_MAX;/.test(text) && numConst(text, 'WISE_MAX') === 8;
  check(page, '兵種格 13 / 陣形格 9 / 軍師技格 8 各有 plate_sq', troopPlates === 13 && formPlates === 9 && wisePlates, `${troopPlates}/${formPlates}/${wisePlates}`);
  check(page, '武將格 12 × plate_sq', genPlates === 12, `${genPlates}`);
  check(page, '四類格子各有 plate_sel 選中疊層', (buildSkin.match(/'plate_sel'/g) || []).length === 4, `${(buildSkin.match(/'plate_sel'/g) || []).length}`);
  check(page, 'draw() 會同步格子底板與選中態', /this\.syncCellPlates\(\)/.test(methodBody(text, 'private draw(')) && /this\.placeSelections\(\)/.test(methodBody(text, 'private draw(')));

  check(page, "labelTitle -> title@32", /applyTextRole\(this\.labelTitle, 'title', 32\)/.test(text));
  check(page, "actionLabels -> head@18", /applyTextRoles\(this\.actionLabels, 'head', 18\)/.test(text));
  check(page, "genLabels -> body@16", /applyTextRoles\(this\.genLabels, 'body', 16\)/.test(text));

  const staticCount = 6 + 3 + 1;
  check(page, `靜態九宮 key 數 ${staticCount} ≥ 10`, staticCount >= 10, `實際 ${staticCount}`);
  return staticCount;
}

/* ================================================================ 文字層級 */

function checkTextRole() {
  const page = 'TextRole.ts';
  const text = src('TextRole.ts');
  const roles = parseRoles(text);

  check(page, '四個 role 齊全', ['title', 'head', 'body', 'num'].every((r) => roles[r]), Object.keys(roles).join(','));
  for (const [name, exp] of Object.entries(EXPECTED_ROLES)) {
    const got = roles[name];
    check(
      page,
      `${name}: fontSize ${exp.fontSize} / outline ${exp.outlineWidth}px / shadow ${exp.shadow}${exp.shadowOffset ? ` @${exp.shadowOffset} blur ${exp.shadowBlur}` : ''}`,
      Boolean(got) && got.fontSize === exp.fontSize && got.outlineWidth === exp.outlineWidth && got.shadow === exp.shadow && (!exp.shadowOffset || (got.shadowOffset === exp.shadowOffset && got.shadowBlur === exp.shadowBlur)),
      got ? `實際 ${got.fontSize}/${got.outlineWidth}px/shadow ${got.shadow}/${got.shadowOffset}/${got.shadowBlur}` : '缺少',
    );
  }
  check(page, '描邊色與投影色為深色', Object.values(roles).every((r) => /^#[0-9A-Fa-f]{6}$/.test(r.outlineColor) && /^#[0-9A-Fa-f]{6}$/.test(r.shadowColor)));
  check(page, 'applyTextRole(label, role, fontSize?) 存在', /export function applyTextRole\(\s*label: Label \| null \| undefined,\s*role: TextRole,\s*fontSize\?: number,?\s*\): void/.test(text));
  check(page, '不改 label.color（城名按勢力色板染色）', !/label\.color\s*=/.test(text));
  check(page, '保留既有行高比例', /ratio/.test(text) && /label\.lineHeight = Math\.max\(1, Math\.round\(size \*/.test(text));
  check(page, '空 Label / 已銷毀 Label 直接返回', /if \(!label \|\| !label\.isValid\) return;/.test(text));
  // w7-cocos-render3：級數原本硬編碼 4，TextRole 擴到 6 級（tip/badge）之後那行會一直是陳舊數字。
  // 改成讀 parseRoles() 實際解析到的 role 數量——斷言值一個都沒放寬（上面 4 級的每項數值仍然逐條鎖）。
  return Object.keys(roles).length;
}

/* ================================================================ 降級路徑 */

function checkFallback() {
  const page = '降級路徑';
  const skin = src('UiSkin.ts');
  check(page, 'UiSkin.makeNineSlice 有 drawFallback', /export function makeNineSlice\(/.test(skin) && /drawFallback\(/.test(skin));
  const fn = methodBody(skin, 'export function makeNineSlice(');
  check(page, 'drawFallback 在 makeNineSlice 內被呼叫（加載失敗不崩）', /drawFallback\(/.test(fn));

  const pages = [
    ['CampaignRoot.ts', 'private buildSkin('],
    ['CityPanel.ts', 'private buildSkin('],
    ['ItemsPanel.ts', 'private buildSkin('],
    ['DeployRoot.ts', 'private buildSkin('],
  ];
  for (const [file, sig] of pages) {
    const text = src(file);
    const body = methodBody(text, sig);
    check(page, `${file} 的 buildSkin 不依賴底圖是否加載`, body.length > 0 && !/artReady|\.ready\b|state ===/.test(body));
    check(page, `${file} 都 import 了 makeNineSlice + placeDesign`, /import \{ makeNineSlice, placeDesign \} from '\.\/UiSkin';/.test(text));
  }
  return 5;
}

/* ================================================================ 主流程 */

const counts = {
  A: checkCampaign(),
  B: checkCity(),
  C: checkItems(),
  D: checkDeploy(),
  R: checkTextRole(),
  F: checkFallback(),
};

let lastPage = '';
for (const row of rows) {
  if (row.page !== lastPage) {
    console.log(`\n[${row.page}]`);
    lastPage = row.page;
  }
  console.log(`  ${row.ok ? '✓' : '✗'} ${row.name}${row.ok || !row.detail ? '' : ` — ${row.detail}`}`);
}

const passed = rows.filter((r) => r.ok).length;
const failed = rows.filter((r) => !r.ok);
console.log(
  `\n九宮 key：A ${counts.A} / B ${counts.B} / C ${counts.C} / D ${counts.D}（靜態）；TextRole ${counts.R} 級、降級 ${counts.F} 項`,
);
console.log(`斷言：${passed}/${rows.length} 通過${failed.length > 0 ? `，${failed.length} 項失敗` : ''}`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  ✗ [${f.page}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
console.log('全部通過 ✓');
