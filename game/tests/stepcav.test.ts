/**
 * R22 步/骑分列 + R54 败方全员处置 + 格挡精确计数。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/*.test.ts
 * 规则来源：docs/04b §2.4（步/骑两栏上限 0x409FB6 / 0x409FD8）、§6.2（战功分 0x41048D：
 * 步兵×6 + 骑兵×12）、§6.7（升级「有5名士兵升為騎兵」）、docs/04b2 §2.4（0x40452E 全员循环）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
// m4：默认待機后旧测试要显式下令（engage = 原作 AI case2 的两条命令）。
import { engage } from './_engage.ts';
import { cavalryCapOf, createWorld, settle, step } from '../src/core/battle.ts';
import type { Side, World } from '../src/core/battle.ts';
import { resolvePostBattle } from '../src/core/capture.ts';
import type { PostBattleWorld, PostGeneral } from '../src/core/capture.ts';

const data = loadData({
  dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

/** 顺序 rng：用完 seq 后固定 0.5；`calls()` 用来钉住"谁消耗了几次随机" */
function seqRng(seq: number[]): { rng: () => number; calls: () => number; track: number[] } {
  let i = 0;
  const track: number[] = [];
  const rng = () => {
    const v = i < seq.length ? seq[i++]! : 0.5;
    track.push(v);
    return v;
  };
  return { rng, calls: () => track.length, track };
}

function officersOf(...list: PostGeneral[]): PostGeneral[] {
  return list;
}

/** 败方 3 名副将（忠诚低=必降 / 忠诚高=招不动），主将可单独指定生死 */
function multiWorld(opts: {
  winner?: Side;
  mainAlive?: boolean;
  mainLoyal?: number;
  officers: PostGeneral[];
  bAlive?: number;
}): PostBattleWorld {
  return {
    winner: opts.winner ?? 'A',
    endReason: 'troops',
    sides: {
      A: { start: 100, aliveCount: 80, general: { name: '關羽', str: 97, int: 75, level: 6, alive: true } },
      B: {
        start: 100,
        aliveCount: opts.bAlive ?? 20,
        // 主将故意用非君主：張角 是剧本 0 君主，`0x40975E` 规定君主被俘必定逃脱
        // （`resolvePostBattle` 进 kingsEscaped，不进处置名单），详见 project/53。
        general: {
          name: '陳登',
          str: 70,
          int: 88,
          level: 5,
          alive: opts.mainAlive ?? true,
          loyal: opts.mainLoyal ?? 55,
          constancy: 2,
        },
        officers: opts.officers,
      },
    },
  };
}

const LOW = 10; // 忠诚 → 被俘惩罚后 0 → 必降，且不掷招降骰
const HIGH = 95; // 忠诚 → 0x11 硬门，必不降，且不掷招降骰（R53）

// ---------------------------------------------------------------------------
// R22 骑兵上限（0x409FD8）

test('R22 骑兵上限 clamp((等级−20)×5,0,100)：20 级前恒 0，40 级封顶', () => {
  assert.equal(cavalryCapOf(1), 0);
  assert.equal(cavalryCapOf(20), 0);
  assert.equal(cavalryCapOf(21), 5);
  assert.equal(cavalryCapOf(24), 20);
  assert.equal(cavalryCapOf(25), 25);
  assert.equal(cavalryCapOf(40), 100);
  assert.equal(cavalryCapOf(55), 100);
});

test('R22 createWorld 默认按等级配骑兵：25 级 → 25 骑，20 级 → 0 骑，50 级 → 100 骑', () => {
  const w25 = createWorld({ data, seed: 3, b: { soldiers: 100, general: { str: 70, int: 88, level: 25 } } });
  assert.equal(w25.sides.B.cavalry, 25);
  const cav25 = w25.units.filter((u) => u.side === 'B' && u.kind === 'cavalry');
  assert.equal(cav25.length, 25, '场上应该正好 25 个骑兵单位');
  assert.equal(w25.units.filter((u) => u.side === 'B' && u.kind === 'infantry').length, 75);

  const w20 = createWorld({ data, seed: 3, b: { soldiers: 100, general: { str: 70, int: 88, level: 20 } } });
  assert.equal(w20.sides.B.cavalry, 0, '20 级及以下没有骑兵');
  assert.equal(w20.units.filter((u) => u.side === 'B' && u.kind === 'cavalry').length, 0);

  const w50 = createWorld({
    data,
    seed: 3,
    b: { soldiers: 100, cavalry: 100, general: { str: 70, int: 88, level: 50 } },
  });
  assert.equal(w50.sides.B.cavalry, 100);
});

