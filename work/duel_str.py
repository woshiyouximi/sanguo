# -*- coding: utf-8 -*-
"""搜 EXE 里的 cp950 中文字符串 + imm32 交叉引用。
用法: python duel_str.py 單挑 挑戰 ...
输出: VA / 文件偏移 / 文本 / 引用点(每条)
"""
import sys, struct, io, os
import pefile

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'

pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
secs = []
for s in pe.sections:
    secs.append((s.VirtualAddress + IB, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name.rstrip(b'\x00').decode('latin1')))
raw = open(EXE, 'rb').read()

def va2off(va):
    for v, vsz, off, rsz, nm in secs:
        if v <= va < v + max(vsz, rsz):
            return off + (va - v)
    return None

def off2va(off):
    for v, vsz, off0, rsz, nm in secs:
        if off0 <= off < off0 + rsz:
            return v + (off - off0)
    return None

def read_cstr(va):
    o = va2off(va)
    if o is None: return None
    e = raw.find(b'\x00', o)
    return raw[o:e]

text = [s for s in secs if s[4] == '.text'][0]
tva, tvsz, toff, trsz = text[0], text[1], text[2], text[3]
tbytes = raw[toff:toff+trsz]

def xrefs(va):
    """在 .text 中找 imm32 == va 的位置"""
    needle = struct.pack('<I', va)
    out = []
    i = 0
    while True:
        j = tbytes.find(needle, i)
        if j < 0: break
        out.append(tva + j)
        i = j + 1
    return out

needles = sys.argv[1:]
if not needles:
    needles = ['單挑', '挑戰', '喊話', '衝鋒', '一騎', '決鬥']

for nd in needles:
    for enc in ('cp950', 'gbk'):
        try:
            b = nd.encode(enc)
        except Exception:
            continue
        i = 0
        hits = []
        while True:
            j = raw.find(b, i)
            if j < 0: break
            hits.append(j)
            i = j + 1
        if not hits: continue
        print('=== %s (%s) %d 处' % (nd, enc, len(hits)))
        for h in hits:
            va = off2va(h)
            if va is None: continue
            s = read_cstr(va)
            try:
                txt = s.decode('cp950')
            except Exception:
                txt = repr(s)
            xs = xrefs(va)
            print('  VA %08X  off %06X  %r  xrefs=%s' % (va, h, txt, ['%08X' % x for x in xs[:12]]))
        break
