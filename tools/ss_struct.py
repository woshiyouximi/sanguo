# Inspect Smart Script .SO container structures (header, symbol table, reloc table, tail)
import struct, sys, os

def rd(fn):
    b = open(fn, 'rb').read()
    ver, code, t1off, t1cnt, t2off, t2cnt, x79, end = struct.unpack_from('<8I', b, 0x10)
    print("="*100)
    print(os.path.basename(fn), "len", len(b), hex(len(b)))
    print("ver %X code %X symoff %X symcnt %d reloff %X relcnt %d f28 %X end %X" %
          (ver, code, t1off, t1cnt, t2off, t2cnt, x79, end))
    print("tail after end:", b[end:end+0x60].hex(' '), "  ascii:", ''.join(chr(c) if 32<=c<127 else '.' for c in b[end:end+0x60]))
    # symbol table
    print("--- table1 (16-byte entries) ---")
    for i in range(min(t1cnt, 12)):
        o = t1off + i*16
        a,b2,c,d = struct.unpack_from('<4I', b, o)
        name = ''
        for cand in (a, c):
            if cand < len(b):
                e = b.find(b'\0', cand, cand+80)
                if e > cand:
                    try:
                        s = b[cand:e].decode('gbk')
                    except Exception:
                        s = repr(b[cand:e])
                    if all(32 <= ord(ch) or ch in '\r\n\t' for ch in s) and len(s) >= 1:
                        name = s
                        break
        print("  [%3d] %08X: %08X %08X %08X %08X  name=%r" % (i, o, a, b2, c, d, name))
    # reloc table
    print("--- table2 first 40 ---")
    vals = struct.unpack_from('<%dI' % t2cnt, b, t2off)
    print("  ", [hex(v) for v in vals[:40]])
    inrange = sum(1 for v in vals if code <= v < end)
    print("  in code range: %d/%d" % (inrange, len(vals)))
    return b, (code, t1off, t1cnt, t2off, t2cnt, x79, end)

for fn in [r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO']:
    rd(fn)
