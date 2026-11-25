import pefile, capstone, struct
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
S = pe.sections[0]
tva, tvsize, tptr, tsize = S.VirtualAddress, S.Misc_VirtualSize, S.PointerToRawData, S.SizeOfRawData
tstart = IB + tva
tend = tstart + tvsize
code = data[tptr:tptr+tsize]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail=True
insns = {i.address: i for i in md.disasm(code, tstart)}
addrs = sorted(insns)
TARGET = 0x422BD0
for a in addrs:
    i = insns[a]
    if i.mnemonic == 'call':
        ops = i.operands
        tgt = None
        if ops and ops[0].type == capstone.x86.X86_OP_IMM:
            tgt = ops[0].imm
        if tgt != TARGET:
            continue
        # walk back up to 6 insns
        idx = addrs.index(a)
        back = [insns[addrs[j]] for j in range(max(0, idx-6), idx)]
        print("call at %08X" % a)
        for b in back: print("    %08X  %-6s %s" % (b.address, b.mnemonic, b.op_str))
