/**
 * 战后招降入城自检：只收 `recruited === true`、写进城池名单、**幂等**。
 *
 * 存档形状见 `src/types.ts` 的 `CampaignSave`（`roster[城名] = 武将名[]`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CampaignSave } from '../src/types.ts';
import { DEAD, applyCapturesToRoster, applyPostBattle, isDead, movedOf, removeFromPools } from '../src/core/roster.ts';
import type { PostBattle } from '../src/core/roster.ts';

/** 造一条招降结果；`recruited` 缺省 true */
function cap(name: string, recruited = true): PostBattle['captures'][number] {
  return { name, str: 70, int: 60, loyal: 40, recruited };
}

const CITY = '洛陽';

test('招 2 人入城：都进该城名单，added 按顺序返回', () => {
  const save: CampaignSave = { roster: { [CITY]: [] } };
  const post: PostBattle = { captures: [cap('張飛'), cap('關羽')] };
  const r = applyCapturesToRoster(save, post, CITY);
  assert.deepEqual(r.added, ['張飛', '關羽']);
  assert.deepEqual(save.roster![CITY], ['張飛', '關羽']);
});

test('幂等：重复调用不重复 push，第二次 added 为空', () => {
  const save: CampaignSave = { roster: { [CITY]: ['趙雲'] } };
  const post: PostBattle = { captures: [cap('張飛'), cap('趙雲')] };

  const r1 = applyCapturesToRoster(save, post, CITY);
  assert.deepEqual(r1.added, ['張飛'], '趙雲 已在名单里，不该重复加');
  assert.deepEqual(save.roster![CITY], ['趙雲', '張飛']);

  const r2 = applyCapturesToRoster(save, post, CITY);
  assert.deepEqual(r2.added, []);
  assert.deepEqual(save.roster![CITY], ['趙雲', '張飛'], '重复调用后名单不变');

  // 同一批里出现两次同名也只进一次
  const r3 = applyCapturesToRoster(save, { captures: [cap('馬超'), cap('馬超')] }, CITY);
  assert.deepEqual(r3.added, ['馬超']);
  assert.equal(save.roster![CITY]!.filter((n) => n === '馬超').length, 1);
});

test('recruited:false（已斩/已放）不进城池名单', () => {
  const save: CampaignSave = {};
  const post: PostBattle = { captures: [cap('呂布', false), cap('張遼', true), cap('高順', false)] };
  const r = applyCapturesToRoster(save, post, CITY);
  assert.deepEqual(r.added, ['張遼']);
  assert.deepEqual(save.roster![CITY], ['張遼']);
});

test('homeCity 没有名单时自动建数组（save.roster 缺失或该城缺键都要能建）', () => {
  // 1) 连 save.roster 都没有
  const fresh: CampaignSave = { gold: 100 };
  const r1 = applyCapturesToRoster(fresh, { captures: [cap('黃忠')] }, '成都');
  assert.deepEqual(r1.added, ['黃忠']);
  assert.deepEqual(fresh.roster, { 成都: ['黃忠'] });

  // 2) 有 roster 但没有这座城
  const save: CampaignSave = { roster: { [CITY]: ['曹操'] } };
  const r2 = applyCapturesToRoster(save, { captures: [cap('夏侯淵')] }, '許昌');
  assert.deepEqual(r2.added, ['夏侯淵']);
  assert.deepEqual(save.roster![CITY], ['曹操'], '别的城不该被动');
  assert.deepEqual(save.roster!['許昌'], ['夏侯淵']);
});

// ------------------------------------------------- 2. R56 斩首 → 出池（docs/04c:308-316）

test('R56：斩首者从所有城名单移除，并在 _moved 记「陣亡」', () => {
  const save: CampaignSave = {
    roster: { [CITY]: ['呂布', '張遼'], 許昌: ['呂布', '曹操'] },
  };
  const r = applyPostBattle(save, { captures: [], executed: [cap('呂布', false)] }, CITY);
  assert.deepEqual(r.removed, ['呂布']);
  assert.deepEqual(r.added, []);
  assert.deepEqual(save.roster![CITY], ['張遼']);
  assert.deepEqual(save.roster!['許昌'], ['曹操'], '别的城的同名副本也要清掉');
  assert.equal(movedOf(save)['呂布'], DEAD);
  assert.equal(isDead(save, '呂布'), true);
  assert.equal(isDead(save, '張遼'), false);
});

