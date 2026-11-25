# p12_xref.py -- 全 .text 扫描 call rel32 / jmp rel32，列出指向给定 VA 的所有调用点
# 用法: p12_xref.py 0x43E964 0x43D125 0x43B574 ...
import sys, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'

def main():
    targets = [int(a, 0) for a in sys.argv[1:]]
    pe = pefile.PE(EXE, fast_load=True)
    base = pe.OPTIONAL_HEADER.ImageBase
    secs = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
    texts = [t for t in secs if t[4] in ('.text', 'CODE')]
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.detail = False
    md.skipdata = True
    hits = {t: [] for t in targets}
    for (va, vsz, raw, rsz, nm) in texts:
        data = pe.get_data(va, min(vsz, rsz))
        start = base + va
        n = 0
        for ins in md.disasm(data, start):
            n += 1
            if ins.mnemonic in ('call', 'jmp') and ins.op_str.startswith('0x'):
                try:
                    tgt = int(ins.op_str, 16)
                except ValueError:
                    continue
                if tgt in hits:
                    hits[tgt].append((ins.address, ins.mnemonic, ins.bytes.hex()))
    for t in targets:
        print('=== callers of 0x%X : %d' % (t, len(hits[t])))
        for (a, m, b) in hits[t]:
            print('   0x%X  %-4s %s' % (a, m, b))
        print()
    print('decoded insns:', n, 'sections:', texts)

main()
