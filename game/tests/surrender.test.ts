/**
 * 招降决策（R85）测试：`core/roster.ts` 的 `surrenderCandidates()` / `applySurrender()`。
 *
 * 覆盖 `project/89_全流程演练.md` 卡点③ 的验收点：君主不出按钮、三档门槛、斩首落池与
 * `_moved='陣亡'`、招降入城后 `city.roster` 变化、批量全招降/全斩首、空列表不弹、
 * 二次进入不重复结算。
 *
 * R103 追加「釋 放」（原作 `0x491DF4`，`status=2` 安全歸來、`0x40EF9A` 的 switch 不处理
 * case 2 → 无字段变更 = 回原势力）：`_moved='釋放'` 哨兵让 `city_model.rosterOf()` 不再
 * 把他算成我方，`save.released` 累加，重新招降时哨兵被摘掉。
 *
 * 门槛数字全部取自 `generals.json` 的真值 + `0x447520` 战败扣忠诚 `(10-節操)*2`：
 *   呂布 33/節操1 → 33-18=15 → L<25 必降
 *   華佗 92/節操6 → 84      → 硬门 0x12 拒降
 *   張遼 88/節操5 → 78      → 硬门 0x12 拒降
 *   程昱 67/節操3 → 53      → 硬门 0x13 拒降（53 > 50）
 *   兀突骨 50/節操2 → 34      → 0<p<1 须掷骰（t=-1 → 1-0.34²=0.884）
 *   守將（无行）   → 40      → 0<p<1（t=1 → (1-0.4)/3=0.2）
 * 与 `project/89` 的实机日志一致（程昱 53 / 華佗 84 / 張遼 78 / 守將 40 都被判拒降或失败）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadData } from '../src/data.ts';
import { canRecruit, recruitChanceOf } from '../src/core/capture.ts';
import {
  applySurrender,
  isReleased,
  kingsInScenario,
  needSurrenderPanel,
  releaseFromPools,
  releasedNames,
  surrenderCandidates,
} from '../src/core/roster.ts';
// 城池名单的唯一真源（浏览器端无类型 ESM，外壳见 web/city_model.d.ts）；用来验"释放后
// 城池武将列表里没有他"这件事在**表现层函数**上也成立，而不只是 `_moved` 里有个值。
import * as CM from '../web/city_model.js';

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/** 最小可用的战役存档：一座城 + 两个在職武將 */
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

function namesOf(list: { name: string }[]): string[] {
  return list.map((x) => x.name);
}

// ---------------------------------------------------------------- 候选卡

test('空名单不弹面板', () => {
  const save = makeSave();
  const cards = surrenderCandidates(save, data, { atCity: [], mine: [], king: '劉備' });
  assert.deepEqual(cards, []);
  assert.equal(needSurrenderPanel(cards), false);
});

test('卡片字段来自 generals.json + 战败扣忠诚', () => {
  const save = makeSave({ captured: ['張遼'] });
  const cards = surrenderCandidates(save, data);
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.name, '張遼');
  assert.equal(c.str, 95);
  assert.equal(c.int, 88);
  assert.equal(c.constancy, 5);
  assert.equal(c.loyal, 78, '88 - (10-5)*2 = 78');
  assert.equal(c.from, 'captured');
  assert.equal(c.predicted, true);
  assert.equal(c.isKing, false);
  assert.equal(needSurrenderPanel(cards), true);
});

test('可降档：低忠诚 L<25 直接必降（呂布 15）', () => {
  const save = makeSave({ captured: ['呂布'] });
  const c = surrenderCandidates(save, data)[0];
  assert.equal(c.loyal, 15, '33 - (10-1)*2 = 15');
  assert.equal(c.chance, 1);
  assert.equal(c.tier, 'must');
  assert.equal(c.tierText, '可 降');
  assert.equal(c.recruitable, true);
  assert.match(c.reason, /< 25/);
});

test('拒降档：硬门 0x12（張遼 78 / 華佗 84）', () => {
  const save = makeSave({ executed: ['張遼', '華佗'] });
  const cards = surrenderCandidates(save, data);
  assert.equal(cards.length, 2);
  for (const [i, name] of ['張遼', '華佗'].entries()) {
    const c = cards[i];
    assert.equal(c.name, name);
    assert.equal(c.chance, 0);
    assert.equal(c.tier, 'refuse');
    assert.equal(c.tierText, '拒 降');
    assert.equal(c.recruitable, false, '预判失败的不给招降按钮');
    assert.match(c.reason, /0x12/);
  }
});

