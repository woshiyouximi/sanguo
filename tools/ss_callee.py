import sys
sys.path.insert(0,r'F:\sanguo\tools')
import sango_dis as sd
import pefile
pe=pefile.PE(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe')
mem=pe.get_memory_mapped_image(); BASE=0x400000
def show(va,n=0x120):
    print('--- 0x%X'%va)
    off=va-BASE
    for ins in sd.md.disasm(mem[off:off+n],va):
        print('  0x%X %-8s %s'%(ins.address,ins.mnemonic,ins.op_str))
        if ins.mnemonic.startswith('ret'): break
for va in [0x465820,0x4658A0,0x4658C0]:
    show(va)
