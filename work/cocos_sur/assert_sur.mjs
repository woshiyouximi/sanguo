/**
 * R197 验收（判定端）：Cocos 招降面板「十栏真值」。
 *
 * 口径唯一标准是 web 的 `game/web/campaign.html:4917-4960 surFields()` +
 * `game/web/saves.js:836-909 generalRecord`：**有记录显真值、无记录显灰「—」**，
 * 绝不拿缺省 60 / 0 冒充。
 *
 * 跑法：`node work\cocos_sur\assert_sur.mjs`
 *   · 先调 `tsc -p work/cocos_sur/tsconfig.sim.json` 把真源码编成 `_sim/*.js`（CommonJS）；
 *   · 再用 `_sim/node_modules/cc` 的 mock `cc` 跑**真实编译产物**：core/roster 的读写、
 *     SurrenderModel 的 view/落账、SurrenderPanel 的十栏 Label 实测值 + 颜色。
 *   · `--no-build` 跳过编译，只跑断言（改断言时秒回）。
 *
 * 断言覆盖：
 *   A. 存档读写：`generalRecordOf` 无记录 null（不是 0 勝 0 敗）/ `noteGeneralResult` 落账夹上限；
 *   B. `moraleOf/tireOf` 无记录 null（**不套 web 缺省 60**）/ `generalLevelOf` / `equipNamesOf` 回落；
 *   C. 真路径 `surrenderCandidates(save, data)` → 卡片带真值，空档不填；
 *   D. `viewOf()` 透传 + `lossNow`；`finishOf()` 真实战后每卡 敗場 +1，mock 路径不落账；
 *   E. 面板 Label 实测：有记录四欄显数字、weapon 显武器名、无记录七欄灰「—」(#65707C)。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TSC = join(HERE, '..', '..', 'game', 'node_modules', 'typescript', 'bin', 'tsc');
const NO_BUILD = process.argv.includes('--no-build');

/* ------------------------------------------------------------------ */
/* 0. 编译真源码 → _sim（CommonJS）                                     */
/* ------------------------------------------------------------------ */
if (!NO_BUILD) {
  console.log('── 0. 编译 assets/scripts → _sim（tsc -p tsconfig.sim.json）');
  const built = spawnSync(process.execPath, [TSC, '-p', join(HERE, 'tsconfig.sim.json')], {
    cwd: HERE,
    encoding: 'utf8',
  });
  if (built.status !== 0) {
    console.error(built.stdout || '', built.stderr || '');
    console.error('tsc 编译失败，退出。');
    process.exit(1);
  }
  console.log('   tsc exit=' + built.status + '（无输出即无错）');
}

const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const R = require('./_sim/core/roster.js');
const M = require('./_sim/SurrenderModel.js');
const G = require('./_sim/GameState.js');
const P = require('./_sim/SurrenderPanel.js');

/* ------------------------------------------------------------------ */
/* 1. 断言器                                                           */
/* ------------------------------------------------------------------ */
let total = 0;
const failures = [];
const dumpLines = [];

