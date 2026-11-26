// @ts-nocheck
/**
 * F-01「戰後俘虜處置缺勝者門」（Cocos 側）测试。
 *
 * 背景（`work/parity_sweep/REPORT.md:236-241`，用戶實機 P0）：
 * 我方在任何一戰打輸後回大地圖，`CampaignRoot` 只按 `hasPendingCaptures()` 彈俘虜處置面板，
 * 於是玩家會看到「自己處置自己被俘武將」的荒謬面板。web 側已修（`campaign.html:4874-4988`：
 * `decideBattleWon()` → 敗方走 `aiDisposeCaptives()`），Cocos 鏡像一直沒跟上。
 *
 * 本輪（R220，lead 授權）：
 *   · `game/cocos/assets/scripts/core/roster.ts` 追加 core 的勝者門六函式 + `won` 參數；
 *   · `SurrenderModel.resolveCaptureFlow()` 成為 UI 唯一入口（本檔只測它，不測面板）；
 *   · 防漂移用例守著兩個 fork 的勝者門導出集合（見檔尾）。
 *
 * 跑法（沿用 `node --test` 慣例，不需要先 tsc 產物）：
 *   cd F:\sanguo\game; node --test tests/capture_gate_cocos.test.ts
 *
 * 為什麼要 `registerHooks`：Cocos 源頭內部 import 不帶 `.ts` 副檔名（Cocos/Babel 習慣），
 * Node 的 ESM resolver 不補副檔名；這裡在解析失敗時補 `.ts` 再試一次。
 * 動態 import 用計算出來的 specifier（`new URL(...).href`），避免 TypeScript 把
 * `cocos/assets/scripts/**` 拉進 `game/tsconfig.json` 的 program（`gate_target.test.ts` 同款）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

import { loadData } from '../src/data.ts';
import * as CORE_ROSTER from '../src/core/roster.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // Cocos 源內部只寫 `./core/garrison` / `../types` 這種無副檔名 specifier
      if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(specifier + '.ts', context);
      }
      throw err;
    }
  },
});

const urlOf = (rel: string) => new URL(rel, import.meta.url).href;

/** Cocos 模型層（`SurrenderModel.ts`，不 import `cc`） */
const M = await import(urlOf('../cocos/assets/scripts/SurrenderModel.ts'));
/** Cocos 鏡像規則層（勝者門的落腳點） */
const MIRROR = await import(urlOf('../cocos/assets/scripts/core/roster.ts'));

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/** 最小可用戰役存檔：一座城 + 兩個在職武將（與 `surrender_side.test.ts` 同款） */
function makeSave(extra = {}) {
  return {
    gold: 1000,
    scenario: 1,
    year: 189,
    month: 3,
    king: '劉備',
    owned: ['小沛'],
    cities: { 小沛: { troops: 800, money: 200, pop: 3000, owner: '劉備' } },
    roster: { 小沛: ['關羽', '張飛'] },
    captured: [],
    executed: [],
    ...extra,
  };
}

/** 一份合法的 `save.lastBattle`（main.js `writeBackCampaign()` 戰後寫回契約） */
function outcome(extra = {}) {
  return {
    won: false,
    defend: true,
    city: '小沛',
    captured: [],
    executed: [],
    dead: [],
    joined: [],
    ts: 1_763_000_000_000,
    ...extra,
  };
}

/** 測試統一傳 `atCity: []`：不讓 `garrison.json` 的「君主逃走」卡干擾斷言 */
const baseOpts = { atCity: [], king: '劉備', battle: false };

// ---------------------------------------------------------------- ① 我方勝 + 隊列非空

test('F-01①：我方勝 + 待決隊列非空 → open:true、cards 非空、reason won', () => {
  const save = makeSave({
    captured: ['張遼', '程昱'],
    lastBattle: outcome({ won: true, captured: ['張遼', '程昱'] }),
  });
  const flow = M.resolveCaptureFlow(save, data, baseOpts);

  assert.equal(flow.open, true, '勝者才開面板');
  assert.equal(flow.reason, 'won');
  assert.equal(flow.won, true);
  assert.ok(Array.isArray(flow.cards) && flow.cards.length > 0, 'cards 必須非空');
  assert.deepEqual(
    flow.cards.map((c) => c.name),
    ['張遼', '程昱'],
    '只出敵方戰俘',
  );
  assert.equal(flow.aiDisposal.length, 0, '勝方不該走 AI 處置');
  assert.equal(flow.state !== null, true, '勝方要能直接把 state 交給面板');
  assert.equal(flow.state.cards.length, flow.cards.length);
});

