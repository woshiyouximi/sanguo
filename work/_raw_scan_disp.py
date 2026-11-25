"""Raw byte scan in .text for disp32 = 0x000000C7 / 0x000000C9 / 0x0000009F / 0x000000A1 accesses,
printing the surrounding bytes so the save-writer's per-field copies can be identified."""
import pefile, re, capstone

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend, tva = text[2], text[2] + text[3], IB + text[0]
tb = data[tstart:tend]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

for disp in (0xC7, 0xC9, 0x9F, 0xA1):
    pat = disp.to_bytes(4, "little")
    print("=== disp32 0x%X ===" % disp)
    for m in re.finditer(re.escape(pat), tb):
        o = m.start()
        start = o - 3
        if start < 0:
            continue
        chunk = tb[start:o + 4]
        for ins in md.disasm(chunk, tva + start):
            if ins.address + ins.size == tva + o + 4:
                print("  %08X  %-7s %-32s  %s" % (ins.address, ins.mnemonic, ins.op_str, ins.bytes.hex()))
            break
