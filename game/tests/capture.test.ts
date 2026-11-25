/**
 * 战后处置（招降 / 斩首 / 释放 / 掉落）自检。
 *
 * 跑法：cd F:\sanguo\game && node --test tests/*.test.ts
 * 规则来源：docs/04b2_招降斩首与战后结算.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, mulberry32, settle, step, TICK_HZ } from '../src/core/battle.ts';
import {
  captureChance,
  canRecruit,
  dropWeight,
  recruitChanceOf,
  resolvePostBattle,
  rollDrop,
} from '../src/core/capture.ts';
import type { PostBattleState, PostBattleWorld } from '../src/core/capture.ts';
import type { GameData } from '../src/types.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/**
 * 去掉 `kings` 的数据副本：④⑤ 用 張角 当"普通败将"测斩首/释放，
 * 而 張角 在剧本 0 里是君主（会被 `0x40975E` 放走，见 ⑪），所以这两条用无君主副本。
 */
const noKings: GameData = {
  ...data,
  scenarios: data.scenarios.map((s) => ({ ...s, kings: [] })),
};

/** 造一个只有"败方主将"有意义的最小战场 */
function mkWorld(over: {
  winner?: 'A' | 'B' | 'draw';
  name?: string;
  alive?: boolean;
  aSoldiers?: number;
  bSoldiers?: number;
  level?: number;
} = {}): PostBattleWorld {
  const name = over.name ?? '張角';
  return {
    winner: over.winner ?? 'A',
    endReason: 'troops',
    sides: {
      A: {
        start: 100,
        aliveCount: over.aSoldiers ?? 80,
        general: { name: '關羽', str: 97, int: 75, level: over.level ?? 6, alive: true },
      },
      B: {
        start: 100,
        aliveCount: over.bSoldiers ?? 20,
        general: { name, str: 70, int: 88, level: 5, alive: over.alive ?? true },
      },
    },
  };
}

function mkState(rng: () => number, over: Partial<PostBattleState> = {}): PostBattleState {
  return { data, rng, dropTaken: [], winnerSoldiers: 80, loserSoldiers: 20, ...over };
}

