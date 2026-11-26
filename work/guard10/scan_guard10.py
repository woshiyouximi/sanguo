# 扫 Sango2.exe：谁在读 army+0x84 的 0x10 位（保護主將）
# 用法：python scan_guard10.py
import pefile, capstone, struct

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
base = 0x400000 + text.VirtualAddress
buf = text.get_data()
print('text', hex(base), len(buf))

# F6 /0 ib : test r/m8, imm8   (modrm = 0x80..0x87 + disp32 + imm8)
pats = []
for rm in range(8):
    pats.append(bytes([0xF6, 0x80 | rm]) + struct.pack('<I', 0x84) + bytes([0x10]))
    # F7 /0 id : test r/m32, imm32
    pats.append(bytes([0xF7, 0x80 | rm]) + struct.pack('<I', 0x84) + struct.pack('<I', 0x10))
# 80 /4 ib and [reg+0x84], imm8 ; 81 /4 id
for rm in range(8):
    pats.append(bytes([0x80, 0xA0 | rm]) + struct.pack('<I', 0x84) + bytes([0x10]))
    pats.append(bytes([0x81, 0xA0 | rm]) + struct.pack('<I', 0x84) + struct.pack('<I', 0x10))

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
hits = []
for pat in pats:
    i = 0
    while True:
        i = buf.find(pat, i)
        if i < 0:
            break
        hits.append(i)
        i += 1
hits = sorted(set(hits))
print('hits', len(hits))
for off in hits:
    va = base + off
    print('\n=== %08X ===' % va)
    start = max(0, off - 24)
    code = buf[start:off + 40]
    for ins in md.disasm(code, base + start):
        mark = '>>' if ins.address == va else '  '
        print('%s %08X  %-24s %s %s' % (mark, ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
