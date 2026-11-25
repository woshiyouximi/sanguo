import pefile, capstone, sys
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
S = pe.sections[0]
code = data[S.PointerToRawData:S.PointerToRawData+S.SizeOfRawData]
tstart = IB + S.VirtualAddress
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail = True
lo = int(sys.argv[1],16) if len(sys.argv)>1 else 0x10000
hi = int(sys.argv[2],16) if len(sys.argv)>2 else 0x10010
prev = {}
for ins in md.disasm(code, tstart):
    for op in ins.operands:
        if op.type == capstone.x86.X86_OP_IMM and lo <= op.imm <= hi:
            print("%08X  %-7s %s" % (ins.address, ins.mnemonic, ins.op_str)); break
