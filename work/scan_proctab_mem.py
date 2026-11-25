import pefile, capstone
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
S = pe.sections[0]
code = data[S.PointerToRawData:S.PointerToRawData+S.SizeOfRawData]
tstart = IB + S.VirtualAddress
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail=True
LO, HI = 0x4C09E0, 0x4C09E0+0x200
for ins in md.disasm(code, tstart):
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_MEM and LO <= (op.mem.disp & 0xffffffff) < HI:
            print("%08X  %-7s %s" % (ins.address, ins.mnemonic, ins.op_str)); break
