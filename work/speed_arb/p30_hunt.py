import sys, struct, pefile
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, 'rb').read()
secs = []
for s in pe.sections:
    nm = s.Name.rstrip(b'\x00').decode('latin1')
    secs.append((nm, IB + s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData))

def va2off(va):
    for nm, b, vs, p, rs in secs:
        if b <= va < b + max(vs, rs):
            return p + (va - b)
    return None
def off2va(off):
    for nm, b, vs, p, rs in secs:
        if p <= off < p + rs:
            return b + (off - p)
    return None

targets = [int(x, 16) for x in sys.argv[1:]]
for t in targets:
    pat = struct.pack('<I', t)
    hits = []
    i = 0
    while True:
        j = data.find(pat, i)
        if j < 0:
            break
        hits.append(off2va(j))
        i = j + 1
    print('=== target VA %08X : %d hits' % (t, len(hits)))
    for h in hits[:40]:
        print('   at VA %08X' % h)
