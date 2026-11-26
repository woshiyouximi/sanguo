# 列出所有 [reg+0x84] 读取点及后续 20 条指令，人工找 0x10
import pefile, capstone, struct
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
base = 0x400000 + text.VirtualAddress
buf = text.get_data()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
disp = struct.pack('<I', 0x84)
cands = []
for rm in range(8):
    for pat in (bytes([0x8A, 0x80 | rm]) + disp, bytes([0x8B, 0x80 | rm]) + disp,
                bytes([0x0F, 0xB6, 0x80 | rm]) + disp):
        i = 0
        while True:
            i = buf.find(pat, i)
            if i < 0: break
            cands.append(i); i += 1
cands = sorted(set(cands))
print('total', len(cands))
out = []
for off in cands:
    insns = list(md.disasm(buf[off:off + 80], base + off))[:22]
    lines = ['%08X  %-20s %s %s' % (x.address, x.bytes.hex(), x.mnemonic, x.op_str) for x in insns]
    txt = '\n'.join(lines)
    tag = '***' if ('0x10' in txt and '0x100' not in txt.replace('0x10', '', 1)) else '   '
    out.append('%s @ %08X\n%s\n' % (tag, base + off, txt))
open(r'F:\sanguo\work\guard10\loads_84.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('written loads_84.txt')
