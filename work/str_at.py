import struct
p = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
d = open(p,'rb').read()
base = 0x400000
# .rdata VA 0x7F000 -> raw 0x7F000-0x1000+0x400? need section map
import pefile
pe = pefile.PE(p, fast_load=True)
def va2off(va):
    for s in pe.sections:
        if s.VirtualAddress + base <= va < s.VirtualAddress + base + max(s.Misc_VirtualSize, s.SizeOfRawData):
            return s.PointerToRawData + (va - base - s.VirtualAddress)
    return None
for va in (0x488C88, 0x488C9C, 0x488CB0, 0x488CC4, 0x488CD8):
    off = va2off(va)
    s = d[off:off+80].split(b'\x00')[0]
    for enc in ('cp950','gbk'):
        try:
            print(hex(va), enc, s.decode(enc))
            break
        except Exception:
            pass
