import pefile, capstone, sys, struct
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
S = pe.sections[0]
code = data[S.PointerToRawData:S.PointerToRawData+S.SizeOfRawData]
tstart = IB + S.VirtualAddress
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail = True
def cstr(va, maxn=100):
    # find section
    for s in pe.sections:
        lo = IB+s.VirtualAddress; hi = lo+max(s.Misc_VirtualSize, s.SizeOfRawData)
        if lo <= va < hi:
            off = s.PointerToRawData + (va-lo)
            e = data.find(b"\0", off, off+maxn)
            if e > off+2:
                try: return data[off:e].decode('gbk')
                except Exception: return None
    return None
targets = [int(x,16) for x in sys.argv[1:]]
for ins in md.disasm(code, tstart):
    hit = False
    for op in ins.operands:
        v = None
        if op.type == capstone.x86.X86_OP_IMM: v = op.imm & 0xffffffff
        elif op.type == capstone.x86.X86_OP_MEM: v = op.mem.disp & 0xffffffff
        if v in targets:
            hit = True
    if hit:
        note = ""
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                s = cstr(op.imm)
                if s: note += '   ; "%s"' % s
        print("%08X  %-7s %-42s%s" % (ins.address, ins.mnemonic, ins.op_str, note))