// ---------------------------------------------------------------- ② 我方敗 → AI 處置

test('F-01②：我方敗 → open:false、aiDisposal 非空（勸降/斬首沿用戰鬥頁結果）', () => {
  const save = makeSave({
    owned: [], // 守城失敗：城已丟
    captured: ['關羽'],
    executed: ['張飛'],
    lastBattle: outcome({ won: false, city: '小沛', captured: ['關羽'], executed: ['張飛'], ts: 123 }),
  });
  const flow = M.resolveCaptureFlow(save, data, baseOpts);

  assert.equal(flow.open, false, '敗方絕不彈面板');
  assert.equal(flow.reason, 'lost');
  assert.equal(flow.won, false);
  assert.deepEqual(flow.cards, [], '敗方一張卡都不出（關鍵回歸）');
  assert.deepEqual(flow.aiDisposal, [
    { name: '關羽', action: 'recruit' },
    { name: '張飛', action: 'execute' },
  ]);
  assert.equal(flow.aiResult !== null, true);
  assert.equal(flow.logs.length, 2, '逐將一條戰報');
  assert.ok(flow.logs[0].text.includes('戰 報：（我方）關羽 被敵軍勸降'), flow.logs[0].text);
  assert.ok(flow.notice.includes('我軍戰敗'), flow.notice);
  assert.ok(flow.notice.includes('勸降 1'), flow.notice);

  // 冪等門：同一場戰鬥（同 outcome.ts）再進來什麼都不做，不重複寫戰報
  const again = M.resolveCaptureFlow(save, data, baseOpts);
  assert.equal(again.reason, 'none');
  assert.deepEqual(again.aiDisposal, []);
  assert.deepEqual(again.logs, []);
});

// ---------------------------------------------------------------- ③ 平手 / 無戰果

test('F-01③：平手/無戰果 → reason none（不開面板、不寫 AI 處置）', () => {
  // 沒有 lastBattle、待決隊列也空：真實「無戰果」
  const calm = makeSave();
  const flowCalm = M.resolveCaptureFlow(calm, data, baseOpts);
  assert.equal(flowCalm.open, false);
  assert.equal(flowCalm.reason, 'none');
  assert.deepEqual(flowCalm.cards, []);
  assert.deepEqual(flowCalm.aiDisposal, []);
  assert.equal(flowCalm.lastPost, null);

  // 有 lastBattle 但隊列空（勝方打完已處置乾淨）：同樣什麼都不做
  const cleared = makeSave({ lastBattle: outcome({ won: true, ts: 456 }) });
  const flowCleared = M.resolveCaptureFlow(cleared, data, baseOpts);
  assert.equal(flowCleared.open, false);
  assert.equal(flowCleared.reason, 'none');
  assert.equal(flowCleared.won, true);
  assert.deepEqual(flowCleared.cards, []);
});

// ---------------------------------------------------------------- ④ 敗方處置落庫

test('F-01④：敗方處置後 save.captured 清空、我方將打「敵軍」哨兵、lastPost 帶 ai/battleTs', () => {
  const ts = 789;
  const save = makeSave({
    owned: [],
    captured: ['關羽'],
    executed: ['張飛'],
    lastBattle: outcome({ won: false, captured: ['關羽'], executed: ['張飛'], ts }),
  });
  M.resolveCaptureFlow(save, data, baseOpts);

  assert.deepEqual(save.captured, [], '待決隊列必須清空（否則回大地圖重複處理）');
  assert.deepEqual(save.executed, []);
  assert.equal(save.roster._moved['關羽'], '敵軍', '勸降 → 轉投敵營哨兵');
  assert.equal(save.roster._moved['張飛'], '陣亡', '斬首 → 出池');
  assert.ok(!save.roster['小沛'].includes('關羽'));
  assert.ok(!save.roster['小沛'].includes('張飛'));

  assert.ok(save.lastPost && typeof save.lastPost === 'object');
  assert.equal(save.lastPost.ai, true);
  assert.equal(save.lastPost.battleTs, ts);
  assert.equal(save.lastPost.city, '小沛');
  assert.deepEqual(save.lastPost.aiRecruited, ['關羽']);

  // 我方名單不再包含被帶走/被斬的人（面板的 `mine` 口徑）
  assert.deepEqual(M.myNamesOf(save), []);
});

