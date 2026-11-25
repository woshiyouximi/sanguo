import pefile, capstone, struct, re
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend, tva = text[2], text[2] + text[3], IB + text[0]
tb = data[tstart:tend]
pat = struct.pack("<I", 0x491E10)
occ = [m.start() for m in re.finditer(re.escape(pat), tb)]
print("occurrences of 0x491E10 in .text:", len(occ), ["%X" % (tva + o) for o in occ][:10])
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True
for o in occ[:3]:
    print("hit at off %X va %X" % (o, tva + o))
    for k in range(1, 16):
        st = o - k
        ins_list = list(md.disasm(tb[st:st + 16], tva + st))
        if not ins_list:
            print("   k=%d no ins" % k); continue
        ins = ins_list[0]
        print("   k=%d  %X %s %s size=%d end=%X" % (k, ins.address, ins.mnemonic, ins.op_str, ins.size, ins.address + ins.size))
        if ins.address + ins.size == tva + o:
            print("      -> ENDS AT HIT; ops:", [(op.type, hex(op.imm) if op.type == 2 else None) for op in ins.operands])
            break
