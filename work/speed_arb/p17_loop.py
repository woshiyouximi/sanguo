# p17_loop.py -- 找主循环的定帧钩子：getTicks 包装(0x450410) 的调用点、Sleep 的调用点、WaitForVerticalBlank 等
import sys, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
BASE = 0x400000
pe = pefile.PE(EXE, fast_load=True)
pe.parse_data_directories()
raw = open(EXE, 'rb').read()

sect = {}
for s in pe.sections:
    n = s.Name.rstrip(b'\x00').decode('latin1')
    sect[n] = (s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)

# 收集所有 import IAT VA
imports = {}
for d in pe.DIRECTORY_ENTRY_IMPORT:
    dll = d.dll.decode('latin1')
    for imp in d.imports:
        nm = (imp.name or b'').decode('latin1')
        if nm:
            imports[BASE + imp.address] = dll + '!' + nm

print('interesting imports:')
for va, nm in sorted(imports.items()):
    if any(w in nm.lower() for w in ('sleep', 'vertical', 'gettick', 'timeget', 'wait')):
        print('   0x%08X  %s' % (va, nm))

va0, vsz, ptr, rsz = sect['.text']
code = raw[ptr:ptr + rsz]

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.skipdata = True
ins = list(md.disasm(code, BASE + va0))
print('\n.text insns=%d' % len(ins))

# 1) direct call to 0x450410
print('\n--- call 0x450410 (getTicks wrapper) ---')
for i in ins:
    if i.mnemonic == 'call' and i.op_str == '0x450410':
        print('   0x%08X  %s %s' % (i.address, i.mnemonic, i.op_str))

# 2) any reference to a Sleep-like IAT
tgt = [va for va, nm in imports.items() if 'sleep' in nm.lower() or 'vertical' in nm.lower()]
print('\n--- refs to Sleep/WaitForVerticalBlank IAT ---')
for i in ins:
    for t in tgt:
        if ('0x%x' % t) in i.op_str or ('0x%08x' % t) in i.op_str:
            print('   0x%08X  %-8s %-40s  ; %s' % (i.address, i.mnemonic, i.op_str, imports[t]))

# 3) 主循环线索: 找 0x444385(AI) 的调用者 0x44452A 所在函数入口 + 它的调用者
print('\n--- callers of 0x444385 region: find function containing 0x44452A ---')
targets = [0x44452A, 0x444385]
for i in ins:
    if i.mnemonic == 'call' and i.op_str in ('0x44452a', '0x444385'):
        print('   call at 0x%08X -> %s' % (i.address, i.op_str))
