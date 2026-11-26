# 扫 SIB / bt 形式的 army+0x84 0x10 检查
import pefile, capstone, struct
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
base = 0x400000 + text.VirtualAddress
buf = text.get_data()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
disp = struct.pack('<I', 0x84)
pats = []
# test byte/dword via SIB
for rm in (4,):
    for sib in range(256):
        pats.append(bytes([0xF6, 0x80 | rm, sib]) + disp + b'\x10')
        pats.append(bytes([0xF7, 0x80 | rm, sib]) + disp + struct.pack('<I', 0x10))
        pats.append(bytes([0x80, 0x88 | rm, sib]) + disp + b'\x10')
        pats.append(bytes([0x80, 0xA0 | rm, sib]) + disp + b'\x10')
        pats.append(bytes([0x81, 0x88 | rm, sib]) + disp + struct.pack('<I', 0x10))
        pats.append(bytes([0x81, 0xA0 | rm, sib]) + disp + struct.pack('<I', 0x10))
# bt dword ptr [reg+0x84], 4
for rm in range(8):
    pats.append(bytes([0x0F, 0xBA, 0xA0 | rm]) + disp + b'\x04')
    for sib in range(256):
        pats.append(bytes([0x0F, 0xBA, 0xA0 | 4, sib]) + disp + b'\x04')
hits = []
for pat in pats:
    i = 0
    while True:
        i = buf.find(pat, i)
        if i < 0: break
        hits.append(i); i += 1
hits = sorted(set(hits))
print('sib/bt hits', len(hits))
for off in hits:
    va = base + off
    print('\n=== %08X ===' % va)
    start = max(0, off - 12)
    for ins in list(md.disasm(buf[start:off + 24], base + start))[:12]:
        print(('>>' if ins.address == va else '  '), '%08X' % ins.address, ins.mnemonic, ins.op_str)
