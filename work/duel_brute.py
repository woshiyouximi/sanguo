import pefile, struct, sys

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
targets = set()
for a in sys.argv[1:]:
    targets.add(int(a, 16))

for s in pe.sections:
    data = s.get_data()
    va = base + s.VirtualAddress
    # E8/E9 rel32
    for i in range(len(data) - 5):
        if data[i] in (0xE8, 0xE9):
            rel = struct.unpack_from("<i", data, i + 1)[0]
            tgt = va + i + 5 + rel
            if tgt in targets:
                print("call/jmp %s @0x%08X -> 0x%08X (sec %s)" % ("E8" if data[i] == 0xE8 else "E9", va + i, tgt, s.Name.decode(errors="replace")))
    # absolute dwords
    for i in range(0, len(data) - 4):
        v = struct.unpack_from("<I", data, i)[0]
        if v in targets:
            print("dword @0x%08X -> 0x%08X (sec %s)" % (va + i, v, s.Name.decode(errors="replace")))
    # 16-bit offsets relative to section (borland style) - just report if value near target-section offset
print("done")
