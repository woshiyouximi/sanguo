import pefile, struct, sys

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase

def rd(va, n):
    rva = va - base
    return pe.get_data(rva, n)

start = int(sys.argv[1], 16)
end = int(sys.argv[2], 16)
off = start
while off < end:
    chunk = rd(off, 16)
    vals = struct.unpack("<4I", chunk)
    print("0x%08X: %s" % (off, "  ".join("%08X" % v for v in vals)))
    off += 16
