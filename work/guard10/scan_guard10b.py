# 扫 Sango2.exe：army+0x84 的 0x10 位 读/写 点（保護主將）
# 1) 直接 or/test/and [reg+0x84], 0x10
# 2) mov reg,[reg+0x84] 后 12 条内出现 0x10 的 test/and
import pefile, capstone, struct

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
base = 0x400000 + text.VirtualAddress
buf = text.get_data()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
disp = struct.pack('<I', 0x84)

direct = []
for rm in range(8):
    modrm = 0x80 | rm
    direct.append(('test8',  bytes([0xF6, modrm]) + disp + b'\x10'))
    direct.append(('test32', bytes([0xF7, modrm]) + disp + struct.pack('<I', 0x10)))
    direct.append(('or8',    bytes([0x80, 0x88 | rm]) + disp + b'\x10'))
    direct.append(('or32',   bytes([0x81, 0x88 | rm]) + disp + struct.pack('<I', 0x10)))
    direct.append(('and8',   bytes([0x80, 0xA0 | rm]) + disp + b'\x10'))
    direct.append(('and32',  bytes([0x81, 0xA0 | rm]) + disp + struct.pack('<I', 0x10)))

hits = []
for kind, pat in direct:
    i = 0
    while True:
        i = buf.find(pat, i)
        if i < 0: break
        hits.append((i, kind)); i += 1
hits = sorted(set(hits))
print('direct hits', len(hits))
for off, kind in hits:
    va = base + off
    print('\n=== %s @ %08X ===' % (kind, va))
    start = max(0, off - 16)
    for ins in md.disasm(buf[start:off + 32], base + start):
        print(('>>' if ins.address == va else '  '), '%08X' % ins.address, ins.mnemonic, ins.op_str)

# 间接：mov r8/r32, [reg+0x84]
cands = []
for rm in range(8):
    for op in (0x8A, 0x8B, 0x0F):
        if op == 0x0F:
            pat = bytes([0x0F, 0xB6, 0x80 | rm]) + disp
        else:
            pat = bytes([op, 0x80 | rm]) + disp
        i = 0
        while True:
            i = buf.find(pat, i)
            if i < 0: break
            cands.append(i); i += 1
cands = sorted(set(cands))
print('\n[reg+0x84] loads', len(cands))
for off in cands:
    code = buf[off:off + 64]
    insns = list(md.disasm(code, base + off))
    window = insns[:14]
    txt = ' ; '.join('%s %s' % (x.mnemonic, x.op_str) for x in window)
    if '0x10' in txt.replace('0x100', '') and ('test' in txt or 'and' in txt):
        print('\n--- %08X ---' % (base + off))
        for x in window:
            print('   %08X %-24s %s' % (x.address, x.bytes.hex(), x.mnemonic + ' ' + x.op_str))
