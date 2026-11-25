// 临时测量：sango_rng 的 bit() 偏置与参考向量（R115 测试标定用）。
import { SangoRng, sangoRng } from '../../game/src/core/sango_rng.ts';

const hex = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
for (const [a, b] of [[0x12345678, 0x9abcdef0], [1, 0x12345678], [0, 0], [0xffffffff, 0x80000000]]) {
  const r = new SangoRng(a, b);
  console.log('seed', hex(a), hex(b), '->', Array.from({ length: 5 }, () => hex(r.nextU32())).join(' '));
}

for (const seed of [99, 0x51c0, 7]) {
  const r = sangoRng(seed);
  let ones = 0;
  const N = 100000;
  for (let i = 0; i < N; i += 1) ones += r.bit();
  console.log(`seed ${seed} bit()==1 share = ${(ones / N * 100).toFixed(3)}%`);
}

// 逐段对拍：与「按位串」实现比 20000 步
const rot = (x, n, dir) => {
  const s = x.toString(2).padStart(32, '0');
  const k = n & 31;
  if (k === 0) return (x + x) >>> 0;
  const out = dir === 1 ? s.slice(32 - k) + s.slice(0, 32 - k) : s.slice(k) + s.slice(0, k);
  return parseInt(out, 2) >>> 0;
};
let a = 0x12345678;
let b = 0x9abcdef0;
const rng = new SangoRng(a, b);
let bad = 0;
for (let i = 0; i < 20000; i += 1) {
  a = (a + 1) >>> 0;
  b = (b - 1) >>> 0;
  b = rot(b, a & 31, 1);
  a = rot(a, b & 31, -1);
  if (rng.nextU32() !== ((a + b) >>> 0)) bad += 1;
}
console.log('cross-check 20k mismatches =', bad);