test('R22 显式 cavalry 覆盖默认值，且被带兵数截断', () => {
  const w = createWorld({
    data,
    seed: 3,
    b: { soldiers: 30, cavalry: 40, general: { str: 70, int: 88, level: 25 } },
  });
  assert.equal(w.sides.B.cavalry, 30, '骑兵不能多于带兵数');
  assert.equal(w.sides.B.start, 30);
  const zero = createWorld({
    data,
    seed: 3,
    b: { soldiers: 100, cavalry: 0, general: { str: 70, int: 88, level: 25 } },
  });
  assert.equal(zero.sides.B.cavalry, 0, '显式 0 表示全步兵（剧本/调试用）');
});

// ---------------------------------------------------------------------------
// R22 「只贴标签、不改战力学」

test('R22 贴 kind 不改落位：有骑/无骑两个世界单位坐标逐个相同', () => {
  const opts = { soldiers: 100, general: { str: 70, int: 88, level: 25 } } as const;
  const cav = createWorld({ data, seed: 11, b: { ...opts } });
  const inf = createWorld({ data, seed: 11, b: { ...opts, cavalry: 0 } });
  assert.equal(cav.units.length, inf.units.length);
  for (let i = 0; i < cav.units.length; i++) {
    const x = cav.units[i]!;
    const y = inf.units[i]!;
    assert.equal(x.x, y.x, `第 ${i} 个单位 x 变了`);
    assert.equal(x.y, y.y, `第 ${i} 个单位 y 变了`);
    assert.equal(x.isGeneral, y.isGeneral);
  }
});

test('R22 贴 kind 不改战力：同 seed 打 300 tick，出手/命中/存活逐位相同', () => {
  const opts = { soldiers: 40, morale: 60, general: { str: 80, int: 60, level: 25 } } as const;
  const cav = createWorld({ data, seed: 21, a: { ...opts }, b: { ...opts, general: { str: 75, int: 60, level: 25 } } });
  const inf = createWorld({
    data,
    seed: 21,
    a: { ...opts, cavalry: 0 },
    b: { ...opts, cavalry: 0, general: { str: 75, int: 60, level: 25 } },
  });
  for (let i = 0; i < 300; i++) {
    step(cav);
    step(inf);
  }
  assert.equal(cav.stats.attacksA, inf.stats.attacksA);
  assert.equal(cav.stats.attacksB, inf.stats.attacksB);
  assert.equal(cav.stats.hitsA, inf.stats.hitsA);
  assert.equal(cav.stats.hitsB, inf.stats.hitsB);
  assert.equal(cav.stats.blocks, inf.stats.blocks);
  assert.equal(cav.sides.A.aliveCount, inf.sides.A.aliveCount);
  assert.equal(cav.sides.B.aliveCount, inf.sides.B.aliveCount);
});

// ---------------------------------------------------------------------------
// R22 战功分：步兵×6 + 骑兵×12

/** 造一个打到一半的世界：手动点掉败方若干步/骑，跑一 tick 让 recompute 记账，再强制结束 */
function killAndEnd(w: World, winner: Side, dead: { side: Side; inf?: number; cav?: number }[]): void {
  for (const d of dead) {
    const units = w.units.filter((u) => u.side === d.side && u.alive && !u.isGeneral);
    const inf = units.filter((u) => u.kind !== 'cavalry');
    const cav = units.filter((u) => u.kind === 'cavalry');
    for (const u of inf.slice(0, d.inf ?? 0)) u.alive = false;
    for (const u of cav.slice(0, d.cav ?? 0)) u.alive = false;
  }
  step(w); // recompute() 在这里把阵亡数记进 stats
  w.over = true;
  w.winner = winner;
  w.endReason = 'troops';
}

