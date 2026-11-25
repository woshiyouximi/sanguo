import pefile, capstone
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False); data = open(EXE, "rb").read(); IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize): return ptr + (rva - vaddr)
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail = True
def show(a0, a1, title):
    print("=== %s  %X..%X ===" % (title, a0, a1))
    off = va2off(a0)
    for ins in md.disasm(data[off:off + (a1 - a0)], a0):
        print("%08X  %-7s %s" % (ins.address, ins.mnemonic, ins.op_str))
show(0x431A40, 0x431AD0, "A: gen+0x9F read site")
show(0x433470, 0x4334D0, "B: gen+0x9F store site")
show(0x4335F0, 0x433670, "C: rec+0xC7/0xC9 store site")
show(0x431BF0, 0x431C50, "D: rec+0xC7/0xC9 read site")
