import pefile, re
exe = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
data = open(exe,'rb').read(); pe = pefile.PE(exe); BASE=0x400000
def off2va(off):
    for s in pe.sections:
        va0=BASE+s.VirtualAddress
        if s.PointerToRawData <= off < s.PointerToRawData + s.SizeOfRawData:
            return va0 + (off - s.PointerToRawData)
for kw in ('功勳','功績','功勋'):
    b = kw.encode('cp950')
    i = 0; hits=[]
    while True:
        j = data.find(b, i)
        if j < 0: break
        hits.append(off2va(j)); i = j+1
    print(kw, [hex(h) for h in hits][:10])
