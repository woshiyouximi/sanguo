// 君主陣亡 → 選繼承人 / 戰報分組翻頁 的純邏輯斷言（v18-cocos-monarch-ui）。
//
// 純 node：不 import 'cc'、不起瀏覽器、不碰 localStorage。
// 做法和 work/cocos_monarch85/probe.mjs 同一條路：把 CampaignRoot.ts 的
//   // #region 戰報 / 君主繼承 / 城點取色（純邏輯）
// 逐字抽出來（前綴補 `import * as M from './MonarchModel'`），連 MonarchModel.ts 一起
// ts.transpileModule 成 CommonJS 丟進 .build/ 再 require —— 所以斷言跑的是**磁碟上的原始碼**，
// 不是複製品（改壞了 CampaignRoot.ts 這裡就會紅）。
//
//   node F:\sanguo\work\cocos_monarch_ui\succession_assert.mjs
//
// 覆蓋（≥12 條，實際 38 條）：
//   ① 候選排序（同族 > 血親忠誠 > 忠 > 武智）與排除規則    ② 玩家君主死亡 → prompt
//   ③ AI 君主不經彈窗（AiRunner 無面板引用 + kingDeath 自動落地）  ④ 無候選 → 滅亡
//   ⑤ 落庫後 monarch/force 正確（勢力 id 不變、城池不動）   ⑥ 戰報月份分組 + 翻頁邊界
//   ⑦ 接線字串（翻頁判定先於折疊、標題文案、分組底色）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = 'F:\\sanguo\\game\\cocos\\assets\\scripts';
const TS_ENTRY = 'F:\\sanguo\\game\\node_modules\\typescript';
const CAMPAIGN = path.join(SCRIPTS, 'CampaignRoot.ts');
const MONARCH = path.join(SCRIPTS, 'MonarchModel.ts');
const AI_RUNNER = path.join(SCRIPTS, 'AiRunner.ts');

const REGION_HEAD = '// #region 戰報 / 君主繼承 / 城點取色（純邏輯）';

/* ------------------------------------------------------------------ 斷言收集 */
let total = 0;
const failed = [];

function ok(name, cond, detail = '') {
  total += 1;
  if (cond) {
    console.log('PASS  ' + name + (detail ? '  ' + detail : ''));
    return true;
  }
  console.log('FAIL  ' + name + (detail ? '  ' + detail : ''));
  failed.push(name);
  return false;
}

function eq(name, got, want) {
  return ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

function noThrow(name, fn) {
  try {
    const back = fn();
    return ok(name, true, JSON.stringify(back).slice(0, 120));
  } catch (err) {
    return ok(name, false, '拋錯了：' + String(err && err.message ? err.message : err).slice(0, 120));
  }
}

/* ------------------------------------------------------- 從 .ts 抽出純邏輯並編譯 */
function readText(file) {
  const s = fs.readFileSync(file, 'utf8');
  if (!s.trim()) throw new Error('空檔案: ' + file);
  return s;
}

function regionOf(src) {
  const start = src.indexOf(REGION_HEAD);
  if (start < 0) throw new Error('找不到 region 起點: ' + REGION_HEAD);
  const end = src.indexOf('// #endregion', start);
  if (end < 0) throw new Error('找不到 region 終點');
  return src.slice(start, end + '// #endregion'.length);
}

const ts = require(TS_ENTRY);
if (!ts || typeof ts.transpileModule !== 'function') throw new Error('typescript 載入失敗: ' + TS_ENTRY);

const buildDir = path.join(HERE, '.build');
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'package.json'), '{ "type": "commonjs" }\n', 'utf8');

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  removeComments: false,
};

function emit(file, src) {
  const out = ts.transpileModule(src, { compilerOptions, fileName: file }).outputText;
  const target = path.join(buildDir, path.basename(file).replace(/\.ts$/, '.js'));
  fs.writeFileSync(target, out, 'utf8');
  return target;
}

const campaignSrc = readText(CAMPAIGN);
const region = regionOf(campaignSrc);
ok('region 抽出成功（不含 cc / 不含相對 import）', region.length > 20000 && region.indexOf("from 'cc'") < 0 && region.indexOf('from "cc"') < 0, `region ${region.length} 字`);
ok('region 尾巴是 #endregion（逐字切片，沒有截斷）', region.trimEnd().endsWith('// #endregion'), region.trimEnd().slice(-20));

