/**
 * R115 验收：把 `SangoRng`（原作 `0x450132` 乱数流）接进最后两处 rand 消费点。
 *
 * 覆盖：
 *  ① `capture.ts` 的招降（两次 / 一次 / 两次 `rand()%100`+`rand()%3`）与掉落轮盘
 *     （`rand()%total`）：判定结果与 `roll.int(n)` 抽取次数逐次对齐；
 *  ② 无 `roll`（缺省或显式 null）时与改前完全一致，且给了 `roll` 时 `rng` 一次也不消费；
 *  ③ `runtime.ts` 的 `rand(min,max)`（`0x420BAA` = `min + rand()%(max-min+1)`）
 *     上下界、边界收缩、非整数分支与抽取次数；
 *  ④ 一场真实 `settle()` 战后结算：同 seed / 同 roll seed 两次完全一致，不同 roll seed 分叉。
 *
 * 对账手段与 `tests/battle_roll.test.ts` 相同：用另一个 `sangoRng(seed)` 手动跑
 * `int(n)` / `float()`，比较 `stateA/stateB`，抽取多了或少了都会露馅。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.ts';
import { createWorld, mulberry32, settle, step, TICK_HZ } from '../src/core/battle.ts';
import type { World } from '../src/core/battle.ts';
import { canRecruit, resolvePostBattle, rollDrop } from '../src/core/capture.ts';
import type { PostBattleState, PostBattleWorld } from '../src/core/capture.ts';
import { scriptChance, scriptRand } from '../src/core/smartscript/runtime.ts';
import { SangoRng, sangoRng } from '../src/core/sango_rng.ts';
import type { GameData, Item } from '../src/types.ts';
import { engage } from './_engage.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

/** 去掉 `kings`：用 張角 当普通败将，避免 `0x40975E` 把他当君主放走。 */
const noKings: GameData = {
  ...data,
  scenarios: data.scenarios.map((s) => ({ ...s, kings: [] })),
};

/** 有 roll 时不该再碰 rng；真碰了就立刻炸出来。 */
const noRng = (): number => {
  throw new Error('给了 roll 却消费了 rng');
};

function mkWorld(over: { name?: string } = {}): PostBattleWorld {
  return {
    winner: 'A',
    endReason: 'troops',
    sides: {
      A: {
        start: 100,
        aliveCount: 80,
        general: { name: '關羽', str: 97, int: 75, level: 6, alive: true },
      },
      B: {
        start: 100,
        aliveCount: 20,
        general: { name: over.name ?? '張角', str: 70, int: 88, level: 5, alive: true },
      },
    },
  };
}

function mkState(rng: () => number, over: Partial<PostBattleState> = {}): PostBattleState {
  return { data, rng, dropTaken: [], winnerSoldiers: 80, loserSoldiers: 20, ...over };
}

/** 顺序 rng：按给定序列返回，用完之后固定 0.5（与 capture.test.ts 的旧夹具同形）。 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

/** 找一个满足 pred 的 seed；pred 每次拿到的都是新流，调用顺序即被测代码顺序。 */
function findSeed(pred: (r: SangoRng) => boolean, from = 1): number {
  for (let s = from; s < 5000; s += 1) {
    if (pred(sangoRng(s))) return s;
  }
  throw new Error('5000 个 seed 里找不到满足条件的流');
}

function assertSameState(a: SangoRng, b: SangoRng, msg: string): void {
  assert.equal(a.stateA, b.stateA, `${msg}：stateA`);
  assert.equal(a.stateB, b.stateB, `${msg}：stateB`);
}

/** 只要 roll / rng 两个字段的 World 替身（scriptRand 不碰别的）。 */
function rtWorld(roll: SangoRng | null, rng: () => number = noRng): World {
  return { roll, rng } as unknown as World;
}

// ---------------------------------------------------------------------------
// ① 招降：三种 t 的掷骰次数
// ---------------------------------------------------------------------------

