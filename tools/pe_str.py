# -*- coding: utf-8 -*-
"""Print strings at VA(s) using real PE section mapping.
usage: pe_str.py 0x491AD8 [0x...] [--n 64]
"""
import sys, struct

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
_d = open(EXE, 'rb').read()
_lfanew = struct.unpack_from('<I', _d, 0x3C)[0]
_nsec = struct.unpack_from('<H', _d, _lfanew + 6)[0]
_optsz = struct.unpack_from('<H', _d, _lfanew + 20)[0]
_base = struct.unpack_from('<I', _d, _lfanew + 24 + 28)[0]
_secs = []
for i in range(_nsec):
    o = _lfanew + 24 + _optsz + i * 40
    name = _d[o:o + 8].rstrip(b'\x00').decode('latin1')
    vs, va, rs, rp = struct.unpack_from('<IIII', _d, o + 8)
    _secs.append((name, va, max(vs, rs), rp))


def va2off(va):
    rva = va - _base
    for name, sva, ssz, rp in _secs:
        if sva <= rva < sva + ssz:
            return rp + (rva - sva)
    return None


def cstr(va, n=64):
    off = va2off(va)
    if off is None:
        return None
    b = _d[off:off + n].split(b'\x00')[0]
    try:
        return b.decode('cp950')
    except Exception:
        try:
            return b.decode('gbk')
        except Exception:
            return b.decode('latin1')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    n = 64
    if '--n' in sys.argv:
        n = int(sys.argv[sys.argv.index('--n') + 1])
    for a in args:
        va = int(a, 16)
        off = va2off(va)
        print('VA %08X off=%s %r' % (va, hex(off) if off else '?', cstr(va, n)))
