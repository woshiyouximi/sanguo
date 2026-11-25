# -*- coding: utf-8 -*-
"""解析《三国群英传2》阵形站位表。

表结构（已由 0x404DAF / 0x40479F 等函数反汇编证实）：
  0x485B10 + a*0x14 + (mode-1)*4  -> u32 指针, 指向 entry 数组
  0x485DA8 + a*0x0C               -> 6 个 int16: w1..w5, slots
  entry = 4 字节 {int16 x, int16 y}

用法:
  python form_dump.py overview          # 全部 33 行指针 + 权重
  python form_dump.py array 0x481470 40 # dump 某个数组
  python form_dump.py form <a> [n]      # dump 某一行(a) 的 5 个 mode 数组
  python form_dump.py group 0 1 9       # 模拟 a=0, mode=1, 兵数=9 的分组
"""
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
DATA = open(EXE, 'rb').read()

PTRTAB = 0x485B10
WTTAB = 0x485DA8
NROW = 33


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def rd32(va):
    return struct.unpack_from('<I', DATA, va2off(va))[0]


def rd16(va):
    return struct.unpack_from('<h', DATA, va2off(va))[0]


def ptrs(a):
    return [rd32(PTRTAB + a * 0x14 + m * 4) for m in range(5)]


def weights(a):
    o = va2off(WTTAB + a * 0x0C)
    return list(struct.unpack_from('<6h', DATA, o))


def arr(va, n):
    o = va2off(va)
    return [struct.unpack_from('<hh', DATA, o + i * 4) for i in range(n)]


def arrays_len(va, limit=400):
    """猜长度：读到出现 (−1,−1) / 越界 (|x|>200 或 |y|>200) 为止。"""
    out = []
    for i in range(limit):
        x, y = struct.unpack_from('<hh', DATA, va2off(va) + i * 4)
        if x < -200 or x > 300 or y < -200 or y > 300:
            break
        out.append((x, y))
    return out


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'overview'
    if cmd == 'overview':
        print('a   w1   w2   w3   w4   w5  slots   pointers(mode1..5)')
        for a in range(NROW):
            w = weights(a)
            print('%2d %4d %4d %4d %4d %4d %5d   %s' % (
                a, w[0], w[1], w[2], w[3], w[4], w[5],
                ' '.join('0x%06X' % p if p else '   --   ' for p in ptrs(a))))
    elif cmd == 'array':
        va = int(sys.argv[2], 16)
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
        v = arrays_len(va, n)
        print('VA=0x%08X  autoLen=%d' % (va, len(v)))
        for i, (x, y) in enumerate(v):
            print('  [%3d] x=%4d y=%4d' % (i, x, y))
    elif cmd == 'form':
        a = int(sys.argv[2])
        w = weights(a)
        print('row a=%d  weights=%s  slots=%d' % (a, w[:5], w[5]))
        for m, p in enumerate(ptrs(a)):
            if not p:
                continue
            v = arrays_len(p)
            print('  mode%d ptr=0x%08X len=%d' % (m + 1, p, len(v)))
            print('       ' + ' '.join('(%d,%d)' % xy for xy in v))
    elif cmd == 'group':
        a = int(sys.argv[2])
        mode = int(sys.argv[3])
        total = int(sys.argv[4])
        w = weights(a)
        print('a=%d mode=%d total=%d weights=%s' % (a, mode, total, w[:5]))
        for m in range(5):
            print('  mode%d = %d * %d / 200 = %d' % (
                m + 1, w[m], total, w[m] * total // 200))


if __name__ == '__main__':
    main()
