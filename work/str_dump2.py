import pefile
exe = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
data = open(exe,'rb').read(); pe = pefile.PE(exe); BASE=0x400000
def va2off(va):
    for s in pe.sections:
        va0 = BASE + s.VirtualAddress
        if va0 <= va < va0 + max(s.Misc_VirtualSize, s.SizeOfRawData):
            return s.PointerToRawData + (va - va0)
for va in (0x48b53c,0x48b550,0x48b55c,0x48b5c0,0x48b5d0,0x48b5e0,0x48b5f0):
    o = va2off(va); s = data[o:o+48].split(b'\x00')[0]
    print(hex(va), repr(s.decode('cp950','replace')))
