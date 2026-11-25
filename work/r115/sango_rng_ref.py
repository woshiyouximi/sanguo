# 原作 0x450132 乱数的独立参考实现（Python）——给 TS 版做跨语言对拍 + 产出测试向量。
#
# 依据 work/orig_numbers/R20_excerpt.txt 的逐条反汇编：
#   A = [0x4922FC]; A += 1
#   B = [0x492300]; B -= 1
#   B = ror(B, A & 31)      ; shr + shl(32-(A&31))（x86 的 shl 计数按 5 位取模，cl=32 即不移）
#   A = rol(A, B & 31)
#   return (A + B) & 0xFFFFFFFF      ; 0x4501C6: eax = [A]; add eax, [B]
M = 0xFFFFFFFF


def ror(x: int, n: int) -> int:
    n &= 31
    return ((x >> n) | (x << ((32 - n) & 31))) & M


def rol(x: int, n: int) -> int:
    n &= 31
    return ((x << n) | (x >> ((32 - n) & 31))) & M


def step(a: int, b: int):
    a = (a + 1) & M
    b = (b - 1) & M
    b = ror(b, a & 31)
    a = rol(a, b & 31)
    return a, b, (a + b) & M


class Rng:
    def __init__(self, a: int, b: int):
        self.a = a & M
        self.b = b & M

    def next(self) -> int:
        self.a, self.b, v = step(self.a, self.b)
        return v

    def below(self, n: int) -> int:  # 0x450117: n==0 -> 0
        return 0 if n == 0 else self.next() % n


def alt_impl(a: int, b: int):
    """第二种写法（按位串旋转），故意与上面的移位写法不同，用来交叉验证。"""
    while True:
        a = (a + 1) & M
        b = (b - 1) & M
        sa = a & 31
        s = format(b, '032b')
        b = int(s[-sa:] + s[:-sa], 2) if sa else b
        sb = b & 31
        s = format(a, '032b')
        a = int(s[sb:] + s[:sb], 2) if sb else a
        yield a, b, (a + b) & M


if __name__ == '__main__':
    seeds = [(0x12345678, 0x9ABCDEF0), (1, 0x12345678), (0, 0), (0xFFFFFFFF, 0x80000000)]
    for sa, sb in seeds:
        r = Rng(sa, sb)
        vals = [r.next() for _ in range(5)]
        print('seed 0x%08X 0x%08X -> %s' % (sa, sb, ' '.join('0x%08X' % v for v in vals)))

    # 10 万步交叉验证
    r = Rng(0x12345678, 0x9ABCDEF0)
    g = alt_impl(0x12345678, 0x9ABCDEF0)
    bad = 0
    for _ in range(100000):
        if r.next() != next(g)[2]:
            bad += 1
    print('cross-check 100k mismatches =', bad)

    # 分布：int(100) 的 0..99 计数（10 万次）
    r = Rng(0x12345678, 0x9ABCDEF0)
    buckets = [0] * 10
    for _ in range(100000):
        buckets[r.below(100) // 10] += 1
    print('int(100) deciles =', buckets)

    # 位平衡：10 万次的 bit0 / bit31
    r = Rng(0x12345678, 0x9ABCDEF0)
    ones0 = ones31 = 0
    n = 100000
    for _ in range(n):
        v = r.next()
        ones0 += v & 1
        ones31 += (v >> 31) & 1
    print('bit0 ones = %d (%.3f), bit31 ones = %d (%.3f)' % (ones0, ones0 / n, ones31, ones31 / n))

    # 4 万步无重复前缀检查（周期远大于此）
    r = Rng(7, 11)
    seen = set()
    for _ in range(40000):
        seen.add(r.next())
    print('distinct in first 40000 =', len(seen))
