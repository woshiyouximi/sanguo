/**
 * run_scoped.test.ts — 局内状态清库（R214）的守门用例。
 *
 * 背景 bug：Cocos 战役存档不做白名单，`SurrenderModel.queuePostBattle()` 把 `captured` /
 * `executed` 直接写进存档；`initCampaign(fresh)` 在 R214 之前只清 `owned/cities/seeded`，
 * 于是「上一局的待决俘虏」活到下一局 —— 用户实测：选《討伐董卓》+ 劉備，一进大地图
 * 先弹「处置张角」。
 *
 * 这里只测纯函数（`RunScoped.ts` 不 import 'cc'），所以能在 node 里直接跑。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearRunScoped,
  hasPendingCaptures,
  healStaleQueue,
  nameList,
  RUN_SCOPED_KEYS,
  staleQueueNames,
} from '../src/core/run_scoped.ts';

/** 典型「脏档」：上一局打完了，队列留着，战果记录也留着。 */
function dirtySave(): Record<string, unknown> {
  return {
    owned: ['平原'],
    wins: 3,
    losses: 1,
    streak: 2,
    bestStreak: 4,
    month: 1,
    gold: 1200,
    runKey: '0:劉備',
    captured: ['張角'],
    executed: ['程遠志'],
    lastBattle: { win: true },
    lastPost: { drops: [] },
    roster: { 平原: ['劉備', '關羽'], _moved: {} },
    acted: { 關羽: 1 },
    away: { 張飛: '代縣' },
    armies: [{ id: 'a1' }],
    armySeq: 1,
  };
}

describe('R214 局内状态清库', () => {
  it('clearRunScoped 删净七个局内键并清空 armies', () => {
    const save = dirtySave();
    clearRunScoped(save);
    for (const key of RUN_SCOPED_KEYS) {
      assert.equal(key in save, false, `${key} 应该被删掉`);
    }
    assert.deepEqual(save.armies, []);
  });

  it('clearRunScoped 保留跨局战绩与存档本体字段', () => {
    const save = dirtySave();
    clearRunScoped(save);
    assert.deepEqual(save.owned, ['平原']);
    assert.equal(save.wins, 3);
    assert.equal(save.losses, 1);
    assert.equal(save.streak, 2);
    assert.equal(save.bestStreak, 4);
    assert.equal(save.gold, 1200);
    assert.equal(save.runKey, '0:劉備');
    assert.equal(save.month, 1);
  });

  it('staleQueueNames：有队列没战果 = 无主队列', () => {
    const save = dirtySave();
    delete save.lastBattle;
    delete save.lastPost;
    assert.deepEqual(staleQueueNames(save).sort(), ['張角', '程遠志'].sort());
  });

  it('staleQueueNames：有战果时不算无主（同一场尚未处置）', () => {
    assert.deepEqual(staleQueueNames(dirtySave()), []);
  });

  it('staleQueueNames：空队列永远不算', () => {
    assert.deepEqual(staleQueueNames({ captured: [], executed: [] }), []);
    assert.deepEqual(staleQueueNames({}), []);
  });

  it('staleQueueNames：非数组 / 空白名字一律忽略', () => {
    assert.deepEqual(staleQueueNames({ captured: '張角' }), []);
    assert.deepEqual(staleQueueNames({ captured: ['  ', '', null] }), []);
  });

  it('healStaleQueue：清掉无主队列并报告 true（只清一次）', () => {
    const save = dirtySave();
    delete save.lastBattle;
    delete save.lastPost;
    assert.equal(healStaleQueue(save), true);
    assert.equal('captured' in save, false);
    assert.equal('executed' in save, false);
    assert.equal(healStaleQueue(save), false, '第二次不该再报 true');
  });

  it('healStaleQueue：有战果的队列原样保留', () => {
    const save = dirtySave();
    assert.equal(healStaleQueue(save), false);
    assert.deepEqual(save.captured, ['張角']);
    assert.deepEqual(save.executed, ['程遠志']);
  });

  it('nameList 去空白、保持顺序', () => {
    assert.deepEqual(nameList([' 張角 ', '', '關羽', null, '  ']), ['張角', '關羽']);
    assert.deepEqual(nameList(undefined), []);
  });

  it('hasPendingCaptures：有队列才返回 true（开面板的前置闸）', () => {
    assert.equal(hasPendingCaptures({}), false);
    assert.equal(hasPendingCaptures({ captured: [] }), false);
    assert.equal(hasPendingCaptures({ captured: ['  '] }), false);
    assert.equal(hasPendingCaptures({ captured: ['張角'] }), true);
    assert.equal(hasPendingCaptures({ executed: ['程遠志'] }), true);
    // 只有战果记录、没有名字：不是待决队列，不该开面板（R214 张角 bug 的判据）
    assert.equal(hasPendingCaptures({ lastBattle: { win: true }, captured: [] }), false);
  });
});