function ok(label, cond, actual) {
  total += 1;
  if (!cond) failures.push(`${label} → 期望 true，实际 ${show(actual)}`);
}
function same(label, expected, actual) {
  total += 1;
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  if (a !== b) failures.push(`${label} → 期望 ${a}，实际 ${b}`);
}
function isNull(label, actual) {
  total += 1;
  if (actual !== null) failures.push(`${label} → 期望 null，实际 ${show(actual)}`);
}
function isUndef(label, actual) {
  total += 1;
  if (actual !== undefined) failures.push(`${label} → 期望 undefined，实际 ${show(actual)}`);
}
function show(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* ------------------------------------------------------------------ */
/* 2. 测试数据（照 work/cocos_surrender/panel_headless.mjs 的样板）     */
/* ------------------------------------------------------------------ */
const DATA = {
  generals: [
    { NAME: '張遼', STR: 92, INT: 78, Loyal: 52, CONSTANCY: 4 },
    { NAME: '程昱', STR: 62, INT: 90, Loyal: 20, CONSTANCY: 5 },
    { NAME: '守將', STR: 50, INT: 40, Loyal: 60, CONSTANCY: 3 },
    { NAME: '劉備', STR: 74, INT: 72, Loyal: 99, CONSTANCY: 9 },
  ],
  scenarios: [{ kings: [{ NAME: '劉備' }] }],
  troops: [],
  formations: [],
  magics: [],
  wises: [],
  terrains: [],
  items: [],
};

/**
 * 有记录：士氣 88 / 疲勞 41 / 勝 7 敗 3 / 等級 12 / 武器 古錠刀 / 物品 孫子兵法。
 * 忠誠由 `statOf()` 算：Loyal 52 − (10 − CONSTANCY 4) × 2 = 40（不是表的 52）。
 */
function saveFull() {
  return {
    owned: ['許昌'],
    wins: 3,
    losses: 1,
    month: 118,
    gold: 900,
    cities: { 許昌: { troops: 400, pop: 90000, money: 300 } },
    roster: { 許昌: ['曹操', '夏侯惇'] },
    captured: ['張遼', '程昱'],
    executed: [],
    morale: { 張遼: 88 },
    tire: { 張遼: 41 },
    generalRecord: { 張遼: { w: 7, l: 3 } },
    generalLevel: { 張遼: 12 },
    equip: { 張遼: { weapon: '古錠刀', book: '孫子兵法' } },
    weapon: { 程昱: '短弓' },
  };
}

/** 无记录：一张白档（只剩俘虜名单），七欄必须全灰。 */
function saveBare() {
  const s = saveFull();
  delete s.morale;
  delete s.tire;
  delete s.generalRecord;
  delete s.generalLevel;
  delete s.equip;
  delete s.weapon;
  return s;
}

/** 走真实存档路径：storage → GameState.loadSave()（会过 normalize 清洗）。 */
function realSave(raw) {
  G.resetCache();
  cc.__storage.set(G.SAVE_KEY, JSON.stringify(raw));
  return G.loadSave();
}

/* ------------------------------------------------------------------ */
/* 3. A：存档读写                                                      */
/* ------------------------------------------------------------------ */
console.log('── A. 存档读写（走 GameState.loadSave 的真实 normalize）');
const SAVE = realSave(saveFull());

same('A1 有记录：generalRecordOf(張遼)', { w: 7, l: 3 }, R.generalRecordOf(SAVE, '張遼'));
isNull('A2 无记录：generalRecordOf(程昱) = null（不是 0 勝 0 敗）', R.generalRecordOf(SAVE, '程昱'));
isNull('A3 空名：generalRecordOf(空串) = null', R.generalRecordOf(SAVE, ''));
isNull('A4 不存在的将：generalRecordOf(呂布) = null', R.generalRecordOf(SAVE, '呂布'));

same('A5 有记录：moraleOf(張遼)', 88, R.moraleOf(SAVE, '張遼'));
isNull('A6 无记录：moraleOf(程昱) = null（不拿 60 冒充）', R.moraleOf(SAVE, '程昱'));
same('A7 有记录：tireOf(張遼)', 41, R.tireOf(SAVE, '張遼'));
isNull('A8 无记录：tireOf(程昱) = null（不拿 0 冒充）', R.tireOf(SAVE, '程昱'));
same('A9 有记录：generalLevelOf(張遼)', 12, R.generalLevelOf(SAVE, '張遼'));
isNull('A10 无记录：generalLevelOf(程昱) = null（不做剧本等级回落）', R.generalLevelOf(SAVE, '程昱'));

same('A11 装备：equip 四槽优先（張遼.weapon）', '古錠刀', R.equipNamesOf(SAVE, '張遼').weapon);
same('A12 装备：book 槽（張遼.book）', '孫子兵法', R.equipNamesOf(SAVE, '張遼').book);
same('A13 装备：没戴的槽是空串（web `equipNamesOf` 同口径，卡片不填）', '', R.equipNamesOf(SAVE, '張遼').amulet);
same('A14 装备：回落 legacy 镜像表（程昱.weapon）', '短弓', R.equipNamesOf(SAVE, '程昱').weapon);
same('A15 装备：没马 → 空串（不拿静态表冒充）', '', R.equipNamesOf(SAVE, '張遼').horse);

/* ------------------------------------------------------------------ */
/* 4. B：落账 + normalize 清洗                                          */
/* ------------------------------------------------------------------ */
console.log('── B. 落账 noteGeneralResult（web saves.js:896-909 同口径）');
{
  const save = realSave(saveBare());
  isNull('B1 落账前：程昱无记录', R.generalRecordOf(save, '程昱'));
  same('B2 落账返回新行（web noteGeneralResult 同口径）', { w: 0, l: 1 }, R.noteGeneralResult(save, '程昱', false));
  same('B3 首败：程昱 → {w:0,l:1}', { w: 0, l: 1 }, R.generalRecordOf(save, '程昱'));
  R.noteGeneralResult(save, '程昱', true);
  same('B4 再胜：程昱 → {w:1,l:1}', { w: 1, l: 1 }, R.generalRecordOf(save, '程昱'));
  same('B5 落账不动其它将', null, R.generalRecordOf(save, '張遼'));
  same('B6 won 非布尔 → 不写档（返回 null）', null, R.noteGeneralResult(save, '程昱', 'win'));
  same('B7 非布尔后记录未变', { w: 1, l: 1 }, R.generalRecordOf(save, '程昱'));

  const big = { generalRecord: { 甲: { w: 9999, l: 9999 } } };
  R.noteGeneralResult(big, '甲', true);
  R.noteGeneralResult(big, '甲', false);
  same('B8 夹上限 9999（GENERAL_RECORD_MAX）', { w: 9999, l: 9999 }, R.generalRecordOf(big, '甲'));
  same('B9 常量 = 9999', 9999, R.GENERAL_RECORD_MAX);

  const dirty = realSave({ ...saveBare(), morale: { 張遼: 'x', 程昱: 120, 劉備: -5 } });
  same('B10 normalize 丢坏士气（非数）', null, R.moraleOf(dirty, '張遼'));
  same('B11 normalize 夹 0..100（120 → 100）', 100, R.moraleOf(dirty, '程昱'));
  same('B12 normalize 夹 0..100（-5 → 0）', 0, R.moraleOf(dirty, '劉備'));
  const clean = realSave(saveBare());
  ok(
    'B13 旧档 normalize 后不凭空长出 morale / generalRecord 键',
    !('morale' in clean) && !('generalRecord' in clean) && !('equip' in clean),
    Object.keys(clean),
  );
  ok('B14 旧档原有键还在（captured/roster/gold）', Array.isArray(clean.captured) && !!clean.roster && typeof clean.gold === 'number', Object.keys(clean));
}

/* ------------------------------------------------------------------ */
/* 5. C：真路径卡片                                                    */
/* ------------------------------------------------------------------ */
console.log('── C. surrenderCandidates(save, data) 真路径');
const cards = R.surrenderCandidates(SAVE, DATA);
const byName = (list, name) => list.find((c) => c.name === name) || null;
const zhang = byName(cards, '張遼');
const cheng = byName(cards, '程昱');

ok('C1 卡片里有張遼', zhang !== null, zhang && zhang.name);
same('C2 卡片帶士氣', 88, zhang.morale);
same('C3 卡片帶疲勞', 41, zhang.tire);
same('C4 卡片帶勝場', 7, zhang.wins);
same('C5 卡片帶敗場', 3, zhang.losses);
same('C6 卡片帶等級', 12, zhang.level);
same('C7 卡片帶武器（equip 优先）', '古錠刀', zhang.weapon);
same('C8 卡片帶物品（book 槽）', '孫子兵法', zhang.item);
isUndef('C9 无记录将不填士气（程昱）', cheng.morale);
isUndef('C10 无记录将不填勝場（程昱）', cheng.wins);
isUndef('C11 无记录将不填等級（程昱）', cheng.level);
same('C12 无记录将武器回落 legacy（程昱.短弓）', '短弓', cheng.weapon);
isUndef('C13 无记录将不填物品（程昱）', cheng.item);
same('C14 武力/智力/忠誠 未受影响', [92, 78, 40], [zhang.str, zhang.int, zhang.loyal]);

{
  const bare = R.surrenderCandidates(realSave(saveBare()), DATA);
  const b = byName(bare, '張遼');
  isUndef('C15 空档：卡片不带士氣', b.morale);
  isUndef('C16 空档：卡片不带疲勞', b.tire);
  isUndef('C17 空档：卡片不带勝場', b.wins);
  isUndef('C18 空档：卡片不带等級', b.level);
  isUndef('C19 空档：卡片不带武器', b.weapon);
  isUndef('C20 空档：卡片不带物品', b.item);
}

/* ------------------------------------------------------------------ */
/* 6. D：view + 落账                                                   */
/* ------------------------------------------------------------------ */
console.log('── D. viewOf() 透传 + lossNow + finishOf() 落账');
{
  const v = M.viewOf(M.openOf(SAVE, DATA, '許昌'), '張遼');
  same('D1 view 帶士氣', 88, v.morale);
  same('D2 view 帶疲勞', 41, v.tire);
  same('D3 view 帶勝場', 7, v.wins);
  same('D4 view 帶敗場', 3, v.losses);
  same('D5 view 帶等級', 12, v.level);
  same('D6 view 帶武器', '古錠刀', v.weapon);
  same('D7 view 帶物品', '孫子兵法', v.item);
  same('D8 真实战后 lossNow = true（web surBattleReal）', true, v.lossNow);

  const grey = M.viewOf(M.openOf(realSave(saveBare()), DATA, '許昌', { battle: false }), '張遼');
  same('D9 mock 路径 lossNow = false', false, grey.lossNow);
  isUndef('D10 mock 路径 view 不带士氣', grey.morale);
  isUndef('D11 mock 路径 view 不带勝場', grey.wins);
  same('D12 viewOf 保留原有字段（str/int/loyal）', [92, 78, 40], [v.str, v.int, v.loyal]);
}

{
  const save = realSave(saveFull());
  const state = M.openOf(save, DATA, '許昌');
  state.picks = { 張遼: 'recruit', 程昱: 'release' };
  const out = M.finishOf(state);
  ok('D13 finishOf 返回结果', out !== null && typeof out.text === 'string', out && out.text);
  same('D14 真实战后：張遼 敗 +1（3 → 4）', { w: 7, l: 4 }, R.generalRecordOf(save, '張遼'));
  same('D15 真实战后：程昱 首败（无记录 → 0 勝 1 敗）', { w: 0, l: 1 }, R.generalRecordOf(save, '程昱'));
  same('D16 落库照旧：captured 已清空', [], save.captured);
}
{
  const save = realSave(saveFull());
  const state = M.openOf(save, DATA, '許昌', { battle: false });
  M.finishOf(state);
  same('D17 mock 路径不落账：張遼 仍是 7 勝 3 敗', { w: 7, l: 3 }, R.generalRecordOf(save, '張遼'));
  isNull('D18 mock 路径不落账：程昱 仍无记录', R.generalRecordOf(save, '程昱'));
}

/* ------------------------------------------------------------------ */
/* 7. E：surFieldCells 十欄（纯函数，web surFields 逐项）               */
/* ------------------------------------------------------------------ */
console.log('── E. surFieldCells()（web surFields 同口径）');
{
  const v = M.viewOf(M.openOf(SAVE, DATA, '許昌'), '張遼');
  const cells = P.surFieldCells(v);
  same('E1 十个格子', 10, cells.length);
  same(
    'E2 欄位顺序 = web',
    ['等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數'],
    cells.map((c) => c.key),
  );
  same(
    'E3 有记录十欄全真值',
    ['12', '88', '41', '92', '78', '40', '古錠刀', '孫子兵法', '7', '4'],
    cells.map((c) => c.value),
  );

  const bare = M.viewOf(M.openOf(realSave(saveBare()), DATA, '許昌', { battle: false }), '張遼');
  const grey = P.surFieldCells(bare);
  same('E4 无记录七欄 = null（灰「—」）', [null, null, null, null, null, null, null], [0, 1, 2, 6, 7, 8, 9].map((k) => grey[k].value));
  same('E5 无记录时武力/智力/忠誠 照旧', ['92', '78', '40'], [3, 4, 5].map((k) => grey[k].value));

  const onlyLoss = P.surFieldCells({ ...bare, wins: undefined, losses: undefined, lossNow: true });
  same('E6 仅 lossNow：敗場數 = 1、勝場數仍「—」', [null, '1'], [onlyLoss[8].value, onlyLoss[9].value]);
  const zero = P.surFieldCells({ ...bare, wins: 0, losses: 0, lossNow: false });
  same('E7 有记录且 0 勝 0 敗 → 显 0（不是「—」）', ['0', '0'], [zero[8].value, zero[9].value]);
  const blank = P.surFieldCells({ ...bare, weapon: '  ', item: '—' });
  same('E8 武器/物品 空串与「—」算没有', [null, null], [blank[6].value, blank[7].value]);
}

/* ------------------------------------------------------------------ */
/* 8. F：面板实测 Label（mock cc 跑真实 SurrenderPanel）                */
/* ------------------------------------------------------------------ */
console.log('── F. 面板 Label 实测（mock cc）');
const { SurrenderPanel } = P;

function makeRoot(name) {
  const root = new cc.Node(name);
  root.addComponent(cc.UITransform).setContentSize(750, 1334);
  return root;
}
function childOf(node, name) {
  return node.getChildByName(name);
}
function labelOf(node, name) {
  const n = childOf(node, name);
  return n ? n.getComponent('Label') : null;
}
function textOf(node, name) {
  const l = labelOf(node, name);
  return l ? String(l.string) : null;
}
function hexOf(color) {
  const p = (v) => {
    const s = Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  };
  return '#' + p(color.r) + p(color.g) + p(color.b) + (color.a >= 255 ? '' : '@' + p(color.a));
}
/** 一张卡的十欄 [key 文字, value 文字, value 颜色] */
function fieldsOf(panel, i) {
  const row = [];
  for (let k = 0; k < 10; k += 1) {
    const l = labelOf(panel.node, `SurFieldV${i}_${k}`);
    row.push({
      key: textOf(panel.node, `SurFieldK${i}_${k}`),
      text: l ? String(l.string) : null,
      color: l ? hexOf(l.color) : null,
    });
  }
  return row;
}
function printDump(tag, panel, i, name) {
  const row = fieldsOf(panel, i);
  const line = row.map((r) => `${r.key} ${r.text}${r.text === '—' ? '(灰' + r.color + ')' : ''}`).join(' · ');
  dumpLines.push(`[${tag}] 卡${i} ${name}：${line}`);
  console.log(`   [${tag}] 卡${i} ${name}`);
  for (const r of row) console.log(`      ${String(r.key).padEnd(4)} ${String(r.text).padEnd(10)} ${r.color}`);
  return row;
}

{
  const root = makeRoot('RootFull');
  const panel = SurrenderPanel.show(root, { save: SAVE, data: DATA, home: '許昌' });
  const d = panel.debug();
  same('F1 面板开起来（两张卡）', 2, d.cards);
  const row = printDump('有记录', panel, 0, '張遼');
  same('F2 面板 等級 = 12', '12', row[0].text);
  same('F3 面板 士氣 = 88', '88', row[1].text);
  same('F4 面板 疲勞 = 41', '41', row[2].text);
  same('F5 面板 武器 = 古錠刀', '古錠刀', row[6].text);
  same('F6 面板 物品 = 孫子兵法', '孫子兵法', row[7].text);
  same('F7 面板 勝場數 = 7', '7', row[8].text);
  same('F8 面板 敗場數 = 3+1 = 4（真实战后）', '4', row[9].text);
  same(
    'F9 七项真值都是正文色 #E9E4D8',
    ['#E9E4D8', '#E9E4D8', '#E9E4D8', '#E9E4D8', '#E9E4D8', '#E9E4D8', '#E9E4D8'],
    [0, 1, 2, 6, 7, 8, 9].map((k) => row[k].color),
  );
  ok(
    'F10 debug().fields 里带真值（士氣 88 / 敗場數 4）',
    String(d.fields[0]).includes('士氣 88') && String(d.fields[0]).includes('敗場數 4'),
    d.fields[0],
  );
  const row2 = printDump('有记录', panel, 1, '程昱');
  same('F11 无士气记录的卡：士氣「—」', '—', row2[1].text);
  same('F12 无士气记录的卡：士氣灰 #65707C', '#65707C', row2[1].color);
  same('F13 无勝場记录的卡：勝場數「—」', '—', row2[8].text);
  same('F14 只有 legacy 武器：武器 = 短弓', '短弓', row2[6].text);
  same('F15 无记录的败场：0+1 = 1', '1', row2[9].text);
  panel.close();
}

{
  const bare = realSave(saveBare());
  const root = makeRoot('RootGrey');
  const state = M.openOf(bare, DATA, '許昌', { battle: false });
  const panel = SurrenderPanel.show(root, { save: bare, data: DATA, home: '許昌' }, state);
  const row = printDump('无记录', panel, 0, '張遼');
  same('F16 无记录：七欄全「—」', ['—', '—', '—', '—', '—', '—', '—'], [0, 1, 2, 6, 7, 8, 9].map((k) => row[k].text));
  same(
    'F17 无记录：七欄全灰 #65707C',
    ['#65707C', '#65707C', '#65707C', '#65707C', '#65707C', '#65707C', '#65707C'],
    [0, 1, 2, 6, 7, 8, 9].map((k) => row[k].color),
  );
  same('F18 无记录：武力/智力/忠誠 仍是真值 + 正文色', ['92', '78', '40', '#E9E4D8'], [row[3].text, row[4].text, row[5].text, row[3].color]);
  same(
    'F19 无记录：欄名不变（十欄都在）',
    ['等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數'],
    row.map((r) => r.key),
  );
  panel.close();
}

/* ------------------------------------------------------------------ */
/* 9. 汇总                                                             */
/* ------------------------------------------------------------------ */
console.log('\n── 实测 Label dump（面板真节点，mock cc）');
for (const line of dumpLines) console.log('   ' + line);

console.log(`\n断言 ${total} 条，失败 ${failures.length} 条`);
if (failures.length) {
  for (const f of failures) console.log(' ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
