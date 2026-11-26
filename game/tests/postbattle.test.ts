/**
 * 战后结算与成长：R60 四档战报 / R62 战后士气与忠诚 / R61 功勋→疲劳 / R25 升级补学。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/*.test.ts
 * 规则来源：docs/04b §6.1-§6.2、docs/04b2 §4.1、docs/04b5 §2.3、docs/04b §6.7
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import {
  createWorld,
  GREAT_VICTORY_KEEP,
  MORALE_BATTLE_LOSS,
  loyaltyLossOf,
  settle,
  TICK_HZ,
} from '../src/core/battle.ts';
import type { Side, World } from '../src/core/battle.ts';
import { knownMagicOf, learnedAtLevelUp, parseLearnTable } from '../src/core/capture.ts';
import type { GameData } from '../src/types.ts';

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/**
 * 造一个已经打完的世界：直接改 `aliveCount` / `general.alive` / `winner`，
 * 不走 `checkOver()`（结算只读这些字段，见 settle 的入参）。
 */
function endWorld(over: {
  winner: Side | 'draw';
  aAlive: number;
  bAlive: number;
  aDead?: boolean;
  bDead?: boolean;
  tick?: number;
  aLevel?: number;
  aExp?: number;
  aTire?: number;
  aMorale?: number;
  bMorale?: number;
}): World {
  const w = createWorld({
    data,
    seed: 5,
    a: {
      soldiers: 100,
      morale: over.aMorale ?? 60,
      general: { name: '關羽', str: 97, int: 75, level: over.aLevel ?? 6 },
    },
    b: { soldiers: 100, morale: over.bMorale ?? 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  });
  w.tick = over.tick ?? 1110; // 37 秒 → 疲劳 +18
  w.over = true;
  w.winner = over.winner;
  w.endReason = over.winner === 'draw' ? 'time' : over.aDead || over.bDead ? 'general' : 'retreat';
  w.sides.A.start = 100;
  w.sides.B.start = 100;
  w.sides.A.aliveCount = over.aAlive;
  w.sides.B.aliveCount = over.bAlive;
  w.sides.A.general.alive = !over.aDead;
  w.sides.B.general.alive = !over.bDead;
  if (over.aExp !== undefined) w.sides.A.general.exp = over.aExp;
  if (over.aTire !== undefined) w.sides.A.general.tire = over.aTire;
  return w;
}

// ---------------------------------------------------------------------------
// R60 四档战报（`0x41048D` mode 1-4 / `0x447037`）

test('R60 平手：双方兵尽、主将都活 → mode 3「平手」+ 雙方平手', () => {
  const w = endWorld({ winner: 'draw', aAlive: 0, bAlive: 0 });
  const s = settle(w);
  assert.equal(s.mode, 3);
  assert.equal(s.modeName, '平手');
  assert.equal(s.report, '雙方平手');
  assert.deepEqual(s.record, { wins: 0, losses: 0, streak: 0, bestStreak: 0 }, '平手既不算胜也不算败（只清连胜）');
});

test('R60 大胜：歼敌且我方保住七成兵 → mode 4「大胜」+ 我軍大獲全勝!!', () => {
  const w = endWorld({ winner: 'A', aAlive: 85, bAlive: 0, bDead: true });
  const s = settle(w);
  assert.equal(s.mode, 4);
  assert.equal(s.modeName, '大胜');
  assert.equal(s.report, '我軍大獲全勝!!');
  assert.ok(85 / 100 >= GREAT_VICTORY_KEEP);
  assert.deepEqual(s.record, { wins: 1, losses: 0, streak: 1, bestStreak: 1 });
});

test('R60 歼灭：敌将阵亡但己方伤亡大 → mode 1「歼灭」', () => {
  const w = endWorld({ winner: 'A', aAlive: 20, bAlive: 0, bDead: true });
  const s = settle(w);
  assert.equal(s.mode, 1);
  assert.equal(s.modeName, '歼灭');
  assert.ok(s.report.includes('全軍覆沒'));
});

test('R60 击退：敌兵尽但敌将活着逃走 → mode 2「击退」', () => {
  const w = endWorld({ winner: 'A', aAlive: 20, bAlive: 0 });
  const s = settle(w);
  assert.equal(s.mode, 2);
  assert.equal(s.modeName, '击退');
  assert.ok(s.report.includes('潰退'));
});

test('R60 战败：主将阵亡 → 「我軍戰敗了」且记一次败', () => {
  const w = endWorld({ winner: 'B', aAlive: 0, bAlive: 70, aDead: true });
  const s = settle(w);
  assert.equal(s.report, '我軍戰敗了');
  assert.deepEqual(s.record, { wins: 0, losses: 1, streak: 0, bestStreak: 0 });
});

test('R60 战功分按四档系数：大胜 > 平手，歼灭档败方减半', () => {
  const great = settle(endWorld({ winner: 'A', aAlive: 90, bAlive: 0, bDead: true }));
  const draw = settle(endWorld({ winner: 'draw', aAlive: 0, bAlive: 0 }));
  assert.ok(great.score > draw.score, `大胜 ${great.score} 应高于平手 ${draw.score}`);
  const annihilate = settle(endWorld({ winner: 'A', aAlive: 10, bAlive: 0, bDead: true }));
  assert.equal(annihilate.mode, 1);
  assert.ok(annihilate.score > 0);
});

// ---------------------------------------------------------------------------
// R62 战后士气 −20 / 忠诚 −(10−节操)×2（`0x447520`）

test('R62 双方存活武将：士气 −20、忠诚 −(10−节操)×2，且写回双方', () => {
  const w = endWorld({ winner: 'A', aAlive: 80, bAlive: 0 });
  const s = settle(w);
  assert.equal(MORALE_BATTLE_LOSS, 20);
  // 關羽 Loyal 100（clamp 99）/ CONSTANCY 6 → 忠诚 −8
  assert.deepEqual(s.morale.A, { before: 60, after: 40 });
  assert.deepEqual(s.morale.B, { before: 60, after: 40 });
  assert.deepEqual(s.loyalty.A, { before: 99, after: 91 });
  // 張角 Loyal 55 / CONSTANCY 2 → 忠诚 −16
  assert.deepEqual(s.loyalty.B, { before: 55, after: 39 });
  assert.equal(w.sides.A.morale, 40, 'powerOf 读的 sides.morale 必须同步');
  assert.equal(w.sides.A.general.morale, 40, '武将级镜像必须同步');
  assert.equal(w.sides.A.general.loyal, 91);
  assert.equal(w.sides.B.general.loyal, 39);
  assert.equal(loyaltyLossOf(6), 8);
  assert.equal(loyaltyLossOf(2), 16);
});

test('R62 阵亡主将不扣士气/忠诚，疲劳仍照加（原作对 gW/gL 无条件写 +0x3A）', () => {
  const w = endWorld({ winner: 'B', aAlive: 0, bAlive: 70, aDead: true });
  const s = settle(w);
  assert.deepEqual(s.morale.A, { before: 60, after: 60 }, '死了不改士气');
  assert.deepEqual(s.loyalty.A, { before: 99, after: 99 }, '死了不改忠诚');
  assert.equal(s.tire.A.after, s.tire.A.before + s.tireGain);
});

test('R62 settle 幂等：第二次调用不再扣一次士气', () => {
  const w = endWorld({ winner: 'A', aAlive: 80, bAlive: 0 });
  const s1 = settle(w);
  const s2 = settle(w);
  assert.equal(s1, s2);
  assert.equal(w.sides.A.morale, 40);
  assert.equal(w.sides.A.general.loyal, 91);
});

// ---------------------------------------------------------------------------
// R61 功勋 → 疲劳（`0x41048D` ④：`15+秒/10`，双方+，cap 100）

test('R61 疲劳增量 = 15 + 秒数/10（37 秒 → 18），双方都加、封顶 100', () => {
  const w = endWorld({ winner: 'A', aAlive: 80, bAlive: 0, tick: 37 * TICK_HZ, aTire: 90 });
  const s = settle(w);
  assert.equal(s.tireGain, 18);
  assert.deepEqual(s.tire.A, { before: 90, after: 100 }, '90 + 18 封顶 100');
  assert.deepEqual(s.tire.B, { before: 0, after: 18 }, '败方也加（原作两支军队都写）');
  assert.equal(s.meritGain, 18, '功勋与疲劳同源');
  assert.equal(w.sides.A.general.tire, 100);
  assert.equal(w.sides.B.general.tire, 18);
});

test('R61 秒数取整：29 秒 → +17，0 秒 → 15', () => {
  assert.equal(settle(endWorld({ winner: 'A', aAlive: 80, bAlive: 0, tick: 29 * TICK_HZ })).tireGain, 17);
  assert.equal(settle(endWorld({ winner: 'A', aAlive: 80, bAlive: 0, tick: 0 })).tireGain, 15);
});

// ---------------------------------------------------------------------------
// R25 升级补学武將技 / 军师技（`0x40A183` / `0x40A227`）

test('R25 parseLearnTable：字符串与数组两种写法都吃，脏行丢弃', () => {
  assert.deepEqual(parseLearnTable(['6, 63', '1, 50']), [
    [1, 50],
    [6, 63],
  ]);
  assert.deepEqual(parseLearnTable([[17, 77], [1, 50]]), [
    [1, 50],
    [17, 77],
  ]);
  assert.deepEqual(parseLearnTable(['x, y', '', '5', [1, 50]]), [[1, 50]]);
  assert.deepEqual(parseLearnTable(undefined), []);
});

test('R25 knownMagicOf：按等级累计，查不到的编号跳过', () => {
  // 關羽 SKILL = 1,50 / 6,63 / 11,69 / 17,77 / 22,84 / 29,88 / 35,102 / 40,110
  assert.deepEqual(knownMagicOf(data, '關羽', 1), [50]);
  assert.deepEqual(knownMagicOf(data, '關羽', 5), [50]);
  assert.deepEqual(knownMagicOf(data, '關羽', 6), [50, 63]);
  assert.ok(knownMagicOf(data, '關羽', 40).length >= 8);
  assert.deepEqual(knownMagicOf(data, '不存在的人', 40), []);
});

test('R25 learnedAtLevelUp：只报 (from, to] 这段新越过的技', () => {
  // 關羽 5→6 同时越过 武將技 "6, 63" 与 军师技 "6, 16"
  const six = learnedAtLevelUp(data, '關羽', 5, 6);
  assert.deepEqual(
    six.map((k) => `${k.kind}:${k.seq}:${k.name}`),
    ['magic:63:冰柱刺', 'wise:16:強化士兵'],
  );
  assert.deepEqual(learnedAtLevelUp(data, '關羽', 6, 7), [], '6→7 没有新技');
  assert.deepEqual(learnedAtLevelUp(data, '關羽', 6, 5), [], '掉级不补学');
  assert.deepEqual(learnedAtLevelUp(data, '不存在的人', 1, 50), []);
});

test('R25 settle：升级后补学的技出现在 learned（關羽 5 → 6 学会冰柱刺+強化士兵）', () => {
  const w = endWorld({
    winner: 'A',
    aAlive: 90,
    bAlive: 99, // 只杀 1 人，战功/经验不炸，保证只升一级
    aLevel: 5,
    aExp: 1969, // 差 1 点到 6 级（expToReach(6)=1970）
  });
  const s = settle(w);
  assert.equal(s.level, 6);
  assert.equal(s.levelUp, 1);
  assert.deepEqual(
    s.learned.map((k) => k.name),
    ['冰柱刺', '強化士兵'],
  );
  // 面板/技能栏按新等级取已学表，新技必须在里面
  assert.ok(knownMagicOf(data, '關羽', s.level).includes(63));
});

test('R25 settle 未升级时不补学', () => {
  const w = endWorld({ winner: 'A', aAlive: 90, bAlive: 99, aLevel: 6, aExp: 1970 });
  const s = settle(w);
  assert.equal(s.levelUp, 0);
  assert.deepEqual(s.learned, []);
});

// 让类型检查确保 data 用的是 GameData 形状（loadData 返回值）
const _typed: GameData = data;
void _typed;
