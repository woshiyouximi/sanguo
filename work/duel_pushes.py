import pefile, capstone, re, sys

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

calls = []
for line in sys.stdin:
    m = re.search(r"@VA=([0-9A-F]{8})", line)
    if m:
        calls.append((int(m.group(1), 16), line.strip().split()[0]))

for va, fn in calls:
    best = None
    for back in range(40, 3, -1):
        start = va - back
        ins = list(md.disasm(pe.get_data(start - base, back + 5), start))
        if not ins:
            continue
        if ins[-1].address != va:
            continue
        chain = [(i.mnemonic, i.op_str) for i in ins if i.address < va]
        # require all to be push imm or mov
        if all(c[0] == 'push' for c in chain):
            best = chain
            break
    if best:
        vals = [c[1] for c in best]
        print("0x%08X  %-8s  %s" % (va, fn, " ; ".join(vals)))
    else:
        print("0x%08X  %-8s  ?" % (va, fn))