test('R22 战功分基数：10 步兵×6 + 5 骑兵×12 = 120，mode2 再加敌将等级×34', () => {
  const w = createWorld({
    data,
    seed: 31,
    a: { soldiers: 100, general: { str: 97, int: 75, level: 6 } },
    b: { soldiers: 100, cavalry: 25, general: { str: 70, int: 88, level: 5 } },
  });
  killAndEnd(w, 'A', [{ side: 'B', inf: 10, cav: 5 }]);
  assert.equal(w.stats.killsInf, 10);
  assert.equal(w.stats.killsCav, 5);
  const s = settle(w);
  assert.equal(s.mode, 2, '敌将活着、兵没打完 → 击退档');
  assert.equal(s.killsInf, 10);
  assert.equal(s.killsCav, 5);
  assert.equal(s.score, 10 * 6 + 5 * 12 + 5 * 34);
});

test('R22 骑兵权重是步兵两倍：同样 15 人，骑 350 > 步 260', () => {
  const mk = () =>
    createWorld({
      data,
      seed: 41,
      a: { soldiers: 100, general: { str: 97, int: 75, level: 6 } },
      b: { soldiers: 100, cavalry: 25, general: { str: 70, int: 88, level: 5 } },
    });
  const inf = mk();
  killAndEnd(inf, 'A', [{ side: 'B', inf: 15 }]);
  const cav = mk();
  killAndEnd(cav, 'A', [{ side: 'B', cav: 15 }]);
  assert.equal(settle(inf).score, 15 * 6 + 5 * 34);
  assert.equal(settle(cav).score, 15 * 12 + 5 * 34);
  assert.ok(settle(cav).score > settle(inf).score);
});

test('R22 败方 scL 也分步/骑：我方损失 5 步 + 5 骑 = 30 + 60', () => {
  const w = createWorld({
    data,
    seed: 51,
    a: { soldiers: 100, cavalry: 20, general: { str: 97, int: 75, level: 6 } },
    b: { soldiers: 100, general: { str: 70, int: 88, level: 5 } },
  });
  killAndEnd(w, 'B', [{ side: 'A', inf: 5, cav: 5 }]);
  assert.equal(w.stats.killsInfB, 5);
  assert.equal(w.stats.killsCavB, 5);
  const s = settle(w);
  assert.equal(s.mode, 2);
  // 我方战败时 score 取 scL = 损失分 + 敌方主将等级 ×8.5
  assert.equal(s.score, 5 * 6 + 5 * 12 + Math.round(6 * 8.5));
});

test('R22 真打一局：killsInf + killsCav 恒等于 start − aliveCount（含法术击杀的统计口径）', () => {
  const w = engage(createWorld({
    data,
    seed: 61,
    a: { soldiers: 40, general: { str: 97, int: 75, level: 6 } },
    b: { soldiers: 40, cavalry: 20, general: { str: 70, int: 88, level: 25 } },
  }));
  for (let i = 0; i < 6000 && !w.over; i++) step(w);
  assert.ok(w.over, '6000 tick 内应该分出胜负');
  assert.equal(w.stats.killsInf + w.stats.killsCav, w.sides.B.start - w.sides.B.aliveCount);
  assert.equal(w.stats.killsInfB + w.stats.killsCavB, w.sides.A.start - w.sides.A.aliveCount);
  const s = settle(w);
  assert.equal(s.killsInf + s.killsCav, s.kills);
  assert.equal(s.score > 0, true);
});

// ---------------------------------------------------------------------------
// R54 败方全员逐个处置（0x40452E 的循环）

