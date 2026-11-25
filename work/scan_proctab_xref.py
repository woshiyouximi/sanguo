import pefile, capstone
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
S = pe.sections[0]
tva, tvsize, tptr, tsize = S.VirtualAddress, S.Misc_VirtualSize, S.PointerToRawData, S.SizeOfRawData
tstart = IB + tva
code = data[tptr:tptr+tsize]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail=True
LO, HI = 0x4C09E0, 0x4C09E0+512
hits=[]
for ins in md.disasm(code, tstart):
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_IMM and LO <= (op.imm & 0xffffffff) < HI:
            hits.append((ins.address, ins.mnemonic, ins.op_str)); break
        if op.type == capstone.x86.X86_OP_MEM and op.mem.disp and LO <= (op.mem.disp & 0xffffffff) < HI and op.mem.index:
            hits.append((ins.address, ins.mnemonic, ins.op_str)); break
for a,m,o in hits: print("%08X  %-6s %s" % (a,m,o))
print("total", len(hits))
