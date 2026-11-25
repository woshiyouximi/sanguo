# -*- coding: utf-8 -*-
"""模拟《三国群英传2》布阵：给定阵形号与兵数，输出每个士兵的网格坐标。

算法依据（全部反汇编证实）：
  0x442EFA / 0x443498  布阵主流程
  0x404A10 / 0x404D18  分组人数（步兵族 / 骑兵族，5 路 mode 派发）
  0x404DAF            取 slot 坐标 = 表[slot] + anchorX
  0x442D38            生成循环（X 偏移、镜像、占位探测）
  0x442CB6            X += (200-total)/25，并按 [unit+0x68] 选变体

用法:
  python form_sim.py <a> <inf> <cav> [--side b|a] [--order]
      a    阵形号（0..10 为正常，11.. 为变形族）
      inf  步兵数    cav  骑兵数
      --side b 原样（默认）  a 镜像 x=71-x
      --order 打印生成顺序（默认按 mode 1,3,5,2,4）
"""
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
       for s in pe.sections]
D = open(EXE, 'rb').read()

PTRTAB = 0x485B10
WTTAB = 0x485DA8
SPAWN_ORDER = [1, 3, 4, 5, 2]   # 0x4431D8=1 / 0x443264=3 / 0x4432F0=4 / 0x44337C=5 / 0x443408=2


def off(va):
    r = va - IB
    for v, vs, p, rs in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    raise ValueError('bad va 0x%X' % va)


def weights(a):
    return struct.unpack_from('<6h', D, off(WTTAB + a * 0x0C))


def ptrs(a):
    return [struct.unpack_from('<I', D, off(PTRTAB + a * 0x14 + m * 4))[0]
            for m in range(5)]


def entries(va, n):
    o = off(va)
    return [struct.unpack_from('<hh', D, o + i * 4) for i in range(n)]


def group_cav(a, mode, n):
    """骑兵族 0x404D18：≈ w*N/200。"""
    w = weights(a)[mode - 1]
    return 0 if w <= 0 or n <= 0 else w * n // 200


def group_inf(a, mode, n):
    """步兵族 0x404A10：mode1 为余数，其余 ≈ w*N/200。"""
    w = weights(a)[mode - 1]
    if n <= 0:
        return 0
    if mode == 1:
        return max(0, n - sum(group_inf(a, m, n) for m in (2, 3, 4, 5)))
    return 0 if w <= 0 else w * n // 200


def layout(a, inf, cav, mirror=False, variant=0):
    """返回生成顺序的 (mode, isCav, slotIdx, x, y)。"""
    w = weights(a)
    anchor = w[5]
    ps = ptrs(a)
    total = inf + cav
    dx = (200 - total) // 25
    out = []
    for mode in SPAWN_ORDER:
        if w[mode - 1] <= 0 or not ps[mode - 1]:
            continue
        kc = group_cav(a, mode, cav)
        ki = group_inf(a, mode, inf)
        tbl = entries(ps[mode - 1], w[mode - 1])
        n = 0
        for iscav, k in ((1, kc), (0, ki)):
            for _ in range(k):
                if n >= len(tbl):
                    break
                tx, ty = tbl[n]
                x = tx + anchor
                x2 = x + dx
                if variant == 1 or variant == 2:
                    x2 = x + 0xC
                elif variant == 3:
                    x2 = x
                elif variant == 4:
                    x2 = 0x22 - x2
                if mirror:
                    x2 = 0x47 - x2
                out.append((mode, iscav, n, x2, ty))
                n += 1
    return out


def main():
    a = int(sys.argv[1])
    inf = int(sys.argv[2])
    cav = int(sys.argv[3])
    mirror = '--side' in sys.argv and sys.argv[sys.argv.index('--side') + 1] == 'a'
    w = weights(a)
    print('阵形 a=%d  anchorX=%d  w=%s  步=%d 骑=%d' % (a, w[5], list(w[:5]), inf, cav))
    print('X 附加偏移 (200-%d)/25 = %d   镜像=%s' % (inf + cav, (200 - inf - cav) // 25, mirror))
    rows = layout(a, inf, cav, mirror)
    print('共 %d 个士兵:' % len(rows))
    for i, (mode, iscav, slot, x, y) in enumerate(rows):
        print('  #%-3d mode%d %s slot%-3d -> (%3d,%2d)' %
              (i, mode, '骑' if iscav else '步', slot, x, y))


if __name__ == '__main__':
    main()
