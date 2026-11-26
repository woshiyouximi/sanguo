// [R245] 狀態台账：一名武將恰好一个位置（城 / 兵團 / 圍城 / 已亡）
//
// 这一组只测纯逻辑（`RosterLedger.ts` 不 import cc），再加上几条「接线」的文字断言，
// 防止哪天有人把台账摘掉又回到「四份真相各写各的」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  audit,
  handoffCapture,
  locate,
  namesInArmies,
  resolvePendingSieges,
  seedOwnedCity,
} from '../cocos/assets/scripts/RosterLedger.ts';

type Save = Record<string, unknown>;

function saveOf(patch: Record<string, unknown> = {}): Save {
  return {
    owned: ['平原', '樂陵'],
    month: 3,
    roster: { 平原: ['劉備', '關羽'], 樂陵: ['袁紹'] },
    cities: {
      平原: { troops: 200, defense: 200 },
      樂陵: { troops: 120, defense: 100, officers: [{ name: '袁紹' }] },
    } as Record<string, unknown>,
    armies: [],
    ...patch,
  };
}

test('[R245] locate 認得城 / 兵團 / 圍城 / 已亡', () => {
  const save = saveOf({
    armies: [{ id: 'A1', side: 'A', general: '張飛', officers: ['簡雍'], progress: 0.4 }],
    siege: { target: '樂陵', general: '趙雲', officers: [] },
    generalStatus: { 黃忠: '死' },
  });
  assert.equal(locate(save, '關羽').kind, 'city');
  assert.equal(locate(save, '張飛').kind, 'army');
  assert.equal(locate(save, '簡雍').kind, 'army');
  assert.equal(locate(save, '趙雲').kind, 'siege');
  assert.equal(locate(save, '黃忠').kind, 'gone');
  assert.equal(locate(save, '無此人').kind, 'nowhere');
});

test('[R245] audit 抓得到重疊、幽靈、復活', () => {
  const save = saveOf({
    // 關羽 同時在城裡與兵團裡（幽靈副本）；袁紹 已俘卻還在我方名冊（復活）
    armies: [{ id: 'A2', side: 'A', general: '關羽', officers: [] }],
    generalStatus: { 袁紹: '俘' },
  });
  const report = audit(save);
  assert.deepEqual(report.dupes.sort(), ['關羽']);
  assert.deepEqual(report.ghosts.sort(), ['關羽']);
  assert.deepEqual(report.revived.sort(), ['袁紹']);
});

test('[R245] seedOwnedCity 只播種一次，打下的城不播種', () => {
  const fresh = saveOf({ roster: {} });
  assert.equal(seedOwnedCity(fresh, '平原', ['劉備', '關羽']), true);
  assert.deepEqual((fresh.roster as Record<string, string[]>).平原, ['劉備', '關羽']);
  assert.equal(seedOwnedCity(fresh, '平原', ['趙雲']), false);

  const taken = saveOf({ roster: {}, takenOver: { 樂陵: 2 } });
  assert.equal(seedOwnedCity(taken, '樂陵', ['袁紹', '顏良']), false);
});

test('[R245] handoffCapture：清舊主、記接管、寫存活者、跨城不重複', () => {
  const save = saveOf({ generalStatus: { 已亡之人: '死' } });
  const result = handoffCapture(save, '樂陵', ['劉備', '關羽', '已亡之人']);
  const roster = save.roster as Record<string, string[]>;
  assert.deepEqual(result.removed.sort(), ['袁紹']);
  assert.deepEqual(roster.樂陵.sort(), ['劉備', '關羽'].sort());
  assert.deepEqual(roster.平原, [], '打下城的將不該同時留在出發城');
  assert.equal((save.takenOver as Record<string, number>).樂陵, 3);
  assert.deepEqual(((save.cities as Record<string, Record<string, unknown>>).樂陵.officers as unknown[]).length, 0);
});

test('[R245] resolvePendingSieges：寬限月內不動，到點按兵力結算', () => {
  const army = { id: 'B1', side: 'B', general: '顏良', officers: ['文醜'], troops: 300, to: '平原', progress: 1 };
  const save = saveOf({ armies: [army] });

  // 第一個月邊界：只記等待，不動手（玩家還有機會點守城戰）
  assert.deepEqual(resolvePendingSieges(save, { minWait: 2 }), []);
  assert.equal((save.armies as unknown[]).length, 1);

  // 第二個月邊界：300 兵 > 200 + 200/8 ⇒ 城破、守將被俘
  const out = resolvePendingSieges(save, { minWait: 2 });
  assert.equal(out.length, 1);
  assert.equal(out[0].result, 'captured');
  assert.equal(out[0].city, '平原');
  assert.equal((save.owned as string[]).includes('平原'), false);
  assert.equal((save.generalStatus as Record<string, string>).劉備, '俘');
  assert.equal((save.generalStatus as Record<string, string>).關羽, '俘');
  assert.equal((save.armies as unknown[]).length, 0);
});

test('[R245] resolvePendingSieges：守軍夠厚就退敵，城還在', () => {
  const army = { id: 'B2', side: 'B', general: '顏良', officers: [], troops: 40, to: '平原', progress: 1 };
  const save = saveOf({ armies: [army] });
  const out = resolvePendingSieges(save, { minWait: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].result, 'repelled');
  assert.equal((save.owned as string[]).includes('平原'), true);
  assert.equal((save.generalStatus as Record<string, string> | undefined)?.關羽, undefined);
});

test('[R245] 接线：台账入口必须被战役/战斗/编成三处调用', () => {
  const root = new URL('../cocos/assets/scripts/', import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, root), 'utf8');

  const state = read('GameState.ts');
  assert.match(state, /export function repairRoster\(/);
  assert.match(state, /export function handoffCapture\(/);
  assert.match(state, /export function resolvePendingSieges\(/);

  const campaign = read('CampaignRoot.ts');
  assert.match(campaign, /GameState\.repairRoster\(\)/, '开局要自愈旧存档');
  assert.match(campaign, /GameState\.resolvePendingSieges\(\)/, '月结要兜底围城');

  const battle = read('BattleRoot.ts');
  assert.match(battle, /if \(won\) handoffCapture\(target, alive\);/, '打赢要走交接');

  const deploy = read('DeployRoot.ts');
  assert.match(deploy, /takenOverHome/, '编成候选池要认「打下来的城只读名册」');
  assert.match(deploy, /for \(const army of GameState\.armies\(\)\)/, '候选池要剔掉所有兵团（含敌军）的将');
});

test('[R245] namesInArmies 可按侧过滤', () => {
  const save = saveOf({
    armies: [
      { id: 'A1', side: 'A', general: '張飛', officers: [] },
      { id: 'B1', side: 'B', general: '顏良', officers: [] },
    ],
  });
  assert.deepEqual(namesInArmies(save, 'A'), ['張飛']);
  assert.deepEqual(namesInArmies(save, 'B'), ['顏良']);
});
