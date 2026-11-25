# -*- coding: utf-8 -*-
"""生成 04b1 文档第 7 章（人数示例）。"""
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
ORDER = [1, 3, 4, 5, 2]
NAMES = ['方形之陣', '圓形之陣', '錐形之陣', '雁形之陣', '玄襄之陣',
         '魚麗之陣', '鉤形之陣', '衝鋒之陣', '箭矢之陣']


def off(va):
    r = va - IB
    for v, vs, p, rs in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    raise ValueError('bad va 0x%X' % va)


def weights(a):
    return struct.unpack_from('<6h', D, off(WTTAB + a * 0x0C))


def ptrs(a):
    return [struct.unpack_from('<I', D, off(PTRTAB + a * 0x14 + m * 4))[0] for m in range(5)]


def entries(va, n):
    o = off(va)
    return [struct.unpack_from('<hh', D, o + i * 4) for i in range(n)]


def kcav(a, m, n):
    w = weights(a)[m - 1]
    return 0 if w <= 0 or n <= 0 else w * n // 200


def kinf(a, m, n):
    w = weights(a)[m - 1]
    if n <= 0:
        return 0
    if m == 1:
        return max(0, n - sum(kinf(a, k, n) for k in (2, 3, 4, 5)))
    return 0 if w <= 0 else w * n // 200


def layout(a, inf, cav, mirror=False):
    w = weights(a)
    anchor = w[5]
    ps = ptrs(a)
    dx = (200 - inf - cav) // 25
    out = []
    for m in ORDER:
        if w[m - 1] <= 0 or not ps[m - 1]:
            continue
        tbl = entries(ps[m - 1], w[m - 1])
        n = 0
        for iscav, k in ((1, kcav(a, m, cav)), (0, kinf(a, m, inf))):
            for _ in range(min(k, len(tbl) - n)):
                tx, ty = tbl[n]
                x = tx + anchor + dx
                if mirror:
                    x = 0x47 - x
                out.append((m, iscav, n, x, ty))
                n += 1
    return out


def table_counts():
    print('| 阵形 | w1..w5 | N=10 | N=50 | N=100 |')
    print('|---|---|---|---|---|')
    for a in range(9):
        w = weights(a)
        cells = []
        for N in (10, 50, 100):
            parts = []
            for m in range(1, 6):
                if w[m - 1] <= 0:
                    continue
                k = kinf(a, m, N)      # 纯步兵
                if k:
                    parts.append('m%d:%d' % (m, k))
            cells.append(' '.join(parts) if parts else '—')
        print('| %d %s | %s | %s | %s | %s |' % (
            a, NAMES[a],
            '/'.join(str(x) for x in w[:5]),
            cells[0], cells[1], cells[2]))
    print()


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'counts'
    if what == 'counts':
        table_counts()
        return
    if what == 'soldiers':
        a = int(sys.argv[2]); inf = int(sys.argv[3]); cav = int(sys.argv[4])
        mirror = len(sys.argv) > 5 and sys.argv[5] == 'a'
        rows = layout(a, inf, cav, mirror)
        print('`%s` N=%d（步 %d / 骑 %d）%s：\n'
              % (NAMES[a], inf + cav, inf, cav, '（A 侧镜像）' if mirror else ''))
        print('```text')
        for i in range(0, len(rows), 6):
            cells = ['#%-3d m%d%s(%2d,%2d)' % (i + j, r[0], '骑' if r[1] else '步', r[3], r[4])
                     for j, r in enumerate(rows[i:i + 6])]
            print('  '.join(cells))
        print('```\n')
        return
    if what == 'compare':
        print('| 阵形 | 实际占格范围（N=100，步80/骑20） | 前 6 个士兵的格 |')
        print('|---|---|---|')
        for a in range(9):
            rows = layout(a, 80, 20)
            xs = [r[3] for r in rows]
            ys = [r[4] for r in rows]
            head = '、'.join('(%d,%d)' % (r[3], r[4]) for r in rows[:6])
            print('| %d %s | x %d..%d，y %d..%d | %s |'
                  % (a, NAMES[a], min(xs), max(xs), min(ys), max(ys), head))
        print()


if __name__ == '__main__':
    main()