test('R54 主将 + 3 副将逐个处置：主将释放、3 名副将归顺', () => {
  const officers = officersOf(
    { name: '張寶', str: 60, int: 70, level: 4, loyal: LOW, constancy: 2 },
    { name: '張梁', str: 55, int: 60, level: 3, loyal: LOW, constancy: 2 },
    { name: '張飛', str: 88, int: 40, level: 2, loyal: LOW, constancy: 2 },
  );
  const world = multiWorld({ officers });
  // rng 顺序：主将被俘 → 招降两次掷骰（L39/C2，t=-1）→ 斩首掷骰 → 3 名副将各一次被俘掷骰。
  // 注意：**战斗掉落已在 R57 按原作删除**（docs/04b2 §5.1 负证据），所以不再有最后那次掷骰。
  const { rng, calls } = seqRng([0, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1]);
  const post = resolvePostBattle(world, data, rng);
  assert.equal(calls(), 7, '4 次被俘 + 2 次招降 + 1 次斩首掷骰（掉落已删）');
  assert.deepEqual(
    post.captures.map((c) => c.name),
    ['陳登', '張寶', '張梁', '張飛'],
    '战报顺序 = 主将在前，副将按传入顺序',
  );
  assert.equal(post.captures.filter((c) => c.recruited).length, 3);
  assert.equal(post.executed.length, 0);
  assert.equal(post.released.length, 1, '主将掷 0.9 → 释放（≥ 50 不斩）');
  assert.equal(post.expBonus, (4 + 3 + 2) * 16, '释放的主将不加经验，3 名副将归顺 ×16');
  assert.equal(post.meritBonus, 15 * 3);
});

test('R54 阵亡的副将跳过，不消耗随机数', () => {
  const dead: PostGeneral = { name: '張寶', str: 60, int: 70, level: 4, alive: false, loyal: LOW };
  const world = multiWorld({ mainAlive: true, mainLoyal: HIGH, officers: [dead] });
  const { rng, calls } = seqRng([0, 0.1, 0.5]);
  const post = resolvePostBattle(world, data, rng);
  assert.equal(calls(), 2, '主将被俘 + 斩首掷骰（掉落已删），阵亡副将一次都不掷');
  assert.deepEqual(post.captures.map((c) => c.name), ['陳登']);
  assert.equal(post.executed.length, 1);
});

test('R54 一次抓到 3 名将且全部招降', () => {
  const officers = officersOf(
    { name: '張寶', str: 60, int: 70, level: 4, loyal: LOW, constancy: 2 },
    { name: '張梁', str: 55, int: 60, level: 3, loyal: LOW, constancy: 2 },
    { name: '張飛', str: 88, int: 40, level: 2, loyal: LOW, constancy: 2 },
  );
  const post = resolvePostBattle(multiWorld({ mainAlive: false, officers }), data, seqRng([0, 0, 0]).rng);
  assert.equal(post.captures.length, 3);
  assert.equal(post.captures.every((c) => c.recruited), true);
  assert.equal(post.executed.length, 0);
  assert.equal(post.released.length, 0);
  assert.equal(post.expBonus, (4 + 3 + 2) * 16);
  assert.equal(post.meritBonus, 15 * 3);
});

test('R54 3 名将全部斩首：经验 = Σ等级×32，功勋 10/人', () => {
  const officers = officersOf(
    { name: '張寶', str: 60, int: 70, level: 4, loyal: HIGH },
    { name: '張梁', str: 55, int: 60, level: 3, loyal: HIGH },
    { name: '張飛', str: 88, int: 40, level: 2, loyal: HIGH },
  );
  const post = resolvePostBattle(
    multiWorld({ mainAlive: false, officers }),
    data,
    seqRng([0, 0, 0, 0, 0, 0]).rng, // 3 次被俘 + 3 次斩首（忠诚>90 的硬门不掷招降骰）
  );
  assert.equal(post.captures.length, 3);
  assert.equal(post.executed.length, 3);
  assert.equal(post.released.length, 0);
  assert.equal(post.expBonus, (4 + 3 + 2) * 32);
  assert.equal(post.meritBonus, 10 * 3);
});