test('R115 招降 t=-1：两次 rand()%100 都失败 → 恰好消费两次 int(100)', () => {
  const seed = findSeed((r) => r.int(100) < 39 && r.int(100) < 39);
  const roll = sangoRng(seed);
  const out = canRecruit(
    'A',
    { name: '張角', str: 70, int: 88, level: 5, loyal: 39, constancy: 2 },
    mkState(noRng, { roll }),
  );
  assert.equal(out.ok, false);
  const ref = sangoRng(seed);
  ref.int(100);
  ref.int(100);
  assertSameState(roll, ref, 't=-1 两抽');
});

test('R115 招降 t=-1：第一次 rand()%100 成功 → return true，只消费一次', () => {
  const seed = findSeed((r) => r.int(100) >= 39);
  const roll = sangoRng(seed);
  const out = canRecruit(
    'A',
    { name: '張角', str: 70, int: 88, level: 5, loyal: 39, constancy: 2 },
    mkState(noRng, { roll }),
  );
  assert.equal(out.ok, true);
  const ref = sangoRng(seed);
  ref.int(100);
  assertSameState(roll, ref, 't=-1 首抽即中');
});

test('R115 招降 t=0：无论成败都只消费一次 int(100)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const roll = sangoRng(seed);
    const out = canRecruit(
      'A',
      { name: '張角', str: 70, int: 88, level: 5, loyal: 39, constancy: 3 },
      mkState(noRng, { roll }),
    );
    const ref = sangoRng(seed);
    const v = ref.int(100);
    assert.equal(out.ok, v >= 39, `seed ${seed}`);
    assertSameState(roll, ref, `t=0 seed ${seed}`);
  }
});

test('R115 招降 t=1：首抽失败只消费一次；首抽成功再抽 int(3)（短路）', () => {
  const failSeed = findSeed((r) => r.int(100) < 39);
  const failRoll = sangoRng(failSeed);
  const failed = canRecruit(
    'A',
    { name: '張角', str: 70, int: 88, level: 5, loyal: 39, constancy: 5 },
    mkState(noRng, { roll: failRoll }),
  );
  assert.equal(failed.ok, false);
  const failRef = sangoRng(failSeed);
  failRef.int(100);
  assertSameState(failRoll, failRef, 't=1 首抽失败');

  const passSeed = findSeed((r) => r.int(100) >= 39);
  const passRoll = sangoRng(passSeed);
  const passed = canRecruit(
    'A',
    { name: '張角', str: 70, int: 88, level: 5, loyal: 39, constancy: 5 },
    mkState(noRng, { roll: passRoll }),
  );
  const passRef = sangoRng(passSeed);
  const v1 = passRef.int(100);
  const v3 = passRef.int(3);
  assert.equal(passed.ok, v1 >= 39 && v3 === 0);
  assertSameState(passRoll, passRef, 't=1 首抽成功 + int(3)');
});

// ---------------------------------------------------------------------------
// ① 掉落轮盘：rand()%total
// ---------------------------------------------------------------------------

test('R115 掉落轮盘：一次 int(total)，按累计权重落格', () => {
  const base = data.items.find((i) => (i.Rate ?? 0) > 0)!;
  const mk = (seq: number, name: string, rate: number): Item => ({
    ...base,
    Sequence: seq,
    Name: name,
    Rate: rate,
    SearchType: 0,
    Level: 1,
    Attrib: '',
  });
  // 权重 10 + 20 = 30：int(30) ∈ [0,10) → 甲，[10,30) → 乙
  const dropData = { ...data, items: [mk(990001, '甲', 10), mk(990002, '乙', 20)] } as GameData;

  const lowSeed = findSeed((r) => r.int(30) < 10);
  const low = sangoRng(lowSeed);
  assert.equal(rollDrop(dropData, 1, [], noRng, low)?.name, '甲');
  const lowRef = sangoRng(lowSeed);
  lowRef.int(30);
  assertSameState(low, lowRef, '掉甲');

  const highSeed = findSeed((r) => r.int(30) >= 10);
  const high = sangoRng(highSeed);
  assert.equal(rollDrop(dropData, 1, [], noRng, high)?.name, '乙');
  const highRef = sangoRng(highSeed);
  highRef.int(30);
  assertSameState(high, highRef, '掉乙');

  // 无 roll 时旧口径逐位不变：floor(rng()*total)
  assert.equal(rollDrop(dropData, 1, [], () => 0)?.name, '甲');
  assert.equal(rollDrop(dropData, 1, [], () => 0.5)?.name, '乙');
});