test('需再战档：中间概率要掷骰（兀突骨 34 → 88.4%；守將 40 → 20%）', () => {
  const save = makeSave({ executed: ['兀突骨', '守將'] });
  const cards = surrenderCandidates(save, data);

  const wu = cards.find((c) => c.name === '兀突骨')!;
  assert.equal(wu.loyal, 34, '50 - (10-2)*2 = 34');
  assert.ok(wu.chance > 0 && wu.chance < 1, `chance=${wu.chance}`);
  assert.equal(wu.tier, 'roll');
  assert.equal(wu.tierText, '需 再 戰');
  assert.match(wu.reason, /成功率 88\.4%/);

  // generals.json 里没有"守將"这一行：武/智默认 0、忠誠默认 50 再扣战败惩罚
  const guard = cards.find((c) => c.name === '守將')!;
  assert.equal(guard.str, 0);
  assert.equal(guard.int, 0);
  assert.equal(guard.loyal, 40);
  assert.equal(guard.tier, 'roll');
  assert.ok(Math.abs(guard.chance - 0.2) < 1e-9, `chance=${guard.chance}`);
});

test('档位与 capture.ts 的 recruitChanceOf 完全同参（不另起一套）', () => {
  const save = makeSave({ captured: ['呂布'], executed: ['程昱', '張遼', '守將'] });
  for (const c of surrenderCandidates(save, data)) {
    const direct = recruitChanceOf(
      { name: c.name, str: c.str, int: c.int, level: 1, loyal: c.loyal, constancy: c.constancy },
      { data, rng: () => 0.5 },
    );
    assert.equal(c.chance, direct, `${c.name} 档位概率必须等于 capture.ts 的判定`);
  }
});

test('面板不掷骰：chance 0/1 时 canRecruit 一次 rng 都不消耗', () => {
  const save = makeSave({ captured: ['呂布'], executed: ['張遼'] });
  let calls = 0;
  const rng = () => {
    calls += 1;
    return 0.5;
  };
  surrenderCandidates(save, data);
  assert.equal(calls, 0, 'surrenderCandidates 自己不该碰 rng');
  // 档位为 0/1 时 canRecruit 走早退，也不消耗 rng（0x44EBE2 只读预算结果）
  for (const c of surrenderCandidates(save, data)) {
    if (c.chance !== 0 && c.chance !== 1) continue;
    canRecruit('A', { name: c.name, str: c.str, int: c.int, level: 1, loyal: c.loyal, constancy: c.constancy }, {
      data,
      rng,
    });
  }
  assert.equal(calls, 0);
});

test('同名同时在 captured / executed：以斩首为准，只出一张', () => {
  const save = makeSave({ captured: ['程昱'], executed: ['程昱'] });
  const cards = surrenderCandidates(save, data);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].from, 'executed');
  assert.equal(cards[0].recruitable, false);
});

test('我方被俘的将我方君主都不出卡', () => {
  const save = makeSave({ captured: ['關羽', '呂布'], executed: ['劉備'] });
  const cards = surrenderCandidates(save, data, { mine: ['關羽'], king: '劉備' });
  assert.deepEqual(namesOf(cards), ['呂布'], '自己人不该被当成俘虏让玩家斩首');
});

test('已斩首（_moved=陣亡）的不再出卡', () => {
  const save = makeSave({ captured: ['程昱'], roster: { 小沛: ['關羽'], _moved: { 程昱: '陣亡' } } });
  assert.deepEqual(surrenderCandidates(save, data), []);
});

// ---------------------------------------------------------------- 君主（0x40975E）

test('君主只显示"逃走"，没有招降/斩首按钮', () => {
  const king = kingsInScenario(data)[0];
  assert.ok(king, '剧本里应有君主');
  const save = makeSave({ king: '劉備' });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  const c = cards.find((x) => x.name === king);
  assert.ok(c, '君主应出现在候选里');
  assert.equal(c.isKing, true);
  assert.equal(c.from, 'king');
  assert.equal(c.recruitable, false);
  assert.equal(c.tierText, '逃 走');
  assert.equal(c.chance, 0);
  assert.match(c.reason, /0x40975E/);
});

test('君主就算被下达斩首也只是逃走：不进 executed、不被标记陣亡', () => {
  const king = kingsInScenario(data)[0];
  const save = makeSave({ executed: [king], roster: { 小沛: [king] } });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  const res = applySurrender(save, cards, { [king]: 'kill' }, '小沛');
  assert.deepEqual(res.escaped, [king]);
  assert.deepEqual(res.killed, []);
  assert.deepEqual(res.removed, []);
  assert.deepEqual(save.roster._moved ?? {}, {}, '君主不该被记成陣亡');
  assert.deepEqual(save.roster['小沛'], [king], '君主不该被移出城名单');
  assert.deepEqual(save.executed, [], '已决策 → 待决名单要清掉');
});

