# -*- coding: utf-8 -*-
"""Minimal PE loader / disassembler helper for Sango2.exe (ImageBase 0x400000)."""
import struct, re, sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def sec_of(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return nm
    return None


def text_range():
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if nm == '.text':
            return IB + vaddr, IB + vaddr + vsize
    raise SystemExit('no .text')


def cstr(va, maxlen=80):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + maxlen)
    if e < 0:
        return None
    b = data[o:e]
    if len(b) < 2:
        return None
    if all(0x20 <= c < 0x7f for c in b):
        return b.decode('latin1')
    return None


def cstr_gb(va, maxlen=120):
    """cp950/gbk chinese string."""
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + maxlen)
    if e < 0:
        return None
    b = data[o:e]
    for enc in ('cp950', 'gbk'):
        try:
            s = b.decode(enc)
            if s and all(ord(c) >= 0x20 for c in s):
                return s
        except Exception:
            pass
    return None


def dis(va, n=200, annotate=True):
    """Yield (va, text, comment) linearly."""
    off = va2off(va)
    return _dis(data[off:off + n], va, annotate)


def _dis(buf, va, annotate=True):
    out = []
    for ins in md.disasm(buf, va):
        txt = ins.mnemonic + ' ' + ins.op_str
        cm = ''
        if annotate:
            for tok in re.findall(r'0x[0-9a-fA-F]+', ins.op_str):
                v = int(tok, 16)
                if 0x400000 <= v < 0x800000:
                    s = cstr_gb(v)
                    if s:
                        cm = '   ; "%s"' % s
                        break
        out.append((ins.address, txt, cm))
    return out


def show(va, n=400):
    for a, t, c in dis(va, n):
        print('%08X  %-34s%s' % (a, t, c))


def xrefs(target, lo=None, hi=None, width=4):
    """All offsets in file where target VA appears as little-endian imm."""
    if lo is None or hi is None:
        lo, hi = text_range()
    o1, o2 = va2off(lo), va2off(hi)
    pat = struct.pack('<I', target)
    res = []
    i = o1
    while True:
        j = data.find(pat, i, o2)
        if j < 0:
            break
        res.append(off2va(j))
        i = j + 1
    return res


def scan_imm(val, lo=None, hi=None, width=4):
    if lo is None or hi is None:
        lo, hi = text_range()
    o1, o2 = va2off(lo), va2off(hi)
    pat = struct.pack('<I', val & 0xFFFFFFFF)
    res = []
    i = o1
    while True:
        j = data.find(pat, i, o2)
        if j < 0:
            break
        res.append(off2va(j))
        i = j + 1
    return res


def u32(va):
    o = va2off(va)
    return struct.unpack('<I', data[o:o + 4])[0]


def i32(va):
    o = va2off(va)
    return struct.unpack('<i', data[o:o + 4])[0]


def u16(va):
    o = va2off(va)
    return struct.unpack('<H', data[o:o + 2])[0]


def i16(va):
    o = va2off(va)
    return struct.unpack('<h', data[o:o + 2])[0]


def u8(va):
    o = va2off(va)
    return data[o]


def imports():
    pe.parse_data_directories()
    out = []
    for e in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', []):
        for imp in e.imports:
            out.append((e.dll.decode('latin1'), imp.name.decode('latin1') if imp.name else ('ord%d' % imp.ordinal), imp.address))
    return out
