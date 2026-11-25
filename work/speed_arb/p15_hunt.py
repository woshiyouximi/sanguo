# p15_hunt.py -- 在整个文件里搜 4 字节 IAT 地址（小端）出现处，打印上下文反汇编
import sys, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
BASE = 0x400000
IAT = {'timeSetEvent': 0x4D45AC, 'timeGetTime': 0x4D4584, 'GetTickCount': 0x4D43E0,
       'timeKillEvent': 0x4D4590, 'Sleep': None}


def rva2off(pe, rva):
    for s in pe.sections:
        if s.VirtualAddress <= rva < s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData):
            return s.PointerToRawData + (rva - s.VirtualAddress)
    return None


def off2va(pe, off):
    for s in pe.sections:
        if s.PointerToRawData <= off < s.PointerToRawData + s.SizeOfRawData:
            return BASE + s.VirtualAddress + (off - s.PointerToRawData)
    return None


def main():
    pe = pefile.PE(EXE, fast_load=True)
    raw = open(EXE, 'rb').read()
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.skipdata = True
    for name, iat in IAT.items():
        if iat is None:
            continue
        pat = iat.to_bytes(4, 'little')
        print('==== %s @0x%08X  bytes=%s' % (name, iat, pat.hex()))
        pos = raw.find(pat)
        n = 0
        while pos >= 0 and n < 12:
            va = off2va(pe, pos)
            if va:
                n += 1
                start = max(0, pos - 24)
                ins = list(md.disasm(raw[start:pos + 8], off2va(pe, start)))
                print('  -- ref at file 0x%X  va %s' % (pos, ('0x%08X' % va) if va else '?'))
                for i in ins[-9:]:
                    print('     0x%08X  %-20s %s' % (i.address, i.bytes.hex(), i.mnemonic + ' ' + i.op_str))
                print()
            pos = raw.find(pat, pos + 1)
        if n == 0:
            print('  (no occurrences)\n')

main()