// ---------------------------------------------------------------- 落库

test('招降成功：进该城 roster，captured 清空，二次进入无卡', () => {
  const save = makeSave({ captured: ['呂布'] });
  const cards = surrenderCandidates(save, data);
  const res = applySurrender(save, cards, { 呂布: 'recruit' }, '小沛');

  assert.deepEqual(res.recruited, ['呂布']);
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛', '呂布']);
  assert.deepEqual(save.captured, [], '决策过的名字要从待决名单摘掉');
  assert.deepEqual(surrenderCandidates(save, data), [], '二次进入不该再弹一次');
});

test('招降会把人从别城的旧名单里挪走（跨城去重）', () => {
  const save = makeSave({ captured: ['呂布'], roster: { 小沛: [], 下邳: ['呂布'] } });
  const cards = surrenderCandidates(save, data);
  applySurrender(save, cards, { 呂布: 'recruit' }, '小沛');
  assert.deepEqual(save.roster['小沛'], ['呂布']);
  assert.deepEqual(save.roster['下邳'], []);
});

test('斩首：出池 + _moved 記陣亡，所有城名单都不再有他', () => {
  const save = makeSave({ executed: ['華佗'], roster: { 小沛: ['關羽'], 下邳: ['華佗'] } });
  const cards = surrenderCandidates(save, data);
  const res = applySurrender(save, cards, { 華佗: 'kill' }, '小沛');

  assert.deepEqual(res.killed, ['華佗']);
  assert.deepEqual(res.removed, ['華佗']);
  assert.equal(save.roster._moved['華佗'], '陣亡');
  assert.deepEqual(save.roster['下邳'], []);
  assert.deepEqual(save.executed, []);
});

test('拒降档硬塞"招降"也不算数：rejected + 放走，名单不动', () => {
  const save = makeSave({ executed: ['張遼'] });
  const cards = surrenderCandidates(save, data);
  assert.equal(cards[0].recruitable, false);
  const res = applySurrender(save, cards, { 張遼: 'recruit' }, '小沛');

  assert.deepEqual(res.rejected, ['張遼']);
  assert.deepEqual(res.escaped, ['張遼']);
  assert.deepEqual(res.recruited, []);
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛'], '没招到就不该进池');
  assert.equal(save.roster._moved?.['張遼'], undefined, '也不该被斩首');
  assert.deepEqual(save.executed, []);
});

test('批量：剩余全部招降 = 能降的入城，降不了/君主放走', () => {
  const king = kingsInScenario(data)[0];
  const save = makeSave({ captured: ['呂布'], executed: ['程昱'] });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  // web 侧"全部招降"的算法：能招就招，不能招就放走，君主永远放走
  const picks: Record<string, string> = {};
  for (const c of cards) picks[c.name] = c.isKing ? 'escape' : c.recruitable ? 'recruit' : 'escape';
  const res = applySurrender(save, cards, picks as any, '小沛');

  assert.deepEqual(res.recruited, ['呂布']);
  assert.deepEqual(res.killed, []);
  assert.ok(res.escaped.includes(king));
  assert.ok(res.escaped.includes('程昱'));
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛', '呂布']);
  assert.deepEqual(save.captured, []);
  assert.deepEqual(save.executed, []);
});

test('批量：剩余全部斩首 = 全都出池，君主仍逃走', () => {
  const king = kingsInScenario(data)[0];
  const save = makeSave({ captured: ['呂布'], executed: ['程昱'] });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  const picks: Record<string, string> = {};
  for (const c of cards) picks[c.name] = c.isKing ? 'escape' : 'kill';
  const res = applySurrender(save, cards, picks as any, '小沛');

  assert.deepEqual(res.killed, ['呂布', '程昱']);
  assert.deepEqual(res.recruited, []);
  assert.equal(save.roster._moved['呂布'], '陣亡');
  assert.equal(save.roster._moved['程昱'], '陣亡');
  assert.equal(save.roster._moved[king], undefined);
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛']);
  assert.deepEqual(save.captured, []);
  assert.deepEqual(save.executed, []);
});

test('未决策的卡保持待决：不落库、不清名单、下次还弹', () => {
  const save = makeSave({ captured: ['呂布'], executed: ['華佗'] });
  const cards = surrenderCandidates(save, data);
  const res = applySurrender(save, cards, { 呂布: 'recruit' }, '小沛');

  assert.deepEqual(res.cleared, ['呂布']);
  assert.deepEqual(save.captured, [], '已决策的清掉');
  assert.deepEqual(save.executed, ['華佗'], '没决策的要留着');
  const again = surrenderCandidates(save, data);
  assert.deepEqual(namesOf(again), ['華佗'], '下次进来只剩没决策的那个');
});