// ---------------------------------------------------------------- ⑤ 我方將不出現在卡池

test('F-01⑤（關鍵回歸）：我方敗時我方將不會以「可招降」出現；勝時髒隊列只處置敵將', () => {
  // (a) 敗方：即使 save.captured/executed 全是自家將，也一張卡都不出
  const lost = makeSave({
    owned: [],
    captured: ['關羽'],
    executed: ['張飛'],
    lastBattle: outcome({ won: false, captured: ['關羽'], executed: ['張飛'] }),
  });
  const flowLost = M.resolveCaptureFlow(lost, data, baseOpts);
  assert.deepEqual(flowLost.cards, []);
  assert.ok(!flowLost.cards.some((c) => c.name === '關羽' || c.name === '張飛'));

  // (b) 勝方髒隊列：隊列裡混進自家將（關羽）→ 從卡池剔掉、從隊列摘掉、記一條戰報
  const mixed = makeSave({
    captured: ['關羽', '張遼'],
    lastBattle: outcome({ won: true, captured: ['關羽', '張遼'] }),
  });
  const flowWon = M.resolveCaptureFlow(mixed, data, baseOpts);
  const names = flowWon.cards.map((c) => c.name);
  assert.deepEqual(names, ['張遼'], '只處置敵將');
  assert.ok(!names.includes('關羽'), '我方将不得出现在自己的处置面板里');
  assert.ok(!names.includes('張飛'));
  assert.deepEqual(mixed.captured, ['張遼'], '自家將從待決隊列摘掉');
  assert.ok(
    flowWon.logs.some((line) => line.text.includes('關羽') && line.text.includes('本城名單不變')),
    '自家將被誤記進隊列時要寫一條戰報',
  );
});

// ---------------------------------------------------------------- 防漂移（R220 邊界 2）

test('防漂移：Cocos 鏡像與 core 的勝者門導出集合相等、surrenderCandidates 帶可選參數', () => {
  const GATE = [
    'readBattleOutcome',
    'decideBattleWon',
    'ourForceNames',
    'markEnemyHeld',
    'planAiDisposal',
    'applyAiDisposal',
  ];
  for (const fn of GATE) {
    assert.equal(typeof MIRROR[fn], 'function', `Cocos 鏡像缺勝者門函式 ${fn}（R208 段沒同步）`);
    assert.equal(typeof CORE_ROSTER[fn], 'function', `core roster 缺勝者門函式 ${fn}`);
  }
  // `won` 是可選參數：函式 `.length` 只數必填參數（signature `(save, data, opts = {})` → 2）
  assert.ok(MIRROR.surrenderCandidates.length >= 2, '鏡像 surrenderCandidates 必須帶可選 opts');
  assert.ok(CORE_ROSTER.surrenderCandidates.length >= 2, 'core surrenderCandidates 必須帶可選 opts');

  // 兩邊「勝者門函式名集合」必須完全相等（有人只改一側時這裡紅）
  const gateNames = (mod) =>
    Object.keys(mod)
      .filter((k) => typeof mod[k] === 'function' && GATE.includes(k))
      .sort();
  assert.deepEqual(gateNames(MIRROR), gateNames(CORE_ROSTER));

  // 哨兵常量也必須逐字一致（`_moved` 存檔格式）
  assert.equal(MIRROR.ENEMY_HELD, '敵軍');
  assert.equal(MIRROR.ENEMY_HELD, CORE_ROSTER.ENEMY_HELD);
  assert.equal(MIRROR.DEAD, CORE_ROSTER.DEAD);
  assert.equal(MIRROR.RELEASED, CORE_ROSTER.RELEASED);

  // 兩層硬門的簽名（第二參數是可選 opts）
  assert.equal(typeof MIRROR.needSurrenderPanel, 'function');
  assert.equal(MIRROR.needSurrenderPanel([], { won: false }), false);
  assert.equal(MIRROR.needSurrenderPanel(MIRROR.surrenderCandidates(makeSave({ captured: ['張遼'] }), data, { won: true }), { won: false }), false);
});
