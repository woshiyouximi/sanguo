/**
 * R115 原作乱数发生器（`0x450132`）的逐位复刻。
 *
 * 依据 `work\orig_numbers\R20_excerpt.txt`（`0x4500E7..0x4501D0` 的逐条反汇编，
 * 摘要见 `project/133_原作数值真值.md` §4.1）：
 *
 * ```
 * A = [0x4922FC]; A += 1                  ; 00450138..00450140
 * B = [0x492300]; B -= 1                  ; 00450145..0045014E
 * B = ror(B, A & 31)                      ; 00450154..00450188（shr + shl(32-(A&31)) 两段拼）
 * A = rol(A, B & 31)                      ; 0045018D..004501C1
 * return (A + B) & 0xFFFFFFFF             ; 004501C6..004501CB
 * ```
 *
 * x86 的 `shl/shr` 计数按 5 位取模（`cl = 32` 等于不移），所以轮转量 0 时
 * `x >>> 0` 与 `x << 32` 都回 `x`，两者相加 = `2x`——JS 的移位运算符同样
 * 按 31 取模，语义正好对上，不需要特判。
 *
 * **注意：轮转量 0 时这不是真正的 rotate**（真 `rol/ror` 会原样返回，这里
 * 因为编译器用的是「两段移位相加」的写法，会变成 `2x mod 2^32`）。每组状态
 * 每 32 步约有 1 步踩到，实测 `rand() & 1` 因此略偏（约 48.2% 为 1，不是
 * 50%，见 `tests/sango_rng.test.ts`）。复刻要连这个怪癖一起复刻，否则从第
 * 一步踩到就错位。
 *
 * 原作的三个入口：
 *  - `0x4500E7` `srand(a, b)`：两个 dword 直接写状态；
 *  - `0x450132` `rand()`：上面那段，返回 32 位无符号；
 *  - `0x450117` `rand()%n`：`n == 0` 直接回 0（`cmp [ebp+8],0; jne`），否则
 *    把 `rand()` 当无符号数做 `div` 取余。
 *
 * 全 EXE 只有 2 个 `srand` 调用点（都在新开局、种子由 `GetTickCount` 派生），
 * 没有按城/按势力重播种、存档也不存 RNG 状态（`project/133` §4.2）。所以
 * 「同流」= 同发生器 + 同调用顺序；种子只能由本作自己给（`sangoSeedFrom`）。
 */

/** 32 位无符号掩码。 */
export const U32_MASK = 0xffffffff;

/** 把任意数规整成 32 位无符号（`-0` / `NaN` 都归 0）。 */
function u32(x: number): number {
  return x >>> 0;
}

/**
 * 原作 `0x450132` 的乱数发生器。
 *
 * 用法：
 * ```ts
 * const rng = new SangoRng(...sangoSeedFrom(seed));
 * rng.nextU32();   // = 原作 rand()
 * rng.int(80);     // = 原作 rand()%80
 * rng.bit();       // = 原作 rand() & 1（扫描先看哪一侧）
 * ```
 */
export class SangoRng {
  private a = 0;
  private b = 0;

  constructor(a = 0, b = 0) {
    this.seed(a, b);
  }

  /** `0x4500E7` `srand(a, b)`：直接覆盖两个状态字。 */
  seed(a: number, b: number): void {
    this.a = u32(a);
    this.b = u32(b);
  }

  /** 状态字 A（`[0x4922FC]`），只读导出——录像/测试要对状态。 */
  get stateA(): number {
    return this.a;
  }

  /** 状态字 B（`[0x492300]`），只读导出。 */
  get stateB(): number {
    return this.b;
  }

  /** 当前状态的快照（与 `restore()` 配对，用于录像回放/分支试验）。 */
  snapshot(): { a: number; b: number } {
    return { a: this.a, b: this.b };
  }

  /** 恢复快照（不改变流的位置以外的东西）。 */
  restore(snap: { a: number; b: number }): void {
    this.a = u32(snap.a);
    this.b = u32(snap.b);
  }

  /** `0x450132` `rand()`：返回 `[0, 2^32)`。 */
  nextU32(): number {
    // A += 1；B -= 1（都是 32 位回绕）
    const a1 = u32(this.a + 1);
    const b1 = u32(this.b - 1);
    // B = ror(B, A & 31)：shr 段 + shl 段相加（x86 两段拼一次 32 位回绕）
    const sA = a1 & 31;
    const b2 = u32((b1 >>> sA) + (b1 << (32 - sA)));
    // A = rol(A, B & 31)：用**旋转后的** B 当轮转量
    const sB = b2 & 31;
    const a2 = u32((a1 << sB) + (a1 >>> (32 - sB)));
    this.a = a2;
    this.b = b2;
    return u32(a2 + b2);
  }

  /**
   * `0x450117` `rand()%n`。
   *
   * `n <= 0` 回 0（与原作 `cmp [ebp+8],0` 一致）；非整数 `n` 先截断。
   */
  int(n: number): number {
    const m = Math.trunc(n);
    if (!(m > 0)) return 0;
    return this.nextU32() % m;
  }

  /** `0x450132() & 1`：原作扫描方向、站位侧用的那一位。 */
  bit(): number {
    return this.nextU32() & 1;
  }

  /** `bit() === 1` 的布尔糖。 */
  chance(): boolean {
    return this.bit() === 1;
  }

  /**
   * `[0, 1)` 的均匀浮点（仅供沿用 `rng()` 形状的旧调用端；新代码优先用 `int()`）。
   *
   * 除以 2^32 不改变流的消耗，只换表示。
   */
  float(): number {
    return this.nextU32() / 0x100000000;
  }

  /** 独立的同状态副本（两边各走各的，互不影响）。 */
  clone(): SangoRng {
    const c = new SangoRng();
    c.restore(this.snapshot());
    return c;
  }
}

/**
 * 从单个 32 位种子派生 `srand(a, b)` 的两个状态字。
 *
 * 为什么不是直接 `(seed, 0x12345678)`：原作第一次播种的第二个参数就是常量
 * `0x12345678`（`0x40B583 push 0x12345678`），照抄会让「同 seed 不同档」只差
 * 一个低熵的 A；这里用两路整数混合把 seed 摊到两个状态字上，只为**本作的
 * 可复现**服务（原作种子来自 `GetTickCount`，不可能与录像对齐，见 `project/133` §4.2）。
 *
 * 全零状态虽然不会卡死，但前几十个输出只有最高几位在动（实测 `(0,0)` →
 * `0x7FFFFFFF, 0x3FFFFFFF, …`），所以命中 `(0,0)` 时强行给一个非零种子。
 */
export function sangoSeedFrom(seed: number): [number, number] {
  const s = u32(seed);
  let a = u32(s ^ 0x9e3779b9);
  let b = u32(Math.imul(s, 0x85ebca6b) ^ 0x12345678);
  if (a === 0 && b === 0) a = 0x6d2b79f5;
  return [a, b];
}

/** 便捷构造：`sangoRng(seed)` = `new SangoRng(...sangoSeedFrom(seed))`。 */
export function sangoRng(seed: number): SangoRng {
  const [a, b] = sangoSeedFrom(seed);
  return new SangoRng(a, b);
}
