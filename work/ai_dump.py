import pefile, capstone, io
pe = pefile.PE(r"F:\sanguo\work\units_per_side\Sango2.exe", fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
text = None
for s in pe.sections:
    if s.Name.rstrip(b"\x00") == b".text":
        text = s
        break
data = text.get_data()
def off(va): return va - (base + text.VirtualAddress)
def dump(va, n, out):
    code = data[off(va):off(va)+n]
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    with open(out, "w", encoding="utf-8") as f:
        for ins in md.disasm(code, va):
            f.write(f"{ins.address:08X}  {ins.mnemonic:<7} {ins.op_str}\n")
dump(0x40D400, 0x600, r"F:\sanguo\work\ai_dispatch.txt")
dump(0x40C900, 0x380, r"F:\sanguo\work\ai_plan_tail.txt")
print("ok")
