import pefile, capstone
pe = pefile.PE(r"F:\sanguo\work\units_per_side\Sango2.exe", fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.rstrip(b"\x00") == b".text")
data = text.get_data()
def off(va): return va - (base + text.VirtualAddress)
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
def dump(va, n, out):
    code = data[off(va):off(va)+n]
    with open(out, "w", encoding="utf-8") as f:
        for ins in md.disasm(code, va):
            f.write(f"{ins.address:08X}  {ins.mnemonic:<7} {ins.op_str}\n")
dump(0x40D52F, 0x300, r"F:\sanguo\work\ai_exec.txt")
dump(0x40CAF1, 0x260, r"F:\sanguo\work\ai_plan.txt")
print("ok")