test('R56：阵亡者不会被再次招降（池子已出，招降入口也挡住）', () => {
  const save: CampaignSave = { roster: { [CITY]: ['呂布'] } };
  applyPostBattle(save, { captures: [], executed: [cap('呂布', false)] }, CITY);
  const again = applyPostBattle(save, { captures: [cap('呂布')] }, CITY);
  assert.deepEqual(again.added, []);
  assert.deepEqual(save.roster![CITY] ?? [], []);
  assert.equal(again.removed.length, 0, '幂等：第二次没有东西可移除');
});

test('R56：招降者先从别城名单摘掉再进本城，不留两个副本', () => {
  const save: CampaignSave = { roster: { [CITY]: ['關羽'], 許昌: [] } };
  const r = applyPostBattle(save, { captures: [cap('關羽')] }, '許昌');
  assert.deepEqual(r.added, ['關羽']);
  assert.deepEqual(save.roster![CITY], [], '原城不该留着');
  assert.deepEqual(save.roster!['許昌'], ['關羽']);
  assert.equal(isDead(save, '關羽'), false);
});

test('R56 幂等：同一份战报放两次，第二次 added / removed 都是空', () => {
  // 洛陽 是败方城（呂布被斩、高順被俘），許昌 是胜方本城
  const save: CampaignSave = { roster: { [CITY]: ['呂布', '高順'], 許昌: [] } };
  const post: PostBattle = { captures: [cap('高順')], executed: [cap('呂布', false)] };
  const r1 = applyPostBattle(save, post, '許昌');
  assert.deepEqual(r1, { added: ['高順'], removed: ['呂布'] });
  assert.deepEqual(save.roster![CITY], [], '败方城两个人都清掉了');
  assert.deepEqual(save.roster!['許昌'], ['高順']);
  const snapshot = JSON.parse(JSON.stringify(save));
  const r2 = applyPostBattle(save, post, '許昌');
  assert.deepEqual(r2, { added: [], removed: [] });
  assert.deepEqual(save, snapshot, '重复应用不改存档');
});

test('R56：executed 缺省（旧调用方只传 captures）不报错、也不建空城', () => {
  const save: CampaignSave = { roster: {} };
  const r = applyPostBattle(save, { captures: [cap('龐德')] }, '長安');
  assert.deepEqual(r, { added: ['龐德'], removed: [] });
  assert.deepEqual(save.roster!['長安'], ['龐德']);
  const empty = applyPostBattle(save, { captures: [] }, '不存在城');
  assert.deepEqual(empty, { added: [], removed: [] });
  assert.equal(save.roster!['不存在城'], undefined, '没有新招募就不该建空数组');
});

test('removeFromPools：不在任何城名单里的人也要记死；重复调用幂等', () => {
  const save: CampaignSave = { roster: { [CITY]: ['曹操'] } };
  assert.deepEqual(removeFromPools(save, ['孫權']), ['孫權'], '守将可能在野外/敌城数据里，仍要记死');
  assert.equal(isDead(save, '孫權'), true);
  assert.deepEqual(save.roster![CITY], ['曹操'], '别人的名单不该被动');
  assert.deepEqual(removeFromPools(save, ['孫權']), [], '幂等：第二次不再算新移除');
  assert.deepEqual(removeFromPools(save, ['曹操']), ['曹操']);
  assert.deepEqual(save.roster![CITY], []);
});

test('applyCapturesToRoster 不写 _moved（保持旧存档形状）', () => {
  const save: CampaignSave = { roster: { [CITY]: [] } };
  applyCapturesToRoster(save, { captures: [cap('張郃')] }, CITY);
  assert.deepEqual(save.roster, { [CITY]: ['張郃'] }, '不该多出 _moved 键');
});