emit(MONARCH, readText(MONARCH));
const regionPath = emit('Region.ts', "import * as M from './MonarchModel';\n" + region);
const R = require(regionPath);
const M = require(path.join(buildDir, 'MonarchModel.js'));

/* ---------------------------------------------------------------- 固定測試資料 */
const OWNERS = { 新野: '劉備', 江夏: '劉備', 襄陽: '劉備', 許昌: '曹操', 鄴: '曹操' };
const CITY_OFFICERS = {
  新野: [
    { name: '劉備', str: 75, int: 74, loyal: 100, loyalKing: '', status: '登', constancy: 99 },
    { name: '劉禪', str: 30, int: 40, loyal: 80, loyalKing: '劉備', status: '登', constancy: 50 },
    { name: '張飛', str: 98, int: 30, loyal: 95, loyalKing: '劉備', status: '登', constancy: 90 },
  ],
  江夏: [
    { name: '趙雲', str: 96, int: 76, loyal: 90, loyalKing: '劉備', status: '登', constancy: 95 },
    { name: '傅士仁', str: 40, int: 30, loyal: 30, loyalKing: '', status: '俘', constancy: 10 },
  ],
  襄陽: [
    { name: '馬超', str: 97, int: 44, loyal: 70, loyalKing: '', status: '登', constancy: 60 },
    { name: '黃忠', str: 93, int: 58, loyal: 60, loyalKing: '', status: '登', constancy: 55 },
    { name: '山賊甲', str: 50, int: 20, loyal: 20, loyalKing: '', status: '野', constancy: 5 },
  ],
  許昌: [{ name: '夏侯惇', str: 90, int: 60, loyal: 90, loyalKing: '曹操', status: '登', constancy: 90 }],
  鄴: [{ name: '曹丕', str: 70, int: 85, loyal: 80, loyalKing: '曹操', status: '登', constancy: 80 }],
};

const DEAD = '劉備';
const PLAYER_FORCE = '劉備';

function makeSave() {
  return {
    month: 7,
    monarch: PLAYER_FORCE,
    monarchSince: 1,
    king: PLAYER_FORCE,
    force: PLAYER_FORCE,
    owned: ['新野', '江夏', '襄陽'],
    cities: {
      新野: { name: '新野', owner: PLAYER_FORCE, garrison: ['劉備'] },
      江夏: { name: '江夏', owner: PLAYER_FORCE, garrison: ['趙雲'] },
      襄陽: { name: '襄陽', owner: PLAYER_FORCE, garrison: ['馬超'] },
      許昌: { name: '許昌', owner: '曹操', garrison: ['夏侯惇'] },
    },
    forces: {
      [PLAYER_FORCE]: { id: PLAYER_FORCE, king: PLAYER_FORCE, flag: 0, alive: true, cities: ['新野', '江夏', '襄陽'], ts: 1 },
      曹操: { id: '曹操', king: '曹操', flag: 1, alive: true, cities: ['許昌', '鄴'], ts: 1 },
    },
    fate: {},
  };
}

function playSave() {
  return Object.assign(makeSave(), { monarch: PLAYER_FORCE, king: PLAYER_FORCE, force: PLAYER_FORCE });
}

const officers = R.successionOfficers(
  ['新野', '江夏', '襄陽', '許昌'],
  (city) => OWNERS[city] || '',
  (city) => CITY_OFFICERS[city] || [],
  PLAYER_FORCE,
);

