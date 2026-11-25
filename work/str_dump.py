import struct
exe = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
data = open(exe, 'rb').read()
BASE = 0x400000
# .rdata VA 0x7F000 raw 0x7F000? use pefile
import pefile
pe = pefile.PE(exe)
def va2off(va):
    for s in pe.sections:
        va0 = BASE + s.VirtualAddress
        if va0 <= va < va0 + max(s.Misc_VirtualSize, s.SizeOfRawData):
            return s.PointerToRawData + (va - va0)
    return None
for va in (0x48B568, 0x48B574, 0x48B580, 0x48B58C, 0x48B598, 0x48B5A4, 0x48B5B0):
    off = va2off(va)
    s = data[off:off+40].split(b'\x00')[0]
    print(hex(va), s.decode('cp950', 'replace'))
