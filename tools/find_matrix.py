# -*- coding: utf-8 -*-
"""在 Sango2.exe 里搜索整数矩阵（兵种/阵法相克表）。

用法:
  python find_matrix.py <json> <sheet> [--transpose]
扫描 1/2/4 字节有符号小端编码，输出所有命中地址（VA / RVA / 文件偏移 / 段名）。
"""
import json
import struct
import sys

import pefile

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def sec_of(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return nm
    return '?'


def load_matrix(path, sheet):
    j = json.load(open(path, encoding='utf-8'))
    rows = j['rows']
    mat = []
    for r in rows[1:]:          # rows[0] 是表头
        vals = []
        for c in r[1:]:
            vals.append(int(round(c)))
        mat.append(vals)
    return mat


def enc(m, width):
    fmt = {1: '<b', 2: '<h', 4: '<i'}[width]
    out = b''
    for row in m:
        for v in row:
            out += struct.pack(fmt, v)
    return out


def scan(pat, label, width):
    if not pat:
        return
    hits = []
    i = data.find(pat)
    while i >= 0:
        hits.append(i)
        i = data.find(pat, i + 1)
    print('--- %s width=%d  patlen=%d  hits=%d' % (label, width, len(pat), len(hits)))
    for h in hits:
        print('    off=0x%06X  RVA=0x%06X  VA=0x%08X  sec=%s' %
              (h, off2va(h) - IB if off2va(h) else -1, off2va(h) or 0, sec_of(h)))


if __name__ == '__main__':
    path = sys.argv[1]
    sheet = sys.argv[2]
    m = load_matrix(path, sheet)
    print('matrix %s: %d x %d' % (sheet, len(m), len(m[0])))
    for w in (1, 2, 4):
        scan(enc(m, w), 'asis', w)
    mt = [list(x) for x in zip(*m)]
    for w in (1, 2, 4):
        scan(enc(mt, w), 'transposed', w)
