# -*- coding: utf-8 -*-
"""生成 04b1 文档的"站位表"章节（markdown），输出到 stdout。"""
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

NAMES = ['方形之陣', '圓形之陣', '錐形之陣', '雁形之陣', '玄襄之陣',
         '魚麗之陣', '鉤形之陣', '衝鋒之陣', '箭矢之陣', '亂陣', '特殊陣型']


def off(va):
    r = va - IB
    for v, vs, p, rs in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    raise ValueError('bad va 0x%X' % va)


def foff(va):
    """文件偏移（用于文档里同时给 VA / 文件偏移）。"""
    return off(va)


def weights(a):
    return struct.unpack_from('<6h', D, off(WTTAB + a * 0x0C))


def ptrs(a):
    return [struct.unpack_from('<I', D, off(PTRTAB + a * 0x14 + m * 4))[0]
            for m in range(5)]


def entries(va, n):
    o = off(va)
    return [struct.unpack_from('<hh', D, o + i * 4) for i in range(n)]


def span(v):
    xs = [p[0] for p in v]
    ys = [p[1] for p in v]
    return 'x %d..%d, y %d..%d' % (min(xs), max(xs), min(ys), max(ys))


def zone_block(a, indent=''):
    w = weights(a)
    ps = ptrs(a)
    out = []
    for m in range(1, 6):
        if w[m - 1] <= 0:
            continue
        out.append((m, w[m - 1], ps[m - 1]))
    return out


def main():
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 11
    for a in range(lo, hi):
        w = weights(a)
        ps = ptrs(a)
        title = NAMES[a] if a < len(NAMES) else '变形 %d' % a
        print('### %s（a=%d，anchorX=%d，权重和=%d）\n'
              % (title, a, w[5], sum(w[:5])))
        print('| 分区 | 权重 w | 满员(200)时 slot 数 | 坐标数组 VA | 文件偏移 | 覆盖格 |')
        print('|---|---|---|---|---|---|')
        for m in range(1, 6):
            if w[m - 1] <= 0:
                print('| mode%d | 0 | 0（该阵不用此区） | — | — | — |' % m)
                continue
            v = entries(ps[m - 1], w[m - 1])
            print('| mode%d | %d | %d | `0x%06X` | `0x%06X` | %s |'
                  % (m, w[m - 1], w[m - 1], ps[m - 1], foff(ps[m - 1]), span(v)))
        print()
        for m in range(1, 6):
            if w[m - 1] <= 0:
                continue
            v = entries(ps[m - 1], w[m - 1])
            print('**mode%d 坐标（slot 0..%d）** —— `0x%06X`\n' % (m, len(v) - 1, ps[m - 1]))
            print('```text')
            for i in range(0, len(v), 10):
                cells = ['%3d:(%d,%d)' % (i + j, v[i + j][0], v[i + j][1])
                         for j in range(min(10, len(v) - i))]
                print(' '.join(cells))
            print('```\n')


if __name__ == '__main__':
    main()
