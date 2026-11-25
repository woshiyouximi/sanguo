"""Broad scan (any base/index) for accesses at 0x9F/0xA1/0xA3/0xA5 (general) and 0xC7/0xC9 (save rec),
plus full disassembly of the record counter 0x4084C9."""
import pefile, capstone

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend, tva = text[2], text[2] + text[3], IB + text[0]
tb = data[tstart:tend]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True

def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None

print("=== function 0x4084C9 (戦績 counter) ===")
off = va2off(0x4084C9)
for ins in md.disasm(data[off:off + 0xC0], 0x4084C9):
    print("%08X  %-7s %s" % (ins.address, ins.mnemonic, ins.op_str))
    if ins.mnemonic == 'ret':
        break

print("\n=== broad mem-disp scan for 0xC7/0xC9 ===")
for ins in md.disasm(tb, tva):
    if not ins.operands:
        continue
    o0 = ins.operands[0]
    if o0.type != capstone.x86.X86_OP_MEM:
        continue
    d = o0.mem.disp
    if d in (0xc7, 0xc9) and ins.mnemonic.startswith('mov'):
        print("%08X  %-6s %-34s  %s" % (ins.address, ins.mnemonic, ins.op_str, ins.bytes.hex()))
