# -*- coding: utf-8 -*-
"""扫描 Sango2.exe 内含指定中文子串的 cp950 字符串，输出 VA。用法: scan_cn.py 物品 獲得"""
import sys, pefile, re

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()

secs = []
for s in pe.sections:
    secs.append((s.PointerToRawData, s.PointerToRawData + s.SizeOfRawData,
                 IB + s.VirtualAddress - s.PointerToRawData, s.Name.rstrip(b'\x00').decode('latin-1')))

def scan():
    """找一个可打印 Big5 串的候选区域：字节 >=0x81 或 ASCII 可打印，遇到 0 结束，长度>=4"""
    out = []
    for (lo, hi, delta, name) in secs:
        blob = data[lo:hi]
        i = 0
        n = len(blob)
        while i < n:
            c = blob[i]
            if c == 0 or c < 0x20:
                i += 1
                continue
            j = i
            while j < n and blob[j] != 0 and blob[j] >= 0x20:
                j += 1
            if j - i >= 4:
                out.append((lo + i, delta, blob[i:j]))
            i = j + 1 if j > i else i + 1
    return out

strs = scan()
pats = [a for a in sys.argv[1:]]
for pat in pats:
    pb = pat.encode('cp950')
    print('=== %s ===' % pat)
    cnt = 0
    for (off, delta, raw) in strs:
        if pb in raw:
            va = off + delta
            # 只打印含该子串的整串
            try:
                txt = raw.decode('cp950')
            except Exception:
                txt = raw.decode('cp950', 'replace')
            print('  VA %08X off=%06x  %r' % (va, off, txt))
            cnt += 1
            if cnt >= 40:
                print('  ... (truncated)')
                break
    if cnt == 0:
        print('  (none)')
