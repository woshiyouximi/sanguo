import pefile, struct
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
secs = []
for s in pe.sections:
    secs.append((IB+s.VirtualAddress, IB+s.VirtualAddress+s.SizeOfRawData, s.PointerToRawData, s.Name.decode().rstrip('\0')))
TEXT_LO, TEXT_HI = 0x401000, 0x401000+0x7D38E
def va2off(va):
    for lo,hi,ptr,name in secs:
        if lo <= va < hi: return ptr + (va-lo)
    return None
def scan(va_lo, va_hi, name):
    off = va2off(va_lo)
    n = va_hi - va_lo
    buf = data[off:off+n]
    run = 0; start = None
    for i in range(0, len(buf)-3, 4):
        v = struct.unpack_from('<I', buf, i)[0]
        if TEXT_LO <= v < TEXT_HI:
            if run == 0: start = va_lo+i
            run += 1
        else:
            if run >= 8:
                print("%s array @%08X len=%d" % (name, start, run))
                for k in range(run):
                    print("    [%02X] %08X" % (k, struct.unpack_from('<I', buf, start-va_lo+4*k)[0]))
            run = 0
    if run >= 8:
        print("%s array @%08X len=%d (tail)" % (name, start, run))
        for k in range(run):
            print("    [%02X] %08X" % (k, struct.unpack_from('<I', buf, start-va_lo+4*k)[0]))
scan(0x47F000, 0x480000, ".rdata")
scan(0x481000, 0x4A6200, ".data")