test('二次结算不重复：同一批卡再落一次库是幂等的', () => {
  const save = makeSave({ captured: ['呂布'], executed: ['華佗'] });
  const cards = surrenderCandidates(save, data);
  const first = applySurrender(save, cards, { 呂布: 'recruit', 華佗: 'kill' }, '小沛');
  assert.deepEqual(first.recruited, ['呂布']);
  assert.deepEqual(first.removed, ['華佗']);

  const second = applySurrender(save, cards, { 呂布: 'recruit', 華佗: 'kill' }, '小沛');
  assert.deepEqual(second.recruited, [], '重复落库不该再 push');
  assert.deepEqual(second.removed, [], '重复落库不该再记移除');
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛', '呂布'], '名单不该出现重复副本');
});

test('没俘虏时不下手：roster 不该凭空建出空城数组', () => {
  const save = makeSave({ roster: {} });
  const cards = surrenderCandidates(save, data);
  assert.deepEqual(cards, []);
  applySurrender(save, cards, {}, '小沛');
  assert.deepEqual(save.roster, {}, '空列表不该把城"建"出来');
});

// ---------------------------------------------------------------- 释放（R103）
// 原作 `0x44EDB4` 只写 `status=2`，`0x40EF9A` 的 switch 对 case 2 什么都不做
// （`docs/04b2` §6.2 [确认]）→ 释放 = 回原势力（势力/君主/所在城指针原样），不是转在野。
// 本作里"回原势力"表现成：不在我方任何城的名单（`_moved='釋放'` 哨兵）+ `save.released` 累加。

test('释放：回原势力，不进我方名单、不进斩首池，save.released 记下来', () => {
  const save = makeSave({ captured: ['張遼'], roster: { 小沛: ['關羽'], 下邳: ['張遼'] } });
  const cards = surrenderCandidates(save, data, { atCity: [], mine: [], king: '劉備' });
  const res = applySurrender(save, cards, { 張遼: 'release' }, '小沛');

  assert.deepEqual(res.released, ['張遼']);
  assert.deepEqual(res.recruited, [], '释放不是招降');
  assert.deepEqual(res.killed, [], '释放不是斩首');
  assert.deepEqual(res.removed, [], '不该记进"出池移除"');
  assert.equal(save.roster._moved['張遼'], '釋放', '_moved 哨兵：不在我方任何城');
  assert.equal(isReleased(save, '張遼'), true);
  assert.deepEqual(releasedNames(save), ['張遼']);
  assert.deepEqual(save.released, ['張遼'], '存档里要能查到释放过谁（战报/后查）');
  assert.deepEqual(save.captured, [], '已决策 → 待决名单摘掉');
  assert.deepEqual(save.executed, [], '也不该被塞进斩首名单');
  assert.deepEqual(save.roster['小沛'], ['關羽'], '没进我方城名单');
  assert.deepEqual(save.roster['下邳'], [], '别城的同名副本也要摘掉');
});

test('释放后城池武将列表（city_model.rosterOf）里没有他；重新招降又回来', () => {
  const ctx = { scenIdx: 1, generals: data.generals };
  const namesAt = (save: any): string[] => CM.rosterOf(save, '陳留', ctx).map((g: any) => g.NAME);
  // 陳留（剧本 1）的常駐將有 夏侯惇（status 登）；刚打下来 → 静态 city_by_times 会把他算成我方
  const save = makeSave({
    owned: ['陳留'],
    cities: { 陳留: { troops: 800, money: 200, pop: 3000, owner: '劉備' } },
    roster: { 陳留: [] },
    captured: ['夏侯惇'],
  });
  assert.ok(namesAt(save).includes('夏侯惇'), '释放前他会被静态守将表算成我方武将');

  const cards = surrenderCandidates(save, data, { atCity: [], mine: [], king: '劉備' });
  applySurrender(save, cards, { 夏侯惇: 'release' }, '陳留');
  assert.ok(!namesAt(save).includes('夏侯惇'), '释放后城池武将列表里不该有他');
  assert.ok(namesAt(save).length > 0, '同城别的武将不受影响');

  // 再被俘 → 再招降：哨兵摘掉，人回到名单（释放不是死刑）
  save.captured = ['夏侯惇'];
  const again = surrenderCandidates(save, data, { atCity: [], mine: [], king: '劉備' });
  const res = applySurrender(save, again, { 夏侯惇: 'recruit' }, '陳留');
  assert.deepEqual(res.recruited, ['夏侯惇']);
  assert.equal(save.roster._moved['夏侯惇'], undefined, '招回来后要摘掉釋放哨兵');
  assert.ok(namesAt(save).includes('夏侯惇'), '重新招降的将要回到城池名单');
});