/* ===================================================================== ① 候選排序 */
console.log('\n— ① 繼承候選排序（同族 > 血親忠誠 > 忠 > 武智） —');
const cands = R.successionCandidates(PLAYER_FORCE, officers, DEAD, DEAD);
eq(
  '①a 候選名單＝我方在職武將，排除死者/俘虜/在野',
  cands.map((c) => c.name),
  ['劉禪', '張飛', '趙雲', '馬超', '黃忠'],
);
ok(
  '①b 同族（劉禪，血親 2 分）排第一',
  cands[0].name === '劉禪' && cands[0].clan === true && cands[0].score === 2 * 10000 + 80 * 100 + 30 + 40,
  `score=${cands[0].score}`,
);
ok(
  '①c 血親忠誠（loyalKing=死者）壓過能力：張飛 > 趙雲 > 馬超',
  cands[1].name === '張飛' && cands[2].name === '趙雲' && cands[3].name === '馬超',
  cands.map((c) => `${c.name}:${c.score}`).join(' '),
);
let desc = true;
for (let i = 1; i < cands.length; i += 1) if (cands[i - 1].score < cands[i].score) desc = false;
ok('①d score 非遞增（降序排好）', desc, cands.map((c) => c.score).join(' > '));
ok(
  '①e 候選帶城名（面板要顯示「駐 X」）',
  cands[0].city === '新野' && cands[2].city === '江夏' && cands[3].city === '襄陽',
  cands.map((c) => `${c.name}@${c.city}`).join(' '),
);
eq(
  '①f successionOfficers 只摊平我方城（敵城武將不進來）',
  officers.map((o) => `${o.name}@${o.city}`),
  ['劉備@新野', '劉禪@新野', '張飛@新野', '趙雲@江夏', '傅士仁@江夏', '馬超@襄陽', '黃忠@襄陽', '山賊甲@襄陽'],
);
ok(
  '①g force 傳空字串 = 不過濾（讓位候選要看全城）',
  R.successionOfficers(['許昌'], (c) => OWNERS[c] || '', (c) => CITY_OFFICERS[c] || [], '').length === 1,
);

/* ============================================================ ② 玩家君主死亡觸發 */
console.log('\n— ② 玩家君主死亡 → 彈窗（planMonarchDeath 純分派） —');
const pPrompt = R.planMonarchDeath(DEAD, 3, false, false);
ok('②a 有城 + 君主死了 → prompt', pPrompt.kind === 'prompt' && pPrompt.reason === 'king-dead' && pPrompt.dead === DEAD, JSON.stringify(pPrompt));
eq('②b prompt 帶剩餘城數（面板標題用）', pPrompt.remaining, 3);
const pAlive = R.planMonarchDeath('', 3, false, false);
ok('②c 沒判出死者 → none（不彈）', pAlive.kind === 'none' && pAlive.reason === 'alive', JSON.stringify(pAlive));
const pPending = R.planMonarchDeath(DEAD, 3, true, false);
ok('②d 已有繼承窗在等 → none（不重複彈）', pPending.kind === 'none' && pPending.reason === 'pending', JSON.stringify(pPending));
const pExtinct = R.planMonarchDeath(DEAD, 0, false, true);
ok('②e 已滅亡 → none（刷頁面不復活）', pExtinct.kind === 'none' && pExtinct.reason === 'extinct', JSON.stringify(pExtinct));
const pNoCity = R.planMonarchDeath(DEAD, 0, false, false);
ok('②f 0 城 → ending（交給 EndingPanel，不彈繼承窗）', pNoCity.kind === 'ending' && pNoCity.reason === 'no-city', JSON.stringify(pNoCity));
eq('②g 0 城時 remaining 歸零', pNoCity.remaining, 0);
const pNeg = R.planMonarchDeath(DEAD, -5, false, false);
ok('②h 負城數收斂成 0（不會負數進文案）', pNeg.kind === 'ending' && pNeg.remaining === 0, JSON.stringify(pNeg));

