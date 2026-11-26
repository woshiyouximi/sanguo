/**
 * `SurrenderModel.ts` 的 node 斷言（純邏輯，不碰 cc）。
 *
 * 跑法：`cd F:\sanguo\work\cocos_surrender && node model_assert.mjs`
 * 前置：`node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json`（產物在 `_sim/`）
 *
 * 斷言口径全部對著 web（`game/web/campaign.html`）與 `project/86` 查出來的那個缺陷：
 *  1. 三檔 tier（must / roll / refuse）各自的默認按鈕可用性；
 *  2. **拒絕檔的「剩餘全部招降」不得繞過硬門**（r86 缺陷，Cocos 別重犯）；
 *  3. 君主不可招（只能放走）；
 *  4. 空名不生成卡；
 *  5. 落庫後名單 / `_moved` 哨兵 / `save.lastPost` / 戰報文案與 web 逐字一致。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('./_sim/SurrenderModel.js');
const R = require('./_sim/core/roster.js');

/* ------------------------------------------------------------------ */
/* 斷言器                                                              */
/* ------------------------------------------------------------------ */

let total = 0;
const failures = [];

function ok(label, cond, actual) {
  total += 1;
  if (!cond) failures.push(`${label} → 期望 true，實際 ${format(actual)}`);
}

function same(label, expected, actual) {
  total += 1;
  const a = JSON.stringify(expected);
  const b = JSON.stringify(actual);
  if (a !== b) failures.push(`${label} → 期望 ${a}，實際 ${b}`);
}

function includes(label, needle, haystack) {
  total += 1;
  const text = Array.isArray(haystack) ? haystack.join('|') : String(haystack);
  if (!text.includes(needle)) failures.push(`${label} → 期望含 ${JSON.stringify(needle)}，實際 ${JSON.stringify(text)}`);
}

function throwsNot(label, fn) {
  total += 1;
  try {
    fn();
  } catch (err) {
    failures.push(`${label} → 不該拋：${err && err.message}`);
  }
}

