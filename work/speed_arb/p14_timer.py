# p14_timer.py -- 找 timeSetEvent / timeGetTime / GetTickCount 的调用点，打印前 24 条指令
import sys, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
BASE = 0x400000
IAT = {'timeSetEvent': 0x8D45AC, 'timeGetTime': 0x8D4584, 'GetTickCount': 0x8D43E0,
       'timeKillEvent': 0x8D4590}


def main():
    pe = pefile.PE(EXE, fast_load=True)
    secs = [(s.VirtualAddress, s.Misc_VirtualSize, s.SizeOfRawData, s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.skipdata = True
    for name, iat in IAT.items():
        pat = bytes([0xFF, 0x15]) + iat.to_bytes(4, 'little')
        print('==== %s  IAT=0x%08X  pattern=%s' % (name, iat, pat.hex()))
        found = 0
        for (va, vsz, rsz, nm) in secs:
            if nm not in ('.text', 'CODE'):
                continue
            data = pe.get_data(va, min(vsz, rsz))
            pos = data.find(pat)
            while pos >= 0:
                found += 1
                callva = BASE + va + pos
                # 反汇编从 callva-70 开始
                start = max(0, pos - 70)
                ins = list(md.disasm(data[start:pos + 6], BASE + va + start))
                print('  -- call site 0x%08X (%d bytes before)' % (callva, 70))
                for i in ins[-26:]:
                    print('     0x%08X  %-24s %s' % (i.address, i.bytes.hex(), i.mnemonic + ' ' + i.op_str))
                print()
                pos = data.find(pat, pos + 1)
        if not found:
            print('   (none)\n')

main()
