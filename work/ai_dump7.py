import pefile, capstone
pe = pefile.PE(r"F:\sanguo\work\units_per_side\Sango2.exe", fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.rstrip(b"\x00") == b".text")
data = text.get_data()
def off(va): return va - (base + text.VirtualAddress)
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
code = data[off(0x411F83):off(0x411F83)+0x140]
with open(r"F:\sanguo\work\ai_spawn3.txt","w",encoding="utf-8") as f:
    for ins in md.disasm(code, 0x411F83):
        f.write(f"{ins.address:08X}  {ins.mnemonic:<7} {ins.op_str}\n")
print("ok")
