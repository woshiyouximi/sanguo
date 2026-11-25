"""Linear-sweep scan for word-size accesses to general/save-record offsets of interest:
reads/writes of [reg+0x9F], [reg+0xA1], [reg+0xA3], [reg+0xA5] and writes to [reg+0xC7], [reg+0xC9]."""
import pefile, capstone

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
WANT = {0x9f, 0xa1, 0xa3, 0xa5, 0xc7, 0xc9}
hits = []
for ins in md.disasm(tb, tva):
    if len(ins.operands) < 1:
        continue
    o0 = ins.operands[0]
    if o0.type != capstone.x86.X86_OP_MEM:
        continue
    d = o0.mem.disp
    if d in WANT and o0.mem.index == 0:
        hits.append((ins.address, d, ins.mnemonic, ins.op_str, ins.bytes.hex()))

print("total hits:", len(hits))
for a, d, m, s, by in hits:
    print("%08X  +0x%02X  %-6s %-30s  %s" % (a, d, m, s, by))