/* ================================================= ③ AI 君主不走彈窗（結構 + 自動落地） */
console.log('\n— ③ AI 勢力照舊自動繼承，不被彈窗攔住 —');
const aiSrc = readText(AI_RUNNER);
ok(
  '③a AiRunner.ts 不引用面板/繼承窗（AI 根本叫不到 openSuccession）',
  ['openSuccession', 'MonarchPanel', 'successionStart', 'successionLand', 'planMonarchDeath'].every((k) => aiSrc.indexOf(k) < 0),
);
const openCount = (campaignSrc.match(/openSuccession\(/g) || []).length;
const deathIdx = campaignSrc.indexOf('private checkMonarchDeath(): void {');
const commitIdx = campaignSrc.indexOf('private commitSuccession(name: string): void {');
const openIdx = campaignSrc.indexOf('openSuccession(view, (name: string)');
ok('③b 全檔只有一處 openSuccession，且在 checkMonarchDeath 裡', openCount === 1 && deathIdx > 0 && openIdx > deathIdx && openIdx < commitIdx, `count=${openCount} at=${openIdx}`);
ok('③c 觸發口徑取玩家勢力（this.playerForce()），AI 的死者在 AiRunner 內自行結算', campaignSrc.slice(deathIdx, commitIdx).indexOf('const force = this.playerForce();') > 0);
ok('③d checkMonarchDeath 只在 start()/advance() 兩處被叫（大地圖專屬）', (campaignSrc.match(/this\.checkMonarchDeath\(\);/g) || []).length === 2, String((campaignSrc.match(/this\.checkMonarchDeath\(\);/g) || []).length));
const aiSave = makeSave();
const aiKill = M.kingDeath(aiSave, '曹操', { month: 9, dead: '曹操', officers: [{ name: '曹操', str: 80, int: 80, loyal: 100, status: '登' }, { name: '曹丕', str: 70, int: 85, loyal: 80, status: '登' }] });
ok('③e AI 君主陣亡 → kingDeath 直接選出繼任者（無彈窗、無回呼）', aiKill.dead === true && aiKill.extinct === false && aiKill.heir === '曹丕', JSON.stringify({ heir: aiKill.heir, reason: aiKill.reason }));
ok('③f AI 勢力 id 不變、forces.king 已換人', aiSave.forces['曹操'].king === '曹丕' && aiSave.forces['曹操'].alive === true, aiSave.forces['曹操'].king);
ok('③g AI 繼承不碰玩家欄位（monarch/force/king 原樣）', aiSave.monarch === PLAYER_FORCE && aiSave.force === PLAYER_FORCE && aiSave.king === PLAYER_FORCE, `${aiSave.monarch}/${aiSave.force}/${aiSave.king}`);

/* =========================================================== ④ 無候選 → 走滅亡路徑 */
console.log('\n— ④ 沒有繼任候選 → 滅亡（M.extinguish） —');
const loneSave = playSave();
const loneOfficers = R.successionOfficers(['新野'], () => PLAYER_FORCE, () => [{ name: '劉備', str: 75, int: 74, loyal: 100, status: '登' }], PLAYER_FORCE);
const loneState = R.successionStart({ force: PLAYER_FORCE, dead: DEAD, month: 7, remaining: 1, officers: loneOfficers, king: DEAD });
ok('④a 只剩死者本人 → phase extinct（沒有候選）', loneState.phase === 'extinct' && loneState.candidates.length === 0, `${loneState.phase} cand=${loneState.candidates.length}`);
const loneView = R.successionView(loneState);
ok('④b 標題走「勢力滅亡」、附「確定：勢力滅亡」', loneView.extinct === true && loneView.title.indexOf('勢力滅亡') > 0 && loneView.rows.some((r) => r.tone === 'confirm' && r.text.indexOf('確定') >= 0), loneView.title);
ok('④c 有城但無候選時的殘將提示帶城數', R.successionView(R.successionStart({ force: PLAYER_FORCE, dead: DEAD, month: 7, remaining: 5, officers: [], king: DEAD })).rows.some((r) => r.text.indexOf('還有 5 城無主') >= 0));
ok('④d 城已丟光的殘將提示是「名下已無城池」', R.successionView(R.successionStart({ force: PLAYER_FORCE, dead: DEAD, month: 7, remaining: 0, officers: [], king: DEAD })).rows.some((r) => r.text.indexOf('名下已無城池') >= 0));
const loneOut = R.successionLand(loneSave, loneState);
ok('④e 落庫：勢力滅亡 + 殘將結算（reason=extinct）', loneOut.ok === true && loneOut.extinct === true && loneOut.reason === 'extinct', JSON.stringify({ ok: loneOut.ok, reason: loneOut.reason }));
ok('④f 落庫：forces[我方].alive=false、城池清空、endedAt 寫入', loneSave.forces[PLAYER_FORCE].alive === false && JSON.stringify(loneSave.forces[PLAYER_FORCE].cities) === '[]' && loneSave.forces[PLAYER_FORCE].endedAt === 7);
ok('④g 落庫：我方 monarch/force/king 全清（頂欄回「未選」）', loneSave.monarch === '' && loneSave.force === '' && loneSave.king === '' && M.monarchOf(loneSave) === '', `${loneSave.monarch}|${loneSave.force}|${loneSave.king}`);
ok('④h 滅亡戰報行含「勢力滅亡」、顏色走 lost', loneOut.line.indexOf('勢力滅亡') > 0 && loneOut.kind === 'lost', loneOut.line);

/* ================================================ ⑤ 落庫後 monarch/force/城池正確 */
console.log('\n— ⑤ 玩家點選 → 落庫（M.inheritForce，勢力名號不變） —');
const winSave = playSave();
const state = R.successionStart({ force: PLAYER_FORCE, dead: DEAD, month: 7, remaining: 3, officers, king: DEAD });
ok('⑤a successionStart：有候選 → phase prompt、候選 5 人', state.phase === 'prompt' && state.candidates.length === 5, `${state.phase} cand=${state.candidates.length}`);
const pickView = R.successionView(state);
ok('⑤b 標題「君主陣亡 · 選繼承人」、副標帶勢力/死者/年月', pickView.title === '君主陣亡 · 選繼承人' && pickView.sub.indexOf(PLAYER_FORCE) >= 0 && pickView.sub.indexOf(DEAD) >= 0 && pickView.sub.indexOf('1年7月') >= 0, pickView.sub);
ok('⑤c 候選列文字含武/智/忠三圍', pickView.rows[0].text.indexOf('武 30') > 0 && pickView.rows[0].text.indexOf('智 40') > 0 && pickView.rows[0].text.indexOf('忠 80') > 0, pickView.rows[0].text);
const winOut = R.successionLand(winSave, state, '張飛');
ok('⑤d 落庫成功（ok / heir=張飛 / extinct=false）', winOut.ok === true && winOut.heir === '張飛' && winOut.extinct === false, JSON.stringify({ ok: winOut.ok, heir: winOut.heir, reason: winOut.reason }));
ok('⑤e 有效君主換人：monarchOf(save) === 張飛', M.monarchOf(winSave) === '張飛', M.monarchOf(winSave));
ok('⑤f 勢力 id 不變（save.force / forceIdOf 都是原勢力）', winSave.force === PLAYER_FORCE && M.forceIdOf(winSave) === PLAYER_FORCE, `${winSave.force}`);
ok('⑤g forces[我方].king 換人、alive 維持', winSave.forces[PLAYER_FORCE].king === '張飛' && winSave.forces[PLAYER_FORCE].alive === true);
eq('⑤h 城池歸屬與 owned 完全沒動（換君主 ≠ 換勢力）', [winSave.owned, winSave.cities['新野'].owner], [['新野', '江夏', '襄陽'], PLAYER_FORCE]);
ok('⑤i 別的勢力（曹操）一字未改', winSave.forces['曹操'].king === '曹操' && winSave.forces['曹操'].alive === true);
ok('⑤j 戰報行：「劉備 君主陣亡：張飛 繼位（勢力存續 · 名號不變）」', winOut.line.indexOf('君主陣亡：張飛 繼位') > 0 && winOut.line.indexOf('名號不變') > 0, winOut.line);
ok('⑤k monarchOf 優先 monarch（save.king 仍是舊主，monarch 才是新君）', winSave.monarch === '張飛' && winSave.king === PLAYER_FORCE && M.monarchOf(winSave) === '張飛', `monarch=${winSave.monarch} king=${winSave.king}`);
const noPickSave = playSave();
const noPick = R.successionLand(noPickSave, state, '');
ok('⑤l 不點名（空字串）→ 預設第 0 位候選（劉禪）', noPick.ok === true && noPick.heir === '劉禪', noPick.heir);

/* ============================================================ ⑥ 戰報分組與翻頁邊界 */
console.log('\n— ⑥ 戰報「本月」分組 + 8 行一頁的翻頁邊界 —');
ok('⑥a BATTLE_LOG_MAX 仍是 8（面板行數，cocos_monarch85/probe.mjs 釘死）', R.BATTLE_LOG_MAX === 8, String(R.BATTLE_LOG_MAX));
ok('⑥b BATTLE_LOG_KEEP=40（緩衝放大，落盤不再 slice(-8)）', R.BATTLE_LOG_KEEP === 40, String(R.BATTLE_LOG_KEEP));
let buf = [];
for (let i = 0; i < 5; i += 1) buf = R.battleLogPush(buf, R.battleLogLine(3, `三月第 ${i + 1} 條`, 'info'), R.BATTLE_LOG_KEEP);
for (let i = 0; i < 6; i += 1) buf = R.battleLogPush(buf, R.battleLogLine(4, `四月第 ${i + 1} 條`, 'atk'), R.BATTLE_LOG_KEEP);
eq('⑥c 11 條跨兩月 → 13 列（2 個組頭）→ 2 頁', [buf.length, R.battleLogPage(buf, 0, 8, 4).pages], [11, 2]);
const pg0 = R.battleLogPage(buf, 0, 8, 4);
ok('⑥d 第 1 列是「本月」組頭（現在正好四月）', pg0.rows[0].month === true && pg0.rows[0].s === '▼ 本月 · 1年4月', pg0.rows[0].s);
eq('⑥e 第 1 頁 8 列（組頭也佔列）', pg0.rows.length, 8);
eq('⑥f 組頭不寫時間列（標題自帶年月）', pg0.rows[0].t, '');
ok('⑥g 組內最新的在前（四月第 6 條在最上面）', pg0.rows[1].s.indexOf('四月第 6 條') >= 0, pg0.rows[1].s);
const pg0b = R.battleLogPage(buf, 0, 8, 5);
ok('⑥h 現在已五月（本月沒打仗）→ 不再標「本月」，只寫年月', pg0b.rows[0].s === '▼ 1年4月', pg0b.rows[0].s);
const pg1 = R.battleLogPage(buf, 1, 8, 4);
eq('⑥i 第 2 頁 from === 8、剩 5 列', [pg1.from, pg1.rows.length], [8, 5]);
ok('⑥j 第 2 頁全是三月正文（組頭只在組首那一頁）', pg1.rows.every((r) => r.month === false && r.s.indexOf('三月第') >= 0), pg1.rows.map((r) => r.s).join(' | ').slice(0, 120));
ok('⑥k 頁碼夾取：-5 → 0、99 → 最後一頁', R.battleLogPage(buf, -5, 8, 4).page === 0 && R.battleLogPage(buf, 99, 8, 4).page === 1);
const empty = R.battleLogPage([], 0, 8, 4);
ok('⑥l 空戰報也是 1 頁、0 列（標題走「尚無戰事」）', empty.pages === 1 && empty.page === 0 && empty.rows.length === 0);
let same = [];
for (let i = 0; i < 10; i += 1) same = R.battleLogPush(same, R.battleLogLine(4, `同月 ${i + 1}`, 'win'), R.BATTLE_LOG_KEEP);
const s0 = R.battleLogPage(same, 0, 8, 4);
const s1 = R.battleLogPage(same, 1, 8, 4);
ok('⑥m 一組比一頁還長 → 從中間斷頁（第 1 頁 1 組頭 + 7 行）', s0.rows.filter((r) => r.month).length === 1 && s0.rows.length === 8, `${s0.rows.length}`);
ok('⑥n 續頁沒有組頭（3 行純正文）', s1.rows.length === 3 && s1.rows.every((r) => !r.month), s1.rows.map((r) => r.s).join(','));
let zig = [];
zig = R.battleLogPush(zig, R.battleLogLine(3, 'A', 'info'), R.BATTLE_LOG_KEEP);
zig = R.battleLogPush(zig, R.battleLogLine(4, 'B', 'info'), R.BATTLE_LOG_KEEP);
zig = R.battleLogPush(zig, R.battleLogLine(3, 'C', 'info'), R.BATTLE_LOG_KEEP);
eq('⑥o 年月交錯 → 按「連續同月」切 3 組（不是 merge 成 2 組）', R.battleLogPage(zig, 0, 8, 3).rows.filter((r) => r.month).length, 3);
let keep = [];
for (let i = 0; i < 45; i += 1) keep = R.battleLogPush(keep, R.battleLogLine(4, `第 ${i + 1}`, 'info'), R.BATTLE_LOG_KEEP);
ok('⑥p 緩衝 45 → 留 40 條、最後一條最新', keep.length === 40 && keep[39].s === '第 45' && keep[0].s === '第 6', `${keep.length}`);
ok('⑥q legacy 上限：push(...,8) 仍留 8 條（web 口徑不變）', R.battleLogPush(buf, R.battleLogLine(5, 'x', 'info'), 8).length === 8);
const x = R.LOG_VIEW.x;
const prevC = R.LOG_PAGE_PREV.x + R.LOG_PAGE_PREV.w / 2;
const nextC = R.LOG_PAGE_NEXT.x + R.LOG_PAGE_NEXT.w / 2;
const hitY = R.LOG_PAGE_PREV.y + R.LOG_PAGE_PREV.h / 2;
eq('⑥r logPageHit：◀ 中心 → -1、▶ 中心 → 1', [R.logPageHit(prevC, hitY, false), R.logPageHit(nextC, hitY, false)], [-1, 1]);
eq('⑥s logPageHit：標題左側/面板外 → 0；折疊時一律 0', [R.logPageHit(x + 20, hitY, false), R.logPageHit(-10, hitY, false), R.logPageHit(prevC, hitY, true)], [0, 0, 0]);
ok('⑥t 兩顆翻頁鈕都在標題列內、互不重疊、不壓標題字', R.LOG_PAGE_PREV.x + R.LOG_PAGE_PREV.w <= R.LOG_PAGE_NEXT.x && R.LOG_PAGE_PREV.y + R.LOG_PAGE_PREV.h <= R.LOG_VIEW.y + R.LOG_HEAD_H && R.LOG_PAGE_NEXT.x + R.LOG_PAGE_NEXT.w <= R.LOG_VIEW.x + R.LOG_VIEW.w && R.LOG_PAGE_PREV.x > R.LOG_VIEW.x + 300, `prev=${R.LOG_PAGE_PREV.x} next=${R.LOG_PAGE_NEXT.x}`);

/* ================================================================= ⑦ 接線（原始碼） */
console.log('\n— ⑦ 接線字串（CampaignRoot.ts 真的用了這些純函數） —');
const must = [
  ['翻頁判定先問 logPageHit', 'const turn = logPageHit(x, y, this.logCollapsed);'],
  ['命中才翻頁', 'this.turnBattleLogPage(turn);'],
  ['刷新用 battleLogPage', 'const page = battleLogPage(this.battleLog, this.logPage, BATTLE_LOG_MAX, month);'],
  ['標題帶頁碼', '條 · ${page.page + 1}/${page.pages} 頁'],
  ['分組底色（Graphics）', 'this.fillRect(g, LOG_VIEW.x + 8, top + 3, LOG_VIEW.w - 16, LOG_ROW_H - 6, COLORS.gold, 16);'],
  ['落盤不再截 8 條', 'out.slice(Math.max(0, out.length - BATTLE_LOG_KEEP))'],
  ['AI 逐條進緩衝（40 條）', 'battleLogAppend(this.battleLog, lines, BATTLE_LOG_KEEP)'],
  ['死亡分派走純函數', 'const plan = planMonarchDeath(dead, save.owned.length, Boolean(this.successionState), this.monarchExtinct);'],
  ['0 城不彈繼承窗', "if (plan.kind === 'ending') {"],
  ['彈窗回呼仍叫 commitSuccession', 'openSuccession(view, (name: string) => this.commitSuccession(name));'],
  ['落庫後勢力滅亡 → 叫結局面板', 'EndingPanel.showIfEnded(this.node, { ...view, monarchExtinct: true }'],
];
for (const [label, needle] of must) ok('⑦ ' + label, campaignSrc.indexOf(needle) >= 0, needle.slice(0, 60));

const touchIdx = campaignSrc.indexOf('private onTouch(');
const onTouchSrc = campaignSrc.slice(touchIdx, touchIdx + 6000);
ok(
  '⑦ 翻頁判定在撐開/折疊之前（點翻頁鈕不會順手折疊）',
  onTouchSrc.indexOf('logPageHit(x, y, this.logCollapsed)') > 0 && onTouchSrc.indexOf('logPageHit(x, y, this.logCollapsed)') < onTouchSrc.indexOf('this.toggleBattleLog();'),
);
ok('⑦ 標題列仍可折疊（logHit 口徑沒被改掉）', campaignSrc.indexOf('const logHitArea = logHit(x, y, this.logCollapsed);') >= 0);
ok('⑦ 0 城路徑會寫滅亡旗標（否則刷頁面復活）', campaignSrc.slice(deathIdx, commitIdx).indexOf('this.storeMonarchExtinct(true);') > 0);
noThrow('⑦ 資料缺欄位不會炸（successionLand(save, null) 回 ok:false / no-state）', () => {
  const bad = R.successionLand({}, null);
  if (bad.ok !== false || bad.reason !== 'no-state' || bad.extinct !== false) throw new Error('應該回 ok:false/no-state，實際 ' + JSON.stringify(bad));
  return bad;
});

/* ------------------------------------------------------------------- 收尾 */
const pass = total - failed.length;
console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'FAILED ' + failed.length) + ' · 断言 ' + total + ' 条（PASS ' + pass + ' / FAIL ' + failed.length + '）');
if (failed.length > 0) {
  console.log('紅的：\n  - ' + failed.join('\n  - '));
  process.exit(1);
}
console.log('（純 node，未起 cc / 瀏覽器；跑的是磁碟上的 CampaignRoot.ts region + MonarchModel.ts）');
process.exit(0);