// ---------------------------------------------------------------------------
// ② 缺省行为不变 / 有 roll 时 rng 完全不被消费
// ---------------------------------------------------------------------------

test('R115 无 roll：resolvePostBattle 与改前逐位一致（显式 null 与省略同值）', () => {
  const legacy = resolvePostBattle(mkWorld(), noKings, seqRng([0.0, 0.1, 0.1, 0.1]));
  const explicitNull = resolvePostBattle(mkWorld(), noKings, seqRng([0.0, 0.1, 0.1, 0.1]), [], null);
  assert.deepEqual(explicitNull, legacy);
  // 旧金标准：張角 loyal 39，被俘 → 招降两抽失败 → rand()%100<50 斩首
  assert.equal(legacy.captures.length, 1);
  assert.equal(legacy.captures[0].loyal, 39);
  assert.equal(legacy.executed.length, 1);
  assert.equal(legacy.released.length, 0);
  assert.equal(legacy.expBonus, 5 * 32);
  assert.equal(legacy.meritBonus, 10);

  // 同一个 mulberry seed 两次结算一致（旧路径仍可复现）
  for (const seed of [1, 7, 2026]) {
    const a = resolvePostBattle(mkWorld(), data, mulberry32(seed));
    const b = resolvePostBattle(mkWorld(), data, mulberry32(seed));
    assert.deepEqual(a, b, `mulberry seed ${seed}`);
  }
});

test('R115 没有 roll 时只消费 rng，不碰旁边的 SangoRng', () => {
  const roll = sangoRng(9);
  const before = roll.snapshot();
  let calls = 0;
  const base = mulberry32(4);
  const counting = (): number => {
    calls += 1;
    return base();
  };
  resolvePostBattle(mkWorld(), noKings, counting, []);
  assert.ok(calls > 0, `旧路径必须真的抽 rng（实际 ${calls} 次）`);
  assert.deepEqual(roll.snapshot(), before);
});

test('R115 有 roll 时 resolvePostBattle 完全不消费 rng，且 4 抽对账', () => {
  // captureChance = 0.55 + (0.5 - 0.2)*0.5 = 0.7；t=-1（节操 2）两抽；斩首再一抽。
  const seed = findSeed(
    (r) => r.float() < 0.7 && r.int(100) < 39 && r.int(100) < 39 && r.int(100) < 50,
  );
  const roll = sangoRng(seed);
  const post = resolvePostBattle(mkWorld(), noKings, noRng, [], roll);
  assert.equal(post.captures.length, 1);
  assert.equal(post.captures[0].loyal, 39);
  assert.equal(post.executed.length, 1);
  assert.equal(post.released.length, 0);
  assert.equal(post.expBonus, 5 * 32);
  assert.equal(post.meritBonus, 10);

  const ref = sangoRng(seed);
  ref.float(); // 被俘 0x40ED3A（公式未解，最小模型用 float 保持同分布）
  ref.int(100); // 招降第 1 抽
  ref.int(100); // 招降第 2 抽
  ref.int(100); // 斩首 0x40EF9A
  assertSameState(roll, ref, '被俘 + 招降×2 + 斩首');
});

// ---------------------------------------------------------------------------
// ③ runtime rand(min,max)：0x420BAA = min + rand()%(max-min+1)
// ---------------------------------------------------------------------------

test('R115 脚本 rand：闭区间、自动交换上下界、每次恰好一抽 int(n)', () => {
  for (const [a, b] of [
    [1, 6],
    [6, 1],
    [-2, 2],
    [3, 3],
    [10, 20],
  ] as const) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const n = hi - lo + 1;
    const seed = 21;
    const roll = sangoRng(seed);
    const ref = sangoRng(seed);
    const w = rtWorld(roll);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const v = scriptRand(w, a, b);
      assert.ok(Number.isInteger(v), `rand(${a},${b}) 必须是整数，得到 ${v}`);
      assert.ok(v >= lo && v <= hi, `rand(${a},${b}) = ${v} 越界`);
      assert.equal(v, lo + ref.int(n), `rand(${a},${b}) 第 ${i} 抽`);
      seen.add(v);
    }
    assertSameState(roll, ref, `rand(${a},${b}) 200 抽`);
    if (n <= 6) assert.equal(seen.size, n, `rand(${a},${b}) 应覆盖全部 ${n} 档`);
  }
});

