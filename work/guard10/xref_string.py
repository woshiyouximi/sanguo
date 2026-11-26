# 找 0x490408（"保護主將" 串）的 xref，看按钮执行体到底写了什么
import pefile, capstone, struct
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
text = next(s for s in pe.sections if s.Name.startswith(b'.text'))
base = 0x400000 + text.VirtualAddress
buf = text.get_data()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
for target in (0x490408, 0x4903F0):
    pat = b'\x68' + struct.pack('<I', target)
    i = 0
    print('\n#### string %08X' % target)
    while True:
        i = buf.find(pat, i)
        if i < 0: break
        va = base + i
        print('\n--- push @ %08X ---' % va)
        start = max(0, i - 40)
        for ins in list(md.disasm(buf[start:i + 90], base + start))[:34]:
            print(('>>' if ins.address == va else '  '), '%08X' % ins.address, '%-22s' % ins.bytes.hex(), ins.mnemonic, ins.op_str)
        i += 1
