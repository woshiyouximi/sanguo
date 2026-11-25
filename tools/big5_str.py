"""Dump Big5/ASCII strings from Sango2.exe with code xrefs (push imm32 / mov reg,imm32).

Usage: big5_str.py [substr]   -> print matching strings with VA + xref sites
       big5_str.py --all      -> print all
Writes F:\sanguo\work\str_big5.tsv (va, kind, text, xrefs)
"""
import sys, os, re, struct
import pefile

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
OUT = r'F:\sanguo\work\str_big5.tsv'

pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()
SEC = [(s.Name.rstrip(b'\0').decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]
TEXT = [s for s in SEC if s[0] == '.text'][0]


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def off2va(off):
    for n, v, vs, p, rs in SEC:
        if p <= off < p + rs:
            return IB + v + (off - p)
    return None


def is_print(b):
    return 32 <= b < 127


def scan_strings():
    out = []
    n = len(data)
    i = 0
    while i < n:
        va = off2va(i)
        if va is None:
            i += 1
            continue
        # try Big5 string: sequences of bytes that decode
        j = i
        buf = bytearray()
        while j < n:
            c = data[j]
            if c == 0:
                break
            buf.append(c)
            j += 1
            if len(buf) > 160:
                break
        if len(buf) >= 3 and data[j] == 0:
            # try decode
            txt = None
            for enc in ('big5',):
                try:
                    t = bytes(buf).decode(enc)
                    # require at least one CJK or plausible
                    if any('\u4e00' <= ch <= '\u9fff' for ch in t) or re.fullmatch(r'[\x20-\x7e]+', t):
                        txt = t
                        break
                except Exception:
                    pass
            if txt and '\ufffd' not in txt and all(ord(ch) >= 32 or ch in '\n\t\r' for ch in txt):
                # skip pure ascii handled elsewhere? keep, useful
                out.append((va, txt))
                i = j + 1
                continue
        i += 1
    return out


def build_xrefs():
    """map target_va -> list of instruction VAs referencing it via 4-byte LE"""
    xr = {}
    tstart = IB + TEXT[1]
    toff = TEXT[3]
    tlen = min(TEXT[2], TEXT[4])
    blob = data[toff:toff + tlen]
    # naive scan for 4-byte LE values inside image range
    lo, hi = IB, IB + 0x200000
    for k in range(0, len(blob) - 3):
        v = struct.unpack_from('<I', blob, k)[0]
        if lo < v < hi:
            xr.setdefault(v, []).append(IB + TEXT[1] + k)
    return xr


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    strs = scan_strings()
    xr = build_xrefs()
    lines = []
    for va, t in strs:
        sites = xr.get(va, [])
        s = ';'.join('%08X' % x for x in sites[:6])
        lines.append('%08X\t%s\t%s' % (va, t.replace('\t', ' '), s))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    if arg and arg != '--all':
        pat = arg.lower()
        for va, t in strs:
            if pat in t.lower():
                sites = xr.get(va, [])
                print('%08X  %s' % (va, t))
                if sites:
                    print('        xref: ' + ' '.join('%08X' % x for x in sites[:8]))
    else:
        for va, t in strs:
            sites = xr.get(va, [])
            print('%08X  %s%s' % (va, t, ('   <-' + ' '.join('%08X' % x for x in sites[:4])) if sites else ''))
    print('; total %d strings -> %s' % (len(strs), OUT), file=sys.stderr)


main()