test('拒降档也能释放：釋放不看招降硬门', () => {
  const save = makeSave({ executed: ['張遼'] });
  const cards = surrenderCandidates(save, data);
  assert.equal(cards[0].recruitable, false, '拒降档本来点不了「招降」');
  const res = applySurrender(save, cards, { 張遼: 'release' }, '小沛');

  assert.deepEqual(res.released, ['張遼']);
  assert.deepEqual(res.rejected, [], '释放不是"硬塞招降"');
  assert.deepEqual(res.escaped, []);
  assert.equal(save.roster._moved['張遼'], '釋放');
  assert.deepEqual(save.executed, []);
});

test('君主卡按"释放"也只逃走：不写 released、不动名单', () => {
  const king = kingsInScenario(data)[0];
  const save = makeSave({ captured: [king], roster: { 小沛: ['關羽', king] } });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  const res = applySurrender(save, cards, { [king]: 'release' }, '小沛');

  assert.deepEqual(res.escaped, [king]);
  assert.deepEqual(res.released, []);
  assert.equal(save.released, undefined, '君主没有"释放"这回事');
  assert.deepEqual(save.roster._moved ?? {}, {}, '君主不该被写任何哨兵');
  assert.deepEqual(save.roster['小沛'], ['關羽', king], '君主也不该被移出城名单');
});

test('批量：剩余全部释放 = 全都回原势力，君主仍只逃走', () => {
  const king = kingsInScenario(data)[0];
  const save = makeSave({ captured: ['呂布'], executed: ['程昱'] });
  const cards = surrenderCandidates(save, data, { atCity: [king], king: '劉備' });
  const picks: Record<string, string> = {};
  for (const c of cards) picks[c.name] = c.isKing ? 'escape' : 'release';
  const res = applySurrender(save, cards, picks as any, '小沛');

  assert.deepEqual(res.released, ['呂布', '程昱']);
  assert.deepEqual(save.released, ['呂布', '程昱']);
  assert.equal(save.roster._moved['呂布'], '釋放');
  assert.equal(save.roster._moved['程昱'], '釋放');
  assert.equal(save.roster._moved[king], undefined, '君主不写哨兵');
  assert.deepEqual(save.roster['小沛'], ['關羽', '張飛'], '谁都没进我方名单');
  assert.deepEqual(save.captured, []);
  assert.deepEqual(save.executed, []);
});

test('save.released 累加：两仗各放一个；同一批卡重放不重复记', () => {
  const save = makeSave({ captured: ['張遼'] });
  applySurrender(save, surrenderCandidates(save, data), { 張遼: 'release' }, '小沛');
  assert.deepEqual(save.released, ['張遼']);

  save.captured = ['呂布'];
  const cards2 = surrenderCandidates(save, data);
  applySurrender(save, cards2, { 呂布: 'release' }, '小沛');
  assert.deepEqual(save.released, ['張遼', '呂布'], '第二仗要累加，不能覆盖');

  const again = applySurrender(save, cards2, { 呂布: 'release' }, '小沛');
  assert.deepEqual(again.released, ['呂布'], '幂等重放：结果照列（玩家确实选了释放）');
  assert.deepEqual(save.released, ['張遼', '呂布'], '但存档里不该出现第二个"呂布"');
  assert.equal(save.released.filter((n: string) => n === '呂布').length, 1);
});

test('释放不是出池：下次再被俘照样出卡（isDead 只认陣亡）', () => {
  const save = makeSave({ captured: ['呂布'] });
  applySurrender(save, surrenderCandidates(save, data), { 呂布: 'release' }, '小沛');
  save.captured = ['呂布'];
  const again = surrenderCandidates(save, data);
  assert.deepEqual(again.map((c) => c.name), ['呂布'], '他还在原势力，能再遇、能再俘');
});

test('已斩首的不会被"释放"复活（斩首优先）', () => {
  const save = makeSave({ roster: { 小沛: ['關羽'], _moved: { 華佗: '陣亡' } } });
  const out = releaseFromPools(save, ['華佗']);
  assert.deepEqual(out, [], '死了就不算"本次释放"');
  assert.equal(save.roster._moved['華佗'], '陣亡');
  assert.equal(isReleased(save, '華佗'), false);
  assert.deepEqual(releasedNames(save), []);
});