/** 顺序 rng：按给定序列返回，用完之后固定 0.5 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

test('① 君主不可招降（0x40975E：处置入口就拦掉）', () => {
  const state = mkState(mulberry32(1));
  const king = { name: '劉備', str: 97, int: 75, level: 10, loyal: 10, constancy: 1, isKing: true };
  const r = canRecruit('A', king, state);
  assert.equal(r.ok, false);
  assert.equal(r.chance, 0);
  assert.ok(r.reasons[0].includes('君主'));
  // 即便忠诚 < 25（本来必降），君主也不降 —— 君主判定在 0x404344 之前
  assert.equal(recruitChanceOf({ ...king, loyal: 5 }, state), 0);
  // 只是"不能招降"，不是"不能被俘"：处置名单由 resolvePostBattle 的 0x40975E 分支负责（见 ⑪）
  assert.equal(recruitChanceOf({ name: '劉備', str: 97, int: 75, level: 10, loyal: 5, constancy: 1 }, state), 1);
});

test('② R53 三条硬门：忠诚 >90 / 70~90 / 50~70 一律招不动（0x404344 尾部 return 0）', () => {
  // 原作在掷骰之后还有三段无条件失败出口：cmp 0x5A / 0x46 / 0x32 → return 0，
  // 所以这三档不是"概率低"，是概率恒 0。
  const mk = (loyal: number, constancy = 5) => ({
    name: '高順',
    str: 80,
    int: 60,
    level: 5,
    loyal,
    constancy,
  });
  for (const L of [91, 95, 99]) {
    assert.equal(recruitChanceOf(mk(L), mkState(mulberry32(1))), 0, `忠诚 ${L} > 90 → 0`);
    const r = canRecruit('A', mk(L), mkState(() => 0.0));
    assert.equal(r.ok, false, '掷骰全 0 也不降');
    assert.ok(r.reasons[0].includes('0x11'), r.reasons[0]);
  }
  for (const L of [71, 80, 90]) {
    assert.equal(recruitChanceOf(mk(L), mkState(mulberry32(1))), 0, `70 < ${L} ≤ 90 → 0`);
    const r = canRecruit('A', mk(L), mkState(() => 0.0));
    assert.equal(r.ok, false);
    assert.ok(r.reasons[0].includes('0x12'), r.reasons[0]);
  }
  for (const L of [51, 60, 70]) {
    assert.equal(recruitChanceOf(mk(L, 2), mkState(mulberry32(1))), 0, `50 < ${L} ≤ 70 → 0`);
    const r = canRecruit('A', mk(L, 2), mkState(() => 0.0));
    assert.equal(r.ok, false);
    assert.ok(r.reasons[0].includes('0x13'), r.reasons[0]);
  }
  // 门槛之外概率照旧：忠诚 50、节操 5（t=1）→ (1 − 0.5) / 3
  assert.ok(Math.abs(recruitChanceOf(mk(50), mkState(mulberry32(1))) - 0.5 / 3) < 1e-9);
  // 旧断言"忠诚 99 节操 4 ≈ 1%"：硬门落地后必须是 0
  assert.equal(recruitChanceOf(mk(99, 4), mkState(mulberry32(1))), 0);
});

test('③ 低忠诚必降 / 中等忠诚高概率，且同 seed 结果稳定', () => {
  const low = { name: '侯成', str: 50, int: 40, level: 3, loyal: 24, constancy: 6 };
  const a = canRecruit('A', low, mkState(mulberry32(9)));
  assert.equal(a.ok, true);
  assert.equal(a.chance, 1, '忠诚 < 25 必成功，不掷骰');
  // 忠诚 40 / 节操 2 → t = 1 → 1 − 0.16 = 84%
  const mid = { name: '侯成', str: 50, int: 40, level: 3, loyal: 40, constancy: 2 };
  const c = recruitChanceOf(mid, mkState(mulberry32(9)));
  assert.ok(Math.abs(c - 0.84) < 1e-9, `chance=${c}`);
  const run = (seed: number) => canRecruit('A', mid, mkState(mulberry32(seed)));
  for (let s = 1; s <= 20; s++) {
    assert.deepEqual(run(s), run(s), `seed ${s} 必须可复现`);
  }
});

test('④ 斩首：招降失败且 rand()%100 < 50 → status=5', () => {
  // 張角 loyal 55 / CONSTANCY 2 → 被俘惩罚扣成 55 − (10−2)×2 = 39
  // 序列：0.0 被俘 → 0.1 / 0.1 两次掷骰都失败 → 0.1 (<50) 斩首
  const rng = seqRng([0.0, 0.1, 0.1, 0.1]);
  const post = resolvePostBattle(mkWorld(), noKings, rng);
  assert.equal(post.captures.length, 1);
  assert.equal(post.captures[0].name, '張角');
  assert.equal(post.captures[0].recruited, false);
  assert.equal(post.captures[0].loyal, 39, '0x447520：忠诚 −= (10 − 节操) × 2');
  assert.equal(post.executed.length, 1);
  assert.equal(post.executed[0].name, '張角');
  assert.equal(post.released.length, 0);
  assert.equal(post.expBonus, 5 * 32, '斩首按敌将等级 × 32 经验');
  assert.equal(post.meritBonus, 10);
});

test('⑤ 释放：不进招降池（recruited 名单为空），也不进斩首名单', () => {
  const rng = seqRng([0.0, 0.1, 0.1, 0.9]);
  const post = resolvePostBattle(mkWorld(), noKings, rng);
  assert.equal(post.released.length, 1);
  assert.equal(post.executed.length, 0);
  assert.equal(post.captures[0].recruited, false);
  assert.deepEqual(
    post.captures.filter((c) => c.recruited).map((c) => c.name),
    [],
    '释放的人不能进 captured 名单',
  );
  assert.equal(post.expBonus, 0);
});

test('⑥ 战斗不掉落任何物品（原作负证据），但 rollDrop 的 ONLYONE/Rate 权重仍成立', () => {
  // 原作证据：`docs\04b2-战斗流程.md` §5.1「战斗不掉落任何物品」。
  // 本项目曾「胜方战后无条件掷一次轮盘」，是加戏，已在 R57 按原作删除。
  const only = data.items.find((i) => i.Attrib === 'ONLYONE');
  assert.ok(only, 'items.json 里应有 ONLYONE 物品');
  const onlyData = { ...data, items: [only] } as GameData;
  const taken: string[] = [];
  for (let k = 0; k < 5; k += 1) {
    const w = resolvePostBattle(mkWorld({ level: 40 }), onlyData, mulberry32(3 + k), taken);
    assert.equal(w.drops.length, 0, `第 ${k + 1} 场战斗也不该掉东西`);
  }
  assert.deepEqual(taken, [], 'taken 池不该被战斗改动');
  // rollDrop 本身还在（内政搜索/测试继续用），权重口径不变：已获得 → 0；Rate=0 恒 0
  assert.equal(dropWeight(only, 99, [String(only.Sequence)]), 0);
  assert.ok(rollDrop(onlyData, 40, [], mulberry32(3)) !== null, '只有这一件时轮盘必中');
  const zeroRate = data.items.filter((i) => i.Rate === 0);
  assert.equal(zeroRate.length, 5, 'Rate=0：Seq 14/15/16/17 武器 + Seq 56 马');
  for (const z of zeroRate) assert.equal(dropWeight(z, 99, []), 0);
  // 全量 16 件 ONLYONE 都记入 taken 后，200 次轮盘不再出它们
  const all = data.items.filter((i) => i.Attrib === 'ONLYONE').map((i) => String(i.Sequence));
  assert.equal(all.length, 16);
  const rng = mulberry32(11);
  for (let i = 0; i < 200; i++) {
    const d = rollDrop(data, 40, all, rng);
    assert.ok(!d || !all.includes(d.itemId), `不该再出唯一物品 ${d?.name}`);
  }
});

test('⑦ 同 seed 两次 resolvePostBattle 结果完全一致', () => {
  for (const seed of [1, 7, 42, 2026]) {
    const r1 = resolvePostBattle(mkWorld(), data, mulberry32(seed));
    const r2 = resolvePostBattle(mkWorld(), data, mulberry32(seed));
    assert.deepEqual(r1, r2, `seed ${seed}`);
  }
  // 「rng 真的被用上」用计数 rng 直接验，而不是靠「不同 seed 结果不同」——
  // 招降成功时后续掷骰不影响结果，两组 seed 天然同值（本轮 R57 删掉战斗掉落之后更明显）。
  const base = mulberry32(9);
  let calls = 0;
  const counting = (): number => {
    calls += 1;
    return base();
  };
  const c = resolvePostBattle(mkWorld(), noKings, counting);
  assert.ok(calls > 0, `resolvePostBattle 必须真的消耗 rng（实际 ${calls} 次）`);
  assert.ok(c.captures.length + c.executed.length + c.released.length > 0, '三档处置至少要落到一档');
});

test('⑧ 兵力差 / 被围只影响被俘概率，方向正确；不进招降公式', () => {
  const g = { name: '張角', str: 70, int: 88, level: 5, alive: true };
  const many = captureChance(g, mkState(mulberry32(1), { winnerSoldiers: 80, loserSoldiers: 80 }));
  const few = captureChance(g, mkState(mulberry32(1), { winnerSoldiers: 80, loserSoldiers: 5 }));
  const none = captureChance(g, mkState(mulberry32(1), { winnerSoldiers: 80, loserSoldiers: 0 }));
  assert.ok(few > many, `残兵越少越容易被俘：${few} > ${many}`);
  assert.ok(none > few, `残兵 0 时应最高：${none} > ${few}`);
  const open = captureChance(g, mkState(mulberry32(1), { winnerSoldiers: 80, loserSoldiers: 20 }));
  const ring = captureChance(g, mkState(mulberry32(1), { winnerSoldiers: 80, loserSoldiers: 20, surrounded: true }));
  assert.ok(ring > open, `被围 +20%：${ring} > ${open}`);
  // 04b2 §2.2 要点 1：决定难度的是"节操 + 原势力"，不是兵力 —— 招降概率不受影响
  const base = recruitChanceOf({ ...g, loyal: 40, constancy: 2 }, mkState(mulberry32(1)));
  const withTroops = recruitChanceOf(
    { ...g, loyal: 40, constancy: 2 },
    mkState(mulberry32(1), { winnerSoldiers: 1000, loserSoldiers: 1, surrounded: true }),
  );
  assert.equal(withTroops, base);
});

test('⑨ 节操 / 原势力：宁死不降、旧主已降、忠诚<25 优先', () => {
  const state = mkState(mulberry32(5));
  // 节操 ≥3 且原势力健在 → t += 2 → 0
  assert.equal(recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 40, constancy: 4, lordAlive: true }, state), 0);
  assert.equal(recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 60, constancy: 6, lordAlive: true }, state), 0);
  // 忠诚 < 25 早退，优先于宁死不降
  assert.equal(recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 20, constancy: 6, lordAlive: true }, state), 1);
  // 旧主已降 / 情义势力即我方 → 必降
  assert.equal(recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 80, constancy: 6, lordSurrendered: true }, state), 1);
  assert.equal(recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 80, constancy: 6, sameForce: true }, state), 1);
  // 节操 < 3 且原势力健在（t = 1）→ (1 − L/100) / 3
  assert.ok(
    Math.abs(
      recruitChanceOf({ name: '張任', str: 80, int: 70, level: 6, loyal: 30, constancy: 2, lordAlive: true }, state) - 0.7 / 3,
    ) < 1e-9,
  );
});

test('⑩ 守方君主不進處置名單：0x40975E 判真 → 條目狀態 7 + 逃脫戰報', () => {
  const king = String(data.scenarios[0].kings[0].NAME);
  // 掷骰全 0 ⇒ 换成普通武将必被俘；君主必须被 0x40975E 提前放走
  const post = resolvePostBattle(mkWorld({ name: king }), data, seqRng([0, 0, 0, 0]), []);
  assert.deepEqual(post.kingsEscaped, [king], '0x4912B0「我們俘虜了敵方君主，但被逃了....」');
  assert.equal(post.captures.length, 0, '不进招降名单');
  assert.equal(post.executed.length, 0, '不可斩首');
  assert.equal(post.released.length, 0, 'status 7 是"逃脱"，不是"释放"');

  // 显式 isKing 标记等价（战场没有势力信息时由调用方给）
  const world = mkWorld({ name: '某君主' });
  world.sides.B.general.isKing = true;
  const post2 = resolvePostBattle(world, data, seqRng([0, 0, 0, 0]), []);
  assert.deepEqual(post2.kingsEscaped, ['某君主']);
  assert.equal(post2.executed.length, 0);

  // 非君主（同一个 rng）照常被俘并进处置名单
  const post3 = resolvePostBattle(mkWorld({ name: '普通將' }), data, seqRng([0, 0, 0, 0]), []);
  assert.deepEqual(post3.kingsEscaped, []);
  assert.equal(post3.captures.length, 1, '被俘者先全部进 captures（recruited 标记是否招降成功）');
  assert.equal(post3.executed.length, 1, '掷 0 ⇒ 斩首分支');
  assert.equal(post3.captures[0].recruited, false);
});

test('⑪ settle() 带 post 且幂等（同一 world 两次结算同值）', () => {
  const w = createWorld({ data, seed: 7, a: { troop: 2, formation: 0 }, b: { troop: 10, formation: 1 } });
  let n = 0;
  while (!w.over && n < 180 * TICK_HZ) {
    step(w);
    n++;
  }
  const s1 = settle(w);
  const s2 = settle(w);
  assert.equal(s1, s2, 'settle 必须幂等（缓存的同一个对象）');
  assert.ok(s1.post, 'settle 返回值必须带 post');
  assert.ok(Array.isArray(s1.post.captures));
  assert.ok(Array.isArray(s1.post.executed));
  assert.ok(Array.isArray(s1.post.released));
  assert.ok(Array.isArray(s1.post.drops));
  // 同 seed 重跑一遍，post 也一致
  const w2 = createWorld({ data, seed: 7, a: { troop: 2, formation: 0 }, b: { troop: 10, formation: 1 } });
  let m = 0;
  while (!w2.over && m < 180 * TICK_HZ) {
    step(w2);
    m++;
  }
  assert.deepEqual(settle(w2).post, s1.post);
});