test('R115 脚本 rand：非整数分支用 float()，一次一抽且落在 [lo,hi)', () => {
  const roll = sangoRng(31);
  const ref = sangoRng(31);
  const w = rtWorld(roll);
  for (let i = 0; i < 100; i += 1) {
    const v = scriptRand(w, 2.5, 1.5);
    assert.ok(v >= 1.5 && v < 2.5, `rand(2.5,1.5) = ${v}`);
    assert.equal(v, 1.5 + ref.float());
  }
  assertSameState(roll, ref, '非整数 100 抽');
});

test('R115 脚本 rand：非有限参数返回 0 且不抽流（旧行为）', () => {
  const roll = sangoRng(7);
  const before = roll.snapshot();
  const w = rtWorld(roll);
  assert.equal(scriptRand(w, Number.NaN, 3), 0);
  assert.equal(scriptRand(w, 1, Number.POSITIVE_INFINITY), 0);
  assert.deepEqual(roll.snapshot(), before);
});

test('R115 脚本 rand：无 roll 时只抽一次 rng，公式逐位不变', () => {
  let calls = 0;
  const base = mulberry32(5);
  const rng = (): number => {
    calls += 1;
    return base();
  };
  const w = rtWorld(null, rng);
  assert.equal(scriptRand(w, 1, 6), 1 + Math.floor(mulberry32(5)() * 6));
  assert.equal(calls, 1);

  let floatCalls = 0;
  const fb = mulberry32(6);
  const frng = (): number => {
    floatCalls += 1;
    return fb();
  };
  const v = scriptRand(rtWorld(null, frng), 1.5, 2.5);
  assert.equal(v, 1.5 + mulberry32(6)());
  assert.equal(floatCalls, 1);
});

test('R115 脚本命中概率：roll 时恰好抽一次 float，无 roll 时恰好抽一次 rng', () => {
  const roll = sangoRng(17);
  const ref = sangoRng(17);
  assert.equal(scriptChance(rtWorld(roll)), ref.float());
  assertSameState(roll, ref, 'scriptChance roll');

  let calls = 0;
  const base = mulberry32(17);
  const w = rtWorld(null, () => {
    calls += 1;
    return base();
  });
  assert.equal(scriptChance(w), mulberry32(17)());
  assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------
// ④ 真实战后结算
// ---------------------------------------------------------------------------

function settleWithRoll(rollSeed: number): { post: ReturnType<typeof settle>['post']; world: World } {
  // m4 之后 `createWorld()` 出来双方待機，必须先 `engage()` 下令才会真的打完。
  const world = engage(
    createWorld({
      data,
      seed: 7,
      roll: sangoRng(rollSeed),
      a: { troop: 4, formation: 0 },
      b: { troop: 12, formation: 1 },
    }),
  );
  let n = 0;
  while (!world.over && n < 180 * TICK_HZ) {
    step(world);
    n += 1;
  }
  return { post: settle(world).post, world };
}

test('R115 真实战后结算：同 roll seed 两次一致，不同 roll seed 分叉', () => {
  const a = settleWithRoll(11);
  const b = settleWithRoll(11);
  assert.deepEqual(a.post, b.post, '同 seed 两次 post 必须相同');
  assert.equal(a.world.roll!.stateA, b.world.roll!.stateA);
  assert.equal(a.world.roll!.stateB, b.world.roll!.stateB);

  const posts = [12, 13, 14, 15, 16].map((s) => settleWithRoll(s).post);
  assert.ok(
    posts.some((p) => JSON.stringify(p) !== JSON.stringify(a.post)),
    '不同 roll seed 的战后处置必须至少有一次分叉',
  );
  // 结算确实走了处置名单（不是空战报）
  assert.ok(
    (a.post?.captures.length ?? 0) + (a.post?.executed.length ?? 0) + (a.post?.released.length ?? 0) > 0,
    '至少一名败将进入处置名单',
  );
});