test('R54 全员释放：不入 executed、无经验/功勋', () => {
  const officers = officersOf(
    { name: '張寶', str: 60, int: 70, level: 4, loyal: HIGH },
    { name: '張梁', str: 55, int: 60, level: 3, loyal: HIGH },
  );
  const post = resolvePostBattle(
    multiWorld({ mainAlive: false, officers }),
    data,
    seqRng([0, 0.9, 0, 0.9]).rng, // 被俘 → 斩首掷 0.9=释放；再被俘 → 释放
  );
  assert.equal(post.executed.length, 0);
  assert.equal(post.released.length, 2);
  assert.equal(post.expBonus, 0);
  assert.equal(post.meritBonus, 0);
});

test('R54 与 settle 集成：SideConfig.officers 进战后处置，post 三类数组齐全', () => {
  const w = createWorld({
    data,
    seed: 71,
    a: { soldiers: 40, general: { name: '關羽', str: 97, int: 75, level: 6 } },
    b: {
      soldiers: 40,
      general: { name: '張角', str: 70, int: 88, level: 5 },
      officers: [
        { name: '張寶', str: 60, int: 70, level: 4, loyal: LOW, constancy: 2 },
        { name: '張梁', str: 55, int: 60, level: 3, loyal: LOW, constancy: 2 },
        { name: '張飛', str: 88, int: 40, level: 2, loyal: LOW, constancy: 2 },
      ],
    },
  });
  assert.equal(w.sides.B.officers.length, 3);
  assert.equal(w.sides.B.officers[0]!.alive, true, 'alive 缺省归一化成 true');
  for (let i = 0; i < 6000 && !w.over; i++) step(w);
  w.over = true;
  w.winner = 'A';
  w.endReason = 'troops';
  w.sides.A.aliveCount = 30;
  w.sides.B.aliveCount = 10;
  const post = settle(w).post!;
  assert.ok(Array.isArray(post.captures) && Array.isArray(post.executed) && Array.isArray(post.released));
  assert.ok(post.captures.length >= 1, '至少主将会被处置一次');
  assert.ok(
    post.captures.every((c) => ['張角', '張寶', '張梁', '張飛'].includes(c.name)),
    '名单只能来自败方参战武将',
  );
});

// ---------------------------------------------------------------------------
// 格挡精确计数（stats.blocks）

test('blocks 初始为 0，两军还没接触时不涨', () => {
  const w = createWorld({ data, seed: 81, a: { soldiers: 20 }, b: { soldiers: 20 } });
  assert.equal(w.stats.blocks, 0);
  step(w);
  assert.equal(w.stats.blocks, 0);
});

test('blocks 只增不减、且不超过全部未命中数（含主将的闪避）', () => {
  const w = engage(createWorld({ data, seed: 91, a: { soldiers: 20 }, b: { soldiers: 20 } }));
  let last = 0;
  for (let i = 0; i < 6000 && !w.over; i++) {
    step(w);
    assert.ok(w.stats.blocks >= last, '计数只能单调增');
    last = w.stats.blocks;
  }
  assert.ok(w.stats.blocks > 0, '近战对砍应该有砍空的时候');
  const misses = w.stats.attacksA + w.stats.attacksB - w.stats.hitsA - w.stats.hitsB;
  assert.ok(w.stats.blocks <= misses, `blocks=${w.stats.blocks} 不能超过未命中 ${misses}`);
});

test('blocks 不含"将对将"的闪避：主将单挑砍空不计格挡', () => {
  const w = createWorld({
    data,
    seed: 101,
    a: { soldiers: 10, general: { str: 97, int: 75, level: 6 } },
    b: { soldiers: 10, general: { str: 70, int: 88, level: 5 } },
  });
  // 兵全下掉，只留两位主将贴身；cd 归零，保证这一 tick 双方各出一刀
  for (const u of w.units) if (!u.isGeneral) u.alive = false;
  const [ga, gb] = w.units.filter((u) => u.isGeneral);
  ga!.x = 35;
  ga!.y = 6.5;
  gb!.x = 35.6;
  gb!.y = 6.5;
  ga!.cd = 0;
  gb!.cd = 0;
  step(w);
  assert.equal(w.stats.attacksA + w.stats.attacksB, 2, '两位主将都应出手');
  assert.equal(w.stats.blocks, 0, '主将砍空属于闪避，不是格挡');
});
