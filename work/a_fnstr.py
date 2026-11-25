# -*- coding: utf-8 -*-
"""For a function start VA, print its length, its string literals, and any PlayMusic(track) pushes."""
import sys, glob, re
import capstone, pefile

EXE = glob.glob(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\*\Sango2.exe')[0]
raw = open(EXE, 'rb').read()
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
secs = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]

strs = {}
for ln in open(r'F:\sanguo\work\strings_va.tsv', encoding='utf-8'):
    p = ln.rstrip('\n').split('\t')
    if len(p) >= 3:
        try:
            strs[int(p[0], 16)] = p[2]
        except ValueError:
            pass

def va2off(va):
    r = va - IB
    for v, vs, p, rs in secs:
        if v <= r < v + max(vs, rs):
            return p + (r - v)
    return None

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
for a in sys.argv[1:]:
    va = int(a, 16)
    off = va2off(va)
    print('=== 0x%X' % va)
    ins = list(md.disasm(raw[off:off + 3000], va))
    tracks = []
    seen = set()
    for i, k in enumerate(ins):
        s = k.op_str
        m = re.search(r'0x([0-9a-fA-F]{6,8})', s)
        v = None
        if m:
            v = int(m.group(1), 16)
        if v in strs and v not in seen:
            t = strs[v].strip()
            if re.search(r'[A-Za-z\u4e00-\u9fff]{3,}', t):
                seen.add(v)
                print('   str 0x%X  %r' % (v, t[:70]))
        if k.mnemonic == 'call' and '0x46cda0' in s:
            # look back for push imm
            for j in range(i - 1, max(0, i - 5), -1):
                if ins[j].mnemonic == 'push' and re.match(r'^0x[0-9a-f]+$', ins[j].op_str):
                    tracks.append((k.address, int(ins[j].op_str, 16)))
                    break
                if ins[j].mnemonic in ('call', 'mov', 'lea', 'add'):
                    tracks.append((k.address, None))
                    break
    print('   PlayMusic(track):', tracks)
