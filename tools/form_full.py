# -*- coding: utf-8 -*-
"""完整 dump 阵形站位表：33 行 × 5 mode 的坐标数组。

用法:
  python form_full.py dump            # 全部 33 行（写到 stdout）
  python form_full.py len             # 只打印每个数组的自动探测长度
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
NROW = 33


def off(va):
    r = va - IB
    for v, vs, p, rs in SEC:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    raise ValueError('bad va 0x%X' % va)


def r32(va):
    return struct.unpack_from('<I', D, off(va))[0]


def weights(a):
    return struct.unpack_from('<6h', D, off(WTTAB + a * 0x0C))


def ptrs(a):
    return [r32(PTRTAB + a * 0x14 + m * 4) for m in range(5)]


def entries(va, n):
    o = off(va)
    return [struct.unpack_from('<hh', D, o + i * 4) for i in range(n)]


def autolen(va, limit=400):
    """探测：出现 (0,0) 且之后全 0，或越界即停。"""
    o = off(va)
    out = []
    zero_run = 0
    for i in range(limit):
        x, y = struct.unpack_from('<hh', D, o + i * 4)
        if x < -300 or x > 400 or y < -300 or y > 400:
            break
        if x == 0 and y == 0:
            zero_run += 1
            if zero_run >= 3:
                break
        else:
            zero_run = 0
        out.append((x, y))
    return out


def row(a):
    w = weights(a)
    ps = ptrs(a)
    out = []
    for m in range(5):
        if ps[m]:
            out.append((m + 1, w[m], ps[m]))
    return w, out


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'dump'
    if cmd == 'len':
        print('a  anchor  ' + '  '.join('mode%d(w,len)' % m for m in range(1, 6)))
        for a in range(NROW):
            w, ms = row(a)
            cells = []
            for m in range(1, 6):
                ww = w[m - 1]
                p = ptrs(a)[m - 1]
                if p:
                    cells.append('%3d/%-3d' % (ww, len(autolen(p, max(ww + 40, 60)))))
                else:
                    cells.append('  --  ')
            print('%2d %5d  %s' % (a, w[5], '  '.join(cells)))
        return
    # dump：容量 = w（已由相邻指针差证实），只 dump w 项
    lo = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else NROW
    for a in range(lo, min(hi, NROW)):
        w, ms = row(a)
        print('===== a=%d  anchorX=%d  w=%s (sum=%d) =====' %
              (a, w[5], list(w[:5]), sum(w[:5])))
        for mode, ww, p in ms:
            if ww <= 0:
                print('  -- mode%d  ptr=0x%06X  w=0 (未使用)' % (mode, p))
                continue
            v = entries(p, ww)
            print('  -- mode%d  ptr=0x%06X  w=%d' % (mode, p, ww))
            for i in range(0, len(v), 10):
                print('     ' + ' '.join('%3d:(%d,%d)' % (i + j, v[i + j][0], v[i + j][1])
                                         for j in range(min(10, len(v) - i))))
        print()


if __name__ == '__main__':
    main()
