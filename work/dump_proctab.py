# dump the Process->handler table at 0x4C09E0 (128 dwords)
import pefile, struct
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(IB+s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]
def va2off(va):
    for v, vs, p, rs in SEC:
        if v <= va < v + max(vs, rs):
            return p + (va - v)
    return None
# load funcmap3 for names
fm = {}
for line in open(r"F:\sanguo\work\funcmap3.tsv", encoding="utf-8", errors="ignore"):
    parts = line.rstrip("\n").split("\t")
    if len(parts) >= 3:
        try: fm[int(parts[0], 16)] = (int(parts[1]) if parts[1].isdigit() else 0, parts[2])
        except: pass
base = 0x4C09E0
off = va2off(base)
print("table file off = 0x%X" % off)
for i in range(128):
    v = struct.unpack_from("<I", data, off + i*4)[0]
    if v == 0x422847:
        continue
    nm = fm.get(v, ("?", ""))
    print("Process %3d -> 0x%08X   size=%-5s %s" % (i, v, nm[0], nm[1][:60]))
