/**
 * 「勝者才有處置權」（R208 / 用户实机 P0）测试。
 *
 * 原作 `0x491D8C "抓到敵將，如何處理?"` 是**胜者**的战后结算面板；我方战败时，我方被俘将
 * 的处置应由敌方（AI）决定，玩家不该看到面板。`main.js:writeBackCampaign()` 战后**不分胜负**
 * 把 `post.captures`（劝降成功）写进 `save.captured`、把 `post.executed`（斩首）写进
 * `save.executed`（:932-937），所以光看名单分不出谁赢了 —— 本文件测的就是
 * `core/roster.ts` 新增的胜者门与敌方 AI 处置：
 *
 *   · `readBattleOutcome()` 读 `save.lastBattle`（main.js 战后写回的权威胜负信号）；
 *   · `decideBattleWon()` 缺失 `lastBattle` 时的兜底推断（丢城 / 俘将里有我方明确在職的人）；
 *   · `surrenderCandidates(..., { won: false })` / `needSurrenderPanel(cards, { won: false })`
 *     两层硬门（败方一张卡都不出、面板一律不弹）；
 *   · `ourForceNames()` 给面板的 `mine` 名单：不靠静态归属，保证混合战俘里只处置敌方；
 *   · `planAiDisposal()` / `applyAiDisposal()`：敌方 AI **沿用战斗页已判结果**（劝降 / 斩首 /
 *     阵亡 / 释放四选一），确定性（不掷骰），落库后打 `_moved` 哨兵。
 *
 * 确定性是硬要求：不许用 `Math.random`（同种子/同输入必同结果，验收可复跑）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import {
  DEAD,
  ENEMY_HELD,
  RELEASED,
  applyAiDisposal,
  applyPostBattle,
  deadNames,
  decideBattleWon,
  markEnemyHeld,
  movedOf,
  needSurrenderPanel,
  ourForceNames,
  planAiDisposal,
  readBattleOutcome,
  surrenderCandidates,
} from '../src/core/roster.ts';
// 城池名单的唯一真源（表现层函数）：验"被敌军带走 / 斩首 / 释放"之后 `rosterOf()` 里还有没有他。
import * as CM from '../web/city_model.js';

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/** 最小可用战役存档：一座城（小沛不在剧本城里，静态归属为空）+ 两个在職武將 */
function makeSave(extra: Record<string, unknown> = {}): any {
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

function namesOf(cards: { name: string }[]): string[] {
  return cards.map((c) => c.name);
}

/** 一份合法的 `save.lastBattle`（main.js 战后写回契约） */
function outcome(extra: Record<string, unknown> = {}): any {
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

function rosterAt(save: any, city: string): string[] {
  const ctx = { scenIdx: 0, generals: data.generals };
  return CM.rosterOf(save, city, ctx).map((g: any) => g.NAME);
}

// ---------------------------------------------------------------- 胜者门

test('勝者门：我方胜（won=true）时面板只出敌方战俘', () => {
  const save = makeSave({ captured: ['張遼', '程昱'], lastBattle: outcome({ won: true }) });
  const cards = surrenderCandidates(save, data, {
    mine: ourForceNames(save),
    king: '劉備',
    won: true,
  });
  assert.deepEqual(namesOf(cards), ['張遼', '程昱']);
  assert.equal(needSurrenderPanel(cards, { won: true }), true);
});

test('我方败（won=false）→ 一张卡都不出、面板不弹', () => {
  const save = makeSave({
    owned: [], // 守城失败：城已丢
    captured: ['關羽'],
    executed: [],
    lastBattle: outcome({ won: false, captured: ['關羽'] }),
  });
  const won = decideBattleWon(save);
  assert.equal(won, false);
  const cards = surrenderCandidates(save, data, {
    mine: ourForceNames(save),
    king: '劉備',
    won,
  });
  assert.deepEqual(cards, []);
  assert.equal(needSurrenderPanel(cards, { won }), false);
});

test('needSurrenderPanel：空卡不弹、非空才弹；败方即使有卡也一律不弹', () => {
  assert.equal(needSurrenderPanel([]), false);
  assert.equal(needSurrenderPanel(null), false);
  const cards = surrenderCandidates(makeSave({ captured: ['張遼'] }), data, { won: true });
  assert.equal(cards.length, 1);
  assert.equal(needSurrenderPanel(cards), true);
  assert.equal(needSurrenderPanel(cards, { won: false }), false);
});

test('我方被俘将（mine 里的人）永不出现在 `mine` 卡池；混合战俘只处置敌方', () => {
  // 脏档/混合战俘：同一个队列里既有自家将（關羽/張飛），也有敌将（張遼）
  const save = makeSave({ captured: ['關羽', '張遼'], executed: ['張飛'] });
  const mine = ourForceNames(save); // 小沛名单 = 關羽 / 張飛
  assert.deepEqual(mine.sort(), ['張飛', '關羽'].sort());
  const cards = surrenderCandidates(save, data, { mine, king: '劉備', won: true });
  const names = namesOf(cards);
  assert.deepEqual(names, ['張遼']);
  assert.ok(!names.includes('關羽'), '我方将不得出现在自己的处置面板里');
  assert.ok(!names.includes('張飛'), '我方将不得出现在自己的处置面板里');
});

// ---------------------------------------------------------------- 胜负信号

test('decideBattleWon：lastBattle.won=false 优先于一切兜底（守城丢城 + 我方将被俘）', () => {
  const save = makeSave({
    owned: [], // 城丢了
    captured: ['關羽'], // 我方将被俘
    lastBattle: outcome({ won: false, city: '小沛' }),
  });
  assert.equal(decideBattleWon(save), false);
});

test('decideBattleWon 兜底：save.last 指向的城已不在 owned → 判我方败（守城失败）', () => {
  const save = makeSave({
    owned: ['小沛'],
    last: '平原', // 上一战在平原，已丢
    cities: { 小沛: { owner: '劉備' }, 平原: { owner: '袁紹' } },
    captured: [],
    executed: [],
  });
  assert.equal(readBattleOutcome(save), null);
  assert.equal(decideBattleWon(save), false);
});

test('decideBattleWon 兜底：俘将里有我方在職将 → 判我方败', () => {
  const save = makeSave({ captured: ['關羽'] });
  assert.equal(readBattleOutcome(save), null);
  assert.equal(decideBattleWon(save), false);
});

test('decideBattleWon 兜底：无 lastBattle、俘将都是敌将 → 按旧行为判我方胜', () => {
  const save = makeSave({ captured: ['張遼'] });
  assert.equal(decideBattleWon(save), true);
});

test('readBattleOutcome：形状不对 → null；完整契约 → 原样读出', () => {
  assert.equal(readBattleOutcome(makeSave()), null);
  assert.equal(readBattleOutcome(makeSave({ lastBattle: { won: 'no' } })), null);
  const rec = outcome({
    won: true,
    city: '鄴',
    defend: false,
    captured: ['沮授'],
    executed: ['潘鳳'],
    dead: ['辛評'],
    joined: ['程昱'],
    ts: 42,
  });
  const got = readBattleOutcome(makeSave({ lastBattle: rec }));
  assert.deepEqual(got, {
    won: true,
    city: '鄴',
    defend: false,
    captured: ['沮授'],
    executed: ['潘鳳'],
    dead: ['辛評'],
    joined: ['程昱'],
    ts: 42,
  });
});

// ---------------------------------------------------------------- 敌方 AI 处置

test('AI 处置落在合法集合（recruit/execute/dead/release），沿用战斗页已判结果', () => {
  const plan = planAiDisposal({
    captured: ['關羽'],
    executed: ['張飛'],
    dead: ['簡雍'],
    released: ['潘鳳'],
    king: '劉備',
  });
  assert.deepEqual(plan, [
    { name: '關羽', action: 'recruit' },
    { name: '張飛', action: 'execute' },
    { name: '簡雍', action: 'dead' },
    { name: '潘鳳', action: 'release' },
  ]);
  const legal = new Set(['recruit', 'execute', 'dead', 'release']);
  for (const e of plan) assert.ok(legal.has(e.action));
});

test('AI 处置确定性：同输入同输出（不掷骰）、同名去重、君主排除', () => {
  const input = {
    captured: ['關羽', '關羽', '劉備'],
    executed: ['張飛', '關羽'],
    dead: [] as string[],
    released: [] as string[],
    king: '劉備',
  };
  const a = planAiDisposal(input);
  const b = planAiDisposal(input);
  assert.deepEqual(a, b, '确定性：同一输入必须得到同一计划');
  assert.deepEqual(a, [
    { name: '關羽', action: 'recruit' },
    { name: '張飛', action: 'execute' },
  ]);
  assert.ok(!a.some((e) => e.name === '劉備'), '君主不可俘（0x40975E）');
});

test('applyAiDisposal：勸降 → 从所有城名单删掉并打「敵軍」哨兵（转投敌营）', () => {
  const save = makeSave();
  const res = applyAiDisposal(save, [{ name: '關羽', action: 'recruit' }]);
  assert.deepEqual(res.recruited, ['關羽']);
  assert.equal(movedOf(save)['關羽'], ENEMY_HELD);
  assert.deepEqual(rosterAt(save, '小沛'), ['張飛']);
  assert.deepEqual(ourForceNames(save), ['張飛']);

  // 幂等：同一份计划重放不再新打哨兵
  const again = applyAiDisposal(save, [{ name: '關羽', action: 'recruit' }]);
  assert.deepEqual(again.recruited, []);
});

test('applyAiDisposal：斬首 / 阵亡 → 出池（`_moved=陣亡`）；釋放 → 名单原样不动', () => {
  const save = makeSave({ roster: { 小沛: ['關羽', '張飛', '潘鳳'] } });
  const res = applyAiDisposal(save, [
    { name: '張飛', action: 'execute' },
    { name: '關羽', action: 'dead' },
    { name: '潘鳳', action: 'release' },
  ]);
  assert.deepEqual(res.executed, ['張飛']);
  assert.deepEqual(res.dead, ['關羽']);
  assert.deepEqual(res.released, ['潘鳳']);
  assert.equal(movedOf(save)['張飛'], DEAD);
  assert.equal(movedOf(save)['關羽'], DEAD);
  assert.deepEqual(deadNames(save).sort(), ['張飛', '關羽'].sort());
  assert.deepEqual(rosterAt(save, '小沛'), ['潘鳳'], '釋放：名单不动（他本来就在本城）');
  assert.equal(movedOf(save)['潘鳳'], undefined);
});

test('被敌军带走的将重新招降 → 摘掉「敵軍」哨兵并回到名单', () => {
  const save = makeSave();
  markEnemyHeld(save, ['關羽']);
  assert.equal(movedOf(save)['關羽'], ENEMY_HELD);
  assert.ok(!rosterAt(save, '小沛').includes('關羽'));

  applyPostBattle(
    save,
    { captures: [{ name: '關羽', str: 95, int: 75, loyal: 90, recruited: true }] },
    '小沛',
  );
  assert.equal(movedOf(save)['關羽'], undefined, '重新招降必须摘掉 敵軍/釋放 哨兵');
  assert.ok(rosterAt(save, '小沛').includes('關羽'));
});

test('ourForceNames：含名单与 `_moved` 落腳城，排除 陣亡 / 釋放 / 敵軍', () => {
  const save = makeSave({
    roster: { 小沛: ['關羽', '張飛', '華佗'] },
    rosterMoved: undefined,
  });
  save.roster._moved = {
    張飛: '小沛', // 调动到某城 → 仍算我方
    華佗: RELEASED, // 已释放
    關羽: DEAD, // 已阵亡
    潘鳳: ENEMY_HELD, // 被敌军带走
  };
  assert.deepEqual(ourForceNames(save), ['張飛']);
});

test('我軍戰敗的完整接線：不開面板，敵方 AI 处置后待决队列清空（可重入）', () => {
  const save = makeSave({
    owned: [],
    captured: ['關羽'],
    executed: ['張飛'],
    lastBattle: outcome({ won: false, captured: ['關羽'], executed: ['張飛'], ts: 7 }),
  });
  // 1) 胜者门：判我方败，不出卡
  const won = decideBattleWon(save);
  assert.equal(won, false);
  const cards = surrenderCandidates(save, data, { won, mine: ourForceNames(save), king: '劉備' });
  assert.equal(needSurrenderPanel(cards, { won }), false);

  // 2) 敌方 AI 处置（web 侧 aiDisposeCaptives 的等价序列）
  const plan = planAiDisposal({
    captured: save.captured,
    executed: save.executed,
    dead: save.lastBattle.dead,
    king: '劉備',
  });
  applyAiDisposal(save, plan);
  const disposed = new Set(plan.map((e) => e.name));
  save.captured = save.captured.filter((n: string) => !disposed.has(n));
  save.executed = save.executed.filter((n: string) => !disposed.has(n));
  assert.deepEqual(save.captured, [], '待决队列必须清空，否则回大地图会重复处理');
  assert.deepEqual(save.executed, []);
  assert.equal(movedOf(save)['關羽'], ENEMY_HELD);
  assert.equal(movedOf(save)['張飛'], DEAD);

  // 3) 队列已空 → 再进来什么都不做（不重复弹、不重复打哨兵）
  const plan2 = planAiDisposal({ captured: save.captured, executed: save.executed, king: '劉備' });
  assert.deepEqual(plan2, []);
  assert.deepEqual(applyAiDisposal(save, plan2), { recruited: [], executed: [], dead: [], released: [] });
});