function format(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

/* ------------------------------------------------------------------ */
/* 測試資料                                                            */
/* ------------------------------------------------------------------ */

/**
 * 数值全部照 `roster.ts:434 statOf()` 的口徑：卡上的忠誠是
 * `Loyal - (10 - CONSTANCY) * 2`，不是 generals.json 的原始值。
 *
 * | 名 | Loyal | C | 卡上忠誠 | chance | tier |
 * |---|---|---|---|---|---|
 * | 張遼 | 52 | 4 | 40 | 0.60 | roll |
 * | 程昱 | 20 | 5 | 10 | 1.00 | must |
 * | 華佗 | 80 | 4 | 68 | 0（硬門 0x13）| refuse |
 * | 劉備 | 99 | 9 | 99 | 0（君主）| king |
 * | 守將 | 60 | 3 | 46 | 0.54 | roll |
 * | 死士 | 20 | 4 | 12 | 1.00 | must（但來自 executed → 不可招）|
 */
const DATA = {
  generals: [
    { NAME: '張遼', STR: 92, INT: 78, Loyal: 52, CONSTANCY: 4 },
    { NAME: '程昱', STR: 62, INT: 90, Loyal: 20, CONSTANCY: 5 },
    { NAME: '華佗', STR: 22, INT: 88, Loyal: 80, CONSTANCY: 4 },
    { NAME: '劉備', STR: 74, INT: 72, Loyal: 99, CONSTANCY: 9 },
    { NAME: '守將', STR: 50, INT: 40, Loyal: 60, CONSTANCY: 3 },
    { NAME: '死士', STR: 40, INT: 30, Loyal: 20, CONSTANCY: 4 },
    { NAME: '曹操', STR: 96, INT: 92, Loyal: 100, CONSTANCY: 9 },
  ],
  scenarios: [{ kings: [{ NAME: '劉備' }] }],
  troops: [],
  formations: [],
  magics: [],
  wises: [],
  terrains: [],
  items: [],
};

const TIER_TEXT_WEB = { must: '可 降', roll: '需 再 戰', refuse: '拒 降' };
const HOME = '許昌';

function freshSave() {
  return {
    owned: ['許昌'],
    wins: 3,
    losses: 1,
    month: 118,
    gold: 900,
    cities: { 許昌: { troops: 400, pop: 90000, money: 300 } },
    roster: { 許昌: ['曹操', '夏侯惇'] },
    captured: ['張遼', '程昱'],
    executed: ['華佗', '死士'],
  };
}

function open(save, opts) {
  return M.openOf(M.saveOf(save), DATA, HOME, opts);
}

function byName(state, name) {
  return state.cards.find((card) => card.name === name) ?? null;
}

function buttonOf(view, act) {
  return view.buttons.find((btn) => btn.act === act) ?? null;
}

/* ------------------------------------------------------------------ */
/* 1. 開面板 / 候選                                                    */
/* ------------------------------------------------------------------ */

section('1. 開面板與候選順序');
{
  const save = freshSave();
  const state = open(save);
  ok('1.1 有俘虜 → 開得起來', state !== null, state);
  same('1.2 卡數（captured 2 + executed 2）', 4, state.cards.length);
  same(
    '1.3 順序先 captured 再 executed',
    ['張遼', '程昱', '華佗', '死士'],
    state.cards.map((c) => c.name),
  );
  same('1.4 初始待決張數', 4, M.leftOf(state));
  same('1.5 全部決完？', false, M.allDecided(state));
  same('1.6 批量鍵可用', true, M.bulkEnabled(state));
  same('1.7 viewsOf 與 cards 同長', 4, M.viewsOf(state).length);
  same('1.8 hasPending()', true, M.hasPending(M.saveOf(save)));
  same('1.9 空存檔不開面板', null, open({ ...freshSave(), captured: [], executed: [] }));

  const none = open({ ...freshSave(), captured: [], executed: [] });
  same('1.10 沒卡時 state 為 null', null, none);
  void none;
}

/* ------------------------------------------------------------------ */
/* 2. 三檔 tier 與文案                                                 */
/* ------------------------------------------------------------------ */

section('2. 三檔 tier / tierText / 成功率 / 理由');
{
  const state = open(freshSave());
  const zhang = byName(state, '張遼');
  const cheng = byName(state, '程昱');
  const hua = byName(state, '華佗');
  const si = byName(state, '死士');

  same('2.1 張遼 tier=roll', 'roll', zhang.tier);
  same('2.2 程昱 tier=must', 'must', cheng.tier);
  same('2.3 華佗 tier=refuse', 'refuse', hua.tier);
  same('2.4 死士 tier=must（僅檔位）', 'must', si.tier);

  same('2.5 張遼 tierText', TIER_TEXT_WEB.roll, zhang.tierText);
  same('2.6 程昱 tierText', TIER_TEXT_WEB.must, cheng.tierText);
  same('2.7 華佗 tierText', TIER_TEXT_WEB.refuse, hua.tierText);

  same('2.8 張遼成功率 0.60', 0.6, Math.round(zhang.chance * 100) / 100);
  same('2.9 程昱成功率 1', 1, cheng.chance);
  same('2.10 華佗成功率 0', 0, hua.chance);

  same('2.11 卡上忠誠是扣過的 40（不是 json 的 52）', 40, zhang.loyal);
  includes('2.12 roll 檔理由寫了成功率', '成功率 60.0%', zhang.reason);
  includes('2.13 must 檔理由走原作中文', '必降', cheng.reason);
  includes('2.14 refuse 檔理由點名硬門', '0x13', hua.reason);
  same('2.15 死士從 executed 來 → recruitable=false', false, si.recruitable);
  same('2.16 張遼從 captured 來 → recruitable=true', true, zhang.recruitable);

  same('2.17 面板標題', '抓 到 敵 將', M.PANEL_TITLE);
  same('2.18 批量鍵文案', ['剩餘全部招降', '剩餘全部斬首', '剩餘全部釋放'], [
    M.BULK_TEXT.recruit,
    M.BULK_TEXT.kill,
    M.BULK_TEXT.release,
  ]);
  same('2.19 三顆按鈕文案', ['招 降', '斬 首', '釋 放'], [
    M.ACTION_TEXT.recruit,
    M.ACTION_TEXT.kill,
    M.ACTION_TEXT.release,
  ]);
  includes('2.20 副標帶回城名', HOME, M.subText(state));
  includes('2.21 底部提示寫待決數', '剩 4 位待決', M.footText(state));
}

/* ------------------------------------------------------------------ */
/* 3. 按鈕可用性矩陣                                                   */
/* ------------------------------------------------------------------ */

section('3. tier × 來源 → 三顆按鈕可用性');
{
  const state = open(freshSave());
  const views = Object.fromEntries(M.viewsOf(state).map((v) => [v.name, v]));

  same('3.1 普通卡三顆都在', ['recruit', 'kill', 'release'], views['張遼'].buttons.map((b) => b.act));
  same('3.2 roll+captured：招降可點', true, buttonOf(views['張遼'], 'recruit').enabled);
  same('3.3 must+captured：招降可點', true, buttonOf(views['程昱'], 'recruit').enabled);
  same('3.4 refuse+executed：招降灰掉', false, buttonOf(views['華佗'], 'recruit').enabled);
  same('3.5 refuse 的斬首仍可點', true, buttonOf(views['華佗'], 'kill').enabled);
  same('3.6 refuse 的釋放仍可點', true, buttonOf(views['華佗'], 'release').enabled);
  same('3.7 must+executed：招降照樣灰掉（檔位≠可招）', false, buttonOf(views['死士'], 'recruit').enabled);
  same('3.8 斬首永遠可點', true, buttonOf(views['死士'], 'kill').enabled);

  same('3.9 卡面數值行（web 逐字）', '武 92 · 智 78 · 忠誠 40 · 義理 4', views['張遼'].stat);
  same('3.10 色檔 roll', 'roll', views['張遼'].cls);
  same('3.11 色檔 refuse', 'refuse', views['華佗'].cls);
  same('3.12 未決策的卡沒有 pick', null, views['張遼'].pick);
  same('3.13 未決策的卡 done=false', false, views['張遼'].done);
  same('3.14 已決策的卡才畫 pickText', '已 招 降', M.PICK_TEXT.recruit);
}

/* ------------------------------------------------------------------ */
/* 4. r86 缺陷：拒絕檔的「剩餘全部招降」不得繞過                        */
/* ------------------------------------------------------------------ */

section('4. r86 缺陷：批量招降不得繞過硬門');
{
  const save = freshSave();
  const state = open(save);
  same('4.1 按「全部招降」前先算會被放走的人', ['華佗', '死士'], M.wouldEscape(state, 'recruit'));
  const picked = M.bulkOf('recruit', state);
  same('4.2 批量鍵覆蓋全部待決', 4, picked.length);
  same('4.3 可招的寫 recruit', 'recruit', state.picks['張遼']);
  same('4.4 可招的寫 recruit（must 檔）', 'recruit', state.picks['程昱']);
  same('4.5 拒降檔改寫 escape（不繞門）', 'escape', state.picks['華佗']);
  same('4.6 檔位 must 但來自 executed 也改寫 escape', 'escape', state.picks['死士']);
  same('4.7 批量後沒人待決', 0, M.leftOf(state));
  same('4.8 批量後全部決完', true, M.allDecided(state));
  same('4.9 批量後批量鍵熄滅', false, M.bulkEnabled(state));

  const outcome = M.finishOf(state);
  ok('4.10 finishOf 有結果', outcome !== null, outcome);
  same('4.11 招降成功的只有兩個可招的', ['張遼', '程昱'], outcome.result.recruited);
  // 批量鍵在面板這一層就把拒降檔改寫成 escape，所以硬門根本沒被觸發：
  // 這正是 r86 的修法 —— 不是靠 `applySurrender()` 兜底，而是按鈕本身不給繞。
  same('4.12 批量路徑連硬門都沒進（rejected 空）', [], outcome.result.rejected);
  same('4.13 拒降的人按放走處理', ['華佗', '死士'], outcome.result.escaped);
  same('4.14 沒有斬首', [], outcome.result.killed);
  same('4.15 沒有釋放', [], outcome.result.released);
  same('4.16 cleared 覆蓋全部 4 人', 4, outcome.result.cleared.length);

  same('4.17 招降的進了本城名單', true, save.roster['許昌'].includes('張遼'));
  same('4.18 招降的進了本城名單（第二個）', true, save.roster['許昌'].includes('程昱'));
  same('4.19 拒降的沒進名單', false, save.roster['許昌'].includes('華佗'));
  same('4.20 拒降的沒進名單（second）', false, save.roster['許昌'].includes('死士'));
  same('4.21 放走不動 _moved 哨兵', undefined, (save.roster._moved ?? {})['華佗']);
  same('4.22 放走不算死亡', false, R.isDead(M.saveOf(save), '華佗'));
  same('4.23 放走不算釋放哨兵', false, R.isReleased(M.saveOf(save), '華佗'));

  same('4.24 名單摘乾淨：captured', [], save.captured);
  same('4.25 名單摘乾淨：executed', [], save.executed);

  same('4.26 lastPost.city', HOME, outcome.lastPost.city);
  same('4.27 lastPost.joined = 真正入池的人', ['張遼', '程昱'], outcome.lastPost.joined);
  same('4.28 lastPost.joinedAll 只含決策為 recruit 的', ['張遼', '程昱'], outcome.lastPost.joinedAll);
  same('4.29 lastPost.escaped 含拒降的（與 web 一致）', ['華佗', '死士'], outcome.lastPost.escaped);
  same('4.30 lastPost.rejected 空（沒走硬門）', [], outcome.lastPost.rejected);
  same('4.31 lastPost 記了月份', 118, outcome.lastPost.month);
  includes('4.32 提示條文案（web 順序 招降/斬首/釋放/放走）', '戰 後 處 置完成：招降 2 · 放走 2', outcome.text);
  same('4.33 戰報 2 行（招降 / 放走）', 2, outcome.logs.length);
  includes('4.34 戰報第 1 行', '戰 後 處 置：招降 張遼、程昱 入 許昌', outcome.logs[0].text);
  includes('4.35 戰報第 2 行', '戰 後 處 置：放走 華佗、死士', outcome.logs[1].text);
  same('4.36 finishOf 冪等', null, M.finishOf(state));
  same('4.37 落庫後 state.done', true, state.done);

  const view = M.viewOf(state, '張遼');
  same('4.38 落庫後卡面顯示已招降', '已 招 降', view.pickText);
  same('4.39 落庫後沒有按鈕', 0, view.buttons.length);
}

/* ------------------------------------------------------------------ */
/* 4b. 縱深防禦：就算呼叫方硬寫 recruit，規則層也不放行                  */
/* ------------------------------------------------------------------ */

section('4b. 硬門縱深：硬寫 recruit 也不入池');
{
  const save = freshSave();
  const state = open(save);
  // 故意繞過 decideOf()，直接往 picks 裡塞（模擬另一個呼叫方 / 舊版 UI 的 bug）
  state.picks['華佗'] = 'recruit';
  state.picks['死士'] = 'recruit';
  state.picks['張遼'] = 'recruit';
  state.picks['程昱'] = 'kill';
  const outcome = M.finishOf(state);
  same('4b.1 硬門把拒降檔記進 rejected', ['華佗', '死士'], outcome.result.rejected);
  same('4b.2 硬門也把他們算放走', ['華佗', '死士'], outcome.result.escaped);
  same('4b.3 真正招降的只有 1 個', ['張遼'], outcome.result.recruited);
  same('4b.4 拒降的沒進城名單', false, save.roster['許昌'].includes('華佗'));
  same('4b.5 lastPost.joinedAll 仍記著「玩家按了 recruit」', ['張遼', '華佗', '死士'], outcome.lastPost.joinedAll);
  same('4b.6 lastPost.joined 只記真正入池的', ['張遼'], outcome.lastPost.joined);
  includes(
    '4b.7 戰報有「拒 降（硬門）」這一行',
    '拒 降（硬門）：華佗、死士 只放走，不入池',
    outcome.logs.map((line) => line.text),
  );
}

/* ------------------------------------------------------------------ */
/* 5. 君主不可招                                                       */
/* ------------------------------------------------------------------ */

section('5. 君主不可招，只能放走');
{
  const save = freshSave();
  const state = open(save, { atCity: ['許昌', '劉備'] });
  const king = byName(state, '劉備');
  ok('5.1 君主在城裡就出「逃走」卡', king !== null, king);
  same('5.2 from=king', 'king', king.from);
  same('5.3 tier 固定 refuse', 'refuse', king.tier);
  same('5.4 tierText 是「逃 走」', '逃 走', king.tierText);
  same('5.5 recruitable=false', false, king.recruitable);
  includes('5.6 理由點名君主不可俘', '君主不可俘', king.reason);

  const view = M.viewOf(state, '劉備');
  same('5.7 君主卡不畫三顆按鈕', 0, view.buttons.length);
  same('5.8 escapeOnly=true', true, view.escapeOnly);
  same('5.9 色檔 king', 'king', view.cls);
  same('5.10 君主卡 KING_CHIP', '逃 走', M.KING_CHIP);

  same('5.11 逐將「招降」被拒', false, M.decideOf(state, '劉備', 'recruit'));
  same('5.12 逐將「斬首」被拒', false, M.decideOf(state, '劉備', 'kill'));
  same('5.13 逐將「釋放」被拒', false, M.decideOf(state, '劉備', 'release'));
  same('5.14 君主仍待決（逐將擋掉不等於決策）', true, state.picks['劉備'] === undefined);

  M.bulkOf('recruit', state);
  same('5.15 批量招降把君主寫成 escape', 'escape', state.picks['劉備']);
  const outcome = M.finishOf(state);
  includes('5.16 君主記在 escaped', '劉備', outcome.result.escaped);
  same('5.17 君主不入池', false, save.roster['許昌'].includes('劉備'));
  same('5.18 君主沒被記死', false, R.isDead(M.saveOf(save), '劉備'));

  // 髒檔：君主被寫進 captured 也同樣只給「逃走」
  const dirty = { ...freshSave(), captured: ['劉備'], executed: [] };
  const dirtyState = open(dirty);
  same('5.19 髒檔裡的君主仍出 king 卡', true, byName(dirtyState, '劉備').isKing);
  same('5.20 髒檔裡的君主仍不可招', false, byName(dirtyState, '劉備').recruitable);
}

/* ------------------------------------------------------------------ */
/* 6. 空名 / 髒檔                                                      */
/* ------------------------------------------------------------------ */

section('6. 空名不生成卡 / 髒檔');
{
  const save = { ...freshSave(), captured: ['', '   ', null, '張遼'], executed: [] };
  const state = open(save);
  same('6.1 空名 / 空白名 / null 不長卡', 1, state.cards.length);
  same('6.2 剩下的是有名的那個', '張遼', state.cards[0].name);

  same(
    '6.3 全是空名 → 不開面板',
    null,
    open({ ...freshSave(), captured: ['', null, '  '], executed: [] }),
  );

  const both = { ...freshSave(), captured: ['張遼'], executed: ['張遼'] };
  const bothState = open(both);
  same('6.4 同名兩名單只出 1 張', 1, bothState.cards.length);
  same('6.5 以斬首為準（from=executed）', 'executed', bothState.cards[0].from);
  same('6.6 以斬首為準 → 不可招', false, bothState.cards[0].recruitable);

  const dead = freshSave();
  dead.roster._moved = { 張遼: '陣亡' };
  same('6.7 已斬首的不再出卡', false, open(dead).cards.some((c) => c.name === '張遼'));
}

/* ------------------------------------------------------------------ */
/* 7. mine / king / atCity 過濾                                        */
/* ------------------------------------------------------------------ */

section('7. 我方自己的人 / 我方君主 / 非君主守將');
{
  same('7.1 mine 裡的人不出卡', false, open(freshSave(), { mine: ['程昱'] }).cards.some((c) => c.name === '程昱'));

  const ownKing = { ...freshSave(), captured: ['曹操'], executed: [] };
  // 唯一的俘虜就是我方君主 → 一張卡都不該出，連面板都不開
  same('7.2 我方君主不出卡（整份名單只剩他也不開面板）', null, open(ownKing, { king: '曹操' }));

  const city = open(freshSave(), { atCity: ['許昌', '守將'] });
  same('7.3 城裡的非君主守將不出逃走卡', false, city.cards.some((c) => c.name === '守將'));
  same('7.4 但城裡的君主會出', true, open(freshSave(), { atCity: ['劉備'] }).cards.some((c) => c.name === '劉備'));

  const rosterMine = freshSave();
  rosterMine.captured = ['夏侯惇', '張遼'];
  // R221 F-01（俘虜勝者門）取代舊斷言：無 lastBattle 時 SurrenderModel 走
  // decideBattleWon() 兜底，captured 裡有 ourForceNames()（roster 名單，許昌有夏侯惇）
  // 的人 ⇒ 判我方敗 ⇒ openOf() 直接 null（core/roster.ts:1129-1142、
  // SurrenderModel.ts:328-330/:356）。舊斷言假定預設 opts 一定開得了面板，已過期。
  // 這裡顯式傳 won:true 才談得上「自己人不出卡」；不傳 won 的勝者門另立 7.5b。
  same(
    '7.5 自己在職的將被俘也不算俘虜（顯式 won:true 下的 mine 過濾）',
    false,
    open(rosterMine, { won: true }).cards.some((c) => c.name === '夏侯惇'),
  );
  same('7.5b 勝者門：我方將在處置名單且無 lastBattle → 判敗，不彈面板', null, open(rosterMine));
  same('7.5c 勝者門顯式 won:false 也不彈面板', null, open(rosterMine, { won: false }));
}

/* ------------------------------------------------------------------ */
/* 8. 逐將決策 → 自動完成                                              */
/* ------------------------------------------------------------------ */

section('8. 逐將決策（web decideSurrender 的等價路徑）');
{
  const save = freshSave();
  const state = open(save);
  same('8.1 決張遼＝招降', true, M.decideOf(state, '張遼', 'recruit'));
  same('8.2 待決剩 3', 3, M.leftOf(state));
  includes('8.3 底部提示跟著變', '剩 3 位待決', M.footText(state));
  same('8.4 同一人再決一次被拒', false, M.decideOf(state, '張遼', 'kill'));
  same('8.5 決策沒被覆蓋', 'recruit', state.picks['張遼']);
  same('8.6 拒降檔的「招降」被面板擋掉', false, M.decideOf(state, '華佗', 'recruit'));
  same('8.7 不存在的名字被拒', false, M.decideOf(state, '關羽', 'kill'));

  same('8.8 決程昱＝斬首', true, M.decideOf(state, '程昱', 'kill'));
  same('8.9 決華佗＝釋放', true, M.decideOf(state, '華佗', 'release'));
  same('8.10 決死士＝放走', true, M.decideOf(state, '死士', 'escape'));
  same('8.11 四人全決完', true, M.allDecided(state));
  same('8.12 全部決完後批量鍵熄滅', false, M.bulkEnabled(state));
  same('8.13 全部決完的底部提示', '處理完畢', M.footText(state));

  const outcome = M.finishOf(state);
  same('8.14 招降結果', ['張遼'], outcome.result.recruited);
  same('8.15 斬首結果', ['程昱'], outcome.result.killed);
  same('8.16 釋放結果', ['華佗'], outcome.result.released);
  same('8.17 放走結果', ['死士'], outcome.result.escaped);
  same('8.18 斬首記死', true, R.isDead(M.saveOf(save), '程昱'));
  same('8.19 斬首從名單摘掉', false, save.roster['許昌'].includes('程昱'));
  same('8.20 釋放打哨兵', true, R.isReleased(M.saveOf(save), '華佗'));
  same('8.21 釋放累加 save.released', ['華佗'], save.released);
  same('8.22 釋放也從名單摘掉', false, save.roster['許昌'].includes('華佗'));
  same('8.23 提示條四段都有', true, /招降 1/.test(outcome.text) && /斬首 1/.test(outcome.text) && /釋放 1/.test(outcome.text) && /放走 1/.test(outcome.text));
  same('8.24 四行戰報（招降/斬首/釋放/放走）', 4, outcome.logs.length);
  same('8.25 記分：killed 走 applyPostBattle', ['程昱'], outcome.lastPost.deadAll);
}

/* ------------------------------------------------------------------ */
/* 9. 戰後寫回（補 BattleRoot 的缺口）                                 */
/* ------------------------------------------------------------------ */

section('9. queuePostBattle（把戰報寫進存檔）');
{
  const save = { ...freshSave(), captured: [], executed: [] };
  const post = {
    captures: [
      { name: '張遼', recruited: true },
      { name: '程昱', recruited: false },
    ],
    executed: [{ name: '華佗' }],
  };
  const added = M.queuePostBattle(M.saveOf(save), post);
  // 舊斷言「預判失敗的不算俘虜」是 project/120:222 的舊語義（captures 只收
  // recruited===true）。該語義會讓面板永不彈（節操≥3 且原勢力健在恒「寧死不降」），
  // 已被 P1 修復取代：SurrenderModel.ts:676-681 明文「所有俘虜（不論戰場預判成敗）
  // 都進 captured，逐將檔位留到面板再算」，與 web main.js:845-853 一致；
  // 修復記錄見 project/132:144（P1）→ project/37a:494（已修）。
  same('9.1 寫回的名字（所有俘虜都進 captured，不論預判成敗）', ['張遼', '程昱', '華佗'], added);
  same('9.2 captured', ['張遼', '程昱'], save.captured);
  same('9.3 executed', ['華佗'], save.executed);
  same('9.4 重放去重', [], M.queuePostBattle(M.saveOf(save), post));
  same('9.5 兩次寫回結果不變', ['張遼', '程昱'], save.captured);
  throwsNot('9.6 null 安全', () => M.queuePostBattle(M.saveOf(save), null));
  same('9.7 hasPending 認 captured', true, M.hasPending(M.saveOf(save)));
  same('9.8 空 post 不炸', [], M.queuePostBattle(M.saveOf({ ...freshSave(), captured: [], executed: [] }), {}));

  const queueState = open(save);
  same('9.9 寫回後面板能開', true, queueState !== null);
  same('9.10 寫回後的卡數', 3, queueState.cards.length);
}

/* ------------------------------------------------------------------ */
/* 10. 邊界                                                            */
/* ------------------------------------------------------------------ */

section('10. 邊界');
{
  const save = freshSave();
  same('10.1 kingOf 優先 monarch', '曹操', M.kingOf(M.saveOf({ ...save, monarch: '曹操' })));
  same('10.2 kingOf 退回 king', '孫權', M.kingOf(M.saveOf({ ...save, king: '孫權' })));
  same('10.3 kingOf 都沒有 → 空字串', '', M.kingOf(M.saveOf({ ...save })));
  same('10.4 saveOf 是零成本轉型', save, M.saveOf(save));
  throwsNot('10.5 空城名不炸', () => M.openOf(M.saveOf(save), DATA, '', {}));
  const noHome = M.openOf(M.saveOf(save), DATA, '', {});
  same('10.6 空城名仍能出卡', 4, noHome.cards.length);
  same('10.7 officersAt 無 garrison 資料 → 空', [], M.officersAt(DATA, '許昌'));
  same('10.8 myNamesOf 讀 roster', true, M.myNamesOf(M.saveOf(save)).includes('曹操'));
  same('10.9 pendingOf 與 leftOf 一致', M.pendingOf(noHome).length, M.leftOf(noHome));
  same('10.10 不存在的城不影響出卡', 4, M.openOf(M.saveOf(save), DATA, '成都', {}).cards.length);
}

/* ------------------------------------------------------------------ */
/* 結果                                                                */
/* ------------------------------------------------------------------ */

console.log('\n' + '='.repeat(64));
if (failures.length) {
  console.log(`FAILED ${failures.length}/${total}`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(1);
}
console.log(`ALL PASS — 斷言總數 ${total}，失敗 0`);
