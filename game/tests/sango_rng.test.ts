/**
 * R115 验收：原作乱数发生器 `0x450132` 的逐位复刻（`src/core/sango_rng.ts`）。
 *
 * 测试向量来自 `work\r115\sango_rng_ref.py`（按 `work\orig_numbers\R20_excerpt.txt`
 * 的逐条反汇编独立写的一份 Python 实现），两边的「旋转」写法故意不同，
 * 所以这组向量能同时钉住「移位语义」与「32 位回绕」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SangoRng, sangoSeedFrom, sangoRng } from '../src/core/sango_rng.ts';

const hex = (v: number): string => `0x${(v >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

test('R115 参考向量：四个种子各前 5 个输出（跨语言对拍）', () => {
  const cases: Array<[number, number, string[]]> = [
    [0x12345678, 0x9abcdef0, ['0xE93E9A13', '0x29E0A456', '0x12E1AE38', '0x37A0B9E8', '0x149643B5']],
    [0x00000001, 0x12345678, ['0x048D159D', '0x6246DACE', '0xB13745A6', '0xD995A302', '0xD5593D49']],
    [0x00000000, 0x00000000, ['0x7FFFFFFF', '0x3FFFFFFF', '0x1FFFFFFF', '0x0FFFFFFF', '0x07FFFFFF']],
    [0xffffffff, 0x80000000, ['0xFFFFFFFE', '0x3FFFFFFE', '0x4FFFFFFE', '0x53FFFFFE', '0x54FFFFFE']],
  ];
  for (const [a, b, want] of cases) {
    const rng = new SangoRng(a, b);
    const got = Array.from({ length: 5 }, () => hex(rng.nextU32()));
    assert.deepEqual(got, want, `seed ${hex(a)}/${hex(b)}`);
  }
});

test('R115 与第二种写法（按位串旋转）逐位一致 5000 步', () => {
  // 故意用字符串旋转的独立实现：不依赖 >>> / << 的语义。
  // 轮转量 0 时要复刻反汇编「两段移位相加」的怪癖 → 2x（真 rotate 会原样返回）。
  const rot = (x: number, n: number, dir: 1 | -1): number => {
    const s = x.toString(2).padStart(32, '0');
    const k = n & 31;
    if (k === 0) return (x + x) >>> 0;
    const out = dir === 1 ? s.slice(32 - k) + s.slice(0, 32 - k) : s.slice(k) + s.slice(0, k);
    return parseInt(out, 2) >>> 0;
  };
  let a = 0x12345678;
  let b = 0x9abcdef0;
  const rng = new SangoRng(a, b);
  for (let i = 0; i < 5000; i += 1) {
    a = (a + 1) >>> 0;
    b = (b - 1) >>> 0;
    b = rot(b, a & 31, 1); // ror
    a = rot(a, b & 31, -1); // rol
    const want = (a + b) >>> 0;
    const got = rng.nextU32();
    if (got !== want) assert.fail(`第 ${i} 步：got ${hex(got)} want ${hex(want)}`);
  }
});

test('R115 `int(n)` 的边界：n<=0 回 0、n=1 恒 0、结果恒 < n', () => {
  const rng = sangoRng(7);
  assert.equal(rng.int(0), 0);
  assert.equal(rng.int(-3), 0);
  assert.equal(rng.int(1), 0);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng.int(80);
    assert.ok(v >= 0 && v < 80, `int(80) = ${v}`);
  }
  // 非整数 n 先截断（原作是 32 位 div）
  assert.ok(rng.int(10.9) < 10);
});

test('R115 `int(100)` 十位分布接近均匀（10 万次，各段 ±8%）', () => {
  const rng = sangoRng(0x51c0);
  const buckets = new Array<number>(10).fill(0);
  const N = 100000;
  for (let i = 0; i < N; i += 1) buckets[Math.floor(rng.int(100) / 10)] += 1;
  for (let i = 0; i < 10; i += 1) {
    const pct = buckets[i] / N;
    assert.ok(Math.abs(pct - 0.1) < 0.008, `第 ${i * 10}..${i * 10 + 9} 段占比 ${(pct * 100).toFixed(2)}%`);
  }
});

test('R115 `bit()` 的偏置与原作一致（&1 不是 50/50，实测 ~48.4%）', () => {
  // 为什么不是 50%：轮转量 0 时反汇编的两段移位相加会变成 2x（见 sango_rng.ts 头注释），
  // 这个「怪癖」让最低位略偏向 0。三个种子实测 48.35% / 48.41% / 48.44%，钉在 47.8%..49.0%。
  for (const seed of [99, 0x51c0, 7]) {
    const rng = sangoRng(seed);
    let ones = 0;
    const N = 100000;
    for (let i = 0; i < N; i += 1) ones += rng.bit();
    const pct = ones / N;
    assert.ok(pct > 0.478 && pct < 0.49, `seed ${seed} 的 bit()==1 占比 ${(pct * 100).toFixed(3)}%`);
  }
});

test('R115 同种子同序列；clone 互不影响；snapshot/restore 可回放', () => {
  const a = sangoRng(1234);
  const b = sangoRng(1234);
  const first = Array.from({ length: 20 }, () => a.nextU32());
  assert.deepEqual(Array.from({ length: 20 }, () => b.nextU32()), first);

  const snap = a.snapshot();
  const c = a.clone();
  assert.equal(c.nextU32(), b.nextU32(), 'clone 要从同一位置继续');

  const expected = a.nextU32();
  a.restore(snap);
  assert.equal(a.nextU32(), expected, 'restore 后同一步要同值');

  const different = sangoRng(1235);
  assert.notEqual(different.nextU32(), sangoRng(1234).nextU32(), '不同种子应给不同首值');
});

test('R115 `float()` 落在 [0,1) 且与 `nextU32()/2^32` 一致', () => {
  const a = sangoRng(5);
  const b = sangoRng(5);
  for (let i = 0; i < 100; i += 1) {
    const f = a.float();
    assert.ok(f >= 0 && f < 1);
    assert.equal(f, b.nextU32() / 0x100000000);
  }
});

test('R115 种子派生：全零状态要避开、不同种子给不同状态', () => {
  const [z0, z1] = sangoSeedFrom(0);
  assert.ok(!(z0 === 0 && z1 === 0), 'seed 0 不能派生出全零状态');
  const seen = new Set<string>();
  for (let s = 0; s < 1000; s += 1) {
    const [x, y] = sangoSeedFrom(s);
    seen.add(`${x >>> 0}:${y >>> 0}`);
  }
  assert.equal(seen.size, 1000, '1000 个相邻种子不应撞状态');
});

test('R115 状态字按 32 位回绕（A 递增越过 0xFFFFFFFF 回到 0）', () => {
  const rng = new SangoRng(0xffffffff, 0x12345678);
  rng.nextU32();
  assert.equal(rng.stateA, 0, 'A 从 0xFFFFFFFF +1 应回 0');
});
