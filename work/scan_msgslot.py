# scan .text for call [reg+0x4c] and writes to [reg+0x4c]
import pefile, capstone, sys, re
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
sec = pe.sections[0]
tva, tvsize, tptr, tsize = sec.VirtualAddress, sec.Misc_VirtualSize, sec.PointerToRawData, sec.SizeOfRawData
tstart = IB + tva
tend = tstart + tvsize
code = data[tptr:tptr+tsize]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True
calls = []
writes = []
for ins in md.disasm(code, tstart):
    if len(ins.operands) >= 1 and ins.operands[0].type == capstone.x86.X86_OP_MEM:
        m = ins.operands[0].mem
        if m.base != 0 and m.index == 0 and m.disp == 0x4c:
            writes.append((ins.address, ins.mnemonic, ins.op_str, ins.bytes.hex()))
    if ins.mnemonic == 'call' and len(ins.operands) == 1 and ins.operands[0].type == capstone.x86.X86_OP_MEM:
        m = ins.operands[0].mem
        if m.base != 0 and m.index == 0 and m.disp == 0x4c:
            calls.append((ins.address, ins.op_str))
print("=== call [reg+0x4c] : %d ===" % len(calls))
for a, s in calls: print("%08X  %s" % (a, s))
print()
print("=== mem ops with disp 0x4c as operand0: %d ===" % len(writes))
for a, mn, ops, b in writes: print("%08X  %-6s %-40s %s" % (a, mn, ops, b))
